// SPDX-License-Identifier: BSL 1.1

/// @title SoRandom Beacon Service
/// @author Deanpress (https://github.com/deanpress)
/// @notice Beacon management functions (registration, staking, submitting random values etc)

pragma solidity ^0.8.16;

import "./Utils.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";

import "hardhat/console.sol";

interface IRandomReceiver {
    function randomizerCallback(uint128 _id, bytes32 value) external;
}

contract Beacon is Utils {
    // Errors exclusive to Beacon.sol
    error BeaconExists();
    error BeaconDoesNotExist(address beacon);
    error BeaconNotSelected();
    error BeaconHasPending(uint256 pending);
    error NotABeacon();
    error VRFProofInvalid();
    error ResultExists();
    error ReentrancyGuard();
    error NotOwnerOrBeacon();
    error BeaconStakedEthTooLow(uint256 staked, uint256 minimum);
    error SequencerSubmissionTooEarly(
        uint256 currentTime,
        uint256 minTime,
        uint256 currentBlock,
        uint256 minBlock
    );
    error SenderNotBeaconOrSequencer();

    /// @notice Returns all registered beacon addresses
    function getBeacons() external view returns (address[] memory) {
        return beacons;
    }

    /// @notice Returns beacon details (collateral, strikes, pending count, consecutive successful submissions)
    function getBeacon(address _beacon) external view returns (SBeacon memory) {
        return sBeacon[_beacon];
    }

    /// @notice Returns the index of the beacon in the list of registered beacons
    function getBeaconIndex(address _beacon)
        external
        view
        returns (uint256 index)
    {
        return beaconIndex[_beacon];
    }

    function getRequestSignatures(uint128 _request)
        public
        view
        returns (bytes12[3] memory)
    {
        return requestToSignatures[_request];
    }

    /// @notice Registers a new beacon
    function registerBeacon(
        address _beacon,
        uint256[2] calldata _vrfPublicKeyData
    ) external onlyOwner {
        if (beaconIndex[_beacon] != 0) revert BeaconExists();
        if (ethCollateral[_beacon] < minStakeEth)
            revert BeaconStakedEthTooLow(ethCollateral[_beacon], minStakeEth);
        // Don't reset beacon pending so that it can pick up where it left off in case it still has pending requests.
        uint64 pending = sBeacon[_beacon].pending;
        sBeacon[_beacon] = SBeacon(_vrfPublicKeyData, true, 0, 0, pending);
        beaconIndex[_beacon] = beacons.length;
        beacons.push(_beacon);
        emit RegisterBeacon(_beacon);
    }

    /// @notice Stake ETH for a beacon
    function beaconStakeEth(address _beacon) external payable {
        ethCollateral[_beacon] += msg.value;
        emit BeaconStakeEth(_beacon, msg.value);
    }

    /// @notice Returns the beacon staked ETH
    function getBeaconStakeEth(address _beacon) public view returns (uint256) {
        return ethCollateral[_beacon];
    }

    /// @notice Unstake ETH from sender account
    function beaconUnstakeEth(uint256 _amount) external {
        ethCollateral[msg.sender] -= _amount;
        if (
            ethCollateral[msg.sender] < minStakeEth &&
            beaconIndex[msg.sender] != 0
        ) {
            if (sBeacon[msg.sender].pending != 0)
                revert BeaconHasPending(sBeacon[msg.sender].pending);

            _removeBeacon(msg.sender);
            emit UnregisterBeacon(msg.sender, sBeacon[msg.sender].strikes);
        }
        _transferEth(msg.sender, _amount);
    }

    /// @notice Unregisters the beacon (callable by beacon or owner). Returns staked ETH to beacon.
    function unregisterBeacon(address _beacon) public {
        if (msg.sender != _beacon && msg.sender != owner())
            revert NotOwnerOrBeacon();

        if (beaconIndex[_beacon] == 0) revert NotABeacon();
        if (sBeacon[_beacon].pending != 0)
            revert BeaconHasPending(sBeacon[_beacon].pending);

        uint256 collateral = ethCollateral[_beacon];

        _removeBeacon(_beacon);
        emit UnregisterBeacon(_beacon, sBeacon[_beacon].strikes);

        if (collateral > 0) {
            // Remove collateral
            ethCollateral[_beacon] = 0;
            // tokenCollateral[_beacon] = 0;

            // Refund ETH
            _transferEth(_beacon, collateral);
        }
    }

    // /// @notice Completes all pending requests and then unregisters the beacon
    // function completeAndUnregister(
    //     uint128[] calldata _requests,
    //     bytes32[] memory r,
    //     bytes32[] memory s,
    //     uint8[] memory v
    // ) external {
    //     if (_requests.length > 0) {
    //         for (uint256 i; i < _requests.length; i++) {
    //             submitRandom(_requests[i], r[i], s[i], v[i]);
    //         }
    //     }
    //     unregisterBeacon(msg.sender);
    // }

    /// @notice Submit the random value of a beacon for a request
    // uint256[21] data:
    // 0 requestId
    // 1 uint256 _ethReserved,
    // 2 uint256 _beaconFee,
    // 3 uint256 _blockNumber,
    // 4 uint256 _blockTimestamp,
    // 5 uint256 _expirationSeconds,
    // 6 uint256 _expirationBlocks,
    // 7 uint256 _callbackGasLimit,
    // 8-17 VRF fastVerify uint256s (proof[4], uPoint[2], vComponents[4])
    // 20: v
    function submitRandom(
        address[4] calldata _addressData,
        uint256[21] calldata _uintData,
        bytes32[3] calldata _rsAndSeed,
    ) public {
        uint256 gasAtStart = gasleft();

        SAccounts memory accounts = _resolveAddressCalldata(_addressData);
        SPackedSubmitData memory packed = _resolveUintData(_uintData);
        bytes32 seed = _rsAndSeed[2];

        bytes32 generatedHash = _getRequestHash(
            packed.id,
            accounts,
            packed.data,
            seed,
            false
        );

        /* No need to require(requestToResult[packed.id] == bytes(0))
         * because requestToHash will already be bytes(0) if it's fulfilled
         * and wouldn't match the generated hash.
         * generatedHash can never be bytes(0) because packed.data.height must be greater than 0 */

        if (requestToHash[packed.id] != generatedHash)
            revert RequestDataMismatch(generatedHash, requestToHash[packed.id]);

        // SRandomRequest storage request = requests[requestId];
        if (packed.data.height == 0) revert RequestNotFound(packed.id);

        // Check if the msg.sender exists in accounts.beacons

        address beacon = ECDSAUpgradeable.recover(
            keccak256(
                abi.encodePacked(
                    "\x19Ethereum Signed Message:\n32",
                    keccak256(
                        abi.encode(
                            accounts.client,
                            packed.id,
                            packed.vrf.proof[0],
                            packed.vrf.proof[1]
                        )
                    )
                )
            ),
            packed.v,
            _rsAndSeed[0],
            _rsAndSeed[1]
        );

        // Run VRF Secp256k1 fastVerify method
        if (
            !vrf.fastVerify(
                sBeacon[beacon].publicKey,
                packed.vrf.proof,
                abi.encodePacked(seed),
                packed.vrf.uPoint,
                packed.vrf.vComponents
            )
        ) revert VRFProofInvalid();

        bytes32 vrfHash = gammaToHash(packed.vrf.proof[0], packed.vrf.proof[1]);

        uint256 beaconPos;
        uint256 submissionsCount;
        bytes12[3] memory reqValues = requestToSignatures[packed.id];
        for (uint256 i; i < 3; i++) {
            if (reqValues[i] != bytes12(0)) {
                submissionsCount++;
            }
            if (beacon == accounts.beacons[i]) {
                beaconPos = i + 1;
            }
        }

        if (beaconPos == 0) revert BeaconNotSelected();

        if (reqValues[beaconPos - 1] != bytes12(0)) revert ResultExists();

        // Check that only beacon and sequencer can submit the result
        if (msg.sender != beacon && msg.sender != sequencer)
            revert SenderNotBeaconOrSequencer();

        // Sequencer can submit on behalf of the beacon after a set amount of time (given that the beacon has sent it its signature)
        _checkCanSequencerSubmit(beacon, packed.data);

        // Every 100 consecutive submissions, strikes are reset to 0
        _updateBeaconSubmissionCount(beacon);

        // Store hash of valid signature to results
        if (submissionsCount < 2) {
            //             address[] memory _addresses,
            // uint256[] memory _data,
            // bytes32[] memory _rsAndSeed,
            // uint256 gasAtStart,
            // uint256 submissionsCount,
            // uint256 beaconPos,
            // bytes12[] reqValues
            _processRandomSubmission(
                accounts,
                packed,
                vrfHash,
                seed,
                gasAtStart,
                submissionsCount,
                beaconPos,
                reqValues
            );
        } else {
            // Process final submission with ReentrancyGuard
            if (_status == _ENTERED) revert ReentrancyGuard();
            _status = _ENTERED;

            // Final beacon submission logic (callback & complete)
            bytes32 reqResult;

            reqResult = keccak256(
                abi.encode(reqValues[0], reqValues[1], bytes12(vrfHash))
            );

            // Callback to requesting contract
            _callback(
                accounts.client,
                packed.data.callbackGasLimit,
                packed.id,
                reqResult
            );
            ethReserved[accounts.client] -= packed.data.ethReserved;
            _removePendingRequest(packed.id);

            results[packed.id] = reqResult;
            emit Result(packed.id, reqResult);

            // Dev fee
            _chargeClient(accounts.client, developer, beaconFee);

            // Beacon fee
            uint256 submitFee = _handleSubmitFeeCharge(
                packed.id,
                gasAtStart,
                packed.data.beaconFee,
                accounts.client
            );

            requestToFeePaid[packed.id] += submitFee + beaconFee;

            // total fee + dev beaconFee
            // delete requests[packed.id];
            delete requestToHash[packed.id];
            delete requestToSignatures[packed.id];

            _status = _NOT_ENTERED;
        }
    }

    /// @notice Low gas alternative that processes the the proofs off-chain with beacons acting as multisig validators
    /// There's a short dispute period that any beacon can call to challenge the submitted VRF proofs when they're incorrect
    /// This function can only be called if the request was made with requestOptimistic()

    // TODO: Function to open dispute for an optimistic request. The selected beacons need to submit their values manually which are then verified on-chain by the VRF.
    // Only the submissions from the vrfBeacons are verified, which are not necessarily the originally selected beacons (as beacon reselection is off-chain in case of non-submitters).
    // If the VRF fails, the first wrong beacon pays for all transaction made fees so far, and the request is renewed.
    // If the VRF succeeds and matches the optimistic submission, the disputer pays for all transaction fees made so far, they're removed as a beacon, and the request is completed.
    // Disputes can only be opened by beacons.
    function dispute(uint128 _request) external {}

    // TODO: Function to complete optimistic random submission after the dispute period is over and no disputes were made.
    function completeOptimistic(uint128 _request) external {
        // Dev fee
        _chargeClient(client, developer, beaconFee);
    }

    function _callback(
        address _to,
        uint256 _gasLimit,
        uint128 _id,
        bytes32 _result
    ) private {
        (bool success, bytes memory callbackTxData) = _to.call{gas: _gasLimit}(
            abi.encodeWithSelector(
                IRandomReceiver.randomizerCallback.selector,
                _id,
                _result
            )
        );

        if (!success) emit CallbackFailed(_to, _id, _result, callbackTxData);
    }

    function _updateBeaconSubmissionCount(address _beacon) private {
        SBeacon memory beacon = sBeacon[_beacon];
        if (beacon.consecutiveSubmissions == 99) {
            beacon.consecutiveSubmissions = 0;
            beacon.strikes = 0;
        } else {
            beacon.consecutiveSubmissions++;
        }
        if (beacon.pending > 0) beacon.pending--;
        sBeacon[_beacon] = beacon;
    }

    function _processRandomSubmission(
        SAccounts memory accounts,
        SPackedSubmitData memory packed,
        bytes32 vrfHash,
        bytes32 seed,
        uint256 gasAtStart,
        uint256 submissionsCount,
        uint256 beaconPos,
        bytes12[3] memory reqValues
    ) private {
        bytes12 beaconSubmissionValue = bytes12(vrfHash);

        requestToSignatures[packed.id][beaconPos - 1] = beaconSubmissionValue;

        reqValues[beaconPos - 1] = beaconSubmissionValue;

        // Second to last requests final beacon
        if (submissionsCount == 1) {
            bytes32 lastBeaconSeed;

            // Encode the stored values (signatures) in the order decided in request()
            // for (uint256 i; i < 2; i++) {
            //     if (i == 0) {
            //         lastBeaconSeed = keccak256(abi.encode(reqValues[i]));
            //     } else {
            //         lastBeaconSeed = keccak256(
            //             abi.encode(lastBeaconSeed, reqValues[i])
            //         );
            //     }
            // }
            lastBeaconSeed = keccak256(abi.encode(reqValues[0], reqValues[1]));

            // if (request.selectedFinalSigner == address(0)) {
            //     lastBeacon = _randomBeacon(lastBeaconSeed, request.beacons);
            // } else {
            //     lastBeacon = request.selectedFinalSigner;
            // }

            address randomBeacon = _randomBeacon(
                lastBeaconSeed,
                accounts.beacons
            );

            sBeacon[randomBeacon].pending++;

            accounts.beacons[2] = randomBeacon;

            requestToHash[packed.id] = _getRequestHash(
                packed.id,
                accounts,
                packed.data,
                seed,
                false
            );

            emit RequestBeacon(
                packed.id,
                SRequestEventData(
                    packed.data.ethReserved,
                    packed.data.beaconFee,
                    packed.data.height,
                    packed.data.timestamp,
                    packed.data.expirationSeconds,
                    packed.data.expirationBlocks,
                    packed.data.callbackGasLimit,
                    accounts.client,
                    accounts.beacons,
                    seed
                ),
                randomBeacon
            );
        }

        // 62k offset for charge
        uint256 fee = ((gasAtStart - gasleft() + gasEstimates.submitOffset) *
            _getGasPrice()) + beaconFee;
        requestToFeePaid[packed.id] += fee;
        _chargeClient(accounts.client, msg.sender, fee);
    }

    function _checkCanSequencerSubmit(
        address beacon,
        SRandomUintData memory data
    ) private view {
        if (
            msg.sender != beacon &&
            (block.timestamp <
                data.timestamp + SECONDS_UNTIL_SUBMITTABLE_SEQUENCER ||
                block.number < data.height + BLOCKS_UNTIL_SUBMITTABLE_SEQUENCER)
        )
            revert SequencerSubmissionTooEarly(
                block.timestamp,
                data.timestamp + SECONDS_UNTIL_SUBMITTABLE_SEQUENCER,
                block.number,
                data.height + BLOCKS_UNTIL_SUBMITTABLE_SEQUENCER
            );
    }

    function _handleSubmitFeeCharge(
        uint128 id,
        uint256 gasAtStart,
        uint256 beaconFee,
        address client
    ) private returns (uint256) {
        // Beacon fee
        uint256 fee = ((gasAtStart -
            gasleft() +
            gasEstimates.finalSubmitOffset) * _getGasPrice()) + beaconFee;
        _chargeClient(client, msg.sender, fee);

        return fee;
    }
}
