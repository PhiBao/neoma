import { useState } from "react";
import { useWallet } from "../hooks/useWallet";

interface Props {
  wallet: ReturnType<typeof useWallet>;
  tab: "markets" | "admin";
  onTabChange: (tab: "markets" | "admin") => void;
  isOwner: boolean;
}

export function Header({ wallet, tab, onTabChange, isOwner }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const truncAddr = wallet.address
    ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
    : "";

  return (
    <header className="border-b border-[var(--border)] glass sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        {/* Logo + Nav */}
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white font-bold text-xs sm:text-sm">
              N
            </div>
            <span className="text-lg sm:text-xl font-bold tracking-tight">
              <span className="text-violet-400">neo</span>
              <span className="text-[var(--text-primary)]">ma</span>
            </span>
            <span className="hidden sm:inline text-xs text-[var(--text-muted)] border border-[var(--border)] rounded px-1.5 py-0.5 ml-1">
              sepolia
            </span>
          </div>

          {/* Desktop tabs */}
          <nav className="hidden sm:flex gap-1" role="tablist">
            <button
              onClick={() => onTabChange("markets")}
              role="tab"
              aria-selected={tab === "markets"}
              className={`text-sm px-3 py-1.5 rounded-lg transition cursor-pointer ${
                tab === "markets"
                  ? "bg-violet-500/20 text-violet-400 font-medium"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              Markets
            </button>
            {isOwner && (
              <button
                onClick={() => onTabChange("admin")}
                role="tab"
                aria-selected={tab === "admin"}
                className={`text-sm px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  tab === "admin"
                    ? "bg-violet-500/20 text-violet-400 font-medium"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                Admin
              </button>
            )}
          </nav>
        </div>

        {/* Desktop wallet + mobile hamburger */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Wallet (desktop) */}
          <div className="hidden sm:flex items-center gap-3">
            {wallet.isConnected ? (
              <>
                {!wallet.isCorrectChain && (
                  <button
                    onClick={wallet.switchToSepolia}
                    className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg px-3 py-1.5 hover:bg-amber-500/30 transition cursor-pointer"
                  >
                    Switch to Sepolia
                  </button>
                )}
                <div className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-1.5">
                  <div className={`w-2 h-2 rounded-full ${wallet.isCorrectChain ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className="text-sm font-mono text-[var(--text-secondary)]">
                    {truncAddr}
                  </span>
                </div>
                <button
                  onClick={wallet.disconnect}
                  className="text-xs text-[var(--text-muted)] hover:text-red-400 border border-[var(--border)] hover:border-red-500/30 rounded-lg px-2.5 py-1.5 transition cursor-pointer"
                  title="Disconnect wallet"
                >
                  ✕
                </button>
              </>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={wallet.connect}
                  className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 cursor-pointer"
                >
                  Connect Wallet
                </button>
                {wallet.connectError && (
                  <span className="text-xs text-red-400 max-w-[240px] text-right">
                    {wallet.connectError}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="sm:hidden text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 transition cursor-pointer"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30 sm:hidden" onClick={() => setMenuOpen(false)} />
          <div className="sm:hidden border-t border-[var(--border)] bg-[var(--bg-primary)]/95 backdrop-blur-lg px-4 py-3 space-y-3 relative z-40">
          {/* Nav */}
          <nav className="flex gap-2">
            <button
              onClick={() => { onTabChange("markets"); setMenuOpen(false); }}
              className={`text-sm px-3 py-1.5 rounded-lg transition cursor-pointer ${
                tab === "markets"
                  ? "bg-violet-500/20 text-violet-400 font-medium"
                  : "text-[var(--text-muted)]"
              }`}
            >
              Markets
            </button>
            {isOwner && (
              <button
                onClick={() => { onTabChange("admin"); setMenuOpen(false); }}
                className={`text-sm px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  tab === "admin"
                    ? "bg-violet-500/20 text-violet-400 font-medium"
                    : "text-[var(--text-muted)]"
                }`}
              >
                Admin
              </button>
            )}
          </nav>

          {/* Wallet */}
          {wallet.isConnected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${wallet.isCorrectChain ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className="text-sm font-mono text-[var(--text-secondary)]">
                  {truncAddr}
                </span>
              </div>
              <div className="flex gap-2">
                {!wallet.isCorrectChain && (
                  <button
                    onClick={wallet.switchToSepolia}
                    className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg px-2.5 py-1 hover:bg-amber-500/30 transition cursor-pointer"
                  >
                    Switch
                  </button>
                )}
                <button
                  onClick={wallet.disconnect}
                  className="text-xs text-[var(--text-muted)] hover:text-red-400 border border-[var(--border)] rounded-lg px-2.5 py-1 transition cursor-pointer"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { wallet.connect(); setMenuOpen(false); }}
              className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition shadow-lg shadow-violet-500/20 cursor-pointer"
            >
              Connect Wallet
            </button>
          )}
          </div>
        </>
      )}
    </header>
  );
}
