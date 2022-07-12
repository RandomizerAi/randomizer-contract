interface IArbGasInfo {
    function getPricesInWei()
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        );
}

contract GasHandler {
    function _getGasPrice() internal view returns (uint256) {
        (, , , , , uint256 gasPrice) = IArbGasInfo(
            0x000000000000000000000000000000000000006C
        ).getPricesInWei();
        return gasPrice;
    }
}
