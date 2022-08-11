// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

interface ISoRandom {
    function requestRandom(uint256 _callbackGasLimit)
        external
        returns (uint256);

    function clientWithdrawTo(address _to, uint256 _amount) external;

    function requestToFeePaid(uint128 _request) external returns (uint256);
}

contract TestCallback {
    address public soRandom;
    bytes32 public result;
    uint256 public id;
    uint256 public resultsCount;
    mapping(uint256 => bytes32) public results;

    event Callback(uint256 id, bytes32 value);

    constructor(address _soRandom) {
        id = 1;
        soRandom = _soRandom;
    }

    function soRandomCallback(uint128 _id, bytes32 value) external {
        require(msg.sender == soRandom);
        result = value;
        id = _id;
        emit Callback(_id, value);
        // uint256 refund = ISoRandom(soRandom).requestToFeePaid(_id);
    }

    function soRandomWithdraw(uint256 _amount) external {
        ISoRandom(soRandom).clientWithdrawTo(msg.sender, _amount);
        // uint256 refund = ISoRandom(soRandom).requestToFeePaid(_id);
        // console.log("Refund", refund);
    }

    function makeRequest() external returns (uint256) {
        return ISoRandom(soRandom).requestRandom(1000000);
    }

    function makeRequestWithGasTooLow() external returns (uint256) {
        return ISoRandom(soRandom).requestRandom(1);
    }

    function makeRequestWithGasTooHigh() external returns (uint256) {
        return ISoRandom(soRandom).requestRandom(999999999);
    }
}
