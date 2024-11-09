require("dotenv").config();

const hre = require("hardhat");
const vrfHelper = require("../test/helpers.js");

async function main() {
  const env = process.env;

  // const addresses = [];
  // for (let i = 1; i <= 10; i++) {
  //   const envVar = `SIGNER_${i}`;
  //   if (process.env[envVar]) {
  //     const wallet = new ethers.Wallet(process.env[envVar]);
  //     addresses.push(wallet.address);
  //   }
  // }

  // let i = 0;
  // let ecKeys = [];
  // while (i < addresses.length) {
  //   console.log(`Signer ${i} prover key: ${process.env[`PROVER_${i + 1}`]}`);
  //   const keys = vrfHelper.getVrfPublicKeys(process.env[`PROVER_${i + 1}`]);
  //   ecKeys = ecKeys.concat(keys);
  //   i++;
  // }
  const accounts = await ethers.getSigners()
  const contractOwner = accounts[0]

  // Main diamond
  const args = {
    address: hre.network.config.contracts.randomizer,
    constructorArguments: [
      contractOwner.address,
      "0x44f50309e992f6f1b3ac498af9a9de655bc7290e"
    ]
  };

  console.log(args);

  // await hre.run("verify:verify", args);

  console.log("Verified Randomizer Diamond");

  // Facet addresses
  const facets = [
    "0x091035ea994bccb3f12867ea484592b6b3cd53fd",
    // "0x04f1c261790b48c37e83bc123dcbb9e4f03492d7",
    // "0x5ff1372f788753f977e79bcfb14e9ad5f0bdce3a",
    // "0xc83a0c428f45c9ddbea825c3a80b52104807648d",
    // "0xa8fa44d1babd1a03a9083b19c1bb55a6c87c6d09",
    // "0x993b65991c06cedecbce229a1cb11f7dae2e20fa",
    // "0x5a3ca4fec826628719d41a1a8a012c070ae7cddf",
    // "0x6c4cf71f4500de699cad1999d8a1e55f5a364442",
    // "0x3a15462d61bd0645b9592121605244b814f3697d",
    // "0x471b89a2a4ac09ce95e48808e3e1fd5af9214ffd"
  ];

  // verify for each facet
  for (const facet of facets) {
    console.log("Verifying", facet);
    try{
    await hre.run("verify:verify", {
      address: facet,
      constructorArguments: []
    });
    console.log("Verified", facet);
  }catch(e){
    console.log(e);
  }
  }
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
