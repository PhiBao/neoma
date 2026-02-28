import { useState } from "react";
import type { MarketInfo } from "../hooks/useMarkets";
import { displayState, STATE_COLORS, isVotingOpen as checkVotingOpen } from "../hooks/useMarkets";
import { ethers, Contract } from "ethers";
import type { JsonRpcSigner, Eip1193Provider } from "ethers";
import { OpinionMarketABI } from "../contracts";
import { encryptVote } from "../fhe";

interface Props {
  market: MarketInfo;
  hasVoted: boolean;
  signer: JsonRpcSigner | null;
  rawProvider: Eip1193Provider | null;
  userAddress: string;
  onNavigate: () => void;
  onVoted: () => void;
}

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

export function MarketCard({ market, hasVoted, signer, rawProvider, userAddress, onNavigate, onVoted }: Props) {
  const stake = ethers.formatEther(market.stakeAmount);
  const pool = ethers.formatEther(market.totalPool);
  const isActive = market.state === 0;
  const isVotingOpen = checkVotingOpen(market);
  const canVote = isVotingOpen && !hasVoted && !!signer && !!rawProvider;
  const dState = displayState(market);

  const [voting, setVoting] = useState<0 | 1 | null>(null);
  const [error, setError] = useState("");

  async function handleVote(choice: 0 | 1, e: React.MouseEvent) {
    e.stopPropagation(); // Don't navigate to detail
    if (!canVote) return;
    setVoting(choice);
    setError("");
    try {
      const contract = new Contract(market.address, OpinionMarketABI, signer);
      const { handles, inputProof } = await encryptVote(
        rawProvider!,
        market.address,
        userAddress,
        choice,
      );
      const tx = await contract.vote(handles[0], inputProof, {
        value: market.stakeAmount,
      });
      await tx.wait();
      onVoted();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Vote failed";
      setError(msg.includes("reason=") ? msg.split("reason=")[1]?.split('"')[1] ?? msg.slice(0, 120) : msg.slice(0, 120));
    } finally {
      setVoting(null);
    }
  }

  const optionClasses = (_idx: 0 | 1) => {
    if (canVote) return "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:border-violet-500/60 hover:bg-violet-500/10 hover:text-violet-300 cursor-pointer";
    if (hasVoted && isVotingOpen) return "bg-violet-500/10 border-violet-500/30 text-violet-300/70";
    return "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)]";
  };

  return (
    <div
      onClick={onNavigate}
      className="group bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 cursor-pointer hover:border-violet-500/40 hover:bg-[var(--bg-card-hover)] transition-all duration-200"
    >
      {/* Top row: state badge + time */}
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-medium border rounded-full px-2.5 py-0.5 ${STATE_COLORS[dState] ?? STATE_COLORS.Cancelled}`}>
          {dState}
        </span>
        {isActive && isVotingOpen && (
          <span className="text-xs text-[var(--text-muted)]">
            {timeRemaining(market.endTime)} left
          </span>
        )}
      </div>

      {/* Question */}
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4 group-hover:text-violet-300 transition-colors leading-snug">
        {market.question}
      </h3>

      {/* Option pills — clickable to vote when active, result bars when resolved */}
      {market.state === 2 && market.totalVoters > 0 ? (() => {
        const winnerPct = Math.round((market.winnerCount / market.totalVoters) * 100);
        const loserPct = 100 - winnerPct;
        const aPct = market.winnerIndex === 0 ? winnerPct : loserPct;
        const bPct = market.winnerIndex === 0 ? loserPct : winnerPct;
        return (
          <div className="space-y-2 mb-4">
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className={`font-medium ${market.winnerIndex === 0 ? "text-emerald-400" : "text-[var(--text-secondary)]"}`}>
                  {market.optionA} {market.winnerIndex === 0 && <span>✓</span>}
                </span>
                <span className={`text-xs ${market.winnerIndex === 0 ? "text-emerald-400" : "text-[var(--text-muted)]"}`}>
                  {aPct}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${market.winnerIndex === 0 ? "bg-emerald-500" : "bg-zinc-500"}`}
                  style={{ width: `${aPct}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className={`font-medium ${market.winnerIndex === 1 ? "text-emerald-400" : "text-[var(--text-secondary)]"}`}>
                  {market.optionB} {market.winnerIndex === 1 && <span>✓</span>}
                </span>
                <span className={`text-xs ${market.winnerIndex === 1 ? "text-emerald-400" : "text-[var(--text-muted)]"}`}>
                  {bPct}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${market.winnerIndex === 1 ? "bg-emerald-500" : "bg-zinc-500"}`}
                  style={{ width: `${bPct}%` }}
                />
              </div>
            </div>
          </div>
        );
      })() : (
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            disabled={!canVote || voting !== null}
            onClick={(e) => handleVote(0, e)}
            className={`flex-1 text-center text-sm font-medium rounded-xl py-2.5 border transition-colors ${optionClasses(0)}`}
          >
            {voting === 0 ? (
              <span className="flex items-center justify-center gap-1.5">
                <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                Encrypting…
              </span>
            ) : (
              market.optionA
            )}
          </button>
          <div className="flex items-center text-[var(--text-muted)] text-xs font-bold">vs</div>
          <button
            type="button"
            disabled={!canVote || voting !== null}
            onClick={(e) => handleVote(1, e)}
            className={`flex-1 text-center text-sm font-medium rounded-xl py-2.5 border transition-colors ${optionClasses(1)}`}
          >
            {voting === 1 ? (
              <span className="flex items-center justify-center gap-1.5">
                <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                Encrypting…
              </span>
            ) : (
              market.optionB
            )}
          </button>
        </div>
      )}

      {/* Voted badge */}
      {hasVoted && isVotingOpen && (
        <div className="flex items-center gap-1.5 mb-3 text-xs text-violet-400">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          Encrypted vote submitted
        </div>
      )}

      {/* Vote error */}
      {error && (
        <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1.5 truncate">
          {error}
        </div>
      )}

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
