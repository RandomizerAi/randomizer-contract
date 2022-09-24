// SPDX-License-Identifier: BSL 1.1

/** 
 @title Randomizer.AI (https://randomizer.ai)
 @author Dean van Dugteren (https://github.com/deanpress)
 @notice A decentralized protocol that sends random values to requesting smart contracts
**/

pragma solidity ^0.8.16;

import "./Client.sol";

contract Randomizer is Client, Beacon {
    // Errors exclusive to Beacon.sol
    error NotYetRenewable(
        uint256 height,
        uint256 expirationHeight,
        uint256 timestamp,
        uint256 expirationSeconds
    );

    error CantRenewDuringDisputeWindow();

    /// @notice One-time internal initializer of the contract.
    /// @dev To be called only once on deployment of RandomizerStatic (in constructor) or RandomizerUpgradeable (in initialize()).
    function init(
        // Developer, Sequencer
        address[2] memory _addresses,
        uint256[7] memory _configUints,
        address[] memory _beacons,
        uint256[] memory _beaconPublicKeys,
        uint256[] memory _gasEstimates
    ) internal {
        require(
            _beaconPublicKeys.length == _beacons.length * 2,
            "BEACON_LENGTH"
        );
        _transferOwnership(_addresses[0]);
        developer = _addresses[0];
        sequencer = _addresses[1];

        for (uint256 i = 0; i < 7; i++) {
            configUints[i] = _configUints[i];
        }

        // Beacon.add(store, address(0));
        beacons.push(address(0));
        uint256 length = _beacons.length;
        for (uint256 i; i < length; i++) {
            beaconIndex[_beacons[i]] = beacons.length;
            beacons.push(_beacons[i]);
            sBeacon[_beacons[i]] = SBeacon(
                [
                    _beaconPublicKeys[i * 2],
                    _beaconPublicKeys[i == 0 ? 1 : i * 2 + 1]
                ],
                true,
                0,
                0,
                0
            );
        }

        require(_gasEstimates.length <= 16, "GAS_ESTIMATES_LENGTH");
        for (uint256 i; i < length; i++) {
            gasEstimates[i] = _gasEstimates[i];
        }

        _status = _NOT_ENTERED;
    }

    function getResult(uint128 _request) external view returns (bytes32) {
        return results[_request];
    }

    /// @notice Returns the dispute window of a request (0 if no dispute window). First value is blocks, second is seconds.
    function getDisputeWindow(uint128 _request)
        external
        view
        returns (uint256[2] memory)
    {
        return optRequestDisputeWindow[_request];
    }

    function renewRequest(
        address[4] calldata _addressData,
        uint256[8] calldata _uintData,
        bytes32 _seed,
        bool _optimistic
    ) external {
        // 20k gas offset for balance updates after fee calculation
        uint256 gasAtStart = gasleft() + gasEstimates[GKEY_RENEW];

        SAccounts memory accounts = _resolveAddressCalldata(_addressData);
        SPackedUintData memory packed = _resolveUintData(_uintData);

        if (packed.data.height == 0) revert RequestNotFound(packed.id);

        if (_optimistic) {
            if (optRequestDisputeWindow[packed.id][0] != 0)
                revert CantRenewDuringDisputeWindow();
        }

        bytes32 generatedHash = _getRequestHash(
            packed.id,
            accounts,
            packed.data,
            _seed,
            _optimistic
        );
        if (requestToHash[packed.id] != generatedHash)
            revert RequestDataMismatch(generatedHash, requestToHash[packed.id]);

        uint256 _expirationBlocks;
        uint256 _expirationSeconds;

        // For the first expiration period, the first successful submitter of this request can renew it exclusively
        // After half an expiration period it's open to the sequencer
        // After another half expiration period, it's open to everyone to renew
        if (_getFirstSubmitter(packed.id, accounts.beacons) == msg.sender) {
            _expirationBlocks =
                packed.data.height +
                packed.data.expirationBlocks;
            _expirationSeconds =
                packed.data.timestamp +
                packed.data.expirationSeconds;
        } else if (msg.sender == sequencer) {
            _expirationBlocks =
                packed.data.height +
                packed.data.expirationBlocks +
                (packed.data.expirationBlocks / 2);
            _expirationSeconds =
                packed.data.timestamp +
                packed.data.expirationSeconds +
                (packed.data.expirationSeconds / 2);
        } else {
            _expirationBlocks =
                packed.data.height +
                (packed.data.expirationBlocks * 2);
            _expirationSeconds =
                packed.data.timestamp +
                (packed.data.expirationSeconds * 2);
        }

        if (
            block.number < _expirationBlocks ||
            block.timestamp < _expirationSeconds
        )
            revert NotYetRenewable(
                block.number,
                _expirationBlocks,
                block.timestamp,
                _expirationSeconds
            );

        address[] memory beaconsToStrike = new address[](3);
        uint8 beaconsToStrikeLen = 0;
        address[3] memory reqBeacons = accounts.beacons;
        for (uint256 i; i < 3; i++) {
            if (
                requestToVrfHashes[packed.id][i] == bytes32(0) &&
                reqBeacons[i] != address(0)
            ) {
                address beaconAddress = reqBeacons[i];
                SBeacon memory tempBeacon = sBeacon[beaconAddress];
                if (tempBeacon.exists) tempBeacon.strikes++;
                tempBeacon.consecutiveSubmissions = 0;
                if (tempBeacon.pending > 0) tempBeacon.pending--;
                sBeacon[beaconAddress] = tempBeacon;
                beaconsToStrike[i] = beaconAddress;
                beaconsToStrikeLen++;
            }
        }

        // Checks if enough beacons are available to replace with
        if (beacons.length < 5 || beaconsToStrikeLen * 2 > beacons.length - 1)
            revert NotEnoughBeaconsAvailable(
                beacons.length,
                beacons.length < 5 ? 5 : beaconsToStrikeLen * 2
            );

        accounts.beacons = _replaceNonSubmitters(
            packed.id,
            accounts.beacons,
            requestToVrfHashes[packed.id]
        );

        // Refund fees paid by client paid by non-submitting beacon
        // Add gas fee for refund function
        address firstStrikeBeacon;
        for (uint256 i; i < beaconsToStrike.length; i++) {
            if (beaconsToStrike[i] == address(0)) continue;

            if (firstStrikeBeacon == address(0))
                firstStrikeBeacon = beaconsToStrike[i];

            SBeacon memory strikeBeacon = sBeacon[beaconsToStrike[i]];

            // If beacon drops below minimum collateral in any token: drop them from beacons list
            // The beacon will need to be voted back in
            // beaconToStrikeCount = the strikes a beacon has
            // beaconsToStrike = array of all beacon addresses that should be striked in this for-loop
            // The strikes are reset to 0 since it shouldn't be slashed at every following request
            if (
                sBeacon[beaconsToStrike[i]].exists &&
                (ethCollateral[beaconsToStrike[i]] <
                    configUints[CKEY_MIN_STAKE_ETH] ||
                    // tokenCollateral[beaconsToStrike[i]] < minToken ||
                    strikeBeacon.strikes > configUints[CKEY_MAX_STRIKES])
            ) {
                // Remove beacon from beacons
                _removeBeacon(beaconsToStrike[i]);
                emit RemoveBeacon(
                    beaconsToStrike[i],
                    sBeacon[beaconsToStrike[i]].strikes
                );
            }
        }

        packed.data.height = block.number;
        packed.data.timestamp = block.timestamp;

        requestToHash[packed.id] = _getRequestHash(
            packed.id,
            accounts,
            packed.data,
            _seed,
            _optimistic
        );

        SRequestEventData memory eventData = SRequestEventData(
            packed.data.ethReserved,
            packed.data.beaconFee,
            packed.data.height,
            packed.data.timestamp,
            packed.data.expirationBlocks,
            packed.data.expirationSeconds,
            packed.data.callbackGasLimit,
            accounts.client,
            accounts.beacons,
            _seed,
            _optimistic
        );

        // The paying non-submitter might fall below collateral here. It will be removed on next strike if it doesn't add collateral.
        // TODO: Add offsets for renewFee
        uint256 renewFee = ((gasAtStart - gasleft()) * _getGasPrice()) +
            packed.data.beaconFee;

        uint256 refundToClient = requestToFeePaid[packed.id];
        uint256 totalCharge = renewFee + refundToClient;

        // If charging more than the striked beacon has staked, refund the remaining stake to the client
        if (ethCollateral[firstStrikeBeacon] > 0) {
            if (totalCharge > ethCollateral[firstStrikeBeacon]) {
                totalCharge = ethCollateral[firstStrikeBeacon];
                renewFee = renewFee > totalCharge ? totalCharge : renewFee;
                ethCollateral[msg.sender] += renewFee;
                emit ChargeEth(
                    firstStrikeBeacon,
                    msg.sender,
                    renewFee,
                    true,
                    true
                );
                // totalCharge - renewFee is now 0 at its lowest
                // If collateral is remaining after renewFee, it will be refunded to the client
                refundToClient = totalCharge - renewFee;
                if (refundToClient > 0) {
                    ethDeposit[accounts.client] += refundToClient;
                    emit ChargeEth(
                        firstStrikeBeacon,
                        accounts.client,
                        refundToClient,
                        true,
                        false
                    );
                }
                ethCollateral[firstStrikeBeacon] = 0;
            } else {
                ethCollateral[firstStrikeBeacon] -= totalCharge;
                // Refund this function's gas to the caller
                ethCollateral[msg.sender] += renewFee;
                ethDeposit[accounts.client] += refundToClient;
                // Fees paid on this request are reset to 0
                requestToFeePaid[packed.id] = 0;
                // Client receives refund to ensure they have enough to pay for the next request
                // Also since the request is taking slower than expected due to a non-submitting beacon,
                // the non-submitting beacon should pay for the delay.
                // Log charge from striked beacon to caller (collateral to collateral)
                emit ChargeEth(
                    firstStrikeBeacon,
                    msg.sender,
                    renewFee,
                    true,
                    true
                );

                // Log charge from striked beacon to client (collateral to deposit)
                emit ChargeEth(
                    firstStrikeBeacon,
                    accounts.client,
                    refundToClient,
                    true,
                    false
                );
            }
        } else {
            refundToClient = 0;
            renewFee = 0;
        }

        // Log Retry
        emit Retry(
            packed.id,
            eventData,
            firstStrikeBeacon,
            msg.sender,
            refundToClient,
            renewFee
        );
    }
}
