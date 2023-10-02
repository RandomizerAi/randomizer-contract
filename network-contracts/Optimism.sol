// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.19;

library LibNetwork {
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

    /**
     * @dev We keep the blockNumber input here to keep the codebase consistent with that of other networks.
     * LibNetwork._blockHash() is used by BeaconFacet and RenewFacet for additional PRNG seed inputs.
     */
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
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(reqVal1, reqVal2, height));
    }
}
