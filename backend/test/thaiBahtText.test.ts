import { describe, it, expect } from 'vitest';
import { thaiBahtText } from '../src/lib/thaiBahtText';

describe('thaiBahtText', () => {
  it('matches real documented receipt amounts', () => {
    // From rcp.docx — real historical receipts, not invented expectations.
    expect(thaiBahtText(105400)).toBe('หนึ่งแสนห้าพันสี่ร้อยบาทถ้วน');
    expect(thaiBahtText(71000)).toBe('เจ็ดหมื่นหนึ่งพันบาทถ้วน');
    expect(thaiBahtText(60570)).toBe('หกหมื่นห้าร้อยเจ็ดสิบบาทถ้วน');
  });

  it('reads a lone 1 as หนึ่ง, not เอ็ด', () => {
    expect(thaiBahtText(1)).toBe('หนึ่งบาทถ้วน');
  });

  it('reads a trailing 1 as เอ็ด when preceded by another digit', () => {
    expect(thaiBahtText(11)).toBe('สิบเอ็ดบาทถ้วน');
    expect(thaiBahtText(21)).toBe('ยี่สิบเอ็ดบาทถ้วน');
    expect(thaiBahtText(101)).toBe('หนึ่งร้อยเอ็ดบาทถ้วน');
  });

  it('reads 20 as ยี่สิบ, not สองสิบ', () => {
    expect(thaiBahtText(20)).toBe('ยี่สิบบาทถ้วน');
  });

  it('handles zero', () => {
    expect(thaiBahtText(0)).toBe('ศูนย์บาทถ้วน');
  });

  it('handles exact hundreds/thousands with no trailing digits', () => {
    expect(thaiBahtText(100)).toBe('หนึ่งร้อยบาทถ้วน');
    expect(thaiBahtText(1000)).toBe('หนึ่งพันบาทถ้วน');
  });

  it('chains ล้าน across the million boundary, including เอ็ด', () => {
    expect(thaiBahtText(1000000)).toBe('หนึ่งล้านบาทถ้วน');
    expect(thaiBahtText(1000001)).toBe('หนึ่งล้านเอ็ดบาทถ้วน');
  });

  it('reads satang when the amount has a non-zero decimal part', () => {
    expect(thaiBahtText(105400.5)).toBe('หนึ่งแสนห้าพันสี่ร้อยบาทห้าสิบสตางค์');
  });
});
