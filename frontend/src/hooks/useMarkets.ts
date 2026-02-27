import { useState, useEffect, useCallback } from "react";
import { Contract, BrowserProvider } from "ethers";
import {
  MARKET_FACTORY_ADDRESS,
  MarketFactoryABI,
  OpinionMarketABI,
} from "../contracts";

export interface MarketInfo {
  address: string;
  question: string;
  optionA: string;
  optionB: string;
  stakeAmount: bigint;
  startTime: number;
  endTime: number;
  resolutionDeadline: number;
  state: number;
  totalPool: bigint;
  totalVoters: number;
  winnerIndex: number;
  winnerCount: number;
}

const STATE_LABELS = ["Active", "Resolving", "Resolved", "Cancelled", "Expired"];

export function stateLabel(state: number): string {
  return STATE_LABELS[state] ?? "Unknown";
}

export function useMarkets(provider: BrowserProvider | null) {
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchMarkets = useCallback(async () => {
    if (!provider || !MARKET_FACTORY_ADDRESS) return;
    setLoading(true);
    setError("");
    try {
      const factory = new Contract(MARKET_FACTORY_ADDRESS, MarketFactoryABI, provider);
      const count = Number(await factory.marketCount());
      const list: MarketInfo[] = [];

      for (let i = 0; i < count; i++) {
        const addr = await factory.getMarket(i);
        const m = new Contract(addr, OpinionMarketABI, provider);
        const [question, optionA, optionB, stakeAmount, startTime, endTime, resolutionDeadline, state, totalPool, totalVoters, winnerIndex, winnerCount] =
          await Promise.all([
            m.question(),
            m.optionA(),
            m.optionB(),
            m.stakeAmount(),
            m.startTime(),
            m.endTime(),
            m.resolutionDeadline(),
            m.state(),
            m.totalPool(),
            m.totalVoters(),
            m.winnerIndex(),
            m.winnerCount(),
          ]);
        list.push({
          address: addr,
          question,
          optionA,
          optionB,
          stakeAmount,
          startTime: Number(startTime),
          endTime: Number(endTime),
          resolutionDeadline: Number(resolutionDeadline),
          state: Number(state),
          totalPool,
          totalVoters: Number(totalVoters),
          winnerIndex: Number(winnerIndex),
          winnerCount: Number(winnerCount),
        });
      }
      setMarkets(list.reverse()); // newest first
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load markets");
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  return { markets, loading, error, refetch: fetchMarkets };
}

export function useMarketDetail(provider: BrowserProvider | null, address: string) {
  const [market, setMarket] = useState<MarketInfo | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async (userAddress?: string) => {
    if (!provider || !address) return;
    setLoading(true);
    try {
      const m = new Contract(address, OpinionMarketABI, provider);
      const [question, optionA, optionB, stakeAmount, startTime, endTime, resolutionDeadline, state, totalPool, totalVoters, winnerIndex, winnerCount] =
        await Promise.all([
          m.question(),
          m.optionA(),
          m.optionB(),
          m.stakeAmount(),
          m.startTime(),
          m.endTime(),
          m.resolutionDeadline(),
          m.state(),
          m.totalPool(),
          m.totalVoters(),
          m.winnerIndex(),
          m.winnerCount(),
        ]);
      setMarket({
        address,
        question,
        optionA,
        optionB,
        stakeAmount,
        startTime: Number(startTime),
        endTime: Number(endTime),
        resolutionDeadline: Number(resolutionDeadline),
        state: Number(state),
        totalPool,
        totalVoters: Number(totalVoters),
        winnerIndex: Number(winnerIndex),
        winnerCount: Number(winnerCount),
      });
      if (userAddress) {
        const voted = await m.hasVoted(userAddress);
        setHasVoted(voted);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [provider, address]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { market, hasVoted, loading, refetch: fetch };
}
