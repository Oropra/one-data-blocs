import { z } from 'zod';

/** Minimal appointment (rdv) domain model; extended when Task 13 migrates agenda/rdv. */
export const legacyAppointmentSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    id_rdv: z.union([z.string(), z.number()]).nullish(),
    titre: z.string().nullish(),
    date_debut: z.string().nullish(),
    date_fin: z.string().nullish(),
    id_client: z.number().nullish(),
  })
  .loose();

export type LegacyAppointment = z.infer<typeof legacyAppointmentSchema>;

export interface Appointment {
  id: string;
  title: string | null;
  startsAt: string | null;
  endsAt: string | null;
  clientId: number | null;
}

export function toAppointment(row: LegacyAppointment): Appointment {
  return {
    id: String(row.id_rdv ?? row.id),
    title: row.titre ?? null,
    startsAt: row.date_debut ?? null,
    endsAt: row.date_fin ?? null,
    clientId: row.id_client ?? null,
  };
}
