import { randomDemoPatient, randomDemoTreatment } from './demoRandom';
import cron from 'node-cron';
import { prisma } from './prisma';
import { clinicToday } from './clinicDay';
import { lockHn, allocateHn } from './generateHn';
import { logger } from './logger';

export function dailyDemoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.DEMO_MODE !== 'true' || env.DEMO_DAILY_DATA !== 'true') return false;
  try {
    const url = new URL(env.DATABASE_URL || '');
    return url.hostname === 'clinic-db' && url.pathname === '/clinic_demo';
  } catch { return false; }
}

/** One atomic, add-only batch per Bangkok calendar day, including after restart. */
export async function addDailyDemoData() {
  if (!dailyDemoEnabled()) return 'disabled';
  const day = clinicToday();
  const year = Number(day.slice(0, 4)) + 543;
  const key = `daily-demo-${day}`;
  return prisma.$transaction(async tx => {
    // Serialize replicas/retries before checking the durable completion marker.
    await tx.$queryRaw`SELECT 1::integer AS locked FROM pg_advisory_xact_lock(68422, 1)`;
    if (!await tx.auditLog.findUnique({ where: { id: 'portfolio-demo-initialized-v1' } })) throw new Error('Missing isolated demo marker');
    if (await tx.auditLog.findUnique({ where: { id: `${key}-expanded-v2` } })) return 'already-added';
    const baseExists = await tx.auditLog.findUnique({ where: { id: key } });
    const actor = await tx.user.findUnique({ where: { username: process.env.DEMO_USERNAME || 'demo' } });
    if (!actor) throw new Error('Missing demo user');
    if (!baseExists) {
    const dentistId = 'daily-demo-dentist';
    const date = new Date(day + 'T00:00:00.000Z');
    await tx.dentist.upsert({ where: { id: dentistId }, update: {}, create: {
      id: dentistId, name: 'ทพ. ธนกร สุขใจ (สาธิต)', licenseId: 'DAILY-DEMO-ONLY',
      note: 'ทันตแพทย์สมมติสำหรับข้อมูลสาธิตรายวัน',
    } });
    for (let weekday = 0; weekday < 7; weekday++) {
      const id = `daily-demo-schedule-${weekday}`;
      await tx.opsSchedule.upsert({ where: { id }, update: {}, create: {
        id, requestKey: id, dentistId, weekday, startMinute: 540, endMinute: 1020,
        from: date, createdBy: actor.id,
      } });
    }
    await lockHn(tx, year);
    for (let i = 0; i < 5; i++) {
      const clientId = `${key}-patient-${i}`;
      const { hn } = await allocateHn(tx, year);
      const person = randomDemoPatient();
      const { firstName, lastName } = person;
      await tx.client.create({ data: {
        id: clientId, hn, ...person,
        phoneNumber: `000000000${i}`, addressDetail: 'ข้อมูลสมมติรายวัน ไม่ใช่ผู้ป่วยจริง',
        addressSubDistrict: 'สีลม', addressDistrict: 'บางรัก', addressProvince: 'กรุงเทพมหานคร', addressZipCode: '10500',
      } });
      await tx.opsAppointment.create({ data: {
        id: `${key}-appointment-${i}`, requestKey: `${key}-appointment-${i}`,
        clientId, provisionalName: `${firstName} ${lastName}`, provisionalPhone: `000000000${i}`,
        dentistId, date, minute: 540 + i * 60, duration: 30,
        status: i < 3 ? 'completed' : 'scheduled', notes: 'ข้อมูลนัดหมายสมมติรายวัน',
        createdBy: actor.id, updatedBy: actor.id,
      } });
      if (i < 3) {
        const option = randomDemoTreatment();
        const amount = option.amount;
        await tx.treatmentRecord.create({ data: {
          id: `${key}-treatment-${i}`, clientId, dentistId,
          treatmentDate: new Date(`${day}T${String(9 + i).padStart(2, '0')}:00:00+07:00`),
          note: 'รายการรักษาและยอดเงินสมมติสำหรับสาธิตรายวัน',
          items: { create: { type: option.type, data: option.data, price: amount } },
          payments: { create: { type: option.paymentType, amount } },
        } });
      }
    }
    await tx.auditLog.create({ data: {
      id: key, actorUsername: actor.username, actorId: actor.id, action: 'create', entity: 'portfolio-demo', entityId: key,
      summary: `ข้อมูลสมมติรายวัน ${day}: ผู้ป่วย 5 คน นัดหมาย 5 รายการ การรักษา 3 รายการ`,
    } });
    }
    // Add twelve more visits without replacing the original batch or edited records.
    const dentistId = 'daily-demo-extra-dentist';
    const date = new Date(day + 'T00:00:00.000Z');
    await tx.dentist.upsert({ where: { id: dentistId }, update: {}, create: {
      id: dentistId, name: 'ทพญ. กมลชนก ใจดี (สาธิต)', licenseId: 'DAILY-DEMO-EXTRA',
      note: 'ทันตแพทย์สมมติสำหรับข้อมูลสาธิตรายวัน',
    } });
    for (let weekday = 0; weekday < 7; weekday++) {
      const id = `daily-demo-extra-schedule-${weekday}`;
      await tx.opsSchedule.upsert({ where: { id }, update: {}, create: {
        id, requestKey: id, dentistId, weekday, startMinute: 540, endMinute: 1020,
        from: date, createdBy: actor.id,
      } });
    }
    for (let i = 0; i < 12; i++) {
      const client = await tx.client.findUniqueOrThrow({ where: { id: `${key}-patient-${i === 0 ? 4 : i % 5}` } });
      const option = randomDemoTreatment();
      const minute = 540 + i * 30;
      await tx.opsAppointment.create({ data: {
        id: `${key}-extra-appointment-${i}`, requestKey: `${key}-extra-appointment-${i}`,
        clientId: client.id, provisionalName: `${client.firstName} ${client.lastName}`,
        provisionalPhone: client.phoneNumber, dentistId, date, minute, duration: 30,
        status: 'completed', notes: 'นัดหมายสมมติเพิ่มเติมรายวัน', createdBy: actor.id, updatedBy: actor.id,
      } });
      await tx.treatmentRecord.create({ data: {
        id: `${key}-extra-treatment-${i}`, clientId: client.id, dentistId,
        treatmentDate: new Date(`${day}T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00+07:00`),
        note: 'รายการรักษาสมมติเพิ่มเติมรายวัน ไม่ใช่รายการจริง',
        items: { create: { type: option.type, data: JSON.parse(JSON.stringify(option.data)), price: option.amount } },
        payments: { create: { type: option.paymentType, amount: option.amount } },
      } });
    }
    await tx.auditLog.create({ data: {
      id: `${key}-expanded-v2`, actorUsername: actor.username, actorId: actor.id,
      action: 'create', entity: 'portfolio-demo', entityId: key,
      summary: `ข้อมูลสมมติรายวัน ${day}: เพิ่มการรักษา 12 รายการ รวม 15 รายการต่อวัน`,
    } });
    return 'added';
  }, { timeout: 60000, maxWait: 60000 });
}

export function startDailyDemoScheduler() {
  if (!dailyDemoEnabled()) return;
  const run = () => addDailyDemoData().then(result => {
    if (result === 'added') logger.info('Added today’s fictional demo data');
  }).catch(err => logger.error({ err }, 'Daily demo generation failed; will retry'));
  void run();
  // First run at midnight; retry/catch up every 15 minutes after sleep or failure.
  cron.schedule('*/15 * * * *', () => { void run(); }, { timezone: 'Asia/Bangkok' });
}
