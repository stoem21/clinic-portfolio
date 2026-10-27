const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { spawnSync } = require('node:child_process');
const db = new PrismaClient();
const markerId = 'portfolio-demo-initialized-v1';

function runSeed(script) {
  const result = spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', `scripts/${script}`], {
    stdio: 'inherit', env: process.env,
  });
  if (result.error || result.status !== 0) throw new Error(`Mock seed failed: ${script}`);
}

function localizeDemo() {
  const result = spawnSync(process.execPath, ['scripts/demo-thai.cjs'], {stdio: 'inherit', env: process.env});
  if (result.error || result.status !== 0) throw new Error('Thai demo migration failed');
}

async function main() {
  const target = new URL(process.env.DATABASE_URL || '');
  if (process.env.DEMO_MODE !== 'true' || target.hostname !== 'clinic-db' || target.pathname !== '/clinic_demo') {
    throw new Error('Refusing initialization outside the isolated clinic_demo database.');
  }
  if (await db.auditLog.findUnique({ where: { id: markerId } })) {
    if (process.env.DEMO_AUTO_LOGIN === 'true') {
      await db.user.update({
        where: { username: process.env.DEMO_USERNAME || 'demo' },
        data: { role: 'SUPER_ADMIN', isActive: true, mustChangePassword: false },
      });
    }
    localizeDemo();
    console.log('Existing mock data and passwords preserved; demo role configured.');
    return;
  }
  const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  for (const { tablename } of tables) {
    const quoted = '"' + tablename.replaceAll('"', '""') + '"';
    const rows = await db.$queryRawUnsafe(`SELECT 1 FROM ${quoted} LIMIT 1`);
    if (rows.length) throw new Error('Database is not empty and has no demo marker. Refusing to replace any data.');
  }
  const demoUsername = process.env.DEMO_USERNAME || 'demo';
  if (demoUsername === 'demo-owner') throw new Error('DEMO_USERNAME must differ from demo-owner.');
  for (const key of ['DEMO_PASSWORD', 'DEMO_OWNER_PASSWORD']) {
    if (!process.env[key] || process.env[key].length < 12) throw new Error(`${key} must contain at least 12 characters.`);
  }
  await db.user.create({ data: {
    username: 'demo-owner', passwordHash: await bcrypt.hash(process.env.DEMO_OWNER_PASSWORD, 10),
    role: 'SUPER_ADMIN', mustChangePassword: false, totpBackupCodes: [],
  } });
  await db.user.create({ data: {
    username: demoUsername, passwordHash: await bcrypt.hash(process.env.DEMO_PASSWORD, 10),
    role: process.env.DEMO_AUTO_LOGIN === 'true' ? 'SUPER_ADMIN' : 'ADMIN', mustChangePassword: false, totpBackupCodes: [],
  } });
  runSeed('seedDemoEn.ts');
  runSeed('seedFrontdeskDemo.ts');
  await db.auditLog.create({ data: {
    id: markerId, actorUsername: 'demo-owner', action: 'create', entity: 'portfolio-demo',
    entityId: markerId, summary: 'Isolated fictional portfolio dataset initialized.',
  } });
  localizeDemo();
  console.log('Mock demo initialized. Login uses DEMO_USERNAME and DEMO_PASSWORD from .env.');
}

main().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => db.$disconnect());
