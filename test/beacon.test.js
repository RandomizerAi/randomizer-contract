const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const vrfHelper = require("./helpers.js");
const { deployDiamond } = require('../scripts/deploy.js')
const randomizerAbi = require("../abi/Randomizer.json").abi;
const {
  getSelectors,
  FacetCutAction,
} = require('../scripts/libraries/diamond.js');

describe("Beacon Tests", function () {
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
      // await randomizer.testCharge(testCallback.address, signer.address, 1);
      const data = await vrfHelper.getSubmitData(signer.address, request);
      const tx = await randomizer.connect(signer)['submitRandom(uint256,address[4],uint256[18],bytes32)'](request.beacons.indexOf(signer.address), data.addresses, data.uints, request.seed);

      const res = await tx.wait();
      const requestEventRaw = res.logs.find(log => randomizer.interface.parseLog(log).name === "RequestBeacon");

      // Process RequestBeacon event (from 2nd-to-last submitter)
      if (requestEventRaw) {
        const requestEvent = randomizer.interface.parseLog(requestEventRaw);
        selectedFinalBeacon = requestEvent.args.beacon;
        expect(selectedFinalBeacon).to.not.equal(ethers.constants.AddressZero);
        request.beacons = [request.beacons[0], request.beacons[1], selectedFinalBeacon];
        request.timestamp = requestEvent.args.timestamp;
        request.seed = requestEvent.args.seed;
        request.height = requestEventRaw.blockNumber;
      }
    }
    const finalSigner = signers.filter(signer => selectedFinalBeacon == signer.address)[0];
    const data = await vrfHelper.getSubmitData(finalSigner.address, request);
    const tx = await randomizer.connect(finalSigner)['submitRandom(uint256,address[4],uint256[18],bytes32)'](request.beacons.indexOf(finalSigner.address), data.addresses, data.uints, request.seed);
    await tx.wait();

    const callbackResult = await testCallback.result();
    return callbackResult;
  }

  let randomizer;
  let diamondAddress;
  let storageController;
  let signers;
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

    let ecKeys = [];
    let i = 1;
    while (i < 7) {
      const keys = vrfHelper.getVrfPublicKeys(signers[i].address);
      ecKeys = ecKeys.concat(keys);
      i++;
    }
    diamondAddress = await deployDiamond([signers[0].address, signers[0].address, ["500000000000000000", 20, 900, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3], [signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address, signers[6].address], ecKeys, [570000, 90000, 65000, 21000, 21000, 21000, 21000]])
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

    randomizer = await ethers.getContractAt(randomizerAbi, diamondAddress);
    vrfHelper.init(randomizer);
    const TestCallback = await ethers.getContractFactory("TestCallback");
    testCallback = await TestCallback.deploy(diamondAddress);
    storageController = await ethers.getContractAt('StorageControlFacet', diamondAddress)
  });



  it("fail beacon withdraw when it is not sender/owner or has pending requests", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    const req = await testCallback.makeRequest();
    // Get request data
    const res = await req.wait();
    const request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id, height: res.logs[0].blockNumber };
    const selectedSigner = signers.filter(signer => request.beacons[0] == signer.address)[0];
    const beacon = (await randomizer.beacon(selectedSigner.address));

    expect(beacon.pending).to.equal(ethers.BigNumber.from(1));

    await expect(randomizer.connect(selectedSigner).beaconUnstakeEth((await randomizer.beacon(selectedSigner.address)).ethStake)).to.be.revertedWith(`BeaconHasPending(${ethers.BigNumber.from(1)})`);
    await expect(randomizer.connect(selectedSigner).unregisterBeacon(selectedSigner.address)).to.be.revertedWith(`BeaconHasPending(${ethers.BigNumber.from(1)})`);
    await expect(randomizer.connect(signers[7]).unregisterBeacon(selectedSigner.address)).to.be.revertedWith(`NotOwnerOrBeacon`);
    await signAndCallback(request);

    await expect(randomizer.connect(selectedSigner).unregisterBeacon(selectedSigner.address)).to.not.be.reverted;
    pending = ((await randomizer.beacon(selectedSigner.address))).pending.toNumber();
    expect(pending).to.equal(0);
  });

  it("send full beacon ETH stake to beacon after unregisterBeacon", async function () {
    await randomizer.connect(signers[1]).beaconStakeEth(signers[1].address, { value: ethers.utils.parseEther("5") });
    // Get balance of wallet signers[0]
    const oldBalance = await signers[1].getBalance();
    await randomizer.connect(signers[1]).unregisterBeacon(signers[1].address);
    const newBalance = await signers[1].getBalance();
    expect(newBalance.gt(oldBalance)).to.be.true;
  });

  it("register a new beacon", async function () {
    await randomizer.beaconStakeEth(signers[7].address, { value: ethers.utils.parseEther("5") });
    const publicKeys = vrfHelper.getVrfPublicKeys(signers[7].address);
    const tx = await randomizer.registerBeacon(signers[7].address, publicKeys);
    const receipt = await tx.wait();
    // Check if receipt emitted a RegisterBeacon event
    const event = receipt.events.find(e => e.event == "RegisterBeacon");
    expect(event).to.exist;

  });

  it("unregister beacon if unstaking more than minimum stake", async function () {
    await randomizer.connect(signers[1]).beaconStakeEth(signers[1].address, { value: ethers.utils.parseEther("5") });
    const unstake = await randomizer.connect(signers[1]).beaconUnstakeEth(ethers.utils.parseEther("5"));
    const unstakeReceipt = await unstake.wait();
    const event = unstakeReceipt.events.find(e => e.event == "UnregisterBeacon");
    const event2 = unstakeReceipt.events.find(e => e.event == "WithdrawEth");
    expect(event).to.exist;
    expect(event2).to.exist;
  });

  it("revert with FailedToSendEth if beacon unstake more than contract balance", async function () {
    await randomizer.beaconStakeEth(signers[1].address, { value: ethers.utils.parseEther("5") });
    await network.provider.send("hardhat_setBalance", [
      randomizer.address,
      "0x0"
    ]);
    try {
      await randomizer.connect(signers[1]).beaconUnstakeEth(ethers.utils.parseEther("5"));
      expect(true).to.be.false;
    } catch (e) {
      expect(e).to.match(/FailedToSendEth/);
    }
  });

  it("return all registered beacons with beacons and update indices on register", async function () {
    let beacons = await randomizer.beacons();
    expect(beacons.length).to.equal(7);
    // beaconIndex[beacons[1]] is 1
    expect((await randomizer.beacon(beacons[1])).index).to.equal(1);
    expect((await randomizer.beacon(beacons[beacons.length - 1])).index).to.equal(beacons.length - 1);
    await randomizer.beaconStakeEth(signers[0].address, { value: ethers.utils.parseEther("5") });
    const publicKeys = vrfHelper.getVrfPublicKeys(signers[0].address);
    await randomizer.registerBeacon(signers[0].address, publicKeys);
    const newBeacons = await randomizer.beacons();

    // Iterate through beacons and check that the indices match in randomizer.beaconIndex(beacon)
    for (let i = 0; i < newBeacons.length; i++) {
      expect((await randomizer.beacon(newBeacons[i])).index).to.equal(i);
    }

    // The previously last beacon is now second-to-last
    expect((await randomizer.beacon(beacons[beacons.length - 1])).index).to.equal(newBeacons.length - 2);
    beacons = newBeacons;
    expect(beacons.length).to.equal(8);
    expect((await randomizer.beacon(beacons[7])).index).to.equal(7);
    expect((await randomizer.beacon(signers[0].address)).index).to.equal(7);
    await randomizer.unregisterBeacon(signers[6].address);
    // The last beacon's index is now 6
    expect((await randomizer.beacon(newBeacons[7])).index).to.equal(6);
    expect((await randomizer.beacon(newBeacons[6])).index).to.equal(0);
    beacons = await randomizer.beacons();
    expect(beacons.length).to.equal(7);
  });

  it("throw if beacon is registered without enough stake", async function () {
    const publicKeys = vrfHelper.getVrfPublicKeys(signers[0].address);
    await expect(randomizer.registerBeacon(signers[0].address, publicKeys)).to.be.revertedWith("BeaconStakedEthTooLow(0, 500000000000000000)");
  });

  it("return all registered beacons with beacons and update indices on unregister", async function () {
    const beacons = await randomizer.beacons();
    expect(beacons.length).to.equal(7);
    // beaconIndex[beacons[1]] is 1
    expect((await randomizer.beacon(beacons[1])).index).to.equal(1);
    const tx = await randomizer.unregisterBeacon(beacons[2]);
    await tx.wait();
    const beacons2 = await randomizer.beacons();
    expect((await randomizer.beacon(beacons[6])).index).to.equal(2);
    expect(beacons2.length).to.equal(6);
  });

  it("remove the final beacon from the list of beacons", async function () {
    const beacons = await randomizer.beacons();
    expect(beacons.length).to.equal(7);
    const secondToLastBeacon = beacons[beacons.length - 2];
    const secondToLastBeaconIndex = (await randomizer.beacon(secondToLastBeacon)).index;
    const tx = await randomizer.unregisterBeacon(beacons[6]);
    await tx.wait();
    const beacons2 = await randomizer.beacons();
    expect(beacons2.length).to.equal(6);
    expect((await randomizer.beacon(secondToLastBeacon)).index).to.equal(secondToLastBeaconIndex);
  });

  it("beacon receives rest of deposit if submit tx fee is greater than client deposit [ @skip-on-coverage ]", async function () {
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    const req = await testCallback.makeRequest();
    // Get request data
    const res = await req.wait();
    const request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id, height: res.logs[0].blockNumber };
    const selectedSigner = signers.filter(signer => request.beacons[0] == signer.address)[0];
    const oldStake = (await randomizer.beacon(selectedSigner.address)).ethStake;
    await storageController.connect(signers[9])._debug_setClientDeposit(testCallback.address, ethers.utils.parseUnits("5", "wei"));

    const data = await vrfHelper.getSubmitData(selectedSigner.address, request);
    const tx = await randomizer.connect(selectedSigner)['submitRandom(uint256,address[4],uint256[18],bytes32)'](request.beacons.indexOf(selectedSigner.address), data.addresses, data.uints, request.seed);
    const receipt = await tx.wait();
    const newStake = (await randomizer.beacon(selectedSigner.address)).ethStake;
    const chargeEvents = receipt.events.filter(e => e.event == "ChargeEth");
    expect(chargeEvents.length).to.equal(1);
    expect(chargeEvents[0].args.amount).to.equal(ethers.utils.parseUnits("5", "wei"));
    expect(chargeEvents[0].args.from).to.equal(testCallback.address);
    expect(chargeEvents[0].args.to).to.equal(selectedSigner.address);
    expect(newStake.eq(oldStake.add(5))).to.be.true;
    expect((await randomizer.clientBalanceOf(testCallback.address))[0].toNumber()).to.equal(0);
  });

  it("sequencer receives rest of deposit if client deposit is less than sequencer fee [ @skip-on-coverage ]", async function () {
    await randomizer.connect(signers[0]).setConfigUint(5, ethers.utils.parseEther("1"));
    const deposit = await randomizer.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("6") });
    await deposit.wait();
    const req = await testCallback.makeRequest();
    // Get request data
    const res = await req.wait();
    const request = { ...randomizer.interface.parseLog(res.logs[0]).args.request, id: randomizer.interface.parseLog(res.logs[0]).args.id, height: res.logs[0].blockNumber };
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));
    const data = await vrfHelper.getSubmitData(selectedSigners[0].address, request);
    const data2 = await vrfHelper.getSubmitData(selectedSigners[1].address, request);

    await randomizer.connect(selectedSigners[0])['submitRandom(uint256,address[4],uint256[18],bytes32)'](request.beacons.indexOf(selectedSigners[0].address), data.addresses, data.uints, request.seed);
    const reqTx = await randomizer.connect(selectedSigners[1])['submitRandom(uint256,address[4],uint256[18],bytes32)'](request.beacons.indexOf(selectedSigners[1].address), data2.addresses, data2.uints, request.seed);
    // Get final beacon
    const reqReceipt = await reqTx.wait();
    const log = reqReceipt.logs.find(log => randomizer.interface.parseLog(log).name == "RequestBeacon");
    const event = randomizer.interface.parseLog(log).args;
    const finalBeacon = signers.find(signer => signer.address == event.beacon);

    request.beacons = [request.beacons[0], request.beacons[1], finalBeacon.address];
    request.height = log.blockNumber;
    request.timestamp = event.timestamp;
    request.seed = event.seed;

    const oldStake = (await randomizer.beacon(request.beacons[2])).ethStake;
    const newData = await vrfHelper.getSubmitData(request.beacons[2], request);


    await storageController.connect(signers[9])._debug_setClientDeposit(testCallback.address, ethers.utils.parseEther("2"));
    const tx = await randomizer.connect(finalBeacon)['submitRandom(uint256,address[4],uint256[18],bytes32)'](2, newData.addresses, newData.uints, request.seed);
    const receipt = await tx.wait();
    const newStake = (await randomizer.beacon(request.beacons[2])).ethStake;
    const chargeEvents = receipt.events.filter(e => e.event == "ChargeEth");
    const submitterReward = receipt.effectiveGasPrice.mul(receipt.gasUsed).add(request.beaconFee);
    expect(chargeEvents.length).to.equal(2);
    expect(chargeEvents[1].args.amount.gt(0)).to.be.true;
    expect(chargeEvents[1].args.amount.gte(submitterReward.mul(8).div(10)) && chargeEvents[0].args.amount.lte(submitterReward.mul(12).div(10))).to.be.true;
    expect(chargeEvents[1].args.from).to.equal(testCallback.address);
    expect(chargeEvents[1].args.to).to.equal(finalBeacon.address);
    expect(newStake.eq(oldStake.add(chargeEvents[1].args.amount))).to.be.true;
    expect(((await randomizer.clientBalanceOf(testCallback.address))[0]).eq(0)).to.be.true;

    expect(chargeEvents[0].args.amount.gt(0)).to.be.true;
    expect(chargeEvents[0].args.amount.lt(request.beaconFee)).to.be.true;
    expect(chargeEvents[0].args.amount).to.equal(ethers.utils.parseEther("2").sub(chargeEvents[1].args.amount));
    expect(chargeEvents[0].args.from).to.equal(testCallback.address);
    expect(chargeEvents[0].args.to).to.equal(await randomizer.sequencer());
  });
});