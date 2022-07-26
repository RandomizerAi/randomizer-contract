const { expect, assert } = require("chai");
const { ethers } = require("hardhat");
const hre = require("hardhat");

describe("Renew", function () {

  let signers;
  let soRandom;
  let testCallback;
  let arbGasInfo;
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


    const ArbGasInfo = await ethers.getContractFactory("ArbGasInfo");
    arbGasInfo = await ArbGasInfo.deploy();
    signers = await ethers.getSigners();
    const SoRandom = await ethers.getContractFactory("SoRandomStatic");

    // address _developer,
    // uint8 _maxStrikes,
    // uint256 _minCollateralEth,
    // uint256 _expirationBlocks,
    // uint256 _expirationSeconds,
    // uint256 _beaconFee,
    // address[] memory _beacons
    soRandom = await SoRandom.deploy(signers[0].address, 3, "500000000000000000", 20, 900, 50000, 2000000, ethers.utils.parseEther("0.1"), [signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address, signers[6].address]);
    const TestCallback = await ethers.getContractFactory("TestCallback");
    testCallback = await TestCallback.deploy(soRandom.address);

    for (const signer of signers) {
      await soRandom.connect(signer).beaconStakeEth(signer.address, { value: ethers.utils.parseEther("5") });
    }
  });

  const makeRequest = async (contract) => {
    let res = await (await contract.makeRequest()).wait();
    const req = { ...soRandom.interface.parseLog(res.logs[0]).args.request, id: soRandom.interface.parseLog(res.logs[0]).args.id };
    return req;
  }

  it("make a random request and renew all non-submitters", async function () {
    // Deposit
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    expect(await soRandom.clientBalanceOf(testCallback.address)).to.equal(ethers.utils.parseEther("5"));

    // Request
    // console.log("Making request");
    let request = await makeRequest(testCallback);
    let oldBeaconIds = request.beacons;

    // Skip blocks and renew
    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);
    const uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit];
    const addressData = [request.client].concat(request.beacons);
    // console.log("Renewing request");
    const res = await (await soRandom.renewRequest(addressData, uintData, request.seed)).wait();
    // console.log("Renewed request");
    // New request data
    const retryEvent = soRandom.interface.parseLog(res.logs.filter((log) => soRandom.interface.parseLog(log).name === "Retry")[0]);
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
    // console.log("Renewing again");
    const newUintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit];
    const newAddressData = [request.client].concat(request.beacons);
    const res2 = await (await soRandom.renewRequest(newAddressData, newUintData, request.seed)).wait();
    // console.log("Renewed again");
    const retryEvent2 = soRandom.interface.parseLog(res2.logs.filter((log) => soRandom.interface.parseLog(log).name === "Retry")[0]);

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
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();

    // Request
    const request = await makeRequest(testCallback);

    // Get beacons
    const selectedBeacons = request.beacons;

    // Generate message
    const messageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes32"],
        [request.client, 1, request.seed]
      )
    );
    // Get first signer
    const signer = signers.filter(signer => selectedBeacons[1] == signer.address)[0];
    const messageHashBytes = ethers.utils.arrayify(messageHash);
    const flatSig = await signer.signMessage(messageHashBytes);
    const sig = ethers.utils.splitSignature(flatSig);

    // Submit signature
    const uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit, sig.v];
    const addressData = [request.client].concat(request.beacons);
    const bytesData = [sig.r, sig.s, request.seed];

    await soRandom.connect(signer).submitRandom(addressData, uintData, bytesData);


    // Store request with the 1 signature

    const oldSigs = await soRandom.getRequestSignatures(request.id);


    // Skip blocks and renew request
    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);
    const renewUintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit];
    const res = await (await soRandom.renewRequest(addressData, renewUintData, request.seed)).wait();

    // Get new request data
    const newReq = soRandom.interface.parseLog(res.logs[res.logs.length - 1]).args.request;

    const newBeacons = newReq.beacons;

    const newSigs = await soRandom.getRequestSignatures(1);


    // Beacons should be renewed except for the first one
    expect(newBeacons[1]).to.equal(selectedBeacons[1]);
    expect(newBeacons[0]).to.not.equal(selectedBeacons[0]);
    expect(newBeacons[1]).to.not.equal(selectedBeacons[0]);
    expect(newBeacons[2]).to.equal(ethers.constants.AddressZero);
    expect(newSigs[1]).to.equal(oldSigs[1]);
    expect(newSigs[1]).to.not.equal("0x000000000000000000000000");
    expect(newSigs[0]).to.equal("0x000000000000000000000000");
    expect(newSigs[2]).to.equal("0x000000000000000000000000");
  });

  it("renew final non-submitter", async function () {
    // const tx = await signers[4].sendTransaction({ to: subscriber.address, value: ethers.utils.parseEther("1") });
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();


    let request = await makeRequest(testCallback);


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

    let totalGas = ethers.BigNumber.from(0);


    let oldReq;
    for (const signer of selectedSigners) {
      const flatSig = await signer.signMessage(messageHashBytes);
      const sig = ethers.utils.splitSignature(flatSig);
      const uintData = [1, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit, sig.v];
      const addressData = [request.client].concat(request.beacons);
      const bytesData = [sig.r, sig.s, request.seed];
      const tx = await soRandom.connect(signer).submitRandom(addressData, uintData, bytesData);
      const res = await tx.wait();
      const requestEvent = soRandom.interface.parseLog(res.logs[0]);

      // Process RequestBeacon event (from 2nd-to-last submitter)
      if (requestEvent.name == "RequestBeacon") {
        selectedFinalBeacon = requestEvent.args[2];
        request = requestEvent.args[1];
        expect(request.beacons[2]).to.not.equal(ethers.constants.AddressZero);
        expect(selectedFinalBeacon).to.not.equal(ethers.constants.AddressZero);
        oldReq = request;

      }
    }
    const oldSigs = await soRandom.getRequestSignatures(1);


    expect(oldReq.beacons[2]).to.not.equal(ethers.constants.AddressZero);
    const finalSigner = signers.filter(signer => signer.address == oldReq.beacons[2])[0];
    await soRandom.connect(finalSigner).beaconStakeEth(finalSigner.address, { value: ethers.utils.parseEther("1") });


    // Skip blocks and renew request
    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);
    const uintData = [1, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit];
    const addressData = [request.client].concat(request.beacons);
    const renew = await soRandom.renewRequest(addressData, uintData, request.seed);
    const renewRes = await renew.wait();

    const newReq = await soRandom.interface.parseLog(renewRes.logs[renewRes.logs.length - 1]).args.request;
    const newBeacons = newReq.beacons;

    const newSigs = await soRandom.getRequestSignatures(1);

    // Beacons should be renewed except for the first one
    expect(oldReq.beacons[2]).to.not.equal(newReq.beacons[2]);
    expect(newBeacons[0]).to.equal(selectedBeacons[0]);
    expect(newBeacons[1]).to.equal(selectedBeacons[1]);
    expect(newBeacons[2]).to.not.equal(ethers.constants.AddressZero);
    expect(newSigs[0]).to.equal(oldSigs[0]);
    expect(newSigs[1]).to.equal(oldSigs[1]);
    expect(newSigs[0]).to.not.equal("0x000000000000000000000000");
    expect(newSigs[1]).to.not.equal("0x000000000000000000000000");
    expect(newSigs[2]).to.equal("0x000000000000000000000000");
  });

  it("slash stake of non-submitters and refund caller gas", async function () {
    // Expect kicked beacon IDs to be replaced properly and all beacons[] addresses and beaconIndex[] indices are aligned
    // Deploy soRandom with 1-strike removal

    const soRandom2 = await (await ethers.getContractFactory("SoRandomStatic")).deploy(ethers.constants.AddressZero, 1, "500000000000000000", 50, 600, 50000, 2000000, ethers.utils.parseEther("0.00001"), [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address]);
    const testCallback2 = await (await ethers.getContractFactory("TestCallback")).deploy(soRandom2.address);

    await soRandom2.clientDeposit(testCallback2.address, { value: ethers.utils.parseEther("50") });
    const request = await makeRequest(testCallback2);

    const beacons = request.beacons;
    const selectedSigners = signers.filter(signer => beacons.includes(signer.address));

    // Stake 1 eth for beacon
    await soRandom2.connect(selectedSigners[1]).beaconStakeEth(selectedSigners[1].address, { value: ethers.utils.parseEther("1") });

    expect(ethers.BigNumber.from(await soRandom2.getBeaconStakeEth(selectedSigners[1].address))).to.equal(ethers.utils.parseEther("1"));

    // Make signature
    const messageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes32"],
        [request.client, request.id, request.seed]
      )
    );
    const sig = ethers.utils.splitSignature(await selectedSigners[0].signMessage(ethers.utils.arrayify(messageHash)));

    const addressData = [request.client].concat(request.beacons);
    const uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit, sig.v];
    const bytesData = [sig.r, sig.s, request.seed];
    await soRandom2.connect(selectedSigners[0]).submitRandom(addressData, uintData, bytesData);
    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);
    const oldClientBalanceOf = ethers.BigNumber.from(await soRandom2.clientBalanceOf(request.client));

    const renewUintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit];
    const beaconStakeOfRenewer = ethers.BigNumber.from(await soRandom2.getBeaconStakeEth(selectedSigners[1].address));
    await soRandom2.connect(selectedSigners[1]).renewRequest(addressData, renewUintData, request.seed);

    const newBeaconStakeOfRenewer = ethers.BigNumber.from(await soRandom2.getBeaconStakeEth(selectedSigners[1].address));

    // Check that beacon is removed
    expect(ethers.BigNumber.from(await soRandom2.getBeaconStakeEth(selectedSigners[1].address)).lt(ethers.utils.parseEther("1"))).to.equal(true);

    // Check that ETH balance of wallet that called renewRequest has increased
    expect(beaconStakeOfRenewer.gte(newBeaconStakeOfRenewer)).to.equal(true);

    // Check that the ETH deposit of request.client has increased
    const newClientBalanceOf = ethers.BigNumber.from(await soRandom2.clientBalanceOf(request.client));

    expect(oldClientBalanceOf.lt(newClientBalanceOf)).to.equal(true);

  });

  it("revert on renew if request is not yet renewable", async function () {
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let request = await makeRequest(testCallback);
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));

    const messageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes32"],
        [request.client, request.id, request.seed]
      )
    );
    const sig = ethers.utils.splitSignature(await selectedSigners[0].signMessage(ethers.utils.arrayify(messageHash)));

    const addressData = [request.client].concat(request.beacons);
    const uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit];
    try {
      await soRandom.renewRequest(addressData, uintData, request.seed);
      expect(true).to.equal(false);
    } catch (e) {
      expect(e).to.match(/NotYetRenewable/g);
    }
  });

  it("only allow the first submitter to renew for the first 5 minutes/20 blocks", async function () {
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let request = await makeRequest(testCallback);
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));

    const messageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes32"],
        [request.client, request.id, request.seed]
      )
    );
    const sig = ethers.utils.splitSignature(await selectedSigners[0].signMessage(ethers.utils.arrayify(messageHash)));

    const addressData = [request.client].concat(request.beacons);
    const uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit, sig.v];
    const bytesData = [sig.r, sig.s, request.seed];
    // Submit request with first selectedSigner
    await soRandom.connect(selectedSigners[0]).submitRandom(addressData, uintData, bytesData);
    const renewUintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit];
    // Mine 20 blocks with 45 seconds per block
    await hre.network.provider.send("hardhat_mine", ["0x20", ethers.utils.hexlify(45)]);
    try {
      await soRandom.connect(selectedSigners[1]).renewRequest(addressData, renewUintData, request.seed);
      expect(true).to.equal(false);
    } catch (e) {
      expect(e).to.match(/NotYetRenewable/g);
    }
    const renewTx = await soRandom.connect(selectedSigners[0]).renewRequest(addressData, renewUintData, request.seed);
    const renew = await renewTx.wait();
    // Expect event "Retry" to be emitted by renew
    expect(renew.events).to.have.lengthOf(3);
    expect(renew.events[renew.events.length - 1].event).to.equal("Retry");
  });

  it("allow any signer to renew a request after the first 5 minutes/20 blocks of expiration", async function () {
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let request = await makeRequest(testCallback);
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));

    const messageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes32"],
        [request.client, request.id, request.seed]
      )
    );
    const sig = ethers.utils.splitSignature(await selectedSigners[0].signMessage(ethers.utils.arrayify(messageHash)));

    const addressData = [request.client].concat(request.beacons);
    const uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit, sig.v];
    const bytesData = [sig.r, sig.s, request.seed];
    // Submit request with first selectedSigner
    await soRandom.connect(selectedSigners[0]).submitRandom(addressData, uintData, bytesData);
    const renewUintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit];
    // Mine 20 blocks with 45 seconds per block
    await hre.network.provider.send("hardhat_mine", ["0x20", ethers.utils.hexlify(45)]);
    try {
      await soRandom.connect(selectedSigners[1]).renewRequest(addressData, renewUintData, request.seed);
      expect(true).to.equal(false);
    } catch (e) {
      expect(e).to.match(/NotYetRenewable/g);
    }
    await hre.network.provider.send("hardhat_mine", ["0x20", ethers.utils.hexlify(45)]);
    const renewTx = await soRandom.connect(selectedSigners[1]).renewRequest(addressData, renewUintData, request.seed);
    const renew = await renewTx.wait();
    // Expect event "Retry" to be emitted by renew
    expect(renew.events).to.have.lengthOf(3);
    expect(renew.events[renew.events.length - 1].event).to.equal("Retry");
  });


  it("revert with RequestDataMismatch when renewing a request with a different hash", async function () {
    // Deposit
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let request = await makeRequest(testCallback);
    // submitRequest with first beacon in request.beacons
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));
    const messageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes32"],
        [request.client, request.id, request.seed]
      )
    );
    const sig = ethers.utils.splitSignature(await selectedSigners[0].signMessage(ethers.utils.arrayify(messageHash)));
    const addressData = [request.client].concat(request.beacons);
    const uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit, sig.v];
    const bytesData = [sig.r, sig.s, request.seed];
    await soRandom.connect(selectedSigners[0]).submitRandom(addressData, uintData, bytesData);
    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);
    // Renew the request
    const renewUintData = [request.id, request.ethReserved, request.beaconFee, request.height, 123, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit];
    try {
      await soRandom.renewRequest(addressData, renewUintData, request.seed);
      expect(true).to.equal(false);
    } catch (e) {
      expect(e).to.match(/RequestDataMismatch.*/g);
    }
  });


  it("revert with NotEnoughBeaconsAvailable if renewing a request without enough beacons", async function () {
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    const req = await makeRequest(testCallback);

    // Unregister beacons
    for (const signer of signers) {
      if ((await soRandom.getBeacons()).includes(signer.address) && ethers.BigNumber.from((await soRandom.getBeacon(signer.address)).pending).eq(0)) {
        const tx = await soRandom.connect(signer).unregisterBeacon(signer.address);
        await tx.wait();
      }
    }

    await hre.network.provider.send("hardhat_mine", ["0x40", ethers.utils.hexlify(45)]);

    // Renew request with first selectedSigner
    const renewUintData = [req.id, req.ethReserved, req.beaconFee, req.height, req.timestamp, req.expirationSeconds, req.expirationBlocks, req.callbackGasLimit];
    const addressData = [req.client].concat(req.beacons);
    try {
      await soRandom.renewRequest(addressData, renewUintData, req.seed);
      expect(true).to.equal(false);
    }
    catch (e) {
      expect(e).to.match(/NotEnoughBeaconsAvailable/g);
    }

  });

  it("remove a beacon on renewRequest if the beacon did not submit and has below minStakeEth", async function () {
    // Get beacons.length
    const oldBeacons = await soRandom.getBeacons();
    // Deposit
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
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
    const minStakeEth = await soRandom.minStakeEth();
    const beaconStakeEth = await soRandom.getBeaconStakeEth(selectedSigners[0].address);
    const beaconStakeEthMinusMinStakeEth = ethers.BigNumber.from(beaconStakeEth).sub(minStakeEth);
    await soRandom.connect(selectedSigners[0]).beaconUnstakeEth(beaconStakeEthMinusMinStakeEth);
    // Mine 20 blocks with 45 seconds per block
    await hre.network.provider.send("hardhat_mine", ["0x40", ethers.utils.hexlify(45)]);
    // Renew request with second selectedSigner
    const renewUintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit];
    const addressData = [request.client].concat(request.beacons);
    const renewTx = await soRandom.connect(selectedSigners[1]).renewRequest(addressData, renewUintData, request.seed);
    const renew = await renewTx.wait();
    expect(renew.events).to.have.lengthOf(3);
    expect(renew.events[renew.events.length - 1].event).to.equal("Retry");

    // Make new requests until request2.beacons includes selectedSigners[0].address
    let request2 = await makeRequest(testCallback);
    while (!request2.beacons.includes(selectedSigners[0].address)) {
      request2 = await makeRequest(testCallback);
    }
    // Mine 20 blocks with 45 seconds per block
    await hre.network.provider.send("hardhat_mine", ["0x40", ethers.utils.hexlify(45)]);
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
    const renewUintData2 = [request2.id, request2.ethReserved, request2.beaconFee, request2.height, request2.timestamp, request2.expirationSeconds, request2.expirationBlocks, request2.callbackGasLimit];
    const addressData2 = [request2.client].concat(request2.beacons);
    const renewTx2 = await soRandom.connect(selectedSigner2).renewRequest(addressData2, renewUintData2, request2.seed);
    const renew2 = await renewTx2.wait();
    // Expect event "RemoveBeacon" to be emitted by renew
    expect(renew2.events).to.have.lengthOf(4);
    expect(renew2.events[0].event).to.equal("RemoveBeacon");
    // Expect event "BeaconRemoved" to have correct data
    expect(renew2.events[0].args.beacon).to.equal(selectedSigners[0].address);
    // Get beacons
    const newBeacons = await soRandom.getBeacons();
    // Expect beacons to have one less than before
    expect(newBeacons).to.have.lengthOf(oldBeacons.length - 1);
  });

});