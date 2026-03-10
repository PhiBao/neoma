import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { MarketFactory, MarketFactory__factory, OpinionMarket } from "../types";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  charlie: HardhatEthersSigner;
};

const STAKE = ethers.parseEther("0.01"); // 0.01 ETH per vote

async function deployFixture() {
  const factory = (await ethers.getContractFactory("MarketFactory")) as MarketFactory__factory;
  const marketFactory = (await factory.deploy()) as MarketFactory;
  const factoryAddress = await marketFactory.getAddress();

  return { marketFactory, factoryAddress };
}

/** Deploy factory + create a single "CR7 vs M10" market that is already active */
async function deployWithActiveMarket(signers: Signers) {
  const { marketFactory, factoryAddress } = await deployFixture();

  const now = await time.latest();
  const startTime = now; // already started
  const endTime = now + 3600; // 1 hour from now

  const tx = await marketFactory.connect(signers.deployer).createMarket(
    "Who is the GOAT?",
    ["CR7", "M10"],
    STAKE,
    startTime,
    endTime,
    [],  // no tags
    0,   // no creator fee
  );
  await tx.wait();

  const marketAddress = await marketFactory.getMarket(0);
  const market = (await ethers.getContractAt("OpinionMarket", marketAddress)) as unknown as OpinionMarket;

  return { marketFactory, factoryAddress, market, marketAddress, startTime, endTime };
}

// ===========================================================================
//  TEST SUITE
// ===========================================================================

describe("OpinionMarket Protocol", function () {
  let signers: Signers;

  before(async function () {
    const all = await ethers.getSigners();
    signers = {
      deployer: all[0],
      alice: all[1],
      bob: all[2],
      charlie: all[3],
    };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("This test suite requires the FHEVM mock environment.");
      this.skip();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  MarketFactory
  // ─────────────────────────────────────────────────────────────────────────

  describe("MarketFactory", function () {
    let marketFactory: MarketFactory;

    beforeEach(async function () {
      ({ marketFactory } = await deployFixture());
    });

    it("should deploy with zero markets", async function () {
      expect(await marketFactory.marketCount()).to.eq(0);
    });

    it("should create a market and return its address", async function () {
      const now = await time.latest();
      const tx = await marketFactory.createMarket("A vs B?", ["A", "B"], STAKE, now, now + 3600, [], 0);
      await tx.wait();

      expect(await marketFactory.marketCount()).to.eq(1);
      const addr = await marketFactory.getMarket(0);
      expect(addr).to.not.eq(ethers.ZeroAddress);
      expect(await marketFactory.isMarket(addr)).to.be.true;
    });

    it("should create multiple markets with incrementing IDs", async function () {
      const now = await time.latest();
      await (await marketFactory.createMarket("Q1?", ["A", "B"], STAKE, now, now + 3600, [], 0)).wait();
      await (await marketFactory.createMarket("Q2?", ["C", "D"], STAKE, now, now + 7200, [], 0)).wait();

      expect(await marketFactory.marketCount()).to.eq(2);
      const all = await marketFactory.getAllMarkets();
      expect(all.length).to.eq(2);
      expect(all[0]).to.not.eq(all[1]);
    });

    it("should emit MarketCreated event", async function () {
      const now = await time.latest();
      await expect(marketFactory.createMarket("Q?", ["X", "Y"], STAKE, now, now + 3600, [], 0)).to.emit(
        marketFactory,
        "MarketCreated",
      );
    });

    it("should revert on empty question", async function () {
      const now = await time.latest();
      await expect(marketFactory.createMarket("", ["A", "B"], STAKE, now, now + 3600, [], 0)).to.be.revertedWithCustomError(
        marketFactory,
        "EmptyQuestion",
      );
    });

    it("should revert on empty option", async function () {
      const now = await time.latest();
      await expect(marketFactory.createMarket("Q?", ["", "B"], STAKE, now, now + 3600, [], 0)).to.be.revertedWithCustomError(
        marketFactory,
        "EmptyOption",
      );
    });

    it("should revert on zero stake", async function () {
      const now = await time.latest();
      await expect(marketFactory.createMarket("Q?", ["A", "B"], 0, now, now + 3600, [], 0)).to.be.revertedWithCustomError(
        marketFactory,
        "InvalidStake",
      );
    });

    it("should store and return tags", async function () {
      const now = await time.latest();
      await (await marketFactory.createMarket("Tagged?", ["A", "B"], STAKE, now, now + 3600, ["Crypto", "DeFi"], 0)).wait();
      const addr = await marketFactory.getMarket(0);
      const tags = await marketFactory.getMarketTags(addr);
      expect(tags).to.deep.eq(["Crypto", "DeFi"]);
    });

    it("should return markets by tag", async function () {
      const now = await time.latest();
      await (await marketFactory.createMarket("Q1?", ["A", "B"], STAKE, now, now + 3600, ["Crypto"], 0)).wait();
      await (await marketFactory.createMarket("Q2?", ["X", "Y"], STAKE, now, now + 3600, ["NFT"], 0)).wait();
      await (await marketFactory.createMarket("Q3?", ["M", "N"], STAKE, now, now + 3600, ["Crypto", "NFT"], 0)).wait();

      const cryptoMarkets = await marketFactory.getMarketsByTag("Crypto");
      expect(cryptoMarkets.length).to.eq(2);
      const nftMarkets = await marketFactory.getMarketsByTag("NFT");
      expect(nftMarkets.length).to.eq(2);
    });

    it("should return all unique tags", async function () {
      const now = await time.latest();
      await (await marketFactory.createMarket("Q1?", ["A", "B"], STAKE, now, now + 3600, ["Crypto", "DeFi"], 0)).wait();
      await (await marketFactory.createMarket("Q2?", ["X", "Y"], STAKE, now, now + 3600, ["Crypto", "NFT"], 0)).wait();

      const allTags = await marketFactory.getAllTags();
      expect(allTags.length).to.eq(3);
      expect(allTags).to.include("Crypto");
      expect(allTags).to.include("DeFi");
      expect(allTags).to.include("NFT");
    });

    it("should revert on too many tags", async function () {
      const now = await time.latest();
      await expect(
        marketFactory.createMarket("Q?", ["A", "B"], STAKE, now, now + 3600, ["a", "b", "c", "d", "e", "f"], 0),
      ).to.be.revertedWithCustomError(marketFactory, "TooManyTags");
    });

    it("should store creator fee in the market", async function () {
      const now = await time.latest();
      await (await marketFactory.createMarket("Fee?", ["A", "B"], STAKE, now, now + 3600, [], 250)).wait();
      const addr = await marketFactory.getMarket(0);
      const market = (await ethers.getContractAt("OpinionMarket", addr)) as unknown as OpinionMarket;
      expect(await market.creatorFeeBps()).to.eq(250);
      expect(await market.creator()).to.eq(signers.deployer.address);
    });

    it("should revert on fee too high", async function () {
      const now = await time.latest();
      // FeeTooHigh is emitted by the OpinionMarket constructor, not the factory
      await expect(
        marketFactory.createMarket("Q?", ["A", "B"], STAKE, now, now + 3600, [], 600),
      ).to.be.reverted;
    });

    it("should create multi-option market with 5 options", async function () {
      const now = await time.latest();
      const opts = ["Arbitrum", "Optimism", "Base", "zkSync", "Starknet"];
      await (await marketFactory.createMarket("Best L2?", opts, STAKE, now, now + 3600, ["L2"], 100)).wait();
      const addr = await marketFactory.getMarket(0);
      const market = (await ethers.getContractAt("OpinionMarket", addr)) as unknown as OpinionMarket;
      expect(await market.optionCount()).to.eq(5);
      const storedOpts = await market.options();
      expect(storedOpts).to.deep.eq(opts);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  OpinionMarket — metadata & initial state
  // ─────────────────────────────────────────────────────────────────────────

  describe("OpinionMarket — metadata", function () {
    let market: OpinionMarket;

    beforeEach(async function () {
      ({ market } = await deployWithActiveMarket(signers));
    });

    it("should store correct question and options", async function () {
      expect(await market.question()).to.eq("Who is the GOAT?");
      const opts = await market.options();
      expect(opts).to.deep.eq(["CR7", "M10"]);
    });

    it("should start in Active state with zero votes", async function () {
      expect(await market.state()).to.eq(0); // Active
      expect(await market.totalVoters()).to.eq(0);
      expect(await market.totalPool()).to.eq(0);
    });

    it("should have correct option count", async function () {
      expect(await market.optionCount()).to.eq(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  OpinionMarket — encrypted voting
  // ─────────────────────────────────────────────────────────────────────────

  describe("OpinionMarket — voting", function () {
    let market: OpinionMarket;
    let marketAddress: string;

    beforeEach(async function () {
      ({ market, marketAddress } = await deployWithActiveMarket(signers));
    });

    it("should accept a vote for option A (encrypted 0)", async function () {
      const enc = await fhevm
        .createEncryptedInput(marketAddress, signers.alice.address)
        .add8(0) // option A
        .encrypt();

      const tx = await market
        .connect(signers.alice)
        .vote(enc.handles[0], enc.inputProof, { value: STAKE });
      await tx.wait();

      expect(await market.hasVoted(signers.alice.address)).to.be.true;
      expect(await market.totalVoters()).to.eq(1);
      expect(await market.totalPool()).to.eq(STAKE);
    });

    it("should accept a vote for option B (encrypted 1)", async function () {
      const enc = await fhevm
        .createEncryptedInput(marketAddress, signers.bob.address)
        .add8(1) // option B
        .encrypt();

      const tx = await market
        .connect(signers.bob)
        .vote(enc.handles[0], enc.inputProof, { value: STAKE });
      await tx.wait();

      expect(await market.hasVoted(signers.bob.address)).to.be.true;
      expect(await market.totalVoters()).to.eq(1);
    });

    it("should accept multiple voters", async function () {
      // Alice votes A
      const encA = await fhevm
        .createEncryptedInput(marketAddress, signers.alice.address)
        .add8(0)
        .encrypt();
      await (
        await market.connect(signers.alice).vote(encA.handles[0], encA.inputProof, { value: STAKE })
      ).wait();

      // Bob votes B
      const encB = await fhevm
        .createEncryptedInput(marketAddress, signers.bob.address)
        .add8(1)
        .encrypt();
      await (await market.connect(signers.bob).vote(encB.handles[0], encB.inputProof, { value: STAKE })).wait();

      // Charlie votes A
      const encC = await fhevm
        .createEncryptedInput(marketAddress, signers.charlie.address)
        .add8(0)
        .encrypt();
      await (
        await market.connect(signers.charlie).vote(encC.handles[0], encC.inputProof, { value: STAKE })
      ).wait();

      expect(await market.totalVoters()).to.eq(3);
      expect(await market.totalPool()).to.eq(STAKE * 3n);
      expect(await market.voterCount()).to.eq(3);
    });

    it("should emit VoteCast event", async function () {
      const enc = await fhevm
        .createEncryptedInput(marketAddress, signers.alice.address)
        .add8(0)
        .encrypt();

      await expect(
        market.connect(signers.alice).vote(enc.handles[0], enc.inputProof, { value: STAKE }),
      ).to.emit(market, "VoteCast");
    });

    it("should revert on double vote", async function () {
      const enc = await fhevm
        .createEncryptedInput(marketAddress, signers.alice.address)
        .add8(0)
        .encrypt();

      await (
        await market.connect(signers.alice).vote(enc.handles[0], enc.inputProof, { value: STAKE })
      ).wait();

      await expect(
        market.connect(signers.alice).vote(enc.handles[0], enc.inputProof, { value: STAKE }),
      ).to.be.revertedWithCustomError(market, "AlreadyVoted");
    });

    it("should revert on incorrect stake amount", async function () {
      const enc = await fhevm
        .createEncryptedInput(marketAddress, signers.alice.address)
        .add8(0)
        .encrypt();

      await expect(
        market.connect(signers.alice).vote(enc.handles[0], enc.inputProof, {
          value: ethers.parseEther("0.005"),
        }),
      ).to.be.revertedWithCustomError(market, "InsufficientStake");
    });

    it("should revert when voting after end time", async function () {
      // Fast-forward past endTime
      await time.increase(3601);

      const enc = await fhevm
        .createEncryptedInput(marketAddress, signers.alice.address)
        .add8(0)
        .encrypt();

      await expect(
        market.connect(signers.alice).vote(enc.handles[0], enc.inputProof, { value: STAKE }),
      ).to.be.revertedWithCustomError(market, "VotingNotOpen");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  OpinionMarket — resolution (encrypted computation only)
  // ─────────────────────────────────────────────────────────────────────────

  describe("OpinionMarket — resolution", function () {
    let market: OpinionMarket;
    let marketAddress: string;

    beforeEach(async function () {
      ({ market, marketAddress } = await deployWithActiveMarket(signers));

      // Cast votes: Alice → A, Bob → B, Charlie → A  (A wins 2-1)
      const encA1 = await fhevm.createEncryptedInput(marketAddress, signers.alice.address).add8(0).encrypt();
      await (
        await market.connect(signers.alice).vote(encA1.handles[0], encA1.inputProof, { value: STAKE })
      ).wait();

      const encB = await fhevm.createEncryptedInput(marketAddress, signers.bob.address).add8(1).encrypt();
      await (await market.connect(signers.bob).vote(encB.handles[0], encB.inputProof, { value: STAKE })).wait();

      const encA2 = await fhevm.createEncryptedInput(marketAddress, signers.charlie.address).add8(0).encrypt();
      await (
        await market.connect(signers.charlie).vote(encA2.handles[0], encA2.inputProof, { value: STAKE })
      ).wait();
    });

    it("should revert resolveMarket before end time", async function () {
      await expect(market.resolveMarket()).to.be.revertedWithCustomError(market, "VotingPeriodNotEnded");
    });

    it("should transition to Resolving after resolveMarket()", async function () {
      await time.increase(3601);
      const tx = await market.resolveMarket();
      await tx.wait();

      expect(await market.state()).to.eq(1); // Resolving
    });

    it("should emit ResolutionInitiated event", async function () {
      await time.increase(3601);
      await expect(market.resolveMarket()).to.emit(market, "ResolutionInitiated");
    });

    it("should revert if called twice", async function () {
      await time.increase(3601);
      await (await market.resolveMarket()).wait();
      await expect(market.resolveMarket()).to.be.revertedWithCustomError(market, "MarketNotActive");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  OpinionMarket — resolution with no votes
  // ─────────────────────────────────────────────────────────────────────────

  describe("OpinionMarket — edge cases", function () {
    let market: OpinionMarket;

    beforeEach(async function () {
      ({ market } = await deployWithActiveMarket(signers));
    });

    it("should revert resolveMarket with zero voters", async function () {
      await time.increase(3601);
      await expect(market.resolveMarket()).to.be.revertedWithCustomError(market, "NoVotes");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  OpinionMarket — timeout / expiry / refund
  // ─────────────────────────────────────────────────────────────────────────

  describe("OpinionMarket — timeout & refund", function () {
    let market: OpinionMarket;
    let marketAddress: string;

    beforeEach(async function () {
      ({ market, marketAddress } = await deployWithActiveMarket(signers));

      // Cast votes: Alice → A, Bob → B
      const encA = await fhevm.createEncryptedInput(marketAddress, signers.alice.address).add8(0).encrypt();
      await (
        await market.connect(signers.alice).vote(encA.handles[0], encA.inputProof, { value: STAKE })
      ).wait();

      const encB = await fhevm.createEncryptedInput(marketAddress, signers.bob.address).add8(1).encrypt();
      await (await market.connect(signers.bob).vote(encB.handles[0], encB.inputProof, { value: STAKE })).wait();
    });

    it("should have a resolutionDeadline = endTime + 24h", async function () {
      const endTime = await market.endTime();
      const deadline = await market.resolutionDeadline();
      expect(deadline).to.eq(endTime + 86400n); // 24 hours
    });

    it("should revert expireMarket before resolution deadline", async function () {
      await time.increase(3601); // past endTime but not past deadline
      await expect(market.expireMarket()).to.be.revertedWithCustomError(
        market,
        "ResolutionDeadlineNotReached",
      );
    });

    it("should transition to Expired after resolution deadline", async function () {
      // Move past endTime + 24h grace period
      await time.increase(3600 + 86400 + 1);

      const tx = await market.expireMarket();
      await tx.wait();

      expect(await market.state()).to.eq(4); // Expired
    });

    it("should emit MarketExpired event", async function () {
      await time.increase(3600 + 86400 + 1);
      await expect(market.expireMarket()).to.emit(market, "MarketExpired");
    });

    it("should allow voters to claim refund after expiry", async function () {
      await time.increase(3600 + 86400 + 1);
      await (await market.expireMarket()).wait();

      const balBefore = await ethers.provider.getBalance(signers.alice.address);
      const tx = await market.connect(signers.alice).claimRefund();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(signers.alice.address);

      expect(balAfter + gasUsed - balBefore).to.eq(STAKE);
      expect(await market.hasRefunded(signers.alice.address)).to.be.true;
    });

    it("should revert double refund", async function () {
      await time.increase(3600 + 86400 + 1);
      await (await market.expireMarket()).wait();
      await (await market.connect(signers.alice).claimRefund()).wait();

      await expect(
        market.connect(signers.alice).claimRefund(),
      ).to.be.revertedWithCustomError(market, "AlreadyRefunded");
    });

    it("should revert refund for non-voter", async function () {
      await time.increase(3600 + 86400 + 1);
      await (await market.expireMarket()).wait();

      await expect(
        market.connect(signers.charlie).claimRefund(),
      ).to.be.revertedWithCustomError(market, "NotVoter");
    });

    it("should revert refund before expiry", async function () {
      await time.increase(3601); // past endTime but market still Active
      await expect(
        market.connect(signers.alice).claimRefund(),
      ).to.be.revertedWithCustomError(market, "MarketNotExpired");
    });

    it("should allow expiry from Resolving state too", async function () {
      await time.increase(3601);
      await (await market.resolveMarket()).wait();
      expect(await market.state()).to.eq(1); // Resolving

      // Move past resolution deadline
      await time.increase(86400 + 1);
      await (await market.expireMarket()).wait();
      expect(await market.state()).to.eq(4); // Expired
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  NOTE: finalizeResolution, claim, and batchPrepareClaims tests require
  //  KMS decryption proofs — only available on live FHEVM (Sepolia/mainnet).
  //  Tests below verify pre-conditions that can be checked without KMS.
  // ─────────────────────────────────────────────────────────────────────────

  describe("OpinionMarket — finalization & claims (pre-condition checks)", function () {
    let market: OpinionMarket;
    let marketAddress: string;

    beforeEach(async function () {
      ({ market, marketAddress } = await deployWithActiveMarket(signers));

      // Cast 3 votes: Alice → 0, Bob → 1, Charlie → 0
      const encA = await fhevm.createEncryptedInput(marketAddress, signers.alice.address).add8(0).encrypt();
      await (await market.connect(signers.alice).vote(encA.handles[0], encA.inputProof, { value: STAKE })).wait();
      const encB = await fhevm.createEncryptedInput(marketAddress, signers.bob.address).add8(1).encrypt();
      await (await market.connect(signers.bob).vote(encB.handles[0], encB.inputProof, { value: STAKE })).wait();
      const encC = await fhevm.createEncryptedInput(marketAddress, signers.charlie.address).add8(0).encrypt();
      await (await market.connect(signers.charlie).vote(encC.handles[0], encC.inputProof, { value: STAKE })).wait();
    });

    it("should revert finalizeResolution when not in Resolving state", async function () {
      // Market is still Active — finalizeResolution should revert
      await expect(
        market.finalizeResolution("0x", "0x"),
      ).to.be.revertedWithCustomError(market, "MarketNotResolving");
    });

    it("should revert prepareClaim before resolution", async function () {
      // Market is Active, not Resolved
      await expect(
        market.connect(signers.alice).prepareClaim(),
      ).to.be.revertedWithCustomError(market, "MarketNotResolved");
    });

    it("should revert non-owner from calling resolveMarket", async function () {
      await time.increase(3601);
      await expect(
        market.connect(signers.alice).resolveMarket(),
      ).to.be.revertedWithCustomError(market, "NotAuthorized");
    });

    it("should expose resolution handles after resolveMarket", async function () {
      await time.increase(3601);
      await (await market.resolveMarket()).wait();
      const handles = await market.getResolutionHandles();
      expect(handles.length).to.eq(2); // 2 options = 2 handles
    });

    // These require actual KMS proofs — kept as pending
    it("should finalize with valid KMS proof and transition to Resolved");
    it("should prepare claim for eligible voter");
    it("should batch-prepare claims for all voters");
    it("should execute claim and transfer payout to winner");
    it("should revert executeClaim for losing voter");
    it("should revert double claim");
  });
});
