require("dotenv").config();

const abi = require("./abi.json");
const fs = require("fs");
const { NonceManager } = require("@ethersproject/experimental");
const { ethers, Wallet, Contract } = require("ethers");

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS_ARBITRUM;
const provider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_ARBITRUM);

const soRandom = new Contract(CONTRACT_ADDRESS, abi, new Wallet(process.env.SIGNER_1, provider));

// Main function, exported separately for testing
const submitRandom = async function (signer, id, request) {
  try {
    const address = await signer.getAddress();
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

    let interval;

    const checkIfSubmitted = async () => {
      try {
        const result = await soRandom.getResult(id);
        if (result == "0x0000000000000000000000000000000000000000000000000000000000000000") {
          const reqSigs = await soRandom.getRequestSignatures(id);
          const indexOfBeacon = request.beacons.indexOf(address);
          if (reqSigs[indexOfBeacon] == "0x000000000000000000000000") {
            console.log("Not yet submitted");
            await soRandom.connect(signer).submitRandom(addressData, uintData, bytesData);
          } else {
            console.log("Already submitted");
            clearInterval(interval);
          }
        } else {
          console.log("Already submitted");
          clearInterval(interval);
        }
      } catch (e) { }
    }

    interval = setInterval(async () => {
      await checkIfSubmitted();
    }, 10000);

    await checkIfSubmitted();

  } catch (e) {
    console.log(e);
  }
}

const signers = [];

const init = async () => {

  // Loop through signers
  let i = 1;
  while (true) {
    let signer;
    if (process.env["SIGNER_" + i] == undefined)
      break;

    signer = new Wallet(process.env["SIGNER_" + i], provider);
    const managedSigner = new NonceManager(signer);

    managedSigner.getTransactionCount()

    managedSigner.setTransactionCount(await managedSigner.getTransactionCount());

    signers.push(managedSigner);

    i++;
  }



  // Add event listener for signer
  try {
    handlePastRequests(soRandom);
  } catch (e) {
    console.log(e);
  }

  soRandom.on("Request", async (id, request) => {
    try {
      console.log("new request");
      for (const signer of signers) {
        const address = await signer.getAddress();
        if (request.beacons.includes(address)) {
          await submitRandom(signer, id, request);
        }
      }
    } catch (e) {
      console.log("REQUEST ERROR", e);
    }
  });

  soRandom.on("RequestBeacon", async (id, request, beacon) => {
    console.log("REQUEST BEACON", id, beacon);
    try {
      for (const signer of signers) {
        const address = await signer.getAddress();
        if (beacon == address)
          await submitRandom(signer, id, request);
      }
    } catch (e) {
      console.log("REQUEST BEACON ERROR", e);
    }
  });

  soRandom.on("Retry", async (id, request) => {
    try {
      for (const signer of signers) {
        const address = await signer.getAddress();
        const signatures = await soRandom.getRequestSignatures(id);
        if (signatures[Array(request.beacons).indexOf(address) == "0x000000000000000000000000"] >= 0) {
          await submitRandom(signer, id, request);
        }
      }
    } catch (e) {

    }
  });

  console.log("started");

}

const handlePastRequests = async () => {
  try {
    const block = (await provider.getBlockNumber()) - 1;
    console.log(block);

    if (block) {
      const allRequests = await soRandom.queryFilter(soRandom.filters.Request(), block - 90, block);
      const allRequestBeacons = await soRandom.queryFilter(soRandom.filters.RequestBeacon(), block - 90, block);
      const allRetries = await soRandom.queryFilter(soRandom.filters.Retry(), block - 90, block);

      for (const event of allRequests) {
        const res = event.args;
        for (const signer of signers) {
          const address = await signer.getAddress();
          if (res.request.beacons.includes(address)) {
            console.log("TRY ", address);
            try {
              await submitRandom(signer, res.id, res.request);
            } catch (e) {
              console.log(e);
            }
          }
        }
      }

      for (const event of allRequestBeacons) {
        console.log("REQUEST FINAL BEACON");
        const res = event.args;
        console.log("BEACON REQUESTED", res.beacon);
        for (const signer of signers) {
          const address = await signer.getAddress();
          if (res.beacon == address) {
            try {
              await submitRandom(signer, res.id, res.request);
            } catch (e) {
              console.log(e);
            }
          }
        }

      }

      for (const event of allRetries) {
        const res = event.args;
        for (const signer of signers) {
          const address = await signer.getAddress();
          const signatures = await soRandom.getRequestSignatures(res.id);
          if (signatures[Array(res.request.beacons).indexOf(address) == "0x000000000000000000000000"] >= 0) {
            await submitRandom(signer, res.id, res.request);
          }
        }
      }
    }
  } catch (e) {
    console.log(e);
  }
}

init();

setInterval(async () => {
  try {
    fs.writeFileSync("block", (await provider.getBlockNumber()).toString());
  } catch (e) {

  }
}, 10000);