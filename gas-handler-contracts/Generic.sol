// SPDX-License-Identifier: BSL 1.1
pragma solidity ^0.8.17;

contract NetworkHelper {
    function _seed(uint256 id) internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    address(this),
                    id,
                    blockhash(block.number - 1),
                    block.difficulty,
                    block.timestamp,
                    block.chainid
                )
            );
    }

    function _getGasPrice() internal view returns (uint256) {
        return tx.gasprice;
    }

    function _blockNumber() internal view returns (uint256) {
        return block.number;
    }
}
