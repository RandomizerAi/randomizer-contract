const hre = require("hardhat");

async function main() {

  const randomizerAddress = process.env.CONTRACT_ADDRESS_ARBITRUM;


  // const TestCallback = await hre.ethers.getContractFactory("TestCallback");
  // const testCallback = await TestCallback.deploy(randomizerAddress);

  const Randomizer = await hre.ethers.getContractFactory("Randomizer");
  const randomizer = Randomizer.attach(randomizerAddress);

  // // await testCallback.deployed();

  // console.log("testCallback deployed to:", testCallback.address);

  const deposit = await randomizer.clientDeposit("0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6", { value: ethers.utils.parseEther("0.1") });
  await deposit.wait();
  console.log("deposited");
  // console.log(await randomizer.clientBalanceOf("0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"));
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
