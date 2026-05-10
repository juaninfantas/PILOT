#!/usr/bin/env node
/**
 * Genera migración SQL: comunidades autónomas (nivel 1) + provincias (nivel 2)
 * + municipios (nivel 3), España — alineado con GeoLevelDef de ES en geo_master.
 *
 * Ejecutar: npm run geo:regenerate-es-seed
 *
 * Municipios/provincias/CCAA desde CodeForSpain (INE):
 * https://github.com/codeforspain/ds-organizacion-administrativa
 */

import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../supabase/migrations/20260610100000_geo_es_mass_seed.sql");

const ES_ROOT = "f0000001-0000-4000-8000-0000000000e1";
const NS_CCAA = "00000000-0000-5000-a500-000000000010";
const NS_PROV = "00000000-0000-5000-a500-000000000011";
const NS_MUN = "00000000-0000-5000-a500-000000000012";

/** Código provincia INE (2 dígitos) → código comunidad INE CodeForSpain (autonomias.csv). */
const PROVINCE_TO_CCAA = {
  "01": "16",
  "02": "08",
  "03": "10",
  "04": "01",
  "05": "07",
  "06": "11",
  "07": "04",
  "08": "09",
  "09": "07",
  "10": "11",
  "11": "01",
  "12": "10",
  "13": "08",
  "14": "01",
  "15": "12",
  "16": "08",
  "17": "09",
  "18": "01",
  "19": "08",
  "20": "16",
  "21": "01",
  "22": "02",
  "23": "01",
  "24": "07",
  "25": "09",
  "26": "17",
  "27": "12",
  "28": "13",
  "29": "01",
  "30": "14",
  "31": "15",
  "32": "12",
  "33": "03",
  "34": "07",
  "35": "05",
  "36": "12",
  "37": "07",
  "38": "05",
  "39": "06",
  "40": "07",
  "41": "01",
  "42": "07",
  "43": "09",
  "44": "02",
  "45": "08",
  "46": "10",
  "47": "07",
  "48": "16",
  "49": "07",
  "50": "02",
  "51": "18",
  "52": "19",
};

const AUTON_URL =
  "https://raw.githubusercontent.com/codeforspain/ds-organizacion-administrativa/master/data/autonomias.csv";
const PROV_URL =
  "https://raw.githubusercontent.com/codeforspain/ds-organizacion-administrativa/master/data/provincias.csv";
const MUN_URL =
  "https://raw.githubusercontent.com/codeforspain/ds-organizacion-administrativa/master/data/municipios.csv";

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

function uuidCcaa(code) {
  return `uuid_generate_v5('${NS_CCAA}'::uuid, ${sqlStr(`pilotsuite:geo:ES:ccaa:${code}`)})`;
}

function uuidProv(code) {
  return `uuid_generate_v5('${NS_PROV}'::uuid, ${sqlStr(`pilotsuite:geo:ES:provincia:${code}`)})`;
}

function uuidMun(code) {
  return `uuid_generate_v5('${NS_MUN}'::uuid, ${sqlStr(`pilotsuite:geo:ES:municipio:${code}`)})`;
}

function batchedCCAAs(rows) {
  const tuples = [];
  for (const r of rows) {
    const code = String(r.autonomia_id).trim().padStart(2, "0");
    const name = String(r.nombre || "").trim();
    tuples.push(`
          (${uuidCcaa(code)}, 'ES'::text, '${ES_ROOT}'::uuid, 1::int, ${sqlStr(code)},
           ${sqlStr(name)},
           jsonb_build_object(${`'fuente', 'CodeForSpain/INE'::text`}, ${`'tipo', 'ccaa'::text`})
          )`);
  }
  return `
INSERT INTO public."GeoUnit" (id, country_code, parent_id, level_index, code, name, metadata)
VALUES ${tuples.join(",")}
ON CONFLICT (country_code, parent_id, code) DO NOTHING;
`;
}

function batchedProvincias(rows) {
  const chunks = [];
  const BATCH = 60;
  for (let start = 0; start < rows.length; start += BATCH) {
    const slice = rows.slice(start, start + BATCH);
    const tuples = [];
    for (const r of slice) {
      const code = String(r.provincia_id).trim().padStart(2, "0");
      const ccaa = PROVINCE_TO_CCAA[code];
      if (!ccaa) throw new Error(`Falta mapeo CCAA para provincia ${code}`);
      const name = String(r.nombre || "").trim();
      const parentUuid = uuidCcaa(ccaa.padStart(2, "0"));
      tuples.push(`
          (${uuidProv(code)}, 'ES'::text, ${parentUuid}, 2::int, ${sqlStr(code)},
           ${sqlStr(name)},
           jsonb_build_object(${`'fuente', 'CodeForSpain/INE'::text`}, ${`'autonomia_ine', ${sqlStr(ccaa)}::text`})
          )`);
    }
    chunks.push(`
INSERT INTO public."GeoUnit" (id, country_code, parent_id, level_index, code, name, metadata)
VALUES ${tuples.join(",")}
ON CONFLICT (country_code, parent_id, code) DO NOTHING;
`);
  }
  return chunks.join("\n");
}

function batchedMunicipios(rows) {
  const chunks = [];
  const BATCH = 100;
  for (let start = 0; start < rows.length; start += BATCH) {
    const slice = rows.slice(start, start + BATCH);
    const tuples = [];
    for (const r of slice) {
      const mid = String(r.municipio_id).trim();
      const prov = String(r.provincia_id).trim().padStart(2, "0");
      const name = String(r.nombre || "").trim();
      if (!mid || !prov) continue;
      const parentUuid = uuidProv(prov);
      const metaParts = [
        `'fuente', 'CodeForSpain/INE'::text`,
        `'provincia_id', ${sqlStr(prov)}::text`,
        `'cmun', ${sqlStr(String(r.cmun ?? "").trim())}::text`,
      ];
      if (String(r.dc ?? "").trim()) metaParts.push(`'dc', ${sqlStr(String(r.dc).trim())}::text`);
      tuples.push(`
          (${uuidMun(mid)}, 'ES'::text, ${parentUuid}, 3::int, ${sqlStr(mid)},
           ${sqlStr(name)},
           jsonb_build_object(${metaParts.join(", ")})
          )`);
    }
    if (!tuples.length) continue;
    chunks.push(`
INSERT INTO public."GeoUnit" (id, country_code, parent_id, level_index, code, name, metadata)
VALUES ${tuples.join(",")}
ON CONFLICT (country_code, parent_id, code) DO NOTHING;
`);
  }
  return chunks.join("\n");
}

console.error("Fetching autonomias...");
const autRows = parseCsv(await fetchText(AUTON_URL));
console.error(`CCAA: ${autRows.length}`);

console.error("Fetching provincias...");
const provRows = parseCsv(await fetchText(PROV_URL));
console.error(`provincias: ${provRows.length}`);

console.error("Fetching municipios...");
const munRows = parseCsv(await fetchText(MUN_URL));
console.error(`municipios: ${munRows.length}`);

const header = `-- Generado por scripts/generate-es-codeforspain-geo-seed.mjs
-- Comunidades (nivel 1) + provincias (nivel 2) + municipios (nivel 3). Raíz España ya existe (geo_master).
-- Fuente datos: github.com/codeforspain/ds-organizacion-administrativa (códigos INE).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

`;

const body =
  `${header}${batchedCCAAs(autRows)}\n${batchedProvincias(provRows)}\n${batchedMunicipios(munRows)}\n`;
writeFileSync(OUT, body, "utf8");
console.error("Wrote", OUT);
