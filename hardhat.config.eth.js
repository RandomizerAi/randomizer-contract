
/* global ethers task */
require("dotenv").config()
require('@nomiclabs/hardhat-waffle')
require('hardhat-gas-reporter');
require('hardhat-contract-sizer');
require('solidity-coverage')

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async () => {
  const accounts = await ethers.getSigners()

  for (const account of accounts) {
    console.log(account.address)
  }
})

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
        runs: 99999
      }
    }
  },
  networks: {
    arbitrumMainnet: {
      url: 'https://arb1.arbitrum.io/rpc',
      accounts: [process.env.PRIVATE_KEY]
    },
    arbGoerli: {
      url: process.env.PROVIDER_ARB_GOERLI || 'https://goerli-rollup.arbitrum.io/rpc',
      accounts: [process.env.PRIVATE_KEY]
    },
    arbitrumRinkeby: {
      url: "https://rinkeby.arbitrum.io/rpc",
      accounts: [process.env.PRIVATE_KEY]
    },
    ganache: {
      url: "http://127.0.0.1:7545",
      chainId: 1337
    },
    polygonMumbai: {
      url: "https://rpc-mumbai.maticvigil.com",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 80001
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
    strict: true
  },
  gasReporter: {
    enabled: true
  }
}
