// SPDX-License-Identifier: BSL 1.1
// Upgradeable version of Randomizer for EVM networks that support OpenZeppelin's Upgradeable contract.
pragma solidity ^0.8.17;
import "../Randomizer.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @custom:oz-upgrades-unsafe-allow external-library-linking
contract RandomizerUpgradeableV2 is Initializable, Randomizer {
    function initialize(
        address[2] memory _addresses,
        uint256[7] memory _configUints,
        address[] memory _beacons,
        uint256[] memory _beaconPublicKeys,
        uint256[] memory _gasEstimates
    ) public initializer {
        init(
            _addresses,
            _configUints,
            _beacons,
            _beaconPublicKeys,
            _gasEstimates
        );
    }

    function newFunction() public pure returns (string memory) {
        return "Hello World";
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}
}
