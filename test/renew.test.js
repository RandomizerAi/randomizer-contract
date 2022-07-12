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
    const SoRandom = await ethers.getContractFactory("SoRandom");

    // address _developer,
    // uint8 _maxStrikes,
    // uint256 _minCollateralEth,
    // uint256 _expirationBlocks,
    // uint256 _expirationSeconds,
    // uint256 _beaconFee,
    // address[] memory _beacons
    soRandom = await SoRandom.deploy(ethers.constants.AddressZero, 3, "500000000000000000", 20, 900, ethers.utils.parseEther("0.00005"), [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address]);
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

  it("Should make a random request and renew all non-submitters", async function () {
    // Deposit
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    expect(await soRandom.clientBalanceOf(testCallback.address)).to.equal(ethers.utils.parseEther("5"));

    // Request
    // console.log("Making request");
    let request = await makeRequest(testCallback);
    let oldBeaconIds = request.beacons;

    // console.log("Made request");
    // Skip blocks and renew
    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);
    const uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit];
    const addressData = [request.client].concat(request.beacons);
    // console.log("Renewing request");
    const res = await (await soRandom.renewRequest(addressData, uintData, request.seed)).wait();
    // console.log("Renewed request");
    // New request data
    request = { ...soRandom.interface.parseLog(res.logs[0]).args.request, id: soRandom.interface.parseLog(res.logs[0]).args.id };

    // console.log(request);

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
    request = { ...soRandom.interface.parseLog(res2.logs[0]).args.request, id: soRandom.interface.parseLog(res2.logs[0]).args.id };

    // Expect no beacons to be duplicates
    for (let i = 0; i < oldBeaconIds.length - 1; i++) {
      for (const newBeacon of request.beacons) {
        expect(oldBeaconIds[i]).to.not.equal(newBeacon);
      }
    }


    expect(request.beacons.length).to.equal(3);
  });
  it("Should renew only the single non-submitter", async function () {
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
    const newReq = soRandom.interface.parseLog(res.logs[0]).args.request;

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

  it("Should renew final non-submitter", async function () {
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

    const newReq = await soRandom.interface.parseLog(renewRes.logs[0]).args.request;
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

  it("Should slash stake of non-submitters and refund caller gas", async function () {
    // Expect kicked beacon IDs to be replaced properly and all beacons[] addresses and beaconIndex[] indices are aligned
    // Deploy soRandom with 1-strike removal

    const soRandom2 = await (await ethers.getContractFactory("SoRandom")).deploy(ethers.constants.AddressZero, 1, "500000000000000000", 50, 600, ethers.utils.parseEther("0.00001"), [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address]);
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

    const renewUintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit];

    const beaconStakeOfRenewer = ethers.BigNumber.from(await soRandom2.getBeaconStakeEth(selectedSigners[1].address));

    await soRandom2.connect(selectedSigners[1]).renewRequest(addressData, renewUintData, request.seed);

    const newBeaconStakeOfRenewer = ethers.BigNumber.from(await soRandom2.getBeaconStakeEth(selectedSigners[1].address));

    // Check that beacon is removed
    expect(ethers.BigNumber.from(await soRandom2.getBeaconStakeEth(selectedSigners[1].address)).lt(ethers.utils.parseEther("1"))).to.equal(true);

    // Check that ETH balance of wallet that called renewRequest has increased
    expect(beaconStakeOfRenewer.gte(newBeaconStakeOfRenewer)).to.equal(true);

    // TODO: Check that the ETH deposit of request.client has increased

  });

});