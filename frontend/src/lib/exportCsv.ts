import { api } from '@/lib/api';
import Papa from 'papaparse';

export interface ExportColumn {
  key: string;
  header: string; // Thai CSV column header
}

export async function downloadCsv(
  rows: Record<string, any>[],
  columns: ExportColumn[],
  filename: string,
  entity: 'client' | 'treatment' | 'ortho-missed'
): Promise<void> {
  const data = rows.map(row =>
    Object.fromEntries(columns.map(col => [col.header, row[col.key] ?? '']))
  );
  const csv = Papa.unparse(data, { header: true });
  const bom = '﻿'; // UTF-8 BOM — required for Thai in Excel on Windows/Mac
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  await api.post('/api/audit/export', { entity, format: 'csv', count: rows.length, columns: columns.map(c => c.key) });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Format a JS Date as DD/MM/YYYY using Buddhist year
export function formatDateBuddhist(date: Date | string): string {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear() + 543;
  return `${day}/${month}/${year}`;
}

// YYYYMMDD (Gregorian) for export filenames.
export function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
