// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

library LibNetwork {
    error BlockhashUnavailable(uint256 blockNumber);

    function _seed(uint256 id) internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    address(this),
                    id,
                    blockhash(block.number - 1),
                    block.prevrandao,
                    block.timestamp,
                    block.chainid
                )
            );
    }

    function _maxGasPriceAfterConfirmations(
        uint256 _confirmations
    ) internal view returns (uint256 maxGasPrice) {
        maxGasPrice = tx.gasprice;
        // maxFee goes up by 12.5% per confirmation, calculate the max fee for the number of confirmations
        if (_confirmations > 1) {
            uint256 i = 0;
            do {
                maxGasPrice += (maxGasPrice / 8) + 1;
                unchecked {
                    ++i;
                }
            } while (i < _confirmations);
        }
    }

    function _maxGasPriceAfterConfirmations(
        uint256 _price,
        uint256 _confirmations
    ) internal pure returns (uint256 maxGasPrice) {
        maxGasPrice = _price + (_price / 4) + 1;
        // maxFee goes up by 12.5% per confirmation, calculate the max fee for the number of confirmations
        if (_confirmations > 1) {
            uint256 i = 0;
            do {
                maxGasPrice += (maxGasPrice / 8) + 1;
                unchecked {
                    ++i;
                }
            } while (i < _confirmations);
        }
    }

    function _gasPrice() internal view returns (uint256) {
        return tx.gasprice;
    }

    function _blockHash(uint256 blockNumber) internal view returns (bytes32) {
        return blockhash(blockNumber);
    }

    function _blockNumber() internal view returns (uint256) {
        return block.number;
    }

    function _generateNewSeed(
        uint256 height,
        bytes10 reqVal1,
        bytes10 reqVal2
    ) internal view returns (bytes32) {
        bytes10 memBlockhash = bytes10(_blockHash(height));
        if (memBlockhash == bytes10(0)) revert BlockhashUnavailable(height);
        // Generate a new seed value using the values of the last two requests + the request's blockhash
        return keccak256(abi.encodePacked(reqVal1, reqVal2, height));
    }

    function _estimateFee(
        uint256 _callbackGasLimit,
        uint256 _confirmations,
        uint256 _gasPrc,
        uint256 _totalSubmit,
        uint256 _gasPerBeaconSelect,
        uint256 _beaconsLength,
        uint256 _beaconFee
    ) internal pure returns (uint256) {
        return
            ((_totalSubmit + _callbackGasLimit + ((_gasPerBeaconSelect * (_beaconsLength - 1)) * 3)) *
                _maxGasPriceAfterConfirmations(_gasPrc, _confirmations)) + (_beaconFee * 5);
    }
}
