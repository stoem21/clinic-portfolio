import { useEffect, useRef, useState, useId as ReactUseId, type ReactNode } from "react";
import { api, dateLabel, type Patient, type Scaling } from "./api";
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={close}>
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          className="quiet"
          onClick={close}
          aria-label="ปิด"
        >
          ✕
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function PatientSearch({ selected, choose }: { selected: Patient | null; choose: (p: Patient | null) => void }) {
  const label = (p: Patient) => `${p.hn} · ${p.firstName} ${p.lastName} · ${p.phoneNumber}`;
  const [q, setQ] = useState(selected ? label(selected) : ""), [rows, setRows] = useState<Patient[]>([]),
    [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""),
    [active, setActive] = useState(-1);
  const listId = ReactUseId();
  useEffect(() => { if (selected) setQ(label(selected)); }, [selected]);
  useEffect(() => {
    let stale = false;
    setRows([]); setActive(-1); setError("");
    if (!open || selected || q.trim().length < 2) { setBusy(false); return; }
    setBusy(true);
    const timer = setTimeout(() => {
      api<Patient[]>(`/patients?q=${encodeURIComponent(q.trim())}`)
        .then(r => { if (!stale) setRows(r); })
        .catch(e => { if (!stale) setError(String(e)); })
        .finally(() => { if (!stale) setBusy(false); });
    }, 300);
    return () => { stale = true; clearTimeout(timer); };
  }, [q, open, selected]);
  const select = (p: Patient) => { choose(p); setQ(label(p)); setOpen(false); };
  return <section className="patient-search" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <Field label="คนไข้ / HN">
      <input role="combobox" aria-expanded={open && !selected} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        placeholder="พิมพ์ HN / ชื่อ / เบอร์โทร อย่างน้อย 2 ตัวอักษร"
        value={q} onFocus={() => setOpen(true)}
        onChange={e => { setQ(e.target.value); setOpen(true); if (selected) choose(null); }}
        onKeyDown={e => {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); }
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(i => Math.min(i + 1, rows.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
          if (e.key === "Enter" && open && !selected) { e.preventDefault(); if (rows[active]) select(rows[active]); }
        }} />
    </Field>
    {open && !selected && <div className="patient-options">
      <ul id={listId} role="listbox" aria-label="ผลการค้นหาคนไข้">
        {rows.map((p,i) => <li key={p.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
          onMouseDown={e => e.preventDefault()} onClick={() => select(p)} className={i === active ? "active" : ""}>{label(p)}</li>)}
      </ul>
      {!rows.length && <p role="status">{busy ? "กำลังค้นหา…" : error || (q.trim().length < 2 ? "พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา" : "ไม่พบคนไข้")}</p>}
    </div>}
    {selected && <button type="button" className="quiet" onClick={() => { choose(null); setQ(""); setOpen(true); }}>ล้างคนไข้ที่เลือก</button>}
  </section>;
}
export function ScalingBadge({ value }: { value: Scaling | null }) {
  if (!value) return null;
  return (
    <span className={"badge " + (value.status === "current" ? "" : "warn")}>
      {value.status === "overdue"
        ? "⚑ ขูดหินปูนเกิน 6 เดือน"
        : value.status === "no-history"
          ? "? ไม่พบประวัติขูดหินปูน"
          : "✓ ขูดหินปูนไม่เกิน 6 เดือน"}
      {value.lastDate && <small> ล่าสุด {dateLabel(value.lastDate)}</small>}
    </span>
  );
}
export function Empty({
  children = "ไม่พบรายการในช่วงที่เลือก",
}: {
  children?: ReactNode;
}) {
  return <p className="empty">{children}</p>;
}
