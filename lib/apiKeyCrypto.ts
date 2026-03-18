import { createHash, randomBytes, createCipheriv, createDecipheriv } from "crypto";

function getKey(): Buffer {
  const secret = process.env.STORE_API_KEY_ENCRYPTION_SECRET ?? "";
  if (!secret) {
    throw new Error("Missing STORE_API_KEY_ENCRYPTION_SECRET");
  }
  // Derive a 32-byte key deterministically from secret (sha256).
  return createHash("sha256").update(secret).digest();
}

/** AES-256-GCM encrypt. Returns base64 of iv|ciphertext|tag. */
export function encryptApiKey(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plain, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]).toString("base64");
}

export function decryptApiKey(payloadB64: string): string {
  const raw = Buffer.from(payloadB64, "base64");
  if (raw.length < 12 + 16) throw new Error("Invalid encrypted key payload");
  const key = getKey();
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(raw.length - 16);
  const ciphertext = raw.subarray(12, raw.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

