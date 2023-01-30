// SPDX-License-Identifier: BUSL-1.1

/// @title Randomizer Renew Facet (https://randomizer.ai)
/// @author Dean van Dugteren (https://github.com/deanpress)
/// @notice Handles renewals for Randomizer.

pragma solidity ^0.8.17;

import {LibDiamond} from "../libraries/LibDiamond.sol";
import "../libraries/LibBeacon.sol";
import "../libraries/LibNetwork.sol";
import "../AppStorage.sol";
import "../libraries/Constants.sol";
import "../shared/Utils.sol";

contract RenewFacet is Utils {
    /* Errors */
    error NotYetRenewable(
        uint256 height,
        uint256 expirationHeight,
        uint256 timestamp,
        uint256 expirationSeconds
    );

    error CantRenewDuringDisputeWindow();

    /* Functions */

    /// @notice Returns the total amount paid and refunded for a request
    function getFeeStats(uint256 _request) external view returns (uint256[2] memory) {
        return [s.requestToFeePaid[_request], s.requestToFeeRefunded[_request]];
    }

    /// @notice Renew a request
    /// @param _addressData array of addresses (client, beacon1, beacon2, beacon3)
    /// @param _uintData array of uint256 data (request ID, SRandomUintData memory, SPackedUintData memory)
    /// @param _seed seed used for generating the request hash
    function renewRequest(
        address[4] calldata _addressData,
        uint256[9] calldata _uintData,
        bytes32 _seed
    ) external {
        // 20k gas offset for balance updates after fee calculation
        uint256 gasAtStart = gasleft() + s.gasEstimates[Constants.GKEY_OFFSET_RENEW];

        SAccounts memory accounts = LibBeacon._resolveAddressCalldata(_addressData);
        SPackedUintData memory packed = LibBeacon._resolveUintData(_uintData);

        if (packed.data.height == 0) revert RequestNotFound(packed.id);

        bytes32 generatedHash = LibBeacon._generateRequestHash(packed.id, accounts, packed.data, _seed);
        if (s.requestToHash[packed.id] != generatedHash)
            revert RequestDataMismatch(generatedHash, s.requestToHash[packed.id]);

        // For the first expiration period, the request's first submitting beacon can renew it exclusively
        // After another half expiration period it's open to the sequencer
        // After another half expiration period it's open to everyone to renew
        // This sequential access prevents front-running

        bytes10[2] memory hashes = s.requestToVrfHashes[packed.id];

        {
            uint256 _expirationHeight = packed.data.height +
                packed.data.expirationBlocks +
                packed.data.minConfirmations;
            uint256 _expirationTime = packed.data.timestamp +
                packed.data.expirationSeconds +
                packed.data.minConfirmations;
            if (msg.sender == s.sequencer) {
                _expirationHeight += packed.data.expirationBlocks / 2;
                _expirationTime += packed.data.expirationSeconds / 2;
            } else if (
                // First beacon can renew first if they submitted
                // Second beacon can renew first if the first beacon has not yet submitted
                // Here we check if it's NOT the first allowed renewer, and let anyone else submit after another full expiration period.
                !((msg.sender == accounts.beacons[0] && hashes[0] != bytes10(0)) ||
                    (msg.sender == accounts.beacons[1] && hashes[1] != bytes10(0) && hashes[0] == bytes10(0)))
            ) {
                _expirationHeight += packed.data.expirationBlocks;
                _expirationTime += packed.data.expirationSeconds;
            }

            if (LibNetwork._blockNumber() < _expirationHeight || block.timestamp < _expirationTime)
                revert NotYetRenewable(
                    LibNetwork._blockNumber(),
                    _expirationHeight,
                    block.timestamp,
                    _expirationTime
                );
        }

        // Update the data of beacons to strike
        address[] memory beaconsToStrike = new address[](3);
        uint8 beaconsToStrikeLen = 0;
        address[3] memory reqBeacons = accounts.beacons;
        for (uint256 i; i < 2; i++) {
            if (hashes[i] == bytes10(0) && reqBeacons[i] != address(0)) {
                address beaconAddress = reqBeacons[i];
                _strikeBeacon(beaconAddress);
                beaconsToStrike[i] = beaconAddress;
                beaconsToStrikeLen++;
            }
        }

        // Handle last beacon separately
        // The 3rd beacon is only set if the other 2 have submitted values
        // This beacon never has a stored vrf value (since they're deleted on finalization) so we don't need to check it
        if (reqBeacons[2] != address(0)) {
            address beaconAddress = reqBeacons[2];
            _strikeBeacon(beaconAddress);
            beaconsToStrike[2] = beaconAddress;
            beaconsToStrikeLen++;
        }

        // Checks if enough beacons are available to replace with
        if (s.beacons.length < 5 || beaconsToStrikeLen * 2 > s.beacons.length - 1)
            revert NotEnoughBeaconsAvailable(
                s.beacons.length,
                s.beacons.length < 5 ? 5 : beaconsToStrikeLen * 2
            );

        accounts.beacons = _replaceNonSubmitters(packed.id, accounts.beacons, hashes);

        // Refund fees paid by client paid by non-submitting beacon
        // Add gas fee for refund function
        address firstStrikeBeacon;
        for (uint256 i; i < beaconsToStrike.length; i++) {
            if (beaconsToStrike[i] == address(0)) continue;

            if (firstStrikeBeacon == address(0)) firstStrikeBeacon = beaconsToStrike[i];

            Beacon memory strikeBeacon = s.beacon[beaconsToStrike[i]];

            // If beacon drops below minimum collateral in any token: drop them from beacons list
            // The beacon will need to be voted back in
            // beaconToStrikeCount = the strikes a beacon has
            // beaconsToStrike = array of all beacon addresses that should be striked in this for-loop
            // The strikes are reset to 0 since it shouldn't be slashed at every following request
            if (
                strikeBeacon.registered &&
                (s.ethCollateral[beaconsToStrike[i]] < s.configUints[Constants.CKEY_MIN_STAKE_ETH] ||
                    // tokenCollateral[beaconsToStrike[i]] < minToken ||
                    strikeBeacon.strikes > s.configUints[Constants.CKEY_MAX_STRIKES])
            ) {
                // Remove beacon from beacons
                _removeBeacon(beaconsToStrike[i]);
                emit Events.UnregisterBeacon(beaconsToStrike[i], true, s.beacon[beaconsToStrike[i]].strikes);
            }
        }

        packed.data.height = LibNetwork._blockNumber();
        packed.data.timestamp = block.timestamp;
        s.requestToHash[packed.id] = LibBeacon._generateRequestHash(packed.id, accounts, packed.data, _seed);

        SRequestEventData memory eventData = SRequestEventData(
            packed.data.ethReserved,
            packed.data.beaconFee,
            packed.data.timestamp,
            packed.data.expirationBlocks,
            packed.data.expirationSeconds,
            packed.data.callbackGasLimit,
            packed.data.minConfirmations,
            accounts.client,
            accounts.beacons,
            _seed
        );

        // The paying non-submitter might fall below collateral here. It will be removed on next strike if it doesn't add collateral.
        uint256 renewFee = packed.data.beaconFee + (LibNetwork._gasPrice() * (gasAtStart - gasleft()));

        uint256 refundToClient = s.requestToFeePaid[packed.id];
        uint256 totalCharge = renewFee + refundToClient;

        // If charging more than the striked beacon has staked, refund the remaining stake to the client
        uint256 firstCollateral = s.ethCollateral[firstStrikeBeacon];
        if (firstCollateral > 0) {
            if (totalCharge > firstCollateral) {
                totalCharge = firstCollateral;
                renewFee = renewFee > totalCharge ? totalCharge : renewFee;
                s.ethCollateral[msg.sender] += renewFee;
                emit Events.ChargeEth(
                    firstStrikeBeacon,
                    msg.sender,
                    renewFee,
                    Constants.CHARGE_TYPE_BEACON_TO_BEACON
                );
                // totalCharge - renewFee is now 0 at its lowest
                // If collateral is remaining after renewFee, it will be refunded to the client
                refundToClient = totalCharge - renewFee;
                if (refundToClient > 0) {
                    s.ethDeposit[accounts.client] += refundToClient;
                    emit Events.ChargeEth(
                        firstStrikeBeacon,
                        accounts.client,
                        refundToClient,
                        Constants.CHARGE_TYPE_BEACON_TO_CLIENT
                    );
                }
                s.ethCollateral[firstStrikeBeacon] = 0;
            } else {
                s.ethCollateral[firstStrikeBeacon] -= totalCharge;
                // Refund this function's gas to the caller
                s.ethCollateral[msg.sender] += renewFee;
                s.ethDeposit[accounts.client] += refundToClient;
                // Add to fees refunded
                s.requestToFeeRefunded[packed.id] += refundToClient;
                // Client receives refund to ensure they have enough to pay for the next request
                // Also since the request is taking slower than expected due to a non-submitting beacon,
                // the non-submitting beacon should pay for the delay.
                // Log charge from striked beacon to caller (collateral to collateral)
                emit Events.ChargeEth(firstStrikeBeacon, msg.sender, renewFee, 2);
                // Log charge from striked beacon to client (collateral to deposit)
                emit Events.ChargeEth(
                    firstStrikeBeacon,
                    accounts.client,
                    refundToClient,
                    Constants.CHARGE_TYPE_BEACON_TO_CLIENT
                );
            }
        } else {
            refundToClient = 0;
            renewFee = 0;
        }

        // Log Retry
        emit Events.Retry(packed.id, eventData, firstStrikeBeacon, msg.sender, refundToClient, renewFee);
    }

    function _strikeBeacon(address _beacon) internal {
        Beacon memory tempBeacon = s.beacon[_beacon];
        if (tempBeacon.registered) tempBeacon.strikes++;
        tempBeacon.consecutiveSubmissions = 0;
        if (tempBeacon.pending > 0) tempBeacon.pending--;
        s.beacon[_beacon] = tempBeacon;
    }

    /// @dev Replaces all non-submitting beacons from a request (called when a request is renewed)
    function _replaceNonSubmitters(
        uint256 _request,
        address[3] memory _beacons,
        bytes10[2] memory _values
    ) private returns (address[3] memory) {
        // Generate a random value based on the contract address, the request ID, the previous block's hash,
        // and the chain ID
        bytes32 random = keccak256(
            abi.encode(
                address(this),
                _request,
                LibNetwork._blockHash(LibNetwork._blockNumber() - 1),
                block.chainid
            )
        );

        address[3] memory newSelectedBeacons;
        uint256 i;

        address[5] memory excludedBeacons = [_beacons[0], _beacons[1], _beacons[2], address(0), address(0)];
        (address[] memory availableBeacons, uint256 count) = _beaconsWithoutExcluded(_beacons);
        uint256 excludedBeaconCount = 3;

        while (i < 3) {
            // If non-submitter
            if (
                (i != 2 && _values[i] == bytes10(0) && _beacons[i] != address(0)) ||
                (i == 2 && _beacons[i] != address(0))
            ) {
                // Generate new beacon beacon index
                uint256 randomBeaconIndex = uint256(random) % count;
                // Get a random beacon from the available beacons
                address randomBeacon = availableBeacons[randomBeaconIndex];
                // Assign the random beacon to newSelectedBeacons
                newSelectedBeacons[i] = randomBeacon;
                s.beacon[randomBeacon].pending++;
                // Add the beacon to the excluded beacons
                excludedBeacons[excludedBeaconCount] = randomBeacon;
                excludedBeaconCount++;
                // Update the available beacons
                (availableBeacons, count) = _beaconsWithoutExcluded(excludedBeacons, excludedBeaconCount);
            } else {
                // If the beacon already submitted, assign it to its existing position
                newSelectedBeacons[i] = _beacons[i];
            }
            unchecked {
                ++i;
            }
        }

        return newSelectedBeacons;
    }
}
