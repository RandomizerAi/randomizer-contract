require("dotenv").config()
require('hardhat-gas-reporter');
require('hardhat-contract-sizer');
require('solidity-coverage')
require("@nomicfoundation/hardhat-chai-matchers")
// require("@nomiclabs/hardhat-etherscan");
require("@nomicfoundation/hardhat-verify");

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
      arbitrumOne: process.env.ARBISCAN_API_KEY,
      arbitrumNova: process.env.ARBISCAN_NOVA_API_KEY,
    },
    customChains: [
      {
        network: "arbitrumNova",
        chainId: 42170,
        urls: {
          apiURL: "https://api-nova.arbiscan.io/api",
          browserURL: "https://nova.arbiscan.io",
        }
      }
    ]
  },
  networks: {
    arbitrumMainnet: {
      url: process.env.PROVIDER_ARBITRUM || 'https://arb1.arbitrum.io/rpc',
      accounts: [process.env.PRIVATE_KEY]
    },
    arbitrumNova: {
      url: process.env.PROVIDER_ARB_NOVA || 'https://nova.arbitrum.io/rpc',
      accounts: [process.env.PRIVATE_KEY],
      chainId: 42170
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
    baseGoerli: {
      url: process.env.BASE_GOERLI_RPC,
      accounts: [process.env.PRIVATE_KEY, process.env.TESTCALLBACK_DEPLOYER],
      chainId: 84531,
      contracts: {
        randomizer: process.env.BASE_GOERLI_RANDOMIZER,
        testCallback: process.env.BASE_GOERLI_TESTCALLBACK
      }
    },
    base: {
      url: process.env.BASE_RPC,
      accounts: [process.env.PRIVATE_KEY, process.env.TESTCALLBACK_DEPLOYER],
      chainId: 8453,
      contracts: {
        randomizer: process.env.BASE_RANDOMIZER,
        testCallback: process.env.BASE_TESTCALLBACK
      }
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
