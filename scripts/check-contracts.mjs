#!/usr/bin/env node
/**
 * check-contracts.mjs — fails when the checked-in backend contracts drift from
 * the legacy code scan or the checked-in backend inventory.
 *
 *   node scripts/check-contracts.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

const report = JSON.parse(readFileSync(join(root, 'docs/modernization/inventory-report.json'), 'utf8'));
const typesSrc = readFileSync(join(root, 'packages/contracts/src/database.types.ts'), 'utf8');
const yaml = readFileSync(join(root, 'supabase/contracts/backend-inventory.yaml'), 'utf8');

function exportedNames(constName) {
  const match = typesSrc.match(new RegExp(`export const ${constName} = \\[([\\s\\S]*?)\\] as const`));
  if (!match) {
    errors.push(`database.types.ts: missing export ${constName}`);
    return [];
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

const pairs = [
  ['TABLE_NAMES', Object.keys(report.tables), 'tables'],
  ['RPC_NAMES', Object.keys(report.rpcs), 'rpcs'],
  ['EDGE_FUNCTION_NAMES', Object.keys(report.edgeFunctions), 'edge_functions'],
  ['STORAGE_BUCKETS', Object.keys(report.storageBuckets), 'storage_buckets'],
];

for (const [constName, expected, yamlSection] of pairs) {
  const actual = exportedNames(constName);
  const expectedSorted = [...expected].sort();
  const missing = expectedSorted.filter((n) => !actual.includes(n));
  const extra = actual.filter((n) => !expectedSorted.includes(n));
  for (const n of missing) errors.push(`${constName}: missing '${n}' (used by legacy code)`);
  for (const n of extra) errors.push(`${constName}: unexpected '${n}' (not found in legacy scan)`);
  for (const n of expectedSorted) {
    if (!yaml.includes(`"${n}"`) && !yaml.includes(`- ${n}`)) {
      errors.push(`backend-inventory.yaml: section ${yamlSection} missing '${n}'`);
    }
  }
}

// Secrets hygiene: contracts must never embed credentials.
if (/service_role|eyJhbGciOi/.test(typesSrc) || /service_role|eyJhbGciOi/.test(yaml)) {
  errors.push('credential material detected in checked-in contracts');
}

if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  process.exit(1);
}
console.log('contracts check: OK (tables, rpcs, edge functions, buckets in sync)');
