contract GasHandler {
    function _getGasPrice() internal view returns (uint256) {
        return tx.gasprice;
    }
}
