const { expect } = require("chai");
const { ethers } = require("hardhat");
const vrfHelper = require("./helpers.js");
const { deployDiamond } = require('../scripts/deploy.js')
const randomizerAbi = require("../abi/Randomizer.json").abi;
// const hre = require("hardhat");
const {
  getSelectors,
  FacetCutAction,
} = require('../scripts/libraries/diamond.js');

// Hardhat doesn't support custom errors returned by delegatecall contracts, but solidity-coverage does
// Test with yarn hardhat coverage --testfiles "test/random.test.ts"	

describe("Confirmations", function () {

  const signAndCallback = async (request, client) => {
    if (!client) client = testCallback;
    // Get beacons
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));

    for (const signer of selectedSigners) {
      // await randomizer.testCharge(testCallback.address, signer.address, 1);
      const data = await vrfHelper.getSubmitData(signer.address, request);
      const tx = await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(signer.address), data.addresses, data.uints, request.seed);

      const res = await tx.wait();

      // Process RequestBeacon event (from 2nd-to-last submitter)
      const requestEventRaw = res.logs.find(log => randomizer.interface.parseLog(log).name === "RequestBeacon");

      // Process RequestBeacon event (from 2nd-to-last submitter)
      if (requestEventRaw) {
        const requestEvent = randomizer.interface.parseLog(res.logs.find(log => randomizer.interface.parseLog(log).name === "RequestBeacon"));
        selectedFinalBeacon = requestEvent.args.beacon;
        expect(selectedFinalBeacon).to.not.equal(ethers.constants.AddressZero);
        request.beacons = [request.beacons[0], request.beacons[1], selectedFinalBeacon];
        request.timestamp = requestEvent.args.timestamp;
        request.height = requestEventRaw.blockNumber;
        request.seed = requestEvent.args.seed;

      }
    }

    const finalSigner = signers.filter(signer => selectedFinalBeacon == signer.address)[0];
    const data = await vrfHelper.getSubmitData(finalSigner.address, request);
    const tx = await randomizer.connect(finalSigner)['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(finalSigner.address), data.addresses, data.uints, request.seed);
    return await tx.wait();
  }

  let signers;
  let randomizer;
  let testCallback;
  let storageController;
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
    // const Randomizer = await ethers.getContractFactory("Randomizer");

    let ecKeys = [];
    let i = 0;
    while (i < 6) {
      const keys = vrfHelper.getVrfPublicKeys(signers[i].address);
      ecKeys = ecKeys.concat(keys);
      i++;
    }
    diamondAddress = await deployDiamond([signers[0].address, signers[0].address, ["500000000000000000", 20, 900, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3, 99, 1, 45], [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address], ecKeys, [90000, 95000, 85000, 810000, 3500]])
    const diamondCutFacet = await ethers.getContractAt('DiamondCutFacet', diamondAddress)
    const StorageControlFacet = await ethers.getContractFactory('StorageControlFacet')
    const storageControlFacet = await StorageControlFacet.deploy()
    await storageControlFacet.deployed()
    const selectors = getSelectors(storageControlFacet)
    tx = await diamondCutFacet.diamondCut(
      [{
        facetAddress: storageControlFacet.address,
        action: FacetCutAction.Add,
        functionSelectors: selectors
      }],
      ethers.constants.AddressZero, '0x', { gasLimit: 800000 })

    // randomizer = await Randomizer.deploy([ethers.constants.AddressZero, ethers.constants.AddressZero, vrf.address, lib.address], ["500000000000000000", 20, 900, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3], [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address], ecKeys, [570000, 90000, 65000, 21000, 21000, 21000, 21000]);
    randomizer = await ethers.getContractAt(randomizerAbi, diamondAddress);
    vrfHelper.init(randomizer);
    const TestCallback = await ethers.getContractFactory("TestCallback");
    testCallback = await TestCallback.deploy(diamondAddress);
    storageController = await ethers.getContractAt('StorageControlFacet', diamondAddress)
  });



  it("revert on request with confirmations out of bounds", async function () {
    await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });

    await expect(testCallback.makeRequestWithTooManyConfirmations()).to.be.revertedWithCustomError(randomizer, "ConfirmationsOOB").withArgs(999, 1, 45);
    await expect(testCallback.makeRequestWithZeroConfirmations()).to.be.revertedWithCustomError(randomizer, "ConfirmationsOOB").withArgs(0, 1, 45);
  });


  it("accept random submissions from beacons only after 15 confirmations and finally callback", async function () {
    // const tx = await signers[4].sendTransaction({ to: subscriber.address, value: ethers.utils.parseEther("1") });
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();

    const req = await testCallback.makeRequestWith15Confirmations();
    const res = await req.wait();
    let request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id, height: res.logs[0].blockNumber };

    const selectedBeacons = request.beacons;
    expect(selectedBeacons[2]).to.equal(ethers.constants.AddressZero);

    const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));

    let selectedFinalBeacon;

    const localSignatures = [];
    const extraExcludedBeacons = [];
    const message = ethers.utils.arrayify(request.seed);

    for (const signer of selectedSigners) {
      // Generate vrf proof
      // const message = ethers.utils.toUtf8Bytes('73616d706c65');
      const proof = vrfHelper.prove(signer.address, message);
      const publicKeys = vrfHelper.getVrfPublicKeys(signer.address);
      const params = await randomizer.computeFastVerifyParams(
        publicKeys,
        proof,
        message
      );
      const verify = await randomizer.fastVerify(publicKeys, proof, message, params[0], params[1]);
      expect(verify).to.be.true;

      let uintData = [1, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations];
      uintData = uintData.concat(proof, params[0], params[1]);
      const addressData = [request.client].concat(request.beacons);
      // const bytesData = [sig.r, sig.s];

      // Expect tx to revert with MinHeightNotYetReached
      // Get current block
      if (selectedSigners.indexOf(signer) === 0) {
        const blockNumber = (await ethers.provider.getBlock()).number + 1;
        await expect(randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(signer.address), addressData, uintData, message)).to.be.revertedWithCustomError(randomizer, `MinHeightNotYetReached`).withArgs(blockNumber, ethers.BigNumber.from(request.height).add(15).toString());
        await hre.network.provider.send("hardhat_mine", [ethers.utils.hexValue(15)]);
      }

      const tx = await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(signer.address), addressData, uintData, message);
      const res = await tx.wait();
      // const requestEvent = res.logs.find(log => randomizer.interface.parseLog(log).name === "Request");
      let requestHash = ethers.utils.solidityKeccak256(["uint256", "uint256"], [proof[0], proof[1]]);
      // Convert requestHash bytes32 to bytes10
      requestHash = ethers.utils.hexDataSlice(requestHash, 0, 10);
      const index = request.beacons.indexOf(signer.address);
      localSignatures[index] = requestHash;
      const requestSignatures = (await randomizer.getRequest(request.id)).vrfHashes;
      expect(requestSignatures).to.include(requestHash);

      const beaconEventRaw = res.logs.find(log => randomizer.interface.parseLog(log).name === "RequestBeacon");
      if (beaconEventRaw !== undefined) {
        const beaconEvent = randomizer.interface.parseLog(beaconEventRaw);
        // Check that the beacon is the one we expect
        const allBeacons = await randomizer.beacons();
        // Get the block of the request using ethers
        const block = await ethers.provider.getBlock(request.height);
        // Convert block.hash bytes32 to bytes10
        const blockHash = ethers.utils.hexDataSlice(block.hash, 0, 10);

        let seed = ethers.utils.solidityKeccak256(
          ["bytes10", "bytes10", "bytes10"],
          [requestSignatures[0], requestSignatures[1], blockHash]
        );


        const getRandomBeacon = (seed, excludedBeacons) => {
          // Remove excluded beacons from allBeacons
          const beacons = allBeacons.filter(beacon => !excludedBeacons.includes(beacon) && !extraExcludedBeacons.includes(beacon));
          let seedBytes = ethers.utils.arrayify(seed);
          const seedBigNumber = ethers.BigNumber.from(seedBytes);
          // Select a random allBeacon using seedUint as a seed for modulo
          let randomBeacon = beacons[seedBigNumber.mod(beacons.length).toNumber()];
          return randomBeacon;
        }

        const randomBeacon = getRandomBeacon(seed, request.beacons);
        selectedFinalBeacon = beaconEvent.args.beacon;
        expect(selectedFinalBeacon).to.not.equal(ethers.constants.AddressZero);
        expect(selectedFinalBeacon).to.equal(randomBeacon);
        request.beacons = [request.beacons[0], request.beacons[1], selectedFinalBeacon];
        request.timestamp = beaconEvent.args.timestamp;
        request.height = beaconEventRaw.blockNumber;
        request.seed = beaconEvent.args.seed;
      }

    }

    // const selectedFinalBeacon = await randomizer.getFinalBeacon(1);
    // expect(selectedFinalBeacon).to.not.equal(ethers.constants.AddressZero);
    const finalSigner = signers.filter(signer => selectedFinalBeacon == signer.address)[0];
    const newMessage = ethers.utils.arrayify(request.seed);

    const publicKeys = vrfHelper.getVrfPublicKeys(finalSigner.address);
    const proof = vrfHelper.prove(finalSigner.address, newMessage);
    let proofHash = ethers.utils.solidityKeccak256(["uint256", "uint256"], [proof[0], proof[1]]);
    // Convert proofHash bytes32 to bytes10
    proofHash = ethers.utils.hexDataSlice(proofHash, 0, 10);
    const params = await randomizer.computeFastVerifyParams(
      publicKeys,
      proof,
      newMessage
    );

    let uintData = [1, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations];
    uintData = uintData.concat(proof, params[0], params[1]);
    const addressData = [request.client].concat(request.beacons);

    const tx = await randomizer.connect(finalSigner)['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(finalSigner.address), addressData, uintData, newMessage);
    await tx.wait();

    const callbackResult = await testCallback.result();

    const result =
      ethers.utils.solidityKeccak256(
        ["bytes10", "bytes10", "bytes10"],
        [localSignatures[0], localSignatures[1], proofHash]
      );

    expect(callbackResult).to.not.equal(ethers.constants.HashZero);
    expect(callbackResult).to.equal(result);

    expect(((await randomizer.getFeeStats(1))[0]).toNumber() > request.beaconFee * 5).to.be.true;
  });

  it("should only accept after 15 confirmations when the request is new or height is renewed", async function () {
    // Deposit
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();

    // Request
    const req = await testCallback.makeRequestWith15Confirmations();
    let res = await req.wait();
    let request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id, height: res.logs[0].blockNumber };

    // Get beacons
    const selectedBeacons = request.beacons;

    // Get first signer
    let signer = signers.filter(signer => selectedBeacons[1] == signer.address)[0];

    const message = ethers.utils.arrayify(request.seed);
    // Generate vrf proof
    // const message = ethers.utils.toUtf8Bytes('73616d706c65');
    const proof = vrfHelper.prove(signer.address, message);
    const publicKeys = vrfHelper.getVrfPublicKeys(signer.address);
    const params = await randomizer.computeFastVerifyParams(
      publicKeys,
      proof,
      message
    );

    // Submit signature
    let data = await vrfHelper.getSubmitData(signer.address, request);
    let addressData = [request.client].concat(request.beacons);
    let uintData = [1, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations];
    uintData = uintData.concat(proof, params[0], params[1]);
    let blockNumber = await ethers.provider.getBlockNumber() + 1;
    await expect(randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(signer.address), addressData, uintData, message)).to.be.revertedWithCustomError(randomizer, `MinHeightNotYetReached`).withArgs(blockNumber, ethers.BigNumber.from(request.height).add(15).toString());

    const oldSeed = request.seed;
    await hre.network.provider.send("hardhat_mine", [ethers.utils.hexValue(15)]);
    await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(signer.address), data.addresses, data.uints, request.seed);

    // Skip blocks and renew request
    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);
    const renewUintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations];

    res = await (await randomizer.renewRequest(data.addresses, renewUintData, request.seed)).wait();

    let log = res.logs.find((log) => randomizer.interface.parseLog(log).name === "Retry");

    // Get new request data
    // request = randomizer.interface.parseLog(renewRes.logs[res.logs.length - 1]).args.request;
    let retryEvent = randomizer.interface.parseLog(res.logs.filter((log) => randomizer.interface.parseLog(log).name === "Retry")[0]);
    request = { ...retryEvent.args.request, id: retryEvent.args.id, height: log.blockNumber };
    signer = signers.filter(signer => request.beacons[0] == signer.address)[0];

    uintData = [1, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations];
    uintData = uintData.concat(proof, params[0], params[1]);
    data = await vrfHelper.getSubmitData(signer.address, request);
    addressData = [request.client].concat(request.beacons);
    blockNumber = await ethers.provider.getBlockNumber() + 1;
    expect(request.seed).to.equal(oldSeed);

    await expect(randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(signer.address), addressData, uintData, message)).to.be.revertedWithCustomError(randomizer, `MinHeightNotYetReached`).withArgs(blockNumber, ethers.BigNumber.from(request.height).add(15).toString());
    await hre.network.provider.send("hardhat_mine", [ethers.utils.hexValue(15)]);
    res = await (await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(signer.address), data.addresses, data.uints, request.seed)).wait();
    const requestEvent = randomizer.interface.parseLog(res.logs.find(log => randomizer.interface.parseLog(log).name === "RequestBeacon"));
    request.beacons = [request.beacons[0], request.beacons[1], requestEvent.args.beacon];
    request.timestamp = requestEvent.args.timestamp;
    request.height = res.blockNumber;
    request.seed = requestEvent.args.seed;
    expect(request.seed).to.not.equal(oldSeed);

    const message2 = ethers.utils.arrayify(request.seed);
    // Generate vrf proof
    // const message = ethers.utils.toUtf8Bytes('73616d706c65');
    const proof2 = vrfHelper.prove(signer.address, message);
    const publicKeys2 = vrfHelper.getVrfPublicKeys(signer.address);
    const params2 = await randomizer.computeFastVerifyParams(
      publicKeys2,
      proof2,
      message2
    );
    uintData = [1, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations];
    uintData = uintData.concat(proof, params2[0], params2[1]);
    signer = signers.filter(signer => request.beacons[2] == signer.address)[0];

    data = await vrfHelper.getSubmitData(signer.address, request);
    addressData = [request.client].concat(request.beacons);

    const snapshotId = await hre.network.provider.send("evm_snapshot", []);

    await expect(randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(signer.address), data.addresses, data.uints, request.seed)).to.be.not.revertedWithCustomError(randomizer, `MinHeightNotYetReached`);

    await hre.network.provider.send("evm_revert", [snapshotId]);

    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);

    const renewUintData2 = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations];

    res = await (await randomizer.renewRequest(data.addresses, renewUintData2, request.seed)).wait();

    log = res.logs.find((log) => randomizer.interface.parseLog(log).name === "Retry");

    // Get new request data
    // request = randomizer.interface.parseLog(renewRes.logs[res.logs.length - 1]).args.request;
    retryEvent = randomizer.interface.parseLog(res.logs.filter((log) => randomizer.interface.parseLog(log).name === "Retry")[0]);
    request = { ...retryEvent.args.request, id: retryEvent.args.id, height: log.blockNumber };
    signer = signers.filter(signer => request.beacons[2] == signer.address)[0];

    data = await vrfHelper.getSubmitData(signer.address, request);
    addressData = [request.client].concat(request.beacons);
    blockNumber = await ethers.provider.getBlockNumber() + 1;
    const message3 = ethers.utils.arrayify(request.seed);
    const proof3 = vrfHelper.prove(signer.address, message3);
    const publicKeys3 = vrfHelper.getVrfPublicKeys(signer.address);
    const params3 = await randomizer.computeFastVerifyParams(
      publicKeys3,
      proof3,
      message3
    );
    uintData = [1, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations];
    uintData = uintData.concat(proof3, params3[0], params3[1]);

    expect(request.seed).to.not.equal(oldSeed);

    // This should not revert because the request only expects the final beacon
    await (await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(signer.address), data.addresses, data.uints, request.seed)).wait();

  });

});
