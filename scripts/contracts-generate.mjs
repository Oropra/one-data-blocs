#!/usr/bin/env node
/**
 * contracts:generate — regenerate full database row types from a sanitized
 * development tenant. Requires the Supabase CLI and a *development* project:
 *
 *   SUPABASE_PROJECT_REF=<dev-ref> SUPABASE_ACCESS_TOKEN=<token> pnpm contracts:generate
 *
 * Never point this at production and never commit tokens. The generated file
 * replaces the inventory-derived placeholders in
 * packages/contracts/src/database.generated.ts.
 */
import { spawnSync } from 'node:child_process';

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!ref || !token) {
  console.log(
    'contracts:generate skipped — set SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN ' +
      'for a sanitized development tenant to generate full row types.',
  );
  process.exit(0);
}

const result = spawnSync(
  'pnpm',
  [
    'dlx',
    'supabase',
    'gen',
    'types',
    'typescript',
    '--project-id',
    ref,
    '--out-file',
    'packages/contracts/src/database.generated.ts',
  ],
  { stdio: 'inherit', env: { ...process.env } },
);
process.exit(result.status ?? 1);
