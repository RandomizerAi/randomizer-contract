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

  const wallet = new Wallet(process.env.PRIVATE_KEY);
  const deployer = new Deployer(hre, wallet);

  const vaultArt = await deployer.loadArtifact("SoRandom");
  const proxyArt = await deployer.loadArtifact("AddressProxy");
  const clientArt = await deployer.loadArtifact("CoinFlip");

  const signers = ["0x72453c6f8Eba18840029BF3E65573a474Ce023e4", "0xf716b2dc52a17fA64421F92db5b326a4325Bcd71", "0x9381e48736a09FfFD7a91245Ac56F9eD53b011B3", "0xD52F3B928c39C3CC286fb70228E16836cCb6958A"];
  const args = ["0xfF8f3dE0eDb4A538c4eAD497dB45F47766459947", 99, ethers.utils.parseUnits("0.01"), 50, 3600, ethers.utils.parseUnits("10000", "gwei"), signers];
  const vault = await deployer.deploy(vaultArt, args);
  await vault.deployed();

  const proxy = await deployer.deploy(proxyArt, [vault.address]);
  await proxy.deployed();

  const client = await deployer.deploy(clientArt, [proxy.address]);
  await client.deployed();

  console.log("vault", vault.address, "proxy", proxy.address, "client", client.address);

  const deposit = await vault.clientDeposit(client.address, { value: ethers.utils.parseEther("0.0001") });
  await deposit.wait();

  console.log("deposit", ethers.BigNumber.from(await vault.clientBalanceOf(client.address)).toString());

  const addClient = await proxy.addClient(client.address);
  await addClient.wait();

  const vault2 = await deployer.deploy(vaultArt, args);
  await vault2.deployed();

  const setSoRandom = await proxy.setSoRandom(vault2.address);
  await setSoRandom.wait();

  const clientsWithdrawAndDeposit = await proxy.clientsWithdrawAndDeposit();
  await clientsWithdrawAndDeposit.wait();

  const withdraw = await proxy.clientsWithdrawAndDeposit({ gasLimit: 1000000 });
  await withdraw.wait();
  console.log("old balance", ethers.BigNumber.from(await vault.clientBalanceOf(client.address)).toString());
  console.log("new balance", ethers.BigNumber.from(await vault2.clientBalanceOf(client.address)).toString());

  console.log("new contract", vault2.address);

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