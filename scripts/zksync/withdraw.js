// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const { Wallet } = require("zksync-web3");

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const syncProvider = new hre.ethers.providers.JsonRpcProvider("https://zksync2-testnet.zksync.dev");
  const signer = new Wallet(process.env.PRIVATE_KEY, syncProvider);

  const CoinFlip = await hre.ethers.getContractFactory("CoinFlip", signer);
  const coinFlip = CoinFlip.attach("0x1E5C999eE60A1572b840679d6588dee2C817746A");

  const Proxy = await hre.ethers.getContractFactory("AddressProxy", signer);
  const proxy = Proxy.attach("0x199B43A87466889B4ccB5Ae15192E30a21A820ce");


  const soRandomAddress = "0x8eeBc95225849f643bF997D073089846C0b89ff1";
  const SoRandom = await hre.ethers.getContractFactory("SoRandom", signer);
  const soRandom = SoRandom.attach(soRandomAddress);

  console.log("balance", await soRandom.clientBalanceOf(coinFlip.address));


  const tx = await proxy.clientWithdraw(soRandom.address, coinFlip.address, ethers.utils.parseEther("0.0001"));
  await tx.wait();

  // console.log(await proxy.soRandom());

  // const deposit = await coinFlip.soRandomWithdraw(ethers.utils.parseEther("0.00001"));
  // const tx = await deposit.wait();
  // const withdraw = await soRandom.clientWithdrawTo(signer.address, ethers.utils.parseEther("0.0001"));
  // await withdraw.wait();
  // console.log(withdraw);
  // console.log("withdrawn");

  console.log("New deposited balance:", await soRandom.clientBalanceOf(coinFlip.address));
}


// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
