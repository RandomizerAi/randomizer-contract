const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
// const hre = require("hardhat");
const vrfHelper = require("./helpers.js");

describe("Admin", function () {
  let signers;
  let randomizer;
  let vrf; beforeEach(async function () {
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
    const ArbGas = await ethers.getContractFactory("ArbGasInfo");
    await network.provider.send("hardhat_setCode", [
      "0x000000000000000000000000000000000000006C",
      ArbGas.bytecode,
    ]);
    signers = await ethers.getSigners();
    const VRF = await ethers.getContractFactory("VRF");
    vrf = await VRF.deploy();
    const Internals = await ethers.getContractFactory("Internals");
    const lib = await Internals.deploy();
    const Randomizer = await ethers.getContractFactory("RandomizerWithStorageControls", {
      libraries: {
        Internals: lib.address,
        VRF: vrf.address
      },
    });

    let ecKeys = [];
    let i = 0;
    while (i < 6) {
      const keys = vrfHelper.getVrfPublicKeys(signers[i].address);
      ecKeys = ecKeys.concat(keys);
      i++;
    }
    randomizer = await Randomizer.deploy([signers[0].address, signers[0].address], ["500000000000000000", 20, 900, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3], [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address], ecKeys, [570000, 90000, 65000, 21000, 21000, 21000, 21000]);
    await randomizer.deployed();
    vrfHelper.init(vrf, randomizer);
    for (const signer of signers) {
      await randomizer.beaconStakeEth(signer.address, { value: ethers.utils.parseEther("1") });
      if (signer.address == signers[5].address) break;
    }
  });

  it("set config and gas variables", async function () {
    await randomizer.setConfigUint(0, ethers.utils.parseEther("0.1"));
    await randomizer.setConfigUint(1, ethers.utils.parseEther("0.1"));
    await randomizer.setConfigUint(2, 30);
    await randomizer.setConfigUint(3, 30);
    await randomizer.setConfigUint(4, 30);
    await randomizer.setConfigUint(5, 30);
    await randomizer.setConfigUint(6, 30);

    await randomizer.setGasEstimate(1, 99999);
    expect((await randomizer.getGasEstimate(1)).toString()).to.equal("99999");

    expect((await randomizer.getConfigUint(0)).eq(ethers.utils.parseEther("0.1"))).to.be.true;

    await randomizer.setConfigUint(0, ethers.utils.parseEther("0.00005"));
    expect((await randomizer.getConfigUint(0)).eq(ethers.utils.parseEther("0.00005"))).to.be.true;

    try {
      await randomizer.connect(signers[1]).setSequencer(signers[1].address);
      expect(true).to.be.false;
    } catch (e) {
      expect(e).to.match(/SenderNotDeveloper/g);
    }

    await randomizer.setSequencer(signers[1].address);

    expect(await randomizer.sequencer()).to.equal(signers[1].address);

  });

  it("propose, cancel and accept developer", async function () {
    try {
      await randomizer.connect(signers[1]).proposeDeveloper(signers[1].address);
    } catch (e) {
      expect(e).to.match(/SenderNotDeveloper/g);
    }
    await randomizer.connect(signers[0]).proposeDeveloper(signers[1].address);
    expect(await randomizer.proposedDeveloper()).to.equal(signers[1].address);

    try {
      await randomizer.connect(signers[2]).cancelProposeDeveloper();
    } catch (e) {
      expect(e).to.match(/SenderNotDeveloperOrProposed/g);
    }

    await randomizer.cancelProposeDeveloper();
    expect(await randomizer.proposedDeveloper()).to.equal(ethers.constants.AddressZero);
    await randomizer.connect(signers[0]).proposeDeveloper(signers[1].address);

    try {
      await randomizer.connect(signers[2]).acceptDeveloper();
    } catch (e) {
      expect(e).to.match(/SenderNotProposedDeveloper/g);
    }

    await randomizer.connect(signers[1]).acceptDeveloper();

    expect(await randomizer.developer()).to.equal(signers[1].address);
    expect(await randomizer.proposedDeveloper()).to.equal(ethers.constants.AddressZero);

  });


  it("return ArbGasInfo data", async function () {
    const ArbGasInfo = await ethers.getContractFactory("ArbGasInfo");
    const arbGasInfo = await ArbGasInfo.deploy();
    await arbGasInfo.deployed();
    const gasInfo = await arbGasInfo.getPricesInWei();
    expect(gasInfo.length).to.equal(6);
  });
});
