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
    uint256 timestamp;
    uint256 expirationBlocks;
    uint256 expirationSeconds;
    uint256 callbackGasLimit;
    bool optimistic;
    address client;
    address[3] beacons;
    bytes32 seed;
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

interface IVRF {
    function fastVerify(
        uint256[2] memory _publicKey, //Y-x, Y-y
        uint256[4] memory _proof, //pi, which is D, a.k.a. gamma-x, gamma-y, c, s
        bytes memory _message, //alpha string
        uint256[2] memory _uPoint, //U-x, U-y
        uint256[4] memory _vComponents //s*H -x, s*H -y, c*Gamma -x, c*Gamma -y
    ) external pure returns (bool);
}

struct DisputeCallVars {
    uint256[2] publicKeys;
    uint256 feePaid;
    uint256 clientDeposit;
    uint256 collateral;
    address beacon;
    address client;
}

struct DisputeReturnData {
    bool vrfFailed;
    address beaconToRemove;
    uint256 ethToSender;
    uint256 feeRefunded;
    uint256 newClientDeposit;
}

interface IInternals {
    function _replaceNonSubmitters(
        uint128 _request,
        address[3] memory _beacons,
        bytes32[3] memory _values,
        address[] memory beacons
    ) external view returns (address[3] memory);

    function _dispute(
        uint128 id,
        bytes32 seed,
        SFastVerifyData memory vrfData,
        DisputeCallVars memory callVars,
        address vrf
    ) external returns (DisputeReturnData memory);
}
