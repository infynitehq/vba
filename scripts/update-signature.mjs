import { createHash, createPublicKey, verify } from 'node:crypto';

const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
const utf8 = new TextDecoder('utf-8', { fatal: true });

function base64(value, label) {
  if (typeof value !== 'string' || !value.length)
    throw new Error(`Missing ${label}`);
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value)
    throw new Error(`Invalid base64 in ${label}`);
  return decoded;
}

function textLines(encoded, label) {
  const text = utf8.decode(base64(encoded, label));
  // Accept one final line ending, but not extra lines or whitespace in packets.
  return text.replace(/\r?\n$/, '').split(/\r?\n/);
}

export function decodePublicKey(publicKey) {
  const lines = textLines(publicKey?.trim(), 'DESKTOP_UPDATE_PUBLIC_KEY');
  const packet = base64(lines[1], 'public key packet');
  if (
    lines.length !== 2 ||
    !lines[0].startsWith('untrusted comment: minisign public key') ||
    packet.length !== 42 ||
    !['Ed', 'ED'].includes(packet.subarray(0, 2).toString())
  )
    throw new Error('Invalid Tauri/minisign public key');
  return {
    keyId: packet.subarray(2, 10),
    key: createPublicKey({
      key: Buffer.concat([spkiPrefix, packet.subarray(10)]),
      format: 'der',
      type: 'spki',
    }),
  };
}

function decodeSignature(signature) {
  const encoded = signature.trim();
  const lines = textLines(encoded, 'updater signature');
  const packet = base64(lines[1], 'signature packet');
  const globalSignature = base64(lines[3], 'global signature');
  const algorithm = packet.subarray(0, 2).toString();
  if (
    lines.length !== 4 ||
    !lines[0].startsWith('untrusted comment: ') ||
    !['Ed', 'ED'].includes(algorithm) ||
    packet.length !== 74 ||
    !lines[2].startsWith('trusted comment: ') ||
    globalSignature.length !== 64
  )
    throw new Error('Invalid Tauri updater signature format');
  return {
    encoded,
    algorithm,
    keyId: packet.subarray(2, 10),
    signature: packet.subarray(10),
    trustedComment: lines[2].slice('trusted comment: '.length),
    globalSignature,
  };
}

function checkVersion(trustedComment, version) {
  const versions = trustedComment
    .split('\t')
    .filter((field) => field.startsWith('version:'))
    .map((field) => field.slice('version:'.length));
  if (versions.length !== 1 || !versions[0])
    throw new Error('Updater signature must have exactly one signed version');
  if (versions[0].replace(/^v/, '') !== version)
    throw new Error(
      'Updater signature signed version does not match release version',
    );
}

export function validateSignatureVersion(signature, version) {
  const decoded = decodeSignature(signature);
  checkVersion(decoded.trustedComment, version);
  return decoded.encoded;
}

// Matches minisign-verify 0.3 PublicKey::verify / verify_ed25519, also used by
// tauri-plugin-updater 2.14.1. ED signs BLAKE2b-512(data); legacy Ed signs data.
// The global signature signs the raw 64-byte payload signature concatenated with
// UTF-8 trusted-comment bytes, WITHOUT the "trusted comment: " line prefix.
export function verifyUpdateSignature(data, signature, publicKey, version) {
  const decoded = decodeSignature(signature);
  const signer = decodePublicKey(publicKey);
  if (!decoded.keyId.equals(signer.keyId))
    throw new Error('Updater signature public key ID mismatch');
  const message =
    decoded.algorithm === 'ED'
      ? createHash('blake2b512').update(data).digest()
      : data;
  if (!verify(null, message, signer.key, decoded.signature))
    throw new Error('Updater artifact signature verification failed');
  const globalMessage = Buffer.concat([
    decoded.signature,
    Buffer.from(decoded.trustedComment, 'utf8'),
  ]);
  if (!verify(null, globalMessage, signer.key, decoded.globalSignature))
    throw new Error('Updater trusted comment signature verification failed');
  // Only trust the version field AFTER authenticating both signatures.
  checkVersion(decoded.trustedComment, version);
  return decoded.encoded;
}
