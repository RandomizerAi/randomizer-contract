const ecvrf = require('vrf-ts-256')
const elliptic = require('elliptic');
const EC = new elliptic.ec('secp256k1');

let randomizer; // contract instance for randomizer

// initialize contract instances
const init = (randomizerContract) => {
  randomizer = randomizerContract;
}


// generate VRF key pair
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

// get VRF public keys from private key
const getVrfPublicKeys = (privateKey) => {
  const keypair = genKeys(privateKey);
  return [keypair.public_key.x.toString(), keypair.public_key.y.toString()];
}

// generate VRF proof
const prove = (privateKey, message) => {
  const keypair = genKeys(privateKey);
  const proof = ecvrf.prove(keypair.secret_key, message);
  return [proof.decoded.gammaX.toString(), proof.decoded.gammaY.toString(), proof.decoded.c.toString(), proof.decoded.s.toString()];
}

// convert VRF proof to hash
const gammaToHash = async (gammaX, gammaY) => {
  return await randomizer.gammaToHash(gammaX, gammaY);
}
// get VRF data
const getVrfData = async (privateKey, seed) => {
  const message = ethers.utils.arrayify(seed);
  const proof = prove(privateKey, message);
  const publicKeys = getVrfPublicKeys(privateKey);

  const params = await randomizer.computeFastVerifyParams(
    publicKeys,
    proof,
    message
  );

  return { publicKeys, proof, params };
};

// parse request from receipt
const parseRequest = (receipt) => {
  return {
    ...randomizer.interface.parseLog(receipt.logs[0]).args.request,
    id: randomizer.interface.parseLog(receipt.logs[0]).args.id,
    height: receipt.logs[0].blockNumber
  };
}

const getSubmitData = async (privateKey, request) => {
  // get VRF data from private key and seed
  const vrf = await getVrfData(privateKey, request.seed);

  // create array of raw uints from request data
  const rawUints = [request.id, request.ethReserved, request.beaconFee, request.height, request.timestamp, request.expirationBlocks, request.expirationSeconds, request.callbackGasLimit, request.minConfirmations];

  // concatenate VRF proof and params with raw uints
  const uints = rawUints.concat(vrf.proof, vrf.params[0], vrf.params[1]);

  // create array of addresses from request data
  const addresses = [request.client].concat(request.beacons);

  // return submit data
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