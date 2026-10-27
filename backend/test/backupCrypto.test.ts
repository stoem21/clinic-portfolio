import { describe, it, expect, beforeEach } from 'vitest';
import {
  encrypt,
  decrypt,
  isEncryptionEnabled,
  isEncryptedName,
  ENC_SUFFIX,
} from '../src/lib/backupCrypto';

describe('backupCrypto', () => {
  beforeEach(() => {
    process.env.BACKUP_ENCRYPTION_KEY = 'test-passphrase-1234567890';
  });

  it('round-trips encrypt -> decrypt', () => {
    const plain = Buffer.from('-- PostgreSQL database dump — patient data', 'utf8');
    const blob = encrypt(plain);
    expect(blob.equals(plain)).toBe(false); // ciphertext != plaintext
    expect(blob.subarray(0, 4).toString()).toBe('CBK1'); // magic header
    expect(decrypt(blob).equals(plain)).toBe(true); // restores the original
  });

  it('uses a fresh salt/iv each run (same input -> different ciphertext)', () => {
    const plain = Buffer.from('same input');
    expect(encrypt(plain).equals(encrypt(plain))).toBe(false);
  });

  it('fails to decrypt with the wrong key', () => {
    const blob = encrypt(Buffer.from('secret'));
    process.env.BACKUP_ENCRYPTION_KEY = 'a-different-passphrase';
    expect(() => decrypt(blob)).toThrow();
  });

  it('fails on tampered ciphertext (GCM auth)', () => {
    const blob = encrypt(Buffer.from('secret'));
    blob[blob.length - 1] ^= 0xff; // flip a ciphertext byte
    expect(() => decrypt(blob)).toThrow();
  });

  it('isEncryptionEnabled reflects the env var', () => {
    expect(isEncryptionEnabled()).toBe(true);
    delete process.env.BACKUP_ENCRYPTION_KEY;
    expect(isEncryptionEnabled()).toBe(false);
  });

  it('isEncryptedName detects the .enc suffix', () => {
    expect(isEncryptedName(`clinic_2026-06-23.sql.gz${ENC_SUFFIX}`)).toBe(true);
    expect(isEncryptedName('clinic_2026-06-23.sql.gz')).toBe(false);
  });
});
