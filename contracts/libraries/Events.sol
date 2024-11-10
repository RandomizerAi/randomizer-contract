// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

// Events that are shared across Randomizer facets
import "../shared/Structs.sol";

library Events {
    /// @notice Emits when ETH is charged between accounts
    /// @param chargeType 0: client to beacon, 1: beacon to client, 2: beacon to beacon
    /// @param from address of the sender
    /// @param to address of the recipient
    /// @param amount amount of ETH charged
    event ChargeEth(address indexed from, address indexed to, uint256 amount, uint8 chargeType);
    /// @notice Emits when a client deposits ETH
    /// @param account address of the client
    /// @param amount amount of ETH deposited
    event ClientDepositEth(address indexed account, uint256 amount);
    /// @notice Emits when a beacon stakes ETH
    /// @param account address of the beacon
    /// @param amount amount of ETH deposited
    event BeaconDepositEth(address indexed account, uint256 amount);
    /// @notice Emits when a beacon is unregistered
    /// @param beacon address of the unregistered beacon
    /// @param kicked boolean indicating if the beacon was kicked or voluntarily unregistered
    /// @param strikes number of strikes the beacon had before being unregistered
    event UnregisterBeacon(address indexed beacon, bool indexed kicked, uint8 strikes);
    /// @notice Emits when a final beacon is selected for a request
    /// @param id request id
    /// @param beacon address of the beacon added
    /// @param seed seed used for the random value generation
    /// @param timestamp new timestamp of the request
    event RequestBeacon(uint256 indexed id, address indexed beacon, bytes32 seed, uint256 timestamp);
    /// @notice Emits an event with the final random value
    /// @param id request id
    /// @param result result value
    event Result(uint256 indexed id, bytes32 result);
    /// @notice Emits when ETH is withdrawn
    /// @param to address of the recipient
    /// @param amount amount of ETH withdrawn
    event WithdrawEth(address indexed to, uint256 amount);
    /// @notice Emits if a request is retried (has new beacons)
    /// @param id request id
    /// @param request SRequestEventData struct containing request data
    /// @param chargedBeacon address of the beacon that was charged
    /// @param renewer address of the renewer
    /// @param ethToClient amount of ETH returned to the client
    /// @param ethToRenewer amount of ETH returned to the caller
    event Retry(
        uint256 indexed id,
        SRequestEventData request,
        address indexed chargedBeacon,
        address indexed renewer,
        uint256 ethToClient,
        uint256 ethToRenewer
    );
    /// @notice Emits when the sequencer is transferred from one address to another
    /// @param previousSequencer address of the previous sequencer
    /// @param newSequencer address of the new sequencer
    event TransferSequencer(address indexed previousSequencer, address indexed newSequencer);
    /// @notice Emits when the treasury address is set
    /// @param previousTreasury address of the previous treasury
    /// @param newTreasury address of the new treasury
    event SetTreasury(address indexed previousTreasury, address indexed newTreasury);
}
