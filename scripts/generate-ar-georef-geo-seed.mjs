#!/usr/bin/env node
/**
 * Genera migración SQL: departamentos + localidades Argentina (CSV masivo Georef).
 * Ejecutar: node scripts/generate-ar-georef-geo-seed.mjs > supabase/migrations/20260608120000_geo_ar_georef_mass_seed.sql
 *
 * Fuente: https://infra.datos.gob.ar/georef-dev/ (redirección de APIs Georef).
 */

import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../supabase/migrations/20260608120000_geo_ar_georef_mass_seed.sql");

const NS_DEPT = "00000000-0000-5000-a500-000000000001";
const NS_LOC = "00000000-0000-5000-a500-000000000002";

/** Misma tabla que 20260602200000_geo_master_property_share_location.sql (orden ISO). */
const PROVINCE_ISO_TO_UUID = {
  "AR-B": "f0000001-0000-4000-8000-000000000011",
  "AR-K": "f0000001-0000-4000-8000-000000000012",
  "AR-H": "f0000001-0000-4000-8000-000000000013",
  "AR-U": "f0000001-0000-4000-8000-000000000014",
  "AR-C": "f0000001-0000-4000-8000-000000000015",
  "AR-X": "f0000001-0000-4000-8000-000000000016",
  "AR-W": "f0000001-0000-4000-8000-000000000017",
  "AR-E": "f0000001-0000-4000-8000-000000000018",
  "AR-P": "f0000001-0000-4000-8000-000000000019",
  "AR-Y": "f0000001-0000-4000-8000-00000000001a",
  "AR-L": "f0000001-0000-4000-8000-00000000001b",
  "AR-F": "f0000001-0000-4000-8000-00000000001c",
  "AR-M": "f0000001-0000-4000-8000-00000000001d",
  "AR-N": "f0000001-0000-4000-8000-00000000001e",
  "AR-Q": "f0000001-0000-4000-8000-00000000001f",
  "AR-R": "f0000001-0000-4000-8000-000000000020",
  "AR-A": "f0000001-0000-4000-8000-000000000021",
  "AR-J": "f0000001-0000-4000-8000-000000000022",
  "AR-D": "f0000001-0000-4000-8000-000000000023",
  "AR-Z": "f0000001-0000-4000-8000-000000000024",
  "AR-S": "f0000001-0000-4000-8000-000000000025",
  "AR-G": "f0000001-0000-4000-8000-000000000026",
  "AR-V": "f0000001-0000-4000-8000-000000000027",
  "AR-T": "f0000001-0000-4000-8000-000000000028",
};

function splitCsv(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      if (c === '"') {
        inQ = false;
        continue;
      }
      cur += c;
    } else {
      if (c === '"') {
        inQ = true;
        continue;
      }
      if (c === ",") {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = splitCsv(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = splitCsv(lines[i]);
    const o = {};
    headers.forEach((h, j) => {
      o[h] = cols[j] ?? "";
    });
    rows.push(o);
  }
  return rows;
}

function sqlStr(s) {
  return "'" + String(s ?? "").replace(/'/g, "''") + "'";
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.text();
}

function batchedInsertDepartments(rows, provNumToIso) {
  const chunks = [];
  const BATCH = 200;
  for (let start = 0; start < rows.length; start += BATCH) {
    const slice = rows.slice(start, start + BATCH);
    const tuples = [];
    for (const r of slice) {
      const provId = String(r.provincia_id).trim();
      const iso = provNumToIso.get(provId);
      const parentUuid = iso ? PROVINCE_ISO_TO_UUID[iso] : null;
      if (!parentUuid) {
        console.error("skip dept: unknown provincia_id", provId, r.id);
        continue;
      }
      const code = String(r.id).trim();
      const name = String(r.nombre || "").trim();
      const lat = r.centroide_lat?.trim?.() ?? "";
      const lng = r.centroide_lon?.trim?.() ?? "";
      const metaParts = [`'fuente', 'Georef'::text`, `'categoria', ${sqlStr(r.categoria)}`];
      if (lat) metaParts.push(`'centroide_lat', ${lat}::double precision`);
      if (lng) metaParts.push(`'centroide_lon', ${lng}::double precision`);
      tuples.push(`(
          uuid_generate_v5('${NS_DEPT}'::uuid, ${sqlStr(`pilotsuite:geo:AR:departamento:${code}`)}),
          'AR'::text,
          '${parentUuid}'::uuid,
          2::int,
          ${sqlStr(code)},
          ${sqlStr(name)},
          jsonb_build_object(${metaParts.join(", ")})
      )`);
    }
    if (!tuples.length) continue;
    chunks.push(`
INSERT INTO public."GeoUnit" (id, country_code, parent_id, level_index, code, name, metadata)
VALUES
${tuples.join(",\n")}
ON CONFLICT (country_code, parent_id, code) DO NOTHING;
`);
  }
  return chunks.join("\n");
}

function batchedInsertLocalidades(rows, provNumToIso) {
  const chunks = [];
  const BATCH = 150;
  for (let start = 0; start < rows.length; start += BATCH) {
    const slice = rows.slice(start, start + BATCH);
    const tuples = [];
    for (const r of slice) {
      const deptCode = String(r.departamento_id).trim();
      const locCode = String(r.id).trim();
      const name = String(r.nombre || "").trim();
      const provId = String(r.provincia_id).trim();
      const iso = provNumToIso.get(provId);
      if (!iso || !locCode || !deptCode) continue;
      const lat = r.centroide_lat?.trim?.() ?? "";
      const lng = r.centroide_lon?.trim?.() ?? "";
      const deptIdSql = `uuid_generate_v5('${NS_DEPT}'::uuid, ${sqlStr(`pilotsuite:geo:AR:departamento:${deptCode}`)})`;
      const metaParts = [`'fuente', 'Georef'::text`, `'categoria', ${sqlStr(r.categoria)}`, `'provincia_id', ${sqlStr(provId)}`, `'departamento_id', ${sqlStr(deptCode)}`];
      if (lat) metaParts.push(`'centroide_lat', ${lat}::double precision`);
      if (lng) metaParts.push(`'centroide_lon', ${lng}::double precision`);
      tuples.push(`(
          uuid_generate_v5('${NS_LOC}'::uuid, ${sqlStr(`pilotsuite:geo:AR:localidad:${locCode}`)}),
          'AR'::text,
          ${deptIdSql},
          3::int,
          ${sqlStr(locCode)},
          ${sqlStr(name)},
          jsonb_build_object(${metaParts.join(", ")})
      )`);
    }
    if (!tuples.length) continue;
    chunks.push(`
INSERT INTO public."GeoUnit" (id, country_code, parent_id, level_index, code, name, metadata)
VALUES
${tuples.join(",\n")}
ON CONFLICT (country_code, parent_id, code) DO NOTHING;
`);
  }
  return chunks.join("\n");
}

const PROV_URL = "https://infra.datos.gob.ar/georef-dev/provincias.csv";
const DEPT_URL = "https://infra.datos.gob.ar/georef-dev/departamentos.csv";
const LOC_URL = "https://infra.datos.gob.ar/georef-dev/localidades.csv";

console.error("Fetching provincias...");
const provText = await fetchText(PROV_URL);
const provRows = parseCsv(provText);
const provNumToIso = new Map();
for (const p of provRows) {
  const id = String(p.id).trim();
  const iso = String(p.iso_id).trim().toUpperCase();
  provNumToIso.set(id, iso);
}

console.error("Fetching departamentos...");
const deptRows = parseCsv(await fetchText(DEPT_URL));
console.error(`departamentos: ${deptRows.length}`);

console.error("Fetching localidades...");
const locRows = parseCsv(await fetchText(LOC_URL));
console.error(`localidades: ${locRows.length}`);

const header = `-- Generado por scripts/generate-ar-georef-geo-seed.mjs (Georef infra.datos.gob.ar).
-- Departamentos (nivel 2) + localidades (nivel 3). Provincias nivel 1 ya están en geo_master.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

`;

const deptSql = batchedInsertDepartments(deptRows, provNumToIso);
const locSql = batchedInsertLocalidades(locRows, provNumToIso);

const body = `${header}${deptSql}\n${locSql}\n`;
writeFileSync(OUT, body, "utf8");
console.error("Wrote", OUT);
