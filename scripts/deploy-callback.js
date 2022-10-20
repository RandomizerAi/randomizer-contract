const hre = require("hardhat");

async function main() {

  const randomizerAddress = process.env.CONTRACT_ADDRESS_ARBITRUM;


  const TestCallback = await hre.ethers.getContractFactory("TestCallback");
  const testCallback = await TestCallback.deploy(randomizerAddress);

  const Randomizer = await hre.ethers.getContractFactory("Randomizer");
  const randomizer = Randomizer.attach(randomizerAddress);

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
