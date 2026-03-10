// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OpinionMarket} from "./OpinionMarket.sol";
import {IMarketFactory} from "./interfaces/IMarketFactory.sol";

/// @title MarketFactory — Deploys and indexes OpinionMarket instances
/// @author Neoma Protocol
/// @notice Factory for creating and indexing multi-option opinion markets.
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

    // ── Tags ────────────────────────────────────────────────────
    uint8 private constant MAX_TAGS = 5;
    mapping(address => string[]) private _marketTags;
    mapping(string => address[]) private _tagMarkets;
    string[] private _allTags;
    mapping(string => bool) private _tagExists;

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
        string[] calldata optionTexts,
        uint256 stakeAmount_,
        uint256 startTime_,
        uint256 endTime_,
        string[] calldata tags,
        uint16 creatorFeeBps
    ) external override returns (address market) {
        // ── Only owner can create markets ──
        if (msg.sender != owner) revert NotOwner();

        // ── Input validation ──
        if (bytes(questionText).length == 0) revert EmptyQuestion();
        if (optionTexts.length < 2) revert InvalidOptionCount();
        for (uint256 i = 0; i < optionTexts.length; i++) {
            if (bytes(optionTexts[i]).length == 0) revert EmptyOption();
        }
        if (stakeAmount_ == 0) revert InvalidStake();
        if (tags.length > MAX_TAGS) revert TooManyTags();

        // ── Deploy new market contract ──
        OpinionMarket deployed = new OpinionMarket(
            questionText,
            optionTexts,
            stakeAmount_,
            startTime_,
            endTime_,
            address(this),
            msg.sender,
            creatorFeeBps
        );

        market = address(deployed);

        // ── Registry bookkeeping ──
        uint256 id = _marketCount;
        _markets.push(market);
        _isMarket[market] = true;
        _marketById[id] = market;
        _marketCount = id + 1;

        // ── Store tags ──
        for (uint256 i = 0; i < tags.length; i++) {
            string memory tag = tags[i];
            _marketTags[market].push(tag);
            _tagMarkets[tag].push(market);
            if (!_tagExists[tag]) {
                _tagExists[tag] = true;
                _allTags.push(tag);
            }
        }

        emit MarketCreated(id, market, msg.sender, questionText, tags);
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

    /// @inheritdoc IMarketFactory
    function getMarketTags(address market) external view override returns (string[] memory) {
        return _marketTags[market];
    }

    /// @inheritdoc IMarketFactory
    function getMarketsByTag(string calldata tag) external view override returns (address[] memory) {
        return _tagMarkets[tag];
    }

    /// @inheritdoc IMarketFactory
    function getAllTags() external view override returns (string[] memory) {
        return _allTags;
    }
}
