// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint32, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IOpinionMarket} from "./interfaces/IOpinionMarket.sol";
import {IMarketFactory} from "./interfaces/IMarketFactory.sol";

/// @title OpinionMarket — Privacy-preserving multi-option opinion market
/// @author Neoma Protocol
/// @notice Accepts FHE-encrypted votes for any number of options (2–10),
///         tallies them homomorphically, and settles payouts without ever
///         exposing individual choices on-chain.
///
/// Lifecycle:
///   Active  →  resolveMarket()  →  Resolving  →  finalizeResolution()  →  Resolved
///                                                                          ↓
///                                          batchPrepareClaims() / prepareClaim()
///                                                     +  executeClaim()
///
///   Active/Resolving (after resolutionDeadline)  →  expireMarket()  →  Expired
///                                                                       ↓
///                                                                claimRefund()
///
/// Privacy guarantees:
///   • Individual votes are never decrypted
///   • Encrypted counters are incremented via FHE.add
///   • Only the per-option vote COUNTS are revealed at resolution
///   • Per-voter eligibility is revealed only when that voter opts to claim
contract OpinionMarket is ZamaEthereumConfig, IOpinionMarket {
    // ═══════════════════════════════════════════════════════════════
    //  CONSTANTS
    // ═══════════════════════════════════════════════════════════════

    uint256 public constant RESOLUTION_GRACE_PERIOD = 24 hours;
    uint8 public constant MAX_OPTIONS = 10;

    // ═══════════════════════════════════════════════════════════════
    //  STORAGE — Market Metadata
    // ═══════════════════════════════════════════════════════════════

    string private _question;
    string[] private _options;
    uint256 private _stakeAmount;
    uint256 private _startTime;
    uint256 private _endTime;
    uint256 private _resolutionDeadline;
    address public immutable factory;

    // ═══════════════════════════════════════════════════════════════
    //  STORAGE — Lifecycle
    // ═══════════════════════════════════════════════════════════════

    MarketState private _state;
    uint256 private _totalPool;
    uint256 private _totalVoters;

    // ═══════════════════════════════════════════════════════════════
    //  STORAGE — FHE Encrypted Values
    // ═══════════════════════════════════════════════════════════════

    /// @dev One encrypted counter per option, incremented via FHE.add
    euint32[] private _counters;

    // ═══════════════════════════════════════════════════════════════
    //  STORAGE — Resolution Results (set in finalizeResolution)
    // ═══════════════════════════════════════════════════════════════

    uint8[] private _winnerIndices;
    uint32[] private _optionVoteCounts;
    uint32 private _totalWinnerVoters;

    // ═══════════════════════════════════════════════════════════════
    //  STORAGE — Per-Voter
    // ═══════════════════════════════════════════════════════════════

    mapping(address => bool) private _hasVoted;
    mapping(address => euint8) private _userVotes;
    mapping(address => bool) private _hasClaimed;
    mapping(address => ebool) private _claimEligibility;
    mapping(address => bool) private _claimPrepared;
    mapping(address => bool) private _hasRefunded;
    address[] private _voters;

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    /// @param questionText   The question being voted on
    /// @param optionTexts    Array of option labels (2–10)
    /// @param stakePerVote   Exact ETH (in wei) each voter must stake
    /// @param marketStart    Unix timestamp — voting opens
    /// @param marketEnd      Unix timestamp — voting closes
    /// @param factoryAddr    Address of the MarketFactory that deployed this contract
    constructor(
        string memory questionText,
        string[] memory optionTexts,
        uint256 stakePerVote,
        uint256 marketStart,
        uint256 marketEnd,
        address factoryAddr
    ) {
        if (marketStart >= marketEnd) revert InvalidTimings();
        if (optionTexts.length < 2 || optionTexts.length > MAX_OPTIONS)
            revert InvalidOptionCount();

        _question = questionText;
        _stakeAmount = stakePerVote;
        _startTime = marketStart;
        _endTime = marketEnd;
        _resolutionDeadline = marketEnd + RESOLUTION_GRACE_PERIOD;
        _state = MarketState.Active;
        factory = factoryAddr;

        for (uint256 i = 0; i < optionTexts.length; i++) {
            _options.push(optionTexts[i]);
            euint32 counter = FHE.asEuint32(0);
            FHE.allowThis(counter);
            _counters.push(counter);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  VOTING
    // ═══════════════════════════════════════════════════════════════

    /// @inheritdoc IOpinionMarket
    function vote(
        externalEuint8 encryptedChoice,
        bytes calldata inputProof
    ) external payable override {
        if (_state != MarketState.Active) revert MarketNotActive();
        if (block.timestamp < _startTime || block.timestamp > _endTime)
            revert VotingNotOpen();
        if (_hasVoted[msg.sender]) revert AlreadyVoted();
        if (msg.value != _stakeAmount) revert InsufficientStake();

        euint8 rawChoice = FHE.fromExternal(encryptedChoice, inputProof);
        uint256 n = _options.length;

        // Cache encrypted constants for gas efficiency
        euint32 encOne = FHE.asEuint32(1);
        euint32 encZero = FHE.asEuint32(0);

        // For each option, conditionally increment its counter
        for (uint8 i = 0; i < n; i++) {
            ebool isThisOption = FHE.eq(rawChoice, FHE.asEuint8(i));
            euint32 increment = FHE.select(isThisOption, encOne, encZero);
            _counters[i] = FHE.add(_counters[i], increment);
            FHE.allowThis(_counters[i]);
        }

        _userVotes[msg.sender] = rawChoice;
        FHE.allowThis(_userVotes[msg.sender]);

        _hasVoted[msg.sender] = true;
        _voters.push(msg.sender);
        _totalPool += msg.value;
        _totalVoters++;

        emit VoteCast(msg.sender, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════
    //  RESOLUTION — Step 1: Mark counters for decryption
    // ═══════════════════════════════════════════════════════════════

    /// @inheritdoc IOpinionMarket
    function resolveMarket() external override {
        if (_state != MarketState.Active) revert MarketNotActive();
        if (block.timestamp <= _endTime) revert VotingPeriodNotEnded();
        if (_totalVoters == 0) revert NoVotes();
        if (msg.sender != IMarketFactory(factory).owner()) revert NotAuthorized();

        for (uint256 i = 0; i < _counters.length; i++) {
            FHE.makePubliclyDecryptable(_counters[i]);
        }

        _state = MarketState.Resolving;

        emit ResolutionInitiated(block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════
    //  RESOLUTION — Step 2: KMS-verified finalization
    // ═══════════════════════════════════════════════════════════════

    /// @inheritdoc IOpinionMarket
    function finalizeResolution(
        bytes calldata abiEncodedCleartexts,
        bytes calldata decryptionProof
    ) external override {
        if (_state != MarketState.Resolving) revert MarketNotResolving();

        uint256 n = _counters.length;

        // Build handles array for signature verification
        bytes32[] memory handles = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            handles[i] = FHE.toBytes32(_counters[i]);
        }

        FHE.checkSignatures(handles, abiEncodedCleartexts, decryptionProof);

        // Decode all vote counts from ABI-encoded tuple (uint32, uint32, ...)
        // Each value occupies 32 bytes, left-padded.
        uint32[] memory counts = new uint32[](n);
        for (uint256 i = 0; i < n; i++) {
            bytes32 word;
            assembly {
                word := calldataload(add(abiEncodedCleartexts.offset, mul(i, 0x20)))
            }
            counts[i] = uint32(uint256(word));
        }

        // Find the maximum vote count
        uint32 maxCount = 0;
        for (uint256 i = 0; i < n; i++) {
            if (counts[i] > maxCount) maxCount = counts[i];
        }

        // Determine winners and tally total winning voters
        uint32 totalWinners = 0;
        for (uint256 i = 0; i < n; i++) {
            _optionVoteCounts.push(counts[i]);
            if (counts[i] == maxCount) {
                _winnerIndices.push(uint8(i));
                totalWinners += counts[i];
            }
        }

        _totalWinnerVoters = totalWinners;
        _state = MarketState.Resolved;

        emit MarketResolved(_winnerIndices, totalWinners);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CLAIMS — Individual prepare
    // ═══════════════════════════════════════════════════════════════

    /// @inheritdoc IOpinionMarket
    function prepareClaim() external override {
        if (_state != MarketState.Resolved) revert MarketNotResolved();
        if (!_hasVoted[msg.sender]) revert NotEligible();
        if (_hasClaimed[msg.sender]) revert AlreadyClaimed();

        _prepareClaimFor(msg.sender);

        emit ClaimPrepared(msg.sender, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CLAIMS — Batch prepare (auto-distribution helper)
    // ═══════════════════════════════════════════════════════════════

    /// @inheritdoc IOpinionMarket
    function batchPrepareClaims(
        uint256 fromIndex,
        uint256 toIndex
    ) external override {
        if (_state != MarketState.Resolved) revert MarketNotResolved();
        if (fromIndex >= toIndex || toIndex > _voters.length)
            revert InvalidBatchRange();

        for (uint256 i = fromIndex; i < toIndex; i++) {
            address voter = _voters[i];
            if (!_claimPrepared[voter] && !_hasClaimed[voter]) {
                _prepareClaimFor(voter);
            }
        }

        emit BatchClaimsPrepared(fromIndex, toIndex, block.timestamp);
    }

    /// @dev Compares voter's encrypted choice against all winning indices
    function _prepareClaimFor(address voter) internal {
        euint8 voterChoice = _userVotes[voter];

        // Build an encrypted "match count" — 1+ means voter picked a winning option
        euint8 matchCount = FHE.asEuint8(0);
        euint8 one = FHE.asEuint8(1);
        euint8 zero = FHE.asEuint8(0);

        for (uint256 i = 0; i < _winnerIndices.length; i++) {
            ebool matches = FHE.eq(voterChoice, FHE.asEuint8(_winnerIndices[i]));
            euint8 bit = FHE.select(matches, one, zero);
            matchCount = FHE.add(matchCount, bit);
        }

        ebool isWinner = FHE.ne(matchCount, FHE.asEuint8(0));

        _claimEligibility[voter] = isWinner;
        _claimPrepared[voter] = true;

        FHE.allowThis(isWinner);
        FHE.makePubliclyDecryptable(isWinner);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CLAIMS — Execute with KMS proof
    // ═══════════════════════════════════════════════════════════════

    /// @inheritdoc IOpinionMarket
    function executeClaim(
        address voter,
        bytes calldata abiEncodedCleartext,
        bytes calldata decryptionProof
    ) external override {
        if (_state != MarketState.Resolved) revert MarketNotResolved();
        if (!_claimPrepared[voter]) revert ClaimNotPrepared();
        if (_hasClaimed[voter]) revert AlreadyClaimed();

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(_claimEligibility[voter]);

        FHE.checkSignatures(handles, abiEncodedCleartext, decryptionProof);

        bool eligible = abi.decode(abiEncodedCleartext, (bool));
        if (!eligible) revert NotEligible();

        _hasClaimed[voter] = true;

        uint256 payout = _totalPool / uint256(_totalWinnerVoters);

        (bool success, ) = payable(voter).call{value: payout}("");
        if (!success) revert TransferFailed();

        emit RewardClaimed(voter, payout);
    }

    // ═══════════════════════════════════════════════════════════════
    //  TIMEOUT — Expiry & Refund
    // ═══════════════════════════════════════════════════════════════

    /// @inheritdoc IOpinionMarket
    function expireMarket() external override {
        if (_state != MarketState.Active && _state != MarketState.Resolving)
            revert MarketNotActive();
        if (block.timestamp < _resolutionDeadline)
            revert ResolutionDeadlineNotReached();

        _state = MarketState.Expired;

        emit MarketExpired(block.timestamp);
    }

    /// @inheritdoc IOpinionMarket
    function claimRefund() external override {
        if (_state != MarketState.Expired && _state != MarketState.Cancelled)
            revert MarketNotExpired();
        if (!_hasVoted[msg.sender]) revert NotVoter();
        if (_hasRefunded[msg.sender]) revert AlreadyRefunded();

        _hasRefunded[msg.sender] = true;

        (bool success, ) = payable(msg.sender).call{value: _stakeAmount}("");
        if (!success) revert TransferFailed();

        emit Refunded(msg.sender, _stakeAmount);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    function question() external view override returns (string memory) {
        return _question;
    }

    function options() external view override returns (string[] memory) {
        return _options;
    }

    function optionCount() external view override returns (uint256) {
        return _options.length;
    }

    function stakeAmount() external view override returns (uint256) {
        return _stakeAmount;
    }

    function startTime() external view override returns (uint256) {
        return _startTime;
    }

    function endTime() external view override returns (uint256) {
        return _endTime;
    }

    function resolutionDeadline() external view override returns (uint256) {
        return _resolutionDeadline;
    }

    function state() external view override returns (MarketState) {
        return _state;
    }

    function totalPool() external view override returns (uint256) {
        return _totalPool;
    }

    function totalVoters() external view override returns (uint256) {
        return _totalVoters;
    }

    function winnerIndices() external view override returns (uint8[] memory) {
        return _winnerIndices;
    }

    function optionVoteCounts() external view override returns (uint32[] memory) {
        return _optionVoteCounts;
    }

    function totalWinnerVoters() external view override returns (uint32) {
        return _totalWinnerVoters;
    }

    function hasVoted(address voter) external view override returns (bool) {
        return _hasVoted[voter];
    }

    function hasClaimed(address voter) external view override returns (bool) {
        return _hasClaimed[voter];
    }

    function hasRefunded(address voter) external view override returns (bool) {
        return _hasRefunded[voter];
    }

    function isClaimPrepared(
        address voter
    ) external view override returns (bool) {
        return _claimPrepared[voter];
    }

    function voterCount() external view override returns (uint256) {
        return _voters.length;
    }

    function voterAt(uint256 index) external view override returns (address) {
        return _voters[index];
    }

    /// @notice Returns the bytes32 handles for all encrypted counters.
    /// @dev Uses .unwrap() to avoid precompile calls in view context.
    function getResolutionHandles()
        external
        view
        override
        returns (bytes32[] memory handles)
    {
        uint256 n = _counters.length;
        handles = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            handles[i] = euint32.unwrap(_counters[i]);
        }
    }

    /// @notice Returns the bytes32 handle for a voter's claim eligibility.
    function getClaimEligibilityHandle(
        address voter
    ) external view override returns (bytes32) {
        return ebool.unwrap(_claimEligibility[voter]);
    }

    // ═══════════════════════════════════════════════════════════════
    //  RECEIVE (accept ETH stakes)
    // ═══════════════════════════════════════════════════════════════

    receive() external payable {}
}
