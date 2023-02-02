// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {LibDiamond} from "../libraries/LibDiamond.sol";

contract OwnershipFacet {
    function proposeOwnership(address _proposedOwner) external {
        LibDiamond.enforceIsContractOwner();
        LibDiamond.setProposedContractOwner(_proposedOwner);
    }

    function acceptOwnership() external {
        LibDiamond.enforceIsProposedContractOwner();
        LibDiamond.acceptProposedContractOwner();
    }

    function cancelProposeOwnership() external {
        LibDiamond.enforceIsCurrentOrProposedContractOwner();
        LibDiamond.cancelProposedContractOwner();
    }

    function owner() external view returns (address owner_) {
        owner_ = LibDiamond.contractOwner();
    }

    function proposedOwner() external view returns (address proposed_) {
        proposed_ = LibDiamond.proposedOwner();
    }
}
