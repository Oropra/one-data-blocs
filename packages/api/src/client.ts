import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { TenantPublic } from '@one-data/contracts';

// Row-level generated types land via `pnpm contracts:generate` (Task 4); until
// then the client is intentionally generic at the database level.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
export type TenantSupabaseClient = SupabaseClient<any, 'public', any>;

/**
 * Creates the single tenant-scoped Supabase client for the application.
 * Call exactly once per bootstrap (Task 5 TenantProvider owns the instance).
 */
export function createTenantClient(tenant: TenantPublic): TenantSupabaseClient {
  return createClient(tenant.supabase_url, tenant.supabase_anon_key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

/** Control-plane client: only public, non-secret configuration is used. */
export function createControlPlaneClient(url: string, anonKey: string): TenantSupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
