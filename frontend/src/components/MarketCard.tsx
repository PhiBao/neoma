import { useState, useEffect, memo } from "react";
import type { MarketInfo } from "../hooks/useMarkets";
import { displayState, STATE_COLORS, isVotingOpen as checkVotingOpen } from "../hooks/useMarkets";
import { ethers, Contract } from "ethers";
import type { JsonRpcSigner, Eip1193Provider } from "ethers";
import { OpinionMarketABI } from "../contracts";
import { encryptVote } from "../fhe";
import { useFheLoading, fheLoadingLabel } from "../hooks/useFheLoading";
import { parseContractError } from "../utils/parseContractError";

interface Props {
  market: MarketInfo;
  hasVoted: boolean;
  signer: JsonRpcSigner | null;
  rawProvider: Eip1193Provider | null;
  userAddress: string;
  onNavigate: () => void;
  onVoted: () => void;
  onConnectWallet: () => void;
}

function formatTimeRemaining(endTime: number): string {
  const now = Date.now() / 1000;
  const diff = endTime - now;
  if (diff <= 0) return "Ended";
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const MarketCard = memo(function MarketCard({ market, hasVoted, signer, rawProvider, userAddress, onNavigate, onVoted, onConnectWallet }: Props) {
  const fheState = useFheLoading();
  const stake = ethers.formatEther(market.stakeAmount);
  const pool = ethers.formatEther(market.totalPool);
  const isActive = market.state === 0;
  const isVotingOpen = checkVotingOpen(market);
  const canVote = isVotingOpen && !hasVoted && !!signer && !!rawProvider;
  const dState = displayState(market);
  const isBinary = market.options.length === 2;
  const isTie = market.winnerIndices.length > 1;

  const [voting, setVoting] = useState<number | null>(null);
  const [confirmChoice, setConfirmChoice] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState(() => formatTimeRemaining(market.endTime));

  // Live countdown — 1s interval when <1h remaining for accuracy
  useEffect(() => {
    if (market.state !== 0) return;
    const remaining = market.endTime - Date.now() / 1000;
    const interval = remaining > 0 && remaining < 3600 ? 1_000 : 10_000;
    const id = setInterval(() => setTimeLeft(formatTimeRemaining(market.endTime)), interval);
    return () => clearInterval(id);
  }, [market.endTime, market.state]);

  const isWalletConnected = !!signer && !!rawProvider;

  async function handleVote(choice: number, e: React.MouseEvent) {
    e.stopPropagation();
    // Prompt wallet connect if not connected
    if (!isWalletConnected) {
      onConnectWallet();
      return;
    }
    if (!canVote) return;

    // Show confirmation first
    if (confirmChoice === null || confirmChoice !== choice) {
      setConfirmChoice(choice);
      return;
    }

    // Confirmed — proceed with vote
    setConfirmChoice(null);
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
      setError(parseContractError(err));
    } finally {
      setVoting(null);
    }
  }

  const optionClasses = () => {
    // Show interactive style when wallet is not connected (will trigger connect on click)
    if (canVote || (isVotingOpen && !hasVoted && !isWalletConnected)) return "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:border-violet-500/60 hover:bg-violet-500/10 hover:text-violet-300 cursor-pointer";
    if (hasVoted && isVotingOpen) return "bg-violet-500/10 border-violet-500/30 text-violet-300/70";
    return "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)]";
  };

  // Resolved percentage bars
  const renderResolvedBars = () => {
    const total = market.optionVoteCounts.reduce((a, b) => a + b, 0);
    if (total === 0) return null;

    // For cards, show at most 3 options + "more" indicator
    const maxShow = 3;
    const showOpts = market.options.slice(0, maxShow);

    return (
      <div className="space-y-2 mb-4">
        {showOpts.map((opt, i) => {
          const count = market.optionVoteCounts[i] ?? 0;
          const pct = Math.round((count / total) * 100);
          const isWinner = market.winnerIndices.includes(i);
          return (
            <div key={i}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className={`font-medium truncate mr-2 ${isWinner ? "text-emerald-400" : "text-[var(--text-secondary)]"}`}>
                  {opt} {isWinner && <span>✓</span>}
                </span>
                <span className={`text-xs shrink-0 ${isWinner ? "text-emerald-400" : "text-[var(--text-muted)]"}`}>
                  {pct}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                <div
                  className={`h-full rounded-full bar-fill ${isWinner ? "bg-emerald-500" : "bg-zinc-500"}`}
                  style={{ '--bar-width': `${pct / 100}` } as React.CSSProperties}
                />
              </div>
            </div>
          );
        })}
        {market.options.length > maxShow && (
          <div className="text-xs text-[var(--text-muted)] text-center">
            +{market.options.length - maxShow} more options — click for details
          </div>
        )}
        {isTie && (
          <div className="text-xs text-amber-400 text-center font-medium mt-1">
            Tie — {market.winnerIndices.length} winners
          </div>
        )}
      </div>
    );
  };

  // Active voting pills — binary only in card
  const renderBinaryVoting = () => (
    <div className="mb-4">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={voting !== null}
          onClick={(e) => handleVote(0, e)}
          className={`flex-1 text-center text-sm font-medium rounded-xl py-2.5 border transition-colors ${
            confirmChoice === 0
              ? "border-violet-500 bg-violet-500/20 text-violet-300"
              : optionClasses()
          }`}
        >
          {voting === 0 ? (
            <span className="flex items-center justify-center gap-1.5">
              <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              {fheLoadingLabel(fheState)}
            </span>
          ) : (
            market.options[0]
          )}
        </button>
        <div className="flex items-center text-[var(--text-muted)] text-xs font-bold">vs</div>
        <button
          type="button"
          disabled={voting !== null}
          onClick={(e) => handleVote(1, e)}
          className={`flex-1 text-center text-sm font-medium rounded-xl py-2.5 border transition-colors ${
            confirmChoice === 1
              ? "border-violet-500 bg-violet-500/20 text-violet-300"
              : optionClasses()
          }`}
        >
          {voting === 1 ? (
            <span className="flex items-center justify-center gap-1.5">
              <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              {fheLoadingLabel(fheState)}
            </span>
          ) : (
            market.options[1]
          )}
        </button>
      </div>
      {confirmChoice !== null && voting === null && (
        <div
          className="mt-2 bg-violet-500/10 border border-violet-500/30 rounded-xl p-3 fade-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center mb-2">
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Confirm vote</div>
            <div className="text-sm font-bold text-violet-300 mt-0.5">"{market.options[confirmChoice]}"</div>
            <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">Stake: <span className="font-semibold text-violet-400">{stake} ETH</span></div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmChoice(null); }}
              className="flex-1 text-xs border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] rounded-lg py-1.5 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={(e) => handleVote(confirmChoice!, e)}
              className="flex-1 text-xs bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold rounded-lg py-1.5 transition shadow-md shadow-violet-500/20 cursor-pointer"
            >
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // Multi-option summary for cards (no direct voting)
  const renderMultiOptionSummary = () => (
    <div className="mb-4">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {market.options.slice(0, 4).map((opt, i) => (
          <span
            key={i}
            className="text-xs bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] rounded-lg px-2 py-1 truncate max-w-[45%]"
          >
            {opt}
          </span>
        ))}
        {market.options.length > 4 && (
          <span className="text-xs text-[var(--text-muted)] flex items-center px-1">
            +{market.options.length - 4} more
          </span>
        )}
      </div>
      {isVotingOpen && !hasVoted && (
        <div className="text-xs text-violet-400 font-medium">
          Click to vote →
        </div>
      )}
    </div>
  );

  return (
    <div
      onClick={onNavigate}
      className="group bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 cursor-pointer hover:border-violet-500/40 hover:bg-[var(--bg-card-hover)] transition-all duration-200 card-glow"
    >
      {/* Top row: state badge + time */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium border rounded-full px-2.5 py-0.5 ${STATE_COLORS[dState] ?? STATE_COLORS.Cancelled}`}>
            {isActive && isVotingOpen && <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 relative" style={{ top: '-1px' }} />}
            {dState}
          </span>
          {!isBinary && (
            <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-secondary)] border border-[var(--border)] rounded-full px-2 py-0.5">
              {market.options.length} options
            </span>
          )}
        </div>
        {isActive && isVotingOpen && (
          <span className="text-xs text-[var(--text-muted)]">
            {timeLeft} left
          </span>
        )}
      </div>

      {/* Question */}
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4 group-hover:text-violet-300 transition-colors leading-snug">
        {market.question}
      </h3>

      {/* Option display */}
      {market.state === 2 && market.totalVoters > 0
        ? renderResolvedBars()
        : isBinary
          ? renderBinaryVoting()
          : renderMultiOptionSummary()
      }

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
            <span className="text-[var(--text-secondary)] font-medium stat-glow">{market.totalVoters}</span> voters
          </span>
          <span>
            <span className="text-[var(--text-secondary)] font-medium stat-glow">{pool}</span> ETH pool
          </span>
        </div>
        <span>{stake} ETH / vote</span>
      </div>
    </div>
  );
});
