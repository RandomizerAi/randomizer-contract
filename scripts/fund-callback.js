const hre = require("hardhat");
const randomizerAbi = require('../abi/Randomizer.json').abi;

async function main() {
  const randomizerAddress = process.env.CONTRACT_ADDRESS;
  const randomizer = await ethers.getContractAt(randomizerAbi, randomizerAddress);
  const deposit = await randomizer.clientDeposit(process.env.TESTCALLBACK_ADDRESS, { value: ethers.utils.parseEther("0.5") });
  await deposit.wait();
  console.log("deposited 0.5 ETH to:", process.env.TESTCALLBACK_ADDRESS);
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
