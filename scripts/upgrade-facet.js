const { ethers } = require("hardhat");
const randomizerAbi = require('../abi/Randomizer.json').abi;
const { getSelectors, FacetCutAction } = require('./libraries/diamond.js')

async function main() {
  const randomizer = await ethers.getContractAt(randomizerAbi, process.env.CONTRACT_ADDRESS);
  const Facet = await ethers.getContractFactory("RenewFacet");
  const facet = await Facet.deploy();
  // const diamondCutFacet = await ethers.getContractAt(randomizerAbi, process.env.CONTRACT_ADDRESS);
  console.log("Upgrading diamond facet");
  const selectors = getSelectors(Facet).get(['renewRequest(address[4], uint256[8], bytes32)'])
  tx = await randomizer.diamondCut(
    [{
      facetAddress: facet.address,
      action: FacetCutAction.Replace,
      functionSelectors: selectors
    }],
    randomizer.address, '0x', { gasLimit: 800000 })
  receipt = await tx.wait()
  if (!receipt.status) {
    throw Error(`Diamond upgrade failed: ${tx.hash}`)
  }
  result = await randomizer.facetFunctionSelectors(facet.address)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });