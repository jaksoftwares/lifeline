import { hash, verify } from '@node-rs/argon2';

// Argon2id (the library default) with OWASP's minimum recommended parameters.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password).catch(() => false);
}

let placeholderHash: Promise<string> | undefined;

/** Spend the same time as a real check when the account doesn't exist, so timing doesn't reveal registered emails. */
export async function spendPasswordCheck(password: string): Promise<void> {
  placeholderHash ??= hashPassword('placeholder-password-for-timing');
  await verifyPassword(await placeholderHash, password);
}
