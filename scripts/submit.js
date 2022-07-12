// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const TestCallback = await hre.ethers.getContractFactory("TestCallback");
  // const testCallback = await TestCallback.deploy(soRandomAddress);
  const testCallback = TestCallback.attach("0xfc21c4d456afcda147f5E9d2988c823C901a1FE0");

  const soRandomAddress = "0xbc5817bb0f60Ecf6B45C8cf861B5f8D23F2bcdA4";
  const SoRandom = await hre.ethers.getContractFactory("SoRandom");
  const soRandom = SoRandom.attach(soRandomAddress);

  const req = await soRandom.getRequest("1");
  console.log(req);


  // await testCallback.deployed();

  // console.log("testCallback deployed to:", testCallback.address);
  // let arbGasPrice = (await arbGasInfo.getPricesInWei())[5];

  // const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("0.1") });
  // await deposit.wait();
  // console.log("deposited");


  // console.log(request);





  for (let i = 0; i < 4; i++) {
    const signer = new hre.ethers.Wallet(process.env["SIGNER_" + (i + 1)], hre.ethers.provider);
    console.log(signer.address);
    const pending = await soRandom.getBeaconPendingRequestIds(signer.address);
    console.log(pending);
    for (const id of pending) {
      console.log("signing", id.toString());

      const request = await soRandom.getRequest(id);

      const messageHash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["address", "uint256", "uint256"],
          [testCallback.address, id, request.seed]
        )
      );
      const messageHashBytes = ethers.utils.arrayify(messageHash);

      const flatSig = await signer.signMessage(messageHashBytes);
      const sig = ethers.utils.splitSignature(flatSig);

      const tx = await soRandom.connect(signer).submitRandom(id, sig.r, sig.s, sig.v);
      // const receipt = await tx.wait();
      await tx.wait();
    }
    // console.log(receipt);
    // const gasPaid = ethers.utils.formatEther(receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice));
    // console.log("Submit Random Gas: ", receipt.cumulativeGasUsed);
    // console.log("Submit Random Gas Cost: ", gasPaid);
  }

  // Final submit
  // const newReq = await soRandom.getRequest(id);

  // const selectedBeaconsFinal = newReq.beacons[2];

  // console.log("Final submitter:", selectedBeaconsFinal);

  // for (let i = 0; i < 4; i++) {
  //   const signer = new hre.ethers.Wallet(process.env["SIGNER_" + (i + 1)], hre.ethers.provider);

  //   if (signer.address == selectedBeaconsFinal) {
  //     arbGasPrice = (await arbGasInfo.getPricesInWei())[5];

  //     const flatSig = await signer.signMessage(messageHashBytes);
  //     const sig = ethers.utils.splitSignature(flatSig);
  //     const tx2 = await soRandom.connect(signer).submitRandom(id, sig.r, sig.s, sig.v, { maxFeePerGas: arbGasPrice * 1.5, maxPriorityFeePerGas: 0 });
  //     const receipt = await tx2.wait();
  //     console.log(receipt);
  //     break;
  //   }
  // }
}


// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
