module.exports = {
  mocha: {
    grep: "@skip-on-coverage", // Find everything with this tag
    invert: true,               // Run the grep's inverse set.
    skipFiles: ["lib/EllipticCurve.sol", "lib/Internals.sol", "lib/Structs.sol", "lib/VRF.sol"]
  }
}