const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
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
    const SoRandom = await ethers.getContractFactory('SoRandomUpgradeable');
    const SoRandomV2 = await ethers.getContractFactory("SoRandomUpgradeableV2");

    const soRandom = await upgrades.deployProxy(SoRandom, [signers[0].address, signers[0].address, 3, ethers.utils.parseUnits("0.1"), 50, 3600, 50000, 2000000, ethers.utils.parseUnits("20000", "gwei"), [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address]]);

    // It should not yet have newFunction()
    try {
      await soRandom.newFunction();
      expect(true).to.be.false;
    } catch {
    }

    await soRandom.connect(signers[0]).setBeaconFee(ethers.utils.parseUnits("40000", "gwei"));

    const upgraded = await upgrades.upgradeProxy(soRandom.address, SoRandomV2);
    const value = await upgraded.newFunction();
    expect(value.toString()).to.equal('Hello World');
    expect((await upgraded.getBeacons()).length).to.equal(7);

    // Ensure that the updated state variables are not re-initialized to their default values
    expect(await upgraded.beaconFee()).to.equal(ethers.utils.parseUnits("40000", "gwei"));

  });

  it('deploys V2 directly then upgrades to V1', async () => {
    const signers = await ethers.getSigners();
    const SoRandom = await ethers.getContractFactory('SoRandomUpgradeableV2');
    const SoRandomV2 = await ethers.getContractFactory("SoRandomUpgradeable");
    const soRandom = await upgrades.deployProxy(SoRandom, [signers[0].address, signers[0].address, 3, ethers.utils.parseUnits("0.1"), 50, 3600, 50000, 2000000, ethers.utils.parseUnits("20000", "gwei"), [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address]]);

    // It should have newFunction()
    try {
      await soRandom.newFunction();
    } catch {
      expect(true).to.be.false;
    }

    const upgraded = await upgrades.upgradeProxy(soRandom.address, SoRandomV2);
    // newFunction should be removed (since we started with V2 and are "upgrading" to V1)
    try {
      await upgraded.newFunction();
      expect(true).to.be.false;
    } catch {
    }
    expect((await upgraded.getBeacons()).length).to.equal(7);
  });

  it("uses proxy address as msg.sender in callback", async () => {
    const signers = await ethers.getSigners();
    const SoRandom = await ethers.getContractFactory('SoRandomUpgradeable');
    const SoRandomV2 = await ethers.getContractFactory("SoRandomUpgradeableV2");

    const soRandom = await upgrades.deployProxy(SoRandom, [ethers.constants.AddressZero, ethers.constants.AddressZero, 3, ethers.utils.parseUnits("0.1"), 50, 3600, 50000, 2000000, ethers.utils.parseUnits("20000", "gwei"), [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address]]);
    const TestCallback = await ethers.getContractFactory("TestCallback");
    const testCallback = await TestCallback.deploy(soRandom.address);
    const upgraded = await upgrades.upgradeProxy(soRandom.address, SoRandomV2);

    expect(upgraded.address).to.equal(soRandom.address);

    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();

    const req = await testCallback.makeRequest();
    const res = await req.wait();
    let request = soRandom.interface.parseLog(res.logs[0]).args.request;

    const messageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes32"],
        [request.client, 1, request.seed]
      )
    );


    const selectedBeacons = request.beacons;
    expect(selectedBeacons[2]).to.equal(ethers.constants.AddressZero);

    const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));
    const messageHashBytes = ethers.utils.arrayify(messageHash);

    let selectedFinalBeacon;

    for (const signer of selectedSigners) {
      // await soRandom.testCharge(testCallback.address, signer.address, 1);
      const flatSig = await signer.signMessage(messageHashBytes);
      const sig = ethers.utils.splitSignature(flatSig);
      const uintData = [1, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit, sig.v];
      const addressData = [request.client].concat(request.beacons);
      const bytesData = [sig.r, sig.s, request.seed];
      const tx = await soRandom.connect(signer).submitRandom(addressData, uintData, bytesData);
      const res = await tx.wait();
      const requestEvent = soRandom.interface.parseLog(res.logs[0]);

      if (requestEvent.name == "RequestBeacon") {
        selectedFinalBeacon = requestEvent.args.beacon;
        expect(selectedFinalBeacon).to.not.equal(ethers.constants.AddressZero);
        request = requestEvent.args.request;
      }

    }

    // const selectedFinalBeacon = await soRandom.getFinalBeacon(1);
    // expect(selectedFinalBeacon).to.not.equal(ethers.constants.AddressZero);
    const finalSigner = signers.filter(signer => selectedFinalBeacon == signer.address)[0];
    const flatSig = await finalSigner.signMessage(messageHashBytes);
    const sig = ethers.utils.splitSignature(flatSig);
    const uintData = [1, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit, sig.v];
    const addressData = [request.client].concat(request.beacons);
    const bytesData = [sig.r, sig.s, request.seed];

    const tx = await soRandom.connect(finalSigner).submitRandom(addressData, uintData, bytesData);
    await tx.wait();

    const callbackResult = await testCallback.result();
    expect(callbackResult).to.not.equal(ethers.constants.HashZero);

  });
});