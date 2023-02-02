const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
// const hre = require("hardhat");
const vrfHelper = require("./helpers.js");
const { deployDiamond } = require('../scripts/deploy.js')
const randomizerAbi = require("../abi/Randomizer.json").abi;
describe("Admin", function () {
  let signers;
  let randomizer;
  let diamondAddress;

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
    const ArbGas = await ethers.getContractFactory("contracts/test/ArbGasInfo.sol:ArbGasInfo");
    await network.provider.send("hardhat_setCode", [
      "0x000000000000000000000000000000000000006C",
      ArbGas.bytecode,
    ]);
    const ArbSys = await ethers.getContractFactory("contracts/test/ArbSys.sol:ArbSys");
    await network.provider.send("hardhat_setCode", [
      "0x0000000000000000000000000000000000000064",
      ArbSys.bytecode,
    ]);
    signers = await ethers.getSigners();

    let ecKeys = [];
    let i = 0;
    while (i < 6) {
      const keys = vrfHelper.getVrfPublicKeys(signers[i].address);
      ecKeys = ecKeys.concat(keys);
      i++;
    }
    diamondAddress = await deployDiamond([signers[0].address, signers[0].address, ["500000000000000000", 20, 900, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3], [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address], ecKeys, [570000, 90000, 65000, 21000, 21000, 21000, 21000]])

    randomizer = await ethers.getContractAt(randomizerAbi, diamondAddress);
    vrfHelper.init(randomizer);
    for (const signer of signers) {
      await randomizer.beaconStakeEth(signer.address, { value: ethers.utils.parseEther("1") });
      if (signer.address == signers[5].address) break;
    }
  });

  it("set config and gas variables", async function () {
    this.timeout(100000);
    await randomizer.setConfigUint(0, ethers.utils.parseEther("0.1"));
    await randomizer.setConfigUint(1, ethers.utils.parseEther("0.1"));
    await randomizer.setConfigUint(2, 30);
    await randomizer.setConfigUint(3, 30);
    await randomizer.setConfigUint(4, 30);
    await randomizer.setConfigUint(5, 30);
    await randomizer.setConfigUint(6, 30);

    await randomizer.setGasEstimate(1, 99999);
    expect((await randomizer.gasEstimate(1)).toString()).to.equal("99999");

    expect((await randomizer.configUint(0)).eq(ethers.utils.parseEther("0.1"))).to.be.true;

    await randomizer.setConfigUint(0, ethers.utils.parseEther("0.00005"));
    expect((await randomizer.configUint(0)).eq(ethers.utils.parseEther("0.00005"))).to.be.true;

  });

  it("propose, cancel and accept ownership", async function () {
    try {
      await randomizer.connect(signers[1]).cancelProposeOwnership();
    } catch (e) {
      expect(e.message).to.match(/Unauthorized/g);
    }
    try {
      await randomizer.connect(signers[1]).proposeOwnership(signers[1].address);
    } catch (e) {
      expect(e).to.match(/Unauthorized/g);
    }
    await randomizer.connect(signers[0]).proposeOwnership(signers[1].address);
    expect(await randomizer.proposedOwner()).to.equal(signers[1].address);

    try {
      await randomizer.connect(signers[2]).cancelProposeOwnership();
    } catch (e) {
      expect(e).to.match(/Unauthorized/g);
    }


    await randomizer.cancelProposeOwnership();
    expect(await randomizer.proposedOwner()).to.equal(ethers.constants.AddressZero);

    await randomizer.connect(signers[0]).proposeOwnership(signers[1].address);

    try {
      await randomizer.connect(signers[2]).acceptOwnership();
    } catch (e) {
      expect(e).to.match(/Unauthorized/g);
    }

    await randomizer.connect(signers[1]).acceptOwnership();

    expect(await randomizer.owner()).to.equal(signers[1].address);
    expect(await randomizer.proposedOwner()).to.equal(ethers.constants.AddressZero);
  });

  it("propose, cancel and accept sequencer", async function () {
    try {
      await randomizer.connect(signers[1]).cancelProposeSequencer();
    } catch (e) {
      expect(e).to.match(/Unauthorized/g);
    }
    try {
      await randomizer.connect(signers[1]).proposeSequencer(signers[1].address);
    } catch (e) {
      expect(e).to.match(/Unauthorized/g);
    }
    await randomizer.connect(signers[0]).proposeSequencer(signers[1].address);
    expect(await randomizer.proposedSequencer()).to.equal(signers[1].address);

    try {
      await randomizer.connect(signers[2]).cancelProposeSequencer();
    } catch (e) {
      expect(e).to.match(/Unauthorized/g);
    }


    await randomizer.cancelProposeSequencer();
    expect(await randomizer.proposedSequencer()).to.equal(ethers.constants.AddressZero);

    await randomizer.connect(signers[0]).proposeSequencer(signers[1].address);

    try {
      await randomizer.connect(signers[2]).acceptSequencer();
    } catch (e) {
      expect(e).to.match(/Unauthorized/g);
    }

    await randomizer.connect(signers[1]).acceptSequencer();

    expect(await randomizer.sequencer()).to.equal(signers[1].address);
    expect(await randomizer.proposedSequencer()).to.equal(ethers.constants.AddressZero);
  });


  it("sets and retrieves treasury", async function () {
    try {
      await randomizer.connect(signers[1]).setTreasury(signers[1].address);
    } catch (e) {
      expect(e).to.match(/Unauthorized/g);
    }
    await randomizer.setTreasury(signers[1].address);
    expect(await randomizer.treasury()).to.equal(signers[1].address);
  });



  it("return ArbGasInfo data", async function () {
    const ArbGasInfo = await ethers.getContractFactory("contracts/test/ArbGasInfo.sol:ArbGasInfo");
    const arbGasInfo = await ArbGasInfo.deploy();
    await arbGasInfo.deployed();
    const gasInfo = await arbGasInfo.getPricesInWei();
    expect(gasInfo.length).to.equal(6);
    const minGas = await arbGasInfo.getMinimumGasPrice();
    expect(minGas).to.not.be.undefined;
  });
});
