// SPDX-License-Identifier: BSL 1.1

/// @title Randomizer State
/// @author Deanpress (https://github.com/deanpress)
/// @notice Contains state variables and structs used by SoRandom

pragma solidity ^0.8.16;

/// @notice SRandomRequest holds the data needed to fulfill a request

struct SPackedSubmitData {
    uint128 id;
    SRandomUintData data;
    SFastVerifyData vrf;
}

// publicKey: [pubKey-x, pubKey-y]
// proof: [gamma-x, gamma-y, c, s]
// uPoint: [uPointX, uPointY]
// vComponents: [sHX, sHY, cGammaX, cGammaY]
struct SFastVerifyData {
    uint256[4] proof;
    uint256[2] uPoint;
    uint256[4] vComponents;
}

struct SPackedRenewData {
    uint128 id;
    SRandomUintData data;
}

struct SRandomUintData {
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
    bool optimistic;
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
    uint256[2] publicKey;
    bool exists;
    uint8 strikes;
    uint8 consecutiveSubmissions;
    uint64 pending;
}

// Gas offsets
struct SGasEstimates {
    uint256 totalSubmit;
    uint256 submit;
    uint256 finalSubmit;
    uint256 renew;
    uint256 processOptimistic;
    uint256 completeOptimistic;
}

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
    mapping(uint128 => SFastVerifyData[3]) internal requestToProofs;
    mapping(uint128 => uint256) internal requestToFeePaid;

    // Collateral
    mapping(address => uint256) internal ethCollateral;

    // Optimistic request data
    mapping(uint128 => uint256[2]) internal optRequestChallengeWindow;

    SGasEstimates public gasEstimates;
}
