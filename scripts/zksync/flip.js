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
  const coinFlip = CoinFlip.attach("0x41ccFc78802abb5cFfcaF2F5067B0085aDEA1BB0");


  const flip = await coinFlip.flip();
  await flip.wait();

  console.log("flip");
}


// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
