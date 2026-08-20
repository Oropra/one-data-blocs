import { z, type ZodType } from 'zod';
import type { TenantSupabaseClient } from './client';
import { normalizeError } from './errors';
import type { EdgeFunctionName } from '@one-data/contracts';

/**
 * Typed Edge Function invocation: the response body is validated against the
 * provided Zod schema before reaching callers.
 */
export async function invokeEdgeFunction<S extends ZodType>(
  client: TenantSupabaseClient,
  name: EdgeFunctionName,
  options: { body?: unknown; schema: S },
): Promise<z.infer<S>> {
  const invokeOptions = options.body === undefined ? {} : { body: options.body as Record<string, unknown> };
  const result = (await client.functions.invoke(name, invokeOptions)) as {
    data: unknown;
    error: unknown;
  };
  if (result.error) throw normalizeError(result.error, 'Le service demandé a échoué.');
  return options.schema.parse(result.data);
}
