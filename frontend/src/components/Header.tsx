import { useWallet } from "../hooks/useWallet";

interface Props {
  wallet: ReturnType<typeof useWallet>;
  tab: "markets" | "admin";
  onTabChange: (tab: "markets" | "admin") => void;
  isOwner: boolean;
}

export function Header({ wallet, tab, onTabChange, isOwner }: Props) {
  const truncAddr = wallet.address
    ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
    : "";

  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo + Nav */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white font-bold text-sm">
              N
            </div>
            <span className="text-xl font-bold tracking-tight">
              <span className="text-violet-400">neo</span>
              <span className="text-[var(--text-primary)]">ma</span>
            </span>
            <span className="text-xs text-[var(--text-muted)] border border-[var(--border)] rounded px-1.5 py-0.5 ml-1">
              sepolia
            </span>
          </div>

          {/* Tabs */}
          <nav className="flex gap-1">
            <button
              onClick={() => onTabChange("markets")}
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

        {/* Wallet */}
        <div className="flex items-center gap-3">
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
                className="bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition cursor-pointer"
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
      </div>
    </header>
  );
}
