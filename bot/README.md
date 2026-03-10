# Auto-Finalization Bot

Monitors deployed Opinion Markets for those in **Resolving** state and automatically calls `finalizeResolution()` once Zama KMS decryption proofs are available.

## Setup

```bash
cd bot
npm install
```

## Usage

```bash
# Set environment variables
export INFURA_KEY="your-infura-key"
export PRIVATE_KEY="0xYOUR_PRIVATE_KEY"   # bot wallet (needs Sepolia ETH for gas)
export FACTORY_ADDRESS="0xDEPLOYED_FACTORY"

# Run with tsx (no build step)
npm start

# Or build + run
npm run build
npm run start:built
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `INFURA_KEY` | *required* | Infura project key |
| `PRIVATE_KEY` | *required* | Bot wallet private key |
| `FACTORY_ADDRESS` | *required* | MarketFactory contract address |
| `POLL_INTERVAL_MS` | `30000` | Scan interval in milliseconds |
| `RELAYER_URL` | `https://relayer-sepolia.zama.ai` | Zama relayer endpoint |

## How It Works

1. Every `POLL_INTERVAL_MS`, scans all markets from the factory
2. For markets in **Resolving** state (state `1`), fetches FHE counter handles
3. Queries the Zama relayer for publicly-decryptable proofs
4. When proofs are available, calls `finalizeResolution()` on-chain
5. Already-finalized markets are cached to avoid redundant checks
