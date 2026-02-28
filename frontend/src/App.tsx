import { useState, useMemo, useEffect } from "react";
import { Contract } from "ethers";
import { useWallet, getReadProvider } from "./hooks/useWallet";
import { useMarkets } from "./hooks/useMarkets";
import { Header } from "./components/Header";
import { MarketCard } from "./components/MarketCard";
import { MarketDetail } from "./components/MarketDetail";
import { AdminPage } from "./components/AdminPage";
import { WalletPickerModal } from "./components/WalletPickerModal";
import { MARKET_FACTORY_ADDRESS, MarketFactoryABI } from "./contracts";

type Tab = "markets" | "admin";

function App() {
  const wallet = useWallet();

  // Only use wallet.provider when on the correct chain; otherwise fall back to read-only
  const effectiveProvider = useMemo(
    () => (wallet.provider && wallet.isCorrectChain) ? wallet.provider : getReadProvider(),
    [wallet.provider, wallet.isCorrectChain],
  );
  const { markets, votedMap, loading, error, refetch } = useMarkets(effectiveProvider, wallet.address);
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("markets");
  const [isOwner, setIsOwner] = useState(false);

  const configured = !!MARKET_FACTORY_ADDRESS;

  // Check if current wallet is factory owner (only on correct chain)
  useEffect(() => {
    if (!wallet.isConnected || !wallet.isCorrectChain || !wallet.provider || !MARKET_FACTORY_ADDRESS) {
      setIsOwner(false);
      return;
    }
    let cancelled = false;
    const check = async () => {
      try {
        const factory = new Contract(MARKET_FACTORY_ADDRESS, MarketFactoryABI, wallet.provider);
        const ownerAddr: string = await factory.owner();
        if (!cancelled) {
          setIsOwner(ownerAddr.toLowerCase() === wallet.address.toLowerCase());
        }
      } catch {
        // Silently treat as non-owner — contract may not have owner() or may need redeploying
        if (!cancelled) setIsOwner(false);
      }
    };
    check();
    return () => { cancelled = true; };
  }, [wallet.isConnected, wallet.isCorrectChain, wallet.provider, wallet.address]);

  // If user switches away from admin tab but is no longer owner, reset to markets
  useEffect(() => {
    if (tab === "admin" && !isOwner) setTab("markets");
  }, [isOwner, tab]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header wallet={wallet} tab={tab} onTabChange={(t) => { setTab(t); setSelectedMarket(null); }} isOwner={isOwner} />

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {/* Connect error */}
        {wallet.connectError && (
          <div className="mb-6 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-center">
            {wallet.connectError}
          </div>
        )}

        {/* Wrong network banner — blocks content */}
        {wallet.isConnected && !wallet.isCorrectChain ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Wrong Network</h2>
            <p className="text-sm text-[var(--text-muted)] mb-6 max-w-sm mx-auto">
              You are connected to an unsupported network. Please switch to <span className="text-amber-400 font-medium">Sepolia</span> to use neoma.
            </p>
            <button
              onClick={wallet.switchToSepolia}
              className="bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg px-6 py-3 transition cursor-pointer"
            >
              Switch to Sepolia
            </button>
          </div>
        ) : tab === "admin" && isOwner ? (
          <AdminPage signer={wallet.signer} />
        ) : selectedMarket ? (
          <MarketDetail
            address={selectedMarket}
            provider={effectiveProvider}
            rawProvider={wallet.rawProvider}
            signer={wallet.signer}
            userAddress={wallet.address}
            onBack={() => setSelectedMarket(null)}
          />
        ) : (
          <>
            {/* Hero */}
            <div className="text-center mb-10">
              <h1 className="text-4xl font-bold tracking-tight mb-3">
                <span className="text-violet-400">Encrypted</span> Opinion Markets
              </h1>
              <p className="text-[var(--text-secondary)] text-lg max-w-xl mx-auto">
                Privacy-preserving markets where beliefs become encrypted capital signals.
                <br />
                <span className="text-[var(--text-muted)] text-sm">
                  Powered by Fully Homomorphic Encryption on Zama FHEVM
                </span>
              </p>
            </div>

            {/* Not configured warning */}
            {!configured && (
              <div className="mb-8 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
                <div className="text-sm text-amber-400 font-medium mb-1">Factory not configured</div>
                <div className="text-xs text-[var(--text-muted)]">
                  Set <code className="text-amber-300">VITE_FACTORY_ADDRESS</code> in your <code className="text-amber-300">.env</code> file after deploying to Sepolia
                </div>
              </div>
            )}

            {/* Toolbar */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Markets
                {markets.length > 0 && (
                  <span className="ml-2 text-sm text-[var(--text-muted)] font-normal">
                    ({markets.length})
                  </span>
                )}
              </h2>
              <button
                onClick={refetch}
                className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-3 py-1.5 transition cursor-pointer"
              >
                ↻ Refresh
              </button>
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="text-center py-10 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && markets.length === 0 && configured && (
              <div className="text-center py-20">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] flex items-center justify-center">
                  <span className="text-2xl">🗳️</span>
                </div>
                <div className="text-[var(--text-secondary)] font-medium mb-1">No markets yet</div>
                <div className="text-sm text-[var(--text-muted)]">Markets will appear here once the admin creates them</div>
              </div>
            )}

            {/* Market grid */}
            {markets.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {markets.map((m) => (
                  <MarketCard
                    key={m.address}
                    market={m}
                    hasVoted={votedMap[m.address] ?? false}
                    signer={wallet.signer}
                    rawProvider={wallet.rawProvider}
                    userAddress={wallet.address}
                    onNavigate={() => setSelectedMarket(m.address)}
                    onVoted={refetch}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-4 text-center text-xs text-[var(--text-muted)]">
        neoma protocol — encrypted opinion layer • sepolia testnet
      </footer>

      {/* Wallet picker modal */}
      {wallet.showWalletPicker && (
        <WalletPickerModal
          wallets={wallet.discoveredWallets}
          onSelect={wallet.connectWallet}
          onClose={() => wallet.setShowWalletPicker(false)}
          error={wallet.connectError}
        />
      )}
    </div>
  );
}

export default App;
