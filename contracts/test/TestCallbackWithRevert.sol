// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

interface IRandomizer {
    function request(uint256 _callbackGasLimit) external returns (uint256);

    function clientWithdrawTo(address _to, uint256 _amount) external;

    function requestToFeePaid(uint128 _request) external returns (uint256);
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

    function randomizerCallback(uint128 _id, bytes32 value) external {
        revert("Revert");
    }

    function makeRequest() external returns (uint256) {
        return IRandomizer(randomizer).request(100000);
    }
}
