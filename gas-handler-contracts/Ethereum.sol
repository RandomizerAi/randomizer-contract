contract GasHandler {
    function _getGasPrice() internal view returns (uint256) {
        uint256 maxFee = block.basefee + (block.basefee / 4);
        uint256 gasPrice = tx.gasprice < maxFee ? tx.gasprice : maxFee;
        return gasPrice;
    }
}
