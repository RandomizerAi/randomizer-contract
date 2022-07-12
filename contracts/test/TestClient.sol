interface IVault {
    function deposit(address _to) external payable;

    function withdraw(address _from, uint256 _amount) external;
}

contract TestClient {
    address vault;

    constructor(address _vault) {
        vault = _vault;
    }

    function withdraw(address _to, uint256 _amount) external {
        IVault(vault).withdraw(_to, _amount);
    }
}
