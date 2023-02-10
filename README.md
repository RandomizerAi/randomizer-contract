# Randomizer Protocol VRF

https://randomizer.ai

Randomizer is a decentralized random value generation protocol that uses native ETH for fees, with real-time results, built in Solidity for EVM chains. It uses elliptic curve cryptography with verifiable random functions (VRF) to send callbacks with random values to smart contracts in a trustless and verifiable manner.

Randomizer uses a mix of future block data, progressive random beacon selection, elliptic curve cryptography, and a staking system to provide a stable solution for verifiable random values to smart contracts.

The protocol also offers a unique **real-time results** module that sends results to your front-end immediately after the user transaction is verified and before a callback is made on-chain. This way you can build responsive and real-time dapps and games.

See [Real-time Coinflip Game Demo](https://coinflip.randomizer.ai/)  ([source](https://github.com/RandomizerAi/coinflip-example)) for an example game.

The real-time module npm package is [@randomizer.ai/realtime-client](https://www.npmjs.com/package/@randomizer.ai/realtime-client).

## Features

- **Native ETH for fees**: Smart contracts (or their users) pay for request fees using ETH. This eliminates all additional gas costs and fluctuations that come from dealing with ERC20 tokens, approvals, and swaps.
- **Low cost**: VRF fees are intended to always be low cost relative to the network's average fees.
- **Decentralized**: Beacons are operated by independent projects and developers.
- **Real-time**: Integrate the the real-time client in your front-end and get instant results after your contract's request, even before callback transactions are verified on-chain.
- **Transparent**: Random value generation happens on-chain with all data publicly available, including the random value, the VRF proofs, and the fulfilling beacons.
- **Proof of Stake**: Beacons stake ETH for their position. If a beacon misses a request, their ETH stake is slashed for the collective fees already paid for the request, plus a reward to the caller of the Renew function. If they miss 3 out of 99 requests, the beacon is automatically unregistered from the protocol.
- **Unpredictable**: a request's final beacon is selected using a seed generated with the VRF data of two previous pseudo-randomly selected beacons, and future block data. This new seed is then used by the randomly selected final beacon to generate the final VRF data for the result.

## Addresses

- Arbitrum One: `0x5b8bB80f2d72D0C85caB8fB169e8170A05C94bAF`

- Arbitrum Goerli: `0x923096Da90a3b60eb7E12723fA2E1547BA9236Bc`

## Getting Started

Visit [https://randomizer.ai/docs](https://randomizer.ai/docs) for a step-by-step tutorial on using Randomizer with your smart contract or web3 project.

Your contract needs to have the function `randomizerCallback(uint256 _id, bytes32 _value)` to accept callbacks from Randomizer.

Make sure that the only permitted `msg.sender` for the callback function is the Randomizer contract address.

**Example coinflip:**

```JS
interface IRandomizer {
    function request(uint256 callbackGasLimit) external returns (uint256);
}

function flip() external returns (uint256) {
    // request(callbackGasLimit)
    uint256 flip = Randomizer.request(500000);
    flipToAddress[flip] = msg.sender;
}

function randomizerCallback(uint256 _id, bytes32 _value) external {
    require(msg.sender == address(Randomizer));
    address player = flipToAddress[_id];
    // Convert the random bytes to a number between 0 and 99
    uint256 random = uint256(_value) % 99;
    // 50% win/lose
    if(random >= 50){
      emit Win(player);
    } else {
      emit Lose(player);
    }
}
```

### Smart Contract Functions

Below are some important Randomizer functions for your dapp:

- `request(callbackGasLimit)`: Makes a request for a random value and returns the request ID.
- `request(callbackGasLimit, confirmations)`: Makes a request for a random value (with a callback after a number of block confirmations, max 40), and returns the request ID.
- `estimateFee(callbackGasLimit)`: Estimates the fee for a request given a callback gas limit.
- `estimateFee(callbackGasLimit, confirmations)`: Estimates the fee for a request given a callback gas limit with confirmations.
- `estimateFeeUsingGasPrice(callbackGasLimit, gasPrice)`: Estimates the fee for a request given a callback gas limit and gas price (usable for front-ends).
- `estimateFeeUsingConfirmationsAndGasPrice(callbackGasLimit, confirmations, gasPrice)`: Estimates the fee for a request given a callback gas limit, confirmations, and gas price (usable for front-ends).
- `getFeeStats(requestID)`: Returns the total amount paid and refunded for a request (handy if your users pay for requests and you want your contract to refund the remainder).
- `clientDeposit(address) payable`: Deposit attached ETH (`msg.value`) to Randomizer for the client contract. You can combine this with `estimateFee(callbackGasLimit)` to have your users attach the ETH fee themselves for the VRF request ([read more](https://randomizer.ai/docs#withdrawing)).
- `clientWithdrawTo(address, amount)`: Integrate this function in your smart contract to withdraw deposited ETH from Randomizer to the designated address.

### Development

The quickest way to test your smart contract's `randomizerCallback()` function in Hardhat or another local testing environment, is to set the Randomizer address in your contract to a wallet address of your own, then calling `randomizerCallback(uint256 id, bytes32 value)` with that wallet using your desired id and value.

### Using this Hardhat project

To use this Hardhat project, git clone it and run `yarn set-network:[network]` (`ethereum`, `arbitrum`, or `generic`) to copy the correct network library (for gas/block calculations) from `network-contracts` to `contracts`. For example: `yarn set-network:ethereum`.

Tests will only pass 100% if the network is set to ethereum since some tests utilize EIP-1559 (a fee system not present in arbitrum).

See the tests for reference.

## License

Randomizer is released under the **Business Service License 1.1** (BUSL-1.1).

See [LICENSE](./LICENSE) for details.

## Security

### Audits

- [Peckshield](./audits/PeckShield-Audit-Report-Randomizer-v1.0.pdf)
- [MythX](./audits/Randomizer-MythX-Report.pdf)

### Disclaimer

Please be aware that using the Randomizer contract carries inherent risks, and by implementing it you are doing so at your own risk. Randomizer and its licensors, developers, and contributors will not be held responsible for any security issues that may arise from any code or implementations of the smart contracts. It is your responsibility to thoroughly review and test any smart contract before use.
