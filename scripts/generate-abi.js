const fs = require('fs-extra')
const path = require('path');

async function main() {
  // await hre.run("compile");

  console.log("Generating abi...");
  // Iterate through ../artifacts/contracts and combine all "abi" values from every json file into one array
  let abi = [];
  // Iterate directories inside ./artifacts/contracts
  const contractDirs = await fs.readdir(path.join(__dirname, '../artifacts/contracts/facets'));
  // Iterate json files inside contractDirs
  for (const contractDir of contractDirs) {
    const contractFiles = await fs.readdir(path.join(__dirname, `../artifacts/contracts/facets/${contractDir}`));
    for (const contractFile of contractFiles) {
      const contract = await fs.readJson(path.join(__dirname, `../artifacts/contracts/facets/${contractDir}/${contractFile}`));
      if (contract.abi) abi = abi.concat(contract.abi);
    }
  }

  const events = await fs.readJson(path.join(__dirname, `../artifacts/contracts/libraries/Events.sol/Events.json`));
  if (events.abi) abi = abi.concat(events.abi);
  const libBeacon = await fs.readJson(path.join(__dirname, `../artifacts/contracts/libraries/LibBeacon.sol/LibBeacon.json`));
  if (libBeacon.abi) abi = abi.concat(libBeacon.abi);

  // Remove duplicate values from abi that aren't submitRandom, requestRandom (overrides), estimateFee
  abi = abi.filter((item, index) => {
    if (item.name === 'submitRandom' || item.name === 'requestRandom' || item.name === 'estimateFee') return true;
    return abi.findIndex((i) => i.name === item.name) === index;
  });

  const object = {
    contractName: "Randomizer",
    abi,
    linkReferences: {},
    deployedLinkReferences: {}
  };
  // Create new directory if it doesn't exist
  await fs.ensureDir(path.join(__dirname, '../abi'));
  // Write object to new json file
  await fs.writeJson(path.join(__dirname, '../abi/Randomizer.json'), object);

  console.log("Done!");
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error)
      process.exit(1)
    })
}

module.main = main;