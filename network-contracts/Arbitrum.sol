// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.17;

interface ArbSys {
    function arbBlockNumber() external view returns (uint256);

    function arbBlockHash(uint256 arbBlockNum) external view returns (bytes32);
}

interface ArbGasInfo {
    function getMinimumGasPrice() external view returns (uint256);
}

library LibNetwork {
    function _seed(uint256 id) internal view returns (bytes32) {
        uint256 blockNum = _blockNumber();
        return
            keccak256(
                abi.encode(
                    address(this),
                    id,
                    _blockHash(blockNum - 1),
                    blockNum,
                    block.timestamp,
                    block.chainid
                )
            );
    }

    function _maxGasPriceAfterConfirmations(uint256 _confirmations)
        internal
        view
        returns (uint256 maxGasPrice)
    {
        uint256 minPrice = ArbGasInfo(address(108)).getMinimumGasPrice();
        uint256 maxFee = minPrice + (minPrice / 4);
        maxGasPrice = tx.gasprice < maxFee ? tx.gasprice : maxFee;
        // maxFee goes up by 12.5% per confirmation, calculate the max fee for the number of confirmations
        if (_confirmations > 1) {
            uint256 i = 0;
            do {
                maxGasPrice += maxGasPrice / 8;
                unchecked {
                    ++i;
                }
            } while (i < _confirmations);
        }
    }

    function _maxGasPriceAfterConfirmations(uint256 _price, uint256 _confirmations)
        internal
        pure
        returns (uint256 maxGasPrice)
    {
        maxGasPrice = _price + (_price / 4);
        // maxFee goes up by 12.5% per confirmation, calculate the max fee for the number of confirmations
        if (_confirmations > 1) {
            uint256 i = 0;
            do {
                maxGasPrice += maxGasPrice / 8;
                unchecked {
                    ++i;
                }
            } while (i < _confirmations);
        }
    }

    function _gasPrice() internal view returns (uint256) {
        uint256 minPrice = ArbGasInfo(address(108)).getMinimumGasPrice();
        uint256 maxFee = minPrice + (minPrice / 4);
        uint256 gasPrice = tx.gasprice < maxFee ? tx.gasprice : maxFee;
        return gasPrice;
    }

    function _blockHash(uint256 blockNumber) internal view returns (bytes32) {
        return ArbSys(address(100)).arbBlockHash(blockNumber);
    }

    function _blockNumber() internal view returns (uint256) {
        return ArbSys(address(100)).arbBlockNumber();
    }
}
