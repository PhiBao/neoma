import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * Neoma Protocol — Hardhat Tasks for OpinionMarket (multi-option)
 * ================================================================
 *
 * Factory tasks:
 *   npx hardhat --network sepolia task:list-markets
 *   npx hardhat --network sepolia task:create-market --question "Best L2?" --options "Arbitrum,Optimism,Base" --stake 0.001 --duration 3600
 *
 * Market tasks:
 *   npx hardhat --network sepolia task:market-info --market <address>
 *   npx hardhat --network sepolia task:vote --market <address> --choice 0
 *   npx hardhat --network sepolia task:resolve-market --market <address>
 */

// ─────────────────────────────────────────────────────────────────────────
//  Factory: list markets
// ─────────────────────────────────────────────────────────────────────────

task("task:list-markets", "Lists all markets created by the factory")
  .addOptionalParam("factory", "MarketFactory address (defaults to deployment)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const factoryDeployment = taskArguments.factory
      ? { address: taskArguments.factory }
      : await deployments.get("MarketFactory");

    const factory = await ethers.getContractAt("MarketFactory", factoryDeployment.address);
    const count = await factory.marketCount();

    console.log(`\nMarketFactory: ${factoryDeployment.address}`);
    console.log(`Total markets: ${count}\n`);

    const states = ["Active", "Resolving", "Resolved", "Cancelled", "Expired"];

    for (let i = 0; i < count; i++) {
      const addr = await factory.getMarket(i);
      const market = await ethers.getContractAt("OpinionMarket", addr);
      const q = await market.question();
      const s = Number(await market.state());
      const opts = await market.options();
      const voters = await market.totalVoters();
      console.log(`  [${i}] ${addr}`);
      console.log(`       "${q}"`);
      console.log(`       Options: ${opts.join(" | ")}  State: ${states[s] ?? "Unknown"}  Voters: ${voters}`);
    }
  });

// ─────────────────────────────────────────────────────────────────────────
//  Factory: create market (multi-option)
// ─────────────────────────────────────────────────────────────────────────

task("task:create-market", "Creates a new multi-option opinion market via the factory")
  .addOptionalParam("factory", "MarketFactory address (defaults to deployment)")
  .addParam("question", "The market question")
  .addParam("options", "Comma-separated option labels (2–10), e.g. \"Arbitrum,Optimism,Base\"")
  .addParam("stake", "Stake per vote in ETH (e.g. 0.001)")
  .addParam("duration", "Voting duration in seconds")
  .addOptionalParam("tags", "Comma-separated tags (max 5, e.g. DeFi,Ethereum)", "")
  .addOptionalParam("fee", "Creator fee in basis points (max 500 = 5%)", "0")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const factoryDeployment = taskArguments.factory
      ? { address: taskArguments.factory }
      : await deployments.get("MarketFactory");

    const factory = await ethers.getContractAt("MarketFactory", factoryDeployment.address);
    const signers = await ethers.getSigners();

    const now = Math.floor(Date.now() / 1000);
    const stakeWei = ethers.parseEther(taskArguments.stake);
    const duration = parseInt(taskArguments.duration);
    const optionLabels = taskArguments.options.split(",").map((s: string) => s.trim());
    const tagLabels: string[] = taskArguments.tags
      ? taskArguments.tags.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];

    if (optionLabels.length < 2 || optionLabels.length > 10) {
      throw new Error("Options must be between 2 and 10 comma-separated labels");
    }
    if (tagLabels.length > 5) {
      throw new Error("Maximum 5 tags allowed");
    }

    const feeBps = parseInt(taskArguments.fee);
    if (isNaN(feeBps) || feeBps < 0 || feeBps > 500) {
      throw new Error("Fee must be 0–500 basis points");
    }

    console.log(`\nCreating market...`);
    console.log(`  Question : ${taskArguments.question}`);
    console.log(`  Options  : ${optionLabels.join(" | ")} (${optionLabels.length})`);
    console.log(`  Stake    : ${taskArguments.stake} ETH`);
    console.log(`  Duration : ${duration}s`);
    if (tagLabels.length > 0) console.log(`  Tags     : ${tagLabels.join(", ")}`);
    if (feeBps > 0) console.log(`  Fee      : ${feeBps} bps (${(feeBps / 100).toFixed(2)}%)`);

    const tx = await factory
      .connect(signers[0])
      .createMarket(taskArguments.question, optionLabels, stakeWei, now, now + duration, tagLabels, feeBps);

    const receipt = await tx.wait();
    const count = await factory.marketCount();
    const addr = await factory.getMarket(Number(count) - 1);

    console.log(`\n  Market deployed: ${addr}`);
    console.log(`  Market ID      : ${Number(count) - 1}`);
    console.log(`  Tx hash        : ${receipt?.hash}\n`);
  });

// ─────────────────────────────────────────────────────────────────────────
//  Market: info (multi-option)
// ─────────────────────────────────────────────────────────────────────────

task("task:market-info", "Prints detailed info about an opinion market")
  .addParam("market", "OpinionMarket contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers } = hre;
    const market = await ethers.getContractAt("OpinionMarket", taskArguments.market);

    const states = ["Active", "Resolving", "Resolved", "Cancelled", "Expired"];
    const opts = await market.options();

    console.log(`\n═══════════════════════════════════════════`);
    console.log(`  OpinionMarket: ${taskArguments.market}`);
    console.log(`═══════════════════════════════════════════`);
    console.log(`  Question      : ${await market.question()}`);
    console.log(`  Options (${opts.length}) :`);
    for (let i = 0; i < opts.length; i++) {
      console.log(`    [${i}] ${opts[i]}`);
    }
    console.log(`  Stake         : ${ethers.formatEther(await market.stakeAmount())} ETH`);
    console.log(`  Start         : ${new Date(Number(await market.startTime()) * 1000).toISOString()}`);
    console.log(`  End           : ${new Date(Number(await market.endTime()) * 1000).toISOString()}`);
    console.log(`  Res. Deadline : ${new Date(Number(await market.resolutionDeadline()) * 1000).toISOString()}`);
    console.log(`  State         : ${states[Number(await market.state())] ?? "Unknown"}`);
    console.log(`  Total Pool    : ${ethers.formatEther(await market.totalPool())} ETH`);
    console.log(`  Total Voters  : ${await market.totalVoters()}`);

    const s = Number(await market.state());
    if (s >= 2) {
      const winnerIndices = await market.winnerIndices();
      const voteCounts = await market.optionVoteCounts();
      const totalWinnerVoters = await market.totalWinnerVoters();
      console.log(`  Winner(s)     : ${winnerIndices.map((i: bigint) => `[${i}] ${opts[Number(i)]}`).join(", ")}`);
      console.log(`  Vote Counts   : ${voteCounts.map((c: bigint, i: number) => `${opts[i]}=${c}`).join(", ")}`);
      console.log(`  Winner Voters : ${totalWinnerVoters}`);
      if (Number(totalWinnerVoters) > 0) {
        const pool = await market.totalPool();
        const payout = pool / BigInt(totalWinnerVoters);
        console.log(`  Payout/Winner : ${ethers.formatEther(payout)} ETH`);
      }
    }
    console.log(``);
  });

// ─────────────────────────────────────────────────────────────────────────
//  Market: encrypted vote (multi-option)
// ─────────────────────────────────────────────────────────────────────────

task("task:vote", "Cast an encrypted vote on an opinion market")
  .addParam("market", "OpinionMarket contract address")
  .addParam("choice", "Option index (0-based)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const signers = await ethers.getSigners();
    const voter = signers[0];
    const market = await ethers.getContractAt("OpinionMarket", taskArguments.market);
    const stakeAmount = await market.stakeAmount();
    const opts = await market.options();
    const choice = parseInt(taskArguments.choice);

    if (choice < 0 || choice >= opts.length) {
      throw new Error(`Choice must be 0..${opts.length - 1}`);
    }

    console.log(`\nVoting on market ${taskArguments.market}`);
    console.log(`  Voter  : ${voter.address}`);
    console.log(`  Choice : [${choice}] ${opts[choice]}`);
    console.log(`  Stake  : ${ethers.formatEther(stakeAmount)} ETH`);

    // Encrypt the choice client-side
    const encrypted = await fhevm
      .createEncryptedInput(taskArguments.market, voter.address)
      .add8(choice)
      .encrypt();

    const tx = await market.connect(voter).vote(encrypted.handles[0], encrypted.inputProof, { value: stakeAmount });
    const receipt = await tx.wait();

    console.log(`\n  Vote cast! Tx: ${receipt?.hash}`);
    console.log(`  Total voters: ${await market.totalVoters()}\n`);
  });

// ─────────────────────────────────────────────────────────────────────────
//  Market: resolve (mark counters for decryption)
// ─────────────────────────────────────────────────────────────────────────

task("task:resolve-market", "Initiate resolution (step 1 — marks counters for KMS decryption)")
  .addParam("market", "OpinionMarket contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers } = hre;
    const market = await ethers.getContractAt("OpinionMarket", taskArguments.market);

    console.log(`\nResolving market ${taskArguments.market}...`);

    const tx = await market.resolveMarket();
    const receipt = await tx.wait();

    console.log(`  Market state: Resolving`);
    console.log(`  Counters marked for decryption.`);
    console.log(`  Awaiting KMS decryption proof for finalizeResolution().`);
    console.log(`  Tx: ${receipt?.hash}\n`);
  });
