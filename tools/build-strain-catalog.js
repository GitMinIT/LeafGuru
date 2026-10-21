#!/usr/bin/env node
/**
 * Build the LeafGuru strain catalog from the Kushy cannabis dataset.
 *
 * Source : https://github.com/kushyapp/cannabis-dataset (MIT)
 *          Dataset/Strains/strains-kushy_api.2017-11-14.csv
 * Usage  : node tools/build-strain-catalog.js <path-to-strains.csv>
 * Output : static/js/data/strain-catalog.json
 *
 * The upstream rows carry name, breeder, type, effects, flavor, terpenes
 * and THC/CBD — but no grow times. Stage durations and expected height
 * are derived from the genotype (PROFILES below) so a catalog entry can
 * become a LeafGuru strain template directly.
 *
 * The file is stored columnar (arrays, not objects) to keep the payload
 * small: repeated JSON keys dominate the size otherwise.
 */
const fs = require("fs");
const path = require("path");

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("usage: node tools/build-strain-catalog.js <strains.csv>");
  process.exit(1);
}

// --- typical grow times per genotype (days) and expected height (cm) -------
const PROFILES = {
  indica: { seedling: 14, vegetative: 24, flowering: 56, height: 120 },
  sativa: { seedling: 14, vegetative: 35, flowering: 63, height: 220 },
  hybrid: { seedling: 14, vegetative: 30, flowering: 56, height: 160 },
  unknown: { seedling: 14, vegetative: 28, flowering: 56, height: 140 },
};

// upstream "type" values -> LeafGuru genotype
function toGenotype(type) {
  const t = (type || "").trim().toLowerCase();
  if (t === "indica") return "indica";
  if (t === "sativa") return "sativa";
  if (t === "hybrid") return "hybrid";
  return "unknown";
}

// upstream potency values mix two scales (x10 and x100) -> percent
function toPercent(raw) {
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) return null;
  const pct = v > 400 ? v / 100 : v / 10;
  return Math.min(40, Math.round(pct * 10) / 10);
}

function clean(value) {
  const s = (value ?? "").trim();
  if (!s || s === "NULL" || s === "null") return null;
  return s;
}

// --- CSV parser (quoted fields, escaped quotes) ---------------------------
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c !== "\r") field += c;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCSV(fs.readFileSync(csvPath, "utf8"));
const head = rows[0].map((h) => h.trim());
const idx = {};
head.forEach((h, i) => { idx[h] = i; });
const data = rows.slice(1);

const out = [];
const seen = new Set();

for (const r of data) {
  const name = clean(r[idx.name]);
  if (!name) continue;
  const key = name.toLowerCase();
  if (seen.has(key)) continue;   // 15 duplicate names upstream
  seen.add(key);

  const breeder = clean(r[idx.breeder]);
  const genotype = toGenotype(r[idx.type]);
  const effects = clean(r[idx.effects]);
  const flavor = clean(r[idx.flavor]);
  const terpenes = clean(r[idx.terpenes]);

  const traits = [];
  if (effects) traits.push(effects);
  if (flavor) traits.push(flavor);
  if (terpenes) traits.push(terpenes);

  out.push({
    name,
    breeder: breeder && breeder !== "Unknown Breeder" ? breeder : null,
    genotype,
    thc: toPercent(r[idx.thc]),
    cbd: toPercent(r[idx.cbd]),
    characteristics: traits.join(" · ") || null,
    featured: String(r[idx.status] ?? "").trim() === "1",
  });
}

// featured first (upstream order is a curated popularity list), then A-Z
out.sort((a, b) => {
  if (a.featured !== b.featured) return a.featured ? -1 : 1;
  return a.name.localeCompare(b.name);
});

const featuredCount = out.filter((s) => s.featured).length;

// columnar payload: [name, breeder, genotype, thc, cbd, characteristics]
const columns = ["name", "breeder", "genotype", "thc", "cbd", "characteristics"];
const payload = {
  version: 1,
  source: "kushyapp/cannabis-dataset (MIT)",
  featuredCount,
  columns,
  rows: out.map((s) => [s.name, s.breeder, s.genotype, s.thc, s.cbd, s.characteristics]),
};

const dest = path.join(__dirname, "..", "static", "js", "data", "strain-catalog.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(payload));

const counts = out.reduce((acc, s) => { acc[s.genotype] = (acc[s.genotype] || 0) + 1; return acc; }, {});
const size = fs.statSync(dest).size;
console.log(`wrote ${out.length} strains -> ${dest}`);
console.log(`  featured: ${featuredCount}`);
console.log(`  genotypes: ${JSON.stringify(counts)}`);
console.log(`  size: ${(size / 1024).toFixed(0)} KB raw`);
