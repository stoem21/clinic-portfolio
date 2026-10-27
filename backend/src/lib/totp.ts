import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';

export function isTotpFeatureEnabled(): boolean {
  return process.env.TOTP_ENABLED !== 'false';
}

// ---------------------------------------------------------------------------
// Base32 (RFC 4648, no padding required for TOTP URIs)
// ---------------------------------------------------------------------------

const B32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let out = '';
  let bits = 0;
  let val = 0;
  for (const byte of buf) {
    val = (val << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32_CHARS[(val >>> bits) & 31];
    }
  }
  if (bits > 0) out += B32_CHARS[(val << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '');
  const bytes: number[] = [];
  let bits = 0;
  let val = 0;
  for (const ch of clean) {
    const idx = B32_CHARS.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid base32 character: ${ch}`);
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((val >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------------------
// HOTP / TOTP (RFC 4226 / RFC 6238)
// ---------------------------------------------------------------------------

function hotp(key: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  const hi = Math.floor(counter / 0x100000000);
  const lo = counter >>> 0;
  buf.writeUInt32BE(hi, 0);
  buf.writeUInt32BE(lo, 4);
  const mac = createHmac('sha1', key).update(buf).digest();
  const offset = mac[mac.length - 1] & 0xf;
  const code =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export function verifyTotpCode(secretBase32: string, code: string, window = 1): boolean {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const clean = code.replace(/\s/g, '');
  for (let i = -window; i <= window; i++) {
    const expected = hotp(key, counter + i);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return true;
  }
  return false;
}

export function totpUri(username: string, secretBase32: string): string {
  const issuer = 'Dental Clinic';
  const label = encodeURIComponent(`${issuer}:${username}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export async function generateQrDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, { width: 240, margin: 1 });
}

// ---------------------------------------------------------------------------
// Backup codes — 10 × 8 unambiguous uppercase alphanumeric chars
// ---------------------------------------------------------------------------

const BACKUP_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit O/0/I/1

export function generateBackupCodes(): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  for (let i = 0; i < 10; i++) {
    const b = randomBytes(8);
    plain.push(Array.from(b).map((x) => BACKUP_CHARS[x % BACKUP_CHARS.length]).join(''));
  }
  const hashed = plain.map((c) => bcrypt.hashSync(c, 10));
  return { plain, hashed };
}

export async function matchBackupCode(code: string, hashes: string[]): Promise<number> {
  const normalized = code.replace(/[-\s]/g, '').toUpperCase();
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(normalized, hashes[i])) return i;
  }
  return -1;
}
