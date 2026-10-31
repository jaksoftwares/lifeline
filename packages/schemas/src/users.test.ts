import { describe, expect, it } from 'vitest';
import { loginSchema } from './auth';
import { createUserSchema, kenyanPhoneSchema } from './users';

describe('kenyanPhoneSchema', () => {
  it('accepts Safaricom/Airtel style mobile numbers in international format', () => {
    expect(kenyanPhoneSchema.safeParse('+254712345678').success).toBe(true);
    expect(kenyanPhoneSchema.safeParse('+254112345678').success).toBe(true);
  });

  it('rejects local format and other countries', () => {
    expect(kenyanPhoneSchema.safeParse('0712345678').success).toBe(false);
    expect(kenyanPhoneSchema.safeParse('+255712345678').success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('normalises email case and whitespace', () => {
    expect(loginSchema.parse({ email: '  Nurse@Example.org ', password: 'x' }).email).toBe(
      'nurse@example.org',
    );
  });
});

describe('createUserSchema', () => {
  it('rejects short temporary passwords', () => {
    const result = createUserSchema.safeParse({
      fullName: 'Amina Otieno',
      email: 'amina@example.org',
      temporaryPassword: 'short',
      membership: { networkId: 'n', institutionId: 'i', role: 'REFERRING_CLINICIAN' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown roles', () => {
    const result = createUserSchema.safeParse({
      fullName: 'Amina Otieno',
      email: 'amina@example.org',
      temporaryPassword: 'a-long-enough-password',
      membership: { networkId: 'n', institutionId: 'i', role: 'SUPERUSER' },
    });
    expect(result.success).toBe(false);
  });
});
