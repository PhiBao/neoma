import { useState, useEffect, useRef, useCallback } from "react";
import { WebSocketProvider, Contract } from "ethers";
import type { WebSocketLike } from "ethers";
import {
  SEPOLIA_WS,
  SEPOLIA_CHAIN_ID,
  MARKET_FACTORY_ADDRESS,
  MarketFactoryABI,
  OpinionMarketABI,
} from "../contracts";

export type WsStatus = "connected" | "connecting" | "disconnected";

export interface UseWebSocketReturn {
  status: WsStatus;
  /** Subscribe for market-level events; returns cleanup fn */
  subscribeMarket: (
    marketAddress: string,
    handlers: MarketEventHandlers,
  ) => () => void;
  /** Subscribe for factory-level events; returns cleanup fn */
  subscribeFactory: (handler: (marketId: bigint, marketAddress: string) => void) => () => void;
}

export interface MarketEventHandlers {
  onVoteCast?: (voter: string) => void;
  onResolutionInitiated?: () => void;
  onMarketResolved?: (winnerIndices: number[], totalWinnerVoters: number) => void;
  onMarketExpired?: () => void;
  onRewardClaimed?: (voter: string, amount: bigint) => void;
}

/**
 * Manages a persistent WebSocket connection to Sepolia for real-time event
 * subscriptions. Auto-reconnects on disconnection with exponential backoff.
 */
export function useWebSocket(): UseWebSocketReturn {
  const [status, setStatus] = useState<WsStatus>("disconnected");
  const providerRef = useRef<WebSocketProvider | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reconnectDelay = useRef(1000);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!MARKET_FACTORY_ADDRESS || !import.meta.env.VITE_INFURA_KEY) return;

    // Clean up previous connection
    if (providerRef.current) {
      try { providerRef.current.destroy(); } catch { /* ignore */ }
      providerRef.current = null;
    }

    setStatus("connecting");

    try {
      // Use a WebSocketCreator so we can attach lifecycle listeners via
      // addEventListener on the real WebSocket *before* ethers sets its
      // own onopen/onmessage/onerror handlers (those are independent of
      // addEventListener, so both fire).
      const ws = new WebSocketProvider(
        (): WebSocketLike => {
          const socket = new WebSocket(SEPOLIA_WS);

          socket.addEventListener("open", () => {
            if (!mountedRef.current) return;
            setStatus("connected");
            reconnectDelay.current = 1000; // reset backoff on success
          });

          socket.addEventListener("close", () => {
            if (!mountedRef.current) return;
            setStatus("disconnected");
            providerRef.current = null;
            // Schedule reconnect with exponential backoff + jitter (max 60s)
            const jitter = Math.random() * reconnectDelay.current * 0.2;
            reconnectTimer.current = setTimeout(() => {
              reconnectDelay.current = Math.min(reconnectDelay.current * 2, 60_000);
              connect();
            }, reconnectDelay.current + jitter);
          });

          socket.addEventListener("error", () => {
            // Error is followed by close event, which triggers reconnect
          });

          return socket as unknown as WebSocketLike;
        },
        SEPOLIA_CHAIN_ID,
        { staticNetwork: true },
      );

      providerRef.current = ws;
    } catch {
      setStatus("disconnected");
      reconnectTimer.current = setTimeout(connect, reconnectDelay.current);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      if (providerRef.current) {
        try { providerRef.current.destroy(); } catch { /* ignore */ }
        providerRef.current = null;
      }
    };
  }, [connect]);

  const subscribeFactory = useCallback(
    (handler: (marketId: bigint, marketAddress: string) => void) => {
      const ws = providerRef.current;
      if (!ws || !MARKET_FACTORY_ADDRESS) return () => {};

      const factory = new Contract(MARKET_FACTORY_ADDRESS, MarketFactoryABI, ws);
      const eventName = "MarketCreated";

      const listener = (marketId: bigint, marketAddress: string) => {
        handler(marketId, marketAddress);
      };

      factory.on(eventName, listener);
      return () => {
        factory.off(eventName, listener);
      };
    },
    [],
  );

  const subscribeMarket = useCallback(
    (marketAddress: string, handlers: MarketEventHandlers) => {
      const ws = providerRef.current;
      if (!ws) return () => {};

      const market = new Contract(marketAddress, OpinionMarketABI, ws);
      const cleanups: (() => void)[] = [];

      if (handlers.onVoteCast) {
        const fn = (voter: string) => handlers.onVoteCast!(voter);
        market.on("VoteCast", fn);
        cleanups.push(() => market.off("VoteCast", fn));
      }
      if (handlers.onResolutionInitiated) {
        const fn = () => handlers.onResolutionInitiated!();
        market.on("ResolutionInitiated", fn);
        cleanups.push(() => market.off("ResolutionInitiated", fn));
      }
      if (handlers.onMarketResolved) {
        const fn = (winnerIndices: bigint[], total: bigint) =>
          handlers.onMarketResolved!(winnerIndices.map(Number), Number(total));
        market.on("MarketResolved", fn);
        cleanups.push(() => market.off("MarketResolved", fn));
      }
      if (handlers.onMarketExpired) {
        const fn = () => handlers.onMarketExpired!();
        market.on("MarketExpired", fn);
        cleanups.push(() => market.off("MarketExpired", fn));
      }
      if (handlers.onRewardClaimed) {
        const fn = (voter: string, amount: bigint) => handlers.onRewardClaimed!(voter, amount);
        market.on("RewardClaimed", fn);
        cleanups.push(() => market.off("RewardClaimed", fn));
      }

      return () => cleanups.forEach((fn) => fn());
    },
    [],
  );

  return { status, subscribeMarket, subscribeFactory };
}
