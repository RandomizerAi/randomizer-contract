// SPDX-License-Identifier: BSL 1.1

/// @title Randomizer State
/// @author Deanpress (https://github.com/deanpress)
/// @notice Contains state variables and structs used by SoRandom
import "./lib/Structs.sol";

pragma solidity ^0.8.16;

contract Store {
    // Config keys for configUints
    uint256 constant CKEY_MIN_STAKE_ETH = 0;
    uint256 constant CKEY_EXPIRATION_BLOCKS = 1;
    uint256 constant CKEY_EXPIRATION_SECONDS = 2;
    uint256 constant CKEY_REQUEST_MIN_GAS_LIMIT = 3;
    uint256 constant CKEY_REQUEST_MAX_GAS_LIMIT = 4;
    uint256 constant CKEY_BEACON_FEE = 5;
    uint256 constant CKEY_MAX_STRIKES = 6;

    // Re-entrancy guard for final beacon submit
    uint256 internal _status;

    // Protocol addresses
    address public developer;
    address internal proposedDeveloper;
    address public sequencer;

    address[] internal beacons;

    //   minStakeEth;
    //   expirationBlocks;
    //   expirationSeconds;
    //   requestMinGasLimit;
    //   requestMaxGasLimit;
    //   beaconFee;
    //   maxStrikes;
    // Reserve config uint space for additional future config variables
    uint256[48] internal configUints;

    //  totalSubmit;
    //  submit;
    //  finalSubmit;
    //  renew;
    //  processOptimistic;
    //  completeOptimistic;
    // + reserve for future estimates
    uint256[16] internal gasEstimates;

    uint128 public latestRequestId;
    mapping(uint256 => bytes32) internal results;

    // Deposits
    mapping(address => uint256) internal ethDeposit;
    mapping(address => uint256) internal ethReserved;
    // Beacon Stores
    mapping(address => uint256) internal beaconIndex;
    mapping(address => SBeacon) internal sBeacon;

    // Random Stores
    mapping(uint128 => bytes32) internal requestToHash;
    mapping(uint128 => bytes32[3]) internal requestToVrfHashes;
    mapping(uint128 => bytes32[3]) internal requestToProofs;
    mapping(uint128 => uint256) internal requestToFeePaid;

    // Collateral
    mapping(address => uint256) internal ethCollateral;

    // Optimistic request data
    mapping(uint128 => uint256[2]) internal optRequestChallengeWindow;

    // SGasEstimates public gasEstimates;
}
