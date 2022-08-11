// SPDX-License-Identifier: BSL 1.1
// Non-upgradeable version of SoRandom for EVM networks that don't support OpenZeppelin's Upgradeable contract.

pragma solidity ^0.8.15;
import "./SoRandom.sol";

contract SoRandomStatic is SoRandom {
    constructor(
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
    ) initializer {
        __Ownable_init();
        init(
            _developer,
            _sequencer,
            _maxStrikes,
            _minStakeEth,
            _expirationBlocks,
            _expirationSeconds,
            _requestMinGasLimit,
            _requestMaxGasLimit,
            _beaconFee,
            _beacons
        );
    }
}
