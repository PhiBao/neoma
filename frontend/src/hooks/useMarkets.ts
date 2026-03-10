import { useState, useEffect, useCallback, useRef } from "react";
import { Contract, BrowserProvider, JsonRpcProvider } from "ethers";
import {
  MARKET_FACTORY_ADDRESS,
  MarketFactoryABI,
  OpinionMarketABI,
} from "../contracts";
import { MARKET_POLL_INTERVAL_MS, MARKET_WS_POLL_INTERVAL_MS } from "../constants";
import type { UseWebSocketReturn } from "./useWebSocket";

type AnyProvider = BrowserProvider | JsonRpcProvider;

export interface MarketInfo {
  address: string;
  question: string;
  options: string[];
  tags: string[];
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
 * Each includes an a11y label/icon prefix for color-blind accessibility.
 */
export const STATE_COLORS: Record<string, string> = {
  Active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "Voting Ended": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  Resolving: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Resolved: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  Cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
  Expired: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

/** Accessible icon per state (works without color vision) */
export const STATE_ICONS: Record<string, string> = {
  Active: "●",
  "Voting Ended": "◐",
  Resolving: "⏳",
  Resolved: "✓",
  Cancelled: "✕",
  Expired: "○",
};

export async function fetchMarketInfo(m: Contract, addr: string, tags: string[] = []): Promise<MarketInfo> {
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
    tags,
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

export function useMarkets(provider: AnyProvider | null, userAddress?: string, ws?: UseWebSocketReturn) {
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
            // Fetch tags from factory (graceful fallback to empty)
            let marketTags: string[] = [];
            try { marketTags = Array.from(await factory.getMarketTags(addr) as string[]); } catch { /* old factory */ }
            return fetchMarketInfo(m, addr, marketTags);
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

  // Auto-refresh every 30 seconds (polling fallback when WS is down)
  useEffect(() => {
    if (!provider || !MARKET_FACTORY_ADDRESS) return;
    // Use longer interval when WebSocket is active
    const interval = ws?.status === "connected" ? MARKET_WS_POLL_INTERVAL_MS : MARKET_POLL_INTERVAL_MS;
    const id = setInterval(fetchMarkets, interval);
    return () => clearInterval(id);
  }, [fetchMarkets, provider, ws?.status]);

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

  // ── WebSocket: subscribe to factory events for new markets ────────
  useEffect(() => {
    if (!ws || ws.status !== "connected" || !provider || !MARKET_FACTORY_ADDRESS) return;
    return ws.subscribeFactory(async (_marketId: bigint, _marketAddress: string) => {
      // Incrementally fetch just the new market instead of full refetch
      try {
        const factory = new Contract(MARKET_FACTORY_ADDRESS, MarketFactoryABI, provider);
        const m = new Contract(_marketAddress, OpinionMarketABI, provider);
        let marketTags: string[] = [];
        try { marketTags = Array.from(await factory.getMarketTags(_marketAddress) as string[]); } catch { /* old factory */ }
        const info = await fetchMarketInfo(m, _marketAddress, marketTags);
        setMarkets((prev) => {
          // Avoid duplicates
          if (prev.some((p) => p.address === _marketAddress)) return prev;
          return [info, ...prev];
        });
      } catch {
        // Fallback to full refetch if incremental fails
        fetchMarkets();
      }
    });
  }, [ws, ws?.status, fetchMarkets, provider]);

  // ── WebSocket: subscribe to per-market events ─────────────────────
  useEffect(() => {
    if (!ws || ws.status !== "connected" || markets.length === 0) return;

    const cleanups: (() => void)[] = [];

    for (const mkt of markets) {
      // Only subscribe to active / resolving markets (where events can happen)
      if (mkt.state > 1) continue;

      const cleanup = ws.subscribeMarket(mkt.address, {
        onVoteCast: () => {
          // Incrementally update the market's voter count + pool
          setMarkets((prev) =>
            prev.map((m) =>
              m.address === mkt.address
                ? { ...m, totalVoters: m.totalVoters + 1, totalPool: m.totalPool + m.stakeAmount }
                : m,
            ),
          );
        },
        onResolutionInitiated: () => {
          setMarkets((prev) =>
            prev.map((m) =>
              m.address === mkt.address ? { ...m, state: 1 } : m,
            ),
          );
        },
        onMarketResolved: (winnerIndices: number[], totalWinnerVoters: number) => {
          // Full refetch to get vote counts from finalization
          fetchMarkets();
          // Optimistic state update
          setMarkets((prev) =>
            prev.map((m) =>
              m.address === mkt.address
                ? { ...m, state: 2, winnerIndices, totalWinnerVoters }
                : m,
            ),
          );
        },
        onMarketExpired: () => {
          setMarkets((prev) =>
            prev.map((m) =>
              m.address === mkt.address ? { ...m, state: 4 } : m,
            ),
          );
        },
      });
      cleanups.push(cleanup);
    }

    return () => cleanups.forEach((fn) => fn());
  }, [ws, ws?.status, markets.length, fetchMarkets]); // eslint-disable-line react-hooks/exhaustive-deps

  return { markets, votedMap, loading, error, refetch: fetchMarkets };
}

export function useMarketDetail(provider: AnyProvider | null, address: string) {
  const [market, setMarket] = useState<MarketInfo | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [loading, setLoading] = useState(false);
  const userAddrRef = useRef<string | undefined>(undefined);

  const fetch = useCallback(async (userAddress?: string) => {
    if (userAddress !== undefined) userAddrRef.current = userAddress;
    const addr = userAddress ?? userAddrRef.current;
    if (!provider || !address) return;
    setLoading(true);
    try {
      const m = new Contract(address, OpinionMarketABI, provider);
      setMarket(await fetchMarketInfo(m, address));
      if (addr) {
        const voted = await m.hasVoted(addr);
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

  // Auto-refresh every 15s so state changes (bot resolution, other users) are picked up
  useEffect(() => {
    if (!provider || !address) return;
    const id = setInterval(() => fetch(), 15_000);
    return () => clearInterval(id);
  }, [fetch, provider, address]);

  // Refetch when tab regains visibility
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetch();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetch]);

  return { market, hasVoted, loading, refetch: fetch };
}
