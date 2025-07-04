import { OneShotClient } from '@uxly/1shot-client';

const { ethers } = require('hardhat');

// Recieving address for the batch transfer
const RECIEVER_ADDRESS = '0xFeeCC911175C2B6D46BaE4fd357c995a4DC43C60';
// Use address(1) as the validator address 
const VALIDATOR_ADDRESS = '0x0000000000000000000000000000000000000001';

// Use dynamic import for the wrapper
const loadOneShotClient = async () => {
  const { loadOneShotClient } = await import('./1shot-client-wrapper.js');
  return await loadOneShotClient();
};

const main = async () => {
  const { OneShotClient } = await loadOneShotClient();

  const oneshotKey: string = process.env.ONESHOT_KEY as string;
  const oneshotSecret: string = process.env.ONESHOT_SECRET as string;
  const businessId: string = process.env.ONESHOT_ORG_ID as string;
  const oneshotClient = new OneShotClient({
    apiKey: oneshotKey,
    apiSecret: oneshotSecret
  });

  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, ethers.provider);
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log("Chain ID: ", chainId);
  console.log("EOA address: ", wallet.address);

  // We are going to use 1Shot API to call executeWithValidator on behalf of the user
  // We'll check that we have an Escrow Wallet provisioned with funds
  // on the Sepolia network, if not, we'll stop
  const oneshotWallets = await oneshotClient.wallets.list(
    businessId,
    {
      chainId: 11155111
    }
  )

  if (oneshotWallets.response.length === 0) {
    console.log("No 1Shot API Wallet Provisioned on Sepolia Network Found.");
    console.log("Exiting");
    return
  }

  if (Number(oneshotWallets.response[0].accountBalanceDetails?.balance) < 0.00001) {
    console.log("Please add Testnet funds to your Sepolia Wallet on 1Shot API");
    console.log("Address: ", oneshotWallets.response[0].accountAddress)
    return
  }

  // Next, we will check if we have an endpoint for reading the Main Storage address
  // If we don't we'll create one in our 1Shot API organization
  const getMainStorageEndpointId = await assureMainStorageEndpoint(oneshotClient, businessId, wallet.address, oneshotWallets.response[0].id);

  const storageLocation = await oneshotClient.contractMethods.read(
    getMainStorageEndpointId,
    {}
  )
  console.log("Storage Location: ", storageLocation);

  // Check if we have an endpoint that reads the nonce of th EOA at its storage address
  // If we don't we'll create one in our 1Shot API organization
  const getNonceEndpointId = await assureGetNonceEndpoint(oneshotClient, businessId, oneshotWallets.response[0].id, storageLocation);
  const coreWalletNonce = await oneshotClient.contractMethods.read(
    getNonceEndpointId,
    {}
  )
  console.log("Core Wallet Nonce: ", coreWalletNonce);

  // Check if we have an endpoint that will return the validation hash for the user's EOA address
  // If we don't we'll create one in our 1Shot API organization
  const getValidationTypedHashEndpointId = await assureGetValidationTypedHashEndpoint(oneshotClient, businessId, wallet.address, oneshotWallets.response[0].id);
  const hash = await oneshotClient.contractMethods.read(
    getValidationTypedHashEndpointId,
    {
      nonce: coreWalletNonce,
      calls: [
        {
          target: RECIEVER_ADDRESS,
          value: "100000000000",
          data: "0x" // Empty data bytes for a simple transfer
        }
      ]
    }
  )
  console.log("Validation Bytes Hash: ", hash);

  const validationSignature = wallet.signingKey.sign(hash);

  // Lastly, we will check if we have an endpoint to execute batch transactions with validation for the user's EOA address
  // If we don't we'll create one in our 1Shot API organization
  const executeWithValidatorEndpointId = await assureExecuteWithValidatorEndpoint(oneshotClient, businessId, wallet.address, oneshotWallets.response[0].id);

  // Now we execute the transaction using the authorizationData and Signature
  // we created above. 
  const execution = await oneshotClient.contractMethods.execute(
    executeWithValidatorEndpointId,
    {
      calls: [
        {
          target: RECIEVER_ADDRESS,
          value: "100000000000",
          data: "0x" // Empty data bytes for a simple transfer
        }
      ],
      validationData: validationSignature.serialized
    }, // params
    undefined, // walletId
    'execution of batch transfer with validator signature',
  )
  console.log("Execution ID: ", execution.id)

}

main().then(() => {
  console.log('1Shot Demo completed');
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});


async function assureMainStorageEndpoint(oneshotClient: OneShotClient, businessId: string, walletAddress: string, walletId: string): Promise<string> {
  const getMainStorageEndpoints = await oneshotClient.contractMethods.list(
    businessId,
    {
      name: '7702 EOA getMainStorage for Core Wallet',
      contractAddress: walletAddress
    }
  );

  let getMainStorageEndpoint;
  if (getMainStorageEndpoints.response.length === 0) {
    // Create a new transaction endpoint for the EOA address that we can 
    // use for all future 7702 relay transaction on Sepolia network
    const newMethod = await oneshotClient.contractMethods.create(
      businessId,
      {
        chainId: 11155111,
        contractAddress: walletAddress,
        walletId: walletId,
        name: '7702 EOA getMainStorage for Core Wallet',
        description: 'Gets the address of an EOAs storage slot',
        functionName: 'getMainStorage',
        stateMutability: 'view',
        inputs: [],
        outputs: [
          {
            name: 'mainStorage',
            type: 'address',
            index: 0
          }
        ]
      }
    );
    console.log("getMainStorage Endpoint Created: ", newMethod.id)
    getMainStorageEndpoint = newMethod.id;
  } else {
    getMainStorageEndpoint = getMainStorageEndpoints.response[0].id
    console.log("Existing getMainStorage Endpoint Found: ", getMainStorageEndpoint)
  }
  return getMainStorageEndpoint;
}

async function assureGetNonceEndpoint(oneshotClient: OneShotClient, businessId: string, walletId: string, storageLocation: string): Promise<string> {
  const getNonceEndpoints = await oneshotClient.contractMethods.list(
    businessId,
    {
      name: '7702 EOA getNonce for Core Wallet',
      contractAddress: storageLocation
    }
  );

  let getNonceEndpoint;
  if (getNonceEndpoints.response.length === 0) {
    // Create a new transaction endpoint for the EOA address that we can 
    // use for all future 7702 relay transaction on Sepolia network
    const newMethod = await oneshotClient.contractMethods.create(
      businessId,
      {
        chainId: 11155111,
        contractAddress: storageLocation,
        walletId: walletId,
        name: '7702 EOA getNonce for Core Wallet',
        description: 'Gets the current nonce of an EOA from its storage address location',
        functionName: 'getNonce',
        stateMutability: 'view',
        inputs: [],
        outputs: [
          {
            name: 'mainStorage',
            type: 'uint',
            index: 0
          }
        ]
      }
    );
    console.log("Get Nonce Endpoint Created: ", newMethod.id)
    getNonceEndpoint = newMethod.id;
  } else {
    getNonceEndpoint = getNonceEndpoints.response[0].id
    console.log("Existing Nonce Endpoint Found: ", getNonceEndpoint)
  }
  return getNonceEndpoint;
}

async function assureGetValidationTypedHashEndpoint(oneshotClient: OneShotClient, businessId: string, walletAddress: string, walletId: string): Promise<string> {
  const getValidationTypedHashEndpoints = await oneshotClient.contractMethods.list(
    businessId,
    {
      name: '7702 EOA getValidationTypedHash for Core Wallet',
      contractAddress: walletAddress
    }
  );

  let getValidationTypedHashEndpoint;
  if (getValidationTypedHashEndpoints.response.length === 0) {
    // Create a new transaction endpoint for the EOA address that we can 
    // use for all future 7702 relay transaction on Sepolia network
    const newMethod = await oneshotClient.contractMethods.create(
      businessId,
      {
        chainId: 11155111,
        contractAddress: walletAddress,
        walletId: walletId,
        name: '7702 EOA getValidationTypedHash for Core Wallet',
        description: 'Returns a hash of the validation data for Core Wallet execution',
        functionName: 'getValidationTypedHash',
        stateMutability: 'view',
        inputs: [
          {
            name: 'nonce',
            type: 'uint',
            index: 0
          },
          {
            name: 'calls',
            type: 'struct',
            index: 1,
            isArray: true,
            typeStruct: {
              name: 'Call',
              params: [
                {
                  name: 'target',
                  type: 'address',
                  index: 0
                },
                {
                  name: 'value',
                  type: 'uint',
                  index: 1
                },
                {
                  name: 'data',
                  type: 'bytes',
                  index: 2
                }
              ]
            }
          },
        ],
        outputs: [
          {
            name: 'validationTypedHash',
            type: 'bytes',
            typeSize: 32,
            index: 0
          }
        ]
      }
    );
    console.log("Validation Typed Hash Endpoint Created: ", newMethod.id)
    getValidationTypedHashEndpoint = newMethod.id;
  } else {
    getValidationTypedHashEndpoint = getValidationTypedHashEndpoints.response[0].id
    console.log("Validation Typed Hash Endpoint: ", getValidationTypedHashEndpoint)
  }
  return getValidationTypedHashEndpoint;
}

async function assureGetSessionTypedHashEndpoint(oneshotClient: OneShotClient, businessId: string, walletAddress: string, walletId: string): Promise<string> {
  const getSessionTypedHashEndpoints = await oneshotClient.contractMethods.list(
    businessId,
    {
      name: '7702 EOA getSessionTypedHash for Core Wallet',
      contractAddress: walletAddress
    }
  );

  let getSessionTypedHashEndpoint;
  if (getSessionTypedHashEndpoints.response.length === 0) {
    // Create a new transaction endpoint for the EOA address that we can 
    // use for all future 7702 relay transaction on Sepolia network
    const newMethod = await oneshotClient.contractMethods.create(
      businessId,
      {
        chainId: 11155111,
        contractAddress: walletAddress,
        walletId: walletId,
        name: '7702 EOA getSessionTypedHash for Core Wallet',
        description: 'Returns a hash of the session data for Core Wallet execution',
        functionName: 'getSessionTypedHash',
        stateMutability: 'view',
        inputs: [
          {
            name: 'session',
            type: 'struct',
            index: 0,
            isArray: false,
            typeStruct: {
              name: 'Session',
              params: [
                {
                  name: 'id',
                  type: 'uint',
                  index: 0
                },
                {
                  name: 'executor',
                  type: 'address',
                  index: 1
                },
                {
                  name: 'validator',
                  type: 'address',
                  index: 2
                },
                {
                  name: 'validUntil',
                  type: 'uint',
                  index: 3
                },
                {
                  name: 'validAfter',
                  type: 'uint',
                  index: 4
                },
                {
                  name: 'preHook',
                  type: 'bytes',
                  index: 5
                },
                {
                  name: 'postHook',
                  type: 'bytes',
                  index: 6
                },
                {
                  name: 'signature',
                  type: 'bytes',
                  index: 7
                }
              ]
            }
          },
        ],
        outputs: [
          {
            name: 'sessionTypedHash',
            type: 'bytes',
            typeSize: 32,
            index: 0
          }
        ]
      }
    );
    console.log("Session Typed Hash Endpoint Created: ", newMethod.id)
    getSessionTypedHashEndpoint = newMethod.id;
  } else {
    getSessionTypedHashEndpoint = getSessionTypedHashEndpoints.response[0].id
    console.log("Session Typed Hash Endpoint: ", getSessionTypedHashEndpoint)
  }
  return getSessionTypedHashEndpoint;
}

async function assureExecuteWithValidatorEndpoint(oneshotClient: OneShotClient, businessId: string, walletAddress: string, walletId: string): Promise<string> {
  const executeWithValidatorEndpoints = await oneshotClient.contractMethods.list(
    businessId,
    {
      name: '7702 EOA executeWithValidator for Core Wallet',
      contractAddress: walletAddress
    }
  );

  let executeWithValidatorEndpoint;
  if (executeWithValidatorEndpoints.response.length === 0) {
    // Create a new transaction endpoint for the EOA address that we can 
    // use for all future 7702 relay transaction on Sepolia network
    const newMethod = await oneshotClient.contractMethods.create(
      businessId,
      {
        chainId: 11155111,
        contractAddress: walletAddress,
        walletId: walletId,
        name: '7702 EOA executeWithValidator for Core Wallet',
        description: 'Executes a batch transaction with a validator signature',
        functionName: 'executeWithValidator',
        stateMutability: 'nonpayable',
        inputs: [
          {
            name: 'calls',
            type: 'struct',
            index: 0,
            isArray: true,
            typeStruct: {
              name: 'Call',
              params: [
                {
                  name: 'target',
                  type: 'address',
                  index: 0
                },
                {
                  name: 'value',
                  type: 'uint',
                  index: 1
                },
                {
                  name: 'data',
                  type: 'bytes',
                  index: 2
                }
              ]
            }
          },
          {
            name: 'validator',
            type: 'address',
            index: 1,
            value: VALIDATOR_ADDRESS,
          },
          {
            name: 'validationData',
            type: 'bytes',
            index: 2,
          }
        ],
        outputs: []
      }
    );
    console.log("Validation Typed Hash Endpoint Created: ", newMethod.id)
    executeWithValidatorEndpoint = newMethod.id;
  } else {
    executeWithValidatorEndpoint = executeWithValidatorEndpoints.response[0].id
    console.log("Validation Typed Hash Endpoint: ", executeWithValidatorEndpoint)
  }
  return executeWithValidatorEndpoint;
}