// SPDX-License-Identifier: BSL 1.1

/// @title SoRandom Beacon Service
/// @author Deanpress (https://github.com/deanpress)
/// @notice Beacon management functions (registration, staking, submitting random values etc)

pragma solidity ^0.8.16;

import "./Utils.sol";
import "./lib/VRF.sol";

/// @custom:oz-upgrades-unsafe-allow external-library-linking
contract Beacon is Utils {
    // Errors exclusive to Beacon.sol
    error BeaconExists();
    error BeaconDoesNotExist(address beacon);
    error BeaconNotSelected();
    error BeaconHasPending(uint256 pending);
    error NotABeacon();
    error VRFProofInvalid();
    error BeaconValueExists();
    error ReentrancyGuard();
    error NotOwnerOrBeacon();
    error BeaconStakedEthTooLow(uint256 staked, uint256 minimum);
    error SequencerSubmissionTooEarly(
        uint256 currentBlock,
        uint256 minBlock,
        uint256 currentTime,
        uint256 minTime
    );
    error SenderNotBeaconOrSequencer();
    error NotDisputeable();
    error NotCompleteable();
    error VRFDataMismatch();
    error ProofNotInvalid();

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
        uint256 beaconPos,
        address[4] calldata _addressData,
        uint256[18] calldata _uintData,
        bytes32[3] calldata _rsAndSeed,
        uint8 _v,
        bool optimistic
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

        _submissionStep(
            beacon,
            beaconPos,
            _rsAndSeed[2],
            gasAtStart,
            packed,
            accounts,
            optimistic
        );
    }

    // Override that uses msg.sender instead of address based on signature
    function submitRandom(
        uint256 beaconPos,
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
            beaconPos,
            seed,
            gasAtStart,
            packed,
            accounts,
            optimistic
        );
    }

    /// @notice Disputes a VRF submission. If the VRF validation in this function fails, the manipulating beacon's stake goes to the disputer and a new request is made.
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

        Internals.DisputeReturnData memory cd = Internals._dispute(
            packed.id,
            seed,
            packed.vrf,
            Internals.DisputeCallVars({
                publicKeys: sBeacon[beacon].publicKey,
                feePaid: requestToFeePaid[packed.id],
                clientDeposit: ethDeposit[accounts.client],
                collateral: ethCollateral[beacon],
                beacon: beacon,
                client: accounts.client
            }),
            address(VRF)
        );

        // Iterate through beaconsToRemove and remove them
        // Don't need to emit an event because Internals already emits BeaconInvalidVRF
        if (cd.vrfFailed) {
            requestToFeePaid[packed.id] = cd.newRequestToFee;
            ethDeposit[accounts.client] = cd.newClientDeposit;
            ethCollateral[msg.sender] += cd.ethToSender;
            ethCollateral[beacon] = 0;
            _removeBeacon(beacon);
            // Delete the old request and generate a new one with the same parameters (except for new seed, beacons, and block data)
            delete optRequestDisputeWindow[packed.id];
            delete requestToProofs[packed.id][beaconPos];
            delete requestToVrfHashes[packed.id][beaconPos];

            // Replace the beacon in the request and emit RequestBeacon for the new beacon
            address randomBeacon = _randomBeacon(seed, accounts.beacons);
            accounts.beacons[beaconPos] = randomBeacon;
            requestToHash[packed.id] = _getRequestHash(
                packed.id,
                accounts,
                packed.data,
                seed,
                true
            );
            emit RequestBeacon(
                packed.id,
                SRequestEventData(
                    packed.data.ethReserved,
                    packed.data.beaconFee,
                    packed.data.height,
                    packed.data.timestamp,
                    packed.data.expirationBlocks,
                    packed.data.expirationSeconds,
                    packed.data.callbackGasLimit,
                    accounts.client,
                    accounts.beacons,
                    seed,
                    true
                ),
                randomBeacon
            );
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
            bool isBeaconOrSequencer;
            for (uint256 i; i < 3; i++) {
                if (accounts.beacons[i] == msg.sender) {
                    _optCanComplete(
                        packed.data.expirationBlocks,
                        packed.data.expirationSeconds,
                        window,
                        i
                    );
                    isBeaconOrSequencer = true;
                    break;
                }
            }
            if (!isBeaconOrSequencer) {
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

        // Dev fee
        _chargeClient(accounts.client, developer, packed.data.beaconFee);

        // Caller fee
        uint256 fee = ((gasAtStart - gasleft() + gasEstimates[5]) *
            _getGasPrice()) + packed.data.beaconFee;
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
            if (optimistic)
                emit OptimisticSubmission(
                    beacon,
                    packed.id,
                    packed.vrf.proof,
                    packed.vrf.uPoint,
                    packed.vrf.vComponents
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

    function _optCanComplete(
        uint256 _expirationBlocks,
        uint256 _expirationSeconds,
        uint256[2] memory _window,
        uint256 _multiplier
    ) private view {
        uint256 completeHeight = _window[0] + (_expirationBlocks * _multiplier);
        uint256 completeTimestamp = _window[1] +
            (_expirationSeconds * _multiplier);
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
            gasEstimates[GKEY_FINAL_SUBMIT],
            accounts.client
        );

        requestToFeePaid[packed.id] += submitFee + packed.data.beaconFee;

        // total fee + dev beaconFee
        // delete requests[packed.id];
        delete requestToHash[packed.id];
        delete requestToVrfHashes[packed.id];

        _status = _NOT_ENTERED;
    }

    // Called on final submission, adds time window for disputes after which it can be completed
    function _processFinalOptimisticSubmission(
        uint128 id,
        address client,
        uint256 gasAtStart,
        uint256 _beaconFee
    ) private {
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
        uint256 submitFee = _handleSubmitFeeCharge(
            gasAtStart,
            _beaconFee,
            gasEstimates[GKEY_PROCESS_OPTIMISTIC],
            client
        );

        requestToFeePaid[id] += submitFee + _beaconFee;

        emit OptimisticReady(id, disputeWindow[0], disputeWindow[1]);

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
    ) private returns (SRequestEventData memory) {
        SRequestEventData memory newEventData;
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

            newEventData = SRequestEventData(
                packed.data.ethReserved,
                packed.data.beaconFee,
                packed.data.height,
                packed.data.timestamp,
                packed.data.expirationBlocks,
                packed.data.expirationSeconds,
                packed.data.callbackGasLimit,
                accounts.client,
                accounts.beacons,
                seed,
                optimistic
            );

            emit RequestBeacon(packed.id, newEventData, randomBeacon);
        }

        // 62k offset for charge
        uint256 fee = ((gasAtStart - gasleft() + gasEstimates[GKEY_SUBMIT]) *
            _getGasPrice()) + packed.data.beaconFee;
        requestToFeePaid[packed.id] += fee;
        _chargeClient(accounts.client, msg.sender, fee);

        return newEventData;
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
        address[3] memory _beacons,
        uint256 beaconPos,
        bytes32[3] memory reqValues,
        SRandomUintData memory data
    ) private view {
        if (_beacons[beaconPos] != beacon) revert BeaconNotSelected();

        if (msg.sender != sequencer && msg.sender != beacon)
            revert SenderNotBeaconOrSequencer();

        if (reqValues[beaconPos] != bytes32(0)) revert BeaconValueExists();

        // Sequencer can submit on behalf of the beacon (using beacon's signed VRF data)
        // after half an expiration period.
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
                block.number,
                sequencerSubmitBlock,
                block.timestamp,
                sequencerSubmitTime
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
