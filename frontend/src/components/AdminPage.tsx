import { useState, useEffect, useCallback } from "react";
import { Contract, JsonRpcSigner, ethers } from "ethers";
import { MARKET_FACTORY_ADDRESS, MarketFactoryABI, OpinionMarketABI } from "../contracts";
import type { MarketInfo } from "../hooks/useMarkets";
import { stateLabel, fetchMarketInfo } from "../hooks/useMarkets";

interface Props {
  signer: JsonRpcSigner | null;
}

export function AdminPage({ signer }: Props) {
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [loadingMarkets, setLoadingMarkets] = useState(false);

  // Form state
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [stake, setStake] = useState("0.001");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function addOption() {
    if (options.length < 10) setOptions([...options, ""]);
  }
  function removeOption(idx: number) {
    if (options.length > 2) setOptions(options.filter((_, i) => i !== idx));
  }
  function updateOption(idx: number, value: string) {
    setOptions(options.map((o, i) => (i === idx ? value : o)));
  }

  // Load markets
  const fetchMarkets = useCallback(async () => {
    if (!signer || !MARKET_FACTORY_ADDRESS) return;
    setLoadingMarkets(true);
    try {
      const factory = new Contract(MARKET_FACTORY_ADDRESS, MarketFactoryABI, signer);

      // Batch-fetch all market addresses
      let addresses: string[];
      try {
        addresses = await factory.getAllMarkets();
      } catch {
        const count = Number(await factory.marketCount());
        addresses = [];
        for (let i = 0; i < count; i++) {
          addresses.push(await factory.getMarket(i));
        }
      }

      // Fetch info in parallel batches of 5
      const list: MarketInfo[] = [];
      for (let i = 0; i < addresses.length; i += 5) {
        const batch = addresses.slice(i, i + 5);
        const results = await Promise.allSettled(
          batch.map((addr) => {
            const m = new Contract(addr, OpinionMarketABI, signer);
            return fetchMarketInfo(m, addr);
          }),
        );
        for (const r of results) {
          if (r.status === "fulfilled") list.push(r.value);
        }
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
    const trimmedOpts = options.map((o) => o.trim());
    if (!question.trim() || trimmedOpts.some((o) => !o)) {
      setError("Question and all options are required");
      return;
    }

    // Validate stake
    const stakeNum = parseFloat(stake);
    if (isNaN(stakeNum) || stakeNum <= 0) {
      setError("Stake must be a positive number");
      return;
    }

    // Validate duration
    const durationNum = parseInt(durationMinutes);
    if (isNaN(durationNum) || durationNum <= 0) {
      setError("Duration must be a positive number of minutes");
      return;
    }

    setCreating(true);
    setError("");
    setSuccess("");
    try {
      const factory = new Contract(MARKET_FACTORY_ADDRESS, MarketFactoryABI, signer);
      const now = Math.floor(Date.now() / 1000);
      let stakeWei: bigint;
      try {
        stakeWei = ethers.parseEther(stake);
      } catch {
        setError("Invalid stake amount — use a valid ETH value like 0.001");
        return;
      }
      const duration = durationNum * 60;

      const tx = await factory.createMarket(
        question.trim(), trimmedOpts,
        stakeWei, now, now + duration,
      );
      await tx.wait();
      setSuccess(`Market created! Tx: ${tx.hash.slice(0, 14)}...`);
      setQuestion("");
      setOptions(["", ""]);
      setStake("0.001");
      setDurationMinutes("60");
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
      setSuccess(`Market resolved! The market will now show final results.`);
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
            <label htmlFor="admin-question" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Question
            </label>
            <input
              id="admin-question"
              type="text" value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Will ETH hit $10k in 2026?"
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-violet-500/50"
            />
          </div>

          {/* Dynamic options */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="admin-options" className="text-xs font-medium text-[var(--text-secondary)]">
                Options ({options.length}/10)
              </label>
              {options.length < 10 && (
                <button
                  type="button"
                  onClick={addOption}
                  className="text-xs text-violet-400 hover:text-violet-300 transition cursor-pointer"
                >
                  + Add Option
                </button>
              )}
            </div>
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    id={idx === 0 ? "admin-options" : undefined}
                    type="text"
                    value={opt}
                    onChange={(e) => updateOption(idx, e.target.value)}
                    placeholder={`Option ${idx + 1}`}
                    className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-violet-500/50"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(idx)}
                      className="px-2.5 text-zinc-500 hover:text-red-400 transition cursor-pointer text-lg"
                      title="Remove option"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="admin-stake" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Stake per Vote (ETH)
              </label>
              <input
                id="admin-stake"
                type="text" value={stake}
                onChange={(e) => setStake(e.target.value)}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <label htmlFor="admin-duration" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Duration (minutes)
              </label>
              <input
                id="admin-duration"
                type="number" value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-violet-500/50"
              />
              <div className="flex gap-1.5 mt-1.5">
                {[
                  { label: "5m", val: "5" },
                  { label: "30m", val: "30" },
                  { label: "1h", val: "60" },
                  { label: "24h", val: "1440" },
                  { label: "7d", val: "10080" },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setDurationMinutes(p.val)}
                    className={`text-[10px] px-2 py-0.5 rounded border transition cursor-pointer ${
                      durationMinutes === p.val
                        ? "bg-violet-500/20 text-violet-400 border-violet-500/30"
                        : "text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-primary)] hover:border-violet-500/30"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {(() => {
                const mins = parseInt(durationMinutes);
                if (isNaN(mins) || mins <= 0) return null;
                const d = Math.floor(mins / 1440);
                const h = Math.floor((mins % 1440) / 60);
                const m = mins % 60;
                const parts = [];
                if (d > 0) parts.push(`${d}d`);
                if (h > 0) parts.push(`${h}h`);
                if (m > 0) parts.push(`${m}m`);
                return (
                  <div className="text-[10px] text-[var(--text-muted)] mt-1">
                    = {parts.join(" ") || "0m"}
                  </div>
                );
              })()}
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
            const optsSummary = m.options.length <= 3
              ? m.options.join(" · ")
              : m.options.slice(0, 2).join(" · ") + ` +${m.options.length - 2} more`;
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
                        {m.totalVoters} votes · {ethers.formatEther(m.totalPool)} ETH · {m.options.length} options
                      </span>
                    </div>
                    <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {m.question}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-1">
                      {optsSummary} · Ends {new Date(m.endTime * 1000).toLocaleString()}
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
