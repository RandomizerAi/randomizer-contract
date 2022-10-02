// SPDX-License-Identifier: BSL 1.1

pragma solidity ^0.8.17;

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

struct SPackedUintData {
    uint128 id;
    SRandomUintData data;
}

struct SRandomUintData {
    uint256 ethReserved;
    uint256 beaconFee;
    uint256 height;
    uint256 timestamp;
    uint256 expirationBlocks;
    uint256 expirationSeconds;
    uint256 callbackGasLimit;
}

struct SRequestEventData {
    uint256 ethReserved;
    uint256 beaconFee;
    uint256 height;
    uint256 timestamp;
    uint256 expirationBlocks;
    uint256 expirationSeconds;
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

struct SBeacon {
    uint256[2] publicKey;
    bool exists;
    uint8 strikes;
    uint8 consecutiveSubmissions;
    uint64 pending;
}
