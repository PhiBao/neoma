import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarketCard } from "../components/MarketCard";
import type { MarketInfo } from "../hooks/useMarkets";
import { ethers } from "ethers";

function makeMarket(overrides: Partial<MarketInfo> = {}): MarketInfo {
  return {
    address: "0x0000000000000000000000000000000000000001",
    question: "Will ETH hit $10k in 2026?",
    optionA: "Yes",
    optionB: "No",
    stakeAmount: ethers.parseEther("0.01"),
    startTime: Math.floor(Date.now() / 1000) - 3600,
    endTime: Math.floor(Date.now() / 1000) + 86400,
    resolutionDeadline: Math.floor(Date.now() / 1000) + 86400 + 86400,
    state: 0,
    totalPool: ethers.parseEther("0.05"),
    totalVoters: 5,
    winnerIndex: 0,
    winnerCount: 0,
    ...overrides,
  };
}

describe("MarketCard", () => {
  it("renders question, options, and stats", () => {
    const market = makeMarket();
    render(<MarketCard market={market} onClick={vi.fn()} />);

    expect(screen.getByText("Will ETH hit $10k in 2026?")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument(); // totalVoters
    expect(screen.getByText(/0\.05/)).toBeInTheDocument(); // pool
    expect(screen.getByText(/0\.01 ETH \/ vote/)).toBeInTheDocument();
  });

  it("displays Active state badge for state=0", () => {
    const market = makeMarket({ state: 0 });
    render(<MarketCard market={market} onClick={vi.fn()} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("displays Resolving state badge for state=1", () => {
    const market = makeMarket({ state: 1 });
    render(<MarketCard market={market} onClick={vi.fn()} />);
    expect(screen.getByText("Resolving")).toBeInTheDocument();
  });

  it("displays Resolved state badge for state=2", () => {
    const market = makeMarket({ state: 2 });
    render(<MarketCard market={market} onClick={vi.fn()} />);
    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });

  it("displays Cancelled state badge for state=3", () => {
    const market = makeMarket({ state: 3 });
    render(<MarketCard market={market} onClick={vi.fn()} />);
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("displays Expired state badge for state=4", () => {
    const market = makeMarket({ state: 4 });
    render(<MarketCard market={market} onClick={vi.fn()} />);
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("shows time remaining for active markets", () => {
    const market = makeMarket({
      state: 0,
      endTime: Math.floor(Date.now() / 1000) + 7200, // 2h from now
    });
    render(<MarketCard market={market} onClick={vi.fn()} />);
    expect(screen.getByText(/left/)).toBeInTheDocument();
  });

  it("does not show time remaining for non-active markets", () => {
    const market = makeMarket({ state: 2 });
    render(<MarketCard market={market} onClick={vi.fn()} />);
    expect(screen.queryByText(/left/)).not.toBeInTheDocument();
  });

  it("shows winner checkmark on resolved market", () => {
    const market = makeMarket({
      state: 2,
      winnerIndex: 0,
    });
    render(<MarketCard market={market} onClick={vi.fn()} />);
    // Option A "Yes" should have the ✓
    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  it("fires onClick when clicked", () => {
    const handleClick = vi.fn();
    render(<MarketCard market={makeMarket()} onClick={handleClick} />);
    fireEvent.click(screen.getByText("Will ETH hit $10k in 2026?"));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it("formats large pools correctly", () => {
    const market = makeMarket({
      totalPool: ethers.parseEther("123.456"),
    });
    render(<MarketCard market={market} onClick={vi.fn()} />);
    expect(screen.getByText(/123\.456/)).toBeInTheDocument();
  });

  it("shows 'Ended' when endTime has passed for active markets", () => {
    const market = makeMarket({
      state: 0,
      endTime: Math.floor(Date.now() / 1000) - 60, // 1 min ago
    });
    render(<MarketCard market={market} onClick={vi.fn()} />);
    expect(screen.getByText(/Ended/)).toBeInTheDocument();
  });
});
