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
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      }
    }
  },
  networks: {
    arbitrumMainnet: {
      url: 'https://arb1.arbitrum.io/rpc',
      accounts: [process.env.PRIVATE_KEY]
    },
    arbitrumNitroDevnet: {
      url: 'https://goerli-rollup.arbitrum.io/rpc',
      accounts: [process.env.PRIVATE_KEY]
    },
    arbitrumRinkeby: {
      url: "https://rinkeby.arbitrum.io/rpc",
      accounts: [process.env.PRIVATE_KEY]
    },
    ganache: {
      url: "http://127.0.0.1:7545",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 1337
    },
    hardhat: {
      chainId: 1337,
      allowUnlimitedContractSize: true
    }
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
    except: ['RandomizerUpgradeable']
    // only: [':Randomizer$'],
  },
  gasReporter: {
    enabled: true
  }
};
