// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const { Wallet } = require("zksync-web3");
const { Deployer } = require("@matterlabs/hardhat-zksync-deploy");


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

  // const deployer = new Deployer(hre, signer);

  // const artifact = await deployer.loadArtifact("ZKoin");
  // const zkoin = await deployer.deploy(artifact, []);
  const CoinFlip = await hre.ethers.getContractFactory("ZKoin", signer);
  // const zkoin = CoinFlip.attach("0x4549801352ede7FA0c8F50385333CA664f6eAcd4");

  const zkoin = await CoinFlip.deploy();
  await zkoin.deployed();


  // // await zkoin.deployed();
  // const flip = await zkoin.vrfCoin(true, { value: ethers.utils.parseEther("0") });
  // const rc = await flip.wait();
  // for (const event of rc.logs) {
  //   console.log(zkoin.interface.parseLog(event));
  // }
  // console.log("flip");
}


// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
