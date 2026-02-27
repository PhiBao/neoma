import { useState } from "react";
import { Contract, JsonRpcSigner, ethers } from "ethers";
import { MARKET_FACTORY_ADDRESS, MarketFactoryABI } from "../contracts";

interface Props {
  signer: JsonRpcSigner | null;
  onCreated: () => void;
  onClose: () => void;
}

export function CreateMarketModal({ signer, onCreated, onClose }: Props) {
  const [question, setQuestion] = useState("");
  const [optionA, setOptionA] = useState("");
  const [optionB, setOptionB] = useState("");
  const [stake, setStake] = useState("0.001");
  const [durationHours, setDurationHours] = useState("24");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!signer || !MARKET_FACTORY_ADDRESS) return;
    if (!question.trim() || !optionA.trim() || !optionB.trim()) {
      setError("All fields are required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const factory = new Contract(MARKET_FACTORY_ADDRESS, MarketFactoryABI, signer);
      const now = Math.floor(Date.now() / 1000);
      const stakeWei = ethers.parseEther(stake);
      const duration = parseInt(durationHours) * 3600;

      const tx = await factory.createMarket(
        question.trim(),
        optionA.trim(),
        optionB.trim(),
        stakeWei,
        now,
        now + duration,
      );
      await tx.wait();
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.slice(0, 120) : "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <h2 className="text-xl font-bold mb-1">Create Market</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          Launch a new encrypted opinion market
        </p>

        <div className="space-y-4">
          {/* Question */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Who is the GOAT?"
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-violet-500/50"
            />
          </div>

          {/* Options row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Option A
              </label>
              <input
                type="text"
                value={optionA}
                onChange={(e) => setOptionA(e.target.value)}
                placeholder="e.g. CR7"
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Option B
              </label>
              <input
                type="text"
                value={optionB}
                onChange={(e) => setOptionB(e.target.value)}
                placeholder="e.g. M10"
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-violet-500/50"
              />
            </div>
          </div>

          {/* Stake + Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Stake per Vote (ETH)
              </label>
              <input
                type="text"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Duration (hours)
              </label>
              <input
                type="number"
                value={durationHours}
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

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] rounded-lg py-2.5 text-sm font-medium hover:bg-[var(--bg-card-hover)] transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/50 text-white rounded-lg py-2.5 text-sm font-medium transition cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </span>
            ) : (
              "Create Market"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
