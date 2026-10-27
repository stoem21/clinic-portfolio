/** Add-only preview fixtures. Never updates or deletes existing clinic records. */
import 'dotenv/config';
import assert from 'assert/strict';
import { Prisma, PrismaClient, Dentist, Client } from '@prisma/client';
import { clinicToday } from '../src/lib/clinicDay';
import { LAB_COMPANIES } from '../src/lib/labCompanies';
import { scalingState, shifts, slotFits } from '../src/lib/opsRules';

require('./assert-demo-target.cjs')();
const db = new PrismaClient();
const prefix = 'frontdesk-demo-v1-';
const id = (key: string) => prefix + key;
const today = clinicToday();
const date = (offset: number) => new Date(Date.parse(today) + offset * 86400000);
const dayString = (offset: number) => date(offset).toISOString().slice(0, 10);
type Tx = Prisma.TransactionClient;

async function summary(tx: Tx) {
  const expenses = await tx.opsExpense.findMany({ where: { id: { startsWith: prefix } } });
  return {
    dentists: await tx.dentist.count({ where: { id: { startsWith: prefix } } }),
    patients: await tx.client.count({ where: { id: { startsWith: prefix } } }),
    recurringSchedules: await tx.opsSchedule.count({ where: { id: { startsWith: prefix } } }),
    dateExceptions: await tx.opsException.count({ where: { id: { startsWith: prefix } } }),
    appointments: await tx.opsAppointment.count({ where: { id: { startsWith: prefix } } }),
    calls: await tx.opsCall.count({ where: { id: { startsWith: prefix } } }),
    labJobs: await tx.labWork.count({ where: { id: { startsWith: prefix } } }),
    expenses: expenses.length,
    expenseTotal: expenses.filter(e => !e.voidedAt).reduce((s, e) => s.plus(e.amount), new Prisma.Decimal(0)).toFixed(2),
  };
}

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert(process.env.DEMO_MODE === 'true' && url.hostname === 'clinic-db' && url.pathname === '/clinic_demo', 'Only the isolated clinic_demo database is permitted');
  const marker = await db.auditLog.findUnique({ where: { id: id('seed') } });
  if (marker) {
    console.log('Demo already exists; no data changed.', marker.summary);
    console.log(await summary(db));
    return;
  }
  if (process.argv.includes('--verify')) throw new Error('Front-desk preview fixtures have not been seeded.');
  await db.$transaction(async tx => {
    const actor = await tx.user.findFirst({ where: { isActive: true, role: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' } });
    assert(actor, 'An existing active owner account is required');
    const usersBefore = JSON.stringify(await tx.user.findMany({ orderBy: { id: 'asc' } }));
    const dentists: Dentist[] = [];
    for (const [i, name, ortho] of [[0, 'อรทัย จัดฟัน', true], [1, 'ปกรณ์ ทั่วไป', false], [2, 'มณี จัดฟัน', true], [3, 'ธนา ทั่วไป', false]] as const) {
      dentists.push(await tx.dentist.create({ data: { id: id(`dent-${i}`), name: `[FD DEMO] ${name}`, licenseId: `FD-DEMO-${i}`, isOrthoDent: ortho } }));
      for (let weekday = 0; weekday < 7; weekday++) {
        // Dentist 3's extra working date tomorrow is added by an exception.
        if (i === 3 && weekday === date(1).getUTCDay()) continue;
        await tx.opsSchedule.create({ data: { id: id(`schedule-${i}-${weekday}`), requestKey: id(`schedule-${i}-${weekday}`), dentistId: id(`dent-${i}`), weekday, startMinute: 540, endMinute: 1020, from: date(-7), to: date(60), createdBy: actor.id } });
      }
    }
    const patients: Client[] = [];
    const names = ['ขูดหินปูนเกินกำหนด', 'ขูดหินปูนล่าสุด', 'ไม่มีประวัติขูดหินปูน', 'รอติดต่อนัด', 'ตรวจฟันทั่วไป', 'ติดตามงานแล็บ', 'เลื่อนนัดแล้ว', 'นัดยกเลิก'];
    for (let i = 0; i < names.length; i++) patients.push(await tx.client.create({ data: { id: id(`patient-${i}`), hn: `FDDEMO${String(i + 1).padStart(3, '0')}`, nameTitle: 'คุณ', firstName: '[FD DEMO]', lastName: names[i], phoneNumber: `000000000${i}`, gender: 'อื่นๆ', birthday: new Date('1990-01-01'), orthoDentId: i < 4 ? dentists[i % 2 === 0 ? 0 : 2].id : null, addressDetail: 'ข้อมูลสมมติสำหรับดูตัวอย่างเท่านั้น' } }));
    async function treatment(key: string, patientIndex: number, offset: number, type: string, amount: number) {
      return tx.treatmentRecord.create({ data: { id: id(`treatment-${key}`), clientId: patients[patientIndex].id, dentistId: dentists[patientIndex % 4].id, treatmentDate: date(offset), note: '[FD DEMO] ข้อมูลสาธิต ไม่ใช่รายการจริง', items: { create: { type, data: type === 'scaling' ? { area: ['top', 'bottom'] } : { otherText: '[FD DEMO] บริการสาธิต' }, price: amount } }, payments: { create: { type: 'cash', amount } } } });
    }
    const overdue = await treatment('scaling-old', 0, -240, 'scaling', 600);
    const recent = await treatment('scaling-recent', 1, -30, 'scaling', 600);
    await treatment('ortho-no-scaling', 2, -190, 'others', 1000);
    await treatment('ortho-follow-up', 3, -200, 'others', 1000);
    await tx.opsException.create({ data: { id: id('leave'), dentistId: dentists[0].id, date: date(1), cancelled: true, startMinute: 540, endMinute: 1020, reason: '[FD DEMO] ลา — มีนัดที่ต้องติดต่อ', updatedBy: actor.id } });
    await tx.opsException.create({ data: { id: id('halfday'), dentistId: dentists[2].id, date: date(1), startMinute: 540, endMinute: 720, reason: '[FD DEMO] ทำงานครึ่งวันเช้า', updatedBy: actor.id } });
    await tx.opsException.create({ data: { id: id('extra'), dentistId: dentists[3].id, date: date(1), startMinute: 780, endMinute: 1020, reason: '[FD DEMO] เพิ่มวันทำงานพิเศษ', updatedBy: actor.id } });
    await tx.opsException.create({ data: { id: id('cover'), dentistId: dentists[1].id, replacementId: dentists[3].id, date: date(2), startMinute: 540, endMinute: 1020, reason: '[FD DEMO] เปลี่ยนหมอเฉพาะวันนี้', updatedBy: actor.id } });

    const outcomes = ['confirmed', 'no-answer', 'disconnected', 'callback', 'switched-off', 'out-of-service', 'wrong-number'];
    for (let i = 0; i < 18; i++) {
      const offset = i < 12 ? 0 : i < 17 ? 1 : 2;
      const dentistIndex = i < 3 ? 0 : i === 12 ? 0 : i === 13 ? 2 : i === 14 ? 3 : i === 17 ? 1 : i % 4;
      const start = i < 3 ? 540 : i === 13 || i === 14 ? 840 : 600 + (i % 5) * 30;
      const status = i === 8 ? 'arrived' : i === 9 ? 'completed' : i === 10 ? 'cancelled' : i === 11 ? 'no-show' : 'scheduled';
      const provisional = i === 2 || i === 7;
      const p = patients[i % patients.length];
      const moved = i === 6;
      const a = await tx.opsAppointment.create({ data: { id: id(`appointment-${i}`), requestKey: id(`appointment-${i}`), clientId: provisional ? null : p.id, provisionalName: provisional ? '[FD DEMO] คนไข้ใหม่ยังไม่มี HN' : `${p.firstName} ${p.lastName}`, provisionalPhone: provisional ? '0000000099' : p.phoneNumber, dentistId: dentists[dentistIndex].id, date: date(offset), minute: start, duration: dentists[dentistIndex].isOrthoDent ? 15 : 30, status, revision: moved ? 2 : 1, version: moved ? 2 : 1, notes: moved ? '[FD DEMO] เลื่อนนัดแล้ว ต้องโทรยืนยันใหม่ ประวัติเดิมยังอยู่' : offset > 0 ? '[FD DEMO] ตรวจสอบข้อยกเว้นตารางหมอและนัดที่ได้รับผลกระทบ' : '[FD DEMO] นัดตัวอย่าง', createdBy: actor.id, updatedBy: actor.id } });
      if (i < outcomes.length) await tx.opsCall.create({ data: { id: id(`call-${i}`), requestKey: id(`call-${i}`), appointmentId: a.id, revision: 1, outcome: moved ? 'confirmed' : outcomes[i], notes: '[FD DEMO] ผลการโทรสมมติ ไม่ได้โทรจริง', staffId: actor.id, staffName: actor.username, createdAt: new Date(Date.now() - (60 - i) * 60000) } });
      if (i === 7) await tx.opsCall.create({ data: { id: id('call-wrong'), requestKey: id('call-wrong'), appointmentId: a.id, revision: 1, outcome: 'wrong-number', notes: '[FD DEMO] เบอร์ไม่ถูกต้อง', staffId: actor.id, staffName: actor.username } });
      if (moved) await tx.auditLog.create({ data: { id: id('reschedule-history'), actorId: actor.id, actorUsername: actor.username, action: 'update', entity: 'ops-appointment', entityId: a.id, summary: '[FD DEMO] ตัวอย่างเลื่อนนัดตามคำขอคนไข้', changes: [{ field: 'record', before: JSON.stringify({ date: dayString(-1), minute: 540, revision: 1 }), after: JSON.stringify({ date: dayString(0), minute: start, revision: 2 }) }] } });
    }

    const labs = [];
    for (const [i, amount, companyId] of [[0, 1000, 'mock-a'], [1, 500, 'mock-a'], [2, 700, 'mock-b'], [3, null, 'mock-c'], [4, 450, null]] as const) {
      const record = await treatment(`lab-${i}`, 5, -1, 'others', 1500);
      labs.push(await tx.labWork.create({ data: { id: id(`lab-${i}`), treatmentRecordId: record.id, placementDentistId: record.dentistId, companyId, type: ['rtn', 'implant', 'denture'][i % 3], cost: amount } }));
    }
    const patient = patients[5];
    await tx.opsExpense.create({ data: { id: id('expense-lab'), requestKey: id('expense-lab'), kind: 'lab', companyId: 'mock-a', category: 'lab', description: '[FD DEMO] ชำระค่าแล็บรวม 2 งาน', amount: 1500, paidDate: date(0), recipient: LAB_COMPANIES.find(c => c.id === 'mock-a')!.name, notes: '[FD DEMO] บันทึกสาธิต ไม่ได้โอนเงินจริง ไม่มีสลิป', createdBy: actor.id, reviewed: true, bankVerified: false, lines: { create: labs.slice(0, 2).map(l => ({ jobId: l.id, activeJobId: l.id, amount: l.cost!, description: `${patient.hn} [FD DEMO] ${l.type}`, jobDate: date(-1), jobType: l.type, patientSnapshot: { id: patient.id, hn: patient.hn, firstName: patient.firstName, lastName: patient.lastName, phoneNumber: patient.phoneNumber, orthoDentId: patient.orthoDentId }, sourceRecordId: l.treatmentRecordId })) } } });
    for (const [key, category, amount, label, voided] of [
      ['rent', 'rent', '12000.00', 'ค่าเช่า', false], ['utilities', 'utilities', '1234.50', 'ค่าไฟฟ้า', false], ['supplies', 'supplies', '875.25', 'วัสดุสิ้นเปลือง', false], ['void', 'other', '250.00', 'รายการยกเลิกตัวอย่าง', true],
    ] as const) await tx.opsExpense.create({ data: { id: id(`expense-${key}`), requestKey: id(`expense-${key}`), kind: 'manual', category, description: `[FD DEMO] ${label}`, amount, paidDate: date(0), recipient: '[FD DEMO] ผู้รับเงินสมมติ', notes: '[FD DEMO] ไม่มีการจ่ายเงินจริง ไม่จำเป็นต้องแนบสลิป', createdBy: actor.id, reviewed: true, bankVerified: false, ...(voided ? { voidedAt: new Date(), voidedBy: actor.id, voidReason: '[FD DEMO] สาธิตรายการที่ไม่ถูกนับในยอดรวม' } : {}) } });

    assert.equal(scalingState(overdue.treatmentDate).status, 'overdue');
    assert.equal(scalingState(recent.treatmentDate).status, 'current');
    assert.equal(scalingState(null).status, 'no-history');
    const rules = await tx.opsSchedule.findMany({ where: { id: { startsWith: prefix } } });
    const exceptions = await tx.opsException.findMany({ where: { id: { startsWith: prefix } } });
    const appointments = await tx.opsAppointment.findMany({ where: { id: { startsWith: prefix } } });
    const affected = appointments.filter(a => ['scheduled', 'arrived'].includes(a.status) && !slotFits(a.minute, a.duration, shifts(a.date.toISOString().slice(0,10), rules, exceptions).filter(w => w.dentistId === a.dentistId)));
    assert(affected.some(a => a.id === id('appointment-12')), 'Leave warning missing');
    assert(affected.some(a => a.id === id('appointment-13')), 'Half-day warning missing');
    assert(affected.some(a => a.id === id('appointment-17')), 'Replacement warning missing');
    assert.equal(appointments.filter(a => a.date.toISOString().slice(0,10) === today && a.minute === 540 && a.dentistId === dentists[0].id).length, 3);
    const report = await summary(tx);
    assert.equal(report.appointments, 18); assert.equal(report.expenseTotal, '15609.75');
    assert.equal(await tx.labWork.count({ where: { id: { startsWith: prefix }, OR: [{ placementPaid: true }, { deliveredPaid: true }] } }), 0);
    assert.equal(JSON.stringify(await tx.user.findMany({ orderBy: { id: 'asc' } })), usersBefore, 'Accounts must stay unchanged');
    await tx.auditLog.create({ data: { id: id('seed'), actorId: actor.id, actorUsername: actor.username, action: 'seed-demo', entity: 'system', entityId: id('seed'), summary: `Add-only front-desk demo; anchor date ${today}; ${JSON.stringify(report)}` } });
    console.log({ today, tomorrow: dayString(1), replacementDay: dayString(2), affectedAppointments: affected.length, ...report });
  }, { isolationLevel: 'Serializable', timeout: 60000 });
  console.log('COMMITTED. New [FD DEMO] fixtures added; existing records and accounts preserved.');
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Seed failed'); process.exitCode = 1; }).finally(() => db.$disconnect());
