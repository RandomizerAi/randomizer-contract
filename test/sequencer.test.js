const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const vrfHelper = require("./helpers.js");
const { deployDiamond } = require('../scripts/deploy.js')
const randomizerAbi = require("../abi/Randomizer.json").abi;
const {
  getSelectors,
  FacetCutAction,
} = require('../scripts/libraries/diamond.js');

describe("Sequencer", function () {
  let signers;
  let randomizer;
  let testCallback;
  let vrf;
  let sequencer;

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


    let ecKeys = [];
    let i = 0;
    while (i < 6) {
      const keys = vrfHelper.getVrfPublicKeys(signers[i].address);
      ecKeys = ecKeys.concat(keys);
      i++;
    }
    sequencer = signers[6];
    const diamondAddress = await deployDiamond([signers[6].address, signers[6].address, ["500000000000000000", 40, 900, 10000, 3000000, ethers.utils.parseEther("0.00005"), 3, 99, 1, 45], [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address], ecKeys, [570000, 90000, 65000, 21000, 21000, 21000, 21000]])
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
    testCallback = await TestCallback.deploy(randomizer.address);
  });

  const signAndCallback = async (request, client) => {
    if (!client) client = testCallback;
    // Get beacons
    const selectedSigners = signers.filter(signer => request.beacons.includes(signer.address));
    const chainId = (await ethers.provider.getNetwork()).chainId;

    let i = 0;
    for (const signer of selectedSigners) {

      const data = await vrfHelper.getSubmitData(signer.address, request);

      // abi.encode and sign the data as the signer
      const messageHash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "bytes32", "uint256", "uint256[4]", "uint256[2]", "uint256[4]", "uint256"],
          [randomizer.address, request.client, request.seed, request.id, data.vrf.proof, data.vrf.params[0], data.vrf.params[1], chainId]
        )
      );

      const messageHashBytes = ethers.utils.arrayify(messageHash);
      const flatSig = await signer.signMessage(messageHashBytes);
      const sig = ethers.utils.splitSignature(flatSig);
      const rsAndSeed = [sig.r, sig.s, request.seed];

      try {
        const someSigner = signers.find(signer => !request.beacons.includes(signer.address) && signer.address !== sequencer.address);
        await randomizer.connect(someSigner)['submitRandom(uint256,address[4],uint256[19],bytes32[3],uint8)'](request.beacons.indexOf(signer.address), data.addresses, data.uints, rsAndSeed, sig.v);
        expect(true).to.be.false;
      } catch (e) {
        expect(e.message).to.match(/SenderNotBeaconOrSequencer/);
      }


      const secondsRemaining = Math.floor(request.timestamp.toNumber() + (request.expirationSeconds.toNumber() / 2)) - ((await ethers.provider.getBlock()).timestamp - 30);
      const blocksRemaining = Math.floor(request.height + (request.expirationBlocks.toNumber() / 2)) - await ethers.provider.getBlockNumber();

      if (i === 0) {
        try {
          await randomizer.connect(sequencer)['submitRandom(uint256,address[4],uint256[19],bytes32[3],uint8)'](request.beacons.indexOf(signer.address), data.addresses, data.uints, rsAndSeed, sig.v);
          expect(true).to.be.false;
        } catch (e) {
          expect(e.message).to.match(/SequencerSubmissionTooEarly/);
          await hre.network.provider.send("hardhat_mine", [ethers.utils.hexValue(Math.ceil(blocksRemaining)), ethers.utils.hexValue(Math.ceil(secondsRemaining / blocksRemaining))]);
        }
        i++;
      }


      const tx = await randomizer.connect(sequencer)['submitRandom(uint256,address[4],uint256[19],bytes32[3],uint8)'](request.beacons.indexOf(signer.address), data.addresses, data.uints, rsAndSeed, sig.v);

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
        request.seed = requestEvent.args.seed;
        request.height = requestEventRaw.blockNumber;
      }
    }
    const finalSigner = signers.filter(signer => selectedFinalBeacon == signer.address)[0];
    const data = await vrfHelper.getSubmitData(finalSigner.address, request);
    const messageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "bytes32", "uint256", "uint256[4]", "uint256[2]", "uint256[4]", "uint256"],
        [randomizer.address, request.client, request.seed, request.id, data.vrf.proof, data.vrf.params[0], data.vrf.params[1], chainId]
      )
    );

    const messageHashBytes = ethers.utils.arrayify(messageHash);
    const flatSig = await finalSigner.signMessage(messageHashBytes);
    const sig = ethers.utils.splitSignature(flatSig);
    const rsAndSeed = [sig.r, sig.s, request.seed];
    const secondsRemaining = Math.floor(request.timestamp + request.expirationSeconds / 2) - Math.floor(Date.now() / 1000);
    const blocksRemaining = Math.floor(request.height + request.expirationBlocks / 2) - await ethers.provider.getBlockNumber();

    await hre.network.provider.send("hardhat_mine", [ethers.utils.hexValue(blocksRemaining), ethers.utils.hexValue(Math.ceil(secondsRemaining / blocksRemaining))]);

    const tx = await randomizer.connect(sequencer)['submitRandom(uint256,address[4],uint256[19],bytes32[3],uint8)'](2, data.addresses, data.uints, rsAndSeed, sig.v);
    return await tx.wait();
  }


  it("submit random as sequencer on behalf of a selected beacon", async function () {
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
    expect(callbackFailedEvent.name).to.equal("CallbackFailed");
    expect(callbackFailedEvent.args.id).to.equal(request.id);
    // Except getResult(request.id) to return not be bytes32(0)
    const result = (await randomizer.getRequest(request.id)).result;
    expect(result).to.not.equal(ethers.constants.HashZero);

  });

});
