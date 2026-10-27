import { useEffect, useState, type FormEvent } from "react";
import {
  api,
  requestId,
  request,
  today,
  time,
  minutes,
  dateLabel,
  patientName,
  statuses,
  outcomes,
  type Dentist,
  type Appointment,
  type Patient,
} from "./api";
import { Field, Modal, PatientSearch, ScalingBadge, Empty } from "./ui";

export function Appointments({
  dentists,
  canManage,
}: {
  dentists: Dentist[];
  canManage: boolean;
}) {
  const [from, setFrom] = useState(today()),
    [to, setTo] = useState(today()),
    [dent, setDent] = useState(""),
    [q, setQ] = useState("");
  const [rows, setRows] = useState<Appointment[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [edit, setEdit] = useState<Appointment | null | undefined>(undefined);
  async function load() {
    setLoading(true);
    setError("");
    try {
      setRows(
        await api<Appointment[]>(
          `/appointments?${new URLSearchParams({ from, to, dentistId: dent, q })}`,
        ),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [from, to, dent]);
  return (
    <>
      <div className="pagehead">
        <div>
          <p className="eyebrow">FRONT DESK / APPOINTMENTS</p>
          <h1>ตารางนัดหมาย</h1>
          <p>จัดตามทันตแพทย์ · ไม่จำกัดจำนวนคนไข้ต่อช่วงเวลา</p>
        </div>
        <div className="actions">
          {canManage && (
            <button onClick={() => setEdit(null)}>＋ เพิ่มนัดหมาย</button>
          )}
          <button className="secondary" onClick={async () => {
            try {
              await request('/api/audit/export', 'POST', {
                entity: 'ops-appointment', format: 'print', count: rows.length, columns: [],
              });
              window.print();
            } catch (e) {
              setError(String(e));
            }
          }}>
            พิมพ์ A4
          </button>
        </div>
      </div>
      <div className="filters no-print">
        <Field label="จากวันที่">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="ถึงวันที่">
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <Field label="ทันตแพทย์">
          <select value={dent} onChange={(e) => setDent(e.target.value)}>
            <option value="">ทุกคน</option>
            {dentists.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ชื่อ / HN / เบอร์โทร">
          <input value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <button className="secondary" onClick={() => void load()}>
          ค้นหา / โหลดใหม่
        </button>
      </div>
      <p className="print-only">
        {dateLabel(from)} – {dateLabel(to)} ·{" "}
        {dentists.find((d) => d.id === dent)?.name || "ทุกทันตแพทย์"}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading ? (
        <Empty>กำลังโหลด…</Empty>
      ) : !rows.length ? (
        <Empty />
      ) : (
        <div className="table-scroll">
          <table className="booking-table">
            <thead>
              <tr>
                <th>วันที่</th>
                <th>เวลา</th>
                <th>ทันตแพทย์</th>
                <th>คนไข้ / HN</th>
                <th>เบอร์โทร</th>
                <th>สถานะนัด</th>
                <th>ผลการโทร</th>
                <th>ขูดหินปูน</th>
                <th>หมายเหตุ</th>
                <th className="no-print">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>{dateLabel(a.date)}</td>
                  <td>
                    {time(a.minute)}
                    <small className="cell-detail">{a.duration} นาที</small>
                  </td>
                  <td>{a.dentist.name}</td>
                  <td>
                    <strong>{patientName(a)}</strong>
                  </td>
                  <td>
                    <Phone
                      value={a.client?.phoneNumber || a.provisionalPhone}
                    />
                  </td>
                  <td>
                    <span className="badge">{statuses[a.status]}</span>
                  </td>
                  <td>
                    <span className="badge">{outcomes[a.confirmation]}</span>
                  </td>
                  <td>
                    <ScalingBadge value={a.scaling} />
                  </td>
                  <td>
                    {a.notes || "—"}
                    {a.affected && (
                      <p className="error">
                        ⚠ ตารางหมอเปลี่ยน กรุณาติดต่อหรือเลื่อนนัด
                      </p>
                    )}
                  </td>
                  <td className="no-print">
                    <button
                      className="secondary no-print"
                      onClick={() => setEdit(a)}
                    >
                      รายละเอียด / ประวัติ{canManage ? " / แก้ไข" : ""}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit !== undefined && (
        <AppointmentDialog
          record={edit}
          dentists={dentists}
          canManage={canManage}
          close={() => setEdit(undefined)}
          saved={() => {
            setEdit(undefined);
            void load();
          }}
        />
      )}
    </>
  );
}
function Phone({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="phone">
      <a href={`tel:${value.replace(/[^+\d]/g, "")}`}>โทร {value}</a>
      <button
        className="quiet no-print"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          } catch {
            setCopied(false);
            window.prompt("คัดลอกเบอร์โทร (Ctrl/Cmd+C)", value);
          }
        }}
      >
        {copied ? "คัดลอกแล้ว" : "คัดลอกเบอร์"}
      </button>
    </div>
  );
}
function AppointmentDialog({
  record,
  dentists,
  canManage,
  close,
  saved,
}: {
  record: Appointment | null;
  dentists: Dentist[];
  canManage: boolean;
  close: () => void;
  saved: () => void;
}) {
  const [patient, setPatient] = useState<Patient | null>(
      record?.client || null,
    ),
    [date, setDate] = useState(record?.date.slice(0, 10) || today()),
    [dent, setDent] = useState(record?.dentistId || dentists[0]?.id || ""),
    [slot, setSlot] = useState(record ? time(record.minute) : "09:00"),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [notes, setNotes] = useState(record?.notes || ""),
    [reason, setReason] = useState(""),
    [status, setStatus] = useState(record?.status || "scheduled"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [requestKey] = useState(() => requestId()),
    [available, setAvailable] = useState<number[]>([]),
    [scheduledDentists, setScheduledDentists] = useState<{ date: string; ids: string[] }>({ date: "", ids: [] }),
    [callKey] = useState(() => requestId()),
    [outcome, setOutcome] = useState("confirmed"),
    [callNote, setCallNote] = useState(""),
    [history, setHistory] = useState<
      {
        id: string;
        createdAt: string;
        actorUsername: string;
        summary: string;
        changes: { before: string; after: string }[];
      }[]
    >([]);
  const scheduledIds = new Set(scheduledDentists.date === date ? scheduledDentists.ids : []);
  const orderedDentists = [...dentists].sort(
    (a, b) => Number(scheduledIds.has(b.id)) - Number(scheduledIds.has(a.id)),
  );
  useEffect(() => {
    let stale = false;
    if (!date) {
      setAvailable([]);
      return;
    }
    api<{
      days: {
        shifts: { dentistId: string; startMinute: number; endMinute: number }[];
      }[];
    }>(`/schedules?from=${date}&to=${date}`)
      .then((r) => {
        if (stale) return;
        setScheduledDentists({ date, ids: (r.days[0]?.shifts || []).map((w) => w.dentistId) });
        const duration = dentists.find((d) => d.id === dent)?.isOrthoDent
          ? 15
          : 30;
        setAvailable(
          [
            ...new Set(
              (r.days[0]?.shifts || [])
                .filter((w) => w.dentistId === dent)
                .flatMap((w) =>
                  Array.from(
                    {
                      length: Math.floor(
                        (w.endMinute - w.startMinute) / duration,
                      ),
                    },
                    (_, i) => w.startMinute + i * duration,
                  ),
                ),
            ),
          ].sort((a, b) => a - b),
        );
      })
      .catch((e) => {
        if (stale) return;
        setScheduledDentists({ date, ids: [] });
        setAvailable([]);
        setError(String(e));
      });
    return () => { stale = true; };
  }, [date, dent, dentists]);
  useEffect(() => {
    if (record)
      api<typeof history>(`/appointments/${record.id}/history`)
        .then(setHistory)
        .catch((e) => setError(String(e)));
  }, [record?.id]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        record ? `/appointments/${record.id}` : "/appointments",
        record ? "PUT" : "POST",
        {
          date,
          minute: minutes(slot),
          dentistId: dent,
          clientId: patient?.id,
          name,
          phone,
          notes,
          status,
          reason,
          version: record?.version,
          requestKey,
        },
      );
      saved();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={record ? "รายละเอียดนัดหมาย" : "เพิ่มนัดหมาย"} close={close}>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {record && (
        <>
          <h3>{patientName(record)}</h3>
          <Phone
            value={record.client?.phoneNumber || record.provisionalPhone}
          />
        </>
      )}
      {canManage && (
        <form onSubmit={submit}>
          <PatientSearch selected={patient} choose={setPatient} />
          {!patient && !record && (
            <div className="formgrid">
              <Field label="ชื่อผู้ป่วยใหม่ (ยังไม่มี HN)">
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="เบอร์โทร">
                <input
                  required
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
            </div>
          )}
          <div className="formgrid">
            <Field label="วันที่นัด">
              <input
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="ทันตแพทย์">
              <select
                required
                value={dent}
                onChange={(e) => setDent(e.target.value)}
              >
                {orderedDentists.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}{scheduledIds.has(d.id) ? " — มีเวรวันนี้" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="เวลานัด (เวลาประเทศไทย)">
              <select value={slot} onChange={(e) => setSlot(e.target.value)}>
                {!available.includes(minutes(slot)) && (
                  <option value={slot}>{slot} — นอกตาราง</option>
                )}
                {available.map((m) => (
                  <option key={m} value={time(m)}>
                    {time(m)}
                  </option>
                ))}
              </select>
            </Field>
            {record && (
              <Field label="สถานะนัด">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {Object.entries(statuses).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          {!available.length && (
            <p className="notice">
              ยังไม่มีเวลาทำงาน กรุณาเพิ่มในปฏิทินหมอก่อนจอง
            </p>
          )}
          <Field label="หมายเหตุ">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          {record && (
            <Field label="เหตุผลการแก้ไข / เลื่อนนัด / เชื่อม HN">
              <input
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          )}
          <p className="muted">
            เลือก HN ด้วยตนเองเท่านั้น
            ไม่มีการรวมข้อมูลตามชื่อหรือเบอร์โทรอัตโนมัติ
          </p>
          <button disabled={busy}>
            {busy ? "กำลังบันทึก…" : "ยืนยันบันทึกนัด"}
          </button>
        </form>
      )}
      {record && (
        <>
          <hr />
          <h3>การโทรยืนยัน</h3>
          <p>
            นัดครั้งที่ {record.revision} · {outcomes[record.confirmation]}
          </p>
          {canManage && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await api(`/appointments/${record.id}/calls`, "POST", {
                    outcome,
                    notes: callNote,
                    version: record.version,
                    requestKey: callKey,
                  });
                  saved();
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="formgrid">
                <Field label="ผลการโทร">
                  <select
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                  >
                    {Object.entries(outcomes)
                      .filter(([v]) => v !== "pending")
                      .map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="บันทึกการโทร">
                  <input
                    value={callNote}
                    onChange={(e) => setCallNote(e.target.value)}
                  />
                </Field>
              </div>
              <div className="call-form-actions">
                <button disabled={busy}>บันทึกผลการโทร</button>
              </div>
            </form>
          )}
          {record.calls.map((c) => (
            <p className="history" key={c.id}>
              {new Date(c.createdAt).toLocaleString("th-TH", {
                timeZone: "Asia/Bangkok",
              })}{" "}
              · {c.staffName} · {outcomes[c.outcome]} · นัดครั้งที่ {c.revision}
              <br />
              {c.notes}
            </p>
          ))}
          <section className="appointment-history">
          <h3>ประวัติการเปลี่ยนแปลง</h3>
          {!history.length && <p className="muted">ยังไม่มีประวัติการเปลี่ยนแปลง</p>}
          {history.map((h) => (
            <details key={h.id}>
              <summary>
                {new Date(h.createdAt).toLocaleString("th-TH", {
                  timeZone: "Asia/Bangkok",
                })}{" "}
                · {h.actorUsername} · {h.summary || "สร้างนัด"}
              </summary>
              {h.changes?.map((c, i) => (
                <div key={i} className="history">
                  <p>ก่อน: {c.before}</p>
                  <p>หลัง: {c.after}</p>
                </div>
              ))}
            </details>
          ))}
          </section>
        </>
      )}
    </Modal>
  );
}
