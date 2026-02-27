import { describe, it, expect } from "vitest";
import { stateLabel } from "../hooks/useMarkets";

describe("stateLabel", () => {
  it("returns Active for state 0", () => {
    expect(stateLabel(0)).toBe("Active");
  });

  it("returns Resolving for state 1", () => {
    expect(stateLabel(1)).toBe("Resolving");
  });

  it("returns Resolved for state 2", () => {
    expect(stateLabel(2)).toBe("Resolved");
  });

  it("returns Cancelled for state 3", () => {
    expect(stateLabel(3)).toBe("Cancelled");
  });

  it("returns Expired for state 4", () => {
    expect(stateLabel(4)).toBe("Expired");
  });

  it("returns Unknown for invalid state", () => {
    expect(stateLabel(99)).toBe("Unknown");
  });

  it("returns Unknown for negative state", () => {
    expect(stateLabel(-1)).toBe("Unknown");
  });
});
