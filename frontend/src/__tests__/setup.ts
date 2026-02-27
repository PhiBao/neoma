import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

// Mock window.ethereum globally
Object.defineProperty(window, "ethereum", {
  value: undefined,
  writable: true,
  configurable: true,
});

// Mock import.meta.env
vi.stubEnv("VITE_FACTORY_ADDRESS", "0x1234567890abcdef1234567890abcdef12345678");
vi.stubEnv("VITE_INFURA_KEY", "test-infura-key");
