// SPDX-License-Identifier: BSL 1.1

/// @title Randomizer Client Service
/// @author Deanpress (https://github.com/deanpress)
/// @notice Randomizer client contract management functions (deposits/withdrawals and fee estimates)

pragma solidity ^0.8.16;

import "./Beacon.sol";

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
    function getFeeEstimate(uint256 _callbackGasLimit)
        public
        view
        returns (uint256)
    {
        return
            ((gasEstimates.totalSubmit + _callbackGasLimit) * _getGasPrice()) +
            (beaconFee * 4); // gas used // 3 beacon premium fees, 1 dev fee;
    }

    /// @notice Requests a random value with on-chain VRF validation
    function request(uint256 callbackGasLimit) external returns (uint128 id) {
        return _request(callbackGasLimit, false);
    }

    /// @notice Low gas request() alternative that processes the VRF proofs off-chain, with beacons acting as multisig validators
    function request(uint256 callbackGasLimit, bool optimistic)
        external
        returns (uint128 id)
    {
        return _request(callbackGasLimit, optimistic);
    }

    function _request(uint256 _callbackGasLimit, bool _optimistic)
        private
        returns (uint128 id)
    {
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
        uint256 estimateFee = getFeeEstimate(_callbackGasLimit);

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
        bytes32 seed = keccak256(
            abi.encode(
                address(this),
                latestRequestId,
                blockhash(block.number - 1),
                block.timestamp,
                block.difficulty,
                block.chainid
            )
        );

        address[3] memory selectedBeacons = _randomBeacons(bytes32(seed));

        // No need to hash block data since it exists within the seed
        bytes32 requestHash = keccak256(
            abi.encode(
                latestRequestId,
                seed,
                msg.sender,
                selectedBeacons,
                estimateFee,
                beaconFee,
                [block.number, block.timestamp],
                expirationSeconds,
                expirationBlocks,
                _callbackGasLimit,
                _optimistic
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
                seed,
                _optimistic
            )
        );

        return latestRequestId;
    }
}
