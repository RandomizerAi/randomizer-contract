const { expect } = require("chai");
const { ethers } = require("hardhat");
// const hre = require("hardhat");

describe("Request & Submit", function () {

  const makeRequest = async (contract) => {
    let res = await (await contract.makeRequest()).wait();
    const req = { ...soRandom.interface.parseLog(res.logs[0]).args.request, id: soRandom.interface.parseLog(res.logs[0]).args.id };
    return req;
  }

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
    await tx.wait();

    const callbackResult = await testCallback.result();
    return callbackResult;
  }

  let signers;
  let soRandom;
  let testCallback;
  let arbGasInfo;
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
    const ArbGasInfo = await ethers.getContractFactory("ArbGasInfo");
    arbGasInfo = await ArbGasInfo.deploy();
    signers = await ethers.getSigners();
    const SoRandom = await ethers.getContractFactory("SoRandom");
    // const Factory = await ethers.getContractFactory("SoRandomFactory");

    // address _developer,
    // address _arbGas,
    // uint8 _maxStrikes,
    // uint256 _minCollateralEth,
    // uint256 _expirationBlocks,
    // uint256 _expirationSeconds,
    // uint256 _beaconFee,
    // address[] memory _beacons
    soRandom = await SoRandom.deploy(ethers.constants.AddressZero, 3, "500000000000000000", 20, 900, ethers.utils.parseEther("0.00005"), [signers[0].address, signers[1].address, signers[2].address, signers[3].address, signers[4].address, signers[5].address]);

    // factory = await Factory.deploy(soRandom.address);

    const TestCallback = await ethers.getContractFactory("TestCallback");
    testCallback = await TestCallback.deploy(soRandom.address);

    // await factory.connect(signers[4]).subscribe(testCallback.address);

    // const Subscriber = await ethers.getContractFactory("SoRandomSubscriber");
    // subscriber = await Subscriber.attach(
    //   await soRandom.getSubscriber(testCallback.address)
    // );
    // await testCallback.setSubscriber(soRandom.address);
  });
  // it("Should return the subscriber address for the client contract", async function () {
  //   const subscriberAddress = await soRandom.getSubscriber(testCallback.address);
  //   expect(await soRandom.getClient(subscriberAddress)).to.equal(testCallback.address);
  // });

  // it("Should make a deposit", async function () {
  //   await signers[4].sendTransaction({ to: subscriber.address, value: 1000000000000000000 });
  // });

  it("Should make deposit and a new random request", async function () {
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

  it("Should make multiple deposits and random requests", async function () {
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
          // console.log(sig);
          if (sig != "0x000000000000000000000000") {
            signed = true;
          }
        }
        expect(signed).to.equal(true);
      }
    }
  });

  it("Should accept random submissions from beacons and finally callback", async function () {
    // const tx = await signers[4].sendTransaction({ to: subscriber.address, value: ethers.utils.parseEther("1") });
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();

    const req = await testCallback.makeRequest();
    const res = await req.wait();
    let request = soRandom.interface.parseLog(res.logs[0]).args.request;

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

      if (requestEvent.name == "RequestBeacon") {
        selectedFinalBeacon = requestEvent.args.beacon;
        expect(selectedFinalBeacon).to.not.equal(ethers.constants.AddressZero);
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

    const tx = await soRandom.connect(finalSigner).submitRandom(addressData, uintData, bytesData);
    await tx.wait();

    const callbackResult = await testCallback.result();
    expect(callbackResult).to.not.equal(ethers.constants.HashZero);

  });

  it("Should charge enough per submit to cover gas cost and let beacon withdraw", async function () {
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
    const arbGasPrice = ethers.BigNumber.from((await arbGasInfo.getPricesInWei())[5]);

    let selectedFinalBeacon;
    for (const signer of selectedSigners) {

      const flatSig = await signer.signMessage(messageHashBytes);
      const sig = ethers.utils.splitSignature(flatSig);
      const uintData = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit, sig.v];
      const addressData = [request.client].concat(request.beacons);
      const bytesData = [sig.r, sig.s, request.seed];
      const tx = await soRandom.connect(signer).submitRandom(addressData, uintData, bytesData);
      const receipt = await tx.wait();
      const gasPaid = arbGasPrice.mul(receipt.gasUsed).add(await soRandom.beaconFee());
      expect((await soRandom.getBeaconStakeEth(signer.address)).gte(gasPaid)).to.be.true;
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
    const minFee = arbGasPrice.mul(receipt.gasUsed).add(await soRandom.beaconFee());
    const balance = await soRandom.getBeaconStakeEth(finalSigner.address);
    expect(balance.gte(minFee)).to.be.true;
  });

  it("Should fail client withdraw when it has pending requests", async function () {
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    const req = await testCallback.makeRequest();
    const res = await req.wait();
    const request = { ...soRandom.interface.parseLog(res.logs[0]).args.request, id: soRandom.interface.parseLog(res.logs[0]).args.id };
    expect((await soRandom.getEthReserved(testCallback.address)).gt(0)).to.be.true;
    await expect(testCallback.soRandomWithdraw(ethers.utils.parseEther("5"))).to.be.revertedWith(`WithdrawingTooMuch(${ethers.utils.parseEther("5").toString()}, ${ethers.utils.parseEther("5").sub(await soRandom.getEthReserved(testCallback.address)).toString()})`);
    await signAndCallback(request);
    expect((await soRandom.getEthReserved(testCallback.address)).eq(0)).to.be.true;
    await expect(testCallback.soRandomWithdraw(ethers.utils.parseEther("5"))).to.be.revertedWith(`WithdrawingTooMuch(${ethers.utils.parseEther("5").toString()}, ${(await soRandom.clientBalanceOf(testCallback.address)).toString()})`);
    const remaining = await soRandom.clientBalanceOf(testCallback.address);
    await expect(testCallback.soRandomWithdraw(remaining)).to.not.be.reverted;
    expect((await soRandom.clientBalanceOf(testCallback.address)).eq(0)).to.be.true;
  });

  it("Should fail beacon withdraw when it has pending requests", async function () {
    const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("5") });
    await deposit.wait();
    const req = await testCallback.makeRequest();
    // Get request data
    const res = await req.wait();
    const request = { ...soRandom.interface.parseLog(res.logs[0]).args.request, id: soRandom.interface.parseLog(res.logs[0]).args.id };
    const selectedSigner = signers.filter(signer => request.beacons[0] == signer.address)[0];
    let pending = (await soRandom.getBeacon(selectedSigner.address)).pendingCount.toNumber();
    expect(pending).to.be.gt(0);

    await expect(soRandom.connect(selectedSigner).unregisterBeacon(selectedSigner.address)).to.be.revertedWith(`BeaconHasPending(${pending})`);

    await signAndCallback(request);

    await expect(soRandom.connect(selectedSigner).unregisterBeacon(selectedSigner.address)).to.not.be.reverted;
    pending = (await soRandom.getBeacon(selectedSigner.address)).pendingCount.toNumber();
    expect(pending).to.equal(0);
  });

  // it("Should allow beacon completeAndUnregister", async function () {
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
