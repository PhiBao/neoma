/**
 * Parse contract / ethers v6 errors into human-readable messages.
 * Centralizes error handling that was duplicated across vote, resolve, claim flows.
 */
export function parseContractError(err: unknown): string {
  if (!err) return "Unknown error";

  // ethers v6 error object
  const e = err as Record<string, unknown>;

  // User rejected the transaction
  if (e.code === "ACTION_REJECTED" || (typeof e.message === "string" && e.message.includes("user rejected"))) {
    return "Transaction rejected by user";
  }

  // Revert reason from the contract
  if (typeof e.reason === "string") {
    return e.reason;
  }

  // CALL_EXCEPTION with revert data
  if (e.code === "CALL_EXCEPTION" && typeof e.message === "string") {
    // Try to extract reason= from the message
    const reasonMatch = e.message.match(/reason="([^"]+)"/);
    if (reasonMatch) return reasonMatch[1];
    // Try revert string
    const revertMatch = e.message.match(/reverted with reason string '([^']+)'/);
    if (revertMatch) return revertMatch[1];
  }

  // Generic Error with message
  if (err instanceof Error) {
    const msg = err.message;

    // Extract reason= pattern (common in ethers v6 stringified errors)
    const reasonMatch = msg.match(/reason="([^"]+)"/);
    if (reasonMatch) return reasonMatch[1];

    // Custom error names from the contract
    const customMatch = msg.match(/error=\{[^}]*"name":"(\w+)"/);
    if (customMatch) return customMatch[1];

    // Insufficient funds
    if (msg.includes("insufficient funds")) return "Insufficient funds for transaction";

    // Nonce issues
    if (msg.includes("nonce")) return "Transaction nonce error — try resetting your wallet";

    // Network errors
    if (msg.includes("NETWORK_ERROR") || msg.includes("network")) return "Network error — check your connection";

    // Truncate long messages
    return msg.length > 150 ? msg.slice(0, 147) + "…" : msg;
  }

  return String(err).slice(0, 150);
}
