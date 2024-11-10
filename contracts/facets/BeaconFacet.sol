// SPDX-License-Identifier: BSL 1.1
/// @title Randomizer Beacon Service
/// @author Dean van D. (https://github.com/deanpress)
/// @notice Beacon management functions (registration, staking, submitting random values etc)

pragma solidity ^0.8.28;

import {LibDiamond} from "../libraries/LibDiamond.sol";
import "../libraries/LibVRF.sol";
import "../libraries/LibBeacon.sol";
import "../shared/Structs.sol";
import "../shared/Utils.sol";
import "../libraries/Constants.sol";
import "../AppStorage.sol";

contract BeaconFacet is Utils {
    /* Errors */
    error BeaconAlreadyRegistered();
    error BeaconNotSelected();
    error BeaconHasPending(uint256 pending);
    error NotABeacon();
    error VRFProofInvalid();
    error BeaconValueExists();
    error NotOwnerOrBeacon();
    error BeaconStakedEthTooLow(uint256 staked, uint256 minimum);
    error SequencerSubmissionTooEarly(
        uint256 currentBlock,
        uint256 minBlock,
        uint256 currentTime,
        uint256 minTime
    );
    error SenderNotBeaconOrSequencer();
    error BlockhashUnavailable(uint256 blockNumber);
    error MinHeightNotYetReached(uint256 blockNumber, uint256 minBlockNumber);

    /* Events */

    /// @notice Emits an event when a beacon submits a VRF value for a request
    /// @param id request id
    /// @param beacon address of the beacon that submitted the random value
    /// @param value the submitted random value
    event SubmitRandom(uint256 indexed id, address indexed beacon, bytes10 value);

    /// @notice Emits an event when a beacon is registered
    /// @param beacon address of the registered beacon
    event RegisterBeacon(address indexed beacon);

    /* Functions */

    /// @notice Returns a list of active beacon addresses
    function beacons() external view returns (address[] memory) {
        return s.beacons;
    }

    /// @notice Returns beacon details (VRF keys, registered, strikes, consecutive successful submissions, pending requests, stake, index in beacons list)
    function beacon(
        address _beacon
    )
        external
        view
        returns (
            uint256[2] memory publicKey,
            bool registered,
            uint8 strikes,
            uint8 consecutiveSubmissions,
            uint64 pending,
            uint256 ethStake,
            uint256 index
        )
    {
        return (
            s.beacon[_beacon].publicKey,
            s.beacon[_beacon].registered,
            s.beacon[_beacon].strikes,
            s.beacon[_beacon].consecutiveSubmissions,
            s.beacon[_beacon].pending,
            s.ethCollateral[_beacon],
            s.beaconIndex[_beacon]
        );
    }

    /// @notice Returns request data (result, data hash, fees paid and refunded, submitted vrf hashes)
    function getRequest(
        uint256 _request
    )
        external
        view
        returns (
            bytes32 result,
            bytes32 dataHash,
            uint256 ethPaid,
            uint256 ethRefunded,
            bytes10[2] memory vrfHashes
        )
    {
        return (
            s.results[_request],
            s.requestToHash[_request],
            s.requestToFeePaid[_request],
            s.requestToFeeRefunded[_request],
            s.requestToVrfHashes[_request]
        );
    }

    /// @notice Registers a new beacon
    /// @dev Beacons are responsible for generating VRF proofs and participating in request finalization
    /// @param _beacon address of the beacon to register
    /// @param _vrfPublicKeyData VRF public key x and y components
    function registerBeacon(address _beacon, uint256[2] calldata _vrfPublicKeyData) external {
        // Check if the caller is the contract owner
        LibDiamond.enforceIsContractOwner();

        // Get the minimum required amount of ETH collateral for a beacon
        uint256 minStakeEth = s.configUints[Constants.CKEY_MIN_STAKE_ETH];

        // Check if the beacon is already registered
        if (s.beacon[_beacon].registered) revert BeaconAlreadyRegistered();

        // Check if the beacon has staked enough ETH
        if (s.ethCollateral[_beacon] < minStakeEth)
            revert BeaconStakedEthTooLow(s.ethCollateral[_beacon], minStakeEth);

        // Don't reset beacon pending so that it can pick up where it left off in case it still has pending requests.
        uint64 pending = s.beacon[_beacon].pending;

        // Add the beacon to the contract
        s.beacon[_beacon] = Beacon(_vrfPublicKeyData, true, 0, 0, pending);
        s.beaconIndex[_beacon] = s.beacons.length;
        s.beacons.push(_beacon);

        // Emit an event to log the registration of the beacon
        emit RegisterBeacon(_beacon);
    }

    /// @notice Stake ETH for a beacon
    function beaconStakeEth(address _beacon) external payable {
        // Increase the beacon's ETH collateral by the value of the transaction
        s.ethCollateral[_beacon] += msg.value;

        // Emit an event to log the deposit of ETH by the beacon
        emit Events.BeaconDepositEth(_beacon, msg.value);
    }

    /// @notice Unstake ETH from sender's beacon
    function beaconUnstakeEth(uint256 _amount) external {
        // Decrease the beacon's ETH collateral by the specified amount
        s.ethCollateral[msg.sender] -= _amount;

        // Check if the beacon's collateral is below the minimum required amount
        if (
            s.ethCollateral[msg.sender] < s.configUints[Constants.CKEY_MIN_STAKE_ETH] &&
            s.beaconIndex[msg.sender] != 0
        ) {
            // Check if the beacon has any pending transactions
            if (s.beacon[msg.sender].pending != 0) revert BeaconHasPending(s.beacon[msg.sender].pending);

            // Remove the beacon from the contract
            _removeBeacon(msg.sender);
            emit Events.UnregisterBeacon(msg.sender, false, s.beacon[msg.sender].strikes);
        }

        // Transfer the specified amount of ETH to the beacon
        _transferEth(msg.sender, _amount);
    }

    /// @notice Unregisters the beacon (callable by beacon or owner). Returns staked ETH to beacon.
    function unregisterBeacon(address _beacon) external {
        // Check if the caller is the beacon or the contract owner
        if (msg.sender != _beacon && msg.sender != LibDiamond.contractOwner()) revert NotOwnerOrBeacon();

        // Check if the beacon is registered
        Beacon memory beacon_ = s.beacon[_beacon];
        if (!beacon_.registered) revert NotABeacon();

        // Check if the beacon has any pending transactions
        if (beacon_.pending != 0) revert BeaconHasPending(beacon_.pending);

        // Get the beacon's collateral
        uint256 collateral = s.ethCollateral[_beacon];

        // Remove the beacon from the contract
        _removeBeacon(_beacon);
        emit Events.UnregisterBeacon(_beacon, false, beacon_.strikes);

        // If the beacon had any collateral, refund it
        if (collateral > 0) {
            // Remove the beacon's collateral
            s.ethCollateral[_beacon] = 0;

            // Refund ETH to the beacon
            _transferEth(_beacon, collateral);
        }
    }

    /// @notice Submit VRF data as a beacon
    /// @param beaconPos The position of the beacon submitting the request
    /// @param _addressData An array of addresses containing the request beacons and the client
    /// @param _uintData An array of uint256 values containing request data
    /// @param seed The seed used to generate the VRF output
    function submitRandom(
        uint256 beaconPos,
        address[4] calldata _addressData,
        uint256[19] calldata _uintData,
        bytes32 seed
    ) external {
        uint256 gasAtStart = gasleft();

        (SAccounts memory accounts, SPackedSubmitData memory packed) = LibBeacon._getAccountsAndPackedData(
            _addressData,
            _uintData
        );

        _submissionStep(msg.sender, beaconPos, seed, gasAtStart, packed, accounts);
    }

    /// @notice Submit VRF data for a request on behalf of a beacon using signatures
    /// @param beaconPos The position in the request of the beacon
    /// @param _addressData An array of addresses containing the request beacons and the client
    /// @param _uintData An array of uint256 values containing request data
    /// @param _rsAndSeed An array of bytes32 values containing the request's seed and signature data
    /// @param _v The recovery byte for the signature
    function submitRandom(
        uint256 beaconPos,
        address[4] calldata _addressData,
        uint256[19] calldata _uintData,
        bytes32[3] calldata _rsAndSeed,
        uint8 _v
    ) external {
        // Save the gas remaining at the start of the function execution
        uint256 gasAtStart = gasleft();

        // Retrieve the accounts and packed data for the given address and uint data
        (SAccounts memory accounts, SPackedSubmitData memory packed) = LibBeacon._getAccountsAndPackedData(
            _addressData,
            _uintData
        );

        // Verify the beacon's signature using the ECDSA recovery algorithm
        address _beacon = ecrecover(
            keccak256(
                abi.encodePacked(
                    "\x19Ethereum Signed Message:\n32",
                    keccak256(
                        abi.encode(
                            address(this),
                            accounts.client,
                            _rsAndSeed[2],
                            packed.id,
                            packed.vrf.proof,
                            packed.vrf.uPoint,
                            packed.vrf.vComponents,
                            block.chainid
                        )
                    )
                )
            ),
            _v,
            _rsAndSeed[0],
            _rsAndSeed[1]
        );

        // Process the submission for the given beacon
        _submissionStep(_beacon, beaconPos, _rsAndSeed[2], gasAtStart, packed, accounts);
    }

    function _submissionStep(
        address _beacon,
        uint256 beaconPos,
        bytes32 seed,
        uint256 gasAtStart,
        SPackedSubmitData memory packed,
        SAccounts memory accounts
    ) private {
        _validateRequestData(packed.id, seed, accounts, packed.data);
        bytes10[2] memory reqValues = s.requestToVrfHashes[packed.id];

        // Check if beacon or sequencer can submit the result
        _checkCanSubmit(_beacon, accounts.beacons, beaconPos, reqValues, packed.data);

        // Verify with the seed
        if (
            !LibVRF.fastVerify(
                s.beacon[_beacon].publicKey,
                packed.vrf.proof,
                abi.encodePacked(seed),
                packed.vrf.uPoint,
                packed.vrf.vComponents
            )
        ) revert VRFProofInvalid();

        bytes10 vrfHash = bytes10(keccak256(abi.encodePacked(packed.vrf.proof[0], packed.vrf.proof[1])));

        // Every 100 consecutive submissions, strikes are reset to 0
        _updateBeaconSubmissionCount(_beacon);
        emit SubmitRandom(packed.id, _beacon, vrfHash);

        if (beaconPos < 2) {
            s.requestToVrfHashes[packed.id][beaconPos] = vrfHash;
            reqValues[beaconPos] = vrfHash;
            _processRandomSubmission(accounts, packed, gasAtStart, reqValues);
        } else {
            _processFinalSubmission(reqValues, vrfHash, accounts, packed, gasAtStart);
        }
    }

    function _processFinalSubmission(
        bytes10[2] memory reqValues,
        bytes10 vrfHash,
        SAccounts memory accounts,
        SPackedSubmitData memory packed,
        uint256 gasAtStart
    ) private {
        // Protect against reentrancy attacks
        if (s._status == Constants.STATUS_ENTERED) revert ReentrancyGuard();
        s._status = Constants.STATUS_ENTERED;

        // Process the final beacon submission
        _processResult(
            packed.id,
            accounts.client,
            [reqValues[0], reqValues[1], vrfHash],
            packed.data.callbackGasLimit,
            packed.data.ethReserved
        );

        // Calculate and charge the beacon fee
        uint256 submitFee = LibBeacon._getFeeCharge(
            gasAtStart,
            packed.data.beaconFee,
            s.gasEstimates[Constants.GKEY_OFFSET_FINAL_SUBMIT]
        );

        _finalSoftChargeClient(packed.id, accounts.client, submitFee, packed.data.beaconFee);

        // Clean up the mapping for the request
        delete s.requestToHash[packed.id];
        delete s.requestToVrfHashes[packed.id];

        // Reset the reentrancy guard status
        s._status = Constants.STATUS_NOT_ENTERED;
    }

    function _updateBeaconSubmissionCount(address _beacon) private {
        // Retrieve the Beacon struct for the given beacon address
        Beacon memory memBeacon = s.beacon[_beacon];

        // If the consecutive submissions count is greater than or equal to the maximum allowed, reset it to 0
        // and set the number of strikes to 0
        if (memBeacon.consecutiveSubmissions >= Constants.CKEY_MAX_CONSECUTIVE_SUBMISSIONS) {
            memBeacon.consecutiveSubmissions = 0;
            memBeacon.strikes = 0;
        } else {
            // If the consecutive submissions count is less than the maximum allowed, increment it
            unchecked {
                ++memBeacon.consecutiveSubmissions;
            }
        }

        // Decrement the pending count for the beacon
        if (memBeacon.pending > 0) {
            unchecked {
                --memBeacon.pending;
            }
        }

        // Save the updated Beacon struct
        s.beacon[_beacon] = memBeacon;
    }

    /// @notice Processes a random submission by checking the request's first two VRF hashes
    /// and generating a new seed value using these hashes and the request's blockhash.
    /// It also charges the client a fee based on the gas used and the beacon fee.
    function _processRandomSubmission(
        SAccounts memory accounts, // A struct containing beacons and client addresses
        SPackedSubmitData memory packed, // Data about the request/submission
        uint256 gasAtStart, // The amount of gas at the start of the function call
        bytes10[2] memory reqValues // The first two VRF values submitted for this request
    ) private {
        // Check if the second to last request VRF value is valid and non-zero
        if (reqValues[0] != bytes10(0) && reqValues[1] != bytes10(0)) {
            bytes32 newSeed = LibNetwork._generateNewSeed(packed.data.height, reqValues[0], reqValues[1]);
            // Request the final beacon with the generated seed value
            _requestBeacon(packed.id, 2, newSeed, accounts, packed.data);
        }

        // Calculate the fee to charge the client
        uint256 fee = LibBeacon._getFeeCharge(
            gasAtStart,
            packed.data.beaconFee,
            s.gasEstimates[Constants.GKEY_OFFSET_SUBMIT]
        );

        // Charge the client the calculated fee
        _softChargeClient(packed.id, accounts.client, fee);
    }

    /// @notice Checks if a beacon can submit a random value. It checks the request's
    /// selected beacon, the sender of the message, and the timestamp/height of the
    /// request. If any of these checks fail, the function reverts with an error.
    function _checkCanSubmit(
        address _beacon, // The address of the selected beacon
        address[3] memory _beacons, // The array of selected beacon addresses
        uint256 beaconPos, // The position of the selected beacon in the array
        bytes10[2] memory reqValues, // The last two beacon values for the request
        SRandomUintData memory data // Data about the request
    ) private view {
        // Check if the selected beacon is in the correct position in the beacon array
        if (_beacons[beaconPos] != _beacon) revert BeaconNotSelected();

        // Checks for non-final beacons
        if (beaconPos < 2) {
            // Check if the first two requests are not zero
            if (reqValues[beaconPos] != bytes10(0)) revert BeaconValueExists();

            // Check if minConfirmations has passed for non-final beacons only.
            // Final submitter does not need a minConfirmations check because
            // it's only needed to secure the blockhash of the request height
            // used to generate the seed for the final beacon.
            if (LibNetwork._blockNumber() < data.height + data.minConfirmations)
                revert MinHeightNotYetReached(LibNetwork._blockNumber(), data.height + data.minConfirmations);
        }

        if (msg.sender != _beacon) {
            // If not a beacon, the only other permitted sender is the sequencer
            if (msg.sender != s.sequencer) revert SenderNotBeaconOrSequencer();
            // Calculate the earliest time that the sequencer can submit on behalf of the beacon
            uint256 sequencerSubmitTime = data.timestamp + (data.expirationSeconds / 2);

            // Calculate the earliest block number that the sequencer can submit on behalf of the beacon
            uint256 sequencerSubmitBlock = data.height + (data.expirationBlocks / 2) + data.minConfirmations;

            // Check if the sequencer is submitting too early
            if (block.timestamp < sequencerSubmitTime || LibNetwork._blockNumber() < sequencerSubmitBlock)
                // If the sequencer is submitting too early, revert with an error
                revert SequencerSubmissionTooEarly(
                    LibNetwork._blockNumber(),
                    sequencerSubmitBlock,
                    block.timestamp,
                    sequencerSubmitTime
                );
        }
    }
}
