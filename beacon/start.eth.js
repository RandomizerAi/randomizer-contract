require("dotenv").config();

// const { ethers } = require("ethers");
const { ethers, Wallet, Contract } = require("ethers");

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS_ARBITRUM;
const ethProvider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_ARBITRUM);

const abi = '[{"inputs":[{"internalType":"address","name":"_developer","type":"address"},{"internalType":"address","name":"_arbGas","type":"address"},{"internalType":"uint8","name":"_maxStrikes","type":"uint8"},{"internalType":"uint256","name":"_minStakeEth","type":"uint256"},{"internalType":"uint256","name":"_expirationBlocks","type":"uint256"},{"internalType":"uint256","name":"_expirationSeconds","type":"uint256"},{"internalType":"uint256","name":"_beaconFee","type":"uint256"},{"internalType":"address[]","name":"_beacons","type":"address[]"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"beacon","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"BeaconStakeEth","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"beacon","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"BeaconUnstake","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Charge","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"client","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"ClientDeposit","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"client","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"ClientWithdraw","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"client","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"ClientWithdrawTo","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"beacon","type":"address"}],"name":"RegisterBeacon","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"beacon","type":"address"},{"indexed":false,"internalType":"uint256","name":"strikes","type":"uint256"}],"name":"RemoveBeacon","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint128","name":"id","type":"uint128"},{"components":[{"internalType":"uint256","name":"ethReserved","type":"uint256"},{"internalType":"uint256","name":"beaconFee","type":"uint256"},{"internalType":"uint256","name":"height","type":"uint256"},{"internalType":"uint256","name":"timestamp","type":"uint256"},{"internalType":"uint256","name":"expirationSeconds","type":"uint256"},{"internalType":"uint256","name":"expirationBlocks","type":"uint256"},{"internalType":"uint256","name":"callbackGasLimit","type":"uint256"},{"internalType":"address","name":"client","type":"address"},{"internalType":"address[3]","name":"beacons","type":"address[3]"},{"internalType":"bytes32","name":"seed","type":"bytes32"}],"indexed":false,"internalType":"struct SRequestEventData","name":"request","type":"tuple"}],"name":"Request","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint128","name":"id","type":"uint128"},{"components":[{"internalType":"uint256","name":"ethReserved","type":"uint256"},{"internalType":"uint256","name":"beaconFee","type":"uint256"},{"internalType":"uint256","name":"height","type":"uint256"},{"internalType":"uint256","name":"timestamp","type":"uint256"},{"internalType":"uint256","name":"expirationSeconds","type":"uint256"},{"internalType":"uint256","name":"expirationBlocks","type":"uint256"},{"internalType":"uint256","name":"callbackGasLimit","type":"uint256"},{"internalType":"address","name":"client","type":"address"},{"internalType":"address[3]","name":"beacons","type":"address[3]"},{"internalType":"bytes32","name":"seed","type":"bytes32"}],"indexed":false,"internalType":"struct SRequestEventData","name":"request","type":"tuple"},{"indexed":false,"internalType":"address","name":"beacon","type":"address"}],"name":"RequestBeacon","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint128","name":"id","type":"uint128"},{"indexed":false,"internalType":"bytes32","name":"result","type":"bytes32"}],"name":"Result","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint128","name":"id","type":"uint128"},{"components":[{"internalType":"uint256","name":"ethReserved","type":"uint256"},{"internalType":"uint256","name":"beaconFee","type":"uint256"},{"internalType":"uint256","name":"height","type":"uint256"},{"internalType":"uint256","name":"timestamp","type":"uint256"},{"internalType":"uint256","name":"expirationSeconds","type":"uint256"},{"internalType":"uint256","name":"expirationBlocks","type":"uint256"},{"internalType":"uint256","name":"callbackGasLimit","type":"uint256"},{"internalType":"address","name":"client","type":"address"},{"internalType":"address[3]","name":"beacons","type":"address[3]"},{"internalType":"bytes32","name":"seed","type":"bytes32"}],"indexed":false,"internalType":"struct SRequestEventData","name":"request","type":"tuple"}],"name":"Retry","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"beacon","type":"address"},{"indexed":true,"internalType":"address","name":"striker","type":"address"},{"indexed":false,"internalType":"address","name":"client","type":"address"},{"indexed":false,"internalType":"uint256","name":"request","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"slashedTokens","type":"uint256"}],"name":"Strike","type":"event"},{"inputs":[],"name":"arbGas","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"beaconFee","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_beacon","type":"address"},{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"beaconStakeEth","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"beaconUnstakeEth","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_client","type":"address"}],"name":"clientBalanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_client","type":"address"},{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"clientDeposit","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_to","type":"address"},{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"clientWithdrawTo","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"developer","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_beacon","type":"address"}],"name":"getBeacon","outputs":[{"components":[{"internalType":"bool","name":"exists","type":"bool"},{"internalType":"uint8","name":"strikes","type":"uint8"},{"internalType":"uint8","name":"pending","type":"uint8"},{"internalType":"uint8","name":"consecutiveSubmissions","type":"uint8"}],"internalType":"struct SBeacon","name":"","type":"tuple"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_beacon","type":"address"}],"name":"getBeaconIndex","outputs":[{"internalType":"uint256","name":"index","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_beacon","type":"address"}],"name":"getBeaconStakeEth","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getBeacons","outputs":[{"internalType":"address[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_client","type":"address"}],"name":"getEthReserved","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_callbackGasLimit","type":"uint256"},{"internalType":"uint256","name":"_numberOfBeacons","type":"uint256"}],"name":"getFeeEstimate","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"pendingRequestIds","outputs":[{"internalType":"uint128[]","name":"","type":"uint128[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint128","name":"_request","type":"uint128"}],"name":"requestSignatures","outputs":[{"internalType":"bytes12[3]","name":"","type":"bytes12[3]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_request","type":"uint256"}],"name":"getResult","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_beacon","type":"address"}],"name":"registerBeacon","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address[4]","name":"_addressData","type":"address[4]"},{"internalType":"uint256[9]","name":"_uintData","type":"uint256[9]"},{"internalType":"bytes32","name":"_seed","type":"bytes32"}],"name":"renewRequest","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint24","name":"_callbackGasLimit","type":"uint24"}],"name":"requestRandom","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"setBeaconFee","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_expirationBlocks","type":"uint256"}],"name":"setExpirationBlocks","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_expirationSeconds","type":"uint256"}],"name":"setExpirationSeconds","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"setMinStakeEth","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address[4]","name":"_addressData","type":"address[4]"},{"internalType":"uint256[9]","name":"_uintData","type":"uint256[9]"},{"internalType":"bytes32[3]","name":"_rsAndSeed","type":"bytes32[3]"}],"name":"submitRandom","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_beacon","type":"address"}],"name":"unregisterBeacon","outputs":[],"stateMutability":"nonpayable","type":"function"}]';


// Main function, exported separately for testing
const submitRandom = async function (soRandom, signer, id, request) {
  try {
    console.log(`Submit random number for ${id} by ${await signer.getAddress()}`);

    // Create contract instance from the relayer signer
    // const soRandom = new Contract(contractAddress, abi, signer);
    const messageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "uint256"],
        [request.client, id, request.seed]
      )
    );
    const messageHashBytes = ethers.utils.arrayify(messageHash);
    const flatSig = await signer.signMessage(messageHashBytes);
    const sig = ethers.utils.splitSignature(flatSig);

    const addressData = [request.client].concat(request.beacons);
    const uintData = [id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationSeconds, request.expirationBlocks, request.callbackGasLimit, sig.v];
    const bytesData = [sig.r, sig.s, request.seed];

    const tx = await soRandom.submitRandom(addressData, uintData, bytesData);

    return tx;
  } catch (e) {
    console.log(e);
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

    signer = new Wallet(process.env["SIGNER_" + i], ethProvider);
    signers.push(signer);
    soRandoms.push(new Contract(CONTRACT_ADDRESS, abi, signer));

    i++;
  }



  // Add event listener for signer
  const soRandom = soRandoms[0];

  // Iterate through past events
  const allRequests = await soRandom.queryFilter(soRandom.filters.Request(), 15190186);
  const allRequestBeacons = await soRandom.queryFilter(soRandom.filters.RequestBeacon(), 15190186);
  const allRetries = await soRandom.queryFilter(soRandom.filters.Retry(), 15190186);

  for (const event of allRequests) {
    const res = event.args;
    for (const signer of signers) {
      const address = await signer.getAddress();
      console.log(address);
      if (res.request.beacons.includes(address)) {
        console.log(res.request.beacons);
        console.log("TRY ", address);
        submitRandom(soRandoms[signers.indexOf(signer)], signer, res.id, res.request);
      }
    }
  }

  for (const event of allRequestBeacons) {
    const res = event.args;
    for (const signer of signers) {
      const address = await signer.getAddress();
      if (res.beacon == address)
        submitRandom(soRandoms[signers.indexOf(signer)], signer, res.id, res.request);
    }
  }

  for (const event of allRetries) {
    const res = event.args;
    for (const signer of signers) {
      const address = await signer.getAddress();
      const signatures = await soRandom.getRequestSignatures(res.id);
      if (signatures[Array(res.request.beacons).indexOf(address) == "0x000000000000000000000000"] >= 0) {
        submitRandom(soRandoms[signers.indexOf(signer)], signer, res.id, res.request);
      }
    }
  }

  soRandom.on("Request", async (id, request) => {
    console.log("new request");
    for (const signer of signers) {
      const address = await signer.getAddress();
      if (request.beacons.includes(address)) {
        submitRandom(soRandoms[signers.indexOf(signer)], signer, id, request);
      }
    }
  });

  soRandom.on("RequestBeacon", async (id, request, beacon) => {
    for (const signer of signers) {
      const address = await signer.getAddress();
      if (beacon == address)
        submitRandom(soRandoms[signers.indexOf(signer)], signer, id, request);
    }
  });

  soRandom.on("Retry", async (id, request) => {
    for (const signer of signers) {
      const address = await signer.getAddress();
      const signatures = await soRandom.getRequestSignatures(id);
      if (signatures[Array(request.beacons).indexOf(address) == "0x000000000000000000000000"] >= 0) {
        submitRandom(soRandoms[signers.indexOf(signer)], signer, id, request);
      }
    }
  });

  console.log("started");

}



init();