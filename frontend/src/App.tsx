import { useState, useMemo, useEffect, useCallback } from "react";
import { Contract } from "ethers";
import { useWallet, getReadProvider } from "./hooks/useWallet";
import { useMarkets } from "./hooks/useMarkets";
import { useWebSocket } from "./hooks/useWebSocket";
import { Header } from "./components/Header";
import { MarketCard } from "./components/MarketCard";
import { MarketDetail } from "./components/MarketDetail";
import { AdminPage } from "./components/AdminPage";
import { WalletPickerModal } from "./components/WalletPickerModal";
import { ActivityFeed } from "./components/ActivityFeed";
import { AnalyticsDashboard } from "./components/AnalyticsDashboard";
import { MARKET_FACTORY_ADDRESS, MarketFactoryABI } from "./contracts";

type Tab = "markets" | "analytics" | "admin";

// ── URL hash helpers ────────────────────────────────────────────
function parseHash(): { tab?: Tab; market?: string } {
  const hash = window.location.hash.slice(1); // remove #
  if (!hash) return {};
  const params = new URLSearchParams(hash);
  const result: { tab?: Tab; market?: string } = {};
  const t = params.get("tab");
  if (t === "analytics" || t === "admin") result.tab = t;
  const m = params.get("market");
  if (m && /^0x[a-fA-F0-9]{40}$/.test(m)) result.market = m;
  return result;
}

function updateHash(tab: Tab, market: string | null) {
  const parts: string[] = [];
  if (tab !== "markets") parts.push(`tab=${tab}`);
  if (market) parts.push(`market=${market}`);
  const newHash = parts.length ? `#${parts.join("&")}` : "";
  if (window.location.hash !== newHash) {
    window.history.pushState(null, "", newHash || window.location.pathname);
  }
}

function App() {
  const wallet = useWallet();
  const ws = useWebSocket();

  // Only use wallet.provider when on the correct chain; otherwise fall back to read-only
  const effectiveProvider = useMemo(
    () => (wallet.provider && wallet.isCorrectChain) ? wallet.provider : getReadProvider(),
    [wallet.provider, wallet.isCorrectChain],
  );
  const { markets, votedMap, loading, error, refetch } = useMarkets(effectiveProvider, wallet.address, ws);

  // Initialize state from URL hash
  const initial = useMemo(() => parseHash(), []);
  const [selectedMarket, setSelectedMarket] = useState<string | null>(initial.market ?? null);
  const [tab, setTab] = useState<Tab>(initial.tab ?? "markets");
  const [isOwner, setIsOwner] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | "active" | "resolved" | "expired">("all");
  const [tagFilter, setTagFilter] = useState<string>("");

  // Sync URL hash when tab/market changes
  useEffect(() => {
    updateHash(tab, selectedMarket);
  }, [tab, selectedMarket]);

  // Listen for browser back/forward
  useEffect(() => {
    const onHashChange = () => {
      const { tab: t, market: m } = parseHash();
      setTab(t ?? "markets");
      setSelectedMarket(m ?? null);
    };
    window.addEventListener("popstate", onHashChange);
    return () => window.removeEventListener("popstate", onHashChange);
  }, []);

  // Stable callbacks for navigation (used in share links)
  const navigateToMarket = useCallback((addr: string) => {
    setTab("markets");
    setSelectedMarket(addr);
  }, []);

  const navigateBack = useCallback(() => {
    setSelectedMarket(null);
  }, []);

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

  // Collect all unique tags for the filter dropdown
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const m of markets) {
      for (const t of m.tags) set.add(t);
    }
    return Array.from(set).sort();
  }, [markets]);

  // Filter markets by search query, state, and tag
  const filteredMarkets = useMemo(() => {
    let filtered = markets;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.question.toLowerCase().includes(q) ||
          m.options.some((o) => o.toLowerCase().includes(q)) ||
          m.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (stateFilter !== "all") {
      filtered = filtered.filter((m) => {
        switch (stateFilter) {
          case "active": return m.state === 0 && Date.now() / 1000 <= m.endTime;
          case "resolved": return m.state === 2;
          case "expired": return m.state === 3 || m.state === 4;
          default: return true;
        }
      });
    }
    if (tagFilter) {
      filtered = filtered.filter((m) => m.tags.includes(tagFilter));
    }
    return filtered;
  }, [markets, searchQuery, stateFilter, tagFilter]);

  // Build address→question lookup for the activity feed
  const marketNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of markets) {
      map[m.address.toLowerCase()] = m.question;
    }
    return map;
  }, [markets]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Ambient floating orbs */}
      <div className="ambient-bg" />

      <Header wallet={wallet} tab={tab} onTabChange={(t) => { setTab(t); setSelectedMarket(null); }} isOwner={isOwner} wsStatus={ws.status} />

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
        ) : tab === "analytics" ? (
          <AnalyticsDashboard
            markets={markets}
            onNavigate={navigateToMarket}
          />
        ) : selectedMarket ? (
          <MarketDetail
            address={selectedMarket}
            provider={effectiveProvider}
            rawProvider={wallet.rawProvider}
            signer={wallet.signer}
            userAddress={wallet.address}
            isOwner={isOwner}
            onBack={navigateBack}
            onConnectWallet={wallet.connect}
          />
        ) : (
          <>
            {/* Hero */}
            <div className="text-center mb-12 fade-up">
              {/* Animated shield icon */}
              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20 flex items-center justify-center float-animation">
                <svg className="w-8 h-8 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
                <span className="text-gradient">Encrypted</span>{" "}
                <span className="text-[var(--text-primary)]">Opinion Markets</span>
              </h1>
              <p className="text-[var(--text-secondary)] text-lg max-w-xl mx-auto leading-relaxed">
                Privacy-preserving markets where beliefs become encrypted capital signals.
              </p>
              <div className="flex items-center justify-center gap-2 mt-3">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-500/60"></div>
                <span className="text-[var(--text-muted)] text-sm">
                  Powered by Fully Homomorphic Encryption on Zama FHEVM
                </span>
                <div className="w-1.5 h-1.5 rounded-full bg-violet-500/60"></div>
              </div>
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] shrink-0">
                Markets
                {markets.length > 0 && (
                  <span className="ml-2 text-sm text-[var(--text-muted)] font-normal">
                    ({filteredMarkets.length}{filteredMarkets.length !== markets.length ? `/${markets.length}` : ""})
                  </span>
                )}
              </h2>
              <div className="flex flex-1 items-center gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search markets..."
                  aria-label="Search markets"
                  className="flex-1 min-w-0 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-violet-500/50"
                />
                <select
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value as typeof stateFilter)}
                  aria-label="Filter by state"
                  className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-sm text-[var(--text-secondary)] focus:outline-none focus:border-violet-500/50 cursor-pointer"
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="resolved">Resolved</option>
                  <option value="expired">Expired</option>
                </select>
                {allTags.length > 0 && (
                  <select
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    aria-label="Filter by tag"
                    className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-sm text-[var(--text-secondary)] focus:outline-none focus:border-violet-500/50 cursor-pointer"
                  >
                    <option value="">All Tags</option>
                    {allTags.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={refetch}
                  disabled={loading}
                  aria-label="Refresh markets"
                  className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-3 py-1.5 transition cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin inline-block" />
                  ) : "↻"}
                </button>
              </div>
            </div>

            {/* Skeleton Loading */}
            {loading && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5" style={{ animationDelay: `${i * 0.08}s` }}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="neoma-skeleton h-5 w-16 rounded-full" />
                      <div className="neoma-skeleton h-4 w-12" />
                    </div>
                    <div className="neoma-skeleton h-6 w-4/5 mb-2" />
                    <div className="neoma-skeleton h-5 w-3/5 mb-4" />
                    <div className="flex gap-2 mb-4">
                      <div className="neoma-skeleton h-10 flex-1 rounded-xl" />
                      <div className="neoma-skeleton h-10 flex-1 rounded-xl" />
                    </div>
                    <div className="border-t border-[var(--border)] pt-3 flex justify-between">
                      <div className="neoma-skeleton h-4 w-20" />
                      <div className="neoma-skeleton h-4 w-16" />
                    </div>
                  </div>
                ))}
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
              <div className="text-center py-20 fade-up">
                <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-500/20 flex items-center justify-center float-animation">
                  <span className="text-3xl">🗳️</span>
                </div>
                <div className="text-lg text-[var(--text-secondary)] font-semibold mb-2">No markets yet</div>
                <div className="text-sm text-[var(--text-muted)] max-w-xs mx-auto">Markets will appear here once the admin creates them. Stay tuned!</div>
              </div>
            )}

            {/* No results for search/filter */}
            {!loading && !error && markets.length > 0 && filteredMarkets.length === 0 && (
              <div className="text-center py-12">
                <div className="text-[var(--text-secondary)] font-medium mb-1">No matching markets</div>
                <div className="text-sm text-[var(--text-muted)]">Try adjusting your search or filter</div>
              </div>
            )}

            {/* Market grid */}
            {filteredMarkets.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-grid">
                {filteredMarkets.map((m) => (
                  <MarketCard
                    key={m.address}
                    market={m}
                    hasVoted={votedMap[m.address] ?? false}
                    signer={wallet.signer}
                    rawProvider={wallet.rawProvider}
                    userAddress={wallet.address}
                    onNavigate={() => setSelectedMarket(m.address)}
                    onVoted={refetch}
                    onConnectWallet={wallet.connect}
                  />
                ))}
              </div>
            )}

            {/* Activity Feed (global) */}
            {!loading && markets.length > 0 && (
              <ActivityFeed
                provider={effectiveProvider}
                marketNames={marketNames}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-5 text-center text-xs text-[var(--text-muted)]">
        <div className="flex items-center justify-center gap-2">
          <div className="w-4 h-4 rounded bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white font-bold" style={{ fontSize: '7px' }}>N</div>
          <span>neoma protocol — encrypted opinion layer</span>
          <span className="text-[var(--border)]">•</span>
          <span className="text-violet-400/60">sepolia testnet</span>
        </div>
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
