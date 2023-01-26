const hre = require("hardhat");
const { Wallet, Contract, Provider } = require("zksync-web3");
const { Deployer } = require("@matterlabs/hardhat-zksync-deploy");
const randomizerAbi = require("../../abi/Randomizer.json").abi;

async function main() {
  const provider = new Provider(hre.userConfig.zkSyncDeploy?.zkSyncNetwork);
  const wallet = new Wallet(process.env.PRIVATE_KEY, provider);
  const deployer = new Deployer(hre, wallet);
  const randomizerAddress = process.env.CONTRACT_ADDRESS_ZKSYNC;


  const TestCallback = await deployer.loadArtifact("TestCallback");
  const testCallback = await deployer.deploy(TestCallback, [randomizerAddress]);

  // const Randomizer = await deployer.loadArtifact('Randomizer')
  const randomizer = new Contract(randomizerAddress, randomizerAbi, wallet);

  await testCallback.deployed();

  console.log("testCallback deployed to:", testCallback.address);

  const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("0.05") });
  await deposit.wait();
  console.log("deposited 0.05 ETH to:", testCallback.address);
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
