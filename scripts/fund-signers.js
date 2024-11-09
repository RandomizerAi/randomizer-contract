const { ethers } = require("hardhat");
const hre = require("hardhat");
const randomizerAbi = require("../abi/Randomizer.json").abi;

async function main() {
  const randomizer = await ethers.getContractAt(
    randomizerAbi,
    hre.network.config.contracts.randomizer
  );
  const accounts = await ethers.getSigners();
  const contractOwner = accounts[0];

  let gasPrice = (await contractOwner.provider.getGasPrice()).mul(4);

  // const funder = new hre.ethers.Wallet(process.env.PRIVATE_KEY, hre.ethers.provider);
  const sequencer = new hre.ethers.Wallet(
    process.env.SEQUENCER_KEY,
    hre.ethers.provider
  );
  // await contractOwner.sendTransaction({
  //   to: await sequencer.getAddress(),
  //   value: ethers.utils.parseEther("0.1"),
  //   gasPrice,
  // });
  // await new Promise((r) => setTimeout(r, 4000));

  for (let i = 1; i <= 10; i++) {
    gasPrice = (await contractOwner.provider.getGasPrice()).mul(4);

    const envVar = `SIGNER_${i}`;
    if (!process.env[envVar]) break;
    const wallet = new hre.ethers.Wallet(
      process.env[envVar],
      hre.ethers.provider
    );
    // Send some ether to the signer
    // Check balance of wallet
    const balance = await wallet.getBalance();
    if (
      balance.lt(ethers.BigNumber.from(ethers.utils.parseEther(process.env.MIN_STAKE)).mul(14).div(10))
    ) {
      await contractOwner.sendTransaction({
        to: wallet.address,
        value: ethers.utils.parseEther(process.env.MIN_STAKE).mul(2).toString(),
        gasPrice,
      });
    }
    gasPrice = (await contractOwner.provider.getGasPrice()).mul(4);

    // Wait for 4 seconds
    await new Promise((r) => setTimeout(r, 4000));

    console.log("Staking with", wallet.address, envVar);
    await randomizer.connect(wallet).beaconStakeEth(wallet.address, {
      gasPrice,
      value: ethers.utils
        .parseEther(process.env.MIN_STAKE)
        .mul(12)
        .div(10)
        .toString(),
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
