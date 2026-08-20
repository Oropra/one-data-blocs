import { describe, expect, it } from 'vitest';
import {
  currentUserResponseSchema,
  legacyClientRowSchema,
  legacySiteRowSchema,
  tenantPublicSchema,
  toClient,
  toCurrentUser,
  toSite,
} from './index';
import { fixtures } from './fixtures';

describe('control-plane contracts', () => {
  it('validates a tenant payload', () => {
    expect(tenantPublicSchema.parse(fixtures.tenantPublic).slug).toBe('demo');
  });

  it('rejects a tenant payload without supabase_url', () => {
    const rest: Record<string, unknown> = { ...fixtures.tenantPublic };
    delete rest.supabase_url;
    expect(tenantPublicSchema.safeParse(rest).success).toBe(false);
  });
});

describe('get_current_user contract', () => {
  it('accepts a single row', () => {
    const row = currentUserResponseSchema.parse(fixtures.currentUser);
    const user = toCurrentUser(row);
    expect(user.idUser).toBe(42);
    expect(user.roleId).toBe(2);
    expect(user.siteId).toBe(7);
  });

  it('accepts a one-element array (legacy behavior)', () => {
    const row = currentUserResponseSchema.parse([fixtures.currentUser]);
    expect(toCurrentUser(row).idUser).toBe(42);
  });

  it('normalizes the id_role casing variant', () => {
    const row = currentUserResponseSchema.parse(fixtures.currentUserAltCasing);
    expect(toCurrentUser(row).roleId).toBe(5);
  });

  it('rejects an empty array', () => {
    expect(() => currentUserResponseSchema.parse([])).toThrow();
  });

  it('throws when both role fields are missing', () => {
    const row = currentUserResponseSchema.parse({ ID_User: 1 });
    expect(() => toCurrentUser(row)).toThrow(/ID_Role/);
  });
});

describe('site adapter', () => {
  it('maps a SITE row to the domain model', () => {
    const site = toSite(legacySiteRowSchema.parse(fixtures.site));
    expect(site).toMatchObject({ idSite: 7, name: 'Site Centre', idAffaire: 'AF-1' });
  });
});

describe('client adapter', () => {
  it('maps legacy mixed-case columns', () => {
    const client = toClient(legacyClientRowSchema.parse(fixtures.client));
    expect(client).toMatchObject({
      id: 1001,
      lastName: 'Martin',
      mobilePhone: '0600000000',
      isCompany: false,
    });
  });
});
