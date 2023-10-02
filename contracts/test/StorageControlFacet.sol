// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.19;

import "../AppStorage.sol";

contract StorageControlFacet {
    AppStorage internal s;

    function _debug_setSBeacon(address beacon, uint8 submissions, uint8 strikes) external {
        s.beacon[beacon].consecutiveSubmissions = submissions;
        s.beacon[beacon].strikes = strikes;
    }

    function _debug_setCollateral(address beacon, uint256 collateral) external {
        s.ethCollateral[beacon] = collateral;
    }

    function _debug_setClientDeposit(address client, uint256 deposit) external {
        s.ethDeposit[client] = deposit;
    }
}
