// SPDX-License-Identifier: BSL 1.1
// Upgradeable version of Randomizer for EVM networks that support OpenZeppelin's Upgradeable contract.

pragma solidity ^0.8.16;
import "./Randomizer.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract RandomizerUpgradeable is Initializable, Randomizer {
    function initialize(
        address[2] memory _addresses,
        uint256[7] memory _configUints,
        address[] memory _beacons,
        uint256[] memory _beaconPublicKeys,
        uint256[] memory _gasEstimates
    ) public initializer {
        __Ownable_init();
        init(
            _addresses,
            _configUints,
            _beacons,
            _beaconPublicKeys,
            _gasEstimates
        );
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
}
