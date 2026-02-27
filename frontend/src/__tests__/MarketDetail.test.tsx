import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarketDetail } from "../components/MarketDetail";

// Mock ethers
vi.mock("ethers", async (importOriginal) => {
  const actual: any = await importOriginal(); // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    ...actual,
    Contract: vi.fn().mockImplementation(() => ({})),
  };
});

// Mock useMarketDetail via a vi.fn() delegate so tests can override per-test
const mockUseMarketDetail = vi.fn();
const mockRefetch = vi.fn();

vi.mock("../hooks/useMarkets", () => ({
  stateLabel: (s: number) =>
    ["Active", "Resolving", "Resolved", "Cancelled", "Expired"][s] ?? "Unknown",
  useMarketDetail: (...args: unknown[]) => mockUseMarketDetail(...args),
}));

vi.mock("../contracts", () => ({
  OpinionMarketABI: [],
  MARKET_FACTORY_ADDRESS: "0x1234567890abcdef1234567890abcdef12345678",
}));

describe("MarketDetail — active market", () => {
  const defaultProps = {
    address: "0x0000000000000000000000000000000000000001",
    provider: null,
    signer: null,
    userAddress: "0xUser",
    onBack: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMarketDetail.mockReturnValue({
      market: {
        address: "0x0000000000000000000000000000000000000001",
        question: "Will BTC hit $200k?",
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
      hasVoted: false,
      loading: false,
      refetch: mockRefetch,
    });
  });

  it("renders market question", () => {
    render(<MarketDetail {...defaultProps} />);
    expect(screen.getByText("Will BTC hit $200k?")).toBeInTheDocument();
  });

  it("renders both options as vote buttons", () => {
    render(<MarketDetail {...defaultProps} />);
    // Active market shows option buttons
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("renders contract address", () => {
    render(<MarketDetail {...defaultProps} />);
    expect(
      screen.getByText("0x0000000000000000000000000000000000000001")
    ).toBeInTheDocument();
  });

  it("renders pool stats", () => {
    render(<MarketDetail {...defaultProps} />);
    expect(screen.getByText("ETH Pool")).toBeInTheDocument();
    expect(screen.getByText("Voters")).toBeInTheDocument();
    expect(screen.getByText("ETH / vote")).toBeInTheDocument();
  });

  it("shows Active state badge", () => {
    render(<MarketDetail {...defaultProps} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("has back button that calls onBack", () => {
    const onBack = vi.fn();
    render(<MarketDetail {...defaultProps} onBack={onBack} />);
    const backBtn = screen.getByText("← Back to Markets");
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("renders encrypted vote prompt", () => {
    render(<MarketDetail {...defaultProps} />);
    expect(screen.getByText("Cast your encrypted vote")).toBeInTheDocument();
  });

  it("shows FHE privacy notice", () => {
    render(<MarketDetail {...defaultProps} />);
    expect(
      screen.getByText(/Your vote is encrypted with FHE/)
    ).toBeInTheDocument();
  });

  it("renders timeline section", () => {
    render(<MarketDetail {...defaultProps} />);
    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(screen.getByText("End")).toBeInTheDocument();
    expect(screen.getByText("Resolution Deadline")).toBeInTheDocument();
  });

  it("shows vote button with stake amount", () => {
    render(<MarketDetail {...defaultProps} />);
    expect(screen.getByText(/Vote — Stake .* ETH/)).toBeInTheDocument();
  });

  it("allows selecting an option", () => {
    render(<MarketDetail {...defaultProps} />);
    const yesBtn = screen.getByText("Yes");
    fireEvent.click(yesBtn);
    // After clicking, the selection should be highlighted (border-violet-500)
    expect(yesBtn.closest("button")).toHaveClass("border-violet-500");
  });
});

describe("MarketDetail — resolved market", () => {
  it("shows winner when market is resolved", () => {
    mockUseMarketDetail.mockReturnValue({
      market: {
        address: "0x0000000000000000000000000000000000000001",
        question: "Resolved question?",
        optionA: "Alpha",
        optionB: "Beta",
        stakeAmount: BigInt(1e16),
        startTime: Math.floor(Date.now() / 1000) - 86400,
        endTime: Math.floor(Date.now() / 1000) - 3600,
        resolutionDeadline: Math.floor(Date.now() / 1000) + 86400,
        state: 2,
        totalPool: BigInt(5e16),
        totalVoters: 5,
        winnerIndex: 1,
        winnerCount: 3,
      },
      hasVoted: true,
      loading: false,
      refetch: mockRefetch,
    });

    render(
      <MarketDetail
        address="0x0000000000000000000000000000000000000001"
        provider={null}
        signer={null}
        userAddress="0xUser"
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText("Winner")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });
});

describe("MarketDetail — loading state", () => {
  it("shows spinner when loading", () => {
    mockUseMarketDetail.mockReturnValue({
      market: null,
      hasVoted: false,
      loading: true,
      refetch: mockRefetch,
    });

    render(
      <MarketDetail
        address="0x0000000000000000000000000000000000000001"
        provider={null}
        signer={null}
        userAddress=""
        onBack={vi.fn()}
      />
    );

    const spinner = document.querySelector(".animate-spin");
    expect(spinner).toBeTruthy();
  });
});
