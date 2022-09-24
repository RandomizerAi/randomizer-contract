const ecvrf = require('vrf-ts-256')
const elliptic = require('elliptic');
const EC = new elliptic.ec('secp256k1');

let vrfContract;
let randomizer;
const init = (vrfLibContract, randomizerContract) => {
  vrfContract = vrfLibContract;
  randomizer = randomizerContract;
}

const _checkVrfConfigured = () => {
  if (!vrfContract) {
    throw new Error('VRF contract not configured');
  }
}

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

const getVrfData = async (privateKey, seed) => {
  _checkVrfConfigured();
  const message = ethers.utils.arrayify(seed);
  const proof = prove(privateKey, message);
  const publicKeys = getVrfPublicKeys(privateKey);
  const params = await vrfContract.computeFastVerifyParams(
    publicKeys,
    proof,
    message
  );

  return { publicKeys, proof, params };
};

const parseRequest = (receipt) => {
  return { ...randomizer.interface.parseLog(receipt.logs[0]).args.request, id: randomizer.interface.parseLog(receipt.logs[0]).args.id };
}

const getSubmitData = async (privateKey, request) => {
  const vrf = await getVrfData(privateKey, request.seed);
  const rawUints = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit];
  const uints = rawUints.concat(vrf.proof, vrf.params[0], vrf.params[1]);
  const addresses = [request.client].concat(request.beacons);

  return { addresses, uints, rawUints, vrf };
}

// Export functions
module.exports = {
  init,
  getVrfPublicKeys,
  prove,
  getVrfData,
  getSubmitData,
  parseRequest
}