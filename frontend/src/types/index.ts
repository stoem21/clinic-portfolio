export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'USER'

export interface AuthUser {
  id: string
  username: string
  role: Role
  mustChangePassword: boolean
}

export interface ManagedUser {
  id: string
  username: string
  role: Role
  isActive: boolean
  mustChangePassword: boolean
  totpEnabled: boolean
  createdAt: string
}

export interface Dentist {
  id: string
  name: string
  phoneNumber: string | null
  email: string | null
  lineId: string | null
  note: string | null
  licenseId: string
  isOrthoDent: boolean
  isActive: boolean
}

export interface Client {
  id: string
  hn: string
  nameTitle: string
  firstName: string
  lastName: string
  nationalId: string | null
  phoneNumber: string
  gender: string
  birthday: string
  orthoDentId: string | null
  orthoDent: { id: string; name: string } | null
  addressSubDistrict: string | null
  addressDistrict: string | null
  addressProvince: string | null
  addressZipCode: string | null
  addressDetail: string | null
  medCon: string | null
  drugAllergy: string | null
  drugEat: string | null
  createdAt: string
  updatedAt: string
}

export interface ClientListResponse {
  data: Client[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// Per-type shape of a treatment item's `data` payload. Each interface documents
// the fields the matching form writes and the summary/validator read. The union
// is structurally assignable to the loose `Record<string, any>` the form
// components and summary formatter still accept, so it adds precision without a
// rewrite of those inherently dynamic functions.
export interface ToothData {
  tooth: string[]
}
export interface ScalingData {
  area: string[]
}
export interface RootPlaningData {
  area?: string[]
  tooth?: string[]
}
export interface FillingData {
  otherText: string
}
export interface RootCanalData {
  tooth: string
  rootType: string[]
}
export interface RemovableDenturesData {
  type: string
  tooth: string[]
}
export interface CrownData {
  tooth: string[]
  type: string
}
export interface ImplantData {
  tooth: string[]
  note?: string
}
export interface OrthoData {
  activity: string[]
  month?: string
  // Required when activity includes 'rtnUpper' or 'rtnLower'.
  rtnMaterial?: 'wire' | 'clear'
}
// NOTE: filmType/type here are read by backend/src/lib/costCategory.ts to decide
// whether a big+OPG X-ray counts as a "supply" cost — keep that resolver in sync
// if this shape changes.
export interface XRayData {
  type: 'small' | 'big'
  tooth?: string[]
  filmType?: string[]
}
export interface PediatricsData {
  treatmentType: string
  tooth?: string[]
  fillings?: { tooth?: string; side?: string }[]
}
export interface FreeTextData {
  otherText: string
}

export type TreatmentItemData = (
  | ToothData
  | ScalingData
  | RootPlaningData
  | FillingData
  | RootCanalData
  | RemovableDenturesData
  | CrownData
  | ImplantData
  | OrthoData
  | XRayData
  | PediatricsData
  | FreeTextData
) & {
  _legacyPatientContext?: {
    treatmentId: string
    clientName: string
    treatmentDate: string
    job: string
    note: string
  }
}

export interface TreatmentItem {
  id?: string
  type: string
  data: TreatmentItemData
  price: number | null
}

// Payment type is a fixed set for now — see backend/src/routes/treatments.ts's
// PAYMENT_TYPES for the source of truth.
export type PaymentType = 'transfer' | 'cash' | 'socialSecurity'

export interface TreatmentPayment {
  id?: string
  type: PaymentType
  amount: number
}

export interface TreatmentRecord {
  id: string
  clientId: string
  dentistId: string
  treatmentDate: string
  note: string | null
  createdAt: string
  updatedAt: string
  client: {
    id: string
    hn: string
    nameTitle: string
    firstName: string
    lastName: string
    orthoDentId: string | null
    orthoDent: { id: string; name: string } | null
  }
  dentist: { id: string; name: string }
  items: TreatmentItem[]
  totalCost: number | null
  // Zero or more — when any exist, their amounts sum to exactly totalCost.
  // Masked (empty array) for a viewer who can't see this record's cost.
  payments: TreatmentPayment[]
  // Count only — no cost/dentist detail here, that lives on the dedicated
  // lab-work page. Just flags "this visit has lab work" for discoverability.
  labWorkCount: number
}

export interface TreatmentListResponse {
  data: TreatmentRecord[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ReceiptLineItem {
  label: string
  amount: number
}

export interface Receipt {
  id: string
  bookNumber: string | null
  number: number
  buddhistYear: number
  kind: 'individual' | 'bulk'
  customerName: string
  customerAddress: string | null
  customerTaxId: string | null
  patientHn: string | null
  issueDate: string
  lineItems: ReceiptLineItem[]
  totalAmount: number
  amountText: string
  treatmentRecordIds: string[]
  issuedById: string | null
  issuedByUsername: string | null
  createdAt: string
}

// Payload sent to create a receipt — the caller decides *what* goes on it
// (one lump line for bulk, one line per item for individual); the server
// only assigns the sequential number and computes totals/amountText.
export interface ReceiptInput {
  bookNumber?: string | null
  kind: 'individual' | 'bulk'
  customerName: string
  customerAddress?: string | null
  customerTaxId?: string | null
  patientHn?: string | null
  issueDate: string
  lineItems: ReceiptLineItem[]
  treatmentRecordIds: string[]
}

// One existing receipt that already covers some treatment record(s) being
// submitted — returned by POST /api/receipts/check-existing, used to warn
// before creating a duplicate.
export interface ExistingReceiptMatch {
  id: string
  number: number
  buddhistYear: number
  kind: 'individual' | 'bulk'
  customerName: string
  issueDate: string
  treatmentRecordIds: string[]
}

export interface ReceiptListResponse {
  data: Receipt[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface AuditChange {
  field: string
  before: string | number | boolean | null
  after: string | number | boolean | null
}

export interface AuditLog {
  id: string
  actorId: string | null
  actorUsername: string
  action: string
  entity: string
  entityId: string
  summary: string | null
  context?: Record<string, string | number | boolean | string[] | null> | null
  changes?: AuditChange[] | null
  createdAt: string
}

export interface AuditListResponse {
  data: AuditLog[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface Backup {
  fileId: string
  name: string
  date: string
  sizeBytes: number
  url?: string
}

export interface BackupConfig {
  provider: 'gdrive' | 'onedrive'
  providerLabel: string
  configured: boolean
  folderUrl: string
  encrypted: boolean
  scheduleCron: string
  scheduleHumanReadable: string
}

export interface DashboardData {
  totalClients: number
  newPatientsMonth: number
  todayTreatments: number
  revenueToday: number
  revenueMonth: number | null
  treatmentsByType: { type: string; count: number }[]
  // One entry per calendar day (yyyy-mm-dd) with any activity in the
  // selected period, sorted ascending. `cash`/`transfer`/`socialSecurity`
  // are that day's payment sums; `supplyCost` is that day's special
  // reporting-category cost (e.g. supply, X-ray OPG — see costCategory.ts),
  // excluded from `dentists[].revenue` but included in rangeTotalRevenue.
  // `dentists` is sorted by revenue descending — index position (not
  // dentistId) is the "slot" a UI column represents, since which dentists
  // are active varies day to day.
  dailyBreakdown: {
    date: string
    cash: number
    transfer: number
    socialSecurity: number
    supplyCost: number
    dentists: { dentistId: string; name: string; revenue: number }[]
  }[]
  rangeTotalRevenue: number
  range: { from: string; to: string }
}

// Full drill-down for one dentist over a period: every treatment record
// (with items, so the page can reuse typeText/formatDetail per item) and the
// complete unpaid lab-cost list — detail the main dashboard's daily
// breakdown deliberately doesn't show. labCost is masked to {total:0,
// items:[]} for USER role.
export interface LabOutstandingItem {
  id: string
  type: LabWorkType
  typeDescription?: string | null
  patientName: string
  amount: number | null
  portion: 'placement' | 'delivered'
  status: 'unpaid' | 'paid'
  paidAt: string | null
  deduction: number
  issue: string | null
}

export interface DentistReport {
  labCostAsOf: string
  labCostUnknownDates: number
  labCostMode: 'unpaid-today' | 'paid-in-period'
  dentistId: string
  name: string
  treatmentRecords: {
    id: string
    treatmentDate: string
    client: { hn: string; nameTitle: string; firstName: string; lastName: string }
    items: TreatmentItem[]
    cost: number
  }[]
  labCost: {
    total: number
    items: LabOutstandingItem[]
  }
  incomeTotal: number
  net: number
  range: { from: string; to: string }
}

export interface TreatmentInput {
  clientId: string
  dentistId: string
  treatmentDate: string
  note?: string | null
  items: { type: string; data: Record<string, any>; price: number | null }[]
  // Optional — omit or send [] when payment isn't being tracked yet. When
  // non-empty, amounts must sum to exactly the items' total cost.
  payments?: { type: PaymentType; amount: number }[]
  // New jobs to append on create or edit. Existing lab-work rows stay intact.
  labWorks?: { type: LabWorkType; companyId: string; cost?: number; typeDescription?: string }[]
  orthoCaseAction?: 'start' | 'end' | null
}

// Lab work type is a fixed set — see backend/src/routes/treatments.ts's
// LAB_WORK_TYPES for the source of truth.
export type LabWorkType = 'rtn' | 'implant' | 'denture' | 'other'

export interface LabWork {
  deliveredAssignedDate: string | null
  companyId: string | null
  id: string
  type: LabWorkType
  typeDescription?: string | null
  treatmentRecordId: string
  treatmentDate: string
  client: { id: string; hn: string; nameTitle: string; firstName: string; lastName: string }
  placementDentistId: string
  placementDentist: { id: string; name: string }
  deliveredDentistId: string | null
  deliveredDentist: { id: string; name: string } | null
  cost: number | null
  placementHalf: number | null
  deliveredHalf: number | null
  placementPaid: boolean
  deliveredPaid: boolean
  placementPaidAt: string | null
  deliveredPaidAt: string | null
  placementReversible: boolean
  deliveredReversible: boolean
  createdAt: string
  updatedAt: string
}

export interface LabWorkListResponse {
  data: LabWork[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// Payload sent to create/update a client. `hn` is optional — only sent on
// create to use a pre-reserved HN; otherwise the server generates it.
export interface ClientInput {
  hnVersion?: number
  hn?: string
  nameTitle: string
  firstName: string
  lastName: string
  nationalId?: string | null
  phoneNumber: string
  gender: string
  birthday: string
  orthoDentId?: string | null
  addressSubDistrict?: string | null
  addressDistrict?: string | null
  addressProvince?: string | null
  addressZipCode?: string | null
  addressDetail?: string | null
  medCon?: string | null
  drugAllergy?: string | null
  drugEat?: string | null
}
