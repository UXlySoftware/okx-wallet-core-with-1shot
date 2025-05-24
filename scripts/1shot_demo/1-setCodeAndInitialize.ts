const { ethers } = require('hardhat');

const main = async () => {
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

  console.log('tx sent: ', tx);
}

main().then(() => {
  console.log('Execution completed');
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});