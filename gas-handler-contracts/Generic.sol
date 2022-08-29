// SPDX-License-Identifier: BSL 1.1
pragma solidity ^0.8.16;

contract GasHandler {
    function _getGasPrice() internal view returns (uint256) {
        return tx.gasprice;
    }
}
