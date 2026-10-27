import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';

const SCHEDULE_FILE = path.resolve(__dirname, '../../backup-schedule.json');
const DEFAULT_CRON = '0 2 * * *';

let currentTask: ReturnType<typeof cron.schedule> | null = null;
let _runFn: (() => Promise<unknown>) | null = null;

export function loadCron(): string {
  try {
    const json = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
    if (typeof json.cron === 'string' && cron.validate(json.cron)) return json.cron;
  } catch {
    /* use default */
  }
  return DEFAULT_CRON;
}

export function saveCron(expr: string): void {
  if (!cron.validate(expr)) throw new Error('Invalid cron expression');
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify({ cron: expr }, null, 2));
}

function humanize(expr: string): string {
  const parts = expr.split(' ');
  if (
    parts.length === 5 &&
    /^\d+$/.test(parts[0]) &&
    /^\d+$/.test(parts[1]) &&
    parts[2] === '*'
  ) {
    return `ทุกวัน เวลา ${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')}`;
  }
  return expr;
}

export function getScheduleInfo(): { cron: string; humanReadable: string } {
  const expr = loadCron();
  return { cron: expr, humanReadable: humanize(expr) };
}

export function applySchedule(): void {
  if (!_runFn) return;
  currentTask?.stop();
  currentTask = null;
  const expr = loadCron();
  currentTask = cron.schedule(expr, () => {
    logger.info('Scheduled backup starting');
    _runFn!().catch((err) => logger.error({ err }, 'Scheduled backup failed'));
  });
  logger.info({ cron: expr }, 'Backup scheduler started');
}

export function startScheduler(runFn: () => Promise<unknown>): void {
  _runFn = runFn;
  applySchedule();
}
