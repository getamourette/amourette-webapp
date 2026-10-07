const { constants, createCipheriv, createDecipheriv, publicEncrypt, privateDecrypt, randomBytes } = require('node:crypto');
const MAGIC = Buffer.from('AMOUREC1');
const WRAPPED_KEY_BYTES = 512;
const HEADER_BYTES = MAGIC.length + WRAPPED_KEY_BYTES + 12 + 16;

function protect(archive, publicKey) {
  const key = randomBytes(32);
  try {
    const wrapped = publicEncrypt({ key: publicKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING }, key);
    if (wrapped.length !== WRAPPED_KEY_BYTES) throw new Error('Recovery requires a 4096-bit recipient key.');
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.concat([MAGIC, wrapped]));
    const ciphertext = Buffer.concat([cipher.update(archive), cipher.final()]);
    return Buffer.concat([MAGIC, wrapped, nonce, cipher.getAuthTag(), ciphertext]);
  } finally { key.fill(0); }
}

function unprotect(envelope, privateKey) {
  if (envelope.length < HEADER_BYTES || !envelope.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Invalid recovery envelope.');
  const endKey = MAGIC.length + WRAPPED_KEY_BYTES;
  const key = privateDecrypt({ key: privateKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING }, envelope.subarray(MAGIC.length, endKey));
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, envelope.subarray(endKey, endKey + 12));
    decipher.setAAD(envelope.subarray(0, endKey));
    decipher.setAuthTag(envelope.subarray(endKey + 12, HEADER_BYTES));
    return Buffer.concat([decipher.update(envelope.subarray(HEADER_BYTES)), decipher.final()]);
  } finally { key.fill(0); }
}
module.exports = { protect, unprotect };
