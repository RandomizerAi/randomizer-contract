require("dotenv").config();
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const ecvrf = require('vrf-ts-256')
const elliptic = require('elliptic');
const vrfHelper = require("./helpers.js");

// const hre = require("hardhat");

describe("VRF", function () {
  let randomizer;
  let signers;
  let vrf;
  beforeEach(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        // {
        //   forking: {
        //     jsonRpcUrl: "https://rinkeby.arbitrum.io/rpc",
        //     blockNumber: 10525577,
        //   },
        // },
      ],
    });
    signers = await ethers.getSigners();
    const VRF = await ethers.getContractFactory("VRF");
    vrf = await VRF.deploy();
    const Internals = await ethers.getContractFactory("Internals");
    const lib = await Internals.deploy();
    const Randomizer = await ethers.getContractFactory("RandomizerWithStorageControls", {
      //      libraries: {
      //        Internals: lib.address,
      //        VRF: vrf.address
      //      },
    });

    let ecKeys = [];
    let i = 0;
    while (i < 6) {
      const keys = vrfHelper.getVrfPublicKeys(signers[i].address);
      ecKeys = ecKeys.concat(keys);
      i++;
    }
    randomizer = await Randomizer.deploy([signers[6].address, signers[6].address, vrf.address, lib.address], ["500000000000000000", 20, 900, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3], [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address], ecKeys, [570000, 90000, 65000, 21000, 21000, 21000, 21000]);
  });

  it("generates proof for message and verifies client-side and on-chain", async function () {
    const keypair = ecvrf.keygen(process.env.PRIVATE_KEY);
    const message = ethers.utils.toUtf8Bytes('73616d706c65');
    const proof = ecvrf.prove(keypair.secret_key, message);
    const vKeys = [keypair.public_key.x.toString(), keypair.public_key.y.toString()];
    const vProof = [proof.decoded.gammaX.toString(), proof.decoded.gammaY.toString(), proof.decoded.c.toString(), proof.decoded.s.toString()];
    const verified = await vrf.verify(vKeys, vProof, message);
    const params = await vrf.computeFastVerifyParams(
      vKeys,
      vProof,
      message
    );
    const verify = await vrf.fastVerify(vKeys, vProof, message, params[0], params[1]);
    // Bytes to string
    // const gamma = await randomizer.gammaToHash(vProof[0], vProof[1]);
    // console.log(gamma);
    // console.log(verify);
  });
});
