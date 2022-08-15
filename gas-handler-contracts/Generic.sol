// SPDX-License-Identifier: BSL 1.1
^pragma solidity 0.8.0;

contract GasHandler {
    //  TOTAL_SUBMIT_GAS_ESTIMATE is the submitResult() gas estimate * 3
    uint256 internal constant TOTAL_SUBMIT_GAS_ESTIMATE = 570000;

    // Gas offsets for fee charge
    uint256 internal constant SUBMIT_GAS_OFFSET = 90000;
    uint256 internal constant FINAL_SUBMIT_GAS_OFFSET = 65000;
    uint256 internal constant RENEW_GAS_OFFSET = 21000;

    function _getGasPrice() internal view returns (uint256) {
        return tx.gasprice;
    }
}
