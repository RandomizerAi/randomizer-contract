// SPDX-License-Identifier: BSL 1.1

/// @title Randomizer Utils
/// @author Deanpress (https://github.com/deanpress)
/// @notice Internal utilities used by Randomizer functions

pragma solidity ^0.8.16;
import "./Admin.sol";
import "./lib/Internals.sol";
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
    error NotYetCompletableBySender(
        uint256 currentHeight,
        uint256 currentTimestamp,
        uint256 completableHeight,
        uint256 completableTimestamp
    );

    function _replaceNonSubmitters(
        uint128 _request,
        address[3] memory _beacons,
        bytes32[3] memory _values
    ) internal view returns (address[3] memory) {
        return
            Internals._replaceNonSubmitters(
                _request,
                _beacons,
                _values,
                beacons
            );
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

    /// @dev Gets the first submitter in a request (address(0) if none)
    function _getFirstSubmitter(uint128 _request, address[3] memory _beacons)
        internal
        view
        returns (address)
    {
        bytes32[3] memory signatures = requestToVrfHashes[_request];
        // Iterate through values and return beacon address if it submitted a signature
        for (uint256 i; i < 3; i++) {
            if (signatures[i] != bytes32(0)) return _beacons[i];
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

    function _optimisticCanComplete(
        uint256[2] memory challengeWindow,
        uint256 multiplier
    ) internal view {
        uint256 completeHeight = challengeWindow[0] +
            (expirationBlocks * multiplier);
        uint256 completeTimestamp = challengeWindow[1] +
            (multiplier * 5 minutes);
        if (
            block.number < completeHeight || block.timestamp < completeTimestamp
        )
            revert NotYetCompletableBySender(
                block.number,
                block.timestamp,
                completeHeight,
                completeTimestamp
            );
    }

    function _resolveUintData(uint256[18] calldata _data)
        internal
        pure
        returns (SPackedSubmitData memory)
    {
        return
            SPackedSubmitData(
                uint128(_data[0]),
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
                    [data.height, data.timestamp],
                    data.expirationSeconds,
                    data.expirationBlocks,
                    data.callbackGasLimit,
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

    function _getAccountsAndPackedData(
        address[4] calldata _accounts,
        uint256[18] calldata _data
    ) internal pure returns (SAccounts memory, SPackedSubmitData memory) {
        return (_resolveAddressCalldata(_accounts), _resolveUintData(_data));
    }

    function _encodePoint(uint256 _x, uint256 _y)
        internal
        pure
        returns (bytes memory)
    {
        uint8 prefix = uint8(2 + (_y % 2));

        return abi.encodePacked(prefix, _x);
    }

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
}
