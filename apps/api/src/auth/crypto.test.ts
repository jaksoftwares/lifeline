import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './crypto';

describe('secret encryption', () => {
  const key = randomBytes(32);

  it('round-trips and never repeats ciphertext', () => {
    const a = encryptSecret('JBSWY3DPEHPK3PXP', key);
    const b = encryptSecret('JBSWY3DPEHPK3PXP', key);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, key)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('rejects tampered ciphertext', () => {
    const parts = encryptSecret('secret', key).split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), key)).toThrow();
  });

  it('rejects the wrong key', () => {
    expect(() => decryptSecret(encryptSecret('secret', key), randomBytes(32))).toThrow();
  });
});
