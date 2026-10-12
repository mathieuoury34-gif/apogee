import { $t } from '../i18n';
// Lecteur minimal du format de fichier SQLite 3 (lecture seule), pour reprendre la base de l'ancienne
// application Android (Paramètres › Export › « Partager le fichier »). Sans dépendance : parcourt les
// arbres B des tables, suit les pages de débordement, décode les enregistrements.
// Limite : les transactions encore dans le journal WAL (fichier « -wal » séparé) ne sont pas lues.

export type SqlValue = number | string | null | Uint8Array;
export interface SqlTable { name: string; columns: string[]; rows: Record<string, SqlValue>[] }

export function readSqlite(buf: Uint8Array): Map<string, SqlTable> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = new TextDecoder().decode(buf.subarray(0, 15));
  if (magic !== 'SQLite format 3') throw new Error($t("ce fichier n’est pas une base SQLite"));
  let pageSize = dv.getUint16(16);
  if (pageSize === 1) pageSize = 65536;
  const reserved = buf[20];
  const usable = pageSize - reserved;
  if (dv.getUint32(56) !== 1) throw new Error($t("encodage de texte non pris en charge"));
  const utf8 = new TextDecoder();

  const pageAt = (n: number) => (n - 1) * pageSize;

  function varint(off: number): [number, number] {
    let v = 0;
    for (let i = 0; i < 8; i++) {
      const b = buf[off + i];
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return [v, i + 1];
    }
    return [v * 256 + buf[off + 8], 9];
  }

  function payload(cellOff: number, total: number, headerLen: number): Uint8Array {
    const start = cellOff + headerLen;
    const X = usable - 35;
    if (total <= X) return buf.subarray(start, start + total);
    const M = Math.floor(((usable - 12) * 32) / 255) - 23;
    const K = M + ((total - M) % (usable - 4));
    const local = K <= X ? K : M;
    const out = new Uint8Array(total);
    out.set(buf.subarray(start, start + local), 0);
    let filled = local;
    let next = dv.getUint32(start + local);
    while (next && filled < total) {
      const p = pageAt(next);
      const n = Math.min(usable - 4, total - filled);
      out.set(buf.subarray(p + 4, p + 4 + n), filled);
      filled += n;
      next = dv.getUint32(p);
    }
    return out;
  }

  function decodeRecord(rec: Uint8Array): SqlValue[] {
    const rdv = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
    const vi = (o: number): [number, number] => {
      let v = 0;
      for (let i = 0; i < 8; i++) { const b = rec[o + i]; v = v * 128 + (b & 0x7f); if (!(b & 0x80)) return [v, i + 1]; }
      return [v * 256 + rec[o + 8], 9];
    };
    const [hsize, hl] = vi(0);
    const types: number[] = [];
    for (let o = hl; o < hsize;) { const [t, l] = vi(o); types.push(t); o += l; }
    const out: SqlValue[] = [];
    let o = hsize;
    const int = (n: number) => {
      let v = 0;
      for (let i = 0; i < n; i++) v = v * 256 + rec[o + i];
      if (rec[o] & 0x80) v -= Math.pow(2, 8 * n);
      return v;
    };
    for (const t of types) {
      if (t === 0) out.push(null);
      else if (t >= 1 && t <= 6) { const n = [0, 1, 2, 3, 4, 6, 8][t]; out.push(int(n)); o += n; }
      else if (t === 7) { out.push(rdv.getFloat64(o)); o += 8; }
      else if (t === 8) out.push(0);
      else if (t === 9) out.push(1);
      else if (t >= 12 && t % 2 === 0) { const n = (t - 12) / 2; out.push(rec.slice(o, o + n)); o += n; }
      else if (t >= 13) { const n = (t - 13) / 2; out.push(utf8.decode(rec.subarray(o, o + n))); o += n; }
      else out.push(null);
    }
    return out;
  }

  function walk(page: number, cb: (rowid: number, values: SqlValue[]) => void, guard = 0) {
    if (guard > 64) throw new Error($t("arbre trop profond (fichier endommagé ?)"));
    const base = pageAt(page);
    const h = page === 1 ? base + 100 : base;
    const type = buf[h];
    const count = dv.getUint16(h + 3);
    const ptrs = h + (type === 0x05 ? 12 : 8);
    for (let i = 0; i < count; i++) {
      const cell = base + dv.getUint16(ptrs + 2 * i);
      if (type === 0x0d) {
        const [plen, a] = varint(cell);
        const [rowid, b] = varint(cell + a);
        cb(rowid, decodeRecord(payload(cell, plen, a + b)));
      } else if (type === 0x05) {
        walk(dv.getUint32(cell), cb, guard + 1);
      } else return; // page d'index : ignorée
    }
    if (type === 0x05) walk(dv.getUint32(h + 8), cb, guard + 1);
  }

  const tables = new Map<string, SqlTable>();
  const schema: { name: string; root: number; sql: string }[] = [];
  walk(1, (_r, v) => { if (v[0] === 'table' && typeof v[1] === 'string' && typeof v[3] === 'number') schema.push({ name: v[1], root: v[3], sql: String(v[4] ?? '') }); });
  for (const t of schema) {
    if (t.name.startsWith('sqlite_')) continue;
    const { columns, rowidAlias } = parseColumns(t.sql);
    const rows: Record<string, SqlValue>[] = [];
    walk(t.root, (rowid, values) => {
      const row: Record<string, SqlValue> = {};
      columns.forEach((c, i) => { row[c] = i < values.length ? values[i] : null; });
      if (rowidAlias) row[rowidAlias] = rowid;
      rows.push(row);
    });
    tables.set(t.name, { name: t.name, columns, rows });
  }
  return tables;
}

function parseColumns(sql: string): { columns: string[]; rowidAlias: string | null } {
  const body = sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')'));
  const parts: string[] = [];
  let depth = 0, cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  const columns: string[] = [];
  let rowidAlias: string | null = null;
  for (const p of parts) {
    const s = p.trim();
    if (/^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK)\b/i.test(s)) continue;
    const m = /^[`"[]?([^`"\]\s]+)[`"\]]?\s*(.*)$/s.exec(s);
    if (!m) continue;
    columns.push(m[1]);
    if (/^integer\s+primary\s+key/i.test(m[2].trim())) rowidAlias = m[1];
  }
  return { columns, rowidAlias };
}
