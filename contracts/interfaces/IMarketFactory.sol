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
        string question
    );

    // ═══════════════════════════════════════════════════════════════
    //  ERRORS
    // ═══════════════════════════════════════════════════════════════

    error InvalidStake();
    error EmptyQuestion();
    error EmptyOption();

    // ═══════════════════════════════════════════════════════════════
    //  CORE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Deploy a new binary opinion market
    /// @param questionText  The market question
    /// @param optionAText   Label for option A (index 0)
    /// @param optionBText   Label for option B (index 1)
    /// @param stakeAmount   Exact ETH required per vote (wei)
    /// @param startTime     Voting open timestamp
    /// @param endTime       Voting close timestamp
    /// @return market       Address of the deployed OpinionMarket
    function createMarket(
        string calldata questionText,
        string calldata optionAText,
        string calldata optionBText,
        uint256 stakeAmount,
        uint256 startTime,
        uint256 endTime
    ) external returns (address market);

    // ═══════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    function getMarket(uint256 id) external view returns (address);
    function getAllMarkets() external view returns (address[] memory);
    function marketCount() external view returns (uint256);
    function isMarket(address addr) external view returns (bool);
}
