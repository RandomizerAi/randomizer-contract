require("dotenv").config();

// const { ethers } = require("ethers");
const { Contract, Provider, Wallet } = require("zksync-web3");
const { ethers } = require("ethers");

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS_ZKSYNC;
const syncProvider = new Provider(process.env.PROVIDER_ZKSYNC);
const ethProvider = ethers.getDefaultProvider("goerli");
const abi = '[{"inputs":[{"internalType":"uint128","name":"_request","type":"uint128"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"},{"internalType":"uint8","name":"v","type":"uint8"}],"name":"submitRandom","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint128","name":"_request","type":"uint128"}],"name":"getRequest","outputs":[{"components":[{"internalType":"address","name":"client","type":"address"},{"internalType":"address","name":"selectedFinalSigner","type":"address"},{"internalType":"address[]","name":"beacons","type":"address[]"},{"internalType":"bytes32","name":"seed","type":"bytes32"},{"internalType":"uint256","name":"ethReserved","type":"uint256"},{"internalType":"uint256","name":"beaconFee","type":"uint256"},{"internalType":"uint256","name":"height","type":"uint256"},{"internalType":"uint256","name":"timestamp","type":"uint256"},{"internalType":"uint24","name":"callbackGasLimit","type":"uint24"},{"internalType":"bytes12[]","name":"signatures","type":"bytes12[]"}],"internalType":"struct SRandomRequest","name":"","type":"tuple"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_beacon","type":"address"}],"name":"getBeaconPendingRequestIds","outputs":[{"internalType":"uint128[]","name":"","type":"uint128[]"}],"stateMutability":"view","type":"function"}, {"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"request","type":"uint256"}],"name":"Request","type":"event"}]';

// Main function, exported separately for testing
const submitRandoms = async function (soRandom, signer) {
  console.log("Submit randoms");
  const txs = [];
  // Create contract instance from the relayer signer
  // const soRandom = new Contract(contractAddress, abi, signer);
  const address = await signer.getAddress();
  const pendingRequestIds = await soRandom.getBeaconPendingRequestIds(address);
  for (const id of pendingRequestIds) {
    const request = await soRandom.getRequest(id);
    const messageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "uint256"],
        [request.client, id, request.seed]
      )
    );
    const messageHashBytes = ethers.utils.arrayify(messageHash);
    const flatSig = await signer.signMessage(messageHashBytes);
    const sig = ethers.utils.splitSignature(flatSig);
    const tx = await soRandom.submitRandom(id, sig.r, sig.s, sig.v);
    txs.push(tx);
    console.log(`Submit random number for ${id}`);
  }

  return txs;
}

const init = async () => {
  // Loop through signers
  let i = 1;
  while (true) {
    let signer;
    if (process.env["SIGNER_" + i] == undefined)
      break;

    signer = new Wallet(process.env["SIGNER_" + i], syncProvider, ethProvider);
    const address = await signer.getAddress();

    // Add event listener for signer
    const soRandom = new Contract(CONTRACT_ADDRESS, abi, signer);
    soRandom.on("Request", (id, beacons) => {
      if (beacons.includes(address))
        submitRandoms(soRandom, signer);
    });

    i++;

    console.log("Listener created for", signer.address);
  }

}


init();