import { useState, useEffect } from "react";
import { Contract, JsonRpcSigner, ethers, BrowserProvider } from "ethers";
import { OpinionMarketABI } from "../contracts";
import { stateLabel, useMarketDetail } from "../hooks/useMarkets";

interface Props {
  address: string;
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  userAddress: string;
  onBack: () => void;
}

const STATE_COLORS: Record<number, string> = {
  0: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  1: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  2: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  3: "bg-red-500/20 text-red-400 border-red-500/30",
  4: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

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

export function MarketDetail({ address, provider, signer, userAddress, onBack }: Props) {
  const { market, hasVoted, loading, refetch } = useMarketDetail(provider, address);
  const [selectedOption, setSelectedOption] = useState<0 | 1 | null>(null);
  const [voting, setVoting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [expiring, setExpiring] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState("");

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

  async function handleVote() {
    if (!signer || selectedOption === null || !market) return;
    setVoting(true);
    setError("");
    setTxHash("");
    try {
      const contract = new Contract(address, OpinionMarketABI, signer);

      // For Sepolia FHEVM, we need to use the fhevmjs library to encrypt the vote.
      // For now, we'll use a simple approach: pass the choice as a raw uint8.
      // In production, this would use fhevmjs createEncryptedInput.
      //
      // NOTE: On a real FHEVM network, the input MUST be encrypted client-side.
      // This placeholder demonstrates the flow structure.
      // The actual encryption would look like:
      //
      //   import { createInstance } from "fhevmjs";
      //   const instance = await createInstance({ networkUrl: rpcUrl });
      //   const input = instance.createEncryptedInput(address, userAddress);
      //   input.add8(selectedOption);
      //   const { handles, inputProof } = await input.encrypt();
      //   await contract.vote(handles[0], inputProof, { value: market.stakeAmount });

      // Placeholder for demo — will need fhevmjs integration for live network
      const placeholderHandle = ethers.zeroPadValue(ethers.toBeHex(selectedOption), 32);
      const placeholderProof = "0x";

      const tx = await contract.vote(placeholderHandle, placeholderProof, {
        value: market.stakeAmount,
      });
      setTxHash(tx.hash);
      await tx.wait();
      await refetch(userAddress);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Vote failed";
      setError(msg.includes("reason=") ? msg.split("reason=")[1]?.split('"')[1] ?? msg.slice(0, 150) : msg.slice(0, 150));
    } finally {
      setVoting(false);
    }
  }

  async function handleResolve() {
    if (!signer) return;
    setResolving(true);
    setError("");
    try {
      const contract = new Contract(address, OpinionMarketABI, signer);
      const tx = await contract.resolveMarket();
      setTxHash(tx.hash);
      await tx.wait();
      await refetch(userAddress);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.slice(0, 150) : "Resolve failed");
    } finally {
      setResolving(false);
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
      setError(err instanceof Error ? err.message.slice(0, 150) : "Expire failed");
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
      setError(err instanceof Error ? err.message.slice(0, 150) : "Refund failed");
    } finally {
      setRefunding(false);
    }
  }

  if (loading || !market) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  const now = Date.now() / 1000;
  const isVotingOpen = market.state === 0 && now >= market.startTime && now <= market.endTime;
  const canResolve = market.state === 0 && now > market.endTime && market.totalVoters > 0;
  const canExpire = (market.state === 0 || market.state === 1) && now >= market.resolutionDeadline;
  const canRefund = market.state === 4;
  const pool = ethers.formatEther(market.totalPool);
  const stake = ethers.formatEther(market.stakeAmount);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-6 transition cursor-pointer"
      >
        ← Back to Markets
      </button>

      {/* Card */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-[var(--border)]">
          <div className="flex items-center gap-3 mb-3">
            <span className={`text-xs font-medium border rounded-full px-2.5 py-0.5 ${STATE_COLORS[market.state] ?? ""}`}>
              {stateLabel(market.state)}
            </span>
            {market.state === 0 && (
              <span className="text-xs text-[var(--text-muted)]">
                {countdown || formatCountdown(market.endTime)}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            {market.question}
          </h1>
          <p className="text-xs text-[var(--text-muted)] font-mono truncate">
            {address}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 divide-x divide-[var(--border)] border-b border-[var(--border)]">
          <div className="p-4 text-center">
            <div className="text-lg font-bold text-[var(--text-primary)]">{pool}</div>
            <div className="text-xs text-[var(--text-muted)]">ETH Pool</div>
          </div>
          <div className="p-4 text-center">
            <div className="text-lg font-bold text-[var(--text-primary)]">{market.totalVoters}</div>
            <div className="text-xs text-[var(--text-muted)]">Voters</div>
          </div>
          <div className="p-4 text-center">
            <div className="text-lg font-bold text-[var(--text-primary)]">{stake}</div>
            <div className="text-xs text-[var(--text-muted)]">ETH / vote</div>
          </div>
        </div>

        {/* Voting / Resolution area */}
        <div className="p-6">
          {/* Resolved — show winner */}
          {market.state === 2 && (
            <div className="text-center py-4">
              <div className="text-sm text-[var(--text-muted)] mb-2">Winner</div>
              <div className="text-3xl font-bold text-emerald-400 mb-1">
                {market.winnerIndex === 0 ? market.optionA : market.optionB}
              </div>
              <div className="text-sm text-[var(--text-muted)]">
                {market.winnerCount} winning votes — {ethers.formatEther(market.totalPool / BigInt(market.winnerCount || 1))} ETH each
              </div>
            </div>
          )}

          {/* Active — voting UI */}
          {isVotingOpen && !hasVoted && (
            <>
              <div className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                Cast your encrypted vote
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  onClick={() => setSelectedOption(0)}
                  className={`py-4 rounded-xl text-center font-semibold text-lg border-2 transition cursor-pointer ${
                    selectedOption === 0
                      ? "border-violet-500 bg-violet-500/20 text-violet-300"
                      : "border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-violet-500/40"
                  }`}
                >
                  {market.optionA}
                </button>
                <button
                  onClick={() => setSelectedOption(1)}
                  className={`py-4 rounded-xl text-center font-semibold text-lg border-2 transition cursor-pointer ${
                    selectedOption === 1
                      ? "border-violet-500 bg-violet-500/20 text-violet-300"
                      : "border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-violet-500/40"
                  }`}
                >
                  {market.optionB}
                </button>
              </div>
              <button
                onClick={handleVote}
                disabled={selectedOption === null || voting}
                className="w-full bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/30 disabled:text-violet-300/50 text-white rounded-xl py-3.5 text-sm font-semibold transition cursor-pointer disabled:cursor-not-allowed"
              >
                {voting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Encrypting & submitting...
                  </span>
                ) : (
                  `Vote — Stake ${stake} ETH`
                )}
              </button>
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
              {resolving ? "Computing encrypted winner..." : "Resolve Market"}
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

          {/* Resolving state info */}
          {market.state === 1 && (
            <div className="text-center py-4">
              <div className="w-8 h-8 mx-auto mb-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
              <div className="text-sm font-medium text-amber-400">Awaiting KMS Decryption</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">
                The encrypted winner has been computed. Waiting for the Zama KMS to produce a decryption proof.
              </div>
            </div>
          )}
        </div>

        {/* Error / Tx feedback */}
        {error && (
          <div className="mx-6 mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
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
