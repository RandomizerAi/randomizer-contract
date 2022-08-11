// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

interface IRandomizer {
    function requestRandom(uint256 _callbackGasLimit)
        external
        returns (uint256);

    function clientWithdrawTo(address _to, uint256 _amount) external;

    function requestToFeePaid(uint128 _request) external returns (uint256);
}

contract TestCallback {
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
        // uint256 refund = IRandomizer(randomizer).requestToFeePaid(_id);
    }

    function randomizerWithdraw(uint256 _amount) external {
        IRandomizer(randomizer).clientWithdrawTo(msg.sender, _amount);
        // uint256 refund = IRandomizer(randomizer).requestToFeePaid(_id);
        // console.log("Refund", refund);
    }

    function makeRequest() external returns (uint256) {
        return IRandomizer(randomizer).requestRandom(1000000);
    }

    function makeRequestWithGasTooLow() external returns (uint256) {
        return IRandomizer(randomizer).requestRandom(1);
    }

    function makeRequestWithGasTooHigh() external returns (uint256) {
        return IRandomizer(randomizer).requestRandom(999999999);
    }
}
