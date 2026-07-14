// ============================================================================
//  SUIVI ACTIVITÉ v3 — module One Data (OD.define)  v1
//  Rendu dans __anchor ; SUPABASE_URL/clé/JWT via ctx (tenant + session runtime) ;
//  RPC via ctx.supabase ; export-xslx tenant-correct ; user via socle oropraUser.
// ============================================================================
// ============================================================================
// SUIVI ACTIVITÉ v3 — Arbre hiérarchique navigable (marque>affaire>site>type>vendeur)
//
//  - Charge get_activite_equipe(viewer, from, to) via RPC Supabase (1 appel).
//  - Tout le drill-down se fait en JS : clic sur une ligne => KPIs + graphes
//    recalculés instantanément, zéro refetch.
//  - Vendeurs sans activité (jour=NULL) : présents dans l'arbre à 0, ignorés des graphes.
//  - v3 BUS DE SITE (oropra-site-bus.js) : le bus porte le SITE, la page porte
//    l'EXPLORATION.
//      * à l'arrivée, la sélection se focalise sur le site global (bus), ancêtres
//        dépliés ; "✕" pour revenir à tout le périmètre ;
//      * sélectionner une ligne SITE pousse ce site dans le bus (header, badge,
//        autres pages suivent) ; réseau/affaire/type/vendeur = local ;
//      * changement de site ailleurs -> refocalisation SANS re-fetch.
//  - v3 TYPE VN/VO/VNVO (catégorie du VENDEUR) :
//      * toggle Type : Tous | VN | VO | VNVO (affiché seulement si le RPC
//        renvoie la colonne vn_vo — sinon l'UI reste identique à la v2) ;
//      * niveau TYPE inséré entre site et vendeurs dans l'arbre (aplati si le
//        site n'a qu'un type), sélectionnable (clé "id_site~~TYPE") ;
//      * vendeurs triés par type puis contacts décroissants ;
//      * le pipeline/transfo suit le filtre : agrégé sur les couples
//        vendeur×site du périmètre filtré (et non plus le site entier).
//    PRÉREQUIS SQL : ajouter au SELECT de get_activite_equipe la colonne
//    vn_vo (catégorie du vendeur, ex. U."VN_VO"). Sans elle, tout reste fonctionnel
//    mais sans la dimension type.
//  - v3 EXPORT EXCEL : logo Excel cliquable -> edge function export-xslx
//    (une ligne par vendeur×site×type du périmètre courant, filtres appliqués).
//  - v3.1 :
//      * HEATMAP CADENCE : grille jour × vendeur (intensité = nb de contacts,
//        jours calendaires de la période, dimanches signalés), affichée pour
//        une sélection site/type/vendeur ;
//      * COMPARATEUR : "⇄ Comparer" -> cliquer 2 lignes de l'arbre (tout
//        niveau) les met côte à côte (contacts, chocs, pipeline, transfo) ;
//        en mode comparaison, les clics ne touchent ni la sélection ni le bus ;
//      * MOYENNE MOBILE 7 J : toggle "MM 7j" sur le graphe contacts pour
//        lisser le bruit quotidien et lire la tendance.
//  - Remplace intégralement le script #act-root.
// ============================================================================

// Tout le script est encapsulé dans une IIFE : en prod (build WeWeb/Cloudflare),
// un `return;` au niveau racine provoque une SyntaxError ("Illegal return
// statement") qui empêche TOUT le script de s'exécuter (loader figé). Dans une
// fonction, les `return` de garde sont parfaitement légaux.
OD.define('activite', {
  mount(__anchor, ctx) {
    __anchor.id = 'act-root';
const SUPABASE_URL = ctx.tenant.supabase_url;
function getSupabaseKey() { return ctx.tenant.supabase_anon_key; }
async function getUserJwt(){ try { const s = await ctx.supabase.auth.getSession(); return s?.data?.session?.access_token || null; } catch(e){ return null; } }

const doc  = __anchor.ownerDocument || document;
// IMPORTANT : ne PAS capturer #act-root dans une const figée. WeWeb recrée le
// nœud DOM quand il re-render le composant ; une référence figée pointerait alors
// vers un ancien nœud détaché et render() écrirait dans le vide. On le re-cible
// donc à chaque utilisation via getRoot().
function getRoot() { return __anchor; }
if (!getRoot()) return;

const userConnected = (((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser || {});
const viewerId = userConnected.ID_User;
const userRole = userConnected.ID_Role;
if (viewerId == null) { const r0 = getRoot(); if (r0) r0.innerHTML = '<div style="padding:20px;color:#7a9cc4">Utilisateur non identifié.</div>'; return; }

// --- Bus de site (oropra-site-bus.js) ----------------------------------------
function siteBus() {
  try { const w = wwLib.getFrontWindow(); if (w && w.oropraSite) return w.oropraSite; } catch (e) {}
  return window.oropraSite || null;
}

// --- État -------------------------------------------------------------------
const state = window.__act || {};
if (state.period === undefined) {
  // Par défaut : mois courant (du 1er à aujourd'hui)
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  state.period = { from: ymd(from), to: ymd(now) };
}
if (state.rawData === undefined)   state.rawData = null;   // null = pas encore chargé
if (state.error === undefined)     state.error = null;
if (state.selection === undefined) state.selection = { level: 'all', key: null, label: 'Tout le périmètre' };
if (state.expanded === undefined)  state.expanded = {};
if (state.loadKey === undefined)   state.loadKey = null;
if (state.pipelineMode === undefined) state.pipelineMode = 'cumul';   // 'cumul' | 'jour'
if (state.contactsSens === undefined) state.contactsSens = 'total';   // 'total' | 'entrants' | 'sortants'
if (state.contactsMM7 === undefined) state.contactsMM7 = true;        // moyenne mobile 7 jours (par défaut)
if (state.compare === undefined)   state.compare = { active:false, items:[] };  // comparateur
if (state.vnvo === undefined)      state.vnvo = 'ALL';                // ALL | VN | VO | VNVO
if (state.busSite === undefined)       state.busSite = null;
if (state.busSelPending === undefined) state.busSelPending = true;
// IMPORTANT : on réinitialise toujours loading à false au (re)chargement du script.
state.loading = false;
// Invalidation du cache si l'utilisateur connecté a changé.
if (state.viewerId !== undefined && String(state.viewerId) !== String(viewerId)) {
  state.rawData = null;
  state.loadKey = null;
  state.transfo = null;
  state.selection = { level: 'all', key: null, label: 'Tout le périmètre' };
  state.expanded = {};
  state.busSelPending = true;
}
state.viewerId = viewerId;
window.__act = state;

// --- Synchronisation avec le bus ---------------------------------------------
function applyBusSiteAct(siteId) {
  const st = window.__act; if (!st) return;
  const id = siteId != null ? String(siteId) : null;
  if (id == null) return;
  const changed = st.busSite !== id;
  st.busSite = id;
  if (changed) st.busSelPending = true;
  adoptBusSelectionAct();
  if (window.__renderActivite) { window.__renderActivite(); setTimeout(() => { if (window.__actDrawCharts) window.__actDrawCharts(); }, 0); }
}
// Focalise la sélection sur le site du bus (niveau 'site'), ancêtres dépliés.
function adoptBusSelectionAct() {
  const st = window.__act; if (!st || !st.busSelPending) return;
  if (st.busSite == null || st.rawData === null) return;   // données pas prêtes (retenté plus tard)
  const row = (st.rawData || []).find(r => String(r.id_site) === String(st.busSite));
  if (!row) return;
  st.busSelPending = false;
  st.selection = { level: 'site', key: String(row.id_site), label: row.nom_site || ('Site ' + row.id_site) };
  const rKey = 'r:' + row.reseau;
  const aKey = rKey + '|a:' + row.id_affaire;
  st.expanded[rKey] = true;
  st.expanded[aKey] = true;
}
(function bindActBus(tries) {
  tries = tries || 0;
  const b = siteBus();
  if (!b) { if (tries < 120) setTimeout(() => bindActBus(tries + 1), 250); return; }
  if (window.__actBusBound) {
    const id = b.getSiteId();
    if (id != null) applyBusSiteAct(id);   // réexécution : simple recalage
    return;
  }
  window.__actBusBound = true;
  b.onChange(({ siteId }) => applyBusSiteAct(siteId));
})();

// --- Helpers date -----------------------------------------------------------
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}
function periodKey() { return viewerId + '_' + state.period.from + '_' + state.period.to; }
function fmtPeriod() {
  const f = (s) => { const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); };
  return f(state.period.from) + ' → ' + f(state.period.to);
}

// --- Helpers HTML / type ------------------------------------------------------
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// Normalisation du type ('VN' | 'VO' | 'VNVO' | '—').
function normType(v) {
  const s = (v == null ? '' : String(v)).trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (s === 'VN' || s === 'VO' || s === 'VNVO') return s;
  return s || '—';
}
const TYPE_ORDER = { VN: 0, VO: 1, VNVO: 2 };
// La dimension type n'est active que si le RPC renvoie réellement la colonne.
function hasTypes() {
  return (state.rawData || []).some(r => r.vn_vo && r.vn_vo !== '—');
}
const KPI_KEYS = ['nb_contacts','nb_entrants','nb_sortants','nb_whatsapp','nb_rpv','nb_voip','nb_sms','nb_chocs','nb_relances','nb_abandons','nb_propales_creees','nb_bdc','nb_wins'];
function emptyKpi() { const o = {}; for (const k of KPI_KEYS) o[k] = 0; return o; }
function addKpi(target, row) { for (const k of KPI_KEYS) target[k] += Number(row[k]) || 0; }

// --- Chargement RPC ---------------------------------------------------------
async function loadData() {
  const key = periodKey();
  if (state.loadKey === key && state.rawData !== null) return;
  // Verrou anti-doublon : si un chargement pour la même clé est déjà en vol,
  // on réutilise sa promesse au lieu de relancer les RPC.
  if (window.__actLoadPromise && window.__actLoadKeyInflight === key) {
    return window.__actLoadPromise;
  }
  state.loading = true;
  state.error = null;
  state.loadKey = key;
  window.__actLoadKeyInflight = key;
  render();
  window.__actLoadPromise = (async () => {
  try {
    const supabase = ctx.supabase;
    // Deux RPC en parallèle : l'activité (par jour, created_at) et le taux de
    // transfo unifié (updated_at, même définition que le dashboard).
    const [actRes, txRes] = await Promise.all([
      supabase.rpc('get_activite_equipe', { p_viewer_id_user: Number(viewerId), p_date_from: state.period.from, p_date_to: state.period.to }),
      supabase.rpc('get_transfo', { p_viewer_id_user: Number(viewerId), p_date_from: state.period.from, p_date_to: state.period.to })
    ]);
    const { data, error } = actRes;
    if (error) throw error;
    if (!txRes.error) {
      state.transfo = (txRes.data || []).map(r => ({
        jour: r.jour || null,
        id_user: r.id_user != null ? Number(r.id_user) : null,
        id_site: r.id_site != null ? Number(r.id_site) : null,
        nb_propale: Number(r.nb_propale) || 0,
        nb_bdc: Number(r.nb_bdc) || 0,
        nb_wins: Number(r.nb_wins) || 0,
        nb_lose: Number(r.nb_lose) || 0,
        nb_wins_tx: Number(r.nb_wins_tx) || 0,
        nb_propales_tx: Number(r.nb_propales_tx) || 0
      }));
    } else { state.transfo = []; }
    state.rawData = (data || []).map(r => ({
      id_user: Number(r.id_user),
      nom_complet: r.nom_complet || ('Vendeur ' + r.id_user),
      id_site: r.id_site != null ? Number(r.id_site) : null,
      nom_site: r.nom_site || ('Site ' + r.id_site),
      reseau: r.reseau || '(Sans réseau)',
      affaire: r.affaire || '(Sans affaire)',
      id_affaire: r.id_affaire != null ? Number(r.id_affaire) : null,
      id_manager: r.id_manager != null ? Number(r.id_manager) : null,
      vn_vo: normType(r.vn_vo),   // catégorie du vendeur ('—' si le RPC ne la renvoie pas)
      jour: r.jour,  // peut être null (vendeur inactif)
      nb_contacts: Number(r.nb_contacts)||0, nb_entrants: Number(r.nb_entrants)||0, nb_sortants: Number(r.nb_sortants)||0,
      nb_whatsapp: Number(r.nb_whatsapp)||0, nb_rpv: Number(r.nb_rpv)||0, nb_voip: Number(r.nb_voip)||0, nb_sms: Number(r.nb_sms)||0,
      nb_chocs: Number(r.nb_chocs)||0, nb_relances: Number(r.nb_relances)||0, nb_abandons: Number(r.nb_abandons)||0,
      nb_propales_creees: Number(r.nb_propales_creees)||0, nb_bdc: Number(r.nb_bdc)||0, nb_wins: Number(r.nb_wins)||0
    }));
    adoptBusSelectionAct();   // focalise sur le site du bus dès que les données sont là
  } catch (e) {
    console.error('[activite] RPC get_activite_equipe', e);
    state.error = (e && e.message) ? e.message : 'Erreur de chargement';
    state.rawData = [];
  } finally {
    state.loading = false;
    window.__actLoadPromise = null;
    window.__actLoadKeyInflight = null;
    render();
    setTimeout(drawCharts, 0);
  }
  })();
  return window.__actLoadPromise;
}

// --- Filtrage : type (vendeur) + périmètre (drill-down en mémoire) -----------
// Lignes après filtre Type (base de TOUT : arbre, KPIs, graphes, export).
function baseRows() {
  let rows = state.rawData || [];
  if (state.vnvo !== 'ALL' && hasTypes()) rows = rows.filter(r => r.vn_vo === state.vnvo);
  return rows;
}
// Lignes d'une entité quelconque (réutilisé par la sélection ET le comparateur).
function entityRowsAct(level, key) {
  const all = baseRows();
  if (level === 'all')     return all;
  if (level === 'reseau')  return all.filter(r => r.reseau === key);
  if (level === 'affaire') return all.filter(r => String(r.id_affaire) === String(key));
  if (level === 'site')    return all.filter(r => String(r.id_site) === String(key));
  // Niveau VN/VO/VNVO au sein d'un site : clé qualifiée "id_site~~TYPE".
  if (level === 'vntype') {
    const parts = String(key).split('~~');
    if (parts.length === 2) return all.filter(r => String(r.id_site) === parts[0] && r.vn_vo === parts[1]);
    return all;
  }
  if (level === 'vendeur') return all.filter(r => String(r.id_user) === String(key));
  return all;
}
function rowsForSelection() { return entityRowsAct(state.selection.level, state.selection.key); }
function sumKpi(rows) { const o = emptyKpi(); for (const r of rows) addKpi(o, r); return o; }

// Couples (id_user|id_site) couverts par un jeu de lignes. C'est par EUX
// qu'on filtre la transfo : ainsi le filtre Type (catégorie vendeur) et le
// drill-down s'appliquent aussi au pipeline, sans toucher au RPC get_transfo.
function couplesOf(rows) {
  const set = new Set();
  for (const r of rows) set.add(String(r.id_user) + '|' + String(r.id_site));
  return set;
}
function selCouples() { return couplesOf(rowsForSelection()); }

// Taux de transfo unifié (updated_at), agrégé sur un jeu de lignes.
// Renvoie { wins, total, pct, totalPropales, nbPropale, nbBdc, nbWins, nbLose }.
function transfoAggFor(rows) {
  const couples = couplesOf(rows);
  const tx = state.transfo || [];
  let wins = 0, total = 0, nbPropale = 0, nbBdc = 0, nbWins = 0, nbLose = 0;
  for (const t of tx) {
    if (!couples.has(String(t.id_user) + '|' + String(t.id_site))) continue;
    wins += t.nb_wins_tx; total += t.nb_propales_tx;
    nbPropale += t.nb_propale; nbBdc += t.nb_bdc; nbWins += t.nb_wins; nbLose += t.nb_lose;
  }
  return {
    wins, total, pct: total > 0 ? Math.round(wins / total * 100) : 0,
    totalPropales: nbPropale + nbBdc + nbWins + nbLose,
    nbPropale, nbBdc, nbWins, nbLose
  };
}
function transfoForSelection() { return transfoAggFor(rowsForSelection()); }

// Séries du pipeline par JOUR (updated_at), filtrées par le périmètre courant.
function transfoByJour() {
  const couples = selCouples();
  const tx = state.transfo || [];
  const data = {};
  for (const t of tx) {
    if (!t.jour) continue;
    if (!couples.has(String(t.id_user) + '|' + String(t.id_site))) continue;
    if (!data[t.jour]) data[t.jour] = { propales: 0, bdc: 0, wins: 0, abandons: 0 };
    const d = data[t.jour];
    d.bdc += t.nb_bdc; d.wins += t.nb_wins; d.abandons += t.nb_lose;
    d.propales += t.nb_propale + t.nb_bdc + t.nb_wins + t.nb_lose;  // total du jour
  }
  const jours = Object.keys(data).sort();
  return { jours, data };
}

// Agrégat par jour pour le graphe contacts : trace les PAIRS de l'entité
// sélectionnée (les enfants du parent), avec la moyenne du parent.
//   sélection vendeur  -> courbes des vendeurs du SITE      + moyenne du site
//   sélection vntype   -> courbes des vendeurs du TYPE      + moyenne du type
//   sélection site     -> courbes des sites de l'AFFAIRE    + moyenne de l'affaire
//   sélection affaire  -> courbes des affaires du RÉSEAU    + moyenne du réseau
//   sélection réseau   -> courbes des réseaux (TOUT)        + moyenne groupe
//   sélection tout     -> APLATISSEMENT auto (descend tant qu'un niveau n'a
//                         qu'une seule valeur).
function byJourPairs(allRows) {
  const sel = state.selection;
  const lvl = sel.level;

  let parentRows, dimKey, dimLabel, selectedKey = null;

  const distinct = (rows, fn) => { const s = new Set(); for (const r of rows){ const v=fn(r); if(v!=null&&v!=='') s.add(String(v)); } return s; };

  if (lvl === 'vendeur') {
    const vRow = allRows.find(r => String(r.id_user) === String(sel.key));
    const siteId = vRow ? vRow.id_site : null;
    parentRows = allRows.filter(r => String(r.id_site) === String(siteId));
    dimKey = r => String(r.id_user);
    dimLabel = r => r.nom_complet || ('Vendeur '+r.id_user);
    selectedKey = String(sel.key);
  } else if (lvl === 'vntype') {
    // Vendeurs du type au sein du site, comparés entre eux.
    const parts = String(sel.key).split('~~');
    parentRows = parts.length === 2
      ? allRows.filter(r => String(r.id_site) === parts[0] && r.vn_vo === parts[1])
      : allRows;
    dimKey = r => String(r.id_user);
    dimLabel = r => r.nom_complet || ('Vendeur '+r.id_user);
    selectedKey = null;
  } else if (lvl === 'site') {
    const sRow = allRows.find(r => String(r.id_site) === String(sel.key));
    const affId = sRow ? sRow.id_affaire : null;
    parentRows = allRows.filter(r => String(r.id_affaire) === String(affId));
    dimKey = r => String(r.id_site);
    dimLabel = r => r.nom_site || ('Site '+r.id_site);
    selectedKey = String(sel.key);
  } else if (lvl === 'affaire') {
    const aRow = allRows.find(r => String(r.id_affaire) === String(sel.key));
    const res = aRow ? aRow.reseau : null;
    parentRows = allRows.filter(r => r.reseau === res);
    dimKey = r => String(r.id_affaire);
    dimLabel = r => r.affaire || '(Sans affaire)';
    selectedKey = String(sel.key);
  } else if (lvl === 'reseau') {
    parentRows = allRows;
    dimKey = r => r.reseau || '(Sans réseau)';
    dimLabel = r => r.reseau || '(Sans réseau)';
    selectedKey = String(sel.key);
  } else {
    // TOUT : aplatissement auto, comme le tableau.
    parentRows = allRows;
    const chain = [
      { key:r=>r.reseau||'(Sans réseau)',      label:r=>r.reseau||'(Sans réseau)' },
      { key:r=>String(r.id_affaire),           label:r=>r.affaire||'(Sans affaire)' },
      { key:r=>String(r.id_site),              label:r=>r.nom_site||('Site '+r.id_site) },
      { key:r=>String(r.id_user),              label:r=>r.nom_complet||('Vendeur '+r.id_user) }
    ];
    let chosen = chain[0];
    for (let i = 0; i < chain.length; i++) {
      const n = distinct(parentRows, chain[i].key).size;
      if (n > 1 || i === chain.length - 1) { chosen = chain[i]; break; }
    }
    dimKey = chosen.key;
    dimLabel = chosen.label;
    selectedKey = null;
  }

  // Agrège par (jour, clé de dimension).
  const data = {};
  const serieMap = {};
  const joursSet = {};
  for (const r of parentRows) {
    if (!r.jour) continue;
    const k = dimKey(r);
    if (k == null || k === 'null' || k === '') continue;
    joursSet[r.jour] = true;
    if (!serieMap[k]) serieMap[k] = { key:k, label:dimLabel(r), selected: selectedKey != null && k === selectedKey };
    if (!data[r.jour]) data[r.jour] = {};
    if (!data[r.jour][k]) data[r.jour][k] = { entrants:0, sortants:0, total:0 };
    const cell = data[r.jour][k];
    cell.entrants += r.nb_entrants;
    cell.sortants += r.nb_sortants;
    cell.total    += r.nb_contacts;
  }
  const jours = Object.keys(joursSet).sort();
  const series = Object.values(serieMap).sort((a,b) => String(a.label).localeCompare(String(b.label)));
  return { jours, series, data };
}

// Agrégat par vendeur (pour le tableau détail)
function byVendeur(rows) {
  const m = {};
  for (const r of rows) {
    if (!m[r.id_user]) { m[r.id_user] = { id_user:r.id_user, nom_complet:r.nom_complet, vn_vo:r.vn_vo, ...emptyKpi() }; }
    addKpi(m[r.id_user], r);
  }
  return Object.values(m).sort((a,b) => b.nb_contacts - a.nb_contacts);
}

// --- Construction de l'arbre marque>affaire>site>type>vendeur ----------------
function buildTree(rows) {
  const byReseau = {};
  for (const r of rows) {
    if (!byReseau[r.reseau]) byReseau[r.reseau] = { label:r.reseau, key:r.reseau, kpi:emptyKpi(), affaires:{} };
    const R = byReseau[r.reseau];
    addKpi(R.kpi, r);
    const aKey = r.id_affaire;
    if (!R.affaires[aKey]) R.affaires[aKey] = { label:r.affaire, key:aKey, kpi:emptyKpi(), sites:{} };
    const A = R.affaires[aKey];
    addKpi(A.kpi, r);
    if (!A.sites[r.id_site]) A.sites[r.id_site] = { label:r.nom_site, key:r.id_site, kpi:emptyKpi(), types:{} };
    const S = A.sites[r.id_site];
    addKpi(S.kpi, r);
    // Niveau TYPE (catégorie du vendeur)
    const tk = r.vn_vo || '—';
    if (!S.types[tk]) S.types[tk] = { key:tk, label:tk, kpi:emptyKpi(), vendeurs:{} };
    const T = S.types[tk];
    addKpi(T.kpi, r);
    if (!T.vendeurs[r.id_user]) T.vendeurs[r.id_user] = { label:r.nom_complet, key:r.id_user, id_site:r.id_site, kpi:emptyKpi() };
    addKpi(T.vendeurs[r.id_user].kpi, r);
  }
  // Tri : réseaux/affaires/sites alpha ; types VN/VO/VNVO ; vendeurs contacts desc.
  const reseaux = Object.values(byReseau).sort((a,b)=> (a.label||'').localeCompare(b.label||''));
  for (const R of reseaux) {
    R.affaires = Object.values(R.affaires).sort((a,b)=> (a.label||'').localeCompare(b.label||''));
    for (const A of R.affaires) {
      A.sites = Object.values(A.sites).sort((a,b)=> (a.label||'').localeCompare(b.label||''));
      for (const S of A.sites) {
        S.types = Object.values(S.types).sort((a,b)=> (TYPE_ORDER[a.key] ?? 9) - (TYPE_ORDER[b.key] ?? 9));
        for (const T of S.types) {
          T.vendeurs = Object.values(T.vendeurs).sort((a,b)=> (b.kpi.nb_contacts||0) - (a.kpi.nb_contacts||0));
        }
      }
    }
  }
  return reseaux;
}

// --- EXPORT EXCEL (edge function export-xslx) ---------------------------------
// Une ligne par vendeur × site (× type) du périmètre courant, filtres appliqués.
function exportRows() {
  const rows = rowsForSelection();
  const m = {};
  for (const r of rows) {
    const k = String(r.id_user) + '|' + String(r.id_site);
    if (!m[k]) m[k] = {
      reseau: r.reseau, affaire: r.affaire, site: r.nom_site,
      type: r.vn_vo || '—', vendeur: r.nom_complet, kpi: emptyKpi()
    };
    addKpi(m[k].kpi, r);
  }
  const withTypes = hasTypes();
  return Object.values(m)
    .sort((a, b) => {
      const s = a.site.localeCompare(b.site, 'fr'); if (s !== 0) return s;
      const t = (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9); if (t !== 0) return t;
      return (b.kpi.nb_contacts||0) - (a.kpi.nb_contacts||0);
    })
    .map(x => {
      const o = { 'Réseau': x.reseau, 'Affaire': x.affaire, 'Site': x.site };
      if (withTypes) o['Type'] = x.type;
      o['Vendeur'] = x.vendeur;
      o['Contacts'] = x.kpi.nb_contacts; o['Entrants'] = x.kpi.nb_entrants; o['Sortants'] = x.kpi.nb_sortants;
      o['WhatsApp'] = x.kpi.nb_whatsapp; o['VOIP'] = x.kpi.nb_voip; o['SMS'] = x.kpi.nb_sms; o['RPV'] = x.kpi.nb_rpv;
      o['Chocs'] = x.kpi.nb_chocs; o['Relances'] = x.kpi.nb_relances; o['Abandons'] = x.kpi.nb_abandons;
      o['Propales'] = x.kpi.nb_propales_creees; o['BDC'] = x.kpi.nb_bdc; o['Wins'] = x.kpi.nb_wins;
      return o;
    });
}
async function exportExcel(btn) {
  const rows = exportRows();
  if (!rows.length) return;
  btn.disabled = true; btn.classList.add('is-busy'); btn.classList.remove('is-err');
  try {
    const key = getSupabaseKey();
    const jwt = await getUserJwt();
    const scope = (state.selection.level === 'all' ? 'perimetre' : state.selection.label)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40);
    // NB : le slug déployé contient une coquille historique ("xslx", pas "xlsx").
    const res = await fetch(SUPABASE_URL + '/functions/v1/export-xslx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': 'Bearer ' + (jwt || key) },
      body: JSON.stringify({
        rows,
        fileName: 'activite_' + scope + '_' + state.period.from + '_' + state.period.to + '.xlsx',
        sheetName: 'Activité',
        expiresIn: 300
      })
    });
    const j = await res.json();
    if (!res.ok || !j.url) throw new Error(j.error || ('HTTP ' + res.status));
    const a = doc.createElement('a'); a.href = j.url; a.target = '_blank'; a.rel = 'noopener';
    doc.body.appendChild(a); a.click(); a.remove();
  } catch (e) {
    console.error('[activite] export xlsx', e);
    btn.classList.remove('is-busy'); btn.classList.add('is-err');
    btn.title = 'Erreur export — voir console';
    setTimeout(() => { btn.classList.remove('is-err'); btn.title = 'Exporter en Excel'; btn.disabled = false; }, 2500);
    return;
  }
  btn.classList.remove('is-busy'); btn.disabled = false;
}

// --- COMPARATEUR ---------------------------------------------------------------
const CMP_METRICS = [
  { label:'Contacts',  get:(k,t)=>k.nb_contacts },
  { label:'Entrants',  get:(k,t)=>k.nb_entrants },
  { label:'Sortants',  get:(k,t)=>k.nb_sortants },
  { label:'Chocs',     get:(k,t)=>k.nb_chocs },
  { label:'Propales',  get:(k,t)=>t.totalPropales },
  { label:'BDC',       get:(k,t)=>t.nbBdc },
  { label:'Wins',      get:(k,t)=>t.nbWins },
  { label:'Abandons',  get:(k,t)=>t.nbLose, lowerBetter:true },
  { label:'Transfo',   get:(k,t)=>t.pct, fmt:(v)=>v+'%' }
];
function renderCompare() {
  const c = state.compare;
  let h = '<div class="act-card">';
  h += shead('var(--orange)', 'Comparateur', c.items.length < 2 ? 'sélectionnez 2 lignes dans l\'arbre' : 'même période · mêmes filtres');
  h += '<div class="act-cmp-chips">';
  c.items.forEach((it, i) => {
    h += '<span class="act-cmp-chip">'+esc(it.label)+' <b data-cmp-del="'+i+'">✕</b></span>';
  });
  if (!c.items.length) h += '<span style="color:var(--text-mut);font-size:11px;font-style:italic">Cliquez 2 lignes de l\'arbre (réseau, affaire, site, type ou vendeur) pour les mettre côte à côte.</span>';
  else if (c.items.length === 1) h += '<span style="color:var(--text-mut);font-size:11px;font-style:italic">… et une seconde ligne.</span>';
  h += '</div>';
  if (c.items.length === 2) {
    const data = c.items.map(it => {
      const rows = entityRowsAct(it.level, it.key);
      return { kpi: sumKpi(rows), tx: transfoAggFor(rows) };
    });
    h += '<div class="act-cmp-grid">';
    h += '<div></div><div class="act-cmp-head">'+esc(c.items[0].label)+'</div><div class="act-cmp-head">'+esc(c.items[1].label)+'</div>';
    for (const m of CMP_METRICS) {
      const v = [m.get(data[0].kpi, data[0].tx), m.get(data[1].kpi, data[1].tx)];
      let win = -1;
      if (v[0] !== v[1]) win = m.lowerBetter ? (v[0] < v[1] ? 0 : 1) : (v[0] > v[1] ? 0 : 1);
      h += '<div class="act-cmp-lbl">'+esc(m.label)+'</div>';
      for (let i = 0; i < 2; i++) {
        h += '<div class="act-cmp-cell'+(win === i ? ' is-win' : '')+'">'+(m.fmt ? m.fmt(v[i]) : v[i])+'</div>';
      }
    }
    h += '</div>';
  }
  h += '</div>';
  return h;
}

// --- HEATMAP CADENCE (jour × vendeur) -------------------------------------------
// Intensité = contacts du jour. Jours CALENDAIRES de la période (les trous se
// voient), dimanches signalés. Affichée pour une sélection site/type/vendeur,
// bornée à 120 jours et 40 vendeurs pour rester lisible.
function renderHeatmap(rows) {
  const days = [];
  const d = new Date(state.period.from + 'T12:00:00');
  const end = new Date(state.period.to + 'T12:00:00');
  while (d <= end && days.length < 120) { days.push(ymd(d)); d.setDate(d.getDate() + 1); }
  if (!days.length) return '';
  // Agrégat user × jour (contacts) + total par vendeur
  const cell = {};
  const vend = {};
  for (const r of rows) {
    if (!vend[r.id_user]) vend[r.id_user] = { id: r.id_user, nom: r.nom_complet, tot: 0 };
    if (!r.jour) continue;
    cell[r.id_user + '|' + r.jour] = (cell[r.id_user + '|' + r.jour] || 0) + r.nb_contacts;
    vend[r.id_user].tot += r.nb_contacts;
  }
  const vendeurs = Object.values(vend).sort((a, b) => b.tot - a.tot).slice(0, 40);
  if (!vendeurs.length) return '';
  let max = 1;
  for (const k in cell) if (cell[k] > max) max = cell[k];

  const fmtJ = (j) => { const dd = new Date(j + 'T12:00:00'); return dd.getDate() + '/' + (dd.getMonth() + 1); };
  const isSun = (j) => new Date(j + 'T12:00:00').getDay() === 0;

  let h = '<div class="act-card">';
  h += shead('var(--green)', 'Cadence — contacts par jour', 'intensité = nb de contacts · dimanches en rouge');
  h += '<div class="act-hm-wrap"><table class="act-hm"><thead><tr><th class="nm"></th>';
  for (const j of days) {
    const dd = new Date(j + 'T12:00:00');
    h += '<th class="'+(isSun(j) ? 'sun' : '')+'" title="'+fmtJ(j)+'">'+dd.getDate()+'</th>';
  }
  h += '<th class="tot">Σ</th></tr></thead><tbody>';
  for (const v of vendeurs) {
    h += '<tr><td class="nm" title="'+esc(v.nom)+'">'+esc(v.nom)+'</td>';
    for (const j of days) {
      const n = cell[v.id + '|' + j] || 0;
      const bg = n === 0
        ? (isSun(j) ? '#faf7f0' : '#f1efe8')
        : 'rgba(83,189,167,' + (0.18 + 0.82 * n / max).toFixed(2) + ')';
      h += '<td class="cell" style="background:'+bg+'" title="'+esc(v.nom)+' — '+fmtJ(j)+' : '+n+' contact'+(n>1?'s':'')+'"></td>';
    }
    h += '<td class="tot">'+v.tot+'</td></tr>';
  }
  h += '</tbody></table></div></div>';
  return h;
}

// --- SÉLECTEUR DE PLAGE : un calendrier, deux clics ---------------------------
// 1er clic = date de début, 2e clic = date de fin (inversées si besoin), puis
// rechargement AUTOMATIQUE (plus de bouton Appliquer). Survol = aperçu de la
// plage. Clic en dehors = fermeture sans changement. Le popup vit dans body
// (au-dessus de tout), son CSS est donc préfixé #act-dp et non #act-root.
function closeRangePicker() {
  const e = doc.getElementById('act-dp'); if (e) e.remove();
  if (window.__actDpOutside) { doc.removeEventListener('mousedown', window.__actDpOutside, true); window.__actDpOutside = null; }
}
function applyPeriod(from, to) {
  closeRangePicker();
  if (!from || !to) return;
  if (from === state.period.from && to === state.period.to) return;
  state.period.from = from; state.period.to = to;
  state.rawData = null; state.loadKey = null;
  state.selection = { level:'all', key:null, label:'Tout le périmètre' };
  state.busSelPending = true;   // re-focalisation sur le site global après refetch
  loadData();
}
function openRangePicker(anchor) {
  closeRangePicker();
  const pk = { month: null, start: null, end: null, hover: null };
  const m0 = new Date(state.period.from + 'T12:00:00');
  pk.month = new Date(m0.getFullYear(), m0.getMonth(), 1);

  const pop = doc.createElement('div'); pop.id = 'act-dp';
  const r = anchor.getBoundingClientRect();
  pop.style.cssText = 'position:fixed;z-index:9999;top:' + (r.bottom + 6) + 'px;left:' + Math.max(8, r.left) + 'px';
  injectDpStyle();
  doc.body.appendChild(pop);

  function calHtml() {
    const y = pk.month.getFullYear(), m = pk.month.getMonth();
    const first = new Date(y, m, 1);
    const startIdx = (first.getDay() + 6) % 7;       // semaine qui commence lundi
    const nbDays = new Date(y, m + 1, 0).getDate();
    const today = ymd(new Date());
    // Aperçu de plage : début sélectionné + (fin OU jour survolé)
    const selA = pk.start, selB = pk.end || pk.hover;
    const lo = selA && selB ? (selA < selB ? selA : selB) : null;
    const hi = selA && selB ? (selA < selB ? selB : selA) : null;
    let h = '<div class="act-dp-box">';
    h += '<div class="act-dp-head"><button type="button" data-nav="-1">‹</button>'+
         '<span>' + esc(first.toLocaleDateString('fr-FR', { month:'long', year:'numeric' })) + '</span>'+
         '<button type="button" data-nav="1">›</button></div>';
    h += '<div class="act-dp-grid">';
    for (const d of ['L','M','M','J','V','S','D']) h += '<span class="act-dp-dow">' + d + '</span>';
    for (let i = 0; i < startIdx; i++) h += '<span></span>';
    for (let d = 1; d <= nbDays; d++) {
      const ds = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      let cls = 'act-dp-day';
      if (ds === today) cls += ' today';
      if (pk.start === ds || pk.end === ds) cls += ' sel';
      else if (lo && hi && ds > lo && ds < hi) cls += ' inr';
      h += '<span class="' + cls + '" data-d="' + ds + '">' + d + '</span>';
    }
    h += '</div>';
    h += '<div class="act-dp-foot">' + (pk.start ? 'Cliquez la date de fin' : 'Cliquez la date de début') + '</div>';
    h += '</div>';
    return h;
  }
  function wire() {
    pop.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      pk.month = new Date(pk.month.getFullYear(), pk.month.getMonth() + Number(b.getAttribute('data-nav')), 1);
      paint();
    }));
    pop.querySelectorAll('.act-dp-day').forEach(c => {
      c.addEventListener('click', () => {
        const ds = c.getAttribute('data-d');
        if (!pk.start || pk.end) { pk.start = ds; pk.end = null; pk.hover = null; paint(); return; }
        pk.end = ds;
        let a = pk.start, b = pk.end;
        if (b < a) { const t = a; a = b; b = t; }   // clic à l'envers : on inverse
        applyPeriod(a, b);
      });
      c.addEventListener('mouseenter', () => {
        if (pk.start && !pk.end && pk.hover !== c.getAttribute('data-d')) { pk.hover = c.getAttribute('data-d'); paint(); }
      });
    });
  }
  function paint() { pop.innerHTML = calHtml(); wire(); }
  paint();
  window.__actDpOutside = (e) => {
    if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closeRangePicker();
  };
  setTimeout(() => doc.addEventListener('mousedown', window.__actDpOutside, true), 0);
}
function injectDpStyle() {
  if (doc.getElementById('act-dp-style')) return;
  const st = doc.createElement('style'); st.id = 'act-dp-style';
  st.textContent = `
#act-dp .act-dp-box { background:#fff; border:1px solid #eaf0f9; border-radius:10px; box-shadow:0 8px 30px rgba(42,94,169,.18); padding:12px; width:262px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
#act-dp .act-dp-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
#act-dp .act-dp-head span { font-size:12px; font-weight:600; color:#2a5ea9; text-transform:capitalize; }
#act-dp .act-dp-head button { width:24px; height:24px; border:1px solid #eaf0f9; background:#fff; border-radius:6px; cursor:pointer; color:#2a5ea9; font-size:13px; line-height:1; padding:0; }
#act-dp .act-dp-head button:hover { background:#f5f8fc; }
#act-dp .act-dp-grid { display:grid; grid-template-columns:repeat(7,33px); gap:2px; }
#act-dp .act-dp-dow { font-size:9px; color:#acc5e4; text-align:center; font-weight:700; padding-bottom:3px; }
#act-dp .act-dp-day { height:29px; line-height:29px; text-align:center; font-size:11px; color:#2c2c2a; border-radius:6px; cursor:pointer; }
#act-dp .act-dp-day:hover { background:#eaf0f9; }
#act-dp .act-dp-day.today { box-shadow:inset 0 0 0 1px #acc5e4; }
#act-dp .act-dp-day.sel { background:#2a5ea9; color:#fff; font-weight:700; }
#act-dp .act-dp-day.inr { background:#e6f1fb; }
#act-dp .act-dp-foot { margin-top:8px; text-align:center; font-size:10px; color:#7a9cc4; font-style:italic; }
`;
  doc.head.appendChild(st);
}

// --- STYLE ------------------------------------------------------------------
function injectStyle() {
  const ID = 'act-style';
  const ex = doc.getElementById(ID);
  if (ex) ex.remove();
  const st = doc.createElement('style');
  st.id = ID;
  st.textContent = `
#act-root { --green:#53bda7; --blue-lt:#acc5e4; --orange:#fac055; --blue-dk:#2a5ea9;
  --bg:#fafbfd; --card:#fff; --border:#eaf0f9; --text:#2a5ea9; --text-mut:#7a9cc4; --text-soft:#4a6a8a; --red:#c4554a;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; font-size:13px; color:var(--text); }
#act-root *, #act-root *::before, #act-root *::after { box-sizing:border-box; }
#act-root .act-bar { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:12px 15px; margin-bottom:16px; display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
#act-root .act-bar-label { font-size:11px; color:var(--text-mut); font-weight:500; text-transform:uppercase; letter-spacing:.5px; }
#act-root .act-range { border:1px solid var(--blue-lt); border-radius:6px; padding:6px 12px; font-size:11px; color:var(--blue-dk); background:#fff; cursor:pointer; font-family:inherit; font-weight:600; display:inline-flex; align-items:center; gap:6px; }
#act-root .act-range:hover { background:#f5f8fc; border-color:var(--blue-dk); }
#act-root .act-range-car { font-size:9px; color:var(--text-mut); }
#act-root .act-date { border:1px solid var(--blue-lt); border-radius:6px; padding:5px 10px; font-size:11px; color:var(--blue-dk); outline:none; font-family:inherit; }
#act-root .act-date:focus { border-color:var(--blue-dk); }
#act-root .act-btn { padding:6px 14px; border-radius:6px; font-size:11px; border:1px solid var(--blue-dk); background:var(--blue-dk); color:#fff; cursor:pointer; font-family:inherit; font-weight:600; }
#act-root .act-btn:hover { background:#1f4a87; }
#act-root .act-sep { width:1px; height:20px; background:var(--border); }
#act-root .act-toggle { display:flex; border:1px solid var(--blue-lt); border-radius:6px; overflow:hidden; }
#act-root .act-toggle button { padding:5px 12px; font-size:11px; border:none; cursor:pointer; background:#fff; color:var(--blue-dk); font-family:inherit; }
#act-root .act-toggle button.active { background:var(--blue-dk); color:#fff; }
#act-root .act-toggle button:not(:last-child) { border-right:1px solid var(--blue-lt); }
#act-root .act-ico-btn { border:1px solid var(--border); background:#fff; border-radius:6px; padding:4px 7px; cursor:pointer; display:inline-flex; align-items:center; line-height:0; }
#act-root .act-ico-btn:hover { background:#f0f7f3; border-color:#9ad9c5; }
#act-root .act-ico-btn.is-busy { opacity:.45; cursor:wait; pointer-events:none; }
#act-root .act-ico-btn.is-err { outline:2px solid #e24b4a; }
#act-root .act-period-resume { font-size:11px; color:var(--text-mut); font-style:italic; margin-left:auto; }
#act-root .act-sel-banner { display:inline-flex; align-items:center; gap:8px; background:var(--blue-dk); color:#fff; padding:6px 12px; border-radius:6px; font-size:12px; }
#act-root .act-sel-banner button { background:rgba(255,255,255,.18); color:#fff; border:none; padding:3px 9px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600; }
#act-root .act-sel-banner button:hover { background:rgba(255,255,255,.3); }
#act-root .act-bus-chip { font-size:10px; color:#085041; background:#e1f5ee; border:1px solid #9ad9c5; border-radius:999px; padding:1px 8px; font-weight:600; }

#act-root .act-card { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:15px; margin-bottom:16px; }
#act-root .act-shead { display:flex; align-items:center; gap:8px; margin-bottom:14px; }
#act-root .act-shead .bar { width:3px; height:17px; flex-shrink:0; }
#act-root .act-shead .title { font-size:13px; font-weight:500; }
#act-root .act-shead .sub { margin-left:auto; font-size:10px; color:var(--blue-lt); }

#act-root .act-kpi-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:10px; }
#act-root .act-kpi { background:#f5f8fc; border-radius:8px; padding:10px 12px; }
#act-root .act-kpi-label { font-size:10px; color:var(--text-mut); margin-bottom:4px; }
#act-root .act-kpi-value { font-size:20px; font-weight:500; line-height:1.1; font-variant-numeric:tabular-nums; }
#act-root .act-kpi-sub { font-size:10px; color:var(--blue-lt); margin-top:2px; }
@media (max-width:1100px){ #act-root .act-kpi-grid{ grid-template-columns:repeat(3,1fr);} }
@media (max-width:900px){ #act-root .act-kpi-grid{ grid-template-columns:repeat(2,1fr);} }

#act-root .act-charts { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }
#act-root .act-chart-wrap { position:relative; height:240px; }
#act-root .act-chart-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
#act-root .act-chart-head .act-sh { margin-bottom:0; }
#act-root .act-mini-toggle { display:flex; border:1px solid #eaf0f9; border-radius:6px; overflow:hidden; flex-shrink:0; }
#act-root .act-mini-btn { padding:3px 9px; font-size:10px; border:none; cursor:pointer; background:#fff; color:#7a9cc4; font-family:inherit; }
#act-root .act-mini-btn.active { background:#2a5ea9; color:#fff; }
#act-root .act-mini-btn:not(:last-child) { border-right:1px solid #eaf0f9; }
@media (max-width:900px){ #act-root .act-charts{ grid-template-columns:1fr;} }

#act-root .act-tree { width:100%; border-collapse:collapse; }
#act-root .act-tree th { font-size:10px; font-weight:600; color:var(--text-mut); text-transform:uppercase; letter-spacing:.4px; padding:8px 10px; background:#f9fbfd; border-bottom:1px solid var(--border); text-align:center; }
#act-root .act-tree th:first-child { text-align:left; }
#act-root .act-tree td { padding:7px 10px; font-size:12px; text-align:center; font-variant-numeric:tabular-nums; border-bottom:.5px solid var(--border); }
#act-root .act-tree td:first-child { text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:340px; }
#act-root .act-tree tr { cursor:pointer; }
#act-root .act-tree tr.lv-reseau  { background:#f5f8fc; }
#act-root .act-tree tr.lv-affaire { background:#fafbfd; }
#act-root .act-tree tr.lv-site    { background:#fff; }
#act-root .act-tree tr.lv-type    { background:#fff; }
#act-root .act-tree tr.lv-vendeur { background:#fff; }
#act-root .act-tree tr:hover { filter:brightness(.97); }
#act-root .act-tree tr.is-selected { background:var(--blue-lt) !important; }
#act-root .act-tree tr.is-selected td:first-child { font-weight:700; color:var(--blue-dk); }
#act-root .act-tree .lv-reseau  td:first-child { color:var(--blue-dk); font-weight:600; }
#act-root .act-tree .lv-affaire td:first-child { color:var(--blue-dk); font-weight:500; padding-left:24px; }
#act-root .act-tree .lv-site    td:first-child { color:var(--text-soft); font-weight:500; padding-left:44px; }
#act-root .act-tree .lv-type    td:first-child { padding-left:64px; }
#act-root .act-tree .lv-vendeur td:first-child { color:var(--text-soft); padding-left:64px; }
#act-root .act-tree .lv-vendeur.deep td:first-child { padding-left:84px; }
#act-root .act-type-chip { font-size:10px; font-weight:700; border-radius:4px; padding:1px 8px; letter-spacing:.4px; }
#act-root .act-type-VN   { background:#e6f1fb; color:#0c447c; }
#act-root .act-type-VO   { background:#faeeda; color:#633806; }
#act-root .act-type-VNVO { background:#e1f5ee; color:#085041; }
#act-root .act-exp { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:3px; background:#eaf0f9; font-size:9px; color:var(--text-mut); margin-right:6px; }
#act-root .act-kpi-warn { color:#b8851a; font-weight:600; }
#act-root .act-kpi-good { color:var(--green); font-weight:600; }
#act-root .act-kpi-zero { color:var(--text-mut); }

#act-root .act-vtable { width:100%; border-collapse:collapse; font-size:12px; table-layout:fixed; }
#act-root .act-vtable th { color:#fff; font-weight:400; padding:7px 10px; font-size:10px; background:var(--blue-dk); }
#act-root .act-vtable th:first-child { text-align:left; border-radius:5px 0 0 5px; }
#act-root .act-vtable th:last-child { border-radius:0 5px 5px 0; }
#act-root .act-vtable td { padding:8px 10px; border-bottom:.5px solid var(--border); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#act-root .act-vtable tr:hover { background:#f5f8fc; }
#act-root .act-bars { display:flex; align-items:flex-end; gap:3px; height:20px; }
#act-root .act-bars .b { width:8px; border-radius:2px 2px 0 0; }
#act-root .act-empty { text-align:center; padding:30px; color:var(--text-mut); font-size:12px; font-style:italic; }
#act-root .act-loading { text-align:center; padding:40px; color:var(--text-mut); font-size:13px; }
#act-root .act-btn2 { padding:6px 12px; border-radius:6px; font-size:11px; border:1px solid var(--blue-lt); background:#fff; color:var(--blue-dk); cursor:pointer; font-family:inherit; font-weight:600; }
#act-root .act-btn2:hover { background:#f5f8fc; }
#act-root .act-btn2.on { background:var(--orange); border-color:var(--orange); color:#633806; }
#act-root .act-tree tr.is-compared { outline:2px solid var(--orange); outline-offset:-2px; }
#act-root .act-cmp-chips { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:12px; }
#act-root .act-cmp-chip { display:inline-flex; align-items:center; gap:7px; background:#faeeda; color:#633806; border:1px solid var(--orange); border-radius:14px; padding:4px 11px; font-size:11px; font-weight:600; }
#act-root .act-cmp-chip b { cursor:pointer; font-weight:700; }
#act-root .act-cmp-grid { display:grid; grid-template-columns:110px 1fr 1fr; gap:6px 14px; align-items:center; }
#act-root .act-cmp-head { font-size:12px; font-weight:700; color:var(--blue-dk); text-align:center; padding-bottom:4px; border-bottom:1px solid var(--border); }
#act-root .act-cmp-lbl { font-size:11px; color:var(--text-mut); text-transform:uppercase; letter-spacing:.4px; }
#act-root .act-cmp-cell { background:#f5f8fc; border-radius:8px; padding:8px 11px; text-align:center; font-size:14px; font-weight:600; color:var(--blue-dk); font-variant-numeric:tabular-nums; }
#act-root .act-cmp-cell.is-win { background:#e1f5ee; box-shadow:inset 0 0 0 1.5px #53bda7; color:#085041; }
@media (max-width:900px){ #act-root .act-cmp-grid{ grid-template-columns:84px 1fr 1fr; } }
#act-root .act-hm-wrap { overflow-x:auto; }
#act-root .act-hm { border-collapse:collapse; }
#act-root .act-hm th { font-size:8px; color:var(--text-mut); font-weight:500; padding:0 1px 4px; text-align:center; min-width:15px; }
#act-root .act-hm th.sun { color:#c4554a; font-weight:700; }
#act-root .act-hm th.nm, #act-root .act-hm td.nm { text-align:left; font-size:11px; color:var(--text-soft); padding-right:10px; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:90px; }
#act-root .act-hm td.cell { width:15px; height:15px; min-width:15px; padding:0; border:1.5px solid #fff; border-radius:3px; }
#act-root .act-hm th.tot, #act-root .act-hm td.tot { font-size:10px; color:var(--blue-dk); font-weight:600; padding-left:8px; text-align:right; }
`;
  doc.head.appendChild(st);
}

// --- KPI helpers visuels ----------------------------------------------------
function shead(color, title, sub) {
  return '<div class="act-shead"><div class="bar" style="background:'+color+'"></div>'+
    '<div class="title" style="color:'+color+'">'+esc(title)+'</div>'+
    (sub ? '<div class="sub">'+esc(sub)+'</div>' : '')+'</div>';
}
function kpiCellsTree(k) {
  const cls = (v, kind) => {
    if (!v) return 'act-kpi-zero';
    if (kind==='chocs' && v>=10) return 'act-kpi-good';
    if (kind==='wins'  && v>=1)  return 'act-kpi-good';
    return '';
  };
  return '<td>'+(k.nb_contacts||0)+'</td>'+
    '<td>'+(k.nb_entrants||0)+'</td>'+
    '<td>'+(k.nb_sortants||0)+'</td>'+
    '<td class="'+cls(k.nb_chocs,'chocs')+'">'+(k.nb_chocs||0)+'</td>'+
    '<td>'+(k.nb_propales_creees||0)+'</td>'+
    '<td class="'+cls(k.nb_wins,'wins')+'">'+(k.nb_wins||0)+'</td>';
}
function expIcon(open) { return '<span class="act-exp">'+(open?'▼':'▶')+'</span>'; }

// --- RENDER -----------------------------------------------------------------
function render() {
  const root = getRoot();
  if (!root) return;
  adoptBusSelectionAct();   // adopte le site du bus dès que possible
  injectStyle();
  let html = '';

  // 1. Barre période + Type + export
  html += '<div class="act-bar">';
  html += '<span class="act-bar-label">Période</span>';
  // Sélecteur de plage : un calendrier, deux clics, rechargement automatique.
  html += '<button type="button" class="act-range" id="act-range">📅 '+esc(fmtPeriod())+' <span class="act-range-car">▾</span></button>';
  if (hasTypes()) {
    html += '<span class="act-sep"></span>';
    html += '<span class="act-bar-label">Type</span>';
    html += '<div class="act-toggle">';
    for (const o of [{k:'ALL',l:'Tous'},{k:'VN',l:'VN'},{k:'VO',l:'VO'},{k:'VNVO',l:'VNVO'}])
      html += '<button type="button" class="'+(state.vnvo===o.k?'active':'')+'" data-vnvo="'+o.k+'">'+o.l+'</button>';
    html += '</div>';
  }
  if (state.rawData !== null && !state.loading) {
    html += '<span class="act-sep"></span>';
    html += '<button type="button" class="act-ico-btn" id="act-export" title="Exporter en Excel">'+
      '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">'+
        '<rect x="2" y="2" width="20" height="20" rx="3.5" fill="#217346"/>'+
        '<path d="M8 7.2l8 9.6M16 7.2l-8 9.6" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>'+
      '</svg></button>';
    html += '<button type="button" class="act-btn2 '+(state.compare.active?'on':'')+'" id="act-cmp-toggle">⇄ Comparer</button>';
  }
  if (state.selection.level !== 'all') {
    const isBusScope = state.selection.level==='site' && String(state.selection.key)===String(state.busSite);
    html += '<span class="act-sel-banner">'+esc(state.selection.label)+
      (isBusScope?' <span class="act-bus-chip">📍 site global</span>':'')+
      ' <button type="button" id="act-clear">✕</button></span>';
  }
  html += '<span class="act-period-resume">'+fmtPeriod()+'</span>';
  html += '</div>';

  if (state.loading || state.rawData === null) {
    html += '<div class="act-loading">Chargement de l\'activité…</div>';
    root.innerHTML = html;
    bind();
    return;
  }
  if (state.error) {
    html += '<div class="act-card"><div class="act-empty">Erreur : '+esc(state.error)+'</div></div>';
    root.innerHTML = html;
    bind();
    return;
  }

  const selRows = rowsForSelection();
  const kpi = sumKpi(selRows);
  const scopeLabel = state.selection.level === 'all' ? 'Tout le périmètre' : state.selection.label;
  const typeSuffix = (state.vnvo !== 'ALL' && hasTypes()) ? ' · ' + state.vnvo : '';

  // 1bis. Comparateur (si actif)
  if (state.compare.active) html += renderCompare();

  // 2. KPIs
  html += '<div class="act-card">';
  html += shead('var(--blue-dk)', 'Résumé — ' + scopeLabel + typeSuffix, fmtPeriod());
  html += '<div class="act-kpi-grid">';
  html += '<div class="act-kpi"><div class="act-kpi-label">Contacts totaux</div><div class="act-kpi-value" style="color:var(--blue-dk)">'+kpi.nb_contacts+'</div><div class="act-kpi-sub">'+kpi.nb_entrants+' entrants · '+kpi.nb_sortants+' sortants</div></div>';
  const pctChoc = kpi.nb_contacts>0 ? Math.round(kpi.nb_chocs/kpi.nb_contacts*100)+'% des contacts' : '—';
  html += '<div class="act-kpi"><div class="act-kpi-label">RDV Choc</div><div class="act-kpi-value" style="color:var(--green)">'+kpi.nb_chocs+'</div><div class="act-kpi-sub">'+pctChoc+'</div></div>';
  const tx = transfoForSelection();
  // Propales créées (total, updated_at) = propale+bdc+win+lose ; décomposé en BDC/Wins/Abandons.
  html += '<div class="act-kpi"><div class="act-kpi-label">Propales créées</div><div class="act-kpi-value" style="color:var(--blue-dk)">'+tx.totalPropales+'</div><div class="act-kpi-sub">'+tx.nbPropale+' en cours</div></div>';
  const pctBdc = tx.totalPropales>0 ? Math.round(tx.nbBdc/tx.totalPropales*100)+'% des propales' : '—';
  html += '<div class="act-kpi"><div class="act-kpi-label">BDC</div><div class="act-kpi-value" style="color:var(--orange)">'+tx.nbBdc+'</div><div class="act-kpi-sub">'+pctBdc+'</div></div>';
  const tauxWin = tx.total > 0 ? 'Transfo ' + tx.pct + '%' : '—';
  html += '<div class="act-kpi"><div class="act-kpi-label">Wins</div><div class="act-kpi-value" style="color:var(--green)">'+tx.nbWins+'</div><div class="act-kpi-sub">'+tauxWin+'</div></div>';
  const pctAb = tx.totalPropales>0 ? Math.round(tx.nbLose/tx.totalPropales*100)+'% des propales' : '—';
  html += '<div class="act-kpi"><div class="act-kpi-label">Abandons</div><div class="act-kpi-value" style="color:var(--red)">'+tx.nbLose+'</div><div class="act-kpi-sub">'+pctAb+'</div></div>';
  html += '</div></div>';

  // 3. Graphes
  const sensBtns = [['total','Total'],['entrants','Entrants'],['sortants','Sortants']]
    .map(o => '<button type="button" class="act-mini-btn '+(state.contactsSens===o[0]?'active':'')+'" data-csens="'+o[0]+'">'+o[1]+'</button>').join('');
  const mm7Btn = '<div class="act-mini-toggle" style="margin-left:6px"><button type="button" class="act-mini-btn '+(state.contactsMM7?'active':'')+'" data-mm7="1" title="Moyenne mobile 7 jours : lisse le bruit quotidien pour lire la tendance">MM 7j</button></div>';
  const pipeBtns = [['cumul','Cumulé'],['jour','Quotidien']]
    .map(o => '<button type="button" class="act-mini-btn '+(state.pipelineMode===o[0]?'active':'')+'" data-pmode="'+o[0]+'">'+o[1]+'</button>').join('');

  html += '<div class="act-charts">';
  html += '<div class="act-card" style="margin-bottom:0">'+
            '<div class="act-chart-head">'+shead('var(--blue-dk)','Contacts / jour / vendeur')+'<div style="display:flex;align-items:center"><div class="act-mini-toggle">'+sensBtns+'</div>'+mm7Btn+'</div></div>'+
            '<div class="act-chart-wrap"><canvas id="act-c1"></canvas></div></div>';
  html += '<div class="act-card" style="margin-bottom:0">'+
            '<div class="act-chart-head">'+shead('var(--green)','Pipeline dans le temps')+'<div class="act-mini-toggle">'+pipeBtns+'</div></div>'+
            '<div class="act-chart-wrap"><canvas id="act-c2"></canvas></div></div>';
  html += '</div>';

  // 4. Arbre hiérarchique
  html += '<div class="act-card">';
  html += shead('var(--blue-dk)', 'Périmètre',
    state.compare.active ? 'MODE COMPARAISON : cliquez 2 lignes' : 'Cliquez une ligne pour filtrer · un SITE devient le site global');
  html += renderTree();
  html += '</div>';

  // 5. Heatmap cadence + détail vendeur si site/type/vendeur
  if (state.selection.level === 'site' || state.selection.level === 'vntype' || state.selection.level === 'vendeur') {
    html += renderHeatmap(selRows);
    html += '<div class="act-card">';
    html += shead('#b8851a', 'Activité par vendeur — ' + scopeLabel, 'Trié par contacts décroissant');
    html += renderVendeurTable(byVendeur(selRows));
    html += '</div>';
  }

  root.innerHTML = html;
  bind();
  setTimeout(drawCharts, 0);
}

function renderTree() {
  const tree = buildTree(baseRows());
  if (!tree.length) return '<div class="act-empty">Aucune donnée sur la période.</div>';
  const sel = state.selection;
  const isSel = (level, key) => sel.level === level && String(sel.key) === String(key);
  const isCmp = (level, key) => state.compare.active && state.compare.items.some(x => x.level === level && String(x.key) === String(key));
  const cls2 = (level, key) => (isSel(level,key)?'is-selected':'')+(isCmp(level,key)?' is-compared':'');
  const collapseReseau = tree.length === 1;

  let rows = '';
  for (const R of tree) {
    const rKey = 'r:'+R.key;
    const rOpen = !!state.expanded[rKey] || collapseReseau;
    if (!collapseReseau) {
      rows += '<tr class="lv-reseau '+cls2('reseau',R.key)+'" data-exp="'+esc(rKey)+'" data-sel-level="reseau" data-sel-key="'+esc(R.key)+'" data-sel-label="'+esc(R.label)+'">'+
        '<td>'+expIcon(rOpen)+esc(R.label)+'</td>'+kpiCellsTree(R.kpi)+'</tr>';
    }
    if (!rOpen) continue;
    const collapseAff = collapseReseau && R.affaires.length === 1;
    for (const A of R.affaires) {
      const aKey = rKey+'|a:'+A.key;
      const aOpen = !!state.expanded[aKey] || collapseAff;
      if (!collapseAff) {
        rows += '<tr class="lv-affaire '+cls2('affaire',A.key)+'" data-exp="'+esc(aKey)+'" data-sel-level="affaire" data-sel-key="'+esc(A.key)+'" data-sel-label="'+esc(A.label)+'">'+
          '<td>'+expIcon(aOpen)+esc(A.label)+'</td>'+kpiCellsTree(A.kpi)+'</tr>';
      }
      if (!aOpen) continue;
      for (const S of A.sites) {
        const sKey = aKey+'|s:'+S.key;
        const sOpen = !!state.expanded[sKey];
        rows += '<tr class="lv-site '+cls2('site',S.key)+'" data-exp="'+esc(sKey)+'" data-sel-level="site" data-sel-key="'+esc(S.key)+'" data-sel-label="'+esc(S.label)+'">'+
          '<td>'+expIcon(sOpen)+esc(S.label)+'</td>'+kpiCellsTree(S.kpi)+'</tr>';
        if (!sOpen) continue;
        // Niveau TYPE (VN/VO/VNVO) : affiché seulement si le site en compte
        // plusieurs ; sinon aplati (vendeurs directement sous le site).
        const collapseT = S.types.length === 1;
        let anyVendeur = false;
        for (const T of S.types) {
          const tKey = sKey+'|t:'+T.key;
          const tOpen = !!state.expanded[tKey] || collapseT;
          const tSelKey = S.key+'~~'+T.key;
          if (!collapseT) {
            rows += '<tr class="lv-type '+cls2('vntype',tSelKey)+'" data-exp="'+esc(tKey)+'" data-sel-level="vntype" data-sel-key="'+esc(tSelKey)+'" data-sel-label="'+esc(T.label+' — '+S.label)+'">'+
              '<td>'+expIcon(tOpen)+'<span class="act-type-chip act-type-'+esc(T.key)+'">'+esc(T.label)+'</span></td>'+kpiCellsTree(T.kpi)+'</tr>';
          }
          if (!tOpen) continue;
          for (const V of T.vendeurs) {
            anyVendeur = true;
            rows += '<tr class="lv-vendeur'+(collapseT?'':' deep')+' '+cls2('vendeur',V.key)+'" data-sel-level="vendeur" data-sel-key="'+esc(V.key)+'" data-sel-label="'+esc(V.label)+'">'+
              '<td>'+esc(V.label)+'</td>'+kpiCellsTree(V.kpi)+'</tr>';
          }
        }
        if (!anyVendeur && S.types.every(t => !state.expanded[sKey+'|t:'+t.key] && S.types.length === 1)) {
          rows += '<tr class="lv-vendeur"><td style="font-style:italic;color:var(--text-mut)">Aucun vendeur</td><td colspan="5"></td></tr>';
        }
      }
    }
  }
  return '<table class="act-tree"><thead><tr><th>Périmètre</th><th>Contacts</th><th>Entrants</th><th>Sortants</th><th>Chocs</th><th>Propales</th><th>Wins</th></tr></thead><tbody>'+rows+'</tbody></table>';
}

function renderVendeurTable(vendeurs) {
  if (!vendeurs.length) return '<div class="act-empty">Aucun vendeur dans ce périmètre.</div>';
  const showType = hasTypes();
  const maxCanal = (v) => Math.max(v.nb_voip, v.nb_whatsapp, v.nb_sms, v.nb_rpv, 1);
  let rows = '';
  for (const v of vendeurs) {
    const scale = 18 / maxCanal(v);
    const bar = (val,color) => '<div class="b" style="background:'+color+';height:'+Math.max(2,Math.round((val||0)*scale))+'px"></div>';
    const bars = '<div class="act-bars">'+bar(v.nb_voip,'#2a5ea9')+bar(v.nb_whatsapp,'#53bda7')+bar(v.nb_sms,'#fac055')+bar(v.nb_rpv,'#c4554a')+'</div>';
    const typeChip = showType && v.vn_vo && v.vn_vo !== '—'
      ? ' <span class="act-type-chip act-type-'+esc(v.vn_vo)+'">'+esc(v.vn_vo)+'</span>' : '';
    rows += '<tr>'+
      '<td style="font-weight:500;color:var(--blue-dk)">'+esc(v.nom_complet)+typeChip+'</td>'+
      '<td style="text-align:center;font-weight:500;color:var(--blue-dk)">'+v.nb_contacts+'</td>'+
      '<td style="text-align:center;color:var(--green)">'+v.nb_entrants+'</td>'+
      '<td style="text-align:center;color:var(--text-soft)">'+v.nb_sortants+'</td>'+
      '<td>'+bars+'</td>'+
      '<td style="text-align:center;color:var(--green);font-weight:500">'+v.nb_chocs+'</td>'+
      '<td style="text-align:center;color:var(--text-soft)">'+v.nb_relances+'</td>'+
      '<td style="text-align:center;color:var(--red)">'+v.nb_abandons+'</td>'+
      '<td style="text-align:center;color:var(--blue-dk);font-weight:500">'+v.nb_propales_creees+'</td>'+
      '<td style="text-align:center;color:var(--blue-dk)">'+v.nb_bdc+'</td>'+
      '<td style="text-align:center;color:var(--green);font-weight:500">'+v.nb_wins+'</td>'+
    '</tr>';
  }
  return '<table class="act-vtable"><colgroup>'+
    '<col style="width:170px"><col style="width:70px"><col style="width:80px"><col style="width:80px"><col style="width:90px"><col style="width:70px"><col style="width:80px"><col style="width:80px"><col style="width:80px"><col style="width:60px"><col style="width:60px">'+
    '</colgroup><thead><tr><th>Vendeur</th><th>Contacts</th><th>Entrants</th><th>Sortants</th><th>Mix canal</th><th>Chocs</th><th>Relances</th><th>Abandons</th><th>Propales</th><th>BDC</th><th>Wins</th></tr></thead><tbody>'+rows+'</tbody></table>';
}

// --- GRAPHES Chart.js -------------------------------------------------------
let __c1 = null, __c2 = null;
function loadChartJs() {
  const win = doc.defaultView || window;
  if (win.Chart) return Promise.resolve(win.Chart);
  if (window.__chartjsPromise) return window.__chartjsPromise;
  window.__chartjsPromise = new Promise((resolve, reject) => {
    const s = doc.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
    s.onload = () => resolve((doc.defaultView || window).Chart);
    s.onerror = (e) => { window.__chartjsPromise = null; reject(e); };
    doc.head.appendChild(s);
  });
  return window.__chartjsPromise;
}
async function ensureChart() {
  if (state.loading || state.rawData === null) return null;
  try { return await loadChartJs(); } catch(e){ console.error('[activite] Chart.js', e); return null; }
}

// ----- Graphe 1 : Contacts / jour — PAIRS du niveau + moyenne parent -----
async function drawContactsChart() {
  const Chart = await ensureChart();
  if (!Chart) return;
  if (__c1) { try{__c1.destroy();}catch(e){} __c1=null; }
  const c1 = doc.getElementById('act-c1');
  if (!c1) return;

  const sens = state.contactsSens; // 'total' | 'entrants' | 'sortants'
  const bjp = byJourPairs(baseRows());
  const cl = bjp.jours.map(j => { const d=new Date(j+'T12:00:00'); return d.getDate()+'/'+(d.getMonth()+1); });
  const palette = ['#2a5ea9','#53bda7','#acc5e4','#7a9cc4','#c4554a','#0c447c','#085041','#5b7fb0','#8aa9d6','#3d8f7d','#b07fc4','#c49a55','#7dc4a0','#a0b8e0','#d6857d'];
  const datasets = [];
  // Moyenne mobile 7 jours (fenêtre glissante sur les jours affichés).
  const mm7 = (arr) => arr.map((_, i) => {
    const w = arr.slice(Math.max(0, i - 6), i + 1);
    return Math.round(w.reduce((a, b) => a + b, 0) / w.length * 10) / 10;
  });
  const smooth = (arr) => state.contactsMM7 ? mm7(arr) : arr;

  bjp.series.forEach((s, i) => {
    const col = palette[i % palette.length];
    datasets.push({
      label: s.label + (s.selected ? '  ◄' : ''),
      data: smooth(bjp.jours.map(j => (bjp.data[j] && bjp.data[j][s.key]) ? bjp.data[j][s.key][sens] : 0)),
      borderColor: col, backgroundColor: col,
      tension:.3, pointRadius:0, pointHoverRadius:4,
      borderWidth: s.selected ? 3.5 : 1.25,
      order: s.selected ? 0 : 2
    });
  });

  // Moyenne du parent (total du jour / nb d'enfants actifs ce jour) — en ORANGE.
  const moyenne = smooth(bjp.jours.map(j => {
    const dayData = bjp.data[j];
    if (!dayData) return 0;
    const ids = Object.keys(dayData);
    if (!ids.length) return 0;
    let s = 0; for (const id of ids) s += dayData[id][sens];
    return Math.round(s / ids.length * 10) / 10;
  }));
  datasets.push({
    label: 'Moyenne',
    data: moyenne,
    borderColor: '#fac055', backgroundColor: '#fac055',
    tension:.3, pointRadius:0, pointHoverRadius:4, borderWidth:3, borderDash:[6,3], order:1
  });

  __c1 = new Chart(c1.getContext('2d'), {
    type:'line',
    data:{ labels: cl, datasets },
    options:{ responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'nearest', intersect:false },
      plugins:{ legend:{ display:true, position:'bottom', maxHeight:80, labels:{ font:{size:9}, color:'#4a6a8a', usePointStyle:true, pointStyle:'circle', boxWidth:6, boxHeight:6, padding:5 } },
                tooltip:{ callbacks:{ title:items=>'Jour '+items[0].label } } },
      scales:{ x:{ ticks:{font:{size:9},color:'#7a9cc4',maxRotation:0,autoSkip:true,maxTicksLimit:12}, grid:{display:false} },
               y:{ beginAtZero:true, ticks:{font:{size:9},color:'#7a9cc4'}, grid:{color:'#eaf0f9'} } } }
  });
}

// ----- Graphe 2 : Pipeline dans le temps (cumulé ou quotidien) -----
async function drawPipelineChart() {
  const Chart = await ensureChart();
  if (!Chart) return;
  if (__c2) { try{__c2.destroy();}catch(e){} __c2=null; }
  const c2 = doc.getElementById('act-c2');
  if (!c2) return;

  const { jours, data } = transfoByJour();
  if (!jours.length) return;
  const labels = jours.map(j => { const d=new Date(j+'T12:00:00'); return d.getDate()+'/'+(d.getMonth()+1); });
  const cumul = state.pipelineMode === 'cumul';
  const serie = (key) => {
    let acc = 0;
    return jours.map(j => { const v = data[j][key]; if (cumul) { acc += v; return acc; } return v; });
  };
  __c2 = new Chart(c2.getContext('2d'), {
    type:'line',
    data:{ labels, datasets:[
      { label:'Propales créées', data:serie('propales'), borderColor:'#2a5ea9', backgroundColor:'rgba(42,94,169,.08)', tension:.3, pointRadius:cumul?0:3, pointHoverRadius:4, pointBackgroundColor:'#2a5ea9', fill:cumul },
      { label:'BDC', data:serie('bdc'), borderColor:'#fac055', backgroundColor:'rgba(250,192,85,.10)', tension:.3, pointRadius:cumul?0:3, pointHoverRadius:4, pointBackgroundColor:'#fac055', borderDash:[5,3], fill:cumul },
      { label:'Wins', data:serie('wins'), borderColor:'#53bda7', backgroundColor:'rgba(83,189,167,.10)', tension:.3, pointRadius:cumul?0:3, pointHoverRadius:4, pointBackgroundColor:'#53bda7', fill:cumul },
      { label:'Abandons', data:serie('abandons'), borderColor:'#c4554a', backgroundColor:'rgba(196,85,74,.08)', tension:.3, pointRadius:cumul?0:3, pointHoverRadius:4, pointBackgroundColor:'#c4554a', borderDash:[2,2], fill:cumul }
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'bottom', maxHeight:60, labels:{ font:{size:9}, color:'#4a6a8a', usePointStyle:true, pointStyle:'circle', boxWidth:6, boxHeight:6, padding:6 } } },
      scales:{ x:{ ticks:{font:{size:9},color:'#7a9cc4',maxRotation:0,autoSkip:true,maxTicksLimit:12}, grid:{display:false} },
               y:{ beginAtZero:true, ticks:{font:{size:9},color:'#7a9cc4',stepSize:1}, grid:{color:'#eaf0f9'} } } }
  });
}

// Dessine les DEUX graphes (render initial, changement de période ou de sélection).
async function drawCharts() {
  await drawContactsChart();
  await drawPipelineChart();
}
window.__actDrawCharts = drawCharts;

// --- BINDINGS ---------------------------------------------------------------
function bind() {
  const root = getRoot();
  if (!root) return;
  // Sélecteur de plage : ouvre le calendrier ; la sélection des deux dates
  // déclenche applyPeriod() qui recharge automatiquement.
  const rangeBtn = root.querySelector('#act-range');
  if (rangeBtn) rangeBtn.addEventListener('click', () => openRangePicker(rangeBtn));
  const clear = root.querySelector('#act-clear');
  if (clear) clear.addEventListener('click', () => { state.selection = { level:'all', key:null, label:'Tout le périmètre' }; render(); setTimeout(drawCharts,0); });

  // Toggle Type (VN/VO/VNVO) : re-render complet (arbre, KPIs, graphes suivent).
  root.querySelectorAll('[data-vnvo]').forEach(b => b.addEventListener('click', () => {
    state.vnvo = b.getAttribute('data-vnvo');
    render(); setTimeout(drawCharts, 0);
  }));

  // Export Excel
  const exp = root.querySelector('#act-export');
  if (exp) exp.addEventListener('click', () => exportExcel(exp));

  // Comparateur : toggle + suppression de chips
  const cmpT = root.querySelector('#act-cmp-toggle');
  if (cmpT) cmpT.addEventListener('click', () => {
    state.compare.active = !state.compare.active;
    if (!state.compare.active) state.compare.items = [];
    render(); setTimeout(drawCharts, 0);
  });
  root.querySelectorAll('[data-cmp-del]').forEach(b => b.addEventListener('click', () => {
    state.compare.items.splice(Number(b.getAttribute('data-cmp-del')), 1);
    render(); setTimeout(drawCharts, 0);
  }));

  // Moyenne mobile 7 jours : redessine seulement le graphe contacts.
  root.querySelectorAll('[data-mm7]').forEach(b => b.addEventListener('click', () => {
    state.contactsMM7 = !state.contactsMM7;
    b.classList.toggle('active', state.contactsMM7);
    drawContactsChart();
  }));

  // Toggles des graphes : pas de re-render complet, juste le graphe concerné.
  root.querySelectorAll('[data-csens]').forEach(b => b.addEventListener('click', () => {
    state.contactsSens = b.getAttribute('data-csens');
    root.querySelectorAll('[data-csens]').forEach(x => x.classList.toggle('active', x === b));
    drawContactsChart();
  }));
  root.querySelectorAll('[data-pmode]').forEach(b => b.addEventListener('click', () => {
    state.pipelineMode = b.getAttribute('data-pmode');
    root.querySelectorAll('[data-pmode]').forEach(x => x.classList.toggle('active', x === b));
    drawPipelineChart();
  }));

  // Expand/collapse (icône) + sélection (ligne)
  root.querySelectorAll('.act-tree tr[data-sel-level]').forEach(tr => {
    tr.addEventListener('click', (e) => {
      const expKey = tr.getAttribute('data-exp');
      const onIcon = e.target.closest('.act-exp');
      if (onIcon && expKey) {
        e.stopPropagation();
        state.expanded[expKey] = !state.expanded[expKey];
        render(); setTimeout(drawCharts,0);
        return;
      }
      const level = tr.getAttribute('data-sel-level');
      const key   = tr.getAttribute('data-sel-key');
      const label = tr.getAttribute('data-sel-label');
      // MODE COMPARAISON : le clic ajoute/retire l'entité (max 2), sans toucher
      // ni la sélection ni le site global.
      if (state.compare.active) {
        const items = state.compare.items;
        const idx = items.findIndex(x => x.level === level && String(x.key) === String(key));
        if (idx >= 0) items.splice(idx, 1);
        else if (items.length < 2) items.push({ level, key, label });
        else items[1] = { level, key, label };
        render(); setTimeout(drawCharts, 0);
        return;
      }
      // Toggle : reclic sur la sélection courante => retour à 'all'
      if (state.selection.level === level && String(state.selection.key) === String(key)) {
        state.selection = { level:'all', key:null, label:'Tout le périmètre' };
      } else {
        state.selection = { level, key, label };
        if (expKey) state.expanded[expKey] = true; // ouvre le niveau cliqué
        // Niveau SITE : on le définit aussi comme SITE GLOBAL (bus). Les autres
        // niveaux (réseau/affaire/type/vendeur) restent de l'exploration locale.
        if (level === 'site') {
          try { const b = siteBus(); if (b) b.setSiteId(Number(key)); } catch(x) {}
        }
      }
      render(); setTimeout(drawCharts,0);
    });
  });
}

// --- GO ---------------------------------------------------------------------
window.__renderActivite = render;

// Démarrage robuste face au cycle de montage WeWeb (voir v2 pour le détail).
loadData();

(function ensureRendered() {
  const delays = [0, 60, 150, 300, 600, 1000, 1500];
  delays.forEach(function(ms) {
    setTimeout(function() {
      const root = getRoot();
      if (!root) return;
      if (!root.querySelector('.act-bar')) {
        render();
        setTimeout(drawCharts, 0);
      }
    }, ms);
  });

  try {
    const target = getRoot();
    if (target && window.MutationObserver) {
      if (window.__actObserver) { try { window.__actObserver.disconnect(); } catch(e){} }
      const obs = new MutationObserver(function() {
        const root = getRoot();
        if (root && !root.querySelector('.act-bar') && !state.loading) {
          render();
          setTimeout(drawCharts, 0);
        }
      });
      obs.observe(target, { childList: true });
      window.__actObserver = obs;
    }
  } catch(e) { /* observer non critique */ }
})();

}
});
