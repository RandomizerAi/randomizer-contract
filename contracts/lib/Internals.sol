// SPDX-License-Identifier: BSL 1.1
pragma solidity ^0.8.16;
import "./Structs.sol";

interface IVRF {
    function fastVerify(
        uint256[2] memory _publicKey, //Y-x, Y-y
        uint256[4] memory _proof, //pi, which is D, a.k.a. gamma-x, gamma-y, c, s
        bytes memory _message, //alpha string
        uint256[2] memory _uPoint, //U-x, U-y
        uint256[4] memory _vComponents //s*H -x, s*H -y, c*Gamma -x, c*Gamma -y
    ) external pure returns (bool);
}

library Internals {
    event ChargeEth(
        address indexed from,
        address indexed to,
        uint256 amount,
        bool fromDepositOrCollateral,
        bool toDepositOrCollateral
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

    struct DisputeCallVars {
        uint256[2] publicKeys;
        uint256 feePaid;
        uint256 clientDeposit;
        uint256 collateral;
        address beacon;
        address client;
    }

    struct DisputeReturnData {
        bool vrfFailed;
        address beaconToRemove;
        uint256 ethToSender;
        uint256 newRequestToFee;
        uint256 newClientDeposit;
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
        address[] storage beacons
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

    function _verify(
        uint256[2] memory publicKeys,
        SFastVerifyData memory vrfData,
        bytes32 seed,
        address vrf
    ) private pure returns (bool) {
        return
            IVRF(vrf).fastVerify(
                publicKeys,
                vrfData.proof,
                abi.encodePacked(seed),
                vrfData.uPoint,
                vrfData.vComponents
            );
    }

    function _dispute(
        uint128 id,
        bytes32 seed,
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
        if (!_verify(callVars.publicKeys, vrfData, seed, vrf)) {
            // Manipulating beacons pay for all transaction fees to client so far.
            // Send full stake if beacon doesn't have enough.

            if (callVars.feePaid > 0 && callVars.collateral > 0) {
                if (callVars.feePaid < callVars.collateral) {
                    callVars.collateral -= callVars.feePaid;
                    callVars.clientDeposit += callVars.feePaid;
                    callVars.feePaid = 0;

                    emit ChargeEth(
                        callVars.beacon,
                        callVars.client,
                        callVars.feePaid,
                        true,
                        false
                    );
                } else {
                    callVars.clientDeposit += callVars.collateral;
                    callVars.feePaid -= callVars.collateral;
                    callVars.collateral = 0;

                    emit ChargeEth(
                        callVars.beacon,
                        callVars.client,
                        callVars.collateral,
                        true,
                        false
                    );
                }
            }

            vars.vrfFailed = true;
            // Entire remaining stake of manipulating beacons should go to the disputer
            // This penalty is possible because invalid VRF proofs can only be done on purpose
            vars.ethToSender += callVars.collateral;
            emit BeaconInvalidVRF(callVars.beacon, vars.id, seed, vrfData);
        }

        return
            DisputeReturnData(
                vars.vrfFailed,
                callVars.beacon,
                vars.ethToSender,
                callVars.feePaid,
                callVars.clientDeposit
            );
    }

    function _optimisticCanComplete(SCanCompleteData memory d) external view {
        bool isBeaconOrSequencer;
        if (msg.sender == d.sequencer) {
            _checkCanComplete(d, 3);
            isBeaconOrSequencer = true;
        } else {
            for (uint256 i; i < 3; i++) {
                if (d.beacons[i] == msg.sender) {
                    _checkCanComplete(d, i);
                    isBeaconOrSequencer = true;
                    break;
                }
            }
            if (!isBeaconOrSequencer) {
                _checkCanComplete(d, 4);
            }
        }
    }

    function _checkCanComplete(SCanCompleteData memory d, uint256 multiplier)
        private
        view
    {
        uint256 completeHeight = d.disputeWindow[0] +
            (d.expirationBlocks * multiplier);
        uint256 completeTimestamp = d.disputeWindow[1] +
            (multiplier * 5 minutes);
        if (
            block.number < completeHeight || block.timestamp < completeTimestamp
        )
            revert NotYetCompletableBySender(
                block.number,
                completeHeight,
                block.timestamp,
                completeTimestamp
            );
    }
}
