const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Proxy", function () {
  let signers;
  let soRandom;
  let coinFlip;
  let proxy;
  beforeEach(async function () {
    signers = await ethers.getSigners();
    const SoRandom = await ethers.getContractFactory("SoRandom", signers[0]);
    soRandom = await SoRandom.deploy(ethers.constants.AddressZero, 3, ethers.utils.parseEther("0.00005"), 20, 900, ethers.utils.parseEther("0.00005"), [signers[0].address]);
    const Proxy = await ethers.getContractFactory("AddressProxy", signers[0]);
    proxy = await Proxy.deploy(soRandom.address);
    const CoinFlip = await ethers.getContractFactory("CoinFlip", signers[0]);
    coinFlip = await CoinFlip.deploy(proxy.address);
    await proxy.addClient(coinFlip.address);
  });

  it("Should withdraw from old contract through client and deposit in new one", async function () {
    await soRandom.clientDeposit(coinFlip.address, { value: ethers.utils.parseEther("0.1") });
    const SoRandom = await ethers.getContractFactory("SoRandom", signers[0]);
    const soRandom2 = await SoRandom.deploy(ethers.constants.AddressZero, 3, ethers.utils.parseEther("0.00005"), 20, 900, ethers.utils.parseEther("0.00005"), [signers[0].address]);
    await proxy.setSoRandom(soRandom2.address);
    await proxy.clientsWithdrawAndDeposit();
    expect(await proxy.oldSoRandom()).to.equal(soRandom.address);
    expect(await proxy.soRandom()).to.equal(soRandom2.address);
    const oldBalance = await soRandom.clientBalanceOf(coinFlip.address);
    const newBalance = await soRandom2.clientBalanceOf(coinFlip.address);
    expect(oldBalance).to.equal(ethers.utils.parseEther("0"));
    expect(newBalance).to.equal(ethers.utils.parseEther("0.1"));
  });
});