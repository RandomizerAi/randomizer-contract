const hre = require("hardhat");

async function main() {

  const GasOffsets = await hre.ethers.getContractFactory("GasOffsets");
  const gasOffsets = await GasOffsets.deploy();
  await gasOffsets.deployed();

  console.log("gasOffsets deployed to:", gasOffsets.address);

  let tx = await gasOffsets.submitRandom();
  let receipt = await tx.wait();
  // Get the last event's value
  let gasUsed = receipt.events[receipt.events.length - 1].args.gasUsed;
  console.log("submitRandom: ", gasUsed.toString());
  tx = await gasOffsets.submitRandomLast();
  receipt = await tx.wait();
  gasUsed = receipt.events[receipt.events.length - 1].args.gasUsed;
  console.log("submitRandomLast: ", gasUsed.toString());
  tx = await gasOffsets.renewRequest();
  receipt = await tx.wait();
  gasUsed = receipt.events[receipt.events.length - 1].args.gasUsed;
  console.log("renewRequest: ", gasUsed.toString());

  const toAddress = (n) => {
    return "0x" + Number(n).toString(16).padStart(40, "0");
  }
  tx = await gasOffsets.beaconSelectIteration([toAddress(1), toAddress(2)]);
  receipt = await tx.wait();
  gasUsed = receipt.events[receipt.events.length - 1].args.gasUsed;
  // Get tx gas cost
  let gasCost = receipt.gasUsed.mul(tx.gasPrice);
  console.log("beaconSelectIteration gas: ", gasUsed.toString(), gasCost.toString());
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
