import { OneShotClient } from "@uxly/1shot-client";

const { ethers } = require("hardhat");

// Recieving address for the batch transfer
const RECIEVER_ADDRESS = "0xFeeCC911175C2B6D46BaE4fd357c995a4DC43C60";
// Use address(1) as the validator address
const VALIDATOR_ADDRESS = "0x0000000000000000000000000000000000000001";

// Use dynamic import for the wrapper
const loadOneShotClient = async () => {
  const { loadOneShotClient } = await import("./1shot-client-wrapper.js");
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

  const wallet = new ethers.Wallet(
    process.env.DEPLOYER_PRIVATE_KEY,
    ethers.provider
  );
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const WalletCore = await ethers.getContractAt("WalletCore", wallet.address); // get wallet view at the EOA address

  console.log("Chain ID: ", chainId);
  console.log("EOA address: ", wallet.address);

  // We are going to use 1Shot API to call executeWithValidator on behalf of the user
  // We'll check that we have an Escrow Wallet provisioned with funds
  // on the Sepolia network, if not, we'll stop
  const oneshotWallets = await oneshotClient.wallets.list(businessId, {
    chainId: 11155111,
  });

  if (oneshotWallets.response.length === 0) {
    console.log("No 1Shot API Wallet Provisioned on Sepolia Network Found.");
    console.log("Exiting");
    return;
  }

  if (
    Number(oneshotWallets.response[0].accountBalanceDetails?.balance) < 0.00001
  ) {
    console.log("Please add Testnet funds to your Sepolia Wallet on 1Shot API");
    console.log("Address: ", oneshotWallets.response[0].accountAddress);
    return;
  }

  // Check if we have an endpoint that will return the validation hash for the user's EOA address
  // If we don't we'll create one in our 1Shot API organization
  const getSessionTypedHashEndpointId = await assureGetSessionTypedHashEndpoint(
    oneshotClient,
    businessId,
    wallet.address,
    oneshotWallets.response[0].id
  );

  // Check if we have an endpoint that will let us call executeFromExecutor
  // If we don't we'll create one in our 1Shot API organization
  const getExecuteFromExecutorEndpointId =
    await assureExecuteFromExecutorEndpoint(
      oneshotClient,
      businessId,
      wallet.address,
      oneshotWallets.response[0].id
    );

  const block = await wallet.provider.getBlock("latest");
  console.log("Latest Block timestamp: ", block.timestamp);
  const validUntil = block.timestamp + 3600; // 1 hour from current block
  const validAfter = block.timestamp; // now
  console.log("Valid Until: ", validUntil);
  console.log("Valid After: ", validAfter);
  console.log(
    "1Shot API Wallet Address: ",
    oneshotWallets.response[0].accountAddress
  );

  const hash = await oneshotClient.contractMethods.read(
    getSessionTypedHashEndpointId,
    {
      session: {
        id: "42069",
        executor: oneshotWallets.response[0].accountAddress, // 1Shot API wallet address
        validator: VALIDATOR_ADDRESS,
        validUntil: `${validUntil}`, // 1 hour from now
        validAfter: `${validAfter}`, // 1 hour ago
        preHook: "0x",
        postHook: "0x",
        signature: "0x",
      },
    }
  );
  console.log("Session Bytes Hash: ", hash);

  const sessionSignature = wallet.signingKey.sign(hash);
  // Now we execute the transaction using the authorizationData and Signature
  // we created above.
  const execution = await oneshotClient.contractMethods.execute(
    getExecuteFromExecutorEndpointId,
    {
      calls: [
        {
          target: RECIEVER_ADDRESS,
          value: "1000000",
          data: "0x", // Empty data bytes for a simple transfer
        },
      ],
      session: {
        id: "42069",
        executor: `${oneshotWallets.response[0].accountAddress}`,
        validator: VALIDATOR_ADDRESS,
        validUntil: `${validUntil}`,
        validAfter: `${validAfter}`,
        preHook: "0x",
        postHook: "0x",
        signature: sessionSignature.serialized,
      },
    }, // params
    undefined, // walletId
    "execution of batch transfer with session signature via executeWithExecutor",
  );
  console.log("Execution ID: ", execution.id);
};

main()
  .then(() => {
    console.log("1Shot Demo completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

async function assureGetSessionTypedHashEndpoint(
  oneshotClient: OneShotClient,
  businessId: string,
  walletAddress: string,
  walletId: string
): Promise<string> {
  const getSessionTypedHashEndpoints = await oneshotClient.contractMethods.list(
    businessId,
    {
      name: "7702 EOA getSessionTypedHash for Core Wallet",
      contractAddress: walletAddress,
    }
  );

  let getSessionTypedHashEndpoint;
  if (getSessionTypedHashEndpoints.response.length === 0) {
    // Create a new transaction endpoint for the EOA address that we can
    // use for all future 7702 relay transaction on Sepolia network
    const newMethod = await oneshotClient.contractMethods.create(businessId, {
      chainId: 11155111,
      contractAddress: walletAddress,
      walletId: walletId,
      name: "7702 EOA getSessionTypedHash for Core Wallet",
      description:
        "Returns a hash of the session data for Core Wallet execution",
      functionName: "getSessionTypedHash",
      stateMutability: "view",
      inputs: [
        {
          name: "session",
          type: "struct",
          index: 0,
          isArray: false,
          typeStruct: {
            name: "Session",
            params: [
              {
                name: "id",
                type: "uint",
                index: 0,
              },
              {
                name: "executor",
                type: "address",
                index: 1,
              },
              {
                name: "validator",
                type: "address",
                index: 2,
              },
              {
                name: "validUntil",
                type: "uint",
                index: 3,
              },
              {
                name: "validAfter",
                type: "uint",
                index: 4,
              },
              {
                name: "preHook",
                type: "bytes",
                index: 5,
              },
              {
                name: "postHook",
                type: "bytes",
                index: 6,
              },
              {
                name: "signature",
                type: "bytes",
                index: 7,
              },
            ],
          },
        },
      ],
      outputs: [
        {
          name: "sessionTypedHash",
          type: "bytes",
          typeSize: 32,
          index: 0,
        },
      ],
    });
    console.log("Session Typed Hash Endpoint Created: ", newMethod.id);
    getSessionTypedHashEndpoint = newMethod.id;
  } else {
    getSessionTypedHashEndpoint = getSessionTypedHashEndpoints.response[0].id;
    console.log("Session Typed Hash Endpoint: ", getSessionTypedHashEndpoint);
  }
  return getSessionTypedHashEndpoint;
}

async function assureExecuteFromExecutorEndpoint(
  oneshotClient: OneShotClient,
  businessId: string,
  walletAddress: string,
  walletId: string
): Promise<string> {
  const getExecuteFromExecutorEndpoints =
    await oneshotClient.contractMethods.list(businessId, {
      name: "7702 EOA executeFromExecutor for Core Wallet",
      contractAddress: walletAddress,
    });

  let getExecuteFromExecutorEndpoint;
  if (getExecuteFromExecutorEndpoints.response.length === 0) {
    // Create a new transaction endpoint for the EOA address that we can
    // use for calling executeFromExecutor on Sepolia network
    const newMethod = await oneshotClient.contractMethods.create(businessId, {
      chainId: 11155111,
      contractAddress: walletAddress,
      walletId: walletId,
      name: "7702 EOA executeFromExecutor for Core Wallet",
      description:
        "Lets 1Shot API execute a transaction as if it was another EOA address",
      functionName: "executeFromExecutor",
      stateMutability: "nonpayable",
      inputs: [
        {
          name: "calls",
          type: "struct",
          index: 0,
          isArray: true,
          typeStruct: {
            name: "Call",
            params: [
              {
                name: "target",
                type: "address",
                index: 0,
              },
              {
                name: "value",
                type: "uint",
                index: 1,
              },
              {
                name: "data",
                type: "bytes",
                index: 2,
              },
            ],
          },
        },
        {
          name: "session",
          type: "struct",
          index: 1,
          isArray: false,
          typeStruct: {
            name: "Session",
            params: [
              {
                name: "id",
                type: "uint",
                index: 0,
              },
              {
                name: "executor",
                type: "address",
                index: 1,
              },
              {
                name: "validator",
                type: "address",
                index: 2,
              },
              {
                name: "validUntil",
                type: "uint",
                index: 3,
              },
              {
                name: "validAfter",
                type: "uint",
                index: 4,
              },
              {
                name: "preHook",
                type: "bytes",
                index: 5,
              },
              {
                name: "postHook",
                type: "bytes",
                index: 6,
              },
              {
                name: "signature",
                type: "bytes",
                index: 7,
              },
            ],
          },
        },
      ],
      outputs: [],
    });
    console.log("Session Typed Hash Endpoint Created: ", newMethod.id);
    getExecuteFromExecutorEndpoint = newMethod.id;
  } else {
    getExecuteFromExecutorEndpoint =
      getExecuteFromExecutorEndpoints.response[0].id;
    console.log(
      "Execute as Executor Endpoint: ",
      getExecuteFromExecutorEndpoint
    );
  }
  return getExecuteFromExecutorEndpoint;
}
