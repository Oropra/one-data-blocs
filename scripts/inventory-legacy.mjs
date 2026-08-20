#!/usr/bin/env node
/**
 * inventory-legacy.mjs — parse the legacy WeWeb/OD.define frontend modules and
 * produce the migration baseline inventory (docs/modernization/*).
 *
 * Usage:
 *   node scripts/inventory-legacy.mjs           # write docs + JSON report
 *   node scripts/inventory-legacy.mjs --check   # verify completeness, non-zero on gaps
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const checkMode = process.argv.includes('--check');

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function extractAll(re, text, group = 1) {
  const out = new Set();
  for (const m of text.matchAll(re)) if (m[group]) out.add(m[group]);
  return [...out].sort();
}

const files = readdirSync(root).filter((f) => f.endsWith('.js')).sort();
const modules = [];
const globalTables = new Map();
const globalRpcs = new Map();
const globalFunctions = new Map();
const globalBuckets = new Map();
const globalChannels = new Map();
const globalWindow = new Map();
const globalEvents = new Map();
const globalUrls = new Map();
const globalUuids = new Map();

const addTo = (map, key, file) => {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(file);
};

for (const file of files) {
  const text = readFileSync(join(root, file), 'utf8');
  const lines = text.split('\n').length;

  const defines = extractAll(/OD\.define\(\s*['"]([^'"]+)['"]/g, text);
  const requires = extractAll(/requires\s*:\s*\[([^\]]*)\]/g, text)
    .flatMap((s) => s.split(',').map((x) => x.trim().replace(/['"]/g, '')).filter(Boolean));
  const mounts = extractAll(/data-od-module\s*=\s*["']([^"']+)["']/g, text)
    .concat(extractAll(/querySelector\(\s*['"]\[data-od-module=['"]([^'"]+)['"]\]/g, text));

  const tables = extractAll(/\.from\(\s*['"]([a-zA-Z0-9_]+)['"]/g, text);
  const rpcs = extractAll(/\.rpc\(\s*['"]([a-zA-Z0-9_]+)['"]/g, text);
  const fns = extractAll(/functions\.invoke\(\s*['"]([a-zA-Z0-9_-]+)['"]/g, text);
  const buckets = extractAll(/storage\.from\(\s*['"]([a-zA-Z0-9_-]+)['"]/g, text);
  const channels = extractAll(/\.channel\(\s*['"]([^'"]+)['"]/g, text);
  const winGlobals = extractAll(/window\.(__[A-Za-z0-9_]+|oropra[A-Za-z0-9_]*)/g, text);
  const events = extractAll(/(?:dispatchEvent|addEventListener)\(\s*['"]([a-zA-Z0-9:_-]+)['"]/g, text)
    .concat(extractAll(/new CustomEvent\(\s*['"]([^'"]+)['"]/g, text));
  const urls = extractAll(/https?:\/\/[^'"\s)]+/g, text, 0);
  const uuids = extractAll(UUID_RE, text, 0);

  for (const t of tables) addTo(globalTables, t, file);
  for (const r of rpcs) addTo(globalRpcs, r, file);
  for (const f of fns) addTo(globalFunctions, f, file);
  for (const b of buckets) addTo(globalBuckets, b, file);
  for (const c of channels) addTo(globalChannels, c, file);
  for (const w of winGlobals) addTo(globalWindow, w, file);
  for (const e of events) addTo(globalEvents, e, file);
  for (const u of urls) addTo(globalUrls, u, file);
  for (const u of uuids) addTo(globalUuids, u, file);

  const hasPoll = /setInterval\s*\(/.test(text);
  const hasMockFallback = /mock|MOCK/.test(text);

  if (defines.length === 0) {
    modules.push({ file, key: '', lines, note: 'NO OD.define FOUND', tables: [], rpcs: [], fns: [], winGlobals, events, hasPoll, hasMockFallback });
    continue;
  }
  for (const key of defines) {
    modules.push({
      file, key, lines, requires: requires.join('|'), mounts: mounts.join('|'),
      tables: tables.join('|'), rpcs: rpcs.join('|'), fns: fns.join('|'),
      buckets: buckets.join('|'), channels: channels.join('|'),
      winGlobals: winGlobals.join('|'), events: events.join('|'),
      hasPoll, hasMockFallback, note: '',
    });
  }
}

// ---- outputs ----
mkdirSync(join(root, 'docs/modernization'), { recursive: true });

const csvHeader = 'file,module_key,lines,requires,mount_anchors,tables,rpcs,edge_functions,storage_buckets,realtime_channels,window_globals,dom_events,polling,mock_fallback,note\n';
const csvRows = modules.map((m) => [
  m.file, m.key, m.lines, m.requires ?? '', m.mounts ?? '',
  `"${m.tables}"`, `"${m.rpcs}"`, `"${m.fns}"`, `"${m.buckets ?? ''}"`, `"${m.channels ?? ''}"`,
  `"${m.winGlobals}"`, `"${m.events}"`, m.hasPoll ? 'yes' : 'no', m.hasMockFallback ? 'yes' : 'no', m.note,
].join(','));
writeFileSync(join(root, 'docs/modernization/module-inventory.csv'), csvHeader + csvRows.join('\n') + '\n');

const mapToObj = (m) => Object.fromEntries([...m.entries()].map(([k, v]) => [k, [...v].sort()]));
const report = {
  generatedAt: new Date().toISOString(),
  moduleCount: modules.filter((m) => m.key).length,
  filesWithoutDefine: modules.filter((m) => !m.key).map((m) => m.file),
  tables: mapToObj(globalTables),
  rpcs: mapToObj(globalRpcs),
  edgeFunctions: mapToObj(globalFunctions),
  storageBuckets: mapToObj(globalBuckets),
  realtimeChannels: mapToObj(globalChannels),
  windowGlobals: mapToObj(globalWindow),
  domEvents: mapToObj(globalEvents),
  externalUrls: mapToObj(globalUrls),
  uuids: mapToObj(globalUuids),
};
writeFileSync(join(root, 'docs/modernization/inventory-report.json'), JSON.stringify(report, null, 2));

const section = (title, map) => {
  const keys = [...map.keys()].sort();
  return `\n## ${title} (${keys.length})\n\n` + keys.map((k) => `- \`${k}\` — ${[...map.get(k)].sort().join(', ')}`).join('\n') + '\n';
};

writeFileSync(join(root, 'docs/modernization/integration-inventory.md'),
  `# Legacy Integration Inventory\n\nGenerated by scripts/inventory-legacy.mjs on ${report.generatedAt}.\n`
  + section('Tables / Views', globalTables)
  + section('RPCs', globalRpcs)
  + section('Edge Functions', globalFunctions)
  + section('Storage Buckets', globalBuckets)
  + section('Realtime Channels', globalChannels)
  + section('Window Globals', globalWindow)
  + section('DOM / Custom Events', globalEvents)
  + section('External URLs', globalUrls)
  + section('UUID literals (WeWeb pages/variables/workflows)', globalUuids));

// Known non-module files: socle.js is the module loader itself, oropra-doublons.js
// is a shared duplicate-detection helper consumed by other modules.
const KNOWN_NON_MODULES = new Set(['socle.js', 'oropra-doublons.js']);

// ---- check mode ----
const errors = [];
const defineCount = report.moduleCount;
if (defineCount !== 43) errors.push(`expected 43 OD.define modules, found ${defineCount}`);
for (const f of report.filesWithoutDefine) {
  if (!KNOWN_NON_MODULES.has(f)) errors.push(`file without OD.define: ${f}`);
}
if (globalRpcs.size === 0) errors.push('no RPC usage detected — parser likely broken');
if (globalTables.size === 0) errors.push('no table usage detected — parser likely broken');

console.log(`modules: ${defineCount}, tables/views: ${globalTables.size}, rpcs: ${globalRpcs.size}, edge functions: ${globalFunctions.size}, buckets: ${globalBuckets.size}, channels: ${globalChannels.size}, window globals: ${globalWindow.size}, events: ${globalEvents.size}, urls: ${globalUrls.size}, uuid literals: ${globalUuids.size}`);
if (checkMode) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  if (errors.length) process.exit(1);
  console.log('inventory check: OK');
}
