const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
// const hre = require("hardhat");

describe("Util", function () {
  let signers;

  beforeEach(async function () {
    signers = await ethers.getSigners();
  });

  it("sign msg", async function () {
    const messageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes32"],
        [signers[0].address, 1, [
          35, 103, 122, 88, 251, 106, 31,
          153, 162, 45, 219, 102, 220, 44,
          41, 182, 120, 224, 134, 110, 226,
          154, 10, 120, 242, 233, 119, 219,
          80, 103, 192, 99
        ]]
      )
    );

    const messageHashBytes = ethers.utils.arrayify(messageHash);

    for (i = 0; i < 10; i++) {
      // await randomizer.testCharge(testCallback.address, signer.address, 1);
      const flatSig = await signers[0].signMessage(messageHashBytes);
      const sig = ethers.utils.splitSignature(flatSig);

      console.log(sig.r, sig.s, sig.v);
      i++;
    }


  });
});
