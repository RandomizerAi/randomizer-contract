// SPDX-License-Identifier: BSL 1.1

/// @title Randomizer Client Service
/// @author Deanpress (https://github.com/deanpress)
/// @notice Randomizer client contract management functions (deposits/withdrawals and fee estimates)

pragma solidity ^0.8.17;

import "./Utils.sol";

contract Client is Utils {
    // Errors exclusive to Client.sol
    error WithdrawingTooMuch(uint256 amount, uint256 allowedAmount);
    error CallbackGasLimitOOB(
        uint256 inputLimit,
        uint256 minLimit,
        uint256 maxLimit
    );
    error EthDepositTooLow(
        uint256 deposited,
        uint256 reserved,
        uint256 requiredAmount
    );

    /// @notice Gets the ETH balance and amount reserved of the client contract (used for paying for requests)
    /// @dev Reserved amounts are based on an estimate per request so clients can't make more requests than they can fund.
    function clientBalanceOf(address _client)
        external
        view
        returns (uint256 deposit, uint256 reserved)
    {
        return (ethDeposit[_client], ethReserved[_client]);
    }

    /// @notice Deposits ETH for the client contract
    function clientDeposit(address _client) external payable {
        ethDeposit[_client] += msg.value;
        emit DepositEth(DEPOSIT_TYPE_CLIENT, _client, msg.value);
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
    function getFeeEstimate(uint256 _callbackGasLimit, bool _optimistic)
        public
        view
        returns (uint256)
    {
        uint256 gasEstimate = _optimistic
            ? gasEstimates[GKEY_OPT_SUBMIT_TOTAL]
            : gasEstimates[GKEY_SUBMIT_TOTAL];

        return
            ((gasEstimate + _callbackGasLimit) * _getGasPrice()) +
            (configUints[CKEY_BEACON_FEE] * 5); //  3 beacon premium fees, dao fee, dev fee
    }

    /// @notice Requests a random value with on-chain VRF validation
    function request(uint256 callbackGasLimit) external returns (uint128 id) {
        return _requestRandom(callbackGasLimit, false);
    }

    /// @notice Low gas request() alternative that processes the VRF proofs off-chain, with beacons acting as multisig validators
    function request(uint256 callbackGasLimit, bool optimistic)
        external
        returns (uint128 id)
    {
        return _requestRandom(callbackGasLimit, optimistic);
    }

    function _requestRandom(uint256 _callbackGasLimit, bool _optimistic)
        private
        returns (uint128 id)
    {
        uint256 requestMinGasLimit = configUints[CKEY_REQUEST_MIN_GAS_LIMIT];
        uint256 requestMaxGasLimit = configUints[CKEY_REQUEST_MAX_GAS_LIMIT];
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
        uint256 estimateFee = getFeeEstimate(_callbackGasLimit, _optimistic);

        if (
            ethDeposit[msg.sender] < ethReserved[msg.sender] ||
            estimateFee > (ethDeposit[msg.sender] - ethReserved[msg.sender])
        )
            revert EthDepositTooLow(
                ethDeposit[msg.sender],
                ethReserved[msg.sender],
                estimateFee
            );

        ethReserved[msg.sender] += estimateFee;

        latestRequestId++;

        // Don't use encodePacked here because it could cause duplicate hashes with different values
        SRandomUintData memory data = SRandomUintData({
            ethReserved: estimateFee,
            beaconFee: configUints[CKEY_BEACON_FEE],
            height: _blockNumber(),
            timestamp: block.timestamp,
            expirationBlocks: configUints[CKEY_EXPIRATION_BLOCKS],
            expirationSeconds: configUints[CKEY_EXPIRATION_SECONDS],
            callbackGasLimit: _callbackGasLimit
        });

        _generateRequest(latestRequestId, msg.sender, data, _optimistic);

        return latestRequestId;
    }
}
