const { ethers } = require('hardhat');

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

  // Get the contract instance
  const WALLET_CORE = process.env.WALLET_CORE;
  const WalletCore = await ethers.getContractAt("WalletCore", WALLET_CORE);

  console.log("Chain ID: ", chainId);
  console.log("EOA address: ", wallet.address);
  console.log("Setting code for EIP7702 account at: ", WALLET_CORE);

  // Encode the execute function call with WalletCore.initialize()
  const calldata = WalletCore.interface.encodeFunctionData("initialize");

  const currentNonce = await ethers.provider.getTransactionCount(wallet.address);

  const authorizationData: {
    chainId: any;
    address: string | undefined;
    nonce: any;
    yParity?: string;
    r?: string;
    s?: string;
  } = {
    chainId: ethers.toBeHex(chainId.toString()),
    address: WALLET_CORE,
    nonce: ethers.toBeHex(currentNonce + 1),
  };

  // Encode authorization data according to EIP-712 standard
  const encodedAuthorizationData = ethers.concat([
    '0x05', // MAGIC code for EIP7702
    ethers.encodeRlp([
      authorizationData.chainId,
      authorizationData.address,
      authorizationData.nonce,
    ])
  ]);

  // Generate and sign authorization data hash
  const authorizationDataHash = ethers.keccak256(encodedAuthorizationData);
  const authorizationSignature = wallet.signingKey.sign(authorizationDataHash);

  console.log('Authorization Data: ', authorizationData);
  console.log("Business ID:", businessId);

  // We are going to use 1Shot API as our 7702 Relayer
  // We'll check that we have an Escrow Wallet provisioned with funds
  // on the Sepolia network, if not, we'll stop
  const escrowWallets = await oneshotClient.wallets.list(
    businessId,
    {
      chainId: 11155111
    }
  )

  if (escrowWallets.response.length === 0) {
    console.log("No 1Shot API Wallet Provisioned on Sepolia Network Found.");
    console.log("Exiting");
    return
  }

  if (Number(escrowWallets.response[0].accountBalanceDetails?.balance) < 0.00001) {
    console.log("Please add Testnet funds to your Sepolia Escrow Wallet on 1Shot API");
    console.log("Address: ", escrowWallets.response[0].accountAddress)
    return
  }

  // Next, we will check if we have an endpoint already created for the EOA we are relaying for
  // If we don't we'll create one in our 1Shot API organization
  const transactions = await oneshotClient.contractMethods.list(
    businessId,
    {
      name: '7702 EOA Endpoint',
      contractAddress: wallet.address
    }
  );

  let transactionEndpoint; 
  if (transactions.response.length === 0) {
    // Create a new transaction endpoint for the EOA address that we can 
    // use for all future 7702 relay transaction on Sepolia network
    const newTransaction = await oneshotClient.contractMethods.create(
      businessId,
      {
        chainId: 11155111,
        contractAddress: wallet.address as string,
        walletId: escrowWallets.response[0].id,
        name: '7702 EOA Endpoint',
        description: 'Relays 7702 transactions for a specific EOA address',
        functionName: 'initialize',
        stateMutability: 'nonpayable',
        inputs: [],
        outputs: []
      }
    );
    console.log("Transaction Endpoint Created: ", newTransaction.id)
    transactionEndpoint = newTransaction.id;
  } else {
    transactionEndpoint = transactions.response[0].id
    console.log("Existing Endpoint Found: ", transactionEndpoint)
  }

  // Now we execute the transaction using the authorizationData and Signature
  // we created above. 
  const execution = await oneshotClient.contractMethods.execute(
    transactionEndpoint,
    {},
    undefined,
    'relayed 7702 transaction',
    [
      {
        address: authorizationData.address!,
        nonce: authorizationData.nonce,
        chainId: Number(authorizationData.chainId),
        signature: authorizationSignature.serialized
      }
    ]
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