const { ethers } = require("hardhat");
const randomizerAbi = require('../abi/Randomizer.json').abi;
const vrfHelper = require("../test/helpers.js");

async function main() {
  const randomizer = await ethers.getContractAt(randomizerAbi, process.env.CONTRACT_ADDRESS);
  let addresses = [];
  for (let i = 1; i <= 10; i++) {
    const envVar = `SIGNER_${i}`;
    if (process.env[envVar]) {
      const wallet = new ethers.Wallet(process.env[envVar]);
      addresses.push(await wallet.getAddress());
    }
  }
  let i = 1;
  while (i <= addresses.length) {
    // const randomKey = ethers.utils.hexlify(ethers.utils.randomBytes(32));
    // Turn randomKey into 0x hex string

    console.log(`Signer ${i} prover key: ${process.env[`PROVER_${i}`]}`);
    const keys = vrfHelper.getVrfPublicKeys(process.env[`PROVER_${i}`]);

    try {
      console.log("Registering", addresses[i - 1]);
      await randomizer.registerBeacon(addresses[i - 1], [keys[0], keys[1]], { gasLimit: 10000000 });
    } catch (e) {
      console.log("Failed", addresses[i - 1]);
      console.log(e);
    }
    i++;
  }
  console.log("Done");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });