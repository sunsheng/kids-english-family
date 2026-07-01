import crypto from "crypto";

const HASH_PREFIX = "pbkdf2";

export function verifyPassword(password: string, storedHash: string) {
  const [prefix, iterationsValue, salt, hash] = storedHash.split("$");

  if (prefix !== HASH_PREFIX || !iterationsValue || !salt || !hash) {
    return false;
  }

  const iterations = Number(iterationsValue);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  const derivedHash = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derivedHash, "hex"));
}
