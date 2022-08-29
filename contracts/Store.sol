// SPDX-License-Identifier: BSL 1.1

/// @title SoRandom State
/// @author Deanpress (https://github.com/deanpress)
/// @notice Contains state variables and structs used by SoRandom

pragma solidity ^0.8.15;

/// @notice SRandomRequest holds the data needed to fulfill a request

struct SPackedSubmitData {
    uint128 id;
    uint8 v;
    SRandomCallData data;
}

struct SPackedRenewData {
    uint128 id;
    SRandomCallData data;
}

struct SRandomCallData {
    uint256 ethReserved;
    uint256 beaconFee;
    uint256 height;
    uint256 timestamp;
    uint256 expirationSeconds;
    uint256 expirationBlocks;
    uint256 callbackGasLimit;
}

struct SPackedRSSeed {
    bytes32 r;
    bytes32 s;
    bytes32 seed;
}

struct SRequestEventData {
    uint256 ethReserved;
    uint256 beaconFee;
    uint256 height;
    uint256 timestamp;
    uint256 expirationSeconds;
    uint256 expirationBlocks;
    uint256 callbackGasLimit;
    address client;
    address[3] beacons;
    bytes32 seed;
}

struct SAccounts {
    address client;
    address[3] beacons;
}

struct FlatSignature {
    bytes32[] r;
    bytes32[] s;
    uint8[] v;
}

struct SBeacon {
    bool exists;
    uint8 strikes;
    uint8 consecutiveSubmissions;
    uint64 pending;
}

contract Store {
    // Re-entrancy guard for final beacon submit
    uint256 internal _status;

    // Protocol addresses
    address public developer;
    address public proposedDeveloper;
    address public sequencer;

    address[] beacons;
    uint256 strikeBurn;
    uint256 minToken;
    uint256 public minStakeEth;
    uint256 public expirationBlocks;
    uint256 public expirationSeconds;
    uint256 public requestMinGasLimit;
    uint256 public requestMaxGasLimit;

    // Fees
    uint256 public beaconFee;
    uint128 public latestRequestId;
    uint8 maxStrikes;
    uint128[] pendingRequestIds;
    mapping(uint256 => bytes32) internal results;

    // Deposits
    mapping(address => uint256) internal ethDeposit;
    mapping(address => uint256) internal ethReserved;
    // Beacon Stores
    mapping(address => uint256) internal beaconIndex;
    mapping(address => SBeacon) internal sBeacon;

    // Random Stores
    mapping(uint128 => bytes32) internal requestToHash;
    mapping(uint128 => bytes12[3]) internal requestToSignatures;
    mapping(uint128 => address) internal requestToFinalBeacon;
    mapping(uint128 => uint256) internal requestToFeePaid;

    // Collateral
    mapping(address => uint256) internal ethCollateral;
    mapping(address => uint256) internal tokenCollateral;

    // Gas offsets
    struct SGasEstimates {
        uint256 totalSubmit;
        uint256 submitOffset;
        uint256 finalSubmitOffset;
        uint256 renewOffset;
    }
    SGasEstimates public gasEstimates;

    /*     uint256 internal gasEstimates.totalSubmit;
    uint256 internal gasEstimates.submitOffset;;
    uint256 internal gasEstimates.finalSubmitOffset;;
    uint256 internal gasEstimates.renewOffset;; */
}
