// SPDX-License-Identifier: BSL 1.1
pragma solidity ^0.8.17;

interface ArbSys {
    function arbBlockNumber() external view returns (uint256);
}

interface ArbGasInfo {
    function getMinimumGasPrice() external view returns (uint256);
}

contract NetworkHelper {
    function _seed(uint256 id) internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    address(this),
                    id,
                    blockhash(block.number - 1),
                    ArbSys(address(100)).arbBlockNumber(),
                    block.timestamp,
                    block.chainid
                )
            );
    }

    function _getGasPrice() internal view returns (uint256) {
        uint256 maxFee = block.basefee + (block.basefee / 4);
        uint256 gasPrice = tx.gasprice < maxFee ? tx.gasprice : maxFee;
        return gasPrice;
    }
}
