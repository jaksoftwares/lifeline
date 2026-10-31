import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotp,
  generateTotpSecret,
  hotp,
  timeStep,
  verifyTotp,
} from './totp';

// RFC 6238 Appendix B, SHA-1 key "12345678901234567890", 8 digits.
const RFC_KEY = Buffer.from('12345678901234567890', 'ascii');
const RFC_VECTORS: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('hotp', () => {
  it.each(RFC_VECTORS)('matches RFC 6238 at T=%i', (seconds, expected) => {
    expect(hotp(RFC_KEY, Math.floor(seconds / 30), 8)).toBe(expected);
  });
});

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const data = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 17]);
    expect(base32Decode(base32Encode(data))).toEqual(data);
  });

  it('encodes the RFC 4648 example', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
  });
});

describe('verifyTotp', () => {
  const secret = generateTotpSecret();
  const now = 1_800_000_000_000;
  const step = timeStep(now);

  it('accepts the current code and returns its step', () => {
    expect(verifyTotp(secret, generateTotp(secret, step), { nowMs: now })).toBe(step);
  });

  it('tolerates one step of clock drift either way', () => {
    expect(verifyTotp(secret, generateTotp(secret, step - 1), { nowMs: now })).toBe(step - 1);
    expect(verifyTotp(secret, generateTotp(secret, step + 1), { nowMs: now })).toBe(step + 1);
    expect(verifyTotp(secret, generateTotp(secret, step + 2), { nowMs: now })).toBeNull();
  });

  it('rejects a code that was already used', () => {
    expect(
      verifyTotp(secret, generateTotp(secret, step), { nowMs: now, lastUsedStep: step }),
    ).toBeNull();
  });

  it('rejects wrong codes', () => {
    const wrong = generateTotp(secret, step) === '000000' ? '000001' : '000000';
    expect(verifyTotp(secret, wrong, { nowMs: now })).toBeNull();
  });
});
