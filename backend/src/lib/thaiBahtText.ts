// Converts a currency amount into Thai baht-in-words, e.g. 105400 →
// "หนึ่งแสนห้าพันสี่ร้อยบาทถ้วน" — the standard reading used on Thai receipts.

const DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
// Index = place within a 6-digit group: 0=units, 1=tens, 2=hundreds, 3=thousands,
// 4=ten-thousands, 5=hundred-thousands. Units/tens are handled specially below.
const PLACE = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

// Reads a 0-999999 group. `hasHigher` is true when there's a nonzero part above
// this group (a preceding million-group from readInteger's recursion) — combined
// with any nonzero digit already seen within this group, it forces the "เอ็ด"
// reading for a units digit of 1 (e.g. "สิบเอ็ด", "ล้านเอ็ด") instead of "หนึ่ง"
// (used only when the digit stands fully alone, e.g. plain "1").
function readGroup(n: number, hasHigher: boolean): string {
  if (n === 0) return '';
  const digits = String(n).padStart(6, '0').split('').map(Number);
  let out = '';
  let seenNonZero = false;
  for (let i = 0; i < 6; i++) {
    const place = 5 - i;
    const d = digits[i];
    if (d === 0) continue;
    if (place === 1) {
      out += d === 1 ? 'สิบ' : d === 2 ? 'ยี่สิบ' : DIGITS[d] + 'สิบ';
    } else if (place === 0) {
      out += d === 1 && (seenNonZero || hasHigher) ? 'เอ็ด' : DIGITS[d];
    } else {
      out += DIGITS[d] + PLACE[place];
    }
    seenNonZero = true;
  }
  return out;
}

// Handles arbitrary size via recursion in groups of 6 digits ("ล้าน" = 10^6).
function readInteger(n: number): string {
  if (n === 0) return DIGITS[0];
  if (n >= 1_000_000) {
    const millions = Math.floor(n / 1_000_000);
    const rest = n % 1_000_000;
    return readInteger(millions) + 'ล้าน' + readGroup(rest, true);
  }
  return readGroup(n, false);
}

export function thaiBahtText(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const baht = Math.floor(rounded);
  const satang = Math.round((rounded - baht) * 100);
  const bahtText = readInteger(baht);
  if (satang === 0) return `${bahtText}บาทถ้วน`;
  return `${bahtText}บาท${readGroup(satang, false)}สตางค์`;
}
