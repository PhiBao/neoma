// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IMarketFactory — Factory interface for deploying opinion markets
interface IMarketFactory {
    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    event MarketCreated(
        uint256 indexed marketId,
        address indexed marketAddress,
        address indexed creator,
        string question,
        string[] tags
    );

    // ═══════════════════════════════════════════════════════════════
    //  ERRORS
    // ═══════════════════════════════════════════════════════════════

    error InvalidStake();
    error EmptyQuestion();
    error EmptyOption();
    error NotOwner();
    error InvalidOptionCount();
    error TooManyTags();

    // ═══════════════════════════════════════════════════════════════
    //  CORE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Deploy a new multi-option opinion market
    /// @param questionText  The market question
    /// @param optionTexts   Array of option labels (2–10)
    /// @param stakeAmount   Exact ETH required per vote (wei)
    /// @param startTime     Voting open timestamp
    /// @param endTime       Voting close timestamp
    /// @param tags          Category tags for discoverability (max 5)
    /// @param creatorFeeBps Creator fee in basis points (max 500 = 5%)
    /// @return market       Address of the deployed OpinionMarket
    function createMarket(
        string calldata questionText,
        string[] calldata optionTexts,
        uint256 stakeAmount,
        uint256 startTime,
        uint256 endTime,
        string[] calldata tags,
        uint16 creatorFeeBps
    ) external returns (address market);

    // ═══════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    function owner() external view returns (address);
    function getMarket(uint256 id) external view returns (address);
    function getAllMarkets() external view returns (address[] memory);
    function marketCount() external view returns (uint256);
    function isMarket(address addr) external view returns (bool);

    /// @notice Get the tags assigned to a market
    function getMarketTags(address market) external view returns (string[] memory);

    /// @notice Get all markets that have a specific tag
    function getMarketsByTag(string calldata tag) external view returns (address[] memory);

    /// @notice Get all unique tags used across markets
    function getAllTags() external view returns (string[] memory);
}
