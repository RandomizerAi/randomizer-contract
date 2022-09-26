// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

interface IRandomizer {
    function request(uint256 _callbackGasLimit, bool)
        external
        returns (uint256);

    function clientWithdrawTo(address _to, uint256 _amount) external;

    function requestToFeePaid(uint128 _request) external returns (uint256);
}

contract TestCallbackWithTooMuchGas {
    address public randomizer;
    bytes32 public result;
    uint256 public id;
    uint256 public resultsCount;
    bytes32 private i = bytes32(0);
    mapping(uint256 => bytes32) public results;

    event Callback(uint256 id, bytes32 value);

    constructor(address _randomizer) {
        id = 1;
        randomizer = _randomizer;
    }

    function randomizerCallback(uint256 _id, bytes32 value) external {
        // Keep running this until it runs out of gas
        while (true) {
            i = keccak256(abi.encodePacked(i, _id, value));
        }
    }

    function makeRequest() external returns (uint256) {
        return IRandomizer(randomizer).request(100000, false);
    }
}
