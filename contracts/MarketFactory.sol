// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OpinionMarket} from "./OpinionMarket.sol";
import {IMarketFactory} from "./interfaces/IMarketFactory.sol";

/// @title MarketFactory — Deploys and indexes OpinionMarket instances
/// @author Neoma Protocol
/// @notice Permissionless factory: anyone can create a binary opinion market.
///         Each market is an independent OpinionMarket contract.
contract MarketFactory is IMarketFactory {
    // ═══════════════════════════════════════════════════════════════
    //  STORAGE
    // ═══════════════════════════════════════════════════════════════

    address public override owner;
    address[] private _markets;
    mapping(address => bool) private _isMarket;
    mapping(uint256 => address) private _marketById;
    uint256 private _marketCount;

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    constructor() {
        owner = msg.sender;
    }

    // ═══════════════════════════════════════════════════════════════
    //  MARKET CREATION
    // ═══════════════════════════════════════════════════════════════

    /// @inheritdoc IMarketFactory
    function createMarket(
        string calldata questionText,
        string calldata optionAText,
        string calldata optionBText,
        uint256 stakeAmount_,
        uint256 startTime_,
        uint256 endTime_
    ) external override returns (address market) {
        // ── Only owner can create markets ──
        if (msg.sender != owner) revert NotOwner();

        // ── Input validation ──
        if (bytes(questionText).length == 0) revert EmptyQuestion();
        if (bytes(optionAText).length == 0) revert EmptyOption();
        if (bytes(optionBText).length == 0) revert EmptyOption();
        if (stakeAmount_ == 0) revert InvalidStake();

        // ── Deploy new market contract ──
        OpinionMarket deployed = new OpinionMarket(
            questionText,
            optionAText,
            optionBText,
            stakeAmount_,
            startTime_,
            endTime_,
            address(this)
        );

        market = address(deployed);

        // ── Registry bookkeeping ──
        uint256 id = _marketCount;
        _markets.push(market);
        _isMarket[market] = true;
        _marketById[id] = market;
        _marketCount = id + 1;

        emit MarketCreated(id, market, msg.sender, questionText);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// @inheritdoc IMarketFactory
    function getMarket(uint256 id) external view override returns (address) {
        return _marketById[id];
    }

    /// @inheritdoc IMarketFactory
    function getAllMarkets()
        external
        view
        override
        returns (address[] memory)
    {
        return _markets;
    }

    /// @inheritdoc IMarketFactory
    function marketCount() external view override returns (uint256) {
        return _marketCount;
    }

    /// @inheritdoc IMarketFactory
    function isMarket(address addr) external view override returns (bool) {
        return _isMarket[addr];
    }
}
