module.exports = function assertDemoTarget(env = process.env) {
  let target;
  try { target = new URL(env.DATABASE_URL || ''); } catch { throw Error('Set an isolated demo DATABASE_URL'); }
  if (env.DEMO_MODE !== 'true' || target.hostname !== 'clinic-db' || target.pathname !== '/clinic_demo') {
    throw Error('Fixture scripts only accept DEMO_MODE=true and clinic-db/clinic_demo');
  }
};
