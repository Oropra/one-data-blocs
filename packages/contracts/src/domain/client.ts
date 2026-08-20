import { z } from 'zod';

/**
 * CLIENT table row. The legacy table uses mixed-case historical column names;
 * only the fields exercised by the migrated features are listed explicitly —
 * everything else is preserved via `.loose()` passthrough.
 */
export const legacyClientRowSchema = z
  .object({
    IDVu: z.number(),
    NOM: z.string().nullish(),
    PRENOM: z.string().nullish(),
    CIVILITE: z.string().nullish(),
    TEl_MOB: z.string().nullish(),
    TEl_FIX: z.string().nullish(),
    email: z.string().nullish(),
    idmultivu: z.number().nullish(),
    importId: z.union([z.string(), z.number()]).nullish(),
  })
  .loose();

export type LegacyClientRow = z.infer<typeof legacyClientRowSchema>;

export interface Client {
  id: number;
  lastName: string | null;
  firstName: string | null;
  civility: string | null;
  mobilePhone: string | null;
  landlinePhone: string | null;
  email: string | null;
  /** 1 = société (company), 0 = particulier (individual). */
  isCompany: boolean;
}

export function toClient(row: LegacyClientRow): Client {
  return {
    id: row.IDVu,
    lastName: row.NOM ?? null,
    firstName: row.PRENOM ?? null,
    civility: row.CIVILITE ?? null,
    mobilePhone: row.TEl_MOB ?? null,
    landlinePhone: row.TEl_FIX ?? null,
    email: row.email ?? null,
    isCompany: row.idmultivu === 1,
  };
}

export function clientDisplayName(client: Client): string {
  const parts = [client.firstName, client.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : `Client ${String(client.id)}`;
}
