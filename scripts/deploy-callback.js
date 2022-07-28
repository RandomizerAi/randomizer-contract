const hre = require("hardhat");

async function main() {

  const soRandomAddress = process.env.CONTRACT_ADDRESS_ARBITRUM;


  const TestCallback = await hre.ethers.getContractFactory("TestCallback");
  const testCallback = await TestCallback.deploy(soRandomAddress);

  const SoRandom = await hre.ethers.getContractFactory("SoRandom");
  const soRandom = SoRandom.attach(soRandomAddress);

  // await testCallback.deployed();

  console.log("testCallback deployed to:", testCallback.address);

  const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("0.001") });
  await deposit.wait();
  console.log("deposited");

}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
