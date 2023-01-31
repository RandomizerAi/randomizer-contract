require("dotenv").config();
const { ethers, upgrades } = require('hardhat');
const vrfHelper = require("../test/helpers.js");
const { deployDiamond } = require('../scripts/deploy.js')
const randomizerAbi = require('../abi/Randomizer.json').abi;

async function main() {
  const addresses = [];
  for (let i = 1; i <= 10; i++) {
    const envVar = `SIGNER_${i}`;
    if (process.env[envVar]) {
      const wallet = new ethers.Wallet(process.env[envVar]);
      addresses.push(wallet.address);
    }
  }

  const sequencer = new ethers.Wallet(process.env.SEQUENCER_KEY);
  let i = 0;
  let ecKeys = [];
  while (i < addresses.length) {
    // const randomKey = ethers.utils.hexlify(ethers.utils.randomBytes(32));
    // Turn randomKey into 0x hex string

    console.log(`Signer ${i} prover key: ${process.env[`PROVER_${i + 1}`]}`);
    const keys = vrfHelper.getVrfPublicKeys(process.env[`PROVER_${i + 1}`]);
    ecKeys = ecKeys.concat(keys);
    i++;
  }
  console.log('Deploying Randomizer...');

  const env = process.env;

  const diamondAddress = await deployDiamond([sequencer.address, env.TREASURY_ADDRESS, [ethers.utils.parseEther(env.MIN_STAKE), env.EXP_BLOCKS, env.EXP_SECONDS, env.REQ_MIN_GAS, env.REQ_MAX_GAS, ethers.utils.parseEther(env.BEACON_FEE), env.MAX_STRIKES, env.MAX_CONSEC_SUBMISSIONS, env.MIN_CONFIRMATIONS, env.MAX_CONFIRMATIONS], addresses, ecKeys, [env.SUBMIT_GAS_OFFSET, env.FINAL_SUBMIT_OFFSET, env.RENEW_OFFSET, env.TOTAL_SUBMIT, env.GAS_PER_BEACON]], true)

  const randomizer = await ethers.getContractAt(randomizerAbi, diamondAddress);
  console.log('Randomizer Diamond deployed to:', randomizer.address);
}

main();