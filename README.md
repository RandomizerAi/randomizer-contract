# IMPORTANT: Before getting started
Set the network using `yarn set-network:{network}`. This will copy over the desired gas price handler for the network.

The gas handler's `_getGasPrice()` function returns the maximum gas price that beacons can be refunded upon submitting a request.

Supported gas fee handlers:

* **Ethereum**: 25% over the block's basefee.
* **Arbitrum**: The latest gasPrice value returned by Arbitrum's native ArbGasInfo contract.
* **Generic**: The tx.gasprice value.

# Protocol steps

Note that the protocol stores & verifies hashed calldata instead of storing independent variables so as to minimize storage gas fees. 

1. Beacon deposits ETH by attaching ETH in `msg.value` in a `beaconStakeEth(address _beacon)` call. This ETH is staked (can be unstaked at any time) and can be slashed by the protocol when the beacon misses a request.
2. Devs (or dapp users) deposit ETH on behalf of their smart contract ("client") by adding `msg.value` to a `clientDeposit(address _client)` call. When a client contract calls `soRandom.requestRandom()`, the estimate gas fee + premium is reserved from the deposit and finally charged on completion.
3. Client contract calls `requestRandom(uint256 _callbackGasLimit)` to request a random number. The function returns a uint256 id (which the client contract refer to when it receives a callback with a random value).
4. 2 beacons are selected in the `requestRandom()` function which sign the existing request data (client address, request id, seed generated from block data) and submit their signature to `submitRandom()`.
5. When the 2nd beacon submits its signature, the 2 signatures are hashed to generate a seed with which a 3rd (final) beacon is randomly selected. The event `RequestBeacon(uint256 id, RequestEventData request, address beacon)` is emitted.
5. The final beacon (revealed in the RequestBeacon event) now also submits a signature to `submitRandom()`. The function hashes all 3 signatures and calls the `soRandomCallback(uint256 id, bytes32 value)` function in the client contract. `id` is the request id (previously given to the client contract when it called `requestRandom()`) and `value` is the bytes32 keccak256 hash of the set of 3 signatures. 

Beacons cannot manipulate the result by changing data as the `requestRandom()` function validates the signature against the request data.

If a beacon misses a request, the first beacon that *did* submit a request can call `renewRequest()` to renew it. After a certain amount of seconds/blocks, anyone can call `renewRequest()` for the request.

If the request is renewed, the non-submitting beacon addresses are replaced with new beacon addresses and the request gets a new timeline (blocks/seconds) to be completed. ETH from the first non-submitting beacon's stake is transferred to the client contract deposit (for the full amount that they already paid for the request), and to the address that called `renewRequest()` to cover for its transaction fee. Non-submitting beacons also receive a strike. If a beacon gets 3 strikes in 100 requests, they are automatically removed from the list of beacons. Every 100 fulfilled requests, the strike count resets.

Review the tests for a technical overview.

# Basic Harhdat commands

Try running some of the following tasks:

```shell
npx hardhat accounts
npx hardhat compile
npx hardhat clean
npx hardhat test
npx hardhat node
npx hardhat help
```
