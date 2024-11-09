// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/******************************************************************************\
* Author: Nick Mudge <nick@perfectabstractions.com> (https://twitter.com/mudgen)
* EIP-2535 Diamonds: https://eips.ethereum.org/EIPS/eip-2535
*
* Implementation of a diamond.
/******************************************************************************/

import {LibDiamond} from "../libraries/LibDiamond.sol";
import {IDiamondLoupe} from "../interfaces/IDiamondLoupe.sol";
import {IDiamondCut} from "../interfaces/IDiamondCut.sol";
import {IERC165} from "../interfaces/IERC165.sol";
import {AppStorage} from "../AppStorage.sol";
import {Constants} from "../libraries/Constants.sol";
import "../shared/Structs.sol";
import {Events} from "../libraries/Events.sol";

// It is expected that this contract is customized if you want to deploy your diamond
// with data from a deployment script. Use the init function to initialize state variables
// of your diamond. Add parameters to the init funciton if you need to.

contract DiamondInit {
    AppStorage internal s;

    struct Args {
        address sequencer;
        address treasury;
        uint256[] configUints;
        address[] beacons;
        uint256[] beaconPublicKeys;
        uint256[] gasEstimates;
    }

    // You can add parameters to this function in order to pass in
    // data to set your own state variables
    function init(Args memory _args) external {
        require(s._status == 0, "ALREADY_INITIALIZED");
        s._status = Constants.STATUS_NOT_ENTERED;
        require(_args.beaconPublicKeys.length == _args.beacons.length * 2, "BEACON_LENGTH");
        s.sequencer = _args.sequencer;
        s.treasury = _args.treasury;
        emit Events.TransferSequencer(address(0), s.sequencer);

        uint256 uintsLength = _args.configUints.length;
        require(uintsLength <= 48, "CONFIG_VALUES_LENGTH");
        for (uint256 i = 0; i < uintsLength; i++) {
            s.configUints[i] = _args.configUints[i];
        }

        s.beacons.push(address(0));
        uint256 beaconsLength = _args.beacons.length;
        for (uint256 i; i < beaconsLength; i++) {
            s.beaconIndex[_args.beacons[i]] = s.beacons.length;
            s.beacons.push(_args.beacons[i]);
            s.beacon[_args.beacons[i]] = Beacon(
                [_args.beaconPublicKeys[i * 2], _args.beaconPublicKeys[i == 0 ? 1 : i * 2 + 1]],
                true,
                0,
                0,
                0
            );
        }
        uint256 gasLength = _args.gasEstimates.length;
        require(gasLength <= 16, "GAS_ESTIMATES_LENGTH");
        for (uint256 i; i < gasLength; i++) {
            s.gasEstimates[i] = _args.gasEstimates[i];
        }

        // adding ERC165 data
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        ds.supportedInterfaces[type(IERC165).interfaceId] = true;
        ds.supportedInterfaces[type(IDiamondCut).interfaceId] = true;
        ds.supportedInterfaces[type(IDiamondLoupe).interfaceId] = true;
    }
}
