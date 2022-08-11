const hre = require("hardhat");

async function main() {

  const soRandomAddress = process.env.CONTRACT_ADDRESS_ARBITRUM;


  // const TestCallback = await hre.ethers.getContractFactory("TestCallback");
  // const testCallback = await TestCallback.deploy(soRandomAddress);

  const SoRandom = await hre.ethers.getContractFactory("SoRandom");
  const soRandom = SoRandom.attach(soRandomAddress);

  // // await testCallback.deployed();

  // console.log("testCallback deployed to:", testCallback.address);

  const deposit = await soRandom.clientDeposit("0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6", { value: ethers.utils.parseEther("0.1") });
  await deposit.wait();
  console.log("deposited");
  // console.log(await soRandom.clientBalanceOf("0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"));
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
