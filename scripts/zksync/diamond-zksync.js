/* global ethers */
/* eslint prefer-const: "off" */
require('dotenv').config()
const { getSelectors, FacetCutAction } = require('../libraries/diamond.js')
const { Deployer } = require("@matterlabs/hardhat-zksync-deploy");
const { Wallet, Contract, Provider } = require("zksync-web3");
const { ethers } = require('hardhat');

async function deployDiamond(args, hre) {
  const provider = new Provider(hre.userConfig.zkSyncDeploy?.zkSyncNetwork);
  const wallet = new Wallet(process.env.PRIVATE_KEY, provider);
  const deployer = new Deployer(hre, wallet);

  // deploy DiamondCutFacet
  const DiamondCutFacet = await deployer.loadArtifact('DiamondCutFacet')
  const diamondCutFacet = await deployer.deploy(DiamondCutFacet, [])
  await diamondCutFacet.deployed()
  console.log('DiamondCutFacet deployed:', diamondCutFacet.address)

  // deploy Diamond
  const Diamond = await deployer.loadArtifact('RandomizerDiamond')
  const diamond = await deployer.deploy(Diamond, [wallet.address, diamondCutFacet.address])
  await diamond.deployed()
  console.log('Diamond deployed:', diamond.address)

  // deploy DiamondInit
  // DiamondInit provides a function that is called when the diamond is upgraded to initialize state variables
  // Read about how the diamondCut function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
  const DiamondInit = await deployer.loadArtifact('DiamondInit')
  const diamondInit = await deployer.deploy(DiamondInit, [])
  await diamondInit.deployed()
  console.log('DiamondInit deployed:', diamondInit.address)

  // deploy facets
  console.log('Deploying facets')
  const FacetNames = [
    'DiamondLoupeFacet',
    'OwnershipFacet',
    'AdminFacet',
    'ClientFacet',
    'RenewFacet',
    'BeaconFacet',
    'VRFFacet'
  ]
  const cut = []
  for (const FacetName of FacetNames) {
    const Facet = await deployer.loadArtifact(FacetName)
    let facet;
    try {
      facet = await deployer.deploy(Facet, []);
      await facet.deployed()
    } catch (e) {
      console.log("deploy error, trying again");
      facet = await deployer.deploy(Facet, []);
      await facet.deployed()
    }
    console.log(`${FacetName} deployed: ${facet.address}`)
    cut.push({
      facetAddress: facet.address,
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(facet)
    })
  }

  // upgrade diamond with facets
  console.log('')
  console.log('Diamond Cut:', cut)
  const IDiamondCut = await deployer.loadArtifact('IDiamondCut')
  const diamondCut = new Contract(diamond.address, IDiamondCut.abi, wallet);
  let tx
  let receipt
  // call to init function
  let functionCall = diamondInit.interface.encodeFunctionData('init', [args])
  tx = await diamondCut.connect(wallet).diamondCut(cut, diamondInit.address, functionCall)
  console.log('Diamond cut tx: ', tx.hash)
  receipt = await tx.wait()
  if (!receipt.status) {
    throw Error(`Diamond upgrade failed: ${tx.hash}`)
  }
  console.log('Completed diamond cut')
  return diamond.address
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  deployDiamond()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error)
      process.exit(1)
    })
}

exports.deployDiamond = deployDiamond
