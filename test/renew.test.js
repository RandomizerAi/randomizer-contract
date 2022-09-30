const { expect, assert } = require("chai");
const { ethers } = require("hardhat");
const hre = require("hardhat");
const vrfHelper = require("./helpers.js");

describe("Renew", function () {

  let signers;
  let randomizer;
  let testCallback;
  let vrf;
  let lib;
  let ecKeys;
  let sequencer;
  beforeEach(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          // forking: {
          //   jsonRpcUrl: "https://rinkeby.arbitrum.io/rpc",
          //   blockNumber: 10525577,
          // },
        },
      ],
    });

    signers = await ethers.getSigners();
    ecKeys = [];
    let i = 0;
    while (i < 6) {
      const keys = vrfHelper.getVrfPublicKeys(signers[i].address);
      ecKeys = ecKeys.concat(keys);
      i++;
    }
    const VRF = await ethers.getContractFactory("VRF");
    vrf = await VRF.deploy();
    const Internals = await ethers.getContractFactory("Internals");
    lib = await Internals.deploy();
    const Randomizer = await ethers.getContractFactory("RandomizerWithStorageControls", {
      libraries: {
        Internals: lib.address,
        VRF: vrf.address
      }
    });

    sequencer = signers[7];
    randomizer = await Randomizer.deploy([signers[7].address, signers[7].address], ["500000000000000000", 20, 900, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3], [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address], ecKeys, [570000, 90000, 65000, 21000, 21000, 21000, 21000]);
    const TestCallback = await ethers.getContractFactory("TestCallback");
    testCallback = await TestCallback.deploy(randomizer.address);

    vrfHelper.init(vrf, randomizer);

    for (const signer of signers) {
      await randomizer.connect(signer).beaconStakeEth(signer.address, { value: ethers.utils.parseEther("5") });
    }
  });

  const makeRequest = async (contract) => {
    let res = await (await contract.makeRequest()).wait();
    const req = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id };
    return req;
  }

  it("make a random request and renew all non-submitters", async function () {
    // Deposit
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    expect(await randomizer.clientBalanceOf(testCallback.address)).to.equal(ethers.utils.parseEther("5"));

    // Request
    let request = await makeRequest(testCallback);
    let oldBeaconIds = request.beacons;

    // Skip blocks and renew
    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);
    const data = await vrfHelper.getSubmitData(signers[0].address, request);
    const res = await (await randomizer.renewRequest(data.addresses, data.rawUints, request.seed, false)).wait();
    // New request data
    const retryEvent = randomizer.interface.parseLog(res.logs.filter((log) => randomizer.interface.parseLog(log).name === "Retry")[0]);
    request = { ...retryEvent.args.request, id: retryEvent.args.id };

    // Expect no beacons to be duplicates
    for (let i = 0; i < oldBeaconIds.length - 1; i++) {
      for (const newBeacon of request.beacons) {
        expect(oldBeaconIds[i]).to.not.equal(newBeacon);
      }
    }

    // Skip & Renew again
    oldBeaconIds = request.beacons;
    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);
    const newData = await vrfHelper.getSubmitData(signers[0].address, request);

    const res2 = await (await randomizer.renewRequest(newData.addresses, newData.rawUints, request.seed, false)).wait();
    const retryEvent2 = randomizer.interface.parseLog(res2.logs.filter((log) => randomizer.interface.parseLog(log).name === "Retry")[0]);

    request = { ...retryEvent2.args.request, id: retryEvent2.args.id };

    // Expect no beacons to be duplicates
    for (let i = 0; i < oldBeaconIds.length - 1; i++) {
      for (const newBeacon of request.beacons) {
        expect(oldBeaconIds[i]).to.not.equal(newBeacon);
      }
    }
    expect(request.beacons.length).to.equal(3);
  });
  it("renew only the single non-submitter", async function () {
    // Deposit
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();

    // Request
    const request = await makeRequest(testCallback);

    // Get beacons
    const selectedBeacons = request.beacons;

    // Get first signer
    const signer = signers.filter(signer => selectedBeacons[1] == signer.address)[0];

    // Submit signature
    const data = await vrfHelper.getSubmitData(signer.address, request);

    await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(signer.address), data.addresses, data.uints, request.seed, false);



    // Store request with the 1 signature

    const oldSigs = await randomizer.getRequestVrfHashes(request.id);


    // Skip blocks and renew request
    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);
    const renewUintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit];

    const oldFeePaid = await randomizer.getFeePaid(request.id);
    const res = await (await randomizer.renewRequest(data.addresses, renewUintData, request.seed, false)).wait();

    // Get new request data
    const newReq = randomizer.interface.parseLog(res.logs[res.logs.length - 1]).args.request;

    const newBeacons = newReq.beacons;

    const newSigs = await randomizer.getRequestVrfHashes(1);


    // Beacons should be renewed except for the first one
    expect(newBeacons[1]).to.equal(selectedBeacons[1]);
    expect(newBeacons[0]).to.not.equal(selectedBeacons[0]);
    expect(newBeacons[1]).to.not.equal(selectedBeacons[0]);
    expect(newBeacons[2]).to.equal(ethers.constants.AddressZero);
    expect(newSigs[1]).to.equal(oldSigs[1]);
    expect(newSigs[1]).to.not.equal(ethers.constants.HashZero);
    expect(newSigs[0]).to.equal(ethers.constants.HashZero);
    expect(newSigs[2]).to.equal(ethers.constants.HashZero);

    // Fee should be added to refunded. feePaid should remain the same so the client contract can refund the total fees to the user.
    expect((await randomizer.getFeeRefunded(request.id)).eq(0)).to.be.false;
    expect((await randomizer.getFeeRefunded(request.id)).eq(oldFeePaid)).to.be.true;
    expect((await randomizer.getFeePaid(request.id)).eq(oldFeePaid)).to.be.true;
  });

  it("renew final non-submitter", async function () {
    // const tx = await signers[4].sendTransaction({ to: subscriber.address, value: ethers.utils.parseEther("1") });
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();


    let request = await makeRequest(testCallback);


    /*  address _client,
        uint256 _request,
        bytes calldata _signature */

    // const gasPrice = ethers.BigNumber.from(await hre.network.provider.request({ method: "eth_gasPrice", params: [] })).toString();



    const selectedBeacons = request.beacons;
    expect(selectedBeacons[2]).to.equal(ethers.constants.AddressZero);

    const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));

    let totalGas = ethers.BigNumber.from(0);


    let oldReq;
    for (const signer of selectedSigners) {
      const data = await vrfHelper.getSubmitData(signer.address, request);

      const tx = await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(signer.address), data.addresses, data.uints, request.seed, false);

      const res = await tx.wait();

      // Process RequestBeacon event (from 2nd-to-last submitter)
      const requestEventRaw = res.logs.find(log => randomizer.interface.parseLog(log).name === "RequestBeacon");

      // Process RequestBeacon event (from 2nd-to-last submitter)
      if (requestEventRaw) {
        const requestEvent = randomizer.interface.parseLog(requestEventRaw);
        const selectedFinalBeacon = requestEvent.args.beacon;
        request.beacons = [request.beacons[0], request.beacons[1], selectedFinalBeacon];
        request.timestamp = requestEvent.args.timestamp;
        request.height = requestEvent.args.height;
        expect(request.beacons[2]).to.not.equal(ethers.constants.AddressZero);
        expect(selectedFinalBeacon).to.not.equal(ethers.constants.AddressZero);
        oldReq = request;
      }
    }
    const oldSigs = await randomizer.getRequestVrfHashes(1);


    expect(oldReq.beacons[2]).to.not.equal(ethers.constants.AddressZero);
    const finalSigner = signers.find(signer => signer.address == request.beacons[2]);
    await randomizer.connect(finalSigner).beaconStakeEth(finalSigner.address, { value: ethers.utils.parseEther("1") });


    // Skip blocks and renew request
    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);
    const uintData = [1, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit];
    const addressData = [request.client].concat(request.beacons);
    const renew = await randomizer.renewRequest(addressData, uintData, request.seed, false);
    const renewRes = await renew.wait();

    const newReq = await randomizer.interface.parseLog(renewRes.logs[renewRes.logs.length - 1]).args.request;
    const newBeacons = newReq.beacons;

    const newSigs = await randomizer.getRequestVrfHashes(1);

    // Beacons should be renewed except for the first one
    expect(oldReq.beacons[2]).to.not.equal(newReq.beacons[2]);
    expect(newBeacons[0]).to.equal(selectedBeacons[0]);
    expect(newBeacons[1]).to.equal(selectedBeacons[1]);
    expect(newBeacons[2]).to.not.equal(ethers.constants.AddressZero);
    expect(newSigs[0]).to.equal(oldSigs[0]);
    expect(newSigs[1]).to.equal(oldSigs[1]);
    expect(newSigs[0]).to.not.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
    expect(newSigs[1]).to.not.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
    expect(newSigs[2]).to.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
  });

  it("slash stake of non-submitters and refund caller gas", async function () {
    // Expect kicked beacon IDs to be replaced properly and all beacons[] addresses and beaconIndex[] indices are aligned
    // Deploy randomizer with 1-strike removal

    const Randomizer2 = await ethers.getContractFactory("RandomizerStatic", {
      libraries: {
        Internals: lib.address,
        VRF: vrf.address
      }
    });
    const randomizer2 = await Randomizer2.deploy([ethers.constants.AddressZero, ethers.constants.AddressZero], ["500000000000000000", 50, 600, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3], [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address], [ecKeys[0], ecKeys[1], ecKeys[2], ecKeys[3], ecKeys[4], ecKeys[5], ecKeys[6], ecKeys[7], ecKeys[8], ecKeys[9]], [570000, 90000, 65000, 21000, 21000, 21000]);
    const testCallback2 = await (await ethers.getContractFactory("TestCallback")).deploy(randomizer2.address);

    await randomizer2.clientDeposit(testCallback2.address, { value: ethers.utils.parseEther("50") });
    const request = await makeRequest(testCallback2);

    const beacons = request.beacons;
    const selectedSigners = signers.filter(signer => beacons.includes(signer.address));

    // Stake 1 eth for beacon
    await randomizer2.connect(selectedSigners[1]).beaconStakeEth(selectedSigners[1].address, { value: ethers.utils.parseEther("1") });

    expect(ethers.BigNumber.from(await randomizer2.getBeaconStakeEth(selectedSigners[1].address))).to.equal(ethers.utils.parseEther("1"));

    // Make signature
    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);
    await randomizer2.connect(selectedSigners[0])['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(selectedSigners[0].address), data.addresses, data.uints, request.seed, false);

    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);
    const oldClientBalanceOf = ethers.BigNumber.from(await randomizer2.clientBalanceOf(request.client));

    const renewUintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit];
    const beaconStakeOfRenewer = ethers.BigNumber.from(await randomizer2.getBeaconStakeEth(selectedSigners[1].address));
    await randomizer2.connect(selectedSigners[0]).renewRequest(data.addresses, renewUintData, request.seed, false);

    const newBeaconStakeOfRenewer = ethers.BigNumber.from(await randomizer2.getBeaconStakeEth(selectedSigners[1].address));

    // Check that beacon is removed
    expect(ethers.BigNumber.from(await randomizer2.getBeaconStakeEth(selectedSigners[1].address)).lt(ethers.utils.parseEther("1"))).to.equal(true);

    // Check that ETH balance of wallet that called renewRequest has increased
    expect(beaconStakeOfRenewer.gte(newBeaconStakeOfRenewer)).to.equal(true);

    // Check that the ETH deposit of request.client has increased
    const newClientBalanceOf = ethers.BigNumber.from(await randomizer2.clientBalanceOf(request.client));

    expect(oldClientBalanceOf.lt(newClientBalanceOf)).to.equal(true);

  });

  it("revert on renew if request is not yet renewable", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let request = await makeRequest(testCallback);


    const addressData = [request.client].concat(request.beacons);
    const uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit];
    try {
      await randomizer.renewRequest(addressData, uintData, request.seed, false);
      expect(true).to.equal(false);
    } catch (e) {
      expect(e).to.match(/NotYetRenewable/g);
    }
  });

  it("only allow the first submitter to renew for the first 5 minutes/20 blocks", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let request = await makeRequest(testCallback);
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));

    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);
    // Submit request with first selectedSigner
    await randomizer.connect(selectedSigners[0])['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(selectedSigners[0].address), data.addresses, data.uints, request.seed, false);
    const renewUintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit];
    // Mine 20 blocks with 45 seconds per block
    await hre.network.provider.send("hardhat_mine", ["0x20", ethers.utils.hexValue(45)]);
    try {
      await randomizer.connect(selectedSigners[1]).renewRequest(data.addresses, renewUintData, request.seed, false);
      expect(true).to.equal(false);
    } catch (e) {
      expect(e).to.match(/NotYetRenewable/g);
    }
    const renewTx = await randomizer.connect(selectedSigners[0]).renewRequest(data.addresses, renewUintData, request.seed, false);
    const renew = await renewTx.wait();
    // Expect event "Retry" to be emitted by renew
    expect(renew.events).to.have.lengthOf(3);
    expect(renew.events[renew.events.length - 1].event).to.equal("Retry");
  });

  it("allow first submitter, then sequencer, then everyone to renew a request after an added half expiration period for each party", async function () {
    this.timeout(100000);
    const newReq = async () => {
      const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
      await deposit.wait();
      let request = await makeRequest(testCallback);
      const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));
      // Sort selectedSigners by order their addresses are in request.beacons
      selectedSigners.sort((a, b) => request.beacons.indexOf(a.address) - request.beacons.indexOf(b.address));
      // Mine 20 blocks with 45 seconds per block
      return request;
    }

    const renewWith = async (request, renewer, waitBlocks, waitSeconds) => {
      const data = await vrfHelper.getSubmitData(renewer.address, request);

      await hre.network.provider.send("hardhat_mine", [ethers.utils.hexValue(waitBlocks - 5), ethers.utils.hexValue(Math.ceil(waitSeconds / waitBlocks + 20))]);

      try {
        await randomizer.connect(renewer).renewRequest(data.addresses, data.rawUints, request.seed, false);
        expect(true).to.equal(false);
      } catch (e) {
        expect(e.message).to.match(/NotYetRenewable/g);
      }
      await hre.network.provider.send("hardhat_mine", [ethers.utils.hexValue(6), ethers.utils.hexValue(10)]);
      const renewTx = await randomizer.connect(renewer).renewRequest(data.addresses, data.rawUints, request.seed, false);
      const renew = await renewTx.wait();
      // Expect event "Retry" to be emitted by renew
      expect(renew.events).to.have.lengthOf(3);
      expect(renew.events[renew.events.length - 1].event).to.equal("Retry");
      return true;
    }


    for (let i = 0; i < 3; i++) {
      const request = await newReq();
      const firstSubmitter = signers.find(signer => signer.address === request.beacons[0]);
      const data = await vrfHelper.getSubmitData(firstSubmitter.address, request);
      await randomizer.connect(firstSubmitter)['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(firstSubmitter.address), data.addresses, data.uints, request.seed, false);
      const allSigners = [firstSubmitter, sequencer, signers[9]];
      const waitBlocks = ethers.BigNumber.from(request.height).add(request.expirationBlocks).sub(await hre.ethers.provider.getBlockNumber()).add(request.expirationBlocks.div(2).mul(i)).toNumber();
      const waitSeconds = ethers.BigNumber.from(request.timestamp).add(request.expirationSeconds).sub((await hre.ethers.provider.getBlock()).timestamp).add(request.expirationSeconds.div(2).mul(i)).toNumber();
      const res = await renewWith(request, allSigners[i], waitBlocks, waitSeconds);
      expect(res).to.equal(true);
    }

    // Sequencer and random signer can't renew as first submitter
    for (let i = 1; i < 3; i++) {
      const request = await newReq();
      const data = await vrfHelper.getSubmitData(signers[0].address, request);
      const waitBlocks = ethers.BigNumber.from(request.height).add(request.expirationBlocks).sub(await hre.ethers.provider.getBlockNumber()).toNumber();
      const waitSeconds = ethers.BigNumber.from(request.timestamp).add(request.expirationSeconds).sub((await hre.ethers.provider.getBlock()).timestamp).toNumber();
      await hre.network.provider.send("hardhat_mine", [ethers.utils.hexValue(waitBlocks - 5), ethers.utils.hexValue(Math.ceil(waitSeconds / waitBlocks + 20))]);
      try {
        await randomizer.connect(sequencer).renewRequest(data.addresses, data.rawUints, request.seed, false);
        expect(true).to.equal(false);
      } catch (e) {
        expect(e.message).to.match(/NotYetRenewable/g);
      }
      try {
        await randomizer.connect(signers[9]).renewRequest(data.addresses, data.rawUints, request.seed, false);
        expect(true).to.equal(false);
      } catch (e) {
        expect(e.message).to.match(/NotYetRenewable/g);
      }
    }

    // Sequencer and random signer can renew after their specific expiration period if noone submitted
    for (let i = 1; i < 3; i++) {
      const request = await newReq();
      const allSigners = [sequencer, signers[9]];
      const waitBlocks = ethers.BigNumber.from(request.height).add(request.expirationBlocks).sub(await hre.ethers.provider.getBlockNumber()).add(request.expirationBlocks.div(2).mul(i)).toNumber();
      const waitSeconds = ethers.BigNumber.from(request.timestamp).add(request.expirationSeconds).sub((await hre.ethers.provider.getBlock()).timestamp).add(request.expirationSeconds.div(2).mul(i)).toNumber();
      const res = await renewWith(request, allSigners[i - 1], waitBlocks, waitSeconds);
      expect(res).to.equal(true);
    }

    // Second submitter can only renew within first timeframe if they submitted
    const request = await newReq();
    const secondSubmitter = signers.find(signer => signer.address === request.beacons[1]);
    const data = await vrfHelper.getSubmitData(secondSubmitter.address, request);
    const waitBlocks = ethers.BigNumber.from(request.height).add(request.expirationBlocks).sub(await hre.ethers.provider.getBlockNumber()).toNumber();
    const waitSeconds = ethers.BigNumber.from(request.timestamp).add(request.expirationSeconds).sub((await hre.ethers.provider.getBlock()).timestamp).toNumber();
    await hre.network.provider.send("hardhat_mine", [ethers.utils.hexValue(waitBlocks + 5), ethers.utils.hexValue(Math.ceil(waitSeconds / waitBlocks + 20))]);
    // Can't renew yet because 2nd beacon hasn't submitted yet
    try {
      await randomizer.connect(secondSubmitter).renewRequest(data.addresses, data.rawUints, request.seed, false);
      expect(true).to.equal(false);
    } catch (e) {
      expect(e.message).to.match(/NotYetRenewable/g);
    }
    // After submit they can renew
    await randomizer.connect(secondSubmitter)['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(secondSubmitter.address), data.addresses, data.uints, request.seed, false);
    await randomizer.connect(secondSubmitter).renewRequest(data.addresses, data.rawUints, request.seed, false);


  });


  it("revert with RequestDataMismatch when renewing a request with a different hash", async function () {
    // Deposit
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let request = await makeRequest(testCallback);
    // submitRequest with first beacon in request.beacons
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));

    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);

    await randomizer.connect(selectedSigners[0])['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(selectedSigners[0].address), data.addresses, data.uints, request.seed, false);

    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);
    // Renew the request
    const renewUintData = [request.id, request.ethReserved, request.beaconFee, request.height, 123, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit];
    try {
      await randomizer.renewRequest(data.addresses, renewUintData, request.seed, false);
      expect(true).to.equal(false);
    } catch (e) {
      expect(e).to.match(/RequestDataMismatch.*/g);
    }
  });

  it("refund to client on renew when a striked beacon has collateral left over", async () => {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let request = await makeRequest(testCallback);
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));

    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);

    await randomizer.connect(selectedSigners[1]).beaconStakeEth(selectedSigners[1].address, { value: ethers.utils.parseEther("1") });

    await randomizer.connect(selectedSigners[0])['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(selectedSigners[0].address), data.addresses, data.uints, request.seed, false);

    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);

    // Renew the request
    const clientOldDeposit = await randomizer.clientBalanceOf(testCallback.address);

    const signerOldDeposit = await randomizer.getBeaconStakeEth(selectedSigners[1].address);
    const renew = await randomizer.connect(signers[8]).renewRequest(data.addresses, data.rawUints, request.seed, false);
    const receipt = await renew.wait();
    // Get logs from receipt
    let retry;
    for (const log of receipt.logs) {
      const event = randomizer.interface.parseLog(log);
      if (event.name === "Retry") retry = event;
    }


    const clientNewDeposit = await randomizer.clientBalanceOf(testCallback.address);
    const signerNewDeposit = await randomizer.getBeaconStakeEth(selectedSigners[1].address);
    expect(clientNewDeposit.gte(clientOldDeposit.add(retry.args.ethToClient))).to.be.true;
    expect(signerNewDeposit.lte(signerOldDeposit.sub(retry.args.ethToClient.add(retry.args.ethToCaller)))).to.be.true;
  });

  it("refund to client on renew when a striked beacon has less collateral than totalCharge but more than renewFee", async () => {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let request = await makeRequest(testCallback);
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));

    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);
    const clientOriginalDeposit = await randomizer.clientBalanceOf(testCallback.address);

    await randomizer.connect(selectedSigners[1]).beaconStakeEth(selectedSigners[1].address, { value: ethers.utils.parseEther("1") });

    await randomizer.connect(selectedSigners[0])['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(selectedSigners[0].address), data.addresses, data.uints, request.seed, false);

    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);

    // Renew the request
    const clientOldDeposit = await randomizer.clientBalanceOf(testCallback.address);

    // Sets the collateral to a little over the renew gas price so that the collateral is less than the total charge but more than the renew fee 
    const collateral = ethers.BigNumber.from(115000).mul(await ethers.provider.getGasPrice());
    await randomizer._debug_setCollateral(selectedSigners[1].address, collateral);

    const signerOldDeposit = await randomizer.getBeaconStakeEth(selectedSigners[1].address);
    const renew = await randomizer.connect(signers[8]).renewRequest(data.addresses, data.rawUints, request.seed, false);
    const receipt = await renew.wait();
    // Get logs from receipt
    let retry;

    expect(receipt.logs.length).to.equal(4);
    for (const log of receipt.logs) {
      const event = randomizer.interface.parseLog(log);
      if (event.name === "Retry") retry = event;
    }


    const clientNewDeposit = await randomizer.clientBalanceOf(testCallback.address);
    const signerNewDeposit = await randomizer.getBeaconStakeEth(selectedSigners[1].address);
    expect(retry.args.ethToClient.gt(0)).to.be.true;
    expect(retry.args.ethToCaller.gt(0)).to.be.true;
    expect(clientNewDeposit.gte(clientOldDeposit.add(retry.args.ethToClient))).to.be.true;
    expect(clientNewDeposit.lte(clientOriginalDeposit.sub(retry.args.ethToCaller).add(collateral))).to.be.true;
    expect(signerNewDeposit.lte(signerOldDeposit.sub(retry.args.ethToClient.add(retry.args.ethToCaller)))).to.be.true;
  });

  it("refunds 0 when collateral is 0", async () => {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let request = await makeRequest(testCallback);
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));

    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);

    await randomizer._debug_setCollateral(selectedSigners[1].address, 0);

    await randomizer.connect(selectedSigners[0])['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(selectedSigners[0].address), data.addresses, data.uints, request.seed, false);

    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);

    // Renew the request
    const clientOldDeposit = await randomizer.clientBalanceOf(testCallback.address);

    const renew = await randomizer.connect(signers[8]).renewRequest(data.addresses, data.rawUints, request.seed, false);
    const receipt = await renew.wait();
    // Get logs from receipt
    let retry;
    for (const log of receipt.logs) {
      const event = randomizer.interface.parseLog(log);

      if (event.name === "Retry") retry = event;
    }

    expect(retry.args.ethToClient.eq(0)).to.be.true;
    expect(retry.args.ethToCaller.eq(0)).to.be.true;
  });

  it("refund only to sender on renew when a striked beacon has less than renew fee as collateral", async () => {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let request = await makeRequest(testCallback);
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));

    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);

    await randomizer._debug_setCollateral(selectedSigners[1].address, ethers.utils.parseUnits("10", "wei"));

    await randomizer.connect(selectedSigners[0])['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(selectedSigners[0].address), data.addresses, data.uints, request.seed, false);

    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);

    // Renew the request
    const clientOldDeposit = await randomizer.clientBalanceOf(testCallback.address);

    const senderOldDeposit = await randomizer.getBeaconStakeEth(signers[8].address);
    const renew = await randomizer.connect(signers[8]).renewRequest(data.addresses, data.rawUints, request.seed, false);
    const receipt = await renew.wait();
    // Get logs from receipt
    let retry;
    for (const log of receipt.logs) {
      const event = randomizer.interface.parseLog(log);
      if (event.name === "Retry") retry = event;
    }

    const senderNewDeposit = await randomizer.getBeaconStakeEth(signers[8].address);

    const clientNewDeposit = await randomizer.clientBalanceOf(testCallback.address);
    const signerNewDeposit = await randomizer.getBeaconStakeEth(selectedSigners[1].address);
    expect(clientNewDeposit.eq(clientOldDeposit)).to.be.true;
    expect(signerNewDeposit.eq("0")).to.be.true;
    expect(senderNewDeposit.eq(senderOldDeposit.add(retry.args.ethToCaller))).to.be.true;
  });


  it("revert with NotEnoughBeaconsAvailable if renewing a request without enough beacons", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    const req = await makeRequest(testCallback);

    // Unregister beacons
    for (const signer of signers) {
      if ((await randomizer.getBeacons()).includes(signer.address) && ethers.BigNumber.from((await randomizer.getBeacon(signer.address)).pending).eq(0)) {
        const tx = await randomizer.connect(signer).unregisterBeacon(signer.address);
        await tx.wait();
      }
    }

    await hre.network.provider.send("hardhat_mine", ["0x40", ethers.utils.hexValue(45)]);

    // Renew request with first selectedSigner
    const renewUintData = [req.id, req.ethReserved, req.beaconFee, req.height, req.timestamp, req.expirationBlocks, req.expirationSeconds, req.callbackGasLimit];
    const addressData = [req.client].concat(req.beacons);
    try {
      await randomizer.renewRequest(addressData, renewUintData, req.seed, false);
      expect(true).to.equal(false);
    }
    catch (e) {
      expect(e).to.match(/NotEnoughBeaconsAvailable/g);
    }
  });

  it("remove a beacon on renewRequest if the beacon did not submit and has below minStakeEth", async function () {
    // Get beacons.length
    const oldBeacons = await randomizer.getBeacons();
    // Deposit
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    // Make request
    const request = await makeRequest(testCallback);
    // Get request signer
    const selectedSigners = [];
    // Create an array of signers where signer.address matches request.beacons in the same order
    for (const signer of signers) {
      if (request.beacons.includes(signer.address)) {
        selectedSigners[request.beacons.indexOf(signer.address)] = signer;
      }
    }
    // Return selectedSigners.address values in mapping
    const mappedSigners = selectedSigners.map(signer => signer.address);
    // beaconUnstakeEth on first selectedSigner
    // Subtract minStakeEth from beaconStakeEth
    const minStakeEth = await randomizer.getConfigUint(0);
    const beaconStakeEth = await randomizer.getBeaconStakeEth(selectedSigners[0].address);
    const beaconStakeEthMinusMinStakeEth = ethers.BigNumber.from(beaconStakeEth).sub(minStakeEth);
    await randomizer.connect(selectedSigners[0]).beaconUnstakeEth(beaconStakeEthMinusMinStakeEth);
    // Mine 20 blocks with 45 seconds per block
    await hre.network.provider.send("hardhat_mine", ["0x40", ethers.utils.hexValue(45)]);
    // Renew request with second selectedSigner
    const renewUintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit];
    const addressData = [request.client].concat(request.beacons);
    const renewTx = await randomizer.connect(selectedSigners[1]).renewRequest(addressData, renewUintData, request.seed, false);
    const renew = await renewTx.wait();
    expect(renew.events).to.have.lengthOf(3);
    expect(renew.events[renew.events.length - 1].event).to.equal("Retry");

    // Make new requests until request2.beacons includes selectedSigners[0].address
    let request2 = await makeRequest(testCallback);
    while (!request2.beacons.includes(selectedSigners[0].address)) {
      request2 = await makeRequest(testCallback);
    }
    // Mine 20 blocks with 45 seconds per block
    await hre.network.provider.send("hardhat_mine", ["0x40", ethers.utils.hexValue(45)]);
    // Get request2 selectedSigners
    const selectedSigners2 = [];
    for (const signer of signers) {
      if (request2.beacons.includes(signer.address)) {
        selectedSigners2[request2.beacons.indexOf(signer.address)] = signer;
      }
    }
    const mappedSigners2 = selectedSigners2.map(signer => signer.address);

    // Get the selectedSigner that isn't selectedSigners[0]
    const selectedSigner2 = selectedSigners2.filter(signer => signer.address !== selectedSigners[0].address)[0];
    const renewUintData2 = [request2.id, request2.ethReserved, request2.beaconFee, request2.height, request2.timestamp, request2.expirationBlocks, request2.expirationSeconds, request2.callbackGasLimit];
    const addressData2 = [request2.client].concat(request2.beacons);
    const renewTx2 = await randomizer.connect(selectedSigner2).renewRequest(addressData2, renewUintData2, request2.seed, false);
    const renew2 = await renewTx2.wait();
    // Expect event "RemoveBeacon" to be emitted by renew
    expect(renew2.events).to.have.lengthOf(4);
    expect(renew2.events[0].event).to.equal("RemoveBeacon");
    // Expect event "BeaconRemoved" to have correct data
    expect(renew2.events[0].args.beacon).to.equal(selectedSigners[0].address);
    // Get beacons
    const newBeacons = await randomizer.getBeacons();
    // Expect beacons to have one less than before
    expect(newBeacons).to.have.lengthOf(oldBeacons.length - 1);
  });

});