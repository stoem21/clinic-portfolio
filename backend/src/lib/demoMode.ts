/** Passwordless access is restricted to the isolated portfolio database. */
export function isDemoAutoLoginEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.DEMO_MODE !== 'true' || env.DEMO_AUTO_LOGIN !== 'true') return false;
  try {
    const target = new URL(env.DATABASE_URL || '');
    return target.hostname === 'clinic-db' && target.pathname === '/clinic_demo';
  } catch { return false; }
}
