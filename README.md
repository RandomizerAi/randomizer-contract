# Randomizer

Randomizer is a decentralized random value generation protocol with real-time results, built in Solidity for EVM chains. It uses elliptic curve cryptography with verifiable random functions (VRF) to send callbacks with random values to smart contracts in a trustless and verifiable manner.

## Demo

[Real-time Coinflip Game Demo](https://coinflip.randomizer.ai/) ([source](https://github.com/RandomizerAi/coinflip-example))

## Features

- Decentralized: Beacons are operated by independent projects and developers.
- Real-time: Integrate the Randomizer Real-time Service in your front-end and get real-time results immediately after your contract's request, before any callback transactions are verified on-chain.
- Scalable: Randomizer can handle a large number of requests without compromising on speed.
- Transparent: Random value generation happens on-chain with all data publicly available, including the random value, the VRF proofs, and the fulfilling beacons.

## Getting Started

Visit [https://randomizer.ai/docs](https://randomizer.ai/docs) for documentation on how to use Randomizer with your smart contract or web3 project.

### Smart Contract Functions

- `request(callbackGasLimit)`: Makes a request for a random value and returns the request ID.
- `estimateFee(callbackGasLimit)`: Estimates the fee for a request given a callback gas limit.
- `estimateFeeUsingGasPrice(callbackGasLimit, gasPrice)`: Estimates the fee for a request given a callback gas limit and gas price (usable for front-ends).
- `getFeeStats(requestID)`: Returns the total amount paid and refunded for a request (handy if your users pay for requests and you want your contract to refund the remainder).
- `clientDeposit(address) payable`: Deposit attached ETH (`msg.value`) to Randomizer for the client contract. You can combine this with `estimateFee(callbackGasLimit)` to have your users attach the ETH fee themselves for the VRF request ([read more](https://randomizer.ai/docs#withdrawing)).
- `clientWithdrawTo(address, amount)`: Integrate this function in your smart contract to withdraw deposited ETH from Randomizer to the designated address.

## License

Randomizer is released under the Business Service License 1.1 (BUSL-1.1).

See [LICENSE.md](LICENSE.md) for details.

## Security

**Audits**

* [Peckshield](./audits/PeckShield-Audit-Report-Randomizer-v1.0.pdf)
* [MythX](./audits/Randomizer-MythX-Report.pdf)

Please be aware that using the Randomizer contract carries inherent risks, and by implementing it you are doing so at your own risk. Randomizer and its licensors, developers, and contributors will not be held responsible for any security issues that may arise from any code or implementations of the smart contracts. It is your responsibility to thoroughly review and test any contract before use.
