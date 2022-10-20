// SPDX-License-Identifier: BSL 1.1

/// @title Randomizer Internals Service
/// @author Deanpress (https://github.com/deanpress)
/// @notice Randomizer Internals functions that were split from the main contract to save deployment gas.

pragma solidity ^0.8.17;
import "./Structs.sol";

contract Internals {
    event ChargeEth(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint8 chargeType
    );
    event BeaconInvalidVRF(
        address indexed beacon,
        uint128 indexed request,
        bytes32 seed,
        SFastVerifyData vrfData
    );

    struct DisputeDynamicVars {
        uint128 id;
        bool vrfFailed;
        uint256 ethToSender;
    }

    struct SCanCompleteData {
        uint256 expirationSeconds;
        uint256 expirationBlocks;
        uint256[2] disputeWindow;
        address[3] beacons;
        address sequencer;
    }

    error NotYetCompletableBySender(
        uint256 currentHeight,
        uint256 completableHeight,
        uint256 currentTimestamp,
        uint256 completableTimestamp
    );

    /// @dev Replaces all non-submitting beacons from a request (called when a request is renewed)
    function _replaceNonSubmitters(
        uint128 _request,
        address[3] memory _beacons,
        bytes32[3] memory _values,
        address[] memory beacons
    ) external view returns (address[3] memory) {
        bytes32 random = keccak256(
            abi.encode(
                address(this),
                _request,
                blockhash(block.number - 1),
                block.chainid
            )
        );

        address[3] memory newSelectedBeacons;
        uint256 i;
        uint256 length = beacons.length - 1;
        uint256 valuesLen = _values.length;

        while (i < valuesLen) {
            // If non-submitter
            if (_values[i] == bytes32(0) && _beacons[i] != address(0)) {
                // Generate new beacon beacon index
                uint256 randomBeaconIndex = (uint256(random) % length) + 1;
                address randomBeacon = beacons[randomBeaconIndex];
                bool duplicate;
                // Check existing for beaconId duplicates
                for (uint256 j; j < valuesLen; j++) {
                    if (randomBeacon == _beacons[j]) {
                        random = keccak256(abi.encode(random));
                        duplicate = true;
                        break;
                    }
                }
                // Check  for new beaconId duplicates
                if (!duplicate) {
                    for (uint256 j; j < valuesLen; j++) {
                        if (randomBeacon == newSelectedBeacons[j]) {
                            duplicate = true;
                            break;
                        }
                    }
                }
                // If no duplicates: assign to newSelectedBeacons and update beacon pending
                if (!duplicate) {
                    newSelectedBeacons[i] = randomBeacon;
                    i++;
                } else {
                    // If there's a duplicate re-run the loop with a new random hash
                    random = keccak256(abi.encode(random));
                }
            } else {
                // If the beacon already submitted, assign it to its existing position
                newSelectedBeacons[i] = _beacons[i];
                i++;
            }
        }

        return newSelectedBeacons;
    }

    function _dispute(
        uint128 id,
        bytes32 seed,
        address sender,
        SFastVerifyData memory vrfData,
        DisputeCallVars memory callVars,
        address vrf
    ) external returns (DisputeReturnData memory) {
        // Iterate through requestToProofs and VRF fastVerify each
        DisputeDynamicVars memory vars = DisputeDynamicVars({
            id: id,
            vrfFailed: false,
            ethToSender: 0
        });

        // Run VRF Secp256k1 fastVerify method
        uint256 feeRefunded;
        if (
            !IVRF(vrf).fastVerify(
                callVars.publicKeys,
                vrfData.proof,
                abi.encodePacked(seed),
                vrfData.uPoint,
                vrfData.vComponents
            )
        ) {
            // Manipulating beacons pay for all transaction fees to client so far.
            // Send full stake if beacon doesn't have enough.
            if (callVars.feePaid > 0 && callVars.collateral > 0) {
                if (callVars.feePaid < callVars.collateral) {
                    callVars.collateral -= callVars.feePaid;
                    callVars.clientDeposit += callVars.feePaid;
                    feeRefunded = callVars.feePaid;

                    emit ChargeEth(
                        callVars.beacon,
                        callVars.client,
                        feeRefunded,
                        1
                    );

                    vars.ethToSender += callVars.collateral;
                    emit ChargeEth(
                        callVars.beacon,
                        sender,
                        vars.ethToSender,
                        2
                    );
                } else {
                    callVars.clientDeposit += callVars.collateral;
                    feeRefunded = callVars.collateral;

                    emit ChargeEth(
                        callVars.beacon,
                        callVars.client,
                        feeRefunded,
                        1
                    );
                }
            }

            vars.vrfFailed = true;
            // Entire remaining stake of manipulating beacons should go to the disputer
            // This penalty is possible because invalid VRF proofs can only be done on purpose
            emit BeaconInvalidVRF(callVars.beacon, vars.id, seed, vrfData);
        }

        return
            DisputeReturnData(
                vars.vrfFailed,
                callVars.beacon,
                vars.ethToSender,
                feeRefunded,
                callVars.clientDeposit
            );
    }
}
