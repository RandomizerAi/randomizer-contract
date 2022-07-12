// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const { Wallet } = require("zksync-web3");

async function main() {

  const syncProvider = new hre.ethers.providers.JsonRpcProvider("https://zksync2-testnet.zksync.dev");
  const signer = new Wallet(process.env.PRIVATE_KEY, syncProvider);

  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy


  const SoRandom = await hre.ethers.getContractFactory("SoRandom", signer);
  const oldSoRandom = SoRandom.attach("0x8eeBc95225849f643bF997D073089846C0b89ff1");
  const soRandom = SoRandom.attach("0x60c393A692492083d41fd080B7F7abc1B374Cdfd");

  const Proxy = await hre.ethers.getContractFactory("AddressProxy", signer);
  const proxy = Proxy.attach("0xC53E09AE52Cb41141a00ed261612e7820B0862E7");

  console.log("Old old balance", await oldSoRandom.clientBalanceOf("0xbCEee084Ff2AB66eC072D0A70E818622C728b5AD"));
  console.log("Old new balance", await soRandom.clientBalanceOf("0xbCEee084Ff2AB66eC072D0A70E818622C728b5AD"));

  const setSoRandom = await proxy.setSoRandom(soRandom.address);
  await setSoRandom.wait();

  const addClient = await proxy.addClient("0xbCEee084Ff2AB66eC072D0A70E818622C728b5AD");
  await addClient.wait();
  await (await proxy.removeClient("0x6E227B658cCda8D64fc21711f886545b0B57fAff")).wait();
  const newRandom = await proxy.setSoRandom(soRandom.address);
  await newRandom.wait();
  console.log("old", await proxy.oldSoRandom());
  console.log("new", await proxy.soRandom());

  const update = await proxy.clientWithdrawAndDeposit(oldSoRandom.address, "0xbCEee084Ff2AB66eC072D0A70E818622C728b5AD", ethers.utils.parseEther("0.0001"), { gasLimit: 5000000 });
  await update.wait();

  console.log("New old balance", await oldSoRandom.clientBalanceOf("0xbCEee084Ff2AB66eC072D0A70E818622C728b5AD"));
  console.log("New new balance", await soRandom.clientBalanceOf("0xbCEee084Ff2AB66eC072D0A70E818622C728b5AD"));
}


// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
