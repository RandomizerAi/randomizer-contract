// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

require("dotenv").config();

const { Wallet } = require("zksync-web3");
const ethers = require("ethers");
const { Deployer } = require("@matterlabs/hardhat-zksync-deploy");
const hre = require("hardhat");
const vrfHelper = require("../test/helpers.js");

async function main() {
  const addresses = [];
  for (let i = 1; i <= 10; i++) {
    const envVar = `SIGNER_${i}`;
    if (process.env[envVar]) {
      const wallet = new Wallet(process.env[envVar]);
      addresses.push(wallet.address);
    }
  }

  let i = 0;
  let ecKeys = [];
  while (i < addresses.length) {
    const keys = vrfHelper.getVrfPublicKeys(process.env[`SIGNER_${i + 1}`]);
    ecKeys = ecKeys.concat(keys);
    i++;
  }

  console.log("lengths", addresses.length, ecKeys.length);

  const wallet = new Wallet(process.env.PRIVATE_KEY);
  const deployer = new Deployer(hre, wallet);

  const artifact = await deployer.loadArtifact("RandomizerZk");

  const args = [[wallet.address, wallet.address], [ethers.utils.parseEther("0.0005"), 20, 300, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3], addresses, ecKeys, [570000, 90000, 65000, 21000, 21000, 21000, 21000]];
  // const args = [];
  console.log(args);
  const randomizer = await deployer.deploy(artifact, args);

  await randomizer.deployed();

  console.log("Randomizer deployed to:", randomizer.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
module.exports = main;