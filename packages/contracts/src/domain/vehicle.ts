import { z } from 'zod';

/** Vehicle (STOCKVO / v_liste_vo). Minimal until Task 13 migrates vo-liste. */
export const legacyVehicleSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    immatriculation: z.string().nullish(),
    marque: z.string().nullish(),
    modele: z.string().nullish(),
  })
  .loose();

export type LegacyVehicle = z.infer<typeof legacyVehicleSchema>;

export interface Vehicle {
  id: string;
  registration: string | null;
  brand: string | null;
  model: string | null;
}

export function toVehicle(row: LegacyVehicle): Vehicle {
  return {
    id: String(row.id),
    registration: row.immatriculation ?? null,
    brand: row.marque ?? null,
    model: row.modele ?? null,
  };
}
