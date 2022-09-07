const ecvrf = require('vrf-ts-256')
const elliptic = require('elliptic');
const EC = new elliptic.ec('secp256k1');

const genKeys = (privateKey) => {
  const keypair = EC.keyFromPrivate(privateKey);
  const secret_key = keypair.getPrivate('hex');
  const public_key = keypair.getPublic('hex');
  return {
    secret_key,
    public_key: {
      key: public_key,
      compressed: keypair.getPublic(true, 'hex'),
      x: keypair.getPublic().getX(),
      y: keypair.getPublic().getY()
    }
  };
}

const getVrfPublicKeys = (privateKey) => {
  const keypair = genKeys(privateKey);
  return [keypair.public_key.x.toString(), keypair.public_key.y.toString()];
}

const prove = (privateKey, message) => {
  const keypair = genKeys(privateKey);
  const proof = ecvrf.prove(keypair.secret_key, message);
  return [proof.decoded.gammaX.toString(), proof.decoded.gammaY.toString(), proof.decoded.c.toString(), proof.decoded.s.toString()];
}

// Export functions
module.exports = {
  getVrfPublicKeys,
  prove
}