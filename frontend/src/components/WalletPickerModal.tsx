import type { EIP6963Wallet } from "../hooks/useWallet";

interface Props {
  wallets: EIP6963Wallet[];
  onSelect: (provider: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
  onClose: () => void;
  error: string;
}

export function WalletPickerModal({ wallets, onSelect, onClose, error }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Connect Wallet</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        <p className="px-5 text-xs text-[var(--text-muted)] mb-3">
          Select a wallet to connect
        </p>

        {/* Wallet list */}
        <div className="px-3 pb-4 space-y-1 max-h-[320px] overflow-y-auto">
          {wallets.map((w) => (
            <button
              key={w.info.uuid}
              onClick={() => onSelect(w.provider)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[var(--bg-secondary)] transition cursor-pointer group"
            >
              <img
                src={w.info.icon}
                alt={w.info.name}
                className="w-9 h-9 rounded-lg"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <div className="flex-1 text-left">
                <div className="text-sm font-medium text-[var(--text-primary)] group-hover:text-violet-400 transition">
                  {w.info.name}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {w.info.rdns}
                </div>
              </div>
              <svg className="w-4 h-4 text-[var(--text-muted)] group-hover:text-violet-400 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}

          {wallets.length === 0 && (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">🔍</div>
              <div className="text-sm text-[var(--text-muted)]">
                No wallets detected
              </div>
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-xs text-violet-400 hover:underline"
              >
                Install MetaMask →
              </a>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-3 mb-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
