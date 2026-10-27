import { prisma } from './prisma';

/**
 * Generates the next sequential receipt number, scoped to the current
 * Buddhist year — mirrors generateHn.ts's exact pattern. The counter is
 * atomically upserted/incremented inside a transaction so two concurrent
 * receipt creations can never receive the same number, and it naturally
 * resets to 1 each new year (no explicit reset logic needed) since `year`
 * is the counter row's primary key.
 */
export async function generateReceiptNumber(): Promise<{ number: number; buddhistYear: number }> {
  const buddhistYear = new Date().getFullYear() + 543;

  const counter = await prisma.$transaction(async (tx) => {
    return tx.receiptCounter.upsert({
      where: { year: buddhistYear },
      update: { count: { increment: 1 } },
      create: { year: buddhistYear, count: 1 },
    });
  });

  return { number: counter.count, buddhistYear };
}
