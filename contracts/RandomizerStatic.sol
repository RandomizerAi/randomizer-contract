// SPDX-License-Identifier: BSL 1.1
// Non-upgradeable version of Randomizer for EVM networks that don't support OpenZeppelin's Upgradeable contract.

pragma solidity ^0.8.17;
import "./Randomizer.sol";

contract RandomizerStatic is Randomizer {
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
}
