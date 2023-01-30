// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.17;
import "../AppStorage.sol";
import "../libraries/Events.sol";
import "../libraries/Constants.sol";
import "../libraries/LibBeacon.sol";

// Contracts to calculate gas offsets

contract GasOffsets {
    AppStorage internal s;

    event GasUsed(uint256 gasUsed);

    constructor() {
        s.beacons = [address(1), address(2), address(3), address(4), address(5), address(6), address(7)];
    }

    function submitRandom() external {
        uint256 gasAtStart = gasleft();
        // Calculate the fee to charge the client
        uint256 fee = _getFeeCharge(gasAtStart, 123, 100000);

        // Charge the client the calculated fee
        _softChargeClient(1, false, address(0), fee, 0);
        emit GasUsed(gasAtStart - gasleft());
    }

    function submitRandomLast() external {
        uint256 gasAtStart = gasleft();

        uint256 fee = _getFeeCharge(gasAtStart, 123, 100000);

        // Charge the client the calculated fee
        _finalSoftChargeClient(123, address(0), fee, 123);
        // Clean up the mapping for the request
        delete s.requestToHash[123];
        delete s.requestToVrfHashes[123];

        // Reset the reentrancy guard status
        s._status = Constants.STATUS_NOT_ENTERED;
        emit GasUsed(gasAtStart - gasleft());
    }

    function renewRequest() external {
        s.ethCollateral[address(0)] = 1000000000000000000;
        uint256 gasAtStart = gasleft();
        uint256 renewFee = ((gasAtStart - gasleft()) * LibNetwork._gasPrice()) + 123;

        uint256 refundToClient = s.requestToFeePaid[123];
        uint256 totalCharge = renewFee + refundToClient;

        // If charging more than the striked beacon has staked, refund the remaining stake to the client
        uint256 firstCollateral = s.ethCollateral[address(0)];
        if (firstCollateral > 0) {
            if (2 > 1) {
                totalCharge = firstCollateral;
                renewFee = renewFee > totalCharge ? totalCharge : renewFee;
                s.ethCollateral[msg.sender] += renewFee;
                emit Events.ChargeEth(address(0), msg.sender, renewFee, 2);
                // totalCharge - renewFee is now 0 at its lowest
                // If collateral is remaining after renewFee, it will be refunded to the client
                refundToClient = totalCharge - renewFee;
                if (refundToClient > 0) {
                    s.ethDeposit[address(100)] += refundToClient;
                    emit Events.ChargeEth(address(0), address(100), refundToClient, 1);
                }
                s.ethCollateral[address(0)] = 0;
            }
        }

        // Log Retry
        SRequestEventData memory eventData = SRequestEventData(
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            address(0),
            [address(100), address(2), address(3)],
            keccak256(abi.encodePacked("asd"))
        );
        emit Events.Retry(123, eventData, address(0), msg.sender, refundToClient, renewFee);

        emit GasUsed(gasAtStart - gasleft());
    }

    function beaconSelectIteration(address[] memory _excluded) external {
        uint256 count = 0;
        uint256 beaconsLen = s.beacons.length;
        address[] memory selectedItems = new address[](beaconsLen - 3);

        uint256 gasAtStart = gasleft();

        for (uint256 i = 1; i < 2; i++) {
            bool found = false;
            for (uint256 j = 0; j < _excluded.length; j++) {
                if (s.beacons[i] == _excluded[j]) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                selectedItems[count] = s.beacons[i];
                count++;
            }
        }
        emit GasUsed(gasAtStart - gasleft());
    }

    function _finalSoftChargeClient(
        uint256 id,
        address client,
        uint256 fee,
        uint256 beaconFee
    ) internal {
        uint256 daoFee;
        uint256 seqFee;
        uint256 deposit = s.ethDeposit[client];
        // Nested ifs save some gas
        if (deposit > 0) {
            if (deposit > fee) {
                // If this is the final charge for the request,
                // add fee for configured treasury and sequencer
                daoFee = deposit >= fee + beaconFee ? beaconFee : deposit - fee;
                _chargeClient(client, s.treasury, daoFee);
                // Only add sequencer fee if the deposit has enough subtracting sender and treasury fee
                if (deposit > fee + daoFee) {
                    seqFee = deposit >= fee + daoFee + beaconFee ? beaconFee : deposit - daoFee - fee;
                    _chargeClient(client, s.sequencer, seqFee);
                }
            } else {
                fee = deposit;
            }
            s.requestToFeePaid[id] += fee + seqFee + daoFee;
            _chargeClient(client, msg.sender, fee);
        }
    }

    function _softChargeClient(
        uint256 id,
        bool isFinal,
        address client,
        uint256 fee,
        uint256 beaconFee
    ) internal {
        uint256 daoFee;
        uint256 seqFee;
        uint256 deposit = s.ethDeposit[client];
        // Nested ifs save some gas
        if (deposit > 0) {
            if (deposit > fee) {
                if (isFinal) {
                    // If this is the final charge for the request,
                    // add fee for configured treasury and sequencer
                    daoFee = deposit >= fee + beaconFee ? beaconFee : deposit - fee;
                    _chargeClient(client, s.treasury, daoFee);
                    // Only add sequencer fee if the deposit has enough subtracting sender and treasury fee
                    if (deposit > fee + daoFee) {
                        seqFee = deposit >= fee + daoFee + beaconFee ? beaconFee : deposit - daoFee - fee;
                        _chargeClient(client, s.sequencer, seqFee);
                    }
                }
            } else {
                fee = deposit;
            }
            s.requestToFeePaid[id] += fee + seqFee + daoFee;
            _chargeClient(client, msg.sender, fee);
        }
    }

    function _chargeClient(
        address _from,
        address _to,
        uint256 _value
    ) private {
        s.ethDeposit[_from] -= _value;
        s.ethCollateral[_to] += _value;
        emit Events.ChargeEth(_from, _to, _value, 0);
    }

    function _getFeeCharge(
        uint256 gasAtStart,
        uint256 _beaconFee,
        uint256 offset
    ) internal view returns (uint256) {
        // Beacon fee
        uint256 fee = ((gasAtStart - gasleft() + offset) * LibNetwork._gasPrice()) + _beaconFee;
        return fee;
    }
}
