/******************************************************************************\
██████   █████  ███    ██ ██████   ██████  ███    ███ ██ ███████ ███████ ██████  
██   ██ ██   ██ ████   ██ ██   ██ ██    ██ ████  ████ ██    ███  ██      ██   ██ 
██████  ███████ ██ ██  ██ ██   ██ ██    ██ ██ ████ ██ ██   ███   █████   ██████  
██   ██ ██   ██ ██  ██ ██ ██   ██ ██    ██ ██  ██  ██ ██  ███    ██      ██   ██ 
██   ██ ██   ██ ██   ████ ██████   ██████  ██      ██ ██ ███████ ███████ ██   ██ 

Website: https://randomizer.ai
Author: Dean van Dugteren (@deanpress)
License: Business Source License 1.1 (BUSL-1.1)

===DISCLAIMER===
Please be aware that using the Randomizer contract carries inherent risks,
and by implementing it you are doing so at your own risk.
Randomizer and its licensors, developers, and contributors will not be held responsible for any
security issues that may arise from any code or implementations of the smart contracts.
It is your responsibility to thoroughly review and test any contract before use.

===LICENSE===
The Randomizer contract is licensed under the Business Source License 1.1 (BUSL-1.1).
Prior to the Change Date specified in the license, creating derivative works or deploying forks
of the contract without explicit permission as defined by the license is not permitted.

===IMPLEMENTATIONS===
Portions of the Randomizer protocol contracts implement the following MIT licensed code:
* Nick Mudge's EIP-2353 Diamond Standard reference contract (https://github.com/mudgen/diamond-3-hardhat)
* Witnet Foundation's VRF and EC libraries (https://github.com/witnet/vrf-solidity and https://github.com/witnet/elliptic-curve-solidity)
/******************************************************************************/

/// @title Randomizer Diamond
/// @author Dean van Dugteren (https://github.com/deanpress)
/// @notice Diamond contract for the Randomizer protocol. Function calls are delegated to Randomizer's respective facet contracts.
/// @dev EIP-2535 Diamonds: https://eips.ethereum.org/EIPS/eip-2535
/// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.18;

import {LibDiamond} from "./libraries/LibDiamond.sol";
import {IDiamondCut} from "./interfaces/IDiamondCut.sol";

contract RandomizerDiamond {
    constructor(address _contractOwner, address _diamondCutFacet) payable {
        LibDiamond.setContractOwner(_contractOwner);

        // Add the diamondCut external function from the diamondCutFacet
        IDiamondCut.FacetCut[] memory cut = new IDiamondCut.FacetCut[](1);
        bytes4[] memory functionSelectors = new bytes4[](1);
        functionSelectors[0] = IDiamondCut.diamondCut.selector;
        cut[0] = IDiamondCut.FacetCut({
            facetAddress: _diamondCutFacet,
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: functionSelectors
        });
        LibDiamond.diamondCut(cut, address(0), "");
    }

    // Find facet for function that is called and execute the
    // function if a facet is found and return any value.
    fallback() external payable {
        LibDiamond.DiamondStorage storage ds;
        bytes32 position = LibDiamond.DIAMOND_STORAGE_POSITION;
        // get diamond storage
        assembly {
            ds.slot := position
        }
        // get facet from function selector
        address facet = ds.selectorToFacetAndPosition[msg.sig].facetAddress;
        require(facet != address(0), "Diamond: Function does not exist");
        // Execute external function from facet using delegatecall and return any value.
        assembly {
            // copy function selector and any arguments
            calldatacopy(0, 0, calldatasize())
            // execute function call using the facet
            let result := delegatecall(gas(), facet, 0, calldatasize(), 0, 0)
            // get any return value
            returndatacopy(0, 0, returndatasize())
            // return any return value or error back to the caller
            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    receive() external payable {}
}
