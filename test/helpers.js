const ecvrf = require('vrf-ts-256')

const getVrfPublicKeys = (privateKey) => {
  const keypair = ecvrf.keygen(privateKey);
  return [keypair.public_key.x.toString(), keypair.public_key.y.toString()];
}

const prove = (privateKey, message) => {
  const keypair = ecvrf.keygen(privateKey);
  const proof = ecvrf.prove(keypair.secret_key, message);
  return [proof.decoded.gammaX.toString(), proof.decoded.gammaY.toString(), proof.decoded.c.toString(), proof.decoded.s.toString()];
}

// Export functions
module.exports = {
  getVrfPublicKeys,
  prove
}