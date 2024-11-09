const { ethers } = require("hardhat");
const hre = require("hardhat");
const randomizerAbi = require("../abi/Randomizer.json").abi;

async function main() {
  const randomizer = await ethers.getContractAt(
    randomizerAbi,
    hre.network.config.contracts.randomizer
  );
  const accounts = await ethers.getSigners();
  const contractOwner = accounts[0];

  let gasPrice = (await contractOwner.provider.getGasPrice()).mul(4);

  for (let i = 1; i <= 10; i++) {
    const envVar = `SIGNER_${i}`;
    if (!process.env[envVar]) break;
    const wallet = new hre.ethers.Wallet(
      process.env[envVar],
      hre.ethers.provider
    );
    // Unstake the beacon
    gasPrice = (await contractOwner.provider.getGasPrice()).mul(4);
    const beaconStake = (await randomizer.beacon(wallet.address)).ethStake;
    if (!beaconStake.eq(0)) {
      console.log("Unstaking");
      await randomizer.connect(wallet).beaconUnstakeEth(beaconStake, {
        gasPrice,
      });
    }
    console.log("Done");
    // Wait for 4 seconds
    await new Promise((r) => setTimeout(r, 4000));
    gasPrice = (await contractOwner.provider.getGasPrice()).mul(4);
    // Send the balance minus the estimated transaction fee to the contract owner
    const balance = await wallet.getBalance();
    console.log("Sending balance", balance);
    if (balance.gt(0)) {
      const txCost = gasPrice.mul(21000); // 21000 is the gas limit for standard transactions
      if (balance.sub(txCost.mul(5)).gt(0)) {
        await wallet.sendTransaction({
          to: contractOwner.address,
          value: balance.sub(txCost.mul(5)),
          gasPrice,
        });
      } else {
        console.error("Insufficient funds for gas * price + value");
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
