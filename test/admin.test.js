const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
// const hre = require("hardhat");

describe("Admin", function () {
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
    const ArbGas = await ethers.getContractFactory("ArbGasInfo");
    await network.provider.send("hardhat_setCode", [
      "0x000000000000000000000000000000000000006C",
      ArbGas.bytecode,
    ]);
    signers = await ethers.getSigners();
    const Randomizer = await ethers.getContractFactory("RandomizerUpgradeable");
    randomizer = await upgrades.deployProxy(Randomizer, [signers[0].address, signers[0].address, 3, "500000000000000000", 20, 900, 50000, 2000000, ethers.utils.parseEther("0.00005"), [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address]]);
    await randomizer.deployed();
  });

  it("be able to set settable variables", async function () {
    try {
      await randomizer.setBeaconFee(ethers.utils.parseEther("0.1"));
      await randomizer.setMinStakeEth(ethers.utils.parseEther("0.1"));
      await randomizer.setExpirationBlocks(30);
      await randomizer.setExpirationSeconds(30);
      await randomizer.setMaxStrikes(30);
      await randomizer.setRequestMinGasLimit(30);
      await randomizer.setRequestMaxGasLimit(30);
    } catch (e) {
      expect(true).to.be.false(e);
    }
  });

  it("return ArbGasInfo data", async function () {
    const ArbGasInfo = await ethers.getContractFactory("ArbGasInfo");
    const arbGasInfo = await ArbGasInfo.deploy();
    await arbGasInfo.deployed();
    const gasInfo = await arbGasInfo.getPricesInWei();
    expect(gasInfo.length).to.equal(6);
  });
});
