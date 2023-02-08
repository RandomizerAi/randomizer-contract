// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.18;

import "../AppStorage.sol";
import "../libraries/LibNetwork.sol";
import "../libraries/Constants.sol";
import "../libraries/LibBeacon.sol";
import "../libraries/Events.sol";
import {LibDiamond} from "../libraries/LibDiamond.sol";

contract Utils {
    AppStorage internal s;

    // Errors
    error BeaconNotFound();
    error NotEnoughBeaconsAvailable(uint256 availableBeacons, uint256 requiredBeacons);
    error ReentrancyGuard();
    error FailedToSendEth(address to, uint256 amount);
    error RequestDataMismatch(bytes32 givenHash, bytes32 expectedHash);
    error RequestNotFound(uint256 id);

    /// @notice Emits an event on a new request that contains all data needed for a beacon to process it
    /// @param request request data
    event Request(uint256 indexed id, SRequestEventData request);

    /// @dev Removes a beacon from the list of beacons
    function _removeBeacon(address _beacon) internal {
        uint256 index = s.beaconIndex[_beacon];
        if (index == 0) revert BeaconNotFound();
        uint256 lastBeaconIndex = s.beacons.length - 1;
        s.beacon[_beacon].registered = false;
        if (index == lastBeaconIndex) {
            s.beaconIndex[_beacon] = 0;
            s.beacons.pop();
            return;
        }
        s.beacons[index] = s.beacons[lastBeaconIndex];
        address newBeacon = s.beacons[lastBeaconIndex];
        s.beaconIndex[_beacon] = 0;
        // The replacing beacon gets assigned the replaced beacon's index
        s.beaconIndex[newBeacon] = index;
        s.beacons.pop();
    }

    function _requestBeacon(
        uint256 _id,
        uint256 _beaconPos,
        bytes32 _seed,
        SAccounts memory _accounts,
        SRandomUintData memory _data
    ) internal {
        if (s.beacons.length < 5) revert NotEnoughBeaconsAvailable(s.beacons.length, 5);
        _data.height = LibNetwork._blockNumber();
        _data.timestamp = block.timestamp;
        address randomBeacon = _selectOneBeacon(_seed, [_accounts.beacons[0], _accounts.beacons[1]]);
        s.beacon[randomBeacon].pending++;
        _accounts.beacons[_beaconPos] = randomBeacon;
        s.requestToHash[_id] = LibBeacon._generateRequestHash(_id, _accounts, _data, _seed);
        emit Events.RequestBeacon(_id, randomBeacon, _seed, _data.timestamp);
    }

    function _selectTwoBeacons(bytes32 _random) internal returns (address, address) {
        // Create a new array that contains only the items that are not in the exclude array
        address[] memory selectedItems = s.beacons;

        // Shuffle the selectedItems array using the Fisher-Yates shuffle algorithm
        uint256 i = 1;
        do {
            // Generate a random index j such that i <= j <= selectedItems.length - 1
            uint256 j = (uint256(keccak256(abi.encodePacked(_random, i))) % (selectedItems.length - i)) + i;
            // Swap the items at indices i and j
            address temp = selectedItems[i];
            selectedItems[i] = selectedItems[j];
            selectedItems[j] = temp;
            s.beacon[selectedItems[i]].pending++;
            unchecked {
                ++i;
            }
        } while (i < 3);
        // Return the first two items from the shuffled array
        return (selectedItems[1], selectedItems[2]);
    }

    function _selectOneBeacon(bytes32 _random, address[2] memory _exclude) internal view returns (address) {
        // Create a new array that contains only the items that are not in the exclude array
        (address[] memory selectedItems, uint256 count) = _beaconsWithoutExcluded(_exclude);

        // Generate a random index j such that j <= count
        uint256 j = uint256(_random) % count;

        return selectedItems[j];
    }

    /*
     * Below we have 3 _beaconsWithoutExcluded views that have identical logic, except they accept different length arrays for the input.
     * The only alternative is to have a dynamic array input, which would require a memory allocation, which is more expensive.
     */

    function _beaconsWithoutExcluded(address[2] memory _excluded)
        internal
        view
        returns (address[] memory, uint256 count)
    {
        uint256 beaconsLen = s.beacons.length;
        address[] memory selectedItems = new address[](beaconsLen - 2);

        uint256 i = 1;
        do {
            bool found = false;
            uint256 j = 0;
            while (j < _excluded.length) {
                if (s.beacons[i] == _excluded[j]) {
                    found = true;
                    break;
                }
                unchecked {
                    ++j;
                }
            }
            if (!found) {
                selectedItems[count] = s.beacons[i];
                unchecked {
                    ++count;
                }
            }
            unchecked {
                ++i;
            }
        } while (i < beaconsLen);

        return (selectedItems, count);
    }

    function _beaconsWithoutExcluded(address[3] memory _excluded)
        internal
        view
        returns (address[] memory, uint256 count)
    {
        uint256 beaconsLen = s.beacons.length;
        address[] memory selectedItems = new address[](beaconsLen - 3);

        uint256 i = 1;
        do {
            bool found = false;
            uint256 j = 0;
            while (j < _excluded.length) {
                if (s.beacons[i] == _excluded[j]) {
                    found = true;
                    break;
                }
                unchecked {
                    ++j;
                }
            }
            if (!found) {
                selectedItems[count] = s.beacons[i];
                unchecked {
                    ++count;
                }
            }
            unchecked {
                ++i;
            }
        } while (i < beaconsLen);

        return (selectedItems, count);
    }

    function _beaconsWithoutExcluded(address[5] memory _excluded, uint256 excludeLen)
        internal
        view
        returns (address[] memory, uint256 count)
    {
        uint256 beaconsLen = s.beacons.length;
        address[] memory selectedItems = new address[](beaconsLen - excludeLen);

        uint256 i = 1;
        do {
            bool found = false;
            uint256 j = 0;
            while (j < _excluded.length) {
                if (s.beacons[i] == _excluded[j]) {
                    found = true;
                    break;
                }
                unchecked {
                    ++j;
                }
            }
            if (!found) {
                selectedItems[count] = s.beacons[i];
                unchecked {
                    ++count;
                }
            }
            unchecked {
                ++i;
            }
        } while (i < beaconsLen);

        return (selectedItems, count);
    }

    function _processResult(
        uint256 id,
        address client,
        bytes10[3] memory hashes,
        uint256 callbackGasLimit,
        uint256 _ethReserved
    ) internal {
        bytes32 result = keccak256(abi.encodePacked(hashes[0], hashes[1], hashes[2]));

        // Callback to requesting contract
        LibBeacon._callback(client, callbackGasLimit, id, result);
        s.ethReserved[client] -= _ethReserved;

        s.results[id] = result;
        emit Events.Result(id, result);
    }

    function _finalSoftChargeClient(
        uint256 id,
        address client,
        uint256 fee,
        uint256 beaconFee
    ) internal {
        uint256 daoFee;
        uint256 seqFee;
        uint256 deposit = s.ethDeposit[client];
        if (deposit > 0) {
            if (deposit > fee) {
                // If this is the final charge for the request,
                // add fee for configured treasury and sequencer
                daoFee = deposit >= fee + beaconFee ? beaconFee : deposit - fee;
                _chargeClient(client, s.treasury, daoFee);
                // Only add sequencer fee if the deposit has enough subtracting sender and treasury fee
                if (deposit > fee + daoFee) {
                    seqFee = deposit >= fee + daoFee + beaconFee ? beaconFee : deposit - daoFee - fee;
                    _chargeClient(client, s.sequencer, seqFee);
                }
            } else {
                fee = deposit;
            }
            s.requestToFeePaid[id] += fee + seqFee + daoFee;
            _chargeClient(client, msg.sender, fee);
        }
    }

    function _softChargeClient(
        uint256 id,
        address client,
        uint256 fee
    ) internal {
        uint256 deposit = s.ethDeposit[client];
        if (deposit > 0) {
            if (deposit < fee) {
                fee = deposit;
            }
            s.requestToFeePaid[id] += fee;
            _chargeClient(client, msg.sender, fee);
        }
    }

    function _transferEth(address _to, uint256 _amount) internal {
        (bool sent, ) = _to.call{value: _amount}("");
        if (sent) {
            emit Events.WithdrawEth(_to, _amount);
        } else {
            revert FailedToSendEth(_to, _amount);
        }
    }

    function _chargeClient(
        address _from,
        address _to,
        uint256 _value
    ) private {
        s.ethDeposit[_from] -= _value;
        s.ethCollateral[_to] += _value;
        emit Events.ChargeEth(_from, _to, _value, Constants.CHARGE_TYPE_CLIENT_TO_BEACON);
    }

    function _validateRequestData(
        uint256 id,
        bytes32 seed,
        SAccounts memory accounts,
        SRandomUintData memory data
    ) internal view {
        bytes32 generatedHash = LibBeacon._generateRequestHash(id, accounts, data, seed);

        /* No need to require(requestToResult[packed.id] == bytes(0))
         * because requestToHash will already be bytes(0) if it's fulfilled
         * and wouldn't match the generated hash.
         * generatedHash can never be bytes(0) because packed.data.height must be greater than 0 */

        if (s.requestToHash[id] != generatedHash)
            revert RequestDataMismatch(generatedHash, s.requestToHash[id]);

        if (data.height == 0) revert RequestNotFound(id);
    }

    function _generateRequest(
        uint256 id,
        address client,
        SRandomUintData memory data
    ) internal {
        if (s.beacons.length < 5) revert NotEnoughBeaconsAvailable(s.beacons.length, 5);

        bytes32 seed = LibNetwork._seed(id);

        (address beaconOne, address beaconTwo) = _selectTwoBeacons(seed);
        address[3] memory selectedBeacons = [beaconOne, beaconTwo, address(0)];

        SAccounts memory accounts = SAccounts(client, selectedBeacons);

        bytes32 generatedHash = LibBeacon._generateRequestHash(id, accounts, data, seed);

        s.requestToHash[id] = generatedHash;

        // Emit event with new request data
        emit Request(
            id,
            SRequestEventData(
                data.ethReserved,
                data.beaconFee,
                block.timestamp,
                data.expirationBlocks,
                data.expirationSeconds,
                data.callbackGasLimit,
                data.minConfirmations,
                client,
                selectedBeacons,
                seed
            )
        );
    }
}
