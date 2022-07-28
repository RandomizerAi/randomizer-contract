const { ethers } = require("hardhat");

async function main() {
  const SoRandom = await ethers.getContractFactory("SoRandomUpgradeable");
  const soRandom = SoRandom.attach(process.env.CONTRACT_ADDRESS_ARBITRUM);
  console.log("Getting result");
  console.log(await soRandom.getResult(23));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });