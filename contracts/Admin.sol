// SPDX-License-Identifier: BSL 1.1

/// @title Randomizer Admin Functions
/// @author Deanpress (hello@dean.press)
/// @notice Administrative functions, variables, and constants used by Randomizer.
pragma solidity ^0.8.16;

import "./Store.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract Admin is OwnableUpgradeable, Store {
    // Number of beacons per request
    uint256 internal constant BLOCKS_UNTIL_RENEWABLE_ALL = 20;
    uint256 internal constant SECONDS_UNTIL_RENEWABLE_ALL = 10 minutes;
    uint256 internal constant BLOCKS_UNTIL_SUBMITTABLE_SEQUENCER = 10;
    uint256 internal constant SECONDS_UNTIL_SUBMITTABLE_SEQUENCER = 5 minutes;

    // Gas offsets for fee charge
    uint256 internal constant SUBMIT_GAS_OFFSET = 90000;
    uint256 internal constant FINAL_SUBMIT_GAS_OFFSET = 65000;
    uint256 internal constant RENEW_GAS_OFFSET = 21000;

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
    event BeaconUnstake(address indexed beacon, uint256 amount);
    event ClientDeposit(address indexed client, uint256 amount);
    event ClientWithdraw(address indexed client, uint256 amount);
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

    /// @notice Emits an event that contains all data needed for a beacon to submit a random number.
    /// @param request request event data (id, ethReserved, beaconFee, height, timestamp, expirationSeconds, expirationBlocks, callbackGasLimit, client, beacons, lastBeaconSeed)
    event Request(uint128 indexed id, SRequestEventData request);

    /// @notice Emits when final beacon is selected by second-to-last submitter
    /// @param request request event data (id, ethReserved, beaconFee, height, timestamp, expirationSeconds, expirationBlocks, callbackGasLimit, client, beacons, lastBeaconSeed)
    /// @param beacon address of the beacon added
    event RequestBeacon(
        uint128 indexed id,
        SRequestEventData request,
        address beacon
    );
    event Strike(
        address indexed beacon,
        address indexed striker,
        address client,
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

    // Admin events
    event ProposeTransferDeveloper(address proposedDeveloper);
    event AcceptTransferDeveloper(address lastDeveloper, address newDeveloper);
    event CancelTransferDeveloper(address proposedDeveloper);
    event UpdateConfigUint(
        string indexed key,
        uint256 oldValue,
        uint256 newValue
    );
    event UpdateConfigString(
        string indexed key,
        string oldValue,
        string newValue
    );
    event UpdateConfigAddress(
        string indexed key,
        address oldValue,
        address newValue
    );

    error SenderNotDeveloper();
    error SenderNotProposedDeveloper();
    error SenderNotDeveloperOrProposed();

    /// @notice The developer can propose a new address to be the developer.
    function transferDeveloper(address _proposedDeveloper) external {
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

    function cancelTransferDeveloper() external {
        if (msg.sender != developer && msg.sender != proposedDeveloper)
            revert SenderNotDeveloperOrProposed();

        emit CancelTransferDeveloper(proposedDeveloper);
        proposedDeveloper = address(0);
    }

    function setSequencer(address _sequencer) external onlyOwner {
        emit UpdateConfigAddress("sequencer", sequencer, _sequencer);
        sequencer = _sequencer;
    }

    function setBeaconFee(uint256 _amount) external onlyOwner {
        emit UpdateConfigUint("beaconFee", beaconFee, _amount);
        beaconFee = _amount;
    }

    function setMinStakeEth(uint256 _amount) external onlyOwner {
        emit UpdateConfigUint("minStakeEth", minStakeEth, _amount);
        minStakeEth = _amount;
    }

    function setExpirationBlocks(uint256 _expirationBlocks) external onlyOwner {
        emit UpdateConfigUint(
            "expirationBlocks",
            expirationBlocks,
            _expirationBlocks
        );
        expirationBlocks = _expirationBlocks;
    }

    function setExpirationSeconds(uint256 _expirationSeconds)
        external
        onlyOwner
    {
        emit UpdateConfigUint(
            "expirationSeconds",
            expirationSeconds,
            _expirationSeconds
        );
        expirationSeconds = _expirationSeconds;
    }

    function setMaxStrikes(uint8 _maxStrikes) external onlyOwner {
        emit UpdateConfigUint("maxStrikes", maxStrikes, _maxStrikes);
        maxStrikes = _maxStrikes;
    }

    function setRequestMinGasLimit(uint256 _amount) external onlyOwner {
        emit UpdateConfigUint(
            "requestMinGasLimit",
            requestMinGasLimit,
            _amount
        );
        requestMinGasLimit = _amount;
    }

    function setRequestMaxGasLimit(uint256 _amount) external onlyOwner {
        emit UpdateConfigUint(
            "requestMaxGasLimit",
            requestMaxGasLimit,
            _amount
        );
        requestMaxGasLimit = _amount;
    }
}
