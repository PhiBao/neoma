// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {externalEuint8, euint32} from "@fhevm/solidity/lib/FHE.sol";

/// @title IOpinionMarket — Interface for privacy-preserving binary opinion markets
/// @notice Defines the lifecycle: create → vote (encrypted) → resolve → claim
interface IOpinionMarket {
    // ═══════════════════════════════════════════════════════════════
    //  ENUMS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Lifecycle states of an opinion market
    enum MarketState {
        Active, //  Voting is open
        Resolving, //  Encrypted winner computed, awaiting KMS decryption proof
        Resolved, //  Winner determined, claims open
        Cancelled, //  Market cancelled (e.g. zero participation)
        Expired //  Resolution deadline passed → auto-refund available
    }

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    event VoteCast(address indexed voter, uint256 timestamp);
    event ResolutionInitiated(uint256 timestamp);
    event MarketResolved(uint8 winnerIndex, uint32 winnerCount);
    event ClaimPrepared(address indexed voter, uint256 timestamp);
    event BatchClaimsPrepared(uint256 fromIndex, uint256 toIndex, uint256 timestamp);
    event RewardClaimed(address indexed voter, uint256 amount);
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

    // ═══════════════════════════════════════════════════════════════
    //  CORE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Cast an encrypted vote. Send exactly `stakeAmount` ETH.
    function vote(externalEuint8 encryptedChoice, bytes calldata inputProof) external payable;

    /// @notice Compute the encrypted winner after voting ends.
    function resolveMarket() external;

    /// @notice Finalize resolution by submitting verified KMS decryption proof.
    function finalizeResolution(
        bytes calldata abiEncodedCleartexts,
        bytes calldata decryptionProof
    ) external;

    /// @notice Prepare a claim for msg.sender.
    function prepareClaim() external;

    /// @notice Prepare claims for a batch of voters (anyone can call).
    function batchPrepareClaims(uint256 fromIndex, uint256 toIndex) external;

    /// @notice Execute a previously-prepared claim using its KMS decryption proof.
    function executeClaim(
        address voter,
        bytes calldata abiEncodedCleartext,
        bytes calldata decryptionProof
    ) external;

    /// @notice Mark market as expired if resolution deadline has passed.
    ///         After this, all voters can claim refunds.
    function expireMarket() external;

    /// @notice Claim a refund after market expiry or cancellation.
    function claimRefund() external;

    // ═══════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    function question() external view returns (string memory);
    function optionA() external view returns (string memory);
    function optionB() external view returns (string memory);
    function stakeAmount() external view returns (uint256);
    function startTime() external view returns (uint256);
    function endTime() external view returns (uint256);
    function resolutionDeadline() external view returns (uint256);
    function state() external view returns (MarketState);
    function totalPool() external view returns (uint256);
    function totalVoters() external view returns (uint256);
    function winnerIndex() external view returns (uint8);
    function winnerCount() external view returns (uint32);
    function hasVoted(address voter) external view returns (bool);
    function hasClaimed(address voter) external view returns (bool);
    function hasRefunded(address voter) external view returns (bool);
    function isClaimPrepared(address voter) external view returns (bool);
    function voterCount() external view returns (uint256);
    function voterAt(uint256 index) external view returns (address);
    function getEncryptedCounterA() external view returns (euint32);
    function getEncryptedCounterB() external view returns (euint32);
}
