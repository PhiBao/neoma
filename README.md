# Neoma — Privacy-Preserving Opinion Markets on Ethereum

> Encrypted opinion polls with real stakes — powered by Fully Homomorphic Encryption on [Zama's fhEVM](https://docs.zama.ai/fhevm).

Neoma is an **opinion market**, not a prediction market. Users pick a side on multi-option questions (2–10 choices, e.g. *"CR7 or M10?"*, *"Best L2? Arbitrum / Optimism / Base / zkSync"*), stake ETH, and the majority side wins the pool. Think surveys and trending topics with a touch of gambling — the side with more voters takes everything.

Votes are encrypted client-side, tallied homomorphically on-chain, and only the winning side is revealed. Individual choices stay permanently private.

**Live on Sepolia testnet** · Smart Contracts + React Frontend + Auto-finalization Bot · 42 contract tests + frontend tests

---

## Why FHE for Opinion Markets?

**Prediction markets don't need encryption** — they trade shares whose price reflects public information. Seeing others' positions is a _feature_, not a bug.

**Opinion markets are fundamentally different.** There's no objective truth to converge on — it's pure sentiment. If voters can see the current split, they herd toward the majority to win, and the result just reflects groupthink instead of genuine opinion. Encryption is the fix:

| Problem | FHE Solution |
|---------|-------------|
| Voters copy the majority to win | Individual votes are **never visible** on-chain |
| Whales signal to manipulate opinion | Encrypted counters hide all tallies until resolution |
| Privacy leaks via transaction analysis | All votes use the same encrypted format — indistinguishable |
| Trust in a centralized poll operator | Homomorphic computation is **verifiable on-chain** |

This makes Neoma a real-world demonstration of how FHE turns any survey, poll, or trending-topic vote into a **truthful revelation system** — useful anywhere honest crowd sentiment matters more than information aggregation.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                     Frontend (React)                      │
│  EIP-6963 Wallet · FHE Encryption · ethers.js v6         │
│  Glass UI · Skeleton loading · Wallet-less browsing      │
│                                                           │
│  ┌─────────────┐  encryptVote()  ┌──────────────────────┐│
│  │ @zama-fhe/  │───────────────→ │  Vote TX with        ││
│  │ relayer-sdk │  (WASM + ZKP)   │  encrypted input     ││
│  └─────────────┘                 └──────────┬───────────┘│
└─────────────────────────────────────────────┼────────────┘
                                              │
                    ┌─────────────────────────▼────────────────────┐
                    │           Sepolia (fhEVM-enabled)            │
                    │                                              │
                    │  MarketFactory ──creates──→ OpinionMarket    │
                    │                             (2-10 options)   │
                    │                                              │
                    │  vote():                                     │
                    │    euint8 choice = FHE.fromExternal(proof)   │
                    │    for each option i:                        │
                    │      isVoteForI = FHE.eq(choice, i)          │
                    │      counters[i] += FHE.select(…, 1, 0)     │
                    │                                              │
                    │  resolveMarket():                            │
                    │    FHE.ge() across all counters → winner     │
                    │    FHE.makePubliclyDecryptable(handles[])    │
                    │                 │                             │
                    └─────────────────┼────────────────────────────┘
                                      │  KMS decryption callback
                    ┌─────────────────▼────────────────────────────┐
                    │         Zama KMS Gateway (Sepolia)           │
                    │   Produces threshold-decryption proof        │
                    │   → finalizeResolution(cleartexts, proof)    │
                    └──────────────────────────────────────────────┘
```

---

## Market Lifecycle

```
  ╭──────────╮    vote()     ╭───────────╮  resolveMarket()  ╭───────────╮
  │  Active   │─────────────→│  Active    │─────────────────→│ Resolving │
  │(voting    │  (encrypted  │ (voting    │  (owner only,    │ (awaiting │
  │  open)    │   stakes)    │  ended)    │   FHE.ge + FHE   │  KMS      │
  ╰──────────╯              ╰───────────╯   .select)         │  proof)   │
                                                              ╰─────┬─────╯
       ╭────────────────────────────────────────────────────────────▼──╮
       │                    finalizeResolution()                       │
       │         KMS delivers decryption proof → winner revealed       │
       ╰──────────────────────────────┬───────────────────────────────╯
                                      ▼
                              ╭──────────────╮
                              │   Resolved    │
                              │  winner shown │
                              │  % bars shown │
                              ╰───────┬──────╯
                                      ▼
                    prepareClaim() → executeClaim() → ETH payout

  Timeout path:  Active/Resolving ──(deadline passed)──→ Expired → claimRefund()
```

**States**: Active → Resolving → Resolved → Claims | Active/Resolving → Expired → Refunds

---

## Tech Stack

### Smart Contracts
| Component | Tech |
|-----------|------|
| Language | Solidity ^0.8.24 |
| FHE Library | `@fhevm/solidity` v0.11.1 (Zama) |
| FHE Types | `ebool`, `euint8`, `euint32`, `externalEuint8` |
| Framework | Hardhat 2.28 + TypeChain |
| Compile | `viaIR: true` (IR pipeline for complex constructors) |
| Network | Ethereum Sepolia (fhEVM-enabled) |

### Frontend
| Component | Tech |
|-----------|------|
| UI | React 19 + TypeScript 5.9 + Vite 7 |
| Styling | Tailwind CSS v4 (glass morphism, ambient orbs, animated bars) |
| Blockchain | ethers.js v6 (JSON-RPC + WebSocket provider) |
| FHE Client | `@zama-fhe/relayer-sdk` v0.4 (WASM) |
| Charts | Recharts (pie, bar, KPI cards) |
| Wallet | EIP-6963 multi-wallet discovery |
| Real-time | WebSocket event subscriptions + auto-reconnect |
| Tests | Vitest 3.2 + Testing Library |

---

## FHE Deep Dive

### How Votes Stay Private

1. **Client-side encryption** — The browser loads the Zama WASM module via `@zama-fhe/relayer-sdk`. When a user votes, their choice (0 to N−1 for N options) is encrypted into an `externalEuint8` with a zero-knowledge proof that the plaintext is valid, all before leaving the browser.

2. **On-chain homomorphic tallying** — The contract never decrypts individual votes. Instead it uses FHE arithmetic across all option counters:
   ```solidity
   // For each option i, check if user voted for it
   ebool isVoteForI = FHE.eq(encryptedChoice, FHE.asEuint8(uint8(i)));
   euint8 increment = FHE.select(isVoteForI, FHE.asEuint8(1), FHE.asEuint8(0));
   _optionCounters[i] = FHE.add(_optionCounters[i], FHE.asEuint32(increment));
   ```
   After 1000 votes across 5 options, all counters are still encrypted 32-bit integers — no one on-chain knows any tally.

3. **Resolution via encrypted comparison** — The contract owner triggers resolution, which iterates all counters to find the maximum:
   ```solidity
   // Compare each option's counter to find winner(s)
   ebool isGe = FHE.ge(_optionCounters[i], bestCount);
   bestIdx = FHE.select(isGe, FHE.asEuint8(uint8(i)), bestIdx);
   bestCount = FHE.select(isGe, _optionCounters[i], bestCount);
   // All counters + winner marked for decryption
   FHE.makePubliclyDecryptable(handle);
   ```

4. **KMS threshold decryption** — Zama's Key Management Service (a distributed threshold network) produces a decryption proof off-chain. Anyone can submit this proof to `finalizeResolution()`, which verifies it with `FHE.checkSignatures()` and transitions the market to Resolved. Ties are supported — multiple winners share the pool.

5. **Private claim verification** — When a voter claims their payout, the contract computes `FHE.eq(userVote, winnerIndex)` on their encrypted vote without revealing it. The KMS decrypts only the boolean eligibility result.

### What's Never Revealed

| Data | Visibility |
|------|-----------|
| Individual vote choice | **Never** — stays encrypted forever |
| Running tallies during voting | **Never** — encrypted counters |
| Winner index + count | **Only after resolution** |
| Per-voter eligibility | **Only to that voter** (during claim) |
| Losing option's count | **Derivable** (totalVoters − winnerCount) |

### ACL & Handle Security

Every FHE ciphertext has an on-chain Access Control List. The contract calls `FHE.allowThis()` on all handles to grant itself computation rights, and `FHE.makePubliclyDecryptable()` only on the two resolution values. Without explicit ACL grants, no external contract or EOA can read or operate on the encrypted data.

---

## Project Structure

```
neoma/
├── contracts/
│   ├── OpinionMarket.sol           # Core market: vote, resolve, claim (2-10 options, creator fees)
│   ├── MarketFactory.sol           # Factory: deploy + index markets (tags, fee config)
│   └── interfaces/
│       ├── IOpinionMarket.sol      # Full interface + errors + events
│       └── IMarketFactory.sol      # Factory interface
├── deploy/
│   └── deploy.ts                   # Hardhat deploy script
├── test/                           # Hardhat integration tests (42 passing)
├── bot/
│   ├── autoFinalizer.ts            # Auto-finalization bot (polls KMS, calls finalizeResolution)
│   ├── package.json
│   └── README.md
├── frontend/
│   ├── api/
│   │   └── og.ts                   # Vercel Edge Function for OG meta tag link previews
│   ├── src/
│   │   ├── App.tsx                 # Root: URL hash routing, owner check, tabs, ambient bg
│   │   ├── fhe.ts                  # FHE encryption wrapper (relayer-sdk)
│   │   ├── main.tsx                # Entry point with ErrorBoundary
│   │   ├── index.css               # Animations: glass, card-glow, skeleton, bar-fill
│   │   ├── components/
│   │   │   ├── MarketCard.tsx      # Card with inline voting + result bars + tag pills
│   │   │   ├── MarketDetail.tsx    # Full detail: vote/resolve/claim/expire + share button
│   │   │   ├── AdminPage.tsx       # Owner-only market creation (tags, fee config)
│   │   │   ├── Header.tsx          # Glass nav + 3-tab (Markets/Analytics/Admin) + WS status
│   │   │   ├── ActivityFeed.tsx    # Real-time event timeline (global + per-market)
│   │   │   ├── AnalyticsDashboard.tsx # KPI cards, charts, top markets (Recharts)
│   │   │   ├── ErrorBoundary.tsx   # Crash recovery wrapper
│   │   │   └── WalletPickerModal.tsx  # EIP-6963 multi-wallet picker (a11y)
│   │   ├── hooks/
│   │   │   ├── useMarkets.ts       # Market data fetching + WS subscriptions + tag fetching
│   │   │   ├── useWebSocket.ts     # ethers WebSocketProvider with WebSocketCreator pattern
│   │   │   ├── useWallet.ts        # EIP-6963 wallet + read-only provider fallback
│   │   │   └── useFheLoading.ts    # Observable FHE WASM loading state
│   │   ├── utils/
│   │   │   └── parseContractError.ts  # Centralized contract error parsing
│   │   ├── contracts/
│   │   │   └── index.ts            # ABIs + deployed addresses
│   │   └── __tests__/              # Frontend tests (Vitest + Testing Library)
│   ├── vercel.json                 # COOP/COEP headers + /share rewrite for OG previews
│   └── package.json
├── hardhat.config.ts
└── package.json
```

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 20
- **npm** ≥ 7
- A browser wallet (MetaMask, Rabby, etc.) on **Sepolia testnet**
- Sepolia ETH for gas + voting stakes ([faucet](https://sepoliafaucet.com))

### 1. Install & Compile Contracts

```bash
git clone <repo-url> && cd neoma
npm install
npx hardhat compile
```

### 2. Configure Environment

```bash
npx hardhat vars set MNEMONIC       # deployer wallet mnemonic
npx hardhat vars set INFURA_API_KEY  # Infura project ID
```

### 3. Deploy to Sepolia

```bash
npx hardhat deploy --network sepolia
```

Copy the deployed factory address and update `frontend/.env`:

```env
VITE_FACTORY_ADDRESS=0x<your-deployed-factory-address>
VITE_INFURA_KEY=<your-infura-api-key>
```

### 4. Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Markets load without a wallet using the Infura read-only provider. Connect your wallet to vote or create markets.

### 5. Run Tests

```bash
# Frontend tests (62 tests)
cd frontend && npm test

# Contract compilation check
cd .. && npx hardhat compile
```

---

## Usage Flow

1. **Browse without a wallet** — Markets load via Infura read-only provider. View questions, options, results, and stats without connecting.
2. **Owner creates a market** — Sets question, 2–10 options, stake amount, and voting window via the Admin page.
3. **Users vote** — Click an option on any market card. If not connected, the wallet picker opens automatically. The vote is FHE-encrypted in-browser and submitted with the stake. A confirmation panel shows the choice and stake before submitting.
4. **Voting ends** — The market badge switches to "Voting Ended". No more votes accepted.
5. **Owner resolves** — Triggers `resolveMarket()` which performs encrypted comparison across all option counters and requests KMS decryption. Market enters "Resolving" state.
6. **KMS decrypts** — After ~1–5 minutes, the Zama KMS gateway delivers the decryption proof. Anyone can call `finalizeResolution()` with this proof.
7. **Results shown** — The market displays the winner(s), animated vote percentage bars for each option, and payout per winner. Ties are supported.
8. **Winners claim** — Each winner calls `prepareClaim()` → `executeClaim()` (with another KMS proof) to receive their share of the pool.
9. **Timeout safety** — If resolution doesn't happen within 24h of voting end, anyone can call `expireMarket()` and all voters get their stakes refunded.

---

## Roadmap

### Phase 1 — Core Protocol ✅
- [x] FHE-encrypted voting with homomorphic tallying
- [x] Multi-option markets (2–10 choices with FHE-encrypted counters per option)
- [x] Full market lifecycle (create → vote → resolve → claim/refund)
- [x] Tie detection and multi-winner payouts
- [x] Owner-restricted market creation and resolution

### Phase 2 — Production Frontend ✅
- [x] React frontend with wallet-less browsing (Infura read-only fallback)
- [x] EIP-6963 multi-wallet discovery + auto-connect prompt on vote
- [x] Client-side FHE encryption via Zama relayer SDK with loading progress
- [x] Glass morphism UI with ambient effects, skeleton loading, animated bars
- [x] Inline card voting (binary) + full detail page (multi-option)
- [x] Prominent vote confirmation panel with stake display
- [x] Live countdown timers, auto-refresh (30s + visibility change)
- [x] Search & filter markets by name or state
- [x] Dismissible errors, copy address, Etherscan links, dynamic page titles
- [x] Keyboard-accessible wallet picker (focus trap, Escape, aria)
- [x] ErrorBoundary crash recovery, centralized error parsing
- [x] React.memo optimization, batch market loading
- [x] Mobile-responsive header + hamburger menu
- [x] 62 unit tests across 6 test files

### Phase 3 — Protocol Expansion ✅
- [x] Real-time market updates via WebSocket provider (event subscriptions + auto-reconnect)
- [x] Activity feed (global + per-market event timeline with block scanning)
- [x] Analytics dashboard (KPI cards, pie/bar charts, top markets, sortable table via Recharts)
- [x] Market categories and tagging system (on-chain, up to 5 tags per market, filter by tag)
- [x] On-chain market creator fees (configurable 0–5% of pool, deducted at claim time)
- [x] Auto-finalization bot (Node.js script monitors Resolving markets, polls Zama KMS, auto-calls finalizeResolution)
- [x] Shareable links with URL hash routing + Vercel Edge Function for OG meta tag previews

### Phase 4 — Decentralization & Scaling
- [ ] Permissionless market creation (with stake-based spam prevention)
- [ ] Cross-chain deployment (L2s with fhEVM support)
- [ ] Oracle integration for auto-resolution of factual markets
- [ ] Subgraph indexing (The Graph) for fast frontend queries
- [ ] Formal verification of core contract invariants

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `npx hardhat compile` | Compile all Solidity contracts |
| `npx hardhat deploy --network sepolia` | Deploy to Sepolia testnet |
| `npx hardhat test` | Run 42 contract tests (+ 7 pending KMS-only stubs) |
| `npm run test` *(frontend/)* | Run frontend tests |
| `npm run dev` *(frontend/)* | Start dev server at localhost:5173 |
| `npm run build` *(frontend/)* | Production build |
| `npm start` *(bot/)* | Run auto-finalization bot |

---

## References

- [Zama fhEVM Documentation](https://docs.zama.ai/fhevm)
- [fhEVM Solidity Library](https://github.com/zama-ai/fhevm)
- [Zama Relayer SDK](https://www.npmjs.com/package/@zama-fhe/relayer-sdk)
- [EIP-6963: Multi Injected Provider Discovery](https://eips.ethereum.org/EIPS/eip-6963)
- [Hardhat Documentation](https://hardhat.org/docs)

---

## License

BSD-3-Clause-Clear — see [LICENSE](LICENSE).

---

**Built for the Zama Bounty Program** · Neoma Protocol
