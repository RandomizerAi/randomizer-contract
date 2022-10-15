// SPDX-License-Identifier: BSL 1.1

/// @title Randomizer Admin Functions
/// @author Deanpress (https://github.com/deanpress)
/// @notice Administrative functions, variables, and constants used by Randomizer.
pragma solidity ^0.8.17;

import "./Store.sol";

contract Admin is Store {
    uint256 internal constant _NOT_ENTERED = 1;
    uint256 internal constant _ENTERED = 2;

    /// @notice Emits an event with the final random value
    /// @param id request id
    /// @param result result value
    event Result(uint128 indexed id, bytes32 result);

    /// @notice Emits if a request is retried (has new beacons)
    /// @param request request id
    event Retry(
        uint128 indexed id,
        SRequestEventData request,
        address indexed chargedBeacon,
        address indexed caller,
        uint256 ethToClient,
        uint256 ethToCaller
    );

    event BeaconStakeEth(address indexed beacon, uint256 amount);
    event ClientDeposit(address indexed client, uint256 amount);
    event ClientWithdrawTo(
        address indexed client,
        address indexed to,
        uint256 amount
    );
    /// @notice Emits when ETH is charged from a client to a beacon
    /// @param chargeType 0: client deposit to beacon collateral, 1: beacon collateral to client deposit, 2: beacon collateral to beacon collateral
    event ChargeEth(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint8 chargeType
    );

    event WithdrawEth(address indexed to, uint256 amount);
    event RegisterBeacon(address indexed beacon);
    event UnregisterBeacon(address indexed beacon, uint8 strikes);
    event RemoveBeacon(address indexed beacon, uint8 strikes);

    /// @notice Emits an event that contains all data needed for a beacon to submit a random number.
    /// @param request request event data (id, ethReserved, beaconFee, height, timestamp, expirationSeconds, expirationBlocks, callbackGasLimit, client, beacons, lastBeaconSeed)
    event Request(uint128 indexed id, SRequestEventData request);

    event SubmitRandom(uint128 indexed id, address indexed beacon);

    event SubmitOptimistic(
        uint128 indexed id,
        address indexed beacon,
        uint256[4] proof,
        uint256[2] uPoint,
        uint256[4] vComponents
    );

    /// @notice Emits when final beacon is selected by second-to-last submitter
    /// @param beacon address of the beacon added
    event RequestBeacon(
        uint128 indexed id,
        address indexed beacon,
        uint256 timestamp
    );

    event CallbackFailed(
        address indexed client,
        uint128 indexed id,
        bytes32 result,
        bytes txData
    );
    event OptimisticReady(
        uint128 indexed id,
        uint256 completeHeight,
        uint256 completeTime
    );

    // Admin events
    event ProposeTransferDeveloper(address proposedDeveloper);
    event AcceptTransferDeveloper(address lastDeveloper, address newDeveloper);
    event CancelTransferDeveloper(address proposedDeveloper);
    event UpdateConfigUint(
        uint256 indexed key,
        uint256 oldValue,
        uint256 newValue
    );
    event UpdateGasEstimate(
        uint256 indexed key,
        uint256 oldValue,
        uint256 newValue
    );
    event UpdateSequencer(address oldSequencer, address newSequencer);

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    error Unauthorized();
    error NewOwnerIsZero();

    /// @notice The developer can propose a new address to be the developer.
    function proposeDeveloper(address _proposedDeveloper) external {
        if (msg.sender != developer) revert Unauthorized();

        emit ProposeTransferDeveloper(_proposedDeveloper);
        proposedDeveloper = _proposedDeveloper;
    }

    /// @notice The proposed developer can accept the developer role.
    function acceptDeveloper() external {
        if (msg.sender != proposedDeveloper) revert Unauthorized();

        emit AcceptTransferDeveloper(developer, msg.sender);
        developer = msg.sender;
        proposedDeveloper = address(0);
    }

    /// @notice The developer or proposed developer can cancel the new developer address proposal.
    function cancelProposeDeveloper() external {
        if (msg.sender != developer && msg.sender != proposedDeveloper)
            revert Unauthorized();

        emit CancelTransferDeveloper(proposedDeveloper);
        proposedDeveloper = address(0);
    }

    function setSequencer(address _sequencer) external {
        if (msg.sender != developer) revert Unauthorized();

        emit UpdateSequencer(sequencer, _sequencer);
        sequencer = _sequencer;
    }

    function setConfigUint(uint256 key, uint256 _value) external onlyOwner {
        emit UpdateConfigUint(key, configUints[key], _value);
        configUints[key] = _value;
    }

    function setGasEstimate(uint256 key, uint256 _value) external onlyOwner {
        emit UpdateGasEstimate(key, gasEstimates[key], _value);
        gasEstimates[key] = _value;
    }

    function getConfigUint(uint256 key) external view returns (uint256) {
        return configUints[key];
    }

    function getGasEstimate(uint256 key) external view returns (uint256) {
        return gasEstimates[key];
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (owner != msg.sender) revert Unauthorized();
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) external virtual onlyOwner {
        if (newOwner == address(0)) revert NewOwnerIsZero();
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}
