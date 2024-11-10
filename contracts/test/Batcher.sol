// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable2Step.sol";

interface RequesterInterface {
    function randomizerCallback(uint256 id, bytes32 result) external;
}

interface Randomizer {
    function request(uint256 callbackGas) external returns (uint256 id);
}

abstract contract RandomizerCoordinator is Ownable {
    // Struct for individual requests
    struct Request {
        address requester;
        uint256 id;
    }

    struct RequestDetails {
        uint256 window;
        uint256 batch;
    }

    // Maximum requests in a batch
    uint256 constant BATCH_SIZE = 10;

    // Global counter for unique IDs
    uint256 public currentId = 0;

    // Mapping to store the latest 3-second window for which the randomizer was triggered
    uint256 public lastTriggeredWindow;

    // Callback gas limit for randomizer requests
    uint256 public callbackGasLimit = 5000000;

    // Batched Requests
    mapping(uint256 timeWindow => mapping(uint256 batch => Request[] request)) public batchedRequests;

    // Mapping to store which window and batch a randomizer's request ID corresponds to
    mapping(uint256 randomizerId => RequestDetails) public requestIdToDetails;

    // Current batch number for each 3-second window
    mapping(uint256 timeWindow => uint256 batchNumber) public currentBatchNumber;

    // List of contract addresses allowed to call coordinator request
    mapping(address => bool isAllowed) public canSenderRequest;

    // Randomizer.AI address
    Randomizer public randomizer;

    // Events
    event NewRequest(address indexed requester, uint256 id, uint256 window, uint256 batch);
    event RandomizerCalled(uint256 id, uint256 window, uint256 batch);
    event CallbackProcessed(bytes32 result, uint256 window, uint256 batch);
    event SenderAllowed(address sender);
    event SenderDisallowed(address sender);
    event CallbackGasLimitChanged(uint256 callbackGasLimit);

    modifier onlyRandomizer() {
        require(msg.sender == address(randomizer), "Only Randomizer can call this function");
        _;
    }

    constructor(address _randomizer) {
        randomizer = Randomizer(_randomizer);
    }

    function allowSender(address sender) external onlyOwner {
        canSenderRequest[sender] = true;
        emit SenderAllowed(sender);
    }

    function disallowSender(address sender) external onlyOwner {
        delete canSenderRequest[sender];
        emit SenderDisallowed(sender);
    }

    function setCallbackGasLimit(uint256 _callbackGasLimit) external onlyOwner {
        callbackGasLimit = _callbackGasLimit;
        emit CallbackGasLimitChanged(_callbackGasLimit);
    }

    // Request function
    // Currently the callbackGas input does not do anything.
    // You could add each request's callbackGas to the batch so you can use the exact gas limit
    // when making the real Randomizer request, but that would require additional storage writes for each request to the coordinator.
    // It costs less per request if you know the maximum callback gas limit beforehand (your most expensive callback function * BATCH_SIZE).
    function request(uint256 callbackGas) external returns (uint256) {
        // Ensure the sender is allowed to make a request
        require(canSenderRequest[msg.sender], "Not allowed sender");

        // Get the current window and generate a unique request ID
        uint256 currentWindow = _getCurrentWindow();
        uint256 requestId = _generateUniqueId();

        // Get the current batch for the window
        uint256 currentBatch = _getCurrentBatch(currentWindow);

        // If the batch number for the previous window is 0 (i.e., no requests were made in the previous window)
        // and the current window is not the same as the last triggered window
        if (currentBatchNumber[currentWindow - 1] == 0 && currentWindow != lastTriggeredWindow) {
            // Check if there are any pending requests in the last batch of the previous window
            if (batchedRequests[lastTriggeredWindow][_getCurrentBatch(lastTriggeredWindow)].length > 0) {
                // If there are pending requests, make a request to the Randomizer contract
                uint256 randomizerRequestId = randomizer.request(callbackGasLimit);

                // Store the details of the Randomizer request
                requestIdToDetails[randomizerRequestId] = RequestDetails({
                    window: lastTriggeredWindow,
                    batch: _getCurrentBatch(lastTriggeredWindow)
                });

                // Emit an event to indicate that the Randomizer was called
                emit RandomizerCalled(requestId, lastTriggeredWindow, _getCurrentBatch(lastTriggeredWindow));
            }

            // Make a request to the Randomizer contract for the current request
            uint256 randomizerRequestId = randomizer.request(callbackGasLimit);

            // Store the details of the Randomizer request
            requestIdToDetails[randomizerRequestId] = RequestDetails({
                window: currentWindow,
                batch: currentBatch
            });

            // Update the last triggered window to the current window
            lastTriggeredWindow = currentWindow;

            // Add the request to the current batch
            _addRequestToBatch(currentWindow, currentBatch, requestId, msg.sender);

            // Emit an event to indicate that the Randomizer was called
            emit RandomizerCalled(requestId, currentWindow, currentBatch);

            // Increment the batch number for the current window
            ++currentBatchNumber[currentWindow];
        } else {
            // If the current window is not new or there were requests in the previous window, add the request to the current batch
            _addRequestToBatch(currentWindow, currentBatch, requestId, msg.sender);
        }

        // Check if the current window is different from the last triggered window or if the current batch is full
        Request[] memory memBatchedRequests = batchedRequests[currentWindow][currentBatch];
        uint256 memBatchedRequestsLen = memBatchedRequests.length;
        if (currentWindow != lastTriggeredWindow || memBatchedRequestsLen == BATCH_SIZE) {
            // If the current window is new or the batch is full, and there are pending requests in the last batch of the last triggered window
            if (batchedRequests[lastTriggeredWindow][_getCurrentBatch(lastTriggeredWindow)].length > 0) {
                // Make a request to the Randomizer contract
                uint256 randomizerRequestId = randomizer.request(callbackGasLimit);

                // Store the details of the Randomizer request
                requestIdToDetails[randomizerRequestId] = RequestDetails({
                    window: currentWindow,
                    batch: currentBatch
                });

                // If the current window is not the same as the last triggered window, update the last triggered window
                if (lastTriggeredWindow != currentWindow) lastTriggeredWindow = currentWindow;

                // If the batch is full, increment the batch number for the current window
                if (memBatchedRequestsLen == BATCH_SIZE) {
                    unchecked {
                        ++currentBatchNumber[currentWindow];
                    }
                }

                // Emit an event to indicate that the Randomizer was called
                emit RandomizerCalled(requestId, currentWindow, currentBatch);
            }
        }

        // Return the unique request ID
        return requestId;
    }

    // Only owner can trigger a randomizer request for the latest batch
    function triggerRequest() external onlyOwner {
        uint256 latestWindow = lastTriggeredWindow;
        uint256 latestBatch = _getCurrentBatch(latestWindow);

        require(batchedRequests[latestWindow][latestBatch].length > 0, "No requests in batch");

        // Make a request to the Randomizer contract
        uint256 randomizerRequestId = randomizer.request(callbackGasLimit);

        // Store the details of the Randomizer request
        requestIdToDetails[randomizerRequestId] = RequestDetails({window: latestWindow, batch: latestBatch});

        // Emit an event to indicate that the Randomizer was called
        emit RandomizerCalled(randomizerRequestId, latestWindow, latestBatch);

        // Update the batch number for the latest window
        unchecked {
            ++currentBatchNumber[latestWindow];
        }
    }

    // Callback function from randomizer
    function randomizerCallback(uint256 id, bytes32 result) external onlyRandomizer {
        RequestDetails memory details = requestIdToDetails[id];
        Request[] memory requests = batchedRequests[details.window][details.batch];
        uint256 requestsLen = requests.length;

        for (uint256 i = 0; i < requestsLen; i++) {
            RequesterInterface(requests[i].requester).randomizerCallback(
                requests[i].id,
                keccak256(abi.encodePacked(result, i))
            );
        }

        delete batchedRequests[details.window][details.batch];
        delete requestIdToDetails[id]; // Clean up to free storage
        emit CallbackProcessed(result, details.window, details.batch);
    }

    // Utility function to get the current 3-second window
    function _getCurrentWindow() private view returns (uint256) {
        unchecked {
            return block.timestamp / 3;
        }
    }

    // Utility function to get the current batch for a given window
    function _getCurrentBatch(uint256 window) private view returns (uint256) {
        unchecked {
            uint256 batch = currentBatchNumber[window];
            if (batch == 0) {
                return ++batch;
            }
            return batch;
        }
    }

    // Utility function to generate a unique ID
    function _generateUniqueId() private returns (uint256) {
        unchecked {
            return ++currentId;
        }
    }

    // Helper function to add a request to a batch and emit a NewRequest event
    function _addRequestToBatch(
        uint256 currentWindow,
        uint256 currentBatch,
        uint256 requestId,
        address requester
    ) private {
        batchedRequests[currentWindow][currentBatch].push(Request({requester: requester, id: requestId}));
        emit NewRequest(requester, requestId, currentWindow, currentBatch);
    }
}
