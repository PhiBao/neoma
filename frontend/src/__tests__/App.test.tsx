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
    signer: null,
    address: "",
    chainId: 0,
    isConnected: false,
    isCorrectChain: false,
    connect: mockConnect,
    switchToSepolia: mockSwitchToSepolia,
  }),
}));

vi.mock("../hooks/useMarkets", () => ({
  useMarkets: (...args: unknown[]) => mockUseMarkets(...args),
  stateLabel: (s: number) => ["Active", "Resolving", "Resolved", "Cancelled", "Expired"][s] ?? "Unknown",
}));

vi.mock("../contracts", () => ({
  MARKET_FACTORY_ADDRESS: "0x1234567890abcdef1234567890abcdef12345678",
  MarketFactoryABI: [],
  OpinionMarketABI: [],
  SEPOLIA_CHAIN_ID: 11155111,
}));

describe("App — landing page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMarkets.mockReturnValue({
      markets: [],
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
    expect(screen.getByText("Create the first encrypted opinion market")).toBeInTheDocument();
  });

  it("shows Markets heading", () => {
    render(<App />);
    expect(screen.getByText("Markets")).toBeInTheDocument();
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
      loading: false,
      error: "",
      refetch: mockRefetch,
    });

    render(<App />);
    expect(screen.getByText("Is the sky blue?")).toBeInTheDocument();
    expect(screen.getByText("(1)")).toBeInTheDocument(); // market count
  });
});
