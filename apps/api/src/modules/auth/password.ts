import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const keyLength = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32);
  const hash = (await scrypt(password, salt, keyLength)) as Buffer;
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (
    !saltHex ||
    !hashHex ||
    !/^[a-f0-9]{64}$/.test(saltHex) ||
    !/^[a-f0-9]{128}$/.test(hashHex)
  )
    return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = (await scrypt(
    password,
    Buffer.from(saltHex, 'hex'),
    keyLength,
  )) as Buffer;
  return timingSafeEqual(actual, expected);
}
