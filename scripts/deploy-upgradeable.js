require("dotenv").config();
const { ethers, upgrades } = require('hardhat');

async function main() {
  const signers = [];
  for (let i = 1; i <= 10; i++) {
    const envVar = `SIGNER_${i}`;
    if (process.env[envVar]) {
      const wallet = new ethers.Wallet(process.env[envVar]);
      signers.push(wallet.address);
    }
  }

  const developer = new ethers.Wallet(process.env.PRIVATE_KEY);
  const SoRandom = await ethers.getContractFactory('SoRandomUpgradeable');
  console.log('Deploying SoRandomUpgradeable...');
  const soRandom = await upgrades.deployProxy(SoRandom, [developer.address, 3, ethers.utils.parseEther("0.01"), 50, 3600, 1000, 3000000, ethers.utils.parseUnits("20000", "gwei"), signers]);
  await soRandom.deployed();
  console.log('SoRandomUpgradeable deployed to:', soRandom.address);
}

main();