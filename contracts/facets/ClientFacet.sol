// SPDX-License-Identifier: BUSL-1.1
/// @title Randomizer Client Service
/// @author Dean van Dugteren (https://github.com/deanpress)
/// @notice Randomizer client contract management functions (deposits/withdrawals and fee estimates)

pragma solidity ^0.8.17;
import {LibDiamond} from "../libraries/LibDiamond.sol";
import "../AppStorage.sol";
import "../libraries/Constants.sol";
import "../libraries/Events.sol";
import "../shared/Utils.sol";
import "../libraries/LibBeacon.sol";
import "../libraries/LibNetwork.sol";

contract ClientFacet is Utils {
    /* Errors */

    /// @dev Error thrown when the client attempts to withdraw more than they have deposited
    /// @param amount The amount the client is trying to withdraw
    /// @param allowedAmount The amount the client is allowed to withdraw
    error WithdrawingTooMuch(uint256 amount, uint256 allowedAmount);

    /// @dev Error thrown when the callback gas limit is out of bounds
    /// @param inputLimit The callback gas limit input by the client
    /// @param minLimit The minimum allowed callback gas limit
    /// @param maxLimit The maximum allowed callback gas limit
    error CallbackGasLimitOOB(uint256 inputLimit, uint256 minLimit, uint256 maxLimit);

    /// @dev Error thrown when the request min confirmations are is out of bounds
    /// @param inputLimit The confirmations input by the client
    /// @param minLimit The minimum allowed confirmations
    /// @param maxLimit The maximum allowed confirmations
    error MinConfirmationsOOB(uint256 inputLimit, uint256 minLimit, uint256 maxLimit);

    /// @dev Error thrown when the client attempts to deposit too little ETH
    /// @param deposited The amount of ETH the client has deposited
    /// @param reserved The amount of ETH the client has reserved for requests
    /// @param requiredAmount The amount of ETH the client needs to deposit to fulfill a new request
    error EthDepositTooLow(uint256 deposited, uint256 reserved, uint256 requiredAmount);

    /* Events */

    /// @dev Event emitted when a client withdraws ETH to a different address
    /// @param client The address of the client withdrawing ETH
    /// @param to The address the client is withdrawing ETH to
    /// @param amount The amount of ETH the client is withdrawing
    event ClientWithdrawTo(address indexed client, address indexed to, uint256 amount);

    /* Functions */

    /// @notice Gets the ETH balance and amount reserved of the client contract (used for paying for requests)
    /// @dev Reserved amounts are based on gas estimatations per request so clients can't make more requests than their deposit can fund.
    /// @param _client The address of the client contract to check
    /// @return deposit The amount of ETH the client has deposited
    /// @return reserved The amount of ETH that Randomizer has reserved for requests
    function clientBalanceOf(address _client) external view returns (uint256 deposit, uint256 reserved) {
        return (s.ethDeposit[_client], s.ethReserved[_client]);
    }

    /// @notice Deposits ETH for the client contract
    /// @param _client The address of the client contract to deposit ETH to
    function clientDeposit(address _client) external payable {
        s.ethDeposit[_client] += msg.value;
        emit Events.ClientDepositEth(_client, msg.value);
    }

    /// @notice Withdraws client ETH to a different receiver
    /// @dev Your contract MUST call to this function to withdraw previously deposited funds.
    /// You can use this for refunding ETH if user paid for request.
    /// @param _to The address to withdraw ETH to
    /// @param _amount The amount of ETH to withdraw
    function clientWithdrawTo(address _to, uint256 _amount) external {
        // Check if the client is trying to withdraw more than they have deposited
        if (_amount > s.ethDeposit[msg.sender] - s.ethReserved[msg.sender])
            revert WithdrawingTooMuch(_amount, s.ethDeposit[msg.sender] - s.ethReserved[msg.sender]);

        // Decrease the client's deposit by the amount they are withdrawing
        s.ethDeposit[msg.sender] -= _amount;

        // Emit an event to log the withdrawal
        emit ClientWithdrawTo(msg.sender, _to, _amount);

        // Transfer the specified amount of ETH to the specified address
        _transferEth(_to, _amount);
    }

    /// @notice Gets fee estimate for full request fulfillment
    /// @param _callbackGasLimit The gas limit for the client's callback function
    /// @return esimateFee The estimated fee required for full request fulfillment
    /// @dev If your users pay for random requests, use this in your contract to calculate how much ETH a user should attach.
    function estimateFee(uint256 _callbackGasLimit) public view returns (uint256 esimateFee) {
        return
            ((s.gasEstimates[Constants.GKEY_TOTAL_SUBMIT] +
                _callbackGasLimit +
                ((s.gasEstimates[Constants.GKEY_GAS_PER_BEACON_SELECT] * (s.beacons.length - 1)) * 3)) *
                LibNetwork._gasPrice()) + (s.configUints[Constants.CKEY_BEACON_FEE] * 5);
    }

    /// @notice Gets fee estimate for full request fulfillment using a manual gas price
    /// @param _callbackGasLimit The gas limit for the client's callback function
    /// @param _gasPrice The gas price used for request fulfillment
    /// @return esimateFee The estimated fee required for full request fulfillment
    /// @dev If your users pay for random requests, use this in your contract to calculate how much ETH a user should attach.
    function estimateFeeUsingGasPrice(uint256 _callbackGasLimit, uint256 _gasPrice)
        external
        view
        returns (uint256)
    {
        return
            ((s.gasEstimates[Constants.GKEY_TOTAL_SUBMIT] +
                _callbackGasLimit +
                ((s.gasEstimates[Constants.GKEY_GAS_PER_BEACON_SELECT] * (s.beacons.length - 1)) * 3)) *
                _gasPrice) + (s.configUints[Constants.CKEY_BEACON_FEE] * 5);
    }

    /// @notice Requests a callback with a random value that has been validated with on-chain VRF
    /// @param _callbackGasLimit The gas limit for the callback function of the request
    /// @return id The request ID
    function request(uint256 _callbackGasLimit) external returns (uint256 id) {
        return _request(_callbackGasLimit, s.configUints[Constants.CKEY_MIN_CONFIRMATIONS]);
    }

    function request(uint256 _callbackGasLimit, uint256 _confirmations) external returns (uint256 id) {
        if (
            _confirmations > s.configUints[Constants.CKEY_MAX_CONFIRMATIONS] ||
            _confirmations < s.configUints[Constants.CKEY_MIN_CONFIRMATIONS]
        )
            revert MinConfirmationsOOB(
                _confirmations,
                s.configUints[Constants.CKEY_MIN_CONFIRMATIONS],
                s.configUints[Constants.CKEY_MAX_CONFIRMATIONS]
            );

        return _request(_callbackGasLimit, _confirmations);
    }

    function _request(uint256 _callbackGasLimit, uint256 _confirmations) private returns (uint256 id) {
        // Check if the callback gas limit is within the allowed range
        uint256 requestMinGasLimit = s.configUints[Constants.CKEY_REQUEST_MIN_GAS_LIMIT];
        uint256 requestMaxGasLimit = s.configUints[Constants.CKEY_REQUEST_MAX_GAS_LIMIT];
        if (_callbackGasLimit < requestMinGasLimit || _callbackGasLimit > requestMaxGasLimit)
            revert CallbackGasLimitOOB(_callbackGasLimit, requestMinGasLimit, requestMaxGasLimit);

        // Calculate the estimated fee for the request
        uint256 _estimateFee = estimateFee(_callbackGasLimit);

        // Check if the client has enough ETH deposited to cover the estimated fee
        if (
            s.ethDeposit[msg.sender] < s.ethReserved[msg.sender] ||
            _estimateFee > (s.ethDeposit[msg.sender] - s.ethReserved[msg.sender])
        ) revert EthDepositTooLow(s.ethDeposit[msg.sender], s.ethReserved[msg.sender], _estimateFee);

        // Increase the client's reserved ETH by the estimated fee
        s.ethReserved[msg.sender] += _estimateFee;

        // Increment the latest request ID and store it in the `id` variable
        s.latestRequestId++;
        id = s.latestRequestId;

        // Create a data structure to store the request data
        SRandomUintData memory data = SRandomUintData({
            ethReserved: _estimateFee,
            beaconFee: s.configUints[Constants.CKEY_BEACON_FEE],
            height: LibNetwork._blockNumber(),
            timestamp: block.timestamp,
            expirationBlocks: s.configUints[Constants.CKEY_EXPIRATION_BLOCKS],
            expirationSeconds: s.configUints[Constants.CKEY_EXPIRATION_SECONDS],
            callbackGasLimit: _callbackGasLimit,
            minConfirmations: _confirmations
        });

        // Generate the request using the request data
        _generateRequest(id, msg.sender, data);

        return id;
    }
}
