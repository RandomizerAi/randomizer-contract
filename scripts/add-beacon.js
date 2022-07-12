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
  const soRandomAddress = "0xD4c324FBe09E978f0EE2a5aa4084FDDCB7F8CFBF";
  const SoRandom = await hre.ethers.getContractFactory("SoRandom");
  const soRandom = SoRandom.attach(soRandomAddress);

  // await testCallback.deployed();

  const deposit = await soRandom.registerBeacon("0x38eb3f0ab46b4dbd68414a9c1528ebd5e5715a84");
  await deposit.wait();
  console.log("registered");

}


// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
