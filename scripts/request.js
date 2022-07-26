
const hre = require("hardhat");

async function main() {
  const TestCallback = await hre.ethers.getContractFactory("TestCallback");
  const testCallback = TestCallback.attach(process.env.TESTCALLBACK_ADDRESS_ARBITRUM);
  await testCallback.makeRequest();
}


// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
