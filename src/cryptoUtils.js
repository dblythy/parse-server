/* @flow */

import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'crypto';

// Returns a new random hex string of the given even size.
export function randomHexString(size: number): string {
  if (size === 0) {
    throw new Error('Zero-length randomHexString is useless.');
  }
  if (size % 2 !== 0) {
    throw new Error('randomHexString size must be divisible by 2.');
  }
  return randomBytes(size / 2).toString('hex');
}

// Returns a new random alphanumeric string of the given size.
//
// Note: to simplify implementation, the result has slight modulo bias,
// because chars length of 62 doesn't divide the number of all bytes
// (256) evenly. Such bias is acceptable for most cases when the output
// length is long enough and doesn't need to be uniform.
export function randomString(size: number): string {
  if (size === 0) {
    throw new Error('Zero-length randomString is useless.');
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + 'abcdefghijklmnopqrstuvwxyz' + '0123456789';
  let objectId = '';
  const bytes = randomBytes(size);
  for (let i = 0; i < bytes.length; ++i) {
    objectId += chars[bytes.readUInt8(i) % chars.length];
  }
  return objectId;
}

// Returns a new random alphanumeric string suitable for object ID.
export function newObjectId(size: number = 10): string {
  return randomString(size);
}

// Returns a new random hex string suitable for secure tokens.
export function newToken(): string {
  return randomHexString(32);
}

export function md5Hash(string: string): string {
  return createHash('md5').update(string).digest('hex');
}

export function encrypt(string: string, encryptionKey: string): string {
  try {
    const algorithm = 'aes-256-gcm';
    const encryption = createHash('sha256')
      .update(String(encryptionKey))
      .digest('base64')
      .substr(0, 32);
    const iv = randomBytes(16);
    const cipher = createCipheriv(algorithm, encryption, iv);
    const encryptedResult = Buffer.concat([
      cipher.update(Buffer.from(string)),
      cipher.final(),
      iv,
      cipher.getAuthTag(),
    ]);
    return encryptedResult.toString('base64');
  } catch (e) {
    throw 'Could not encrypt string.';
  }
}
export async function decrypt(string: string, encryptionKey: string) {
  try {
    const algorithm = 'aes-256-gcm';
    const encryption = createHash('sha256')
      .update(String(encryptionKey))
      .digest('base64')
      .substr(0, 32);
    const data = Buffer.from(string, 'base64');
    const authTagLocation = data.length - 16;
    const ivLocation = data.length - 32;
    const authTag = data.slice(authTagLocation);
    const iv = data.slice(ivLocation, authTagLocation);
    const encrypted = data.slice(0, ivLocation);
    const decipher = createDecipheriv(algorithm, encryption, iv);
    decipher.setAuthTag(authTag);
    return await new Promise((resolve, reject) => {
      let decrypted = '';
      decipher.on('readable', chunk => {
        while (null !== (chunk = decipher.read()) && chunk) {
          decrypted += chunk.toString();
        }
      });
      decipher.on('end', () => {
        resolve(decrypted);
      });
      decipher.on('error', e => {
        reject(e);
      });
      decipher.write(encrypted);
      decipher.end();
    });
  } catch (err) {
    throw 'Could not decrypt string.';
  }
}
