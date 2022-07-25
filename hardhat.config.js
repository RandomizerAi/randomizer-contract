require("dotenv").config();
require("@nomiclabs/hardhat-waffle");
require('hardhat-contract-sizer');
require('hardhat-gas-reporter');
require('solidity-coverage')
require('@openzeppelin/hardhat-upgrades');

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.15",
    settings: {
      optimizer: {
        enabled: true,
        runs: 999,
      },
    }
  },
  networks: {
    arbitrumMainnet: {
      url: 'https://arb1.arbitrum.io/rpc',
      accounts: [process.env.SIGNER_1]
    },
    arbitrumNitroDevnet: {
      url: 'https://nitro-devnet.arbitrum.io/rpc',
      accounts: [process.env.SIGNER_1]
    },
    arbitrumRinkeby: {
      url: "https://rinkeby.arbitrum.io/rpc",
      accounts: [process.env.PRIVATE_KEY]
    },
    ganache: {
      url: "HTTP://127.0.0.1:7545",
      accounts: [process.env.SIGNER_1]
    },
    hardhat: {
      chainId: 1337
    }
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
    // only: [':SoRandom$'],
  },
  gasReporter: {
    enabled: true
  }
};
