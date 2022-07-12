import "./Store.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title SoRandom Admin Functions
/// @author Deanpress (hello@dean.press)
/// @notice Administrative functions, variables, and constants used by SoRandom.
contract Admin is Ownable, Store {
    // Number of beacons per request
    uint256 internal constant BLOCKS_UNTIL_RENEWABLE_ALL = 20;
    uint256 internal constant SECONDS_UNTIL_RENEWABLE_ALL = 5 minutes;

    // Gas offsets for fee charge
    uint256 internal constant SUBMIT_GAS_OFFSET = 90000;
    uint256 internal constant FINAL_SUBMIT_GAS_OFFSET = 65000;
    uint256 internal constant RENEW_GAS_OFFSET = 21000;

    // Contract addresses
    address public arbGas;
    address public developer;

    // Re-entrancy guard for final beacon submit
    uint256 internal _status;
    uint256 internal constant _NOT_ENTERED = 1;
    uint256 internal constant _ENTERED = 2;

    // Constructor variables

    /// @notice Emits an event with the final random value
    /// @param id request id
    /// @param result result value
    event Result(uint128 indexed id, bytes32 result);

    /// @notice Emits if a request is retried (has new beacons)
    /// @param request request id
    event Retry(uint128 indexed id, SRequestEventData request);

    event BeaconStakeEth(address indexed beacon, uint256 amount);
    event BeaconUnstake(address indexed beacon, uint256 amount);
    event ClientDeposit(address indexed client, uint256 amount);
    event ClientWithdraw(address indexed client, uint256 amount);
    event ClientWithdrawTo(
        address indexed client,
        address indexed to,
        uint256 amount
    );
    event Charge(address indexed from, address indexed to, uint256 amount);
    event RegisterBeacon(address indexed beacon);

    /// @notice Emits an event that contains all data needed for a beacon to submit a random number.
    /// @param request request event data (id, ethReserved, beaconFee, height, timestamp, expirationSeconds, expirationBlocks, callbackGasLimit, client, beacons, lastBeaconSeed)
    event Request(uint128 indexed id, SRequestEventData request);

    // uint128 request,
    // uint256 ethReserved,
    // uint256 beaconFee,
    // uint256 height,
    // uint256 timestamp,
    // uint256 expirationSeconds,
    // uint256 expirationBlocks,

    /// @notice Emits when final beacon is selected by second-to-last submitter
    /// @param request request event data (id, ethReserved, beaconFee, height, timestamp, expirationSeconds, expirationBlocks, callbackGasLimit, client, beacons, lastBeaconSeed)
    /// @param beacon address of the beacon added
    event RequestBeacon(
        uint128 indexed id,
        SRequestEventData request,
        address beacon
    );

    event Strike(
        address indexed beacon,
        address indexed striker,
        address client,
        uint128 request,
        uint256 amount,
        uint256 slashedTokens
    );

    event RemoveBeacon(address indexed beacon, uint256 strikes);

    function setBeaconFee(uint256 _amount) external onlyOwner {
        beaconFee = _amount;
    }

    function setMinStakeEth(uint256 _amount) external onlyOwner {
        minStakeEth = _amount;
    }

    function setExpirationBlocks(uint256 _expirationBlocks) external onlyOwner {
        expirationBlocks = _expirationBlocks;
    }

    function setMaxStrikes(uint8 _maxStrikes) external onlyOwner {
        maxStrikes = _maxStrikes;
    }

    function setExpirationSeconds(uint256 _expirationSeconds)
        external
        onlyOwner
    {
        expirationSeconds = _expirationSeconds;
    }
}
