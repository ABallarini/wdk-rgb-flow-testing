const axios = require("axios");
const WalletManagerRgbLightning = require("@utexo/wdk-rgb-lightning").default;

/**
 * RGB Lightning Node - End-to-End Payment Flow Examples
 * Demonstrates: LN payments, RGB transfers, channel operations using REST for Alice and WDK for Bob.
 */

// ============================================================================
// Configuration
// ============================================================================

const NODES = {
  alice: {
    port_daemon: 3001,
    port_ln: 9735,
    name: "Alice",
    url: "http://localhost:3001",
    pubkey: null,
  },
  bob: {
    port_daemon: 3002,
    port_ln: 9736,
    name: "Bob",
    url: "http://localhost:3002",
    pubkey: null,
    manager: null,
    account: null,
  },
};

const ALICE_PASSWORD = process.env.ALICE_PASSWORD;
const ALICE_MNEMONIC = process.env.ALICE_MNEMONIC;
const BOB_PASSWORD = process.env.BOB_PASSWORD;

const UNLOCK_CONFIG_BASE = {
  indexer_url: process.env.INDEXER_URL,
  proxy_endpoint: process.env.PROXY_ENDPOINT,
};

const UNLOCK_CONFIG_ALICE = {
  ...UNLOCK_CONFIG_BASE,
  password: ALICE_PASSWORD,
  announce_addresses: [],
};

const BTC_AMOUNT_SAT = 5600;
const RGB_CHANNEL_CAPACITY_SAT = 30050;

// ============================================================================
// Helper Functions
// ============================================================================

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function poll(fn, maxRetries = 30, interval = 2000, context = "") {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      console.error(`Error during polling for ${context}:`, error.message);
    }
    process.stdout.write(".");
    await delay(interval);
  }
  throw new Error(`\n❌ Polling timeout reached for: ${context}`);
}

async function handleError(nodeName, operation, error) {
  console.error(`\n❌ [${nodeName}] ${operation} Failed`);
  if (error.response) {
    console.error("Status:", error.response.status);
    console.error("Data:", JSON.stringify(error.response.data, null, 2));
  } else {
    console.error("Error:", error.message);
  }
  throw error;
}

// ============================================================================
// Node Setup (REST for Alice, WDK for Bob)
// ============================================================================

async function setupAllNodes() {
  console.log("\n" + "=".repeat(70));
  console.log("STEP 1: Node Setup & Initialization");
  console.log("=".repeat(70));

  // --- ALICE (REST) ---
  const alice = NODES.alice;
  console.log(`\n🔧 [Alice] Initializing node (REST)...`);
  try {
    const initPayload = { password: ALICE_PASSWORD };
    if (ALICE_MNEMONIC) {
      initPayload.mnemonic = ALICE_MNEMONIC;
      console.log(`[Alice] Using provided mnemonic for initialization`);
    }
    await axios.post(`${alice.url}/init`, initPayload);
    console.log(`✓ [Alice] Init successful`);
  } catch (err) {
    if (
      err.response &&
      err.response.data &&
      err.response.data.error &&
      (err.response.data.error.includes("initialized") ||
        err.response.data.error.includes("unlocked"))
    ) {
      console.log(`✓ [Alice] Already initialized or unlocked`);
    } else {
      await handleError("Alice", "Init", err);
    }
  }

  console.log(`\n🔓 [Alice] Unlocking node...`);
  try {
    await axios.post(`${alice.url}/unlock`, UNLOCK_CONFIG_ALICE);
    console.log(`✓ [Alice] Node unlocked`);
  } catch (err) {
    if (
      err.response &&
      err.response.data &&
      err.response.data.error &&
      err.response.data.error.includes("unlocked")
    ) {
      console.log(`✓ [Alice] Already unlocked`);
    } else {
      await handleError("Alice", "Unlock", err);
    }
  }

  try {
    const infoRes = await axios.get(`${alice.url}/nodeinfo`);
    alice.pubkey = infoRes.data.pubkey;
    console.log(`✓ [Alice] Info retrieved, Pubkey: ${alice.pubkey}`);
  } catch (err) {
    await handleError("Alice", "NodeInfo", err);
  }

  // --- BOB (WDK) ---
  const bob = NODES.bob;
  console.log(`\n🔧 [Bob] Initializing node (WDK)...`);
  const lspPubkey = process.env.LSP_PEER ? process.env.LSP_PEER.split('@')[0] : null;
  const trustedPeers = [];
  if (lspPubkey) trustedPeers.push(lspPubkey);
  if (alice.pubkey) trustedPeers.push(alice.pubkey); // Dynamically trust Alice!
  const trustedPeersStr = trustedPeers.join(", ");
  console.log(`\n[Bob] Trusted peers: ${trustedPeersStr}`);
  const seedBob = process.env.BOB_MNEMONIC;
  const configBob = {
    network: "signet",
    dataDir: `./data_bob`,
    daemonListeningPort: bob.port_daemon,
    ldkPeerListeningPort: bob.port_ln,
    vssUrl: process.env.VSS_URL,
    vssAllowHttp: true,
    enableVirtualChannelsV0: false, // Turn back on for LSP routing
    virtualPeerPubkeys: process.env.LSP_PEER ? [process.env.LSP_PEER.split('@')[0]] : [],
    lspBaseUrl: process.env.LSP_BASE_URL,
    lspBearerToken: process.env.LSP_BEARER_TOKEN,
  };
  bob.manager = new WalletManagerRgbLightning(seedBob, configBob);
  bob.account = await bob.manager.getAccount();

  try {
    await bob.account.unlock({
      ...UNLOCK_CONFIG_BASE,
      password: BOB_PASSWORD,
      announce_addresses: [],
      announce_alias: "Bob",
    });
    console.log(`✓ [Bob] Node unlocked`);
  } catch (err) {
    console.log(`⚠️ [Bob] Unlock note: ${err.message}`);
  }

  const bobInfo = await bob.account.getNodeInfo();
  bob.pubkey = bobInfo.pubkey;
  console.log(`✓ [Bob] Info retrieved, Pubkey: ${bob.pubkey}`);
}

async function waitUntilNodeFunded(nodeName, minBalanceSat) {
  // Retrieve the address for the node
  let address;
  if (nodeName === "alice") {
    const res = await axios.post(`${NODES.alice.url}/address`, {});
    address = res.data.address;
  } else {
    const addrData = await NODES.bob.account.getAddress();
    address = addrData;
  }
  console.log(`\n[${nodeName}] Address for funding: ${address}`);
  console.log(
    `\n⏳ [${nodeName}] Waiting for on-chain funds (min ${minBalanceSat} sats)...`,
  );
  return poll(
    async () => {
      let balance = 0;
      if (nodeName === "alice") {
        const res = await axios.post(`${NODES.alice.url}/btcbalance`, {
          skip_sync: false,
        });
        balance = res.data.vanilla.spendable + res.data.colored.spendable;
        console.log(`  Current balance: ${balance} sat`);
        if (balance >= minBalanceSat * 1000) {
          console.log(`✅ Node is funded with ${balance} sat!`);
          isFunded = true;
        }
      } else {
        const balances = await NODES.bob.account.getBalanceDetails(false);
        balance = balances.vanilla.spendable + balances.colored.spendable;
      }

      if (balance >= minBalanceSat) {
        console.log(`\n✓ [${nodeName}] Funded with ${balance} sats`);
        return true;
      }
      return false;
    },
    60,
    3000,
    `Funding ${nodeName}`,
  );
}

// ============================================================================
// Channel Operations (Initiated via REST from Alice & WDK for Bob)
// ============================================================================

async function connectPeers() {
  console.log(`\n🔗 Connecting Alice to Bob...`);
  try {
    await axios.post(`${NODES.alice.url}/connectpeer`, {
      peer_pubkey_and_addr: `${NODES.bob.pubkey}@127.0.0.1:${NODES.bob.port_ln}`,
    });
    console.log(`✓ Alice connected to Bob`);
  } catch (error) {
    console.log(`⚠️ [Alice] Connect Bob error: ${error.message}`);
  }

  console.log(`\n🔗 Connecting Alice to Signet LSP...`);
  if (process.env.LSP_PEER) {
    try {
      await axios.post(`${NODES.alice.url}/connectpeer`, {
        peer_pubkey_and_addr: process.env.LSP_PEER,
      });
      console.log(`✓ Alice connected to LSP`);
    } catch (error) {
      const errorMessage =
        typeof error.response?.data === "string"
          ? error.response.data
          : JSON.stringify(error.response?.data || "");
      if (
        error.response &&
        error.response.data &&
        errorMessage.includes("already connected")
      ) {
        console.log(`✓ Alice already connected to LSP`);
      } else {
        console.log(`⚠️ [Alice] Connect LSP error: ${error.message}`);
      }
    }
  }

  console.log(`\n🔗 Connecting Bob to Signet LSP...`);
  if (process.env.LSP_PEER) {
    try {
      await NODES.bob.account.connectPeer(process.env.LSP_PEER);
      console.log(`✓ Bob connected to LSP`);
    } catch (err) {
      console.log(`⚠️ [Bob] Connect LSP error: ${err.message}`);
    }
  }
}

async function openLightningChannel() {
  console.log(`\n⚡ [Alice] Opening Lightning channel to Bob...`);
  
  try {
    const res = await axios.post(`${NODES.alice.url}/openchannel`, {
      peer_pubkey_and_opt_addr: `${NODES.bob.pubkey}@127.0.0.1:${NODES.bob.port_ln}`,
      capacity_sat: 100000,
      push_msat: 5000,
      public: false,
      with_anchors: true,
    });
    console.log(`✓ Channel opened to Bob. Point: `, res.data);
  } catch (error) {
    await handleError("Alice", "OpenChannel", error);
  }
}

async function waitForChannelActive() {
  console.log(`\n⏳ Waiting for channel to become active (requires mining)...`);
  let isActive = false;
  const bobPubkey = NODES.bob.pubkey;
  
  while (!isActive) {
    try {
      const response = await axios.get(`${NODES.alice.url}/listchannels`);
      const channels = response.data.channels || [];

      // Find the channel with Bob
      const channel = channels.find((c) => c.peer_pubkey === bobPubkey);
      const status = channel ? channel.status : "Not found";
      console.log(`  Current channel status: ${status}`);

      if (channel && channel.status === "Opened") {
        console.log(`✅ Channel is now ACTIVE and ready for payments!`);
        isActive = true;
      } else {
        process.stdout.write("."); // Print dots to show it's polling
        await delay(1000); // Wait 10 seconds before checking again
      }
    } catch (error) {
      console.error("Error polling channel status:", error.message);
      await delay(10000);
    }
  }
}

// ============================================================================
// FLOWS
// ============================================================================

async function flow1BasicLNPayment() {
  console.log("\n" + "=".repeat(70));
  console.log(
    "FLOW 1: Basic Lightning Network Payment (REST Alice -> WDK Bob)",
  );
  console.log("=".repeat(70));

  try {
    const amountMsat = 15000;

    console.log("Step 1️⃣ : Bob (WDK) creates a Lightning invoice");
    const invoiceData = await NODES.bob.account.createLightningInvoice({
      amountMsat: amountMsat,
      expirySec: 3600,
    });
    const invoice = invoiceData.invoice;
    console.log(`✓ Invoice created: ${invoice}`);

    console.log("\nStep 2️⃣ : Alice (REST) decodes invoice");
    const decodeData = await axios.post(`${NODES.alice.url}/decodelninvoice`, {
      invoice: invoice,
    });
    console.log(`✓ Invoice decoded, Hash: ${decodeData.data.payment_hash}`);

    console.log("\nStep 3️⃣ : Alice (REST) sends payment");
    const payRes = await axios.post(`${NODES.alice.url}/sendpayment`, {
      invoice: invoice,
    });
    const paymentHash = payRes.data.payment_hash;
    console.log(`✓ Payment sent, Hash: ${paymentHash}`);

    console.log("\nStep 4️⃣ : Waiting for payment to settle on Bob's side...");

    let isSettled = false;
    while (!isSettled) {
      try {
        const payment = await NODES.bob.account.getPayment(
          paymentHash,
          "InboundAutoClaim",
        );
        const status = payment ? payment.status : "Not found";
        console.log(`  Current payment status: ${status}`);

        if (payment && payment.status === "Succeeded") {
          console.log(`✅ Payment is settled on Bob's side!`);
          isSettled = true;
        } else {
          process.stdout.write("."); // Print dots to show it's polling
          await delay(2000); // Wait 2 seconds before checking again
        }
      } catch (error) {
        console.error(
          "Error polling payment status:",
          error.response?.data || error.message,
        );
        await delay(5000);
      }
    }

    console.log("\n✅ FLOW 1 Complete: Basic LN payment successful!");
  } catch (error) {
    console.error("\n❌ FLOW 1 Failed:", error.response?.data || error.message);
  }
}

async function flow2OnChainBTCTransfer() {
  console.log("\n" + "=".repeat(70));
  console.log("FLOW 2: On-chain Bitcoin Transfer (REST Alice -> WDK Bob)");
  console.log("=".repeat(70));

  try {
    console.log("Step 1️⃣ : Bob (WDK) creates an on-chain address");
    const btcAddressData = await NODES.bob.account.getAddress();
    const address = btcAddressData;
    console.log(`✓ Address generated: ${address}`);

    const balancesBefore = await NODES.bob.account.getBalanceDetails(false);
    const bobBtcBefore = balancesBefore.vanilla.spendable;

    console.log("\nStep 2️⃣ : Alice (REST) sends BTC");
    const amountSat = 1000;
    const res = await axios.post(`${NODES.alice.url}/sendbtc`, {
      amount: amountSat,
      address: address,
      fee_rate: 2,
      skip_sync: false,
    });
    const txid = res.data.txid;
    console.log(`✓ BTC transfer initiated, TXID: ${txid}`);

    console.log(
      "\nStep 3️⃣ : Waiting for Bob's balance to increase (requires mining)...",
    );
    await poll(
      async () => {
        const b = await NODES.bob.account.getBalanceDetails(false);
        if (b.vanilla.spendable > bobBtcBefore) {
          console.log(
            `\n✓ Balance increased! New balance: ${b.vanilla.spendable}`,
          );
          return true;
        }
        return false;
      },
      60,
      3000,
      "BTC Transfer Settlement",
    );

    console.log("\n✅ FLOW 2 Complete: On-chain BTC transfer successful!");
  } catch (error) {
    console.error("\n❌ FLOW 2 Failed:", error.response?.data || error.message);
  }
}

async function flow3RGBAssetIssuanceAndTransfer() {
  console.log("\n" + "=".repeat(70));
  console.log("FLOW 3: RGB Asset Issuance & Transfer (REST Alice -> WDK Bob)");
  console.log("=".repeat(70));

  try {
    console.log("Step 1️⃣ : Alice (REST) creates colorable UTXOs");
    try {
      await axios.post(`${NODES.alice.url}/createutxos`, {
        up_to: true,
        num: 5,
        size: RGB_CHANNEL_CAPACITY_SAT,
        fee_rate: 2,
        skip_sync: false,
      });
      console.log(
        "✓ Colorable UTXOs creation initiated. Waiting for mining...",
      );
      await delay(5000); // Allow mining to catch up
    } catch (e) {
      if (
        e.response &&
        e.response.data &&
        e.response.data.name &&
        e.response.data.name.includes("AllocationsAlreadyAvailable")
      ) {
        console.log("✓ Colorable UTXOs already exist");
      } else {
        throw e;
      }
    }

    console.log("\nStep 2️⃣ : Alice (REST) issues a new RGB NIA asset");
    const issueRes = await axios.post(`${NODES.alice.url}/issueassetnia`, {
      ticker: "HYBRID",
      name: "Hybrid REST-WDK Token",
      amounts: [500, 400], // Total of 900 units, 400 units in spendable
      precision: 0,
    });
    const assetId = issueRes.data.asset.asset_id;
    console.log(`✓ Asset issued! ID: ${assetId}`);

    console.log("\nStep 3️⃣ : Bob (WDK) creates colorable UTXOs to receive");
    try {
      await NODES.bob.account.createUtxos({
        up_to: true,
        num: 2,
        size: RGB_CHANNEL_CAPACITY_SAT,
        fee_rate: 2,
        skip_sync: false,
      });
      console.log("✓ Bob UTXOs creation initiated. Waiting for mining...");
      await delay(5000);
    } catch (e) {
      if (e.message.includes("Allocations already available")) {
        console.log("✓ Bob UTXOs already exist");
      } else {
        throw e;
      }
    }

    console.log("\nStep 4️⃣ : Bob (WDK) generates blind receive invoice");
    const blindRes = await NODES.bob.account.createRgbInvoice({
      // no asset and amount specified, Bob will receive any asset and amount (blind)
      duration_seconds: 3600,
      min_confirmations: 1,
      witness: false,
    });
    const receiveInvoice = blindRes.recipient_id;
    console.log(`✓ Blind invoice: ${receiveInvoice}`);

    console.log("\nStep 5️⃣ : Alice (REST) sends asset to Bob");
    const sendRes = await axios.post(`${NODES.alice.url}/sendrgb`, {
      donation: false,
      fee_rate: 2,
      min_confirmations: 1,
      recipient_map: {
        [assetId]: [
          {
            recipient_id: receiveInvoice,
            assignment: {
              type: "Fungible",
              value: 100,
            },
            transport_endpoints: [process.env.PROXY_ENDPOINT],
          },
        ],
      },
    });
    const txid = sendRes.data.txid;
    console.log(`✓ Transfer initiated, TXID: ${txid}`);

    console.log(
      "\nStep 6️⃣ : Waiting for Bob to receive the asset (requires mining)...",
    );
    let isReceived = false;
    let count = 0;
    while (!isReceived && count < 10) {
      try {
        // Both nodes need to refresh transfers to finalize RGB state
        await NODES.bob.account.refreshTransfers({
          skip_sync: false,
          filter: [],
        });
        await axios.post(`${NODES.alice.url}/refreshtransfers`, {
          skip_sync: false,
          filter: [],
        });
      } catch (e) {
        console.log(
          "⚠️ Refresh transfers error:",
          e.response?.data || e.message,
        );
      }

      const bobTransfers = await NODES.bob.account.listTransfers(assetId);
      console.log(
        `  Bob's transfers length: ${bobTransfers.length} for asset ${assetId}`,
      );
      bobTransfers.forEach((t, index) => {
        console.log(
          `    Transfer ${index + 1}: status=${t.status}, Kind=${t.kind}`,
        );
      });

      if (bobTransfers.length === 0) {
        console.log("  No transfers found yet for Bob");
        isReceived = false;
      }
      if (bobTransfers.some((t) => t.status === "Settled")) {
        console.log("  At least one transfer is settled for Bob");
        isReceived = true;
      } else {
        console.log("  No settled transfers yet for Bob");
        isReceived = false;
      }
      count++;
      if (!isReceived) {
        process.stdout.write("."); // Print dots to show it's polling
        await delay(3000); // Wait 3 seconds before checking again
      }
    }

    console.log("\n✅ FLOW 3 Complete: RGB asset transferred successfully!");
  } catch (error) {
    console.error("\n❌ FLOW 3 Failed:", error.response?.data || error.message);
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log(
    "\n╔════════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║                                                                    ║",
  );
  console.log(
    "║       Hybrid REST/WDK E2E Payment Flow Examples                    ║",
  );
  console.log(
    "║                                                                    ║",
  );
  console.log(
    "╚════════════════════════════════════════════════════════════════════╝",
  );

  try {
    await setupAllNodes();

    // Connect the peers (LSP and each other) before waiting for funds
    await connectPeers();

    await waitUntilNodeFunded("alice", 6000);
    await waitUntilNodeFunded("bob", 6000);

    await openLightningChannel();
    await waitForChannelActive();

    await flow1BasicLNPayment();
    await flow2OnChainBTCTransfer();
    await flow3RGBAssetIssuanceAndTransfer();

    console.log("\n" + "╔═".padEnd(70, "═") + "╗");
    console.log("║ " + "All hybrid payment flows completed!".padEnd(68) + " ║");
    console.log("╚═".padEnd(70, "═") + "╝\n");
  } catch (error) {
    console.error("\n💥 Main execution failed:", error.message);
  } finally {
    console.log("\nExiting script...");
    process.exit(0);
  }
}

main();
