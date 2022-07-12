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

  const syncProvider = new hre.ethers.providers.JsonRpcProvider("https://zksync2-testnet.zksync.dev");
  const signer = new Wallet(process.env.PRIVATE_KEY, syncProvider);

  const Proxy = await hre.ethers.getContractFactory("AddressProxy", signer);
  const proxy = Proxy.attach("0x3F580FdDB12dc15F08D25bDFc68bd0F8571682f3");


  console.log(await proxy.soRandom());
  // await flip.wait();

  // const flip = await client.flip();
  // await flip.wait();

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });