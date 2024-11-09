const { ethers } = require("hardhat");
const randomizerAbi = require('../abi/Randomizer.json').abi;
const { getSelectors, FacetCutAction } = require('./libraries/diamond.js')

async function main() {
  const randomizer = await ethers.getContractAt(randomizerAbi, hre.network.config.contracts.randomizer);
  const gasPrice = (await randomizer.provider.getGasPrice()).mul(4);

  const facets = ["BeaconFacet"];
  // const facets = ["BeaconFacet"];
  for (const facetString of facets) {
    const Facet = await ethers.getContractFactory(facetString);
    const facet = await Facet.deploy({gasPrice});
    console.log("Upgrading diamond facet");
    // const selectors = getSelectors(Facet).get(['beaconUnstakeEth(uint256)'])
    const selectors = getSelectors(Facet);
    tx = await randomizer.diamondCut(
      [{
        facetAddress: facet.address,
        action: FacetCutAction.Replace,
        functionSelectors: selectors
      }],
      randomizer.address, '0x', { gasLimit: 800000, gasPrice })
    receipt = await tx.wait()
    if (!receipt.status) {
      throw Error(`Diamond upgrade failed: ${tx.hash}`)
    }
    result = await randomizer.facetFunctionSelectors(facet.address)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });