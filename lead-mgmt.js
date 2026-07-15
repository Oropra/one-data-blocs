// ============================================================================
//  LEAD MANAGEMENT (Marketing) — module One Data (OD.define)  v1
//  Le bloc d'origine était du code racine (enveloppé par WeWeb) -> encapsulé ici.
//  Rendu dans __anchor ; client via ctx.supabase ; aucune URL en dur.
//  User via socle oropraUser (cas tableau géré). bindLeadBus / bindLeadNarrow
//  conservés (bus de site + responsive).
// ============================================================================
OD.define('lead-mgmt', {
  async mount(__anchor, ctx) {
  __anchor.id = 'lead-mgmt-root';

// ============================================================
// LEAD MANAGEMENT v25 — Responsive
//  Base v24 (bus de site + date picker calendrier + onglet Campagnes), INCHANGÉE
//  côté logique. Ajout responsive uniquement :
//   - tableau d'équipe dans un conteneur à scroll horizontal interne
//     (.lm-team-scroll) : il ne pousse plus la page en largeur ;
//   - kanban empilé en 1 colonne en étroit (hauteur auto, corps de colonne
//     plafonné à 55vh) ;
//   - cartes en grille fluide (plus de minmax 360px qui déborde sous 360) ;
//   - recherche pleine largeur, grilles KPI/synthèse/campagnes en 1-2 col ;
//   - calendrier borné à la largeur de l'écran ;
//   - repli .lm-narrow : règles mobiles déclenchées par la largeur RÉELLE de
//     #lead-mgmt-root (ResizeObserver), en plus des @media.
//   PRÉREQUIS : conteneur de section de la page en width:100% (comme Pipe).
// ============================================================

const VAR_VENDEUR_CIBLE = '7759f3ba-c260-4297-9e28-3713c305684c';

// --- Configuration ------------------------------------------
const COLLECTION_ACTIFS          = '93ff6a36-f3a7-468a-a8d0-752e610a9ccf';
const COLLECTION_KANBAN          = '04b96bd6-36e2-42ba-9a34-0bf9867119c1';
const COLLECTION_USER_SITES      = '2f09d34f-a0e7-430b-93d3-c86f7d0e2b24';
const COLLECTION_KPI_SITE        = '1f10c91c-e2ee-4162-a42b-e8ba11bd991b';
const COLLECTION_KPI_VENDEUR     = 'fbf5070a-d830-4a1b-bf43-7f9fcd9c793f';
const COLLECTION_CLOTURES        = 'e3900e4f-e076-45ea-8dcf-32ca7f622afe';
const COLLECTION_LEADS           = '7270d5d5-5048-46e0-a833-cffd8d8a0cbc';
const COLLECTION_USER_CYCLES     = '74e9a691-524e-4e2a-8370-df042b116b1a';
const COLLECTION_PREMIER_CONTACT = '1c5a6f4e-d067-4bcf-a2e4-3c7fb8ad172c';

const WF_GET_FICHE     = '53250f54-d14c-4622-baf4-0b89064316b6';
const PAGE_FICHE_ID    = '259f1951-a2d4-4b90-ac83-0b3febe1d4ec';
const TAB_DEFAULT      = 0;
const TAB_WHATSAPP     = 2;
const TAB_CYCLE        = 2;
const TAB_CALL         = 2;

const ROLE_VENDEUR     = 4;
const ROLE_CHEF_VENTES = 3;

// --- 0. Bus de site (oropra-site-bus.js) --------------------
function siteBus() {
  try { const w = wwLib.getFrontWindow(); if (w && w.oropraSite) return w.oropraSite; } catch (e) {}
  return window.oropraSite || null;
}

// --- 1. Récupération des données ----------------------------
function asArray(uuid) {
  const d = wwLib.wwCollection.getCollection(uuid)?.data;
  return Array.isArray(d) ? [...d] : [];
}

// --- FOLD : chargement direct des 9 vues (plus de collections WeWeb) ---------
//  Auparavant : workflow (étapes 2 & 3) + auto-fetch, lues via asArray().
//  Désormais : requêtes Supabase directes ici, pour que la page ne dépende
//  d'aucune collection WeWeb (portabilité multi-clients : mêmes vues partout).
const sb = ctx.supabase;
let userConnected        = (((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser);
if (Array.isArray(userConnected)) userConnected = userConnected[0];
userConnected            = userConnected || {};

// Cycles : filtre serveur user_ids_actifs && [vendeurCible] (overlap).
// vendeurCible null => tout le périmètre (RLS), le filtrage fin reste client-side.
async function fetchCyclesData(vendeurCible) {
  const aQ = sb.from('v_cycles_actifs').select('*');
  const kQ = sb.from('v_cycles_kanban').select('*');
  const [a, k] = await Promise.all([
    (vendeurCible != null ? aQ.overlaps('user_ids_actifs', [Number(vendeurCible)]) : aQ),
    (vendeurCible != null ? kQ.overlaps('user_ids_actifs', [Number(vendeurCible)]) : kQ)
  ]);
  if (a.error) console.error('[leadMgmt] v_cycles_actifs', a.error);
  if (k.error) console.error('[leadMgmt] v_cycles_kanban', k.error);
  return { actifs: a.data || [], kanban: k.data || [] };
}

// Cible initiale : un vendeur ne voit que ses cycles ; un manager voit tout (null).
const __initialVendeurCible = (userConnected.ID_Role === ROLE_VENDEUR) ? userConnected.ID_User : null;

const [__perim, __kpiSite, __kpiVend, __cycles, __clotures, __leads, __userCycles, __premier] = await Promise.all([
  sb.from('v_user_perimeter').select('*').eq('viewer_id_user', userConnected.ID_User),
  sb.from('v_lead_kpi_site').select('*'),
  sb.from('v_lead_kpi_vendeur').select('*'),
  fetchCyclesData(__initialVendeurCible),
  sb.from('v_cloture_cycle').select('*'),
  sb.from('v_leads').select('*'),
  sb.from('v_user_cycles_recent').select('*'),
  sb.from('v_premier_contact').select('*')
]);
[__perim, __kpiSite, __kpiVend, __clotures, __leads, __userCycles, __premier]
  .forEach(r => { if (r && r.error) console.error('[leadMgmt] chargement vue', r.error); });

let dataActifs           = __cycles.actifs;
let dataKanban           = __cycles.kanban;
const userSites          = __perim.data || [];
const dataKpiSite        = __kpiSite.data || [];
const dataKpiVend        = __kpiVend.data || [];
const dataClotures       = __clotures.data || [];
const dataLeads          = __leads.data || [];
const dataUserCycles     = __userCycles.data || [];
const dataPremierContact = __premier.data || [];

const userSiteIds = userSites.map(r => r.id_site ?? r.ID_SITE);
const userRole    = userConnected.ID_Role;
const userId      = userConnected.ID_User;

const isVendeur    = userRole === ROLE_VENDEUR;
const isChefVentes = userRole === ROLE_CHEF_VENTES;
const isManager    = !isVendeur && userRole != null;

const dataKpiSiteScope = dataKpiSite.filter(r => userSiteIds.includes(r.id_site));
const dataKpiVendScope = dataKpiVend.filter(r => userSiteIds.includes(r.id_site));

// --- 2. Index pré-calculés ----------------------------------
const cyclesAvecLeadSet = new Set();
for (const l of dataLeads) {
  if (l.id_cycle_comm) cyclesAvecLeadSet.add(l.id_cycle_comm);
}

const vendeurCyclesMap = new Map();
for (const uc of dataUserCycles) {
  if (!vendeurCyclesMap.has(uc.id_user)) vendeurCyclesMap.set(uc.id_user, new Set());
  vendeurCyclesMap.get(uc.id_user).add(uc.id_cycle_com);
}

function getVendeurCycleIds(idUser) {
  return vendeurCyclesMap.get(idUser) || new Set();
}

const premierContactMap = {};
for (const pc of dataPremierContact) {
  premierContactMap[pc.id_cycle_com] = pc.premier_outbound_at;
}

const vendeurInfoMap = new Map();
for (const v of dataKpiVendScope) {
  if (!vendeurInfoMap.has(v.id_user)) {
    vendeurInfoMap.set(v.id_user, {
      id_user: v.id_user,
      vendeur_nom: v.vendeur_nom,
      sites: new Set(),
      cycles_total: 0
    });
  }
  const info = vendeurInfoMap.get(v.id_user);
  info.sites.add(v.id_site);
  info.cycles_total += (v.cycles_total || 0);
}

const doc = __anchor.ownerDocument || document;
const root = __anchor;
try { window.__leadVer = 'v25-responsive'; } catch (e) {}

// --- 3. Style (injection forcée) ----------------------------
const STYLE_ID = 'lead-mgmt-style';
const existing = doc.getElementById(STYLE_ID);
if (existing) existing.remove();
const styleEl = doc.createElement('style');
styleEl.id = STYLE_ID;
styleEl.textContent = `
#lead-mgmt-root {
  --green:#53bda7; --blue-lt:#acc5e4; --orange:#fac055; --blue-dk:#2a5ea9;
  --bg:#fafbfd; --card:#fff; --border:#eaf0f9;
  --text:#2a5ea9; --text-mut:#7a9cc4; --text-soft:#4a6a8a;
  --red-soft:#c4554a; --red-bg:#fcebeb; --orange-bg:#fdf2dd; --green-bg:#e1f5ee; --blue-bg:#eaf0f9;
  --grey-bg:#f0f2f5; --grey-text:#8a96a8; --grey-border:#dde2ea;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  font-size:13px; color:var(--text);
}
#lead-mgmt-root *, #lead-mgmt-root *::before, #lead-mgmt-root *::after { box-sizing:border-box; }

#lead-mgmt-root .lm-consultation-banner { background:var(--blue-dk); color:#fff; padding:10px 14px; border-radius:8px; display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; font-size:12px; }
#lead-mgmt-root .lm-consultation-banner-text { font-weight:500; }
#lead-mgmt-root .lm-consultation-banner-text strong { font-weight:700; margin-left:4px; }
#lead-mgmt-root .lm-consultation-close { background:rgba(255,255,255,.15); color:#fff; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600; }
#lead-mgmt-root .lm-consultation-close:hover { background:rgba(255,255,255,.25); }

#lead-mgmt-root .lm-team { background:var(--card); border:1px solid var(--border); border-radius:8px; margin-bottom:18px; overflow:hidden; }
#lead-mgmt-root .lm-team-header { padding:10px 14px; background:#f5f8fc; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
#lead-mgmt-root .lm-team-title { font-size:11px; font-weight:600; color:var(--text-soft); text-transform:uppercase; letter-spacing:.5px; }
#lead-mgmt-root .lm-bus-chip { font-size:10px; color:#085041; background:#e1f5ee; border:1px solid #9ad9c5; border-radius:999px; padding:1px 8px; font-weight:600; }
#lead-mgmt-root .lm-team-scroll { width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch; }
#lead-mgmt-root .lm-team-table { width:100%; border-collapse:collapse; }
#lead-mgmt-root .lm-team-table th { font-size:10px; font-weight:600; color:var(--text-mut); text-transform:uppercase; letter-spacing:.4px; padding:8px 10px; background:#f9fbfd; border-bottom:1px solid var(--border); text-align:center; }
#lead-mgmt-root .lm-team-table th:first-child { text-align:left; }
#lead-mgmt-root .lm-team-table tr { border-bottom:0.5px solid var(--border); }
#lead-mgmt-root .lm-team-table tr.row-reseau  { background:#f5f8fc; cursor:pointer; }
#lead-mgmt-root .lm-team-table tr.row-affaire { background:#fafbfd; cursor:pointer; }
#lead-mgmt-root .lm-team-table tr.row-site    { background:#fff; cursor:pointer; }
#lead-mgmt-root .lm-team-table tr.row-vendeur { background:#fff; cursor:pointer; }
#lead-mgmt-root .lm-team-table tr.row-vendeur:hover { background:var(--blue-bg); }
#lead-mgmt-root .lm-team-table tr.row-vendeur.is-selected { background:var(--blue-bg); }
#lead-mgmt-root .lm-team-table tr.row-vendeur.is-selected td:first-child { font-weight:700; color:var(--blue-dk); }
#lead-mgmt-root .lm-team-table tr.row-site.is-bus-focus { background:#e1f5ee; }
#lead-mgmt-root .lm-team-table tr.row-site.is-bus-focus td:first-child { font-weight:700; color:#085041; }
#lead-mgmt-root .lm-team-table tr.row-reseau:hover, #lead-mgmt-root .lm-team-table tr.row-affaire:hover, #lead-mgmt-root .lm-team-table tr.row-site:hover { filter:brightness(.97); }
#lead-mgmt-root .lm-team-table td { padding:7px 10px; font-size:12px; text-align:center; color:var(--text); }
#lead-mgmt-root .lm-team-table td:first-child { text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:300px; }
#lead-mgmt-root .lm-team-table .row-reseau td:first-child  { color:var(--blue-dk); font-weight:600; }
#lead-mgmt-root .lm-team-table .row-affaire td:first-child { color:var(--blue-dk); font-weight:500; padding-left:24px; }
#lead-mgmt-root .lm-team-table .row-site td:first-child    { color:var(--text-soft); font-weight:500; padding-left:44px; }
#lead-mgmt-root .lm-team-table .row-vendeur td:first-child { color:var(--text-soft); padding-left:64px; }
#lead-mgmt-root .lm-team-table .row-vendeur.is-direct td:first-child { padding-left:24px; }
#lead-mgmt-root .lm-site-pin { margin-left:6px; font-size:10px; }
#lead-mgmt-root .lm-expand-icon { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:3px; background:#eaf0f9; font-size:9px; color:var(--text-mut); margin-right:6px; }
#lead-mgmt-root .lm-team-kpi { font-variant-numeric:tabular-nums; }
#lead-mgmt-root .lm-team-kpi.kpi-warn   { color:#b8851a; font-weight:600; }
#lead-mgmt-root .lm-team-kpi.kpi-critique { color:var(--red-soft); font-weight:700; }
#lead-mgmt-root .lm-team-kpi.kpi-good   { color:var(--green); font-weight:600; }
#lead-mgmt-root .lm-team-kpi.kpi-zero   { color:var(--text-mut); }

#lead-mgmt-root .lm-toggle { display:inline-flex; background:var(--card); border:1px solid var(--border); border-radius:8px; padding:4px; margin-bottom:18px; box-shadow:0 1px 2px rgba(42,94,169,.04); }
#lead-mgmt-root .lm-toggle-btn { padding:10px 22px; font-size:13px; font-weight:600; background:transparent; border:none; color:var(--text-soft); cursor:pointer; font-family:inherit; border-radius:6px; transition:all .15s ease; }
#lead-mgmt-root .lm-toggle-btn:not(.active):hover { background:var(--blue-bg); color:var(--blue-dk); }
#lead-mgmt-root .lm-toggle-btn.active { background:var(--blue-dk); color:#fff; box-shadow:0 1px 3px rgba(42,94,169,.25); }

#lead-mgmt-root .lm-subtoggle { display:inline-flex; gap:0; margin-bottom:14px; border-bottom:1px solid var(--border); }
#lead-mgmt-root .lm-subtoggle-btn { padding:7px 14px; font-size:11px; font-weight:600; background:transparent; border:none; color:var(--text-mut); cursor:pointer; font-family:inherit; border-bottom:2px solid transparent; margin-bottom:-1px; text-transform:uppercase; letter-spacing:.3px; transition:all .12s ease; }
#lead-mgmt-root .lm-subtoggle-btn:not(.active):hover { color:var(--blue-dk); }
#lead-mgmt-root .lm-subtoggle-btn.active { color:var(--blue-dk); border-bottom-color:var(--blue-dk); }

#lead-mgmt-root .lm-period-bar { display:flex; align-items:center; gap:14px; margin-bottom:16px; flex-wrap:wrap; }
#lead-mgmt-root .lm-period-label { font-size:11px; color:var(--text-mut); font-weight:500; text-transform:uppercase; letter-spacing:.5px; }
#lead-mgmt-root .lm-range { border:1px solid var(--blue-lt); border-radius:6px; padding:6px 12px; font-size:11px; color:var(--blue-dk); background:#fff; cursor:pointer; font-family:inherit; font-weight:600; display:inline-flex; align-items:center; gap:6px; }
#lead-mgmt-root .lm-range:hover { background:#f5f8fc; border-color:var(--blue-dk); }
#lead-mgmt-root .lm-range-car { font-size:9px; color:var(--text-mut); }
#lead-mgmt-root .lm-period-resume { font-size:11px; color:var(--text-mut); font-style:italic; }

#lead-mgmt-root .lm-synthese { display:flex; flex-direction:column; gap:18px; }
#lead-mgmt-root .lm-block { background:var(--card); border:1px solid var(--border); border-radius:8px; padding:14px 16px; }
#lead-mgmt-root .lm-block-title { font-size:11px; font-weight:600; color:var(--text-soft); text-transform:uppercase; letter-spacing:.5px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between; }
#lead-mgmt-root .lm-synth-kpi { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
#lead-mgmt-root .lm-synth-kpi-card { background:var(--card); border:1px solid var(--border); border-radius:8px; padding:14px 16px; display:flex; flex-direction:column; gap:4px; }
#lead-mgmt-root .lm-synth-kpi-label { font-size:10px; color:var(--text-mut); font-weight:500; text-transform:uppercase; letter-spacing:.5px; }
#lead-mgmt-root .lm-synth-kpi-value { font-size:26px; font-weight:600; color:var(--blue-dk); line-height:1.1; font-variant-numeric:tabular-nums; }
#lead-mgmt-root .lm-synth-kpi-sub { font-size:10px; color:var(--text-mut); }
#lead-mgmt-root .lm-synth-kpi-card.kpi-critique .lm-synth-kpi-value { color:var(--red-soft); }
#lead-mgmt-root .lm-synth-kpi-card.kpi-warn     .lm-synth-kpi-value { color:#b8851a; }
#lead-mgmt-root .lm-synth-kpi-card.kpi-good     .lm-synth-kpi-value { color:var(--green); }
#lead-mgmt-root .lm-synth-kpi-card.kpi-na       .lm-synth-kpi-value { color:var(--grey-text); font-size:22px; }
#lead-mgmt-root .lm-synth-2col { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
@media (max-width:900px) {
  #lead-mgmt-root .lm-synth-kpi { grid-template-columns:repeat(2,1fr); }
  #lead-mgmt-root .lm-synth-2col { grid-template-columns:1fr; }
}

#lead-mgmt-root .lm-ranking-list { display:flex; flex-direction:column; gap:6px; }
#lead-mgmt-root .lm-ranking-item { display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-radius:6px; background:var(--bg); border:1px solid transparent; transition:all .12s ease; }
#lead-mgmt-root .lm-ranking-item.is-highlighted { background:var(--blue-bg); border-color:var(--blue-dk); }
#lead-mgmt-root .lm-ranking-item-left { display:flex; align-items:center; gap:10px; flex:1; min-width:0; }
#lead-mgmt-root .lm-ranking-rank { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:var(--blue-bg); color:var(--blue-dk); font-size:10px; font-weight:700; flex-shrink:0; }
#lead-mgmt-root .lm-ranking-rank.rank-1 { background:var(--green); color:#fff; }
#lead-mgmt-root .lm-ranking-rank.rank-2 { background:#7fcfbb; color:#fff; }
#lead-mgmt-root .lm-ranking-rank.rank-3 { background:#a8ddca; color:#1d6e5f; }
#lead-mgmt-root .lm-ranking-rank.rank-low-1 { background:var(--red-soft); color:#fff; }
#lead-mgmt-root .lm-ranking-rank.rank-low-2 { background:#d6857b; color:#fff; }
#lead-mgmt-root .lm-ranking-rank.rank-low-3 { background:#e3aba2; color:#fff; }
#lead-mgmt-root .lm-ranking-name { font-size:12px; font-weight:500; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#lead-mgmt-root .lm-ranking-detail { font-size:10px; color:var(--text-mut); margin-top:1px; }
#lead-mgmt-root .lm-ranking-value { font-size:14px; font-weight:700; color:var(--blue-dk); font-variant-numeric:tabular-nums; flex-shrink:0; padding-left:10px; }
#lead-mgmt-root .lm-ranking-item.lm-ranking-good .lm-ranking-value { color:var(--green); }
#lead-mgmt-root .lm-ranking-item.lm-ranking-bad  .lm-ranking-value { color:var(--red-soft); }
#lead-mgmt-root .lm-ranking-empty { text-align:center; padding:20px; color:var(--text-mut); font-size:11px; font-style:italic; }

#lead-mgmt-root .lm-alerts-list { display:flex; flex-direction:column; gap:8px; }
#lead-mgmt-root .lm-alert { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:6px; border-left:3px solid var(--orange); background:#fff8ec; }
#lead-mgmt-root .lm-alert.severity-info { background:var(--blue-bg); border-left-color:var(--blue-dk); }
#lead-mgmt-root .lm-alert-text { font-size:12px; color:var(--text); }
#lead-mgmt-root .lm-chart-placeholder { height:220px; display:flex; align-items:center; justify-content:center; background:repeating-linear-gradient(45deg, var(--bg), var(--bg) 8px, #f5f8fc 8px, #f5f8fc 16px); border-radius:6px; color:var(--text-mut); font-size:11px; font-style:italic; }
#lead-mgmt-root .lm-chart-wrap { position:relative; height:220px; }
#lead-mgmt-root .lm-chart-wrap canvas { max-width:100%; }

#lead-mgmt-root .kpi-bar { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-bottom:16px; }
#lead-mgmt-root .kpi { background:var(--card); border:1px solid var(--border); border-radius:8px; padding:12px 14px; }
#lead-mgmt-root .kpi-label { font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:var(--text-mut); font-weight:500; }
#lead-mgmt-root .kpi-value { font-size:22px; font-weight:600; margin-top:4px; color:var(--blue-dk); }
#lead-mgmt-root .kpi-critique .kpi-value { color:var(--red-soft); }
#lead-mgmt-root .kpi-warn .kpi-value     { color:#b8851a; }
#lead-mgmt-root .kpi-good .kpi-value     { color:var(--green); }
#lead-mgmt-root .filters { display:flex; gap:8px; margin-bottom:16px; align-items:center; flex-wrap:wrap; }
#lead-mgmt-root .filter-chip { padding:5px 10px; border-radius:14px; background:var(--card); border:1px solid var(--border); font-size:11px; color:var(--text-soft); cursor:pointer; font-weight:500; user-select:none; }
#lead-mgmt-root .filter-chip.active { background:var(--blue-dk); color:#fff; border-color:var(--blue-dk); }
#lead-mgmt-root .filter-chip .count { margin-left:4px; opacity:.7; font-size:10px; }
#lead-mgmt-root .filter-search { margin-left:auto; padding:6px 10px; border:1px solid var(--border); border-radius:6px; font-size:12px; background:var(--card); color:var(--text); width:220px; outline:none; }
#lead-mgmt-root .filter-search:focus { border-color:var(--blue-dk); }
#lead-mgmt-root .section { margin-bottom:20px; }
#lead-mgmt-root .section-header { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
#lead-mgmt-root .section-title { font-size:12px; font-weight:600; color:var(--text-soft); text-transform:uppercase; letter-spacing:.6px; }
#lead-mgmt-root .section-count { background:var(--blue-bg); color:var(--blue-dk); padding:2px 8px; border-radius:10px; font-size:10px; font-weight:600; }
#lead-mgmt-root .section-critical .section-count { background:var(--red-bg); color:var(--red-soft); }
#lead-mgmt-root .section-warn .section-count     { background:var(--orange-bg); color:#b8851a; }
#lead-mgmt-root .lm-empty { text-align:center; padding:40px; color:var(--text-mut); }
#lead-mgmt-root .cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(360px,100%),1fr)); gap:10px; }
#lead-mgmt-root .card { background:var(--card); border:1px solid var(--border); border-radius:8px; padding:12px 14px; border-left:3px solid var(--blue-lt); transition:all .15s ease; }
#lead-mgmt-root .card:hover { border-color:var(--blue-dk); box-shadow:0 2px 8px rgba(42,94,169,.08); }
#lead-mgmt-root .card-clickable { cursor:pointer; }
#lead-mgmt-root .card-clickable:hover { border-color:var(--blue-dk); box-shadow:0 4px 12px rgba(42,94,169,.12); transform:translateY(-1px); }
#lead-mgmt-root .card-clickable:active { transform:translateY(0); }
#lead-mgmt-root .card-client-name { font-size:13px; font-weight:600; color:var(--blue-dk); line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#lead-mgmt-root .card.sla_critique { border-left-color:var(--red-soft); }
#lead-mgmt-root .card.sla_depasse  { border-left-color:var(--orange); }
#lead-mgmt-root .card.a_traiter    { border-left-color:var(--blue-dk); }
#lead-mgmt-root .card.a_relancer   { border-left-color:var(--orange); }
#lead-mgmt-root .card.suivi_normal { border-left-color:var(--blue-lt); }
#lead-mgmt-root .card.is-loading   { opacity:.5; pointer-events:none; }
#lead-mgmt-root .card-row1 { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; gap:8px; }
#lead-mgmt-root .btn-client { display:inline-flex; align-items:center; padding:6px 14px; border-radius:6px; background:var(--blue-dk); color:#fff; border:1px solid var(--blue-dk); font-family:inherit; font-size:13px; font-weight:600; cursor:pointer; transition:background .12s ease; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#lead-mgmt-root .btn-client:hover { background:#1f4a87; border-color:#1f4a87; }
#lead-mgmt-root .card-site { font-size:10px; color:var(--text-mut); margin-top:4px; padding-left:2px; }
#lead-mgmt-root .card-sla { font-size:10px; font-weight:600; padding:3px 7px; border-radius:4px; white-space:nowrap; font-variant-numeric:tabular-nums; align-self:flex-start; }
#lead-mgmt-root .card.sla_critique .card-sla { background:var(--red-bg); color:var(--red-soft); }
#lead-mgmt-root .card.sla_depasse .card-sla  { background:var(--orange-bg); color:#b8851a; }
#lead-mgmt-root .card.a_traiter .card-sla    { background:var(--blue-bg); color:var(--blue-dk); }
#lead-mgmt-root .card.a_relancer .card-sla   { background:var(--orange-bg); color:#b8851a; }
#lead-mgmt-root .card.suivi_normal .card-sla { background:var(--blue-bg); color:var(--text-mut); }
#lead-mgmt-root .card-lead-line { display:flex; align-items:center; gap:6px; padding:6px 0; border-top:1px dashed var(--border); border-bottom:1px dashed var(--border); margin:10px 0 8px; font-size:11px; color:var(--text-soft); }
#lead-mgmt-root .source-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 7px; border-radius:3px; font-size:10px; font-weight:500; background:var(--blue-bg); color:var(--blue-dk); }
#lead-mgmt-root .source-badge.leboncoin   { background:#fde9d9; color:#b56828; }
#lead-mgmt-root .source-badge.la_centrale { background:#dbe7f6; color:#1d4a87; }
#lead-mgmt-root .source-badge.rpv         { background:#e1f5ee; color:#1d6e5f; }
#lead-mgmt-root .source-badge.wa_entrant  { background:#d9f2e8; color:#1d6e5f; }
#lead-mgmt-root .source-badge.site_web    { background:#ece4f6; color:#5e3d8b; }
#lead-mgmt-root .source-badge.tel_traceur { background:#fdf2dd; color:#8a6014; }
#lead-mgmt-root .source-badge.none        { background:var(--grey-bg); color:var(--grey-text); }
#lead-mgmt-root .card-message { font-size:11px; color:var(--text-soft); line-height:1.4; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
#lead-mgmt-root .card-footer { display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding-top:8px; border-top:1px solid var(--border); }
#lead-mgmt-root .card-meta { display:flex; gap:10px; font-size:10px; color:var(--text-mut); }
#lead-mgmt-root .card-meta-item { display:flex; align-items:center; gap:3px; }
#lead-mgmt-root .temperature { display:inline-block; width:6px; height:6px; border-radius:50%; margin-right:4px; }
#lead-mgmt-root .temp-chaud { background:var(--red-soft); }
#lead-mgmt-root .temp-tiede { background:var(--orange); }
#lead-mgmt-root .temp-froid { background:var(--blue-lt); }
#lead-mgmt-root .card-actions { display:flex; gap:4px; margin-top:8px; }
#lead-mgmt-root .btn { flex:1; padding:6px 8px; border-radius:5px; border:1px solid var(--border); background:var(--card); color:var(--text-soft); font-size:11px; cursor:pointer; font-weight:500; }
#lead-mgmt-root .btn:hover:not(:disabled) { background:var(--blue-bg); }
#lead-mgmt-root .btn:disabled { opacity:.5; cursor:not-allowed; }
#lead-mgmt-root .btn-primary { background:var(--blue-dk); color:#fff; border-color:var(--blue-dk); }
#lead-mgmt-root .btn-primary:hover:not(:disabled) { background:#1f4a87; }
#lead-mgmt-root .lm-kanban { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:12px; height: calc(100vh - 280px); min-height:500px; }
#lead-mgmt-root .lm-col { background:var(--bg); border:1px solid var(--border); border-radius:8px; display:flex; flex-direction:column; overflow:hidden; min-width:0; }
#lead-mgmt-root .lm-col-head { padding:12px 14px; background:var(--blue-dk); color:#fff; display:flex; align-items:center; justify-content:space-between; gap:8px; }
#lead-mgmt-root .lm-col[data-statut="nouveau"]  .lm-col-head { background:var(--blue-lt); color:#1d4a87; }
#lead-mgmt-root .lm-col[data-statut="en_cours"] .lm-col-head { background:var(--blue-dk); color:#fff; }
#lead-mgmt-root .lm-col[data-statut="avance"]   .lm-col-head { background:var(--green); color:#fff; }
#lead-mgmt-root .lm-col[data-statut="clos"]     .lm-col-head { background:var(--grey-text); color:#fff; }
#lead-mgmt-root .lm-col-title { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; }
#lead-mgmt-root .lm-col-count { background:rgba(255,255,255,.25); color:inherit; padding:2px 9px; border-radius:10px; font-size:11px; font-weight:700; min-width:26px; text-align:center; }
#lead-mgmt-root .lm-col[data-statut="nouveau"] .lm-col-count { background:rgba(29,74,135,.18); color:#1d4a87; }
#lead-mgmt-root .lm-col-body { flex:1; overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:6px; }
#lead-mgmt-root .lm-kcard { background:var(--card); border:1px solid var(--border); border-radius:6px; padding:8px 10px; cursor:pointer; transition:all .12s ease; display:flex; flex-direction:column; gap:4px; }
#lead-mgmt-root .lm-kcard:hover { border-color:var(--blue-dk); box-shadow:0 1px 4px rgba(42,94,169,.08); transform:translateY(-1px); }
#lead-mgmt-root .lm-kcard.is-loading { opacity:.5; pointer-events:none; }
#lead-mgmt-root .lm-kcard-client { font-weight:600; color:var(--blue-dk); font-size:12.5px; line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#lead-mgmt-root .lm-kcard-meta { display:flex; flex-wrap:wrap; gap:4px 8px; font-size:10px; color:var(--text-mut); }
#lead-mgmt-root .lm-kcard-meta-item { display:inline-flex; align-items:center; gap:3px; }
#lead-mgmt-root .lm-kcard-badges { display:flex; flex-wrap:wrap; gap:4px; margin-top:2px; }
#lead-mgmt-root .lm-kbadge { font-size:9px; font-weight:600; padding:2px 6px; border-radius:3px; background:var(--blue-bg); color:var(--blue-dk); white-space:nowrap; }
#lead-mgmt-root .lm-kbadge.propale { background:var(--green-bg); color:#1d6e5f; }
#lead-mgmt-root .lm-kbadge.win     { background:var(--green); color:#fff; }
#lead-mgmt-root .lm-kbadge.abandon { background:var(--red-bg); color:var(--red-soft); }
#lead-mgmt-root .lm-kbadge.autre   { background:var(--grey-bg); color:var(--grey-text); }
#lead-mgmt-root .lm-kbadge.inact   { background:var(--orange-bg); color:#8a6014; }
#lead-mgmt-root .lm-col[data-statut="clos"] .lm-kcard { background:var(--grey-bg); border-color:var(--grey-border); }
#lead-mgmt-root .lm-col[data-statut="clos"] .lm-kcard-client { color:var(--grey-text); }
#lead-mgmt-root .lm-col[data-statut="clos"] .lm-kcard:hover { border-color:#aab4c2; }
#lead-mgmt-root .lm-kanban-empty { text-align:center; padding:24px 10px; color:var(--text-mut); font-size:11px; font-style:italic; }

/* ============ CAMPAGNES (groupement Sollicitation MKG dans "À traiter") ============ */
#lead-mgmt-root .lm-campagne { margin-bottom:14px; background:var(--card); border:1px solid var(--border); border-radius:8px; overflow:hidden; }
#lead-mgmt-root .lm-campagne-header { display:flex; align-items:center; gap:10px; padding:11px 14px; background:#f5f8fc; cursor:pointer; user-select:none; transition:background .12s ease; }
#lead-mgmt-root .lm-campagne-header:hover { background:#eef2f8; }
#lead-mgmt-root .lm-campagne.is-open .lm-campagne-header { border-bottom:1px solid var(--border); }
#lead-mgmt-root .lm-campagne-icon { width:18px; height:18px; border-radius:4px; background:#eaf0f9; font-size:10px; color:var(--text-mut); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
#lead-mgmt-root .lm-campagne-title { font-size:12.5px; font-weight:600; color:var(--blue-dk); flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#lead-mgmt-root .lm-campagne-stats { display:flex; gap:6px; flex-shrink:0; }
#lead-mgmt-root .lm-campagne-stat { font-size:10px; font-weight:600; padding:3px 9px; border-radius:10px; background:var(--blue-bg); color:var(--blue-dk); white-space:nowrap; }
#lead-mgmt-root .lm-campagne-stat.crit { background:var(--red-bg); color:var(--red-soft); }
#lead-mgmt-root .lm-campagne-stat.warn { background:var(--orange-bg); color:#b8851a; }
#lead-mgmt-root .lm-campagne-body { padding:12px 14px; display:none; }
#lead-mgmt-root .lm-campagne.is-open .lm-campagne-body { display:block; }
#lead-mgmt-root .lm-campagne-body .section { margin-bottom:14px; }
#lead-mgmt-root .lm-campagne-body .section:last-child { margin-bottom:0; }

/* ============ ONGLET CAMPAGNES (RPC get_campagnes_sollicitation) ============ */
#lead-mgmt-root .lm-cmp-summary { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:18px; }
@media (max-width:900px) { #lead-mgmt-root .lm-cmp-summary { grid-template-columns:repeat(2,1fr); } }
#lead-mgmt-root .lm-cmp-card { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:14px 16px; margin-bottom:14px; }
#lead-mgmt-root .lm-cmp-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px; }
#lead-mgmt-root .lm-cmp-name { font-size:13.5px; font-weight:700; color:var(--blue-dk); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
#lead-mgmt-root .lm-cmp-tags { display:flex; gap:6px; flex-shrink:0; flex-wrap:wrap; justify-content:flex-end; }
#lead-mgmt-root .lm-cmp-tag { font-size:10px; font-weight:600; padding:3px 9px; border-radius:10px; background:var(--blue-bg); color:var(--blue-dk); white-space:nowrap; }
#lead-mgmt-root .lm-cmp-tag.roi-good { background:var(--green-bg); color:#1d6e5f; }
#lead-mgmt-root .lm-cmp-tag.roi-mid  { background:var(--orange-bg); color:#b8851a; }
#lead-mgmt-root .lm-cmp-tag.roi-low  { background:var(--red-bg); color:var(--red-soft); }
#lead-mgmt-root .lm-funnel { display:flex; align-items:stretch; gap:0; }
#lead-mgmt-root .lm-funnel-stage { flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; position:relative; padding:0 4px; }
#lead-mgmt-root .lm-funnel-bar { width:100%; border-radius:6px; display:flex; align-items:flex-end; justify-content:center; min-height:34px; padding-bottom:4px; }
#lead-mgmt-root .lm-funnel-val { font-size:15px; font-weight:700; color:#fff; }
#lead-mgmt-root .lm-funnel-lbl { font-size:10px; color:var(--text-mut); font-weight:600; text-transform:uppercase; letter-spacing:.3px; text-align:center; }
#lead-mgmt-root .lm-funnel-conv { font-size:9px; color:var(--text-soft); font-weight:600; }
#lead-mgmt-root .lm-funnel-arrow { display:flex; align-items:center; color:var(--text-mut); font-size:13px; padding:0 2px; align-self:flex-start; margin-top:10px; }
#lead-mgmt-root .lm-cmp-foot { display:flex; gap:14px; flex-wrap:wrap; margin-top:12px; padding-top:10px; border-top:1px dashed var(--border); font-size:11px; color:var(--text-soft); }
#lead-mgmt-root .lm-cmp-foot b { color:var(--blue-dk); font-weight:700; }
#lead-mgmt-root .lm-cmp-ranking { display:flex; flex-direction:column; gap:6px; }

/* ============ ONGLET CRÉER UNE CAMPAGNE (creer_campagne_sollicitation) ============ */
#lead-mgmt-root .lm-camp { display:flex; flex-direction:column; gap:18px; }
#lead-mgmt-root .lm-camp-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
#lead-mgmt-root .lm-camp-field { display:flex; flex-direction:column; gap:4px; }
#lead-mgmt-root .lm-camp-full { grid-column:1 / -1; }
#lead-mgmt-root .lm-camp-lbl { font-size:10px; font-weight:600; color:var(--text-mut); text-transform:uppercase; letter-spacing:.4px; }
#lead-mgmt-root .lm-camp-hint { text-transform:none; font-weight:500; opacity:.8; }
#lead-mgmt-root .lm-camp-input { border:1px solid var(--border); border-radius:6px; padding:8px 10px; font-size:12px; font-family:inherit; color:var(--text); background:#fff; outline:none; width:100%; }
#lead-mgmt-root .lm-camp-input:focus { border-color:var(--blue-dk); }
#lead-mgmt-root .lm-camp-checks { display:flex; flex-wrap:wrap; gap:8px 16px; margin-top:4px; }
#lead-mgmt-root .lm-camp-chk { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--text-soft); cursor:pointer; }
#lead-mgmt-root .lm-camp-actions { display:flex; gap:10px; margin-top:14px; }
#lead-mgmt-root .lm-camp-actions .btn { flex:0 0 auto; padding:10px 20px; }
#lead-mgmt-root .lm-camp-total { font-size:13px; color:var(--text-soft); }
#lead-mgmt-root .lm-camp-total-num { font-size:24px; font-weight:700; color:var(--blue-dk); }
#lead-mgmt-root .lm-camp-warn { color:#b8851a; font-weight:600; }
#lead-mgmt-root .lm-camp-res-load { color:var(--text-mut); font-size:12px; font-style:italic; }
#lead-mgmt-root .lm-camp-res-err { color:var(--red-soft); font-size:12px; }
#lead-mgmt-root .lm-camp-success { color:#1d6e5f; font-weight:600; font-size:13px; background:var(--green-bg); border-left:3px solid var(--green); }

/* ===== RESPONSIVE (ajout v25) ============================================== */
@media (max-width:760px) {
  #lead-mgmt-root .lm-team-table { min-width:520px; }
  #lead-mgmt-root .lm-kanban { grid-template-columns:1fr; height:auto; min-height:0; }
  #lead-mgmt-root .lm-col { min-height:0; }
  #lead-mgmt-root .lm-col-body { max-height:55vh; }
  #lead-mgmt-root .filter-search { margin-left:0; width:100%; }
  #lead-mgmt-root .lm-funnel-lbl { font-size:9px; }
}
/* Repli .lm-narrow : déclenché par la largeur RÉELLE de #lead-mgmt-root
   (ResizeObserver), indépendant de la media query. */
#lead-mgmt-root.lm-narrow .lm-team-table { min-width:520px; }
#lead-mgmt-root.lm-narrow .lm-kanban { grid-template-columns:1fr; height:auto; min-height:0; }
#lead-mgmt-root.lm-narrow .lm-col { min-height:0; }
#lead-mgmt-root.lm-narrow .lm-col-body { max-height:55vh; }
#lead-mgmt-root.lm-narrow .filter-search { margin-left:0; width:100%; }
#lead-mgmt-root.lm-narrow .lm-synth-kpi { grid-template-columns:repeat(2,1fr); }
#lead-mgmt-root.lm-narrow .lm-synth-2col { grid-template-columns:1fr; }
#lead-mgmt-root.lm-narrow .lm-cmp-summary { grid-template-columns:repeat(2,1fr); }
#lead-mgmt-root.lm-narrow .lm-camp-grid { grid-template-columns:repeat(2,1fr); }
`;
doc.head.appendChild(styleEl);

// --- 4. État local ------------------------------------------
const state = window.__leadMgmt || {};
if (state.section === undefined)         state.section = isManager ? 'synthese' : 'suivi_leads';
if (state.view === undefined)            state.view = 'a_traiter';
if (state.filterSource === undefined)    state.filterSource = 'all';
if (state.search === undefined)          state.search = '';
if (state.expanded === undefined)        state.expanded = {};
if (state.selectedVendeur === undefined) state.selectedVendeur = null;
if (state.period === undefined)          state.period = defaultPeriod();
if (state.busSite === undefined)         state.busSite = null;
if (state.busSelPending === undefined)   state.busSelPending = true;
if (state.rankingData === undefined)     state.rankingData = null;
if (state.rankingLoading === undefined)  state.rankingLoading = false;
if (state.rankingError === undefined)    state.rankingError = null;
if (state.rankingKey === undefined)      state.rankingKey = null;
if (state.evolutionData === undefined)   state.evolutionData = null;
if (state.sourcesData === undefined)     state.sourcesData = null;
if (state.graphesLoading === undefined)  state.graphesLoading = false;
if (state.graphesError === undefined)    state.graphesError = null;
if (state.graphesKey === undefined)      state.graphesKey = null;
if (state.cyclesLoading === undefined)   state.cyclesLoading = false;
if (state.campagnesData === undefined)    state.campagnesData = null;
if (state.campagnesLoading === undefined) state.campagnesLoading = false;
if (state.campagnesError === undefined)   state.campagnesError = null;
if (state.campagnesKey === undefined)     state.campagnesKey = null;
window.__leadMgmt = state;

if (isVendeur && !state.selectedVendeur && userId != null) {
  state.selectedVendeur = { id_user: userId, id_site: null, vendeur_nom: 'Mes cycles' };
}

function setVendeurCible(idUser) {
  try {
    return wwLib.wwVariable.updateValue(VAR_VENDEUR_CIBLE, idUser != null ? Number(idUser) : null);
  } catch (e) {
    console.error('[leadMgmt] updateValue vendeurCibleId', e);
    return Promise.resolve();
  }
}

// --- 4b. Synchronisation avec le bus de site ----------------
function applyBusSiteLead(siteId) {
  const id = siteId != null ? String(siteId) : null;
  if (id == null) return;
  const changed = state.busSite !== id;
  state.busSite = id;
  if (changed) state.busSelPending = true;
  adoptBusSelectionLead();
  if (window.__renderLeadMgmt) window.__renderLeadMgmt();
}
function adoptBusSelectionLead() {
  if (!state.busSelPending || state.busSite == null) return;
  const s = dataKpiSiteScope.find(r => String(r.id_site) === String(state.busSite));
  if (!s) return;
  state.busSelPending = false;
  const reseau  = s.reseau  || '(Sans réseau)';
  const affaire = s.affaire || '(Sans affaire)';
  const rKey = 'r:' + reseau;
  const aKey = rKey + '|a:' + affaire;
  state.expanded[rKey] = true;
  state.expanded[aKey] = true;
  state.expanded['s:' + s.id_site] = true;
}
(function bindLeadBus(tries) {
  tries = tries || 0;
  const b = siteBus();
  if (!b) { if (tries < 120) setTimeout(() => bindLeadBus(tries + 1), 250); return; }
  if (window.__leadBusBound) {
    const id = b.getSiteId();
    if (id != null) applyBusSiteLead(id);
    return;
  }
  window.__leadBusBound = true;
  b.onChange(({ siteId }) => applyBusSiteLead(siteId));
})();

// --- 5. Helpers ---------------------------------------------
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function formatDuree(h) {
  if (h == null) return '';
  if (h < 1)  return Math.round(h*60) + ' min';
  if (h < 24) return Math.round(h) + 'h';
  return Math.round(h/24) + 'j';
}
function formatJours(j) {
  if (j == null) return '';
  const n = Math.round(j);
  if (n <= 0) return "aujourd'hui";
  if (n === 1) return 'hier';
  return 'il y a ' + n + 'j';
}

const SOURCE_LABELS = {
  rpv_sollicitation: { label:'Sollicitation MKG', cls:'rpv' },
  leboncoin:         { label:'Leboncoin',         cls:'leboncoin' },
  la_centrale:       { label:'La Centrale',       cls:'la_centrale' },
  autoscout:         { label:'AutoScout',         cls:'la_centrale' },
  site_web:          { label:'Site web',          cls:'site_web' },
  tel_traceur:       { label:'Tel traceur',       cls:'tel_traceur' },
  wa_entrant:        { label:'WhatsApp',          cls:'wa_entrant' }
};
function sourceBadge(source) {
  if (!source) return '<span class="source-badge none">Sans lead</span>';
  const s = SOURCE_LABELS[source] || { label:source, cls:'' };
  return '<span class="source-badge ' + s.cls + '">' + escapeHtml(s.label) + '</span>';
}

const FILTER_CHIPS = [
  { k:'all',               l:'Tout' },
  { k:'rpv_sollicitation', l:'Sollicitation MKG' },
  { k:'leboncoin',         l:'Leboncoin' },
  { k:'la_centrale',       l:'La Centrale' },
  { k:'site_web',          l:'Site web' },
  { k:'tel_traceur',       l:'Tel traceur' },
  { k:'wa_entrant',        l:'WhatsApp' },
  { k:'__none__',          l:'Sans lead' }
];

function kpiClass(value, kind) {
  if (!value) return 'kpi-zero';
  if (kind === 'a_traiter') { if (value > 30) return 'kpi-critique'; if (value > 10) return 'kpi-warn'; return ''; }
  if (kind === 'pipeline')   { if (value >= 15) return 'kpi-good'; return ''; }
  if (kind === 'clos_recent'){ if (value >= 5)  return 'kpi-good'; return ''; }
  return '';
}

// --- 6. Période (modèle { from, to }) -----------------------
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}
function defaultPeriod() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: ymd(from), to: ymd(now) };
}
function getPeriodDates() {
  return {
    from: new Date(state.period.from + 'T00:00:00'),
    to:   new Date(state.period.to   + 'T23:59:59')
  };
}
function formatPeriodResume() {
  const f = (s) => { const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }); };
  return f(state.period.from) + ' → ' + f(state.period.to);
}
function periodKey() { return state.period.from + '_' + state.period.to; }

function renderPeriodBar() {
  let html = '<div class="lm-period-bar">';
  html += '<div class="lm-period-label">Période :</div>';
  html += '<button type="button" class="lm-range" id="lm-range">📅 ' + formatPeriodResume() + ' <span class="lm-range-car">▾</span></button>';
  html += '<div class="lm-period-resume">' + formatPeriodResume() + '</div>';
  html += '</div>';
  return html;
}

// --- 6b. Date picker (calendrier, deux clics) ---------------
function closeRangePicker() {
  const e = doc.getElementById('lm-dp'); if (e) e.remove();
  if (window.__lmDpOutside) { doc.removeEventListener('mousedown', window.__lmDpOutside, true); window.__lmDpOutside = null; }
}
function applyPeriod(from, to) {
  closeRangePicker();
  if (!from || !to) return;
  if (from === state.period.from && to === state.period.to) return;
  state.period = { from, to };
  reloadClassement();
  reloadGraphes();
  reloadCampagnes();
  renderAll();
}
function openRangePicker(anchor) {
  closeRangePicker();
  const pk = { month: null, start: null, end: null, hover: null };
  const m0 = new Date(state.period.from + 'T12:00:00');
  pk.month = new Date(m0.getFullYear(), m0.getMonth(), 1);

  const pop = doc.createElement('div'); pop.id = 'lm-dp';
  const r = anchor.getBoundingClientRect();
  const winW = (doc.defaultView || window).innerWidth || 360;
  const left = Math.min(Math.max(8, r.left), Math.max(8, winW - 274));   // borné à l'écran
  pop.style.cssText = 'position:fixed;z-index:9999;top:' + (r.bottom + 6) + 'px;left:' + left + 'px';
  injectDpStyle();
  doc.body.appendChild(pop);

  function calHtml() {
    const y = pk.month.getFullYear(), m = pk.month.getMonth();
    const first = new Date(y, m, 1);
    const startIdx = (first.getDay() + 6) % 7;
    const nbDays = new Date(y, m + 1, 0).getDate();
    const today = ymd(new Date());
    const selA = pk.start, selB = pk.end || pk.hover;
    const lo = selA && selB ? (selA < selB ? selA : selB) : null;
    const hi = selA && selB ? (selA < selB ? selB : selA) : null;
    let h = '<div class="lm-dp-box">';
    h += '<div class="lm-dp-head"><button type="button" data-nav="-1">‹</button>'+
         '<span>' + escapeHtml(first.toLocaleDateString('fr-FR', { month:'long', year:'numeric' })) + '</span>'+
         '<button type="button" data-nav="1">›</button></div>';
    h += '<div class="lm-dp-grid">';
    for (const d of ['L','M','M','J','V','S','D']) h += '<span class="lm-dp-dow">' + d + '</span>';
    for (let i = 0; i < startIdx; i++) h += '<span></span>';
    for (let d = 1; d <= nbDays; d++) {
      const ds = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      let cls = 'lm-dp-day';
      if (ds === today) cls += ' today';
      if (pk.start === ds || pk.end === ds) cls += ' sel';
      else if (lo && hi && ds > lo && ds < hi) cls += ' inr';
      h += '<span class="' + cls + '" data-d="' + ds + '">' + d + '</span>';
    }
    h += '</div>';
    h += '<div class="lm-dp-foot">' + (pk.start ? 'Cliquez la date de fin' : 'Cliquez la date de début') + '</div>';
    h += '</div>';
    return h;
  }
  function wire() {
    pop.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      pk.month = new Date(pk.month.getFullYear(), pk.month.getMonth() + Number(b.getAttribute('data-nav')), 1);
      paint();
    }));
    pop.querySelectorAll('.lm-dp-day').forEach(c => {
      c.addEventListener('click', () => {
        const ds = c.getAttribute('data-d');
        if (!pk.start || pk.end) { pk.start = ds; pk.end = null; pk.hover = null; paint(); return; }
        pk.end = ds;
        let a = pk.start, b = pk.end;
        if (b < a) { const t = a; a = b; b = t; }
        applyPeriod(a, b);
      });
      c.addEventListener('mouseenter', () => {
        if (pk.start && !pk.end && pk.hover !== c.getAttribute('data-d')) { pk.hover = c.getAttribute('data-d'); paint(); }
      });
    });
  }
  function paint() { pop.innerHTML = calHtml(); wire(); }
  paint();
  window.__lmDpOutside = (e) => {
    if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closeRangePicker();
  };
  setTimeout(() => doc.addEventListener('mousedown', window.__lmDpOutside, true), 0);
}
function injectDpStyle() {
  if (doc.getElementById('lm-dp-style')) return;
  const st = doc.createElement('style'); st.id = 'lm-dp-style';
  st.textContent = `
#lm-dp .lm-dp-box { background:#fff; border:1px solid #eaf0f9; border-radius:10px; box-shadow:0 8px 30px rgba(42,94,169,.18); padding:12px; width:262px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
#lm-dp .lm-dp-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
#lm-dp .lm-dp-head span { font-size:12px; font-weight:600; color:#2a5ea9; text-transform:capitalize; }
#lm-dp .lm-dp-head button { width:24px; height:24px; border:1px solid #eaf0f9; background:#fff; border-radius:6px; cursor:pointer; color:#2a5ea9; font-size:13px; line-height:1; padding:0; }
#lm-dp .lm-dp-head button:hover { background:#f5f8fc; }
#lm-dp .lm-dp-grid { display:grid; grid-template-columns:repeat(7,33px); gap:2px; }
#lm-dp .lm-dp-dow { font-size:9px; color:#acc5e4; text-align:center; font-weight:700; padding-bottom:3px; }
#lm-dp .lm-dp-day { height:29px; line-height:29px; text-align:center; font-size:11px; color:#2c2c2a; border-radius:6px; cursor:pointer; }
#lm-dp .lm-dp-day:hover { background:#eaf0f9; }
#lm-dp .lm-dp-day.today { box-shadow:inset 0 0 0 1px #acc5e4; }
#lm-dp .lm-dp-day.sel { background:#2a5ea9; color:#fff; font-weight:700; }
#lm-dp .lm-dp-day.inr { background:#e6f1fb; }
#lm-dp .lm-dp-foot { margin-top:8px; text-align:center; font-size:10px; color:#7a9cc4; font-style:italic; }
`;
  doc.head.appendChild(st);
}

// --- 7. CALCULS KPI SYNTHÈSE --------------------------------
function computeSyntheseKpi() {
  const { from, to } = getPeriodDates();
  const fromMs = from.getTime();
  const toMs   = to.getTime();
  const cyclesActifs = dataKpiSiteScope.reduce((s, r) => s + (r.cycles_total || 0), 0);
  let winCount = 0, abandonCount = 0;
  for (const c of dataClotures) {
    if (!userSiteIds.includes(c.id_site)) continue;
    const t = new Date(c.date_cloture).getTime();
    if (t < fromMs || t > toMs) continue;
    if (c.type_cloture === 'win')          winCount++;
    else if (c.type_cloture === 'abandon') abandonCount++;
  }
  const tauxConv = (winCount + abandonCount > 0)
    ? Math.round(100 * winCount / (winCount + abandonCount))
    : null;
  const delais = [];
  for (const lead of dataLeads) {
    if (!lead.id_cycle_comm) continue;
    if (!userSiteIds.includes(lead.id_site)) continue;
    const t = new Date(lead.date_lead).getTime();
    if (t < fromMs || t > toMs) continue;
    const premierContactAt = premierContactMap[lead.id_cycle_comm];
    if (!premierContactAt) continue;
    const ct = new Date(premierContactAt).getTime();
    if (ct < t) continue;
    delais.push((ct - t) / 3600000);
  }
  let delaiMedian = null;
  if (delais.length > 0) {
    delais.sort((a, b) => a - b);
    const mid = Math.floor(delais.length / 2);
    delaiMedian = delais.length % 2 === 0 ? (delais[mid - 1] + delais[mid]) / 2 : delais[mid];
  }
  return { cyclesActifs, winCount, abandonCount, tauxConv, delaiMedian, nbDelais: delais.length };
}

function formatDelaiKpi(h) {
  if (h == null) return '—';
  if (h < 1)  return Math.round(h * 60) + 'min';
  if (h < 24) return h.toFixed(1) + 'h';
  return Math.round(h / 24) + 'j';
}

// --- 8. CLASSEMENTS VENDEURS (via RPC Supabase) -------------
async function fetchClassement() {
  const key = periodKey();
  if (state.rankingLoading) return;
  if (state.rankingKey === key && state.rankingData !== null) return;

  const { from, to } = getPeriodDates();
  state.rankingLoading = true;
  state.rankingError = null;
  state.rankingKey = key;

  try {
    const supabase = ctx.supabase;
    const { data, error } = await supabase.rpc('get_classement_vendeur', {
      p_viewer_id_user: Number(userId),
      p_date_from: ymd(from),
      p_date_to: ymd(to)
    });
    if (error) throw error;

    state.rankingData = (data || []).map(r => ({
      id_user: Number(r.id_user),
      vendeur_nom: r.vendeur_nom || ('User ' + r.id_user),
      winCount: Number(r.win_count) || 0,
      totalClos: Number(r.total_clos) || 0,
      taux: r.taux != null ? Number(r.taux) : (r.total_clos ? 100 * Number(r.win_count) / Number(r.total_clos) : 0)
    }));
  } catch (e) {
    console.error('[leadMgmt] Erreur RPC get_classement_vendeur', e);
    state.rankingError = (e && e.message) ? e.message : 'Erreur de chargement';
    state.rankingData = [];
  } finally {
    state.rankingLoading = false;
    if (state.section === 'synthese' && window.__renderLeadMgmt) window.__renderLeadMgmt();
  }
}

function reloadClassement() {
  state.rankingData = null;
  state.rankingKey = null;
  if (state.section === 'synthese') fetchClassement();
}

// --- 8b. GRAPHES (Chart.js via CDN + RPC d'agrégation) ------
function loadChartJs() {
  const win = doc.defaultView || window;
  if (win.Chart) return Promise.resolve(win.Chart);
  if (window.__chartjsPromise) return window.__chartjsPromise;
  window.__chartjsPromise = new Promise((resolve, reject) => {
    const s = doc.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    s.onload = () => resolve((doc.defaultView || window).Chart);
    s.onerror = (e) => { window.__chartjsPromise = null; reject(e); };
    doc.head.appendChild(s);
  });
  return window.__chartjsPromise;
}

async function fetchGraphes() {
  const key = periodKey();
  if (state.graphesLoading) return;
  if (state.graphesKey === key && state.evolutionData !== null) return;

  const { from, to } = getPeriodDates();
  state.graphesLoading = true;
  state.graphesError = null;
  state.graphesKey = key;

  try {
    const supabase = ctx.supabase;
    const params = {
      p_viewer_id_user: Number(userId),
      p_date_from: ymd(from),
      p_date_to: ymd(to)
    };
    const [evo, src] = await Promise.all([
      supabase.rpc('get_leads_par_jour', params),
      supabase.rpc('get_leads_par_source', params)
    ]);
    if (evo.error) throw evo.error;
    if (src.error) throw src.error;
    state.evolutionData = (evo.data || []).map(r => ({ jour: r.jour, nb: Number(r.nb_leads) || 0 }));
    state.sourcesData   = (src.data || []).map(r => ({ source: r.source, nb: Number(r.nb_leads) || 0 }));
  } catch (e) {
    console.error('[leadMgmt] Erreur RPC graphes', e);
    state.graphesError = (e && e.message) ? e.message : 'Erreur de chargement';
    state.evolutionData = [];
    state.sourcesData = [];
  } finally {
    state.graphesLoading = false;
    if (state.section === 'synthese' && window.__renderLeadMgmt) window.__renderLeadMgmt();
  }
}

function reloadGraphes() {
  state.evolutionData = null;
  state.sourcesData = null;
  state.graphesKey = null;
  if (state.section === 'synthese') fetchGraphes();
}

const SOURCE_COLORS = {
  rpv_sollicitation: '#53bda7',
  leboncoin:         '#fac055',
  la_centrale:       '#2a5ea9',
  autoscout:         '#2a5ea9',
  site_web:          '#9d7bc7',
  tel_traceur:       '#e0a93a',
  wa_entrant:        '#7fcfbb',
  inconnu:           '#acc5e4'
};
const SOURCE_PALETTE = ['#53bda7', '#2a5ea9', '#fac055', '#acc5e4', '#9d7bc7', '#7fcfbb', '#e0a93a', '#c4554a'];

function sourceLabel(src) {
  const s = SOURCE_LABELS[src];
  return s ? s.label : (src || 'Inconnu');
}

let __chartEvo = null, __chartSrc = null;
async function drawGraphes() {
  if (state.graphesLoading || state.evolutionData === null) return;
  let Chart;
  try { Chart = await loadChartJs(); }
  catch (e) { console.error('[leadMgmt] Chart.js non chargé', e); return; }
  if (!Chart) return;

  if (__chartEvo) { try { __chartEvo.destroy(); } catch(e){} __chartEvo = null; }
  if (__chartSrc) { try { __chartSrc.destroy(); } catch(e){} __chartSrc = null; }

  const cvEvo = doc.getElementById('lm-chart-evolution');
  if (cvEvo && state.evolutionData.length > 0) {
    const labels = state.evolutionData.map(d => {
      const dt = new Date(d.jour + 'T00:00:00');
      return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    });
    const values = state.evolutionData.map(d => d.nb);
    __chartEvo = new Chart(cvEvo.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Leads',
          data: values,
          backgroundColor: '#2a5ea9',
          borderRadius: 3,
          maxBarThickness: 22
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          title: items => 'Le ' + items[0].label,
          label: item => item.parsed.y + ' lead' + (item.parsed.y > 1 ? 's' : '')
        } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#7a9cc4', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
          y: { beginAtZero: true, grid: { color: '#eaf0f9' }, ticks: { color: '#7a9cc4', font: { size: 10 }, precision: 0 } }
        }
      }
    });
  }

  const cvSrc = doc.getElementById('lm-chart-sources');
  if (cvSrc && state.sourcesData.length > 0) {
    const labels = state.sourcesData.map(d => sourceLabel(d.source));
    const values = state.sourcesData.map(d => d.nb);
    const colors = state.sourcesData.map((d, i) => SOURCE_COLORS[d.source] || SOURCE_PALETTE[i % SOURCE_PALETTE.length]);
    const total = values.reduce((a, b) => a + b, 0);

    const centerText = {
      id: 'lmCenterText',
      afterDraw(chart) {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        const cx = (chartArea.left + chartArea.right) / 2;
        const cy = (chartArea.top + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#2a5ea9';
        ctx.font = '700 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText(String(total), cx, cy - 6);
        ctx.fillStyle = '#7a9cc4';
        ctx.font = '500 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText('leads', cx, cy + 12);
        ctx.restore();
      }
    };

    __chartSrc = new Chart(cvSrc.getContext('2d'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: '#fff', borderWidth: 2 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { position: 'right', labels: { color: '#4a6a8a', font: { size: 11 }, boxWidth: 10, usePointStyle: true, padding: 10 } },
          tooltip: { callbacks: {
            label: item => {
              const v = item.parsed;
              const pct = total ? Math.round(100 * v / total) : 0;
              return item.label + ' : ' + v + ' (' + pct + '%)';
            }
          } }
        }
      },
      plugins: [centerText]
    });
  }
}

function renderRankingItem(item, rank, side) {
  const isHighlighted = state.selectedVendeur && state.selectedVendeur.id_user === item.id_user;
  let rankCls = '';
  let itemCls = '';
  if (side === 'top') {
    if (rank === 1) rankCls = 'rank-1';
    else if (rank === 2) rankCls = 'rank-2';
    else if (rank === 3) rankCls = 'rank-3';
    itemCls = 'lm-ranking-good';
  } else {
    if (rank === 1) rankCls = 'rank-low-1';
    else if (rank === 2) rankCls = 'rank-low-2';
    else if (rank === 3) rankCls = 'rank-low-3';
    itemCls = 'lm-ranking-bad';
  }
  return (
    '<div class="lm-ranking-item ' + itemCls + (isHighlighted ? ' is-highlighted' : '') + '">' +
      '<div class="lm-ranking-item-left">' +
        '<div class="lm-ranking-rank ' + rankCls + '">' + rank + '</div>' +
        '<div style="min-width:0;flex:1;">' +
          '<div class="lm-ranking-name">' + escapeHtml(item.vendeur_nom) + '</div>' +
          '<div class="lm-ranking-detail">' + item.winCount + ' Win / ' + item.totalClos + ' clos avec lead</div>' +
        '</div>' +
      '</div>' +
      '<div class="lm-ranking-value">' + Math.round(item.taux) + '%</div>' +
    '</div>'
  );
}

function renderRankingBlock(side, ranking) {
  const TOP_N = 5;
  const title = side === 'top' ? '🏆 Top performers' : '⚠ À soutenir';

  if (state.rankingLoading || state.rankingData === null) {
    return '<div class="lm-block"><div class="lm-block-title">' + title + '</div>' +
           '<div class="lm-ranking-empty">Chargement…</div></div>';
  }
  if (state.rankingError) {
    return '<div class="lm-block"><div class="lm-block-title">' + title + '</div>' +
           '<div class="lm-ranking-empty">Erreur de chargement du classement</div></div>';
  }

  if (side === 'top') {
    ranking.sort((a, b) => b.taux - a.taux || b.winCount - a.winCount);
  } else {
    ranking.sort((a, b) => a.taux - b.taux || b.totalClos - a.totalClos);
  }
  const list = ranking.slice(0, TOP_N);
  let html = '<div class="lm-block"><div class="lm-block-title">' + title + '</div>';
  if (list.length === 0) {
    html += '<div class="lm-ranking-empty">Aucune donnée sur la période</div>';
  } else {
    html += '<div class="lm-ranking-list">';
    list.forEach((item, idx) => { html += renderRankingItem(item, idx + 1, side); });
    html += '</div>';
    if (state.selectedVendeur) {
      const inTop = list.some(it => it.id_user === state.selectedVendeur.id_user);
      if (!inTop) {
        const fullSorted = side === 'top'
          ? [...ranking].sort((a, b) => b.taux - a.taux || b.winCount - a.winCount)
          : [...ranking].sort((a, b) => a.taux - b.taux || b.totalClos - a.totalClos);
        const idx = fullSorted.findIndex(it => it.id_user === state.selectedVendeur.id_user);
        if (idx >= 0) {
          html += '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);font-size:10px;color:var(--text-mut);">';
          html += 'Position du vendeur consulté :</div>';
          html += '<div class="lm-ranking-list" style="margin-top:4px;">';
          html += renderRankingItem(fullSorted[idx], idx + 1, side);
          html += '</div>';
        }
      }
    }
  }
  html += '</div>';
  return html;
}

// --- 8c. CAMPAGNES (via RPC get_campagnes_sollicitation) ----
async function fetchCampagnes() {
  const key = periodKey();
  if (state.campagnesLoading) return;
  if (state.campagnesKey === key && state.campagnesData !== null) return;

  const { from, to } = getPeriodDates();
  state.campagnesLoading = true;
  state.campagnesError = null;
  state.campagnesKey = key;

  try {
    const supabase = ctx.supabase;
    const { data, error } = await supabase.rpc('get_campagnes_sollicitation', {
      p_viewer_id_user: Number(userId),
      p_date_from: ymd(from),
      p_date_to: ymd(to)
    });
    if (error) throw error;
    state.campagnesData = (data || []).map(r => ({
      campagne:          r.campagne || '(Sans nom de campagne)',
      nb_sollicitations: Number(r.nb_sollicitations) || 0,
      nb_clients:        Number(r.nb_clients)        || 0,
      nb_cycles:         Number(r.nb_cycles)         || 0,
      nb_propales:       Number(r.nb_propales)       || 0,
      nb_bdc:            Number(r.nb_bdc)            || 0,
      nb_wins:           Number(r.nb_wins)           || 0,
      nb_abandons:       Number(r.nb_abandons)       || 0,
      nb_vendeurs:       Number(r.nb_vendeurs)       || 0,
      nb_sites:          Number(r.nb_sites)          || 0,
      delai_median_h:    r.delai_median_h != null ? Number(r.delai_median_h) : null
    }));
  } catch (e) {
    console.error('[leadMgmt] Erreur RPC get_campagnes_sollicitation', e);
    state.campagnesError = (e && e.message) ? e.message : 'Erreur de chargement';
    state.campagnesData = [];
  } finally {
    state.campagnesLoading = false;
    if (state.section === 'campagnes' && window.__renderLeadMgmt) window.__renderLeadMgmt();
  }
}

function reloadCampagnes() {
  state.campagnesData = null;
  state.campagnesKey = null;
  if (state.section === 'campagnes') fetchCampagnes();
}

function renderCampagneFunnel(c) {
  const stages = [
    { key:'nb_sollicitations', label:'Sollicit.', color:'#2a5ea9' },
    { key:'nb_cycles',         label:'Cycles',    color:'#5b7fb0' },
    { key:'nb_propales',       label:'Propales',  color:'#7fcfbb' },
    { key:'nb_bdc',            label:'BDC',        color:'#fac055' },
    { key:'nb_wins',           label:'Wins',       color:'#53bda7' }
  ];
  const max = Math.max(1, c.nb_sollicitations);
  let html = '<div class="lm-funnel">';
  stages.forEach((st, i) => {
    const val = c[st.key] || 0;
    const prev = i > 0 ? (c[stages[i - 1].key] || 0) : null;
    const conv = (prev != null && prev > 0) ? Math.round(100 * val / prev) + '%' : null;
    const wPct = Math.max(18, Math.round(100 * val / max));
    if (i > 0) html += '<div class="lm-funnel-arrow">›</div>';
    html += '<div class="lm-funnel-stage">';
    html += '<div class="lm-funnel-bar" style="width:' + wPct + '%;background:' + st.color + '"><span class="lm-funnel-val">' + val + '</span></div>';
    html += '<div class="lm-funnel-lbl">' + st.label + '</div>';
    html += conv ? '<div class="lm-funnel-conv">' + conv + '</div>' : '<div class="lm-funnel-conv">&nbsp;</div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function renderCampagneCard(c) {
  const roi = c.nb_sollicitations > 0 ? (100 * c.nb_wins / c.nb_sollicitations) : 0;
  const roiCls = roi >= 10 ? 'roi-good' : roi >= 3 ? 'roi-mid' : 'roi-low';
  let html = '<div class="lm-cmp-card">';
  html += '<div class="lm-cmp-head">';
  html += '<div class="lm-cmp-name" title="' + escapeHtml(c.campagne) + '">' + escapeHtml(c.campagne) + '</div>';
  html += '<div class="lm-cmp-tags">';
  html += '<span class="lm-cmp-tag ' + roiCls + '">ROI ' + roi.toFixed(1) + '%</span>';
  html += '<span class="lm-cmp-tag">' + c.nb_sollicitations + ' sollicit.</span>';
  html += '</div></div>';
  html += renderCampagneFunnel(c);
  html += '<div class="lm-cmp-foot">';
  html += '<span><b>' + c.nb_clients + '</b> clients</span>';
  html += '<span><b>' + c.nb_abandons + '</b> abandons</span>';
  html += '<span>Délai 1er contact : <b>' + (c.delai_median_h != null ? formatDelaiKpi(c.delai_median_h) : '—') + '</b></span>';
  html += '<span><b>' + c.nb_vendeurs + '</b> vendeur' + (c.nb_vendeurs > 1 ? 's' : '') + ' · <b>' + c.nb_sites + '</b> site' + (c.nb_sites > 1 ? 's' : '') + '</span>';
  html += '</div>';
  html += '</div>';
  return html;
}

function renderViewCampagnes() {
  if (state.campagnesData === null || state.campagnesKey !== periodKey()) {
    fetchCampagnes();
  }
  let html = '';
  html += renderPeriodBar();

  if (state.campagnesLoading || state.campagnesData === null) {
    html += '<div class="lm-empty">Chargement des campagnes…</div>';
    return html;
  }
  if (state.campagnesError) {
    html += '<div class="lm-empty">Erreur de chargement des campagnes</div>';
    return html;
  }
  const data = state.campagnesData;
  if (data.length === 0) {
    html += '<div class="lm-empty">Aucune campagne de sollicitation sur la période</div>';
    return html;
  }

  const totSoll = data.reduce((s, c) => s + c.nb_sollicitations, 0);
  const totWins = data.reduce((s, c) => s + c.nb_wins, 0);
  const totCycles = data.reduce((s, c) => s + c.nb_cycles, 0);
  const tauxGlobal = totSoll > 0 ? Math.round(100 * totWins / totSoll) : 0;
  html += '<div class="lm-cmp-summary">';
  html += '<div class="lm-synth-kpi-card"><div class="lm-synth-kpi-label">Campagnes</div><div class="lm-synth-kpi-value">' + data.length + '</div><div class="lm-synth-kpi-sub">actives sur la période</div></div>';
  html += '<div class="lm-synth-kpi-card"><div class="lm-synth-kpi-label">Sollicitations</div><div class="lm-synth-kpi-value">' + totSoll + '</div><div class="lm-synth-kpi-sub">' + totCycles + ' cycles générés</div></div>';
  html += '<div class="lm-synth-kpi-card kpi-good"><div class="lm-synth-kpi-label">Wins issus</div><div class="lm-synth-kpi-value">' + totWins + '</div><div class="lm-synth-kpi-sub">toutes campagnes</div></div>';
  const globCls = tauxGlobal >= 10 ? 'kpi-good' : tauxGlobal < 3 ? 'kpi-critique' : 'kpi-warn';
  html += '<div class="lm-synth-kpi-card ' + globCls + '"><div class="lm-synth-kpi-label">ROI global</div><div class="lm-synth-kpi-value">' + tauxGlobal + '%</div><div class="lm-synth-kpi-sub">Wins / sollicitation</div></div>';
  html += '</div>';

  const sorted = [...data].sort((a, b) => b.nb_sollicitations - a.nb_sollicitations);
  for (const c of sorted) html += renderCampagneCard(c);

  return html;
}

// --- 9. Tableau d'équipe ------------------------------------
function buildTeamTree() {
  const byReseau = {};
  for (const s of dataKpiSiteScope) {
    const reseau = s.reseau || '(Sans réseau)';
    const affaire = s.affaire || '(Sans affaire)';
    if (!byReseau[reseau]) byReseau[reseau] = { label: reseau, affaires: {}, kpi: emptyKpi() };
    if (!byReseau[reseau].affaires[affaire]) byReseau[reseau].affaires[affaire] = { label: affaire, sites: [], kpi: emptyKpi() };
    const siteNode = { id_site:s.id_site, label:s.nom_site, ville:s.ville, vendeurs:[], kpi:{ cycles_total:s.cycles_total, a_traiter:s.a_traiter, pipeline:s.pipeline, clos_recent:s.clos_recent } };
    byReseau[reseau].affaires[affaire].sites.push(siteNode);
    aggregate(byReseau[reseau].kpi, siteNode.kpi);
    aggregate(byReseau[reseau].affaires[affaire].kpi, siteNode.kpi);
  }
  const siteMap = {};
  for (const r of Object.values(byReseau))
    for (const a of Object.values(r.affaires))
      for (const s of a.sites) siteMap[s.id_site] = s;
  for (const v of dataKpiVendScope) {
    const s = siteMap[v.id_site];
    if (!s) continue;
    s.vendeurs.push(v);
  }
  const reseauList = Object.values(byReseau);
  for (const r of reseauList) {
    r.affaires = Object.values(r.affaires);
    r.affaires.sort((x,y) => (x.label||'').localeCompare(y.label||''));
    for (const a of r.affaires) {
      a.sites.sort((x,y) => (x.label||'').localeCompare(y.label||''));
      for (const s of a.sites) s.vendeurs.sort((x,y) => (x.vendeur_nom||'').localeCompare(y.vendeur_nom||''));
    }
  }
  reseauList.sort((x,y) => (x.label||'').localeCompare(y.label||''));
  return reseauList;
}
function emptyKpi() { return { cycles_total:0, a_traiter:0, pipeline:0, clos_recent:0 }; }
function aggregate(target, src) {
  target.cycles_total += src.cycles_total || 0;
  target.a_traiter    += src.a_traiter    || 0;
  target.pipeline     += src.pipeline     || 0;
  target.clos_recent  += src.clos_recent  || 0;
}
function kpiCells(kpi) {
  return (
    '<td class="lm-team-kpi">' + (kpi.cycles_total || 0) + '</td>' +
    '<td class="lm-team-kpi ' + kpiClass(kpi.a_traiter, 'a_traiter') + '">' + (kpi.a_traiter || 0) + '</td>' +
    '<td class="lm-team-kpi ' + kpiClass(kpi.pipeline, 'pipeline') + '">' + (kpi.pipeline || 0) + '</td>' +
    '<td class="lm-team-kpi ' + kpiClass(kpi.clos_recent, 'clos_recent') + '">' + (kpi.clos_recent || 0) + '</td>'
  );
}
function expandIcon(open) { return '<span class="lm-expand-icon">' + (open ? '▼' : '▶') + '</span>'; }
function siteRow(s, sKey) {
  const sOpen = !!state.expanded[sKey];
  const isBus = state.busSite != null && String(state.busSite) === String(s.id_site);
  const villeHtml = s.ville ? ' <span style="color:var(--text-mut);font-size:10px;font-weight:400">· ' + escapeHtml(s.ville) + '</span>' : '';
  const pin = isBus ? '<span class="lm-site-pin" title="Site global">📍</span>' : '';
  return '<tr class="row-site' + (isBus ? ' is-bus-focus' : '') + '" data-expand-key="' + escapeHtml(sKey) + '" data-site-id="' + escapeHtml(s.id_site) + '"><td>' + expandIcon(sOpen) + escapeHtml(s.label) + villeHtml + pin + '</td>' + kpiCells(s.kpi) + '</tr>';
}
function renderTeamTable() {
  adoptBusSelectionLead();
  let rows = '';
  if (isChefVentes) {
    const myVendeurs = dataKpiVendScope.filter(v => v.id_manager === userId);
    if (myVendeurs.length === 0) {
      rows = '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text-mut);font-size:12px">Aucun vendeur rattaché à votre management.</td></tr>';
    } else {
      const bySite = {};
      for (const v of myVendeurs) {
        if (!bySite[v.id_site]) {
          const siteInfo = dataKpiSiteScope.find(s => s.id_site === v.id_site) || {};
          bySite[v.id_site] = { id_site:v.id_site, label:siteInfo.nom_site||('Site '+v.id_site), ville:siteInfo.ville||'', vendeurs:[], kpi:emptyKpi() };
        }
        bySite[v.id_site].vendeurs.push(v);
        aggregate(bySite[v.id_site].kpi, {cycles_total:v.cycles_total,a_traiter:v.a_traiter,pipeline:v.pipeline,clos_recent:v.clos_recent});
      }
      const sitesList = Object.values(bySite).sort((x,y) => (x.label||'').localeCompare(y.label||''));
      const monoSite = (sitesList.length === 1);
      for (const s of sitesList) {
        if (!monoSite) {
          const sKey = 's:' + s.id_site;
          rows += siteRow(s, sKey);
          if (!state.expanded[sKey]) continue;
        }
        s.vendeurs.sort((a,b) => (a.vendeur_nom||'').localeCompare(b.vendeur_nom||''));
        for (const v of s.vendeurs) {
          const isSel = state.selectedVendeur && state.selectedVendeur.id_user === v.id_user && state.selectedVendeur.id_site === v.id_site;
          const cls = monoSite ? 'is-direct' : '';
          rows += '<tr class="row-vendeur ' + cls + ' ' + (isSel ? 'is-selected' : '') + '" data-vendeur-id="' + v.id_user + '" data-vendeur-site="' + v.id_site + '" data-vendeur-nom="' + escapeHtml(v.vendeur_nom||'') + '"><td>' + escapeHtml(v.vendeur_nom || 'Sans nom') + '</td>' + kpiCells({cycles_total:v.cycles_total,a_traiter:v.a_traiter,pipeline:v.pipeline,clos_recent:v.clos_recent}) + '</tr>';
        }
      }
    }
  } else {
    const tree = buildTeamTree();
    if (tree.length === 0)
      return '<div class="lm-team"><div class="lm-team-header"><div class="lm-team-title">Équipe</div></div><div class="lm-empty" style="padding:20px;font-size:12px">Aucun site dans votre périmètre.</div></div>';
    const collapseReseau = (tree.length === 1);
    for (const r of tree) {
      const rKey = 'r:' + r.label;
      const rOpen = !!state.expanded[rKey] || collapseReseau;
      if (!collapseReseau) {
        rows += '<tr class="row-reseau" data-expand-key="' + escapeHtml(rKey) + '"><td>' + expandIcon(rOpen) + escapeHtml(r.label) + '</td>' + kpiCells(r.kpi) + '</tr>';
      }
      if (!rOpen) continue;
      const collapseAffaire = collapseReseau && r.affaires.length === 1;
      for (const a of r.affaires) {
        const aKey = rKey + '|a:' + a.label;
        const aOpen = !!state.expanded[aKey] || collapseAffaire;
        if (!collapseAffaire) {
          rows += '<tr class="row-affaire" data-expand-key="' + escapeHtml(aKey) + '"><td>' + expandIcon(aOpen) + escapeHtml(a.label) + '</td>' + kpiCells(a.kpi) + '</tr>';
        }
        if (!aOpen) continue;
        for (const s of a.sites) {
          const sKey = aKey + '|s:' + s.id_site;
          rows += siteRow(s, sKey);
          if (!state.expanded[sKey]) continue;
          if (s.vendeurs.length === 0) {
            rows += '<tr class="row-vendeur"><td style="font-style:italic;color:var(--text-mut)">Aucun vendeur rattaché</td><td colspan="4"></td></tr>';
          } else {
            for (const v of s.vendeurs) {
              const isSel = state.selectedVendeur && state.selectedVendeur.id_user === v.id_user && state.selectedVendeur.id_site === v.id_site;
              rows += '<tr class="row-vendeur ' + (isSel ? 'is-selected' : '') + '" data-vendeur-id="' + v.id_user + '" data-vendeur-site="' + v.id_site + '" data-vendeur-nom="' + escapeHtml(v.vendeur_nom||'') + '"><td>' + escapeHtml(v.vendeur_nom || 'Sans nom') + '</td>' + kpiCells({cycles_total:v.cycles_total,a_traiter:v.a_traiter,pipeline:v.pipeline,clos_recent:v.clos_recent}) + '</tr>';
            }
          }
        }
      }
    }
  }
  const busChip = state.busSite != null ? '<span class="lm-bus-chip">📍 site global focalisé</span>' : '';
  return (
    '<div class="lm-team">' +
      '<div class="lm-team-header"><div class="lm-team-title">' + (isChefVentes ? 'Mon équipe' : 'Équipe — Périmètre') + '</div>' + busChip + '</div>' +
      '<div class="lm-team-scroll">' +
        '<table class="lm-team-table">' +
          '<thead><tr><th>' + (isChefVentes ? 'Vendeur' : 'Périmètre') + '</th><th>Total</th><th>À traiter</th><th>Pipeline</th><th>Win+Ab (30j)</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>'
  );
}

// --- 10. Vue Synthèse ---------------------------------------
function renderViewSynthese() {
  const kpi = computeSyntheseKpi();
  if (state.rankingData === null || state.rankingKey !== periodKey()) {
    fetchClassement();
  }
  const ranking = Array.isArray(state.rankingData) ? state.rankingData : [];
  let html = '';
  html += renderTeamTable();
  html += renderPeriodBar();
  html += '<div class="lm-synthese">';
  html += '<div class="lm-synth-kpi">';
  html += '<div class="lm-synth-kpi-card"><div class="lm-synth-kpi-label">Cycles actifs</div><div class="lm-synth-kpi-value">' + kpi.cyclesActifs + '</div><div class="lm-synth-kpi-sub">Cycles ouverts (instantané)</div></div>';
  const winClass = kpi.winCount > 0 ? 'kpi-good' : '';
  html += '<div class="lm-synth-kpi-card ' + winClass + '"><div class="lm-synth-kpi-label">Win sur période</div><div class="lm-synth-kpi-value">' + kpi.winCount + '</div><div class="lm-synth-kpi-sub">' + kpi.abandonCount + ' abandon' + (kpi.abandonCount !== 1 ? 's' : '') + '</div></div>';
  let convClass = '', convValue = '—';
  if (kpi.tauxConv !== null) {
    convValue = kpi.tauxConv + '%';
    if (kpi.tauxConv >= 60)      convClass = 'kpi-good';
    else if (kpi.tauxConv < 30)  convClass = 'kpi-critique';
    else if (kpi.tauxConv < 50)  convClass = 'kpi-warn';
  } else { convClass = 'kpi-na'; }
  html += '<div class="lm-synth-kpi-card ' + convClass + '"><div class="lm-synth-kpi-label">Taux conversion</div><div class="lm-synth-kpi-value">' + convValue + '</div><div class="lm-synth-kpi-sub">Win / (Win + Abandon)</div></div>';
  let delaiClass = '', delaiValue = '—';
  if (kpi.delaiMedian !== null) {
    delaiValue = formatDelaiKpi(kpi.delaiMedian);
    if (kpi.delaiMedian < 1)        delaiClass = 'kpi-good';
    else if (kpi.delaiMedian > 24)  delaiClass = 'kpi-critique';
    else if (kpi.delaiMedian > 4)   delaiClass = 'kpi-warn';
  } else { delaiClass = 'kpi-na'; }
  html += '<div class="lm-synth-kpi-card ' + delaiClass + '"><div class="lm-synth-kpi-label">Délai 1er contact</div><div class="lm-synth-kpi-value">' + delaiValue + '</div><div class="lm-synth-kpi-sub">Médiane sur ' + kpi.nbDelais + ' lead' + (kpi.nbDelais !== 1 ? 's' : '') + '</div></div>';
  html += '</div>';
  html += '<div class="lm-synth-2col">';
  html +=   renderRankingBlock('top', [...ranking]);
  html +=   renderRankingBlock('bottom', [...ranking]);
  html += '</div>';
  if (state.evolutionData === null || state.graphesKey !== periodKey()) {
    fetchGraphes();
  }
  html += '<div class="lm-synth-2col">';
  if (state.graphesLoading || state.evolutionData === null) {
    html += '<div class="lm-block"><div class="lm-block-title">Évolution des leads</div><div class="lm-chart-placeholder">Chargement…</div></div>';
    html += '<div class="lm-block"><div class="lm-block-title">Répartition par source</div><div class="lm-chart-placeholder">Chargement…</div></div>';
  } else if (state.graphesError) {
    html += '<div class="lm-block"><div class="lm-block-title">Évolution des leads</div><div class="lm-chart-placeholder">Erreur de chargement</div></div>';
    html += '<div class="lm-block"><div class="lm-block-title">Répartition par source</div><div class="lm-chart-placeholder">Erreur de chargement</div></div>';
  } else {
    const evoEmpty = state.evolutionData.length === 0;
    const srcEmpty = state.sourcesData.length === 0;
    html += '<div class="lm-block"><div class="lm-block-title">Évolution des leads</div>' +
            (evoEmpty ? '<div class="lm-chart-placeholder">Aucun lead sur la période</div>'
                      : '<div class="lm-chart-wrap"><canvas id="lm-chart-evolution"></canvas></div>') +
            '</div>';
    html += '<div class="lm-block"><div class="lm-block-title">Répartition par source</div>' +
            (srcEmpty ? '<div class="lm-chart-placeholder">Aucun lead sur la période</div>'
                      : '<div class="lm-chart-wrap"><canvas id="lm-chart-sources"></canvas></div>') +
            '</div>';
  }
  html += '</div>';
  html += '</div>';
  return html;
}

// --- 11. Vues À traiter / Pipeline --------------------------
const SECTIONS = [
  { key:'sla_critique', titre:"Urgent — Rappeler dans l'heure", cls:'section-critical' },
  { key:'sla_depasse',  titre:'SLA dépassé',                     cls:'section-warn' },
  { key:'a_traiter',    titre:"À traiter aujourd'hui",            cls:'' },
  { key:'a_relancer',   titre:'Cycles à relancer',                cls:'' },
  { key:'suivi_normal', titre:'Suivi normal',                     cls:'' }
];
function matchVendeurFilter(c) {
  if (!state.selectedVendeur) return true;
  const arr = c.user_ids_actifs;
  if (Array.isArray(arr) && arr.length > 0) {
    return arr.includes(state.selectedVendeur.id_user);
  }
  return true;
}
function filteredActifs() {
  const q = state.search.trim().toLowerCase();
  return dataActifs.filter(c => {
    if (!matchVendeurFilter(c)) return false;
    if (state.filterSource === '__none__') { if (c.source_dernier_lead) return false; }
    else if (state.filterSource !== 'all') { if (c.source_dernier_lead !== state.filterSource) return false; }
    if (!q) return true;
    const blob = [c.client_nom, c.client_prenom, c.site_nom, c.site_ville, c.message_dernier_lead, c.client_email, c.client_tel].map(x => (x||'').toString().toLowerCase()).join(' ');
    return blob.includes(q);
  });
}
function computeKpi(rows) {
  return {
    sla_critique: rows.filter(r => r.etat_action === 'sla_critique').length,
    sla_depasse:  rows.filter(r => r.etat_action === 'sla_depasse').length,
    a_traiter:    rows.filter(r => r.etat_action === 'a_traiter').length,
    a_relancer:   rows.filter(r => r.etat_action === 'a_relancer').length,
    chauds:       rows.filter(r => r.temperature === 'chaud').length,
    total:        rows.length
  };
}
function countBySource(data, applyVendeurFilter) {
  const counts = { all: 0, __none__: 0 };
  for (const r of data) {
    if (applyVendeurFilter && !matchVendeurFilter(r)) continue;
    counts.all += 1;
    if (!r.source_dernier_lead) counts.__none__ += 1;
    else counts[r.source_dernier_lead] = (counts[r.source_dernier_lead] || 0) + 1;
  }
  return counts;
}
function renderFiltersBar(counts) {
  let html = '<div class="filters">';
  for (const c of FILTER_CHIPS) {
    if ((counts[c.k] || 0) === 0 && c.k !== 'all') continue;
    html += '<div class="filter-chip' + (state.filterSource === c.k ? ' active' : '') + '" data-source="' + c.k + '">' + escapeHtml(c.l) + '<span class="count">' + (counts[c.k] || 0) + '</span></div>';
  }
  html += '<input class="filter-search" id="lm-search" placeholder="Rechercher client, véhicule…" value="' + escapeHtml(state.search) + '">';
  html += '</div>';
  return html;
}
function renderActifCard(c) {
  const cls = c.etat_action || 'suivi_normal';
  const idClient = c.id_client || '';
  const clientFull = ((c.client_prenom||'') + ' ' + (c.client_nom||'')).trim();
  const siteInfo = (c.site_nom||'') + (c.site_ville ? ' · ' + c.site_ville : '');
  const tempCls = { chaud:'temp-chaud', tiede:'temp-tiede', froid:'temp-froid' }[c.temperature] || 'temp-froid';
  let slaLabel = '';
  if (cls === 'sla_critique' || cls === 'sla_depasse') slaLabel = formatDuree(c.heures_depuis_activite);
  else if (cls === 'a_traiter') slaLabel = 'À traiter';
  else if (cls === 'a_relancer') slaLabel = 'À relancer · ' + formatDuree(c.heures_depuis_activite);
  else slaLabel = formatDuree(c.heures_depuis_activite);
  const clientLabel = escapeHtml(clientFull || 'Prospect non qualifié');
  const dataClientAttr = 'data-client="' + escapeHtml(idClient) + '"';
  return (
    '<div class="card card-clickable ' + cls + '" data-action="open-fiche-cycle" data-cycle-id="' + c.id_cycle_com + '" ' + dataClientAttr + ' title="Ouvrir le cycle client">' +
      '<div class="card-row1"><div style="min-width:0; flex:1;"><div class="card-client-name">' + clientLabel + '</div><div class="card-site">' + escapeHtml(siteInfo) + '</div></div><div class="card-sla">' + escapeHtml(slaLabel) + '</div></div>' +
      '<div class="card-lead-line">' + sourceBadge(c.source_dernier_lead) + '</div>' +
      (c.message_dernier_lead ? '<div class="card-message">' + escapeHtml(c.message_dernier_lead) + '</div>' : '') +
      '<div class="card-footer"><div class="card-meta"><span class="card-meta-item"><span class="temperature ' + tempCls + '"></span>' + escapeHtml(c.temperature||'') + '</span><span class="card-meta-item">' + (c.nb_leads||0) + ' lead' + ((c.nb_leads||0) > 1 ? 's' : '') + '</span><span class="card-meta-item">' + (c.nb_contacts||0) + ' contact' + ((c.nb_contacts||0) > 1 ? 's' : '') + '</span></div></div>' +
    '</div>'
  );
}

// --- 11b. Regroupement par campagne (filtre Sollicitation MKG) ---
function renderCampagneHeader(name, rows, isOpen, key) {
  const nbCrit = rows.filter(r => r.etat_action === 'sla_critique').length;
  const nbWarn = rows.filter(r => r.etat_action === 'sla_depasse').length;
  let stats = '';
  if (nbCrit > 0) stats += '<span class="lm-campagne-stat crit">' + nbCrit + ' urgent' + (nbCrit > 1 ? 's' : '') + '</span>';
  if (nbWarn > 0) stats += '<span class="lm-campagne-stat warn">' + nbWarn + ' SLA</span>';
  stats += '<span class="lm-campagne-stat">' + rows.length + ' cycle' + (rows.length > 1 ? 's' : '') + '</span>';
  return '<div class="lm-campagne-header" data-expand-key="' + escapeHtml(key) + '">' +
    '<span class="lm-campagne-icon">' + (isOpen ? '▼' : '▶') + '</span>' +
    '<div class="lm-campagne-title" title="' + escapeHtml(name) + '">' + escapeHtml(name) + '</div>' +
    '<div class="lm-campagne-stats">' + stats + '</div>' +
  '</div>';
}

function renderActifsByCampagne(rows) {
  const groups = new Map();
  for (const r of rows) {
    const k = r.message_dernier_lead || '(Sans nom de campagne)';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  let html = '';
  for (const name of sortedKeys) {
    const rs = groups.get(name);
    const key = 'campagne:' + name;
    const isOpen = !!state.expanded[key];
    html += '<div class="lm-campagne' + (isOpen ? ' is-open' : '') + '">';
    html += renderCampagneHeader(name, rs, isOpen, key);
    html += '<div class="lm-campagne-body">';
    if (isOpen) {
      const bySection = {};
      for (const r of rs) {
        const k = r.etat_action || 'suivi_normal';
        if (!bySection[k]) bySection[k] = [];
        bySection[k].push(r);
      }
      let any = false;
      for (const sec of SECTIONS) {
        const list = bySection[sec.key];
        if (!list || !list.length) continue;
        any = true;
        html += '<div class="section ' + sec.cls + '">';
        html += '<div class="section-header"><div class="section-title">' + sec.titre + '</div><div class="section-count">' + list.length + '</div></div>';
        html += '<div class="cards">';
        for (const c of list) html += renderActifCard(c);
        html += '</div></div>';
      }
      if (!any) html += '<div class="lm-empty" style="padding:16px;font-size:11px">Aucun cycle dans cette campagne</div>';
    }
    html += '</div></div>';
  }
  return html;
}

function renderViewActifs() {
  const rows = filteredActifs();
  const kpi = computeKpi(rows);
  const counts = countBySource(dataActifs, true);
  let html = '';
  if (isVendeur) {
    html += '<div class="kpi-bar">';
    html += '<div class="kpi kpi-critique"><div class="kpi-label">SLA dépassé</div><div class="kpi-value">' + (kpi.sla_critique + kpi.sla_depasse) + '</div></div>';
    html += '<div class="kpi kpi-warn"><div class="kpi-label">À traiter</div><div class="kpi-value">' + kpi.a_traiter + '</div></div>';
    html += '<div class="kpi"><div class="kpi-label">Relances dues</div><div class="kpi-value">' + kpi.a_relancer + '</div></div>';
    html += '<div class="kpi kpi-good"><div class="kpi-label">Cycles chauds</div><div class="kpi-value">' + kpi.chauds + '</div></div>';
    html += '<div class="kpi"><div class="kpi-label">Cycles ouverts</div><div class="kpi-value">' + kpi.total + '</div></div>';
    html += '</div>';
  }
  html += renderFiltersBar(counts);

  if (state.filterSource === 'rpv_sollicitation') {
    if (rows.length === 0) html += '<div class="lm-empty">Aucun cycle ne correspond à ces critères</div>';
    else                   html += renderActifsByCampagne(rows);
    return html;
  }

  const bySection = {};
  for (const r of rows) {
    const k = r.etat_action || 'suivi_normal';
    if (!bySection[k]) bySection[k] = [];
    bySection[k].push(r);
  }
  for (const sec of SECTIONS) {
    const list = bySection[sec.key];
    if (!list || list.length === 0) continue;
    html += '<div class="section ' + sec.cls + '">';
    html += '<div class="section-header"><div class="section-title">' + sec.titre + '</div><div class="section-count">' + list.length + '</div></div>';
    html += '<div class="cards">';
    for (const c of list) html += renderActifCard(c);
    html += '</div></div>';
  }
  if (rows.length === 0) html += '<div class="lm-empty">Aucun cycle ne correspond à ces critères</div>';
  return html;
}

const KANBAN_COLS = [{ key:'nouveau',  titre:'Nouveau' },{ key:'en_cours', titre:'En cours' },{ key:'avance',   titre:'Avancé' },{ key:'clos',     titre:'Clos' }];
function filteredKanban() {
  const q = state.search.trim().toLowerCase();
  return dataKanban.filter(c => {
    if (!matchVendeurFilter(c)) return false;
    if (state.filterSource === '__none__') { if (c.source_dernier_lead) return false; }
    else if (state.filterSource !== 'all') { if (c.source_dernier_lead !== state.filterSource) return false; }
    if (!q) return true;
    const blob = [c.client_nom, c.client_prenom, c.site_nom, c.site_ville, c.client_email, c.client_tel].map(x => (x||'').toString().toLowerCase()).join(' ');
    return blob.includes(q);
  });
}
function renderKanbanCard(c) {
  const clientFull = ((c.client_prenom||'') + ' ' + (c.client_nom||'')).trim();
  const idClient = c.id_client || '';
  const isClos = c.statut_kanban === 'clos';
  let badges = '';
  if (isClos) {
    if (c.type_cloture === 'win') badges += '<span class="lm-kbadge win">Win</span>';
    else if (c.type_cloture === 'abandon') badges += '<span class="lm-kbadge abandon">Abandon</span>';
    else badges += '<span class="lm-kbadge autre">Clos</span>';
  } else {
    if ((c.nb_propales || 0) > 0) badges += '<span class="lm-kbadge propale">' + c.nb_propales + ' propale' + (c.nb_propales > 1 ? 's' : '') + '</span>';
    if ((c.heures_inactivite || 0) > 168) badges += '<span class="lm-kbadge inact">Inactif ' + formatDuree(c.heures_inactivite) + '</span>';
    if (c.source_dernier_lead) badges += sourceBadge(c.source_dernier_lead);
  }
  let meta = '';
  if (isClos) meta = '<span class="lm-kcard-meta-item">Fermé ' + formatJours(c.jours_depuis_cloture) + '</span>';
  else {
    const nbContacts = c.nb_contacts_total || 0;
    meta += '<span class="lm-kcard-meta-item">' + nbContacts + ' contact' + (nbContacts > 1 ? 's' : '') + '</span>';
    if (c.last_contact_at) {
      const heuresDepuis = (Date.now() - new Date(c.last_contact_at).getTime()) / 3600000;
      if (heuresDepuis >= 0) meta += '<span class="lm-kcard-meta-item">· dernier ' + formatDuree(heuresDepuis) + '</span>';
    } else if (nbContacts === 0) meta = '<span class="lm-kcard-meta-item">aucun contact</span>';
  }
  return '<div class="lm-kcard" data-action="open-fiche-cycle" data-client="' + escapeHtml(idClient) + '" data-cycle-id="' + c.id_cycle_com + '" title="Ouvrir le cycle client"><div class="lm-kcard-client">' + escapeHtml(clientFull || 'Prospect') + '</div><div class="lm-kcard-meta">' + meta + '</div>' + (badges ? '<div class="lm-kcard-badges">' + badges + '</div>' : '') + '</div>';
}
function renderViewKanban() {
  const rows = filteredKanban();
  const counts = countBySource(dataKanban, true);
  let html = '';
  html += renderFiltersBar(counts);
  if (rows.length === 0 && dataKanban.length === 0) {
    html += '<div class="lm-empty">Aucun cycle pour le site sélectionné</div>';
    return html;
  }
  const byCol = { nouveau:[], en_cours:[], avance:[], clos:[] };
  for (const c of rows) {
    const k = c.statut_kanban || 'nouveau';
    if (byCol[k]) byCol[k].push(c);
  }
  for (const k of Object.keys(byCol)) {
    byCol[k].sort((a, b) => {
      const da = k === 'clos' ? new Date(a.cycle_maj_le || 0) : new Date(a.last_contact_at || a.cycle_ouvert_le || 0);
      const db = k === 'clos' ? new Date(b.cycle_maj_le || 0) : new Date(b.last_contact_at || b.cycle_ouvert_le || 0);
      return db - da;
    });
  }
  html += '<div class="lm-kanban">';
  for (const col of KANBAN_COLS) {
    const list = byCol[col.key] || [];
    html += '<div class="lm-col" data-statut="' + col.key + '">';
    html +=   '<div class="lm-col-head"><div class="lm-col-title">' + col.titre + '</div><div class="lm-col-count">' + list.length + '</div></div>';
    html +=   '<div class="lm-col-body">';
    if (list.length === 0) html += '<div class="lm-kanban-empty">Aucun cycle</div>';
    else for (const c of list) html += renderKanbanCard(c);
    html +=   '</div>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// --- 12. Section Suivi leads --------------------------------
function renderSectionSuiviLeads() {
  let html = '';
  html += renderTeamTable();

  if (!state.selectedVendeur) {
    return html;
  }

  if (!isVendeur) {
    html += '<div class="lm-consultation-banner">';
    html += '<div class="lm-consultation-banner-text">Consultation : <strong>' + escapeHtml(state.selectedVendeur.vendeur_nom) + '</strong></div>';
    html += '<button type="button" class="lm-consultation-close" data-action="clear-vendeur">✕ Quitter</button>';
    html += '</div>';
  }
  html += '<div class="lm-subtoggle">';
  html += '<button type="button" class="lm-subtoggle-btn' + (state.view === 'a_traiter' ? ' active' : '') + '" data-view="a_traiter">À traiter</button>';
  html += '<button type="button" class="lm-subtoggle-btn' + (state.view === 'pipeline'  ? ' active' : '') + '" data-view="pipeline">Pipeline</button>';
  html += '</div>';
  if (state.cyclesLoading) {
    html += '<div class="lm-empty" style="padding:30px;font-size:12px">Chargement des cycles…</div>';
    return html;
  }
  if (state.view === 'pipeline') html += renderViewKanban();
  else                            html += renderViewActifs();
  return html;
}

// --- 12b. ONGLET "Créer une campagne" (managers, tous sauf rôle 4) -----------
//   Cible des CLIENT par critères, choisit une logique d'affectation, simule
//   (RPC dry_run) puis crée les RPV 'Sollicitation' (RPC commit).
function campState() {
  if (!state.camp) state.camp = { result: null, loading: false, error: null, launched: 0, done: false, params: null };
  return state.camp;
}

function siteOptionsCamp() {
  const m = {};
  for (const s of dataKpiSiteScope) { if (s.id_site != null) m[s.id_site] = s.nom_site || ('Site ' + s.id_site); }
  return Object.keys(m).map(k => ({ id: Number(k), nom: m[k] })).sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
}
function vendeurOptionsCamp() {
  const out = [];
  for (const info of vendeurInfoMap.values()) out.push({ id_user: info.id_user, nom: info.vendeur_nom || ('Vendeur ' + info.id_user) });
  return out.sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
}
function vendeurNomCamp(idu) {
  const info = vendeurInfoMap.get(Number(idu));
  return info ? (info.vendeur_nom || ('Vendeur ' + idu)) : ('Vendeur ' + idu);
}

function champText(id, label, ph) {
  return '<div class="lm-camp-field"><label class="lm-camp-lbl" for="' + id + '">' + escapeHtml(label) + '</label>' +
         '<input type="text" id="' + id + '" class="lm-camp-input" placeholder="' + escapeHtml(ph || '') + '" autocomplete="off"></div>';
}
function champNumber(id, label, ph) {
  return '<div class="lm-camp-field"><label class="lm-camp-lbl" for="' + id + '">' + escapeHtml(label) + '</label>' +
         '<input type="number" id="' + id + '" class="lm-camp-input" placeholder="' + escapeHtml(ph || '') + '"></div>';
}
function champSelect(id, label, opts) {
  let o = '';
  for (const pair of opts) o += '<option value="' + escapeHtml(pair[0]) + '">' + escapeHtml(pair[1]) + '</option>';
  return '<div class="lm-camp-field"><label class="lm-camp-lbl" for="' + id + '">' + escapeHtml(label) + '</label>' +
         '<select id="' + id + '" class="lm-camp-input">' + o + '</select></div>';
}

function renderViewCreationCampagne() {
  campState();
  const sites = siteOptionsCamp();
  const vendeurs = vendeurOptionsCamp();
  let h = '<div class="lm-camp">';

  // 1 — Cible
  h += '<div class="lm-block"><div class="lm-block-title">1 · Définir la cible</div><div class="lm-camp-grid">';
  h += champSelect('camp-type', 'Type de client', [['', 'Tous'], ['particulier', 'Particuliers'], ['societe', 'Sociétés']]);
  h += champText('camp-marque', 'Marque du véhicule', 'ex : TOYOTA');
  h += champText('camp-modele', 'Modèle (contient)', 'ex : YARIS');
  h += champNumber('camp-age', 'Véhicule de … ans et +', 'ex : 4');
  h += champNumber('camp-kmmin', 'Km min', '');
  h += champNumber('camp-kmmax', 'Km max', '');
  h += champText('camp-deps', 'Départements (CP)', 'ex : 75, 92, 94');
  h += champText('camp-csp', 'CSP', '');
  h += '<div class="lm-camp-field lm-camp-full"><label class="lm-camp-lbl">Sites ciblés <span class="lm-camp-hint">(aucun coché = tout le périmètre)</span></label><div class="lm-camp-checks">';
  for (const s of sites) h += '<label class="lm-camp-chk"><input type="checkbox" class="camp-site" value="' + s.id + '"> ' + escapeHtml(s.nom) + '</label>';
  h += '</div></div>';
  h += '<div class="lm-camp-field lm-camp-full"><label class="lm-camp-chk"><input type="checkbox" id="camp-excl" checked> Ne pas re-solliciter les clients déjà en cycle ouvert</label></div>';
  h += '</div></div>';

  // 2 — Affectation
  h += '<div class="lm-block"><div class="lm-block-title">2 · Affecter les cibles</div><div class="lm-camp-grid">';
  h += champSelect('camp-affect', 'Logique d\'affectation', [
    ['equitable', 'Répartition équitable'],
    ['habituel', 'Vendeur habituel du client'],
    ['charge', 'Par charge absorbable'],
    ['manuelle', 'Vendeurs choisis']
  ]);
  h += '</div>';
  h += '<div class="lm-camp-field lm-camp-full" id="camp-vend-wrap" style="display:none"><label class="lm-camp-lbl">Vendeurs (mode manuel)</label><div class="lm-camp-checks">';
  for (const v of vendeurs) h += '<label class="lm-camp-chk"><input type="checkbox" class="camp-vend" value="' + v.id_user + '"> ' + escapeHtml(v.nom) + '</label>';
  h += '</div></div></div>';

  // 3 — Lancement
  h += '<div class="lm-block"><div class="lm-block-title">3 · Nommer et lancer</div><div class="lm-camp-grid">';
  h += champText('camp-nom', 'Nom de la campagne', 'ex : Renouvellement Yaris 2026');
  h += '</div><div class="lm-camp-actions">';
  h += '<button type="button" class="btn" id="camp-simuler">Simuler le ciblage</button>';
  h += '<button type="button" class="btn btn-primary" id="camp-lancer" disabled>Lancer la campagne</button>';
  h += '</div></div>';

  h += '<div id="camp-result">' + renderCampResult() + '</div>';
  h += '</div>';
  return h;
}

function renderCampResult() {
  const cs = campState();
  if (cs.loading) return '<div class="lm-block"><div class="lm-camp-res-load">Calcul du ciblage…</div></div>';
  if (cs.error) return '<div class="lm-block"><div class="lm-camp-res-err">' + escapeHtml(cs.error) + '</div></div>';
  if (cs.done) {
    const n = cs.launched || 0;
    const msg = n > 0
      ? 'Campagne lancée : ' + n + ' sollicitation' + (n > 1 ? 's' : '') + ' créée' + (n > 1 ? 's' : '') + '.'
      : 'Aucune sollicitation créée (aucune cible ne correspond).';
    return '<div class="lm-block lm-camp-success">' + escapeHtml(msg) + '</div>';
  }
  if (!cs.result) return '';
  const rows = cs.result;
  const nonAff = rows.filter(r => r.o_id_user == null).reduce((s, r) => s + Number(r.o_nb_cibles || 0), 0);
  const aff = rows.filter(r => r.o_id_user != null);
  const total = rows.reduce((s, r) => s + Number(r.o_nb_cibles || 0), 0);
  let h = '<div class="lm-block"><div class="lm-block-title">Ciblage simulé</div>';
  h += '<div class="lm-camp-total"><span class="lm-camp-total-num">' + total + '</span> client' + (total > 1 ? 's' : '') + ' ciblé' + (total > 1 ? 's' : '');
  if (nonAff > 0) h += ' · <span class="lm-camp-warn">' + nonAff + ' non affectable' + (nonAff > 1 ? 's' : '') + ' (site sans vendeur actif)</span>';
  h += '</div>';
  if (aff.length) {
    const byVend = {};
    for (const r of aff) { const k = r.o_id_user; if (!byVend[k]) byVend[k] = 0; byVend[k] += Number(r.o_nb_cibles || 0); }
    const list = Object.keys(byVend).map(k => ({ id: k, n: byVend[k] })).sort((a, b) => b.n - a.n);
    h += '<table class="lm-team-table" style="margin-top:10px"><thead><tr><th>Vendeur</th><th>Cibles affectées</th></tr></thead><tbody>';
    for (const it of list) h += '<tr class="row-vendeur"><td>' + escapeHtml(vendeurNomCamp(it.id)) + '</td><td style="text-align:center;font-weight:700">' + it.n + '</td></tr>';
    h += '</tbody></table>';
  }
  h += '</div>';
  return h;
}

function readCampParams(dryRun) {
  const g = (id) => { const e = doc.getElementById(id); return e ? String(e.value).trim() : ''; };
  const sites = Array.from(doc.querySelectorAll('.camp-site:checked')).map(e => Number(e.value));
  const vends = Array.from(doc.querySelectorAll('.camp-vend:checked')).map(e => Number(e.value));
  const deps = g('camp-deps').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
  const excl = doc.getElementById('camp-excl');
  const toNum = (v) => { if (!v) return null; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
  const ageRaw = g('camp-age');
  return {
    p_viewer_id_user: Number(userId),
    p_dry_run: !!dryRun,
    p_site_ids: sites.length ? sites : null,
    p_type: g('camp-type') || null,
    p_marque: g('camp-marque') || null,
    p_modele: g('camp-modele') || null,
    p_vehicule_age_min: ageRaw ? parseInt(ageRaw, 10) : null,
    p_km_min: toNum(g('camp-kmmin')),
    p_km_max: toNum(g('camp-kmmax')),
    p_departements: deps.length ? deps : null,
    p_csp: g('camp-csp') || null,
    p_exclure_cycle_ouvert: excl ? !!excl.checked : true,
    p_affectation: g('camp-affect') || 'equitable',
    p_vendeurs_manuels: vends.length ? vends : null,
    p_nom_campagne: g('camp-nom') || null
  };
}

function updateCampResult() {
  const el = doc.getElementById('camp-result');
  if (el) el.innerHTML = renderCampResult();
}

async function campSimuler() {
  const cs = campState();
  const p = readCampParams(true);
  if (p.p_affectation === 'manuelle' && (!p.p_vendeurs_manuels || !p.p_vendeurs_manuels.length)) {
    cs.error = 'Mode « vendeurs choisis » : sélectionne au moins un vendeur.'; cs.result = null; cs.done = false; updateCampResult(); return;
  }
  cs.loading = true; cs.error = null; cs.done = false; cs.result = null;
  updateCampResult();
  try {
    const supabase = ctx.supabase;
    const { data, error } = await supabase.rpc('creer_campagne_sollicitation', p);
    if (error) throw error;
    cs.result = data || [];
    cs.params = p;
  } catch (e) {
    console.error('[campagne] simulate', e);
    cs.error = (e && e.message) ? e.message : String(e);
  } finally {
    cs.loading = false;
    updateCampResult();
    const lancer = doc.getElementById('camp-lancer');
    if (lancer) lancer.disabled = !(cs.result && cs.result.length);
  }
}

async function campLancer() {
  const cs = campState();
  const p = readCampParams(false);
  if (!p.p_nom_campagne) { cs.error = 'Donne un nom à la campagne avant de la lancer.'; cs.done = false; updateCampResult(); return; }
  if (p.p_affectation === 'manuelle' && (!p.p_vendeurs_manuels || !p.p_vendeurs_manuels.length)) {
    cs.error = 'Mode « vendeurs choisis » : sélectionne au moins un vendeur.'; cs.done = false; updateCampResult(); return;
  }
  const aff = (cs.result || []).filter(r => r.o_id_user != null).reduce((s, r) => s + Number(r.o_nb_cibles || 0), 0);
  const detail = aff > 0
    ? 'Créer ' + aff + ' sollicitation' + (aff > 1 ? 's' : '') + ' pour la campagne « ' + p.p_nom_campagne + ' » ? Cette action est définitive.'
    : 'Créer les sollicitations pour la campagne « ' + p.p_nom_campagne + ' » ? Cette action est définitive.';
  const ok = await campConfirm('Lancer la campagne', detail, 'Lancer la campagne');
  if (!ok) return;
  cs.loading = true; cs.error = null; cs.done = false;
  updateCampResult();
  try {
    const supabase = ctx.supabase;
    const { data, error } = await supabase.rpc('creer_campagne_sollicitation', p);
    if (error) throw error;
    cs.launched = (data || []).filter(r => r.o_id_user != null).reduce((s, r) => s + Number(r.o_nb_cibles || 0), 0);
    cs.done = true; cs.result = null;
  } catch (e) {
    console.error('[campagne] launch', e);
    cs.error = (e && e.message) ? e.message : String(e);
  } finally {
    cs.loading = false;
    updateCampResult();
    const lancer = doc.getElementById('camp-lancer');
    if (lancer) lancer.disabled = true;
  }
}

function injectCampModalStyle() {
  if (doc.getElementById('lm-camp-modal-style')) return;
  const st = doc.createElement('style'); st.id = 'lm-camp-modal-style';
  st.textContent = `
#lm-camp-modal { position:fixed; inset:0; background:rgba(28,43,69,.45); z-index:10000; display:flex; align-items:center; justify-content:center; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
#lm-camp-modal .lm-cm-box { background:#fff; border-radius:12px; padding:22px 24px; width:min(440px,92vw); box-shadow:0 16px 48px rgba(28,43,69,.3); }
#lm-camp-modal .lm-cm-title { font-size:15px; font-weight:700; color:#2a5ea9; }
#lm-camp-modal .lm-cm-msg { font-size:13px; color:#4a6a8a; line-height:1.5; margin:10px 0 22px; }
#lm-camp-modal .lm-cm-actions { display:flex; gap:10px; justify-content:flex-end; }
#lm-camp-modal .lm-cm-btn { padding:9px 18px; border-radius:6px; font-size:13px; font-weight:600; font-family:inherit; cursor:pointer; border:1px solid #eaf0f9; background:#fff; color:#4a6a8a; }
#lm-camp-modal .lm-cm-btn:hover { background:#f5f8fc; }
#lm-camp-modal .lm-cm-btn.primary { background:#2a5ea9; color:#fff; border-color:#2a5ea9; }
#lm-camp-modal .lm-cm-btn.primary:hover { background:#1f4a87; }
`;
  doc.head.appendChild(st);
}

function campConfirm(title, message, okLabel) {
  return new Promise((resolve) => {
    injectCampModalStyle();
    const prev = doc.getElementById('lm-camp-modal');
    if (prev) prev.remove();
    const ov = doc.createElement('div');
    ov.id = 'lm-camp-modal';
    ov.innerHTML =
      '<div class="lm-cm-box" role="dialog" aria-modal="true">' +
        '<div class="lm-cm-title">' + escapeHtml(title) + '</div>' +
        '<div class="lm-cm-msg">' + escapeHtml(message) + '</div>' +
        '<div class="lm-cm-actions">' +
          '<button type="button" class="lm-cm-btn" data-cm="cancel">Annuler</button>' +
          '<button type="button" class="lm-cm-btn primary" data-cm="ok">' + escapeHtml(okLabel || 'Confirmer') + '</button>' +
        '</div>' +
      '</div>';
    doc.body.appendChild(ov);
    const done = (val) => { try { ov.remove(); } catch (e) {} resolve(val); };
    ov.querySelector('[data-cm="ok"]').addEventListener('click', () => done(true));
    ov.querySelector('[data-cm="cancel"]').addEventListener('click', () => done(false));
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) done(false); });
  });
}

function bindCampagneCreation() {
  const sim = doc.getElementById('camp-simuler');
  if (sim) sim.addEventListener('click', campSimuler);
  const lan = doc.getElementById('camp-lancer');
  if (lan) lan.addEventListener('click', campLancer);
  const aff = doc.getElementById('camp-affect');
  const wrap = doc.getElementById('camp-vend-wrap');
  if (aff && wrap) {
    const sync = () => { wrap.style.display = (aff.value === 'manuelle') ? 'block' : 'none'; };
    aff.addEventListener('change', sync);
    sync();
  }
}

// --- 13. Rendu principal ------------------------------------
function renderAll() {
  let html = '';
  if (isManager) {
    html += '<div class="lm-toggle">';
    html += '<button type="button" class="lm-toggle-btn' + (state.section === 'synthese'    ? ' active' : '') + '" data-section="synthese">Synthèse</button>';
    html += '<button type="button" class="lm-toggle-btn' + (state.section === 'suivi_leads' ? ' active' : '') + '" data-section="suivi_leads">Suivi leads</button>';
    html += '<button type="button" class="lm-toggle-btn' + (state.section === 'campagnes'   ? ' active' : '') + '" data-section="campagnes">Campagnes</button>';
    html += '<button type="button" class="lm-toggle-btn' + (state.section === 'creation'    ? ' active' : '') + '" data-section="creation">Créer une campagne</button>';
    html += '</div>';
    if (state.section === 'synthese')       html += renderViewSynthese();
    else if (state.section === 'campagnes') html += renderViewCampagnes();
    else if (state.section === 'creation')  html += renderViewCreationCampagne();
    else                                    html += renderSectionSuiviLeads();
  } else {
    html += '<div class="lm-toggle">';
    html += '<button type="button" class="lm-toggle-btn' + (state.view === 'a_traiter' ? ' active' : '') + '" data-view="a_traiter">À traiter</button>';
    html += '<button type="button" class="lm-toggle-btn' + (state.view === 'pipeline'  ? ' active' : '') + '" data-view="pipeline">Pipeline</button>';
    html += '</div>';
    if (state.view === 'pipeline') html += renderViewKanban();
    else                            html += renderViewActifs();
  }
  root.innerHTML = html;
  bindEvents();
  if (state.section === 'synthese') {
    setTimeout(() => { drawGraphes(); }, 0);
  }
}

// --- 14. Navigation fiche client ----------------------------
// Ouverture de la fiche client — patron aligné sur client-search :
//  1) on écrit le client sélectionné dans SA variable (le shell fiche lit l'IDVu
//     et recharge le client lui-même) -> plus de workflow WeWeb WF_GET_FICHE ;
//  2) l'onglet voulu passe par un global à usage unique lu par fiche-shell
//     (l'ancienne variable WeWeb fb2cad2c n'existe plus -> "variable not found") ;
//  3) navigation ÉDITEUR par UID / PROD par CHEMIN (un UID en prod s'inscrit tel
//     quel dans l'URL -> route inexistante -> page blanche).
// Publie le client sélectionné pour fiche-shell. La variable WeWeb historique a
  // été supprimée du projet -> on passe par un global + sessionStorage (survit à
  // la navigation SPA et à un rechargement). L'écriture de la variable reste
  // tentée pour compatibilité si elle réapparaît.
  function odSetSelectedClient(obj) {
    try { const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window; w.__odSelectedClient = obj; } catch (e) {}
    try { sessionStorage.setItem('od_selected_client', JSON.stringify(obj)); } catch (e) {}
    try { wwLib.wwVariable.updateValue('55490583-c88b-4748-916e-4d203db07742', obj); } catch (e) {}
  }
const PATH_FICHE_CLIENT   = '/fr/fiche-client';
function lmInEditor() {
  try { return (window.self !== window.top) || /-editor\.weweb\.io|weweb\.io/i.test(location.hostname); }
  catch (e) { return true; }
}
async function openClientFiche(idClient, tabIndex, cardEl) {
  if (!idClient) { console.warn('[leadMgmt] Pas d\'id_client'); return; }
  if (cardEl) cardEl.classList.add('is-loading');
  try {
    odSetSelectedClient({ IDVu: Number(idClient) });
    const targetTab = (tabIndex !== null && tabIndex !== undefined) ? tabIndex : TAB_DEFAULT;
    try { const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window; w.__odFicheTab = targetTab; } catch (e) {}
    if (lmInEditor()) { try { wwLib.wwApp.goTo(PAGE_FICHE_ID); return; } catch (e) {} }
    try { wwLib.goTo(PATH_FICHE_CLIENT); return; } catch (e) {}
    try { const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window; w.location.href = PATH_FICHE_CLIENT; } catch (e) {}
  } catch (e) {
    console.error('[leadMgmt] Erreur ouverture fiche client', e);
    if (cardEl) cardEl.classList.remove('is-loading');
  }
}

async function selectVendeurCible(idUser) {
  state.cyclesLoading = true;
  renderAll();
  try {
    await setVendeurCible(idUser);          // garde la variable WeWeb en phase (inoffensif)
    const cy = await fetchCyclesData(idUser);   // FOLD : refetch direct au lieu de fetchCollection
    dataActifs = cy.actifs;
    dataKanban = cy.kanban;
  } catch (e) {
    console.error('[leadMgmt] Erreur refetch cycles', e);
  } finally {
    state.cyclesLoading = false;
    if (window.__renderLeadMgmt) window.__renderLeadMgmt();
  }
}

// --- 15. Bindings -------------------------------------------
function bindEvents() {
  root.querySelectorAll('.lm-toggle-btn[data-section]').forEach(el => {
    el.addEventListener('click', () => {
      const newSection = el.getAttribute('data-section');
      if (newSection === 'synthese' || newSection === 'campagnes' || newSection === 'creation') {
        state.selectedVendeur = null;
      }
      state.section = newSection;
      renderAll();
    });
  });
  root.querySelectorAll('.lm-toggle-btn[data-view], .lm-subtoggle-btn[data-view]').forEach(el => {
    el.addEventListener('click', () => { state.view = el.getAttribute('data-view'); renderAll(); });
  });

  const rangeBtn = root.querySelector('#lm-range');
  if (rangeBtn) rangeBtn.addEventListener('click', () => openRangePicker(rangeBtn));

  root.querySelectorAll('.filter-chip').forEach(el => {
    el.addEventListener('click', () => { state.filterSource = el.getAttribute('data-source'); renderAll(); });
  });

  const searchInput = root.querySelector('#lm-search');
  if (searchInput) {
    let t;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(t);
      const val = e.target.value;
      t = setTimeout(() => {
        state.search = val;
        renderAll();
        const inp = root.querySelector('#lm-search');
        if (inp) { inp.focus(); inp.setSelectionRange(val.length, val.length); }
      }, 200);
    });
  }

  root.querySelectorAll('[data-expand-key]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = el.getAttribute('data-expand-key');
      state.expanded[key] = !state.expanded[key];
      const siteId = el.getAttribute('data-site-id');
      if (siteId) {
        state.busSite = String(siteId);
        try { const b = siteBus(); if (b) b.setSiteId(Number(siteId)); } catch (x) {}
      }
      renderAll();
    });
  });

  root.querySelectorAll('tr.row-vendeur[data-vendeur-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const idUser = Number(el.getAttribute('data-vendeur-id'));
      const idSiteAttr = el.getAttribute('data-vendeur-site');
      const idSite = idSiteAttr ? Number(idSiteAttr) : null;
      const nom = el.getAttribute('data-vendeur-nom') || '';

      if (state.section === 'synthese') {
        state.selectedVendeur = { id_user: idUser, id_site: idSite, vendeur_nom: nom };
        state.section = 'suivi_leads';
        selectVendeurCible(idUser);
        return;
      }

      const sameSelection = state.selectedVendeur && state.selectedVendeur.id_user === idUser;
      if (sameSelection) {
        state.selectedVendeur = null;
        selectVendeurCible(null);
      } else {
        state.selectedVendeur = { id_user: idUser, id_site: idSite, vendeur_nom: nom };
        selectVendeurCible(idUser);
      }
    });
  });

  root.querySelectorAll('[data-action="clear-vendeur"]').forEach(el => {
    el.addEventListener('click', () => {
      state.selectedVendeur = null;
      selectVendeurCible(null);
    });
  });

  root.querySelectorAll('[data-action]').forEach(btn => {
    const a = btn.getAttribute('data-action');
    if (['clear-vendeur'].includes(a)) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      const clientId = btn.getAttribute('data-client');
      const cardEl = btn.closest('.card, .lm-kcard');
      if (!clientId) return;
      if (action === 'call') {
        const tel = btn.getAttribute('data-tel');
        if (tel) window.open('tel:' + tel.replace(/[^0-9+]/g, ''), '_blank');
        openClientFiche(clientId, TAB_CALL, cardEl);
      } else if (action === 'open-fiche') openClientFiche(clientId, TAB_DEFAULT, cardEl);
      else if (action === 'wa')           openClientFiche(clientId, TAB_WHATSAPP, cardEl);
      else if (action === 'cycle')        openClientFiche(clientId, TAB_CYCLE, cardEl);
      else if (action === 'open-fiche-cycle') openClientFiche(clientId, TAB_CYCLE, cardEl);
    });
  });

  if (state.section === 'creation') bindCampagneCreation();
}

// --- 16. Go -------------------------------------------------
window.__renderLeadMgmt = renderAll;

renderAll();

if (isVendeur && state.selectedVendeur) {
  selectVendeurCible(state.selectedVendeur.id_user);
}

// Bascule .lm-narrow d'après la largeur RÉELLE de #lead-mgmt-root (repli des @media).
(function bindLeadNarrow() {
  const W = doc.defaultView || window;
  function apply() {
    if (!root) return;
    let w = 0;
    try { w = root.getBoundingClientRect().width || root.clientWidth || 0; } catch (e) {}
    if (!w) return;
    if (w <= 760) root.classList.add('lm-narrow');
    else root.classList.remove('lm-narrow');
  }
  apply();
  [120, 400, 900, 1800, 3200].forEach(function (d) { setTimeout(apply, d); });
  try {
    if (root && 'ResizeObserver' in W) {
      if (window.__leadRO) { try { window.__leadRO.disconnect(); } catch (e) {} }
      window.__leadRO = new W.ResizeObserver(apply);
      window.__leadRO.observe(root);
    } else {
      if (window.__leadResize) W.removeEventListener('resize', window.__leadResize);
      window.__leadResize = apply;
      W.addEventListener('resize', window.__leadResize);
    }
  } catch (e) {}
})();
  }
});
