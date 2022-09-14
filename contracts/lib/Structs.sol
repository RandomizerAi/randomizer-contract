// SPDX-License-Identifier: BSL 1.1

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
