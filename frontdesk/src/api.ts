import { apiUrl, API_HEADERS } from '../../frontend/src/lib/publicConfig';
import { createIdleSession } from '../../frontend/src/lib/idleSession';
export const idleSession = createIdleSession(sessionStorage, 'ops.lastActivity',
  () => !!sessionStorage.getItem('ops.access'),
  () => {
    sessionStorage.removeItem('ops.access');
    sessionStorage.removeItem('ops.refresh');
    window.dispatchEvent(new Event('ops-logout'));
    window.location.reload();
  },
);
let refreshing: Promise<string | null> | null = null;
// getRandomValues works on an HTTP LAN as well as HTTPS; randomUUID may not.
export function requestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export async function request<T = unknown>(
  url: string,
  method = "GET",
  body?: unknown,
  retry = true,
): Promise<T> {
  if (sessionStorage.getItem('ops.access') && !idleSession.check()) throw new Error('Session expired');
  const raw = body instanceof File;
  const token = sessionStorage.getItem("ops.access");
  const response = await fetch(apiUrl(url), {
    method,
    headers: {
      ...API_HEADERS,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": raw ? body.type : "application/json" } : {}),
    },
    body: body ? (raw ? body : JSON.stringify(body)) : undefined,
  });
  if (response.status === 401 && retry && !url.startsWith("/api/auth/")) {
    if (!refreshing)
      refreshing = request<{ accessToken: string }>(
        "/api/auth/refresh",
        "POST",
        { refreshToken: sessionStorage.getItem("ops.refresh") },
        false,
      )
        .then((r) => {
          if (!idleSession.check()) return null;
          sessionStorage.setItem("ops.access", r.accessToken);
          return r.accessToken;
        })
        .catch(() => null)
        .finally(() => {
          refreshing = null;
        });
    if (await refreshing) return request<T>(url, method, body, false);
    sessionStorage.removeItem("ops.access");
    sessionStorage.removeItem("ops.refresh");
    window.dispatchEvent(new Event("ops-logout"));
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(result.message || `เกิดข้อผิดพลาด (${response.status})`);
  return result as T;
}
export const api = <T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
) => request<T>(`/api/ops${path}`, method, body);
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const time = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export const minutes = (t: string) =>
  Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]);
export const dateLabel = (d: string) =>
  new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
  }).format(new Date(d.slice(0, 10) + "T12:00:00+07:00"));
export const currency = (v: string | null) =>
  v === null
    ? "ยังไม่ระบุราคา"
    : new Intl.NumberFormat("th-TH", {
        style: "currency",
        currency: "THB",
      }).format(Number(v));
export const statuses: Record<string, string> = {
  scheduled: "นัดหมาย",
  arrived: "มาถึงแล้ว",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
  "no-show": "ไม่มาตามนัด",
};
export const outcomes: Record<string, string> = {
  pending: "ยังไม่ได้โทร",
  confirmed: "ยืนยันนัดแล้ว",
  "no-answer": "ไม่รับสาย",
  disconnected: "โทรไม่ติด",
  callback: "โทรกลับ",
  "switched-off": "ปิดเครื่อง",
  "out-of-service": "เลิกใช้เบอร์",
  "wrong-number": "เบอร์ผิด",
};
export type Dentist = { id: string; name: string; isOrthoDent: boolean };
export type Patient = {
  id: string;
  hn: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  orthoDentId: string | null;
};
export type Scaling = { status: string; lastDate: string | null };
export type Appointment = {
  id: string;
  clientId: string | null;
  client: Patient | null;
  provisionalName: string;
  provisionalPhone: string;
  dentistId: string;
  dentist: Dentist;
  date: string;
  minute: number;
  duration: number;
  status: string;
  confirmation: string;
  version: number;
  revision: number;
  notes: string;
  affected: boolean;
  scaling: Scaling | null;
  calls: {
    id: string;
    outcome: string;
    notes: string;
    staffName: string;
    createdAt: string;
    revision: number;
  }[];
};
export const patientName = (a: Appointment) =>
  a.client
    ? `${a.client.hn} · ${a.client.firstName} ${a.client.lastName}`
    : `${a.provisionalName} (ยังไม่มี HN)`;
