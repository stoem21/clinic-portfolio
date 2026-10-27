import { afterEach, describe, expect, it } from "vitest";
import { extractSlip, suggestFields } from "../src/lib/slipExtraction";
const original = process.env.SLIP_OCR_PROVIDER;
afterEach(() => {
  if (original === undefined) delete process.env.SLIP_OCR_PROVIDER;
  else process.env.SLIP_OCR_PROVIDER = original;
});
describe("optional slip extraction", () => {
  it("does not invent values from unlabeled text", () => {
    expect(
      Object.values(suggestFields("123456 1234.50 xxx")).filter(Boolean),
    ).toEqual([]);
  });
  it("suggests labelled fields while leaving Buddhist/ambiguous dates for review", () => {
    const s = suggestFields(
      "จำนวนเงิน: 1,250.25\nผู้รับ: คลินิกทดสอบ\nวันที่: 18/09/2569\nเวลา: 14:30\nหมายเหตุ: ค่าเช่า\nเลขอ้างอิง: QA-123",
    );
    expect(s.amount).toBe("1250.25");
    expect(s.paidDate).toBeUndefined();
    expect(s.paidTime).toBe("14:30");
    expect(s.category).toBe("rent");
    expect(s.description).toBe("ค่าเช่า");
  });
  it("has honest disabled mode and no external transmission", async () => {
    process.env.SLIP_OCR_PROVIDER = "disabled";
    const result = await extractSlip(Buffer.from("image"));
    expect(result.status).toBe("unavailable");
    expect(result.suggestions).toEqual({});
    expect(result.bankVerified).toBe(false);
  });
});
