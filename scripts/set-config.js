const { ethers } = require("hardhat");
const randomizerAbi = require('../abi/Randomizer.json').abi;

async function main() {
  const randomizer = await ethers.getContractAt(randomizerAbi, process.env.CONTRACT_ADDRESS);
  console.log("Setting config");

  // Some functions you can call:
  // await randomizer.setGasEstimate(0, 50000);
  // await randomizer.setConfigUint(1, 10);
  // await randomizer.configUints(1, 10);
  // const beacons = await randomizer.beacons();
  // console.log(await randomizer.getRequest(123));
  // const beacon = await randomizer.beacon("0x...");
  // console.log(beacons);
  console.log(await randomizer.beacons());

  // const request = await randomizer.getRequest(722);
  // console.log(request);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });