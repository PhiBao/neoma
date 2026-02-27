import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateMarketModal } from "../components/CreateMarketModal";

// Mock ethers
vi.mock("ethers", () => {
  const parseEther = (val: string) => BigInt(Math.floor(parseFloat(val) * 1e18));
  return {
    ethers: { parseEther },
    Contract: vi.fn(),
    JsonRpcSigner: vi.fn(),
  };
});

// Mock contracts module
vi.mock("../contracts", () => ({
  MARKET_FACTORY_ADDRESS: "0x1234567890abcdef1234567890abcdef12345678",
  MarketFactoryABI: [],
}));

describe("CreateMarketModal", () => {
  const onCreated = vi.fn();
  const onClose = vi.fn();

  const mockSigner = {} as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the modal with all form fields", () => {
    render(
      <CreateMarketModal signer={mockSigner} onCreated={onCreated} onClose={onClose} />
    );

    expect(screen.getByRole("heading", { name: "Create Market" })).toBeInTheDocument();
    expect(screen.getByText("Launch a new encrypted opinion market")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Who is the GOAT/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. CR7")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. M10")).toBeInTheDocument();
    // Both heading + submit button have "Create Market" text
    const createButtons = screen.getAllByText("Create Market");
    expect(createButtons.length).toBe(2);
  });

  it("has default values for stake and duration", () => {
    render(
      <CreateMarketModal signer={mockSigner} onCreated={onCreated} onClose={onClose} />
    );

    const stakeInput = screen.getByDisplayValue("0.001");
    const durationInput = screen.getByDisplayValue("24");
    expect(stakeInput).toBeInTheDocument();
    expect(durationInput).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    render(
      <CreateMarketModal signer={mockSigner} onCreated={onCreated} onClose={onClose} />
    );

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when backdrop is clicked", () => {
    render(
      <CreateMarketModal signer={mockSigner} onCreated={onCreated} onClose={onClose} />
    );

    // The backdrop is the first child div with absolute inset-0
    const backdrop = document.querySelector(".absolute.inset-0.bg-black\\/60");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows error when submitting with empty fields", async () => {
    render(
      <CreateMarketModal signer={mockSigner} onCreated={onCreated} onClose={onClose} />
    );

    // Click Create Market button (the submit one, not the title)
    const buttons = screen.getAllByText("Create Market");
    // The submit button is the last one
    const submitBtn = buttons[buttons.length - 1];
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("All fields are required")).toBeInTheDocument();
    });
  });

  it("allows typing in all fields", () => {
    render(
      <CreateMarketModal signer={mockSigner} onCreated={onCreated} onClose={onClose} />
    );

    const questionInput = screen.getByPlaceholderText(/Who is the GOAT/);
    const optionAInput = screen.getByPlaceholderText("e.g. CR7");
    const optionBInput = screen.getByPlaceholderText("e.g. M10");

    fireEvent.change(questionInput, { target: { value: "Test question?" } });
    fireEvent.change(optionAInput, { target: { value: "Option1" } });
    fireEvent.change(optionBInput, { target: { value: "Option2" } });

    expect(questionInput).toHaveValue("Test question?");
    expect(optionAInput).toHaveValue("Option1");
    expect(optionBInput).toHaveValue("Option2");
  });

  it("shows Creating... state when transaction is in progress", async () => {
    // Mock Contract to return a pending promise
    const { Contract } = await import("ethers");
    const waitFn = vi.fn(() => new Promise(() => {})); // never resolves
    const createMarket = vi.fn(() => Promise.resolve({ wait: waitFn }));
    (Contract as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      createMarket,
    }));

    render(
      <CreateMarketModal signer={mockSigner} onCreated={onCreated} onClose={onClose} />
    );

    // Fill all fields
    fireEvent.change(screen.getByPlaceholderText(/Who is the GOAT/), {
      target: { value: "Test?" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. CR7"), {
      target: { value: "A" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. M10"), {
      target: { value: "B" },
    });

    // Submit
    const buttons = screen.getAllByText("Create Market");
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("Creating...")).toBeInTheDocument();
    });
  });
});
