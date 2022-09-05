// SPDX-License-Identifier: BSL 1.1
// Upgradeable version of Randomizer for EVM networks that support OpenZeppelin's Upgradeable contract.
pragma solidity ^0.8.16;
import "../Randomizer.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract RandomizerUpgradeableV2 is Initializable, Randomizer {
    function initialize(
        address[3] memory _addresses,
        uint8 _maxStrikes,
        uint256 _minStakeEth,
        uint256 _expirationBlocks,
        uint256 _expirationSeconds,
        // uint256 _minCollateralToken,
        uint256 _requestMinGasLimit,
        uint256 _requestMaxGasLimit,
        uint256 _beaconFee,
        address[] memory _beacons,
        uint256[] memory _beaconPublicKeys,
        uint256[] memory _gasEstimates
    ) public initializer {
        init(
            _addresses,
            _maxStrikes,
            _minStakeEth,
            _expirationBlocks,
            _expirationSeconds,
            _beaconFee,
            _requestMinGasLimit,
            _requestMaxGasLimit,
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
