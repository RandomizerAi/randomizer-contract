// SPDX-License-Identifier: BSL 1.1

/// @title Randomizer Utils
/// @author Deanpress (https://github.com/deanpress)
/// @notice Internal utilities used by Randomizer functions

pragma solidity ^0.8.16;
import "./Admin.sol";

// Import the gas handler for the desired network to deploy to
import "./GasHandler.sol";

contract Utils is Admin, GasHandler {
    // Errors used by Utils, Beacon, and Client
    error RequestDataMismatch(bytes32 givenHash, bytes32 expectedHash);
    error RequestNotFound(uint128 id);
    error BeaconNotFound();
    error FailedToSendEth(address to, uint256 amount);
    error NotEnoughBeaconsAvailable(
        uint256 availableBeacons,
        uint256 requiredBeacons
    );

    /// @dev Replaces all non-submitting beacons from a request (called when a request is renewed)
    function _replaceNonSubmitters(
        uint128 _request,
        address[3] memory _beacons,
        bytes12[3] memory _values
    ) internal view returns (address[3] memory) {
        bytes32 random = keccak256(
            abi.encode(_request, blockhash(block.number - 1))
        );

        address[3] memory newSelectedBeacons;
        uint256 i;
        uint256 length = beacons.length - 1;
        uint256 valuesLen = _values.length;

        while (i < valuesLen) {
            // If non-submitter
            if (_values[i] == bytes12(0) && _beacons[i] != address(0)) {
                // Generate new beacon beacon index
                uint256 randomBeaconIndex = (uint256(random) % length) + 1;
                address randomBeacon = beacons[randomBeaconIndex];
                bool duplicate;
                // Check existing for beaconId duplicates
                for (uint256 j; j < valuesLen; j++) {
                    if (randomBeacon == _beacons[j]) {
                        random = keccak256(abi.encode(random));
                        duplicate = true;
                        break;
                    }
                }
                // Check  for new beaconId duplicates
                if (!duplicate) {
                    for (uint256 j; j < valuesLen; j++) {
                        if (randomBeacon == newSelectedBeacons[j]) {
                            duplicate = true;
                            break;
                        }
                    }
                }
                // If no duplicates: assign to newSelectedBeacons and update beacon pending
                if (!duplicate) {
                    newSelectedBeacons[i] = randomBeacon;
                    i++;
                } else {
                    // If there's a duplicate re-run the loop with a new random hash
                    random = keccak256(abi.encode(random));
                }
            } else {
                // If the beacon already submitted, assign it to its existing position
                newSelectedBeacons[i] = _beacons[i];
                i++;
            }
        }

        return newSelectedBeacons;
    }

    /// @dev Removes a beacon from the list of beacons
    function _removeBeacon(address _beacon) internal {
        uint256 index = beaconIndex[_beacon];
        uint256 lastBeaconIndex = beacons.length - 1;
        sBeacon[_beacon].exists = false;
        if (index == beacons.length - 1) {
            beacons.pop();
            return;
        }
        if (index == 0) revert BeaconNotFound();
        beacons[index] = beacons[lastBeaconIndex];
        address newBeacon = beacons[lastBeaconIndex];
        beaconIndex[_beacon] = 0;
        // The replacing beacon gets assigned the replaced beacon's index
        beaconIndex[newBeacon] = index;
        beacons.pop();
    }

    /// @dev Pops a pending request ID from the list of pendingRequestIDs (called when a request is successful)
    function _removePendingRequest(uint128 _request) internal {
        uint256 length = pendingRequestIds.length;
        for (uint256 i; i < length; i++) {
            if (pendingRequestIds[i] == _request) {
                pendingRequestIds[i] = pendingRequestIds[length - 1];
                pendingRequestIds.pop();
                break;
            }
        }
    }

    /// @dev Gets the first submitter in a request (address(0) if none)
    function _getFirstSubmitter(uint128 _request, address[3] memory _beacons)
        internal
        view
        returns (address)
    {
        bytes12[3] memory signatures = requestToSignatures[_request];
        // Iterate through values and return beacon address if it submitted a signature
        for (uint256 i; i < 3; i++) {
            if (signatures[i] != bytes12(0)) return _beacons[i];
        }
        return address(0);
    }

    function _chargeClient(
        address _from,
        address _to,
        uint256 _value
    ) internal {
        ethDeposit[_from] -= _value;
        ethCollateral[_to] += _value;
        emit ChargeEth(_from, _to, _value, false, true);
    }

    /// @dev Gets BEACONS_PER_REQUEST number of random beacons for a request
    function _randomBeacons(bytes32 _random)
        internal
        returns (address[3] memory)
    {
        if (beacons.length < 5)
            revert NotEnoughBeaconsAvailable(beacons.length, 5);

        address[3] memory indices;
        uint256 length = beacons.length - 1;
        // Select a random beacon 2 times and store in selectedBeacons
        uint256 i;
        while (i < 2) {
            uint256 randomBeaconIndex = (uint256(_random) % length) + 1;
            address randomBeacon = beacons[randomBeaconIndex];
            bool duplicate;
            if (i > 0) {
                for (uint256 x; x < i; x++) {
                    if (indices[x] == randomBeacon) {
                        _random = keccak256(abi.encode(_random));
                        duplicate = true;
                        break;
                    }
                }
            }
            if (!duplicate) {
                sBeacon[randomBeacon].pending++;
                indices[i] = randomBeacon;
                i++;
            }
        }

        return indices;
    }

    /// @dev Gets a single random beacon
    function _randomBeacon(bytes32 _random, address[3] memory _selectedBeacons)
        internal
        view
        returns (address beacon)
    {
        if (beacons.length < 5)
            revert NotEnoughBeaconsAvailable(beacons.length, 5);

        // address[] memory cachedBeacons = beacons;
        uint256 length = beacons.length - 1;
        // Select a random beacon store in selectedBeacons
        while (true) {
            bool duplicate;
            uint256 randomBeaconIndex = (uint256(_random) % length) + 1;
            address randomBeacon = beacons[randomBeaconIndex];
            for (uint256 i; i < 3; i++) {
                if (_selectedBeacons[i] == randomBeacon) {
                    _random = keccak256(abi.encode(_random));
                    duplicate = true;
                    break;
                }
            }
            if (!duplicate) {
                return randomBeacon;
            }
        }
    }

    function _resolveUintData(uint256[21] calldata _data)
        internal
        pure
        returns (SPackedSubmitData memory)
    {
        return
            SPackedSubmitData(
                uint128(_data[0]),
                uint8(_data[20]),
                SRandomUintData(
                    _data[1],
                    _data[2],
                    _data[3],
                    _data[4],
                    _data[5],
                    _data[6],
                    _data[7]
                ),
                SFastVerifyData(
                    [_data[8], _data[9], _data[10], _data[11]],
                    [_data[12], _data[13]],
                    [_data[14], _data[15], _data[16], _data[17]]
                )
            );
    }

    function _resolveOptimisticUintData(uint256[7] calldata _data)
        internal
        pure
        returns (SRandomUintData memory)
    {
        return
            SRandomUintData(
                _data[0],
                _data[1],
                _data[2],
                _data[3],
                _data[4],
                _data[5],
                _data[6]
            );
    }

    function _resolveRenewUintData(uint256[8] calldata _data)
        internal
        pure
        returns (SPackedRenewData memory)
    {
        return
            SPackedRenewData(
                uint128(_data[0]),
                SRandomUintData(
                    _data[1],
                    _data[2],
                    _data[3],
                    _data[4],
                    _data[5],
                    _data[6],
                    _data[7]
                )
            );
    }

    function _resolveBytesCalldata(bytes32[2] calldata _data)
        internal
        pure
        returns (SPackedRSSeed memory)
    {
        return SPackedRSSeed(_data[0], _data[1]);
    }

    function _resolveAddressCalldata(address[4] calldata _data)
        internal
        pure
        returns (SAccounts memory)
    {
        return SAccounts(_data[0], [_data[1], _data[2], _data[3]]);
    }

    function _getRequestHash(
        uint128 id,
        SAccounts memory accounts,
        SRandomUintData memory data,
        bytes32 seed,
        bool optimistic
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    id,
                    seed,
                    accounts.client,
                    accounts.beacons,
                    data.ethReserved,
                    data.beaconFee,
                    data.expirationSeconds,
                    data.expirationBlocks,
                    data.callbackGasLimit,
                    optimistic
                )
            );
    }

    function _getRequestRenewHash(
        SAccounts memory accounts,
        SPackedRenewData memory packed,
        bytes32 seed,
        bool optimistic
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    packed.id,
                    accounts.client,
                    accounts.beacons,
                    seed,
                    packed.data.ethReserved,
                    packed.data.beaconFee,
                    packed.data.height,
                    packed.data.timestamp,
                    packed.data.expirationSeconds,
                    packed.data.expirationBlocks,
                    packed.data.callbackGasLimit,
                    optimistic
                )
            );
    }

    function _transferEth(address _to, uint256 _amount) internal {
        (bool sent, ) = _to.call{value: _amount}("");
        if (sent) {
            emit WithdrawEth(_to, _amount);
        } else {
            revert FailedToSendEth(_to, _amount);
        }
    }

    /// @dev Computes the VRF hash output as result of the digest of a ciphersuite-dependent prefix
    /// concatenated with the gamma point
    /// @param _gammaX The x-coordinate of the gamma EC point
    /// @param _gammaY The y-coordinate of the gamma EC point
    /// @return The VRF hash ouput as shas256 digest
    function gammaToHash(uint256 _gammaX, uint256 _gammaY)
        public
        pure
        returns (bytes32)
    {
        bytes memory c = abi.encodePacked(
            // Cipher suite code (SECP256K1-SHA256-TAI is 0xFE)
            uint8(0xFE),
            // 0x03
            uint8(0x03),
            // Compressed Gamma Point
            _encodePoint(_gammaX, _gammaY)
        );

        return sha256(c);
    }

    /// @dev Encode an EC point to bytes
    /// @param _x The coordinate `x` of the point
    /// @param _y The coordinate `y` of the point
    /// @return The point coordinates as bytes
    function _encodePoint(uint256 _x, uint256 _y)
        internal
        pure
        returns (bytes memory)
    {
        uint8 prefix = uint8(2 + (_y % 2));

        return abi.encodePacked(prefix, _x);
    }
}
