import { useState, useEffect, useCallback, useRef } from "react";
import { Contract, Interface, BrowserProvider, JsonRpcProvider } from "ethers";
import type { Log } from "ethers";
import {
  MARKET_FACTORY_ADDRESS,
  MarketFactoryABI,
  OpinionMarketABI,
} from "../contracts";
import { LOOKBACK_BLOCKS, MAX_LOG_BLOCK_RANGE } from "../constants";

type AnyProvider = BrowserProvider | JsonRpcProvider;

// ── Activity event types ────────────────────────────────────────────
export interface ActivityEvent {
  id: string; // txHash-logIndex
  type:
    | "market_created"
    | "vote_cast"
    | "resolution_initiated"
    | "market_resolved"
    | "market_expired"
    | "reward_claimed"
    | "refunded";
  timestamp: number; // block timestamp
  blockNumber: number;
  txHash: string;
  marketAddress?: string;
  marketQuestion?: string; // resolved from lookup
  /** Extra data per event type */
  detail: string;
}

// ── Icons per event type ────────────────────────────────────────────
const EVENT_ICON: Record<ActivityEvent["type"], string> = {
  market_created: "🆕",
  vote_cast: "🗳️",
  resolution_initiated: "⏳",
  market_resolved: "✅",
  market_expired: "⏰",
  reward_claimed: "💰",
  refunded: "↩️",
};

const EVENT_COLOR: Record<ActivityEvent["type"], string> = {
  market_created: "text-violet-400",
  vote_cast: "text-sky-400",
  resolution_initiated: "text-amber-400",
  market_resolved: "text-emerald-400",
  market_expired: "text-orange-400",
  reward_claimed: "text-yellow-400",
  refunded: "text-rose-400",
};

// ── Helpers ─────────────────────────────────────────────────────────
function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function shortenAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ── Props ───────────────────────────────────────────────────────────
interface Props {
  provider: AnyProvider | null;
  /** If set, only show events for this market */
  marketAddress?: string;
  /** Lookup map: address → question (for labelling events) */
  marketNames?: Record<string, string>;
  /** Max events to display */
  limit?: number;
  /** Optional CSS class */
  className?: string;
}

const factoryIface = new Interface(MarketFactoryABI);
const marketIface = new Interface(OpinionMarketABI);

export function ActivityFeed({
  provider,
  marketAddress,
  marketNames = {},
  limit = 25,
  className = "",
}: Props) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(!!marketAddress); // auto-expand in per-market mode
  const [displayLimit, setDisplayLimit] = useState(limit);
  const mountedRef = useRef(true);
  const marketNamesRef = useRef(marketNames);
  marketNamesRef.current = marketNames;
  const lastBlockRef = useRef(0);
  const accumulatedRef = useRef<ActivityEvent[]>([]);

  const fetchEvents = useCallback(async () => {
    if (!provider || !MARKET_FACTORY_ADDRESS) {
      setLoading(false);
      return;
    }

    try {
      const currentBlock = await provider.getBlockNumber();
      // Incremental: only fetch new blocks since last fetch
      const fromBlock = lastBlockRef.current > 0
        ? lastBlockRef.current + 1
        : Math.max(0, currentBlock - LOOKBACK_BLOCKS);

      if (fromBlock > currentBlock) {
        setLoading(false);
        return;
      }

      const allEvents: ActivityEvent[] = [];
      const blockTimestampCache: Record<number, number> = {};

      // Helper to get block timestamp (cached)
      const getTimestamp = async (blockNum: number): Promise<number> => {
        if (blockTimestampCache[blockNum]) return blockTimestampCache[blockNum];
        try {
          const block = await provider.getBlock(blockNum);
          const ts = block?.timestamp ?? Math.floor(Date.now() / 1000);
          blockTimestampCache[blockNum] = ts;
          return ts;
        } catch {
          return Math.floor(Date.now() / 1000);
        }
      };

      // Helper to parse a single log entry
      const parseLog = async (log: Log, iface: Interface, mktAddress?: string): Promise<ActivityEvent | null> => {
        try {
          const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
          if (!parsed) return null;

          const ts = await getTimestamp(log.blockNumber);
          const base = {
            blockNumber: log.blockNumber,
            txHash: log.transactionHash,
            marketAddress: mktAddress ?? log.address,
            marketQuestion: marketNamesRef.current[(mktAddress ?? log.address).toLowerCase()] ?? undefined,
          };

          switch (parsed.name) {
            case "MarketCreated":
              return {
                ...base,
                id: `${log.transactionHash}-${log.index}`,
                type: "market_created",
                timestamp: ts,
                detail: `Market "${parsed.args.question}" created`,
                marketAddress: parsed.args.marketAddress ?? base.marketAddress,
              };
            case "VoteCast":
              return {
                ...base,
                id: `${log.transactionHash}-${log.index}`,
                type: "vote_cast",
                timestamp: ts,
                detail: `${shortenAddr(parsed.args.voter)} voted`,
              };
            case "ResolutionInitiated":
              return {
                ...base,
                id: `${log.transactionHash}-${log.index}`,
                type: "resolution_initiated",
                timestamp: ts,
                detail: "Resolution initiated",
              };
            case "MarketResolved":
              return {
                ...base,
                id: `${log.transactionHash}-${log.index}`,
                type: "market_resolved",
                timestamp: ts,
                detail: `Resolved — ${(parsed.args.winnerIndices as bigint[]).length} winner(s), ${Number(parsed.args.totalWinnerVoters)} winning voters`,
              };
            case "MarketExpired":
              return {
                ...base,
                id: `${log.transactionHash}-${log.index}`,
                type: "market_expired",
                timestamp: ts,
                detail: "Market expired without resolution",
              };
            case "RewardClaimed":
              return {
                ...base,
                id: `${log.transactionHash}-${log.index}`,
                type: "reward_claimed",
                timestamp: ts,
                detail: `${shortenAddr(parsed.args.voter)} claimed ${Number(parsed.args.amount) / 1e18} ETH`,
              };
            case "Refunded":
              return {
                ...base,
                id: `${log.transactionHash}-${log.index}`,
                type: "refunded",
                timestamp: ts,
                detail: `${shortenAddr(parsed.args.voter)} refunded ${Number(parsed.args.amount) / 1e18} ETH`,
              };
            default:
              return null;
          }
        } catch (err) {
          console.warn(`[ActivityFeed] Failed to parse log ${log.transactionHash}:`, err);
          return null;
        }
      };

      // Chunked getLogs to stay within RPC block-range limits
      const getLogsChunked = async (filter: { address: string | string[]; fromBlock: number; toBlock: number }): Promise<Log[]> => {
        const { fromBlock: from, toBlock: to, address: addr } = filter;
        if (to - from <= MAX_LOG_BLOCK_RANGE) {
          return provider.getLogs(filter);
        }
        const logs: Log[] = [];
        for (let start = from; start <= to; start += MAX_LOG_BLOCK_RANGE + 1) {
          const end = Math.min(start + MAX_LOG_BLOCK_RANGE, to);
          logs.push(...await provider.getLogs({ address: addr, fromBlock: start, toBlock: end }));
        }
        return logs;
      };

      if (marketAddress) {
        // ── Per-market mode ─────────────────────────────────────
        const logs = await getLogsChunked({ address: marketAddress, fromBlock, toBlock: currentBlock });

        // Pre-fetch block timestamps in parallel
        await Promise.all([...new Set(logs.map((l) => l.blockNumber))].map(getTimestamp));

        for (const log of logs) {
          const evt = await parseLog(log, marketIface, marketAddress);
          if (evt) allEvents.push(evt);
        }
      } else {
        // ── Global mode ─────────────────────────────────────────
        // 1) Factory events
        const factory = new Contract(MARKET_FACTORY_ADDRESS, MarketFactoryABI, provider);
        const factoryLogs = await getLogsChunked({ address: MARKET_FACTORY_ADDRESS, fromBlock, toBlock: currentBlock });

        // Pre-fetch block timestamps in parallel
        await Promise.all([...new Set(factoryLogs.map((l) => l.blockNumber))].map(getTimestamp));

        for (const log of factoryLogs) {
          const evt = await parseLog(log, factoryIface);
          if (evt) allEvents.push(evt);
        }

        // 2) Get all market addresses from factory
        try {
          const marketAddresses: string[] = await factory.getAllMarkets();

          if (marketAddresses.length > 0) {
            const marketLogs = await getLogsChunked({
              address: marketAddresses,
              fromBlock,
              toBlock: currentBlock,
            });

            // Pre-fetch block timestamps in parallel
            await Promise.all([...new Set(marketLogs.map((l) => l.blockNumber))].map(getTimestamp));

            for (const log of marketLogs) {
              const evt = await parseLog(log, marketIface, log.address);
              if (evt) allEvents.push(evt);
            }
          }
        } catch {
          // Factory might not have getAllMarkets or no markets yet
        }
      }

      // Sort newest first, limit
      allEvents.sort((a, b) => b.timestamp - a.timestamp || b.blockNumber - a.blockNumber);
      if (mountedRef.current) {
        // Merge with previously accumulated events (dedup by id)
        const merged = [...allEvents, ...accumulatedRef.current];
        const seen = new Set<string>();
        const deduped = merged.filter((e) => seen.has(e.id) ? false : (seen.add(e.id), true));
        deduped.sort((a, b) => b.timestamp - a.timestamp || b.blockNumber - a.blockNumber);
        accumulatedRef.current = deduped;
        lastBlockRef.current = currentBlock;
        setEvents(deduped);
        setLoading(false);
      }
    } catch (err) {
      console.warn("[ActivityFeed] Failed to fetch events:", err);
      if (mountedRef.current) setLoading(false);
    }
  }, [provider, marketAddress, limit]);

  useEffect(() => {
    mountedRef.current = true;
    fetchEvents();
    return () => { mountedRef.current = false; };
  }, [fetchEvents]);

  // ── Render ──────────────────────────────────────────────────────
  const isPerMarket = !!marketAddress;

  if (!expanded && !isPerMarket) {
    return (
      <button
        onClick={() => { setExpanded(true); }}
        className={`w-full mt-8 py-3 px-4 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] bg-[var(--bg-card)] border border-[var(--border)] rounded-xl transition cursor-pointer flex items-center justify-center gap-2 ${className}`}
      >
        <span>📡</span>
        <span>Show Recent Activity</span>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    );
  }

  return (
    <div className={`${isPerMarket ? "" : "mt-8"} ${className}`}>
      {/* Header */}
      {!isPerMarket && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <span>📡</span> Recent Activity
          </h3>
          <button
            onClick={() => setExpanded(false)}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition cursor-pointer"
          >
            Hide
          </button>
        </div>
      )}

      <div className={`bg-[var(--bg-card)] border border-[var(--border)] rounded-xl ${isPerMarket ? "" : "p-4"} overflow-hidden`}>
        {loading ? (
          <div className={`space-y-3 ${isPerMarket ? "px-4 py-3" : ""}`}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 animate-pulse">
                <div className="neoma-skeleton w-6 h-6 rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="neoma-skeleton h-3.5 w-4/5" />
                  <div className="neoma-skeleton h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className={`text-center py-6 text-sm text-[var(--text-muted)] ${isPerMarket ? "" : ""}`}>
            No recent activity found
          </div>
        ) : (
          <>
            <div className={`divide-y divide-[var(--border)] max-h-80 overflow-y-auto ${isPerMarket ? "" : ""}`}>
              {events.slice(0, displayLimit).map((evt) => (
              <div
                key={evt.id}
                className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition"
              >
                {/* Icon */}
                <span className="text-base shrink-0 mt-0.5" title={evt.type.replace(/_/g, " ")}>
                  {EVENT_ICON[evt.type]}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--text-secondary)] leading-snug">
                    {evt.detail}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--text-muted)]">
                    <span className={EVENT_COLOR[evt.type]}>
                      {evt.type.replace(/_/g, " ")}
                    </span>
                    {evt.marketQuestion && !isPerMarket && (
                      <>
                        <span>·</span>
                        <span className="truncate max-w-[200px]" title={evt.marketQuestion}>
                          {evt.marketQuestion}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Time + link */}
                <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                  <span className="text-xs text-[var(--text-muted)]">
                    {timeAgo(evt.timestamp)}
                  </span>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${evt.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-violet-400/60 hover:text-violet-400 transition"
                    title="View on Etherscan"
                  >
                    {evt.txHash.slice(0, 6)}...
                  </a>
                </div>
              </div>
            ))}
          </div>
          {events.length > displayLimit && (
            <button
              onClick={() => setDisplayLimit((prev) => prev + limit)}
              className="w-full py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition cursor-pointer border-t border-[var(--border)]"
            >
              Load more ({events.length - displayLimit} remaining)
            </button>
          )}
          </>
        )}
      </div>
    </div>
  );
}
