// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IRandomizer {
    function request(uint256 _callbackGasLimit) external returns (uint256);

    function request(uint256 _callbackGasLimit, uint256 _confirmations) external returns (uint256);

    function clientWithdrawTo(address _to, uint256 _amount) external;

    function requestToFeePaid(uint256 _request) external returns (uint256);
}

contract TestCallbackProduction {
    address public randomizer;
    bytes32 public result;
    uint256 public id;
    uint256 public resultsCount;
    address public owner;
    mapping(uint256 => bytes32) public results;

    event Callback(uint256 id, bytes32 value);

    constructor(address _randomizer) {
        id = 1;
        randomizer = _randomizer;
        owner = msg.sender;
    }

    function randomizerCallback(uint256 _id, bytes32 value) external {
        require(msg.sender == randomizer);
        result = value;
        id = _id;
        emit Callback(_id, value);
    }

    function randomizerWithdraw(uint256 _amount) external {
        require(msg.sender == owner, "sender not owner");
        IRandomizer(randomizer).clientWithdrawTo(msg.sender, _amount);
    }

    function makeRequest() external returns (uint256) {
        require(msg.sender == owner, "sender not owner");
        return IRandomizer(randomizer).request(100000);
    }

    function makeRequestWith15Confirmations() external returns (uint256) {
        require(msg.sender == owner, "sender not owner");
        return IRandomizer(randomizer).request(100000, 15);
    }
}
