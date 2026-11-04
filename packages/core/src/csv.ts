/** Celda CSV (RFC 4180). Neutraliza fórmulas: nombres de negocios vienen de terceros y Excel ejecutaría "=...". */
export function csvCell(value: unknown, opts: { raw?: boolean } = {}): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (!opts.raw && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** BOM + encabezados + filas, para que Excel abra bien los acentos. `rawColumns`: columnas confiables (teléfono E.164, que empieza con +). */
export function toCsv(headers: string[], rows: unknown[][], rawColumns: number[] = []): string {
  const raw = new Set(rawColumns);
  const lines = [headers.map((h) => csvCell(h)), ...rows.map((r) => r.map((v, i) => csvCell(v, { raw: raw.has(i) })))];
  return `﻿${lines.map((l) => l.join(",")).join("\r\n")}\r\n`;
}
