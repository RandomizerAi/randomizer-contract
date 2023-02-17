// SPDX-License-Identifier: BUSL-1.1
/// @title Randomizer Admin Functions
/// @author Dean van Dugteren (https://github.com/deanpress)
/// @notice Administrative functions, variables, and constants used by Randomizer.

pragma solidity ^0.8.18;
import {LibDiamond} from "../libraries/LibDiamond.sol";
import "../shared/Structs.sol";
import "../libraries/Constants.sol";
import "../libraries/Events.sol";
import "../AppStorage.sol";

contract AdminFacet {
    AppStorage internal s;

    /* Errors */
    error Unauthorized();
    error NoProposedSequencer();

    /* Events */
    event SequencerProposed(address indexed currentSequencer, address indexed newSequencer);
    event ProposeSequencerCanceled(address indexed proposedSequencer, address indexed currentSequencer);
    event UpdateGasConfig(uint256 indexed key, uint256 oldValue, uint256 newValue);
    event UpdateContractConfig(uint256 indexed key, uint256 oldValue, uint256 newValue);

    /* Functions */
    /// @notice Returns the current treasury address
    function treasury() external view returns (address treasury_) {
        treasury_ = s.treasury;
    }

    /// @notice Returns the current sequencer address
    function sequencer() external view returns (address sequencer_) {
        sequencer_ = s.sequencer;
    }

    /// @notice Returns the address of the proposed sequencer
    function proposedSequencer() external view returns (address proposedSequencer_) {
        proposedSequencer_ = s.proposedSequencer;
    }

    /// @notice Returns the value of a contract configuration key
    function configUint(uint256 key) external view returns (uint256) {
        return s.configUints[key];
    }

    /// @notice Returns the list of uint256 config values
    function configUints() external view returns (uint256[48] memory) {
        return s.configUints;
    }

    /// @notice Returns the value of a gas estimate key
    function gasEstimate(uint256 key) external view returns (uint256) {
        return s.gasEstimates[key];
    }

    /// @notice Returns all gas estimate values
    function gasEstimates() external view returns (uint256[16] memory) {
        return s.gasEstimates;
    }

    /// @notice The sequencer can propose a new address to be the sequencer.
    function proposeSequencer(address _proposed) external {
        if (msg.sender != s.sequencer) revert Unauthorized();
        s.proposedSequencer = _proposed;
        emit SequencerProposed(s.sequencer, _proposed);
    }

    /// @notice The proposed sequencer can accept the role.
    function acceptSequencer() external {
        if (msg.sender != s.proposedSequencer) revert Unauthorized();
        emit Events.TransferSequencer(s.sequencer, msg.sender);
        s.sequencer = msg.sender;
        s.proposedSequencer = address(0);
    }

    /// @notice The current or proposed sequencer can cancel the new sequencer proposal.
    function cancelProposeSequencer() external {
        if (msg.sender != s.sequencer && msg.sender != s.proposedSequencer) revert Unauthorized();
        if (s.proposedSequencer == address(0)) revert NoProposedSequencer();
        emit ProposeSequencerCanceled(s.proposedSequencer, s.sequencer);
        s.proposedSequencer = address(0);
    }

    /// @notice Set the contract's treasury address
    function setTreasury(address _treasury) external {
        LibDiamond.enforceIsContractOwner();
        emit Events.SetTreasury(s.treasury, _treasury);
        s.treasury = _treasury;
    }

    /// @notice Set the value of a contract configuration
    function setConfigUint(uint256 _key, uint256 _value) external {
        LibDiamond.enforceIsContractOwner();
        emit UpdateContractConfig(_key, s.configUints[_key], _value);
        s.configUints[_key] = _value;
    }

    /// @notice Batch set the values of contract configurations
    function batchSetConfigUints(uint256[] calldata _keys, uint256[] calldata _values) external {
        LibDiamond.enforceIsContractOwner();
        for (uint256 i = 0; i < _keys.length; i++) {
            s.configUints[_keys[i]] = _values[i];
            emit UpdateContractConfig(_keys[i], s.configUints[_keys[i]], _values[i]);
        }
    }

    /// @notice Set the value of a gas estimate
    function setGasEstimate(uint256 _key, uint256 _value) external {
        LibDiamond.enforceIsContractOwner();
        emit UpdateGasConfig(_key, s.gasEstimates[_key], _value);
        s.gasEstimates[_key] = _value;
    }

    /// @notice Batch set the values of gas estimates
    function batchSetGasEstimates(uint256[] calldata _keys, uint256[] calldata _values) external {
        LibDiamond.enforceIsContractOwner();
        for (uint256 i = 0; i < _keys.length; i++) {
            s.gasEstimates[_keys[i]] = _values[i];
            emit UpdateGasConfig(_keys[i], s.gasEstimates[_keys[i]], _values[i]);
        }
    }
}
