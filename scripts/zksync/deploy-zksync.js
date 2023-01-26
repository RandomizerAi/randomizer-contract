require("dotenv").config();
const { ethers } = require('hardhat');
const vrfHelper = require("../../test/helpers.js");
const { deployDiamond } = require('./diamond-zksync.js')
const { Wallet } = require("zksync-web3");
const hre = require("hardhat");
const randomizerAbi = require("../../abi/Randomizer.json");

async function main() {
  const addresses = [];
  for (let i = 1; i <= 10; i++) {
    const envVar = `SIGNER_${i}`;
    if (process.env[envVar]) {
      const wallet = new Wallet(process.env[envVar]);
      addresses.push(wallet.address);
    }
  }

  const developer = new Wallet(process.env.PRIVATE_KEY);
  let i = 0;
  let ecKeys = [];
  while (i < addresses.length) {
    const keys = vrfHelper.getVrfPublicKeys(process.env[`SIGNER_${i + 1}`]);
    ecKeys = ecKeys.concat(keys);
    i++;
  }
  console.log('Deploying Randomizer...');

  const diamondAddress = await deployDiamond([developer.address, developer.address, [ethers.utils.parseEther("0.0005"), 40, 600, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3], addresses, ecKeys, [50000, 90000, 65000, 200000, 220000, 275000, 160000]], hre)

  // const randomizer = await upgrades.deployProxy(Randomizer, [[developer.address, developer.address, vrf.address, lib.address], [ethers.utils.parseEther("0.005"), 40, 600, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3], addresses, ecKeys, [50000, 90000, 65000, 200000, 220000, 275000, 150000]]);
  // await randomizer.deployed();
  // const randomizer = await ethers.getContractAt(randomizerAbi, diamondAddress);
  console.log('Randomizer Diamond deployed to:', diamondAddress);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
// module.exports = main
module.main = main;