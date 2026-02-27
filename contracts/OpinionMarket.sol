// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint32, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IOpinionMarket} from "./interfaces/IOpinionMarket.sol";

/// @title OpinionMarket — Privacy-preserving binary opinion market
/// @author Neoma Protocol
/// @notice Accepts FHE-encrypted votes, tallies them homomorphically, and settles
///         payouts without ever exposing individual choices on-chain.
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
///   • Only the winner INDEX and winner COUNT are revealed at resolution
///   • Per-voter eligibility is revealed only when that voter opts to claim
contract OpinionMarket is ZamaEthereumConfig, IOpinionMarket {
    // ═══════════════════════════════════════════════════════════════
    //  CONSTANTS
    // ═══════════════════════════════════════════════════════════════

    /// @dev Default grace period after endTime before the market can be expired
    uint256 public constant RESOLUTION_GRACE_PERIOD = 24 hours;

    // ═══════════════════════════════════════════════════════════════
    //  STORAGE — Market Metadata
    // ═══════════════════════════════════════════════════════════════

    string private _question;
    string private _optionA;
    string private _optionB;
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
    uint8 private _winnerIndex;
    uint32 private _winnerCount;

    // ═══════════════════════════════════════════════════════════════
    //  STORAGE — FHE Encrypted Values
    // ═══════════════════════════════════════════════════════════════

    /// @dev Homomorphic vote accumulators (incremented via FHE.add)
    euint32 private _counterA;
    euint32 private _counterB;

    /// @dev Encrypted resolution results (set in resolveMarket, decrypted in finalize)
    euint8 private _encryptedWinnerIndex;
    euint32 private _encryptedWinnerCount;

    // ═══════════════════════════════════════════════════════════════
    //  STORAGE — Per-Voter
    // ═══════════════════════════════════════════════════════════════

    mapping(address => bool) private _hasVoted;
    mapping(address => euint8) private _userVotes; // encrypted choice (0 | 1)
    mapping(address => bool) private _hasClaimed;
    mapping(address => ebool) private _claimEligibility; // encrypted equality check
    mapping(address => bool) private _claimPrepared;
    mapping(address => bool) private _hasRefunded;
    address[] private _voters;

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    /// @param questionText   The question being voted on
    /// @param optionAText    Label for option A (index 0)
    /// @param optionBText    Label for option B (index 1)
    /// @param stakePerVote   Exact ETH (in wei) each voter must stake
    /// @param marketStart    Unix timestamp — voting opens
    /// @param marketEnd      Unix timestamp — voting closes
    /// @param factoryAddr    Address of the MarketFactory that deployed this contract
    constructor(
        string memory questionText,
        string memory optionAText,
        string memory optionBText,
        uint256 stakePerVote,
        uint256 marketStart,
        uint256 marketEnd,
        address factoryAddr
    ) {
        if (marketStart >= marketEnd) revert InvalidTimings();

        _question = questionText;
        _optionA = optionAText;
        _optionB = optionBText;
        _stakeAmount = stakePerVote;
        _startTime = marketStart;
        _endTime = marketEnd;
        _resolutionDeadline = marketEnd + RESOLUTION_GRACE_PERIOD;
        _state = MarketState.Active;
        factory = factoryAddr;

        // Initialize encrypted counters as proper encrypted zeros
        _counterA = FHE.asEuint32(0);
        _counterB = FHE.asEuint32(0);
        FHE.allowThis(_counterA);
        FHE.allowThis(_counterB);
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

        // Normalize to binary: 0 → A, any non-zero → B
        ebool isNonZero = FHE.ne(rawChoice, FHE.asEuint8(0));
        euint8 normalizedChoice = FHE.select(
            isNonZero,
            FHE.asEuint8(1),
            FHE.asEuint8(0)
        );

        // voteForA = 1 - normalizedChoice  (1 if A, 0 if B)
        euint8 voteForA = FHE.sub(FHE.asEuint8(1), normalizedChoice);

        // Homomorphic counter update
        _counterA = FHE.add(_counterA, voteForA);
        _counterB = FHE.add(_counterB, normalizedChoice);

        // Store encrypted choice for claim verification
        _userVotes[msg.sender] = normalizedChoice;

        // ACL
        FHE.allowThis(_counterA);
        FHE.allowThis(_counterB);
        FHE.allowThis(_userVotes[msg.sender]);

        // Bookkeeping
        _hasVoted[msg.sender] = true;
        _voters.push(msg.sender);
        _totalPool += msg.value;
        _totalVoters++;

        emit VoteCast(msg.sender, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════
    //  RESOLUTION  —  Step 1:  Encrypted computation
    // ═══════════════════════════════════════════════════════════════

    /// @inheritdoc IOpinionMarket
    function resolveMarket() external override {
        if (_state != MarketState.Active) revert MarketNotActive();
        if (block.timestamp <= _endTime) revert VotingPeriodNotEnded();
        if (_totalVoters == 0) revert NoVotes();

        // Encrypted comparison (A wins on tie)
        ebool aWins = FHE.ge(_counterA, _counterB);

        _encryptedWinnerIndex = FHE.select(
            aWins,
            FHE.asEuint8(0),
            FHE.asEuint8(1)
        );

        _encryptedWinnerCount = FHE.select(aWins, _counterA, _counterB);

        FHE.allowThis(_encryptedWinnerIndex);
        FHE.allowThis(_encryptedWinnerCount);

        FHE.makePubliclyDecryptable(_encryptedWinnerIndex);
        FHE.makePubliclyDecryptable(_encryptedWinnerCount);

        _state = MarketState.Resolving;

        emit ResolutionInitiated(block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════
    //  RESOLUTION  —  Step 2:  KMS-verified finalization
    // ═══════════════════════════════════════════════════════════════

    /// @inheritdoc IOpinionMarket
    function finalizeResolution(
        bytes calldata abiEncodedCleartexts,
        bytes calldata decryptionProof
    ) external override {
        if (_state != MarketState.Resolving) revert MarketNotResolving();

        bytes32[] memory handles = new bytes32[](2);
        handles[0] = FHE.toBytes32(_encryptedWinnerIndex);
        handles[1] = FHE.toBytes32(_encryptedWinnerCount);

        FHE.checkSignatures(handles, abiEncodedCleartexts, decryptionProof);

        (uint8 winnerIdx, uint32 winnerCnt) = abi.decode(
            abiEncodedCleartexts,
            (uint8, uint32)
        );

        _winnerIndex = winnerIdx;
        _winnerCount = winnerCnt;
        _state = MarketState.Resolved;

        emit MarketResolved(winnerIdx, winnerCnt);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CLAIMS  —  Individual prepare
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
    //  CLAIMS  —  Batch prepare (auto-distribution helper)
    // ═══════════════════════════════════════════════════════════════

    /// @inheritdoc IOpinionMarket
    /// @dev Anyone can call this to prepare claims for a range of voters.
    ///      This enables "auto-distribution" — a keeper or bot calls
    ///      batchPrepareClaims(0, voterCount) after finalization.
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

    /// @dev Internal helper — computes encrypted eligibility and marks for KMS decryption
    function _prepareClaimFor(address voter) internal {
        euint8 encWinner = FHE.asEuint8(_winnerIndex);
        ebool isWinner = FHE.eq(_userVotes[voter], encWinner);

        _claimEligibility[voter] = isWinner;
        _claimPrepared[voter] = true;

        FHE.allowThis(isWinner);
        FHE.makePubliclyDecryptable(isWinner);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CLAIMS  —  Execute with KMS proof
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

        uint256 payout = _totalPool / uint256(_winnerCount);

        (bool success, ) = payable(voter).call{value: payout}("");
        if (!success) revert TransferFailed();

        emit RewardClaimed(voter, payout);
    }

    // ═══════════════════════════════════════════════════════════════
    //  TIMEOUT  —  Expiry & Refund
    // ═══════════════════════════════════════════════════════════════

    /// @inheritdoc IOpinionMarket
    /// @dev If the market hasn't been resolved by the deadline, anyone
    ///      can mark it as Expired. All voters then get their stake back.
    function expireMarket() external override {
        if (_state != MarketState.Active && _state != MarketState.Resolving)
            revert MarketNotActive();
        if (block.timestamp < _resolutionDeadline)
            revert ResolutionDeadlineNotReached();

        _state = MarketState.Expired;

        emit MarketExpired(block.timestamp);
    }

    /// @inheritdoc IOpinionMarket
    /// @dev Returns the exact stake amount to the voter. Callable after
    ///      expiry OR cancellation.
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

    function optionA() external view override returns (string memory) {
        return _optionA;
    }

    function optionB() external view override returns (string memory) {
        return _optionB;
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

    function winnerIndex() external view override returns (uint8) {
        return _winnerIndex;
    }

    function winnerCount() external view override returns (uint32) {
        return _winnerCount;
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

    function getEncryptedCounterA()
        external
        view
        override
        returns (euint32)
    {
        return _counterA;
    }

    function getEncryptedCounterB()
        external
        view
        override
        returns (euint32)
    {
        return _counterB;
    }

    // ═══════════════════════════════════════════════════════════════
    //  RECEIVE  (accept ETH stakes)
    // ═══════════════════════════════════════════════════════════════

    receive() external payable {}
}
