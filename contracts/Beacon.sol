// SPDX-License-Identifier: BSL 1.1

import "./Utils.sol";

interface IRandomReceiver {
    function soRandomCallback(uint256 _id, bytes32 value) external;
}

/// @title SoRandom Beacon Service
/// @author Deanpress (hello@dean.press)
/// @notice Beacon management functions (registration, staking, submitting random values etc)
contract Beacon is Utils {
    // Errors exclusive to Beacon.sol
    error BeaconExists();
    error BeaconNotSelected();
    error BeaconHasPending(uint256 pending);
    error NotABeacon();
    error ResultExists();
    error SignatureMismatch();
    error ReentrancyGuard();
    error NotOwnerOrBeacon();

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
    function registerBeacon(address _beacon) external onlyOwner {
        if (beaconIndex[_beacon] != 0) revert BeaconExists();

        uint256 index = beacons.length - 1;
        // beacons[index] = beacons[beacons.length - 1];
        if (!sBeacon[_beacon].exists) sBeacon[_beacon] = SBeacon(true, 0, 0, 0);
        beaconIndex[_beacon] = index;
        // beacons[index] = _beacon;
        // beaconToStrikeCount[_beacon] = 0;
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
    function submitRandom(
        address[4] calldata _addressData,
        uint256[9] calldata _uintData,
        // 0 requestId
        // 1 uint256 _ethReserved,
        // 2 uint256 _beaconFee,
        // 3 uint256 _blockNumber,
        // 4 uint256 _blockTimestamp,
        // 5 uint256 _expirationSeconds,
        // 6 uint256 _expirationBlocks,
        // 7 uint256 _callbackGasLimit,
        // 8 uint8 v
        bytes32[3] calldata _rsAndSeed
    ) public {
        uint256 gasAtStart = gasleft();

        SAccounts memory accounts = _resolveAddressCalldata(_addressData);
        SPackedSubmitData memory packed = _resolveUintData(_uintData);
        SPackedRSSeed memory rsAndSeed = _resolveBytesCalldata(_rsAndSeed);

        bytes32 generatedHash = _getRequestHash(
            accounts,
            packed,
            rsAndSeed.seed
        );

        /* No need to require(requestToResult[packed.id] == bytes(0))
         * because requestToHash will already be bytes(0) if it's fulfilled
         * and wouldn't match the generated hash.
         * generatedHash can never be bytes(0) because packed.data.height must be greater than 0 */

        if (requestToHash[packed.id] != generatedHash)
            revert RequestDataMismatch(generatedHash, requestToHash[packed.id]);

        // SRandomRequest storage request = requests[requestId];
        if (packed.data.height == 0) revert RequestNotFound(packed.id);

        uint256 beaconPos;
        uint256 submissionsCount;
        bytes12[3] memory reqValues = requestToSignatures[packed.id];
        for (uint256 i; i < 3; i++) {
            if (reqValues[i] != bytes12(0)) {
                submissionsCount++;
            }
            if (msg.sender == accounts.beacons[i]) {
                beaconPos = i + 1;
            }
        }

        if (beaconPos == 0) revert BeaconNotSelected();

        if (reqValues[beaconPos - 1] != bytes12(0)) revert ResultExists();

        // Verify that the signature provided matches for the reconstructed message
        bytes32 message = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(
                    abi.encode(accounts.client, packed.id, rsAndSeed.seed)
                )
            )
        );

        if (
            msg.sender != ecrecover(message, packed.v, rsAndSeed.r, rsAndSeed.s)
        ) revert SignatureMismatch();

        // Every 100 consecutive submissions, strikes are reset to 0
        _updateBeaconSubmissionCount();

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
                _rsAndSeed,
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

            // Encode the stored values (signatures) in the order decided in requestRandom()
            for (uint256 i; i < submissionsCount; i++) {
                if (i > 0) {
                    reqResult = keccak256(abi.encode(reqResult, reqValues[i]));
                } else {
                    reqResult = keccak256(abi.encode(reqValues[i]));
                }
            }

            // Add result from this last submit
            reqResult = keccak256(
                abi.encode(
                    reqResult,
                    abi.encode(packed.v, rsAndSeed.r, rsAndSeed.s)
                )
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
            // uint256 devFee = (request.beaconFee * request.beacons.length) / 2;
            _chargeClient(accounts.client, developer, packed.data.beaconFee);

            // Beacon fee
            uint256 fee = ((gasAtStart - gasleft() + FINAL_SUBMIT_GAS_OFFSET) *
                _getGasPrice()) + packed.data.beaconFee;
            _chargeClient(accounts.client, msg.sender, fee);

            requestToFeePaid[packed.id] += fee + packed.data.beaconFee; // total fee + dev beaconFee
            // delete requests[packed.id];
            delete requestToHash[packed.id];
            delete requestToSignatures[packed.id];
            _status = _NOT_ENTERED;
        }
    }

    function _callback(
        address _to,
        uint256 _gasLimit,
        uint256 _id,
        bytes32 _result
    ) private {
        (bool success, bytes memory callbackTxData) = _to.call{gas: _gasLimit}(
            abi.encodeWithSelector(
                IRandomReceiver.soRandomCallback.selector,
                _id,
                _result
            )
        );

        if (!success) emit CallbackFailed(_to, _id, _result, callbackTxData);
    }

    function _updateBeaconSubmissionCount() private {
        SBeacon memory beacon = sBeacon[msg.sender];
        if (beacon.consecutiveSubmissions == 99) {
            beacon.consecutiveSubmissions = 0;
            beacon.strikes = 0;
        } else {
            beacon.consecutiveSubmissions++;
        }
        if (beacon.pending > 0) beacon.pending--;
        sBeacon[msg.sender] = beacon;
    }

    function _processRandomSubmission(
        SAccounts memory accounts,
        SPackedSubmitData memory packed,
        bytes32[3] calldata _rsAndSeed,
        uint256 gasAtStart,
        uint256 submissionsCount,
        uint256 beaconPos,
        bytes12[3] memory reqValues
    ) private {
        SPackedRSSeed memory rsAndSeed = _resolveBytesCalldata(_rsAndSeed);

        bytes12 beaconSubmissionValue = bytes12(
            keccak256(abi.encode(packed.v, rsAndSeed.r, rsAndSeed.s))
        );

        requestToSignatures[packed.id][beaconPos - 1] = beaconSubmissionValue;

        reqValues[beaconPos - 1] = beaconSubmissionValue;

        // Second to last requests final beacon
        if (submissionsCount == 1) {
            bytes32 lastBeaconSeed;

            // Encode the stored values (signatures) in the order decided in requestRandom()
            for (uint256 i; i < 2; i++) {
                if (i == 0) {
                    lastBeaconSeed = keccak256(abi.encode(reqValues[i]));
                } else {
                    lastBeaconSeed = keccak256(
                        abi.encode(lastBeaconSeed, reqValues[i])
                    );
                }
            }

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

            // requestToFinalBeacon[packed.id] = randomBeacon;

            accounts.beacons[2] = randomBeacon;

            requestToHash[packed.id] = _getRequestHash(
                accounts,
                packed,
                rsAndSeed.seed
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
                    rsAndSeed.seed
                ),
                randomBeacon
            );
        }

        // 62k offset for charge
        uint256 fee = ((gasAtStart - gasleft() + SUBMIT_GAS_OFFSET) *
            _getGasPrice()) + beaconFee;
        requestToFeePaid[packed.id] += fee;
        _chargeClient(accounts.client, msg.sender, fee);
    }
}
