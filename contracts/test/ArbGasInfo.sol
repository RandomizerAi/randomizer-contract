pragma solidity >=0.4.21 <0.9.0;

contract ArbGasInfo {
    constructor() {}

    uint256 AMT = 500000000;

    // return gas prices in wei, assuming the specified aggregator is used
    //        (
    //            per L2 tx,
    //            per L1 calldata unit, (zero byte = 4 units, nonzero byte = 16 units)
    //            per storage allocation,
    //            per ArbGas base,
    //            per ArbGas congestion,
    //            per ArbGas total
    //        )
    // function getPricesInWeiWithAggregator(address aggregator) external view returns (uint, uint, uint, uint, uint, uint){
    //   return (AMT, AMT, AMT, AMT, AMT, AMT)
    // }

    // return gas prices in wei, as described above, assuming the caller's preferred aggregator is used
    //     if the caller hasn't specified a preferred aggregator, the default aggregator is assumed
    function getPricesInWei()
        public
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return (AMT, AMT, AMT, AMT, AMT, AMT);
    }

    function getMinimumGasPrice() public pure returns (uint256) {
        return 1000000;
    }

    // // return prices in ArbGas (per L2 tx, per L1 calldata unit, per storage allocation),
    // //       assuming the specified aggregator is used
    // function getPricesInArbGasWithAggregator(address aggregator) external view returns (uint, uint, uint) {
    //         return (AMT, AMT, AMT)
    // }

    // // return gas prices in ArbGas, as described above, assuming the caller's preferred aggregator is used
    // //     if the caller hasn't specified a preferred aggregator, the default aggregator is assumed
    // function getPricesInArbGas() external view returns (uint, uint, uint) {
    //               return (AMT, AMT, AMT)

    // }

    // // return gas accounting parameters (speedLimitPerSecond, gasPoolMax, maxTxGasLimit)
    // function getGasAccountingParams() external view returns (uint, uint, uint) {
    //               return (AMT, AMT, AMT)
    // }

    // // get ArbOS's estimate of the L1 gas price in wei
    // function getL1GasPriceEstimate() external view returns(uint);

    // // set ArbOS's estimate of the L1 gas price in wei
    // // reverts unless called by chain owner or designated gas oracle (if any)
    // function setL1GasPriceEstimate(uint priceInWei) external;

    // // get L1 gas fees paid by the current transaction (txBaseFeeWei, calldataFeeWei)
    // function getCurrentTxL1GasFees() external view returns(uint);
}
