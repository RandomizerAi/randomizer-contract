import "./Admin.sol";

// Import the gas handler for the desired network to deploy to
import "./GasHandler.sol";

/// @title SoRandom Utils
/// @author Deanpress (hello@dean.press)
/// @notice Internal utilities used by SoRandom functions

contract Utils is Admin, GasHandler {
    // Errors used by Utils, Beacon, and Client
    error RequestDataMismatch(bytes32 expectedHash, bytes32 givenHash);
    error RequestNotFound(uint256 id);
    error BeaconNotFound();
    error FailedToSendEth();

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
                // If no duplicates: assign to newSelectedBeacons and update beacon pendingCount
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
        emit RemoveBeacon(_beacon, sBeacon[_beacon].strikes);
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

    function _charge(
        address _from,
        address _to,
        uint256 _value
    ) internal {
        ethDeposit[_from] -= _value;
        ethCollateral[_to] += _value;
        emit Charge(_from, _to, _value);
    }

    /// @dev Gets BEACONS_PER_REQUEST number of random beacons for a request
    function _randomBeacons(uint128 _request, bytes32 _seed)
        internal
        returns (address[3] memory)
    {
        // Using _request hash so that the beacons are unique for multiple requests within the same block
        bytes32 random = keccak256(abi.encode(_request, _seed));

        // address[] memory cachedBeacons = beacons;
        address[3] memory indices;
        uint256 length = beacons.length - 1;
        // Select a random beacon _beaconsAmt times and store in selectedBeacons
        uint256 i;
        while (i < 2) {
            uint256 randomBeaconIndex = (uint256(random) % length) + 1;
            address randomBeacon = beacons[randomBeaconIndex];
            bool duplicate;
            if (i > 0) {
                for (uint256 x; x < i; x++) {
                    if (indices[x] == randomBeacon) {
                        random = keccak256(abi.encode(random));
                        duplicate = true;
                        break;
                    }
                }
            }
            if (!duplicate) {
                sBeacon[randomBeacon].pendingCount++;
                indices[i] = randomBeacon;
                i++;
            }
        }

        return indices;
    }

    /// @dev Gets a single random beacon
    function _randomBeacon(bytes32 _seed, address[3] memory _selectedBeacons)
        internal
        view
        returns (address)
    {
        // Using _request hash so that the beacons are unique for multiple requests within the same block
        bytes32 random = keccak256(abi.encode(_seed));

        // address[] memory cachedBeacons = beacons;
        uint256 length = beacons.length - 1;
        // Select a random beacon store in selectedBeacons
        while (true) {
            bool duplicate;
            uint256 randomBeaconIndex = (uint256(random) % length) + 1;
            address randomBeacon = beacons[randomBeaconIndex];
            for (uint256 i; i < 3; i++) {
                if (_selectedBeacons[i] == randomBeacon) {
                    random = keccak256(abi.encode(random));
                    duplicate = true;
                    break;
                }
            }
            if (!duplicate) {
                return randomBeacon;
            }
        }
        return address(0);
    }

    function _resolveUintData(uint256[9] calldata _data)
        internal
        pure
        returns (SPackedSubmitData memory)
    {
        return
            SPackedSubmitData(
                uint128(_data[0]),
                // v
                uint8(_data[8]),
                SRandomCallData(
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

    function _resolveRenewUintData(uint256[8] calldata _data)
        internal
        pure
        returns (SPackedRenewData memory)
    {
        return
            SPackedRenewData(
                uint128(_data[0]),
                SRandomCallData(
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

    function _resolveBytesCalldata(bytes32[3] calldata _data)
        internal
        pure
        returns (SPackedRSSeed memory)
    {
        return SPackedRSSeed(_data[0], _data[1], _data[2]);
    }

    function _resolveAddressCalldata(address[4] calldata _data)
        internal
        pure
        returns (SAccounts memory)
    {
        return SAccounts(_data[0], [_data[1], _data[2], _data[3]]);
    }

    function _getRequestHash(
        SAccounts memory accounts,
        SPackedSubmitData memory packed,
        bytes32 seed
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
                    packed.data.callbackGasLimit
                )
            );
    }

    function _getRequestRenewHash(
        SAccounts memory accounts,
        SPackedRenewData memory packed,
        bytes32 seed
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
                    packed.data.callbackGasLimit
                )
            );
    }

    function _transferEth(address _to, uint256 _amount) internal {
        (bool sent, ) = _to.call{value: _amount}("");
        if (!sent) revert FailedToSendEth();
    }
}
