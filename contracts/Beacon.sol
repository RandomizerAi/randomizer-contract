// SPDX-License-Identifier: BSL 1.1

/// @title Randomizer Beacon Service
/// @author Deanpress (https://github.com/deanpress)
/// @notice Beacon management functions (registration, staking, submitting random values etc)

pragma solidity ^0.8.17;

import "./Utils.sol";
import "./lib/VRF.sol";
import "./Optimistic.sol";

/// @custom:oz-upgrades-unsafe-allow external-library-linking
contract Beacon is Utils, Optimistic {
    // Errors exclusive to Beacon.sol
    error BeaconExists();
    error BeaconDoesNotExist(address beacon);
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

    function getVrfHashes(uint128 _request)
        external
        view
        returns (bytes32[3] memory)
    {
        return requestToVrfHashes[_request];
    }

    function getDataHash(uint128 _request) external view returns (bytes32) {
        return requestToHash[_request];
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
    function getBeaconStakeEth(address _beacon)
        external
        view
        returns (uint256)
    {
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
    function unregisterBeacon(address _beacon) external {
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
    ) external {
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
                            _rsAndSeed[2],
                            packed.vrf.proof,
                            packed.vrf.uPoint,
                            packed.vrf.vComponents,
                            address(this),
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
    ) external {
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

        if (optimistic)
            emit SubmitOptimistic(
                packed.id,
                beacon,
                packed.vrf.proof,
                packed.vrf.uPoint,
                packed.vrf.vComponents
            );
        else emit SubmitRandom(packed.id, beacon);

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

        // Beacon fee
        uint256 submitFee = _getFeeCharge(
            gasAtStart,
            packed.data.beaconFee,
            gasEstimates[GKEY_FINAL_SUBMIT]
        );

        _softChargeClient(
            packed.id,
            true,
            accounts.client,
            submitFee,
            packed.data.beaconFee
        );

        // total fee + dev beaconFee
        // delete requests[packed.id];
        delete requestToHash[packed.id];
        delete requestToVrfHashes[packed.id];

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
            SRequestEventData memory newEventData;
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

            requestToHash[packed.id] = _generateRequestHash(
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

            emit RequestBeacon(
                packed.id,
                randomBeacon,
                packed.data.height,
                packed.data.timestamp
            );
        }

        // 62k offset for charge
        uint256 fee = ((gasAtStart - gasleft() + gasEstimates[GKEY_SUBMIT]) *
            _getGasPrice()) + packed.data.beaconFee;

        _softChargeClient(packed.id, false, accounts.client, fee, 0);
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
}
