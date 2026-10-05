import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCHEME = 'scrypt';
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// Cost parameters are baked into the stored value's scheme name, so raising them
// later only affects newly created hashes.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

export const MIN_PASSWORD_LENGTH = 8;

/** `scrypt$<salt>$<hash>`, both binary parts base64. */
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const hash = scryptSync(normalise(plain), salt, KEY_LENGTH, SCRYPT_PARAMS);
  return `${SCHEME}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function isHashedPassword(stored: string): boolean {
  return stored.startsWith(`${SCHEME}$`);
}

/**
 * Verifies against a stored hash. A legacy plaintext value is compared directly
 * so accounts created before hashing still work; `isLegacyPlaintextPassword`
 * lets the caller re-hash it on the way through.
 */
export function verifyPassword(plain: string, stored: string): boolean {
  if (!plain || !stored) return false;

  if (!isHashedPassword(stored)) {
    return constantTimeEquals(normalise(plain), stored);
  }

  const parts = stored.split('$');
  if (parts.length !== 3) return false;

  const salt = Buffer.from(parts[1], 'base64');
  const expected = Buffer.from(parts[2], 'base64');
  if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) return false;

  const actual = scryptSync(normalise(plain), salt, KEY_LENGTH, SCRYPT_PARAMS);
  return timingSafeEqual(actual, expected);
}

export function isLegacyPlaintextPassword(stored: string): boolean {
  return stored !== '' && !isHashedPassword(stored);
}

export function validatePasswordStrength(password: string | undefined): string | null {
  if (!password) return 'Choose a password.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

function normalise(value: string): string {
  return value.normalize('NFKC');
}

function constantTimeEquals(a: string, b: string): boolean {
  // Hashing first gives both sides a fixed length, so timingSafeEqual cannot
  // throw on a length mismatch and cannot leak the length either.
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}