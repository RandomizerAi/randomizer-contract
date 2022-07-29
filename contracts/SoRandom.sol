// SPDX-License-Identifier: BSL 1.1

/** 
 @title soRandom
 @author Dean van Dugteren (hello@dean.press)
 @notice A decentralized protocol that sends random values to requesting smart contracts
**/

pragma solidity ^0.8.15;

import "./Client.sol";

contract SoRandom is Client, Beacon {
    // Errors exclusive to Beacon.sol
    error NotYetRenewable(
        uint256 timestamp,
        uint256 expirationSeconds,
        uint256 height,
        uint256 expirationHeight
    );

    /// @notice One-time internal initializer of the contract.
    /// @dev To be called only once on deployment of SoRandomStatic (in constructor) or SoRandomUpgradeable (in initialize()).
    function init(
        address _developer,
        uint8 _maxStrikes,
        uint256 _minStakeEth,
        uint256 _expirationBlocks,
        uint256 _expirationSeconds,
        // uint256 _minCollateralToken,
        uint256 _requestMinGasLimit,
        uint256 _requestMaxGasLimit,
        uint256 _beaconFee,
        address[] memory _beacons
    ) internal {
        _transferOwnership(_developer);
        developer = _developer;
        maxStrikes = _maxStrikes;
        minStakeEth = _minStakeEth;
        // minToken = _minCollateralToken;
        expirationBlocks = _expirationBlocks;
        expirationSeconds = _expirationSeconds;
        beaconFee = _beaconFee;
        // Beacon.add(store, address(0));
        beacons.push(address(0));
        uint256 length = _beacons.length;
        for (uint256 i; i < length; i++) {
            beaconIndex[_beacons[i]] = beacons.length;
            beacons.push(_beacons[i]);
            sBeacon[_beacons[i]] = SBeacon(true, 0, 0, 0);
        }
        requestMinGasLimit = _requestMinGasLimit;
        requestMaxGasLimit = _requestMaxGasLimit;
        _status = _NOT_ENTERED;
    }

    function getResult(uint128 _request) public view returns (bytes32) {
        return results[_request];
    }

    function getPendingRequestIds() external view returns (uint128[] memory) {
        return pendingRequestIds;
    }

    function renewRequest(
        address[4] calldata _addressData,
        uint256[8] calldata _uintData,
        bytes32 _seed
    ) external {
        // 20k gas offset for balance updates after fee calculation
        uint256 gasAtStart = gasleft() + RENEW_GAS_OFFSET;
        SAccounts memory accounts = _resolveAddressCalldata(_addressData);
        SPackedRenewData memory packed = _resolveRenewUintData(_uintData);

        if (packed.data.height == 0) revert RequestNotFound(packed.id);

        bytes32 generatedHash = _getRequestRenewHash(accounts, packed, _seed);

        if (requestToHash[packed.id] != generatedHash)
            revert RequestDataMismatch(generatedHash, requestToHash[packed.id]);

        uint256 _expirationBlocks;
        uint256 _expirationSeconds;

        // For the first 5 minutes and 20 blocks, the first successful submitter of this request can renew it exclusively
        // Afterwards it's open to everyone
        if (_getFirstSubmitter(packed.id, accounts.beacons) == msg.sender) {
            _expirationBlocks =
                packed.data.height +
                packed.data.expirationBlocks;
            _expirationSeconds =
                packed.data.timestamp +
                packed.data.expirationSeconds;
        } else {
            _expirationBlocks =
                packed.data.height +
                packed.data.expirationBlocks +
                BLOCKS_UNTIL_RENEWABLE_ALL;
            _expirationSeconds =
                packed.data.timestamp +
                packed.data.expirationSeconds +
                SECONDS_UNTIL_RENEWABLE_ALL;
        }

        if (
            block.number < _expirationBlocks ||
            block.timestamp < _expirationSeconds
        )
            revert NotYetRenewable(
                block.timestamp,
                _expirationSeconds,
                block.number,
                _expirationBlocks
            );

        address[] memory beaconsToStrike = new address[](3);
        address[3] memory reqBeacons = accounts.beacons;
        for (uint256 i; i < 3; i++) {
            if (
                requestToSignatures[packed.id][i] == bytes12(0) &&
                reqBeacons[i] != address(0)
            ) {
                address beaconAddress = reqBeacons[i];
                SBeacon memory tempBeacon = sBeacon[beaconAddress];
                tempBeacon.strikes++;
                tempBeacon.consecutiveSubmissions = 0;
                if (tempBeacon.pending > 0) tempBeacon.pending--;
                sBeacon[beaconAddress] = tempBeacon;
                beaconsToStrike[i] = beaconAddress;
            }
        }

        // Checks if enough beacons are available to replace with
        if (
            beacons.length < 5 ||
            beaconsToStrike.length * 2 > beacons.length - 1
        )
            revert NotEnoughBeaconsAvailable(
                beacons.length,
                beacons.length < 5 ? 5 : beaconsToStrike.length * 2
            );

        accounts.beacons = _replaceNonSubmitters(
            packed.id,
            accounts.beacons,
            requestToSignatures[packed.id]
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
                (ethCollateral[beaconsToStrike[i]] < minStakeEth ||
                    // tokenCollateral[beaconsToStrike[i]] < minToken ||
                    strikeBeacon.strikes > maxStrikes)
            ) {
                // Remove beacon from beacons
                _removeBeacon(beaconsToStrike[i]);
                emit RemoveBeacon(
                    beaconsToStrike[i],
                    sBeacon[beaconsToStrike[i]].strikes
                );
                sBeacon[beaconsToStrike[i]].strikes = 0;
            }
        }

        packed.data.height = block.number;
        packed.data.timestamp = block.timestamp;

        requestToHash[packed.id] = _getRequestRenewHash(
            accounts,
            packed,
            _seed
        );

        SRequestEventData memory eventData = SRequestEventData(
            packed.data.ethReserved,
            packed.data.beaconFee,
            packed.data.height,
            packed.data.timestamp,
            expirationSeconds,
            expirationBlocks,
            packed.data.callbackGasLimit,
            accounts.client,
            accounts.beacons,
            _seed
        );

        // The paying non-submitter might fall below collateral here. It will be removed on next strike if it doesn't add collateral.
        uint256 renewFee = ((gasAtStart - gasleft()) * _getGasPrice()) +
            beaconFee;

        uint256 refundToClient = requestToFeePaid[packed.id];
        uint256 totalCharge = renewFee + refundToClient;

        // If charging more than the striked beacon has staked, refund the remainder to the client
        if (totalCharge > ethCollateral[firstStrikeBeacon]) {
            totalCharge = ethCollateral[firstStrikeBeacon];
            renewFee = renewFee >= totalCharge ? totalCharge : renewFee;
            ethCollateral[msg.sender] += renewFee;
            emit ChargeEth(firstStrikeBeacon, msg.sender, renewFee, true, true);
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
            // Fees paid on this request are reset to 0
            requestToFeePaid[packed.id] = 0;
            // Client receives refund to ensure they have enough to pay for the next request
            // Also since the request is taking slower than expected due to a non-submitting beacon,
            // the non-submitting beacon should pay for the delay.
            ethDeposit[accounts.client] += refundToClient;

            // Log charge from striked beacon to caller (collateral to collateral)
            emit ChargeEth(firstStrikeBeacon, msg.sender, renewFee, true, true);

            // Log charge from striked beacon to client (collateral to deposit)
            emit ChargeEth(
                firstStrikeBeacon,
                accounts.client,
                refundToClient,
                true,
                false
            );
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
