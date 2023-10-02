// SPDX-License-Identifier: BSL-1.1

pragma solidity ^0.8.19;

import "./RandomizerDiamond.sol";
import "./facets/DiamondCutFacet.sol";

contract Create2Factory {
    bool public used;
    bool public usedCut;
    address public owner;
    // Returns the address of the newly deployed contract
    event ContractDeployed(address addr);
    event CutContractDeployed(address addr);

    constructor() {
        owner = msg.sender;
    }

    function deploy(address _contractOwner, address _diamondCutFacet, bytes32 _salt) public payable {
        require(!used && msg.sender == owner, "ERR_CREATE2");
        address newContract = address(new RandomizerDiamond{salt: _salt}(_contractOwner, _diamondCutFacet));
        emit ContractDeployed(newContract);
        used = true;
    }

    function deployCut(bytes32 _salt) public payable {
        require(!usedCut && msg.sender == owner, "ERR_CREATE2");
        address newContract = address(new DiamondCutFacet{salt: _salt}());
        emit CutContractDeployed(newContract);
        usedCut = true;
    }
}
