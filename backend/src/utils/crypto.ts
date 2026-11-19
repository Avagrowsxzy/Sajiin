import crypto from 'crypto';
import { env } from '../config/env.js';

// Kunci enkripsi harus 32 byte (256 bit).
// Jika format hex (64 char), kita parse hex buffer, jika raw string kita potong/pad ke 32 byte
function getEncryptionKey(): Buffer {
  const rawKey = env.FIELD_ENCRYPTION_KEY;
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }
  return crypto.scryptSync(rawKey, 'foodorder_salt', 32);
}

const ENCRYPTION_KEY = getEncryptionKey();
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV standar untuk GCM

/**
 * Enkripsi kolom level aplikasi (DATABASE.md bagian 11)
 * Format simpan: base64(iv):base64(ciphertext):base64(authTag)
 */
export function encryptField(plainText: string | null | undefined): string | null {
  if (plainText === null || plainText === undefined || plainText === '') {
    return null;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${encrypted.toString('base64')}:${authTag.toString('base64')}`;
}

/**
 * Dekripsi kolom level aplikasi
 */
export function decryptField(encryptedText: string | null | undefined): string | null {
  if (!encryptedText) {
    return null;
  }

  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Format teks terenkripsi tidak valid');
  }

  const [ivB64, ciphertextB64, authTagB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

const SCRYPT_N = 1 << 14;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEY_LENGTH, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: 64 * 1024 * 1024,
    }, (error, key) => error ? reject(error) : resolve(key));
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    const [algorithm, n, r, p, saltText, digestText] = hash.split('$');
    if (algorithm !== 'scrypt' || !n || !r || !p || !saltText || !digestText) return false;
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(digestText, 'base64url');
    const actual = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(plain, salt, expected.length, {
        N: Number(n),
        r: Number(r),
        p: Number(p),
        maxmem: 64 * 1024 * 1024,
      }, (error, key) => error ? reject(error) : resolve(key));
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * SHA-256 hash untuk refresh token (DATABASE.md tabel refresh_tokens)
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('62')) return digits;
  return digits;
}

export function hashPhone(phone: string): string {
  return crypto.createHmac('sha256', env.FIELD_ENCRYPTION_KEY).update(normalizePhone(phone)).digest('hex');
}

/**
 * Buat random secure token
 */
export function generateRandomToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of input.toUpperCase().replace(/=+$/, '')) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function verifyTotp(secret: string, code: string, window = 1): boolean {
  const key = base32Decode(secret);
  const normalized = code.replace(/\D/g, '');
  const now = Math.floor(Date.now() / 1000 / 30);
  for (let offset = -window; offset <= window; offset += 1) {
    const counter = Buffer.alloc(8);
    counter.writeBigInt64BE(BigInt(now + offset));
    const digest = crypto.createHmac('sha1', key).update(counter).digest();
    const position = digest[digest.length - 1] & 15;
    const value = (digest.readUInt32BE(position) & 0x7fffffff) % 1000000;
    if (value.toString().padStart(6, '0') === normalized) return true;
  }
  return false;
}

export function generateTotp(secret: string, timestamp = Date.now()): string {
  const key = base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigInt64BE(BigInt(Math.floor(timestamp / 1000 / 30)));
  const digest = crypto.createHmac('sha1', key).update(counter).digest();
  const position = digest[digest.length - 1] & 15;
  const value = (digest.readUInt32BE(position) & 0x7fffffff) % 1000000;
  return value.toString().padStart(6, '0');
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

export function signToken(payload: object, secret: string, expiresInSeconds: number): string {
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiresInSeconds };
  const encoded = `${base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64Url(JSON.stringify(body))}`;
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyToken<T>(token: string, secret: string): T {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [header, payload, signature] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('Invalid signature');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T & { exp?: number };
  if (decoded.exp && decoded.exp <= Math.floor(Date.now() / 1000)) {
    const error = new Error('Token expired');
    error.name = 'TokenExpiredError';
    throw error;
  }
  return decoded;
}

export function validatePasswordPolicy(
  password: string,
  role: 'user' | 'admin' | 'kasir' = 'user'
): string | null {
  const minLength = role === 'admin' || role === 'kasir' ? 15 : 8;
  if (password.length < minLength) {
    return `Password minimal ${minLength} karakter`;
  }
  if (password.length > 128) {
    return 'Password maksimal 128 karakter';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password wajib mengandung huruf besar (A-Z)';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password wajib mengandung huruf kecil (a-z)';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password wajib mengandung angka (0-9)';
  }
  if (!/[^A-Za-z0-9\s]/.test(password)) {
    return 'Password wajib mengandung simbol (contoh: !@#$%^&*)';
  }
  return null;
}

// ponytail: hashes all 3 normalized recovery answers into a single scrypt digest; split to per-question hashes only if partial-match UX is ever requested
export function normalizeSecurityAnswers(answers: [string, string, string]): string {
  return answers.map((a) => a.trim().toLowerCase().replace(/\s+/g, ' ')).join('\0');
}

const FRIENDLY_WORDS = ['Sajiin', 'Kuliner', 'Santapan', 'Sedapkan', 'Rasanya', 'Warisan', 'Nikmat', 'Dapuran'];
const FRIENDLY_SYMBOLS = ['!', '#', '@', '$'];

// ponytail: human-friendly temporary password [Word][2-digit][Symbol]; upgrade to custom wordlist if requested
export function generateHumanFriendlyPassword(): string {
  const word = FRIENDLY_WORDS[crypto.randomInt(0, FRIENDLY_WORDS.length)];
  const num = crypto.randomInt(10, 100);
  const sym = FRIENDLY_SYMBOLS[crypto.randomInt(0, FRIENDLY_SYMBOLS.length)];
  return `${word}${num}${sym}`;
}

