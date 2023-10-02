const hre = require("hardhat");
const randomizerAbi = require("../abi/Randomizer.json").abi;

async function main() {
  const randomizerAddress = hre.network.config.contracts.randomizer;
    const randomizer = await ethers.getContractAt(
    randomizerAbi,
    randomizerAddress
  );


  const deployer = (await hre.ethers.getSigners())[1];
  const TestCallback = await hre.ethers.getContractFactory(
    "TestCallbackProduction"
  );
  const gasPrice = (await randomizer.provider.getGasPrice()).mul(4);

  const testCallback = await TestCallback.connect(deployer).deploy(
    randomizerAddress,
    { gasPrice }
  );
  await testCallback.deployed();

  console.log("testCallback deployed to:", testCallback.address);


  const deposit = await randomizer.clientDeposit(testCallback.address, {
    gasPrice,
    value: ethers.utils.parseEther("0.01"),
  });
  await deposit.wait();
  console.log("deposited ETH to:", testCallback.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
