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

    struct ChallengeDynamicVars {
        uint128 id;
        bool vrfFailed;
        address[3] beaconsToRemove;
        uint256 ethToSender;
    }

    struct ChallengeCallVars {
        uint256[2][3] publicKeys;
        uint256 feePaid;
        uint256 clientDeposit;
        uint256[3] collaterals;
        address[3] beacons;
        address client;
    }

    struct ChallengeReturnData {
        bool vrfFailed;
        address[3] beaconsToRemove;
        uint256 ethToSender;
        uint256 newRequestToFee;
        uint256 newClientDeposit;
    }

    struct SCanCompleteData {
        uint256 expirationSeconds;
        uint256 expirationBlocks;
        uint256[2] challengeWindow;
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

    function _challenge(
        uint128 id,
        bytes32 seed,
        SFastVerifyData[3] memory vrfDatas,
        ChallengeCallVars memory callVars,
        address vrf
    ) external returns (ChallengeReturnData memory) {
        // Iterate through requestToProofs and VRF fastVerify each

        ChallengeDynamicVars memory vars = ChallengeDynamicVars({
            id: id,
            vrfFailed: false,
            beaconsToRemove: [address(0), address(0), address(0)],
            ethToSender: 0
        });

        uint256 k = 0;

        for (uint256 i; i < 3; i++) {
            // Run VRF Secp256k1 fastVerify method
            if (!_verify(callVars.publicKeys[i], vrfDatas[i], seed, vrf)) {
                // Manipulating beacons pay for all transaction fees to client so far.
                // Send full stake if beacon doesn't have enough.

                if (callVars.feePaid > 0 && callVars.collaterals[i] > 0) {
                    if (callVars.feePaid < callVars.collaterals[i]) {
                        callVars.collaterals[i] -= callVars.feePaid;
                        callVars.clientDeposit += callVars.feePaid;
                        callVars.feePaid = 0;

                        emit ChargeEth(
                            callVars.beacons[i],
                            callVars.client,
                            callVars.feePaid,
                            true,
                            false
                        );
                    } else {
                        callVars.clientDeposit += callVars.collaterals[i];
                        callVars.feePaid -= callVars.collaterals[i];
                        callVars.collaterals[i] = 0;

                        emit ChargeEth(
                            callVars.beacons[i],
                            callVars.client,
                            callVars.collaterals[i],
                            true,
                            false
                        );
                    }
                }

                vars.vrfFailed = true;
                // Entire remaining stake of manipulating beacons should go to the challenger
                // This penalty is possible because invalid VRF proofs can only be done on purpose
                vars.ethToSender += callVars.collaterals[i];
                callVars.collaterals[i] = 0;
                {
                    emit BeaconInvalidVRF(
                        callVars.beacons[i],
                        vars.id,
                        seed,
                        vrfDatas[i]
                    );
                }
                vars.beaconsToRemove[k] = callVars.beacons[i];
                k++;
            }
        }
        return
            ChallengeReturnData(
                vars.vrfFailed,
                vars.beaconsToRemove,
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
        uint256 completeHeight = d.challengeWindow[0] +
            (d.expirationBlocks * multiplier);
        uint256 completeTimestamp = d.challengeWindow[1] +
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
