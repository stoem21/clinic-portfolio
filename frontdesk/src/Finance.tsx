import { apiUrl, API_HEADERS, appLink } from '../../frontend/src/lib/publicConfig';
import { useEffect, useState } from "react";
import {
  api,
  requestId,
  today,
  currency,
  dateLabel,
  type Patient,
} from "./api";
import { Empty, Field, Modal } from "./ui";
type Expense = {
  id: string;
  kind: string;
  companyId: string | null;
  description: string;
  category: string;
  amount: string;
  paidDate: string;
  recipient: string;
  reference: string | null;
  evidenceId: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  lines: { id: string; description: string; amount: string }[];
};
type Job = {
  id: string;
  type: string;
  cost: string | null;
  jobDate: string;
  patient: Patient;
  sourceRecordId: string;
  payment: Expense | null;
  paidAmount: string | null;
};
type Group = {
  companyId: string | null;
  name: string;
  total: string;
  paid: string;
  outstanding: string;
  unknownCosts: number;
  items: Job[];
};
const labels: Record<string, string> = {
  amount: "จำนวนเงิน",
  paidDate: "วันที่จ่าย",
  paidTime: "เวลาจ่าย",
  recipient: "ผู้รับเงิน",
  bank: "ธนาคาร",
  reference: "เลขอ้างอิง",
  description: "รายละเอียด",
  category: "หมวดหมู่",
  notes: "หมายเหตุ",
};
const categories: Record<string, string> = {
  supplies: "วัสดุสิ้นเปลือง",
  rent: "ค่าเช่า",
  utilities: "สาธารณูปโภค",
  other: "อื่น ๆ",
  lab: "ค่าแล็บ",
};
type Upload = {
  id: string;
  duplicate: boolean;
  extraction: {
    status: string;
    message: string;
    text: string;
    suggestions: Record<string, string | undefined>;
  };
};
async function showEvidence(id: string) {
  const response = await fetch(apiUrl(`/api/ops/evidence/${id}`), {
    headers: {
      ...API_HEADERS,
      Authorization: `Bearer ${sessionStorage.getItem("ops.access") || ""}`,
    },
  });
  if (!response.ok) throw new Error("ไม่สามารถเปิดหลักฐาน กรุณาโหลดใหม่");
  const url = URL.createObjectURL(await response.blob());
  return url;
}
export function Finance({
  mode,
  permissions,
}: {
  mode: "lab" | "expenses";
  permissions: string[];
}) {
  const [from, setFrom] = useState(today().slice(0, 7) + "-01"),
    [to, setTo] = useState(today()),
    [basis, setBasis] = useState("job"),
    [company, setCompany] = useState(""),
    [status, setStatus] = useState(""),
    [groups, setGroups] = useState<Group[]>([]),
    [expenses, setExpenses] = useState<{ total: string; rows: Expense[] }>({
      total: "0",
      rows: [],
    }),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false),
    [view, setView] = useState<string | null>(null),
    [attach, setAttach] = useState<Expense | null>(null),
    [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const canPay = permissions.includes("labs.pay"),
    canExpense = permissions.includes("expenses.manage");
  async function load() {
    setBusy(true);
    setError("");
    try {
      if (mode === "lab")
        setGroups(
          await api<Group[]>(
            `/lab-jobs?${new URLSearchParams({ from, to, basis, companyId: company, status })}`,
          ),
        );
      else
        setExpenses(
          await api(`/expenses?${new URLSearchParams({ from, to })}`),
        );
      setSelected([]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [mode, from, to, basis, company, status]);
  useEffect(() => {
    api<{ companies: { id: string; name: string }[] }>("/reference")
      .then((r) => setCompanies(r.companies))
      .catch(() => {});
  }, []);
  useEffect(
    () => () => {
      if (view) URL.revokeObjectURL(view);
    },
    [view],
  );
  return (
    <>
      <div className="pagehead">
        <div>
          <p className="eyebrow">
            CLINIC FINANCE / {mode === "lab" ? "LABORATORIES" : "EXPENSES"}
          </p>
          <h1>{mode === "lab" ? "ชำระเงินบริษัทแล็บ" : "ค่าใช้จ่ายคลินิก"}</h1>
          <p>
            {mode === "lab"
              ? "การจ่ายของคลินิกแยกจากสถานะจ่ายของทันตแพทย์"
              : "รวมค่าแล็บเพียงครั้งเดียว · ไม่รวมรายการที่ยกเลิก"}
          </p>
        </div>
        {(mode === "lab" ? canPay : canExpense) && (
          <button
            disabled={mode === "lab" && !selected.length}
            onClick={() => setOpen(true)}
          >
            {mode === "lab"
              ? `ชำระงานที่เลือก (${selected.length})`
              : "＋ บันทึกค่าใช้จ่าย"}
          </button>
        )}
      </div>
      <div className="filters">
        <Field label="จากวันที่">
          <input
            type="date"
            value={from}
            max={today()}
            onChange={(e) => { if (e.target.value <= today()) setFrom(e.target.value); }}
          />
        </Field>
        <Field label="ถึงวันที่">
          <input
            type="date"
            value={to}
            max={today()}
            onChange={(e) => { if (e.target.value <= today()) setTo(e.target.value); }}
          />
        </Field>
        {mode === "lab" ? (
          <>
            <Field label="ชนิดวันที่ที่กรอง">
              <select value={basis} onChange={(e) => setBasis(e.target.value)}>
                <option value="job">วันที่เกิดงาน</option>
                <option value="payment">วันที่จ่าย (เฉพาะที่จ่ายแล้ว)</option>
              </select>
            </Field>
            <Field label="บริษัทแล็บ">
              <select
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              >
                <option value="">ทุกบริษัท / ไม่ระบุ</option>
                {companies.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="สถานะ">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">ทั้งหมด</option>
                <option value="paid">จ่ายแล้ว</option>
                <option value="unpaid">ยังไม่จ่าย</option>
              </select>
            </Field>
          </>
        ) : (
          <p>กรองตามวันที่จ่าย</p>
        )}
        <button className="secondary" onClick={() => void load()}>
          โหลดใหม่
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {busy ? (
        <Empty>กำลังโหลด…</Empty>
      ) : mode === "lab" ? (
        <>
          {!groups.length && <Empty />}
          {groups.map((g) => (
            <section className="panel" key={g.companyId || "none"}>
              <h2>{g.name}</h2>
              <div className="metrics">
                <span>
                  มูลค่างาน (ใช้ยอด ณ วันจ่าย){" "}
                  <strong>{currency(g.total)}</strong>
                </span>
                <span>
                  จ่ายแล้ว (ยอด ณ วันจ่าย) <strong>{currency(g.paid)}</strong>
                </span>
                <span>
                  ค้างชำระที่ทราบราคา <strong>{currency(g.outstanding)}</strong>
                </span>
              </div>
              {g.unknownCosts > 0 && (
                <p className="notice">
                  มี {g.unknownCosts} งานที่ยังไม่ทราบราคา
                  ไม่รวมในยอดและไม่สามารถจ่ายได้
                </p>
              )}
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>เลือก</th>
                      <th>วันที่เกิดงาน / คนไข้</th>
                      <th>ประเภท</th>
                      <th>ราคา</th>
                      <th>การจ่ายคลินิก</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((j) => (
                      <tr key={j.id}>
                        <td>
                          <input
                            aria-label={`เลือกงาน ${j.patient.hn}`}
                            type="checkbox"
                            checked={selected.includes(j.id)}
                            disabled={
                              !canPay ||
                              !!j.payment ||
                              !g.companyId ||
                              !j.cost ||
                              Number(j.cost) <= 0
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                const other = groups.some(
                                  (x) =>
                                    x.companyId !== g.companyId &&
                                    x.items.some((i) =>
                                      selected.includes(i.id),
                                    ),
                                );
                                if (other) {
                                  setError(
                                    "เลือกได้ครั้งละบริษัท กรุณายกเลิกการเลือกบริษัทเดิมก่อน",
                                  );
                                  return;
                                }
                                setSelected([...selected, j.id]);
                              } else
                                setSelected(
                                  selected.filter((id) => id !== j.id),
                                );
                            }}
                          />
                        </td>
                        <td>
                          {dateLabel(j.jobDate)}
                          <br />
                          {j.patient.hn} · {j.patient.firstName}{" "}
                          {j.patient.lastName}
                          <br />
                          <a
                            href={appLink(`/clients/${j.patient.id}`)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            ประวัติคนไข้ในระบบหลัก
                          </a>
                          <br />
                          <small>
                            งาน: {j.id} · บันทึกรักษา: {j.sourceRecordId}
                          </small>
                          <br />
                          <a href={appLink('/lab-work')} target="_blank" rel="noreferrer">
                            จัดการบริษัทแล็บในระบบหลัก
                          </a>
                        </td>
                        <td>{j.type}</td>
                        <td>{currency(j.cost)}</td>
                        <td>
                          {j.payment
                            ? `จ่ายแล้ว ${dateLabel(j.payment.paidDate)} · ${currency(j.paidAmount)}`
                            : "ยังไม่จ่าย"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      ) : (
        <>
          <div className="total">
            ค่าใช้จ่ายรวม <strong>{currency(expenses.total)}</strong>
          </div>
          {!expenses.rows.length && <Empty />}
          <div className="cards">
            {expenses.rows.map((x) => (
              <article className="patient-card" key={x.id}>
                <span className="badge">{categories[x.category]}</span>
                <h3>{x.description}</h3>
                <strong>{currency(x.amount)}</strong>
                <p>
                  {dateLabel(x.paidDate)} · {x.recipient}
                </p>
                {x.reference && <p>อ้างอิง: {x.reference}</p>}
                {x.voidedAt && <p className="error">ยกเลิก: {x.voidReason}</p>}
                {x.lines.map((l) => (
                  <p key={l.id}>
                    {l.description} · {currency(l.amount)}
                  </p>
                ))}
                <div className="actions">
                  {x.evidenceId ? (
                    <button
                      className="secondary"
                      onClick={async () => {
                        try {
                          setView(await showEvidence(x.evidenceId!));
                        } catch (e) {
                          setError(String(e));
                        }
                      }}
                    >
                      ดูหลักฐาน
                    </button>
                  ) : (
                    !x.voidedAt &&
                    (x.kind === "lab" ? canPay : canExpense) && (
                      <button
                        className="secondary"
                        onClick={() => setAttach(x)}
                      >
                        แนบหลักฐานภายหลัง
                      </button>
                    )
                  )}
                  {!x.voidedAt && permissions.includes("finance.reverse") && (
                    <button
                      className="danger"
                      onClick={async () => {
                        const reason = window.prompt(
                          "เหตุผลยกเลิกรายการ (ประวัติเดิมจะถูกเก็บไว้)",
                        );
                        if (!reason) return;
                        try {
                          await api(`/expenses/${x.id}/reverse`, "POST", {
                            reason,
                          });
                          await load();
                        } catch (e) {
                          setError(String(e));
                        }
                      }}
                    >
                      ยกเลิกรายการ
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {open && (
        <ExpenseForm
          companyId={
            groups.find((g) => g.items.some((j) => selected.includes(j.id)))
              ?.companyId
          }
          jobs={
            mode === "lab"
              ? groups
                  .flatMap((g) => g.items)
                  .filter((j) => selected.includes(j.id))
              : undefined
          }
          close={() => setOpen(false)}
          saved={() => {
            setOpen(false);
            void load();
          }}
        />
      )}
      {view && (
        <Modal
          title="หลักฐาน (ไม่ได้ยืนยันกับธนาคาร)"
          close={() => setView(null)}
        >
          <img className="slip" src={view} alt="หลักฐานการชำระเงิน" />
        </Modal>
      )}
      {attach && (
        <Modal
          title="แนบหลักฐาน ไม่สร้างค่าใช้จ่ายใหม่"
          close={() => setAttach(null)}
        >
          <p>
            {attach.description} · {currency(attach.amount)}
          </p>
          <input
            type="file"
            accept="image/png,image/jpeg"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              try {
                const u = await api<Upload>("/evidence", "POST", file);
                const acknowledgeDuplicate = u.duplicate
                  ? window.confirm("รูปนี้อาจซ้ำ ยืนยันแนบหลักฐานหรือไม่?")
                  : false;
                if (u.duplicate && !acknowledgeDuplicate) return;
                await api(`/expenses/${attach.id}/evidence`, "POST", {
                  evidenceId: u.id,
                  acknowledgeDuplicate,
                });
                setAttach(null);
                await load();
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          />
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
function ExpenseForm({
  jobs,
  companyId,
  close,
  saved,
}: {
  jobs?: Job[];
  companyId?: string | null;
  close: () => void;
  saved: () => void;
}) {
  const jobIds = jobs?.map((j) => j.id);
  const total = jobs?.reduce(
    (sum, j) =>
      sum +
      BigInt(j.cost!.split(".")[0]) * 100n +
      BigInt((j.cost!.split(".")[1] || "").padEnd(2, "0")),
    0n,
  );
  const [values, setValues] = useState<Record<string, string>>({
      amount: "",
      paidDate: today(),
      paidTime: "",
      recipient: "",
      bank: "",
      reference: "",
      description: jobIds ? "ชำระค่าแล็บ" : "",
      category: "other",
      notes: "",
    }),
    [reviewed, setReviewed] = useState(false),
    [ack, setAck] = useState(false),
    [upload, setUpload] = useState<Upload | null>(null),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [key] = useState(() => requestId());
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  return (
    <Modal
      title={jobIds ? "ยืนยันชำระค่าแล็บเต็มจำนวน" : "บันทึกค่าใช้จ่าย"}
      close={close}
    >
      {jobs && (
        <section className="notice">
          <h3>ตรวจสอบยอดก่อนชำระ</h3>
          {jobs.map((j) => (
            <p key={j.id}>
              {j.patient.hn} · {j.type} · {currency(j.cost)}
            </p>
          ))}
          <strong>
            รวม{" "}
            {total !== undefined
              ? `${total / 100n}.${String(total % 100n).padStart(2, "0")}`
              : ""}{" "}
            บาท
          </strong>
        </section>
      )}
      <p className="notice">
        ไม่จำเป็นต้องมีสลิป · ตรวจสอบและยืนยันก่อนบันทึก ·
        ไม่ใช่การตรวจสอบกับธนาคาร
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className={preview ? "expense-layout" : ""}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api(jobIds ? "/lab-payments" : "/expenses", "POST", {
                ...values,
                jobIds,
                expectedCompanyId: companyId,
                expectedAmounts: jobs
                  ? Object.fromEntries(jobs.map((j) => [j.id, j.cost]))
                  : undefined,
                reviewed,
                acknowledgeDuplicate: ack,
                evidenceId: upload?.id,
                requestKey: key,
              });
              saved();
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="แนบสลิปเพื่อช่วยกรอก (ไม่บังคับ) — PNG/JPEG ไม่เกิน 3 MB">
            <input
              type="file"
              accept="image/png,image/jpeg"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUpload(null);
                setPreview("");
                setReviewed(false);
                if (file.size > 3 * 1024 * 1024) {
                  setError("รูปต้องไม่เกิน 3 MB");
                  return;
                }
                setBusy(true);
                setError("");
                setReviewed(false);
                try {
                  const u = await api<Upload>("/evidence", "POST", file);
                  setUpload(u);
                  setPreview(URL.createObjectURL(file));
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </Field>
          {upload && (
            <>
              <p className="notice">{upload.extraction.message}</p>
              {upload.duplicate && (
                <p className="error">⚠ พบรูปหลักฐานนี้ในรายการอื่น</p>
              )}
              <div className="suggestions">
                {Object.entries(upload.extraction.suggestions)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <button
                      type="button"
                      className="secondary"
                      key={k}
                      onClick={() => {
                        setValues({ ...values, [k]: v! });
                        setReviewed(false);
                      }}
                    >
                      ใช้ค่า {labels[k] || k}: {v}
                    </button>
                  ))}
              </div>
              <p className="muted">
                กดแต่ละค่าเพื่อใช้แทนข้อมูลเดิม ไม่มีการเขียนทับอัตโนมัติ
              </p>
            </>
          )}
          <DraftEvidence
            busy={busy}
            selectedId={upload?.id}
            changed={async (id) => {
              setReviewed(false);
              if (!id) {
                setUpload(null);
                setPreview("");
                return;
              }
              try {
                const url = await showEvidence(id);
                setUpload({
                  id,
                  duplicate: false,
                  extraction: {
                    status: "unavailable",
                    message:
                      "ใช้รูปที่อัปโหลดไว้ก่อนหน้า กรุณาตรวจสอบและกรอกข้อมูลเอง",
                    text: "",
                    suggestions: {},
                  },
                });
                setPreview(url);
              } catch (e) {
                setError(String(e));
              }
            }}
          />
          <div className="formgrid">
            {Object.entries(labels)
              .filter(
                ([k]) =>
                  !(jobIds && ["amount", "recipient", "category"].includes(k)),
              )
              .map(([k, l]) => (
                <Field key={k} label={l}>
                  {k === "category" ? (
                    <select
                      value={values[k]}
                      onChange={(e) => {
                        setValues({ ...values, [k]: e.target.value });
                        setReviewed(false);
                      }}
                    >
                      {Object.entries(categories)
                        .filter(([k]) => k !== "lab")
                        .map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <input
                      required={[
                        "amount",
                        "paidDate",
                        "recipient",
                        "description",
                      ].includes(k)}
                      type={
                        k === "paidDate"
                          ? "date"
                          : k === "paidTime"
                            ? "time"
                            : "text"
                      }
                      inputMode={k === "amount" ? "decimal" : undefined}
                      value={values[k]}
                      onChange={(e) => {
                        setValues({ ...values, [k]: e.target.value });
                        setReviewed(false);
                      }}
                    />
                  )}
                </Field>
              ))}
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            หากแจ้งว่าอาจซ้ำ ฉันตรวจสอบแล้วว่าเป็นรายการที่ต้องบันทึก
          </label>
          <label className="check">
            <input
              required
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            ตรวจสอบข้อมูลแล้ว ยืนยันบันทึกค่าใช้จ่ายนี้
          </label>
          <button disabled={busy || !reviewed}>
            {busy ? "กำลังดำเนินการ…" : "ยืนยันบันทึก"}
          </button>
        </form>
        {preview && (
          <aside>
            <img
              className="slip"
              src={preview}
              alt="สลิปที่อัปโหลดเพื่อตรวจทาน"
            />
            {upload?.extraction.text && (
              <details>
                <summary>ข้อความ OCR ดิบ</summary>
                <pre>{upload.extraction.text}</pre>
              </details>
            )}
          </aside>
        )}
      </div>
    </Modal>
  );
}

function DraftEvidence({
  busy,
  selectedId,
  changed,
}: {
  busy: boolean;
  selectedId?: string;
  changed: (id: string | null) => Promise<void>;
}) {
  const [rows, setRows] = useState<{ id: string; createdAt: string }[]>([]);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  async function load() {
    try {
      setRows(await api<typeof rows>("/evidence"));
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <details className="draft-evidence">
      <summary>รูปที่อัปโหลดไว้แต่ยังไม่ได้ใช้ / คืนพื้นที่ไฟล์ร่าง</summary>
      <button
        type="button"
        className="secondary"
        disabled={busy || working}
        onClick={() => void load()}
      >
        โหลดไฟล์ร่างของฉัน
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {rows.map((row) => (
        <div key={row.id} className="history">
          <p>
            {new Date(row.createdAt).toLocaleString("th-TH", {
              timeZone: "Asia/Bangkok",
            })}{" "}
            · {row.id.slice(0, 8)}
          </p>
          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={busy || working}
              onClick={() => void changed(row.id)}
            >
              ดู / ใช้รูปนี้
            </button>
            <button
              type="button"
              className="danger"
              disabled={busy || working}
              onClick={async () => {
                if (
                  !window.confirm(
                    "ลบไฟล์ร่างที่ยังไม่ได้ใช้นี้ถาวร? ไม่กระทบหลักฐานที่บันทึกกับค่าใช้จ่ายแล้ว",
                  )
                )
                  return;
                setWorking(true);
                try {
                  await api(`/evidence/${row.id}/discard`, "POST", {
                    confirm: true,
                  });
                  if (selectedId === row.id) await changed(null);
                  await load();
                } catch (e) {
                  setError(String(e));
                } finally {
                  setWorking(false);
                }
              }}
            >
              ลบไฟล์ร่าง
            </button>
          </div>
        </div>
      ))}
    </details>
  );
}
