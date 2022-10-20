const { ethers } = require("hardhat");

async function main() {
  const Randomizer = await ethers.getContractFactory("RandomizerUpgradeable");
  const randomizer = Randomizer.attach(process.env.CONTRACT_ADDRESS_ARBITRUM);
  console.log("Getting result");
  console.log((await randomizer.getRequest(23))).result;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });