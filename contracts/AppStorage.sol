// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.18;
import "./shared/Structs.sol";

struct AppStorage {
    // Request renewals are disabled on deployment. Once enabled, they cannot be disabled.
    bool renewalsEnabled;
    // Re-entrancy guard for final beacon submit (placed in this position for packing)
    uint8 _status;
    uint256 latestRequestId;
    // Protocol addresses
    address sequencer;
    address proposedSequencer;
    address treasury;
    address[] beacons;
    // Reserve uint space for additional future config kv stores
    uint256[48] configUints;
    uint256[16] gasEstimates;
    // Deposits
    mapping(address => uint256) ethDeposit;
    mapping(address => uint256) ethReserved;
    // Beacon Stores
    mapping(address => uint256) beaconIndex;
    mapping(address => Beacon) beacon;
    // Request Stores
    mapping(uint256 => bytes32) results;
    mapping(uint256 => bytes32) requestToHash; // The hash of the request data
    mapping(uint256 => bytes10[2]) requestToVrfHashes; // The submitted hashes from beacons
    mapping(uint256 => uint256) requestToFeePaid;
    mapping(uint256 => uint256) requestToFeeRefunded;
    // Collateral
    mapping(address => uint256) ethCollateral;
}
