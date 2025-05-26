# Wallet Core - EIP-7702 Smart Contract Wallet

A modular and secure implementation of EIP-7702 smart contract wallet with multiple execution types and advanced security features.

## Prerequisites

1. Make sure you have Node.js installed
2. Run `npm install` in the project root to install dependencies
3. Install Foundry (which provides the `forge` command) by running:

   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   ```

## Overview

This implementation provides a flexible smart contract wallet that supports:

- EIP-7702 Type 4 initialization
- Three distinct execution types
- Advanced security features including replay protection and batched transactions
- Modular architecture with separate storage and execution logic

## Core Features

### 1. Set Code & Initialize

The wallet setup involves two main steps:

1. **Set Code**:

   - Submits an EIP-7702 Type 4 transaction
   - Assigns smart contract code to an EOA (Externally Owned Address)
   - Transforms the EOA into a smart contract wallet

2. **Initialize Contract**:
   - Calls the `initialize` function in Wallet Core
   - Sets up proper configuration and state
   - Creates and links Core Storage for nonce management

### 2. Execution Types

#### Type 1: Execute From Self

- Direct execution from the wallet itself
- Uses `executeFromSelf` function
- Verifies transaction through self-check
- Supports batched transactions via `_batchCall`
- Most gas-efficient execution type

#### Type 2: Execute From Relayer

1. **Validator Setup**:
   - User adds validator to wallet core
   - Validator signs transaction off-chain with nonce
2. **Execution Flow**:
   - User provides off-chain signature
   - Relayer submits transaction via `executeWithValidation`
   - Core Storage manages nonce for replay protection
   - ECDSA validation ensures signature authenticity

#### Type 3: Execute From Executor

1. **Session-Based Execution**:

   - No pre-encoded calls needed
   - Uses hook-based validation (`preHook` and `postHook`)
   - Single signature authorizes entire session

2. **Session Parameters**:
   - `session_id`
   - `validAfter`
   - `validUntil`
   - `executor`
   - `validator`
   - `preCheck`
   - `postCheck`
   - `signature`

## Architecture

The implementation follows a modular design:

- `WalletCore`: Main contract handling execution logic
- `Core Storage`: Manages nonces and validation states
- `ExecutionLogic`: Handles different execution types
- `ValidationLogic`: Manages signature and session validation
- `ExecutorLogic`: Implements session-based execution with hooks
- `FallbackHandler`: Provides token receiving capabilities

## Deployed Contracts

### Ethereum Mainnet

| Contract    | Address                                      |
| ----------- | -------------------------------------------- |
| WalletCore  | `0x80296FF8D1ED46f8e3C7992664D13B833504c2Bb` |
| CoreStorage | `0x7DAF91DFe55FcAb363416A6E3bceb3Da34ff1d30` |

### Sepolia Testnet

| Contract    | Address                                      |
| ----------- | -------------------------------------------- |
| WalletCore  | `0x80296FF8D1ED46f8e3C7992664D13B833504c2Bb` |
| CoreStorage | `0x7DAF91DFe55FcAb363416A6E3bceb3Da34ff1d30` |

## Usage

### 1. Set Code & Initialize Wallet

First copy `.evn.example` into `.env` and set `DEPLOYER_PRIVATE_KEY` and `DEPLOYER_ADDRESS`. Then make a free [1Shot API](https://1shotapi.com) account.
1. Create an [Escrow Wallet](https://app.1shotapi.com/escrow-wallets) on Sepolia network
2. Add testnet funds to the escrow wallet
3. Generate an [API Key and Secret](https://app.1shotapi.com/api-keys)
4. Grab your Organization ID from the [Organization Details](https://app.1shotapi.com/organizations) page

Fill in `ONESHOT_KEY`, `ONESHOT_SECRET`, and `ONESHOT_ORG_ID` in `.env`.

Make sure you use the WalletCore address for Sepolia network for `WALLET_CORE`: `0x80296FF8D1ED46f8e3C7992664D13B833504c2Bb`

Deploy and initialize your ERC-7702 wallet:

```bash
npx hardhat run scripts/1shot_demo/1-setCodeAndInitialize.ts --network sepolia
```

This script:

- Sets up the EOA as a smart contract wallet
- Initializes core storage and configuration

## Security Considerations

- All execution types include proper validation
- Nonce management prevents replay attacks
- Session-based execution can be revoked
- Hook-based validation provides additional security layers
