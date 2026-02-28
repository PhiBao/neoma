import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Header } from "../components/Header";

function makeWallet(overrides: Record<string, unknown> = {}) {
  return {
    provider: null,
    rawProvider: null,
    signer: null,
    address: "",
    chainId: 0,
    isConnected: false,
    isCorrectChain: false,
    connect: vi.fn(),
    connectWallet: vi.fn(),
    disconnect: vi.fn(),
    switchToSepolia: vi.fn(),
    connectError: "",
    discoveredWallets: [],
    showWalletPicker: false,
    setShowWalletPicker: vi.fn(),
    ...overrides,
  };
}

const defaultProps = {
  tab: "markets" as const,
  onTabChange: vi.fn(),
  isOwner: true,
};

describe("Header", () => {
  it("renders branding", () => {
    render(<Header wallet={makeWallet()} {...defaultProps} />);
    expect(screen.getByText("neo")).toBeInTheDocument();
    expect(screen.getByText("ma")).toBeInTheDocument();
    expect(screen.getByText("sepolia")).toBeInTheDocument();
  });

  it("shows Connect Wallet button when disconnected", () => {
    render(<Header wallet={makeWallet()} {...defaultProps} />);
    expect(screen.getByText("Connect Wallet")).toBeInTheDocument();
  });

  it("calls connect on button click", () => {
    const w = makeWallet();
    render(<Header wallet={w} {...defaultProps} />);
    fireEvent.click(screen.getByText("Connect Wallet"));
    expect(w.connect).toHaveBeenCalledOnce();
  });

  it("shows truncated address when connected on correct chain", () => {
    const w = makeWallet({
      isConnected: true,
      isCorrectChain: true,
      address: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
    });
    render(<Header wallet={w} {...defaultProps} />);
    expect(screen.getByText("0xAbCd...Ef12")).toBeInTheDocument();
    expect(screen.queryByText("Connect Wallet")).not.toBeInTheDocument();
  });

  it("shows Switch to Sepolia when on wrong chain", () => {
    const w = makeWallet({
      isConnected: true,
      isCorrectChain: false,
      address: "0x1111111111111111111111111111111111111111",
    });
    render(<Header wallet={w} {...defaultProps} />);
    const btn = screen.getByText("Switch to Sepolia");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(w.switchToSepolia).toHaveBeenCalledOnce();
  });

  it("does not show Switch to Sepolia when on correct chain", () => {
    const w = makeWallet({
      isConnected: true,
      isCorrectChain: true,
      address: "0x1111111111111111111111111111111111111111",
    });
    render(<Header wallet={w} {...defaultProps} />);
    expect(screen.queryByText("Switch to Sepolia")).not.toBeInTheDocument();
  });

  it("renders tab navigation with Markets and Admin when owner", () => {
    render(<Header wallet={makeWallet()} {...defaultProps} isOwner={true} />);
    expect(screen.getByText("Markets")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("hides Admin tab when not owner", () => {
    render(<Header wallet={makeWallet()} {...defaultProps} isOwner={false} />);
    expect(screen.getByText("Markets")).toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("calls onTabChange when Admin tab is clicked", () => {
    const onTabChange = vi.fn();
    render(<Header wallet={makeWallet()} tab="markets" onTabChange={onTabChange} isOwner={true} />);
    fireEvent.click(screen.getByText("Admin"));
    expect(onTabChange).toHaveBeenCalledWith("admin");
  });

  it("shows disconnect button when connected", () => {
    const w = makeWallet({
      isConnected: true,
      isCorrectChain: true,
      address: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
    });
    render(<Header wallet={w} {...defaultProps} />);
    const btn = screen.getByTitle("Disconnect wallet");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(w.disconnect).toHaveBeenCalledOnce();
  });
});
