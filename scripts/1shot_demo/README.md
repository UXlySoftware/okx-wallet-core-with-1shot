<div align="center">
  <a href="https://youtu.be/m0ZrWnOVSco">
    <img src="https://img.youtube.com/vi/m0ZrWnOVSco/hqdefault.jpg" alt="Watch the tutorial">
  </a>
</div>

## 1. Set Code & Initialize Wallet

First, copy `.evn.example` into `.env` and set `DEPLOYER_PRIVATE_KEY` and `DEPLOYER_ADDRESS`. Then make a free [1Shot API](https://1shotapi.com) account.
1. Create an [Escrow Wallet](https://app.1shotapi.com/escrow-wallets) on Sepolia network
2. Add testnet funds to the escrow wallet
3. Generate an [API Key and Secret](https://app.1shotapi.com/api-keys)
4. Grab your Organization ID from the [Organization Details](https://app.1shotapi.com/organizations) page

Fill in `ONESHOT_KEY`, `ONESHOT_SECRET`, and `ONESHOT_ORG_ID` in `.env`.

Make sure you use the WalletCore address for Sepolia network for `WALLET_CORE`: `0x80296FF8D1ED46f8e3C7992664D13B833504c2Bb`

Also, be sure to give a private key and its associated address for `DEPLOYER_PRIVATE_KEY` and `DEPLOYER_ADDRESS`

Deploy and initialize your ERC-7702 wallet:

```bash
npx hardhat run scripts/1shot_demo/1-setCodeAndInitialize.ts --network sepolia
```

This script:

- Sets up the EOA as a smart contract wallet and uses 1Shot API to sponsor the transaction
- Checking if you have a funded 1Shot API Escrow Wallet associated with your organization
- Programmatically Adding new transaction endpoints to you 1Shot API account
- Running 7702-style transaction with 1Shot API transaction endpoints
- Initializes core storage and configuration

 > [!IMPORTANT]
 > The [`@uxly/1shot-client`](https://www.npmjs.com/package/@uxly/1shot-client) typescript package is an ESM module. If you get errors associated with the dynamic import in `1shot-client-wrapper.js`, try upgrading you node version to v22.8.0 or later.

### 2. Execute via Relayer

Send transactions through the 1Shot API relayer:

```bash
npx hardhat run scripts/1shot_demo/2-sendTxsAsRelayer.ts --network sepolia
```

This shows:

- Relayer-based transaction execution
- Signature validation
- Creating and calling 1Shot API transaction endpoint with `struct` inputs
- Using read functions with 1Shot API
- Nonce management
- Gas-efficient transaction batching