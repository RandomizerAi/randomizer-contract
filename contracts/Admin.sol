// SPDX-License-Identifier: BSL 1.1

/// @title Randomizer Admin Functions
/// @author Deanpress (https://github.com/deanpress)
/// @notice Administrative functions, variables, and constants used by Randomizer.
pragma solidity ^0.8.17;

import "./Store.sol";

contract Admin is Store {
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

    event DepositEth(uint8 _type, address indexed account, uint256 amount);

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
    event UnregisterBeacon(
        address indexed beacon,
        bool indexed kicked,
        uint8 strikes
    );

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
    event AuthTransferAction(
        uint8 indexed _action,
        uint8 indexed _type,
        address _old,
        address _new
    );

    event UpdateUint(
        uint8 indexed _type,
        uint256 indexed key,
        uint256 oldValue,
        uint256 newValue
    );

    event UpdateSequencer(address oldSequencer, address newSequencer);

    error Unauthorized();

    /// @notice The developer can propose a new address to be the developer.
    function proposeAuth(uint8 _type, address _proposed) external {
        if (
            (_type == 1 && msg.sender != developer) ||
            (_type == 0 && msg.sender != owner) ||
            (_type != 0 && _type != 1)
        ) revert Unauthorized();

        emit AuthTransferAction(
            AUTH_ACTION_PROPOSE,
            _type,
            msg.sender,
            _proposed
        );

        if (_type == 1) {
            proposedDeveloper = _proposed;
        } else if (_type == 0) {
            proposedOwner = _proposed;
        }
    }

    /// @notice The proposed address can accept the _type role.
    function acceptAuth(uint8 _type) external {
        if (
            (_type == 1 && msg.sender != proposedDeveloper) ||
            (_type == 0 && msg.sender != proposedOwner) ||
            (_type != 0 && _type != 1)
        ) revert Unauthorized();

        emit AuthTransferAction(
            AUTH_ACTION_ACCEPT,
            _type,
            _type == 1 ? developer : owner,
            msg.sender
        );

        if (_type == 1) {
            developer = msg.sender;
            proposedDeveloper = address(0);
        } else if (_type == 0) {
            owner = msg.sender;
            proposedOwner = address(0);
        }
    }

    /// @notice The current or last auth can cancel the new auth proposal.
    function cancelProposeAuth(uint8 _type) external {
        if (
            (_type == 1 &&
                ((msg.sender != developer && msg.sender != proposedDeveloper) ||
                    proposedDeveloper == address(0))) ||
            (_type == 0 &&
                ((msg.sender != owner && msg.sender != proposedOwner) ||
                    proposedOwner == address(0))) ||
            (_type != 0 && _type != 1)
        ) revert Unauthorized();

        if (_type == 1) {
            emit AuthTransferAction(
                AUTH_ACTION_CANCEL,
                _type,
                developer,
                proposedDeveloper
            );
            proposedDeveloper = address(0);
        } else if (_type == 0) {
            emit AuthTransferAction(
                AUTH_ACTION_CANCEL,
                _type,
                owner,
                proposedOwner
            );
            proposedOwner = address(0);
        }
    }

    function setSequencer(address _sequencer) external {
        if (msg.sender != developer) revert Unauthorized();

        emit UpdateSequencer(sequencer, _sequencer);
        sequencer = _sequencer;
    }

    function setConfigUint(uint256 key, uint256 _value) external onlyOwner {
        emit UpdateUint(UINT_TYPE_CONFIG, key, configUints[key], _value);
        configUints[key] = _value;
    }

    function setGasEstimate(uint256 key, uint256 _value) external onlyOwner {
        emit UpdateUint(UINT_TYPE_GAS, key, gasEstimates[key], _value);
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
}
