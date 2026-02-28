# Neoma — Privacy-Preserving Opinion Markets on Ethereum

> Encrypted opinion polls with real stakes — powered by Fully Homomorphic Encryption on [Zama's fhEVM](https://docs.zama.ai/fhevm).

Neoma is an **opinion market**, not a prediction market. Users pick a side on binary questions (e.g. *"CR7 or M10?"*, *"Tabs or Spaces?"*), stake ETH, and the majority side wins the pool. Think surveys and trending topics with a touch of gambling — the side with more voters takes everything.

Votes are encrypted client-side, tallied homomorphically on-chain, and only the winning side is revealed. Individual choices stay permanently private.

**Live on Sepolia testnet** · Smart Contracts + React Frontend · 69 tests

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
                    │                                              │
                    │  vote():                                     │
                    │    euint8 choice = FHE.fromExternal(proof)   │
                    │    _counterA = FHE.add(_counterA, voteForA)  │
                    │    _counterB = FHE.add(_counterB, voteForB)  │
                    │                                              │
                    │  resolveMarket():                            │
                    │    ebool aWins = FHE.ge(_counterA, _counterB)│
                    │    FHE.makePubliclyDecryptable(winner)       │
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
| Network | Ethereum Sepolia (fhEVM-enabled) |

### Frontend
| Component | Tech |
|-----------|------|
| UI | React 19 + TypeScript 5.9 + Vite 7 |
| Styling | Tailwind CSS v4 |
| Blockchain | ethers.js v6 |
| FHE Client | `@zama-fhe/relayer-sdk` v0.4 (WASM) |
| Wallet | EIP-6963 multi-wallet discovery |
| Tests | Vitest 3.2 + Testing Library (69 tests) |

---

## FHE Deep Dive

### How Votes Stay Private

1. **Client-side encryption** — The browser loads the Zama WASM module via `@zama-fhe/relayer-sdk`. When a user votes, their choice (0 or 1) is encrypted into an `externalEuint8` with a zero-knowledge proof that the plaintext is valid, all before leaving the browser.

2. **On-chain homomorphic tallying** — The contract never decrypts individual votes. Instead it uses FHE arithmetic:
   ```solidity
   // Normalize to binary
   euint8 normalizedChoice = FHE.select(FHE.ne(rawChoice, FHE.asEuint8(0)),
                                         FHE.asEuint8(1), FHE.asEuint8(0));
   // voteForA = 1 - choice (1 if A, 0 if B)
   euint8 voteForA = FHE.sub(FHE.asEuint8(1), normalizedChoice);

   // Homomorphic counter increment — adds to encrypted running total
   _counterA = FHE.add(_counterA, voteForA);
   _counterB = FHE.add(_counterB, normalizedChoice);
   ```
   After 1000 votes, `_counterA` and `_counterB` are still encrypted 32-bit integers — no one on-chain knows the tally.

3. **Resolution via encrypted comparison** — The contract owner triggers resolution:
   ```solidity
   ebool aWins = FHE.ge(_counterA, _counterB);  // encrypted ≥ comparison
   _encryptedWinnerIndex = FHE.select(aWins, FHE.asEuint8(0), FHE.asEuint8(1));
   _encryptedWinnerCount = FHE.select(aWins, _counterA, _counterB);
   FHE.makePubliclyDecryptable(_encryptedWinnerIndex);
   FHE.makePubliclyDecryptable(_encryptedWinnerCount);
   ```
   Only the winner index and winner count are marked for decryption — not the individual counters.

4. **KMS threshold decryption** — Zama's Key Management Service (a distributed threshold network) produces a decryption proof off-chain. Anyone can submit this proof to `finalizeResolution()`, which verifies it with `FHE.checkSignatures()` and transitions the market to Resolved.

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
│   ├── OpinionMarket.sol           # Core market: vote, resolve, claim (455 LOC)
│   ├── MarketFactory.sol           # Factory: deploy + index markets (103 LOC)
│   └── interfaces/
│       ├── IOpinionMarket.sol      # Full interface + errors + events
│       └── IMarketFactory.sol      # Factory interface
├── deploy/
│   └── deploy.ts                   # Hardhat deploy script
├── test/                           # Hardhat integration tests
├── frontend/
│   ├── src/
│   │   ├── App.tsx                 # Root: routing, owner check, tabs
│   │   ├── fhe.ts                  # FHE encryption wrapper (relayer-sdk)
│   │   ├── components/
│   │   │   ├── MarketCard.tsx      # Card with direct voting + result bars
│   │   │   ├── MarketDetail.tsx    # Full detail: vote/resolve/claim/expire
│   │   │   ├── AdminPage.tsx       # Owner-only market creation
│   │   │   ├── CreateMarketModal.tsx
│   │   │   ├── Header.tsx          # Wallet connect + network status
│   │   │   └── WalletPickerModal.tsx  # EIP-6963 multi-wallet picker
│   │   ├── hooks/
│   │   │   ├── useMarkets.ts       # Market data fetching + state helpers
│   │   │   └── useWallet.ts        # EIP-6963 wallet management
│   │   ├── contracts/
│   │   │   └── index.ts            # ABIs + deployed addresses
│   │   └── __tests__/              # 69 tests (Vitest + Testing Library)
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
```

### 4. Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`, connect your wallet, and create your first market.

### 5. Run Tests

```bash
# Frontend tests (69 tests)
cd frontend && npm test

# Contract compilation check
cd .. && npx hardhat compile
```

---

## Usage Flow

1. **Owner creates a market** — Sets question, two options, stake amount, and voting window via the Admin page.
2. **Users vote** — Connect wallet, pick an option on any market card. The vote is FHE-encrypted in-browser and submitted with the stake.
3. **Voting ends** — The market badge switches to "Voting Ended". No more votes accepted.
4. **Owner resolves** — Triggers `resolveMarket()` which performs encrypted comparison and requests KMS decryption. Market enters "Resolving" state.
5. **KMS decrypts** — After ~1–5 minutes, the Zama KMS gateway delivers the decryption proof. Anyone can call `finalizeResolution()` with this proof.
6. **Results shown** — The market displays the winner, vote percentages for each option, and payout per winner.
7. **Winners claim** — Each winner calls `prepareClaim()` → `executeClaim()` (with another KMS proof) to receive their share of the pool.
8. **Timeout safety** — If resolution doesn't happen within 24h of voting end, anyone can call `expireMarket()` and all voters get their stakes refunded.

---

## Roadmap

### Phase 1 — Core Protocol ✅ *(current)*
- [x] FHE-encrypted binary voting with homomorphic tallying
- [x] Full market lifecycle (create → vote → resolve → claim/refund)
- [x] Owner-restricted market creation and resolution
- [x] React frontend with direct card voting and wallet discovery (EIP-6963)
- [x] Client-side FHE encryption via Zama relayer SDK
- [x] Live percentage bars and winner display after resolution
- [x] 69 unit tests across 7 test files

### Phase 2 — Enhanced UX
- [ ] Auto-finalization bot (watches for KMS proofs, calls `finalizeResolution` automatically)
- [ ] Batch claim execution for all eligible voters
- [ ] Real-time market updates via event subscriptions (WebSocket provider)
- [ ] Mobile-responsive design + PWA support
- [ ] Market search, filtering, and sorting

### Phase 3 — Protocol Expansion
- [ ] Multi-option markets (3+ choices with FHE-encrypted counters per option)
- [ ] Variable stake tiers with weighted voting
- [ ] Market categories and tagging system
- [ ] On-chain market creator fees (configurable % of pool)
- [ ] Governance: community-driven market curation

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
| `npm run test` *(frontend/)* | Run 69 frontend tests |
| `npm run dev` *(frontend/)* | Start dev server at localhost:5173 |
| `npm run build` *(frontend/)* | Production build |

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
