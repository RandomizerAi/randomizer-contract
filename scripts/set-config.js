const { ethers } = require("hardhat");
const randomizerAbi = require('../abi/Randomizer.json').abi;

async function main() {
  const randomizer = await ethers.getContractAt(randomizerAbi, hre.network.config.contracts.randomizer);
  console.log("Setting config");

  // Some functions you can call:
  // await randomizer.setGasEstimate(0, 50000);
  // await randomizer.setConfigUint(5, String(750000000000));

  // for (let i = 56000; i <= 56107; i++) {
  //   const request = await randomizer.getRequest(i);
  //   if (request.result.startsWith("0x0000")) {
  //     console.log(request);
  //   }
  //   // timeout 1 second
  //   await new Promise(resolve => setTimeout(resolve, 250));
  // }

  
  console.log(await randomizer.getFeeStats(ethers.BigNumber.from(50)));

  // const request = await randomizer.getRequest(i);
  // console.log(await randomizer.configUint(5));
  // await randomizer.configUints(1, 10);
  // const beacons = await randomizer.beacons();
  // console.log(await randomizer.getRequest(123));
  // const beacon = await randomizer.beacon("0x...");
  // console.log(beacons);
  // console.log(await randomizer.beacons());

  // const request = await randomizer.getRequest(4165);
  // console.log(request);

  // console.log(await randomizer.configUints());

  // let totalAmount = ethers.BigNumber.from(0);
  // let startBlock = 15800053;
  // let endBlock = await ethers.provider.getBlockNumber();
  // const targetAddress = "0xe7d2f743f001e3b3abf20e16fc414c1b9349a4be";
  // while (startBlock < endBlock) {
  //   const filter = randomizer.filters.ClientDepositEth(targetAddress);
  //   const logs = await randomizer.queryFilter(filter, startBlock, Math.min(startBlock + 999, endBlock));
  //   logs.forEach(log => {
  //     console.log(log);
  //     console.log(log.args.amount.toString());
  //     totalAmount = totalAmount.add(log.args.amount);
  //   });
  //   startBlock += 1000;
  // }
  // console.log("Total amount deposited by address: ", ethers.utils.formatEther(totalAmount));

  // console.log(await randomizer.clientBalanceOf("0xe7d2f743f001e3b3abf20e16fc414c1b9349a4be"));

  // const tx = ethers.provider.getTransaction("0x71032eab6021f630ee95a536de6659478625e70d34ddce1d7aa71f23735651f5");

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });