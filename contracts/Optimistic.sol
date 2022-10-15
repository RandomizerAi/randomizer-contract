// SPDX-License-Identifier: BSL 1.1

/// @title Randomizer Optimistic Service
/// @author Deanpress (https://github.com/deanpress)
/// @notice Optimistic VRF functions for Randomizer
pragma solidity ^0.8.17;

import "./lib/Structs.sol";
import "./Utils.sol";

contract Optimistic is Utils {
    error NotDisputeable();
    error NotCompleteable();
    error VRFDataMismatch();
    error ProofNotInvalid();

    /// @notice Disputes a VRF submission. If the VRF validation in this function fails, the VRF beacon's stake goes to the disputer and the request is renewed.
    function dispute(
        uint256 beaconPos,
        address[4] calldata _addressData,
        uint256[18] calldata _uintData,
        bytes32 seed
    ) external {
        // Request is disputeable until the request is completed by a complete() call
        (
            SAccounts memory accounts,
            SPackedSubmitData memory packed
        ) = _getAccountsAndPackedData(_addressData, _uintData);

        _validateRequestData(packed.id, seed, accounts, packed.data, true);

        // Check that encoded vrfData matches the hash stores in proof
        bytes32 vrfBytes = keccak256(abi.encode(packed.vrf));
        if (
            vrfBytes == bytes32(0) ||
            vrfBytes != requestToProofs[packed.id][beaconPos]
        ) revert VRFDataMismatch();

        address beacon = accounts.beacons[beaconPos];

        DisputeReturnData memory cd = IInternals(internals)._dispute(
            packed.id,
            seed,
            packed.vrf,
            DisputeCallVars({
                publicKeys: sBeacon[beacon].publicKey,
                feePaid: requestToFeePaid[packed.id],
                clientDeposit: ethDeposit[accounts.client],
                collateral: ethCollateral[beacon],
                beacon: beacon,
                client: accounts.client
            }),
            vrf
        );

        // Iterate through beaconsToRemove and remove them
        // Don't need to emit an Invalid event because Internals already emits BeaconInvalidVRF
        if (cd.vrfFailed) {
            requestToFeeRefunded[packed.id] += cd.feeRefunded;
            ethDeposit[accounts.client] = cd.newClientDeposit;
            if (cd.ethToSender > 0) ethCollateral[msg.sender] += cd.ethToSender;
            ethCollateral[beacon] = 0;
            if (sBeacon[beacon].exists) {
                _removeBeacon(beacon);
                emit RemoveBeacon(beacon, sBeacon[beacon].strikes);
            }
            // Delete the old request and generate a new one with the same parameters (except for new seed, beacons, and block data)
            delete optRequestDisputeWindow[packed.id];
            delete requestToProofs[packed.id][beaconPos];
            delete requestToVrfHashes[packed.id][beaconPos];

            // Replace the beacon in the request and emit RequestBeacon for the new beacon
            packed.data.height = block.number;
            packed.data.timestamp = block.timestamp;
            address randomBeacon = _randomBeacon(seed, accounts.beacons);
            accounts.beacons[beaconPos] = randomBeacon;
            requestToHash[packed.id] = _generateRequestHash(
                packed.id,
                accounts,
                packed.data,
                seed,
                true
            );
            emit RequestBeacon(packed.id, randomBeacon, packed.data.timestamp);
        } else {
            revert ProofNotInvalid();
        }
    }

    /// @notice Complete an optimistic random submission after the dispute window is over.
    function completeOptimistic(
        address[4] calldata _addressData,
        uint256[8] calldata _uintData,
        bytes32 seed
    ) external {
        uint256 gasAtStart = gasleft();

        SAccounts memory accounts = _resolveAddressCalldata(_addressData);
        SPackedUintData memory packed = _resolveUintData(_uintData);
        _validateRequestData(packed.id, seed, accounts, packed.data, true);
        uint256[2] memory window = optRequestDisputeWindow[packed.id];

        // Require that this function can only be called by the first beacon in the first 5 minutes of the dispute window, then by the second beacon in the next 5 minutes, and so on.
        if (window[0] == 0) revert NotCompleteable();

        if (msg.sender == sequencer) {
            _optCanComplete(
                packed.data.expirationBlocks,
                packed.data.expirationSeconds,
                window,
                3
            );
        } else {
            bool isBeacon;
            for (uint256 i; i < 3; i++) {
                if (accounts.beacons[i] == msg.sender) {
                    _optCanComplete(
                        packed.data.expirationBlocks,
                        packed.data.expirationSeconds,
                        window,
                        i
                    );
                    isBeacon = true;
                    break;
                }
            }
            if (!isBeacon) {
                _optCanComplete(
                    packed.data.expirationBlocks,
                    packed.data.expirationSeconds,
                    window,
                    4
                );
            }
        }

        _processResult(
            packed.id,
            accounts.client,
            requestToVrfHashes[packed.id],
            packed.data.callbackGasLimit,
            packed.data.ethReserved
        );

        delete requestToVrfHashes[packed.id];
        delete optRequestDisputeWindow[packed.id];
        delete requestToProofs[packed.id];
        delete requestToHash[packed.id];

        uint256 fee = ((gasAtStart -
            gasleft() +
            gasEstimates[GKEY_COMPLETE_OPTIMISTIC]) * _getGasPrice()) +
            packed.data.beaconFee;

        _softChargeClient(
            packed.id,
            true,
            accounts.client,
            fee,
            packed.data.beaconFee
        );
    }

    function _optCanComplete(
        uint256 _expirationBlocks,
        uint256 _expirationSeconds,
        uint256[2] memory _window,
        uint256 _multiplier
    ) internal view {
        uint256 completeHeight = _window[0] +
            ((_expirationBlocks / 2) * _multiplier);
        uint256 completeTimestamp = _window[1] +
            ((_expirationSeconds / 2) * _multiplier);
        if (
            block.number < completeHeight || block.timestamp < completeTimestamp
        )
            revert NotYetCompletableBySender(
                block.number,
                completeHeight,
                block.timestamp,
                completeTimestamp
            );
    }

    /// @notice Returns the dispute window of a request (0 if no dispute window). First value is blocks, second is seconds.
    function getDisputeWindow(uint128 _request)
        external
        view
        returns (uint256[2] memory)
    {
        return optRequestDisputeWindow[_request];
    }

    // Called on final submission, adds time window for disputes after which it can be completed
    function _processFinalOptimisticSubmission(
        uint128 id,
        address client,
        uint256 gasAtStart,
        uint256 _beaconFee
    ) internal {
        if (_status == _ENTERED) revert ReentrancyGuard();
        _status = _ENTERED;
        // Final beacon submission logic (callback & complete)

        // Set dispute window time
        uint256[2] memory disputeWindow = [
            block.number + configUints[CKEY_EXPIRATION_BLOCKS],
            block.timestamp + configUints[CKEY_EXPIRATION_SECONDS]
        ];
        optRequestDisputeWindow[id] = disputeWindow;

        // Beacon fee
        uint256 submitFee = _getFeeCharge(
            gasAtStart,
            _beaconFee,
            gasEstimates[GKEY_PROCESS_OPTIMISTIC]
        );

        _softChargeClient(id, false, client, submitFee, 0);

        emit OptimisticReady(id, disputeWindow[0], disputeWindow[1]);

        _status = _NOT_ENTERED;
    }
}
