const { expect, assert } = require("chai");
const { ethers } = require("hardhat");
const hre = require("hardhat");
const vrfHelper = require("./helpers.js");
const randomizerAbi = require("../abi/Randomizer.json").abi;
const {
  getSelectors,
  FacetCutAction,
} = require('../scripts/libraries/diamond.js');
const { deployDiamond } = require('../scripts/deploy.js')

describe("Renew", function () {

  let signers;
  let randomizer;
  let testCallback;
  let vrf;
  let lib;
  let ecKeys;
  let sequencer;
  let storageController;
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

    sequencer = signers[7];
    // randomizer = await Randomizer.deploy([signers[7].address, signers[7].address, vrf.address, lib.address], ["500000000000000000", 20, 900, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3], [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address], ecKeys, [570000, 90000, 65000, 21000, 21000, 21000, 21000]);

    const diamondAddress = await deployDiamond([signers[7].address, signers[7].address, ["500000000000000000", 20, 900, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3, 99, 1, 45], [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address], ecKeys, [87500, 75000, 81000, 900000, 3500]])
    randomizer = await ethers.getContractAt(randomizerAbi, diamondAddress);


    const diamondCutFacet = await ethers.getContractAt('DiamondCutFacet', diamondAddress)
    const StorageControlFacet = await ethers.getContractFactory('StorageControlFacet')
    const storageControlFacet = await StorageControlFacet.deploy()
    await storageControlFacet.deployed()
    const selectors = getSelectors(storageControlFacet)
    await diamondCutFacet.diamondCut(
      [{
        facetAddress: storageControlFacet.address,
        action: FacetCutAction.Add,
        functionSelectors: selectors
      }],
      ethers.constants.AddressZero, '0x', { gasLimit: 800000 })

    await randomizer.proposeOwnership(signers[7].address);
    await randomizer.connect(signers[7]).acceptOwnership();

    // randomizer = await Randomizer.deploy([ethers.constants.AddressZero, ethers.constants.AddressZero, vrf.address, lib.address], ["500000000000000000", 20, 900, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3], [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address], ecKeys, [570000, 90000, 65000, 21000, 21000, 21000, 21000]);
    vrfHelper.init(randomizer);

    const TestCallback = await ethers.getContractFactory("TestCallback");
    testCallback = await TestCallback.deploy(randomizer.address);

    storageController = await ethers.getContractAt('StorageControlFacet', diamondAddress)

    for (const signer of signers) {
      await randomizer.connect(signer).beaconStakeEth(signer.address, { value: ethers.utils.parseEther("5") });
    }
  });

  const makeRequest = async (contract) => {
    let res = await (await contract.makeRequest()).wait();
    const req = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id, height: res.logs[0].blockNumber };
    return req;
  }

  it("make a random request and renew all non-submitters", async function () {
    // Deposit
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    expect((await randomizer.clientBalanceOf(testCallback.address))[0]).to.equal(ethers.utils.parseEther("5"));

    // Request
    let request = await makeRequest(testCallback);
    let oldBeaconIds = request.beacons;

    // Skip blocks and renew
    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);
    const data = await vrfHelper.getSubmitData(signers[0].address, request);
    const res = await (await randomizer.renewRequest(data.addresses, data.rawUints, request.seed)).wait();
    // New request data
    const log = res.logs.find((log) => randomizer.interface.parseLog(log).name === "Retry");
    const retryEvent = randomizer.interface.parseLog(res.logs.filter((log) => randomizer.interface.parseLog(log).name === "Retry")[0]);
    request = { ...retryEvent.args.request, id: retryEvent.args.id, height: log.blockNumber };

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

    const res2 = await (await randomizer.renewRequest(newData.addresses, newData.rawUints, request.seed)).wait();
    const retryLog = res2.logs.find((log) => randomizer.interface.parseLog(log).name === "Retry");
    const retryEvent2 = randomizer.interface.parseLog(res2.logs.filter((log) => randomizer.interface.parseLog(log).name === "Retry")[0]);

    request = { ...retryEvent2.args.request, id: retryEvent2.args.id, height: retryLog.blockNumber };

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
    await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(signer.address), data.addresses, data.uints, request.seed);

    // Store request with the 1 signature
    const oldSigs = (await randomizer.getRequest(request.id)).vrfHashes;

    // Skip blocks and renew request
    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);
    const renewUintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations];

    const oldFeePaid = (await randomizer.getFeeStats(request.id))[0];
    const res = await (await randomizer.renewRequest(data.addresses, renewUintData, request.seed)).wait();

    // Get new request data
    const newReq = randomizer.interface.parseLog(res.logs[res.logs.length - 1]).args.request;

    const newBeacons = newReq.beacons;

    const newSigs = (await randomizer.getRequest(1)).vrfHashes;


    // Beacons should be renewed except for the first one
    expect(newBeacons[1]).to.equal(selectedBeacons[1]);
    expect(newBeacons[0]).to.not.equal(selectedBeacons[0]);
    expect(newBeacons[1]).to.not.equal(selectedBeacons[0]);
    expect(newBeacons[2]).to.equal(ethers.constants.AddressZero);

    // Ensure old beacon's pending count went down
    expect((await randomizer.beacon(selectedBeacons[0])).pending).to.equal(ethers.BigNumber.from(0));
    expect((await randomizer.beacon(selectedBeacons[0])).consecutiveSubmissions).to.equal(ethers.BigNumber.from(0));

    // Ensure new beacon's pending count went up
    expect((await randomizer.beacon(newBeacons[0])).pending).to.equal(ethers.BigNumber.from(1));

    expect(newSigs[1]).to.equal(oldSigs[1]);
    expect(newSigs[1]).to.not.equal("0x00000000000000000000");
    expect(newSigs[0]).to.equal("0x00000000000000000000");

    // Fee should be added to refunded. feePaid should remain the same so the client contract can refund the total fees to the user.
    const feeStats = await randomizer.getFeeStats(request.id);
    expect(oldFeePaid.gt(0)).to.be.true;
    expect(feeStats[1].eq(oldFeePaid)).to.be.true;
    expect(feeStats[0].eq(oldFeePaid)).to.be.true;
    expect(feeStats[1].eq(feeStats[0])).to.be.true;
  });

  it("renew a request after 3 requests were already renewed with the same offline beacon", async function () {
    this.timeout(100000);
    // Deposit
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();

    // Request
    const requestsWithSigner = [];
    while (true) {
      const request = await makeRequest(testCallback);

      // Get beacons
      const selectedBeacons = request.beacons;
      // Check if one of the beacons is signers[3]
      if (selectedBeacons.includes(signers[3].address)) {
        requestsWithSigner.push(request);
      }

      // If requestsWithSigner.length is over 5
      if (requestsWithSigner.length > 7) {
        break;
      }
    }

    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);


    for (const request of requestsWithSigner) {
      // Get first request beacon signer that isn't signers[3]
      const signer = signers.filter(signer => request.beacons.includes(signer.address) && signer.address != signers[3].address)[0];

      // Submit signature
      const data = await vrfHelper.getSubmitData(signer.address, request);
      await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(signer.address), data.addresses, data.uints, request.seed);

      // Skip blocks and renew request
      const renewUintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations];

      await expect(randomizer.renewRequest(data.addresses, renewUintData, request.seed)).to.not.be.reverted;
    }
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

      const tx = await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(signer.address), data.addresses, data.uints, request.seed);

      const res = await tx.wait();

      // Process RequestBeacon event (from 2nd-to-last submitter)
      const requestEventRaw = res.logs.find(log => randomizer.interface.parseLog(log).name === "RequestBeacon");

      // Process RequestBeacon event (from 2nd-to-last submitter)
      if (requestEventRaw) {
        const requestEvent = randomizer.interface.parseLog(requestEventRaw);
        const selectedFinalBeacon = requestEvent.args.beacon;
        request.beacons = [request.beacons[0], request.beacons[1], selectedFinalBeacon];
        request.timestamp = requestEvent.args.timestamp;
        request.seed = requestEvent.args.seed;
        request.height = requestEventRaw.blockNumber;
        expect(request.beacons[2]).to.not.equal(ethers.constants.AddressZero);
        expect(selectedFinalBeacon).to.not.equal(ethers.constants.AddressZero);
        oldReq = request;
      }
    }
    const oldSigs = (await randomizer.getRequest(1)).vrfHashes;


    expect(oldReq.beacons[2]).to.not.equal(ethers.constants.AddressZero);
    const finalSigner = signers.find(signer => signer.address == request.beacons[2]);
    await randomizer.connect(finalSigner).beaconStakeEth(finalSigner.address, { value: ethers.utils.parseEther("1") });


    // Skip blocks and renew request
    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);
    const uintData = [1, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations];
    const addressData = [request.client].concat(request.beacons);
    const renew = await randomizer.renewRequest(addressData, uintData, request.seed);
    const renewRes = await renew.wait();

    const newReq = await randomizer.interface.parseLog(renewRes.logs[renewRes.logs.length - 1]).args.request;
    const newBeacons = newReq.beacons;

    const newSigs = (await randomizer.getRequest(1)).vrfHashes;

    // Beacons should be renewed except for the first one
    expect(oldReq.beacons[2]).to.not.equal(newReq.beacons[2]);
    expect(newBeacons[0]).to.equal(selectedBeacons[0]);
    expect(newBeacons[1]).to.equal(selectedBeacons[1]);
    expect(newBeacons[2]).to.not.equal(ethers.constants.AddressZero);
    expect(newSigs[0]).to.equal(oldSigs[0]);
    expect(newSigs[1]).to.equal(oldSigs[1]);
    expect(newSigs[0]).to.not.equal(ethers.constants.HashZero.slice(0, 34));
    expect(newSigs[1]).to.not.equal(ethers.constants.HashZero.slice(0, 34));
  });

  it("slash stake of non-submitters and refund caller gas", async function () {
    // Expect kicked beacon IDs to be replaced properly and all beacons[] addresses and beaconIndex[] indices are aligned
    // Deploy randomizer with 1-strike removal

    // const randomizer2 = await Randomizer2.deploy([ethers.constants.AddressZero, ethers.constants.AddressZero, vrf.address, lib.address], ["500000000000000000", 50, 600, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3], [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address], [ecKeys[0], ecKeys[1], ecKeys[2], ecKeys[3], ecKeys[4], ecKeys[5], ecKeys[6], ecKeys[7], ecKeys[8], ecKeys[9]], [570000, 90000, 65000, 21000, 21000, 21000]);
    const address2 = await deployDiamond([ethers.constants.AddressZero, ethers.constants.AddressZero, ["500000000000000000", 20, 900, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3, 99, 1, 45], [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address], ecKeys, [87500, 75000, 93000, 900000, 3500]])
    const randomizer2 = await ethers.getContractAt(randomizerAbi, address2);
    await randomizer2.proposeOwnership(signers[7].address);
    await randomizer2.connect(signers[7]).acceptOwnership();
    const testCallback2 = await (await ethers.getContractFactory("TestCallback")).deploy(randomizer2.address);

    await randomizer2.clientDeposit(testCallback2.address, { value: ethers.utils.parseEther("50") });
    const request = await makeRequest(testCallback2);

    const beacons = request.beacons;
    const selectedSigners = signers.filter(signer => beacons.includes(signer.address));

    // Stake 1 eth for beacon
    await randomizer2.connect(selectedSigners[1]).beaconStakeEth(selectedSigners[1].address, { value: ethers.utils.parseEther("1") });

    expect(ethers.BigNumber.from((await randomizer2.beacon(selectedSigners[1].address)).ethStake)).to.equal(ethers.utils.parseEther("1"));

    // Make signature
    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);
    await randomizer2.connect(selectedSigners[0])['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(selectedSigners[0].address), data.addresses, data.uints, request.seed);

    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);
    const oldClientBalanceOf = ethers.BigNumber.from((await randomizer2.clientBalanceOf(request.client))[0]);

    const renewUintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations];
    const beaconStakeOfRenewer = ethers.BigNumber.from((await randomizer2.beacon(selectedSigners[1].address)).ethStake);

    // Get latest block basefee
    const latestBlock = await ethers.provider.getBlock("latest");
    const basefee = latestBlock.baseFeePerGas;

    const stakeOfCaller = ethers.BigNumber.from((await randomizer2.beacon(selectedSigners[0].address)).ethStake);

    const renewTx = await randomizer2.connect(selectedSigners[0]).renewRequest(data.addresses, renewUintData, request.seed, { gasPrice: basefee });
    const receipt = await renewTx.wait();
    const newBeaconStakeOfRenewer = ethers.BigNumber.from((await randomizer2.beacon(selectedSigners[1].address)).ethStake);

    // Check that beacon is removed
    expect(ethers.BigNumber.from((await randomizer2.beacon(selectedSigners[1].address)).ethStake).lt(ethers.utils.parseEther("1"))).to.equal(true);

    // Check that ETH balance of wallet that called renewRequest has increased
    expect(beaconStakeOfRenewer.gte(newBeaconStakeOfRenewer)).to.equal(true);
    const newStakeOfCaller = ethers.BigNumber.from((await randomizer2.beacon(selectedSigners[0].address)).ethStake);
    // Get receipt's gasUsed and gasPrice
    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.effectiveGasPrice;
    const gasPaid = gasUsed.mul(gasPrice).add(request.beaconFee);

    const earnings = newStakeOfCaller.sub(stakeOfCaller);

    expect(earnings).to.be.gte(gasPaid);

    // Check that the ETH deposit of request.client has increased
    const newClientBalanceOf = ethers.BigNumber.from((await randomizer2.clientBalanceOf(request.client))[0]);

    expect(oldClientBalanceOf.lt(newClientBalanceOf)).to.equal(true);

  });

  it("revert on renew if request is not yet renewable", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let request = await makeRequest(testCallback);


    const addressData = [request.client].concat(request.beacons);
    const uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations];
    try {
      await randomizer.renewRequest(addressData, uintData, request.seed);
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
    await randomizer.connect(selectedSigners[0])['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(selectedSigners[0].address), data.addresses, data.uints, request.seed);
    const renewUintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations];
    // Mine 20 blocks with 45 seconds per block
    await hre.network.provider.send("hardhat_mine", ["0x20", ethers.utils.hexValue(45)]);
    try {
      await randomizer.connect(selectedSigners[1]).renewRequest(data.addresses, renewUintData, request.seed);
      expect(true).to.equal(false);
    } catch (e) {
      expect(e).to.match(/NotYetRenewable/g);
    }
    const renewTx = await randomizer.connect(selectedSigners[0]).renewRequest(data.addresses, renewUintData, request.seed);
    const renew = await renewTx.wait();
    // Expect event "Retry" to be emitted by renew
    expect(renew.events).to.have.lengthOf(4);
    expect(renew.events[renew.events.length - 1].event).to.equal("Retry");
  });

  it("allow first submitter, then sequencer, then everyone to renew a request after an added half expiration period for each party", async function () {
    this.timeout(100000);
    let i = 0;
    // Store current block height
    while (i < 5) {
      // Store block height
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
          await randomizer.connect(renewer).renewRequest(data.addresses, data.rawUints, request.seed);
          expect(true).to.equal(false);
        } catch (e) {
          expect(e.message).to.match(/NotYetRenewable/g);
        }
        await hre.network.provider.send("hardhat_mine", [ethers.utils.hexValue(6), ethers.utils.hexValue(10)]);
        const renewTx = await randomizer.connect(renewer).renewRequest(data.addresses, data.rawUints, request.seed);
        const renew = await renewTx.wait();
        // Expect event "Retry" to be emitted by renew
        // Log all event names
        expect(renew.events[renew.events.length - 1].event).to.equal("Retry");
        return true;
      }

      for (let i = 0; i < 2; i++) {
        const request = await newReq();
        const firstSubmitter = signers.find(signer => signer.address === request.beacons[0]);
        const data = await vrfHelper.getSubmitData(firstSubmitter.address, request);
        await randomizer.connect(firstSubmitter)['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(firstSubmitter.address), data.addresses, data.uints, request.seed);
        const allSigners = [firstSubmitter, sequencer, signers[9]];
        const waitBlocks = ethers.BigNumber.from(request.height).add(request.expirationBlocks).sub(await hre.ethers.provider.getBlockNumber()).add(request.expirationBlocks.div(2).mul(i)).toNumber();
        const waitSeconds = ethers.BigNumber.from(request.timestamp).add(request.expirationSeconds).sub((await hre.ethers.provider.getBlock()).timestamp).add(request.expirationSeconds.div(2).mul(i)).toNumber();
        const res = await renewWith(request, allSigners[i], waitBlocks, waitSeconds);
        expect(res).to.equal(true);
      }

      // Sequencer and random signer can't renew as first submitter
      for (let i = 1; i < 2; i++) {
        const request = await newReq();
        const data = await vrfHelper.getSubmitData(signers[0].address, request);
        const waitBlocks = ethers.BigNumber.from(request.height).add(request.expirationBlocks).sub(await hre.ethers.provider.getBlockNumber()).toNumber();
        const waitSeconds = ethers.BigNumber.from(request.timestamp).add(request.expirationSeconds).sub((await hre.ethers.provider.getBlock()).timestamp).toNumber();
        await hre.network.provider.send("hardhat_mine", [ethers.utils.hexValue(waitBlocks - 5), ethers.utils.hexValue(Math.ceil(waitSeconds / waitBlocks + 20))]);
        try {
          await randomizer.connect(sequencer).renewRequest(data.addresses, data.rawUints, request.seed);
          expect(true).to.equal(false);
        } catch (e) {
          expect(e.message).to.match(/NotYetRenewable/g);
        }
        try {
          await randomizer.connect(signers[9]).renewRequest(data.addresses, data.rawUints, request.seed);
          expect(true).to.equal(false);
        } catch (e) {
          expect(e.message).to.match(/NotYetRenewable/g);
        }
      }

      // Sequencer and random signer can renew after their specific expiration period if noone submitted
      for (let i = 1; i < 2; i++) {
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
        await randomizer.connect(secondSubmitter).renewRequest(data.addresses, data.rawUints, request.seed);
        expect(true).to.equal(false);
      } catch (e) {
        expect(e.message).to.match(/NotYetRenewable/g);
      }
      // After submit they can renew
      await randomizer.connect(secondSubmitter)['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(secondSubmitter.address), data.addresses, data.uints, request.seed);
      await randomizer.connect(secondSubmitter).renewRequest(data.addresses, data.rawUints, request.seed);

      // Get all beacons
      const beacons = await randomizer.beacons();
      // Iterate over all beacons
      for (let i = 0; i < beacons.length; i++) {
        await storageController._debug_setSBeacon(beacons[i], 0, 0);
      }

      i++;
    }
  });


  it("revert with RequestDataMismatch when renewing a request with a different hash", async function () {
    // Deposit
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let request = await makeRequest(testCallback);
    // submitRequest with first beacon in request.beacons
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));

    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);

    await randomizer.connect(selectedSigners[0])['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(selectedSigners[0].address), data.addresses, data.uints, request.seed);

    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);
    // Renew the request
    const renewUintData = [request.id, request.ethReserved, request.beaconFee, request.height, 123, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations];
    try {
      await randomizer.renewRequest(data.addresses, renewUintData, request.seed);
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

    await randomizer.connect(selectedSigners[0])['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(selectedSigners[0].address), data.addresses, data.uints, request.seed);

    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);

    // Renew the request
    const clientOldDeposit = (await randomizer.clientBalanceOf(testCallback.address))[0];

    const signerOldDeposit = (await randomizer.beacon(selectedSigners[1].address)).ethStake;
    const renew = await randomizer.connect(signers[8]).renewRequest(data.addresses, data.rawUints, request.seed);
    const receipt = await renew.wait();
    // Get logs from receipt
    let retry;
    for (const log of receipt.logs) {
      const event = randomizer.interface.parseLog(log);
      if (event.name === "Retry") retry = event;
    }


    const clientNewDeposit = (await randomizer.clientBalanceOf(testCallback.address))[0];
    const signerNewDeposit = (await randomizer.beacon(selectedSigners[1].address)).ethStake;
    expect(clientNewDeposit.gte(clientOldDeposit.add(retry.args.ethToClient))).to.be.true;
    expect(signerNewDeposit.lte(signerOldDeposit.sub(retry.args.ethToClient.add(retry.args.ethToRenewer)))).to.be.true;
  });

  it("refund to client on renew when a striked beacon has less collateral than totalCharge but more than renewFee [ @skip-on-coverage ]", async () => {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let request = await makeRequest(testCallback);
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));

    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);
    const clientOriginalDeposit = (await randomizer.clientBalanceOf(testCallback.address))[0];

    await randomizer.connect(selectedSigners[1]).beaconStakeEth(selectedSigners[1].address, { value: ethers.utils.parseEther("1") });

    await randomizer.connect(selectedSigners[0])['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(selectedSigners[0].address), data.addresses, data.uints, request.seed);

    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);

    // Renew the request
    const clientOldDeposit = (await randomizer.clientBalanceOf(testCallback.address))[0];

    // Sets the collateral to a little over the renew gas price so that the collateral is less than the total charge but more than the renew fee 
    let renewGas = await randomizer.connect(signers[8]).estimateGas.renewRequest(data.addresses, data.rawUints, request.seed);
    const collateral = ethers.BigNumber.from(renewGas).mul(await ethers.provider.getGasPrice()).sub(70000000000000);
    await storageController._debug_setCollateral(selectedSigners[1].address, collateral);

    const signerOldDeposit = (await randomizer.beacon(selectedSigners[1].address)).ethStake;
    const renew = await randomizer.connect(signers[8]).renewRequest(data.addresses, data.rawUints, request.seed);
    const receipt = await renew.wait();
    const chargeEvents = receipt.logs.filter(event => randomizer.interface.parseLog(event).name === "ChargeEth");
    expect(chargeEvents.length).to.equal(2);
    const parsedEvents = chargeEvents.map(event => randomizer.interface.parseLog(event).args);
    expect(parsedEvents[1].amount).to.equal(collateral.sub(parsedEvents[0].amount));
    // Get logs from receipt
    let retry;

    expect(receipt.logs.length).to.equal(5);
    for (const log of receipt.logs) {
      const event = randomizer.interface.parseLog(log);
      if (event.name === "Retry") retry = event;
    }


    const clientNewDeposit = (await randomizer.clientBalanceOf(testCallback.address))[0];
    const signerNewDeposit = (await randomizer.beacon(selectedSigners[1].address)).ethStake;
    expect(retry.args.ethToClient.gt(0)).to.be.true;
    expect(retry.args.ethToRenewer.gt(0)).to.be.true;
    expect(clientNewDeposit.gte(clientOldDeposit.add(retry.args.ethToClient))).to.be.true;
    expect(clientNewDeposit.lte(clientOriginalDeposit.sub(retry.args.ethToRenewer).add(collateral))).to.be.true;
    expect(signerNewDeposit.lte(signerOldDeposit.sub(retry.args.ethToClient.add(retry.args.ethToRenewer)))).to.be.true;
  });

  it("refunds 0 when collateral is 0", async () => {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let request = await makeRequest(testCallback);
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));

    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);

    await storageController._debug_setCollateral(selectedSigners[1].address, 0);

    await randomizer.connect(selectedSigners[0])['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(selectedSigners[0].address), data.addresses, data.uints, request.seed);

    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);

    // Renew the request
    const clientOldDeposit = (await randomizer.clientBalanceOf(testCallback.address))[0];

    const renew = await randomizer.connect(signers[8]).renewRequest(data.addresses, data.rawUints, request.seed);
    const receipt = await renew.wait();
    // Get logs from receipt
    let retry;
    for (const log of receipt.logs) {
      const event = randomizer.interface.parseLog(log);

      if (event.name === "Retry") retry = event;
    }

    expect(retry.args.ethToClient.eq(0)).to.be.true;
    expect(retry.args.ethToRenewer.eq(0)).to.be.true;
  });

  it("refund only to sender on renew when a striked beacon has less than renew fee as collateral", async () => {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    let request = await makeRequest(testCallback);
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));

    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);

    await storageController._debug_setCollateral(selectedSigners[1].address, ethers.utils.parseUnits("10", "wei"));

    await randomizer.connect(selectedSigners[0])['submitRandom(uint256,address[4],uint256[19],bytes32)'](request.beacons.indexOf(selectedSigners[0].address), data.addresses, data.uints, request.seed);

    await hre.network.provider.send("hardhat_mine", ["0x100", "0xe10"]);

    // Renew the request
    const clientOldDeposit = (await randomizer.clientBalanceOf(testCallback.address))[0];

    const senderOldDeposit = (await randomizer.beacon(signers[8].address)).ethStake;
    const renew = await randomizer.connect(signers[8]).renewRequest(data.addresses, data.rawUints, request.seed);
    const receipt = await renew.wait();
    // Get logs from receipt
    const retry = randomizer.interface.parseLog(receipt.logs.find(log => randomizer.interface.parseLog(log).name === "Retry"));
    const charge = randomizer.interface.parseLog(receipt.logs.find(log => randomizer.interface.parseLog(log).name === "ChargeEth"));
    const chargeEvents = receipt.logs.filter(log => randomizer.interface.parseLog(log).name === "ChargeEth");
    expect(chargeEvents.length).to.equal(1);
    expect(charge.args.amount).to.equal(ethers.utils.parseUnits("10", "wei"))

    const senderNewDeposit = (await randomizer.beacon(signers[8].address)).ethStake;

    const clientNewDeposit = (await randomizer.clientBalanceOf(testCallback.address))[0];
    const signerNewDeposit = (await randomizer.beacon(selectedSigners[1].address)).ethStake;
    expect(clientNewDeposit.eq(clientOldDeposit)).to.be.true;
    expect(signerNewDeposit.eq("0")).to.be.true;
    expect(senderNewDeposit.eq(senderOldDeposit.add(retry.args.ethToRenewer))).to.be.true;
  });



  it("revert with NotEnoughBeaconsAvailable if renewing a request without enough beacons", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    const req = await makeRequest(testCallback);

    // Unregister beacons
    for (const signer of signers) {
      if ((await randomizer.beacons()).includes(signer.address) && ethers.BigNumber.from((await randomizer.beacon(signer.address)).pending).eq(0)) {
        const tx = await randomizer.connect(signer).unregisterBeacon(signer.address);
        await tx.wait();
      }
    }

    await hre.network.provider.send("hardhat_mine", ["0x40", ethers.utils.hexValue(45)]);

    // Renew request with first selectedSigner
    const renewUintData = [req.id, req.ethReserved, req.beaconFee, req.height, req.timestamp, req.expirationBlocks, req.expirationSeconds, req.callbackGasLimit, req.minConfirmations];
    const addressData = [req.client].concat(req.beacons);
    try {
      await randomizer.renewRequest(addressData, renewUintData, req.seed);
      expect(true).to.equal(false);
    }
    catch (e) {
      expect(e).to.match(/NotEnoughBeaconsAvailable/g);
    }
  });

  it("remove a beacon on renewRequest if the beacon did not submit and has below minStakeEth", async function () {
    // Get beacons.length
    const oldBeacons = await randomizer.beacons();
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
    const minStakeEth = await randomizer.configUint(0);
    const beaconStakeEth = (await randomizer.beacon(selectedSigners[0].address)).ethStake;
    const beaconStakeEthMinusMinStakeEth = ethers.BigNumber.from(beaconStakeEth).sub(minStakeEth);
    await randomizer.connect(selectedSigners[0]).beaconUnstakeEth(beaconStakeEthMinusMinStakeEth);
    // Mine 20 blocks with 45 seconds per block
    await hre.network.provider.send("hardhat_mine", ["0x40", ethers.utils.hexValue(45)]);
    // Renew request with second selectedSigner
    const renewUintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations];
    const addressData = [request.client].concat(request.beacons);
    const renewTx = await randomizer.connect(selectedSigners[1]).renewRequest(addressData, renewUintData, request.seed);
    const renew = await renewTx.wait();
    expect(renew.events).to.have.lengthOf(5);
    expect(renew.events[renew.events.length - 1].event).to.equal("Retry");
    expect(renew.events[0].event).to.equal("StrikeBeacon");
    expect(renew.events[1].event).to.equal("StrikeBeacon");

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
    const renewUintData2 = [request2.id, request2.ethReserved, request2.beaconFee, request2.height, request2.timestamp, request2.expirationBlocks, request2.expirationSeconds, request2.callbackGasLimit, request2.minConfirmations];
    const addressData2 = [request2.client].concat(request2.beacons);
    const renewTx2 = await randomizer.connect(selectedSigner2).renewRequest(addressData2, renewUintData2, request2.seed);
    const renew2 = await renewTx2.wait();
    // Expect event "RemoveBeacon" to be emitted by renew
    expect(renew2.events).to.have.lengthOf(6);
    expect(renew2.events[2].event).to.equal("UnregisterBeacon");
    // Expect event "BeaconRemoved" to have correct data
    expect(renew2.events[2].args.beacon).to.equal(selectedSigners[0].address);
    // Get beacons
    const newBeacons = await randomizer.beacons();
    // Expect beacons to have one less than before
    expect(newBeacons).to.have.lengthOf(oldBeacons.length - 1);
  });

});