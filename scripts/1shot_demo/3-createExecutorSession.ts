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
    apiSecret: oneshotSecret,
    baseUrl: 'https://api.1shotapi.dev/v0'
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

  const block = await wallet.provider.getBlock("latest"); 
  console.log("Latest Block timestamp: ", block.timestamp);
  const validUntil = block.timestamp + 3600; // 1 hour from current block
  const validAfter = block.timestamp; // now
  console.log("Valid Until: ", validUntil);
  console.log("Valid After: ", validAfter);
  console.log("1Shot API Wallet Address: ", oneshotWallets.response[0].accountAddress);

  const hash = await WalletCore.getSessionTypedHash(
    [
      "42069",
      "0x94fca91375796381cfbc89be97e584c0c98b25a2", // this MUST be the address which submits the tx
      VALIDATOR_ADDRESS,
      validUntil,
      validAfter,
      "0x",
      "0x",
      "0x",
    ]
  )

  // const hash = await oneshotClient.contractMethods.read(
  //   getSessionTypedHashEndpointId,
  //   {
  //     session: {
  //       id: "1",
  //       executor: oneshotWallets.response[0].accountAddress, // 1Shot API wallet address
  //       validator: VALIDATOR_ADDRESS,
  //       validUntil: validUntil, // 1 hour from now
  //       validAfter: validAfter, // 1 hour ago
  //       preHook: "0x",
  //       postHook: "0x",
  //       signature: "0x"
  //     },
  //   }
  // );
  console.log("Session Bytes Hash: ", hash);

  const sessionSignature = wallet.signingKey.sign(hash);
  // await WalletCore.executeFromExecutor(
  //   [
  //     RECIEVER_ADDRESS,
  //     100,
  //     "0x"
  //   ],
  //   [
  //     "42069",
  //     `${oneshotWallets.response[0].accountAddress}`,
  //     VALIDATOR_ADDRESS,
  //     validUntil,
  //     validAfter,
  //     "0x",
  //     "0x",
  //     sessionSignature.serialized,
  //   ]
  // )
  console.log("Executor:", wallet.address);
  await WalletCore.validateSession(
    [
      "42069",
      "0x94fca91375796381cfbc89be97e584c0c98b25a2",
      VALIDATOR_ADDRESS,
      validUntil,
      validAfter,
      "0x",
      "0x",
      sessionSignature.serialized,
    ]
  )
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