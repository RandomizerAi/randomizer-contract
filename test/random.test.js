const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
// const hre = require("hardhat");

describe("Request & Submit", function () {

  const signAndCallback = async (request, client) => {
    if (!client) client = testCallback;
    // Get beacons
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));

    // Generate message
    const messageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes32"],
        [request.client, request.id ? request.id : 1, request.seed]
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
    return await tx.wait();
  }

  let signers;
  let soRandom;
  let testCallback;
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
    const SoRandom = await ethers.getContractFactory("SoRandomWithStorageControls");
    soRandom = await SoRandom.deploy(ethers.constants.AddressZero, 3, "500000000000000000", 20, 900, 50000, 2000000, ethers.utils.parseEther("0.00005"), [signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address, signers[6].address]);
    await soRandom.deployed();
    const TestCallback = await ethers.getContractFactory("TestCallback");
    testCallback = await TestCallback.deploy(soRandom.address);

  });

  it("make deposit and a new random request", async function () {
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    /*  uint256 _minPrioFee,
        uint256 _callbackGasLimit,
        uint256 _numberOfBeacons,
        bytes32 _seed */
    expect(await soRandom.clientBalanceOf(testCallback.address)).to.equal(ethers.utils.parseEther("5"));
    const tx = await testCallback.makeRequest();
    const res = await tx.wait();
    const request = soRandom.interface.parseLog(res.logs[0]).args.request;
    // const request = await soRandom.getRequest(1);
    expect(request.beacons[0]).to.not.equal(ethers.constants.AddressZero);
    expect(request.beacons.length).to.equal(3);
  });

  it("revert on requestRandom with gas limit out of bounds", async function () {
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    await expect(testCallback.makeRequestWithGasTooLow()).to.be.revertedWith("CallbackGasLimitOOB(1, 50000, 2000000)");
    await expect(testCallback.makeRequestWithGasTooHigh()).to.be.revertedWith("CallbackGasLimitOOB(999999999, 50000, 2000000)");
  });

  it("revert on requestRandom with insufficient funds", async function () {
    try {
      await testCallback.makeRequest();
      expect(true).to.be.false("", "have reverted")
    } catch (e) {
      expect(e).to.match(/EthDepositTooLow.*/g);
    }
  });

  it("make multiple deposits and random requests", async function () {
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    /*  uint256 _minPrioFee,
        uint256 _callbackGasLimit,
        uint256 _numberOfBeacons,
        bytes32 _seed */
    expect(await soRandom.clientBalanceOf(testCallback.address)).to.equal(ethers.utils.parseEther("5"));

    for (let i = 1; i < 10; i++) {
      let req = await testCallback.makeRequest();
      const res = await req.wait();
      // Get request data
      let request = { ...soRandom.interface.parseLog(res.logs[0]).args.request, id: soRandom.interface.parseLog(res.logs[0]).args.id };
      expect(request.beacons.length).to.equal(3);

      const selectedBeacons = request.beacons;
      const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));
      // Sign some requests but don't finish
      for (const signer of selectedSigners) {
        const messageHash = ethers.utils.keccak256(
          ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "bytes32"],
            [request.client, i, request.seed]
          )
        );

        const messageHashBytes = ethers.utils.arrayify(messageHash);
        const flatSig = await signer.signMessage(messageHashBytes);
        const sig = ethers.utils.splitSignature(flatSig);
        const uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit, sig.v];
        const addressData = [request.client].concat(request.beacons);
        const bytesData = [sig.r, sig.s, request.seed];
        await soRandom.connect(signer).submitRandom(addressData, uintData, bytesData);
        const sigs = await soRandom.getRequestSignatures(request.id);
        let signed = false;
        expect(sigs.length).to.equal(3);
        for (const sig of sigs) {
          if (sig != "0x000000000000000000000000") {
            signed = true;
          }
        }
        expect(signed).to.equal(true);
      }
    }
  });

  it("revert with RequestDataMismatch when submitting a result with a different hash", async function () {
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();

    let req = await testCallback.makeRequest();
    const res = await req.wait();
    // Get request data
    let request = { ...soRandom.interface.parseLog(res.logs[0]).args.request, id: soRandom.interface.parseLog(res.logs[0]).args.id };

    const selectedBeacons = request.beacons;
    const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));
    const signer = selectedSigners[0];
    // Sign some requests but don't finish
    const messageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes32"],
        [request.client, request.id, request.seed]
      )
    );

    const messageHashBytes = ethers.utils.arrayify(messageHash);
    const flatSig = await signer.signMessage(messageHashBytes);
    const sig = ethers.utils.splitSignature(flatSig);
    // gasLimit is replaced with incorrect value
    const uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, 1234, sig.v];
    const addressData = [request.client].concat(request.beacons);
    const bytesData = [sig.r, sig.s, request.seed];

    // Regex to match the string "RequestDataMismatch" and any infinite characters after

    try {
      await soRandom.connect(signer).submitRandom(addressData, uintData, bytesData)
      expect(true).to.equal(false, "Transaction should have reverted");
    } catch (e) {
      expect(e).to.match(/RequestDataMismatch.*/g);
    }
  });

  it("reset strikes and consecutiveSubmissions of sBeacon after consecutiveSubmissions reaches 100", async function () {
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();

    let req = await testCallback.makeRequest();
    const res = await req.wait();
    // Get request data
    let request = { ...soRandom.interface.parseLog(res.logs[0]).args.request, id: soRandom.interface.parseLog(res.logs[0]).args.id };

    const selectedBeacons = request.beacons;
    const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));
    const signer = selectedSigners[0];
    // Sign some requests but don't finish
    const messageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes32"],
        [request.client, request.id, request.seed]
      )
    );

    await soRandom._debug_setSBeacon(signer.address, 99, 2);

    // check that beacon returns 99 consecutiveSubmissions and 2 strikes
    let beacon = await soRandom.getBeacon(signer.address);
    expect(beacon.strikes).to.equal(2);
    expect(beacon.consecutiveSubmissions).to.equal(99);

    const messageHashBytes = ethers.utils.arrayify(messageHash);
    const flatSig = await signer.signMessage(messageHashBytes);
    const sig = ethers.utils.splitSignature(flatSig);
    // gasLimit is replaced with incorrect value
    const uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit, sig.v];
    const addressData = [request.client].concat(request.beacons);
    const bytesData = [sig.r, sig.s, request.seed];


    await soRandom.connect(signer).submitRandom(addressData, uintData, bytesData)
    beacon = await soRandom.getBeacon(signer.address);
    expect(beacon.strikes).to.equal(0);
    expect(beacon.consecutiveSubmissions).to.equal(0);
  });

  it("accept random submissions from beacons and finally callback", async function () {
    // const tx = await signers[4].sendTransaction({ to: subscriber.address, value: ethers.utils.parseEther("1") });
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();

    const req = await testCallback.makeRequest();
    const res = await req.wait();
    let request = { ...soRandom.interface.parseLog(res.logs[0]).args.request, id: soRandom.interface.parseLog(res.logs[0]).args.id };

    // const request = await soRandom.getRequest(1);

    /*  address _client,
        uint256 _request,
        bytes calldata _signature */

    // const gasPrice = ethers.BigNumber.from(await hre.network.provider.request({ method: "eth_gasPrice", params: [] })).toString();

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

    const localSignatures = [];
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

      const requestHash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["uint8", "bytes32", "bytes32"],
          [sig.v, sig.r, sig.s]
        )
      );

      const requestHashBytes = ethers.utils.arrayify(requestHash);
      const requestHashHex = ethers.utils.hexlify(requestHashBytes);
      const requestHashBytes12 = ethers.utils.hexDataSlice(requestHashHex, 0, 12);
      const requestHash12 = ethers.utils.hexlify(requestHashBytes12);
      const requestSignatures = await soRandom.getRequestSignatures(request.id);
      expect(requestSignatures.includes(requestHash12)).to.be.true;
      const index = request.beacons.indexOf(signer.address);
      localSignatures[index] = requestHash12;
      if (requestEvent.name == "RequestBeacon") {
        // Check that the beacon is the one we expect
        const allBeacons = await soRandom.getBeacons();
        let seed = ethers.utils.keccak256(
          ethers.utils.defaultAbiCoder.encode(
            ["bytes12", "bytes12"],
            [requestSignatures[0], requestSignatures[1]]
          )
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
        selectedFinalBeacon = requestEvent.args.beacon;
        expect(selectedFinalBeacon).to.not.equal(ethers.constants.AddressZero);
        expect(selectedFinalBeacon).to.equal(randomBeacon);
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

    const requestSignatures = await soRandom.getRequestSignatures(1);

    const tx = await soRandom.connect(finalSigner).submitRandom(addressData, uintData, bytesData);
    await tx.wait();

    const callbackResult = await testCallback.result();


    const requestHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["uint8", "bytes32", "bytes32"],
        [sig.v, sig.r, sig.s]
      )
    );

    const requestHashBytes = ethers.utils.arrayify(requestHash);
    const requestHashHex = ethers.utils.hexlify(requestHashBytes);
    const requestHashBytes12 = ethers.utils.hexDataSlice(requestHashHex, 0, 12);
    const hash = ethers.utils.hexlify(requestHashBytes12);




    const result = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["bytes12", "bytes12", "bytes12"],
        [localSignatures[0], localSignatures[1], hash]
      ));


    expect(callbackResult).to.not.equal(ethers.constants.HashZero);
    expect(callbackResult).to.equal(result);
  });

  it("charge enough per submit to cover gas cost and let beacon withdraw [ @skip-on-coverage ]", async function () {
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();

    const req = await testCallback.makeRequest();
    const res = await req.wait();
    let request = { ...soRandom.interface.parseLog(res.logs[0]).args.request, id: soRandom.interface.parseLog(res.logs[0]).args.id };

    const messageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes32"],
        [request.client, 1, request.seed]
      )
    );

    const selectedBeacons = request.beacons;

    const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));
    const messageHashBytes = ethers.utils.arrayify(messageHash);

    let selectedFinalBeacon;
    for (const signer of selectedSigners) {
      const flatSig = await signer.signMessage(messageHashBytes);
      const sig = ethers.utils.splitSignature(flatSig);
      const uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit, sig.v];
      const addressData = [request.client].concat(request.beacons);
      const bytesData = [sig.r, sig.s, request.seed];
      const tx = await soRandom.connect(signer).submitRandom(addressData, uintData, bytesData);
      const receipt = await tx.wait();
      const receiptBlockBaseFee = (await ethers.provider.getBlock(receipt.blockNumber)).baseFeePerGas;
      const gasPaid = receiptBlockBaseFee.mul(receipt.gasUsed).add(request.beaconFee);
      const beaconStake = await soRandom.getBeaconStakeEth(signer.address);
      expect(beaconStake.gte(gasPaid)).to.be.true;
      const requestEvent = soRandom.interface.parseLog(receipt.logs[0]);

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
    const receipt = await tx.wait();
    const result = await soRandom.getResult(request.id);
    const receiptBlockBaseFee = (await ethers.provider.getBlock(receipt.blockNumber)).baseFeePerGas;
    const minFee = receiptBlockBaseFee.mul(receipt.gasUsed).add(request.beaconFee);
    const balance = await soRandom.getBeaconStakeEth(finalSigner.address);
    expect(balance.gte(minFee)).to.be.true;
  });

  it("fail client withdraw when it has pending requests", async function () {
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    const req = await testCallback.makeRequest();
    const res = await req.wait();
    const request = { ...soRandom.interface.parseLog(res.logs[0]).args.request, id: soRandom.interface.parseLog(res.logs[0]).args.id };
    let ethReserved = await soRandom.getEthReserved(testCallback.address);
    expect(ethReserved.gt(0)).to.be.true;
    try {
      await testCallback.soRandomWithdraw(ethers.utils.parseEther("5"));
      expect(true).to.be.false;
    } catch (e) {
      expect(e.message).to.include(`WithdrawingTooMuch(${ethers.utils.parseEther("5").toString()}, ${ethers.utils.parseEther("5").sub(await soRandom.getEthReserved(testCallback.address)).toString()})`);
    }

    await signAndCallback(request);
    ethReserved = await soRandom.getEthReserved(testCallback.address);
    expect(ethReserved.eq(0)).to.be.true;
    try {
      await testCallback.soRandomWithdraw(ethers.utils.parseEther("5"));
      expect(true).to.be.false;
    } catch (e) {
      expect(e.message).to.include(`WithdrawingTooMuch(${ethers.utils.parseEther("5").toString()}, ${(await soRandom.clientBalanceOf(testCallback.address)).toString()})`);
    }
    const remaining = await soRandom.clientBalanceOf(testCallback.address);
    try {
      await testCallback.soRandomWithdraw(remaining);
    } catch (e) {
      expect(true).to.be.false(e);
    }
    expect((await soRandom.clientBalanceOf(testCallback.address)).eq(0)).to.be.true;
  });

  it("complete submitRandom even if the callback reverts", async function () {
    // Deploy contract TestCallbackWithRevert
    const TestCallbackWithRevert = await ethers.getContractFactory("TestCallbackWithRevert");
    const testCallbackWithRevert = await TestCallbackWithRevert.deploy(soRandom.address);
    await testCallbackWithRevert.deployed();
    const deposit = await soRandom.clientDeposit(testCallbackWithRevert.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    const req = await testCallbackWithRevert.makeRequest();
    const res = await req.wait();
    const request = { ...soRandom.interface.parseLog(res.logs[0]).args.request, id: soRandom.interface.parseLog(res.logs[0]).args.id };
    const lastTx = await signAndCallback(request, testCallbackWithRevert);
    const callbackFailedEvent = soRandom.interface.parseLog(lastTx.logs[0]);
    expect(callbackFailedEvent.name).to.equal("CallbackFailed");
    expect(callbackFailedEvent.args.id).to.equal(request.id);
    // Except getResult(request.id) to return not be bytes32(0)
    const result = await soRandom.getResult(request.id);
    expect(result).to.not.equal(ethers.constants.HashZero);
  });

  it("complete submitRandom even if the callback runs out of gas", async function () {
    // Deploy contract TestCallbackWithTooMuchGas
    const TestCallbackWithTooMuchGas = await ethers.getContractFactory("TestCallbackWithTooMuchGas");
    const testCallbackWithTooMuchGas = await TestCallbackWithTooMuchGas.deploy(soRandom.address);
    await testCallbackWithTooMuchGas.deployed();
    const deposit = await soRandom.clientDeposit(testCallbackWithTooMuchGas.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    const req = await testCallbackWithTooMuchGas.makeRequest();
    const res = await req.wait();
    const request = { ...soRandom.interface.parseLog(res.logs[0]).args.request, id: soRandom.interface.parseLog(res.logs[0]).args.id };
    const lastTx = await signAndCallback(request, testCallbackWithTooMuchGas);
    // Check if lastTx emitted "CallbackFailed" event
    const callbackFailedEvent = soRandom.interface.parseLog(lastTx.logs[0]);
    expect(callbackFailedEvent.name).to.equal("CallbackFailed");
    expect(callbackFailedEvent.args.id).to.equal(request.id);
    // Except getResult(request.id) to return not be bytes32(0)
    const result = await soRandom.getResult(request.id);
    expect(result).to.not.equal(ethers.constants.HashZero);
  });

  it("revert with NotEnoughBeaconsAvailable when second-to-last beacon calls submitRandom with all other beacons unregistered", async function () {
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    const req = await testCallback.makeRequest();
    const res = await req.wait();
    let request = { ...soRandom.interface.parseLog(res.logs[0]).args.request, id: soRandom.interface.parseLog(res.logs[0]).args.id };

    const messageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes32"],
        [request.client, 1, request.seed]
      )
    );

    const selectedBeacons = request.beacons;

    const selectedSigners = signers.filter(signer => selectedBeacons.includes(signer.address));
    const messageHashBytes = ethers.utils.arrayify(messageHash);

    let selectedFinalBeacon;
    for (const signer of selectedSigners) {
      const flatSig = await signer.signMessage(messageHashBytes);
      const sig = ethers.utils.splitSignature(flatSig);
      const uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit, sig.v];
      const addressData = [request.client].concat(request.beacons);
      const bytesData = [sig.r, sig.s, request.seed];

      // If signer is of index 1 in selectedSigners
      if (selectedSigners.indexOf(signer) === 1) {
        // Call soRandom.unregisterBeacon(signer.address) all signers except for this signer
        for (const otherSigner of signers.filter(fSigner => fSigner.address !== signer.address)) {
          if ((await soRandom.getBeacons()).includes(otherSigner.address)) {
            const tx = await soRandom.connect(otherSigner).unregisterBeacon(otherSigner.address);
            await tx.wait();
          }
        }
        // submitRandom should fail with NotEnoughBeaconsAvailable
        try {
          await soRandom.connect(signer).submitRandom(addressData, uintData, bytesData);
          expect(true).to.be.false;
        } catch (e) {
          expect(e).to.match(/NotEnoughBeaconsAvailable/);
        }
      } else {
        const tx = await soRandom.connect(signer).submitRandom(addressData, uintData, bytesData);
        await tx.wait();
      }
    }

  });

  it("revert with NotEnoughBeaconsAvailable if making a request without 5 beacons", async function () {
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    // Unregister all beacons
    for (const signer of signers) {
      if ((await soRandom.getBeacons()).includes(signer.address)) {
        const tx = await soRandom.connect(signer).unregisterBeacon(signer.address);
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

  it("add & remove pendingRequestIds", async function () {
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let i = 0;
    const requests = [];
    while (i < 10) {
      const req = await testCallback.makeRequest();
      const res = await req.wait();
      const request = { ...soRandom.interface.parseLog(res.logs[0]).args.request, id: soRandom.interface.parseLog(res.logs[0]).args.id };
      requests.push(request);
      const pendingRequests = await soRandom.getPendingRequestIds();
      // Convert values in pendingRequests array from BigNumber to number
      const pendingRequestsNum = pendingRequests.map(pendingRequest => ethers.BigNumber.from(pendingRequest).toNumber());
      i++;
      expect(pendingRequestsNum.includes(ethers.BigNumber.from(request.id).toNumber())).to.be.true;
      expect(pendingRequestsNum).to.have.lengthOf(i);
    }

    // signAndCallback requests
    for (const request of requests) {
      await signAndCallback(request, testCallback);
      const pendingRequests = await soRandom.getPendingRequestIds();
      const pendingRequestsNum = pendingRequests.map(pendingRequest => pendingRequest.toNumber());
      expect(!pendingRequestsNum.includes(ethers.BigNumber.from(request.id).toNumber())).to.be.true;
      i--;
      expect(pendingRequestsNum).to.have.lengthOf(i);
    }
  });


  // it("allow beacon completeAndUnregister", async function () {
  //   const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
  //   await deposit.wait();

  //   let requestsWithBeacon = [];
  //   // Make requests until 2 requests have same beacon
  //   while (true) {
  //     const tx = await testCallback.makeRequest();
  //     const rc = await tx.wait();
  //     const id = soRandom.interface.parseLog(rc.logs[0]).args[0];
  //     const request = await soRandom.getRequest(id);
  //     const beacons = request.beacons;
  //     for (const beacon of beacons) {
  //       if (beacon == signers[1].address) {
  //         requestsWithBeacon.push(id);
  //         break;
  //       }
  //     }
  //     if (requestsWithBeacon.length == 2) break;
  //   }

  //   let r = [];
  //   let s = [];
  //   let v = [];
  //   let request;
  //   for (const req of requestsWithBeacon) {
  //     request = await soRandom.getRequest(req);
  //     const messageHash = ethers.utils.keccak256(
  //       ethers.utils.defaultAbiCoder.encode(
  //         ["address", "uint256", "bytes32"],
  //         [request.client, req, request.seed]
  //       )
  //     );

  //     const messageHashBytes = ethers.utils.arrayify(messageHash);

  //     const flatSig = await signers[1].signMessage(messageHashBytes);
  //     const sig = ethers.utils.splitSignature(flatSig);
  //     r.push(sig.r);
  //     s.push(sig.s);
  //     v.push(sig.v);
  //   }

  //   await expect(soRandom.connect(signers[1]).completeAndUnregister(requestsWithBeacon, r, s, v)).to.not.be.reverted;


  // });

});
