import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * Neoma Protocol — Hardhat Tasks for OpinionMarket
 * =================================================
 *
 * Factory tasks:
 *   npx hardhat --network localhost task:deploy-factory
 *   npx hardhat --network localhost task:create-market --question "CR7 vs M10?" --option-a "CR7" --option-b "M10" --stake 0.01 --duration 3600
 *   npx hardhat --network localhost task:list-markets
 *
 * Market tasks:
 *   npx hardhat --network localhost task:market-info --market <address>
 *   npx hardhat --network localhost task:vote --market <address> --choice 0 --stake 0.01
 *   npx hardhat --network localhost task:resolve-market --market <address>
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

    for (let i = 0; i < count; i++) {
      const addr = await factory.getMarket(i);
      const market = await ethers.getContractAt("OpinionMarket", addr);
      const q = await market.question();
      const s = await market.state();
      const states = ["Active", "Resolving", "Resolved", "Cancelled"];
      console.log(`  [${i}] ${addr}  "${q}"  state=${states[Number(s)]}`);
    }
  });

// ─────────────────────────────────────────────────────────────────────────
//  Factory: create market
// ─────────────────────────────────────────────────────────────────────────

task("task:create-market", "Creates a new opinion market via the factory")
  .addOptionalParam("factory", "MarketFactory address (defaults to deployment)")
  .addParam("question", "The market question")
  .addParam("optionA", "Label for option A")
  .addParam("optionB", "Label for option B")
  .addParam("stake", "Stake per vote in ETH (e.g. 0.01)")
  .addParam("duration", "Voting duration in seconds")
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

    console.log(`\nCreating market...`);
    console.log(`  Question : ${taskArguments.question}`);
    console.log(`  Option A : ${taskArguments.optionA}`);
    console.log(`  Option B : ${taskArguments.optionB}`);
    console.log(`  Stake    : ${taskArguments.stake} ETH`);
    console.log(`  Duration : ${duration}s`);

    const tx = await factory
      .connect(signers[0])
      .createMarket(taskArguments.question, taskArguments.optionA, taskArguments.optionB, stakeWei, now, now + duration);

    const receipt = await tx.wait();
    const count = await factory.marketCount();
    const addr = await factory.getMarket(Number(count) - 1);

    console.log(`\n  Market deployed: ${addr}`);
    console.log(`  Market ID      : ${Number(count) - 1}`);
    console.log(`  Tx hash        : ${receipt?.hash}\n`);
  });

// ─────────────────────────────────────────────────────────────────────────
//  Market: info
// ─────────────────────────────────────────────────────────────────────────

task("task:market-info", "Prints detailed info about an opinion market")
  .addParam("market", "OpinionMarket contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers } = hre;
    const market = await ethers.getContractAt("OpinionMarket", taskArguments.market);

    const states = ["Active", "Resolving", "Resolved", "Cancelled"];

    console.log(`\n═══════════════════════════════════════════`);
    console.log(`  OpinionMarket: ${taskArguments.market}`);
    console.log(`═══════════════════════════════════════════`);
    console.log(`  Question    : ${await market.question()}`);
    console.log(`  Option A    : ${await market.optionA()}`);
    console.log(`  Option B    : ${await market.optionB()}`);
    console.log(`  Stake       : ${ethers.formatEther(await market.stakeAmount())} ETH`);
    console.log(`  Start       : ${new Date(Number(await market.startTime()) * 1000).toISOString()}`);
    console.log(`  End         : ${new Date(Number(await market.endTime()) * 1000).toISOString()}`);
    console.log(`  State       : ${states[Number(await market.state())]}`);
    console.log(`  Total Pool  : ${ethers.formatEther(await market.totalPool())} ETH`);
    console.log(`  Total Voters: ${await market.totalVoters()}`);

    const s = Number(await market.state());
    if (s >= 2) {
      // Resolved or later
      console.log(`  Winner      : Option ${Number(await market.winnerIndex()) === 0 ? "A" : "B"}`);
      console.log(`  Winner Count: ${await market.winnerCount()}`);
    }
    console.log(``);
  });

// ─────────────────────────────────────────────────────────────────────────
//  Market: encrypted vote
// ─────────────────────────────────────────────────────────────────────────

task("task:vote", "Cast an encrypted vote on an opinion market")
  .addParam("market", "OpinionMarket contract address")
  .addParam("choice", "Option index: 0 for A, 1 for B")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const signers = await ethers.getSigners();
    const voter = signers[0];
    const market = await ethers.getContractAt("OpinionMarket", taskArguments.market);
    const stakeAmount = await market.stakeAmount();
    const choice = parseInt(taskArguments.choice);

    console.log(`\nVoting on market ${taskArguments.market}`);
    console.log(`  Voter  : ${voter.address}`);
    console.log(`  Choice : ${choice} (${choice === 0 ? "Option A" : "Option B"})`);
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
//  Market: resolve (compute encrypted winner)
// ─────────────────────────────────────────────────────────────────────────

task("task:resolve-market", "Compute the encrypted winner (step 1 of resolution)")
  .addParam("market", "OpinionMarket contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers } = hre;
    const market = await ethers.getContractAt("OpinionMarket", taskArguments.market);

    console.log(`\nResolving market ${taskArguments.market}...`);

    const tx = await market.resolveMarket();
    const receipt = await tx.wait();

    console.log(`  Market state: Resolving`);
    console.log(`  Encrypted winner computed.`);
    console.log(`  Awaiting KMS decryption proof for finalization.`);
    console.log(`  Tx: ${receipt?.hash}\n`);
  });
