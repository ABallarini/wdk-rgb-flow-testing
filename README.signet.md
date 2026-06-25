# End-to-End Payment Flow: RLN and WDK (Signet Network)

This document describes the testing flow for the [RGB Lightning Node (RLN)](https://github.com/UTEXO-Protocol/rgb-lightning-node) interacting with the [WDK RGB Lightning library](https://github.com/UTEXO-Protocol/wdk-rgb-lightning) over the **UTEXO Signet** network.

The script for this specific environment is `e2e-payment-flow-wdk-rgb-signet.js`.

> **Note:** For local development and testing on Regtest, refer to the main [README.md](./README.md).

---

## Architectural Differences: Regtest vs. Signet

Testing on a live public testnet like Signet introduces network conditions, latency and routing topologies that do not exist in local Regtest environments:

1. **Remote Indexers:** Instead of querying a local Electrs instance, both nodes rely on a remote Esplora indexer (`https://esplora-api.utexo.com`).
2. **Remote Proxy:** RGB consignments are transmitted over the internet using a public UTEXO proxy server instead of localhost.
3. **Block Times:** Transactions and channel confirmations depend on the Signet block mining schedule.

---

## Critical Discoveries & Troubleshooting

During the implementation of the Signet testing flow, several critical LDK and network behaviors were identified. If you are modifying the script or building your own integration, keep this in mind.

### The Importance of Mnemonics
Because Signet coins have value within the testing ecosystem (requiring faucets and waiting for blocks), losing access to a funded node is highly disruptive.
* **Rule:** You must provide **both** `ALICE_MNEMONIC` and `BOB_MNEMONIC` in your `.env` file. This guarantees that if you delete `data_alice` or `data_bob` to clear local states, the nodes will recover the same wallets and retain their funded Signet BTC upon restart.

---

## Prerequisites and Setup

### 0. Environment Variables
Create your Signet configuration file:
```bash
cp .env.signet.example .env
```
Open `.env` and fill in the 12-word `ALICE_MNEMONIC` and `BOB_MNEMONIC`. Generate valid BIP39 mnemonics to ensure the checksums are correct, otherwise initialization will fail with `InvalidMnemonic`.

### 1. Start the RGB Lightning Node (Alice)
Run the RLN daemon configured for the Signet network.

```bash
cargo run -- dataldk0/ \
    --daemon-listening-port 3001 \
    --ldk-peer-listening-port 9735 \
    --network signet \
    --disable-authentication
```

*Wait approximately 30-60 seconds for the node to fully start and sync with Esplora before proceeding to the next step.*

### 2. Run the E2E Script
In a separate terminal, execute the Signet testing script:

```bash
node --env-file=.env e2e-payment-flow-wdk-rgb-signet.js
```

### 3. Fund the Nodes
The script will pause and provide funding addresses for Alice and Bob. Use the Utexo Signet faucet (via telegram [Utexo RLN Bot](https://t.me/Utexo_RLN_bot) or an external wallet) to send at least **6000 sats** to both addresses. The script will poll the blockchain until the funds arrive.

### 4. Wait for Mining
When Alice opens the Lightning channel (and during the on-chain BTC transfer flow), the script will pause and wait for the transaction to be mined into a Signet block. This requires patience, as it depends on the active Signet miners on the network.

---

## Rerunning the Test
If you encounter a state issue and need to run the test from scratch:

1. Stop the RLN (Alice) daemon.
2. Delete the local databases:
   ```bash
   rm -rf data_alice
   rm -rf data_bob
   ```
3. Restart the RLN daemon (wait 30s for sync).
4. Rerun the script. Because you provided mnemonics in the `.env` file, both nodes will recover their previous balances!