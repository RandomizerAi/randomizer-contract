
const hre = require("hardhat");

async function main() {
  const TestCallback = await hre.ethers.getContractFactory("TestCallback");
  const testCallback = TestCallback.attach(process.env.TESTCALLBACK_ADDRESS_ARBITRUM);
  const flip = await testCallback.makeRequest();
  const beforeFlip = Date.now();
  await flip.wait();
  const flippedAt = Date.now();
  console.log("Request made", flippedAt - beforeFlip);

  console.log(beforeFlip);

  testCallback.on("Callback", (event) => {
    console.log(event);
    console.log("Callback", (Date.now() - flippedAt));
  });
}

main();