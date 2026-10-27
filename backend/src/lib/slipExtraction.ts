import { spawn } from "child_process";

export interface SlipSuggestions {
  amount?: string;
  paidDate?: string;
  paidTime?: string;
  recipient?: string;
  bank?: string;
  reference?: string;
  notes?: string;
  description?: string;
  category?: string;
}
export interface SlipExtraction {
  status: "available" | "unavailable" | "failed";
  suggestions: SlipSuggestions;
  text: string;
  message: string;
  bankVerified: false;
}
export interface SlipExtractor {
  extract(image: Buffer): Promise<SlipExtraction>;
}

/** Conservative labelled extraction only; no guessing of unlabeled numbers. */
export function suggestFields(raw: string): SlipSuggestions {
  const s: SlipSuggestions = {};
  const amount = raw
    .match(/(?:จำนวนเงิน|ยอดโอน|amount)\s*[:：]?\s*([\d,]+\.\d{2})/i)?.[1]
    ?.replace(/,/g, "");
  if (amount && /^\d{1,10}\.\d{2}$/.test(amount)) s.amount = amount;
  const field = (label: string) =>
    raw
      .match(new RegExp(`(?:${label})\\s*[:：]\\s*([^\\n]+)`, "i"))?.[1]
      ?.trim();
  s.recipient = field("ผู้รับ|recipient");
  s.bank = field("ธนาคาร|bank");
  s.reference = field("เลขที่รายการ|เลขอ้างอิง|reference");
  s.notes = field("บันทึกช่วยจำ|หมายเหตุ|memo|note");
  if (s.notes) {
    s.description = s.notes;
    s.category = /เช่า|rent/i.test(s.notes)
      ? "rent"
      : /ไฟฟ้า|ประปา|electric|water/i.test(s.notes)
        ? "utilities"
        : /วัสดุ|suppl/i.test(s.notes)
          ? "supplies"
          : "other";
  }
  // Only explicitly labelled ISO dates, not ambiguous Thai/Buddhist OCR dates.
  const date = field("วันที่|date")?.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (
    date &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
  )
    s.paidDate = date;
  const time = field("เวลา|time")?.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/)?.[0];
  if (time) s.paidTime = time;
  return s;
}
let activeExtractions = 0;
const local: SlipExtractor = {
  extract(image) {
    if (activeExtractions >= 2)
      return Promise.resolve({
        status: "unavailable",
        suggestions: {},
        text: "",
        message:
          "OCR กำลังทำงานเต็มจำนวน กรุณากรอกเองหรืออัปโหลดอีกครั้งภายหลัง",
        bankVerified: false,
      });
    activeExtractions++;
    return new Promise((resolve) => {
      const child = spawn(
        process.env.TESSERACT_BIN || "tesseract",
        ["stdin", "stdout", "-l", "tha+eng"],
        { stdio: ["pipe", "pipe", "ignore"] },
      );
      let raw = "",
        settled = false;
      const finish = (success: boolean) => {
        if (settled) return;
        settled = true;
        activeExtractions--;
        clearTimeout(timer);
        resolve({
          status: success ? "available" : "failed",
          suggestions: success ? suggestFields(raw) : {},
          text: success ? raw : "",
          message: success
            ? "ข้อมูล OCR ต้องตรวจสอบทุกช่อง ไม่ใช่การยืนยันจากธนาคาร"
            : "อ่านรูปไม่ได้ กรอกข้อมูลเองได้และยังเก็บหลักฐานไว้",
          bankVerified: false,
        });
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(false);
      }, 20000);
      child.stdout.on("data", (b: Buffer) => {
        raw += b.toString();
        if (raw.length > 50000) {
          child.kill();
          finish(false);
        }
      });
      child.on("error", () => finish(false));
      child.on("close", (code) => finish(code === 0));
      child.stdin.on("error", () => finish(false));
      child.stdin.end(image);
    });
  },
};
export async function extractSlip(image: Buffer): Promise<SlipExtraction> {
  if (process.env.SLIP_OCR_PROVIDER === "tesseract")
    return local.extract(image);
  return {
    status: "unavailable",
    suggestions: {},
    text: "",
    message: "ยังไม่เปิด OCR กรุณากรอกเอง รูปถูกเก็บเป็นหลักฐานเท่านั้น",
    bankVerified: false,
  };
}
