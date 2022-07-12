import "@openzeppelin/contracts/access/Ownable.sol";

interface ISoRandom {
    function clientWithdrawTo(address to, uint256 amount) external;

    function clientDeposit(address client) external payable;

    function clientBalanceOf(address client) external view returns (uint256);
}

interface IClient {
    function proxyWithdraw(address from, uint256 amount) external;
}

contract AddressProxy is Ownable {
    address public oldSoRandom;
    address public soRandom;
    address[] public clients;

    constructor(address _soRandom) {
        soRandom = _soRandom;
    }

    fallback() external payable {}

    function clientWithdrawAndDeposit(
        address from,
        address client,
        uint256 amount
    ) external onlyOwner {
        IClient(client).proxyWithdraw(from, amount);
        ISoRandom(soRandom).clientDeposit{value: amount}(client);
    }

    function clientWithdraw(
        address client,
        address _soRandom,
        uint256 amount
    ) external onlyOwner {
        IClient(client).proxyWithdraw(_soRandom, amount);
    }

    function clientDeposit(
        address _soRandom,
        address client,
        uint256 amount
    ) external onlyOwner {
        ISoRandom(_soRandom).clientDeposit{value: amount}(client);
    }

    function clientsWithdraw(uint256 amount) external onlyOwner {
        for (uint256 i = 0; i < clients.length; i++) {
            IClient(clients[i]).proxyWithdraw(oldSoRandom, amount);
        }
    }

    function clientsDeposit() external onlyOwner {
        for (uint256 i = 0; i < clients.length; i++) {
            uint256 balance = ISoRandom(soRandom).clientBalanceOf(clients[i]);
            ISoRandom(soRandom).clientDeposit{value: balance}(clients[i]);
        }
    }

    function allClients() external view returns (address[] memory) {
        return clients;
    }

    // function getOldSoRandom() external view returns (address) {
    //     return oldSoRandom;
    // }

    // function getSoRandom() external view returns (address) {
    //     return soRandom;
    // }

    function addClient(address client) external onlyOwner {
        clients.push(client);
    }

    function removeClient(address client) external onlyOwner {
        for (uint256 i; i < clients.length; i++) {
            if (clients[i] == client) {
                clients[i] = clients[clients.length - 1];
                clients.pop();
                return;
            }
        }
    }

    function clientsWithdrawAndDeposit() external onlyOwner {
        for (uint256 i; i < clients.length; i++) {
            uint256 amt = ISoRandom(oldSoRandom).clientBalanceOf(clients[i]);
            IClient(clients[i]).proxyWithdraw(oldSoRandom, amt);
            ISoRandom(soRandom).clientDeposit{value: amt}(clients[i]);
        }
    }

    function setSoRandom(address _soRandom) public onlyOwner {
        oldSoRandom = soRandom;
        soRandom = _soRandom;
    }
}
