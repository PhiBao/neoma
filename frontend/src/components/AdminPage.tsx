import { useState, useEffect, useCallback } from "react";
import { Contract, JsonRpcSigner, ethers } from "ethers";
import { MARKET_FACTORY_ADDRESS, MarketFactoryABI, OpinionMarketABI } from "../contracts";
import type { MarketInfo } from "../hooks/useMarkets";
import { stateLabel } from "../hooks/useMarkets";

interface Props {
  signer: JsonRpcSigner | null;
}

export function AdminPage({ signer }: Props) {
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [loadingMarkets, setLoadingMarkets] = useState(false);

  // Form state
  const [question, setQuestion] = useState("");
  const [optionA, setOptionA] = useState("");
  const [optionB, setOptionB] = useState("");
  const [stake, setStake] = useState("0.001");
  const [durationHours, setDurationHours] = useState("24");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load markets
  const fetchMarkets = useCallback(async () => {
    if (!signer || !MARKET_FACTORY_ADDRESS) return;
    setLoadingMarkets(true);
    try {
      const factory = new Contract(MARKET_FACTORY_ADDRESS, MarketFactoryABI, signer);
      const count = Number(await factory.marketCount());
      const list: MarketInfo[] = [];
      for (let i = 0; i < count; i++) {
        const addr = await factory.getMarket(i);
        const m = new Contract(addr, OpinionMarketABI, signer);
        const [q, oA, oB, sa, st, et, rd, s, tp, tv, wi, wc] = await Promise.all([
          m.question(), m.optionA(), m.optionB(), m.stakeAmount(),
          m.startTime(), m.endTime(), m.resolutionDeadline(), m.state(),
          m.totalPool(), m.totalVoters(), m.winnerIndex(), m.winnerCount(),
        ]);
        list.push({
          address: addr, question: q, optionA: oA, optionB: oB,
          stakeAmount: sa, startTime: Number(st), endTime: Number(et),
          resolutionDeadline: Number(rd), state: Number(s), totalPool: tp,
          totalVoters: Number(tv), winnerIndex: Number(wi), winnerCount: Number(wc),
        });
      }
      setMarkets(list.reverse());
    } catch {
      /* silent */
    } finally {
      setLoadingMarkets(false);
    }
  }, [signer]);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  async function handleCreate() {
    if (!signer || !MARKET_FACTORY_ADDRESS) return;
    if (!question.trim() || !optionA.trim() || !optionB.trim()) {
      setError("All fields are required");
      return;
    }
    setCreating(true);
    setError("");
    setSuccess("");
    try {
      const factory = new Contract(MARKET_FACTORY_ADDRESS, MarketFactoryABI, signer);
      const now = Math.floor(Date.now() / 1000);
      const stakeWei = ethers.parseEther(stake);
      const duration = parseInt(durationHours) * 3600;

      const tx = await factory.createMarket(
        question.trim(), optionA.trim(), optionB.trim(),
        stakeWei, now, now + duration,
      );
      await tx.wait();
      setSuccess(`Market created! Tx: ${tx.hash.slice(0, 14)}...`);
      setQuestion(""); setOptionA(""); setOptionB("");
      setStake("0.001"); setDurationHours("24");
      fetchMarkets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setError(msg.includes("NotOwner") ? "Only the factory owner can create markets" : msg.slice(0, 150));
    } finally {
      setCreating(false);
    }
  }

  // Resolve market (admin helper)
  async function handleResolve(addr: string) {
    if (!signer) return;
    try {
      const contract = new Contract(addr, OpinionMarketABI, signer);
      const tx = await contract.resolveMarket();
      await tx.wait();
      fetchMarkets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.slice(0, 120) : "Resolve failed");
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-1">Admin Panel</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Create and manage encrypted opinion markets
        </p>
      </div>

      {/* Create Market Form */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 mb-8">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Create New Market</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Question
            </label>
            <input
              type="text" value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Will ETH hit $10k in 2026?"
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-violet-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Option A
              </label>
              <input
                type="text" value={optionA}
                onChange={(e) => setOptionA(e.target.value)}
                placeholder="e.g. Yes"
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Option B
              </label>
              <input
                type="text" value={optionB}
                onChange={(e) => setOptionB(e.target.value)}
                placeholder="e.g. No"
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-violet-500/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Stake per Vote (ETH)
              </label>
              <input
                type="text" value={stake}
                onChange={(e) => setStake(e.target.value)}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Duration (hours)
              </label>
              <input
                type="number" value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-violet-500/50"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            {success}
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={creating}
          className="mt-4 w-full bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/50 text-white rounded-lg py-3 text-sm font-semibold transition cursor-pointer disabled:cursor-not-allowed"
        >
          {creating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Creating Market...
            </span>
          ) : (
            "Create Market"
          )}
        </button>
      </div>

      {/* Existing Markets Management */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">
            All Markets
            {markets.length > 0 && (
              <span className="ml-2 text-sm text-[var(--text-muted)] font-normal">({markets.length})</span>
            )}
          </h3>
          <button
            onClick={fetchMarkets}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-2.5 py-1 transition cursor-pointer"
          >
            ↻ Refresh
          </button>
        </div>

        {loadingMarkets && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          </div>
        )}

        {!loadingMarkets && markets.length === 0 && (
          <div className="text-center py-8 text-sm text-[var(--text-muted)]">
            No markets created yet
          </div>
        )}

        <div className="space-y-3">
          {markets.map((m) => {
            const now = Date.now() / 1000;
            const canResolve = m.state === 0 && now > m.endTime && m.totalVoters > 0;
            return (
              <div key={m.address} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-medium border rounded-full px-2 py-0.5 ${
                        m.state === 0 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                        : m.state === 2 ? "bg-violet-500/20 text-violet-400 border-violet-500/30"
                        : "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
                      }`}>
                        {stateLabel(m.state)}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {m.totalVoters} votes · {ethers.formatEther(m.totalPool)} ETH
                      </span>
                    </div>
                    <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {m.question}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-1">
                      {m.optionA} vs {m.optionB} · Ends {new Date(m.endTime * 1000).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {canResolve && (
                      <button
                        onClick={() => handleResolve(m.address)}
                        className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg px-3 py-1.5 hover:bg-amber-500/30 transition cursor-pointer"
                      >
                        Resolve
                      </button>
                    )}
                    <a
                      href={`https://sepolia.etherscan.io/address/${m.address}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-3 py-1.5 transition"
                    >
                      Etherscan ↗
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
