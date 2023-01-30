// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IRandomizer {
    function request(uint256 _callbackGasLimit, uint256 _confirmations) external returns (uint256);

    function clientWithdrawTo(address _to, uint256 _amount) external;

    function requestToFeePaid(uint256 _request) external returns (uint256);
}

contract TestCallbackWithRevert {
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

    function randomizerCallback(uint256 _id, bytes32 value) external {
        revert("Revert");
    }

    function makeRequest() external returns (uint256) {
        return IRandomizer(randomizer).request(100000, 1);
    }
}
