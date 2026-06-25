# End-to-End Payment Flow: RLN and WDK

This project describes the testing flow between the [RGB Lightning Node (RLN)](https://github.com/UTEXO-Protocol/rgb-lightning-node) using its REST API and the [WDK RGB Lightning library](https://github.com/UTEXO-Protocol/wdk-rgb-lightning) acting as an embedded mobile node. 

The primary test script for this interaction is `e2e-payment-flow-wdk-rgb.js`.

## Architectural Note: Asset Issuance

A core design principle demonstrated in this flow is the separation of concerns regarding asset issuance:
* **WDK does not support asset issuance** and there is no intention to support it in the future. WDK is designed for mobile wallet users. Standard users do not issue assets from their personal wallets; instead, they receive and send pre-existing assets.
* **RLN acts as the issuer**. To test RGB assets with WDK, you must issue the asset on an RLN instance and send the asset to the WDK node. 
* The flow of new assets is strictly **RLN -> WDK**.

## Prerequisites and External Steps

To successfully run the `e2e-payment-flow-wdk-rgb.js` script and test it locally, several services must be orchestrated outside of the Node.js environment.

### 0. Environment Variables
Create a `.env` file in the root of the project using the `.env.example` as a template. Fill in the required variables such as passwords for Alice and Bob, as well as the Bitcoin connection details. For the local bitcoin configurations look at the [RGB Lightning Node (RLN)](https://github.com/UTEXO-Protocol/rgb-lightning-node) repo.

```bash
cp .env.example .env
# Edit .env and fill in the values
```

### 1. Start the Regtest Environment
First, clone the `rgb-lightning-node` repository and start the underlying Bitcoin and Electrs services using the provided helper script:

```bash
# Inside the rgb-lightning-node repository
./regtest.sh start
```

### 2. Run the RGB Lightning Node (Alice)
Run the RLN daemon which will serve as "Alice" in the test script. It will listen for REST API calls and Lightning peer connections.

```bash
cargo run -- dataldk0/ \
    --daemon-listening-port 3001 \
    --ldk-peer-listening-port 9735 \
    --network regtest \
    --disable-authentication
```

### 3. Run the E2E Script
In a separate terminal, start the Node.js script utilizing the `.env` file:

```bash
node --env-file=.env e2e-payment-flow-wdk-rgb.js
```


### 4. Fund the Nodes (Interactive Step)
During execution, the script will pause and wait for the nodes to be funded. It will print the funding addresses to the console. 
Open another terminal and use the helper script to send funds to the provided addresses:

```bash
./regtest.sh sendtoaddress <alice_address> <amount>
./regtest.sh sendtoaddress <bob_address> <amount>
```
> ***Note:***
> The script requires each node to be funded with at least 6000 satoshis (6000 sats). 
> In case your local regtest wallet has insufficient funds to send this amount, you can generate more funds by mining new blocks before trying to send the transaction again (e.g., `./regtest.sh mine 100`).

### 5. Mine Blocks
Whenever the script executes an on-chain transaction or opens a channel, it will require confirmations. You will need to manually mine blocks to progress the script:

```bash
./regtest.sh mine <num_blocks>
```

## Script Execution Flows

The `e2e-payment-flow-wdk-rgb.js` script automates the following interactions between Alice (RLN REST) and Bob (WDK):

1. **Initialization:** Alice is initialized via REST, and Bob is initialized via the WDK `WalletManagerRgbLightning`.
2. **Channel Opening:** Alice connects to Bob's Lightning port and opens a Lightning channel.
3. **Flow 1: Basic LN Payment:** Bob generates an invoice via WDK, and Alice pays it via REST.
4. **Flow 2: On-chain BTC Transfer:** Bob generates an on-chain address, and Alice sends a standard BTC transaction.
5. **Flow 3: RGB Asset Issuance and Transfer:** 
    * Alice (RLN) creates colorable UTXOs and issues a new RGB NIA asset.
    * Bob (WDK) prepares colorable UTXOs and creates a blind receive invoice.
    * Alice sends the newly issued RGB asset to Bob.

## Signet Testing

While this document outlines the local Regtest implementation, the E2E flow can also be executed against the public UTEXO Signet network. Testing on Signet introduces real-world network conditions, remote indexers, and Lightning Service Provider (LSP) routing topologies.

For detailed instructions, architecture changes, and troubleshooting specific to the public Signet network, please see the [Signet Implementation Guide](./README.signet.md).

## Rerunning the Test

If you need to rerun the test from scratch, you must clear the previous local state:
1. Delete the `data_bob` directory created by WDK to completely reset Bob's state:
   ```bash
   rm -rf data_bob
   ```
2. Stop and restart the RGB Lightning Node (Alice) to ensure it also starts from zero.
3. Rerun the Node.js script.
