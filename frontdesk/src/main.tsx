import { appLink } from '../../frontend/src/lib/publicConfig';
import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { CalendarCheck, CalendarDays, Users, FlaskConical, Receipt, ShieldCheck } from "lucide-react";
import demoLogo from "../../frontend/src/assets/demo-logo.svg";
import { api, request, idleSession, type Dentist } from "./api";
import { Appointments } from "./Appointments";
import { Schedules, FollowUp } from "./Schedules";
import { Finance } from "./Finance";
import { Field, Empty } from "./ui";
import "./style.css";
type Session = {
  user: { id: string; username: string; role: string };
  permissions: string[];
  today: string;
};
const pages = [
  ["appointments", "ตารางนัดหมาย", "appointments.view", CalendarCheck],
  ["schedules", "ปฏิทินหมอ", "appointments.view", CalendarDays],
  ["followup", "ติดตามจัดฟัน", "followup.view", Users],
  ["lab", "ชำระแล็บ", "finance.view", FlaskConical],
  ["expenses", "ค่าใช้จ่าย", "finance.view", Receipt],
  ["settings", "ตั้งค่าสิทธิ์", "settings.manage", ShieldCheck],
] as const;
function App() {
  useEffect(() => idleSession.install(), []);
  const menuRef = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (menuOpen) menuRef.current?.showModal();
    else menuRef.current?.close();
    const previous = document.body.style.overflow;
    if (menuOpen) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [menuOpen]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 801px)");
    const close = () => { if (media.matches) setMenuOpen(false); };
    media.addEventListener("change", close);
    return () => media.removeEventListener("change", close);
  }, []);
  const [session, setSession] = useState<Session | null>(null),
    [dentists, setDentists] = useState<Dentist[]>([]),
    [page, setPage] = useState("appointments"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  async function load() {
    setLoading(true);
    try {
      const s = await api<Session>("/me");
      setSession(s);
      if (s.permissions.includes("appointments.view")) {
        const r = await api<{ dentists: Dentist[] }>("/reference");
        setDentists(r.dentists);
      }
      if (!s.permissions.includes(pages.find((p) => p[0] === page)?.[2] || ""))
        setPage(pages.find((p) => s.permissions.includes(p[2]))?.[0] || "none");
      setError("");
    } catch (e) {
      setSession(null);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (sessionStorage.getItem("ops.access")) void load();
    else setLoading(false);
    const logout = () => setSession(null);
    window.addEventListener("ops-logout", logout);
    return () => window.removeEventListener("ops-logout", logout);
  }, []);
  if (loading)
    return (
      <main>
        <Empty>กำลังโหลดระบบหน้าร้าน…</Empty>
      </main>
    );
  if (!session) return <Login loaded={load} initialError={error} />;
  const can = (p: string) =>
    (p !== "settings.manage" || session.user.role === "SUPER_ADMIN") &&
    session.permissions.includes(p);
  return (
    <div className="app">
      <dialog ref={menuRef} className="mobile-drawer no-print" onCancel={() => setMenuOpen(false)} onClick={e => { if (e.target === e.currentTarget) setMenuOpen(false); }}>
        <div className="drawer-content">
          <header><img className="logo" src={demoLogo} alt="RISE Dental Clinic" /><h2>เมนู</h2><button className="quiet" aria-label="ปิดเมนู" onClick={() => setMenuOpen(false)}>✕</button></header>
          <nav aria-label="เมนูมือถือ">{pages.filter(p => can(p[2])).map(([key, label, , Icon]) => <button key={key} className={page === key ? "active" : ""} onClick={() => { setPage(key); setMenuOpen(false); }}><Icon className="nav-icon" size={20} aria-hidden="true" />{label}</button>)}</nav>
          <a href={appLink()} target="_blank" rel="noreferrer">เปิดระบบคลินิกหลัก ↗</a>
        </div>
      </dialog>
      <aside className="sidebar no-print">
        <div className="brand">
          <img className="logo" src={demoLogo} alt="โลโก้คลินิกทันตกรรมตัวอย่าง (DEMO)" />
          <div>
            RISE<small>DENTAL CLINIC</small>
          </div>
        </div>
        <p className="navcaption">งานหน้าร้าน</p>
        <nav>
          {pages
            .filter((p) => can(p[2]))
            .map(([key, label, , Icon]) => (
              <button
                className={page === key ? "active" : ""}
                key={key}
                onClick={() => setPage(key)}
              >
                <Icon className="nav-icon" size={20} strokeWidth={1.8} aria-hidden="true" />
                {label}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <a href={appLink()} target="_blank" rel="noreferrer">
            ↗ เปิดระบบคลินิกหลัก
          </a>
          <small>Asia/Bangkok · ข้อมูลร่วมกัน</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar no-print">
          <div className="mobile-heading"><button className="quiet" aria-label="เปิดเมนู" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>☰</button><img src={demoLogo} alt="RISE" /><strong>{pages.find(p => p[0] === page)?.[1]}</strong></div>
          <span>คลินิกทันตกรรมตัวอย่าง (DEMO) · ระบบจัดการหน้าร้าน</span>
          <div className="actions">
            <span>
              {session.user.username} · {session.user.role}
            </span>
            <button
              className="quiet"
              onClick={async () => {
                try {
                  await request("/api/auth/logout", "POST", {});
                } finally {
                  sessionStorage.removeItem("ops.access");
                  sessionStorage.removeItem("ops.refresh");
                  setSession(null);
                }
              }}
            >
              ออกจากระบบ
            </button>
          </div>
        </header>
        <main>
          {page === "appointments" && (
            <Appointments
              dentists={dentists}
              canManage={can("appointments.manage")}
            />
          )}
          {page === "schedules" && (
            <Schedules
              dentists={dentists}
              canManage={can("schedules.manage")}
            />
          )}
          {page === "followup" && <FollowUp />}
          {(page === "lab" || page === "expenses") && (
            <Finance key={page} mode={page} permissions={session.permissions} />
          )}
          {page === "settings" && can("settings.manage") && <Settings />}
          {page === "none" && (
            <Empty>บัญชีนี้ยังไม่มีสิทธิ์ใช้งาน กรุณาติดต่อเจ้าของคลินิก</Empty>
          )}
        </main>
      </div>
    </div>
  );
}
function Login({
  loaded,
  initialError,
}: {
  loaded: () => Promise<void>;
  initialError: string;
}) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [pending, setPending] = useState(""),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false),
    [mustChange, setMustChange] = useState(false),
    [newPassword, setNewPassword] = useState("");
  return (
    <main className="login">
      <section className="panel">
        <p className="eyebrow">RISE DENTAL CLINIC / FRONT DESK</p>
        <h1>{mustChange ? "ตั้งรหัสผ่านใหม่" : "ยินดีต้อนรับ"}</h1>
        <p>ใช้บัญชีเดียวกับระบบคลินิก</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              if (mustChange) {
                const r = await request<{
                  accessToken: string;
                  refreshToken: string;
                }>("/api/auth/change-password", "POST", { newPassword });
                idleSession.start();
              sessionStorage.setItem("ops.access", r.accessToken);
                sessionStorage.setItem("ops.refresh", r.refreshToken);
                await loaded();
                return;
              }
              const r = await request<{
                totpRequired?: boolean;
                pendingToken: string;
                accessToken: string;
                refreshToken: string;
                user: { mustChangePassword: boolean };
              }>(
                pending ? "/api/auth/totp/verify-login" : "/api/auth/login",
                "POST",
                pending
                  ? { pendingToken: pending, code }
                  : { username, password },
              );
              if (r.totpRequired) {
                setPending(r.pendingToken);
                return;
              }
              idleSession.start();
              sessionStorage.setItem("ops.access", r.accessToken);
              sessionStorage.setItem("ops.refresh", r.refreshToken);
              if (r.user.mustChangePassword) setMustChange(true);
              else await loaded();
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {mustChange ? (
            <Field label="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)">
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
          ) : pending ? (
            <Field label="รหัส TOTP / รหัสสำรอง">
              <input
                required
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
          ) : (
            <>
              <Field label="ชื่อผู้ใช้">
                <input
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </Field>
              <Field label="รหัสผ่าน">
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            </>
          )}
          <button disabled={busy}>
            {busy
              ? "กำลังตรวจสอบ…"
              : mustChange
                ? "เปลี่ยนรหัสผ่าน"
                : "เข้าสู่ระบบ"}
          </button>
        </form>
      </section>
    </main>
  );
}
type SettingsData = {
  permissions: string[];
  users: { id: string; username: string; role: string; isActive: boolean }[];
  grants: { userId: string; permission: string; allowed: boolean }[];
};
const permissionLabels: Record<string, [string, string]> = {
  "appointments.view": [
    "ดูนัดหมายและปฏิทินหมอ",
    "ดูรายชื่อนัด ข้อมูลติดต่อ ประวัติการโทร และเวลาทำงานของทันตแพทย์",
  ],
  "appointments.manage": [
    "จัดการนัดหมาย",
    "เพิ่ม แก้ไข เลื่อนหรือยกเลิกนัด เชื่อม HN และบันทึกผลการโทร",
  ],
  "schedules.manage": [
    "จัดตารางทำงานหมอ",
    "เพิ่มตารางประจำ กำหนดวันลา เปลี่ยนเวลาทำงาน และเลือกหมอแทน",
  ],
  "followup.view": [
    "ติดตามคนไข้จัดฟัน",
    "ดูคนไข้จัดฟัน วันรักษาล่าสุด นัดถัดไป และสถานะขูดหินปูน",
  ],
  "finance.view": [
    "ดูข้อมูลการเงิน",
    "ดูงานแล็บ ยอดชำระ รายการค่าใช้จ่าย และหลักฐานการจ่ายเงิน",
  ],
  "expenses.manage": [
    "บันทึกค่าใช้จ่าย",
    "เพิ่มค่าใช้จ่ายทั่วไป ตรวจทานข้อมูล และแนบหลักฐานการจ่ายเงิน",
  ],
  "labs.pay": [
    "บันทึกชำระค่าแล็บ",
    "เลือกงานแล็บและบันทึกยอดจ่ายให้บริษัทแล็บ ไม่ใช่การโอนเงินจริง",
  ],
  "finance.reverse": [
    "ยกเลิกรายการจ่าย (เจ้าของเท่านั้น)",
    "ยกเลิกรายการค่าใช้จ่ายหรือชำระแล็บพร้อมระบุเหตุผล และเก็บประวัติเดิมไว้",
  ],
  "settings.manage": [
    "ตั้งค่าสิทธิ์ (เจ้าของเท่านั้น)",
    "กำหนดสิทธิ์รายผู้ใช้ เฉพาะ SUPER_ADMIN ไม่สามารถมอบสิทธิ์นี้ให้บทบาทอื่น",
  ],
};
function Settings() {
  const [data, setData] = useState<SettingsData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setData(await api<SettingsData>("/settings"));
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <h1>ตั้งค่าสิทธิ์รายผู้ใช้</h1>
      <p>เจ้าของคลินิกมีทุกสิทธิ์เสมอ การเปลี่ยนแปลงถูกบันทึกในประวัติ</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <Empty>กำลังโหลด…</Empty>
      ) : (
        data.users.map((u) => (
          <section className="panel" key={u.id}>
            <h2>
              {u.username} · {u.role} {!u.isActive && "· ปิดใช้งาน"}
            </h2>
            <div className="permission-grid">
              {data.permissions.map((p) => {
                const defaultAllowed =
                  u.role === "SUPER_ADMIN" ||
                  (u.role === "ADMIN"
                    ? !["finance.reverse", "settings.manage"].includes(p)
                    : [
                        "appointments.view",
                        "appointments.manage",
                        "followup.view",
                      ].includes(p));
                const allowed =
                  data.grants.find(
                    (g) => g.userId === u.id && g.permission === p,
                  )?.allowed ?? defaultAllowed;
                return (
                  <label className="check" key={p}>
                    <input
                      type="checkbox"
                      checked={allowed}
                      disabled={
                        busy ||
                        u.role === "SUPER_ADMIN" ||
                        ["settings.manage", "finance.reverse"].includes(p)
                      }
                      onChange={async (e) => {
                        setBusy(true);
                        try {
                          await api(`/settings/${u.id}`, "PUT", {
                            permission: p,
                            allowed: e.target.checked,
                          });
                          await load();
                        } catch (e) {
                          setError(String(e));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                    <span>
                      <strong>{permissionLabels[p]?.[0] || p}</strong>
                      <small className="cell-detail">
                        {permissionLabels[p]?.[1]}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        ))
      )}
    </>
  );
}
async function start() {
  const { demoLogin } = await import('../../frontend/src/lib/demoLogin');
  const session = await demoLogin();
  if (session) {
    idleSession.start();
    sessionStorage.setItem('ops.access', session.accessToken);
    sessionStorage.setItem('ops.refresh', session.refreshToken);
  }
  createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

}
void start();
