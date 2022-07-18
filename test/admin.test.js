const { expect } = require("chai");
const { ethers } = require("hardhat");
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
    signers = await ethers.getSigners();
    const SoRandom = await ethers.getContractFactory("SoRandomWithStorageControls");
    soRandom = await SoRandom.deploy(ethers.constants.AddressZero, 3, "500000000000000000", 20, 900, ethers.utils.parseEther("0.00005"), [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address]);
    await soRandom.deployed();
  });

  it("should be able to set settable variables", async function () {
    try {
      await soRandom.setBeaconFee(ethers.utils.parseEther("0.1"));
      await soRandom.setMinStakeEth(ethers.utils.parseEther("0.1"));
      await soRandom.setExpirationBlocks(30);
      await soRandom.setExpirationSeconds(30);
      await soRandom.setMaxStrikes(30);
    } catch (e) {
      expect(true).to.be.false(e);
    }
  });

  it("should return ArbGasInfo data", async function () {
    const ArbGasInfo = await ethers.getContractFactory("ArbGasInfo");
    const arbGasInfo = await ArbGasInfo.deploy();
    await arbGasInfo.deployed();
    const gasInfo = await arbGasInfo.getPricesInWei();
    expect(gasInfo.length).to.equal(6);
  });
});
