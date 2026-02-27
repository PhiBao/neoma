import type { MarketInfo } from "../hooks/useMarkets";
import { stateLabel } from "../hooks/useMarkets";
import { ethers } from "ethers";

interface Props {
  market: MarketInfo;
  onClick: () => void;
}

const STATE_COLORS: Record<number, string> = {
  0: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",  // Active
  1: "bg-amber-500/20 text-amber-400 border-amber-500/30",        // Resolving
  2: "bg-violet-500/20 text-violet-400 border-violet-500/30",     // Resolved
  3: "bg-red-500/20 text-red-400 border-red-500/30",              // Cancelled
  4: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",           // Expired
};

function timeRemaining(endTime: number): string {
  const now = Date.now() / 1000;
  const diff = endTime - now;
  if (diff <= 0) return "Ended";
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function MarketCard({ market, onClick }: Props) {
  const stake = ethers.formatEther(market.stakeAmount);
  const pool = ethers.formatEther(market.totalPool);
  const isActive = market.state === 0;

  return (
    <div
      onClick={onClick}
      className="group bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 cursor-pointer hover:border-violet-500/40 hover:bg-[var(--bg-card-hover)] transition-all duration-200"
    >
      {/* Top row: state badge + time */}
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-medium border rounded-full px-2.5 py-0.5 ${STATE_COLORS[market.state] ?? STATE_COLORS[3]}`}>
          {stateLabel(market.state)}
        </span>
        {isActive && (
          <span className="text-xs text-[var(--text-muted)]">
            {timeRemaining(market.endTime)} left
          </span>
        )}
      </div>

      {/* Question */}
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4 group-hover:text-violet-300 transition-colors leading-snug">
        {market.question}
      </h3>

      {/* Option pills */}
      <div className="flex gap-2 mb-4">
        <div className={`flex-1 text-center text-sm font-medium rounded-xl py-2.5 border ${
          market.state === 2 && market.winnerIndex === 0
            ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
            : "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)]"
        }`}>
          {market.optionA}
          {market.state === 2 && market.winnerIndex === 0 && <span className="ml-1">✓</span>}
        </div>
        <div className="flex items-center text-[var(--text-muted)] text-xs font-bold">vs</div>
        <div className={`flex-1 text-center text-sm font-medium rounded-xl py-2.5 border ${
          market.state === 2 && market.winnerIndex === 1
            ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
            : "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)]"
        }`}>
          {market.optionB}
          {market.state === 2 && market.winnerIndex === 1 && <span className="ml-1">✓</span>}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)] pt-3 border-t border-[var(--border)]">
        <div className="flex items-center gap-4">
          <span>
            <span className="text-[var(--text-secondary)] font-medium">{market.totalVoters}</span> voters
          </span>
          <span>
            <span className="text-[var(--text-secondary)] font-medium">{pool}</span> ETH pool
          </span>
        </div>
        <span>{stake} ETH / vote</span>
      </div>
    </div>
  );
}
