contract Vault {
    mapping(address => uint256) balance;

    function deposit(address _to) external payable {
        balance[_to] += msg.value;
    }

    function withdraw(address _to, uint256 _amount) external {
        balance[msg.sender] -= _amount;
        _to.call{value: _amount}("");
        // payable(_to).transfer(_amount);
    }

    function balanceOf(address _owner) external view returns (uint256) {
        return balance[_owner];
    }
}
