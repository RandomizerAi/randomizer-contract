require("dotenv").config();
const { ethers, upgrades } = require('hardhat');
const vrfHelper = require("../test/helpers.js");
const delay = require('delay');
async function main() {
  const addresses = [];
  for (let i = 1; i <= 10; i++) {
    const envVar = `SIGNER_${i}`;
    if (process.env[envVar]) {
      const wallet = new ethers.Wallet(process.env[envVar]);
      addresses.push(wallet.address);
    }
  }


  const developer = new ethers.Wallet(process.env.PRIVATE_KEY);
  const VRF = await ethers.getContractFactory("VRF");
  const vrf = await VRF.deploy();
  const Internals = await ethers.getContractFactory("Internals");
  const lib = await Internals.deploy();
  console.log("Lib deployed to", lib.address);
  console.log("VRF deployed to", vrf.address);
  const Randomizer = await ethers.getContractFactory("RandomizerUpgradeable");
  let i = 0;
  let ecKeys = [];
  while (i < addresses.length) {
    const keys = vrfHelper.getVrfPublicKeys(process.env[`SIGNER_${i + 1}`]);
    ecKeys = ecKeys.concat(keys);
    i++;
  }
  console.log('Deploying RandomizerUpgradeable...');
  const randomizer = await upgrades.deployProxy(Randomizer, [[developer.address, developer.address, vrf.address, lib.address], ["500000000000000000", 20, 80, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3], addresses, ecKeys, [570000, 90000, 65000, 21000, 21000, 21000, 21000]], { unsafeAllowLinkedLibraries: true });
  await randomizer.deployed();
  console.log('RandomizerUpgradeable deployed to:', randomizer.address);

  // Fund signers
  const signers = await hre.ethers.getSigners();
  for (let i = 1; i <= 10; i++) {
    const envVar = `SIGNER_${i}`;
    if (process.env[envVar]) {
      const wallet = new ethers.Wallet(process.env[envVar]);
      // Send some ether to the signer
      await signers[0].sendTransaction({
        to: await wallet.getAddress(),
        value: ethers.utils.parseEther("5"),
      });
      await randomizer.connect(signers[0]).beaconStakeEth(await wallet.getAddress(), { value: ethers.utils.parseEther("1") });
    }
  }
  const wallet = new ethers.Wallet(process.env["PRIVATE_KEY"]);
  // Send some ether to the signer
  await signers[0].sendTransaction({
    to: await wallet.getAddress(),
    value: ethers.utils.parseEther("1"),
  });


  // Deploy callback
  const TestCallback = await hre.ethers.getContractFactory("TestCallback");
  const testCallback = await TestCallback.deploy(randomizer.address);

  await testCallback.deployed();

  console.log("testCallback deployed to:", testCallback.address);

  const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("0.1") });
  await deposit.wait();
  console.log("deposited 0.1 ETH to:", testCallback.address);

  await network.provider.send("evm_setAutomine", [false]);
  await network.provider.send("evm_setIntervalMining", [1000]);
  console.log("mining interval set to 1000");

  testCallback.on("Callback", (event) => {
    console.log(event);
    console.log("Callback", (Date.now()));
  });

  try {
    setInterval(async () => {
      const flip = await testCallback.makeRequest({ gasLimit: 300000 });
      const beforeFlip = Date.now();
      await flip.wait();
      const flippedAt = Date.now();
      console.log("Request made");
    }, 5000)
  } catch (e) {
    console.log(e);
  }


}

main();