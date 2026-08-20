/**
 * Backend surface inventory as TypeScript literals.
 *
 * Derived from docs/modernization/inventory-report.json (scripts/inventory-legacy.mjs).
 * CI drift-check: scripts/check-contracts.mjs compares these lists against
 * supabase/contracts/backend-inventory.yaml and the live legacy scan.
 *
 * When a development tenant is available, regenerate full row types with:
 *   pnpm contracts:generate
 * which runs `supabase gen types typescript` into this package (never commit
 * credentials; the generated file contains no secrets).
 */

export const TABLE_NAMES = [
  'APV',
  'CLIENT',
  'CLIENT_STOCK',
  'CONTRE_MARQUE',
  'CYCLE_COM',
  'PROPALE_BDC',
  'RAPPORT_VENDEUR',
  'ROLE',
  'SITE',
  'STOCKVO',
  'USER',
  'USER_SITE',
  'agent_chat_messages',
  'agent_chat_threads',
  'bareme_cheval_fiscal',
  'bareme_malus_co2',
  'client_view_history',
  'email_accounts',
  'emails',
  'fleet_snapshot',
  'fleet_snapshot_tenant',
  'generated_documents',
  'import_bdc_vn',
  'onboarding_step',
  'rdv_type',
  'sms_messages',
  'v_cloture_cycle',
  'v_contacts_client',
  'v_cycles_actifs',
  'v_cycles_kanban',
  'v_historique_cycles',
  'v_lead_kpi_site',
  'v_lead_kpi_vendeur',
  'v_leads',
  'v_liste_vo',
  'v_onboarding',
  'v_performances_v2',
  'v_premier_contact',
  'v_user_cycles_recent',
  'v_user_perimeter',
  'wa_contacts',
  'wa_conversations',
  'v_wa_thread_items',
] as const;

export type TableName = (typeof TABLE_NAMES)[number];

export const RPC_NAMES = [
  'agent_signal_mark',
  'agent_signals_count',
  'agent_signals_list',
  'attach_entreprise',
  'client_arbitrage_detail',
  'client_arbitrer',
  'client_creer',
  'client_doublons',
  'client_file_arbitrage',
  'client_prochain_idvu',
  'client_signaler_doublon',
  'commit_import_bdc_vn',
  'create_bilaterale',
  'create_creneau',
  'create_rdv_client',
  'creer_campagne_sollicitation',
  'cycle_ouvrir',
  'delco_query_sql',
  'delete_bilaterale',
  'delete_rdv_client',
  'detach_rattachement',
  'enqueue_email',
  'get_activite_equipe',
  'get_affaire_versions',
  'get_agenda_perimeter',
  'get_bilaterale_detail',
  'get_bilaterale_engagements',
  'get_bilaterale_tenue_vendeurs',
  'get_bilaterales',
  'get_bilaterales_historique',
  'get_cadence_bilaterales',
  'get_calendar_events',
  'get_campagnes_sollicitation',
  'get_chefs_bilaterales',
  'get_classement_vendeur',
  'get_current_user',
  'get_dashboard',
  'get_dashboard_leads',
  'get_engagements_ouverts',
  'get_kanban_cards',
  'get_kanban_vendeurs',
  'get_leads_par_jour',
  'get_leads_par_source',
  'get_perimetre_sites',
  'get_propales_client',
  'get_rattachements_particulier',
  'get_rdv_client',
  'get_stock_synthese',
  'get_transfo',
  'get_user_notifications',
  'get_v_likes',
  'get_vendeur_synthese',
  'move_propale',
  'notif_ignorer_cycle',
  'notif_ignorer_orphelin',
  'notif_ignorer_rpv',
  'realiser_bilaterale_complet',
  'rpv_close_reopen_cycle',
  'set_password_changed',
  'update_bilaterale',
  'update_rdv_client',
] as const;

export type RpcName = (typeof RPC_NAMES)[number];

export const EDGE_FUNCTION_NAMES = ['delco-pdf', 'email-send', 'export-xslx'] as const;

export type EdgeFunctionName = (typeof EDGE_FUNCTION_NAMES)[number];

export const STORAGE_BUCKETS = ['email-attachments'] as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[number];

/**
 * Generic row type placeholder. Full generated row types replace this once a
 * sanitized development tenant is wired into `pnpm contracts:generate`.
 */
export type GenericRow = Record<string, unknown>;
