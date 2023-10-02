/* global ethers */
/* eslint prefer-const: "off" */
require("dotenv").config();

const { getSelectors, FacetCutAction } = require("./libraries/diamond.js");
// const { ethers } = require("hardhat");

// Mute console.log

async function deployDiamond(args, log = false) {
  let oldLog = console.log;
  if (!log) {
    oldLog = console.log;
    console.log = () => {};
  }
  const salt = ethers.utils.formatBytes32String(process.env.SALT);

  const accounts = await ethers.getSigners();
  const contractOwner = accounts[0];

  let gasPrice = (await contractOwner.provider.getGasPrice()).mul(4);
  const Create2Factory = await ethers.getContractFactory("Create2Factory");

  gasPrice = (await contractOwner.provider.getGasPrice()).mul(4);
  const create2 = await Create2Factory.deploy({ gasPrice });

  const cutFacetDeployment = await create2.deployCut(salt);
  const cutDeployReceipt = await cutFacetDeployment.wait();

  const cutAddress = cutDeployReceipt.events.filter(
    (e) => e.event === "CutContractDeployed"
  )[0].args.addr;

  console.log("Cut deployed:", cutAddress);

  // deploy Diamond
  const Diamond = await ethers.getContractFactory("RandomizerDiamond");
  // Convert "salt" to a bytes32 hex string
  gasPrice = (await contractOwner.provider.getGasPrice()).mul(4);

  const deployment = await create2.deploy(
    contractOwner.address,
    cutAddress,
    salt,
    { gasPrice }
  );
  const deployReceipt = await deployment.wait();
  // Get address from ContractDeployed(address) event from receipt
  const diamondAddress = deployReceipt.events[0].address;
  // await diamond.deployed()
  console.log("Diamond deployed:", diamondAddress);

  // deploy DiamondInit
  // DiamondInit provides a function that is called when the diamond is upgraded to initialize state variables
  // Read about how the diamondCut function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
  const DiamondInit = await ethers.getContractFactory("DiamondInit");
  gasPrice = (await contractOwner.provider.getGasPrice()).mul(4);
  const diamondInit = await DiamondInit.deploy({ gasPrice });
  await diamondInit.deployed();
  console.log("DiamondInit deployed:", diamondInit.address);

  // deploy facets
  // console.log('')
  // console.log('Deploying facets')
  const FacetNames = [
    "DiamondLoupeFacet",
    "OwnershipFacet",
    "AdminFacet",
    "ClientFacet",
    "RenewFacet",
    "BeaconFacet",
    "VRFFacet",
  ];
  const cut = [];
  for (const FacetName of FacetNames) {
    const Facet = await ethers.getContractFactory(FacetName);
    gasPrice = (await contractOwner.provider.getGasPrice()).mul(4);
    const facet = await Facet.deploy({ gasPrice });
    await facet.deployed();
    console.log(`${FacetName} deployed: ${facet.address}`);
    cut.push({
      facetAddress: facet.address,
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(facet),
    });
  }

  // upgrade diamond with facets
  console.log("");
  console.log("Diamond Cut:", cut);
  const diamondCut = await ethers.getContractAt("IDiamondCut", diamondAddress);
  let tx;
  let receipt;
  // call to init function
  let functionCall = diamondInit.interface.encodeFunctionData("init", [args]);
  gasPrice = (await contractOwner.provider.getGasPrice()).mul(4);
  tx = await diamondCut.diamondCut(cut, diamondInit.address, functionCall, {
    gasPrice,
  });
  // console.log('Diamond cut tx: ', tx.hash)
  receipt = await tx.wait();
  if (!receipt.status) {
    throw Error(`Diamond upgrade failed: ${tx.hash}`);
  }
  // console.log('Completed diamond cut')

  if (!log) console.log = oldLog;

  return diamondAddress;
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  deployDiamond()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

exports.deployDiamond = deployDiamond;
