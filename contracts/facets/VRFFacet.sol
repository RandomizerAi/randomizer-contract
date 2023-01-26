// SPDX-License-Identifier: MIT

import "../libraries/LibVRF.sol";

contract VRFFacet {
    /// @notice Verifies a VRF proof
    /// @param _publicKey public key in the VRF
    /// @param _proof VRF proof
    /// @param _message message that was used to generate the VRF
    /// @return bool indicating whether the proof is valid
    function verify(
        uint256[2] memory _publicKey,
        uint256[4] memory _proof, //pi
        bytes memory _message //alpha
    ) external pure returns (bool) {
        return LibVRF.verify(_publicKey, _proof, _message);
    }

    /// @notice Fast verification of a VRF proof
    /// @param _publicKey public key in the VRF
    /// @param _proof VRF proof
    /// @param _message message that was used to generate the VRF
    /// @param _uPoint point on the elliptic curve used for fast verification
    /// @param _vComponents components of the point used for fast verification
    /// @return bool indicating whether the proof is valid
    function fastVerify(
        uint256[2] memory _publicKey, //Y-x, Y-y
        uint256[4] memory _proof, //pi, which is D, a.k.a. gamma-x, gamma-y, c, s
        bytes memory _message, //alpha string
        uint256[2] memory _uPoint, //U-x, U-y
        uint256[4] memory _vComponents //s*H -x, s*H -y, c*Gamma -x, c*Gamma -y
    ) external pure returns (bool) {
        return LibVRF.fastVerify(_publicKey, _proof, _message, _uPoint, _vComponents);
    }

    /// @notice Converts the gamma point in the VRF to a bytes32 hash
    /// @param _gammaX x-coordinate of the gamma point
    /// @param _gammaY y-coordinate of the gamma point
    /// @return bytes32 hash of the gamma point
    function gammaToHash(uint256 _gammaX, uint256 _gammaY) external pure returns (bytes32) {
        return LibVRF.gammaToHash(_gammaX, _gammaY);
    }

    /// @notice Computes the parameters needed for fast verification of a VRF proof
    /// @param _publicKey public key in the VRF
    /// @param _proof VRF proof
    /// @param _message message that was used to generate the VRF
    /// @return point on the elliptic curve and components of the point used for fast verification
    function computeFastVerifyParams(
        uint256[2] memory _publicKey,
        uint256[4] memory _proof,
        bytes memory _message
    ) external pure returns (uint256[2] memory, uint256[4] memory) {
        return LibVRF.computeFastVerifyParams(_publicKey, _proof, _message);
    }
}
