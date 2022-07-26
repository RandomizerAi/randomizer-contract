const { expect } = require("chai");
const { ethers } = require("hardhat");
// const hre = require("hardhat");

describe("Beacon", function () {
  const signAndCallback = async (request) => {
    // Get beacons
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));
    // Generate message
    const messageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes32"],
        [request.client, 1, request.seed]
      )
    );

    const messageHashBytes = ethers.utils.arrayify(messageHash);
    let selectedFinalBeacon;
    for (const signer of selectedSigners) {
      // await soRandom.testCharge(testCallback.address, signer.address, 1);
      const flatSig = await signer.signMessage(messageHashBytes);
      const sig = ethers.utils.splitSignature(flatSig);
      const uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit, sig.v];
      const addressData = [request.client].concat(request.beacons);
      const bytesData = [sig.r, sig.s, request.seed];
      const tx = await soRandom.connect(signer).submitRandom(addressData, uintData, bytesData);
      const res = await tx.wait();
      const requestEvent = soRandom.interface.parseLog(res.logs[0]);

      // Process RequestBeacon event (from 2nd-to-last submitter)
      if (requestEvent.name == "RequestBeacon") {

        selectedFinalBeacon = requestEvent.args.beacon;
        expect(selectedFinalBeacon).to.not.equal(ethers.constants.AddressZero);
        request = { ...requestEvent.args.request, id: requestEvent.args.id };

      }
    }
    const finalSigner = signers.filter(signer => selectedFinalBeacon == signer.address)[0];
    const flatSig = await finalSigner.signMessage(messageHashBytes);
    const sig = ethers.utils.splitSignature(flatSig);
    const uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit, sig.v];
    const addressData = [request.client].concat(request.beacons);
    const bytesData = [sig.r, sig.s, request.seed];
    const tx = await soRandom.connect(finalSigner).submitRandom(addressData, uintData, bytesData);
    await tx.wait();

    const callbackResult = await testCallback.result();
    return callbackResult;
  }

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
    soRandom = await SoRandom.deploy(signers[0].address, 3, "500000000000000000", 20, 900, 50000, 2000000, ethers.utils.parseEther("0.00005"), [signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address, signers[6].address]);
    await soRandom.deployed();
    const TestCallback = await ethers.getContractFactory("TestCallback");
    testCallback = await TestCallback.deploy(soRandom.address);
  });

  it("fail beacon withdraw when it is not sender/owner or has pending requests", async function () {
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    const req = await testCallback.makeRequest();
    // Get request data
    const res = await req.wait();
    const request = { ...soRandom.interface.parseLog(res.logs[0]).args.request, id: soRandom.interface.parseLog(res.logs[0]).args.id };
    const selectedSigner = signers.filter(signer => request.beacons[0] == signer.address)[0];
    const beacon = await soRandom.getBeacon(selectedSigner.address);

    expect(beacon.pending).to.equal(ethers.BigNumber.from(1));

    await expect(soRandom.connect(selectedSigner).beaconUnstakeEth(await soRandom.getBeaconStakeEth(selectedSigner.address))).to.be.revertedWith(`BeaconHasPending(${ethers.BigNumber.from(1)})`);
    await expect(soRandom.connect(selectedSigner).unregisterBeacon(selectedSigner.address)).to.be.revertedWith(`BeaconHasPending(${ethers.BigNumber.from(1)})`);
    await expect(soRandom.connect(signers[7]).unregisterBeacon(selectedSigner.address)).to.be.revertedWith(`NotOwnerOrBeacon`);
    await signAndCallback(request);

    await expect(soRandom.connect(selectedSigner).unregisterBeacon(selectedSigner.address)).to.not.be.reverted;
    pending = (await soRandom.getBeacon(selectedSigner.address)).pending.toNumber();
    expect(pending).to.equal(0);
  });

  it("send full beacon ETH stake to beacon after unregisterBeacon", async function () {
    await soRandom.connect(signers[1]).beaconStakeEth(signers[1].address, { value: ethers.utils.parseEther("5") });
    // Get balance of wallet signers[0]
    const oldBalance = await signers[1].getBalance();
    await soRandom.connect(signers[1]).unregisterBeacon(signers[1].address);
    const newBalance = await signers[1].getBalance();
    expect(newBalance.gt(oldBalance)).to.be.true;
  });

  it("register a new beacon", async function () {
    const tx = await soRandom.registerBeacon(signers[7].address);
    const receipt = await tx.wait();
    // Check if receipt emitted a RegisterBeacon event
    const event = receipt.events.find(e => e.event == "RegisterBeacon");
    expect(event).to.exist;

  });

  it("unregister beacon if unstaking more than minimum stake", async function () {
    await soRandom.connect(signers[1]).beaconStakeEth(signers[1].address, { value: ethers.utils.parseEther("5") });
    const unstake = await soRandom.connect(signers[1]).beaconUnstakeEth(ethers.utils.parseEther("5"));
    const unstakeReceipt = await unstake.wait();
    const event = unstakeReceipt.events.find(e => e.event == "UnregisterBeacon");
    const event2 = unstakeReceipt.events.find(e => e.event == "WithdrawEth");
    expect(event).to.exist;
    expect(event2).to.exist;
  });

  it("revert with FailedToSendEth if beacon unstake more than contract balance", async function () {
    await soRandom.beaconStakeEth(signers[1].address, { value: ethers.utils.parseEther("5") });
    await network.provider.send("hardhat_setBalance", [
      soRandom.address,
      "0x0"
    ]);
    try {
      await soRandom.connect(signers[1]).beaconUnstakeEth(ethers.utils.parseEther("5"));
      expect(true).to.be.false;
    } catch (e) {
      expect(e).to.match(/FailedToSendEth/);
    }
  });

  it("return all registered beacons with getBeacons and update indices on unregister", async function () {
    const beacons = await soRandom.getBeacons();
    expect(beacons.length).to.equal(7);
    // beaconIndex[beacons[1]] is 1
    expect(await soRandom.getBeaconIndex(beacons[1])).to.equal(1);
    const tx = await soRandom.unregisterBeacon(beacons[2]);
    await tx.wait();
    const beacons2 = await soRandom.getBeacons();
    expect(await soRandom.getBeaconIndex(beacons[6])).to.equal(2);
    expect(beacons2.length).to.equal(6);
  });

  it("remove the final beacon from the list of beacons", async function () {
    const beacons = await soRandom.getBeacons();
    expect(beacons.length).to.equal(7);
    const secondToLastBeacon = beacons[beacons.length - 2];
    const secondToLastBeaconIndex = await soRandom.getBeaconIndex(secondToLastBeacon);
    const tx = await soRandom.unregisterBeacon(beacons[6]);
    await tx.wait();
    const beacons2 = await soRandom.getBeacons();
    expect(beacons2.length).to.equal(6);
    expect(await soRandom.getBeaconIndex(secondToLastBeacon)).to.equal(secondToLastBeaconIndex);
  });

});