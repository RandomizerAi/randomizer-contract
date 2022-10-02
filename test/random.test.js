const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const vrfHelper = require("./helpers.js");

// const hre = require("hardhat");

describe("Request & Submit", function () {

  const signAndCallback = async (request, client) => {
    if (!client) client = testCallback;
    // Get beacons
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));

    for (const signer of selectedSigners) {
      // await randomizer.testCharge(testCallback.address, signer.address, 1);
      const data = await vrfHelper.getSubmitData(signer.address, request);
      const tx = await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(signer.address), data.addresses, data.uints, request.seed, false);

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
        request.height = requestEvent.args.height;
      }
    }

    const finalSigner = signers.filter(signer => selectedFinalBeacon == signer.address)[0];
    const data = await vrfHelper.getSubmitData(finalSigner.address, request);
    const tx = await randomizer.connect(finalSigner)['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(finalSigner.address), data.addresses, data.uints, request.seed, false);
    return await tx.wait();
  }

  let signers;
  let randomizer;
  let testCallback;
  let vrf;

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
    randomizer = await Randomizer.deploy([ethers.constants.AddressZero, ethers.constants.AddressZero], ["500000000000000000", 20, 900, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3], [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address], ecKeys, [570000, 90000, 65000, 21000, 21000, 21000, 21000]);
    await randomizer.deployed();
    vrfHelper.init(vrf, randomizer);
    const TestCallback = await ethers.getContractFactory("TestCallback");
    testCallback = await TestCallback.deploy(randomizer.address);

  });

  it("make deposit and a new random request", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    /*  uint256 _minPrioFee,
        uint256 _callbackGasLimit,
        uint256 _numberOfBeacons,
        bytes32 _seed */
    expect(await randomizer.clientBalanceOf(testCallback.address)).to.equal(ethers.utils.parseEther("5"));
    const tx = await testCallback.makeRequest();
    const res = await tx.wait();
    const request = randomizer.interface.parseLog(res.logs[0]).args.request;
    // const request = await randomizer.getRequest(1);
    expect(request.beacons[0]).to.not.equal(ethers.constants.AddressZero);
    expect(request.beacons.length).to.equal(3);
  });

  it("revert on request with gas limit out of bounds", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
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
    let request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id };

    const selectedBeacons = request.beacons;
    const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));
    const signer = selectedSigners[0];

    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);
    // Regex to match the string "RequestDataMismatch" and any infinite characters after


    try {
      await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](2, data.addresses, data.uints, request.seed, false);
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
    let request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id };

    const selectedBeacons = request.beacons;
    const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));
    const signer = selectedSigners[0];

    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);
    // Regex to match the string "RequestDataMismatch" and any infinite characters after


    try {
      await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](2, data.addresses, data.uints, request.seed, false);
      expect(true).to.equal(false, "Transaction should have reverted");
    } catch (e) {
      expect(e).to.match(/BeaconNotSelected.*/g);
    }
  });

  it("non-optimistic make multiple deposits and random requests", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    /*  uint256 _minPrioFee,
        uint256 _callbackGasLimit,
        uint256 _numberOfBeacons,
        bytes32 _seed */
    expect(await randomizer.clientBalanceOf(testCallback.address)).to.equal(ethers.utils.parseEther("5"));

    for (let i = 1; i < 3; i++) {
      let req = await testCallback.makeRequest();
      const res = await req.wait();
      // Get request data
      let request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id };
      expect(request.beacons.length).to.equal(3);
      const message = ethers.utils.arrayify(request.seed);

      const selectedBeacons = request.beacons;
      const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));
      // Sign some requests but don't finish
      for (const signer of selectedSigners) {
        const proof = vrfHelper.prove(signer.address, message);
        const publicKeys = vrfHelper.getVrfPublicKeys(signer.address);
        const params = await vrf.computeFastVerifyParams(
          publicKeys,
          proof,
          request.seed
        );

        let uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit];
        uintData = uintData.concat(proof, params[0], params[1]);

        const addressData = [request.client].concat(request.beacons);
        const tx = await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](selectedBeacons.indexOf(signer.address), addressData, uintData, message, false);
        const sigs = await randomizer.getRequestVrfHashes(request.id);
        let signed = false;
        expect(sigs.length).to.equal(3);
        for (const sig of sigs) {
          const bytes32Zeroes = ethers.utils.hexZeroPad(ethers.utils.hexlify(0), 32);
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
    let request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id };

    const selectedBeacons = request.beacons;
    const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));
    const signer = selectedSigners[0];
    request.ethReserved = 123;

    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);
    // Regex to match the string "RequestDataMismatch" and any infinite characters after


    try {
      const tx = await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](selectedBeacons.indexOf(signer.address), data.addresses, data.uints, request.seed, false);
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
    let request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id };

    const selectedBeacons = request.beacons;
    const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));
    const signer = selectedSigners[0];


    await randomizer._debug_setSBeacon(signer.address, 99, 2);

    // check that beacon returns 99 consecutiveSubmissions and 2 strikes
    let beacon = await randomizer.getBeacon(signer.address);
    expect(beacon.strikes).to.equal(2);
    expect(beacon.consecutiveSubmissions).to.equal(99);


    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);
    await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](selectedBeacons.indexOf(signer.address), data.addresses, data.uints, request.seed, false);
    beacon = await randomizer.getBeacon(signer.address);
    expect(beacon.strikes).to.equal(0);
    expect(beacon.consecutiveSubmissions).to.equal(0);
  });

  it("accept random submissions from beacons and finally callback", async function () {
    // const tx = await signers[4].sendTransaction({ to: subscriber.address, value: ethers.utils.parseEther("1") });
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();

    const req = await testCallback.makeRequest();
    const res = await req.wait();
    let request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id };

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

    for (const signer of selectedSigners) {
      // Generate vrf proof
      // const message = ethers.utils.toUtf8Bytes('73616d706c65');
      const proof = vrfHelper.prove(signer.address, message);
      const publicKeys = vrfHelper.getVrfPublicKeys(signer.address);
      const params = await vrf.computeFastVerifyParams(
        publicKeys,
        proof,
        message
      );
      const verify = await vrf.fastVerify(publicKeys, proof, message, params[0], params[1]);
      expect(verify).to.be.true;

      // const messageHash = ethers.utils.keccak256(
      //   ethers.utils.defaultAbiCoder.encode(
      //     ["address", "uint256", "uint256", "uint256"],
      //     [request.client, 1, proof[0], proof[1]]
      //   )
      // );
      // console.log("ENCODED");


      // console.log("getting message hash");
      // // await randomizer.testCharge(testCallback.address, signer.address, 1);
      // let messageHashBytes = ethers.utils.arrayify(messageHash);

      // const flatSig = await signer.signMessage(messageHashBytes);
      // const sig = ethers.utils.splitSignature(flatSig);


      let uintData = [1, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit];
      uintData = uintData.concat(proof, params[0], params[1]);
      const addressData = [request.client].concat(request.beacons);
      // const bytesData = [sig.r, sig.s];
      const tx = await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(signer.address), addressData, uintData, message, false);
      const res = await tx.wait();
      // const requestEvent = res.logs.find(log => randomizer.interface.parseLog(log).name === "Request");
      const requestHash = await randomizer.gammaToHash(proof[0], proof[1]);
      const index = request.beacons.indexOf(signer.address);
      localSignatures[index] = requestHash;
      const requestSignatures = await randomizer.getRequestVrfHashes(request.id);
      expect(requestSignatures).to.include(requestHash);

      const beaconEventRaw = res.logs.find(log => randomizer.interface.parseLog(log).name === "RequestBeacon");
      if (beaconEventRaw !== undefined) {
        const beaconEvent = randomizer.interface.parseLog(beaconEventRaw);
        console.log("Request Beacon");
        // Check that the beacon is the one we expect
        const allBeacons = await randomizer.getBeacons();
        let seed = ethers.utils.solidityKeccak256(
          ["bytes32", "bytes32"],
          [requestSignatures[0], requestSignatures[1]]
        );

        const getRandomBeacon = (seed) => {
          let seedBytes = ethers.utils.arrayify(seed);
          const seedBigNumber = ethers.BigNumber.from(seedBytes);
          // Select a random allBeacon using seedUint as a seed for modulo
          let randomBeacon = allBeacons[seedBigNumber.mod(allBeacons.length - 1).add(1).toNumber()];
          // Check if randomBeacon is in request.beacons
          if (request.beacons.includes(randomBeacon)) {
            seed = ethers.utils.keccak256(
              ethers.utils.defaultAbiCoder.encode(["bytes32"], [seed]));
            return getRandomBeacon(seed);
          } else {
            return randomBeacon;
          }
        }
        const randomBeacon = getRandomBeacon(seed);
        selectedFinalBeacon = beaconEvent.args.beacon;
        expect(selectedFinalBeacon).to.not.equal(ethers.constants.AddressZero);
        expect(selectedFinalBeacon).to.equal(randomBeacon);
        request.beacons = [request.beacons[0], request.beacons[1], selectedFinalBeacon];
        request.timestamp = beaconEvent.args.timestamp;
        request.height = beaconEvent.args.height;
      }

    }

    // const selectedFinalBeacon = await randomizer.getFinalBeacon(1);
    // expect(selectedFinalBeacon).to.not.equal(ethers.constants.AddressZero);
    const finalSigner = signers.filter(signer => selectedFinalBeacon == signer.address)[0];

    const publicKeys = vrfHelper.getVrfPublicKeys(finalSigner.address);
    const proof = vrfHelper.prove(finalSigner.address, message);
    const proofHash = await randomizer.gammaToHash(proof[0], proof[1]);
    const params = await vrf.computeFastVerifyParams(
      publicKeys,
      proof,
      message
    );

    let uintData = [1, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit];
    uintData = uintData.concat(proof, params[0], params[1]);
    const addressData = [request.client].concat(request.beacons);

    // const requestSignatures = await randomizer.getRequestSignatures(1);

    const tx = await randomizer.connect(finalSigner)['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(finalSigner.address), addressData, uintData, message, false);
    await tx.wait();

    const callbackResult = await testCallback.result();

    const result =
      ethers.utils.solidityKeccak256(
        ["bytes32", "bytes32", "bytes32"],
        [localSignatures[0], localSignatures[1], proofHash]
      );


    expect(callbackResult).to.not.equal(ethers.constants.HashZero);
    expect(callbackResult).to.equal(result);

    expect(((await randomizer.getRequestFeeStats(1))[0]).toNumber() > request.beaconFee * 3).to.be.true;
  });

  it("charge enough per submit to cover gas cost and let beacon withdraw [ @skip-on-coverage ]", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();

    const req = await testCallback.makeRequest();
    const res = await req.wait();
    let request = vrfHelper.parseRequest(res);

    const selectedBeacons = request.beacons;

    const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));

    let selectedFinalBeacon;
    for (const signer of selectedSigners) {
      const data = await vrfHelper.getSubmitData(signer.address, request);

      const tx = await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](selectedBeacons.indexOf(signer.address), data.addresses, data.uints, request.seed, false);

      const receipt = await tx.wait();
      const receiptBlockBaseFee = (await ethers.provider.getBlock(receipt.blockNumber)).baseFeePerGas;
      const gasPaid = receiptBlockBaseFee.mul(receipt.gasUsed).add(request.beaconFee);
      const beaconStake = await randomizer.getBeaconStakeEth(signer.address);
      expect(beaconStake.gte(gasPaid)).to.be.true;
      const requestEventRaw = receipt.logs.find(log => randomizer.interface.parseLog(log).name === "RequestBeacon");

      if (requestEventRaw) {
        const requestEvent = randomizer.interface.parseLog(requestEventRaw);
        selectedFinalBeacon = requestEvent.args.beacon;
        expect(selectedFinalBeacon).to.not.equal(ethers.constants.AddressZero);
        request.beacons = [request.beacons[0], request.beacons[1], selectedFinalBeacon];
        request.timestamp = requestEvent.args.timestamp;
        request.height = requestEvent.args.height;
      }
    }

    const finalSigner = signers.filter(signer => selectedFinalBeacon == signer.address)[0];
    const data = await vrfHelper.getSubmitData(finalSigner.address, request);
    const tx = await randomizer.connect(finalSigner)['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(finalSigner.address), data.addresses, data.uints, request.seed, false);
    const receipt = await tx.wait();
    const result = await randomizer.getResult(request.id);
    expect(result).to.not.equal(ethers.constants.HashZero);
    const receiptBlockBaseFee = (await ethers.provider.getBlock(receipt.blockNumber)).baseFeePerGas;
    const minFee = receiptBlockBaseFee.mul(receipt.gasUsed).add(request.beaconFee);
    const balance = await randomizer.getBeaconStakeEth(finalSigner.address);
    expect(balance.gte(minFee)).to.be.true;
  });

  it("fail client withdraw when it has pending requests", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    const req = await testCallback.makeRequest();
    const res = await req.wait();
    const request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id };
    let ethReserved = await randomizer.getEthReserved(testCallback.address);
    expect(ethReserved.gt(0)).to.be.true;
    try {
      await testCallback.randomizerWithdraw(ethers.utils.parseEther("5"));
      expect(true).to.be.false;
    } catch (e) {
      expect(e.message).to.include(`WithdrawingTooMuch(${ethers.utils.parseEther("5").toString()}, ${ethers.utils.parseEther("5").sub(await randomizer.getEthReserved(testCallback.address)).toString()})`);
    }

    await signAndCallback(request);
    ethReserved = await randomizer.getEthReserved(testCallback.address);
    expect(ethReserved.eq(0)).to.be.true;
    try {
      await testCallback.randomizerWithdraw(ethers.utils.parseEther("5"));
      expect(true).to.be.false;
    } catch (e) {
      expect(e.message).to.include(`WithdrawingTooMuch(${ethers.utils.parseEther("5").toString()}, ${(await randomizer.clientBalanceOf(testCallback.address)).toString()})`);
    }
    const remaining = await randomizer.clientBalanceOf(testCallback.address);
    try {
      await testCallback.randomizerWithdraw(remaining);
    } catch (e) {
      expect(true).to.be.false(e);
    }
    expect((await randomizer.clientBalanceOf(testCallback.address)).eq(0)).to.be.true;
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
    const request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id };
    const lastTx = await signAndCallback(request, testCallbackWithRevert);
    const callbackFailedEvent = randomizer.interface.parseLog(lastTx.logs.find(log => randomizer.interface.parseLog(log).name === "CallbackFailed"));
    expect(callbackFailedEvent).to.not.be.undefined;
    expect(callbackFailedEvent.args.id).to.equal(request.id);
    // Except getResult(request.id) to return not be bytes32(0)
    const result = await randomizer.getResult(request.id);
    expect(result).to.not.equal(ethers.constants.HashZero);
  });

  it("complete submitRandom even if the callback runs out of gas", async function () {
    // Deploy contract TestCallbackWithTooMuchGas
    const TestCallbackWithTooMuchGas = await ethers.getContractFactory("TestCallbackWithTooMuchGas");
    const testCallbackWithTooMuchGas = await TestCallbackWithTooMuchGas.deploy(randomizer.address);
    await testCallbackWithTooMuchGas.deployed();
    const deposit = await randomizer.clientDeposit(testCallbackWithTooMuchGas.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    const req = await testCallbackWithTooMuchGas.makeRequest();
    const res = await req.wait();
    const request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id };
    const lastTx = await signAndCallback(request, testCallbackWithTooMuchGas);
    // Check if lastTx emitted "CallbackFailed" event
    const callbackFailedEvent = randomizer.interface.parseLog(lastTx.logs.find(log => randomizer.interface.parseLog(log).name === "CallbackFailed"));
    expect(callbackFailedEvent).to.not.be.undefined;
    expect(callbackFailedEvent.args.id).to.equal(request.id);
    // Except getResult(request.id) to return not be bytes32(0)
    const result = await randomizer.getResult(request.id);
    expect(result).to.not.equal(ethers.constants.HashZero);
  });

  it("non-optimistic revert with NotEnoughBeaconsAvailable when second-to-last beacon calls submitRandom with all other beacons unregistered", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    const req = await testCallback.makeRequest();
    const res = await req.wait();
    let request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id };
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));
    selectedSigners.sort((a, b) => {
      return request.beacons.indexOf(a.address) - request.beacons.indexOf(b.address);
    });

    const data1 = await vrfHelper.getSubmitData(selectedSigners[0].address, request);
    await randomizer.connect(selectedSigners[0])['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(selectedSigners[0].address), data1.addresses, data1.uints, request.seed, false);

    for (const otherSigner of signers.filter(fSigner => !request.beacons.includes(fSigner.address))) {
      if ((await randomizer.getBeacons()).includes(otherSigner.address)) {
        await randomizer.connect(otherSigner).unregisterBeacon(otherSigner.address);
      }
    }

    const data2 = await vrfHelper.getSubmitData(selectedSigners[1].address, request);
    try {
      await randomizer.connect(selectedSigners[1])['submitRandom(uint256,address[4],uint256[18],bytes32,bool)'](request.beacons.indexOf(selectedSigners[1].address), data2.addresses, data2.uints, request.seed, false);
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
      if ((await randomizer.getBeacons()).includes(signer.address)) {
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

});
