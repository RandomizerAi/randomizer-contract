const { ethers } = require("hardhat");
const hre = require("hardhat");

async function main() {
  const signers = await hre.ethers.getSigners();
  for (let i = 1; i <= 10; i++) {
    const envVar = `SIGNER_${i}`;
    if (process.env[envVar]) {
      const wallet = new ethers.Wallet(process.env[envVar]);
      // Send some ether to the signer
      await signers[0].sendTransaction({
        to: await wallet.getAddress(),
        value: ethers.utils.parseEther("1"),
      });
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });