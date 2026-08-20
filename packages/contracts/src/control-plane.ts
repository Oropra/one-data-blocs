import { z } from 'zod';

/**
 * Control-plane contracts (socle.js bootstrap).
 *
 * cpRpc('resolve_tenant_public', { p_slug }) returns one tenant row.
 * cpRpc('resolve_tenant_modules', { p_tenant_id }) returns the module manifest.
 */

export const tenantPublicSchema = z.object({
  id: z.union([z.string().min(1), z.number()]),
  slug: z.string().min(1),
  group_name: z.string().min(1),
  logo_url: z.string().nullish(),
  supabase_url: z.url(),
  supabase_anon_key: z.string().min(1),
});

export type TenantPublic = z.infer<typeof tenantPublicSchema>;

export const tenantModuleSchema = z
  .object({
    code: z.string().min(1),
    version: z.string().nullish(),
    url: z.string().nullish(),
  })
  .loose();

export const tenantModulesSchema = z.array(tenantModuleSchema);

export type TenantModule = z.infer<typeof tenantModuleSchema>;

/** Error payload shape returned by control-plane RPC wrappers. */
export const controlPlaneErrorSchema = z.object({
  message: z.string(),
  code: z.string().nullish(),
});
