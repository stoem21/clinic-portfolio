import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Authenticated symmetric encryption for database backups, so the gzipped SQL
 * dumps stored in the cloud are useless without the passphrase.
 *
 * Scheme: AES-256-GCM with a key derived from BACKUP_ENCRYPTION_KEY via scrypt
 * (per-file random salt). File layout:
 *   [ magic "CBK1" (4) ][ salt (16) ][ iv (12) ][ authTag (16) ][ ciphertext ]
 *
 * GCM authenticates the data — decrypt() throws if the key is wrong or the file
 * was tampered with. The passphrase lives only in the server env (like
 * JWT_SECRET); this protects backups at rest in Drive/OneDrive, not against a
 * full server compromise.
 */
const MAGIC = Buffer.from('CBK1');
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN; // 48

function passphrase(): string {
  const key = process.env.BACKUP_ENCRYPTION_KEY;
  if (!key) throw new Error('BACKUP_ENCRYPTION_KEY is not set');
  return key;
}

/** Whether backup encryption is turned on (a passphrase is configured). */
export function isEncryptionEnabled(): boolean {
  return Boolean(process.env.BACKUP_ENCRYPTION_KEY);
}

/** Encrypted backups carry an extra .enc suffix so downloads know to decrypt. */
export const ENC_SUFFIX = '.enc';
export function isEncryptedName(name: string): boolean {
  return name.endsWith(ENC_SUFFIX);
}

export function encrypt(plain: Buffer): Buffer {
  const salt = randomBytes(SALT_LEN);
  const key = scryptSync(passphrase(), salt, 32);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, salt, iv, tag, ciphertext]);
}

export function decrypt(blob: Buffer): Buffer {
  if (blob.length < HEADER_LEN || !blob.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Not a valid encrypted backup');
  }
  let o = MAGIC.length;
  const salt = blob.subarray(o, (o += SALT_LEN));
  const iv = blob.subarray(o, (o += IV_LEN));
  const tag = blob.subarray(o, (o += TAG_LEN));
  const ciphertext = blob.subarray(o);
  const key = scryptSync(passphrase(), salt, 32);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  // Throws if the key is wrong or the data was tampered with (GCM auth).
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
