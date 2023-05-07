// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.19;

import "../AppStorage.sol";
import "../libraries/LibNetwork.sol";
import "../shared/Structs.sol";

interface IRandomReceiver {
    /// @notice Callback function that is called when a random value is generated
    /// @param _id request id
    /// @param value generated random value
    function randomizerCallback(uint256 _id, bytes32 value) external;
}

library LibBeacon {
    /// @notice Emits when the callback function fails
    /// @param client address of the client that requested the random value
    /// @param id request id
    /// @param result generated random value
    /// @param txData data of the callback transaction
    event CallbackFailed(address indexed client, uint256 indexed id, bytes32 result, bytes txData);

    /// @notice Hashes the request data for validation
    /// @param id request id
    /// @param accounts struct containing client and beacon addresses
    /// @param data struct containing request data
    /// @param seed seed for the random value generation
    /// @return bytes32 hash of the request data
    function _generateRequestHash(
        uint256 id,
        SAccounts memory accounts,
        SRandomUintData memory data,
        bytes32 seed
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
                    data.expirationBlocks,
                    data.expirationSeconds,
                    data.callbackGasLimit,
                    data.minConfirmations
                )
            );
    }

    /// @notice Calculates the fee charge for the request
    /// @param gasAtStart gas used at the start of the function call
    /// @param _beaconFee beacon fee
    /// @param offset gas offset
    /// @return uint256 fee to be charged
    function _getFeeCharge(
        uint256 gasAtStart,
        uint256 _beaconFee,
        uint256 offset
    ) internal view returns (uint256) {
        return _beaconFee + (LibNetwork._gasPrice() * (gasAtStart + offset - gasleft()));
    }

    /// @notice Unpacks the address and request data from calldata
    /// @param _accounts address array containing client and beacon addresses
    /// @param _data uint256 array containing request data
    /// @return SAccounts struct and SPackedSubmitData struct
    function _getAccountsAndPackedData(address[4] calldata _accounts, uint256[19] calldata _data)
        internal
        pure
        returns (SAccounts memory, SPackedSubmitData memory)
    {
        return (_resolveAddressCalldata(_accounts), _resolveUintVrfData(_data));
    }

    /// @notice Unpacks the address data from calldata
    /// @param _data address array containing client and beacon addresses
    /// @return SAccounts struct
    function _resolveAddressCalldata(address[4] calldata _data) internal pure returns (SAccounts memory) {
        return SAccounts(_data[0], [_data[1], _data[2], _data[3]]);
    }

    /// @notice Unpacks the packed request and VRF data from calldata
    /// @param _data uint256 array containing packed request data
    /// @return SPackedSubmitData struct
    function _resolveUintVrfData(uint256[19] calldata _data)
        internal
        pure
        returns (SPackedSubmitData memory)
    {
        return
            SPackedSubmitData(
                uint256(_data[0]),
                SRandomUintData(
                    _data[1],
                    _data[2],
                    _data[3],
                    _data[4],
                    _data[5],
                    _data[6],
                    _data[7],
                    _data[8]
                ),
                SFastVerifyData(
                    [_data[9], _data[10], _data[11], _data[12]],
                    [_data[13], _data[14]],
                    [_data[15], _data[16], _data[17], _data[18]]
                )
            );
    }

    /// @notice Unpacks the request data from calldata
    /// @param _data uint256 array containing request data
    /// @return SPackedUintData struct
    function _resolveUintData(uint256[9] calldata _data) internal pure returns (SPackedUintData memory) {
        return
            SPackedUintData(
                uint256(_data[0]),
                SRandomUintData(
                    _data[1],
                    _data[2],
                    _data[3],
                    _data[4],
                    _data[5],
                    _data[6],
                    _data[7],
                    _data[8]
                )
            );
    }

    /// @notice Calls the callback function on the client contract
    /// @param _to address of the client contract
    /// @param _gasLimit gas limit for the callback transaction
    /// @param _id request id
    /// @param _result generated random value
    function _callback(
        address _to,
        uint256 _gasLimit,
        uint256 _id,
        bytes32 _result
    ) internal {
        // Call the `randomizerCallback` function on the specified contract address with the given parameters
        (bool success, bytes memory callbackTxData) = _to.call{gas: _gasLimit}(
            abi.encodeWithSelector(IRandomReceiver.randomizerCallback.selector, _id, _result)
        );

        // If the call to `randomizerCallback` failed, emit a CallbackFailed event
        if (!success) emit CallbackFailed(_to, _id, _result, callbackTxData);
    }
}
