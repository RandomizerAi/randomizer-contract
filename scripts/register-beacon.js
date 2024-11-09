const { ethers } = require("hardhat");
const randomizerAbi = require("../abi/Randomizer.json").abi;
const vrfHelper = require("../test/helpers.js");
const axios = require("axios");

async function main() {
  const randomizer = await ethers.getContractAt(
    randomizerAbi,
    hre.network.config.contracts.randomizer
  );

  let addresses = [];
  for (let i = 1; i <= 10; i++) {
    const envVar = `SIGNER_${i}`;
    if (process.env[envVar]) {
      const wallet = new ethers.Wallet(process.env[envVar]);
      addresses.push(await wallet.getAddress());
    }
  }
  let i = 1;
  while (i <= addresses.length) {
    // const randomKey = ethers.utils.hexlify(ethers.utils.randomBytes(32));
    // Turn randomKey into 0x hex string

    console.log(`Signer ${i} prover key: ${process.env[`PROVER_${i}`]}`);
    const keys = vrfHelper.getVrfPublicKeys(process.env[`PROVER_${i}`]);

    try {
      const gasPrice = (await randomizer.provider.getGasPrice()).mul(4);
      // Check if beacon is registered
      const beacon = await randomizer.beacon(addresses[i - 1]);
      const registered = beacon.registered;
      if (!registered) {
        console.log("Registering", addresses[i - 1]);
        await randomizer.registerBeacon(addresses[i - 1], [keys[0], keys[1]], {
          gasPrice,
        });
      }
    } catch (e) {
      console.log("Failed", addresses[i - 1]);
      console.log(e);
    }
    i++;
  }
  // await randomizer.unregisterBeacon("0x1B62A3FE1e38e1AA31e611cda2c76e515e8579a9");

  // // await randomizer.unregisterBeacon("0x64CB5AadEFb1d122f07d8cd9D5886f71a2F0CCF3");
  // const beacon = await randomizer.beacon(
  //   "0x706F28269501a2f830409d7675EA92Ef3199E72F"
  // );
  // const registered = beacon.registered;
  // if (!registered)
  //   await randomizer.registerBeacon(
  //     "0x706F28269501a2f830409d7675EA92Ef3199E72F",
  //     [
  //       "115638832245084964601635836841498232108772816883829770066731271705958065418312",
  //       "57455796896787792063945142378767168866981114556454530938511642594094331743132",
  //     ],
  //     { gasLimit: 10000000 }
  //   );
  // await randomizer.registerBeacon("0x79459b3557176c2979123651c8AEC36DcD087258", ["32483749429716769928521212221397655042510301702319600508186688166935385623408", "15494031547235389796400208062095550005904344731620330646163219920860974221898"], { gasLimit: 10000000 });
  // await randomizer.registerBeacon("0x1B62A3FE1e38e1AA31e611cda2c76e515e8579a9", ["27389150702761273358142457248316700717712180877395889919984442352019115642302", "21703868945849370414922661664422335286844126780630624876644716223982888755695"], { gasLimit: 10000000 });
  // await randomizer.registerBeacon("0x693c98Be25Fb340Ec84c84b63cE84Be71a853e2D");
  // await randomizer.registerBeacon("0x9381e48736a09FfFD7a91245Ac56F9eD53b011B3");
  // await randomizer.registerBeacon("0xD52F3B928c39C3CC286fb70228E16836cCb6958A");
  // await randomizer.registerBeacon("0x72453c6f8Eba18840029BF3E65573a474Ce023e4");
  // await randomizer.registerBeacon("0xf716b2dc52a17fA64421F92db5b326a4325Bcd71");

  // await randomizer.registerBeacon("0x7a840eA1764487367BDd931b595Fb58F09427c8A", ["8831976265035892033806470755703412763815171838627856405919227836017833000830", "88045049172709091685648334905383513207795286201206836324759222256040537625032"], { gasLimit: 10000000 });
  // await randomizer.registerBeacon("0x7a840eA1764487367BDd931b595Fb58F09427c8A", ["8831976265035892033806470755703412763815171838627856405919227836017833000830", "88045049172709091685648334905383513207795286201206836324759222256040537625032"], { gasLimit: 10000000 });
  // await randomizer.registerBeacon("0x4f62B576364c313945cD5D131AC6C99B2F740990", ["51345668660636657364119753080343166248229110355246760538851228406412042140139", "75399629828989861673054240392223286530572791579229670827981535271189693549557"], { gasLimit: 10000000 });

  // Beacon 6
  let beacon;
  let registered;
  beacon = await randomizer.beacon("0x347369e8504BaE4b5701ce3C6E4E4FC586c81b40");
  registered = beacon.registered;
  if (!registered) {
    await randomizer.registerBeacon(
      "0x347369e8504BaE4b5701ce3C6E4E4FC586c81b40",
      [
        "104651632092917150880305178404538375744647256911073149248985518888614674557282",
        "85623884460746481855799082891004718125507552113400817360145056400765561847678",
      ],
      { gasLimit: 10000000 }
    );
  }
  // Beacon 7

  beacon = await randomizer.beacon("0x8a7e76097431A6D10d47f5be92A3eCd3db015Ef7");
  registered = beacon.registered;
  if (!registered) {
    await randomizer.registerBeacon(
      "0x8a7e76097431A6D10d47f5be92A3eCd3db015Ef7",
      [
        "20421368279227587062667252595556209735700235804295679244005882372508824367830",
        "58951997441454259470248346590547999645723713280983312346818923342802494880615",
      ],
      { gasLimit: 10000000 }
    );
  }

  beacon = await randomizer.beacon("0xb5f152a0A8BBdF2C9619731485fdC9dC8593acb7");
  registered = beacon.registered;
  if (!registered) {
    //   // Beacon 8
    await randomizer.registerBeacon(
      "0xb5f152a0A8BBdF2C9619731485fdC9dC8593acb7",
      [
        "110502137299971521099305642439004563419278880262991503432589861633828028126223",
        "19290282305513710993444314984437409452768461872406361679307993117197782651327",
      ],
      { gasLimit: 10000000 }
    );
  }
  // // Beacon 9
  beacon = await randomizer.beacon("0x83005Fe96271B60cb72aDF4f9de3E48aB4a4143F");
  registered = beacon.registered;
  if (!registered) {
    await randomizer.registerBeacon(
      "0x83005Fe96271B60cb72aDF4f9de3E48aB4a4143F",
      [
        "98727094126011024509045316873005069619241582041784892480078320299801593429990",
        "25959581919922875301988965336705338562060405557695098861171980369632524618991",
      ],
      { gasLimit: 10000000 }
    );
  }
  // Beacon 10-
  beacon = await randomizer.beacon("0xBBB0AF068679dD72aa87FE677Aa31646B955C6EC");
  registered = beacon.registered;
  if (!registered) {
    await randomizer.registerBeacon(
      "0xBBB0AF068679dD72aa87FE677Aa31646B955C6EC",
      [
        "80941385246755143378749815251483422318136315785009149094365167286609988186791",
        "60343697217440831725988384366675533919243568784297031111576116219194468266912",
      ],
      { gasLimit: 10000000 }
    );
  }

  // Beacon 11
  beacon = await randomizer.beacon("0xb8f5E8c5A450ed0139466a5217dDfa59622Cc26b");
  registered = beacon.registered;
  if (!registered) {
    await randomizer.registerBeacon(
      "0xb8f5E8c5A450ed0139466a5217dDfa59622Cc26b",
      [
        "5482756651603718654255331654771704169002809366300265737794322683914182712785",
        "4864239819950056612449796749095092307999398747900909039979812325182491632576",
      ],
      { gasLimit: 10000000 }
    );
  }

    beacon = await randomizer.beacon("0x2BaB368e82F0DCfD2a8cB7bcDc97b05624AE141B");
  registered = beacon.registered;
  if (!registered) {
    await randomizer.registerBeacon(
      "0x2BaB368e82F0DCfD2a8cB7bcDc97b05624AE141B",
      [
        "78793067018324383584367351375371274589032506628779808480435433207606356041681",
        "105991029389878672716294619879477635787611361081707606584583948199890886130129",
      ],
      { gasLimit: 10000000 }
    );
  }

      beacon = await randomizer.beacon("0xB7239a58aCc471695e643330596D162596b948e5");
  registered = beacon.registered;
  if (!registered) {
    await randomizer.registerBeacon(
      "0xB7239a58aCc471695e643330596D162596b948e5",
      [
        "9453031688601601253582842333814280271270689180324764735815400352469846808668",
        "38135248331667566355580401432259110907227376083747109470652381827518079681552",
      ],
      { gasLimit: 10000000 }
    );
  }

  console.log("Registered");
  // const addresses = [
  //   "0x693c98Be25Fb340Ec84c84b63cE84Be71a853e2D",
  //   "0x9381e48736a09FfFD7a91245Ac56F9eD53b011B3",
  //   "0xD52F3B928c39C3CC286fb70228E16836cCb6958A",
  //   "0x72453c6f8Eba18840029BF3E65573a474Ce023e4",
  //   "0xf716b2dc52a17fA64421F92db5b326a4325Bcd71"
  // ];

  // console.log(" owner", await randomizer.owner());
  // const owner = new ethers.Wallet(process.env["PRIVATE_KEY"]);
  // console.log("owner", await owner.getAddress());

  // for (const address of addresses) {
  //   console.log(address);
  //   const beacon = await randomizer.beacon(address);
  //   console.log(beacon, beacon.registered);
  //   // console.log(beacon.publicKey[0], beacon.publicKey[1]);
  //   if (beacon.registered) continue;
  //   if (ethers.BigNumber.from(beacon.publicKey[0]).eq(0)) continue;
  //   const tx = await randomizer.registerBeacon(address, [ethers.BigNumber.from(beacon.publicKey[0]).toString(), ethers.BigNumber.from(beacon.publicKey[1]).toString()], { gasLimit: 10000000 })
  //   const receipt = await tx.wait();
  //   // If tx fails, show the error
  //   if (receipt.status === 0) {
  //     console.log(receipt);
  //     break;
  //   }

  // }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
