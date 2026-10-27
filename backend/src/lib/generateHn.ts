import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { clinicToday } from './clinicDay';

export const currentHnYear = () => Number(clinicToday().slice(0, 4)) + 543;
export const formatHn = (year: number, count: number) => `${String(year).slice(-2)}${String(count).padStart(4, '0')}`;

// All live allocation, release, patient creation and adjustment operations share
// this transaction lock. It also serializes first use of a year's counter.
export async function lockHn(tx: Prisma.TransactionClient, year: number) {
  await tx.$queryRaw`SELECT 1::integer AS locked FROM pg_advisory_xact_lock(68421, ${year}::integer)`;
}

export function highestHnCount(year: number, rows: { hn: string }[]): number {
  const prefix = String(year).slice(-2);
  return rows.reduce((max, { hn }) => {
    if (!hn.startsWith(prefix) || !/^\d{6,}$/.test(hn)) return max;
    const count = Number(hn.slice(2));
    return Number.isSafeInteger(count) ? Math.max(max, count) : max;
  }, 0);
}

export async function hnState(tx: Prisma.TransactionClient, year: number) {
  const counter = await tx.hnCounter.findUnique({ where: { year } });
  // No deletedAt filter: even deleted patients retain their HNs.
  const rows = await tx.client.findMany({ where: { hn: { startsWith: String(year).slice(-2) } }, select: { hn: true } });
  const minimum = highestHnCount(year, rows);
  const count = counter?.count ?? 0;
  return { year, count, version: counter?.version ?? 0, minimum,
    highestHn: minimum ? formatHn(year, minimum) : null,
    nextHn: formatHn(year, Math.max(count, minimum) + 1) };
}

export async function allocateHn(tx: Prisma.TransactionClient, year: number) {
  const state = await hnState(tx, year);
  const count = Math.max(state.count, state.minimum) + 1;
  if (count > 2147483647) throw new Error('HN counter exhausted');
  const counter = await tx.hnCounter.upsert({ where: { year },
    update: { count }, create: { year, count } });
  return { hn: formatHn(year, count), version: counter.version };
}

export async function reserveHn() {
  const year = currentHnYear();
  return prisma.$transaction(async tx => {
    await lockHn(tx, year);
    return allocateHn(tx, year);
  });
}

export async function generateHn(): Promise<string> {
  return (await reserveHn()).hn;
}
