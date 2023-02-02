
const hre = require("hardhat");
const randomizerAbi = require('../abi/Randomizer.json').abi;

async function main() {
  const randomizer = await ethers.getContractAt(randomizerAbi, process.env.CONTRACT_ADDRESS);

  const TestCallback = await hre.ethers.getContractFactory("TestCallback");
  const testCallback = TestCallback.attach(process.env.TESTCALLBACK_ADDRESS);
  const flip = await testCallback.makeRequestWith15Confirmations({ gasLimit: 1000000 });
  const beforeFlip = Date.now();
  const receipt = await flip.wait();
  const flippedAt = Date.now();
  console.log("Request made", flippedAt - beforeFlip);

  // Get all logs from receipt
  const logs = receipt.logs;
  console.log(logs);

  console.log(beforeFlip);

  let i = 0;
  // setInterval(async () => {
  //   const flip = await testCallback.makeRequestWith15Confirmations({ gasLimit: 1000000 });
  //   // Show flip event
  //   const receipt = await flip.wait();
  //   const logs = receipt.logs;
  //   console.log(logs);
  // }, 10000);

  testCallback.on("Callback", (id, value) => {
    console.log("Callback", (Date.now() - flippedAt));
    console.log("Event", id, value);
  });
}

main();