import { useEffect, useRef, useState } from "react";
import {
  api,
  requestId,
  today,
  time,
  minutes,
  dateLabel,
  patientName,
  type Appointment,
  type Dentist,
  type Patient,
  type Scaling,
} from "./api";
import { Empty, Field, Modal, ScalingBadge } from "./ui";
type Calendar = {
  rules: {
    id: string;
    dentistId: string;
    weekday: number;
    intervalWeeks: number;
    startMinute: number;
    endMinute: number;
    from: string;
    to: string | null;
  }[];
  exceptions: { dentistId: string; date: string; version: number }[];
  days: {
    date: string;
    shifts: {
      dentistId: string;
      startMinute: number;
      endMinute: number;
      sourceDentistId: string;
    }[];
  }[];
  affected: Appointment[];
};
export function Schedules({
  dentists,
  canManage,
}: {
  dentists: Dentist[];
  canManage: boolean;
}) {
  const loadSequence = useRef(0);
  const [month, setMonth] = useState(today().slice(0, 7)),
    [data, setData] = useState<Calendar | null>(null),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [kind, setKind] = useState("recurring"),
    [dent, setDent] = useState(dentists[0]?.id || ""),
    [date, setDate] = useState(today()),
    [until, setUntil] = useState(`${today().slice(0, 4)}-12-31`),
    [intervalWeeks, setIntervalWeeks] = useState(1),
    [start, setStart] = useState("10:00"),
    [end, setEnd] = useState("19:00"),
    [replacement, setReplacement] = useState(""),
    [cancel, setCancel] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState(() => requestId()),
    [version, setVersion] = useState<number | null>(null),
    [ruleSort, setRuleSort] = useState("dentist"),
    [ruleDescending, setRuleDescending] = useState(false);
  useEffect(() => {
    if (!open || kind !== "exception") return;
    let stale = false;
    setVersion(null);
    api<Calendar>(`/schedules?from=${date}&to=${date}`)
      .then((r) => {
        if (!stale)
          setVersion(
            r.exceptions.find(
              (x) => x.dentistId === dent && x.date.slice(0, 10) === date,
            )?.version || 0,
          );
      })
      .catch((e) => {
        if (!stale) setError(String(e));
      });
    return () => {
      stale = true;
    };
  }, [open, kind, date, dent]);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const previewDates: string[] = [];
  if (date && Number.isFinite(Date.parse(date))) {
    for (let i = 0; i < 5; i++) {
      const occurrence = new Date(Date.parse(date) + i * intervalWeeks * 7 * 86400000).toISOString().slice(0, 10);
      if (until && occurrence > until) break;
      previewDates.push(occurrence);
    }
  }
  const from = `${month}-01`;
  const to = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  )
    .toISOString()
    .slice(0, 10);
  async function load() {
    const sequence = ++loadSequence.current;
    setData(null);
    try {
      const result = await api<Calendar>(`/schedules?from=${from}&to=${to}`);
      if (sequence !== loadSequence.current) return;
      setData(result);
      setError("");
    } catch (e) {
      if (sequence === loadSequence.current) setError(String(e));
    }
  }
  useEffect(() => {
    void load();
    return () => {
      loadSequence.current++;
    };
  }, [month]);
  const name = (id: string) => dentists.find((d) => d.id === id)?.name || id;
  const weekdays = [
    "อาทิตย์",
    "จันทร์",
    "อังคาร",
    "พุธ",
    "พฤหัสบดี",
    "ศุกร์",
    "เสาร์",
  ];
  const sortedRules = [...(data?.rules || [])].sort((a, b) => {
    const cmp =
      ruleSort === "dentist"
        ? name(a.dentistId).localeCompare(name(b.dentistId), "th")
        : ruleSort === "weekday"
          ? a.weekday - b.weekday
          : ruleSort === "time"
            ? a.startMinute - b.startMinute
            : ruleSort === "from"
              ? a.from.localeCompare(b.from)
              : (a.to || "9999").localeCompare(b.to || "9999");
    return (
      (cmp ||
        a.weekday - b.weekday ||
        a.startMinute - b.startMinute ||
        a.id.localeCompare(b.id)) * (ruleDescending ? -1 : 1)
    );
  });
  function moveMonth(delta: number) {
    setMonth(
      new Date(
        Date.UTC(
          Number(month.slice(0, 4)),
          Number(month.slice(5, 7)) - 1 + delta,
          1,
        ),
      )
        .toISOString()
        .slice(0, 7),
    );
  }
  return (
    <>
      <div className="pagehead">
        <div>
          <p className="eyebrow">TEAM / AVAILABILITY</p>
          <h1>ปฏิทินทันตแพทย์</h1>
          <p>ตารางประจำและข้อยกเว้นรายวันแยกจากกัน</p>
        </div>
        {canManage && (
          <button
            onClick={() => {
              setOpen(true);
              setKey(requestId());
              setDate(today());
              setUntil(`${today().slice(0, 4)}-12-31`);
              setStart("10:00");
              setEnd("19:00");
              setKind("recurring");
              setIntervalWeeks(1);
              setCancel(false);
              setReplacement("");
              setReason("");
              setError("");
            }}
          >
            ＋ จัดตารางทำงาน
          </button>
        )}
      </div>
      <div className="filters">
        <button
          className="secondary"
          aria-label="เดือนก่อน"
          onClick={() => moveMonth(-1)}
        >
          ‹
        </button>
        <Field label="เลือกเดือน">
          <input
            type="month"
            value={month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value);
            }}
          />
        </Field>
        <button
          className="secondary"
          aria-label="เดือนถัดไป"
          onClick={() => moveMonth(1)}
        >
          ›
        </button>
        <button
          className="secondary"
          onClick={() => setMonth(today().slice(0, 7))}
        >
          เดือนนี้
        </button>
        <button className="secondary" onClick={() => void load()}>
          โหลดใหม่
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data ? (
        <Empty>กำลังโหลด…</Empty>
      ) : (
        <>
          <h2>
            {new Intl.DateTimeFormat("th-TH", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(from))}
          </h2>
          <div className="calendar-scroll">
            <div className="calendar month-calendar">
              {weekdays.map((w) => (
                <div className="weekday" key={w}>
                  {w}
                </div>
              ))}
              {Array.from({ length: new Date(from).getUTCDay() }, (_, i) => (
                <div
                  className="day blank"
                  key={`blank-${i}`}
                  aria-hidden="true"
                />
              ))}
              {data.days.map((d) => (
                <section
                  className={`day ${d.date === today() ? "is-today" : ""}`}
                  key={d.date}
                >
                  <h3>
                    {Number(d.date.slice(8, 10))}
                    {d.date === today() && " · วันนี้"}
                  </h3>
                  {!d.shifts.length ? (
                    <p className="muted">ไม่มีตาราง</p>
                  ) : (
                    d.shifts.map((s, i) => (
                      <div className="shift" key={i}>
                        <strong>{name(s.dentistId)}</strong>
                        <p>
                          {time(s.startMinute)}–{time(s.endMinute)}
                        </p>
                        {s.sourceDentistId !== s.dentistId && (
                          <small>แทน {name(s.sourceDentistId)}</small>
                        )}
                      </div>
                    ))
                  )}
                </section>
              ))}
            </div>
          </div>
          <section className="panel">
            <h2>นัดที่ได้รับผลกระทบ ({data.affected.length})</h2>
            <p>
              ระบบไม่ย้ายหรือยกเลิกนัดอัตโนมัติ
              กรุณาติดต่อคนไข้และแก้ไขในตารางนัด
            </p>
            {!data.affected.length ? (
              <Empty>ไม่มีนัดที่อยู่นอกตารางทำงาน</Empty>
            ) : (
              data.affected.map((a) => (
                <p className="notice" key={a.id}>
                  {dateLabel(a.date)} {time(a.minute)} · {a.dentist.name} ·{" "}
                  {patientName(a)} ·{" "}
                  {a.client?.phoneNumber || a.provisionalPhone}
                </p>
              ))
            )}
          </section>
          <details className="panel">
            <summary>ตารางประจำทั้งหมด ({data.rules.length})</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      ["dentist", "ทันตแพทย์"],
                      ["weekday", "วันประจำ"],
                      ["time", "เวลาทำงาน"],
                      ["from", "เริ่มมีผล"],
                      ["to", "สิ้นสุด"],
                    ].map(([key, label]) => (
                      <th
                        key={key}
                        aria-sort={
                          ruleSort === key
                            ? ruleDescending
                              ? "descending"
                              : "ascending"
                            : "none"
                        }
                      >
                        <button
                          className="sort-button"
                          onClick={() => {
                            setRuleSort(key);
                            setRuleDescending(
                              ruleSort === key ? !ruleDescending : false,
                            );
                          }}
                        >
                          {label}{" "}
                          {ruleSort === key
                            ? ruleDescending
                              ? "↓"
                              : "↑"
                            : "↕"}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRules.map((r) => (
                    <tr key={r.id}>
                      <td>{name(r.dentistId)}</td>
                      <td>{weekdays[r.weekday]} · {r.intervalWeeks > 1 ? `ทุก ${r.intervalWeeks} สัปดาห์` : "ทุกสัปดาห์"}</td>
                      <td>
                        {time(r.startMinute)}–{time(r.endMinute)}
                      </td>
                      <td>{dateLabel(r.from)}</td>
                      <td>{r.to ? dateLabel(r.to) : "ไม่กำหนด"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      {open && (
        <Modal title="จัดตารางทำงาน" close={() => setOpen(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                if (kind === "recurring") {
                  await api("/schedules", "POST", {
                    dentistId: dent,
                    weekday,
                    intervalWeeks,
                    startMinute: minutes(start),
                    endMinute: minutes(end),
                    from: date,
                    to: until || null,
                    requestKey: key,
                  });
                } else {
                  const result = await api<{ affected: Appointment[] }>(
                    "/exceptions",
                    "POST",
                    {
                      dentistId: dent,
                      date,
                      startMinute: minutes(start),
                      endMinute: minutes(end),
                      cancelled: cancel,
                      replacementId: replacement,
                      reason,
                      version,
                    },
                  );
                  if (result.affected.length)
                    window.alert(
                      `มีนัดได้รับผลกระทบ ${result.affected.length} รายการ กรุณาดูรายการใต้ปฏิทิน`,
                    );
                }
                setMonth(date.slice(0, 7));
                setOpen(false);
                if (date.slice(0, 7) === month) await load();
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="formgrid">
              <Field label="ประเภท">
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="recurring">ตารางประจำแบบลงซ้ำ</option>
                  <option value="exception">เพิ่ม / เปลี่ยนเฉพาะวัน</option>
                </select>
              </Field>
              <Field label="ทันตแพทย์เดิม">
                <select
                  required
                  value={dent}
                  onChange={(e) => setDent(e.target.value)}
                >
                  {dentists.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={kind === "recurring" ? "วันลงเวรครั้งแรก" : "วันที่แก้ไข"}>
                <input
                  required
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              {kind === "recurring" ? (
                <>
                  <Field label="ลงเวรซ้ำ">
                    <select value={intervalWeeks} onChange={(e) => setIntervalWeeks(Number(e.target.value))}>
                      <option value={1}>ทุกสัปดาห์</option>
                      <option value={2}>ทุก 2 สัปดาห์ (สัปดาห์เว้นสัปดาห์)</option>
                      <option value={3}>ทุก 3 สัปดาห์</option>
                      <option value={4}>ทุก 4 สัปดาห์</option>
                    </select>
                  </Field>
                  <p>วันประจำ: {weekdays[weekday] || "เลือกวันลงเวรครั้งแรก"}</p>
                  <Field label="สิ้นสุด (ไม่บังคับ)">
                    <input
                      type="date"
                      value={until}
                      min={date}
                      onChange={(e) => setUntil(e.target.value)}
                    />
                  </Field>
                  <div aria-live="polite">
                    <strong>วันลงเวรถัดไป (สูงสุด 5 ครั้ง)</strong>
                    <p>{previewDates.length ? previewDates.map(dateLabel).join(" · ") : "ไม่มีวันลงเวรในช่วงที่เลือก"}</p>
                    <p>นับรอบต่อเนื่องจากวันลงเวรครั้งแรก แม้ข้ามเดือน การลาเฉพาะวันไม่เลื่อนรอบถัดไป</p>
                  </div>
                </>
              ) : (
                <>
                  <Field label="ทันตแพทย์แทน (ไม่บังคับ)">
                    <select
                      value={replacement}
                      onChange={(e) => setReplacement(e.target.value)}
                    >
                      <option value="">คนเดิม</option>
                      {dentists
                        .filter((d) => d.id !== dent)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={cancel}
                      onChange={(e) => setCancel(e.target.checked)}
                    />
                    ลา / ยกเลิกวันทำงานนี้
                  </label>
                </>
              )}
              <Field label="เริ่มงาน">
                <input
                  required
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>
              <Field label="เลิกงาน">
                <input
                  required
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </Field>
            </div>
            {kind === "exception" && (
              <Field label="เหตุผล">
                <input
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            )}
            <p>
              ข้อยกเว้นจะใช้แทนตารางประจำของหมอในวันนั้นเท่านั้น
              ไม่แก้ไขนัดของคนไข้
            </p>
            <button
              disabled={busy || (kind === "exception" && version === null)}
            >
              ยืนยันบันทึกตาราง
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
type Follow = Patient & {
  orthoDent: { name: string };
  lastVisit: string | null;
  nextAppointment: {
    date: string;
    minute: number;
    dentist: { name: string };
  } | null;
  scaling: Scaling;
};
export function FollowUp() {
  const [rows, setRows] = useState<Follow[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [q, setQ] = useState(""),
    [dentFilter, setDentFilter] = useState(""),
    [scalingFilter, setScalingFilter] = useState(""),
    [appointmentFilter, setAppointmentFilter] = useState(""),
    [visitFrom, setVisitFrom] = useState(""),
    [visitTo, setVisitTo] = useState(""),
    [sort, setSort] = useState("hn"),
    [descending, setDescending] = useState(false);
  async function load() {
    setBusy(true);
    try {
      setRows(await api<Follow[]>("/follow-up"));
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const value = (p: Follow, key: string): string | null => {
    if (key === "name") return p.firstName + " " + p.lastName;
    if (key === "dent") return p.orthoDent.name;
    if (key === "visit") return p.lastVisit;
    if (key === "next")
      return p.nextAppointment
        ? p.nextAppointment.date + time(p.nextAppointment.minute)
        : null;
    if (key === "scaling") return p.scaling.status;
    if (key === "phone") return p.phoneNumber;
    return p.hn;
  };
  const filtered = rows
    .filter(
      (p) =>
        `${p.hn} ${p.firstName} ${p.lastName} ${p.phoneNumber}`
          .toLowerCase()
          .includes(q.trim().toLowerCase()) &&
        (!dentFilter || p.orthoDent.name === dentFilter) &&
        (!scalingFilter || p.scaling.status === scalingFilter) &&
        (!appointmentFilter ||
          (appointmentFilter === "booked"
            ? !!p.nextAppointment
            : !p.nextAppointment)) &&
        (!visitFrom ||
          (!!p.lastVisit && p.lastVisit.slice(0, 10) >= visitFrom)) &&
        (!visitTo || (!!p.lastVisit && p.lastVisit.slice(0, 10) <= visitTo)),
    )
    .sort((a, b) => {
      const av = value(a, sort),
        bv = value(b, sort);
      if (av === null || bv === null)
        return av === bv ? a.hn.localeCompare(b.hn) : av === null ? 1 : -1;
      return (
        (av.localeCompare(bv, "th", { numeric: true }) ||
          a.hn.localeCompare(b.hn)) * (descending ? -1 : 1)
      );
    });
  return (
    <>
      <div className="pagehead">
        <div>
          <p className="eyebrow">PATIENT CARE / ORTHODONTICS</p>
          <h1>ติดตามคนไข้จัดฟัน</h1>
          <p>วันรักษาล่าสุดนับจากประวัติรักษาทุกประเภทที่ไม่ถูกลบ</p>
        </div>
        <button className="secondary" onClick={() => void load()}>
          โหลดข้อมูลล่าสุด
        </button>
      </div>
      <div className="filters">
        <Field label="ค้นหา HN / ชื่อ / เบอร์โทร">
          <input value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <Field label="หมอจัดฟัน">
          <select
            value={dentFilter}
            onChange={(e) => setDentFilter(e.target.value)}
          >
            <option value="">ทุกคน</option>
            {[...new Set(rows.map((p) => p.orthoDent.name))]
              .sort((a, b) => a.localeCompare(b, "th"))
              .map((n) => (
                <option key={n}>{n}</option>
              ))}
          </select>
        </Field>
        <Field label="สถานะขูดหินปูน">
          <select
            value={scalingFilter}
            onChange={(e) => setScalingFilter(e.target.value)}
          >
            <option value="">ทั้งหมด</option>
            <option value="overdue">ครบกำหนดขูดหินปูน</option>
            <option value="current">ยังไม่ครบกำหนด</option>
            <option value="no-history">ไม่มีประวัติขูดหินปูน</option>
          </select>
        </Field>
        <Field label="นัดถัดไป">
          <select
            value={appointmentFilter}
            onChange={(e) => setAppointmentFilter(e.target.value)}
          >
            <option value="">ทั้งหมด</option>
            <option value="booked">มีนัดแล้ว</option>
            <option value="missing">ยังไม่มีนัด</option>
          </select>
        </Field>
        <Field label="รักษาล่าสุดตั้งแต่">
          <input
            type="date"
            value={visitFrom}
            max={today()}
            onChange={(e) => { if (e.target.value <= today()) setVisitFrom(e.target.value); }}
          />
        </Field>
        <Field label="รักษาล่าสุดถึง">
          <input
            type="date"
            min={visitFrom || undefined}
            value={visitTo}
            max={today()}
            onChange={(e) => { if (e.target.value <= today()) setVisitTo(e.target.value); }}
          />
        </Field>
        <button
          className="secondary"
          onClick={() => {
            setQ("");
            setDentFilter("");
            setScalingFilter("");
            setAppointmentFilter("");
            setVisitFrom("");
            setVisitTo("");
          }}
        >
          ล้างตัวกรอง
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {busy ? (
        <Empty>กำลังโหลด…</Empty>
      ) : (
        <>
          <p className="muted">
            แสดง {filtered.length} จาก {rows.length} คน ·
            คลิกหัวคอลัมน์เพื่อเรียงลำดับ
          </p>
          {!filtered.length ? (
            <Empty>ไม่พบคนไข้ตามตัวกรองที่เลือก</Empty>
          ) : (
            <div className="table-scroll">
              <table className="follow-table">
                <thead>
                  <tr>
                    {[
                      ["hn", "HN"],
                      ["name", "ชื่อคนไข้"],
                      ["dent", "หมอจัดฟัน"],
                      ["phone", "เบอร์โทร"],
                      ["visit", "รักษาล่าสุด"],
                      ["next", "นัดถัดไป"],
                      ["scaling", "ขูดหินปูน"],
                    ].map(([key, label]) => (
                      <th
                        key={key}
                        aria-sort={
                          sort === key
                            ? descending
                              ? "descending"
                              : "ascending"
                            : "none"
                        }
                      >
                        <button
                          className="sort-button"
                          onClick={() => {
                            setSort(key);
                            setDescending(sort === key ? !descending : false);
                          }}
                        >
                          {label}{" "}
                          {sort === key ? (descending ? "↓" : "↑") : "↕"}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id}>
                      <td>{p.hn}</td>
                      <td>
                        <strong>
                          {p.firstName} {p.lastName}
                        </strong>
                      </td>
                      <td>{p.orthoDent.name}</td>
                      <td>
                        <a href={`tel:${p.phoneNumber}`}>{p.phoneNumber}</a>
                      </td>
                      <td>
                        {p.lastVisit
                          ? dateLabel(p.lastVisit)
                          : "ไม่มีประวัติรักษา"}
                      </td>
                      <td>
                        {p.nextAppointment ? (
                          <>
                            {dateLabel(p.nextAppointment.date)}{" "}
                            {time(p.nextAppointment.minute)}
                            <small className="cell-detail">
                              {p.nextAppointment.dentist.name}
                            </small>
                          </>
                        ) : (
                          <span className="badge warn">ยังไม่มีนัด</span>
                        )}
                      </td>
                      <td>
                        <ScalingBadge value={p.scaling} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
