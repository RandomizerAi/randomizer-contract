// SPDX-License-Identifier: BSL 1.1
pragma solidity ^0.8.16;
import "../Randomizer.sol";

contract RandomizerWithStorageControls is Randomizer {
    /// @custom:oz-upgrades-unsafe-allow constructor
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

    function _debug_setSBeacon(
        address beacon,
        uint8 submissions,
        uint8 strikes
    ) external {
        sBeacon[beacon].consecutiveSubmissions = submissions;
        sBeacon[beacon].strikes = strikes;
    }
}
