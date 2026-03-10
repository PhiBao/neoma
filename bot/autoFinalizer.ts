#!/usr/bin/env node
/**
 * neoma Auto-Finalization Bot
 *
 * Watches for markets in "Resolving" state, polls the Zama KMS relayer for
 * decrypted vote counts, and auto-calls `finalizeResolution()` once proofs
 * are available.
 *
 * Usage:
 *   INFURA_KEY=xxx PRIVATE_KEY=0x... FACTORY_ADDRESS=0x... node bot/autoFinalizer.js
 *
 * Environment:
 *   INFURA_KEY         — Infura project key (Sepolia)
 *   PRIVATE_KEY        — Private key of the bot wallet (needs ETH for gas)
 *   FACTORY_ADDRESS    — Deployed MarketFactory address
 *   POLL_INTERVAL_MS   — How often to scan (default: 30000)
 *   RELAYER_URL        — Zama relayer base URL (default: https://relayer-sepolia.zama.ai)
 */

import { ethers, Contract, Wallet, JsonRpcProvider } from "ethers";
import * as fs from "fs";
import * as path from "path";

// ── Config ──────────────────────────────────────────────────────────
const INFURA_KEY = process.env.INFURA_KEY;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS ?? "30000");
const RELAYER_URL = process.env.RELAYER_URL ?? "https://relayer-sepolia.zama.ai";

if (!INFURA_KEY || !PRIVATE_KEY || !FACTORY_ADDRESS) {
  console.error("Missing required env vars: INFURA_KEY, PRIVATE_KEY, FACTORY_ADDRESS");
  process.exit(1);
}

const RPC_URL = `https://sepolia.infura.io/v3/${INFURA_KEY}`;

// ── Load ABIs from artifacts ────────────────────────────────────────
function loadABI(contractName: string): any[] {
  const artifactPath = path.resolve(
    process.cwd(),
    `artifacts/contracts/${contractName}.sol/${contractName}.json`,
  );
  if (!fs.existsSync(artifactPath)) {
    console.error(`Artifact not found: ${artifactPath}. Run 'npx hardhat compile' first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(artifactPath, "utf-8")).abi;
}

const MarketFactoryABI = loadABI("MarketFactory");
const OpinionMarketABI = loadABI("OpinionMarket");

// ── Provider + Wallet ───────────────────────────────────────────────
const provider = new JsonRpcProvider(RPC_URL);
const wallet = new Wallet(PRIVATE_KEY, provider);

console.log(`[bot] Wallet: ${wallet.address}`);
console.log(`[bot] Factory: ${FACTORY_ADDRESS}`);
console.log(`[bot] Poll interval: ${POLL_INTERVAL}ms`);

const factory = new Contract(FACTORY_ADDRESS!, MarketFactoryABI, provider);

// ── Track finalization attempts to avoid duplicates ─────────────────
const processing = new Set<string>();
const finalized = new Set<string>();
const failureCount = new Map<string, number>();
const MAX_RETRIES = 10;

// ── Fetch public decryption result from Zama relayer ────────────────
async function fetchDecryptionProof(handles: string[]): Promise<{
  abiEncodedCleartexts: string;
  decryptionProof: string;
} | null> {
  try {
    // The relayer endpoint accepts handles and returns proofs when ready
    const response = await fetch(`${RELAYER_URL}/v1/public-decrypt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handles }),
    });

    if (!response.ok) {
      if (response.status === 404 || response.status === 202) {
        // Not ready yet — KMS is still processing
        return null;
      }
      console.warn(`[bot] Relayer returned ${response.status}: ${await response.text()}`);
      return null;
    }

    const data = await response.json() as {
      abiEncodedCleartexts: string;
      decryptionProof: string;
    };

    if (data.abiEncodedCleartexts && data.decryptionProof) {
      return data;
    }
    return null;
  } catch (err) {
    console.warn(`[bot] Relayer fetch error:`, (err as Error).message);
    return null;
  }
}

// ── Process a single resolving market ───────────────────────────────
async function processMarket(marketAddress: string) {
  if (processing.has(marketAddress) || finalized.has(marketAddress)) return;

  const failures = failureCount.get(marketAddress) ?? 0;
  if (failures >= MAX_RETRIES) {
    console.warn(`[bot] ${marketAddress.slice(0, 10)}... — max retries (${MAX_RETRIES}) reached, skipping`);
    return;
  }

  processing.add(marketAddress);

  try {
    const market = new Contract(marketAddress, OpinionMarketABI, wallet);

    // Check state
    const state = Number(await market.state());
    if (state !== 1) {
      // Not in Resolving state
      if (state === 2) finalized.add(marketAddress);
      return;
    }

    // Get resolution handles
    const handles: string[] = (await market.getResolutionHandles()).map(
      (h: string) => h,
    );

    if (handles.length === 0) {
      console.log(`[bot] ${marketAddress.slice(0, 10)}... — no handles`);
      return;
    }

    console.log(`[bot] ${marketAddress.slice(0, 10)}... — polling relayer for ${handles.length} handles`);

    // Poll relayer for decryption proof
    const proof = await fetchDecryptionProof(handles);
    if (!proof) {
      console.log(`[bot] ${marketAddress.slice(0, 10)}... — proofs not ready yet, will retry`);
      return;
    }

    console.log(`[bot] ${marketAddress.slice(0, 10)}... — proofs ready! Finalizing...`);

    // Call finalizeResolution
    const tx = await market.finalizeResolution(
      proof.abiEncodedCleartexts,
      proof.decryptionProof,
    );
    const receipt = await tx.wait();

    console.log(
      `[bot] ✅ ${marketAddress.slice(0, 10)}... finalized! tx: ${receipt?.hash}`,
    );
    finalized.add(marketAddress);
    failureCount.delete(marketAddress);
  } catch (err) {
    const count = (failureCount.get(marketAddress) ?? 0) + 1;
    failureCount.set(marketAddress, count);
    console.error(
      `[bot] ❌ ${marketAddress.slice(0, 10)}... error (attempt ${count}/${MAX_RETRIES}):`,
      (err as Error).message?.slice(0, 120),
    );
  } finally {
    processing.delete(marketAddress);
  }
}

// ── Main loop ───────────────────────────────────────────────────────
async function scan() {
  try {
    const marketCount = Number(await factory.marketCount());

    if (marketCount === 0) return;

    // Get all market addresses
    let addresses: string[];
    try {
      addresses = await factory.getAllMarkets();
    } catch {
      addresses = [];
      for (let i = 0; i < marketCount; i++) {
        addresses.push(await factory.getMarket(i));
      }
    }

    // Check each market
    for (const addr of addresses) {
      if (finalized.has(addr)) continue;

      try {
        const market = new Contract(addr, OpinionMarketABI, provider);
        const state = Number(await market.state());

        if (state === 1) {
          // Resolving — try to finalize
          await processMarket(addr);
        } else if (state === 2) {
          finalized.add(addr);
        }
      } catch {
        // Skip broken markets
      }
    }
  } catch (err) {
    console.error("[bot] Scan error:", (err as Error).message?.slice(0, 120));
  }
}

// ── Start ───────────────────────────────────────────────────────────
console.log("[bot] Auto-finalization bot started");
scan();
setInterval(scan, POLL_INTERVAL);
