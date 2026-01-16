/**
 * Runtime-agnostic Crypto Utilities
 * Uses Web Crypto API (works in Node.js, Deno, Bun, Cloudflare Workers)
 */

/**
 * Generate cryptographically secure random bytes as hex string
 */
export function generateRandomHex(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate cryptographically secure random bytes as base64url string
 */
export function generateRandomBase64Url(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * Generate a random integer between min (inclusive) and max (exclusive)
 * Uses rejection sampling for uniform distribution
 */
export function randomInt(min: number, max: number): number {
  const range = max - min;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8) || 1;
  const maxValid = Math.floor(256 ** bytesNeeded / range) * range;

  let value: number;
  const bytes = new Uint8Array(bytesNeeded);

  do {
    crypto.getRandomValues(bytes);
    value = bytes.reduce((acc, byte, i) => acc + byte * 256 ** i, 0);
  } while (value >= maxValid);

  return min + (value % range);
}

/**
 * Hash data using SHA-256 and return as hex string
 */
export async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash data using SHA-256 and return as Uint8Array
 */
export async function sha256(data: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  return new Uint8Array(hashBuffer);
}

/**
 * Timing-safe comparison of two strings
 * Prevents timing attacks by always comparing all bytes
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to maintain constant time
    b = a;
  }

  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);

  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i]! ^ bBytes[i]!;
  }

  return result === 0 && a.length === b.length;
}

/**
 * Timing-safe comparison of two Uint8Arrays
 */
export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i]! ^ b[i]!;
  }

  return result === 0;
}

/**
 * Derive a key using PBKDF2
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations = 100000,
  keyLength = 32
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    keyLength * 8
  );

  return new Uint8Array(derivedBits);
}

/**
 * Base64URL encode (URL-safe base64 without padding)
 */
export function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64URL decode
 */
export function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const paddedBase64 = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(paddedBase64);
  return new Uint8Array([...binary].map((char) => char.charCodeAt(0)));
}

/**
 * Hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = hex.match(/.{2}/g);
  if (!bytes) return new Uint8Array(0);
  return new Uint8Array(bytes.map((byte) => parseInt(byte, 16)));
}

/**
 * Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
