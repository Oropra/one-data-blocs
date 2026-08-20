import { z } from 'zod';

/** SITE table row (see site-bus.js: select ID_SITE,SITE,AFFAIRE,ID_AFFAIRE,RESEAU). */
export const legacySiteRowSchema = z
  .object({
    ID_SITE: z.number(),
    SITE: z.string().nullish(),
    AFFAIRE: z.string().nullish(),
    ID_AFFAIRE: z.union([z.string(), z.number()]).nullish(),
    RESEAU: z.string().nullish(),
  })
  .loose();

export type LegacySiteRow = z.infer<typeof legacySiteRowSchema>;

export interface Site {
  idSite: number;
  name: string;
  affaire: string | null;
  idAffaire: string | null;
  reseau: string | null;
}

export function toSite(row: LegacySiteRow): Site {
  return {
    idSite: row.ID_SITE,
    name: row.SITE ?? `Site ${String(row.ID_SITE)}`,
    affaire: row.AFFAIRE ?? null,
    idAffaire: row.ID_AFFAIRE != null ? String(row.ID_AFFAIRE) : null,
    reseau: row.RESEAU ?? null,
  };
}

/** v_user_perimeter row: which sites the viewer may access. */
export const perimeterRowSchema = z
  .object({
    id_site: z.number(),
  })
  .loose();

export type PerimeterRow = z.infer<typeof perimeterRowSchema>;
