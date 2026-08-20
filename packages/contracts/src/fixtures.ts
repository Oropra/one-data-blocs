/**
 * Sanitized fixtures derived from legacy response shapes (no real customer data).
 */
export const fixtures = {
  tenantPublic: {
    id: 'tenant-demo',
    slug: 'demo',
    group_name: 'Groupe Démo',
    logo_url: null,
    supabase_url: 'https://demo.supabase.co',
    supabase_anon_key: 'anon-key-exemple',
  },
  currentUser: {
    ID_User: 42,
    auth_uid: 'auth-uid-exemple',
    ID_Role: 2,
    email: 'vendeur@example.test',
    nom: 'Dupont',
    prenom: 'Jean',
    nomComplet: 'Jean Dupont',
    id_site: 7,
    must_change_password: false,
  },
  currentUserAltCasing: {
    ID_User: 43,
    id_role: 5,
  },
  site: {
    ID_SITE: 7,
    SITE: 'Site Centre',
    AFFAIRE: 'Affaire A',
    ID_AFFAIRE: 'AF-1',
    RESEAU: 'Réseau X',
  },
  client: {
    IDVu: 1001,
    NOM: 'Martin',
    PRENOM: 'Claire',
    CIVILITE: 'Mme',
    TEl_MOB: '0600000000',
    email: 'claire.martin@example.test',
    idmultivu: 0,
  },
} as const;
