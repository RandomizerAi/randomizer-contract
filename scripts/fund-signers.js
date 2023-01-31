const { ethers } = require("hardhat");
const hre = require("hardhat");
const randomizerAbi = require('../abi/Randomizer.json').abi;

async function main() {
  const randomizer = await ethers.getContractAt(randomizerAbi, process.env.CONTRACT_ADDRESS);
  const accounts = await ethers.getSigners()
  const contractOwner = accounts[0]

  // const funder = new hre.ethers.Wallet(process.env.PRIVATE_KEY, hre.ethers.provider);
  const funder = new hre.ethers.Wallet(process.env.PRIVATE_KEY, hre.ethers.provider);
  const sequencer = new hre.ethers.Wallet(process.env.PRIVATE_KEY, hre.ethers.provider);
  await funder.sendTransaction({
    to: await sequencer.getAddress(),
    value: ethers.utils.parseEther("1"),
  });
  for (let i = 1; i <= 10; i++) {
    const envVar = `SIGNER_${i}`;
    if (process.env[envVar]) {
      const wallet = new hre.ethers.Wallet(process.env[envVar], hre.ethers.provider);
      // Send some ether to the signer
      await contractOwner.sendTransaction({
        to: await wallet.getAddress(),
        value: ethers.utils.parseEther(process.env.MIN_STAKE).mul(5).toString(),
      });
      await randomizer.connect(wallet).beaconStakeEth(wallet.address, { value: ethers.utils.parseEther(process.env.MIN_STAKE).mul(2).toString() });
    }
  }
}



main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });