import { createHmac, randomBytes } from 'node:crypto';
import { safeEqual } from './crypto';

/** RFC 6238 TOTP (SHA-1, 6 digits, 30-second steps): the settings every common authenticator app supports. */
export const TOTP_PERIOD_SECONDS = 30;
const DIGITS = 6;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of data) {
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

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 4226 HOTP. */
export function hotp(key: Buffer, counter: number, digits = DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(message).digest();
  const offset = digest.readUInt8(digest.length - 1) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function timeStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

export function generateTotp(secretBase32: string, step: number): string {
  return hotp(base32Decode(secretBase32), step);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/**
 * Returns the matched time step, or null. Accepts one step either side for clock drift and rejects
 * any step at or before `lastUsedStep` so a code cannot be replayed.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  {
    nowMs = Date.now(),
    lastUsedStep = null,
    window = 1,
  }: { nowMs?: number; lastUsedStep?: number | null; window?: number } = {},
): number | null {
  const key = base32Decode(secretBase32);
  const current = timeStep(nowMs);
  for (let step = current - window; step <= current + window; step++) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    if (safeEqual(hotp(key, step), code)) return step;
  }
  return null;
}

export function otpauthUrl(secretBase32: string, accountName: string, issuer = 'Lifeline'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
