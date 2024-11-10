const hre = require("hardhat");
const randomizerAbi = require('../abi/Randomizer.json').abi;

async function main() {

  const randomizerAddress = hre.network.config.contracts.randomizer;


  const TestCallback = await hre.ethers.getContractFactory("TestCallback");
  const testCallback = await TestCallback.deploy(randomizerAddress);
  await testCallback.deployed();

  console.log("testCallback deployed to:", testCallback.address);

  const randomizer = await ethers.getContractAt(randomizerAbi, randomizerAddress);

  const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("0.1") });
  await deposit.wait();
  console.log("deposited ETH to:", testCallback.address);
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
