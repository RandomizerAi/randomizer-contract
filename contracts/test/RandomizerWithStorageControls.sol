// SPDX-License-Identifier: BSL 1.1
pragma solidity ^0.8.17;
import "../Randomizer.sol";

contract RandomizerWithStorageControls is Randomizer {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        address[2] memory _addresses,
        uint256[7] memory _configUints,
        address[] memory _beacons,
        uint256[] memory _beaconPublicKeys,
        uint256[] memory _gasEstimates
    ) {
        init(
            _addresses,
            _configUints,
            _beacons,
            _beaconPublicKeys,
            _gasEstimates
        );
    }

    function _debug_setSBeacon(
        address beacon,
        uint8 submissions,
        uint8 strikes
    ) external {
        sBeacon[beacon].consecutiveSubmissions = submissions;
        sBeacon[beacon].strikes = strikes;
    }

    function _debug_setCollateral(address beacon, uint256 collateral) external {
        ethCollateral[beacon] = collateral;
    }
}
