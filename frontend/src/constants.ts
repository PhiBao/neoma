/** How many blocks back to scan for activity events (~17h on Sepolia @ 12s blocks) */
export const LOOKBACK_BLOCKS = 5_000;

/** Max block range per eth_getLogs call (most free-tier RPCs cap at 10k) */
export const MAX_LOG_BLOCK_RANGE = 9_999;

/** Default poll interval for market refresh when WS is down (ms) */
export const MARKET_POLL_INTERVAL_MS = 30_000;

/** Longer poll interval when WebSocket is connected (ms) */
export const MARKET_WS_POLL_INTERVAL_MS = 60_000;

/** Default number of activity feed events to show */
export const ACTIVITY_FEED_LIMIT = 25;

/** Maximum creator fee in basis points (5%) */
export const MAX_FEE_BPS = 500;
