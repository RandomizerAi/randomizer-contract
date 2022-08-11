const { ethers, upgrades } = require("hardhat");

async function main() {
  const Randomizer = await ethers.getContractFactory("RandomizerUpgradeable");
  await upgrades.upgradeProxy(process.env.CONTRACT_ADDRESS_ARBITRUM, Randomizer);
  console.log("Upgrade success");
}

main();