import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "../App";

// ── Mocks ────────────────────────────────────────────────────

const mockConnect = vi.fn();
const mockSwitchToSepolia = vi.fn();
const mockRefetch = vi.fn();

const mockUseMarkets = vi.fn();

vi.mock("../hooks/useWallet", () => ({
  useWallet: () => ({
    provider: null,
    rawProvider: null,
    signer: null,
    address: "",
    chainId: 0,
    isConnected: false,
    isCorrectChain: false,
    connect: mockConnect,
    connectWallet: vi.fn(),
    disconnect: vi.fn(),
    switchToSepolia: mockSwitchToSepolia,
    connectError: "",
    discoveredWallets: [],
    showWalletPicker: false,
    setShowWalletPicker: vi.fn(),
  }),
  getReadProvider: () => null,
}));

vi.mock("../hooks/useMarkets", () => ({
  useMarkets: (...args: unknown[]) => mockUseMarkets(...args),
  stateLabel: (s: number) => ["Active", "Resolving", "Resolved", "Cancelled", "Expired"][s] ?? "Unknown",
  displayState: (m: { state: number; endTime: number }) => {
    if (m.state === 0 && Date.now() / 1000 > m.endTime) return "Voting Ended";
    return ["Active", "Resolving", "Resolved", "Cancelled", "Expired"][m.state] ?? "Unknown";
  },
  isVotingOpen: (m: { state: number; startTime: number; endTime: number }) => {
    const now = Date.now() / 1000;
    return m.state === 0 && now >= m.startTime && now <= m.endTime;
  },
  STATE_COLORS: {
    Active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    "Voting Ended": "bg-orange-500/20 text-orange-400 border-orange-500/30",
    Resolving: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    Resolved: "bg-violet-500/20 text-violet-400 border-violet-500/30",
    Cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
    Expired: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  },
}));

vi.mock("../contracts", () => ({
  MARKET_FACTORY_ADDRESS: "0x1234567890abcdef1234567890abcdef12345678",
  MarketFactoryABI: [],
  OpinionMarketABI: [],
  SEPOLIA_CHAIN_ID: 11155111,
  SEPOLIA_RPC: "",
}));

describe("App — landing page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMarkets.mockReturnValue({
      markets: [],
      votedMap: {},
      loading: false,
      error: "",
      refetch: mockRefetch,
    });
  });

  it("renders hero section", () => {
    render(<App />);
    expect(screen.getByText("Encrypted")).toBeInTheDocument();
    expect(screen.getByText("Opinion Markets")).toBeInTheDocument();
  });

  it("shows the neoma branding in header", () => {
    render(<App />);
    expect(screen.getByText("neo")).toBeInTheDocument();
    expect(screen.getByText("ma")).toBeInTheDocument();
  });

  it("shows Connect Wallet button when not connected", () => {
    render(<App />);
    expect(screen.getByText("Connect Wallet")).toBeInTheDocument();
  });

  it("shows empty state when no markets exist", () => {
    render(<App />);
    expect(screen.getByText("No markets yet")).toBeInTheDocument();
    expect(screen.getByText("Markets will appear here once the admin creates them")).toBeInTheDocument();
  });

  it("shows Markets heading", () => {
    render(<App />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("Markets");
  });

  it("has a refresh button", () => {
    render(<App />);
    expect(screen.getByText("↻ Refresh")).toBeInTheDocument();
  });

  it("calls refetch on refresh click", () => {
    render(<App />);
    fireEvent.click(screen.getByText("↻ Refresh"));
    expect(mockRefetch).toHaveBeenCalledOnce();
  });

  it("renders footer", () => {
    render(<App />);
    expect(screen.getByText(/neoma protocol/)).toBeInTheDocument();
    expect(screen.getByText(/sepolia testnet/)).toBeInTheDocument();
  });
});

describe("App — loading state", () => {
  it("shows spinner when loading", () => {
    mockUseMarkets.mockReturnValue({
      markets: [],
      votedMap: {},
      loading: true,
      error: "",
      refetch: mockRefetch,
    });

    render(<App />);
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).toBeTruthy();
  });
});

describe("App — error state", () => {
  it("shows error message", () => {
    mockUseMarkets.mockReturnValue({
      markets: [],
      votedMap: {},
      loading: false,
      error: "Network error",
      refetch: mockRefetch,
    });

    render(<App />);
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });
});

describe("App — with markets", () => {
  it("renders market cards", () => {
    mockUseMarkets.mockReturnValue({
      markets: [
        {
          address: "0x0000000000000000000000000000000000000001",
          question: "Is the sky blue?",
          optionA: "Yes",
          optionB: "No",
          stakeAmount: BigInt(1e16),
          startTime: Math.floor(Date.now() / 1000) - 3600,
          endTime: Math.floor(Date.now() / 1000) + 86400,
          resolutionDeadline: Math.floor(Date.now() / 1000) + 172800,
          state: 0,
          totalPool: BigInt(5e16),
          totalVoters: 5,
          winnerIndex: 0,
          winnerCount: 0,
        },
      ],
      votedMap: {},
      loading: false,
      error: "",
      refetch: mockRefetch,
    });

    render(<App />);
    expect(screen.getByText("Is the sky blue?")).toBeInTheDocument();
    expect(screen.getByText("(1)")).toBeInTheDocument(); // market count
  });
});
