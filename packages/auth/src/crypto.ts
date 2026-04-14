import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

const SCRYPT_PREFIX = "scrypt";

export const hashSessionToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

export const generateSessionToken = (): string => randomBytes(32).toString("base64url");

export const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${SCRYPT_PREFIX}$${salt}$${hash}`;
};

const safeCompare = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
};

export const verifyPassword = (password: string, passwordHash: string): boolean => {
  const [prefix, salt, hash] = passwordHash.split("$");
  if (prefix === SCRYPT_PREFIX && salt && hash) {
    const candidateHash = scryptSync(password, salt, 64).toString("hex");
    return safeCompare(candidateHash, hash);
  }

  // Backward-compatible fallback for legacy/dev seeds that might still store plain values.
  return safeCompare(password, passwordHash);
};
