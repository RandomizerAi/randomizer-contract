const { ethers, upgrades } = require("hardhat");

async function main() {
  const SoRandom = await ethers.getContractFactory("SoRandomUpgradeable");
  await upgrades.upgradeProxy(process.env.CONTRACT_ADDRESS_ARBITRUM, SoRandom);
  console.log("Upgrade success");
}

main();