import bcrypt from 'bcryptjs';

const BCRYPT_PREFIX = /^\$2[aby]\$/;

/** Hash plain password for storage in users.password_hash */
export async function hashPassword(plain: string, saltRounds = 10): Promise<string> {
    return bcrypt.hash(plain, saltRounds);
}

/**
 * Verify login password against users.password_hash (bcrypt).
 * Supports legacy rows where password_hash was stored as plain text.
 */
export async function verifyPassword(plain: string, storedHash: string | null | undefined): Promise<boolean> {
    if (!plain || !storedHash) return false;

    if (BCRYPT_PREFIX.test(storedHash)) {
        return bcrypt.compare(plain, storedHash);
    }

    return plain === storedHash;
}
