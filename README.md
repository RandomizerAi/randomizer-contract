# Randomizer.AI - Easy & secure randomness for smart contracts

(Randomizer.AI)[https://randomizer.ai] is a Verifiable Random Function (VRF) protocol that lets contracts easily get randomness e.g. for NFT generation, drop rates, gaming etc. Smart contracts can make external calls to randomizer's `requestRandom()` function to receive callbacks that contain random bytes to their `randomizerCallback(id, value)` function. The protocol uses native ETH for fees.

## IMPORTANT: Before getting started
Set the network using `yarn set-network:{network}`. This will copy over the desired gas price handler for the network.

The gas handler's `_getGasPrice()` function returns the maximum gas price that beacons can be refunded upon submitting a request.

Supported gas fee handlers:

* **Ethereum**: 25% over the block's basefee.
* **Arbitrum**: The latest gasPrice value returned by Arbitrum's native ArbGasInfo contract.
* **Generic**: The tx.gasprice value.
## Protocol steps

Note that the protocol stores & verifies hashed calldata instead of storing independent variables so as to minimize storage gas fees. 

1. Beacon deposits ETH by attaching ETH in `msg.value` in a `beaconStakeEth(address _beacon)` call. This ETH is staked (can be unstaked at any time) and can be slashed by the protocol when the beacon misses a request.
2. Devs (or dapp users) deposit ETH on behalf of their smart contract ("client") by adding `msg.value` to a `clientDeposit(address _client)` call. When a client contract calls `randomizer.requestRandom()`, the estimate gas fee + premium is reserved from the deposit and finally charged on completion.
3. Client contract calls `requestRandom(uint256 _callbackGasLimit)` to request a random number. The function returns a uint256 id (which the client contract refer to when it receives a callback with a random value).
4. 2 beacons are selected in the `requestRandom()` function which sign the existing request data (client address, request id, seed generated from block data) and submit their signature to `submitRandom()`.
5. When the 2nd beacon submits its signature, the 2 signatures are hashed to generate a seed with which a 3rd (final) beacon is randomly selected. The event `RequestBeacon(uint256 id, RequestEventData request, address beacon)` is emitted.
5. The final beacon (revealed in the RequestBeacon event) now also submits a signature to `submitRandom()`. The function hashes all 3 signatures and calls the `randomizerCallback(uint256 id, bytes32 value)` function in the client contract. `id` is the request id (previously given to the client contract when it called `requestRandom()`) and `value` is the bytes32 keccak256 hash of the set of 3 signatures. 

Beacons cannot manipulate the result by changing data as the `requestRandom()` function validates the signature against the request data.

If a beacon misses a request, the first beacon that *did* submit a request can call `renewRequest()` to renew it. After a certain amount of seconds/blocks, anyone can call `renewRequest()` for the request.

If the request is renewed, the non-submitting beacon addresses are replaced with new beacon addresses and the request gets a new timeline (blocks/seconds) to be completed. ETH from the first non-submitting beacon's stake is transferred to the client contract deposit (for the full amount that they already paid for the request), and to the address that called `renewRequest()` to cover for its transaction fee. Non-submitting beacons also receive a strike. If a beacon gets 3 strikes in 100 requests, they are automatically removed from the list of beacons. Every 100 fulfilled requests, the strike count resets.

Review the tests for a technical overview.

## Beacon node

The beacon node server is located in `beacon/start.eth.js`. This application loads all private keys defined as `SIGNER_1`, `SIGNER_2` etc in the root `.env` file and immediately signs & submits new random requests for the configured beacons. In production only 1 signer is used per node server seeing as all nodes are operated by independent parties. 


## External functions

### Client

* `clientDeposit(address _client) external payable` - Deposit ETH to a client contract. This ETH is used to pay for random requests by the client contract.

* `clientWithdrawTo(address _to, uint256 _amount)` - Withdraw deposited ETH of `_amount` to the specified `_to` address. Only the client contract that contains the deposit can call this function, so make sure your has a call to this function and it's only callable by an admin address (see example).

*  `requestRandom(uint24 _callbackGasLimit) external returns (uint256 id)` - Called by a contract to request a future function call to its `randomizerCallback(uint256 id, bytes32 value)` function. `_callbackGasLimit` is the gas limit for `randomizerCallback()`.  Returns the id of the request (also returned in randomizerCallback so the client contract can reference it).

* `getFeeEstimate(uint24 _callbackGasLimit, uint8 _numberOfBeacons) returns (uint256 fee)` - View function to estimate total fee for fulfilling a random request. Contracts can use this to charge the fee to their client.

### Beacon

* `submitRandom(address[4] calldata _addressData, uint256[9] calldata _uintData, bytes32[3] calldata _rsAndSeed)` - Submit signature data for a random request. This function combines the first 2 signatures into a seed to select a random 3rd beacon. When the 3rd beacon calls this function, it combines all signatures into a bytes32 value and sends it to the requesting client contract's `randomizerCallback()` function, along with the request id.

* `beaconStakeEth(address _beacon) external payable` - Stakes ETH for the beacon. The beacon stake must always be more than the configured `minStakeEth` or they will be removed as a beacon upon a request renewal where they were selected.

* `beaconUnstakeEth(uint256 _amount)` - Unstake `_amount` of staked ETH. The beacon is removed from the beacons list if the remaining stake is less than the configured `minStakeEth` amount.

* `unregisterBeacon(address _beacon)` - Unregisters a beacon and refunds its stake. Only callable if the beacon has no pending requests.

### General

* `renewRequest(address[4] calldata _addressData, uint256[8] calldata _uintData, bytes32 _seed)` - Renews an unfulfilled request. Only callable when the request passed its `expirationBlocks` and `expirationSeconds`. Only callable by the first submitting beacon first. Callable by any wallet 20 blocks and 5 minutes after the expiration. The first beacon that didn't submit will have their stake slashed for the transaction fees of this call, for the fees already paid for the `submitRandom()` calls that were already made, and for a small premium that incentivizes the `renewRequest` call. The caller is refunded the transaction fee + a premium. The client contract is refunded the fees that had already been deducted for this request. After renewal, an event is emitted that instructs newly selected beacons to fulfill the request (as if a new request was made).

## Example

A simple coinflip contract that uses randomizer to get a seed.

Note that ETH must have been deposited on behalf of the contract in randomizer using randomizer's payable `clientDeposit(address _client)` function. This can easily be done in the randomizer dashboard at https://sorandom.lol.

```solidity
// randomizer protocol interface
interface IRandomizer {
    function requestRandom(uint24 _callbackGasLimit) external returns (uint256);

    function clientWithdrawTo(address _to, uint256 _amount) external;
}

contract CoinFlip {
    address public constant SORANDOM = 0x...;

    address public constant OWNER = 0x...;

    // Stores each game to the player
    mapping(uint256 => address) public flipToAddress;

    // Events
    event Win(address winner);
    event Lose(address loser);

    // The coin flip containing the random request
    function flip() external returns (uint256) {
        // Request a random number from the randomizer contract (50k callback limit)
        uint256 id = IRandomizer(randomizer).requestRandom(50000);
        // Store the flip ID and the player address
        flipToAddress[id] = msg.sender;
        // Return the flip ID
        return id;
    }

    // Callback function called by the randomizer contract when the random value is generated
    function randomizerCallback(uint256 _id, bytes32 _value) external {
        // Callback can only be called by randomizer
        require(msg.sender == randomizer, "Caller is not randomizer");
        // Get the player address from the flip ID
        address player = flipToAddress[_id];
        // Convert the random bytes to a number between 0 and 99
        uint256 random = uint256(_value) % 99;
        // If the random number is less than 50, the player wins
        if (random < 50) {
            emit Win(player);
        } else {
            emit Lose(player);
        }
    }

    // Allows the owner to withdraw their deposited randomizer funds
    function randomizerWithdraw(uint256 amount) external {
        require(msg.sender == OWNER, "Sender is not owner");
        IRandomizer(randomizer).clientWithdrawTo(msg.sender, amount);
    }
}
```


## Basic Harhdat commands

Try running some of the following tasks:

```shell
npx hardhat accounts
npx hardhat compile
npx hardhat clean
npx hardhat test
npx hardhat node
npx hardhat help
```
