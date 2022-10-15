const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const vrfHelper = require("./helpers.js");
describe("Upgrades", function () {

  beforeEach(async function () {
    const ArbGas = await ethers.getContractFactory("ArbGasInfo");
    await network.provider.send("hardhat_setCode", [
      "0x000000000000000000000000000000000000006C",
      ArbGas.bytecode,
    ]);
  });
  it('deploys and upgrades while keeping storage consistent', async () => {
    const signers = await ethers.getSigners();
    const VRF = await ethers.getContractFactory("VRF");
    const vrf = await VRF.deploy();
    const Internals = await ethers.getContractFactory("Internals");
    const lib = await Internals.deploy();
    const Randomizer = await ethers.getContractFactory("RandomizerUpgradeable", {
      //      libraries: {
      //        Internals: lib.address,
      //        VRF: vrf.address
      //      },
    });

    const RandomizerV2 = await ethers.getContractFactory("RandomizerUpgradeableV2", {
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

    const randomizer = await upgrades.deployProxy(Randomizer, [[signers[0].address, signers[0].address, vrf.address, lib.address], ["500000000000000000", 20, 900, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3], [signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address, signers[6].address], ecKeys, [570000, 90000, 65000, 21000, 21000, 21000]], { unsafeAllow: ["external-library-linking"] });

    // It should not yet have newFunction()
    try {
      await randomizer.newFunction();
      expect(true).to.be.false;
    } catch {
    }
    await randomizer.setConfigUint(0, ethers.utils.parseUnits("40000", "gwei"));


    const upgraded = await upgrades.upgradeProxy(randomizer.address, RandomizerV2, { unsafeAllow: ["external-library-linking"] });
    const value = await upgraded.newFunction();
    expect(value.toString()).to.equal('Hello World');
    expect((await upgraded.getBeacons()).length).to.equal(7);

    // Ensure that the updated state variables are not re-initialized to their default values
    expect(await upgraded.getConfigUint(0)).to.equal(ethers.utils.parseUnits("40000", "gwei"));

  });

  it('deploys V2 directly then upgrades to V1', async () => {
    const VRF = await ethers.getContractFactory("VRF");
    const vrf = await VRF.deploy();
    const Internals = await ethers.getContractFactory("Internals");
    const lib = await Internals.deploy();
    const signers = await ethers.getSigners();
    const Randomizer = await ethers.getContractFactory('RandomizerUpgradeableV2', {
      //      libraries: {
      //        Internals: lib.address,
      //        VRF: vrf.address
      //      },
    });
    const RandomizerV2 = await ethers.getContractFactory("RandomizerUpgradeable", {
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
    const randomizer = await upgrades.deployProxy(Randomizer, [[signers[0].address, signers[0].address, vrf.address, lib.address], ["500000000000000000", 20, 900, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3], [signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address, signers[6].address], ecKeys, [570000, 90000, 65000, 21000, 21000, 21000]], { unsafeAllow: ["external-library-linking"] });

    // It should have newFunction()
    try {
      await randomizer.newFunction();
    } catch {
      expect(true).to.be.false;
    }

    const upgraded = await upgrades.upgradeProxy(randomizer.address, RandomizerV2, { unsafeAllow: ["external-library-linking"] });
    // newFunction should be removed (since we started with V2 and are "upgrading" to V1)
    try {
      await upgraded.newFunction();
      expect(true).to.be.false;
    } catch {
    }
    expect((await upgraded.getBeacons()).length).to.equal(7);
  });
});