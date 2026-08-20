import { z } from 'zod';

/**
 * Current application user (get_current_user RPC).
 *
 * Legacy rows mix casing across deployments (`ID_Role` vs `id_role`); the
 * schema accepts both and the adapter normalizes to a stable domain model.
 */
export const legacyCurrentUserSchema = z
  .object({
    ID_User: z.number(),
    id: z.number().nullish(),
    auth_uid: z.string().nullish(),
    ID_Role: z.number().nullish(),
    id_role: z.number().nullish(),
    email: z.string().nullish(),
    nom: z.string().nullish(),
    prenom: z.string().nullish(),
    nomComplet: z.string().nullish(),
    id_site: z.number().nullish(),
    must_change_password: z.boolean().nullish(),
  })
  .loose();

export type LegacyCurrentUser = z.infer<typeof legacyCurrentUserSchema>;

export interface CurrentUser {
  idUser: number;
  authUid: string | null;
  roleId: number;
  email: string | null;
  lastName: string | null;
  firstName: string | null;
  fullName: string | null;
  siteId: number | null;
  mustChangePassword: boolean;
}

export function toCurrentUser(row: LegacyCurrentUser): CurrentUser {
  const roleId = row.ID_Role ?? row.id_role;
  if (roleId === null || roleId === undefined) {
    throw new Error('get_current_user row is missing ID_Role/id_role');
  }
  return {
    idUser: row.ID_User,
    authUid: row.auth_uid ?? null,
    roleId,
    email: row.email ?? null,
    lastName: row.nom ?? null,
    firstName: row.prenom ?? null,
    fullName: row.nomComplet ?? null,
    siteId: row.id_site ?? null,
    mustChangePassword: row.must_change_password ?? false,
  };
}

/** get_current_user may return a single row or a one-element array. */
export const currentUserResponseSchema = z
  .union([legacyCurrentUserSchema, z.array(legacyCurrentUserSchema)])
  .transform((value) => (Array.isArray(value) ? value[0] : value))
  .refine((value): value is LegacyCurrentUser => value !== undefined, {
    message: 'get_current_user returned an empty result',
  });
