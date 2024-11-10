const hre = require("hardhat");
const randomizerAbi = require('../abi/Randomizer.json').abi;

async function main() {
  const randomizerAddress = hre.network.config.contracts.randomizer;
  const randomizer = await ethers.getContractAt(randomizerAbi, randomizerAddress);
  const funder = (await hre.ethers.getSigners())[0];
  console.log("Funding with", funder.address)
  // get gas price and multiply by 4
  let gasPrice = (await randomizer.provider.getGasPrice()).mul(4);
  const deposit = await randomizer.clientDeposit(hre.network.config.contracts.testCallback, { value: ethers.utils.parseEther("0.01"), gasPrice });
  await deposit.wait();
  console.log("deposited 0.5 ETH to:", hre.network.config.contracts.testCallback);
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
