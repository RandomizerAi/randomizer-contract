# IMPORTANT: Before getting started
Set the network using `yarn set-network:{network}`. This will copy over the desired gas price handler for the network.

The gas handler's `_getGasPrice()` function returns the maximum gas price that beacons can be refunded upon submitting a request.

Supported gas fee handlers:

* **Ethereum**: 25% over the block's basefee.
* **Arbitrum**: The latest gasPrice value returned by Arbitrum's native ArbGasInfo contract.
* **Generic**: The tx.gasprice value.

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
