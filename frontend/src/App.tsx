import { useState } from "react";
import { useWallet } from "./hooks/useWallet";
import { useMarkets } from "./hooks/useMarkets";
import { Header } from "./components/Header";
import { MarketCard } from "./components/MarketCard";
import { MarketDetail } from "./components/MarketDetail";
import { CreateMarketModal } from "./components/CreateMarketModal";
import { MARKET_FACTORY_ADDRESS } from "./contracts";

function App() {
  const wallet = useWallet();
  const { markets, loading, error, refetch } = useMarkets(wallet.provider);
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const configured = !!MARKET_FACTORY_ADDRESS;

  return (
    <div className="min-h-screen flex flex-col">
      <Header wallet={wallet} />

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {/* Detail view */}
        {selectedMarket ? (
          <MarketDetail
            address={selectedMarket}
            provider={wallet.provider}
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
              <div className="flex gap-2">
                <button
                  onClick={refetch}
                  className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-3 py-1.5 transition cursor-pointer"
                >
                  ↻ Refresh
                </button>
                {wallet.isConnected && wallet.isCorrectChain && configured && (
                  <button
                    onClick={() => setShowCreate(true)}
                    className="text-sm bg-violet-600 hover:bg-violet-500 text-white rounded-lg px-4 py-1.5 font-medium transition cursor-pointer"
                  >
                    + Create Market
                  </button>
                )}
              </div>
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
                <div className="text-sm text-[var(--text-muted)]">Create the first encrypted opinion market</div>
              </div>
            )}

            {/* Market grid */}
            {markets.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {markets.map((m) => (
                  <MarketCard
                    key={m.address}
                    market={m}
                    onClick={() => setSelectedMarket(m.address)}
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

      {/* Create modal */}
      {showCreate && (
        <CreateMarketModal
          signer={wallet.signer}
          onCreated={refetch}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

export default App;
