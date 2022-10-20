// SPDX-License-Identifier: BSL 1.1

/// @title Randomizer State
/// @author Deanpress (https://github.com/deanpress)
/// @notice Contains state variables and structs used by Randomizer
import "./lib/Structs.sol";

pragma solidity ^0.8.17;

contract Store {
    // Config keys for configUints
    uint256 constant CKEY_MIN_STAKE_ETH = 0;
    uint256 constant CKEY_EXPIRATION_BLOCKS = 1;
    uint256 constant CKEY_EXPIRATION_SECONDS = 2;
    uint256 constant CKEY_REQUEST_MIN_GAS_LIMIT = 3;
    uint256 constant CKEY_REQUEST_MAX_GAS_LIMIT = 4;
    uint256 constant CKEY_BEACON_FEE = 5;
    uint256 constant CKEY_MAX_STRIKES = 6;

    // Gas keys for estimateGas
    // All are offsets. The ones ending with "_TOTAL" are estimate total fees.
    uint256 constant GKEY_SUBMIT = 0;
    uint256 constant GKEY_FINAL_SUBMIT = 1;
    uint256 constant GKEY_RENEW = 2;
    uint256 constant GKEY_PROCESS_OPTIMISTIC = 3;
    uint256 constant GKEY_COMPLETE_OPTIMISTIC = 4;
    uint256 constant GKEY_SUBMIT_TOTAL = 5;
    uint256 constant GKEY_OPT_SUBMIT_TOTAL = 6;

    // AuthAction event types
    uint8 constant AUTH_TYPE_OWNER = 0;
    uint8 constant AUTH_TYPE_DEV = 1;

    uint8 constant AUTH_ACTION_PROPOSE = 0;
    uint8 constant AUTH_ACTION_ACCEPT = 1;
    uint8 constant AUTH_ACTION_CANCEL = 2;

    // UpdateUint event types
    uint8 constant UINT_TYPE_CONFIG = 0;
    uint8 constant UINT_TYPE_GAS = 1;

    // DepositEth event types
    uint8 constant DEPOSIT_TYPE_BEACON = 0;
    uint8 constant DEPOSIT_TYPE_CLIENT = 1;

    uint256 internal constant STATUS_NOT_ENTERED = 1;
    uint256 internal constant STATUS_ENTERED = 2;

    // Re-entrancy guard for final beacon submit
    uint256 internal _status;

    // Protocol addresses
    address public internals;
    address public vrf;
    address public owner;
    address public proposedOwner;
    address public developer;
    address public proposedDeveloper;
    address public sequencer;

    address[] internal beacons;

    // Reserve uint space for additional future config kv stores
    uint256[48] internal configUints;
    uint256[16] internal gasEstimates;

    uint128 public latestRequestId;
    mapping(uint256 => bytes32) internal results;

    // Deposits
    mapping(address => uint256) internal ethDeposit;
    mapping(address => uint256) internal ethReserved;
    // Beacon Stores
    mapping(address => uint256) internal beaconIndex;
    mapping(address => SBeacon) internal sBeacon;

    // Request Stores
    mapping(uint128 => bytes32) internal requestToHash;
    mapping(uint128 => bytes32[3]) internal requestToVrfHashes;
    mapping(uint128 => bytes32[3]) internal requestToProofs;
    mapping(uint128 => uint256) internal requestToFeePaid;
    mapping(uint128 => uint256) internal requestToFeeRefunded;

    // Collateral
    mapping(address => uint256) internal ethCollateral;

    // Optimistic request data
    mapping(uint128 => uint256[2]) internal optRequestDisputeWindow;

    // SGasEstimates public gasEstimates;
}
