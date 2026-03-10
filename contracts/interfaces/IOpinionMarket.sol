// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {externalEuint8} from "@fhevm/solidity/lib/FHE.sol";

/// @title IOpinionMarket — Interface for privacy-preserving multi-option opinion markets
/// @notice Defines the lifecycle: create → vote (encrypted) → resolve → claim
interface IOpinionMarket {
    // ═══════════════════════════════════════════════════════════════
    //  ENUMS
    // ═══════════════════════════════════════════════════════════════

    enum MarketState {
        Active,
        Resolving,
        Resolved,
        Cancelled,
        Expired
    }

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    event VoteCast(address indexed voter, uint256 timestamp);
    event ResolutionInitiated(uint256 timestamp);
    event MarketResolved(uint8[] winnerIndices, uint32 totalWinnerVoters);
    event ClaimPrepared(address indexed voter, uint256 timestamp);
    event BatchClaimsPrepared(uint256 fromIndex, uint256 toIndex, uint256 timestamp);
    event RewardClaimed(address indexed voter, uint256 amount);
    event CreatorFeeCollected(address indexed creator, uint256 amount);
    event MarketCancelled(uint256 timestamp);
    event MarketExpired(uint256 timestamp);
    event Refunded(address indexed voter, uint256 amount);

    // ═══════════════════════════════════════════════════════════════
    //  ERRORS
    // ═══════════════════════════════════════════════════════════════

    error MarketNotActive();
    error MarketNotResolving();
    error MarketNotResolved();
    error MarketNotExpired();
    error AlreadyVoted();
    error InsufficientStake();
    error VotingNotOpen();
    error VotingPeriodNotEnded();
    error ResolutionDeadlineNotReached();
    error NoVotes();
    error AlreadyClaimed();
    error AlreadyRefunded();
    error NotEligible();
    error NotVoter();
    error ClaimNotPrepared();
    error TransferFailed();
    error InvalidTimings();
    error InvalidBatchRange();
    error NotAuthorized();
    error InvalidOptionCount();
    error FeeTooHigh();

    // ═══════════════════════════════════════════════════════════════
    //  CORE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    function vote(externalEuint8 encryptedChoice, bytes calldata inputProof) external payable;
    function resolveMarket() external;
    function finalizeResolution(bytes calldata abiEncodedCleartexts, bytes calldata decryptionProof) external;
    function prepareClaim() external;
    function batchPrepareClaims(uint256 fromIndex, uint256 toIndex) external;
    function executeClaim(address voter, bytes calldata abiEncodedCleartext, bytes calldata decryptionProof) external;
    function expireMarket() external;
    function claimRefund() external;

    // ═══════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    function question() external view returns (string memory);
    function options() external view returns (string[] memory);
    function optionCount() external view returns (uint256);
    function stakeAmount() external view returns (uint256);
    function startTime() external view returns (uint256);
    function endTime() external view returns (uint256);
    function resolutionDeadline() external view returns (uint256);
    function state() external view returns (MarketState);
    function totalPool() external view returns (uint256);
    function totalVoters() external view returns (uint256);
    function winnerIndices() external view returns (uint8[] memory);
    function optionVoteCounts() external view returns (uint32[] memory);
    function totalWinnerVoters() external view returns (uint32);
    function hasVoted(address voter) external view returns (bool);
    function hasClaimed(address voter) external view returns (bool);
    function hasRefunded(address voter) external view returns (bool);
    function isClaimPrepared(address voter) external view returns (bool);
    function voterCount() external view returns (uint256);
    function voterAt(uint256 index) external view returns (address);
    function getResolutionHandles() external view returns (bytes32[] memory);
    function getClaimEligibilityHandle(address voter) external view returns (bytes32);
    function creator() external view returns (address);
    function creatorFeeBps() external view returns (uint16);
}
