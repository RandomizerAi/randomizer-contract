const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const vrfHelper = require("./helpers.js");

// const hre = require("hardhat");

describe("Optimistic VRF Disputes", function () {

  const createAndFillOneOptimisticRequest = async () => {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let req = await testCallback.makeRequest();
    const res = await req.wait();
    // Get request data
    let request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id, height: res.logs[0].blockNumber };
    let selectedBeacons = request.beacons;
    let selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));
    let signer = selectedSigners[0];

    let data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);
    const vrf = await vrfHelper.getVrfData(selectedSigners[0].address, request.seed);
    await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(signer.address), data.addresses, data.uints, request.seed, true);

    return { signer, request, selectedSigners, data, vrf };

  }

  const createAndFillAllOptimisticRequest = async () => {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let req = await testCallback.makeRequest();
    const res = await req.wait();
    // Get request data
    let request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id, height: res.logs[0].blockNumber };
    let selectedBeacons = request.beacons;
    let selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));
    // Sort selectedSigners to be in the same order as selectedBeacons
    selectedSigners.sort((a, b) => {
      return selectedBeacons.indexOf(a.address) - selectedBeacons.indexOf(b.address);
    });

    let signer = selectedSigners[0];

    let data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);
    await randomizer.connect(selectedSigners[0])['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(selectedSigners[0].address), data.addresses, data.uints, request.seed, true);
    let data2 = await vrfHelper.getSubmitData(selectedSigners[1].address, request);
    const submitTx = await randomizer.connect(selectedSigners[1])['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(selectedSigners[1].address), data2.addresses, data2.uints, request.seed, true);

    const events = (await submitTx.wait()).logs;
    let selectedFinalBeacon;
    for (const event of events) {
      const parsed = randomizer.interface.parseLog(event);
      if (parsed.name == "RequestBeacon") {
        selectedFinalBeacon = parsed.args.beacon;
        expect(selectedFinalBeacon).to.not.equal(ethers.constants.AddressZero);
        request.beacons = [request.beacons[0], request.beacons[1], selectedFinalBeacon];
        request.timestamp = parsed.args.timestamp;
        request.height = event.blockNumber;
      }
    }
    const finalSigner = signers.filter(signer => selectedFinalBeacon == signer.address)[0];
    selectedSigners[2] = finalSigner;
    const finalData = await vrfHelper.getSubmitData(finalSigner.address, request);
    await randomizer.connect(finalSigner)['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](2, finalData.addresses, finalData.uints, request.seed, true);
    return { request, signer, selectedSigners, data: finalData }
  }

  const createAndFillFalseOptimisticRequest = async () => {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let req = await testCallback.makeRequest();
    const res = await req.wait();
    // Get request data
    let request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id, height: res.logs[0].blockNumber };
    const selectedBeacons = request.beacons;
    const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));
    const signer = selectedSigners[0];

    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);
    data.uints[data.uints.length - 9] = "11111111111111111111111111111111";
    const submitTx = await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(signer.address), data.addresses, data.uints, request.seed, true);

    const events = (await submitTx.wait()).logs;
    for (const event of events) {
      const parsed = randomizer.interface.parseLog(event);
      if (parsed.name == "SubmitOptimistic") {
        return { signer, parsed, request, selectedSigners, data };
      }
    }
  }

  let signers;
  let randomizer;
  let testCallback;
  let vrf;

  const reset = async () => {
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
    randomizer = await Randomizer.deploy([signers[6].address, signers[6].address], ["500000000000000000", 20, 900, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3], [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address], ecKeys, [570000, 90000, 65000, 21000, 21000, 21000, 21000]);
    await randomizer.deployed();
    vrfHelper.init(vrf, randomizer);
    const TestCallback = await ethers.getContractFactory("OptimisticTestCallback");
    testCallback = await TestCallback.deploy(randomizer.address);
    for (const signer of signers) {
      await randomizer.beaconStakeEth(signer.address, { value: ethers.utils.parseEther("1") });
      if (signer.address == signers[5].address) break;
    }
  }

  beforeEach(async function () {
    await reset();
  });

  it("fail dispute when vrf data is correct", async function () {
    const { vrf, signer, request, data, selectedSigners } = await createAndFillOneOptimisticRequest();

    const hash = await randomizer.gammaToHash(vrf.proof[0], vrf.proof[1])
    const storedHashes = await randomizer.getVrfHashes(request.id);
    const storedHash = storedHashes[request.beacons.indexOf(signer.address)];
    expect(hash).to.equal(storedHash);

    try {
      await randomizer.connect(selectedSigners[1]).dispute(request.beacons.indexOf(signer.address), data.addresses, data.uints, request.seed);
      expect(true).to.be.false;
    } catch (e) {
      expect(e).to.match(/ProofNotInvalid.*/g);
    }

  });

  it("dispute when vrf data is incorrect and update balances", async function () {
    const { parsed, signer, request, selectedSigners, data } = await createAndFillFalseOptimisticRequest();

    const hash = await randomizer.gammaToHash(parsed.args.proof[0], parsed.args.proof[1])
    const storedHash = (await randomizer.getVrfHashes(request.id))[request.beacons.indexOf(signer.address)];
    expect(hash).to.equal(storedHash);

    const oldStake = await randomizer.getBeaconStakeEth(selectedSigners[1].address);
    const oldDeposit = await randomizer.clientBalanceOf(testCallback.address);
    const oldManipulatorStake = await randomizer.getBeaconStakeEth(selectedSigners[0].address);
    await randomizer.connect(selectedSigners[1]).dispute(request.beacons.indexOf(signer.address), data.addresses, data.uints, request.seed);
    const newStake = await randomizer.getBeaconStakeEth(selectedSigners[1].address);
    const newDeposit = await randomizer.clientBalanceOf(testCallback.address);
    const newManipulatorStake = await randomizer.getBeaconStakeEth(selectedSigners[0].address);
    expect(newStake.gt(oldStake)).to.be.true;
    expect(newDeposit.gt(oldDeposit)).to.be.true;
    expect(newManipulatorStake.lt(oldManipulatorStake)).to.be.true;
    expect(newManipulatorStake.eq("0")).to.be.true;
    expect(newStake.sub(oldStake).add(newDeposit.sub(oldDeposit)).eq(oldManipulatorStake)).to.be.true;
  });

  it("fail completeOptimistic when not all VRF values are fulfilled", async function () {
    const { request, selectedSigners, data } = await createAndFillOneOptimisticRequest();
    try {
      await randomizer.connect(selectedSigners[0]).completeOptimistic(data.addresses, data.rawUints, request.seed);
      expect(true).to.be.false;
    } catch (e) {
      expect(e).to.match(/NotCompleteable.*/g);
    }
  });

  it("pass completeOptimistic when all VRF values are fulfilled", async function () {
    const { request, selectedSigners, data } = await createAndFillAllOptimisticRequest();
    await hre.network.provider.send("hardhat_mine", [ethers.utils.hexValue(100), ethers.utils.hexValue(45)]);

    await randomizer.connect(selectedSigners[0]).completeOptimistic(data.addresses, data.rawUints, request.seed);
    expect(true).to.be.true;
  });

  const makeAndCompleteWithSigner = async (i) => {
    const { request, selectedSigners, data } = await createAndFillAllOptimisticRequest();
    try {
      await randomizer.connect(selectedSigners[i]).completeOptimistic(data.addresses, data.rawUints, request.seed);
      expect(true).to.be.false;
    } catch (e) {
      expect(e).to.match(/NotYetCompletableBySender.*/g);
    }

    const window = (await randomizer.getDisputeWindow(request.id));
    const currentBlock = await ethers.provider.getBlockNumber();
    await hre.network.provider.send("hardhat_mine", [ethers.utils.hexValue(Number(window[0]) + (20 * i) - Number(currentBlock)), ethers.utils.hexValue(60)]);
    await hre.network.provider.send("hardhat_mine", [ethers.utils.hexValue(2), ethers.utils.hexValue(60)]);
    await randomizer.connect(selectedSigners[i]).completeOptimistic(data.addresses, data.rawUints, request.seed);
    const result = await randomizer.getResult(request.id);
    expect(result).to.not.equal(ethers.constants.HashZero);
  }

  it("only complete after assigned dispute window period for each completeable party", async function () {
    this.timeout(100000);
    await makeAndCompleteWithSigner(0);
    await makeAndCompleteWithSigner(1);
    await makeAndCompleteWithSigner(2);

    // Complete with a non-beacon
    const completeWithNonBeacon = async () => {
      const { request, selectedSigners, data } = await createAndFillAllOptimisticRequest();
      // Get a signer that is not in selectedSigners
      try {
        await randomizer.connect(signers[7]).completeOptimistic(data.addresses, data.rawUints, request.seed);
        expect(true).to.be.false;
      } catch (e) {
        expect(e).to.match(/NotYetCompletableBySender.*/g);
      }
      const window = (await randomizer.getDisputeWindow(request.id));
      const currentBlock = await ethers.provider.getBlockNumber();
      await hre.network.provider.send("hardhat_mine", [ethers.utils.hexValue(Number(window[0]) + (20 * 4) - Number(currentBlock)), ethers.utils.hexValue(60)]);
      await hre.network.provider.send("hardhat_mine", [ethers.utils.hexValue(2), ethers.utils.hexValue(60)]);
      await randomizer.connect(signers[7]).completeOptimistic(data.addresses, data.rawUints, request.seed);
      const result = await randomizer.getResult(request.id);
      expect(result).to.not.equal(ethers.constants.HashZero);
    }
    await completeWithNonBeacon();

    // Complete with sequencer
    const completeWithSequencer = async () => {
      // Complete with a non-beacon
      const { request, data } = await createAndFillAllOptimisticRequest();
      // Get a signer that is not in selectedSigners
      try {
        await randomizer.connect(signers[6]).completeOptimistic(data.addresses, data.rawUints, request.seed);
        expect(true).to.be.false;
      } catch (e) {
        expect(e).to.match(/NotYetCompletableBySender.*/g);
      }
      const window = (await randomizer.getDisputeWindow(request.id));
      const currentBlock = await ethers.provider.getBlockNumber();
      await hre.network.provider.send("hardhat_mine", [ethers.utils.hexValue(Number(window[0]) + (20 * 4) - Number(currentBlock)), ethers.utils.hexValue(60)]);
      await randomizer.connect(signers[6]).completeOptimistic(data.addresses, data.rawUints, request.seed);
      const result = await randomizer.getResult(request.id);
      expect(result).to.not.equal(ethers.constants.HashZero);
    }
    await completeWithSequencer();
  });

  it("fail dispute when request is already finalized", async function () {
    const req = await createAndFillFalseOptimisticRequest();
    const { signer, selectedSigners } = req;
    const wrongData = req.data;
    let request = req.request;
    let data = await vrfHelper.getSubmitData(selectedSigners[1].address, request);
    const submitTx = await randomizer.connect(selectedSigners[1])['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(selectedSigners[1].address), data.addresses, data.uints, request.seed, true);
    const receipt = await submitTx.wait();
    let selectedFinalBeacon;
    const requestEventRaw = receipt.logs.find(log => randomizer.interface.parseLog(log).name === "RequestBeacon");

    // Process RequestBeacon event (from 2nd-to-last submitter)
    if (requestEventRaw) {
      const requestEvent = randomizer.interface.parseLog(requestEventRaw);
      selectedFinalBeacon = requestEvent.args.beacon;
      expect(selectedFinalBeacon).to.not.equal(ethers.constants.AddressZero);
      request.beacons = [request.beacons[0], request.beacons[1], selectedFinalBeacon];
      request.timestamp = requestEvent.args.timestamp;
      request.height = requestEventRaw.blockNumber;
    }
    const finalSigner = signers.filter(signer => selectedFinalBeacon == signer.address)[0];
    data = await vrfHelper.getSubmitData(finalSigner.address, request);
    await randomizer.connect(finalSigner)['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](2, data.addresses, data.uints, request.seed, true);
    await hre.network.provider.send("hardhat_mine", [ethers.utils.hexValue(100), ethers.utils.hexValue(100)]);

    await randomizer.completeOptimistic(data.addresses, data.rawUints, request.seed)

    try {
      await randomizer.connect(finalSigner).dispute(request.beacons.indexOf(signer.address), data.addresses, wrongData.uints, request.seed);
      expect(true).to.be.false;
    } catch (e) {
      expect(e).to.match(/RequestDataMismatch.*/g);
      expect(e).to.match(/.*0x0000000000000000000000000000000000000000000000000000000000000000.*/g);
    }
  });
});
