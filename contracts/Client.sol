// SPDX-License-Identifier: BSL 1.1

/// @title SoRandom Client Service
/// @author Deanpress (hello@dean.press)
/// @notice SoRandom client contract management functions (deposits/withdrawals and fee estimates)

import "./Beacon.sol";

contract Client is Utils {
    // Errors exclusive to Client.sol
    error WithdrawingTooMuch(uint256 amount, uint256 allowedAmount);
    error CallbackGasLimitOOB(
        uint256 inputLimit,
        uint256 minLimit,
        uint256 maxLimit
    );
    error EthDepositTooLow(uint256 availableAmount, uint256 requiredAmount);

    uint256 internal constant SUBMIT_GAS_ESTIMATE = 201000;

    /// @notice Gets the ETH balance of the client contract (used for paying for requests)
    function clientBalanceOf(address _client) public view returns (uint256) {
        return ethDeposit[_client];
    }

    /// @notice Deposits ETH for the client contract
    function clientDeposit(address _client) external payable {
        ethDeposit[_client] += msg.value;
        emit ClientDeposit(_client, msg.value);
    }

    /// @notice Gets the amount of ETH reserved for a client's pending requests
    /// @dev Reserved amounts are based on an estimate per request so clients can't make more requests than they can fund.
    function getEthReserved(address _client) public view returns (uint256) {
        return ethReserved[_client];
    }

    /// @notice Withdraws client ETH to a different receiver
    /// @dev Your contract MUST call to this function to withdraw previously deposited funds.
    /// You can use this for refunding ETH if user paid for request.
    function clientWithdrawTo(address _to, uint256 _amount) external {
        if (_amount > ethDeposit[msg.sender] - ethReserved[msg.sender])
            revert WithdrawingTooMuch(
                _amount,
                ethDeposit[msg.sender] - ethReserved[msg.sender]
            );

        ethDeposit[msg.sender] -= _amount;
        emit ClientWithdrawTo(msg.sender, _to, _amount);
        _transferEth(_to, _amount);
    }

    /// @notice Gets fee estimate for full request fulfillment
    /// @dev If your users pay for a random request, use this to calculate how much ETH a user should add to your payable function.
    function getFeeEstimate(uint256 _callbackGasLimit, uint8 _numberOfBeacons)
        public
        view
        returns (uint256)
    {
        return
            (((SUBMIT_GAS_ESTIMATE * _numberOfBeacons) + _callbackGasLimit) * // gas used
                _getGasPrice()) +
            beaconFee + // dev fee
            (beaconFee * _numberOfBeacons); // All beacon premium fees;
    }

    function requestRandom(uint256 _callbackGasLimit)
        external
        returns (uint128 id)
    {
        // uint8 _numberOfBeacons = 3;
        // require(
        //     _numberOfBeacons > 1 && _numberOfBeacons <= 10,
        //     "INVALID_NUM_BEACONS"
        // );

        // require(
        //     _finalSigner == address(0) || beaconIndex[_finalSigner] > 0,
        //     "FINALSIGNER_NOT_A_BEACON"
        // );

        if (
            _callbackGasLimit < requestMinGasLimit ||
            _callbackGasLimit > requestMaxGasLimit
        )
            revert CallbackGasLimitOOB(
                _callbackGasLimit,
                requestMinGasLimit,
                requestMaxGasLimit
            );

        // Requester must have enough to cover gas for each beacon + the callback gas limit
        uint256 estimateFee = getFeeEstimate(_callbackGasLimit, 3);

        if (estimateFee > (ethDeposit[msg.sender] - ethReserved[msg.sender]))
            revert EthDepositTooLow(
                ethDeposit[msg.sender] - ethReserved[msg.sender],
                estimateFee
            );

        ethReserved[msg.sender] += estimateFee;

        latestRequestId++;

        pendingRequestIds.push(latestRequestId);

        bytes32 seed = keccak256(
            abi.encode(
                latestRequestId,
                blockhash(block.number - 1),
                block.timestamp,
                block.difficulty,
                block.chainid
            )
        );

        address[3] memory selectedBeacons = _randomBeacons(seed);

        bytes32 requestHash = keccak256(
            abi.encode(
                latestRequestId,
                msg.sender,
                selectedBeacons,
                seed,
                estimateFee,
                beaconFee,
                block.number,
                block.timestamp,
                expirationSeconds,
                expirationBlocks,
                _callbackGasLimit
                // new bytes12[](BEACONS_PER_REQUEST)
            )
        );

        requestToHash[latestRequestId] = requestHash;

        // address[] memory eventBeacons = new address[](2);
        // eventBeacons[0] = selectedBeacons[0];
        // eventBeacons[1] = selectedBeacons[1];

        emit Request(
            latestRequestId,
            SRequestEventData(
                estimateFee,
                beaconFee,
                block.number,
                block.timestamp,
                expirationSeconds,
                expirationBlocks,
                _callbackGasLimit,
                msg.sender,
                selectedBeacons,
                seed
            )
        );

        return latestRequestId;
    }
}
