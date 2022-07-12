// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const TestCallback = await hre.ethers.getContractFactory("TestCallback");
  // const testCallback = await TestCallback.deploy(soRandomAddress);
  const testCallback = TestCallback.attach(process.env.TESTCALLBACK_ADDRESS_ARBITRUM);

  // const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("0.05") });

  await testCallback.makeRequest();

  // const pending = await soRandom.getBeaconPendingRequestIds("0x38eb3f0ab46b4dbd68414a9c1528ebd5e5715a84");
  // console.log("Pending", pending);

  // await tx.wait();
  // tx = await testCallback.makeRequest();
  // await tx.wait();
  // tx = await testCallback.makeRequest();
  // await tx.wait();
  // tx = await testCallback.makeRequest();
  // await tx.wait();
  // tx = await testCallback.makeRequest();
  // await tx.wait();

}


// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
