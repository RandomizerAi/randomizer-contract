const hre = require("hardhat");
const randomizerAbi = require("../abi/Randomizer.json").abi;

async function main() {
  const tester = (await hre.ethers.getSigners())[1];
  const randomizer = await ethers.getContractAt(
    randomizerAbi,
    hre.network.config.contracts.randomizer
  );

  let gasPrice = (await randomizer.provider.getGasPrice()).mul(4);

  const TestCallback = await hre.ethers.getContractFactory("TestCallback");
  const testCallback = TestCallback.attach(
    hre.network.config.contracts.testCallback
  );

  const requestTimes = {};
  let callbacks = 0;
  testCallback.on("Callback", (id, value) => {
    console.log("callback", ++callbacks);
    const requestTime = requestTimes[id];
    console.log("Callback", id.toString(), Date.now() - requestTime);
  });

  randomizer.on("Retry", (data) => {
    console.log("Retry");
    console.log(data);
  });

  const flip = await testCallback.connect(tester).makeRequest({ gasPrice });
  const receipt = await flip.wait();

  // Get all logs from receipt
  const logs = receipt.logs;
  // Decode logs using randomizer abi
  const decodedLogs = logs.map((log) => randomizer.interface.parseLog(log));
  requestTimes[ethers.BigNumber.from(decodedLogs[0].args.id).toString()] =
    Date.now();

  let i = 0;
  let nonce = await tester.getTransactionCount("pending");
  // const interval = setInterval(async () => {
  //   const lastNonce = nonce;
  //   nonce++;
  //   if (i > 1000) clearInterval(interval);
  //   try {
  //     // gasPrice = (await randomizer.provider.getGasPrice()).mul(4);

  //     const flip = await testCallback
  //       .connect(tester)
  //       .makeRequest({ gasPrice, nonce: lastNonce });
  //     const receipt = await flip.wait();
  //     const logs = receipt.logs;
  //     const decodedLogs = logs.map((log) => randomizer.interface.parseLog(log));
  //     requestTimes[ethers.BigNumber.from(decodedLogs[0].args.id).toString()] =
  //       Date.now();
  //     console.log(
  //       "Requested ",
  //       ethers.BigNumber.from(decodedLogs[0].args.id).toString()
  //     );
  //     console.log(decodedLogs[0].args.request.beacons);
  //     i++;
  //     console.log("request", i);
  //   } catch (e) {
  //     nonce = await tester.getTransactionCount("pending");
  //     console.log(e);
  //   }
  //   // Show flip event
  // }, 4000);

  while (i <= 50) {
    const lastNonce = nonce;
    nonce++;
    try {
      gasPrice = (await randomizer.provider.getGasPrice()).mul(4);

      const flip = await testCallback
        .connect(tester)
        .makeRequest({ gasPrice, nonce: lastNonce });
      const receipt = await flip.wait();
      const logs = receipt.logs;
      const decodedLogs = logs.map((log) => randomizer.interface.parseLog(log));
      requestTimes[ethers.BigNumber.from(decodedLogs[0].args.id).toString()] =
        Date.now();
      console.log(
        "Requested ",
        ethers.BigNumber.from(decodedLogs[0].args.id).toString()
      );
      console.log(decodedLogs[0].args.request.beacons);
      i++;
      console.log("request", i);
    } catch (e) {
      nonce = await tester.getTransactionCount("pending");
      console.log(e);
    }
    // Show flip event
    await new Promise(resolve => setTimeout(resolve, 20000));
  }

}

main();
