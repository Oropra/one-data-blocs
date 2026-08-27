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
// (helper asArray() retiré : plus aucune collection WeWeb n'est lue)

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

// PERF : les cycles (v_cycles_actifs / v_cycles_kanban, les 2 vues les plus
// lourdes) ne sont PLUS chargés au montage. Ils le sont à la demande, à l'entrée
// de « Suivi leads » (voir ensureCycles), scopés au vendeur ciblé. Un manager sur
// « Synthèse » (page par défaut) n'en charge aucun -> premier affichage rapide.
// ⚡ CHARGEMENT PARESSEUX (27/08/2026).
//
// Auparavant SEPT vues étaient chargées EN BLOQUANT au montage, avant même
// de savoir quelle section serait affichée. Relevé au réseau par Antoine :
// v_lead_kpi_vendeur 3,1 s, v_lead_kpi_site 1,45 s, v_user_cycles_recent
// 1,28 s, v_premier_contact 0,72 s — soit plusieurs secondes avant le
// premier pixel, pour un vendeur qui arrive sur « Ma file » et n'a besoin
// QUE de v_lead_sla (116 ms mesurées).
//
// Seul le PÉRIMÈTRE reste bloquant : il décide du rôle et des sites, donc
// de ce qu'on affiche. Tout le reste passe par ensureKpis().
const __perim = await sb.from('v_mon_perimetre').select('*')
  .eq('viewer_id_user', userConnected.ID_User);
if (__perim && __perim.error) console.error('[leadMgmt] v_mon_perimetre', __perim.error);

let dataActifs           = [];   // chargés à la demande (ensureCycles)
let dataKanban           = [];
let cyclesLoadedFor      = undefined;   // cible (idUser|null) pour laquelle les cycles sont chargés
const userSites          = __perim.data || [];
let dataKpiSite          = [];
let dataKpiVend          = [];
let dataClotures         = [];
let dataLeads            = [];
let dataUserCycles       = [];
let dataPremierContact   = [];
let kpisCharges          = false;
let kpisEnCours          = null;
let kpiVendeurCharge     = false;   // « Ma synthese » : v_lead_kpi_vendeur seule
let kpiVendeurEnCours    = null;

const userSiteIds = userSites.map(r => r.id_site ?? r.ID_SITE);
const userRole    = userConnected.ID_Role;
const userId      = userConnected.ID_User;

const isVendeur    = userRole === ROLE_VENDEUR;
const isChefVentes = userRole === ROLE_CHEF_VENTES;
const isManager    = !isVendeur && userRole != null;

// ============================================================
//  SOCLE DE NAVIGATION PAR RÔLE      (refonte du 27/08/2026)
//
//  Chaque rôle arrive avec UNE question, et l'écran d'entrée y répond
//  avant tout le reste :
//    vendeur   « qu'est-ce que je fais maintenant ? »  -> l'action
//    chef      « qui décroche, qui laisse filer ? »    -> le VENDEUR
//    directeur « mes sites tiennent-ils leurs objectifs ? » -> le SITE
//    marketing « mes campagnes rapportent-elles ? »    -> la SOURCE
//
//  Avant cette refonte, les quatre recevaient les MÊMES six sections :
//  un chef entrait sur une liste de cartes alors qu'il lui faut ses
//  vendeurs. D'où « les onglets sont vides et peu compréhensibles ».
// ============================================================
const ROLE_DIRECTEUR   = 2;
const ROLE_MARKETING   = 5;
const ROLE_DIR_PLAQUE  = 6;
const ROLE_DIR_MARQUE  = 7;
const ROLE_DIR_GROUPE  = 8;
const ROLE_SECRETAIRE  = 9;
const ROLE_ADMIN       = 1;

// ⚠️ La SECRÉTAIRE COMMERCIALE n'a PAS de lead management (décision
//    d'Antoine, 27/08). Elle doit être traitée explicitement : la laisser
//    tomber dans le cas par défaut lui donnerait la vue vendeur.
const PROFILS = {
  vendeur:   { sections:['ma_file','mes_cycles','mes_chiffres'] },
  chef:      { sections:['mon_equipe','ma_file','leads','cycles'] },
  directeur: { sections:['mes_sites','cycles','leads','campagnes','ma_file'] },
  marketing: { sections:['par_source','campagnes'] },
  aucun:     { sections:[] }
};

const LIB_SECTION = {
  ma_file:'Ma file', mes_cycles:'Mes cycles', mes_chiffres:'Mes chiffres',
  mon_equipe:'Mon équipe', leads:'Leads', cycles:'Cycles',
  mes_sites:'Mes sites', campagnes:'Campagnes', par_source:'Par source'
};

function profilDuRole(r) {
  if (r === ROLE_SECRETAIRE) return 'aucun';
  if (r === ROLE_VENDEUR)    return 'vendeur';
  if (r === ROLE_CHEF_VENTES) return 'chef';
  if (r === ROLE_MARKETING)  return 'marketing';
  if (r === ROLE_DIRECTEUR || r === ROLE_DIR_PLAQUE
   || r === ROLE_DIR_MARQUE || r === ROLE_DIR_GROUPE || r === ROLE_ADMIN) return 'directeur';
  return 'vendeur';   // repli : un rôle inconnu voit au moins sa file
}

const PROFIL   = profilDuRole(userRole);
const SECTIONS_ROLE = PROFILS[PROFIL].sections;
// Un manager qui n'a pas « mon_equipe » n'est pas un chef : le drapeau
// sert à décider des boutons (réaffecter), pas des sections.
const PEUT_REAFFECTER = PROFIL === 'chef' || PROFIL === 'directeur';

// --- 2. Index pré-calculés ----------------------------------
// Ils dérivent des vues KPI : ils sont donc VIDES tant qu'ensureKpis()
// n'a pas tourné, et RECONSTRUITS à chaque chargement. Toute section qui
// les lit doit avoir appelé ensureKpis() avant.
let dataKpiSiteScope    = [];
let dataKpiVendScope    = [];
let cyclesAvecLeadSet   = new Set();
let vendeurCyclesMap    = new Map();
let premierContactMap   = {};
let vendeurInfoMap      = new Map();

function reconstruireIndexKpi() {
  dataKpiSiteScope = dataKpiSite.filter(r => userSiteIds.includes(r.id_site));
  dataKpiVendScope = dataKpiVend.filter(r => userSiteIds.includes(r.id_site));

  cyclesAvecLeadSet = new Set();
  for (const l of dataLeads) {
    if (l.id_cycle_comm) cyclesAvecLeadSet.add(l.id_cycle_comm);
  }

  vendeurCyclesMap = new Map();
  for (const uc of dataUserCycles) {
    if (!vendeurCyclesMap.has(uc.id_user)) vendeurCyclesMap.set(uc.id_user, new Set());
    vendeurCyclesMap.get(uc.id_user).add(uc.id_cycle_com);
  }

  premierContactMap = {};
  for (const pc of dataPremierContact) {
    premierContactMap[pc.id_cycle_com] = pc.premier_outbound_at;
  }

  vendeurInfoMap = new Map();
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
}

// Charge les six vues KPI, UNE SEULE FOIS. Les appels concurrents
// partagent la même promesse : deux sections ouvertes coup sur coup ne
// déclenchent pas deux fois le réseau.
function ensureKpis() {
  if (kpisCharges) return Promise.resolve();
  if (kpisEnCours) return kpisEnCours;
  kpisEnCours = (async function () {
    const [kSite, kVend, clot, leads, uCycles, premier] = await Promise.all([
      sb.from('v_lead_kpi_site').select('*'),
      sb.from('v_lead_kpi_vendeur').select('*'),
      sb.from('v_cloture_cycle').select('*'),
      sb.from('v_leads').select('*'),
      sb.from('v_user_cycles_recent').select('*'),
      sb.from('v_premier_contact').select('*')
    ]);
    [kSite, kVend, clot, leads, uCycles, premier]
      .forEach(r => { if (r && r.error) console.error('[leadMgmt] chargement vue KPI', r.error); });
    dataKpiSite        = kSite.data   || [];
    dataKpiVend        = kVend.data   || [];
    dataClotures       = clot.data    || [];
    dataLeads          = leads.data   || [];
    dataUserCycles     = uCycles.data || [];
    dataPremierContact = premier.data || [];
    reconstruireIndexKpi();
    kpisCharges = true;
    kpiVendeurCharge = true;   // le lot complet contient v_lead_kpi_vendeur
    kpisEnCours = null;
    if (window.__renderLeadMgmt) window.__renderLeadMgmt();
  })();
  return kpisEnCours;
}

// Chargeur MINIMAL pour « Ma synthese » du vendeur.
//
// Mesure du 27/08 : renderSyntheseVendeur ne lit QUE dataKpiVend, et
// renderViewActifs / renderViewKanban ne lisent AUCUN index KPI. Un
// vendeur qui ouvrait sa synthese declenchait pourtant les six vues —
// cinq requetes pour rien, dont v_lead_kpi_site (1,25 s),
// v_user_cycles_recent (1,28 s) et v_premier_contact (0,88 s).
function ensureKpiVendeur() {
  if (kpisCharges || kpiVendeurCharge) return Promise.resolve();
  if (kpiVendeurEnCours) return kpiVendeurEnCours;
  kpiVendeurEnCours = (async function () {
    // ⚠️ NE PAS ajouter de .eq('id_user', …) : mesure du 27/08, filtrer
    //    cette vue la rend NEUF FOIS PLUS LENTE (2,35 s contre 270 ms).
    //    Le planificateur bascule sur un Merge Join qui ecarte 599 886
    //    lignes. On charge tout et on filtre cote client.
    const r = await sb.from('v_lead_kpi_vendeur').select('*');
    if (r && r.error) console.error('[leadMgmt] v_lead_kpi_vendeur', r.error);
    dataKpiVend = r.data || [];
    dataKpiVendScope = dataKpiVend.filter(x => userSiteIds.includes(x.id_site));
    kpiVendeurCharge = true;
    kpiVendeurEnCours = null;
    if (window.__renderLeadMgmt) window.__renderLeadMgmt();
  })();
  return kpiVendeurEnCours;
}

function getVendeurCycleIds(idUser) {
  return vendeurCyclesMap.get(idUser) || new Set();
}

const doc = __anchor.ownerDocument || document;
const root = __anchor;
try { window.__leadVer = 'v25-responsive'; } catch (e) {}

const LM_SLA_CSS = `
#lead-mgmt-root .lmf-bandeau { display:flex; align-items:baseline; gap:10px; margin-bottom:14px; }
#lead-mgmt-root .lmf-bandeau-n { font-size:26px; font-weight:700; font-variant-numeric:tabular-nums; }
#lead-mgmt-root .lmf-bandeau-n.retard { color:var(--red-soft); }
#lead-mgmt-root .lmf-bandeau-n.ok     { color:var(--green); }
#lead-mgmt-root .lmf-bandeau-txt { font-size:13px; color:var(--text-soft); }
#lead-mgmt-root .lmf-groupe { font-size:11px; font-weight:700; letter-spacing:.4px; text-transform:uppercase; margin:18px 0 8px; }
#lead-mgmt-root .lmf-groupe.retard  { color:var(--red-soft); }
#lead-mgmt-root .lmf-groupe.bientot { color:#b8851a; }
#lead-mgmt-root .lmf-groupe.calme   { color:var(--green); }
#lead-mgmt-root .lmf-card { background:var(--card); border:1px solid var(--border); border-left:3px solid var(--text-mut); padding:12px 14px; margin-bottom:8px; cursor:pointer; transition:background .12s ease; }
#lead-mgmt-root .lmf-card:hover { background:var(--blue-bg); }
#lead-mgmt-root .lmf-card.retard  { border-left-color:var(--red-soft); }
#lead-mgmt-root .lmf-card.bientot { border-left-color:#b8851a; }
#lead-mgmt-root .lmf-card.calme   { border-left-color:#53bda7; }
#lead-mgmt-root .lmf-card.hors    { border-left-color:#b4b2a9; }
#lead-mgmt-root .lmf-head { display:flex; justify-content:space-between; align-items:baseline; gap:10px; }
#lead-mgmt-root .lmf-nom { font-size:14px; font-weight:600; color:var(--text); }
#lead-mgmt-root .lmf-temps { font-size:13px; font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; }
#lead-mgmt-root .lmf-temps.retard  { color:var(--red-soft); }
#lead-mgmt-root .lmf-temps.bientot { color:#b8851a; }
#lead-mgmt-root .lmf-temps.calme   { color:var(--green); }
#lead-mgmt-root .lmf-temps.hors    { color:var(--text-mut); font-weight:500; }
#lead-mgmt-root .lmf-jauge { height:3px; background:#eef2f8; border-radius:2px; margin:8px 0 6px; overflow:hidden; }
#lead-mgmt-root .lmf-jauge span { display:block; height:3px; border-radius:2px; }
#lead-mgmt-root .lmf-meta { font-size:12px; color:var(--text-soft); display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
#lead-mgmt-root .lmf-src { font-size:10px; font-weight:600; padding:2px 8px; border-radius:4px; background:#eaf0f9; color:var(--blue-dk); }
#lead-mgmt-root .lmf-src.hors { background:#f1efe8; color:#5f5e5a; }
#lead-mgmt-root .lmf-reaff { margin-left:auto; font-size:11px; font-weight:600; padding:4px 10px; border-radius:5px; border:1px solid var(--border); background:var(--card); color:var(--blue-dk); cursor:pointer; font-family:inherit; }
#lead-mgmt-root .lmf-reaff:hover { background:var(--blue-bg); }
#lead-mgmt-root .lmf-note { font-size:11px; color:var(--text-mut); margin-top:14px; padding-top:10px; border-top:1px solid var(--border); }
#lead-mgmt-root .lmf-vend { display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border:1px solid var(--border); background:var(--card); margin-bottom:6px; border-radius:6px; }
#lead-mgmt-root .lmf-vend-n { font-size:16px; font-weight:700; font-variant-numeric:tabular-nums; }
#lead-mgmt-root .lm-spin { display:inline-block; width:12px; height:12px; margin-right:8px; vertical-align:-1px;
  border:2px solid #dfe6f0; border-top-color:#2a5ea9; border-radius:50%; animation:lm-spin .7s linear infinite; }
@keyframes lm-spin { to { transform:rotate(360deg); } }
`;

const LM_ROLE_CSS = `
#lead-mgmt-root .lmr-tbl { width:100%; border-collapse:collapse; background:var(--card);
  border:1px solid var(--border); border-radius:8px; overflow:hidden; }
#lead-mgmt-root .lmr-tbl th { text-align:left; font-size:10.5px; text-transform:uppercase;
  letter-spacing:.05em; color:var(--text-mut); font-weight:700; padding:11px 14px;
  background:var(--blue-bg); border-bottom:1px solid var(--border); white-space:nowrap; }
#lead-mgmt-root .lmr-tbl td { padding:12px 14px; border-bottom:1px solid #eef2f8; font-size:13px; }
#lead-mgmt-root .lmr-tbl tbody tr:last-child td { border-bottom:none; }
#lead-mgmt-root .lmr-tbl tbody tr.lmr-clic { cursor:pointer; }
#lead-mgmt-root .lmr-tbl tbody tr.lmr-clic:hover { background:var(--blue-bg); }
#lead-mgmt-root .lmr-num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
#lead-mgmt-root .lmr-nom { font-weight:600; }
#lead-mgmt-root .lmr-sous { font-size:11px; color:var(--text-mut); font-weight:400; }
#lead-mgmt-root .lmr-bar { height:5px; background:#eef2f8; border-radius:3px; overflow:hidden;
  min-width:74px; margin-top:5px; }
#lead-mgmt-root .lmr-bar i { display:block; height:5px; border-radius:3px; }
#lead-mgmt-root .lmr-ok   { color:var(--green); font-weight:600; }
#lead-mgmt-root .lmr-warn { color:#b8851a; font-weight:600; }
#lead-mgmt-root .lmr-ko   { color:var(--red-soft); font-weight:600; }
#lead-mgmt-root .lmr-b-ok i   { background:#53bda7; }
#lead-mgmt-root .lmr-b-warn i { background:#b8851a; }
#lead-mgmt-root .lmr-b-ko i   { background:var(--red-soft); }
#lead-mgmt-root .lmr-fil { display:flex; align-items:center; gap:7px; margin:0 0 16px;
  font-size:12px; flex-wrap:wrap; }
#lead-mgmt-root .lmr-fil button { background:none; border:none; color:var(--blue-dk); padding:0;
  font-size:12px; font-family:inherit; cursor:pointer; text-decoration:underline;
  text-underline-offset:2px; }
#lead-mgmt-root .lmr-fil span { color:var(--text-mut); }
#lead-mgmt-root .lmr-fil .ici { color:var(--text); font-weight:600; text-decoration:none; }
#lead-mgmt-root .lmr-alerte { background:#fdf6e6; border-left:3px solid #b8851a;
  padding:11px 15px; border-radius:0 5px 5px 0; font-size:12px; color:#7a5a12; margin:16px 0 0; }
`;

const LM_V2_CSS = `
/* --- Fil de périmètre ------------------------------------- */
#lead-mgmt-root .v2-fil { display:flex; align-items:center; gap:6px; flex-wrap:wrap;
  background:var(--card); border:1px solid var(--border); border-radius:10px;
  padding:8px 12px; margin-bottom:14px; }
#lead-mgmt-root .v2-fil-l { font-size:10px; text-transform:uppercase; letter-spacing:.07em;
  color:var(--text-mut); font-weight:700; margin-right:2px; }
#lead-mgmt-root .v2-fil button { background:none; border:none; color:var(--blue); padding:5px 9px;
  border-radius:5px; font-size:12px; font-weight:600; font-family:inherit; cursor:pointer; }
#lead-mgmt-root .v2-fil button:hover { background:var(--blue-bg); }
#lead-mgmt-root .v2-fil .v2-sep { color:var(--text-mut); font-size:12px; }
#lead-mgmt-root .v2-fil .v2-ici { background:var(--blue); color:#fff; padding:5px 11px;
  border-radius:5px; font-size:12px; font-weight:600; }
#lead-mgmt-root .v2-per { margin-left:auto; display:flex; align-items:center; gap:6px; }

/* --- Bascule ---------------------------------------------- */
#lead-mgmt-root .v2-vues { display:inline-flex; gap:3px; background:var(--blue-bg);
  border:1px solid var(--border); border-radius:7px; padding:3px; margin-bottom:14px; }
#lead-mgmt-root .v2-vues button { background:none; border:none; padding:7px 16px; font-size:12.5px;
  font-weight:600; color:var(--text-soft); border-radius:5px; font-family:inherit; cursor:pointer; }
#lead-mgmt-root .v2-vues button:hover { color:var(--blue-dk); }
#lead-mgmt-root .v2-vues button.on { background:var(--card); color:var(--blue-dk);
  box-shadow:0 1px 3px rgba(28,43,61,.14); }

/* --- Bandeau : une phrase, pas des cartes ----------------- */
#lead-mgmt-root .v2-tete { margin:2px 0 20px; font-size:14.5px; line-height:1.65; }
#lead-mgmt-root .v2-tete b { font-size:28px; font-weight:700; font-variant-numeric:tabular-nums;
  vertical-align:-3px; letter-spacing:-.02em; }
#lead-mgmt-root .v2-tete b.ko { color:var(--red-soft); }
#lead-mgmt-root .v2-tete b.ok { color:var(--green); }
#lead-mgmt-root .v2-tete .q { color:var(--text-soft); }

/* --- LE MUR : des pastilles, pas des aplats --------------- */
#lead-mgmt-root .v2-mur { background:var(--card); border:1px solid var(--border);
  border-radius:12px; padding:4px 0 0; overflow-x:auto; }
#lead-mgmt-root .v2-mur-h { display:grid; padding:0 6px 8px 0; min-width:620px; }
#lead-mgmt-root .v2-mur-h div { padding:10px 6px 6px; font-size:9.5px; text-transform:uppercase;
  letter-spacing:.07em; color:var(--text-mut); font-weight:600; text-align:center; }
#lead-mgmt-root .v2-mur-h div:first-child { text-align:left; padding-left:18px; }
#lead-mgmt-root .v2-mur-r { display:grid; align-items:center; padding:0 6px 0 0;
  position:relative; min-width:620px; }
#lead-mgmt-root .v2-mur-r::after { content:''; position:absolute; left:18px; right:12px; bottom:0;
  height:1px; background:#f0f4f9; }
#lead-mgmt-root .v2-mur-r:last-child::after { display:none; }
#lead-mgmt-root .v2-mur-n { padding:9px 8px 9px 18px; display:flex; flex-direction:column;
  justify-content:center; cursor:pointer; min-width:0; }
#lead-mgmt-root .v2-mur-n b { font-size:13px; font-weight:600; white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; }
#lead-mgmt-root .v2-mur-n:hover b { color:var(--blue); }
#lead-mgmt-root .v2-mur-n i { font-style:normal; font-size:10.5px; color:var(--text-mut);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:1px; }
#lead-mgmt-root .v2-cell { display:flex; align-items:center; justify-content:center;
  cursor:pointer; min-height:44px; }
#lead-mgmt-root .v2-pas { border-radius:50%; display:flex; align-items:center;
  justify-content:center; font-size:12px; font-weight:600; font-variant-numeric:tabular-nums;
  transition:transform .13s cubic-bezier(.34,1.4,.64,1); line-height:1; }
#lead-mgmt-root .v2-cell:hover .v2-pas { transform:scale(1.14); }
#lead-mgmt-root .v2-cell.vide { cursor:default; }
#lead-mgmt-root .v2-cell.vide::after { content:''; width:3px; height:3px; border-radius:50%;
  background:#e3eaf3; }
#lead-mgmt-root .v2-leg { display:flex; align-items:center; gap:16px; flex-wrap:wrap;
  margin-top:12px; font-size:11px; color:var(--text-mut); }
#lead-mgmt-root .v2-leg i { display:inline-block; width:9px; height:9px; border-radius:50%;
  vertical-align:-1px; margin-right:6px; }
/* Le détail s'ouvre SOUS le mur, jamais ailleurs : on ne perd pas la
   vue d'ensemble en descendant dans un dossier. */
/* L'escalier : une colonne par palier, la hauteur porte le taux.
   On VOIT la marche descendre — quatre barres horizontales noyaient
   exactement le propos qu'elles devaient servir. */
#lead-mgmt-root .v2-esc-w { background:var(--card); border:1px solid var(--border);
  border-radius:12px; padding:16px 18px; margin-bottom:14px; }
#lead-mgmt-root .v2-esc { display:grid; grid-template-columns:repeat(4,1fr); gap:10px;
  align-items:end; margin:6px 0 2px; }
@media (max-width:640px) { #lead-mgmt-root .v2-esc { grid-template-columns:repeat(2,1fr); } }
#lead-mgmt-root .v2-esc-c { text-align:center; }
#lead-mgmt-root .v2-esc-v { font-size:19px; font-weight:700; font-variant-numeric:tabular-nums;
  color:var(--text-soft); letter-spacing:-.02em; margin-bottom:5px; }
#lead-mgmt-root .v2-esc-v.best { color:var(--green); }
#lead-mgmt-root .v2-esc-b { height:74px; display:flex; align-items:flex-end;
  justify-content:center; }
#lead-mgmt-root .v2-esc-b i { display:block; width:100%; max-width:64px; border-radius:5px 5px 0 0;
  background:var(--blue-line); }
#lead-mgmt-root .v2-esc-b i.best { background:#53bda7; }
#lead-mgmt-root .v2-esc-l { font-size:11.5px; font-weight:600; margin-top:7px;
  padding-top:7px; border-top:1px solid var(--border); }
#lead-mgmt-root .v2-esc-n { font-size:10.5px; color:var(--text-mut); margin-top:2px; }
#lead-mgmt-root .v2-esc-note { margin-top:14px; padding-top:12px;
  border-top:1px solid #f0f4f9; font-size:12.5px; line-height:1.6; color:var(--text-soft); }
#lead-mgmt-root .v2-esc-res { margin-top:6px; font-size:11px; color:var(--text-mut); }
/* Micro-jauge en cellule de tableau : la proportion se lit mieux qu'un
   chiffre, mais elle ne doit pas peser plus qu'une ligne de texte. */
/* Un chiffre cliquable doit LE MONTRER, sans devenir un bouton : on
   garde la typographie du tableau et on souligne au survol. */
#lead-mgmt-root .v2-lien { background:none; border:none; padding:0; font-family:inherit;
  font-size:13px; font-weight:700; color:var(--blue); cursor:pointer;
  font-variant-numeric:tabular-nums; }
#lead-mgmt-root .v2-lien:hover { text-decoration:underline; text-underline-offset:2px; }
#lead-mgmt-root .v2-lien.v2-ko { color:var(--red-soft); }
#lead-mgmt-root .v2-mini { height:3px; background:#eef2f8; border-radius:2px; margin-top:4px;
  overflow:hidden; }
#lead-mgmt-root .v2-mini i { display:block; height:3px; border-radius:2px;
  background:var(--blue-line); }
#lead-mgmt-root .v2-mini i.v2-ok { background:#53bda7; }
#lead-mgmt-root .v2-mini i.v2-warn { background:#b8851a; }
#lead-mgmt-root .v2-mini i.v2-ko { background:var(--red-soft); }
#lead-mgmt-root .v2-pan { background:var(--card); border:1px solid var(--border);
  border-radius:12px; margin-top:14px; }
#lead-mgmt-root .v2-pan-h { padding:13px 16px; border-bottom:1px solid var(--border);
  display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
#lead-mgmt-root .v2-pan-h b { font-size:14px; }
#lead-mgmt-root .v2-pan-n { font-size:11px; color:var(--text-mut); margin-top:2px; }
#lead-mgmt-root .v2-x { background:none; border:none; color:var(--text-mut); font-size:20px;
  line-height:1; padding:0 2px; cursor:pointer; font-family:inherit; }
#lead-mgmt-root .v2-x:hover { color:var(--text); }
#lead-mgmt-root .v2-pan-b { padding:10px 14px 14px; display:grid;
  grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:6px; }
#lead-mgmt-root .v2-lead { border-left:2px solid var(--text-mut); padding:9px 12px;
  border-radius:0 6px 6px 0; position:relative; }
#lead-mgmt-root .v2-lead:hover { background:var(--blue-bg); }
#lead-mgmt-root .v2-lead.ko { border-left-color:var(--red-soft); }
#lead-mgmt-root .v2-lead.warn { border-left-color:#b8851a; }
#lead-mgmt-root .v2-lead.ok { border-left-color:#53bda7; }
#lead-mgmt-root .v2-lead-h { display:flex; justify-content:space-between; gap:8px;
  align-items:baseline; }
#lead-mgmt-root .v2-lead-h b { font-size:13px; }
#lead-mgmt-root .v2-lead-h em { font-style:normal; font-size:12px; font-weight:600;
  font-variant-numeric:tabular-nums; white-space:nowrap; }
#lead-mgmt-root .v2-lead-h em.ko { color:var(--red-soft); }
#lead-mgmt-root .v2-lead-h em.warn { color:#b8851a; }
#lead-mgmt-root .v2-lead-h em.ok { color:var(--green); }
#lead-mgmt-root .v2-lead-m { font-size:11px; color:var(--text-soft); margin-top:3px; }
#lead-mgmt-root .v2-tag { display:inline-block; font-size:9.5px; font-weight:700;
  padding:2px 7px; border-radius:9px; background:var(--blue-bg); color:var(--blue-dk); }
#lead-mgmt-root .v2-reaff { margin-top:7px; font-size:11px; font-weight:600; padding:4px 10px;
  border-radius:5px; border:1px solid var(--border); background:var(--card);
  color:var(--blue-dk); cursor:pointer; font-family:inherit; }
#lead-mgmt-root .v2-reaff:hover { background:var(--blue-bg); }

/* --- Campagnes : DEUX PAR LIGNE --------------------------- */
#lead-mgmt-root .v2-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px;
  align-items:start; }
@media (max-width:900px) { #lead-mgmt-root .v2-grid2 { grid-template-columns:1fr; } }
#lead-mgmt-root.lm-narrow .v2-grid2 { grid-template-columns:1fr; }
#lead-mgmt-root .v2-flux { background:var(--card); border:1px solid var(--border);
  border-radius:12px; padding:16px 18px; }
#lead-mgmt-root .v2-flux-t { display:flex; justify-content:space-between; align-items:baseline;
  gap:10px; flex-wrap:wrap; margin-bottom:14px; }
#lead-mgmt-root .v2-flux-t h3 { font-size:10px; text-transform:uppercase; letter-spacing:.07em;
  color:var(--text-mut); font-weight:600; margin:0; }
#lead-mgmt-root .v2-r { display:grid; grid-template-columns:1fr 78px; gap:10px;
  align-items:center; padding:7px 0; }
#lead-mgmt-root .v2-r + .v2-r { border-top:1px solid #f4f7fb; }
#lead-mgmt-root .v2-n b { font-size:12.5px; display:block; letter-spacing:-.01em; }
#lead-mgmt-root .v2-n i { font-style:normal; font-size:10.5px; color:var(--text-mut);
  margin-top:1px; display:block; }
/* Barre PLUS ÉPAISSE : elle porte sa propre légende, donc elle doit
   pouvoir accueillir un chiffre lisible. 18 px suffisent. */
#lead-mgmt-root .v2-b { display:flex; align-items:center; height:18px; border-radius:4px;
  overflow:hidden; background:#f0f4f9; margin-top:5px; }
#lead-mgmt-root .v2-seg { height:18px; display:flex; align-items:center; justify-content:center;
  font-size:10px; font-weight:700; color:#fff; overflow:hidden; white-space:nowrap;
  font-variant-numeric:tabular-nums; }
#lead-mgmt-root .v2-s1 { background:var(--blue-line); color:var(--blue-dk); }
#lead-mgmt-root .v2-s2 { background:#53bda7; }
#lead-mgmt-root .v2-s3 { background:#e8eef6; color:var(--text-soft); }
#lead-mgmt-root .v2-s4 { background:#8fc9bb; }
#lead-mgmt-root .v2-sko { background:#eab3b3; color:#7a2020; }
#lead-mgmt-root .v2-v { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
#lead-mgmt-root .v2-v b { font-size:14px; font-weight:700; }
#lead-mgmt-root .v2-v i { font-style:normal; font-size:10.5px; color:var(--text-mut);
  display:block; margin-top:1px; }
#lead-mgmt-root .v2-tot { display:grid; grid-template-columns:1fr 78px; gap:10px;
  align-items:center; padding:11px 0 0; margin-top:6px; border-top:1.5px solid var(--blue-line); }
#lead-mgmt-root .v2-lg { display:flex; gap:12px; flex-wrap:wrap; margin-top:12px; padding-top:10px;
  border-top:1px solid #f0f4f9; font-size:10.5px; color:var(--text-mut); }
#lead-mgmt-root .v2-lg i { display:inline-block; width:9px; height:9px; border-radius:3px;
  vertical-align:-1px; margin-right:5px; }

/* --- Rapport croisé --------------------------------------- */
#lead-mgmt-root .v2-rep { background:var(--card); border:1px solid var(--border);
  border-radius:12px; overflow-x:auto; }
#lead-mgmt-root .v2-rep table { width:100%; border-collapse:collapse; min-width:840px; }
#lead-mgmt-root .v2-rep th { text-align:right; font-size:10px; text-transform:uppercase;
  letter-spacing:.05em; color:var(--text-mut); font-weight:700; padding:10px 12px;
  background:var(--blue-bg); border-bottom:1px solid var(--border); white-space:nowrap; }
#lead-mgmt-root .v2-rep th:first-child { text-align:left; }
#lead-mgmt-root .v2-rep td { padding:12px 13px; border-bottom:1px solid #f4f7fb; font-size:13px;
  text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
#lead-mgmt-root .v2-rep td:first-child { text-align:left; }
#lead-mgmt-root .v2-rep tbody tr { cursor:pointer; }
#lead-mgmt-root .v2-rep tbody tr:hover { background:var(--blue-bg); }
#lead-mgmt-root .v2-rep tfoot td { background:var(--blue-bg); font-weight:700;
  border-top:2px solid var(--blue-line); }
#lead-mgmt-root .v2-ok { color:var(--green); font-weight:700; }
#lead-mgmt-root .v2-warn { color:#b8851a; font-weight:700; }
#lead-mgmt-root .v2-ko { color:var(--red-soft); font-weight:700; }
#lead-mgmt-root .v2-sous { font-size:11px; color:var(--text-mut); font-weight:400; }
`;

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
/* AJOUT 20/08/2026 — portee de la synthese */
#lead-mgmt-root .lm-portee { display:flex; align-items:center; gap:9px; flex-wrap:wrap; margin-bottom:10px; }
#lead-mgmt-root .lm-portee-l { font-size:11.5px; color:var(--text-mut); }
#lead-mgmt-root .lm-portee-v { font-size:14px; font-weight:700; color:var(--blue-dk); }
#lead-mgmt-root .lm-portee-x, #lead-mgmt-root .lm-portee-go { border:1px solid var(--border); background:var(--card); color:var(--blue-dk); font:inherit; font-size:11.5px; font-weight:600; padding:4px 11px; border-radius:99px; cursor:pointer; }
#lead-mgmt-root .lm-portee-x:hover, #lead-mgmt-root .lm-portee-go:hover { background:#eaf0f9; }
#lead-mgmt-root .lm-portee-go { margin-left:auto; }
#lead-mgmt-root .lm-team-table tr.is-scope { box-shadow:inset 3px 0 0 var(--blue-dk); }
#lead-mgmt-root .lm-team-table tr.is-scope td:first-child { font-weight:700; }

/* AJOUT 20/08/2026 — compteurs du vendeur */
#lead-mgmt-root .lm-focus { background:var(--card); border:1px solid var(--border); border-radius:8px; padding:14px 18px; margin-bottom:12px; }
#lead-mgmt-root .lm-focus-h { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:14px; }
#lead-mgmt-root .lm-focus-back { border:1px solid var(--border); background:var(--card); color:var(--blue-dk); font:inherit; font-size:12px; font-weight:600; padding:6px 13px; border-radius:99px; cursor:pointer; }
#lead-mgmt-root .lm-focus-back:hover { background:#eaf0f9; }
#lead-mgmt-root .lm-focus-nom { font-size:17px; font-weight:700; color:var(--blue-dk); letter-spacing:-.01em; }
#lead-mgmt-root .lm-focus-kpi { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
#lead-mgmt-root .lm-focus-c { background:#f5f8fc; border:1px solid transparent; border-radius:8px; padding:11px 13px; text-align:left; font:inherit; cursor:pointer; transition:background .14s, border-color .14s; }
#lead-mgmt-root .lm-focus-c:hover { background:#eaf0f9; border-color:var(--border); }
#lead-mgmt-root .lm-focus-c:focus-visible { outline:2px solid var(--blue-dk); outline-offset:2px; }
#lead-mgmt-root .lm-focus-c.alerte .lm-focus-n { color:#b8851a; }
#lead-mgmt-root .lm-focus-n { display:block; font-size:23px; font-weight:700; color:var(--blue-dk); line-height:1; letter-spacing:-.03em; font-variant-numeric:tabular-nums; }
#lead-mgmt-root .lm-focus-l { display:block; font-size:10.5px; color:var(--text-mut); margin-top:5px; }
#lead-mgmt-root .lm-focus-go { text-align:right; margin-bottom:12px; }
#lead-mgmt-root .lm-focus-btn { border:1px solid var(--border); background:var(--card); color:var(--blue-dk); font:inherit; font-size:12.5px; font-weight:600; padding:8px 16px; border-radius:99px; cursor:pointer; }
#lead-mgmt-root .lm-focus-btn:hover { background:#eaf0f9; }
@media (max-width:640px) { #lead-mgmt-root .lm-focus-kpi { grid-template-columns:repeat(2,1fr); } }

/* AJOUT 20/08/2026 — entonnoir de cohorte */
#lead-mgmt-root .lm-ent { background:var(--card); border:1px solid var(--border); border-radius:8px; padding:16px 18px; margin-bottom:12px; }
#lead-mgmt-root .lm-ent-h { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:16px; }
#lead-mgmt-root .lm-ent-t { font-size:13px; font-weight:700; color:var(--blue-dk); }
#lead-mgmt-root .lm-ent-per { font-size:12px; font-weight:600; color:var(--blue-dk); background:#eaf0f9; padding:3px 10px; border-radius:99px; }
#lead-mgmt-root .lm-ent-s { font-size:11px; color:var(--text-mut); }
#lead-mgmt-root .lm-ent-chaine { display:flex; align-items:stretch; gap:0; flex-wrap:wrap; }
#lead-mgmt-root .lm-ent-pas { flex:1 1 110px; min-width:96px; padding:12px 10px; border-radius:8px; background:#f5f8fc; text-align:center; }
#lead-mgmt-root .lm-ent-pas.fin { background:#e1f5ee; }
#lead-mgmt-root .lm-ent-nb { font-size:27px; font-weight:700; line-height:1; letter-spacing:-.03em; color:var(--blue-dk); font-variant-numeric:tabular-nums; }
#lead-mgmt-root .lm-ent-pas.fin .lm-ent-nb { color:#085041; }
#lead-mgmt-root .lm-ent-lb { font-size:10.5px; color:var(--text-mut); margin-top:5px; line-height:1.3; }
#lead-mgmt-root .lm-ent-fle { flex:0 0 62px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; color:#9bb3d1; }
#lead-mgmt-root .lm-ent-fle svg { width:40px; height:8px; display:block; }
#lead-mgmt-root .lm-ent-tx { font-size:13px; font-weight:700; color:var(--blue-dk); font-variant-numeric:tabular-nums; }
#lead-mgmt-root .lm-ent-fle.bas { color:var(--red-soft); }
#lead-mgmt-root .lm-ent-fle.bas .lm-ent-tx { color:var(--red-soft); }
#lead-mgmt-root .lm-ent-bas { margin-top:16px; padding-top:13px; border-top:1px solid var(--border); display:flex; flex-direction:column; gap:6px; }
#lead-mgmt-root .lm-ent-glob { font-size:12.5px; color:var(--text-mut); }
#lead-mgmt-root .lm-ent-glob b { color:var(--blue-dk); font-weight:700; font-size:14px; }
#lead-mgmt-root .lm-ent-et { font-size:12.5px; color:var(--text-mut); }
#lead-mgmt-root .lm-ent-et b { color:var(--red-soft); font-weight:700; font-size:14px; }
#lead-mgmt-root .lm-ent-et i { font-style:normal; color:var(--red-soft); font-weight:600; }
#lead-mgmt-root .lm-ent-note { margin-top:10px; font-size:10.5px; color:var(--text-mut); line-height:1.5; }
#lead-mgmt-root .lm-ent-sk { height:74px; border-radius:8px; background:linear-gradient(90deg,#eef2f8 25%,#e2eaf5 50%,#eef2f8 75%); background-size:200% 100%; animation:lmentsk 1.4s infinite; }
@keyframes lmentsk { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
@media (max-width:700px) {
  #lead-mgmt-root .lm-ent-chaine { flex-direction:column; }
  #lead-mgmt-root .lm-ent-pas { flex:none; width:100%; display:flex; align-items:baseline; gap:10px; text-align:left; }
  #lead-mgmt-root .lm-ent-lb { margin-top:0; }
  #lead-mgmt-root .lm-ent-fle { flex:none; width:100%; flex-direction:row; gap:8px; padding:4px 0; }
  #lead-mgmt-root .lm-ent-fle svg { transform:rotate(90deg); width:22px; }
}
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
/* Le vendeur sur lequel porte la synthese : encadre ET en gras, pour qu'on
   le retrouve d'un coup d'oeil dans une liste de cinq. */
#lead-mgmt-root .lm-ranking-item.is-highlighted { background:var(--blue-bg); border-color:var(--blue-dk); box-shadow:0 0 0 1px var(--blue-dk); }
#lead-mgmt-root .lm-ranking-item.is-highlighted .lm-ranking-name { font-weight:700; color:var(--blue-dk); }
#lead-mgmt-root .lm-ranking-item.is-highlighted .lm-ranking-value { font-weight:700; }
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

${LM_SLA_CSS}
${LM_ROLE_CSS}
${LM_V2_CSS}
`;
doc.head.appendChild(styleEl);

// --- 4. État local ------------------------------------------
const state = window.__leadMgmt || {};
// Le routage passe par SECTIONS_ROLE et state.sectionIdx (socle par rôle).
// `state.section` et `state.view` ne servent plus qu'aux vues héritées.
if (state.sectionIdx === undefined)      state.sectionIdx = 0;
if (state.vueCycles === undefined)       state.vueCycles = 'liste';
if (state.drillSite === undefined)       state.drillSite = null;
if (state.drillVendeur === undefined)    state.drillVendeur = null;
if (state.filterSource === undefined)    state.filterSource = 'all';
if (state.search === undefined)          state.search = '';
if (state.expanded === undefined)        state.expanded = {};
if (state.selectedVendeur === undefined) state.selectedVendeur = null;
// Periode TOUJOURS reinitialisee a l'arrivee sur la page (13/08/2026).
// L'etat vit sur window et survit donc aux navigations SPA : avec un test
// `=== undefined`, une periode choisie suivait l'utilisateur de page en page.
// Regle produit : par defaut, du 1er du mois courant a aujourd'hui, aucune
// persistance.
state.period = defaultPeriod();
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
// AJOUT 20/08/2026 — entonnoir de COHORTE (get_entonnoir).
// La premiere marche « contact -> proposition » est LE sujet de cette page :
// c'est la que se joue l'ecart entre 6 % et 30 % de transformation. Le
// « Taux conversion » existant (win / (win + abandon)) mesure autre chose :
// il ne parle que des cycles DEJA CLOS, et ignore ceux qui s'eteignent sans
// que personne ne les solde.
if (state.entData === undefined)         state.entData = null;
if (state.entLoading === undefined)      state.entLoading = false;
if (state.entError === undefined)        state.entError = null;
if (state.entKey === undefined)          state.entKey = null;
// AJOUT 20/08/2026 — synthese focalisee sur UN vendeur.
// null = tout le perimetre du viewer. Quand le chef clique sur un vendeur
// dans le tableau d'equipe, on reste dans la synthese et on la recalcule
// pour lui, au lieu de basculer vers le suivi des leads : le chef veut
// COMPRENDRE ce vendeur avant d'aller voir ses cycles un par un.
// PORTÉE de la synthese. null = tout le perimetre du viewer.
// { type:'reseau'|'affaire'|'site'|'vendeur', label, sites:[ids], id_user }
// La synthese SUIT le noeud choisi dans l'arbre d'equipe, a tous les niveaux
// — comme le tableau de bord. Reseau, affaire et site se ramenent tous a une
// liste de sites ; seul le vendeur passe par id_user.
if (state.syntheseScope === undefined)   state.syntheseScope = null;
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
  // Au changement de site, la descente en cours porte sur un autre
  // périmètre : on la referme plutôt que d'afficher un détail qui ne
  // correspond plus au site sélectionné.
  if (changed) {
    state.drillSite = null; state.drillVendeur = null;
    state.mafileKey = null; state.mafileData = null;
    equipeKey = null; dataEquipe = null;
    chargerSection();
  }
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
  // Les campagnes sont bornées par la période : on invalide leur cache.
  campKey = null; dataCampagnes = null;
  reacKey = null; dataReactivite = null;
  reloadClassement();
  reloadGraphes();
  reloadCampagnes();
  renderAll();
  // 🐛 Sans cet appel, le cache était vidé mais RIEN ne relançait le
  //    chargement : la vue Campagnes restait sur un spinner sans fin
  //    (relevé le 27/08). Chaque vue doit aussi savoir se charger seule
  //    — voir ensureCampagnes() appelée depuis v2Campagnes().
  chargerSection();
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
// ── AJOUT : entonnoir de cohorte ────────────────────────────────────────
// La cohorte NE SUIT PAS le selecteur de periode de la page, et c'est
// volontaire : les contacts de cette semaine n'ont pas eu le temps de se
// conclure, les compter ecraserait le taux. Fenetre fixe de 3 mois qui
// s'arrete il y a 30 jours.
function bornesCohorte() {
  const fin = new Date(); fin.setDate(fin.getDate() - 30);
  const deb = new Date(fin); deb.setDate(deb.getDate() - 90);
  return { from: ymd(deb), to: ymd(fin) };
}

// Sur QUI porte l'entonnoir : le vendeur focalise, sinon le vendeur connecte
// s'il en est un, sinon tout son perimetre.
function entonnoirCible() {
  const sc = state.syntheseScope;
  if (sc && sc.type === 'vendeur')       return { id_user: Number(sc.id_user), sites: null };
  if (sc && sc.sites && sc.sites.length) return { id_user: null, sites: sc.sites.map(Number) };
  if (isVendeur)                         return { id_user: Number(userId), sites: null };
  return { id_user: null, sites: null };
}

// Les sites concernes par la portee courante. Sert a TOUS les blocs de la
// synthese, pas seulement a l'entonnoir : sans ca, changer de perimetre ne
// mettait a jour qu'un bloc sur quatre, ce qui est pire que de ne rien
// filtrer du tout.
// null quand rien n'est selectionne : le RPC prend alors tout le perimetre.
function portéeSites() {
  const sc = state.syntheseScope;
  return (sc && sc.sites && sc.sites.length) ? sc.sites.map(Number) : null;
}
function portéeCle() {
  const p = portéeSites();
  return p ? p.join('.') : 'perim';
}

function scopeSites() {
  const sc = state.syntheseScope;
  if (sc && sc.sites && sc.sites.length) return sc.sites.map(Number);
  return userSiteIds.map(Number);
}
function scopeVendeurId() {
  const sc = state.syntheseScope;
  return (sc && sc.type === 'vendeur') ? Number(sc.id_user) : null;
}

function libellePortee() {
  const sc = state.syntheseScope;
  if (!sc) return isVendeur ? 'mes contacts' : 'tout mon perimetre';
  return sc.label || 'la selection';
}

async function fetchEntonnoir() {
  const b = bornesCohorte();
  const c = entonnoirCible();
  const key = b.from + '_' + b.to + '_u' + (c.id_user == null ? '-' : c.id_user) +
              '_s' + (c.sites ? c.sites.join('.') : '-');
  if (state.entLoading) return;
  // ⚠️ Tester `entData !== null` NE SUFFIT PAS : apres un echec, entData
  //    reste null, le cache ne prend JAMAIS et la RPC repart a chaque
  //    rendu — or fetchEntonnoir se termine par renderAll(), donc chaque
  //    rendu en declenche un autre. On memorise aussi la cle ECHOUEE.
  if (state.entKey === key && (state.entData !== null || state.entError)) return;

  state.entLoading = true;
  state.entError = null;
  state.entKey = key;

  try {
    const { data, error } = await ctx.sb.rpc('get_entonnoir', {
      p_viewer_id_user: Number(userId),
      p_date_from: b.from,
      p_date_to: b.to,
      p_id_user: c.id_user,
      p_seuil_sans_suite: 90,
      p_sites: c.sites
    });
    if (error) throw error;
    state.entData = (data || []).slice().sort((x, y) => (x.rang || 0) - (y.rang || 0));
  } catch (e) {
    console.warn('[lead-mgmt] get_entonnoir', e);
    state.entData = null;
    state.entError = (e && e.message) || String(e);
  }
  state.entLoading = false;
  renderAll();
}

function jolieDateCourte(s) {
  try { return new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); }
  catch (e) { return s; }
}

// Le bloc affiche la PREMIERE MARCHE en grand — c'est le sujet de la page —
// et le reste de l'entonnoir en petit, pour situer.
// Dit SUR QUOI porte l'entonnoir, et permet d'en sortir. Sans ce bandeau,
// un chef qui a clique sur un site croirait lire tout son perimetre.
function renderBandeauPortee() {
  const sc = state.syntheseScope;
  let h = '<div class="lm-portee">';
  h += '<span class="lm-portee-l">' + (sc ? 'Synthese de' : 'Synthese de') + '</span>';
  h += '<span class="lm-portee-v">' + escapeHtml(libellePortee()) + '</span>';
  if (sc) {
    h += '<button type="button" class="lm-portee-x" data-action="portee-reset">&times; tout mon perimetre</button>';
    if (sc.type === 'vendeur') {
      h += '<button type="button" class="lm-portee-go" data-action="portee-cycles">Voir ses cycles &rarr;</button>';
    }
  }
  return h + '</div>';
}

function renderEntonnoirCohorte() {
  if (state.entError) return '';
  const b = bornesCohorte();

  if (state.entData === null) {
    return '<div class="lm-ent"><div class="lm-ent-h"><span class="lm-ent-t">Transformation reelle</span></div>' +
           '<div class="lm-ent-sk"></div></div>';
  }
  const e = state.entData;
  if (!e.length || !(e[0] && e[0].total)) return '';

  const n  = function (v) { const x = parseFloat(v); return isNaN(x) ? 0 : x; };
  const fr = function (v) { return String(Math.round(n(v))).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f'); };

  const contacts = n(e[0].total);
  const wins     = n(e[3] && e[3].total);
  const global   = contacts > 0 ? Math.round(100 * wins / contacts) : 0;
  const eteints  = n(e[0].perdu_sans_suite);
  const pctEt    = contacts > 0 ? Math.round(100 * eteints / contacts) : 0;
  const dj       = e[0].delai_median_jours;

  // ── La chaine : 4 nombres, 3 taux entre eux. C'est de la que se deduit
  //    le 7 % global (408 / 5 801), et c'est ce que l'utilisateur lit en
  //    premier. Tout le reste est secondaire.
  let h = '<div class="lm-ent">';
  h += '<div class="lm-ent-h">' +
       '<span class="lm-ent-t">Transformation reelle</span>' +
       '<span class="lm-ent-per">' + jolieDateCourte(b.from) + ' &rarr; ' + jolieDateCourte(b.to) + '</span>' +
       '<span class="lm-ent-s">on laisse un mois aux affaires recentes pour se conclure</span>' +
       '</div>';

  h += '<div class="lm-ent-chaine">';
  e.forEach(function (et, i) {
    const tot = n(et.total);
    const der = (i === e.length - 1);
    h += '<div class="lm-ent-pas' + (der ? ' fin' : '') + '">' +
         '<div class="lm-ent-nb">' + fr(tot) + '</div>' +
         '<div class="lm-ent-lb">' + (et.etape || '') + '</div>' +
         '</div>';
    if (!der) {
      const tx = tot > 0 ? Math.round(100 * n(et.avance) / tot) : 0;
      const bas = tx < 25;
      h += '<div class="lm-ent-fle' + (bas ? ' bas' : '') + '">' +
           '<span class="lm-ent-tx">' + tx + '\u202f%</span>' +
           '<svg viewBox="0 0 40 8" preserveAspectRatio="none" aria-hidden="true">' +
           '<path d="M0 4 H32 M28 1 L33 4 L28 7" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>' +
           '</div>';
    }
  });
  h += '</div>';

  // ── Le bilan et le seul segment sur lequel on peut agir aujourd'hui.
  h += '<div class="lm-ent-bas">' +
       '<span class="lm-ent-glob"><b>' + global + '\u202f%</b> de transformation, du premier contact a la commande' +
       (dj != null ? ' · <b>' + (Math.round(n(dj) * 10) / 10).toFixed(1).replace('.', ',') + ' jours</b> avant la premiere proposition' : '') +
       '</span>';
  if (eteints > 0) {
    h += '<span class="lm-ent-et"><b>' + fr(eteints) + '</b> cycles eteints <i>(' + pctEt + '\u202f%)</i>' +
         ' — plus aucun contact depuis 3 mois, et aucun cycle cloture</span>';
  }
  h += '</div>';

  h += '<div class="lm-ent-note">Un contact est une action SORTANTE du vendeur : appel emis, message, ' +
       'rapport de visite. Recevoir un lead n\'en est pas une.</div>';

  return h + '</div>';
}

function computeSyntheseKpi() {
  const { from, to } = getPeriodDates();
  const fromMs = from.getTime();
  const toMs   = to.getTime();
  // MODIFIÉ 20/08/2026 — ces compteurs suivent desormais la portee choisie
  // dans le tableau d'equipe, et non plus systematiquement tout le perimetre.
  const sites  = scopeSites();
  const vId    = scopeVendeurId();
  const dansPortee = function (idSite) { return sites.indexOf(Number(idSite)) !== -1; };

  // Au niveau vendeur, le compteur de cycles vient de SA ligne ; sinon c'est
  // la somme des sites retenus.
  const cyclesActifs = (vId != null)
    ? (function () {
        const v = dataKpiVend.find(function (x) { return Number(x.id_user) === vId; });
        return v ? (v.cycles_total || 0) : 0;
      })()
    : dataKpiSite.filter(function (r) { return dansPortee(r.id_site); })
                 .reduce(function (a, r) { return a + (r.cycles_total || 0); }, 0);
  let winCount = 0, abandonCount = 0;
  for (const c of dataClotures) {
    if (!dansPortee(c.id_site)) continue;
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
    if (!dansPortee(lead.id_site)) continue;
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
    const { data, error } = await sb.rpc('get_classement_vendeur', {
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
    if (window.__renderLeadMgmt) window.__renderLeadMgmt();
  }
}

function reloadClassement() {
  state.rankingData = null;
  state.rankingKey = null;
  
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
  let key = periodKey();
  if (state.graphesLoading) return;
  key = key + '|' + portéeCle();
  if (state.graphesKey === key && state.evolutionData !== null) return;

  const { from, to } = getPeriodDates();
  state.graphesLoading = true;
  state.graphesError = null;
  state.graphesKey = key;

  try {
    const supabase = ctx.supabase;
    // Les graphes suivent la portee choisie dans le tableau d'equipe, comme
    // l'entonnoir, les compteurs et le classement (20/08/2026).
    const params = {
      p_viewer_id_user: Number(userId),
      p_date_from: ymd(from),
      p_date_to: ymd(to),
      p_sites: portéeSites()
    };
    const [evo, src] = await Promise.all([
      sb.rpc('get_leads_par_jour', params),
      sb.rpc('get_leads_par_source', params)
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
    if (window.__renderLeadMgmt) window.__renderLeadMgmt();
  }
}

function reloadGraphes() {
  state.evolutionData = null;
  state.sourcesData = null;
  state.graphesKey = null;
  
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
  // Surligne le vendeur sur lequel porte la synthese.
  const vSurl = scopeVendeurId();
  const isHighlighted = (vSurl != null && Number(item.id_user) === vSurl) ||
                        (vSurl == null && state.selectedVendeur &&
                         state.selectedVendeur.id_user === item.id_user);
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

  // MODIFIÉ 20/08/2026 — le classement suit la portee. Le RPC rend tout le
  // perimetre ; on restreint ici via la correspondance vendeur -> site que
  // dataKpiVend fournit deja. Au niveau vendeur, on ne garde que lui.
  // CORRIGÉ 20/08/2026 — au niveau vendeur, on garde le classement de SON
  // SITE et on le surligne dedans. Le restreindre a lui seul le faisait
  // sortir premier des deux classements a la fois : un classement d'une
  // personne ne classe rien. Le surlignage et le repechage hors top 5
  // ci-dessous s'appuient sur state.selectedVendeur, deja positionne.
  {
    const sites = scopeSites();
    const siteDe = {};
    dataKpiVend.forEach(function (v) { siteDe[Number(v.id_user)] = Number(v.id_site); });
    ranking = ranking.filter(function (r) {
      const sv = siteDe[Number(r.id_user)];
      return sv == null ? false : sites.indexOf(sv) !== -1;
    });
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
    const vRepeche = scopeVendeurId() != null
      ? { id_user: scopeVendeurId() }
      : state.selectedVendeur;
    if (vRepeche) {
      const inTop = list.some(it => Number(it.id_user) === Number(vRepeche.id_user));
      if (!inTop) {
        const fullSorted = side === 'top'
          ? [...ranking].sort((a, b) => b.taux - a.taux || b.winCount - a.winCount)
          : [...ranking].sort((a, b) => a.taux - b.taux || b.totalClos - a.totalClos);
        const idx = fullSorted.findIndex(it => Number(it.id_user) === Number(vRepeche.id_user));
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
    const { data, error } = await sb.rpc('get_campagnes_sollicitation', {
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
    if (window.__renderLeadMgmt) window.__renderLeadMgmt();
  }
}

function reloadCampagnes() {
  state.campagnesData = null;
  state.campagnesKey = null;
  if (sectionEst('campagnes')) fetchCampagnes();
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
  // data-scope-* : le clic sur la ligne fixe la portee de la synthese.
  const scSel = state.syntheseScope && state.syntheseScope.type === 'site' &&
                String(state.syntheseScope.sites[0]) === String(s.id_site);
  return '<tr class="row-site' + (isBus ? ' is-bus-focus' : '') + (scSel ? ' is-scope' : '') +
         '" data-expand-key="' + escapeHtml(sKey) + '" data-site-id="' + escapeHtml(s.id_site) +
         '" data-scope-type="site" data-scope-sites="' + escapeHtml(s.id_site) +
         '" data-scope-label="' + escapeHtml(s.label || ('Site ' + s.id_site)) + '"><td>' + expandIcon(sOpen) + escapeHtml(s.label) + villeHtml + pin + '</td>' + kpiCells(s.kpi) + '</tr>';
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
        const rSites = [];
        r.affaires.forEach(function (aa) { aa.sites.forEach(function (ss) { rSites.push(ss.id_site); }); });
        const rSel = state.syntheseScope && state.syntheseScope.type === 'reseau' &&
                     state.syntheseScope.label === r.label;
        rows += '<tr class="row-reseau' + (rSel ? ' is-scope' : '') + '" data-expand-key="' + escapeHtml(rKey) +
                '" data-scope-type="reseau" data-scope-sites="' + escapeHtml(rSites.join(',')) +
                '" data-scope-label="' + escapeHtml(r.label) + '"><td>' + expandIcon(rOpen) + escapeHtml(r.label) + '</td>' + kpiCells(r.kpi) + '</tr>';
      }
      if (!rOpen) continue;
      const collapseAffaire = collapseReseau && r.affaires.length === 1;
      for (const a of r.affaires) {
        const aKey = rKey + '|a:' + a.label;
        const aOpen = !!state.expanded[aKey] || collapseAffaire;
        if (!collapseAffaire) {
          const aSites = a.sites.map(function (ss) { return ss.id_site; });
          const aSel = state.syntheseScope && state.syntheseScope.type === 'affaire' &&
                       state.syntheseScope.label === a.label;
          rows += '<tr class="row-affaire' + (aSel ? ' is-scope' : '') + '" data-expand-key="' + escapeHtml(aKey) +
                  '" data-scope-type="affaire" data-scope-sites="' + escapeHtml(aSites.join(',')) +
                  '" data-scope-label="' + escapeHtml(a.label) + '"><td>' + expandIcon(aOpen) + escapeHtml(a.label) + '</td>' + kpiCells(a.kpi) + '</tr>';
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
// ── AJOUT : synthese d'UN vendeur ─────────────────────────────────────
// Sert deux cas : le chef qui clique sur un vendeur, et le vendeur qui
// consulte sa propre synthese. Meme rendu, seul l'en-tete change.
function renderSyntheseVendeur(idUser, nom, avecRetour) {
  fetchEntonnoir();

  // v_lead_kpi_vendeur rend UNE LIGNE PAR SITE. Un .find() prenait la
  // premiere et figeait donc la synthese sur un seul site, quel que soit
  // le selecteur de la topnav (releve par Antoine le 27/08/2026 : chiffres
  // identiques sur les deux sites). On agrege les lignes du vendeur, en se
  // limitant au site courant quand il y en a un de selectionne.
  const _siteSel = (function () {
    try { const b = siteBus(); const id = b && b.getSiteId(); return id == null ? null : Number(id); }
    catch (e) { return null; }
  })();
  const _lignes = dataKpiVend.filter(function (x) {
    if (Number(x.id_user) !== Number(idUser)) return false;
    return _siteSel == null || Number(x.id_site) === _siteSel;
  });
  const v = _lignes.reduce(function (acc, r) {
    acc.cycles_total += (+r.cycles_total || 0);
    acc.a_traiter    += (+r.a_traiter    || 0);
    acc.pipeline     += (+r.pipeline     || 0);
    acc.clos_recent  += (+r.clos_recent  || 0);
    return acc;
  }, { cycles_total: 0, a_traiter: 0, pipeline: 0, clos_recent: 0 });
  const n = function (x) { const y = parseFloat(x); return isNaN(y) ? 0 : y; };

  // Chaque compteur mene a la vue qui le detaille : un chiffre qui ne se
  // creuse pas est un chiffre qu'on regarde une fois puis qu'on ignore.
  const cartes = [
    { n: n(v.cycles_total), l: 'cycles ouverts',  go: 'a_traiter' },
    { n: n(v.a_traiter),    l: 'a traiter',       go: 'a_traiter', alerte: n(v.a_traiter) > 0 },
    { n: n(v.pipeline),     l: 'en pipeline',     go: 'pipeline'  },
    { n: n(v.clos_recent),  l: 'clos recemment',  go: 'a_traiter' }
  ];

  let html = '<div class="lm-focus">';
  html += '<div class="lm-focus-kpi">';
  cartes.forEach(function (c) {
    html += '<button type="button" class="lm-focus-c' + (c.alerte ? ' alerte' : '') +
            '" data-goto="' + c.go + '">' +
            '<span class="lm-focus-n">' + c.n + '</span>' +
            '<span class="lm-focus-l">' + c.l + '</span></button>';
  });
  html += '</div></div>';

  html += renderBandeauPortee();
  html += renderEntonnoirCohorte();
  return html;
}

function renderViewSynthese() {
  const kpi = computeSyntheseKpi();
  if (state.rankingData === null || state.rankingKey !== periodKey()) {
    fetchClassement();
  }
  fetchEntonnoir();   // AJOUT : entonnoir de cohorte (non bloquant)
  const ranking = Array.isArray(state.rankingData) ? state.rankingData : [];
  let html = '';
  html += renderTeamTable();
  html += renderPeriodBar();
  html += '<div class="lm-synthese">';
  // Le tableau d'equipe ci-dessus pilote TOUTE la synthese : entonnoir,
  // compteurs et classement. Seuls les deux graphiques du bas restent au
  // niveau du perimetre — leurs RPC agregent cote serveur sans detail par
  // site, il faudra leur ajouter un filtre (note du 20/08/2026).
  html += renderBandeauPortee();
  html += renderEntonnoirCohorte();
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
  if (state.evolutionData === null || state.graphesKey !== (periodKey() + '|' + portéeCle())) {
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
// Filtre « cycles de CE vendeur ».
//
// ⚠️ Deux notions de « vendeur » coexistent dans v_cycles_actifs :
//   id_vendeur       = le PROPRIÉTAIRE du cycle — c'est lui que compte
//                      v_lead_kpi_vendeur, donc le tableau d'équipe.
//   user_ids_actifs  = TOUS ceux qui ont eu une activité sur le cycle
//                      (un appel, un message, un rapport).
//
// Le filtre s'appuyait sur user_ids_actifs : on affichait donc les cycles
// où le vendeur était simplement INTERVENU. Mesuré le 26/08/2026 sur
// Benjamin Adam (1009) : 42 cycles où il est actif, dont 18 seulement lui
// appartiennent — et « à traiter aujourd'hui » affichait 8 quand le
// tableau annonçait 6. Le même écran donnait deux chiffres pour le même mot.
//
// On s'aligne sur le TABLEAU : le détail montre les cycles du vendeur.
// Le repli sur user_ids_actifs ne sert plus que si id_vendeur est absent
// (cycle sans propriétaire), pour ne pas faire disparaître la ligne.
// Filtre « cycles de CE vendeur ».
//
// RÈGLE MÉTIER (Antoine, 27/08/2026) : PERSONNE n'est propriétaire d'un
// cycle. Un cycle relie un CLIENT à un SITE. Un vendeur voit le cycle s'il
// y a fait une ACTION SORTANTE — appel émis, message, rapport de visite.
//
// ⚠️ NE PAS filtrer sur `c.id_vendeur` : cette colonne porte le CRÉATEUR du
// cycle (CYCLE_COM.id_user), pas un titulaire. Le faire — comme le 26/08 —
// masquait les cycles travaillés par le vendeur sans qu'il les ait créés,
// et laissait 517 cycles ouverts sur 4 611 (11 %) sans aucun rattachement.
//
// `user_ids_actifs` porte exactement la règle depuis la migration
// 20260827100000 : RPV + contacts sortants, sans les entrants ni les
// propales.
function matchVendeurFilter(c) {
  if (!state.selectedVendeur) return true;
  const arr = c.user_ids_actifs;
  if (!Array.isArray(arr)) return false;
  return arr.includes(state.selectedVendeur.id_user);
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

// Un ecran qui dit « aucun cycle » pendant qu'il charge est deroutant :
// il affirme une absence alors qu'il n'a pas encore la reponse (releve par
// Antoine le 27/08). Tant que les cycles ne sont pas la, on le DIT.
function lmAttenteCycles(quoi) {
  return '<div class="lm-empty" style="padding:34px;font-size:12px;color:var(--text-mut)">'
       + '<span class="lm-spin"></span>Chargement ' + (quoi || 'des cycles') + '…</div>';
}

function renderViewActifs() {
  if (state.cyclesLoading && !dataActifs.length) return lmAttenteCycles('des cycles');
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
  if (state.cyclesLoading && !dataKanban.length) return lmAttenteCycles('du pipeline');
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
  html += '<button type="button" class="lm-subtoggle-btn' + (state.view === 'a_traiter' ? ' active' : '') + '" data-view="a_traiter">Cycles actifs</button>';
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
    const { data, error } = await sb.rpc('creer_campagne_sollicitation', p);
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
    const { data, error } = await sb.rpc('creer_campagne_sollicitation', p);
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
// ============================================================
//  SECTIONS « MA FILE » ET « LEADS »            (ajout 27/08/2026)
//
//  PRINCIPE : LE TEMPS EST L'AXE, PAS LE STATUT.
//
//  Un lead management classique affiche une colonne « statut » et trie
//  par date d'arrivee. C'est l'inverse du besoin : ce qui compte n'est
//  pas QUAND le lead est arrive, mais COMBIEN DE TEMPS IL RESTE avant
//  qu'il soit trop tard.
//
//  La barre de chaque carte ne mesure donc PAS un avancement de
//  traitement : elle se remplit toute seule a mesure que le temps passe.
//  Un vendeur qui ne fait rien voit ses barres progresser. C'est un objet
//  qui se degrade, pas une tache qui avance.
//
//  Chaque source portant son propre SLA (lead_source.sla_minutes), deux
//  leads arrives ensemble ne vieillissent pas au meme rythme : un
//  Leboncoin brule en 15 min, le site web en 30. La barre le rend visible
//  sans qu'on ait a lire les chiffres.
//
//  LA COLONNE STATUT DISPARAIT, volontairement : elle est portee par la
//  position dans la file et la couleur du lisere. Un vendeur n'a pas a
//  lire « attribue », il a a savoir s'il doit appeler MAINTENANT.
// ============================================================



// Combien de temps reste-t-il, en minutes ? Negatif = SLA depasse.
function lmfReste(l) {
  const sla = Number(l.sla_minutes) || 60;
  if (l.premier_contact_le) return null;                 // deja traite
  const attente = Number(l.attente_min);
  if (isNaN(attente)) return null;
  return sla - attente;
}

// Le NIVEAU d'urgence porte la couleur ET le tri. Une sollicitation
// n'entre pas dans les compteurs de leads (decision 6 du 27/08) : elle
// cohabite dans la file mais reste identifiee.
function lmfNiveau(l) {
  if (l.hors_lead) return 'hors';
  const r = lmfReste(l);
  if (r === null) return 'calme';
  if (r < 0)  return 'retard';
  if (r <= 5) return 'bientot';
  return 'calme';
}

function lmfDuree(min) {
  const m = Math.abs(Math.round(min));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return r ? (h + ' h ' + String(r).padStart(2, '0')) : (h + ' h');
  return Math.floor(h / 24) + ' j';
}

// La jauge se remplit avec le TEMPS ECOULE, pas avec l'avancement.
function lmfJauge(l) {
  const sla = Number(l.sla_minutes) || 60;
  const attente = Number(l.attente_min);
  if (isNaN(attente)) return 0;
  return Math.max(0, Math.min(100, Math.round((attente / sla) * 100)));
}

const LMF_COUL = { retard:'#a32d2d', bientot:'#b8851a', calme:'#53bda7', hors:'#b4b2a9' };

function renderMaFileCard(l, avecReaff) {
  const niv   = lmfNiveau(l);
  const reste = lmfReste(l);
  const pct   = lmfJauge(l);
  let temps;
  if (l.hors_lead)          temps = l.temps_libelle || '—';
  else if (reste === null)  temps = 'traité';
  else if (reste < 0)       temps = '+ ' + lmfDuree(reste);
  else                      temps = lmfDuree(reste);

  let h = '<div class="lmf-card ' + niv + '" data-lead="' + l.id_lead + '"'
        + (l.id_client ? ' data-client="' + l.id_client + '"' : '') + '>';
  h += '<div class="lmf-head">';
  h += '<span class="lmf-nom">' + escapeHtml(l.nom_affiche || 'Sans nom') + '</span>';
  h += '<span class="lmf-temps ' + niv + '">' + temps + '</span>';
  h += '</div>';
  h += '<div class="lmf-jauge"><span style="width:' + pct + '%;background:' + LMF_COUL[niv] + '"></span></div>';
  h += '<div class="lmf-meta">';
  h += '<span class="lmf-src' + (l.hors_lead ? ' hors' : '') + '">' + escapeHtml(l.source_libelle || l.source || '?') + '</span>';
  const detail = [];
  if (l.vehicule_interet) detail.push(escapeHtml(l.vehicule_interet));
  if (l.hors_lead) detail.push('hors compteur lead');
  else if (l.sla_minutes) detail.push('SLA ' + l.sla_minutes + ' min');
  if (detail.length) h += '<span>' + detail.join(' · ') + '</span>';
  if (avecReaff && !l.hors_lead) {
    h += '<button type="button" class="lmf-reaff" data-reaff="' + l.id_lead + '">Réaffecter</button>';
  }
  h += '</div></div>';
  return h;
}

// --- Chargement ---------------------------------------------
// Une section ne charge qu'a sa premiere ouverture, et la cle de cache
// inclut le SITE et la CIBLE : c'est le patron deja en place pour le
// classement et les graphiques.
async function fetchMaFile() {
  // ⚠️ `|| userId` ECRASAIT le null volontaire pose pour voir TOUT le
  //    perimetre (section « Leads » du chef) : il ne voyait que SES
  //    leads, d'ou des onglets vides alors que la base rendait 20 leads
  //    dont 10 en retard sous son identite. `undefined` = « moi »,
  //    `null` = « tout le perimetre ».
  const cible = (state.mafileCible === null) ? null
              : (state.mafileCible === undefined ? userId : state.mafileCible);
  const key   = [cible, state.busSite || 'tous'].join('|');
  // ⚠️ Tester `mafileData` NE SUFFIT PAS : au montage, le bus de site se
  // lie juste apres et rappelle fetchMaFile alors que la premiere requete
  // est ENCORE EN VOL — d'ou deux appels reseau identiques (releve par
  // Antoine le 27/08). On garde donc aussi la cle EN COURS.
  if (state.mafileKey === key && (state.mafileData || state.mafileLoading)) return;
  state.mafileKey = key;
  state.mafileLoading = true;
  if (window.__renderLeadMgmt) window.__renderLeadMgmt();
  try {
    let q = sb.from('v_lead_sla')
      .select('id_lead,source,source_libelle,id_site,id_client,id_cycle_comm,statut,'
            + 'recu_le,attribue_le,premier_contact_le,sla_minutes,attente_min,'
            + 'delai_reponse_min,sla_tenu,id_user_attribue,attribution_regle')
      .in('statut', ['recu', 'resolu', 'attribue'])
      .order('attente_min', { ascending: false })
      .limit(300);
    if (cible) q = q.eq('id_user_attribue', cible);
    if (state.busSite) q = q.eq('id_site', Number(state.busSite));
    const { data, error } = await q;
    if (error) throw error;
    state.mafileData = (data || []).map(r => ({
      id_lead:            r.id_lead,
      source:             r.source,
      source_libelle:     r.source_libelle,
      id_site:            r.id_site,
      id_client:          r.id_client,
      statut:             r.statut,
      sla_minutes:        Number(r.sla_minutes) || 60,
      attente_min:        r.attente_min != null ? Number(r.attente_min) : null,
      premier_contact_le: r.premier_contact_le,
      id_user_attribue:   r.id_user_attribue,
      nom_affiche:        r.nom_affiche || null,
      hors_lead:          false
    }));
    await enrichirMaFile();
  } catch (e) {
    console.error('[leadMgmt] Erreur v_lead_sla', e);
    state.mafileError = (e && e.message) ? e.message : 'Erreur de chargement';
    state.mafileData = [];
  } finally {
    state.mafileLoading = false;
    if (window.__renderLeadMgmt) window.__renderLeadMgmt();
  }
}

// Le nom du prospect vient de LEADS_EXTERNES : v_lead_sla ne l'expose pas
// (elle porte les delais, pas l'identite).
async function enrichirMaFile() {
  const rows = state.mafileData || [];
  if (!rows.length) return;
  const ids = rows.map(r => r.id_lead);
  try {
    const { data } = await sb.from('LEADS_EXTERNES')
      .select('id_lead,nom,prenom,vehicule_interet').in('id_lead', ids);
    const idx = {};
    (data || []).forEach(r => { idx[r.id_lead] = r; });
    rows.forEach(r => {
      const s = idx[r.id_lead];
      if (!s) return;
      r.nom_affiche      = [s.prenom, s.nom].filter(Boolean).join(' ').trim() || null;
      r.vehicule_interet = s.vehicule_interet || null;
    });
  } catch (e) { /* le nom est un confort, pas un bloquant */ }
}

function renderViewMaFile() {
  if (state.mafileLoading && !state.mafileData) {
    return '<div class="lm-empty" style="padding:30px;font-size:12px">Chargement de la file…</div>';
  }
  if (state.mafileError) {
    return '<div class="lm-empty" style="padding:30px;font-size:12px">' + escapeHtml(state.mafileError) + '</div>';
  }
  const rows = (state.mafileData || []).slice();
  const avecReaff = isManager;

  // Tri par URGENCE : ce qui brule d'abord. Le temps restant, pas la date.
  rows.sort(function (a, b) {
    const ra = lmfReste(a), rb = lmfReste(b);
    if (ra === null && rb === null) return 0;
    if (ra === null) return 1;
    if (rb === null) return -1;
    return ra - rb;
  });

  const g = { retard: [], bientot: [], calme: [], hors: [] };
  rows.forEach(r => { g[lmfNiveau(r)].push(r); });

  let h = '';
  h += '<div class="lmf-bandeau">';
  if (g.retard.length) {
    h += '<span class="lmf-bandeau-n retard">' + g.retard.length + '</span>';
    h += '<span class="lmf-bandeau-txt">en retard · <span style="color:#b8851a">'
       + g.bientot.length + ' à traiter</span> · ' + g.calme.length + ' en cours</span>';
  } else {
    h += '<span class="lmf-bandeau-n ok">' + rows.length + '</span>';
    h += '<span class="lmf-bandeau-txt">' + (rows.length ? 'lead' + (rows.length > 1 ? 's' : '') + ' en cours, aucun en retard' : 'rien en attente') + '</span>';
  }
  h += '</div>';

  if (!rows.length) {
    h += '<div class="lm-empty" style="padding:30px;font-size:12px">Aucun lead en attente sur ce périmètre.</div>';
    return h;
  }

  const blocs = [
    { k:'retard',  t:'SLA dépassé' },
    { k:'bientot', t:'Il reste du temps' },
    { k:'calme',   t:'En cours' },
    { k:'hors',    t:'Sollicitations' }
  ];
  blocs.forEach(function (b) {
    if (!g[b.k].length) return;
    h += '<div class="lmf-groupe ' + b.k + '">' + b.t + ' <span style="opacity:.6">' + g[b.k].length + '</span></div>';
    g[b.k].forEach(function (l) { h += renderMaFileCard(l, avecReaff); });
  });

  h += '<div class="lmf-note">La barre se remplit à mesure que le temps passe. '
     + 'Rouge = le SLA de la source est dépassé.</div>';
  return h;
}

// --- Section « Leads » : la vue du chef ----------------------
function renderViewLeads() {
  // Le regroupement par vendeur lit dataKpiVend pour les noms.
  ensureKpis();
  if (state.mafileLoading && !state.mafileData) {
    return '<div class="lm-empty" style="padding:30px;font-size:12px">Chargement…</div>';
  }
  const rows = (state.mafileData || []).slice();

  let h = '<div class="lm-subtoggle">';
  h += '<button type="button" class="lm-subtoggle-btn' + (state.viewLeads === 'sans_suite' || !state.viewLeads ? ' active' : '') + '" data-vleads="sans_suite">Sans suite</button>';
  h += '<button type="button" class="lm-subtoggle-btn' + (state.viewLeads === 'a_attribuer' ? ' active' : '') + '" data-vleads="a_attribuer">À attribuer</button>';
  h += '<button type="button" class="lm-subtoggle-btn' + (state.viewLeads === 'par_source' ? ' active' : '') + '" data-vleads="par_source">Par source</button>';
  h += '</div>';

  const vue = state.viewLeads || 'sans_suite';

  if (vue === 'a_attribuer') {
    const sans = rows.filter(r => !r.id_user_attribue);
    if (!sans.length) return h + '<div class="lm-empty" style="padding:30px;font-size:12px">Tous les leads sont attribués.</div>';
    sans.forEach(function (l) { h += renderMaFileCard(l, true); });
    return h;
  }

  if (vue === 'par_source') {
    const par = {};
    rows.forEach(function (r) {
      const k = r.source_libelle || r.source || '?';
      if (!par[k]) par[k] = { n:0, retard:0, sla:r.sla_minutes };
      par[k].n++;
      if (lmfNiveau(r) === 'retard') par[k].retard++;
    });
    const cles = Object.keys(par).sort((a, b) => par[b].n - par[a].n);
    if (!cles.length) return h + '<div class="lm-empty" style="padding:30px;font-size:12px">Aucun lead en cours.</div>';
    cles.forEach(function (k) {
      const p = par[k];
      h += '<div class="lmf-vend">';
      h += '<div><div style="font-size:13px;font-weight:600">' + escapeHtml(k) + '</div>';
      h += '<div style="font-size:11px;color:var(--text-mut)">SLA ' + p.sla + ' min</div></div>';
      h += '<div style="text-align:right">';
      h += '<span class="lmf-vend-n"' + (p.retard ? ' style="color:var(--red-soft)"' : '') + '>' + p.retard + '</span>';
      h += '<div style="font-size:11px;color:var(--text-mut)">en retard sur ' + p.n + '</div>';
      h += '</div></div>';
    });
    return h;
  }

  // Sans suite : le lead attribue qui n'a jamais ete contacte, groupe par
  // vendeur. C'est l'ecran qui manque le plus au chef des ventes.
  const sansSuite = rows.filter(r => r.statut === 'attribue' && !r.premier_contact_le && lmfReste(r) !== null && lmfReste(r) < 0);
  if (!sansSuite.length) {
    return h + '<div class="lm-empty" style="padding:30px;font-size:12px">Aucun lead en dépassement. Toute l\'équipe est à jour.</div>';
  }
  const parV = {};
  sansSuite.forEach(function (r) {
    const k = r.id_user_attribue || 0;
    if (!parV[k]) parV[k] = [];
    parV[k].push(r);
  });
  Object.keys(parV).sort((a, b) => parV[b].length - parV[a].length).forEach(function (k) {
    const lst = parV[k];
    const nom = (dataKpiVend.find(v => Number(v.id_user) === Number(k)) || {}).vendeur_nom || ('Vendeur ' + k);
    h += '<div class="lmf-groupe retard">' + escapeHtml(nom) + ' <span style="opacity:.6">' + lst.length + '</span></div>';
    lst.forEach(function (l) { h += renderMaFileCard(l, true); });
  });
  return h;
}

// --- Réaffectation par un manager ---------------------------
// La RPC refuse deja un appelant sans droit (42501) : le front n'est pas
// le garde-fou, il ne fait qu'eviter un aller-retour inutile.
async function ouvrirReaffectation(idLead) {
  let cibles = [];
  try {
    const { data, error } = await sb.rpc('lead_vendeurs_cibles', { p_id_lead: Number(idLead) });
    if (error) throw error;
    cibles = data || [];
  } catch (e) {
    alert('Impossible de charger les vendeurs : ' + ((e && e.message) || 'erreur'));
    return;
  }
  if (!cibles.length) {
    alert('Aucun vendeur disponible sur ce site, ou vous n\'avez pas le droit de réaffecter ce lead.');
    return;
  }
  const lignes = cibles.map(function (c, i) {
    return (i + 1) + '. ' + c.nom + ' — ' + c.charge + ' en cours' + (c.habituel ? ' (suit déjà ce client)' : '');
  }).join('\n');
  const rep = prompt('Réaffecter ce lead à :\n\n' + lignes + '\n\nNuméro du vendeur :');
  if (!rep) return;
  const idx = parseInt(rep, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= cibles.length) { alert('Choix invalide.'); return; }
  const motif = prompt('Motif de la réaffectation (facultatif) :') || null;
  try {
    const { error } = await sb.rpc('lead_reaffecter', {
      p_id_lead: Number(idLead), p_id_user: Number(cibles[idx].id_user), p_motif: motif
    });
    if (error) throw error;
    state.mafileKey = null;
    state.mafileData = null;
    fetchMaFile();
  } catch (e) {
    // 42501 = la RPC a refuse : l'appelant n'encadre pas ce site.
    alert('Réaffectation refusée : ' + ((e && e.message) || 'droits insuffisants'));
  }
}

// ============================================================
//  ÉCRANS MANAGER : « Mon équipe » et « Mes sites »
//                                        (refonte du 27/08/2026)
//
//  LA DESCENTE VA JUSQU'AU DOSSIER (arbitrage d'Antoine) :
//    site -> équipe du site -> file du vendeur -> carte du lead.
//  Quatre niveaux, un seul chemin, aucun raccourci par un onglet. Un
//  directeur qui voit un site décrocher doit pouvoir savoir QUEL dossier
//  décroche : s'arrêter à l'agrégat produit un constat sans moyen d'agir.
// ============================================================



/* Une valeur mesurée face à son objectif. La barre EST la donnée ;
   le chiffre la précise. */
function lmrTaux(fait, obj) {
  if (obj == null || obj === 0) return null;
  return Math.round((Number(fait) || 0) / Number(obj) * 100);
}
function lmrCls(pct) {
  if (pct == null) return '';
  return pct >= 100 ? 'ok' : pct >= 80 ? 'warn' : 'ko';
}
function lmrCellObj(fait, obj, suffixe) {
  if (obj == null) {
    return '<span class="lmr-sous">objectif non saisi</span>';
  }
  const pct = lmrTaux(fait, obj), c = lmrCls(pct);
  return '<span class="lmr-' + c + '">' + (fait == null ? '—' : fait) + '</span>'
       + '<span class="lmr-sous"> / ' + obj + (suffixe || '') + '</span>'
       + '<div class="lmr-bar lmr-b-' + c + '"><i style="width:'
       + Math.min(100, pct || 0) + '%"></i></div>';
}
function lmrDelai(min) {
  if (min == null) return '<span class="lmr-sous">pas encore</span>';
  const m = Math.round(Number(min));
  const c = m > 60 ? 'ko' : m > 25 ? 'warn' : 'ok';
  return '<span class="lmr-' + c + '">' + lmfDuree(m) + '</span>';
}

// --- Chargement des deux vues -------------------------------
let dataEquipe = null, dataSites = null;
let equipeKey = null, sitesCharge = false;
let equipeEnCours = null, sitesEnCours = null;

function ensureEquipe(idSite) {
  const key = String(idSite || 'tous');
  if (equipeKey === key && dataEquipe) return Promise.resolve();
  if (equipeEnCours) return equipeEnCours;
  equipeKey = key;
  equipeEnCours = (async function () {
    try {
      let q = sb.from('v_lead_equipe').select('*');
      if (idSite) q = q.eq('id_site', Number(idSite));
      const { data, error } = await q;
      if (error) throw error;
      dataEquipe = data || [];
    } catch (e) {
      console.error('[leadMgmt] v_lead_equipe', e);
      dataEquipe = [];
    } finally {
      equipeEnCours = null;
      if (window.__renderLeadMgmt) window.__renderLeadMgmt();
    }
  })();
  return equipeEnCours;
}

function ensureSites() {
  if (sitesCharge) return Promise.resolve();
  if (sitesEnCours) return sitesEnCours;
  sitesEnCours = (async function () {
    try {
      const { data, error } = await sb.from('v_lead_sites').select('*');
      if (error) throw error;
      // ⚠️ La vue rend les sites où l'appelant a des vendeurs visibles,
      //    ce qui n'est PAS son périmètre. Mesuré le 27/08 :
      //    v_lead_kpi_site rend 34 sites à une directrice qui en gère 3.
      //    On croise donc avec le périmètre réel, déjà chargé au montage.
      const perim = new Set(userSiteIds.map(Number));
      dataSites = (data || []).filter(r => perim.has(Number(r.id_site)));
      // ⚠️ Le référentiel dérive de dataSites : le laisser en cache après
      //    un chargement le figerait sur l'état précédent (vide au
      //    montage), et le mur n'afficherait AUCUNE ligne.
      v2Ref = null;
      sitesCharge = true;
    } catch (e) {
      console.error('[leadMgmt] v_lead_sites', e);
      dataSites = [];
    } finally {
      sitesEnCours = null;
      if (window.__renderLeadMgmt) window.__renderLeadMgmt();
    }
  })();
  return sitesEnCours;
}

// --- Fil d'Ariane : il matérialise la descente ---------------
// Sans lui, un dossier atteint depuis trois niveaux plus haut n'a plus
// de contexte et aucun retour possible.
function renderFilAriane() {
  const p = [];
  if (state.drillSite || state.drillVendeur) {
    p.push({ t: LIB_SECTION[SECTIONS_ROLE[state.sectionIdx || 0]] || 'Retour', a: 'racine' });
  }
  if (state.drillSite) {
    const s = (dataSites || []).find(x => Number(x.id_site) === Number(state.drillSite));
    p.push({ t: (s && s.nom_site) || ('Site ' + state.drillSite),
             a: state.drillVendeur ? 'site' : null });
  }
  if (state.drillVendeur) {
    const v = (dataEquipe || []).find(x => Number(x.id_user) === Number(state.drillVendeur));
    p.push({ t: (v && v.vendeur_nom) || ('Vendeur ' + state.drillVendeur), a: null });
  }
  if (!p.length) return '';
  return '<div class="lmr-fil">' + p.map(function (x) {
    return x.a ? '<button type="button" data-fil="' + x.a + '">' + escapeHtml(x.t) + '</button>'
               : '<span class="ici">' + escapeHtml(x.t) + '</span>';
  }).join(' <span>›</span> ') + '</div>';
}

// --- « MON ÉQUIPE » : une ligne par VENDEUR ------------------
function renderVueEquipe(idSite) {
  ensureEquipe(idSite);
  if (!dataEquipe) {
    return '<div class="lm-empty" style="padding:34px;font-size:12px">'
         + '<span class="lm-spin"></span>Chargement de l\'équipe…</div>';
  }
  const rows = dataEquipe.slice().sort(function (a, b) {
    const r = (b.leads_en_retard || 0) - (a.leads_en_retard || 0);
    if (r) return r;   // ce qui brûle remonte
    return (a.contacts_par_jour_ouvre || 0) - (b.contacts_par_jour_ouvre || 0);
  });
  if (!rows.length) {
    return renderFilAriane() + '<div class="lm-empty" style="padding:34px;font-size:12px">'
      + 'Aucun vendeur sur ce périmètre.</div>';
  }

  const retard = rows.reduce((a, r) => a + (r.leads_en_retard || 0), 0);
  let h = renderFilAriane();
  h += '<div class="lmf-bandeau"><span class="lmf-bandeau-n ' + (retard ? 'retard' : 'ok') + '">'
     + retard + '</span><span class="lmf-bandeau-txt">'
     + (retard ? 'lead' + (retard > 1 ? 's' : '') + ' en retard sur ' + rows.length + ' vendeurs'
               : 'lead en retard — l\'équipe est à jour')
     + '</span></div>';

  h += '<table class="lmr-tbl"><thead><tr>'
     + '<th>Vendeur</th>'
     + '<th class="lmr-num">Contacts / jour</th>'
     + '<th class="lmr-num">En retard</th>'
     + '<th class="lmr-num">Délai 1<sup>er</sup> contact</th>'
     + '<th class="lmr-num">Commandes</th>'
     + '</tr></thead><tbody>';

  rows.forEach(function (v) {
    h += '<tr class="lmr-clic" data-vendeur="' + v.id_user + '">'
      + '<td><div class="lmr-nom">' + escapeHtml(v.vendeur_nom || ('Vendeur ' + v.id_user)) + '</div>'
      +     '<div class="lmr-sous">' + escapeHtml(v.vn_vo || '—') + '</div></td>'
      + '<td class="lmr-num">' + lmrCellObj(v.contacts_par_jour_ouvre, v.objectif_contacts_jour) + '</td>'
      + '<td class="lmr-num">' + (v.leads_en_retard
            ? '<span class="lmr-ko">' + v.leads_en_retard + '</span>'
            : '<span class="lmr-sous">—</span>')
      +     (v.leads_en_file ? '<div class="lmr-sous">' + v.leads_en_file + ' en file</div>' : '')
      + '</td>'
      + '<td class="lmr-num">' + lmrDelai(v.delai_moyen_min) + '</td>'
      + '<td class="lmr-num">' + lmrCellObj(v.commandes_realisees, v.objectif_commandes) + '</td>'
      + '</tr>';
  });
  h += '</tbody></table>';

  h += '<div class="lmf-note">Trié par leads en retard : ce qui brûle remonte. '
     + '<b>Contacts par jour</b> compte les actions SORTANTES du mois divisées par les jours '
     + 'ouvrés — comparable à l\'objectif, contrairement au compteur de contacts global qui '
     + 'inclut les entrants. Cliquez une ligne pour ouvrir la file du vendeur.</div>';
  return h;
}

// --- « MES SITES » : une ligne par SITE ----------------------
function renderVueSites() {
  ensureSites();
  if (!dataSites) {
    return '<div class="lm-empty" style="padding:34px;font-size:12px">'
         + '<span class="lm-spin"></span>Chargement des sites…</div>';
  }
  const rows = dataSites.slice().sort(function (a, b) {
    return (b.leads_en_retard || 0) - (a.leads_en_retard || 0);
  });
  if (!rows.length) {
    return '<div class="lm-empty" style="padding:34px;font-size:12px">'
      + 'Aucun site dans votre périmètre.</div>';
  }

  const fait = rows.reduce((a, r) => a + (Number(r.commandes_realisees) || 0), 0);
  const obj  = rows.reduce((a, r) => a + (Number(r.objectif_commandes) || 0), 0);
  const pct  = lmrTaux(fait, obj);

  let h = '<div class="lmf-bandeau"><span class="lmf-bandeau-n ' + (pct >= 100 ? 'ok' : '') + '">'
        + fait + '</span><span class="lmf-bandeau-txt">commandes sur un objectif de ' + obj
        + ' · ' + rows.length + ' site' + (rows.length > 1 ? 's' : '') + '</span></div>';

  h += '<table class="lmr-tbl"><thead><tr>'
     + '<th>Site</th>'
     + '<th class="lmr-num">Commandes</th>'
     + '<th class="lmr-num">Objectifs saisis</th>'
     + '<th class="lmr-num">Leads en retard</th>'
     + '<th class="lmr-num">Délai 1<sup>er</sup> contact</th>'
     + '<th class="lmr-num">Contacts / jour</th>'
     + '</tr></thead><tbody>';

  let incomplets = 0;
  rows.forEach(function (s) {
    if (s.objectifs_incomplets) incomplets++;
    h += '<tr class="lmr-clic" data-site="' + s.id_site + '">'
      + '<td><div class="lmr-nom">' + escapeHtml(s.nom_site || ('Site ' + s.id_site)) + '</div>'
      +     '<div class="lmr-sous">' + (s.cycles_ouverts || 0) + ' cycles ouverts</div></td>'
      + '<td class="lmr-num">' + lmrCellObj(s.commandes_realisees, s.objectif_commandes) + '</td>'
      + '<td class="lmr-num">' + (s.objectifs_incomplets
            ? '<span class="lmr-ko">' + s.vendeurs_avec_objectif + ' / ' + s.vendeurs + '</span>'
            : '<span class="lmr-sous">' + s.vendeurs_avec_objectif + ' / ' + s.vendeurs + '</span>')
      + '</td>'
      + '<td class="lmr-num">' + (s.leads_en_retard
            ? '<span class="lmr-' + (s.leads_en_retard > 5 ? 'ko' : 'warn') + '">' + s.leads_en_retard + '</span>'
            : '<span class="lmr-sous">—</span>') + '</td>'
      + '<td class="lmr-num">' + lmrDelai(s.delai_moyen_min) + '</td>'
      + '<td class="lmr-num">' + (s.contacts_par_jour_ouvre != null
            ? s.contacts_par_jour_ouvre : '<span class="lmr-sous">—</span>') + '</td>'
      + '</tr>';
  });
  h += '</tbody></table>';

  // Un objectif de site est une SOMME d'objectifs vendeurs : un site
  // incomplètement paramétré paraît moins ambitieux qu'il ne l'est.
  if (incomplets) {
    h += '<div class="lmr-alerte">' + incomplets + ' site' + (incomplets > 1 ? 's ont' : ' a')
      + ' des objectifs incomplets : tous leurs vendeurs n\'ont pas d\'objectif saisi. '
      + 'Leur objectif est donc une somme partielle — comparez-les avec cette réserve.</div>';
  }
  h += '<div class="lmf-note">Cliquez un site pour voir son équipe, puis un vendeur pour sa file, '
     + 'puis un lead pour le dossier.</div>';
  return h;
}

// ============================================================
//  REFONTE PAR RÔLE — le mur du temps, le fil de périmètre,
//  la bascule et l'écran campagnes.        (27/08/2026)
//
//  UNE SEULE SURFACE, PAS D'ONGLETS DE PREMIER NIVEAU.
//  Le périmètre est un FIL — marque › affaire › site › vendeur — repris
//  de performances.js. Il ne filtre pas seulement : il change CE QUE LES
//  LIGNES REPRÉSENTENT. Un directeur voit des marques, un chef des
//  vendeurs, un vendeur ses sources. Même objet, plusieurs échelles.
//
//  Trois lectures d'un même périmètre, en bascule :
//    « Où ça coince »      -> le mur du temps
//    « Ce que ça produit » -> le rapport croisé
//    « Campagnes »         -> avancement, résultat, classement
//  Libellés IDENTIQUES pour tous les rôles : ce sont les mêmes trois
//  questions, à des échelles différentes.
// ============================================================



// --- Tranches d'âge : l'axe du mur --------------------------
// Le premier seuil est le SLA le plus court (15 min) ; au-delà de 4 h,
// un lead de portail est mort.
const V2_TRANCHES = [
  { k:'t0', l:'< 15 min', max:15 },
  { k:'t1', l:'15 – 30',  max:30 },
  { k:'t2', l:'30 – 60',  max:60 },
  { k:'t3', l:'1 – 4 h',  max:240 },
  { k:'t4', l:'+ de 4 h', max:1e9 }
];
function v2Tranche(l) {
  const a = Number(l.attente_min) || 0;
  for (const t of V2_TRANCHES) if (a < t.max) return t.k;
  return 't4';
}

/* La couleur dit l'URGENCE, jamais le volume — celui-ci est porté par le
   diamètre. Un aplat saturé écrase la lecture : teinte claire, anneau fin. */
function v2Couleur(lst) {
  if (!lst.length) return null;
  const ko = lst.filter(l => lmfNiveau(l) === 'retard').length / lst.length;
  const wa = lst.filter(l => lmfNiveau(l) === 'bientot').length / lst.length;
  if (ko > .5)          return { bg:'#f7dcdc', fg:'#8f2222', ring:'#e0a3a3' };
  if (ko > 0 || wa > .3) return { bg:'#fbeecd', fg:'#8a6412', ring:'#e0c98a' };
  return { bg:'#daf0e9', fg:'#14614f', ring:'#9ed6c7' };
}

// --- Périmètre : l'état de navigation -----------------------
// v2.niveau : groupe | marque | affaire | site | vendeur
function v2Init() {
  if (state.v2) return;
  const p = PROFIL;
  state.v2 = { vue:'mur', niveau:'groupe', cle:'', sel:null, lead:null };
  if (p === 'vendeur')      { state.v2.niveau = 'vendeur'; state.v2.cle = userId; }
  else if (p === 'chef')    {
    const s = userSiteIds[0];
    if (s != null) { state.v2.niveau = 'site'; state.v2.cle = Number(s); }
  }
}

// Le référentiel des entités, construit depuis le périmètre réel.
let v2Ref = null;
function v2Referentiel() {
  if (v2Ref) return v2Ref;
  const sites = (dataSites || []).map(s => ({
    id: Number(s.id_site), l: s.nom_site,
    marque: s.reseau || '(Sans marque)', affaire: s.affaire || '(Sans affaire)',
    vendeurs: s.vendeurs, obj: Number(s.objectif_commandes) || 0,
    fait: Number(s.commandes_realisees) || 0, cycles: Number(s.cycles_ouverts) || 0,
    incomplet: !!s.objectifs_incomplets, retard: Number(s.leads_en_retard) || 0,
    delai: s.delai_moyen_min == null ? null : Number(s.delai_moyen_min),
    cj: s.contacts_par_jour_ouvre == null ? null : Number(s.contacts_par_jour_ouvre)
  }));
  const marques = [], affaires = [];
  sites.forEach(s => {
    if (!marques.some(m => m.k === s.marque)) marques.push({ k:s.marque, l:s.marque });
    if (!affaires.some(a => a.k === s.affaire)) affaires.push({ k:s.affaire, l:s.affaire, marque:s.marque });
  });
  v2Ref = { sites, marques, affaires };
  return v2Ref;
}

function v2Sites() {
  const R = v2Referentiel(), v = state.v2;
  if (v.niveau === 'vendeur') {
    const e = (dataEquipe || []).find(x => Number(x.id_user) === Number(v.cle));
    return R.sites.filter(s => e && Number(s.id) === Number(e.id_site));
  }
  if (v.niveau === 'site')    return R.sites.filter(s => s.id === Number(v.cle));
  if (v.niveau === 'affaire') return R.sites.filter(s => s.affaire === v.cle);
  if (v.niveau === 'marque')  return R.sites.filter(s => s.marque === v.cle);
  return R.sites;
}

function v2Leads() {
  const v = state.v2, rows = state.mafileData || [];
  if (v.niveau === 'vendeur') return rows.filter(l => Number(l.id_user_attribue) === Number(v.cle));
  const ids = new Set(v2Sites().map(s => s.id));
  return rows.filter(l => ids.has(Number(l.id_site)));
}

/* Les LIGNES du mur suivent la hiérarchie : chaque niveau montre ses
   ENFANTS. Seul le vendeur, qui n'en a pas, montre ses SOURCES. */
function v2Lignes() {
  const R = v2Referentiel(), v = state.v2;
  if (v.niveau === 'groupe') return R.marques.map(m => ({
    k:m.k, l:m.l, type:'marque',
    sous: R.sites.filter(s => s.marque === m.k).length + ' sites' }));
  if (v.niveau === 'marque') return R.affaires.filter(a => a.marque === v.cle).map(a => ({
    k:a.k, l:a.l, type:'affaire',
    sous: R.sites.filter(s => s.affaire === a.k).length + ' sites' }));
  if (v.niveau === 'affaire') return R.sites.filter(s => s.affaire === v.cle).map(s => ({
    k:s.id, l:s.l, type:'site', sous:(s.vendeurs || 0) + ' vendeurs' }));
  if (v.niveau === 'site') return (dataEquipe || [])
    .filter(e => Number(e.id_site) === Number(v.cle))
    .map(e => ({ k:Number(e.id_user), l:e.vendeur_nom, type:'vendeur',
      sous:(e.vn_vo || '—') + ' · ' + (e.contacts_par_jour_ouvre != null
        ? e.contacts_par_jour_ouvre + '/' + (e.objectif_contacts_jour || '?') + ' contacts/j' : '') }));
  const par = {};
  v2Leads().forEach(l => { const s = l.source_libelle || l.source || '?';
    par[s] = (par[s] || 0) + 1; });
  return Object.keys(par).map(s => ({ k:s, l:s, type:'source', sous:par[s] + ' leads' }));
}

function v2LeadsDe(ln) {
  const base = v2Leads(), R = v2Referentiel();
  if (ln.type === 'marque') {
    const i = new Set(R.sites.filter(s => s.marque === ln.k).map(s => s.id));
    return base.filter(l => i.has(Number(l.id_site)));
  }
  if (ln.type === 'affaire') {
    const i = new Set(R.sites.filter(s => s.affaire === ln.k).map(s => s.id));
    return base.filter(l => i.has(Number(l.id_site)));
  }
  if (ln.type === 'site')    return base.filter(l => Number(l.id_site) === Number(ln.k));
  if (ln.type === 'vendeur') return base.filter(l => Number(l.id_user_attribue) === Number(ln.k));
  return base.filter(l => (l.source_libelle || l.source) === ln.k);
}

// --- Le fil de périmètre ------------------------------------
function v2Fil() {
  const R = v2Referentiel(), v = state.v2, p = [];
  let site = null;
  if (v.niveau === 'site')    site = R.sites.find(s => s.id === Number(v.cle));
  if (v.niveau === 'vendeur') {
    const e = (dataEquipe || []).find(x => Number(x.id_user) === Number(v.cle));
    if (e) site = R.sites.find(s => s.id === Number(e.id_site));
  }
  const aff = site ? R.affaires.find(a => a.k === site.affaire)
            : v.niveau === 'affaire' ? R.affaires.find(a => a.k === v.cle) : null;
  const mq  = aff ? R.marques.find(m => m.k === aff.marque)
            : v.niveau === 'marque' ? R.marques.find(m => m.k === v.cle) : null;

  p.push({ l:'Tout mon périmètre', n:'groupe', k:'', a:v.niveau !== 'groupe' });
  if (mq)   p.push({ l:mq.l,   n:'marque',  k:mq.k,   a:v.niveau !== 'marque' });
  if (aff)  p.push({ l:aff.l,  n:'affaire', k:aff.k,  a:v.niveau !== 'affaire' });
  if (site) p.push({ l:site.l, n:'site',    k:site.id, a:v.niveau !== 'site' });
  if (v.niveau === 'vendeur') {
    const e = (dataEquipe || []).find(x => Number(x.id_user) === Number(v.cle));
    p.push({ l:(e && e.vendeur_nom) || ('Vendeur ' + v.cle), n:'vendeur', k:v.cle, a:false });
  }

  let h = '<div class="v2-fil"><span class="v2-fil-l">Périmètre</span>';
  h += p.map(x => x.a
    ? '<button type="button" data-v2niv="' + x.n + '" data-v2cle="' + escapeHtml(String(x.k)) + '">'
      + escapeHtml(x.l) + '</button>'
    : '<span class="v2-ici">' + escapeHtml(x.l) + '</span>').join('<span class="v2-sep">›</span>');
  // Le sélecteur de dates est CELUI DU MODULE (state.period, calendrier
  // deux clics) : une seule mécanique de période dans toute la page.
  h += '<span class="v2-per">' + renderPeriodBar() + '</span>';
  h += '</div>';
  return h;
}

// --- Le bandeau : une phrase, pas quatre cartes -------------
function v2Bandeau() {
  const L = v2Leads();
  const ko = L.filter(l => lmfNiveau(l) === 'retard').length;
  const wa = L.filter(l => lmfNiveau(l) === 'bientot').length;
  if (!L.length) return '<div class="v2-tete"><span class="q">Aucun lead en attente '
    + 'sur ce périmètre.</span></div>';
  if (!ko) return '<div class="v2-tete"><b class="ok">' + L.length + '</b> '
    + '<span class="q">leads en cours, aucun hors délai. Le périmètre est à jour.</span></div>';
  const pire = Math.max.apply(null, L.map(l => Number(l.attente_min) || 0));
  return '<div class="v2-tete"><b class="ko">' + ko + '</b> <span class="q">leads ont dépassé '
    + 'leur délai de réponse' + (wa ? ', ' + wa + ' sont sur le fil' : '')
    + '. Le plus ancien attend depuis <b class="ko" style="font-size:16px">' + lmfDuree(pire)
    + '</b>.</span></div>';
}

// --- LE MUR DU TEMPS ----------------------------------------
function v2Mur() {
  const lignes = v2Lignes();
  if (!lignes.length) return '<div class="lm-empty" style="padding:34px;font-size:12px">'
    + 'Aucune entité sur ce périmètre.</div>';
  // Un mur sans une seule pastille n'est pas un écran cassé : c'est un
  // périmètre sans lead en attente. Il doit le DIRE — un vide muet passe
  // pour un bug, et c'est exactement ce qui vient d'arriver.
  if (!v2Leads().length) {
    const n = (dataSites || []).length;
    return '<div class="lm-empty" style="padding:34px 26px;font-size:13px;line-height:1.6">'
      + '<b style="display:block;color:var(--text);margin-bottom:6px">Aucun lead en attente '
      + 'sur ce périmètre</b>'
      + '<span style="font-size:12px;color:var(--text-mut)">'
      + n + ' site' + (n > 1 ? 's' : '') + ' dans votre périmètre, mais aucun lead reçu et non '
      + 'encore contacté. Les leads déjà traités ne figurent pas ici — voyez '
      + '« Ce que ça produit » pour les volumes de la période.</span></div>';
  }
  const libCol = { groupe:'Marque', marque:'Affaire', affaire:'Site', site:'Vendeur' }[state.v2.niveau]
              || 'Source';
  const g = 'grid-template-columns:minmax(150px,1.5fr) repeat(' + V2_TRANCHES.length + ',1fr)';
  let h = '<div class="v2-mur"><div class="v2-mur-h" style="' + g + '"><div>' + libCol + '</div>'
        + V2_TRANCHES.map(t => '<div>' + t.l + '</div>').join('') + '</div>';
  lignes.forEach(ln => {
    const L = v2LeadsDe(ln);
    h += '<div class="v2-mur-r" style="' + g + '">';
    h += '<div class="v2-mur-n" data-v2ligne="' + escapeHtml(String(ln.k)) + '" '
       + 'data-v2type="' + ln.type + '"><b>' + escapeHtml(ln.l || '—') + '</b>'
       + '<i>' + escapeHtml(ln.sous || '') + '</i></div>';
    V2_TRANCHES.forEach(t => {
      const lst = L.filter(l => v2Tranche(l) === t.k);
      if (!lst.length) { h += '<div class="v2-cell vide"></div>'; return; }
      const c = v2Couleur(lst);
      // Diamètre : RACINE du volume. L'œil compare des surfaces, donc
      // 9 leads ne doivent pas faire neuf fois la taille de 1.
      const d = Math.round(20 + Math.sqrt(lst.length) * 7);
      h += '<div class="v2-cell" data-v2cell="' + escapeHtml(String(ln.k)) + '|' + t.k + '">'
        + '<span class="v2-pas" style="width:' + d + 'px;height:' + d + 'px;background:' + c.bg
        + ';color:' + c.fg + ';box-shadow:inset 0 0 0 1.5px ' + c.ring + '">' + lst.length
        + '</span></div>';
    });
    h += '</div>';
  });
  h += '</div>';
  h += '<div class="v2-leg">'
    + '<span><i style="background:#daf0e9;box-shadow:inset 0 0 0 1.5px #9ed6c7"></i>dans les temps</span>'
    + '<span><i style="background:#fbeecd;box-shadow:inset 0 0 0 1.5px #e0c98a"></i>sur le fil</span>'
    + '<span><i style="background:#f7dcdc;box-shadow:inset 0 0 0 1.5px #e0a3a3"></i>délai dépassé</span>'
    + '<span style="margin-left:auto;color:#c3cfdd">Chaque colonne est un ÂGE, pas un statut. '
    + 'Le diamètre porte le volume, la teinte l\'urgence.</span></div>';
  return h;
}

// --- CE QUI FAIT PRODUIRE : réactivité et conversion --------
//
// Le tableau croisé dit QUI produit quoi. Ce bloc dit QU'EST-CE QUI
// FAIT produire. C'est la même question à deux profondeurs — d'où un
// enrichissement du même onglet plutôt qu'un quatrième, qui obligerait
// à l'aller-retour pour comprendre.
//
// ⚠️ La mesure porte sur les SOLLICITATIONS, pas sur les leads :
//    `premier_contact_le` est vide sur tous les leads (aucun n'a encore
//    été contacté depuis le modèle du 27/08). La mécanique est
//    identique, seule la source change — elle basculera d'elle-même.

let dataReactivite = null, dataDelaiSource = null;
let reacKey = null, reacEnCours = null;

function ensureReactivite() {
  const ids = v2Sites().map(s => s.id).sort();
  const V = state.v2 || {};
  // La clé porte le NIVEAU : descendre sur un vendeur doit recharger.
  const key = [state.period.from, state.period.to, ids.join(','),
               V.niveau, V.cle].join('|');
  if (reacKey === key && dataReactivite) return Promise.resolve();
  if (reacEnCours) return reacEnCours;
  reacKey = key;
  reacEnCours = (async function () {
    try {
      const [r, s] = await Promise.all([
        sb.rpc('get_lead_reactivite', {
          p_viewer_id_user: Number(userId),
          p_date_from: state.period.from, p_date_to: state.period.to,
          p_site_ids: ids.length ? ids : null }),
        sb.rpc('get_lead_delai_par_source', {
          p_viewer_id_user: Number(userId),
          p_date_from: state.period.from, p_date_to: state.period.to,
          p_site_ids: ids.length ? ids : null,
          // ⚠️ Sans ce paramètre, l'écran d'un vendeur affichait les
          //    leads de toute l'équipe à côté d'un tableau filtré sur
          //    lui : 16 contre 9 sur La Centrale.
          p_id_user: (state.v2 && state.v2.niveau === 'vendeur')
            ? Number(state.v2.cle) : null })
      ]);
      if (r.error) throw r.error;
      dataReactivite  = r.data || [];
      dataDelaiSource = (s && !s.error) ? (s.data || []) : [];
    } catch (e) {
      console.error('[leadMgmt] réactivité', e);
      dataReactivite = []; dataDelaiSource = [];
    } finally {
      reacEnCours = null;
      if (window.__renderLeadMgmt) window.__renderLeadMgmt();
    }
  })();
  return reacEnCours;
}

function v2Reactivite() {
  if (!dataReactivite) return '<div class="v2-flux" style="margin-bottom:14px">'
    + '<div class="lm-empty" style="padding:18px;font-size:12px">'
    + '<span class="lm-spin"></span>Analyse des délais…</div></div>';
  const R = dataReactivite;
  if (!R.length) return '';
  const n = x => Number(x) || 0;

  const tot = R.reduce((a, x) => a + n(x.nb_dossiers), 0);
  const maxT = Math.max.apply(null, R.map(x => n(x.taux_conversion)));

  // Le manque à gagner : un directeur agit sur des voitures, pas sur
  // des points de pourcentage.
  const lent = R[R.length - 1];
  const rapide = R.filter(x => n(x.ordre) <= 2);
  const nRap = rapide.reduce((a, x) => a + n(x.nb_dossiers), 0);
  const cRap = rapide.reduce((a, x) => a + n(x.nb_commandes), 0);
  const txRap = nRap ? (cRap / nRap * 100) : null;
  const txLent = lent ? n(lent.taux_conversion) : null;
  const ecart = (txRap != null && txLent != null) ? (txRap - txLent) : null;
  const manque = (ecart != null && ecart > 0)
    ? Math.round(n(lent.nb_dossiers) * ecart / 100) : 0;
  const partRap = tot ? Math.round(nRap / tot * 100) : 0;

  // UN ESCALIER, pas quatre barres empilées : chaque palier est une
  // colonne, la hauteur porte le taux. On voit la marche descendre —
  // c'est exactement le propos, et quatre barres horizontales le
  // noyaient (« touffu », 27/08).
  let h = '<div class="v2-esc-w"><div class="v2-flux-t">'
    + '<h3>Ce qui fait produire · délai avant premier contact</h3>'
    + '<div style="font-size:11px;color:var(--text-mut)">' + tot + ' dossiers</div></div>';
  h += '<div class="v2-esc">';
  R.forEach(x => {
    const t2 = n(x.taux_conversion), d2 = n(x.nb_dossiers);
    const hh = maxT ? Math.max(8, Math.round(t2 / maxT * 100)) : 8;
    const best = t2 >= maxT - 0.01;
    h += '<div class="v2-esc-c">'
      + '<div class="v2-esc-v' + (best ? ' best' : '') + '">' + t2 + ' %</div>'
      + '<div class="v2-esc-b"><i class="' + (best ? 'best' : '')
        + '" style="height:' + hh + '%"></i></div>'
      + '<div class="v2-esc-l">' + escapeHtml(x.palier) + '</div>'
      + '<div class="v2-esc-n">' + d2 + ' dossiers · ' + n(x.part_dossiers) + ' %</div>'
      + '</div>';
  });
  h += '</div>';

  if (ecart != null && ecart > 1) {
    h += '<div class="v2-esc-note"><b>Les dossiers repris rapidement convertissent '
      + Math.round(ecart) + ' points de plus.</b> '
      + (manque ? 'Sur les ' + n(lent.nb_dossiers) + ' repris au-delà de 48 h, l\'écart '
          + 'représente environ <b class="v2-ko">' + manque + ' commandes</b>. ' : '')
      + 'Aujourd\'hui <b>' + partRap + ' %</b> sont repris en moins de 12 h.'
      // Sans cette réserve, l'écran promet une causalité que la donnée
      // ne démontre pas.
      + '<div class="v2-esc-res">Corrélation, pas causalité : un dossier repris vite peut aussi '
      + 'être un dossier plus chaud au départ. La tendance est nette, la promesse « rappelez plus '
      + 'vite et vous gagnerez ' + Math.round(ecart) + ' points » ne le serait pas.</div></div>';
  }
  h += '</div>';

  // L'attente par source, en tableau court : le canal ou l'équipe ?
  const S = (dataDelaiSource || []).filter(x => n(x.nb_en_attente) > 0);
  if (S.length) {
    h += '<div class="v2-rep" style="margin-bottom:14px"><table><thead><tr>'
      + '<th>Source</th><th>En attente</th><th>En retard</th><th>SLA</th>'
      + '<th>Attente médiane</th></tr></thead><tbody>';
    const TS = { a:0, r:0 };
    S.forEach(x => {
      const att = n(x.attente_med_min), sla = n(x.sla_minutes);
      const ko = sla && att > sla;
      TS.a += n(x.nb_en_attente); TS.r += n(x.nb_en_retard);
      // Les chiffres de leads sont CLIQUABLES : ils ouvrent la liste,
      // comme une pastille du mur. Un compteur qu'on ne peut pas ouvrir
      // désigne un problème sans donner prise dessus.
      h += '<tr><td><b>' + escapeHtml(x.source_libelle || x.source) + '</b></td>'
        + '<td><button type="button" class="v2-lien" data-v2src="' + escapeHtml(x.source)
          + '" data-v2filtre="attente">' + n(x.nb_en_attente) + '</button></td>'
        + '<td>' + (n(x.nb_en_retard)
            ? '<button type="button" class="v2-lien v2-ko" data-v2src="' + escapeHtml(x.source)
              + '" data-v2filtre="retard">' + x.nb_en_retard + '</button>'
            : '<span class="v2-sous">—</span>') + '</td>'
        + '<td class="v2-sous">' + (sla ? sla + ' min' : '—') + '</td>'
        + '<td><span class="' + (ko ? 'v2-ko' : 'v2-ok') + '">' + lmfDuree(att) + '</span></td>'
        + '</tr>';
    });
    h += '</tbody><tfoot><tr><td>Total · ' + S.length + ' sources</td>'
      + '<td>' + TS.a + '</td>'
      + '<td' + (TS.r ? ' class="v2-ko"' : '') + '>' + TS.r + '</td>'
      + '<td>—</td><td>—</td></tr></tfoot></table></div>'
      + '<div class="lmf-note" style="margin:-6px 0 14px">Deux sources au même SLA avec des '
      + 'attentes très différentes désignent l\'organisation, pas l\'apporteur.</div>';
  }
  return h;
}

// --- Le détail au clic, SANS quitter la vue d'ensemble ------
//
// Une cellule du mur était cliquable en apparence mais n'écoutait rien :
// le panneau n'avait pas été porté (relevé par Antoine le 27/08). Sans
// lui, le mur montre où ça coince sans jamais dire QUI — il désigne un
// problème sans donner prise dessus.

function v2Panneau() {
  const V = state.v2;
  if (!V || !V.sel) return '';
  const L = V.sel.leads || [];
  let h = '<div class="v2-pan"><div class="v2-pan-h"><div><b>'
    + escapeHtml(V.sel.titre) + '</b><div class="v2-pan-n">' + L.length + ' dossier'
    + (L.length > 1 ? 's' : '') + '</div></div>'
    + '<button type="button" class="v2-x" data-v2fermer="1">×</button></div>'
    + '<div class="v2-pan-b">';
  if (!L.length) {
    h += '<div style="padding:20px;text-align:center;color:var(--text-mut);font-size:12px">'
      + 'Aucun dossier dans cette tranche.</div>';
  }
  L.forEach(l => {
    const n = lmfNiveau(l);
    const r = lmfReste(l);
    const cls = n === 'retard' ? 'ko' : n === 'bientot' ? 'warn' : 'ok';
    const tps = (r == null) ? 'traité' : (r < 0 ? '+ ' + lmfDuree(-r) : lmfDuree(r));
    h += '<div class="v2-lead ' + cls + '"'
      + (l.id_client ? ' data-v2client="' + l.id_client + '"' : '') + '>'
      + '<div class="v2-lead-h"><b>' + escapeHtml(l.nom_affiche || 'Sans nom') + '</b>'
      + '<em class="' + cls + '">' + tps + '</em></div>'
      + '<div class="v2-lead-m"><span class="v2-tag">'
      + escapeHtml(l.source_libelle || l.source || '?') + '</span> '
      + escapeHtml(l.vehicule_interet || '') + '</div>';
    if (PEUT_REAFFECTER) {
      h += '<button type="button" class="v2-reaff" data-v2reaff="' + l.id_lead + '">'
        + 'Réaffecter</button>';
    }
    h += '</div>';
  });
  h += '</div></div>';
  return h;
}

// --- LE RAPPORT CROISÉ --------------------------------------
// Le mur montre OÙ ça coince maintenant ; le rapport montre CE QUE ça
// produit. Même périmètre, d'où une bascule et non un onglet.
function v2Rapport() {
  ensureReactivite();
  const lignes = v2Lignes();
  if (!lignes.length) return '<div class="lm-empty" style="padding:34px 26px;font-size:13px">'
    + '<b style="display:block;color:var(--text);margin-bottom:6px">Rien à croiser</b>'
    + '<span style="font-size:12px;color:var(--text-mut)">Aucune entité sous ce niveau. '
    + 'Remontez dans le fil de périmètre.</span></div>';
  const R = v2Referentiel();
  const libCol = { groupe:'Marque', marque:'Affaire', affaire:'Site', site:'Vendeur' }[state.v2.niveau]
              || 'Source';
  const camp = dataCampagnes || [];

  // Les enseignements D'ABORD : quatre barres qui expliquent, puis le
  // tableau qui détaille. L'inverse obligerait à lire 12 lignes avant de
  // comprendre ce qui compte.
  // Au niveau SOURCE, quatre colonnes n'ont pas de sens : on ne les
  // affiche pas plutôt que de les remplir de tirets.
  const parSource = (state.v2.niveau === 'vendeur');
  let h = v2Reactivite();
  h += '<div class="v2-rep"><table><thead><tr>'
    + '<th>' + libCol + '</th><th>Leads reçus</th><th>En retard</th><th>Attente moyenne</th>'
    + (parSource ? ''
       : '<th>Sollicitations</th><th>À relancer</th><th>Commandes</th><th>Conversion</th>')
    + '</tr></thead><tbody>';
  const T = { l:0, r:0, s:0, ar:0, c:0, o:0 };

  lignes.forEach(ln => {
    const L = v2LeadsDe(ln);
    const r = L.filter(x => lmfNiveau(x) === 'retard').length;
    const dl = L.length
      ? Math.round(L.reduce((a, x) => a + (Number(x.attente_min) || 0), 0) / L.length) : null;

    let ss = [];
    if (ln.type === 'marque')       ss = R.sites.filter(s => s.marque === ln.k);
    else if (ln.type === 'affaire') ss = R.sites.filter(s => s.affaire === ln.k);
    else if (ln.type === 'site')    ss = R.sites.filter(s => s.id === Number(ln.k));

    // Au niveau SOURCE (vue vendeur), il n'existe ni objectif ni
    // sollicitation rattachés : on laisse les colonnes vides plutôt que
    // d'afficher des zéros qui passeraient pour des résultats.
    if (ln.type === 'source') {
      // ⚠️ Les colonnes sollicitations / à relancer / commandes /
      //    conversion n'existent PAS au niveau source : une campagne se
      //    rattache à un vendeur, pas à un apporteur. Elles étaient
      //    remplies de tirets — le tableau est donc RÉDUIT à ce qui a
      //    du sens (voir l'en-tête, qui s'adapte).
      h += '<tr><td><b>' + escapeHtml(ln.l) + '</b><div class="v2-sous">'
        + escapeHtml(ln.sous) + '</div></td>'
        + '<td>' + (L.length
            ? '<button type="button" class="v2-lien" data-v2src="' + escapeHtml(String(ln.k))
              + '" data-v2filtre="attente">' + L.length + '</button>'
            : '<span class="v2-sous">—</span>') + '</td>'
        + '<td>' + (r
            ? '<button type="button" class="v2-lien v2-ko" data-v2src="' + escapeHtml(String(ln.k))
              + '" data-v2filtre="retard">' + r + '</button>'
            : '<span class="v2-sous">—</span>') + '</td>'
        + '<td>' + (dl == null ? '<span class="v2-sous">—</span>'
            : '<span class="v2-' + (dl > 60 ? 'ko' : dl > 25 ? 'warn' : 'ok') + '">'
              + lmfDuree(dl) + '</span>') + '</td></tr>';
      T.l += L.length; T.r += r;
      return;
    }

    const ids = ss.map(s => s.id);
    let so = 0, tr = 0;
    (dataCampParVendeur || []).forEach(v => {
      if (ln.type === 'vendeur' ? Number(v.id_user) === Number(ln.k)
                                : ids.indexOf(Number(v.id_site)) >= 0) {
        so += Number(v.nb_cibles) || 0; tr += Number(v.nb_traitees) || 0;
      }
    });
    const ar = so - tr;

    let cmd = 0, obj = 0;
    if (ln.type === 'vendeur') {
      const e = (dataEquipe || []).find(x => Number(x.id_user) === Number(ln.k)) || {};
      cmd = Number(e.commandes_realisees) || 0; obj = Number(e.objectif_commandes) || 0;
    } else {
      ss.forEach(s => { cmd += s.fait; obj += s.obj; });
    }
    // La conversion rapporte les commandes à TOUT ce qui a été mis
    // devant le vendeur — leads ET sollicitations. C'est le seul
    // dénominateur qui ne flatte personne.
    const cv = (L.length + so) ? Math.round(cmd / (L.length + so) * 100) : null;
    T.l += L.length; T.r += r; T.s += so; T.ar += ar; T.c += cmd; T.o += obj;

    h += '<tr data-v2ligne="' + escapeHtml(String(ln.k)) + '" data-v2type="' + ln.type + '">'
      + '<td><b>' + escapeHtml(ln.l || '—') + '</b><div class="v2-sous">'
        + escapeHtml(ln.sous || '') + '</div></td>'
      + '<td>' + (L.length || '<span class="v2-sous">—</span>') + '</td>'
      + '<td>' + (r ? '<span class="v2-ko">' + r + '</span>' : '<span class="v2-sous">—</span>') + '</td>'
      + '<td>' + (dl == null ? '<span class="v2-sous">—</span>'
          : '<span class="v2-' + (dl > 60 ? 'ko' : dl > 25 ? 'warn' : 'ok') + '">'
            + lmfDuree(dl) + '</span>') + '</td>'
      + '<td>' + (so || '<span class="v2-sous">—</span>') + '</td>'
      + '<td>' + (ar ? '<span class="v2-' + (ar > 20 ? 'ko' : 'warn') + '">' + ar + '</span>'
          : '<span class="v2-sous">—</span>') + '</td>'
      + '<td>' + cmd + '<span class="v2-sous"> / ' + obj + '</span></td>'
      + '<td>' + (cv == null ? '<span class="v2-sous">—</span>'
          : '<span class="v2-' + (cv >= 40 ? 'ok' : cv >= 25 ? 'warn' : 'ko') + '">'
            + cv + ' %</span>') + '</td></tr>';
  });

  const cvT = (T.l + T.s) ? Math.round(T.c / (T.l + T.s) * 100) : 0;
  h += '</tbody><tfoot><tr><td>Total</td><td>' + T.l + '</td>'
    + '<td' + (T.r ? ' class="v2-ko"' : '') + '>' + T.r + '</td><td>—</td>'
    + (parSource ? ''
       : '<td>' + T.s + '</td><td' + (T.ar ? ' class="v2-ko"' : '') + '>' + T.ar + '</td>'
         + '<td>' + T.c + '<span class="v2-sous"> / ' + T.o + '</span></td>'
         + '<td>' + cvT + ' %</td>')
    + '</tr></tfoot></table></div>';
  h += '<div class="lmf-note">La <b>conversion</b> rapporte les commandes à TOUT ce qui a été mis '
    + 'devant le vendeur — leads entrants ET sollicitations sortantes. C\'est le seul dénominateur '
    + 'qui ne flatte personne : traiter peu de sollicitations remonte artificiellement un taux '
    + 'calculé sur les seuls leads. Cliquez une ligne pour descendre.</div>';
  return h;
}

// --- LES CAMPAGNES : deux tableaux par ligne ----------------
function v2Campagnes() {
  ensureCampagnes();
  if (!dataCampagnes) return '<div class="lm-empty" style="padding:34px;font-size:12px">'
    + '<span class="lm-spin"></span>Chargement des campagnes…</div>';
  const camp = dataCampagnes || [];
  if (!camp.length) return '<div class="lm-empty" style="padding:34px 26px;font-size:13px">'
    + '<b style="display:block;color:var(--text);margin-bottom:6px">Aucune campagne</b>'
    + '<span style="font-size:12px;color:var(--text-mut)">Rien sur ce périmètre et cette '
    + 'période. Élargissez le fil ou la période.</span></div>';

  const ids = v2Sites().map(s => s.id);
  const parV = (dataCampParVendeur || []).filter(v => ids.indexOf(Number(v.id_site)) >= 0);
  const n = x => Number(x) || 0;
  const pc = (a, b) => b ? Math.round(a / b * 100) : 0;
  const cls = p => p >= 90 ? 'v2-ok' : p >= 70 ? 'v2-warn' : 'v2-ko';

  // UN TABLEAU, pas une pile de barres empilées : dix campagnes en
  // barres font une page illisible (« touffu », 27/08). Un tableau
  // aligne les colonnes, l'œil descend au lieu de chercher.
  // La seule barre conservée est une MICRO-JAUGE dans la colonne
  // « traitées » — la seule où la proportion se lit mieux qu'un chiffre.
  let h = '<div class="v2-rep"><table><thead><tr>'
    + '<th>Campagne</th><th>Sollicitations</th><th>Traitées</th><th>À traiter</th>'
    + '<th>Propales</th><th>BDC</th><th>Commandes</th><th>Conversion</th>'
    + '<th>1<sup>er</sup> contact</th></tr></thead><tbody>';

  const T = { s:0, t:0, a:0, p:0, b:0, w:0 };
  camp.forEach(c => {
    const s = n(c.nb_sollicitations), tr = n(c.nb_traitees), at = n(c.nb_a_traiter);
    const cy = n(c.nb_cycles) || 1;
    const pr = n(c.nb_propales), bd = n(c.nb_bdc), wi = n(c.nb_wins);
    const pt = pc(tr, s), cv = pc(wi, cy);
    T.s += s; T.t += tr; T.a += at; T.p += pr; T.b += bd; T.w += wi;
    h += '<tr><td><b>' + escapeHtml(c.campagne) + '</b></td>'
      + '<td>' + s + '</td>'
      + '<td><span class="' + cls(pt) + '">' + pt + ' %</span>'
      + '<div class="v2-mini"><i class="' + cls(pt) + '" style="width:' + pt + '%"></i></div></td>'
      + '<td>' + (at ? '<span class="v2-ko">' + at + '</span>' : '<span class="v2-sous">—</span>') + '</td>'
      + '<td>' + (pr || '<span class="v2-sous">—</span>') + '</td>'
      + '<td>' + (bd || '<span class="v2-sous">—</span>') + '</td>'
      + '<td>' + (wi || '<span class="v2-sous">—</span>') + '</td>'
      + '<td><span class="' + (cv >= 40 ? 'v2-ok' : cv >= 25 ? 'v2-warn' : 'v2-ko') + '">'
        + cv + ' %</span></td>'
      + '<td>' + (c.delai_median_h != null
          ? '<span class="v2-sous">' + Math.round(c.delai_median_h) + ' h</span>'
          : '<span class="v2-sous">—</span>') + '</td></tr>';
  });
  const ptT = pc(T.t, T.s), cvT = pc(T.w, T.s);
  h += '</tbody><tfoot><tr><td>Total · ' + camp.length + ' campagnes</td>'
    + '<td>' + T.s + '</td>'
    + '<td><span class="' + cls(ptT) + '">' + ptT + ' %</span></td>'
    + '<td' + (T.a ? ' class="v2-ko"' : '') + '>' + T.a + '</td>'
    + '<td>' + T.p + '</td><td>' + T.b + '</td><td>' + T.w + '</td>'
    + '<td>' + cvT + ' %</td><td>—</td></tr></tfoot></table></div>';

  // Le classement des vendeurs, même forme : un tableau court, trié.
  if (parV.length) {
    const sv = parV.slice().sort((a, b) => n(b.taux_traite) - n(a.taux_traite)
                                        || n(b.nb_cibles) - n(a.nb_cibles));
    h += '<div style="margin-top:14px" class="v2-rep"><table><thead><tr>'
      + '<th>Vendeur</th><th>Site</th><th>Sollicitations</th><th>Traitées</th>'
      + '<th>À relancer</th></tr></thead><tbody>';
    sv.forEach((v, i) => {
      const ci = n(v.nb_cibles), tr = n(v.nb_traitees), ar = n(v.nb_a_traiter);
      const pt = pc(tr, ci);
      h += '<tr data-v2vend="' + v.id_user + '">'
        + '<td><b>' + (i + 1) + '. ' + escapeHtml(v.vendeur_nom || '—') + '</b></td>'
        + '<td class="v2-sous" style="text-align:left">' + escapeHtml(v.nom_site || '') + '</td>'
        + '<td>' + ci + '</td>'
        + '<td><span class="' + cls(pt) + '">' + pt + ' %</span>'
        + '<div class="v2-mini"><i class="' + cls(pt) + '" style="width:' + pt + '%"></i></div></td>'
        + '<td>' + (ar ? '<span class="v2-ko">' + ar + '</span>'
            : '<span class="v2-sous">—</span>') + '</td></tr>';
    });
    h += '</tbody></table></div>';
  }

  h += '<div class="lmf-note">L\'avancement précède le résultat : une campagne dont 40 % des '
    + 'cibles ne sont pas traitées n\'a pas un mauvais taux de conversion, elle a un <b>retard '
    + 'de traitement</b>. Les étapes sont cumulées — un dossier gagné est passé par la propale '
    + 'et le bon de commande. Cliquez un vendeur pour ouvrir sa file.</div>';
  return h;
}

// --- Chargement des campagnes -------------------------------
let dataCampagnes = null, dataCampParVendeur = null;
let campKey = null, campEnCours = null;

function ensureCampagnes() {
  // La clé porte le PÉRIMÈTRE autant que la période : descendre dans le
  // fil doit recharger des totaux bornés à la sélection, pas afficher
  // ceux de tout le périmètre du viewer.
  const ids = v2Sites().map(s => s.id).sort();
  const key = [state.period.from, state.period.to, ids.join(',')].join('|');
  if (campKey === key && dataCampagnes) return Promise.resolve();
  if (campEnCours) return campEnCours;
  campKey = key;
  campEnCours = (async function () {
    try {
      const [c, v] = await Promise.all([
        sb.rpc('get_campagnes_sollicitation', {
          p_viewer_id_user: Number(userId),
          p_date_from: state.period.from, p_date_to: state.period.to,
          p_site_ids: ids.length ? ids : null }),
        sb.rpc('get_campagnes_par_vendeur', {
          p_viewer_id_user: Number(userId),
          p_date_from: state.period.from, p_date_to: state.period.to,
          p_campagne: null, p_site_ids: ids.length ? ids : null })
      ]);
      if (c.error) throw c.error;
      if (v.error) throw v.error;
      dataCampagnes = c.data || [];
      dataCampParVendeur = v.data || [];
    } catch (e) {
      console.error('[leadMgmt] campagnes', e);
      dataCampagnes = []; dataCampParVendeur = [];
    } finally {
      campEnCours = null;
      if (window.__renderLeadMgmt) window.__renderLeadMgmt();
    }
  })();
  return campEnCours;
}

// File d'un vendeur atteint par la descente. Le manager la lit, et peut
// réaffecter depuis chaque carte.
function renderFileDe(idVendeur) {
  if (state.mafileCible !== idVendeur) {
    state.mafileCible = idVendeur;
    state.mafileKey = null;
    state.mafileData = null;
    fetchMaFile();
  }
  return renderViewMaFile();
}

// Les cycles : liste ou kanban. Le pipeline n'est PAS un ensemble
// distinct — ce sont les mêmes cycles rangés par avancement.
function renderSectionCycles() {
  ensureCycles(cibleCourante());
  const vue = state.vueCycles || 'liste';
  let h = '<div class="lm-subtoggle">'
    + '<button type="button" class="lm-subtoggle-btn' + (vue === 'liste' ? ' active' : '')
    + '" data-cyc="liste">Liste</button>'
    + '<button type="button" class="lm-subtoggle-btn' + (vue === 'kanban' ? ' active' : '')
    + '" data-cyc="kanban">Kanban</button></div>';
  if (state.cyclesLoading && !dataActifs.length) return h + lmAttenteCycles('des cycles');
  h += (vue === 'kanban') ? renderViewKanban() : renderViewActifs();
  return h;
}

function lmAttenteKpi() {
  return '<div class="lm-empty" style="padding:34px;font-size:12px;color:var(--text-mut)">'
       + 'Chargement des indicateurs…</div>';
}

// Chaque section ne charge QUE ce qu'elle lit. Un onglet ne doit jamais
// payer pour les autres (acquis du 27/08).
// Nom de la section courante, dans le vocabulaire du socle par rôle.
// Les anciennes comparaisons `state.section === 'synthese'` visaient des
// sections qui N'EXISTENT PLUS : elles doivent passer par ici.
function sectionEst(nom) {
  return SECTIONS_ROLE[state.sectionIdx || 0] === nom;
}

// Chaque vue ne charge QUE ce qu'elle lit. Le périmètre et l'équipe
// servent au mur comme au rapport ; les campagnes ont leurs propres RPC,
// bornées par state.period.
function chargerSection() {
  ensureSites();
  const V = state.v2 || {};
  if (V.vue === 'campagnes') { ensureCampagnes(); return; }
  if (V.vue === 'rapport') ensureReactivite();
  // ⚠️ Le mur et le rapport lisent les leads de TOUT le périmètre : un
  //    manager doit voir ceux de ses vendeurs, pas seulement les siens.
  state.mafileCible = (PROFIL === 'vendeur') ? userId : null;
  fetchMaFile();
  ensureEquipe(V.niveau === 'site' ? Number(V.cle) : null);
}

function renderAll() {
  const __tDebutRender = performance.now();
  let html = '';

  // ⚠️ La secrétaire commerciale n'a pas de lead management (27/08).
  if (!SECTIONS_ROLE.length) {
    root.innerHTML = '<div class="lm-empty" style="padding:40px;font-size:13px">'
      + 'Le lead management n\'est pas ouvert à votre profil.</div>';
    return;
  }

  v2Init();
  const V = state.v2;

  // Le périmètre s'appuie sur les sites : sans eux, rien à afficher.
  if (!dataSites) {
    ensureSites();
    root.innerHTML = '<div class="lm-empty" style="padding:40px;font-size:12px">'
      + '<span class="lm-spin"></span>Chargement du périmètre…</div>';
    return;
  }

  html += v2Fil();

  // Trois lectures d'un même périmètre. Libellés IDENTIQUES pour tous
  // les rôles : ce sont les mêmes questions, à des échelles différentes.
  html += '<div class="v2-vues">'
    + '<button type="button" data-v2vue="mur" class="' + (V.vue === 'mur' ? 'on' : '')
      + '">Où ça coince</button>'
    + '<button type="button" data-v2vue="rapport" class="' + (V.vue === 'rapport' ? 'on' : '')
      + '">Ce que ça produit</button>'
    + '<button type="button" data-v2vue="campagnes" class="' + (V.vue === 'campagnes' ? 'on' : '')
      + '">Campagnes</button></div>';

  if (V.vue !== 'campagnes') html += v2Bandeau();

  if (V.vue === 'campagnes')    html += v2Campagnes();
  else if (V.vue === 'rapport') html += v2Rapport() + v2Panneau();
  else                          html += v2Mur() + v2Panneau();

  root.innerHTML = html;
  const __tBind = performance.now();
  bindEvents();
  const __tFin = performance.now();

  // Instrumentation : le reseau etant desormais propre (une requete par
  // onglet, rien de rejoue), toute lenteur restante vient du RENDU. On la
  // mesure au lieu de la deviner. Silencieux sous 150 ms.
  const __total = __tFin - __tDebutRender;
  if (__total > 150) {
    console.warn('[leadMgmt] rendu lent : ' + Math.round(__total) + ' ms'
      + ' — html ' + Math.round(__tInject - __tDebutRender) + ' ms'
      + ', innerHTML ' + Math.round(__tBind - __tInject) + ' ms'
      + ', bindEvents ' + Math.round(__tFin - __tBind) + ' ms'
      + ' | vue=' + (isManager ? state.section : state.view)
      + ', ' + html.length + ' caracteres');
  }

  // Les graphes n'existent que dans la synthese d'equipe : ne pas les
  // dessiner en mode focalise, leur canvas n'est pas rendu.
  if (state.section === 'synthese') {
    setTimeout(() => { drawGraphes(); }, 0);
  }
}

// --- 14. Navigation fiche client ----------------------------
// Ouverture de la fiche client — patron aligné sur client-search :
//  1) on écrit le client sélectionné dans SA variable (fiche-shell lit l'IDVu et
//     recharge le client lui-même) -> plus de workflow WeWeb WF_GET_FICHE ;
//  2) l'onglet voulu passe par un global à usage unique lu par fiche-shell ;
//  3) navigation ÉDITEUR par UID / PROD par CHEMIN (un UID en prod s'inscrit tel
//     quel dans l'URL -> route inexistante -> page blanche).
const PATH_FICHE_CLIENT   = '/fr/fiche-client';
function lmInEditor() {
  try { return (window.self !== window.top) || /-editor\.weweb\.io|weweb\.io/i.test(location.hostname); }
  catch (e) { return true; }
}
async function openClientFiche(idClient, tabIndex, cardEl) {
  if (!idClient) { console.warn('[leadMgmt] Pas d\'id_client'); return; }
  if (cardEl) cardEl.classList.add('is-loading');
  try {
    try { wwLib.wwVariable.updateValue('55490583-c88b-4748-916e-4d203db07742', { IDVu: Number(idClient) }); } catch (e) {}
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

// Charge les cycles pour la vue « Suivi leads » si pas déjà chargés pour cette
// cible. cible = idUser (vendeur ciblé) ou null (tout le périmètre du manager).
async function ensureCycles(cible) {
  const c = (cible != null ? Number(cible) : null);
  if (state.cyclesLoading) return;
  if (cyclesLoadedFor === c) return;   // déjà chargés pour cette cible
  state.cyclesLoading = true;
  if (window.__renderLeadMgmt) window.__renderLeadMgmt();
  try {
    const cy = await fetchCyclesData(c);
    dataActifs = cy.actifs;
    dataKanban = cy.kanban;
    cyclesLoadedFor = c;
  } catch (e) {
    console.error('[leadMgmt] ensureCycles', e);
  } finally {
    state.cyclesLoading = false;
    if (window.__renderLeadMgmt) window.__renderLeadMgmt();
  }
}
function cibleCourante() {
  return state.selectedVendeur ? state.selectedVendeur.id_user : __initialVendeurCible;
}

async function selectVendeurCible(idUser) {
  state.cyclesLoading = true;
  renderAll();
  try {
    await setVendeurCible(idUser);          // garde la variable WeWeb en phase (inoffensif)
    const cy = await fetchCyclesData(idUser);   // FOLD : refetch direct au lieu de fetchCollection
    dataActifs = cy.actifs;
    dataKanban = cy.kanban;
    cyclesLoadedFor = (idUser != null ? Number(idUser) : null);
  } catch (e) {
    console.error('[leadMgmt] Erreur refetch cycles', e);
  } finally {
    state.cyclesLoading = false;
    if (window.__renderLeadMgmt) window.__renderLeadMgmt();
  }
}

// --- 15. Bindings -------------------------------------------
function bindEvents() {
  // --- Refonte v2 : fil de périmètre, bascule, descente ---------
  root.querySelectorAll('.v2-vues button[data-v2vue]').forEach(el => {
    el.addEventListener('click', () => {
      state.v2.vue = el.getAttribute('data-v2vue');
      renderAll(); chargerSection();
    });
  });
  root.querySelectorAll('.v2-fil button[data-v2niv]').forEach(el => {
    el.addEventListener('click', () => {
      const k = el.getAttribute('data-v2cle');
      state.v2.niveau = el.getAttribute('data-v2niv');
      state.v2.cle = (k !== '' && !isNaN(Number(k))) ? Number(k) : k;
      renderAll(); chargerSection();
    });
  });
  // Une ligne EST le niveau du dessous : cliquer descend d'un cran.
  root.querySelectorAll('[data-v2ligne]').forEach(el => {
    el.addEventListener('click', () => {
      const ty = el.getAttribute('data-v2type');
      if (ty === 'source') return;   // une source n'a pas d'enfant
      const k = el.getAttribute('data-v2ligne');
      state.v2.niveau = ty;
      state.v2.cle = isNaN(Number(k)) ? k : Number(k);
      renderAll(); chargerSection();
    });
  });
  // 🐛 Le handler des cellules MANQUAIT : le mur était cliquable en
  //    apparence et ne faisait rien. Sans lui, il désigne un problème
  //    sans donner prise dessus.
  root.querySelectorAll('[data-v2cell]').forEach(el => {
    el.addEventListener('click', () => {
      const parts = el.getAttribute('data-v2cell').split('|');
      const k = parts[0], tk = parts[1];
      const ln = v2Lignes().find(x => String(x.k) === String(k));
      const tr = V2_TRANCHES.find(x => x.k === tk);
      if (!ln || !tr) return;
      state.v2.sel = {
        titre: ln.l + ' · ' + tr.l,
        leads: v2LeadsDe(ln).filter(l => v2Tranche(l) === tk)
      };
      renderAll();
    });
  });
  // Les chiffres de leads du rapport ouvrent la MÊME liste que les
  // pastilles du mur : un compteur doit toujours pouvoir s'ouvrir.
  root.querySelectorAll('[data-v2src]').forEach(el => {
    el.addEventListener('click', () => {
      const src = el.getAttribute('data-v2src');
      const filtre = el.getAttribute('data-v2filtre');
      let lst = v2Leads().filter(l =>
        String(l.source) === String(src) || String(l.source_libelle) === String(src));
      if (filtre === 'retard') lst = lst.filter(l => lmfNiveau(l) === 'retard');
      const lib = (lst[0] && lst[0].source_libelle) || src;
      state.v2.sel = {
        titre: lib + (filtre === 'retard' ? ' · en retard' : ' · en attente'),
        leads: lst
      };
      renderAll();
      // Le panneau s'ouvre en bas de page : on l'amène sous les yeux.
      const pan = root.querySelector('.v2-pan');
      if (pan && pan.scrollIntoView) pan.scrollIntoView({ behavior:'smooth', block:'nearest' });
    });
  });
  root.querySelectorAll('[data-v2fermer]').forEach(el => {
    el.addEventListener('click', () => { state.v2.sel = null; renderAll(); });
  });
  root.querySelectorAll('[data-v2client]').forEach(el => {
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-v2reaff]')) return;   // le bouton d'abord
      openClientFiche(el.getAttribute('data-v2client'), TAB_DEFAULT, el);
    });
  });
  root.querySelectorAll('[data-v2reaff]').forEach(el => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ouvrirReaffectation(el.getAttribute('data-v2reaff'));
    });
  });

  root.querySelectorAll('[data-v2vend]').forEach(el => {
    el.addEventListener('click', () => {
      state.v2.niveau = 'vendeur';
      state.v2.cle = Number(el.getAttribute('data-v2vend'));
      state.v2.vue = 'mur';
      renderAll(); chargerSection();
    });
  });

  root.querySelectorAll('.lm-toggle-btn[data-sec]').forEach(el => {
    el.addEventListener('click', () => {
      state.sectionIdx = +el.getAttribute('data-sec');
      state.drillSite = null; state.drillVendeur = null;
      state.mafileCible = undefined;
      state.mafileKey = null; state.mafileData = null;
      renderAll();
      chargerSection();
    });
  });
  root.querySelectorAll('[data-site]').forEach(el => {
    el.addEventListener('click', () => {
      state.drillSite = +el.getAttribute('data-site');
      state.drillVendeur = null;
      equipeKey = null; dataEquipe = null;   // l'équipe change de site
      renderAll();
    });
  });
  root.querySelectorAll('[data-vendeur]').forEach(el => {
    el.addEventListener('click', () => {
      state.drillVendeur = +el.getAttribute('data-vendeur');
      renderAll();
    });
  });
  root.querySelectorAll('.lmr-fil button[data-fil]').forEach(el => {
    el.addEventListener('click', () => {
      const q = el.getAttribute('data-fil');
      if (q === 'racine') { state.drillSite = null; state.drillVendeur = null; }
      if (q === 'site')   { state.drillVendeur = null; }
      state.mafileCible = undefined; state.mafileKey = null; state.mafileData = null;
      renderAll();
      chargerSection();
    });
  });
  root.querySelectorAll('.lm-subtoggle-btn[data-cyc]').forEach(el => {
    el.addEventListener('click', () => {
      state.vueCycles = el.getAttribute('data-cyc'); renderAll();
    });
  });

  root.querySelectorAll('.lm-toggle-btn[data-section]').forEach(el => {
    el.addEventListener('click', () => {
      const newSection = el.getAttribute('data-section');
      if (newSection === 'synthese' || newSection === 'campagnes' || newSection === 'creation') {
        state.selectedVendeur = null;
      }
      state.section = newSection;
      renderAll();
      // Toutes les sections SAUF « Ma file » lisent les vues KPI : on les
      // charge a l'entree, pas au montage.
      if (newSection !== 'ma_file') ensureKpis();
      if (newSection === 'suivi_leads') ensureCycles(cibleCourante());   // chargement à la demande
      // « Ma file » et « Leads » lisent la MEME source (v_lead_sla) : un
      // seul chargement sert les deux. La cle de cache porte le site.
      if (newSection === 'ma_file') { state.mafileCible = userId; fetchMaFile(); }
      if (newSection === 'leads')   { state.mafileCible = null;   fetchMaFile(); }
    });
  });
  root.querySelectorAll('.lm-toggle-btn[data-view], .lm-subtoggle-btn[data-view]').forEach(el => {
    el.addEventListener('click', () => {
      state.view = el.getAttribute('data-view');
      renderAll();
      if (state.view === 'ma_file') { state.mafileCible = userId; fetchMaFile(); }
      // ⚠️ « Cycles actifs » et « Pipeline » lisent dataActifs/dataKanban,
      //    charges par ensureCycles. Au montage ils l'etaient parce que la
      //    section par defaut du vendeur etait « suivi_leads ». Depuis que
      //    « Ma file » est le defaut, plus personne ne declenchait le
      //    chargement : les deux onglets restaient VIDES (releve le 27/08).
      //    Ils n'ont en revanche besoin d'AUCUNE vue KPI.
      else if (state.view === 'a_traiter' || state.view === 'pipeline') {
        ensureCycles(cibleCourante());
      }
      else if (state.view === 'synthese') ensureKpiVendeur();
    });
  });
  root.querySelectorAll('.lm-subtoggle-btn[data-vleads]').forEach(el => {
    el.addEventListener('click', () => { state.viewLeads = el.getAttribute('data-vleads'); renderAll(); });
  });
  // Reaffectation : le bouton ne doit PAS ouvrir la fiche client sous lui.
  root.querySelectorAll('.lmf-reaff').forEach(el => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ouvrirReaffectation(el.getAttribute('data-reaff'));
    });
  });
  root.querySelectorAll('.lmf-card[data-client]').forEach(el => {
    el.addEventListener('click', () => {
      openClientFiche(el.getAttribute('data-client'), TAB_DEFAULT, el);
    });
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

      // La synthese suit le noeud clique. Recliquer le meme noeud la remet
      // sur tout le perimetre — c'est le comportement d'un filtre, pas d'un
      // interrupteur a sens unique.
      const scType = el.getAttribute('data-scope-type');
      if (scType && state.section === 'synthese') {
        const label = el.getAttribute('data-scope-label') || '';
        const sites = (el.getAttribute('data-scope-sites') || '')
                        .split(',').filter(function (x) { return x !== ''; }).map(Number);
        const deja = state.syntheseScope && state.syntheseScope.type === scType &&
                     state.syntheseScope.label === label;
        state.syntheseScope = deja ? null : { type: scType, label: label, sites: sites, id_user: null };
      }

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
        // MODIFIÉ 20/08/2026 — on ne bascule plus vers le suivi des leads.
        // Le chef reste dans la synthese : elle se recalcule pour ce vendeur,
        // le tableau d'equipe reste visible au-dessus, et un bouton explicite
        // l'emmene vers les cycles s'il veut aller plus loin.
        const dejaLui = state.syntheseScope && state.syntheseScope.type === 'vendeur' &&
                        Number(state.syntheseScope.id_user) === idUser;
        state.selectedVendeur = { id_user: idUser, id_site: idSite, vendeur_nom: nom };
        // On garde AUSSI son site : l'entonnoir suit le vendeur, mais les
        // blocs qui ne savent pas se decouper par vendeur (cycles actifs,
        // win sur periode, graphes) suivent au moins son site.
        state.syntheseScope   = dejaLui ? null
          : { type: 'vendeur', label: nom || 'Ce vendeur',
              sites: (idSite != null ? [Number(idSite)] : null), id_user: idUser };
        renderAll();
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

  root.querySelectorAll('[data-action="portee-reset"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      state.syntheseScope = null;
      state.selectedVendeur = null;
      renderAll();
    });
  });

  root.querySelectorAll('[data-action="portee-cycles"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const sc = state.syntheseScope;
      state.section = 'suivi_leads';
      if (sc && sc.id_user) selectVendeurCible(sc.id_user); else renderAll();
    });
  });

  // Vendeur : ses quatre compteurs mènent à la vue correspondante.
  root.querySelectorAll('[data-goto]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      state.view = el.getAttribute('data-goto');
      renderAll();
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

// Chargement initial des cycles UNIQUEMENT si on arrive sur « Suivi leads »
// (vendeur par défaut, ou manager pré-filtré depuis le dashboard). Un manager
// sur « Synthèse » (défaut) n'en charge aucun -> premier affichage rapide.
// Au montage, un seul point de décision : la section par défaut du RÔLE.
// Avant la refonte, le montage câblait en dur deux rôles — d'où des
// onglets qui ne chargeaient rien pour les autres.
if (SECTIONS_ROLE.length) {
  v2Init();
  chargerSection();
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
