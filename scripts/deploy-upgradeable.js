require("dotenv").config();
const { ethers, upgrades } = require('hardhat');
const vrfHelper = require("../test/helpers.js");

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
  const Randomizer = await ethers.getContractFactory("RandomizerUpgradeable", {
    libraries: {
      Internals: lib.address,
      VRF: vrf.address
    },
  });
  let i = 0;
  let ecKeys = [];
  while (i < addresses.length) {
    const keys = vrfHelper.getVrfPublicKeys(process.env[`SIGNER_${i + 1}`]);
    ecKeys = ecKeys.concat(keys);
    i++;
  }
  console.log('Deploying RandomizerUpgradeable...');
  const randomizer = await upgrades.deployProxy(Randomizer, [[developer.address, developer.address], ["500000000000000000", 20, 80, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3], addresses, ecKeys, [570000, 90000, 65000, 21000, 21000, 21000, 21000]], { unsafeAllowLinkedLibraries: true });
  await randomizer.deployed();
  console.log('RandomizerUpgradeable deployed to:', randomizer.address);
}

main();