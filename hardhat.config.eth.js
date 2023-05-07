require("dotenv").config()
require('hardhat-gas-reporter');
require('hardhat-contract-sizer');
require('solidity-coverage')
require("@nomicfoundation/hardhat-chai-matchers")
require("@nomiclabs/hardhat-etherscan");

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
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 99999
      }
    }
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY,
      arbitrumOne: process.env.ARBISCAN_API_KEY
    }
  },
  networks: {
    arbitrumMainnet: {
      url: process.env.PROVIDER_ARBITRUM || 'https://arb1.arbitrum.io/rpc',
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
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s3.binance.org:8545",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 97
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
