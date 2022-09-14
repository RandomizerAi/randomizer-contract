// SPDX-License-Identifier: BSL 1.1

/// @title Randomizer Admin Functions
/// @author Deanpress (https://github.com/deanpress)
/// @notice Administrative functions, variables, and constants used by Randomizer.
pragma solidity ^0.8.16;

import "./Store.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract Admin is OwnableUpgradeable, Store {
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
    /// @param fromDepositOrCollateral charged from ethDeposit (client) or ethCollateral (beacon). False = deposit, true = collateral.
    /// @param toDepositOrCollateral sent to ethDeposit (client) or ethCollateral (beacon).
    event ChargeEth(
        address indexed from,
        address indexed to,
        uint256 amount,
        bool fromDepositOrCollateral,
        bool toDepositOrCollateral
    );

    event WithdrawEth(address indexed to, uint256 amount);
    event RegisterBeacon(address indexed beacon);
    event UnregisterBeacon(address indexed beacon, uint256 strikes);
    event RemoveBeacon(address indexed beacon, uint8 strikes);
    event BeaconInvalidVRF(
        address indexed beacon,
        uint128 indexed request,
        uint256[2] publicKey,
        uint256[4] proof,
        bytes32 seed,
        uint256[2] uPoint,
        uint256[4] vComponents
    );

    /// @notice Emits an event that contains all data needed for a beacon to submit a random number.
    /// @param request request event data (id, ethReserved, beaconFee, height, timestamp, expirationSeconds, expirationBlocks, callbackGasLimit, client, beacons, lastBeaconSeed)
    event Request(uint128 indexed id, SRequestEventData request);

    /// @notice Emits when final beacon is selected by second-to-last submitter
    /// @param request request event data (id, ethReserved, beaconFee, height, timestamp, expirationSeconds, expirationBlocks, callbackGasLimit, client, beacons, lastBeaconSeed)
    /// @param beacon address of the beacon added
    event RequestBeacon(
        uint128 indexed id,
        SRequestEventData request,
        address indexed beacon
    );
    event Strike(
        address indexed beacon,
        address indexed striker,
        address indexed client,
        uint128 id,
        uint256 amount,
        uint256 slashedTokens
    );
    event CallbackFailed(
        address indexed client,
        uint128 indexed id,
        bytes32 value,
        bytes txData
    );
    event OptimisticReady(
        uint128 indexed id,
        uint256 completeTime,
        uint256 completeHeight
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
    event UpdateSequencer(address oldSequencer, address newSequencer);
    event UpdateConfigGasEstimates(uint256[6] from, uint256[6] to);

    error SenderNotDeveloper();
    error SenderNotProposedDeveloper();
    error SenderNotDeveloperOrProposed();

    /// @notice The developer can propose a new address to be the developer.
    function proposeDeveloper(address _proposedDeveloper) external {
        if (msg.sender != developer) revert SenderNotDeveloper();

        emit ProposeTransferDeveloper(_proposedDeveloper);
        proposedDeveloper = _proposedDeveloper;
    }

    function acceptDeveloper(address _proposedDeveloper) external {
        if (
            msg.sender != proposedDeveloper &&
            proposedDeveloper != _proposedDeveloper
        ) revert SenderNotProposedDeveloper();

        emit AcceptTransferDeveloper(developer, _proposedDeveloper);
        developer = _proposedDeveloper;
    }

    function cancelProposeDeveloper() external {
        if (msg.sender != developer && msg.sender != proposedDeveloper)
            revert SenderNotDeveloperOrProposed();

        emit CancelTransferDeveloper(proposedDeveloper);
        proposedDeveloper = address(0);
    }

    function setSequencer(address _sequencer) external {
        if (msg.sender != developer) revert SenderNotDeveloper();

        emit UpdateSequencer(sequencer, _sequencer);
        sequencer = _sequencer;
    }

    function setConfigUint(uint256 key, uint256 _value) external onlyOwner {
        uint256 old = configUints[key];
        configUints[key] = _value;
        emit UpdateConfigUint(key, old, _value);
    }

    function setGasEstimates(uint256[6] calldata _amounts) external onlyOwner {
        emit UpdateConfigGasEstimates(
            [
                gasEstimates.totalSubmit,
                gasEstimates.submit,
                gasEstimates.finalSubmit,
                gasEstimates.renew,
                gasEstimates.processOptimistic,
                gasEstimates.completeOptimistic
            ],
            _amounts
        );

        gasEstimates = SGasEstimates(
            _amounts[0],
            _amounts[1],
            _amounts[2],
            _amounts[3],
            _amounts[4],
            _amounts[5]
        );
    }
}
