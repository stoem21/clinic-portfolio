/**
 * Wipe all real clinical data and replace it with a coherent MOCK demo
 * dataset in English — for demoing the app (e.g. to a job interviewer)
 * without showing real patient records. User accounts are left untouched so
 * existing logins keep working.
 *
 * Addresses use real, verified English place names pulled from the same
 * geothai-derived dataset the address picker uses (not fabricated
 * transliterations) — see frontend/src/lib/thaiGeoData.json.
 *
 * nameTitle/gender are stored as the same literal Thai values the client
 * form's picker uses (นาย/นาง/... , ชาย/หญิง/...) — this matches how real
 * data is stored, so editing a demo record through the app works exactly
 * like editing a real one, and English UI mode already translates the
 * displayed label via NAME_TITLE_KEYS/GENDER_KEYS. Only free-text fields
 * (names, addresses, notes) are authored in English directly.
 *
 * Usage: ts-node scripts/seedDemoEn.ts [--dentists=N] [--clients=N] [--treatments=N]
 *   (or: npm run seed:demo-en)
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { generateHn } from '../src/lib/generateHn';
import { generateReceiptNumber } from '../src/lib/generateReceiptNumber';
import { thaiBahtText } from '../src/lib/thaiBahtText';

require('./assert-demo-target.cjs')();
const prisma = new PrismaClient();

/* ----------------------------------------------------------- random utils -- */
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const randInt = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const chance = (p: number) => Math.random() < p;
function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}
function argNum(name: string, dflt: number): number {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? Number(a.split('=')[1]) || dflt : dflt;
}

/* --------------------------------------------------------------- pools ----- */
const FIRST_M = ['James', 'Michael', 'Robert', 'David', 'Daniel', 'Kevin', 'Andrew', 'Matthew', 'Christopher', 'Joseph'];
const FIRST_F = ['Sarah', 'Emily', 'Jessica', 'Amanda', 'Jennifer', 'Lisa', 'Michelle', 'Karen', 'Laura', 'Emma'];
const LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Anderson'];
const DENTIST_NAMES = [
  'Dr. James Wilson', 'Dr. Sarah Chen', 'Dr. Michael Reed', 'Dr. Karen Tan',
  'Dr. Daniel Park', 'Dr. Emma Lewis', 'Dr. Andrew Cruz', 'Dr. Michelle Ford',
  'Dr. Kevin Ortiz', 'Dr. Laura Bennett',
];
// Real, verified English place names + postal codes (from the geothai-derived
// dataset — see thaiAddress.ts), not fabricated transliterations.
const ADDRESSES = [
  { sub: 'Si Lom', dist: 'Bang Rak', prov: 'Bangkok', zip: '10500' },
  { sub: 'Su Thep', dist: 'Mueang Chiang Mai', prov: 'Chiang Mai', zip: '50200' },
  { sub: 'Hat Yai', dist: 'Hat Yai', prov: 'Songkhla', zip: '90110' },
  { sub: 'Nai Mueang', dist: 'Mueang Nakhon Ratchasima', prov: 'Nakhon Ratchasima', zip: '30000' },
  { sub: 'Talat Yai', dist: 'Mueang Phuket', prov: 'Phuket', zip: '83000' },
  { sub: 'Nong Prue', dist: 'Bang Lamung', prov: 'Chon Buri', zip: '20150' },
];
const MEDCON = ['Diabetes', 'Hypertension', 'Heart Disease', 'Asthma'];
const ALLERGY = ['Penicillin', 'Aspirin', 'Ibuprofen'];
const NOTES = ['Follow-up scheduled', 'Patient cooperative', 'Oral hygiene advice given'];
const OTHERS_TEXT = ['Dental checkup', 'Consultation', 'Suture removal'];

const TEETH = [
  '11', '12', '13', '14', '15', '16', '17', '18', '21', '22', '23', '24', '25', '26', '27', '28',
  '31', '32', '33', '34', '35', '36', '37', '38', '41', '42', '43', '44', '45', '46', '47', '48',
];
const PEDI = ['51', '52', '53', '54', '55', '61', '62', '63', '64', '65', '71', '72', '73', '74', '75', '81', '82', '83', '84', '85'];

// Literal Thai values — matches ClientForm.tsx's fixed picker options exactly.
const TITLE_M = 'นาย';
const TITLES_F = ['นาง', 'นางสาว'];
const TITLE_BOY = 'เด็กชาย';
const TITLE_GIRL = 'เด็กหญิง';
const TITLE_OTHER = 'คุณ';
const GENDER_M = 'ชาย';
const GENDER_F = 'หญิง';
const GENDER_OTHER = 'อื่นๆ';

type Persona = 'adultM' | 'adultF' | 'boy' | 'girl' | 'other';

function makePerson() {
  const persona: Persona = pick<Persona>(['adultM', 'adultF', 'boy', 'girl', 'adultM', 'adultF', 'other']);
  let nameTitle: string;
  let gender: string;
  let first: string;
  let age: number;
  switch (persona) {
    case 'adultM': nameTitle = TITLE_M; gender = GENDER_M; first = pick(FIRST_M); age = randInt(18, 75); break;
    case 'adultF': nameTitle = pick(TITLES_F); gender = GENDER_F; first = pick(FIRST_F); age = randInt(18, 75); break;
    case 'boy': nameTitle = TITLE_BOY; gender = GENDER_M; first = pick(FIRST_M); age = randInt(2, 14); break;
    case 'girl': nameTitle = TITLE_GIRL; gender = GENDER_F; first = pick(FIRST_F); age = randInt(2, 14); break;
    default: nameTitle = TITLE_OTHER; gender = GENDER_OTHER; first = pick([...FIRST_M, ...FIRST_F]); age = randInt(18, 60);
  }
  const birthday = new Date();
  birthday.setFullYear(birthday.getFullYear() - age, randInt(0, 11), randInt(1, 28));
  return { nameTitle, gender, firstName: first, lastName: pick(LAST), birthday };
}

const phone = () => `0${pick(['6', '8', '9'])}${randInt(10000000, 99999999)}`;
const nationalId = () => String(randInt(1, 8)) + String(randInt(1000000000000, 9999999999999)).slice(0, 12);

const ITEM_TYPES = [
  'extraction', 'surgicalRemoval', 'scaling', 'rootPlaning', 'filling', 'rootCanalTreatment',
  'removableDentures', 'post', 'crown', 'implant', 'ortho', 'bleaching', 'fluoride', 'xRay', 'pediatrics', 'others',
];
function makeItem(): { type: string; data: Prisma.InputJsonValue; price: Prisma.Decimal | null } {
  const type = pick(ITEM_TYPES);
  let data: Record<string, unknown> = {};
  switch (type) {
    case 'extraction':
    case 'surgicalRemoval':
    case 'post':
      data = { tooth: sample(TEETH, randInt(1, 3)) }; break;
    case 'scaling':
      data = { area: sample(['top', 'bottom'], randInt(1, 2)) }; break;
    case 'rootPlaning':
      data = chance(0.5) ? { area: sample(['Q1', 'Q2', 'Q3', 'Q4'], randInt(1, 2)) } : { tooth: sample(TEETH, 2) }; break;
    case 'filling':
      data = { otherText: `${pick(TEETH)}(O) CF` }; break;
    case 'rootCanalTreatment':
      data = { tooth: pick(TEETH), rootType: sample(['oc', 'lt', 'mi', 'frc'], randInt(1, 2)) }; break;
    case 'removableDentures':
      data = { type: pick(['TP', 'RPD', 'VP', 'CD']), tooth: sample(TEETH, randInt(1, 4)) }; break;
    case 'crown':
      data = { tooth: sample(TEETH, 1), type: pick(['fullMetal', 'pfm', 'allCeramic', 'veneer']) }; break;
    case 'implant':
      data = { tooth: sample(TEETH, 1), note: chance(0.3) ? 'bone graft' : '' }; break;
    case 'ortho':
      data = chance(0.6)
        ? { activity: ['adjust'], month: String(randInt(1, 18)) }
        : { activity: sample(['printMount', 'bondUpper', 'bondLower', 'rtnUpper'], randInt(1, 2)) }; break;
    case 'bleaching': data = { otherText: 'in-office bleaching' }; break;
    case 'fluoride': data = { otherText: 'topical fluoride application' }; break;
    case 'xRay':
      data = chance(0.5) ? { type: 'small', tooth: sample(TEETH, randInt(1, 2)) } : { type: 'big', filmType: ['opg'] }; break;
    case 'pediatrics':
      data = chance(0.5)
        ? { treatmentType: pick(['extraction', 'rootCanal', 'ssc']), tooth: sample(PEDI, 1) }
        : { treatmentType: 'filling', fillings: [{ tooth: pick(PEDI), side: pick(['o', 'm', 'd']) }] }; break;
    default: data = { otherText: pick(OTHERS_TEXT) };
  }
  const price = chance(0.6) ? new Prisma.Decimal(randInt(3, 60) * 100) : null;
  return { type, data: data as Prisma.InputJsonValue, price };
}

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

/* ------------------------------------------------------------- wipe step -- */
async function wipeClinicalData() {
  console.log('Wiping existing clinical data (user accounts are kept) ...');
  await prisma.auditLog.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.receiptCounter.deleteMany();
  await prisma.labWork.deleteMany();
  await prisma.treatmentPayment.deleteMany();
  await prisma.treatmentItem.deleteMany();
  await prisma.treatmentRecord.deleteMany();
  await prisma.client.deleteMany();
  await prisma.dentist.deleteMany();
  await prisma.hnCounter.deleteMany();
}

async function main() {
  const target = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.DEMO_MODE !== 'true' || target.hostname !== 'clinic-db' || target.pathname !== '/clinic_demo') throw new Error('Only the isolated clinic_demo database is permitted');
  const nDentists = argNum('dentists', 8);
  const nClients = argNum('clients', 50);
  const nTreatments = argNum('treatments', 150);

  await wipeClinicalData();

  const existingUser = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });

  // Dentists
  console.log(`Creating ${nDentists} dentists ...`);
  const dentistIds: string[] = [];
  const orthoDentistIds: string[] = [];
  const usedLic = new Set<string>();
  for (let i = 0; i < nDentists; i++) {
    let licenseId = `D${randInt(10000, 99999)}`;
    while (usedLic.has(licenseId)) licenseId = `D${randInt(10000, 99999)}`;
    usedLic.add(licenseId);
    const isOrtho = chance(0.4);
    const d = await prisma.dentist.create({
      data: {
        name: DENTIST_NAMES[i % DENTIST_NAMES.length] + (i >= DENTIST_NAMES.length ? ` ${i}` : ''),
        phoneNumber: phone(),
        licenseId,
        email: chance(0.6) ? `dentist${i}@clinic.test` : null,
        isOrthoDent: isOrtho,
        isActive: chance(0.85),
      },
    });
    dentistIds.push(d.id);
    if (isOrtho) orthoDentistIds.push(d.id);
    await prisma.auditLog.create({
      data: {
        actorId: existingUser?.id ?? null,
        actorUsername: existingUser?.username ?? 'seed',
        action: 'create',
        entity: 'dentist',
        entityId: d.id,
        summary: d.name,
      },
    });
  }

  // Clients
  console.log(`Creating ${nClients} clients ...`);
  const clientIds: string[] = [];
  for (let i = 0; i < nClients; i++) {
    const p = makePerson();
    const hn = await generateHn();
    const addr = chance(0.5) ? pick(ADDRESSES) : null;
    const c = await prisma.client.create({
      data: {
        hn,
        nameTitle: p.nameTitle,
        firstName: p.firstName,
        lastName: p.lastName,
        gender: p.gender,
        birthday: p.birthday,
        phoneNumber: phone(),
        nationalId: chance(0.7) ? nationalId() : null,
        orthoDentId: orthoDentistIds.length && chance(0.3) ? pick(orthoDentistIds) : null,
        addressSubDistrict: addr?.sub ?? null,
        addressDistrict: addr?.dist ?? null,
        addressProvince: addr?.prov ?? null,
        addressZipCode: addr?.zip ?? null,
        medCon: chance(0.2) ? pick(MEDCON) : null,
        drugAllergy: chance(0.15) ? pick(ALLERGY) : null,
        drugEat: chance(0.1) ? pick(MEDCON) : null,
      },
    });
    clientIds.push(c.id);
    if (i < 15) {
      await prisma.auditLog.create({
        data: {
          actorId: existingUser?.id ?? null,
          actorUsername: existingUser?.username ?? 'seed',
          action: 'create',
          entity: 'client',
          entityId: c.id,
          summary: `${c.hn} ${c.nameTitle}${c.firstName} ${c.lastName}`,
        },
      });
    }
  }

  // Treatment records (+ structured items + a matching cash payment)
  console.log(`Creating ${nTreatments} treatment records ...`);
  const recordIds: { id: string; total: number }[] = [];
  for (let i = 0; i < nTreatments; i++) {
    const treatmentDate = daysAgo(randInt(0, 365));
    const items = Array.from({ length: randInt(1, 3) }, makeItem);
    const total = items.reduce((sum, it) => sum + (it.price ? Number(it.price) : 0), 0);
    const record = await prisma.treatmentRecord.create({
      data: {
        clientId: pick(clientIds),
        dentistId: pick(dentistIds),
        treatmentDate,
        note: chance(0.3) ? pick(NOTES) : null,
        items: {
          create: items.map((it) => ({ type: it.type, data: it.data, price: it.price })),
        },
        payments: total > 0 ? { create: [{ type: 'cash', amount: new Prisma.Decimal(total) }] } : undefined,
      },
    });
    recordIds.push({ id: record.id, total });
  }

  // Lab work — a handful of rows covering every state the Lab Work page and
  // the dashboard's per-dentist lab cost table can show.
  console.log('Creating lab-work rows ...');
  const labStates: { cost: number | null; delivered: boolean; placementPaid: boolean; deliveredPaid: boolean }[] = [
    { cost: null, delivered: false, placementPaid: false, deliveredPaid: false },
    { cost: 1500, delivered: false, placementPaid: false, deliveredPaid: false },
    { cost: 8000, delivered: true, placementPaid: false, deliveredPaid: false },
    { cost: 12000, delivered: true, placementPaid: true, deliveredPaid: false },
    { cost: 2000, delivered: true, placementPaid: true, deliveredPaid: true },
    { cost: 6000, delivered: true, placementPaid: true, deliveredPaid: true },
  ];
  for (const state of labStates) {
    const rec = pick(recordIds);
    const placementDentistId = pick(dentistIds);
    let deliveredDentistId: string | null = null;
    if (state.delivered) {
      deliveredDentistId = pick(dentistIds.filter((id) => id !== placementDentistId));
    }
    await prisma.labWork.create({
      data: {
        treatmentRecordId: rec.id,
        type: pick(['rtn', 'implant', 'denture']),
        placementDentistId,
        deliveredDentistId,
        cost: state.cost === null ? null : new Prisma.Decimal(state.cost),
        placementPaid: state.placementPaid,
        placementPaidAt: state.placementPaid ? new Date() : null,
        deliveredPaid: state.deliveredPaid,
        deliveredPaidAt: state.deliveredPaid ? new Date() : null,
      },
    });
  }

  // Receipts — a few individual + a couple of bulk, tied to real records.
  console.log('Creating receipts ...');
  const receiptables = recordIds.filter((r) => r.total > 0);
  const individualSample = sample(receiptables, Math.min(5, receiptables.length));
  for (const rec of individualSample) {
    const client = await prisma.client.findFirst({ where: { treatments: { some: { id: rec.id } } } });
    const { number, buddhistYear } = await generateReceiptNumber();
    const lineItems = [{ label: 'Dental treatment', amount: rec.total }];
    await prisma.receipt.create({
      data: {
        number,
        buddhistYear,
        kind: 'individual',
        customerName: client ? `${client.firstName} ${client.lastName}` : 'Walk-in Patient',
        patientHn: client?.hn ?? null,
        issueDate: daysAgo(randInt(0, 30)),
        lineItems,
        totalAmount: new Prisma.Decimal(rec.total),
        amountText: thaiBahtText(rec.total),
        treatmentRecordIds: [rec.id],
        issuedById: existingUser?.id ?? null,
      },
    });
  }
  for (let i = 0; i < 2; i++) {
    const bulkSample = sample(receiptables, Math.min(3, receiptables.length));
    if (bulkSample.length === 0) break;
    const total = bulkSample.reduce((sum, r) => sum + r.total, 0);
    const { number, buddhistYear } = await generateReceiptNumber();
    await prisma.receipt.create({
      data: {
        number,
        buddhistYear,
        kind: 'bulk',
        customerName: 'Social Security Office',
        issueDate: daysAgo(randInt(0, 30)),
        lineItems: bulkSample.map((r) => ({ label: 'Dental treatment', amount: r.total })),
        totalAmount: new Prisma.Decimal(total),
        amountText: thaiBahtText(total),
        treatmentRecordIds: bulkSample.map((r) => r.id),
        issuedById: existingUser?.id ?? null,
      },
    });
  }

  const [cd, dd, td, itd, lwd, rd] = await Promise.all([
    prisma.client.count(), prisma.dentist.count(),
    prisma.treatmentRecord.count(), prisma.treatmentItem.count(),
    prisma.labWork.count(), prisma.receipt.count(),
  ]);
  console.log(`\nDone. DB now has: clients=${cd}, dentists=${dd}, records=${td}, items=${itd}, labWork=${lwd}, receipts=${rd}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
