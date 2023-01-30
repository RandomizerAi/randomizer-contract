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

describe("Request & Submit", function () {

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

  it("get fee estimate in front-end", async function () {
    // Get provider gasPrice
    const gasPrice = await ethers.provider.getGasPrice();
    const fee = await randomizer.estimateFeeUsingGasPrice(100000, gasPrice);
    expect(ethers.BigNumber.from(fee).isZero()).to.be.false;
  });

  it("make deposit and a new random request", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    /*  uint256 _minPrioFee,
        uint256 _callbackGasLimit,
        uint256 _numberOfBeacons,
        bytes32 _seed */
    expect((await randomizer.clientBalanceOf(testCallback.address))[0]).to.equal(ethers.utils.parseEther("5"));
    const tx = await testCallback.makeRequest();
    const res = await tx.wait();
    const id = randomizer.interface.parseLog(res.logs[0]).args.id
    const request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, height: res.logs[0].blockNumber, id };
    // const request = await randomizer.getRequest(1);
    expect(request.beacons[0]).to.not.equal(ethers.constants.AddressZero);
    expect(request.beacons.length).to.equal(3);

    const genHash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'bytes32', 'address', 'address[3]', 'uint256', 'uint256', 'uint256[2]', 'uint256', 'uint256', 'uint256', 'uint256'],
      [id, request.seed, request.client, request.beacons, request.ethReserved, request.beaconFee, [request.height, request.timestamp], request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations]
    ));
    const realHash = (await randomizer.getRequest(id)).dataHash;
    expect(genHash).to.equal(realHash);
  });

  it("revert on request with gas limit out of bounds", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });

    // try {
    //   await testCallback.makeRequestWithGasTooLow();
    // } catch (e) {
    //   console.log(e);
    // }

    // Parse the revert reason in receipt with randomizer interface

    await expect(testCallback.makeRequestWithGasTooLow()).to.be.revertedWith("CallbackGasLimitOOB(1, 10000, 3000000)");
    await expect(testCallback.makeRequestWithGasTooHigh()).to.be.revertedWith("CallbackGasLimitOOB(999999999, 10000, 3000000)");
  });

  it("revert on request with insufficient funds", async function () {
    try {
      await testCallback.makeRequest();
      expect(true).to.be.false("", "have reverted")
    } catch (e) {
      expect(e).to.match(/EthDepositTooLow.*/g);
    }
  });

  it("reverts when beaconPos does not match sender address", async () => {
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
    // Regex to match the string "RequestDataMismatch" and any infinite characters after


    try {
      await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[19],bytes32)'](2, data.addresses, data.uints, request.seed);
      expect(true).to.equal(false, "Transaction should have reverted");
    } catch (e) {
      expect(e).to.match(/BeaconNotSelected.*/g);
    }
  });

  it("reverts when beaconPos does not match sender address", async () => {
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
    // Regex to match the string "RequestDataMismatch" and any infinite characters after


    try {
      await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[19],bytes32)'](2, data.addresses, data.uints, request.seed);
      expect(true).to.equal(false, "Transaction should have reverted");
    } catch (e) {
      expect(e).to.match(/BeaconNotSelected.*/g);
    }
  });

  it("make multiple deposits and random requests", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    /*  uint256 _minPrioFee,
        uint256 _callbackGasLimit,
        uint256 _numberOfBeacons,
        bytes32 _seed */
    expect((await randomizer.clientBalanceOf(testCallback.address))[0]).to.equal(ethers.utils.parseEther("5"));

    for (let i = 1; i < 3; i++) {
      let req = await testCallback.makeRequest();
      const res = await req.wait();
      // Get request data
      let request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id, height: res.logs[0].blockNumber };
      expect(request.beacons.length).to.equal(3);
      const message = ethers.utils.arrayify(request.seed);

      const selectedBeacons = request.beacons;
      const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));
      // Sign some requests but don't finish
      for (const signer of selectedSigners) {
        const proof = vrfHelper.prove(signer.address, message);
        const publicKeys = vrfHelper.getVrfPublicKeys(signer.address);
        const params = await randomizer.computeFastVerifyParams(
          publicKeys,
          proof,
          request.seed
        );

        let uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations];
        uintData = uintData.concat(proof, params[0], params[1]);

        const addressData = [request.client].concat(request.beacons);
        const tx = await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[19],bytes32)'](selectedBeacons.indexOf(signer.address), addressData, uintData, message);
        const sigs = (await randomizer.getRequest(request.id)).vrfHashes;
        let signed = false;
        expect(sigs.length).to.equal(2);
        for (const sig of sigs) {
          const bytes32Zeroes = ethers.utils.hexZeroPad(ethers.utils.hexlify(0), 10);
          if (sig != bytes32Zeroes) {
            signed = true;
          }
        }
        expect(signed).to.equal(true);
      }
    }
  });

  it("revert with RequestDataMismatch when submitting a result with a different hash", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();

    let req = await testCallback.makeRequest();
    const res = await req.wait();
    // Get request data
    let request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id, height: res.logs[0].blockNumber };

    const selectedBeacons = request.beacons;
    const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));
    const signer = selectedSigners[0];
    request.ethReserved = 123;

    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);
    // Regex to match the string "RequestDataMismatch" and any infinite characters after


    try {
      const tx = await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[19],bytes32)'](selectedBeacons.indexOf(signer.address), data.addresses, data.uints, request.seed);
      expect(true).to.equal(false, "Transaction should have reverted");
    } catch (e) {
      expect(e).to.match(/RequestDataMismatch.*/g);
    }
  });

  it("reset strikes and consecutiveSubmissions of sBeacon after consecutiveSubmissions reaches 100", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();

    let req = await testCallback.makeRequest();
    const res = await req.wait();
    // Get request data
    let request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id, height: res.logs[0].blockNumber };

    const selectedBeacons = request.beacons;
    const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));
    const signer = selectedSigners[0];


    await storageController._debug_setSBeacon(signer.address, 99, 2);

    // check that beacon returns 99 consecutiveSubmissions and 2 strikes
    let beacon = await randomizer.beacon(signer.address);
    expect(beacon.strikes).to.equal(2);
    expect(beacon.consecutiveSubmissions).to.equal(99);


    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);
    await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[19],bytes32)'](selectedBeacons.indexOf(signer.address), data.addresses, data.uints, request.seed);
    beacon = await randomizer.beacon(signer.address);
    expect(beacon.strikes).to.equal(0);
    expect(beacon.consecutiveSubmissions).to.equal(0);
  });

  it("accept random submissions from beacons and finally callback", async function () {
    // const tx = await signers[4].sendTransaction({ to: subscriber.address, value: ethers.utils.parseEther("1") });
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();

    const req = await testCallback.makeRequest();
    const res = await req.wait();
    let request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id, height: res.logs[0].blockNumber };

    // const request = await randomizer.getRequest(1);

    /*  address _client,
        uint256 _request,
        bytes calldata _signature */

    // const gasPrice = ethers.BigNumber.from(await hre.network.provider.request({ method: "eth_gasPrice", params: [] })).toString();

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

  it("charge enough per submit to cover gas cost and let beacon withdraw [ @skip-on-coverage ]", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    // Get block gas price
    const getGasPrice = async () => {
      const block = await ethers.provider.getBlock("latest");
      return block.baseFeePerGas;
    }


    const req = await testCallback.makeRequest();
    const res = await req.wait();
    let request = vrfHelper.parseRequest(res);

    const selectedBeacons = request.beacons;

    const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));

    let selectedFinalBeacon;
    for (const signer of selectedSigners) {
      const data = await vrfHelper.getSubmitData(signer.address, request);

      const beaconStake = (await randomizer.beacon(signer.address)).ethStake;
      const gasPrice = await getGasPrice();
      const tx = await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[19],bytes32)'](selectedBeacons.indexOf(signer.address), data.addresses, data.uints, request.seed, { gasPrice });
      const receipt = await tx.wait();
      const gasPaid = gasPrice.mul(receipt.cumulativeGasUsed);

      const newBeaconStake = (await randomizer.beacon(signer.address)).ethStake;
      const earnings = ethers.BigNumber.from(newBeaconStake).sub(beaconStake);

      expect(earnings).to.be.gte(gasPaid.add(request.beaconFee));

      const requestEventRaw = receipt.logs.find(log => randomizer.interface.parseLog(log).name === "RequestBeacon");

      if (requestEventRaw) {
        const requestEvent = randomizer.interface.parseLog(requestEventRaw);
        selectedFinalBeacon = requestEvent.args.beacon;
        expect(selectedFinalBeacon).to.not.equal(ethers.constants.AddressZero);
        request.beacons = [request.beacons[0], request.beacons[1], selectedFinalBeacon];
        request.timestamp = requestEvent.args.timestamp;
        request.height = requestEventRaw.blockNumber;
        request.seed = requestEvent.args.seed;
        break;
      }
    }
    const finalSigner = signers.filter(signer => selectedFinalBeacon == signer.address)[0];

    const data = await vrfHelper.getSubmitData(finalSigner.address, request);
    const finalGasPrice = await getGasPrice();
    const beaconStake = (await randomizer.beacon(finalSigner.address)).ethStake;
    const tx = await randomizer.connect(finalSigner)['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(finalSigner.address), data.addresses, data.uints, request.seed, { gasPrice: finalGasPrice });
    const receipt = await tx.wait();
    const gasPaid = finalGasPrice.mul(receipt.cumulativeGasUsed);
    const newBeaconStake = (await randomizer.beacon(finalSigner.address)).ethStake;
    const earnings = ethers.BigNumber.from(newBeaconStake).sub(beaconStake);

    expect(earnings).to.be.gte(gasPaid.add(request.beaconFee));

    const result = (await randomizer.getRequest(request.id)).result;
    expect(result).to.not.equal(ethers.constants.HashZero);
    const receiptBlockBaseFee = (await ethers.provider.getBlock(receipt.blockNumber)).baseFeePerGas;
    const minFee = receiptBlockBaseFee.mul(receipt.gasUsed).add(request.beaconFee);
    const balance = (await randomizer.beacon(finalSigner.address)).ethStake;
    expect(balance.gte(minFee)).to.be.true;
  });

  it("fail client withdraw when it has pending requests", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    const req = await testCallback.makeRequest();
    const res = await req.wait();
    const request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id, height: res.logs[0].blockNumber };
    let ethReserved = (await randomizer.clientBalanceOf(testCallback.address))[1];
    expect(ethReserved.gt(0)).to.be.true;
    try {
      await testCallback.randomizerWithdraw(ethers.utils.parseEther("5"));
      expect(true).to.be.false;
    } catch (e) {
      expect(e.message).to.include(`WithdrawingTooMuch(${ethers.utils.parseEther("5").toString()}, ${ethers.utils.parseEther("5").sub(((await randomizer.clientBalanceOf(testCallback.address))[1]).toString())}`);
    }

    await signAndCallback(request);
    ethReserved = (await randomizer.clientBalanceOf(testCallback.address))[1];
    expect(ethReserved.eq(0)).to.be.true;
    try {
      await testCallback.randomizerWithdraw(ethers.utils.parseEther("5"));
      expect(true).to.be.false;
    } catch (e) {
      expect(e.message).to.include(`WithdrawingTooMuch(${ethers.utils.parseEther("5").toString()}, ${((await randomizer.clientBalanceOf(testCallback.address))[0]).toString()})`);
    }
    const remaining = (await randomizer.clientBalanceOf(testCallback.address))[0];
    try {
      await testCallback.randomizerWithdraw(remaining);
    } catch (e) {
      expect(true).to.be.false(e);
    }
    expect(((await randomizer.clientBalanceOf(testCallback.address))[0]).eq(0)).to.be.true;
  });

  it("complete submitRandom even if the callback reverts", async function () {
    // Deploy contract TestCallbackWithRevert
    const TestCallbackWithRevert = await ethers.getContractFactory("TestCallbackWithRevert");
    const testCallbackWithRevert = await TestCallbackWithRevert.deploy(randomizer.address);
    await testCallbackWithRevert.deployed();
    const deposit = await randomizer.clientDeposit(testCallbackWithRevert.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    const req = await testCallbackWithRevert.makeRequest();
    const res = await req.wait();
    const request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id, height: res.logs[0].blockNumber };
    const lastTx = await signAndCallback(request, testCallbackWithRevert);
    const callbackFailedEvent = randomizer.interface.parseLog(lastTx.logs.find(log => randomizer.interface.parseLog(log).name === "CallbackFailed"));
    expect(callbackFailedEvent).to.not.be.undefined;
    expect(callbackFailedEvent.args.id).to.equal(request.id);
    // Except getResult(request.id) to return not be bytes32(0)
    const result = (await randomizer.getRequest(request.id)).result;
    expect(result).to.not.equal(ethers.constants.HashZero);
  });

  it("complete submitRandom even if the callback runs out of gas", async function () {
    // Deploy contract TestCallbackWithTooMuchGas
    this.timeout(100000);
    const TestCallbackWithTooMuchGas = await ethers.getContractFactory("TestCallbackWithTooMuchGas");
    const testCallbackWithTooMuchGas = await TestCallbackWithTooMuchGas.deploy(randomizer.address);
    await testCallbackWithTooMuchGas.deployed();
    const deposit = await randomizer.clientDeposit(testCallbackWithTooMuchGas.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    const req = await testCallbackWithTooMuchGas.makeRequest();
    const res = await req.wait();
    const request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id, height: res.logs[0].blockNumber };
    const lastTx = await signAndCallback(request, testCallbackWithTooMuchGas);
    // Check if lastTx emitted "CallbackFailed" event
    const callbackFailedEvent = randomizer.interface.parseLog(lastTx.logs.find(log => randomizer.interface.parseLog(log).name === "CallbackFailed"));
    expect(callbackFailedEvent).to.not.be.undefined;
    expect(callbackFailedEvent.args.id).to.equal(request.id);
    // Except getResult(request.id) to return not be bytes32(0)
    const result = (await randomizer.getRequest(request.id)).result;
    expect(result).to.not.equal(ethers.constants.HashZero);
  });

  it("revert with NotEnoughBeaconsAvailable when second-to-last beacon calls submitRandom with all other beacons unregistered", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    const req = await testCallback.makeRequest();
    const res = await req.wait();
    let request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id, height: res.logs[0].blockNumber };
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));
    selectedSigners.sort((a, b) => {
      return request.beacons.indexOf(a.address) - request.beacons.indexOf(b.address);
    });

    const data1 = await vrfHelper.getSubmitData(selectedSigners[0].address, request);
    await randomizer.connect(selectedSigners[0])['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(selectedSigners[0].address), data1.addresses, data1.uints, request.seed);

    for (const otherSigner of signers.filter(fSigner => !request.beacons.includes(fSigner.address))) {
      if ((await randomizer.beacons()).includes(otherSigner.address)) {
        await randomizer.connect(otherSigner).unregisterBeacon(otherSigner.address);
      }
    }

    const data2 = await vrfHelper.getSubmitData(selectedSigners[1].address, request);
    try {
      await randomizer.connect(selectedSigners[1])['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(selectedSigners[1].address), data2.addresses, data2.uints, request.seed);
      expect(true).to.be.false;
    } catch (e) {
      expect(e).to.match(/NotEnoughBeaconsAvailable/g);
    }

  });

  it("revert with NotEnoughBeaconsAvailable if making a request without 5 beacons", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    // Unregister all beacons
    for (const signer of signers) {
      if ((await randomizer.beacons()).includes(signer.address)) {
        const tx = await randomizer.connect(signer).unregisterBeacon(signer.address);
        await tx.wait();
      }
    }
    // Make request
    try {
      const req = await testCallback.makeRequest();
      await req.wait();
      expect(true).to.be.false;
    } catch (e) {
      expect(e).to.match(/NotEnoughBeaconsAvailable/);
    }
  });

  it("ensure the beacon income is always more than ETH spent per submitRandom", async function () {
    // Get block basefee
    const getGasPrice = async () => {
      const block = await ethers.provider.getBlock("latest");
      return block.baseFeePerGas;
    }
    // Get the estimate fee of submitRandom
    // const tx = await signers[4].sendTransaction({ to: subscriber.address, value: ethers.utils.parseEther("1") });
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();

    const req = await testCallback.makeRequest();
    const res = await req.wait();
    let request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id, height: res.logs[0].blockNumber };

    // const request = await randomizer.getRequest(1);

    /*  address _client,
        uint256 _request,
        bytes calldata _signature */

    // const gasPrice = ethers.BigNumber.from(await hre.network.provider.request({ method: "eth_gasPrice", params: [] })).toString();

    const selectedBeacons = request.beacons;
    expect(selectedBeacons[2]).to.equal(ethers.constants.AddressZero);

    const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));

    let selectedFinalBeacon;

    const localSignatures = [];
    const message = ethers.utils.arrayify(request.seed);

    let extraExcludedBeacons = [];
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
      // Get signer eth balance
      const signerBalance = await signer.getBalance();
      const signerStake = (await randomizer.beacon(signer.address)).ethStake;
      const tx = await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(signer.address), addressData, uintData, message, { gasPrice: await getGasPrice() });
      const res = await tx.wait();
      // Get new signer eth balance
      const newSignerBalance = await signer.getBalance();
      // Get new signer stake
      const newSignerStake = (await randomizer.beacon(signer.address)).ethStake;
      // Get difference in balance
      const diff = signerBalance.sub(newSignerBalance);
      // Get difference in stake
      const stakeDiff = newSignerStake.sub(signerStake);
      // Check that the stake income is greater than the eth spent
      expect(stakeDiff).to.be.gt(diff);

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
        extraExcludedBeacons.push(randomBeacon);
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
    // Convert proofHash from bytes32 to bytes10
    proofHash = ethers.utils.hexDataSlice(proofHash, 0, 10);
    const params = await randomizer.computeFastVerifyParams(
      publicKeys,
      proof,
      newMessage
    );

    let uintData = [1, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations];
    uintData = uintData.concat(proof, params[0], params[1]);
    const addressData = [request.client].concat(request.beacons);

    // Get randomizer.beacon(finalSigner.address)
    const beacon = await randomizer.beacon(finalSigner.address);
    const beaconStake = beacon.ethStake;

    // Register 100 beacon addresses
    for (let i = 0; i < 100; i++) {
      const beaconAddress = ethers.Wallet.createRandom().address;
      // Set balance of each beacon to 100 ETH
      await ethers.provider.send("hardhat_setBalance", [beaconAddress, ethers.utils.parseEther("10").toHexString()]);
      await randomizer.beaconStakeEth(beaconAddress, { value: ethers.utils.parseEther("10") });
      const publicKeys = vrfHelper.getVrfPublicKeys(beaconAddress);
      await randomizer.registerBeacon(beaconAddress, publicKeys);
    }

    // Get finalSigner ETH balance
    const finalSignerBalance = await ethers.provider.getBalance(finalSigner.address);

    const tx = await randomizer.connect(finalSigner)['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(finalSigner.address), addressData, uintData, newMessage, { gasPrice: await getGasPrice() });
    await tx.wait();

    // Get total gas fee paid in tx
    const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash);

    // Get new beacon stake
    const newBeaconStake = (await randomizer.beacon(finalSigner.address)).ethStake;

    const earnings = ethers.BigNumber.from(newBeaconStake).sub(beaconStake);

    // Get new finalSigner eth balance
    const newFinalSignerBalance = await ethers.provider.getBalance(finalSigner.address);

    const ethSpent = finalSignerBalance.sub(newFinalSignerBalance);

    // Check that the beacon stake has increased by the same or more than the gas fee paid
    expect(earnings).to.be.gte(ethSpent);

    const callbackResult = await testCallback.result();

    const result =
      ethers.utils.solidityKeccak256(
        ["bytes10", "bytes10", "bytes10"],
        [localSignatures[0], localSignatures[1], proofHash]
      );

    expect(callbackResult).to.not.equal(ethers.constants.HashZero);
    expect(callbackResult).to.equal(result);

    expect(((await randomizer.getFeeStats(1))[0]).toString() > request.beaconFee * 5).to.be.true;

  });
});
