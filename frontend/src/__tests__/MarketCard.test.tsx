import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarketCard } from "../components/MarketCard";
import type { MarketInfo } from "../hooks/useMarkets";
import { ethers } from "ethers";

vi.mock("../fhe", () => ({
  encryptVote: vi.fn().mockResolvedValue({
    handles: [new Uint8Array(32)],
    inputProof: new Uint8Array(0),
  }),
  getFheLoadingState: vi.fn().mockReturnValue("idle"),
  onFheLoadingChange: vi.fn().mockReturnValue(() => {}),
  isFheReady: vi.fn().mockReturnValue(false),
}));

vi.mock("../hooks/useFheLoading", () => ({
  useFheLoading: vi.fn().mockReturnValue("idle"),
  fheLoadingLabel: vi.fn().mockReturnValue("Encrypting…"),
}));

vi.mock("../utils/parseContractError", () => ({
  parseContractError: vi.fn().mockReturnValue("Vote failed"),
}));

vi.mock("../contracts", () => ({
  OpinionMarketABI: [],
}));

function makeMarket(overrides: Partial<MarketInfo> = {}): MarketInfo {
  return {
    address: "0x0000000000000000000000000000000000000001",
    question: "Will ETH hit $10k in 2026?",
    options: ["Yes", "No"],
    tags: [],
    stakeAmount: ethers.parseEther("0.01"),
    startTime: Math.floor(Date.now() / 1000) - 3600,
    endTime: Math.floor(Date.now() / 1000) + 86400,
    resolutionDeadline: Math.floor(Date.now() / 1000) + 86400 + 86400,
    state: 0,
    totalPool: ethers.parseEther("0.05"),
    totalVoters: 5,
    winnerIndices: [],
    optionVoteCounts: [],
    totalWinnerVoters: 0,
    ...overrides,
  };
}

const baseProps = {
  hasVoted: false,
  signer: null,
  rawProvider: null,
  userAddress: "",
  onNavigate: vi.fn(),
  onVoted: vi.fn(),
  onConnectWallet: vi.fn(),
};

describe("MarketCard", () => {
  it("renders question, options, and stats", () => {
    const market = makeMarket();
    render(<MarketCard market={market} {...baseProps} />);

    expect(screen.getByText("Will ETH hit $10k in 2026?")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument(); // totalVoters
    expect(screen.getByText(/0\.05/)).toBeInTheDocument(); // pool
    expect(screen.getByText(/0\.01 ETH \/ vote/)).toBeInTheDocument();
  });

  it("displays Active state badge for state=0", () => {
    render(<MarketCard market={makeMarket({ state: 0 })} {...baseProps} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("displays Resolving state badge for state=1", () => {
    render(<MarketCard market={makeMarket({ state: 1 })} {...baseProps} />);
    expect(screen.getByText("Resolving")).toBeInTheDocument();
  });

  it("displays Resolved state badge for state=2", () => {
    render(<MarketCard market={makeMarket({ state: 2 })} {...baseProps} />);
    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });

  it("displays Cancelled state badge for state=3", () => {
    render(<MarketCard market={makeMarket({ state: 3 })} {...baseProps} />);
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("displays Expired state badge for state=4", () => {
    render(<MarketCard market={makeMarket({ state: 4 })} {...baseProps} />);
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("shows time remaining for active markets", () => {
    const market = makeMarket({
      state: 0,
      endTime: Math.floor(Date.now() / 1000) + 7200,
    });
    render(<MarketCard market={market} {...baseProps} />);
    expect(screen.getByText(/left/)).toBeInTheDocument();
  });

  it("does not show time remaining for non-active markets", () => {
    render(<MarketCard market={makeMarket({ state: 2 })} {...baseProps} />);
    expect(screen.queryByText(/left/)).not.toBeInTheDocument();
  });

  it("shows winner checkmark on resolved market", () => {
    const market = makeMarket({ state: 2, winnerIndices: [0], optionVoteCounts: [3, 2], totalWinnerVoters: 3 });
    render(<MarketCard market={market} {...baseProps} />);
    expect(screen.getAllByText("✓").length).toBeGreaterThanOrEqual(1);
  });

  it("fires onNavigate when card is clicked", () => {
    const handleNav = vi.fn();
    render(<MarketCard market={makeMarket()} {...baseProps} onNavigate={handleNav} />);
    fireEvent.click(screen.getByText("Will ETH hit $10k in 2026?"));
    expect(handleNav).toHaveBeenCalledOnce();
  });

  it("formats large pools correctly", () => {
    const market = makeMarket({ totalPool: ethers.parseEther("123.456") });
    render(<MarketCard market={market} {...baseProps} />);
    expect(screen.getByText(/123\.456/)).toBeInTheDocument();
  });

  it("shows 'Ended' when endTime has passed for active markets", () => {
    const market = makeMarket({
      state: 0,
      endTime: Math.floor(Date.now() / 1000) - 60,
    });
    render(<MarketCard market={market} {...baseProps} />);
    expect(screen.getByText(/Ended/)).toBeInTheDocument();
  });

  it("shows voted badge when user has voted", () => {
    render(<MarketCard market={makeMarket()} {...baseProps} hasVoted={true} />);
    expect(screen.getByText("Encrypted vote submitted")).toBeInTheDocument();
  });
});
