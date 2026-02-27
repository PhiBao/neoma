import { describe, it, expect } from "vitest";
import { SEPOLIA_CHAIN_ID } from "../contracts";

describe("contracts/index", () => {
  it("exports the correct Sepolia chain ID", () => {
    expect(SEPOLIA_CHAIN_ID).toBe(11155111);
  });

  it("exports MARKET_FACTORY_ADDRESS from env", async () => {
    const { MARKET_FACTORY_ADDRESS } = await import("../contracts");
    // In test setup we stub VITE_FACTORY_ADDRESS
    expect(typeof MARKET_FACTORY_ADDRESS).toBe("string");
    expect(MARKET_FACTORY_ADDRESS.length).toBeGreaterThan(0);
  });

  it("exports MarketFactory ABI as an array", async () => {
    const { MarketFactoryABI } = await import("../contracts");
    expect(Array.isArray(MarketFactoryABI)).toBe(true);
    expect(MarketFactoryABI.length).toBeGreaterThan(0);
  });

  it("exports OpinionMarket ABI as an array", async () => {
    const { OpinionMarketABI } = await import("../contracts");
    expect(Array.isArray(OpinionMarketABI)).toBe(true);
    expect(OpinionMarketABI.length).toBeGreaterThan(0);
  });

  it("MarketFactory ABI contains createMarket function", async () => {
    const { MarketFactoryABI } = await import("../contracts");
    const hasCreateMarket = MarketFactoryABI.some(
      (item: any) => item.type === "function" && item.name === "createMarket" // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    expect(hasCreateMarket).toBe(true);
  });

  it("OpinionMarket ABI contains vote function", async () => {
    const { OpinionMarketABI } = await import("../contracts");
    const hasVote = OpinionMarketABI.some(
      (item: any) => item.type === "function" && item.name === "vote" // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    expect(hasVote).toBe(true);
  });

  it("OpinionMarket ABI contains expireMarket function", async () => {
    const { OpinionMarketABI } = await import("../contracts");
    const hasExpire = OpinionMarketABI.some(
      (item: any) => item.type === "function" && item.name === "expireMarket" // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    expect(hasExpire).toBe(true);
  });

  it("OpinionMarket ABI contains claimRefund function", async () => {
    const { OpinionMarketABI } = await import("../contracts");
    const hasRefund = OpinionMarketABI.some(
      (item: any) => item.type === "function" && item.name === "claimRefund" // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    expect(hasRefund).toBe(true);
  });
});
