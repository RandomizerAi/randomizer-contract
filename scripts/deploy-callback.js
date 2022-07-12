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
  const soRandomAddress = process.env.CONTRACT_ADDRESS_ARBITRUM;


  const TestCallback = await hre.ethers.getContractFactory("TestCallback");
  const testCallback = await TestCallback.deploy(soRandomAddress);
  // const testCallback = TestCallback.attach("0xf3bf49f51E6b2e17ceD9822ec80603447165e312");

  const SoRandom = await hre.ethers.getContractFactory("SoRandom");
  const soRandom = SoRandom.attach(soRandomAddress);

  const ArbGasInfo = await ethers.getContractFactory("ArbGasInfo");
  const arbGasInfo = ArbGasInfo.attach("0x000000000000000000000000000000000000006C");


  // await testCallback.deployed();

  console.log("testCallback deployed to:", testCallback.address);
  let arbGasPrice = (await arbGasInfo.getPricesInWei())[5];

  const deposit = await soRandom.clientDeposit(testCallback.address, { value: ethers.utils.parseEther("0.001") });
  await deposit.wait();
  console.log("deposited");


  // const tx = await testCallback.makeRequest({ gasPrice: arbGasPrice });
  // const rc = await tx.wait();
  // const id = soRandom.interface.parseLog(rc.logs[0]).args[0];

  // console.log("random id", id);

  // const request = await soRandom.getRequest(id);

  // // console.log(request);

  // console.log(request);

  // const messageHash = ethers.utils.keccak256(
  //   ethers.utils.defaultAbiCoder.encode(
  //     ["address", "uint256", "uint256"],
  //     [testCallback.address, id, request.seed]
  //   )
  // );

  // const messageHashBytes = ethers.utils.arrayify(messageHash);

  // const selectedBeacons = request.beacons;

  // console.log("beacons", selectedBeacons);

  // for (let i = 0; i < 4; i++) {
  //   const signer = new hre.ethers.Wallet(process.env["SIGNER_" + (i + 1)], hre.ethers.provider);
  //   if (selectedBeacons.includes(String(signer.address))) {
  //     const flatSig = await signer.signMessage(messageHashBytes);
  //     const sig = ethers.utils.splitSignature(flatSig);

  //     arbGasPrice = (await arbGasInfo.getPricesInWei())[5];
  //     console.log("GAS PRICE", arbGasPrice);

  //     const tx = await soRandom.connect(signer).submitRandom(id, sig.r, sig.s, sig.v, { maxFeePerGas: arbGasPrice * 1.5, maxPriorityFeePerGas: 0 });
  //     const receipt = await tx.wait();
  //     // console.log(receipt);
  //     const gasPaid = ethers.utils.formatEther(receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice));
  //     // console.log("Submit Random Gas: ", receipt.cumulativeGasUsed);
  //     // console.log("Submit Random Gas Cost: ", gasPaid);
  //   }
  // }

  // // Final submit
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
