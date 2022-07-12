interface IVault {
    function deposit(address _to) external payable;

    function withdraw(uint256 _amount) external;
}

interface IClient {
    function withdraw(address _to, uint256 _amount) external;
}

contract Proxy {
    function withdrawFromClient(address _client, uint256 _amount) external {
        IClient(_client).withdraw(msg.sender, _amount);
    }
}
