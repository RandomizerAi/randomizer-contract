// SPDX-License-Identifier: BSL 1.1

/// @title SoRandom Beacon Service
/// @author Deanpress (https://github.com/deanpress)
/// @notice Beacon management functions (registration, staking, submitting random values etc)

pragma solidity ^0.8.16;

import "./Utils.sol";
import "./lib/VRF.sol";

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
    error NotChallengeable();

    /// @notice Returns a list of active beacon addresses
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

    function getRequestVrfHashes(uint128 _request)
        public
        view
        returns (bytes32[3] memory)
    {
        return requestToVrfHashes[_request];
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

    /// @notice Submit the random value of a beacon for a request on behalf of a beacon using signatures
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
    function submitRandom(
        address[4] calldata _addressData,
        uint256[18] calldata _uintData,
        bytes32[3] calldata _rsAndSeed,
        uint8 _v
    ) public {
        uint256 gasAtStart = gasleft();

        (
            SAccounts memory accounts,
            SPackedSubmitData memory packed
        ) = _getAccountsAndPackedData(_addressData, _uintData);
        bytes32 seed = _rsAndSeed[2];

        address beacon = ecrecover(
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
            _v,
            _rsAndSeed[0],
            _rsAndSeed[1]
        );

        _submissionStep(beacon, seed, gasAtStart, packed, accounts, false);
    }

    // Override that uses msg.sender instead of address based on signature
    function submitRandom(
        address[4] calldata _addressData,
        uint256[18] calldata _uintData,
        bytes32 seed,
        bool optimistic
    ) public {
        uint256 gasAtStart = gasleft();

        (
            SAccounts memory accounts,
            SPackedSubmitData memory packed
        ) = _getAccountsAndPackedData(_addressData, _uintData);

        // Run VRF Secp256k1 fastVerify method
        _submissionStep(
            msg.sender,
            seed,
            gasAtStart,
            packed,
            accounts,
            optimistic
        );
    }

    /// @notice Low gas alternative that processes the the proofs off-chain with beacons acting as multisig validators
    /// There's a short dispute period that any beacon can call to challenge the submitted VRF proofs when they're incorrect
    /// This function can only be called if the request was made with requestOptimistic()

    // TODO: Function to open dispute for an optimistic request. The selected beacons need to submit their values manually which are then verified on-chain by the VRF.
    // Only the submissions from the vrfBeacons are verified, which are not necessarily the originally selected beacons (as beacon reselection is off-chain in case of non-submitters).
    // If the VRF fails, the first wrong beacon pays for all transaction made fees so far, and the request is renewed.
    // If the VRF succeeds and matches the optimistic submission, the disputer pays for all transaction fees made so far, they're removed as a beacon, and the request is completed.
    // Disputes can only be opened by beacons.
    function challenge(
        address[4] calldata _addressData,
        uint256[18] calldata _uintData,
        bytes32 seed
    ) external {
        (
            SAccounts memory accounts,
            SPackedSubmitData memory packed
        ) = _getAccountsAndPackedData(_addressData, _uintData);

        _validateRequestData(packed.id, seed, accounts, packed.data, true);

        // Request is challengeable until the request is completed by a complete() call
        if (optRequestChallengeWindow[packed.id][0] == 0)
            revert NotChallengeable();

        // Iterate through requestToProofs and VRF fastVerify each
        bool vrfFailed;
        for (uint256 i; i < 3; i++) {
            SFastVerifyData memory vrfData = requestToProofs[packed.id][i];
            // Run VRF Secp256k1 fastVerify method
            if (
                !VRF.fastVerify(
                    sBeacon[accounts.beacons[i]].publicKey,
                    vrfData.proof,
                    abi.encodePacked(seed),
                    vrfData.uPoint,
                    vrfData.vComponents
                )
            ) {
                vrfFailed = true;
                // Stakes of manipulating beacons should go to the challenger
                ethCollateral[msg.sender] += ethCollateral[accounts.beacons[i]];
                ethCollateral[accounts.beacons[i]] = 0;
                _removeBeacon(accounts.beacons[i]);
            }
        }

        if (vrfFailed) {
            // TODO: Renew request and emit event for removed beacons

            delete optRequestChallengeWindow[packed.id];
        } else {
            revert("NoInvalidProofs");
        }
    }

    // TODO: Function to complete optimistic random submission after the dispute period is over and no disputes were made.
    function completeOptimistic(
        address[4] calldata _addressData,
        uint256[18] calldata _uintData,
        bytes32 seed
    ) external {
        uint256 gasAtStart = gasleft();

        (
            SAccounts memory accounts,
            SPackedSubmitData memory packed
        ) = _getAccountsAndPackedData(_addressData, _uintData);
        _validateRequestData(packed.id, seed, accounts, packed.data, true);

        uint256[2] memory challengeWindow = optRequestChallengeWindow[
            packed.id
        ];

        // Require that this function can only be called by the first beacon in the first 5 minutes of the challenge window, then by the second beacon in the next 5 minutes, and so on.
        bool isBeaconOrSequencer;
        if (msg.sender == sequencer) {
            _optimisticCanComplete(challengeWindow, 3);
            isBeaconOrSequencer = true;
        } else {
            for (uint256 i; i < 3; i++) {
                if (accounts.beacons[i] == msg.sender) {
                    _optimisticCanComplete(challengeWindow, i);
                    isBeaconOrSequencer = true;
                    break;
                }
            }
            if (!isBeaconOrSequencer) {
                _optimisticCanComplete(challengeWindow, 4);
            }
        }

        bytes32 result = keccak256(
            abi.encodePacked(requestToVrfHashes[packed.id])
        );

        results[packed.id] = result;

        _callback(
            accounts.client,
            packed.data.callbackGasLimit,
            packed.id,
            result
        );

        ethReserved[accounts.client] -= packed.data.ethReserved;

        delete requestToVrfHashes[packed.id];
        delete optRequestChallengeWindow[packed.id];
        delete requestToProofs[packed.id];
        delete requestToHash[packed.id];

        // Dev fee
        _chargeClient(accounts.client, developer, packed.data.beaconFee);

        uint256 fee = ((gasAtStart -
            gasleft() +
            gasEstimates.completeOptimistic) * _getGasPrice()) +
            packed.data.beaconFee;
        requestToFeePaid[packed.id] += fee;
        _chargeClient(accounts.client, msg.sender, fee);

        // TODO: Emit Result event
    }

    function _submissionStep(
        address beacon,
        bytes32 seed,
        uint256 gasAtStart,
        SPackedSubmitData memory packed,
        SAccounts memory accounts,
        bool optimistic
    ) private {
        _validateRequestData(
            packed.id,
            seed,
            accounts,
            packed.data,
            optimistic
        );

        uint256 beaconPos;
        uint256 submissionsCount;
        bytes32[3] memory reqValues = requestToVrfHashes[packed.id];

        for (uint256 i; i < 3; i++) {
            if (reqValues[i] != bytes32(0)) {
                submissionsCount++;
            }
            if (beacon == accounts.beacons[i]) {
                beaconPos = i + 1;
            }
        }

        // Check if beacon or sequencer can submit the result
        _checkCanSubmit(beacon, beaconPos, reqValues, packed.data);

        if (!optimistic) {
            if (
                !VRF.fastVerify(
                    sBeacon[beacon].publicKey,
                    packed.vrf.proof,
                    abi.encodePacked(seed),
                    packed.vrf.uPoint,
                    packed.vrf.vComponents
                )
            ) revert VRFProofInvalid();
        } else {
            requestToProofs[packed.id][beaconPos - 1] = packed.vrf;
        }

        bytes32 vrfHash = gammaToHash(packed.vrf.proof[0], packed.vrf.proof[1]);

        requestToVrfHashes[packed.id][beaconPos - 1] = vrfHash;
        reqValues[beaconPos - 1] = vrfHash;
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
                seed,
                gasAtStart,
                submissionsCount,
                reqValues,
                optimistic
            );
        } else {
            if (!optimistic)
                _processFinalSubmission(
                    reqValues,
                    vrfHash,
                    accounts,
                    packed,
                    gasAtStart
                );
            else
                _processFinalOptimisticSubmission(
                    packed.id,
                    accounts.client,
                    gasAtStart,
                    packed.data.beaconFee
                );
        }
    }

    function _processFinalSubmission(
        bytes32[3] memory reqValues,
        bytes32 vrfHash,
        SAccounts memory accounts,
        SPackedSubmitData memory packed,
        uint256 gasAtStart
    ) private {
        // Process final submission with ReentrancyGuard
        if (_status == _ENTERED) revert ReentrancyGuard();
        _status = _ENTERED;

        // Final beacon submission logic (callback & complete)
        bytes32 result;

        result = keccak256(
            abi.encodePacked(reqValues[0], reqValues[1], vrfHash)
        );

        // Callback to requesting contract
        _callback(
            accounts.client,
            packed.data.callbackGasLimit,
            packed.id,
            result
        );
        ethReserved[accounts.client] -= packed.data.ethReserved;

        results[packed.id] = result;
        emit Result(packed.id, result);

        // Dev fee
        _chargeClient(accounts.client, developer, beaconFee);

        // Beacon fee
        uint256 submitFee = _handleSubmitFeeCharge(
            gasAtStart,
            packed.data.beaconFee,
            gasEstimates.finalSubmit,
            accounts.client
        );

        requestToFeePaid[packed.id] += submitFee + beaconFee;

        // total fee + dev beaconFee
        // delete requests[packed.id];
        delete requestToHash[packed.id];
        delete requestToVrfHashes[packed.id];

        _status = _NOT_ENTERED;
    }

    // Called on final submission, adds time window for challenges after which it can be completed
    function _processFinalOptimisticSubmission(
        uint128 id,
        address client,
        uint256 gasAtStart,
        uint256 _beaconFee
    ) private {
        if (_status == _ENTERED) revert ReentrancyGuard();
        _status = _ENTERED;
        // Final beacon submission logic (callback & complete)

        // bytes12 beaconSubmissionValue = bytes12(vrfHash);
        // requestToVrfHashes[packed.id][2] = beaconSubmissionValue;

        // Set challenge window time
        uint256[2] memory challengeWindow = [
            block.number + expirationBlocks,
            block.timestamp + expirationSeconds
        ];
        optRequestChallengeWindow[id] = challengeWindow;

        // ethReserved[accounts.client] -= packed.data.ethReserved;

        // results[packed.id] = reqResult;
        // emit Result(packed.id, reqResult);

        // Dev fee
        // _chargeClient(accounts.client, developer, beaconFee);

        // Beacon fee
        uint256 submitFee = _handleSubmitFeeCharge(
            gasAtStart,
            _beaconFee,
            gasEstimates.processOptimistic,
            client
        );

        requestToFeePaid[id] += submitFee + beaconFee;

        // TODO: Emit OptimisticSubmitted event
        emit OptimisticReady(id, challengeWindow[0], challengeWindow[1]);
        // total fee + dev beaconFee
        // delete requestToHash[packed.id];
        // delete requestToVrfHashes[packed.id];
        _status = _NOT_ENTERED;
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
        bytes32 seed,
        uint256 gasAtStart,
        uint256 submissionsCount,
        bytes32[3] memory reqValues,
        bool optimistic
    ) private {
        // Second to last requests final beacon
        if (submissionsCount == 1) {
            bytes32 lastBeaconSeed;

            lastBeaconSeed = keccak256(
                abi.encodePacked(reqValues[0], reqValues[1])
            );

            address randomBeacon = _randomBeacon(
                lastBeaconSeed,
                accounts.beacons
            );

            sBeacon[randomBeacon].pending++;

            accounts.beacons[2] = randomBeacon;

            // Set new height and timestamp so there's a submission window before renewable for third beacon
            packed.data.height = block.number;
            packed.data.timestamp = block.timestamp;

            requestToHash[packed.id] = _getRequestHash(
                packed.id,
                accounts,
                packed.data,
                seed,
                optimistic
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
                    seed,
                    optimistic
                ),
                randomBeacon
            );
        }

        // 62k offset for charge
        uint256 fee = ((gasAtStart - gasleft() + gasEstimates.submit) *
            _getGasPrice()) + packed.data.beaconFee;
        requestToFeePaid[packed.id] += fee;
        _chargeClient(accounts.client, msg.sender, fee);
    }

    function _validateRequestData(
        uint128 id,
        bytes32 seed,
        SAccounts memory accounts,
        SRandomUintData memory data,
        bool optimistic
    ) private view {
        bytes32 generatedHash = _getRequestHash(
            id,
            accounts,
            data,
            seed,
            optimistic
        );

        /* No need to require(requestToResult[packed.id] == bytes(0))
         * because requestToHash will already be bytes(0) if it's fulfilled
         * and wouldn't match the generated hash.
         * generatedHash can never be bytes(0) because packed.data.height must be greater than 0 */

        if (requestToHash[id] != generatedHash)
            revert RequestDataMismatch(generatedHash, requestToHash[id]);

        // SRandomRequest storage request = requests[requestId];
        if (data.height == 0) revert RequestNotFound(id);
    }

    function _checkCanSubmit(
        address beacon,
        uint256 beaconPos,
        bytes32[3] memory reqValues,
        SRandomUintData memory data
    ) private view {
        if (beaconPos == 0) revert BeaconNotSelected();

        if (reqValues[beaconPos - 1] != bytes32(0)) revert ResultExists();

        // Check that only beacon and sequencer can submit the result
        if (msg.sender != beacon && msg.sender != sequencer)
            revert SenderNotBeaconOrSequencer();

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
        uint256 gasAtStart,
        uint256 _beaconFee,
        uint256 offset,
        address client
    ) private returns (uint256) {
        // Beacon fee
        uint256 fee = ((gasAtStart - gasleft() + offset) * _getGasPrice()) +
            _beaconFee;
        _chargeClient(client, msg.sender, fee);

        return fee;
    }
}
