const hre = require("hardhat");
const { Wallet, Contract, Provider } = require("zksync-web3");
const { Deployer } = require("@matterlabs/hardhat-zksync-deploy");

async function main() {
  const provider = new Provider(hre.userConfig.zkSyncDeploy?.zkSyncNetwork);
  const wallet = new Wallet(process.env.PRIVATE_KEY, provider);
  const deployer = new Deployer(hre, wallet);

  const TestCallback = await deployer.loadArtifact("TestCallback");
  const testCallback = new Contract(process.env.TESTCALLBACK_ZKSYNC, TestCallback.abi, wallet);
  const flip = await testCallback.makeRequest();
  const beforeFlip = Date.now();
  await flip.wait();
  const flippedAt = Date.now();
  console.log("Request made", flippedAt - beforeFlip);

  console.log(beforeFlip);

  testCallback.on("Callback", (event) => {
    console.log(event);
    console.log("Callback", (Date.now() - flippedAt));
  });

}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
