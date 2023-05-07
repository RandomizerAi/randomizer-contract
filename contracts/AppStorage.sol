// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.19;
import "./shared/Structs.sol";

struct AppStorage {
    // Re-entrancy guard for functions that make external calls
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
    // Client Deposits & Reserved Amounts
    mapping(address client => uint256 value) ethDeposit;
    mapping(address client => uint256 reserved) ethReserved;
    // Beacon Stores
    mapping(address beacon => uint256 index) beaconIndex;
    mapping(address beacon => Beacon data) beacon;
    // Request Stores
    mapping(uint256 id => bytes32 result) results;
    mapping(uint256 id => bytes32 dataHash) requestToHash; // The hash of the request data
    mapping(uint256 id => bytes10[2] vrfHashes) requestToVrfHashes; // The submitted hashes from beacons
    mapping(uint256 id => uint256 feePaid) requestToFeePaid;
    mapping(uint256 id => uint256 feeRefunded) requestToFeeRefunded;
    // Collateral
    mapping(address beacon => uint256 value) ethCollateral;
}
