import { useState, useEffect, useRef } from "react";
import { Contract, JsonRpcSigner, ethers, BrowserProvider, JsonRpcProvider } from "ethers";
import type { Eip1193Provider } from "ethers";
import { OpinionMarketABI } from "../contracts";
import { displayState, STATE_COLORS, STATE_ICONS, isVotingOpen as checkVotingOpen, useMarketDetail } from "../hooks/useMarkets";
import { encryptVote, publicDecryptHandles } from "../fhe";
import { useFheLoading, fheLoadingLabel } from "../hooks/useFheLoading";
import { parseContractError } from "../utils/parseContractError";
import { ActivityFeed } from "./ActivityFeed";

type AnyProvider = BrowserProvider | JsonRpcProvider;

interface Props {
  address: string;
  provider: AnyProvider | null;
  rawProvider: Eip1193Provider | null;
  signer: JsonRpcSigner | null;
  userAddress: string;
  isOwner: boolean;
  onBack: () => void;
  onConnectWallet: () => void;
}

function formatCountdown(targetTs: number): string {
  const diff = targetTs - Date.now() / 1000;
  if (diff <= 0) return "Ended";
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = Math.floor(diff % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export function MarketDetail({ address, provider, rawProvider, signer, userAddress, isOwner, onBack, onConnectWallet }: Props) {
  const { market, hasVoted, loading, refetch } = useMarketDetail(provider, address);
  const fheState = useFheLoading();
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showVoteConfirm, setShowVoteConfirm] = useState(false);
  const [voting, setVoting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [expiring, setExpiring] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const claimInFlightRef = useRef(false);
  const [claimPrepared, setClaimPrepared] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState("");
  const [resolveStep, setResolveStep] = useState("");
  const [claimStep, setClaimStep] = useState("");
  const [notEligible, setNotEligible] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Cleanup copied timeout on unmount
  useEffect(() => {
    return () => { clearTimeout(copiedTimeoutRef.current); };
  }, []);

  // Dynamic page title
  useEffect(() => {
    if (market) {
      document.title = `${market.question} — neoma`;
    }
    return () => { document.title = "Neoma — Encrypted Opinion Markets"; };
  }, [market]);

  // Auto-dismiss error after 15 seconds
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(""), 15_000);
    return () => clearTimeout(id);
  }, [error]);

  // Refetch on user change
  useEffect(() => {
    if (userAddress) refetch(userAddress);
  }, [userAddress, refetch]);

  // Live countdown
  useEffect(() => {
    if (!market || market.state !== 0) return;
    const id = setInterval(() => setCountdown(formatCountdown(market.endTime)), 1000);
    return () => clearInterval(id);
  }, [market]);

  // Check claim status for resolved markets (only when key inputs change)
  const claimCheckKeyRef = useRef("");
  useEffect(() => {
    if (!provider || !market || market.state !== 2 || !userAddress) return;
    const key = `${address}-${userAddress}-${market.state}`;
    if (claimCheckKeyRef.current === key) return; // Already checked
    claimCheckKeyRef.current = key;
    const check = async () => {
      try {
        const m = new Contract(address, OpinionMarketABI, provider);
        const [prepared, claimed] = await Promise.all([
          m.isClaimPrepared(userAddress),
          m.hasClaimed(userAddress),
        ]);
        setClaimPrepared(prepared);
        setHasClaimed(claimed);
      } catch { /* silent */ }
    };
    check();
  }, [provider, market, userAddress, address]);

  async function handleClaim() {
    if (!signer || !rawProvider) return;
    if (claimInFlightRef.current) return; // Guard against double-click
    claimInFlightRef.current = true;
    setClaiming(true);
    setError("");
    try {
      const contract = new Contract(address, OpinionMarketABI, signer);

      // Step 1: Prepare claim on-chain if needed
      if (!claimPrepared) {
        setClaimStep("Preparing claim...");
        const prepareTx = await contract.prepareClaim();
        setTxHash(prepareTx.hash);
        await prepareTx.wait();
        setClaimPrepared(true);
      }

      // Step 2: Fetch eligibility handle
      setClaimStep("Fetching eligibility proof...");
      const handle: string = await contract.getClaimEligibilityHandle(userAddress);

      // Step 3: Public decrypt via Zama Relayer
      setClaimStep("Requesting KMS decryption...");
      const { abiEncodedClearValues, decryptionProof } = await publicDecryptHandles(
        rawProvider,
        [handle],
      );

      // Step 4: Execute claim on-chain
      setClaimStep("Executing claim...");
      const executeTx = await contract.executeClaim(userAddress, abiEncodedClearValues, decryptionProof);
      setTxHash(executeTx.hash);
      await executeTx.wait();

      setHasClaimed(true);
      await refetch(userAddress);
    } catch (err: unknown) {
      const msg = parseContractError(err);
      if (msg.includes("NotEligible")) {
        setNotEligible(true);
        setError("You are not eligible — you voted for a losing option");
      } else {
        setError(msg);
      }
    } finally {
      setClaiming(false);
      setClaimStep("");
      claimInFlightRef.current = false;
    }
  }

  async function handleVote() {
    if (!signer || !rawProvider || selectedOption === null || !market) return;
    setVoting(true);
    setError("");
    setTxHash("");
    try {
      const contract = new Contract(address, OpinionMarketABI, signer);
      const { handles, inputProof } = await encryptVote(
        rawProvider,
        address,
        userAddress,
        selectedOption,
      );
      const tx = await contract.vote(handles[0], inputProof, {
        value: market.stakeAmount,
      });
      setTxHash(tx.hash);
      await tx.wait();
      await refetch(userAddress);
    } catch (err: unknown) {
      setError(parseContractError(err));
    } finally {
      setVoting(false);
    }
  }

  async function handleResolve() {
    if (!signer || !rawProvider) return;
    setResolving(true);
    setError("");
    try {
      const contract = new Contract(address, OpinionMarketABI, signer);

      // Pre-check on-chain state to avoid stale-UI reverts
      const currentState = Number(await contract.state());
      if (currentState === 1) {
        // Already in Resolving — skip resolveMarket(), go straight to finalize
        setResolving(false);
        await refetch(userAddress);
        handleFinalize();
        return;
      }
      if (currentState !== 0) {
        // Market moved past Active — just refresh UI
        await refetch(userAddress);
        setError("Market state has changed — UI refreshed.");
        return;
      }

      // Step 1: Resolve market (mark counters for decryption)
      setResolveStep("Marking counters for decryption...");
      const tx = await contract.resolveMarket();
      setTxHash(tx.hash);
      await tx.wait();

      // Step 2: Fetch encrypted handles (variable-length array)
      setResolveStep("Fetching encrypted handles...");
      let handles: string[];
      try {
        handles = await contract.getResolutionHandles();
      } catch {
        throw new Error("Failed to fetch handles — contract may need redeployment");
      }

      // Step 3: Public decrypt via Zama Relayer
      setResolveStep("Requesting KMS decryption...");
      let abiEncodedClearValues: string, decryptionProof: string;
      try {
        ({ abiEncodedClearValues, decryptionProof } = await publicDecryptHandles(
          rawProvider,
          handles,
        ));
      } catch {
        throw new Error("KMS decryption failed — the proof may not be ready yet, try again in a few minutes");
      }

      // Step 4: Finalize resolution on-chain
      setResolveStep("Finalizing resolution...");
      const finalizeTx = await contract.finalizeResolution(abiEncodedClearValues, decryptionProof);
      setTxHash(finalizeTx.hash);
      await finalizeTx.wait();

      await refetch(userAddress);
    } catch (err: unknown) {
      setError(parseContractError(err));
      // Auto-refresh to sync UI with on-chain state after a revert
      await refetch(userAddress);
    } finally {
      setResolving(false);
      setResolveStep("");
    }
  }

  async function handleFinalize() {
    if (!signer || !rawProvider) return;
    setResolving(true);
    setError("");
    try {
      const contract = new Contract(address, OpinionMarketABI, signer);

      // Step 1: Fetch encrypted handles (variable-length array)
      setResolveStep("Fetching encrypted handles...");
      let handles: string[];
      try {
        handles = await contract.getResolutionHandles();
      } catch {
        throw new Error("Failed to fetch handles — contract may need redeployment");
      }

      // Step 2: Public decrypt via Zama Relayer
      setResolveStep("Requesting KMS decryption...");
      let abiEncodedClearValues: string, decryptionProof: string;
      try {
        ({ abiEncodedClearValues, decryptionProof } = await publicDecryptHandles(
          rawProvider,
          handles,
        ));
      } catch {
        throw new Error("KMS decryption failed — the proof may not be ready yet, try again in a few minutes");
      }

      // Step 3: Finalize resolution on-chain
      setResolveStep("Finalizing resolution...");
      const finalizeTx = await contract.finalizeResolution(abiEncodedClearValues, decryptionProof);
      setTxHash(finalizeTx.hash);
      await finalizeTx.wait();

      await refetch(userAddress);
    } catch (err: unknown) {
      setError(parseContractError(err));
      await refetch(userAddress);
    } finally {
      setResolving(false);
      setResolveStep("");
    }
  }

  async function handleExpire() {
    if (!signer) return;
    setExpiring(true);
    setError("");
    try {
      const contract = new Contract(address, OpinionMarketABI, signer);
      const tx = await contract.expireMarket();
      setTxHash(tx.hash);
      await tx.wait();
      await refetch(userAddress);
    } catch (err: unknown) {
      setError(parseContractError(err));
    } finally {
      setExpiring(false);
    }
  }

  async function handleRefund() {
    if (!signer) return;
    setRefunding(true);
    setError("");
    try {
      const contract = new Contract(address, OpinionMarketABI, signer);
      const tx = await contract.claimRefund();
      setTxHash(tx.hash);
      await tx.wait();
      await refetch(userAddress);
    } catch (err: unknown) {
      setError(parseContractError(err));
    } finally {
      setRefunding(false);
    }
  }

  if (loading || !market) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="neoma-skeleton h-5 w-32 mb-6" />
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-[var(--border)]">
            <div className="flex gap-2 mb-3">
              <div className="neoma-skeleton h-5 w-16 rounded-full" />
              <div className="neoma-skeleton h-5 w-20" />
            </div>
            <div className="neoma-skeleton h-8 w-4/5 mb-2" />
            <div className="neoma-skeleton h-4 w-2/3" />
          </div>
          <div className="grid grid-cols-3 divide-x divide-[var(--border)] border-b border-[var(--border)]">
            {[0, 1, 2].map((i) => (
              <div key={i} className="p-4 flex flex-col items-center gap-1">
                <div className="neoma-skeleton h-6 w-12" />
                <div className="neoma-skeleton h-3 w-16" />
              </div>
            ))}
          </div>
          <div className="p-6 space-y-3">
            <div className="neoma-skeleton h-12 rounded-xl" />
            <div className="neoma-skeleton h-12 rounded-xl" />
            <div className="neoma-skeleton h-12 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const now = Date.now() / 1000;
  const isVotingOpen = checkVotingOpen(market);
  const canResolve = isOwner && market.state === 0 && now > market.endTime && market.totalVoters > 0;
  const canExpire = (market.state === 0 || market.state === 1) && now >= market.resolutionDeadline;
  const canRefund = market.state === 4;
  const pool = ethers.formatEther(market.totalPool);
  const stake = ethers.formatEther(market.stakeAmount);
  const dState = displayState(market);
  const isTie = market.winnerIndices.length > 1;
  const totalVotes = market.optionVoteCounts.reduce((a, b) => a + b, 0);

  // Determine option grid layout
  const optCount = market.options.length;
  const gridCols = optCount <= 2 ? "grid-cols-2" : optCount <= 4 ? "grid-cols-2" : "grid-cols-3";

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back + Share buttons */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
        >
          ← Back to Markets
        </button>
        <button
          onClick={() => {
            // /share?market= path provides OG previews for link unfurling
            const url = `${window.location.origin}/share?market=${address}`;
            navigator.clipboard.writeText(url).then(() => {
              setCopied(true);
              clearTimeout(copiedTimeoutRef.current);
              copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
            });
          }}
          className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-violet-400 border border-[var(--border)] hover:border-violet-500/40 rounded-lg px-3 py-1.5 transition cursor-pointer"
          title="Copy shareable link"
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" /></svg>
              Share
            </>
          )}
        </button>
      </div>

      {/* Card */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden fade-up">
        {/* Header */}
        <div className="p-6 border-b border-[var(--border)] neoma-glass">
          <div className="flex items-center gap-3 mb-3">
            <span className={`text-xs font-medium border rounded-full px-2.5 py-0.5 ${STATE_COLORS[dState] ?? ""}`}>
              {isVotingOpen && <span className="neoma-pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 relative" style={{ top: '-1px' }} />}
              <span aria-hidden="true" className="mr-1">{STATE_ICONS[dState] ?? ""}</span>{dState}
            </span>
            {optCount > 2 && (
              <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-secondary)] border border-[var(--border)] rounded-full px-2 py-0.5">
                {optCount} options
              </span>
            )}
            {market.state === 0 && isVotingOpen && (
              <span className="text-xs text-[var(--text-muted)]">
                {countdown || formatCountdown(market.endTime)}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            {market.question}
          </h1>
          <div className="flex items-center gap-2">
            <a
              href={`https://sepolia.etherscan.io/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--text-muted)] font-mono truncate hover:text-violet-400 transition"
            >
              {address}
            </a>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(address).catch(() => {/* no clipboard API */});
                setCopied(true);
                clearTimeout(copiedTimeoutRef.current);
                copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
              }}
              className="shrink-0 text-[var(--text-muted)] hover:text-violet-400 transition cursor-pointer"
              title="Copy address"
            >
              {copied ? (
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 divide-x divide-[var(--border)] border-b border-[var(--border)]">
          <div className="p-4 text-center">
            <div className="text-lg font-bold text-[var(--text-primary)] neoma-stat-glow">{pool}</div>
            <div className="text-xs text-[var(--text-muted)]">ETH Pool</div>
          </div>
          <div className="p-4 text-center">
            <div className="text-lg font-bold text-[var(--text-primary)] neoma-stat-glow">{market.totalVoters}</div>
            <div className="text-xs text-[var(--text-muted)]">Voters</div>
          </div>
          <div className="p-4 text-center">
            <div className="text-lg font-bold text-[var(--text-primary)] neoma-stat-glow">{stake}</div>
            <div className="text-xs text-[var(--text-muted)]">ETH / vote</div>
          </div>
        </div>

        {/* Voting / Resolution area */}
        <div className="p-6">
          {/* Resolved — show winners + percentages + claim */}
          {market.state === 2 && (
            <div className="py-4">
              {/* Winner header */}
              <div className="text-center mb-4">
                {isTie ? (
                  <>
                    <div className="text-sm text-amber-400 mb-2">Tie</div>
                    <div className="text-2xl font-bold text-amber-400 mb-1">
                      {market.winnerIndices.map((i) => market.options[i]).join(" = ")}
                    </div>
                    <div className="text-sm text-[var(--text-muted)]">
                      {market.totalWinnerVoters} winning voters — {market.totalWinnerVoters > 0 ? ethers.formatEther(market.totalPool / BigInt(market.totalWinnerVoters)) : "0"} ETH each
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm text-[var(--text-muted)] mb-2">Winner</div>
                    <div className="text-3xl font-bold text-emerald-400 mb-1">
                      {market.options[market.winnerIndices[0]] ?? "Unknown"}
                    </div>
                    <div className="text-sm text-[var(--text-muted)]">
                      {market.totalWinnerVoters} winning votes — {market.totalWinnerVoters > 0 ? ethers.formatEther(market.totalPool / BigInt(market.totalWinnerVoters)) : "0"} ETH each
                    </div>
                  </>
                )}
              </div>

              {/* Percentage bars for ALL options */}
              {totalVotes > 0 && (
                <div className="space-y-3 mb-4 px-1">
                  {market.options.map((opt, i) => {
                    const count = market.optionVoteCounts[i] ?? 0;
                    const pct = Math.round((count / totalVotes) * 100);
                    const isWinner = market.winnerIndices.includes(i);
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className={`font-medium ${isWinner ? "text-emerald-400" : "text-[var(--text-secondary)]"}`}>
                            {opt} {isWinner && <span>✓</span>}
                          </span>
                          <span className={`text-xs ${isWinner ? "text-emerald-400" : "text-[var(--text-muted)]"}`}>
                            {pct}% ({count} votes)
                          </span>
                        </div>
                        <div className="h-3 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                          <div
                            className={`h-full rounded-full neoma-bar-fill ${isWinner ? "bg-emerald-500" : "bg-zinc-500"}`}
                            style={{ '--bar-width': `${pct / 100}` } as React.CSSProperties}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Claim section for voters */}
              {hasVoted && !hasClaimed && !notEligible && signer && (
                <div className="mt-4 border-t border-[var(--border)] pt-4">
                  <button
                    onClick={handleClaim}
                    disabled={claiming}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/30 text-white rounded-xl py-3.5 text-sm font-semibold transition cursor-pointer disabled:cursor-not-allowed"
                  >
                    {claiming ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {claimStep || "Processing claim..."}
                      </span>
                    ) : claimPrepared ? (
                      "Execute Claim"
                    ) : (
                      "Claim Reward"
                    )}
                  </button>
                  {!claiming && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-[var(--text-muted)]">
                      <svg className="w-3.5 h-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                      </svg>
                      Eligibility is verified via FHE decryption proof
                    </div>
                  )}
                </div>
              )}

              {hasClaimed && (
                <div className="mt-4 border-t border-[var(--border)] pt-4 text-center">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="text-sm text-emerald-400 font-medium">Reward Claimed</div>
                </div>
              )}

              {notEligible && !hasClaimed && (
                <div className="mt-4 border-t border-[var(--border)] pt-4 text-center">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-zinc-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div className="text-sm text-zinc-400 font-medium">Not Eligible</div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">You voted for a losing option</div>
                </div>
              )}
            </div>
          )}

          {/* Active — voting UI */}
          {isVotingOpen && !hasVoted && (
            <>
              <div className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                Cast your encrypted vote
              </div>
              <div className={`grid ${gridCols} gap-3 mb-4`}>
                {market.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (!signer) { onConnectWallet(); return; }
                      setSelectedOption(i); setShowVoteConfirm(false);
                    }}
                    className={`py-4 rounded-xl text-center font-semibold border-2 transition cursor-pointer ${
                      optCount <= 4 ? "text-lg" : "text-sm px-2"
                    } ${
                      selectedOption === i
                        ? "border-violet-500 bg-violet-500/20 text-violet-300"
                        : "border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-violet-500/40"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {!signer ? (
                <button
                  onClick={onConnectWallet}
                  className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl py-3.5 text-sm font-semibold transition shadow-lg shadow-violet-500/20 cursor-pointer flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
                  </svg>
                  Connect Wallet to Vote
                </button>
              ) : !showVoteConfirm ? (
                <button
                  onClick={() => setShowVoteConfirm(true)}
                  disabled={selectedOption === null || voting}
                  className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:from-violet-600/30 disabled:to-purple-600/30 disabled:text-violet-300/50 text-white rounded-xl py-3.5 text-sm font-semibold transition shadow-lg shadow-violet-500/20 cursor-pointer disabled:cursor-not-allowed disabled:shadow-none"
                >
                  Vote — Stake {stake} ETH
                </button>
              ) : null}

              {/* Confirmation panel */}
              {showVoteConfirm && selectedOption !== null && signer && !voting && (
                <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-4 fade-up">
                  <div className="text-center mb-3">
                    <div className="text-xs text-[var(--text-muted)] mb-1">You are voting for</div>
                    <div className="text-lg font-bold text-violet-300">"{market.options[selectedOption]}"</div>
                    <div className="text-sm text-[var(--text-secondary)] mt-1">Stake: <span className="font-semibold text-violet-400">{stake} ETH</span> <span className="text-[var(--text-muted)]">+ gas</span></div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowVoteConfirm(false)}
                      className="flex-1 border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] rounded-xl py-3 text-sm font-medium transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleVote}
                      className="flex-1 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl py-3 text-sm font-semibold transition shadow-lg shadow-violet-500/20 cursor-pointer"
                    >
                      Confirm & Submit
                    </button>
                  </div>
                </div>
              )}

              {/* Voting in progress */}
              {voting && (
                <div className="w-full bg-violet-600/20 border border-violet-500/30 rounded-xl py-3.5 flex items-center justify-center gap-2 text-sm font-semibold text-violet-300">
                  <span className="w-4 h-4 border-2 border-violet-300/30 border-t-violet-300 rounded-full animate-spin" />
                  {fheLoadingLabel(fheState)}
                </div>
              )}
              <div className="flex items-center gap-2 mt-3 text-xs text-[var(--text-muted)]">
                <svg className="w-3.5 h-3.5 text-violet-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                Your vote is encrypted with FHE — no one can see your choice
              </div>
            </>
          )}

          {/* Already voted */}
          {hasVoted && market.state === 0 && (
            <div className="text-center py-4">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-sm font-medium text-emerald-400">Vote submitted</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">Your encrypted vote is stored on-chain</div>
            </div>
          )}

          {/* Can resolve */}
          {canResolve && (
            <button
              onClick={handleResolve}
              disabled={resolving}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/30 text-black rounded-xl py-3.5 text-sm font-semibold transition mt-4 cursor-pointer disabled:cursor-not-allowed"
            >
              {resolving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  {resolveStep || "Resolving..."}
                </span>
              ) : (
                "Resolve Market"
              )}
            </button>
          )}

          {/* Can expire */}
          {canExpire && (
            <button
              onClick={handleExpire}
              disabled={expiring}
              className="w-full bg-zinc-600 hover:bg-zinc-500 disabled:bg-zinc-600/30 text-white rounded-xl py-3.5 text-sm font-semibold transition mt-4 cursor-pointer disabled:cursor-not-allowed"
            >
              {expiring ? "Expiring..." : "Expire Market & Enable Refunds"}
            </button>
          )}

          {/* Can refund */}
          {canRefund && hasVoted && (
            <button
              onClick={handleRefund}
              disabled={refunding}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/30 text-white rounded-xl py-3.5 text-sm font-semibold transition mt-4 cursor-pointer disabled:cursor-not-allowed"
            >
              {refunding ? "Claiming..." : `Claim Refund — ${stake} ETH`}
            </button>
          )}

          {/* Resolving state — finalize button */}
          {market.state === 1 && (
            <div className="text-center py-4">
              {!resolving ? (
                <>
                  <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div className="text-sm font-medium text-amber-400 mb-1">Counters Ready for Decryption</div>
                  <div className="text-xs text-[var(--text-muted)] mb-4">
                    All encrypted vote counters have been marked for decryption. Click below to decrypt via the Zama KMS and finalize on-chain.
                  </div>
                  {signer && (
                    <button
                      onClick={handleFinalize}
                      className="bg-amber-500 hover:bg-amber-400 text-black rounded-xl px-6 py-3 text-sm font-semibold transition cursor-pointer"
                    >
                      Finalize Resolution
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="w-8 h-8 mx-auto mb-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                  <div className="text-sm font-medium text-amber-400">{resolveStep || "Finalizing..."}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">
                    Please wait and confirm any wallet prompts.
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Error / Tx feedback */}
        {error && (
          <div className="mx-6 mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
            <span>{error}</span>
            <button
              onClick={() => setError("")}
              className="shrink-0 text-red-400/60 hover:text-red-400 transition cursor-pointer text-lg leading-none"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}
        {txHash && (
          <div className="mx-6 mb-4 text-xs text-[var(--text-muted)] bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2">
            Tx:{" "}
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-400 hover:underline"
            >
              {txHash.slice(0, 10)}...{txHash.slice(-8)}
            </a>
          </div>
        )}

        {/* On-chain Activity */}
        <div className="px-6 pb-2">
          <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">On-chain Activity</h4>
          <ActivityFeed
            provider={provider}
            marketAddress={address}
            limit={30}
          />
        </div>

        {/* Timeline */}
        <div className="px-6 pb-6">
          <div className="text-xs text-[var(--text-muted)] space-y-1 border-t border-[var(--border)] pt-4">
            <div className="flex justify-between">
              <span>Start</span>
              <span>{new Date(market.startTime * 1000).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>End</span>
              <span>{new Date(market.endTime * 1000).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Resolution Deadline</span>
              <span>{new Date(market.resolutionDeadline * 1000).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
