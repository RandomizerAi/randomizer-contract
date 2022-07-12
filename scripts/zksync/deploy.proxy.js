// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

require("dotenv").config();

const { Wallet } = require("zksync-web3");
const { Deployer } = require("@matterlabs/hardhat-zksync-deploy");
const ethers = require("ethers");

const hre = require("hardhat");

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  // const ArbGasPlaceholder = await hre.ethers.getContractFactory("ArbGasInfo");
  // const arbGasPlaceholder = await ArbGasPlaceholder.deploy();

  const wallet = new Wallet(process.env.PRIVATE_KEY);
  const deployer = new Deployer(hre, wallet);

  const artifact = await deployer.loadArtifact("AddressProxy");

  const args = ["0x8eeBc95225849f643bF997D073089846C0b89ff1"];

  const proxy = await deployer.deploy(artifact, args);

  // const localSigners = ["0x38eb3f0ab46b4dbd68414a9c1528ebd5e5715a84", "0x70997970c51812dc3a010c7d01b50e0d17dc79c8", "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc", "0x90f79bf6eb2c4f870365e785982e1f101e93b906", "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65", "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc"];
  // const SoRandom = await hre.ethers.getContractFactory("SoRandom");
  // const soRandom = await SoRandom.deploy("0x70997970c51812dc3a010c7d01b50e0d17dc79c8", "0x000000000000000000000000000000000000006C", 3, 50, "50000000000000000", "0", signers);
  // const soRandom = await SoRandom.deploy();


  await proxy.deployed();

  console.log("AddressProxy deployed to:", proxy.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });