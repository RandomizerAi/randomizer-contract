// SPDX-License-Identifier: BSL 1.1

/// @title Randomizer State
/// @author Deanpress (https://github.com/deanpress)
/// @notice Contains state variables and structs used by SoRandom
import "./lib/Structs.sol";

pragma solidity ^0.8.16;

contract Store {
    // Re-entrancy guard for final beacon submit
    uint256 internal _status;

    // Protocol addresses
    address public developer;
    address internal proposedDeveloper;
    address public sequencer;

    address[] internal beacons;
    uint256 public minStakeEth;
    uint256 public expirationBlocks;
    uint256 public expirationSeconds;
    uint256 internal requestMinGasLimit;
    uint256 internal requestMaxGasLimit;

    uint256 internal beaconFee;
    uint128 public latestRequestId;
    uint8 internal maxStrikes;
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

    SGasEstimates public gasEstimates;
}
