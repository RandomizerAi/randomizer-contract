require("dotenv").config();

// const { ethers } = require("ethers");
const { ethers } = require("ethers");
const provider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_ARBITRUM);

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS_ARBITRUM;
const abi = require('./abi.json');

// Main function, exported separately for testing
const submitRandom = async function (soRandom, signer, client, id, seed) {
  // Create contract instance from the relayer signer
  // const soRandom = new Contract(contractAddress, abi, signer);

  const request = await soRandom.getRequest(id);

  if (ethers.BigNumber.from(request.height).gt(0)) {
    const messageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "uint256"],
        [client, id, seed]
      )
    );
    const messageHashBytes = ethers.utils.arrayify(messageHash);
    const flatSig = await signer.signMessage(messageHashBytes);
    const sig = ethers.utils.splitSignature(flatSig);

    const tx = await soRandom.submitRandom(id, sig.r, sig.s, sig.v);
    console.log(`Submit random number for ${id}`);

    return tx;
  }
}

const signers = [];
const soRandoms = [];
const init = async () => {
  // Loop through signers
  let i = 1;
  while (true) {
    let signer;
    if (process.env["SIGNER_" + i] == undefined)
      break;

    signer = new ethers.Wallet(process.env["SIGNER_" + i], provider);
    signers.push(signer);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
    soRandoms.push(contract);

    const pending = await contract.getBeaconPendingRequestIds(await signer.getAddress());

    for (const id of pending) {
      const request = await contract.getRequest(id);
      await submitRandom(contract, signer, request.client, id, request.seed);
    }


    i++;
  }

  // Add event listener for signer
  const soRandom = soRandoms[0];
  soRandom.on("Request", async (client, id, seed, beacons) => {
    console.log("Request");
    for (const signer of signers) {
      const address = await signer.getAddress();
      if (beacons.includes(address)) {
        submitRandom(soRandoms[signers.indexOf(signer)], signer, client, id, seed);
      }
    }
  });

  soRandom.on("RequestBeacon", async (client, id, seed, beacon) => {
    console.log("Request Beacon");
    for (const signer of signers) {
      const address = await signer.getAddress();
      if (beacon == address)
        submitRandom(soRandoms[signers.indexOf(signer)], signer, client, id, seed);
    }
  });

  soRandom.on("Retry", async (client, id, seed, beacons) => {
    console.log("Retry");
    for (const signer of signers) {
      const address = await signer.getAddress();
      const signatures = (await soRandom.getRequest(id)).signatures;
      if (signatures[Array(beacons).indexOf(address) == "0x000000000000000000000000"] >= 0) {
        submitRandom(soRandoms[signers.indexOf(signer)], signer, client, id, seed);
      }
    }
  });


  console.log("started");

}


init();