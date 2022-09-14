// SPDX-License-Identifier: BSL 1.1

/// @title SoRandom Beacon Service
/// @author Deanpress (https://github.com/deanpress)
/// @notice Beacon management functions (registration, staking, submitting random values etc)

pragma solidity ^0.8.16;

import "./Utils.sol";
import "./lib/VRF.sol";

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
        uint256 minStakeEth = configUints[CKEY_MIN_STAKE_ETH];
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
            ethCollateral[msg.sender] < configUints[CKEY_MIN_STAKE_ETH] &&
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
        uint8 _v,
        uint256 beaconPos
    ) public {
        uint256 gasAtStart = gasleft();

        (
            SAccounts memory accounts,
            SPackedSubmitData memory packed
        ) = _getAccountsAndPackedData(_addressData, _uintData);

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

        _submissionStep(
            beacon,
            beaconPos,
            _rsAndSeed[2],
            gasAtStart,
            packed,
            accounts,
            false
        );
    }

    // Override that uses msg.sender instead of address based on signature
    function submitRandom(
        address[4] calldata _addressData,
        uint256[18] calldata _uintData,
        bytes32 seed,
        bool optimistic,
        uint256 beaconPos
    ) public {
        uint256 gasAtStart = gasleft();

        (
            SAccounts memory accounts,
            SPackedSubmitData memory packed
        ) = _getAccountsAndPackedData(_addressData, _uintData);

        // Run VRF Secp256k1 fastVerify method
        _submissionStep(
            msg.sender,
            beaconPos,
            seed,
            gasAtStart,
            packed,
            accounts,
            optimistic
        );
    }

    /// @notice Challenges a VRF submission. If the challenge is successful, manipulating beacon stakes go to the challenger and a new request is made.
    function challenge(
        address[4] calldata _addressData,
        uint256[18] calldata _uintData,
        bytes32 seed,
        SFastVerifyData[3] memory _vrfData
    ) external {
        // Request is challengeable until the request is completed by a complete() call

        if (optRequestChallengeWindow[uint128(_uintData[0])][0] == 0)
            revert NotChallengeable();

        (
            SAccounts memory accounts,
            SPackedSubmitData memory packed
        ) = _getAccountsAndPackedData(_addressData, _uintData);

        _validateRequestData(packed.id, seed, accounts, packed.data, true);

        // Iterate through requestToProofs and VRF fastVerify each

        uint256[2][3] memory publicKeys;
        uint256[3] memory collaterals;

        for (uint256 i = 0; i < 3; i++) {
            // Check that encoded vrfData matches the hash stores in proof
            if (
                keccak256(abi.encode(_vrfData[i])) !=
                requestToProofs[packed.id][i]
            ) revert("VRFDataMismatch");

            publicKeys[i] = [
                sBeacon[accounts.beacons[i]].publicKey[0],
                sBeacon[accounts.beacons[i]].publicKey[1]
            ];
            collaterals[i] = ethCollateral[accounts.beacons[i]];
        }

        Internals.ChallengeReturnData memory cd = Internals._challenge(
            packed.id,
            seed,
            _vrfData,
            Internals.ChallengeCallVars({
                publicKeys: publicKeys,
                feePaid: requestToFeePaid[packed.id],
                clientDeposit: ethDeposit[accounts.client],
                collaterals: collaterals,
                beacons: accounts.beacons,
                client: accounts.client
            }),
            address(VRF)
        );

        // Iterate through beaconsToRemove and remove them
        // Don't need to emit an event because Internals already emits BeaconInvalidVRF

        for (uint256 i = 0; i < cd.beaconsToRemove.length; i++) {
            if (cd.beaconsToRemove[i] != address(0)) {
                ethCollateral[cd.beaconsToRemove[i]] = 0;
                _removeBeacon(cd.beaconsToRemove[i]);
            }
        }

        requestToFeePaid[packed.id] = cd.newRequestToFee;
        ethDeposit[accounts.client] = cd.newClientDeposit;
        ethCollateral[msg.sender] += cd.ethToSender;

        if (cd.vrfFailed) {
            // Delete the old request and generate a new one with the same parameters (except for new seed, beacons, and block data)
            delete optRequestChallengeWindow[packed.id];
            delete requestToProofs[packed.id];
            delete requestToVrfHashes[packed.id];

            _generateRequest(packed.id, accounts.client, packed.data, true);
        } else {
            revert("NoInvalidProofs");
        }
    }

    /// @notice Complete an optimistic random submission after the challenge window is over.
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

        // Require that this function can only be called by the first beacon in the first 5 minutes of the challenge window, then by the second beacon in the next 5 minutes, and so on.
        Internals._optimisticCanComplete(
            Internals.SCanCompleteData({
                expirationSeconds: packed.data.expirationSeconds,
                expirationBlocks: packed.data.expirationBlocks,
                challengeWindow: optRequestChallengeWindow[packed.id],
                beacons: accounts.beacons,
                sequencer: sequencer
            })
        );

        _processResult(
            packed.id,
            accounts.client,
            requestToVrfHashes[packed.id],
            packed.data.callbackGasLimit,
            packed.data.ethReserved
        );

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
    }

    function _submissionStep(
        address beacon,
        uint256 beaconPos,
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

        uint256 submissionsCount;
        bytes32[3] memory reqValues = requestToVrfHashes[packed.id];

        for (uint256 i; i < 3; i++) {
            if (reqValues[i] != bytes32(0)) {
                submissionsCount++;
            }
        }

        // Check if beacon or sequencer can submit the result
        _checkCanSubmit(
            beacon,
            accounts.beacons,
            beaconPos,
            reqValues,
            packed.data
        );

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
            requestToProofs[packed.id][beaconPos] = keccak256(
                abi.encode(packed.vrf)
            );
        }

        bytes32 vrfHash = gammaToHash(packed.vrf.proof[0], packed.vrf.proof[1]);

        requestToVrfHashes[packed.id][beaconPos] = vrfHash;
        reqValues[beaconPos] = vrfHash;
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
        _processResult(
            packed.id,
            accounts.client,
            [reqValues[0], reqValues[1], vrfHash],
            packed.data.callbackGasLimit,
            packed.data.ethReserved
        );

        // Dev fee
        _chargeClient(accounts.client, developer, packed.data.beaconFee);

        // Beacon fee
        uint256 submitFee = _handleSubmitFeeCharge(
            gasAtStart,
            packed.data.beaconFee,
            gasEstimates.finalSubmit,
            accounts.client
        );

        requestToFeePaid[packed.id] += submitFee + packed.data.beaconFee;

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

        // Set challenge window time
        uint256[2] memory challengeWindow = [
            block.number + configUints[CKEY_EXPIRATION_BLOCKS],
            block.timestamp + configUints[CKEY_EXPIRATION_SECONDS]
        ];
        optRequestChallengeWindow[id] = challengeWindow;

        // Beacon fee
        uint256 submitFee = _handleSubmitFeeCharge(
            gasAtStart,
            _beaconFee,
            gasEstimates.processOptimistic,
            client
        );

        requestToFeePaid[id] += submitFee + _beaconFee;

        emit OptimisticReady(id, challengeWindow[0], challengeWindow[1]);

        _status = _NOT_ENTERED;
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
        address[3] memory beacons,
        uint256 beaconPos,
        bytes32[3] memory reqValues,
        SRandomUintData memory data
    ) private view {
        if (beacons[beaconPos] != msg.sender && msg.sender != sequencer)
            revert BeaconNotSelected();

        if (reqValues[beaconPos] != bytes32(0)) revert ResultExists();

        // Check that only beacon and sequencer can submit the result
        if (msg.sender != beacon && msg.sender != sequencer)
            revert SenderNotBeaconOrSequencer();

        uint256 sequencerSubmitTime = data.timestamp +
            (data.expirationSeconds / 2);
        uint256 sequencerSubmitBlock = data.height +
            (data.expirationBlocks / 2);
        if (
            msg.sender != beacon &&
            (block.timestamp < sequencerSubmitTime ||
                block.number < sequencerSubmitBlock)
        )
            revert SequencerSubmissionTooEarly(
                block.timestamp,
                sequencerSubmitTime,
                block.number,
                sequencerSubmitBlock
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
