import { z } from 'zod';

/**
 * Proposal / order (PROPALE_BDC, kanban cards, propale-vo). Field list is
 * intentionally minimal until Task 12 maps the full proposal surface.
 */
export const legacyProposalSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    id_propale: z.union([z.string(), z.number()]).nullish(),
    id_client: z.number().nullish(),
    statut: z.string().nullish(),
    etape: z.string().nullish(),
    version: z.number().nullish(),
  })
  .loose();

export type LegacyProposal = z.infer<typeof legacyProposalSchema>;

export interface Proposal {
  id: string;
  clientId: number | null;
  status: string | null;
  stage: string | null;
  version: number | null;
}

export function toProposal(row: LegacyProposal): Proposal {
  return {
    id: String(row.id_propale ?? row.id),
    clientId: row.id_client ?? null,
    status: row.statut ?? null,
    stage: row.etape ?? null,
    version: row.version ?? null,
  };
}
