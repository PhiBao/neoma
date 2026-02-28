import { useState, useEffect, useCallback, useRef } from "react";
import { Contract, BrowserProvider, JsonRpcProvider } from "ethers";
import {
  MARKET_FACTORY_ADDRESS,
  MarketFactoryABI,
  OpinionMarketABI,
} from "../contracts";

type AnyProvider = BrowserProvider | JsonRpcProvider;

export interface MarketInfo {
  address: string;
  question: string;
  options: string[];
  stakeAmount: bigint;
  startTime: number;
  endTime: number;
  resolutionDeadline: number;
  state: number;
  totalPool: bigint;
  totalVoters: number;
  winnerIndices: number[];
  optionVoteCounts: number[];
  totalWinnerVoters: number;
}

const STATE_LABELS = ["Active", "Resolving", "Resolved", "Cancelled", "Expired"];

export function stateLabel(state: number): string {
  return STATE_LABELS[state] ?? "Unknown";
}

/**
 * Returns a display-friendly state string that accounts for the sub-state
 * where the on-chain state is Active (0) but the voting period has ended.
 */
export function displayState(market: MarketInfo): string {
  if (market.state === 0 && Date.now() / 1000 > market.endTime) {
    return "Voting Ended";
  }
  return stateLabel(market.state);
}

/** Returns true if the market is still accepting votes right now */
export function isVotingOpen(market: MarketInfo): boolean {
  const now = Date.now() / 1000;
  return market.state === 0 && now >= market.startTime && now <= market.endTime;
}

/**
 * STATE_COLORS keyed by display-state string for badge styling.
 */
export const STATE_COLORS: Record<string, string> = {
  Active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "Voting Ended": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  Resolving: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Resolved: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  Cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
  Expired: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

export async function fetchMarketInfo(m: Contract, addr: string): Promise<MarketInfo> {
  const [question, opts, stakeAmount, startTime, endTime, resolutionDeadline, state, totalPool, totalVoters, winnerIndices, optionVoteCounts, totalWinnerVoters] =
    await Promise.all([
      m.question(),
      m.options(),
      m.stakeAmount(),
      m.startTime(),
      m.endTime(),
      m.resolutionDeadline(),
      m.state(),
      m.totalPool(),
      m.totalVoters(),
      m.winnerIndices(),
      m.optionVoteCounts(),
      m.totalWinnerVoters(),
    ]);
  return {
    address: addr,
    question,
    options: Array.from(opts as string[]),
    stakeAmount,
    startTime: Number(startTime),
    endTime: Number(endTime),
    resolutionDeadline: Number(resolutionDeadline),
    state: Number(state),
    totalPool,
    totalVoters: Number(totalVoters),
    winnerIndices: (winnerIndices as bigint[]).map(Number),
    optionVoteCounts: (optionVoteCounts as bigint[]).map(Number),
    totalWinnerVoters: Number(totalWinnerVoters),
  };
}

export function useMarkets(provider: AnyProvider | null, userAddress?: string) {
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [votedMap, setVotedMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fetchingRef = useRef(false);

  const fetchMarkets = useCallback(async () => {
    if (!provider || !MARKET_FACTORY_ADDRESS) return;
    if (fetchingRef.current) return; // Prevent concurrent fetches
    fetchingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const factory = new Contract(MARKET_FACTORY_ADDRESS, MarketFactoryABI, provider);

      // Batch-fetch all market addresses in a single call
      let addresses: string[];
      try {
        addresses = await factory.getAllMarkets();
      } catch {
        // Fallback to sequential if getAllMarkets isn't available
        const count = Number(await factory.marketCount());
        addresses = [];
        for (let i = 0; i < count; i++) {
          addresses.push(await factory.getMarket(i));
        }
      }

      const list: MarketInfo[] = [];

      // Fetch market info in parallel (batches of 5 to avoid rate limits)
      for (let i = 0; i < addresses.length; i += 5) {
        const batch = addresses.slice(i, i + 5);
        const results = await Promise.allSettled(
          batch.map(async (addr) => {
            const m = new Contract(addr, OpinionMarketABI, provider);
            return fetchMarketInfo(m, addr);
          }),
        );
        for (const r of results) {
          if (r.status === "fulfilled") list.push(r.value);
          // Skip markets that fail (e.g. old / incompatible deployment)
        }
      }
      const reversed = list.reverse(); // newest first
      setMarkets(reversed);

      // Check hasVoted for each active market if user is connected
      if (userAddress) {
        const voted: Record<string, boolean> = {};
        await Promise.all(
          reversed.map(async (mkt) => {
            try {
              const c = new Contract(mkt.address, OpinionMarketABI, provider);
              voted[mkt.address] = await c.hasVoted(userAddress);
            } catch { voted[mkt.address] = false; }
          }),
        );
        setVotedMap(voted);
      } else {
        setVotedMap({});
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Failed to load markets";
      if (raw.includes("BAD_DATA") || raw.includes("could not decode")) {
        setError("Unable to read contract data. You may be on the wrong network.");
      } else if (raw.includes("missing revert data") || raw.includes("data=null")) {
        setError("Could not read market data. The contract may not be deployed on this network.");
      } else if (raw.includes("network") || raw.includes("NETWORK_ERROR")) {
        setError("Network error. Please check your connection.");
      } else {
        setError(raw.length > 120 ? raw.slice(0, 120) + "…" : raw);
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [provider, userAddress]);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!provider || !MARKET_FACTORY_ADDRESS) return;
    const id = setInterval(fetchMarkets, 30_000);
    return () => clearInterval(id);
  }, [fetchMarkets, provider]);

  // Refetch when tab regains visibility (stale data after backgrounding)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchMarkets();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchMarkets]);

  return { markets, votedMap, loading, error, refetch: fetchMarkets };
}

export function useMarketDetail(provider: AnyProvider | null, address: string) {
  const [market, setMarket] = useState<MarketInfo | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async (userAddress?: string) => {
    if (!provider || !address) return;
    setLoading(true);
    try {
      const m = new Contract(address, OpinionMarketABI, provider);
      setMarket(await fetchMarketInfo(m, address));
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
