import MarketFactoryABI from "./MarketFactoryABI.json";
import OpinionMarketABI from "./OpinionMarketABI.json";

// TODO: Replace with your deployed MarketFactory address on Sepolia
export const MARKET_FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS || "";

export const SEPOLIA_CHAIN_ID = 11155111;

export const SEPOLIA_RPC = `https://sepolia.infura.io/v3/${import.meta.env.VITE_INFURA_KEY || ""}`;
export const SEPOLIA_WS = `wss://sepolia.infura.io/ws/v3/${import.meta.env.VITE_INFURA_KEY || ""}`;

if (!import.meta.env.VITE_INFURA_KEY) {
  console.warn("[neoma] VITE_INFURA_KEY is not set — RPC calls will fail. Add it to your .env file.");
}

export { MarketFactoryABI, OpinionMarketABI };
