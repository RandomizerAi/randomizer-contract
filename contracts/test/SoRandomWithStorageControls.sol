import "../SoRandom.sol";

contract SoRandomWithStorageControls is SoRandom {
    constructor(
        address _developer,
        uint8 _maxStrikes,
        uint256 _minStakeEth,
        uint256 _expirationBlocks,
        uint256 _expirationSeconds,
        // uint256 _minCollateralToken,
        uint256 _beaconFee,
        address[] memory _beacons
    )
        SoRandom(
            _developer,
            _maxStrikes,
            _minStakeEth,
            _expirationBlocks,
            _expirationSeconds,
            _beaconFee,
            _beacons
        )
    {}

    function _debug_setSBeacon(
        address beacon,
        uint8 submissions,
        uint8 strikes
    ) external {
        sBeacon[beacon].consecutiveSubmissions = submissions;
        sBeacon[beacon].strikes = strikes;
    }
}
