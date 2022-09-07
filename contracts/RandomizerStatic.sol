// SPDX-License-Identifier: BSL 1.1
// Non-upgradeable version of Randomizer for EVM networks that don't support OpenZeppelin's Upgradeable contract.

pragma solidity ^0.8.16;
import "./Randomizer.sol";

contract RandomizerStatic is Randomizer {
    constructor(
        address[2] memory _addresses,
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
    ) {
        init(
            _addresses,
            _maxStrikes,
            _minStakeEth,
            _expirationBlocks,
            _expirationSeconds,
            _requestMinGasLimit,
            _requestMaxGasLimit,
            _beaconFee,
            _beacons,
            _beaconPublicKeys,
            _gasEstimates
        );
    }
}
