import { Router, Request, Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { audit } from '../lib/audit';
import { authenticate } from '../middlewares/authenticate';
import { requireRole } from '../middlewares/requireRole';
import { generateReceiptNumber } from '../lib/generateReceiptNumber';
import { thaiBahtText } from '../lib/thaiBahtText';

const router = Router();

router.use(authenticate);
// Browsing/reprinting the full receipt history is SUPER_ADMIN-only, same tier
// as audit/backups/trash — see the per-route requireRole below. Creating a
// receipt (POST /) is gated per-kind instead: any role for individual,
// ADMIN+ for bulk — see the inline check in the POST handler.

interface LineItemInput {
  label: string;
  amount: number;
}

const receiptInclude = {
  issuedBy: { select: { username: true } },
} satisfies Prisma.ReceiptInclude;

type ReceiptWithIssuer = Prisma.ReceiptGetPayload<{ include: typeof receiptInclude }>;

// Flatten the joined issuer into `issuedByUsername` for display, matching how
// the rest of this app snapshots a display-friendly name (e.g. treatments'
// dentist.name) rather than making the frontend do a separate lookup. Also
// converts `totalAmount` from a Prisma Decimal (which JSON-serializes as a
// string, silently breaking Number-only formatting like .toLocaleString() on
// the frontend) to a plain number — matching how treatments.ts's serialize()
// already converts its own Decimal-derived totalCost before responding.
function serialize(receipt: ReceiptWithIssuer) {
  const { issuedBy, ...rest } = receipt;
  return {
    ...rest,
    totalAmount: Number(rest.totalAmount),
    issuedByUsername: issuedBy?.username ?? null,
  };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function optStr(value: unknown): string | null {
  const s = str(value);
  return s === '' ? null : s;
}

// Validates the create body. The frontend already decided *what* goes on the
// receipt (one lump line for bulk, one line per item for individual) — this
// only validates shape and computes the derived totals.
function parseBody(
  body: Record<string, unknown>,
):
  | {
      ok: true;
      data: {
        bookNumber: string | null;
        kind: string;
        customerName: string;
        customerAddress: string | null;
        customerTaxId: string | null;
        patientHn: string | null;
        issueDate: Date;
        lineItems: LineItemInput[];
        treatmentRecordIds: string[];
      };
    }
  | { ok: false; message: string } {
  const kind = str(body.kind);
  if (kind !== 'individual' && kind !== 'bulk') {
    return { ok: false, message: 'kind must be "individual" or "bulk"' };
  }
  const customerName = str(body.customerName);
  if (!customerName) return { ok: false, message: 'customerName is required' };

  const issueDateRaw = str(body.issueDate);
  if (!issueDateRaw) return { ok: false, message: 'issueDate is required' };
  const issueDate = new Date(issueDateRaw);
  if (Number.isNaN(issueDate.getTime())) {
    return { ok: false, message: 'issueDate is not a valid date' };
  }

  if (!Array.isArray(body.lineItems) || body.lineItems.length === 0) {
    return { ok: false, message: 'lineItems must contain at least one entry' };
  }
  const lineItems: LineItemInput[] = [];
  for (const raw of body.lineItems as unknown[]) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, message: 'each line item must be an object' };
    }
    const obj = raw as Record<string, unknown>;
    const label = str(obj.label);
    if (!label) return { ok: false, message: 'each line item must have a label' };
    const amount = Number(obj.amount);
    if (Number.isNaN(amount)) {
      return { ok: false, message: 'each line item amount must be a number' };
    }
    lineItems.push({ label, amount });
  }

  const treatmentRecordIds = Array.isArray(body.treatmentRecordIds)
    ? (body.treatmentRecordIds as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];

  return {
    ok: true,
    data: {
      bookNumber: optStr(body.bookNumber),
      kind,
      customerName,
      customerAddress: optStr(body.customerAddress),
      customerTaxId: optStr(body.customerTaxId),
      patientHn: optStr(body.patientHn),
      issueDate,
      lineItems,
      treatmentRecordIds,
    },
  };
}

/**
 * GET /api/receipts — paginated list, newest first.
 */
router.get('/', requireRole(Role.SUPER_ADMIN), async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));

  const [data, total] = await Promise.all([
    prisma.receipt.findMany({
      include: receiptInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.receipt.count(),
  ]);

  return res.json({
    data: data.map(serialize),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  });
});

/**
 * POST /api/receipts/check-existing — given a set of treatment record IDs,
 * returns any already-issued receipts covering one or more of them, so the
 * UI can warn before creating a duplicate. Read-only; POST (not GET) only to
 * avoid a URL-length limit on the id list, which can be long for bulk
 * receipts. Open to any role — matches who can create an individual receipt.
 */
router.post('/check-existing', async (req: Request, res: Response) => {
  const ids = Array.isArray(req.body?.treatmentRecordIds)
    ? (req.body.treatmentRecordIds as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  if (ids.length === 0) {
    return res.json({ data: [] });
  }
  const receipts = await prisma.receipt.findMany({
    where: { treatmentRecordIds: { hasSome: ids } },
    select: {
      id: true,
      number: true,
      buddhistYear: true,
      kind: true,
      customerName: true,
      issueDate: true,
      treatmentRecordIds: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ data: receipts });
});

/**
 * GET /api/receipts/:id — single receipt (for reprint).
 */
router.get('/:id', requireRole(Role.SUPER_ADMIN), async (req: Request, res: Response) => {
  const receipt = await prisma.receipt.findUnique({
    where: { id: String(req.params.id) },
    include: receiptInclude,
  });
  if (!receipt) {
    return res.status(404).json({ message: 'Receipt not found' });
  }
  return res.json(serialize(receipt));
});

/**
 * POST /api/receipts — assign the next sequential number, compute totals +
 * the Thai baht-in-words text, and persist a snapshot.
 */
router.post('/', async (req: Request, res: Response) => {
  const parsed = parseBody(req.body ?? {});
  if (!parsed.ok) {
    return res.status(400).json({ message: parsed.message });
  }
  const {
    bookNumber, kind, customerName, customerAddress, customerTaxId, patientHn,
    issueDate, lineItems, treatmentRecordIds,
  } = parsed.data;

  // Bulk receipts are ADMIN+ only — individual receipts are open to any role.
  if (kind === 'bulk' && req.user?.role === Role.USER) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  // Bulk receipts go to an organization for tax/accounting purposes, so a
  // real billing address is required (individual receipts already carry the
  // patient's own address from their client record).
  if (kind === 'bulk' && !customerAddress) {
    return res.status(400).json({
      code: 'BULK_RECEIPT_ADDRESS_REQUIRED',
      message: 'กรุณากรอกที่อยู่สำหรับใบเสร็จรวม',
    });
  }

  const totalAmount = lineItems.reduce((sum, li) => sum + li.amount, 0);
  const amountText = thaiBahtText(totalAmount);
  const { number, buddhistYear } = await generateReceiptNumber();

  const receipt = await prisma.receipt.create({
    data: {
      bookNumber,
      number,
      buddhistYear,
      kind,
      customerName,
      customerAddress,
      customerTaxId,
      patientHn,
      issueDate,
      lineItems: lineItems as unknown as Prisma.InputJsonValue,
      totalAmount: new Prisma.Decimal(totalAmount),
      amountText,
      treatmentRecordIds,
      issuedById: req.user?.id ?? null,
    },
    include: receiptInclude,
  });

  audit(req, 'create', 'receipt', receipt.id, `${buddhistYear}/${number} ${customerName} ฿${totalAmount}`);
  return res.status(201).json(serialize(receipt));
});

export default router;
