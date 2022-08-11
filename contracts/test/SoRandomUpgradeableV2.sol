// SPDX-License-Identifier: BSL 1.1
// Upgradeable version of SoRandom for EVM networks that support OpenZeppelin's Upgradeable contract.
pragma solidity ^0.8.15;
import "../SoRandom.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract SoRandomUpgradeableV2 is Initializable, SoRandom {
    function initialize(
        address _developer,
        address _sequencer,
        uint8 _maxStrikes,
        uint256 _minStakeEth,
        uint256 _expirationBlocks,
        uint256 _expirationSeconds,
        // uint256 _minCollateralToken,
        uint256 _requestMinGasLimit,
        uint256 _requestMaxGasLimit,
        uint256 _beaconFee,
        address[] memory _beacons
    ) public initializer {
        init(
            _developer,
            _sequencer,
            _maxStrikes,
            _minStakeEth,
            _expirationBlocks,
            _expirationSeconds,
            _beaconFee,
            _requestMinGasLimit,
            _requestMaxGasLimit,
            _beacons
        );
    }

    function newFunction() public pure returns (string memory) {
        return "Hello World";
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}
}
