import { useState, useEffect } from "react";
import { getFheLoadingState, onFheLoadingChange, type FheLoadingState } from "../fhe";

/**
 * React hook that subscribes to the FHE SDK loading state.
 * Returns the current state: "idle" | "downloading" | "initializing" | "ready"
 */
export function useFheLoading(): FheLoadingState {
  const [state, setState] = useState<FheLoadingState>(getFheLoadingState);

  useEffect(() => {
    const unsubscribe = onFheLoadingChange(setState);
    return unsubscribe;
  }, []);

  return state;
}

/**
 * Returns a user-friendly label for the FHE loading state.
 */
export function fheLoadingLabel(state: FheLoadingState): string {
  switch (state) {
    case "downloading": return "Downloading encryption engine…";
    case "initializing": return "Initializing FHE…";
    case "ready": return "Encrypting & submitting…";
    default: return "Encrypting…";
  }
}
