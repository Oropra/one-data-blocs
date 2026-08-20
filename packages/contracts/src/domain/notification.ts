import { z } from 'zod';

/** Notification (get_user_notifications). Minimal until Task 13. */
export const legacyNotificationSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    type: z.string().nullish(),
    titre: z.string().nullish(),
    message: z.string().nullish(),
    lu: z.boolean().nullish(),
    created_at: z.string().nullish(),
  })
  .loose();

export type LegacyNotification = z.infer<typeof legacyNotificationSchema>;

export interface AppNotification {
  id: string;
  type: string | null;
  title: string | null;
  message: string | null;
  read: boolean;
  createdAt: string | null;
}

export function toNotification(row: LegacyNotification): AppNotification {
  return {
    id: String(row.id),
    type: row.type ?? null,
    title: row.titre ?? null,
    message: row.message ?? null,
    read: row.lu ?? false,
    createdAt: row.created_at ?? null,
  };
}
