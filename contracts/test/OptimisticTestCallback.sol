// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

interface IRandomizer {
    function request(uint256 _callbackGasLimit, bool)
        external
        returns (uint256);

    function clientWithdrawTo(address _to, uint256 _amount) external;

    function requestToFeePaid(uint128 _request) external returns (uint256);
}

contract OptimisticTestCallback {
    address public randomizer;
    bytes32 public result;
    uint256 public id;
    uint256 public resultsCount;
    mapping(uint256 => bytes32) public results;

    event Callback(uint256 id, bytes32 value);

    constructor(address _randomizer) {
        id = 1;
        randomizer = _randomizer;
    }

    function randomizerCallback(uint128 _id, bytes32 value) external {
        require(msg.sender == randomizer);
        result = value;
        id = _id;
        emit Callback(_id, value);
    }

    function randomizerWithdraw(uint256 _amount) external {
        IRandomizer(randomizer).clientWithdrawTo(msg.sender, _amount);
    }

    function makeRequest() external returns (uint256) {
        return IRandomizer(randomizer).request(1000000, true);
    }

    function makeRequestWithGasTooLow() external returns (uint256) {
        return IRandomizer(randomizer).request(1, true);
    }

    function makeRequestWithGasTooHigh() external returns (uint256) {
        return IRandomizer(randomizer).request(999999999, true);
    }
}
