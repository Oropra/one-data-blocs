// ============================================================================
//  BILATÉRALES — module One Data (OD.define)  v1
//  Rendu dans __anchor ; client via ctx.supabase ; attente d'ancre et filets de
//  re-render retirés (le loader possède le cycle de vie).
//  Popup Réalisation : workflow WeWeb supprimé (WF_GET_FICHE) retiré, client via
//  sa variable + onglet via __odFicheTab, navigation par CHEMIN en prod.
// ============================================================================
// ============================================================================
//  PAGE BILATÉRALES — CRM360
//  Root : #bil-root. Données : RPC get_perimetre_sites + get_bilaterales.
//  Période : variables WeWeb partagées avec le dashboard (début / fin).
//  Flux : arbre périmètre (réseau>affaire>site) -> clic site -> tableau
//         vendeur×mois -> clic cellule -> timeline (profondeur réglable) ->
//         clic carte : modale si "realisee", sinon placeholder page réalisation.
// ============================================================================
OD.define('bilaterales', {
  async mount(__anchor, ctx) {
__anchor.id = 'bil-root';

// --- Variables WeWeb de période (MÊMES que le dashboard) --------------------
const VAR_DATE_FROM = 'cad34621-74a3-4efb-bf37-41cdc467dbef';
const VAR_DATE_TO   = '34a6fc5c-abc8-440e-aa87-cbe1d7b00d83';
// Variable WeWeb remplie par le bouton "Réaliser la Bilatérale" de l'agenda :
// si elle contient un id au chargement, on ouvre directement le popup de réalisation.
const VAR_ID_BILATE_REAL = '851fed59-9397-41ae-b91d-26daa2ff960a';

function ymd(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), j = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + j;
}
function readWwDate(id) {
  try {
    let v = wwLib.wwVariable.getValue(id);
    if (!v) return null;
    if (v instanceof Date) return ymd(v);
    v = String(v);
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  } catch (e) { return null; }
}

const doc = __anchor.ownerDocument || document;
function getRoot() { return __anchor; }

// --- Viewer connecté (MÊME méthode que le dashboard : COLLECTION, pas variable) ---
function getViewerId() {
  if (window.__bilViewerId) return window.__bilViewerId;
  try {
    let uc = (((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser); if (Array.isArray(uc)) uc = uc[0]; uc = uc || {};
    if (uc.ID_User != null) return Number(uc.ID_User);
  } catch (e) {}
  return null;
}
function getViewerName() {
  try {
    let uc = (((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser); if (Array.isArray(uc)) uc = uc[0]; uc = uc || {};
    return uc.nomComplet || '';
  } catch (e) { return ''; }
}
// Rôle du viewer : Admin(1), Directeur(2), Chef ventes(3), Vendeur(4),
// Dir plaque(6), Dir marque(7), Dir groupe(8). La "direction" (>= directeur)
// accède à la vue d'évaluation des chefs des ventes.
const DIRECTION_ROLES = [1, 2, 6, 7, 8];
function getViewerRole() {
  try {
    let uc = (((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser); if (Array.isArray(uc)) uc = uc[0]; uc = uc || {};
    if (uc.ID_Role != null) return Number(uc.ID_Role);
  } catch (e) {}
  return null;
}
function isDirection() { return DIRECTION_ROLES.includes(getViewerRole()); }
  // Vendeur (rôle 4) : interface personnelle, pas la vue chef/direction.
  const VENDEUR_ROLE = 4;
  function isVendeur() { return getViewerRole() === VENDEUR_ROLE; }
  function daysSinceTs(ts) { if (!ts) return null; const d = new Date(String(ts).replace(' ', 'T')); if (isNaN(d)) return null; return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000)); }

// --- État -------------------------------------------------------------------
const state = window.__bil || {};
if (state.period === undefined) {
  const now = new Date(), firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  // Période AUTONOME : le sélecteur de dates de cette page pilote state.period.
  // On ignore volontairement les variables WeWeb partagées (pas de sélecteur externe
  // sur cette page). Défaut = du 1er du mois courant à aujourd'hui.
  state.period = { from: ymd(firstOfMonth), to: ymd(now) };
}
if (state.sites === undefined)   state.sites = null;   // périmètre (arbre)
if (state.bils === undefined)    state.bils = null;    // bilatérales détaillées
if (state.loading === undefined) state.loading = false;
if (state.error === undefined)   state.error = null;
// Navigation TOUJOURS réinitialisée à l'arrivée sur la page (arbre tout replié,
// aucune sélection) — sinon l'état persiste via window.__bil entre deux visites.
state.selSite = null;        // périmètre sélectionné (le plus profond non nul = niveau)
state.selReseau = null;
state.selAffaire = null;
state.expanded = {};         // dépli de l'arbre (sélecteur de périmètre)
state.chefFocus = null;      // équipe d'un chef ciblée dans l'onglet "Bilatérales du site"
state.view = 'main';         // 'main' (onglets contextuels) | 'timeline' (drill vendeur)
state.tab = 'prio';          // onglet courant : 'prio' | 'site' | 'enc'
state.autoTargeted = false;  // refait l'auto-ciblage du périmètre à chaque arrivée
state.tlVend = null;
state.tlMonth = null;
state.tlDepth = 1;
state.cadence = null;
state.cadenceError = null;
state.prioFocus = 'tous';    // filtre de la file de priorité (rôle chef)
state.suiviSearch = '';
state.suiviSort = 'tenue';
state.tenueMap = null;
state.chefs = null;
state.chefsError = null;
state.chefSort = 'reg';
window.__bil = state;

// --- Utilitaires ------------------------------------------------------------
function esc(s){ if(s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
const MOIS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const BP_CAL_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
function monthKey(d){ return d.slice(0,7); }                 // 'YYYY-MM' depuis un timestamp/date string
function monthLabel(key){ const [y,m]=key.split('-'); return MOIS_FR[Number(m)-1]; }
function monthsInRange(from, to){                            // liste des 'YYYY-MM' entre from et to inclus
  const a=[]; let d=new Date(from.slice(0,7)+'-01T00:00:00');
  const end=new Date(to.slice(0,7)+'-01T00:00:00');
  while(d<=end){ a.push(ymd(d).slice(0,7)); d=new Date(d.getFullYear(), d.getMonth()+1, 1); }
  return a;
}
function fmtDate(ts){ // '2026-05-19 17:00:00' -> '19 mai 2026'
  if(!ts) return ''; const d=new Date(ts.replace(' ','T'));
  return d.getDate()+' '+MOIS_FR[d.getMonth()]+' '+d.getFullYear();
}
function fmtHeure(ts){ if(!ts) return ''; const d=new Date(ts.replace(' ','T')); return String(d.getHours()).padStart(2,'0')+'h'+String(d.getMinutes()).padStart(2,'0'); }
function dureeMin(b){ // minutes depuis start/end (fiable), sinon null
  if(!b.start_date||!b.end_date) return null;
  const s=new Date(b.start_date.replace(' ','T')), e=new Date(b.end_date.replace(' ','T'));
  const m=Math.round((e-s)/60000); return (m>0&&m<600)?m:null;
}
// Statut fiabilisé (D) : programmée si à venir ; sinon réalisée si un champ du CR
// est rempli (résultat / actions / engagement) ; sinon en retard. Calculé côté JS
// pour ne pas dépendre de l'heuristique de get_bilaterales.
function computeStatut(b){
  const future = b.start_date && new Date(String(b.start_date).replace(' ','T')) > new Date();
  if (future) return 'programmee';
  const filled = (b.resultat && String(b.resultat).trim()) ||
                 (b.actions && String(b.actions).trim()) ||
                 (b.engagement && String(b.engagement).trim());
  return filled ? 'realisee' : 'retard';
}
// Fin du mois d'une date 'YYYY-MM-..' -> 'YYYY-MM-JJ' (dernier jour du mois).
function endOfMonth(dstr){
  const d = new Date(dstr.slice(0,7) + '-01T00:00:00');
  const e = new Date(d.getFullYear(), d.getMonth()+1, 0);
  return ymd(e);
}

// --- Chargement RPC ---------------------------------------------------------
async function loadData() {
  window.__bilLoadData = loadData;
  const viewer = getViewerId();
  if (viewer == null) { state.error = 'Utilisateur non identifié'; render(); return; }
  if (state.loading) return;
  state.loading = true; state.error = null; render();
  try {
    const supabase = ctx.supabase;
    // Pour le suivi/timeline, on élargit la borne haute afin d'inclure les bilatérales
    // PROGRAMMÉES à venir — pas seulement dans le mois courant, mais aussi les mois
    // suivants — pour pouvoir les ouvrir et les réaliser depuis la timeline.
    const FUTURE_HORIZON_MOIS = 3;
    const _toD = new Date(state.period.to.slice(0, 7) + '-01T00:00:00');
    const bilTo = endOfMonth(ymd(new Date(_toD.getFullYear(), _toD.getMonth() + FUTURE_HORIZON_MOIS, 1)));
    // Borne BASSE élargie UNIQUEMENT pour get_bilaterales : la timeline / la réalisation
    // ont besoin de l'historique des bilatérales RÉALISÉES, qui sont antérieures à la
    // période en cours. On recule donc de HISTORIQUE_MOIS mois. Les RPC de cadence et de
    // chefs, eux, gardent state.period.from pour les KPI de couverture ("vus ce mois").
    const HISTORIQUE_MOIS = 12;
    const _fromD = new Date(state.period.from.slice(0, 7) + '-01T00:00:00');
    const bilFrom = ymd(new Date(_fromD.getFullYear(), _fromD.getMonth() - HISTORIQUE_MOIS, 1));
    const dir = isDirection();
    const [rSites, rBils, rCad, rTenue, rChefs] = await Promise.all([
      supabase.rpc('get_perimetre_sites', { p_viewer_id_user: viewer }),
      supabase.rpc('get_bilaterales', { p_viewer_id_user: viewer, p_date_from: bilFrom, p_date_to: bilTo }),
      supabase.rpc('get_cadence_bilaterales', { p_viewer_id_user: viewer, p_date_from: state.period.from, p_date_to: state.period.to }),
      supabase.rpc('get_bilaterale_tenue_vendeurs', { p_viewer_id_user: viewer }),
      dir ? supabase.rpc('get_chefs_bilaterales', { p_viewer_id_user: viewer, p_date_from: state.period.from, p_date_to: state.period.to })
          : Promise.resolve({ data: [], error: null })
    ]);
    if (rSites.error) throw rSites.error;
    if (rBils.error)  throw rBils.error;
    // La file de priorité est "best effort" : son échec n'empêche pas la page.
    if (rCad.error) {
      console.warn('[bilaterales] cadence', rCad.error);
      state.cadence = []; state.cadenceError = rCad.error.message || String(rCad.error);
    } else {
      state.cadence = (rCad.data || []).map(r => ({
        id_user: Number(r.id_user), nom_vendeur: r.nom_vendeur, vn_vo: (r.vn_vo || '').toUpperCase(),
        id_site: Number(r.id_site), nom_site: r.nom_site, affaire: r.affaire, reseau: r.reseau,
        last_bilaterale_at: r.last_bilaterale_at,
        next_bilaterale_at: r.next_bilaterale_at,
        jours_depuis_bilat: r.jours_depuis_bilat != null ? Number(r.jours_depuis_bilat) : null,
        nb_bilaterales_periode: Number(r.nb_bilaterales_periode || 0),
        nb_retard: Number(r.nb_retard || 0),
        rpv_en_retard: Number(r.rpv_en_retard || 0),
        nb_propales_ouvertes: Number(r.nb_propales_ouvertes || 0),
        transfo_actuel: r.transfo_actuel != null ? Number(r.transfo_actuel) : null,
        transfo_precedent: r.transfo_precedent != null ? Number(r.transfo_precedent) : null,
        transfo_tendance: Number(r.transfo_tendance || 0)
      }));
      state.cadenceError = null;
    }
    // Tenue des engagements par vendeur (toujours chargée)
    state.tenueMap = {};
    if (!rTenue.error) {
      (rTenue.data || []).forEach(r => {
        state.tenueMap[Number(r.id_user)] = {
          tenu: Number(r.eng_tenu || 0), partiel: Number(r.eng_partiel || 0),
          non_tenu: Number(r.eng_non_tenu || 0), en_cours: Number(r.eng_en_cours || 0)
        };
      });
    } else { console.warn('[bilaterales] tenue', rTenue.error); }
    // Évaluation des chefs (direction uniquement)
    if (rChefs.error) {
      console.warn('[bilaterales] chefs', rChefs.error);
      state.chefs = []; state.chefsError = rChefs.error.message || String(rChefs.error);
    } else {
      state.chefs = (rChefs.data || []).map(c => ({
        id_manager: Number(c.id_manager), nom_chef: c.nom_chef, nom_site: c.nom_site,
        team_size: Number(c.team_size || 0), vus_periode: Number(c.vus_periode || 0),
        couverture: Number(c.couverture || 0), volume: Number(c.volume || 0),
        delai_moyen: c.delai_moyen != null ? Number(c.delai_moyen) : null,
        eng: { tenu: Number(c.eng_tenu || 0), partiel: Number(c.eng_partiel || 0), non_tenu: Number(c.eng_non_tenu || 0), en_cours: Number(c.eng_en_cours || 0) },
        regularite: Array.isArray(c.regularite) ? c.regularite.map(x => Number(x)) : [0, 0, 0, 0, 0, 0]
      }));
      state.chefsError = null;
    }
    state.sites = (rSites.data || []).map(s => ({
      id_site: Number(s.id_site), nom_site: s.nom_site,
      id_affaire: s.id_affaire != null ? Number(s.id_affaire) : null,
      affaire: s.affaire || '(Sans affaire)', reseau: s.reseau || '(Sans réseau)'
    }));
    state.bils = (rBils.data || []).map(b => ({
      id: Number(b.id_bilaterales), id_user: Number(b.id_user), nom_vendeur: b.nom_vendeur,
      id_manager: Number(b.id_manager), nom_chef: b.nom_chef,
      id_site: Number(b.id_site), nom_site: b.nom_site,
      id_affaire: b.id_affaire != null ? Number(b.id_affaire) : null, affaire: b.affaire, reseau: b.reseau,
      vn_vo: (b.vn_vo || '').toUpperCase(),
      start_date: b.start_date, end_date: b.end_date, duree: b.duree,
      resultat: b.resultat, actions: b.actions, engagement: b.engagement,
      statut: computeStatut(b), mois: b.start_date ? monthKey(b.start_date) : null
    }));
    // Auto-ciblage : si le périmètre est restreint, on déplie/cible directement
    // (un chef sur une seule affaire arrive sur cette affaire, pas sur la racine).
    autoTargetPerimetre();
  } catch (e) {
    console.error('[bilaterales] RPC', e);
    state.error = (e && e.message) ? e.message : String(e);
    state.sites = state.sites || []; state.bils = state.bils || [];
  } finally {
    state.loading = false; render();
  }
}

// --- Rendu : coquille -------------------------------------------------------
function shell(inner){ return '<div class="bil">' + STYLE + inner + '</div>'; }

function render() {
  const root = getRoot(); if (!root) return;
  if (state.loading || state.sites === null) { root.innerHTML = shell('<div class="bil-load">Chargement des bilatérales…</div>'); return; }
  if (state.error) { root.innerHTML = shell('<div class="bil-err">Erreur : ' + esc(state.error) + '</div>'); return; }
  if (isVendeur()) { root.innerHTML = shell(renderVendeurSelf()); return; }
  if (activeTab() !== 'site') state.chefFocus = null;
  let body = renderPerimPanel();
  if (state.view === 'timeline') {
    body += renderTimeline();
  } else {
    body += renderTabs();
    const t = activeTab();
    if (t === 'prio')      body += renderPriorite();
    else if (t === 'site') body += renderSuivi();
    else if (t === 'enc')  body += renderChefs();
  }
  root.innerHTML = shell(body);
}

// Niveau du périmètre sélectionné (le plus profond non nul).
function scopeLevel() {
  if (state.selSite) return 'site';
  if (state.selAffaire) return 'affaire';
  if (state.selReseau) return 'reseau';
  return 'racine';
}
// Onglet effectif : retombe sur "prio" si l'onglet courant n'est pas disponible
// pour le périmètre / le rôle.
function activeTab() {
  let t = state.tab || 'prio';
  if (t === 'site' && scopeLevel() !== 'site') t = 'prio';
  if (t === 'enc' && !isDirection()) t = 'prio';
  return t;
}
function siteOf(id) { return (state.sites || []).find(s => s.id_site === id); }
// Filtre la file de cadence selon le périmètre sélectionné dans l'arbre (même logique
// que leaderboardEntities). Utilisé par la vue "En priorité" du chef pour que le clic
// sur un réseau / une affaire / un site mette à jour KPIs et liste.
function cadInScope() {
  const cad = state.cadence || [];
  const lvl = scopeLevel();
  if (lvl === 'racine') return cad;
  if (lvl === 'site') return cad.filter(c => c.id_site === state.selSite);
  const cadOf = (pred) => cad.filter(c => { const s = siteOf(c.id_site); return s && pred(s); });
  if (lvl === 'reseau') return cadOf(s => s.reseau === state.selReseau);
  if (lvl === 'affaire') { const rk = state.selReseau, ak = String(state.selAffaire.key); return cadOf(s => s.reseau === rk && String(s.id_affaire) === ak); }
  return cad;
}
// Bilatérales EN RETARD "ouvertes" sur la période : passées (start_date < now, donc
// statut 'retard' = ni résultat, ni actions, ni engagement), et NON suivies d'une
// bilatérale RÉALISÉE pour le même vendeur — une réalisée postérieure solde le retard.
// La recherche de "réalisée postérieure" se fait sur tout l'historique chargé (12 mois),
// pas seulement sur la période, pour ne pas compter un retard déjà rattrapé.
function retardsOuvertsPeriode() {
  const bils = state.bils || [];
  const debM = state.period.from.slice(0, 7), finM = state.period.to.slice(0, 7);
  const lastReal = {}; // id_user -> start_date de sa dernière bilatérale réalisée
  for (const b of bils) {
    if (b.statut === 'realisee' && b.start_date && (!lastReal[b.id_user] || b.start_date > lastReal[b.id_user])) {
      lastReal[b.id_user] = b.start_date;
    }
  }
  return bils.filter(b => b.statut === 'retard' && b.mois && b.mois >= debM && b.mois <= finM &&
    (!lastReal[b.id_user] || b.start_date > lastReal[b.id_user]));
}
function scopeLabel() {
  const lvl = scopeLevel();
  if (lvl === 'site') { const s = siteOf(state.selSite); return s ? s.nom_site : 'Site'; }
  if (lvl === 'affaire') return state.selAffaire.label;
  if (lvl === 'reseau') return state.selReseau;
  return 'Tout mon périmètre';
}

// Sélecteur de périmètre : l'arbre est toujours visible, tout s'adapte au clic.

  // ===== INTERFACE VENDEUR (rôle 4) : "Mes bilatérales", lecture seule =====
  function renderVendeurSelf() {
    const me = getViewerId();
    const name = getViewerName() || 'Moi';
    // La vue vendeur reste scopée sur la PÉRIODE en cours (+ ses programmées à venir),
    // indépendamment de l'historique élargi chargé pour la timeline/réalisation, afin que
    // le libellé "période en cours" et le compteur "sur la période" restent exacts.
    const _debMois = state.period.from.slice(0, 7);
    const mine = (state.bils || []).filter(b => b.id_user === me && b.mois && b.mois >= _debMois)
      .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
    const realised = mine.filter(b => b.statut === 'realisee');
    const future = mine.filter(b => b.statut === 'programmee').sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
    const retard = mine.filter(b => b.statut === 'retard');
    const last = realised[0] || null;
    const next = future[0] || null;
    const eng = (state.tenueMap || {})[me] || null;
    const tp = tenuePctOf(eng);

    let h = '<div class="prio-head">Mes bilatérales <span class="prio-sub">' + esc(name) + ' · période en cours</span></div>';
    h += '<div class="prio-kpis">';
    if (last) {
      const j = daysSinceTs(last.start_date); const col = j == null ? '#888780' : (j <= 30 ? '#2c7a68' : (j <= 60 ? '#8a6410' : '#b23433'));
      h += '<div class="pk"><div class="pk-v" style="font-size:18px;color:' + col + '">' + esc(fmtDate(last.start_date)) + '</div><div class="pk-l">dernière bilatérale</div><div class="pk-s">' + (j == null ? '' : 'il y a ' + j + ' j') + (last.nom_chef ? ' · ' + esc(last.nom_chef) : '') + '</div></div>';
    } else {
      h += '<div class="pk"><div class="pk-v" style="color:#b23433">—</div><div class="pk-l">dernière bilatérale</div><div class="pk-s">aucune reçue</div></div>';
    }
    if (next) {
      h += '<div class="pk"><div class="pk-v" style="font-size:18px;color:#2a5ea9">' + esc(fmtDate(next.start_date)) + '</div><div class="pk-l">prochaine</div><div class="pk-s">' + fmtHeure(next.start_date) + (next.nom_chef ? ' · ' + esc(next.nom_chef) : '') + '</div></div>';
    } else {
      h += '<div class="pk"><div class="pk-v" style="color:#b4b2a9">à planifier</div><div class="pk-l">prochaine</div><div class="pk-s">aucune programmée</div></div>';
    }
    h += '<div class="pk"><div class="pk-v" style="color:#2a5ea9">' + mine.length + '</div><div class="pk-l">sur la période</div><div class="pk-s">' + realised.length + ' réalisée' + (realised.length > 1 ? 's' : '') + (retard.length ? ' · ' + retard.length + ' en attente' : '') + '</div></div>';
    const tCol = tp == null ? '#888780' : (tp >= 80 ? '#2c7a68' : (tp >= 60 ? '#8a6410' : '#b23433'));
    h += '<div class="pk"><div class="pk-v" style="color:' + tCol + '">' + (tp == null ? '—' : tp + '%') + '</div><div class="pk-l">mes engagements tenus</div><div class="pk-s">sur 6 mois</div></div>';
    h += '</div>';
    h += renderSelfTimeline(mine);
    return h;
  }
  function renderSelfTimeline(list) {
    if (!list.length) return '<div class="bil-empty">Aucune bilatérale sur la période.</div>';
    let h = '<div class="bil-cat-title" style="color:#2a5ea9">Mes entretiens</div><div class="tl">';
    let i = 0;
    for (const b of list) {
      const side = i % 2 === 0 ? 'left' : 'right'; i++;
      const stTxt = b.statut === 'realisee' ? '✓ Réalisée' : (b.statut === 'programmee' ? '🗓 Programmée' : '⚠ En attente de CR');
      const meta = fmtHeure(b.start_date) + (b.end_date ? ' → ' + fmtHeure(b.end_date) : '');
      const prev = b.statut === 'realisee'
        ? esc((b.resultat || '').slice(0, 160))
        : '<i style="color:#888780">Entretien ' + (b.statut === 'programmee' ? 'à venir' : 'à compléter par votre chef') + (b.nom_chef ? (' · ' + esc(b.nom_chef)) : '') + '.</i>';
      h += '<div class="tl-row ' + side + '">' +
        '<div class="tl-dot ' + b.statut + '"></div>' +
        '<div class="tl-date">' + fmtDate(b.start_date) + '</div>' +
        '<div class="tl-card" data-bil="' + b.id + '">' +
        '<div class="c-vend">avec ' + esc(b.nom_chef || '') + '</div>' +
        '<div class="c-meta">' + meta + '</div>' +
        '<div class="c-prev">' + prev + '</div>' +
        '<span class="c-status ' + b.statut + '">' + stTxt + '</span>' +
        '</div></div>';
    }
    h += '</div>';
    return h;
  }
  function openBilReadonly(b) {
    const root = getRoot(); if (!root) return;
    const meta = 'avec ' + esc(b.nom_chef || '') + ' · ' + fmtDate(b.start_date) + (b.start_date ? (', ' + fmtHeure(b.start_date)) : '');
    const statutLbl = b.statut === 'programmee' ? 'Programmée' : 'En attente de compte-rendu';
    const ov = doc.createElement('div'); ov.className = 'bil-ov'; ov.id = 'bil-ov';
    ov.innerHTML = '<div class="bil-modal"><div class="m-head"><div><div class="m-vend">Bilatérale ' + esc(statutLbl.toLowerCase()) + '</div>' +
      '<div class="m-meta">' + meta + '</div></div><button class="m-close" data-close="1">×</button></div>' +
      '<div class="m-body"><div class="m-sec res"><div class="s-lbl">Statut</div><div class="s-txt">' + esc(statutLbl) +
      (b.statut === 'retard' ? ' — le compte-rendu n\'a pas encore été saisi par votre chef des ventes.' : ' — entretien à venir.') + '</div></div></div></div>';
    root.appendChild(ov);
  }

  // Sélecteur de dates AUTONOME (au-dessus de l'arbre du périmètre).
  // Défaut : 1er du mois courant -> aujourd'hui. Pilote state.period puis recharge.
  // Sélecteur de dates AUTONOME : un seul calendrier, sélection de la plage en 2 clics.
  // 1er clic = début (en attente), 2e clic = fin -> applique la période et recharge.
  function renderDatePicker() {
    const trig = '<button class="bp-trigger" data-dp-toggle="1">' +
        '<span class="bp-cal-ico">' + BP_CAL_SVG + '</span>' +
        '<span class="bp-range-txt">' + esc(fmtDate(state.period.from)) + '<span class="bp-arrow">→</span>' + esc(fmtDate(state.period.to)) + '</span>' +
        '<span class="bp-chev">' + (state.dpOpen ? '▲' : '▼') + '</span>' +
      '</button>';
    let pop = '';
    if (state.dpOpen) {
      pop = '<div class="bp-backdrop" data-dp-close="1"></div>' +
        '<div class="bp-pop">' + renderCalendar() +
          '<div class="bp-pop-foot">' +
            '<span class="bp-hint">' + (state.dpStart ? 'Cliquez la date de <b>fin</b>' : 'Cliquez la date de <b>début</b>') + '</span>' +
            '<span class="bp-presets">' +
              '<button class="bp-preset" data-period-preset="mois">Ce mois</button>' +
              '<button class="bp-preset" data-period-preset="3mois">3 mois</button>' +
              '<button class="bp-preset" data-period-preset="annee">Année</button>' +
            '</span>' +
          '</div>' +
        '</div>';
    }
    return '<div class="bil-period">' +
      '<span class="bp-lbl">Période</span>' +
      '<div class="bp-wrap">' + trig + pop + '</div>' +
    '</div>';
  }

  // Grille calendrier du mois state.dpMonth (semaine commençant le lundi).
  function renderCalendar() {
    const mk = (state.dpMonth || state.period.from.slice(0, 7));
    const y = Number(mk.slice(0, 4)), m = Number(mk.slice(5, 7));
    const daysInMonth = new Date(y, m, 0).getDate();
    let startWd = new Date(y, m - 1, 1).getDay(); // 0=dim..6=sam
    startWd = (startWd + 6) % 7;                  // -> lundi=0
    const todayStr = ymd(new Date());
    const from = state.period.from, to = state.period.to, pend = state.dpStart;
    let h = '<div class="bp-cal">';
    h += '<div class="bp-cal-head">' +
         '<button class="bp-nav" data-dp-nav="prev" title="Mois précédent">‹</button>' +
         '<span class="bp-cal-title">' + MOIS_FR[m - 1] + ' ' + y + '</span>' +
         '<button class="bp-nav" data-dp-nav="next" title="Mois suivant">›</button>' +
         '</div>';
    h += '<div class="bp-cal-grid">';
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach(d => h += '<span class="bp-wd">' + d + '</span>');
    for (let i = 0; i < startWd; i++) h += '<span class="bp-day empty"></span>';
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      let cls = 'bp-day';
      if (pend) { if (ds === pend) cls += ' pending'; }
      else if (from && to) {
        if (ds === from && ds === to) cls += ' sel-single';
        else if (ds === from) cls += ' sel-start';
        else if (ds === to) cls += ' sel-end';
        else if (ds > from && ds < to) cls += ' in-range';
      }
      if (ds === todayStr) cls += ' today';
      h += '<button class="' + cls + '" data-dp-day="' + ds + '">' + d + '</button>';
    }
    h += '</div></div>';
    return h;
  }

  function renderPerimPanel() {
  return renderDatePicker() + '<div class="bil-perim"><div class="perim-title">Périmètre</div>' + renderTree() + '</div>';
}

// Onglets contextuels : En priorité (toujours), Bilatérales du site (si scope=site),
// Encadrement (directeurs+).
function renderTabs() {
  const t = activeTab();
  let h = '<div class="bil-tabs">';
  h += '<span class="bil-tab' + (t === 'prio' ? ' on' : '') + '" data-tab="prio">En priorité</span>';
  if (scopeLevel() === 'site') h += '<span class="bil-tab' + (t === 'site' ? ' on' : '') + '" data-tab="site">Bilatérales du site</span>';
  if (isDirection()) h += '<span class="bil-tab' + (t === 'enc' ? ' on' : '') + '" data-tab="enc">Encadrement</span>';
  h += '</div>';
  return h;
}

// Score de priorité : cadence (jours depuis bilat) + charge (relances/propales) + tendance transfo.
function prioScore(c) {
  if (c.next_bilaterale_at) return -1; // RDV déjà programmé -> action prise, en bas de liste
  let s = 0;
  const j = c.jours_depuis_bilat;
  if (j == null) s += 120;                  // jamais reçu = priorité maximale
  else s += Math.min(j, 120);               // 1 pt / jour, plafonné
  s += (c.nb_retard || 0) * 25;             // bilatérales planifiées non réalisées
  s += (c.rpv_en_retard || 0) * 6;          // relances / RDV en retard
  s += (c.nb_propales_ouvertes || 0) * 3;   // pipeline à challenger
  if (c.transfo_tendance < 0) s += 40;      // performance en baisse
  return s;
}

// ÉTAPE 0 (landing) — file de priorité "qui recevoir"
// "En priorité" : direction -> classement des entités-filles du périmètre, des
// moins performantes aux plus performantes ; chef -> file de ses vendeurs.
function renderPriorite() {
  return isDirection() ? renderPrioLeaderboard() : renderPrioVendeurs();
}

// Agrégats d'une liste de vendeurs (cadence) : couverture + tenue.
function entityMetrics(vs) {
  const total = vs.length;
  const vus = vs.filter(v => (v.nb_bilaterales_periode || 0) > 0).length;
  const cov = total ? Math.round(100 * vus / total) : 0;
  let t = 0, p = 0, n = 0;
  vs.forEach(v => { const e = (state.tenueMap || {})[v.id_user]; if (e) { t += e.tenu; p += e.partiel; n += e.non_tenu; } });
  const d = t + p + n; const tenue = d ? Math.round(100 * (t + 0.5 * p) / d) : null;
  return { total, vus, cov, tenue };
}
function entityScore(m) { return m.tenue == null ? m.cov : Math.round(0.5 * m.cov + 0.5 * m.tenue); }
function chefScore(c) {
  const tp = tenuePctOf(c.eng); const reg = c.regularite.reduce((s, x) => s + x, 0) / 6;
  return Math.round(tp == null ? (0.6 * c.couverture + 0.4 * reg) : (0.4 * c.couverture + 0.4 * tp + 0.2 * reg));
}
function metricColor(p) { return p == null ? '#888780' : (p >= 80 ? '#2c7a68' : (p >= 60 ? '#8a6410' : '#b23433')); }
function scoreBg(s) { return s >= 80 ? 'rgba(83,189,167,.16)' : (s >= 60 ? 'rgba(250,192,85,.22)' : 'rgba(226,75,74,.13)'); }

// Construit les lignes de classement = enfants du périmètre courant.
function leaderboardEntities() {
  const lvl = scopeLevel();
  const sites = state.sites || [];
  const cad = state.cadence || [];
  const cadOf = (pred) => cad.filter(c => { const s = siteOf(c.id_site); return s && pred(s); });
  if (lvl === 'racine') {
    const reseaux = [...new Set(sites.map(s => s.reseau))].sort();
    return reseaux.map(rk => {
      const m = entityMetrics(cadOf(s => s.reseau === rk));
      const nbAff = new Set(sites.filter(s => s.reseau === rk).map(s => String(s.id_affaire))).size;
      return { type: 'reseau', key: rk, label: rk, sub: nbAff + ' affaire' + (nbAff > 1 ? 's' : ''), m, score: entityScore(m), scopeStr: 'reseau:' + rk };
    });
  }
  if (lvl === 'reseau') {
    const rk = state.selReseau;
    const affs = []; const seen = {};
    sites.filter(s => s.reseau === rk).forEach(s => { const k = String(s.id_affaire); if (!seen[k]) { seen[k] = true; affs.push({ key: k, label: s.affaire }); } });
    return affs.map(a => {
      const m = entityMetrics(cadOf(s => s.reseau === rk && String(s.id_affaire) === a.key));
      const nbSites = sites.filter(s => s.reseau === rk && String(s.id_affaire) === a.key).length;
      return { type: 'affaire', key: a.key, label: a.label, sub: nbSites + ' site' + (nbSites > 1 ? 's' : ''), m, score: entityScore(m), scopeStr: 'affaire:' + rk + '|' + a.key };
    });
  }
  if (lvl === 'affaire') {
    const rk = state.selReseau, ak = String(state.selAffaire.key);
    const ss = sites.filter(s => s.reseau === rk && String(s.id_affaire) === ak);
    return ss.map(s => {
      const m = entityMetrics(cad.filter(c => c.id_site === s.id_site));
      return { type: 'site', key: s.id_site, label: s.nom_site, sub: m.total + ' vendeur' + (m.total > 1 ? 's' : ''), m, score: entityScore(m), scopeStr: 'site:' + s.id_site };
    });
  }
  // site -> chefs des ventes de ce site
  const s = siteOf(state.selSite);
  const chefs = (state.chefs || []).filter(c => s && c.nom_site === s.nom_site);
  return chefs.map(c => {
    const tp = tenuePctOf(c.eng);
    return { type: 'chef', key: c.id_manager, label: c.nom_chef, sub: 'chef des ventes' + (c.team_size ? ' · ' + c.vus_periode + '/' + c.team_size + ' vus' : ''), reg: c.regularite, m: { cov: c.couverture, tenue: tp }, score: chefScore(c), scopeStr: 'chef:' + c.id_manager };
  });
}

function renderPrioLeaderboard() {
  if (state.cadence === null) return '<div class="bil-empty">Chargement du classement…</div>';
  const lvl = scopeLevel();
  const childLbl = lvl === 'racine' ? 'réseaux' : (lvl === 'reseau' ? 'affaires' : (lvl === 'affaire' ? 'sites' : 'chefs des ventes'));
  const ents = leaderboardEntities().sort((a, b) => a.score - b.score);
  let h = '<div class="prio-head">En priorité <span class="prio-sub">' + childLbl + ' les moins performant·e·s · ' + esc(scopeLabel()) + '</span></div>';
  h += '<div class="hint-line">Classé·e·s par score d’animation &amp; tenue croissant — cliquez pour descendre d’un niveau.</div>';
  if (!ents.length) return h + '<div class="bil-empty">Aucune entité à classer dans ce périmètre.</div>';
  const showReg = lvl === 'site';
  h += '<div class="bil-hscroll"><div class="bil-hscroll-inner">';
  h += '<div class="lead-head"><div></div><div>' + (lvl === 'site' ? 'Chef des ventes' : childLbl.replace(/^./, x => x.toUpperCase())) + '</div><div>' + (showReg ? 'Régularité 6 mois' : '') + '</div><div>Couverture</div><div>Tenue</div><div></div></div>';
  h += '<div class="lead-list">';
  ents.forEach(e => {
    const sc = e.score, scCol = metricColor(sc);
    h += '<div class="lead-row" data-prio-ent="' + e.scopeStr + '">' +
      '<div class="lead-score" style="color:' + scCol + ';background:' + scoreBg(sc) + '">' + sc + '</div>' +
      '<div class="lead-name">' + esc(e.label) + '<span class="lead-sub">' + esc(e.sub) + '</span></div>' +
      '<div>' + (e.reg ? chefRegStrip(e.reg) : '<span class="lead-na">—</span>') + '</div>' +
      '<div class="lead-metric" style="color:' + metricColor(e.m.cov) + '"><span class="lm-l">couv.</span>' + e.m.cov + '%</div>' +
      '<div class="lead-metric" style="color:' + metricColor(e.m.tenue) + '"><span class="lm-l">tenue</span>' + (e.m.tenue == null ? '—' : e.m.tenue + '%') + '</div>' +
      '<div class="lead-chev">›</div></div>';
  });
  h += '</div>';
  h += '</div></div>';
  h += '<div class="bil-legend"><span class="lg">score = 40% couverture + 40% tenue + 20% régularité</span>' +
       (showReg ? regScaleLegend() : '') + '</div>';
  return h;
}

  // "En priorité" — rôle chef : file de cadence de SES vendeurs.
function renderPrioVendeurs() {
    if (state.cadence === null) return '<div class="bil-empty">Chargement de la file de priorité…</div>';
  if (state.cadenceError) return '<div class="bil-empty">File de priorité indisponible : ' + esc(state.cadenceError) + '</div>';
  const cad = cadInScope();
  if (!cad.length) return '<div class="bil-empty">Aucun vendeur actif dans ce périmètre sur la période.</div>';

  const isPlanifie = (c) => c.next_bilaterale_at != null;
  const isJamais = (c) => c.jours_depuis_bilat == null && !isPlanifie(c);
  // Cadence dépassée = déjà reçu mais trop ancien (>45 j) OU bilatérale planifiée non réalisée,
  // et sans RDV déjà programmé. Les "jamais reçus" et les "planifiés" ont leur propre bucket.
  const isCadenceLate = (c) => !isPlanifie(c) && c.jours_depuis_bilat != null && (c.jours_depuis_bilat > 45 || c.nb_retard > 0);
  const isCharge = (c) => (c.rpv_en_retard || 0) + (c.nb_propales_ouvertes || 0) > 0;

  const total = cad.length;
  const vus = cad.filter(c => c.nb_bilaterales_periode > 0).length;
  const jamais = cad.filter(isJamais).length;
  const retardCad = cad.filter(isCadenceLate).length;
  const baisse = cad.filter(c => c.transfo_tendance < 0).length;
  const planifieN = cad.filter(isPlanifie).length;
  const pctVus = total ? Math.round(100 * vus / total) : 0;

  const scored = cad.map(c => ({ c, s: prioScore(c) })).sort((a, b) => b.s - a.s);
  const f = state.prioFocus || 'tous';
  const cadenceN = retardCad;
  const chargeN  = cad.filter(isCharge).length;
  // "En retard" = vendeurs (du périmètre courant) ayant au moins une bilatérale en retard
  // ouverte (passée, non renseignée, non soldée par une réalisée) sur la période.
  const retardSet = new Set(retardsOuvertsPeriode().map(b => b.id_user));
  const retardN = cad.filter(c => retardSet.has(c.id_user)).length;
  const pass = (c) => f === 'tous' ? true
    : f === 'jamais'   ? isJamais(c)
    : f === 'retard'   ? retardSet.has(c.id_user)
    : f === 'cadence'  ? isCadenceLate(c)
    : f === 'charge'   ? isCharge(c)
    : f === 'perf'     ? (c.transfo_tendance < 0)
    : f === 'planifie' ? isPlanifie(c)
    : true;

  let h = '<div class="prio-head">À recevoir en priorité <span class="prio-sub">' + esc(scopeLabel()) + ' · ' + total + ' vendeur' + (total > 1 ? 's' : '') + ' actif' + (total > 1 ? 's' : '') + '</span></div>';
  h += '<div class="prio-kpis">';
  h += '<div class="pk"><div class="pk-v" style="color:' + (pctVus >= 70 ? '#2c7a68' : (pctVus >= 40 ? '#8a6410' : '#b23433')) + '">' + pctVus + '%</div><div class="pk-l">équipe vue ce mois</div><div class="pk-s">' + vus + '/' + total + ' vendeurs</div></div>';
  h += '<div class="pk"><div class="pk-v" style="color:' + (jamais ? '#b23433' : '#2c7a68') + '">' + jamais + '</div><div class="pk-l">jamais reçus</div><div class="pk-s">aucune bilatérale</div></div>';
  h += '<div class="pk"><div class="pk-v" style="color:' + (retardCad ? '#8a6410' : '#2c7a68') + '">' + retardCad + '</div><div class="pk-l">cadence dépassée</div><div class="pk-s">+45 j sans entretien</div></div>';
  h += '<div class="pk"><div class="pk-v" style="color:' + (baisse ? '#b23433' : '#2c7a68') + '">' + baisse + '</div><div class="pk-l">transfo en baisse</div><div class="pk-s">vs période précédente</div></div>';
  h += '</div>';

  const fchips = [['tous', 'Tous', total], ['retard', 'En retard', retardN], ['jamais', 'Jamais reçus', jamais], ['cadence', 'Cadence dépassée', cadenceN], ['charge', 'Charge élevée', chargeN], ['perf', 'Transfo en baisse', baisse], ['planifie', 'RDV à venir', planifieN]];
  h += '<div class="prio-chips">';
  fchips.forEach(([k, l, n]) => { if (n === 0 && k !== 'tous') return; const extra = (k === 'retard' ? ' retard' : ''); h += '<span class="prio-chip' + extra + (f === k ? ' on' : '') + '" data-priofilter="' + k + '">' + l + '<span class="pc-n">' + n + '</span></span>'; });
  h += '</div>';

  h += '<div class="prio-list">';
  const shown = scored.filter(o => pass(o.c));
  if (!shown.length) h += '<div class="bil-empty">Aucun vendeur pour ce filtre.</div>';
  shown.forEach(({ c }) => {
    const planifie = c.next_bilaterale_at != null;
    let cadBadge, cadCls;
    if (planifie) { cadBadge = 'RDV'; cadCls = 'planif'; }
    else if (c.jours_depuis_bilat == null) { cadBadge = 'Jamais'; cadCls = 'never'; }
    else if (c.jours_depuis_bilat > 45) { cadBadge = c.jours_depuis_bilat + ' j'; cadCls = 'late'; }
    else if (c.jours_depuis_bilat > 30) { cadBadge = c.jours_depuis_bilat + ' j'; cadCls = 'warn'; }
    else { cadBadge = c.jours_depuis_bilat + ' j'; cadCls = 'ok'; }
    const raisons = [];
    if (planifie) raisons.push('<span class="rsn rsn-green">RDV programmé le ' + esc(fmtDate(c.next_bilaterale_at)) + '</span>');
    if (!planifie && c.jours_depuis_bilat == null) raisons.push('<span class="rsn rsn-red">Jamais de bilatérale</span>');
    else if (!planifie && c.jours_depuis_bilat > 45) raisons.push('<span class="rsn rsn-red">' + c.jours_depuis_bilat + ' j sans entretien</span>');
    else if (!planifie && c.jours_depuis_bilat > 30) raisons.push('<span class="rsn rsn-amber">' + c.jours_depuis_bilat + ' j sans entretien</span>');
    if (c.nb_retard > 0) raisons.push('<span class="rsn rsn-red">' + c.nb_retard + ' bilat. en retard</span>');
    if (c.rpv_en_retard > 0) raisons.push('<span class="rsn rsn-amber">' + c.rpv_en_retard + ' relance' + (c.rpv_en_retard > 1 ? 's' : '') + ' en retard</span>');
    if (c.transfo_tendance < 0) raisons.push('<span class="rsn rsn-red">transfo ' + (c.transfo_precedent != null ? c.transfo_precedent + '% → ' + (c.transfo_actuel != null ? c.transfo_actuel + '%' : '?') : 'en baisse') + '</span>');
    if (c.nb_propales_ouvertes > 0) raisons.push('<span class="rsn rsn-blue">' + c.nb_propales_ouvertes + ' propale' + (c.nb_propales_ouvertes > 1 ? 's' : '') + ' ouverte' + (c.nb_propales_ouvertes > 1 ? 's' : '') + '</span>');
    if (!raisons.length) raisons.push('<span class="rsn rsn-green">à jour</span>');
    h += '<div class="prio-row" data-prio-vend="' + c.id_user + '|' + c.id_site + '">' +
      '<div class="pr-cad ' + cadCls + '">' + cadBadge + '</div>' +
      '<div class="pr-main"><div class="pr-name">' + esc(c.nom_vendeur) + (c.vn_vo ? ' <span class="pr-cat">' + esc(c.vn_vo) + '</span>' : '') + '</div>' +
        '<div class="pr-site">' + esc(c.nom_site) + ' · ' + esc(c.affaire) + '</div>' +
        '<div class="pr-raisons">' + raisons.join('') + '</div></div>' +
      '<div class="pr-go">›</div>' +
    '</div>';
  });
  h += '</div>';
  return h;
}

// Auto-ciblage du périmètre à l'arrivée : si l'utilisateur n'a qu'un réseau
// (et/ou une affaire, un site), on déplie directement jusqu'au niveau pertinent.
function autoTargetPerimetre() {
  if (state.autoTargeted) return; // une seule fois par session de page
  state.autoTargeted = true;
  const sites = state.sites || [];
  if (!sites.length) return;
  const reseaux = [...new Set(sites.map(s => s.reseau))];

  // Périmètre restreint (≤ 6 sites, typiquement un chef des ventes) :
  // on déplie TOUT l'arbre (réseaux + affaires) pour voir directement les sites.
  if (sites.length <= 6) {
    for (const s of sites) {
      state.expanded['r:' + s.reseau] = true;
      state.expanded['r:' + s.reseau + '|a:' + String(s.id_affaire)] = true;
    }
    // Sélections pour le fil d'Ariane si tout est dans un seul réseau/affaire
    if (reseaux.length === 1) {
      state.selReseau = reseaux[0];
      const affaires = [...new Set(sites.map(s => String(s.id_affaire)))];
      if (affaires.length === 1) {
        const sAff = sites[0];
        state.selAffaire = { key: String(sAff.id_affaire), label: sAff.affaire };
      }
    }
    // Un seul site -> sélectionné comme périmètre (l'onglet reste "En priorité").
    if (sites.length === 1) { state.selSite = sites[0].id_site; }
    return;
  }

  // Périmètre large : repli intelligent (réseau unique -> déplié, etc.)
  if (reseaux.length === 1) {
    const rk = reseaux[0];
    state.expanded['r:' + rk] = true;
    state.selReseau = rk;
    const affaires = [...new Set(sites.filter(s => s.reseau === rk).map(s => String(s.id_affaire)))];
    if (affaires.length === 1) {
      const ak = affaires[0];
      state.expanded['r:' + rk + '|a:' + ak] = true;
      const sAff = sites.find(s => s.reseau === rk && String(s.id_affaire) === ak);
      state.selAffaire = { key: ak, label: sAff ? sAff.affaire : ak };
      const sitesAff = sites.filter(s => s.reseau === rk && String(s.id_affaire) === ak);
      if (sitesAff.length === 1) {
        state.selSite = sitesAff[0].id_site;
      }
    }
  }
}

// ÉTAPE 1 — arbre périmètre (réseau > affaire > site), avec compteur de bilatérales
function renderTree() {
  const sites = state.sites || [];
  const bils = state.bils || [];
  // Le badge "X bilat." reste fidèle à la PÉRIODE analysée : on borne le comptage
  // à [period.from, period.to]. L'historique élargi (chargé pour la timeline) et les
  // programmées des mois futurs n'y sont donc PAS comptés.
  const finPeriodeMois = state.period.to.slice(0, 7);
  const debPeriodeMois = state.period.from.slice(0, 7);
  const cntBySite = {};
  for (const b of bils) if (b.mois && b.mois >= debPeriodeMois && b.mois <= finPeriodeMois) cntBySite[b.id_site] = (cntBySite[b.id_site]||0) + 1;
  const retardBySite = {};
  retardsOuvertsPeriode().forEach(b => { retardBySite[b.id_site] = (retardBySite[b.id_site] || 0) + 1; });

  // arbre
  const tree = {};
  for (const s of sites) {
    if (!tree[s.reseau]) tree[s.reseau] = { label: s.reseau, affaires: {}, n: 0 };
    const ak = String(s.id_affaire);
    if (!tree[s.reseau].affaires[ak]) tree[s.reseau].affaires[ak] = { label: s.affaire, sites: [], n: 0 };
    const nb = cntBySite[s.id_site] || 0;
    tree[s.reseau].affaires[ak].sites.push({ ...s, nb, retard: retardBySite[s.id_site]||0 });
    tree[s.reseau].affaires[ak].n += nb; tree[s.reseau].n += nb;
  }
  let h = '<div class="bil-tree">';
  const lvl = scopeLevel();
  h += '<div class="tree-row lv-root' + (lvl === 'racine' ? ' sel' : '') + '" data-scope="racine"><span class="exp"></span><span class="ico">◆</span> Tout mon périmètre</div>';
  const reseaux = Object.keys(tree).sort();
  if (!reseaux.length) h += '<div class="bil-empty">Aucun site dans votre périmètre.</div>';
  for (const rk of reseaux) {
    const R = tree[rk]; const rOpen = !!state.expanded['r:'+rk];
    const rSel = lvl === 'reseau' && state.selReseau === rk;
    h += '<div class="tree-row lv-reseau' + (rSel ? ' sel' : '') + '" data-scope="reseau:'+esc(rk)+'"><span class="exp" data-exp="r:'+esc(rk)+'">'+(rOpen?'▾':'▸')+'</span>'+esc(R.label)+'<span class="badge-n">'+R.n+' bilat.</span></div>';
    if (!rOpen) continue;
    for (const ak of Object.keys(R.affaires)) {
      const A = R.affaires[ak]; const aOpen = !!state.expanded['r:'+rk+'|a:'+ak];
      const aSel = lvl === 'affaire' && state.selReseau === rk && String(state.selAffaire.key) === ak;
      h += '<div class="tree-row lv-affaire' + (aSel ? ' sel' : '') + '" data-scope="affaire:'+esc(rk)+'|'+esc(ak)+'"><span class="exp" data-exp="r:'+esc(rk)+'|a:'+esc(ak)+'">'+(aOpen?'▾':'▸')+'</span>'+esc(A.label)+'<span class="badge-n">'+A.n+' bilat.</span></div>';
      if (!aOpen) continue;
      for (const s of A.sites.sort((x,y)=>x.nom_site.localeCompare(y.nom_site))) {
        const sSel = lvl === 'site' && state.selSite === s.id_site;
        h += '<div class="tree-row lv-site' + (sSel ? ' sel' : '') + '" data-scope="site:'+s.id_site+'"><span class="exp"></span><span class="ico">●</span> '+esc(s.nom_site)+
             '<span class="badge-n">'+s.nb+' bilat.'+(s.retard?' <span class="badge-r">'+s.retard+'</span>':'')+'</span></div>';
      }
    }
  }
  h += '</div>';
  return h;
}

// ============================================================================
//  Tableau "rythme & tenue" (vendeurs) + vue "Chefs des ventes" (direction)
// ============================================================================
function tenuePctOf(e){
  if(!e) return null;
  const d=(e.tenu||0)+(e.partiel||0)+(e.non_tenu||0);
  return d ? Math.round(100*((e.tenu||0)+0.5*(e.partiel||0))/d) : null;
}
function regColor(p){
  if(p<=0) return null;        // aucune bilatérale ce mois -> case "vide" (hachurée)
  if(p<30) return '#e24b4a';   // rouge   : couverture faible
  if(p<55) return '#ef8f53';   // orange foncé
  if(p<75) return '#fac055';   // orange/jaune
  if(p<90) return '#9fc960';   // vert tendre
  return '#53bda7';            // vert    : couverture élevée
}
// Légende de l'échelle de couleurs de la heatmap de régularité.
function regScaleLegend(){
  return '<span class="lg">Couverture du mois&nbsp;: '+
    '<span class="sw" style="background:#e24b4a"></span>'+
    '<span class="sw" style="background:#ef8f53"></span>'+
    '<span class="sw" style="background:#fac055"></span>'+
    '<span class="sw" style="background:#9fc960"></span>'+
    '<span class="sw" style="background:#53bda7"></span>'+
    ' <span style="color:#b4b2a9">faible &#8594; élevée</span></span>'+
    '<span class="lg"><span class="sw" style="background:#f1efe8;border:1px dashed #d8d5cc"></span>aucune bilatérale</span>';
}
function reg6Months(){ const out=[]; const d=new Date(); for(let k=5;k>=0;k--){ const m=new Date(d.getFullYear(), d.getMonth()-k, 1); out.push({ ini: MOIS_FR[m.getMonth()].charAt(0).toUpperCase(), nom: MOIS_FR[m.getMonth()] }); } return out; }

// --- cellules du tableau vendeurs ---
function vendeurRythmeCell(c){
  const jd=c.jours_depuis_bilat, planif=c.next_bilaterale_at!=null;
  let dotCls='none', dLabel='<span class="d">Jamais reçu</span>';
  if(jd!=null){ dotCls=jd<=14?'ok':(jd<=45?'warn':'late'); dLabel='<span class="d">'+esc(fmtDate(c.last_bilaterale_at))+'</span> <span class="k">· il y a '+jd+' j</span>'; }
  const next=planif?'<span class="rnext">RDV '+esc(fmtDate(c.next_bilaterale_at))+'</span>':'<span class="rnext todo">à planifier</span>';
  return '<div class="rythme"><div><span class="rdot '+dotCls+'"></span>'+dLabel+'</div><div>'+next+'</div></div>';
}
function vendeurTenueCell(c){
  const e=c.eng||{}; const d=(e.tenu||0)+(e.partiel||0)+(e.non_tenu||0); const pct=tenuePctOf(e);
  if(d===0 && (e.en_cours||0)===0) return '<div class="tcell empty"><span class="acons"><span class="ph"></span> à constituer</span></div>';
  const tot=(d+(e.en_cours||0))||1, w=k=>Math.round(100*k/tot)+'%';
  const bar='<div class="tbar">'+
    (e.tenu?'<i class="seg-t" style="width:'+w(e.tenu)+'"></i>':'')+
    (e.partiel?'<i class="seg-p" style="width:'+w(e.partiel)+'"></i>':'')+
    (e.non_tenu?'<i class="seg-n" style="width:'+w(e.non_tenu)+'"></i>':'')+
    (e.en_cours?'<i class="seg-c" style="width:'+w(e.en_cours)+'"></i>':'')+'</div>';
  const col=pct==null?'#888780':(pct>=80?'#2c7a68':(pct>=60?'#8a6410':'#b23433'));
  const det=[]; if(e.tenu)det.push(e.tenu+' tenus'); if(e.partiel)det.push(e.partiel+' partiel'+(e.partiel>1?'s':'')); if(e.non_tenu)det.push(e.non_tenu+' non tenu'+(e.non_tenu>1?'s':'')); if(e.en_cours)det.push(e.en_cours+' en cours');
  return '<div class="tcell"><div class="ttop">'+bar+'<span class="tpct" style="color:'+col+'">'+(pct==null?'—':pct+'%')+'</span></div><div class="tdet">'+det.join(' · ')+'</div></div>';
}
function vendeurTransfoCell(c){
  if(c.transfo_actuel==null) return '<div class="vtf na">—</div>';
  const cls=c.transfo_tendance>0?'up':(c.transfo_tendance<0?'down':'flat'), ar=c.transfo_tendance>0?'↗':(c.transfo_tendance<0?'↘':'→');
  return '<div class="vtf '+cls+'">'+c.transfo_actuel+'% '+ar+'</div>';
}
function vendeurRows(pred){
  const tmap=state.tenueMap||{};
  return (state.cadence||[]).filter(pred).map(c=>{
    const t=tmap[c.id_user]||{tenu:0,partiel:0,non_tenu:0,en_cours:0};
    return Object.assign({}, c, { eng:t });
  });
}
function sortVendeurs(list){
  const s=state.suiviSort||'tenue', arr=list.slice();
  if(s==='tenue') arr.sort((a,b)=>{ const pa=tenuePctOf(a.eng), pb=tenuePctOf(b.eng); if(pa==null&&pb==null) return (a.nom_vendeur||'').localeCompare(b.nom_vendeur||''); if(pa==null) return 1; if(pb==null) return -1; return pa-pb; });
  else if(s==='recence') arr.sort((a,b)=>{ const ja=a.jours_depuis_bilat, jb=b.jours_depuis_bilat; if(ja==null&&jb==null) return 0; if(ja==null) return -1; if(jb==null) return 1; return jb-ja; });
  else if(s==='transfo') arr.sort((a,b)=> (a.transfo_tendance-b.transfo_tendance) || ((a.transfo_actuel==null?999:a.transfo_actuel)-(b.transfo_actuel==null?999:b.transfo_actuel)) );
  return arr;
}
function vendeurTable(titre, couleur, vlist){
  if(!vlist.length) return '';
  let t='<div class="bil-cat-title" style="color:'+couleur+'">'+titre+' <span class="bil-cat-n">'+vlist.length+' vendeur'+(vlist.length>1?'s':'')+'</span></div>';
  t+='<div class="bil-hscroll"><div class="vtbl"><div class="vrow vthead"><div class="vth">Vendeur</div><div class="vth c-ryt">Rythme · dernière / prochaine</div><div class="vth">Tenue des engagements</div><div class="vth c-tf">Transfo</div><div class="vth"></div></div>';
  vlist.forEach(c=>{
    t+='<div class="vrow" data-vbil="'+c.id_user+'|'+c.id_site+'">'+
      '<div class="vname">'+esc(c.nom_vendeur)+(c.vn_vo?'<span class="vcat">'+esc(c.vn_vo)+'</span>':'')+'</div>'+
      '<div class="c-ryt">'+vendeurRythmeCell(c)+'</div>'+
      '<div>'+vendeurTenueCell(c)+'</div>'+
      '<div class="c-tf">'+vendeurTransfoCell(c)+'</div>'+
      '<div class="vchev">›</div></div>';
  });
  t+='</div></div>';
  return t;
}
function vendeursLegend(){
  return '<div class="bil-legend">'+
    '<span class="lg"><span class="sw" style="background:#53bda7"></span>Tenu</span>'+
    '<span class="lg"><span class="sw" style="background:#fac055"></span>Partiel</span>'+
    '<span class="lg"><span class="sw" style="background:#e24b4a"></span>Non tenu</span>'+
    '<span class="lg"><span class="sw" style="background:#d8dfe9"></span>En cours (pas encore pointé)</span>'+
    '<span class="lg">· Taux de tenue = (tenus + ½ partiels) / engagements pointés, sur 6 mois</span></div>';
}
function suiviSortBar(){
  const s=state.suiviSort||'tenue';
  const c=(k,l)=>'<span class="ssort'+(s===k?' on':'')+'" data-suivisort="'+k+'">'+l+'</span>';
  return '<div class="suivi-sort">'+c('tenue','Tenue ↑')+c('recence','Dernière reçue')+c('transfo','Transfo (baisse)')+'</div>';
}
function renderVendeursTables(list){
  const sorted=sortVendeurs(list);
  const vn=sorted.filter(v=>v.vn_vo==='VN'), vo=sorted.filter(v=>v.vn_vo==='VO'), vnvo=sorted.filter(v=>v.vn_vo==='VNVO');
  const autres=sorted.filter(v=>!['VN','VO','VNVO'].includes(v.vn_vo));
  return vendeurTable('Vendeurs VN','#53bda7',vn)+vendeurTable('Vendeurs VO','#fac055',vo)+vendeurTable('Vendeurs VN/VO','#2a5ea9',vnvo)+vendeurTable('Autres','#888780',autres)+vendeursLegend();
}

// --- vue Chefs des ventes ---
function chefRegScore(c){ const active=c.regularite.filter(p=>p>0).length; const avg=c.regularite.reduce((s,x)=>s+x,0)/6; return active*100+avg; }
function chefRegStrip(reg){
  const m=reg6Months();
  let cells='<div class="reg-cells">';
  reg.forEach((p,i)=>{ const col=regColor(p); cells+= col?'<div class="reg-c" style="background:'+col+'" title="'+esc(m[i].nom)+' : '+Math.round(p)+'%"></div>':'<div class="reg-c empty" title="'+esc(m[i].nom)+' : aucune bilatérale"></div>'; });
  cells+='</div><div class="reg-labels">'+m.map(x=>'<span>'+x.ini+'</span>').join('')+'</div>';
  return '<div class="reg">'+cells+'</div>';
}
function chefRow(c){
  const cov=c.couverture, active=c.regularite.filter(p=>p>0).length, tp=tenuePctOf(c.eng);
  let flag=''; if(active<=3||cov<50) flag='<span class="cflag irr">irrégulier</span>'; else if(active>=6&&cov>=90&&tp!=null&&tp>=80) flag='<span class="cflag exe">exemplaire</span>';
  const covCol=cov>=85?'#2c7a68':(cov>=60?'#8a6410':'#b23433');
  const tCol=tp==null?'#888780':(tp>=80?'#2c7a68':(tp>=60?'#8a6410':'#b23433'));
  const dCol=c.delai_moyen==null?'#888780':(c.delai_moyen<=30?'#2c7a68':(c.delai_moyen<=45?'#8a6410':'#b23433'));
  return '<div class="crow" data-chef="'+c.id_manager+'">'+
    '<div class="cname">'+esc(c.nom_chef)+flag+'<span class="csite">'+esc(c.nom_site)+'</span></div>'+
    '<div>'+chefRegStrip(c.regularite)+'</div>'+
    '<div class="ccov" style="color:'+covCol+'">'+cov+'%<span class="cfrac">'+c.vus_periode+'/'+c.team_size+' vus</span></div>'+
    '<div class="cten" style="color:'+tCol+'">'+(tp==null?'—':tp+'%')+'</div>'+
    '<div class="cdel" style="color:'+dCol+'">'+(c.delai_moyen==null?'—':c.delai_moyen+'<span class="u"> j</span>')+'</div>'+
    '<div class="cchev">›</div></div>';
}
function sortChefs(list){
  const s=state.chefSort||'reg', a=list.slice();
  if(s==='reg') a.sort((x,y)=>chefRegScore(x)-chefRegScore(y));
  else if(s==='cov') a.sort((x,y)=>x.couverture-y.couverture);
  else if(s==='tenue') a.sort((x,y)=>{ const px=tenuePctOf(x.eng), py=tenuePctOf(y.eng); return (px==null?999:px)-(py==null?999:py); });
  return a;
}
function chefsInScope(){
  const lvl=scopeLevel();
  return (state.chefs||[]).filter(c=>{
    if(lvl==='racine') return true;
    const s=(state.sites||[]).find(x=>x.nom_site===c.nom_site);
    if(!s) return false;
    if(lvl==='reseau') return s.reseau===state.selReseau;
    if(lvl==='affaire') return s.reseau===state.selReseau && String(s.id_affaire)===String(state.selAffaire.key);
    if(lvl==='site') return s.id_site===state.selSite;
    return true;
  });
}
function renderChefs(){
  if(state.chefs===null) return '<div class="bil-empty">Chargement de l\'évaluation des chefs…</div>';
  if(state.chefsError) return '<div class="bil-empty">Évaluation indisponible : '+esc(state.chefsError)+'</div>';
  const list=chefsInScope(), nb=list.length;
  if(!nb) return '<div class="bil-empty">Aucun chef des ventes avec activité de bilatérale dans ce périmètre.</div>';
  const covMoy=Math.round(list.reduce((s,c)=>s+c.couverture,0)/nb);
  const irr=list.filter(c=>c.regularite.filter(p=>p>0).length<=3||c.couverture<50).length;
  const tenVals=list.map(c=>tenuePctOf(c.eng)).filter(x=>x!=null);
  const tenMoy=tenVals.length?Math.round(tenVals.reduce((s,x)=>s+x,0)/tenVals.length):null;
  const vol=list.reduce((s,c)=>s+c.volume,0);
  let h='<div class="prio-head">Encadrement <span class="prio-sub">'+nb+' chef'+(nb>1?'s':'')+' des ventes · '+esc(scopeLabel())+'</span></div>';
  h+='<div class="prio-kpis">';
  h+='<div class="pk"><div class="pk-v" style="color:'+(covMoy>=85?'#2c7a68':(covMoy>=60?'#8a6410':'#b23433'))+'">'+covMoy+'%</div><div class="pk-l">couverture moyenne</div><div class="pk-s">équipes vues ce mois</div></div>';
  h+='<div class="pk"><div class="pk-v" style="color:'+(irr?'#b23433':'#2c7a68')+'">'+irr+'</div><div class="pk-l">chefs irréguliers</div><div class="pk-s">≤ 3 mois actifs / 6</div></div>';
  h+='<div class="pk"><div class="pk-v" style="color:'+(tenMoy==null?'#888780':(tenMoy>=80?'#2c7a68':(tenMoy>=60?'#8a6410':'#b23433')))+'">'+(tenMoy==null?'—':tenMoy+'%')+'</div><div class="pk-l">tenue moyenne</div><div class="pk-s">engagements des équipes</div></div>';
  h+='<div class="pk"><div class="pk-v" style="color:#2a5ea9">'+vol+'</div><div class="pk-l">bilatérales</div><div class="pk-s">sur la période</div></div>';
  h+='</div>';
  const s=state.chefSort||'reg';
  const sc=(k,l)=>'<span class="prio-chip'+(s===k?' on':'')+'" data-chefsort="'+k+'">'+l+'</span>';
  h+='<div class="prio-chips"><span class="sort-lbl">Trier par</span>'+sc('reg','Régularité ↑')+sc('cov','Couverture')+sc('tenue','Tenue d\'équipe')+'</div>';
  h+='<div class="bil-hscroll"><div class="ctbl"><div class="crow cthead"><div class="cth">Chef des ventes</div><div class="cth">Régularité · 6 mois</div><div class="cth">Couverture</div><div class="cth">Tenue équipe</div><div class="cth">Délai moy.</div><div class="cth"></div></div>';
  h+=sortChefs(list).map(chefRow).join('');
  h+='</div></div>';
  h+='<div class="bil-legend">'+
     regScaleLegend()+
     '<span class="lg">· <b>irrégulier</b> = ≤ 3 mois actifs / 6 ou couverture &lt; 50 %</span>'+
     '<span class="lg">· <b>exemplaire</b> = 6 mois actifs, couverture ≥ 90 %, tenue ≥ 80 %</span>'+
     '<span class="lg">· délai moy. = jours entre deux bilatérales d\'un même vendeur</span></div>';
  return h;
}

// ÉTAPE 2 — tableau vendeur × mois (colonnes = mois de la plage WeWeb)
function renderSuivi() {
  if (scopeLevel() !== 'site') return '<div class="bil-empty">Sélectionnez un site dans le périmètre pour voir ses bilatérales.</div>';
  const q = (state.suiviSearch || '').toLowerCase().trim();
  const site = siteOf(state.selSite);
  let list = vendeurRows(c => c.id_site === state.selSite);
  let focus = '';
  if (state.chefFocus != null) {
    const chef = (state.chefs || []).find(c => c.id_manager === state.chefFocus);
    const teamIds = new Set((state.bils || []).filter(b => b.id_manager === state.chefFocus).map(b => b.id_user));
    list = list.filter(v => teamIds.has(v.id_user));
    focus = chef ? ' · équipe de ' + esc(chef.nom_chef) : '';
  }
  if (q) list = list.filter(v => (v.nom_vendeur || '').toLowerCase().includes(q));
  let back = state.chefFocus != null ? '<div class="bil-back" data-suivi-all="1">← toute l’équipe du site</div>' : '';
  let h = back + '<div class="bil-suivi-head">Bilatérales du site · ' + esc(site ? site.nom_site : '') + focus + ' · ' + list.length + ' vendeur' + (list.length > 1 ? 's' : '') + '</div>';
  h += '<div class="suivi-filters">' +
    '<input id="bil-suivi-search" class="suivi-search" type="text" placeholder="Rechercher un vendeur…" value="' + esc(state.suiviSearch || '') + '" oninput="window.__bilSuiviSearch(this.value)">' +
    suiviSortBar() + '</div>';
  if (!list.length) { h += '<div class="bil-empty">' + (q ? 'Aucun vendeur ne correspond à la recherche.' : 'Aucun vendeur actif sur ce site pour la période.') + '</div>'; return h; }
  h += renderVendeursTables(list);
  return h;
}

// ÉTAPE 3 — timeline (profondeur = nb de mois en arrière depuis le mois ancre)
const DEPTHS = [{n:1,l:'Ce mois'},{n:2,l:'Bimestre'},{n:3,l:'Trimestre'},{n:4,l:'Quadrimestre'},{n:6,l:'Semestre'}];
function monthMinus(key, k){ // 'YYYY-MM' moins k mois
  const [y,m]=key.split('-').map(Number); const d=new Date(y, m-1-k, 1); return ymd(d).slice(0,7);
}
function renderTimeline() {
  const vend = state.tlVend, depth = state.tlDepth;
  // Ancre bornée au mois COURANT : si la période sélectionnée s'étend dans le futur
  // (trimestre / année en cours…), l'ancre ne doit pas sauter en avant, sinon les
  // bilatérales RÉALISÉES récentes sortent de la fenêtre de profondeur. Les programmées
  // à venir, elles, restent toujours affichées via estProgFutur (indépendant de l'ancre).
  const _curMonth = ymd(new Date()).slice(0, 7);
  const anchor = (state.tlMonth && state.tlMonth < _curMonth) ? state.tlMonth : _curMonth;
  const v = (state.bils||[]).find(b => b.id_user===vend);
  const vname = (v && v.nom_vendeur) || state.tlVendName || '';
  const moisInclus = []; for (let k=0;k<depth;k++) moisInclus.push(monthMinus(anchor, k));
  // On inclut TOUJOURS les bilatérales PROGRAMMÉES à venir (au-delà de la fenêtre de
  // profondeur) pour pouvoir les ouvrir et les réaliser, en plus de l'historique.
  const _now = new Date();
  const estProgFutur = b => b.statut === 'programmee' && b.start_date &&
    new Date(String(b.start_date).replace(' ', 'T')) > _now;
  const list = (state.bils||[]).filter(b => b.id_user===vend && b.id_site===state.selSite &&
                (moisInclus.includes(b.mois) || estProgFutur(b)))
                .sort((a,b)=> (b.start_date||'').localeCompare(a.start_date||''));
  const depthLbl = DEPTHS.find(d=>d.n===depth).l;
  let h = '<div class="tl-head"><div class="h-t">' + esc(vname) + ' · ' +
          (depth===1 ? (monthLabel(anchor)+' '+anchor.slice(0,4)) : depthLbl+' (jusqu’à '+monthLabel(anchor)+')') +
          '</div><button class="h-back" data-tlback="1">← retour au tableau</button></div>';
  h += '<div class="tl-depth">';
  DEPTHS.forEach(d => h += '<span class="d-opt'+(d.n===depth?' on':'')+'" data-depth="'+d.n+'">'+d.l+'</span>');
  h += '</div>';
  h += '<div class="tl">';
  if (!list.length) h += '<div class="bil-empty">Aucune bilatérale sur cette période.</div>';
  // Rendu d'une carte (réutilisé pour les deux sections "À venir" / "Historique").
  const carte = (b, side) => {
    const stTxt = b.statut==='realisee' ? '✓ Réalisée' : (b.statut==='programmee' ? '🗓 Programmée' : '⚠ En retard');
    const dm = dureeMin(b);
    const meta = fmtHeure(b.start_date) + (b.end_date?' → '+fmtHeure(b.end_date):'') + (dm?' · '+dm+' min':(b.duree?' · '+esc(b.duree):''));
    const prev = b.statut==='realisee'
      ? esc((b.resultat||'').slice(0,160))
      : '<i style="color:#888780">Entretien non encore réalisé — cliquez pour le renseigner.</i>';
    return '<div class="tl-row '+side+'">' +
         '<div class="tl-dot '+b.statut+'"></div>' +
         '<div class="tl-date">'+fmtDate(b.start_date)+'</div>' +
         '<div class="tl-card" data-bil="'+b.id+'">' +
           '<div class="c-vend">'+esc(b.nom_vendeur)+'</div>' +
           '<div class="c-meta">'+meta+'</div>' +
           '<div class="c-prev">'+prev+'</div>' +
           '<span class="c-status '+b.statut+'">'+stTxt+'</span>' +
         '</div></div>';
  };
  // Deux blocs : d'abord les programmées à venir (sous "À venir"), puis le reste
  // (historique du mois / de la fenêtre de profondeur) sous "Historique".
  const futurs = list.filter(estProgFutur);
  const passes = list.filter(b => !estProgFutur(b));
  if (futurs.length) {
    h += '<div class="tl-sep avenir"><span>À venir</span></div>';
    let i = 0; for (const b of futurs) { h += carte(b, i%2===0 ? 'left' : 'right'); i++; }
  }
  if (passes.length) {
    if (futurs.length) h += '<div class="tl-sep histo"><span>Historique</span></div>';
    let i = 0; for (const b of passes) { h += carte(b, i%2===0 ? 'left' : 'right'); i++; }
  }
  h += '</div>';
  return h;
}

// Modale détail (bilatérale réalisée)
function openBil(id) {
  const b = (state.bils||[]).find(x => x.id===id); if (!b) return;
  if (b.statut !== 'realisee') {
    if (isVendeur()) { openBilReadonly(b); return; }   // vendeur : lecture seule, pas de saisie
    R_open(id);
    return;
  }
  const dm = dureeMin(b);
  const meta = 'avec ' + esc(b.nom_chef) + ' (chef des ventes) · ' + fmtDate(b.start_date) + ', ' +
               fmtHeure(b.start_date) + (b.end_date?' → '+fmtHeure(b.end_date):'') + (dm?' · '+dm+' min':'');
  const root = getRoot();
  const ov = doc.createElement('div'); ov.className = 'bil-ov'; ov.id = 'bil-ov';
  ov.innerHTML =
    '<div class="bil-modal"><div class="m-head"><div><div class="m-vend">'+esc(b.nom_vendeur)+'</div>'+
    '<div class="m-meta">'+meta+'</div></div><button class="m-close" data-close="1">×</button></div>'+
    '<div class="m-body">'+
      '<div class="m-sec res"><div class="s-lbl">Résultat</div><div class="s-txt">'+esc(b.resultat||'—')+'</div></div>'+
      '<div class="m-sec act"><div class="s-lbl">Actions</div><div class="s-txt">'+esc(b.actions||'—')+'</div></div>'+
      '<div class="m-sec eng"><div class="s-lbl">Engagement</div><div class="s-txt">'+esc(b.engagement||'—')+'</div></div>'+
    '</div></div>';
  root.appendChild(ov);
}
function closeModal(){ const ov = doc.getElementById('bil-ov'); if (ov) ov.remove(); }

// --- Délégation des clics (routeur réassignable, comme le dashboard) --------
// Sélection du périmètre (depuis le fil d'Ariane, l'arbre ou le classement).
function setScope(str) {
  state.chefFocus = null;
  if (str === 'racine') { state.selReseau = null; state.selAffaire = null; state.selSite = null; }
  else if (str.indexOf('reseau:') === 0) {
    const rk = str.slice(7);
    state.selReseau = rk; state.selAffaire = null; state.selSite = null;
    state.expanded['r:' + rk] = true;
  } else if (str.indexOf('affaire:') === 0) {
    const rest = str.slice(8); const i = rest.lastIndexOf('|');
    const rk = rest.slice(0, i), ak = rest.slice(i + 1);
    const s = (state.sites || []).find(x => x.reseau === rk && String(x.id_affaire) === ak);
    state.selReseau = rk; state.selAffaire = { key: ak, label: s ? s.affaire : ak }; state.selSite = null;
    state.expanded['r:' + rk] = true; state.expanded['r:' + rk + '|a:' + ak] = true;
  } else if (str.indexOf('site:') === 0) {
    const id = Number(str.slice(5)); state.selSite = id;
    const s = siteOf(id);
    if (s) { state.selReseau = s.reseau; state.selAffaire = { key: String(s.id_affaire), label: s.affaire }; state.expanded['r:' + s.reseau] = true; state.expanded['r:' + s.reseau + '|a:' + String(s.id_affaire)] = true; }
  }
  if (state.tab === 'site' && scopeLevel() !== 'site') state.tab = 'prio';
  if (state.tab === 'enc' && !isDirection()) state.tab = 'prio';
  render();
}
// Cible l'équipe d'un chef dans l'onglet "Bilatérales du site".
function focusChef(idManager) {
  const chef = (state.chefs || []).find(c => c.id_manager === idManager);
  if (chef) {
    const s = (state.sites || []).find(x => x.nom_site === chef.nom_site);
    if (s) { state.selSite = s.id_site; state.selReseau = s.reseau; state.selAffaire = { key: String(s.id_affaire), label: s.affaire }; }
  }
  state.chefFocus = idManager; state.tab = 'site';
  render();
}

window.__bilRoute = function (e) {
  if (e.__bilDone) return;
  if (!(e.target.closest && e.target.closest('#bil-root'))) return;
  e.__bilDone = true;
  // Modale : fermeture
  if (e.target.closest('[data-close]') || (e.target.id === 'bil-ov')) { closeModal(); return; }

  // Onglets contextuels
  const tab = e.target.closest('[data-tab]');
  if (tab) { state.tab = tab.getAttribute('data-tab'); state.chefFocus = null; render(); return; }

  // Arbre : chevron = déplier/replier (sans toucher au scope)
  const exp = e.target.closest('[data-exp]');
  if (exp) { const k = exp.getAttribute('data-exp'); state.expanded[k] = !state.expanded[k]; render(); return; }

  // Sélection du périmètre (fil d'Ariane + arbre)
  const sc = e.target.closest('[data-scope]');
  if (sc) { setScope(sc.getAttribute('data-scope')); return; }

  // Filtre de la file de priorité (rôle chef)
  const pf = e.target.closest('[data-priofilter]');
  if (pf) { state.prioFocus = pf.getAttribute('data-priofilter'); render(); return; }

  // Classement direction : clic sur une entité -> descendre / cibler un chef
  const ent = e.target.closest('[data-prio-ent]');
  if (ent) {
    const v = ent.getAttribute('data-prio-ent');
    if (v.indexOf('chef:') === 0) focusChef(Number(v.slice(5)));
    else setScope(v);
    return;
  }

  // Tris
  const ssort = e.target.closest('[data-suivisort]');
  if (ssort) { state.suiviSort = ssort.getAttribute('data-suivisort'); render(); return; }
  const csort = e.target.closest('[data-chefsort]');
  if (csort) { state.chefSort = csort.getAttribute('data-chefsort'); render(); return; }

  // Encadrement : clic chef -> son équipe dans l'onglet "Bilatérales du site"
  const chefRowEl = e.target.closest('[data-chef]');
  if (chefRowEl) { focusChef(Number(chefRowEl.getAttribute('data-chef'))); return; }

  // "toute l'équipe du site" (annule le focus chef)
  const all = e.target.closest('[data-suivi-all]');
  if (all) { state.chefFocus = null; render(); return; }

  // Clic vendeur (file de priorité chef OU tableau du site) -> sa timeline
  const pv = e.target.closest('[data-prio-vend]') || e.target.closest('[data-vbil]');
  if (pv) {
    const raw = pv.getAttribute('data-prio-vend') || pv.getAttribute('data-vbil');
    const [vid, sid] = raw.split('|');
    state.selSite = Number(sid);
    const s = siteOf(Number(sid));
    if (s) { state.selReseau = s.reseau; state.selAffaire = { key: String(s.id_affaire), label: s.affaire }; }
    state.tlVend = Number(vid); state.tlMonth = state.period.to.slice(0, 7); state.tlDepth = 2;
    const cv = (state.cadence || []).find(x => x.id_user === Number(vid));
    state.tlVendName = cv ? cv.nom_vendeur : null;
    state.view = 'timeline'; render(); return;
  }

  // Timeline : retour au tableau
  const tlb = e.target.closest('[data-tlback]');
  if (tlb) { state.view = 'main'; render(); return; }

  // Timeline : profondeur
  const dpt = e.target.closest('[data-depth]');
  if (dpt) { state.tlDepth = Number(dpt.getAttribute('data-depth')); render(); return; }

  // Timeline : clic carte
  const card = e.target.closest('[data-bil]');
  if (card) { openBil(Number(card.getAttribute('data-bil'))); return; }

  // Sélecteur de dates : ouverture/fermeture du calendrier
  const dpTog = e.target.closest('[data-dp-toggle]');
  if (dpTog) {
    state.dpOpen = !state.dpOpen;
    if (state.dpOpen) { state.dpMonth = (state.period.from || ymd(new Date())).slice(0, 7); state.dpStart = null; }
    render(); return;
  }
  const dpCl = e.target.closest('[data-dp-close]');
  if (dpCl) { state.dpOpen = false; state.dpStart = null; render(); return; }
  const dpNav = e.target.closest('[data-dp-nav]');
  if (dpNav) { state.dpMonth = monthShift(state.dpMonth || state.period.from.slice(0, 7), dpNav.getAttribute('data-dp-nav') === 'next' ? 1 : -1); render(); return; }
  const dpDay = e.target.closest('[data-dp-day]');
  if (dpDay) { pickDpDay(dpDay.getAttribute('data-dp-day')); return; }

  // Sélecteur de dates : presets de période
  const preset = e.target.closest('[data-period-preset]');
  if (preset) { applyPeriodPreset(preset.getAttribute('data-period-preset')); return; }
};
if (!window.__bilDocClickBound) {
  doc.addEventListener('click', function (e) { if (window.__bilRoute) window.__bilRoute(e); }, true);
  window.__bilDocClickBound = true;
}

// Recherche live dans le suivi (D) : re-rend puis restaure le focus + le curseur.
window.__bilSuiviSearch = function (val) {
  state.suiviSearch = val;
  render();
  const inp = doc.getElementById('bil-suivi-search');
  if (inp) { inp.focus(); try { inp.setSelectionRange(val.length, val.length); } catch (e) {} }
};

// --- Période autonome : rechargement + handlers du sélecteur de dates --------
function reloadPeriodBil() {
  // On invalide les données dépendantes de la période et on recharge. La sélection
  // du périmètre (selSite/expanded/…) est conservée volontairement.
  state.sites = null; state.bils = null; state.cadence = null; state.chefs = null; state.tenueMap = null;
  if (window.__bilLoadData) window.__bilLoadData(); else render();
}
// Modification directe d'une borne (conservé pour usage éventuel/programmatique).
window.__bilSetPeriod = function (which, val) {
  if (!val) return;
  if (which === 'from') { if (val > state.period.to) val = state.period.to; state.period.from = val; }
  else { if (val < state.period.from) val = state.period.from; state.period.to = val; }
  reloadPeriodBil();
};
// Décalage de mois pour le calendrier ('YYYY-MM' +/- delta).
function monthShift(key, delta) {
  const y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7));
  const d = new Date(y, m - 1 + delta, 1);
  return ymd(d).slice(0, 7);
}
// Clic sur un jour du calendrier : 1er clic = début en attente, 2e clic = fin.
function pickDpDay(dstr) {
  if (!dstr) return;
  if (!state.dpStart) { state.dpStart = dstr; render(); return; }
  let a = state.dpStart, b = dstr;
  if (b < a) { const t = a; a = b; b = t; }
  state.period = { from: a, to: b };
  state.dpStart = null; state.dpOpen = false;
  reloadPeriodBil();
}
// Presets rapides. 'mois' = 1er du mois courant -> aujourd'hui ; '3mois' = 1er du mois
// il y a 2 mois -> aujourd'hui ; 'annee' = 1er janvier de l'année en cours -> aujourd'hui.
function applyPeriodPreset(kind) {
  const now = new Date();
  let from;
  if (kind === 'mois')       from = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (kind === '3mois') from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  else if (kind === 'annee') from = new Date(now.getFullYear(), 0, 1);
  else return;
  state.period = { from: ymd(from), to: ymd(now) };
  state.dpStart = null; state.dpOpen = false;
  reloadPeriodBil();
}

// --- Styles -----------------------------------------------------------------
const STYLE = '<style>' +
'#bil-root .bil{font-family:"Nunito Sans",sans-serif;color:#3a3a38}' +
'#bil-root .bil-load,#bil-root .bil-err,#bil-root .bil-empty{padding:24px;text-align:center;color:#888780;font-size:14px}' +
'#bil-root .bil-err{color:#a32d2d}' +
'#bil-root .bil-crumbs{display:flex;align-items:center;gap:6px;font-size:13px;margin-bottom:14px;flex-wrap:wrap}' +
'#bil-root .crumb{background:#fff;border:1px solid #ece9e1;border-radius:8px;padding:5px 11px;color:#2a5ea9;font-weight:600;cursor:pointer}' +
'#bil-root .crumb.cur{background:#2a5ea9;color:#fff;border-color:#2a5ea9;cursor:default}' +
'#bil-root .crumb-sep{color:#b4b2a9}' +
'#bil-root .bil-tree{background:#fff;border:1px solid #ece9e1;border-radius:12px;overflow:hidden}' +
'#bil-root .tree-row{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid #f1efe8;cursor:pointer;font-size:14px}' +
'#bil-root .tree-row:last-child{border-bottom:none}' +
'#bil-root .tree-row:hover{background:rgba(172,197,228,.14)}' +
'#bil-root .tree-row .exp{width:14px;color:#888780;font-size:10px}' +
'#bil-root .lv-reseau{font-weight:700;color:#2a5ea9}' +
'#bil-root .lv-affaire{padding-left:30px}' +
'#bil-root .lv-site{padding-left:50px}' +
'#bil-root .lv-site .ico{color:#53bda7;font-size:10px}' +
'#bil-root .badge-n{margin-left:auto;font-size:12px;color:#888780;background:#f7f6f2;border-radius:20px;padding:2px 10px}' +
'#bil-root .badge-r{background:#e24b4a;color:#fff;border-radius:8px;padding:0 5px;font-size:10px;font-weight:800;margin-left:3px}' +
'#bil-root .bil-suivi-head{font-size:14px;font-weight:700;color:#2a5ea9;margin-bottom:12px}' +
'#bil-root .bil-cat-title{font-size:13px;font-weight:800;margin:18px 0 8px;text-transform:uppercase;letter-spacing:.03em}' +
'#bil-root .bil-cat-n{font-size:11px;font-weight:600;color:#888780;text-transform:none;letter-spacing:0}' +
'#bil-root .suivi{background:#fff;border:1px solid #ece9e1;border-radius:12px;overflow:hidden}' +
'#bil-root .suivi table{width:100%;border-collapse:collapse;font-size:14px}' +
'#bil-root .suivi th,#bil-root .suivi td{padding:11px 14px;text-align:center;border-bottom:1px solid #f1efe8}' +
'#bil-root .suivi th{background:rgba(172,197,228,.18);font-size:12px;color:#888780;font-weight:700;text-transform:uppercase;letter-spacing:.03em}' +
'#bil-root .suivi th.vend,#bil-root .suivi td.vend{text-align:left;font-weight:600;color:#2a5ea9}' +
'#bil-root .suivi td.cell{cursor:pointer;position:relative;font-weight:700}' +
'#bil-root .suivi td.cell:hover{background:rgba(172,197,228,.18)}' +
'#bil-root .suivi td.cell.zero{color:#b4b2a9;font-weight:400;cursor:default}' +
'#bil-root .suivi td.cell.zero:hover{background:none}' +
'#bil-root .cell .notif{position:absolute;top:4px;right:5px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:#e24b4a;color:#fff;font-size:10px;font-weight:800;line-height:16px;text-align:center}' +
'#bil-root .suivi tr.tot td{background:rgba(172,197,228,.18);font-weight:800;color:#2a5ea9;border-bottom:none}' +
'#bil-root .tl-head{display:flex;align-items:center;justify-content:space-between;margin:4px 0 8px;flex-wrap:wrap;gap:8px}' +
'#bil-root .tl-head .h-t{font-size:16px;font-weight:800;color:#2a5ea9}' +
'#bil-root .tl-head .h-back{font-size:13px;color:#2a5ea9;background:#fff;border:1px solid #ece9e1;border-radius:8px;padding:5px 11px;cursor:pointer;font-weight:600}' +
'#bil-root .tl-depth{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px}' +
'#bil-root .tl-depth .d-opt{font-size:12px;color:#2a5ea9;background:#fff;border:1px solid #ece9e1;border-radius:7px;padding:4px 10px;cursor:pointer;font-weight:600}' +
'#bil-root .tl-depth .d-opt.on{background:#2a5ea9;color:#fff;border-color:#2a5ea9}' +
'#bil-root .tl{position:relative;padding:8px 0}' +
'#bil-root .tl::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:2px;background:#acc5e4;transform:translateX(-1px)}' +
'#bil-root .tl-sep{position:relative;text-align:center;margin:6px 0 20px;z-index:3}' +
'#bil-root .tl-sep span{display:inline-block;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;padding:4px 14px;border-radius:20px;background:#fff;border:1px solid #ece9e1}' +
'#bil-root .tl-sep.avenir span{color:#2a5ea9;background:rgba(42,94,169,.10);border-color:rgba(42,94,169,.28)}' +
'#bil-root .tl-sep.histo span{color:#888780}' +
'#bil-root .tl-row{position:relative;display:flex;margin-bottom:22px;min-height:60px}' +
'#bil-root .tl-row.left{justify-content:flex-start}' +
'#bil-root .tl-row.right{justify-content:flex-end}' +
'#bil-root .tl-dot{position:absolute;left:50%;top:18px;width:14px;height:14px;border-radius:50%;border:3px solid #fff;transform:translateX(-50%);z-index:2;box-shadow:0 0 0 1px #acc5e4}' +
'#bil-root .tl-dot.realisee{background:#53bda7}' +
'#bil-root .tl-dot.programmee{background:#2a5ea9}' +
'#bil-root .tl-dot.retard{background:#e24b4a}' +
'#bil-root .tl-date{position:absolute;left:50%;top:42px;transform:translateX(-50%);font-size:11px;color:#888780;background:#f7f6f2;padding:0 6px;white-space:nowrap}' +
'#bil-root .tl-card{width:42%;background:#fff;border:1px solid #ece9e1;border-radius:12px;padding:14px 16px;cursor:pointer;transition:box-shadow .15s,transform .15s;position:relative}' +
'#bil-root .tl-card:hover{box-shadow:0 4px 16px rgba(42,94,169,.12);transform:translateY(-1px)}' +
'#bil-root .tl-row.left .tl-card::after{content:"";position:absolute;top:18px;right:-14px;width:0;height:0;border:7px solid transparent;border-left-color:#fff}' +
'#bil-root .tl-row.right .tl-card::after{content:"";position:absolute;top:18px;left:-14px;width:0;height:0;border:7px solid transparent;border-right-color:#fff}' +
'#bil-root .tl-card .c-vend{font-size:15px;font-weight:700;color:#2a5ea9}' +
'#bil-root .tl-card .c-meta{font-size:12px;color:#888780;margin:2px 0 8px}' +
'#bil-root .tl-card .c-prev{font-size:13px;color:#3a3a38;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
'#bil-root .c-status{margin-top:8px;display:inline-block;font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px}' +
'#bil-root .c-status.realisee{background:rgba(83,189,167,.16);color:#2c7a68}' +
'#bil-root .c-status.programmee{background:rgba(42,94,169,.14);color:#2a5ea9}' +
'#bil-root .c-status.retard{background:rgba(226,75,74,.15);color:#b23433}' +
'#bil-root .bil-ov{position:fixed;inset:0;background:rgba(42,52,60,.5);display:flex;align-items:center;justify-content:center;padding:20px;z-index:50}' +
'#bil-root .bil-modal{background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:88vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.25)}' +
'#bil-root .m-head{padding:18px 22px;border-bottom:1px solid #ece9e1;display:flex;justify-content:space-between;align-items:flex-start}' +
'#bil-root .m-head .m-vend{font-size:18px;font-weight:800;color:#2a5ea9}' +
'#bil-root .m-head .m-meta{font-size:13px;color:#888780;margin-top:3px}' +
'#bil-root .m-close{border:none;background:#f7f6f2;width:30px;height:30px;border-radius:8px;font-size:18px;color:#888780;cursor:pointer;flex-shrink:0}' +
'#bil-root .m-body{padding:18px 22px}' +
'#bil-root .m-sec{margin-bottom:18px}' +
'#bil-root .m-sec .s-lbl{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}' +
'#bil-root .m-sec.res .s-lbl{color:#2a5ea9}' +
'#bil-root .m-sec.act .s-lbl{color:#8a6410}' +
'#bil-root .m-sec.eng .s-lbl{color:#2c7a68}' +
'#bil-root .m-sec .s-txt{font-size:14px;line-height:1.55;color:#3a3a38;background:#f7f6f2;border-radius:10px;padding:12px 14px;white-space:pre-wrap}' +
'#bil-root .bil-nav{display:flex;gap:6px;margin-bottom:16px}' +
'#bil-root .nav-tab{font-size:13px;font-weight:700;color:#2a5ea9;background:#fff;border:1px solid #ece9e1;border-radius:9px;padding:8px 16px;cursor:pointer}' +
'#bil-root .nav-tab:hover{background:rgba(172,197,228,.16)}' +
'#bil-root .nav-tab.on{background:#2a5ea9;color:#fff;border-color:#2a5ea9}' +
'#bil-root .prio-head{font-size:16px;font-weight:800;color:#2a5ea9;margin-bottom:14px}' +
'#bil-root .prio-head .prio-sub{font-size:12px;font-weight:600;color:#888780;margin-left:8px}' +
'#bil-root .prio-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px}' +
'#bil-root .pk{background:#fff;border:1px solid #ece9e1;border-radius:12px;padding:13px 16px}' +
'#bil-root .pk .pk-v{font-size:26px;font-weight:800;line-height:1}' +
'#bil-root .pk .pk-l{font-size:12px;font-weight:700;color:#3a3a38;margin-top:4px}' +
'#bil-root .pk .pk-s{font-size:11px;color:#b4b2a9;margin-top:1px}' +
'#bil-root .prio-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}' +
'#bil-root .prio-chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#2a5ea9;background:#fff;border:1px solid #ece9e1;border-radius:16px;padding:5px 12px;cursor:pointer}' +
'#bil-root .prio-chip:hover{background:rgba(172,197,228,.16)}' +
'#bil-root .prio-chip.on{background:#2a5ea9;color:#fff;border-color:#2a5ea9}' +
'#bil-root .prio-chip .pc-n{font-size:10px;font-weight:700;opacity:.7}' +
'#bil-root .prio-chip.retard{color:#b23433;border-color:#f0c9c7}' +
'#bil-root .prio-chip.retard:hover{background:rgba(226,75,74,.10)}' +
'#bil-root .prio-chip.retard.on{background:#e24b4a;color:#fff;border-color:#e24b4a}' +
'#bil-root .prio-chip.retard.on .pc-n{opacity:.9}' +
'#bil-root .prio-list{display:flex;flex-direction:column;gap:8px}' +
'#bil-root .prio-row{display:flex;align-items:center;gap:14px;background:#fff;border:1px solid #ece9e1;border-radius:12px;padding:12px 16px;cursor:pointer;transition:box-shadow .15s,transform .12s}' +
'#bil-root .prio-row:hover{box-shadow:0 4px 16px rgba(42,94,169,.10);transform:translateY(-1px)}' +
'#bil-root .pr-cad{flex-shrink:0;width:62px;text-align:center;font-size:13px;font-weight:800;border-radius:9px;padding:9px 4px;line-height:1.1}' +
'#bil-root .pr-cad.never{background:rgba(226,75,74,.14);color:#b23433}' +
'#bil-root .pr-cad.late{background:rgba(226,75,74,.12);color:#b23433}' +
'#bil-root .pr-cad.warn{background:rgba(250,192,85,.22);color:#8a6410}' +
'#bil-root .pr-cad.ok{background:rgba(83,189,167,.16);color:#2c7a68}' +
'#bil-root .pr-cad.planif{background:rgba(42,94,169,.12);color:#2a5ea9}' +
'#bil-root .pr-main{flex:1;min-width:0}' +
'#bil-root .pr-name{font-size:15px;font-weight:700;color:#2a5ea9}' +
'#bil-root .pr-name .pr-cat{font-size:10px;font-weight:800;color:#888780;background:#f7f6f2;border-radius:6px;padding:1px 6px;margin-left:5px;vertical-align:middle}' +
'#bil-root .pr-site{font-size:12px;color:#888780;margin:1px 0 6px}' +
'#bil-root .pr-raisons{display:flex;gap:5px;flex-wrap:wrap}' +
'#bil-root .rsn{font-size:11px;font-weight:600;border-radius:6px;padding:2px 8px}' +
'#bil-root .rsn-red{background:rgba(226,75,74,.13);color:#b23433}' +
'#bil-root .rsn-amber{background:rgba(250,192,85,.20);color:#8a6410}' +
'#bil-root .rsn-blue{background:rgba(42,94,169,.10);color:#2a5ea9}' +
'#bil-root .rsn-green{background:rgba(83,189,167,.16);color:#2c7a68}' +
'#bil-root .pr-go{flex-shrink:0;color:#b4b2a9;font-size:22px;font-weight:700}' +
'#bil-root .suivi-filters{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}' +
'#bil-root .suivi-search{flex:0 0 240px;max-width:240px;border:1px solid #ece9e1;border-radius:9px;padding:8px 12px;font-family:inherit;font-size:13px;color:#3a3a38;background:#fff}' +
'#bil-root .suivi-search:focus{outline:none;border-color:#2a5ea9}' +
'#bil-root .suivi-stchips{display:flex;gap:6px;flex-wrap:wrap}' +
'#bil-root .st-chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#2a5ea9;background:#fff;border:1px solid #ece9e1;border-radius:16px;padding:5px 12px;cursor:pointer}' +
'#bil-root .st-chip:hover{background:rgba(172,197,228,.16)}' +
'#bil-root .st-chip.on{background:#2a5ea9;color:#fff;border-color:#2a5ea9}' +
'#bil-root .st-chip.rt.on{background:#e24b4a;border-color:#e24b4a}' +
'#bil-root .st-chip.re.on{background:#53bda7;border-color:#53bda7}' +
'#bil-root .st-chip.pr.on{background:#2a5ea9;border-color:#2a5ea9}' +
'#bil-root .st-chip .st-n{font-size:10px;font-weight:700;opacity:.7}' +
'#bil-root .suivi-sort{display:flex;gap:6px;flex-wrap:wrap}' +
'#bil-root .ssort{font-size:12px;font-weight:700;color:#2a5ea9;background:#fff;border:1px solid #ece9e1;border-radius:16px;padding:5px 12px;cursor:pointer;user-select:none}' +
'#bil-root .ssort:hover{background:rgba(172,197,228,.16)}' +
'#bil-root .ssort.on{background:#2a5ea9;color:#fff;border-color:#2a5ea9}' +
'#bil-root .sort-lbl{font-size:12px;color:#888780;font-weight:700;align-self:center;margin-right:2px}' +
'#bil-root .bil-back{font-size:13px;color:#2a5ea9;background:#fff;border:1px solid #ece9e1;border-radius:8px;padding:6px 12px;cursor:pointer;font-weight:700;display:inline-block;margin-bottom:12px}' +
'#bil-root .bil-back:hover{background:rgba(172,197,228,.16)}' +
'#bil-root .vtbl{background:#fff;border:1px solid #ece9e1;border-radius:12px;overflow:hidden;margin-bottom:6px}' +
'#bil-root .vrow{display:grid;grid-template-columns:1.5fr 1.35fr 1.75fr .95fr 26px;align-items:center;gap:14px;padding:13px 18px;border-bottom:1px solid #f1efe8;cursor:pointer;transition:background .12s}' +
'#bil-root .vrow:last-child{border-bottom:none}' +
'#bil-root .vrow.vthead{cursor:default;background:rgba(172,197,228,.16);padding:10px 18px}' +
'#bil-root .vrow:not(.vthead):hover{background:rgba(172,197,228,.10)}' +
'#bil-root .vth{font-size:11px;font-weight:800;color:#888780;text-transform:uppercase;letter-spacing:.04em}' +
'#bil-root .vname{font-size:15px;font-weight:700;color:#2a5ea9}' +
'#bil-root .vname .vcat{font-size:10px;font-weight:800;color:#888780;background:#f7f6f2;border-radius:6px;padding:1px 6px;margin-left:6px;vertical-align:middle}' +
'#bil-root .rythme{font-size:12px;line-height:1.5}' +
'#bil-root .rythme .rdot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;vertical-align:middle}' +
'#bil-root .rdot.ok{background:#53bda7}#bil-root .rdot.warn{background:#fac055}#bil-root .rdot.late{background:#e24b4a}#bil-root .rdot.none{background:#cfcdc5}' +
'#bil-root .rythme .k{color:#888780}#bil-root .rythme .d{font-weight:700;color:#1c2b45}' +
'#bil-root .rythme .rnext{color:#2a5ea9;font-weight:700}#bil-root .rythme .rnext.todo{color:#b4b2a9;font-weight:600}' +
'#bil-root .tcell{display:flex;flex-direction:column;gap:4px}' +
'#bil-root .tcell.empty{color:#b4b2a9;font-style:italic;font-size:12px}' +
'#bil-root .tcell .ttop{display:flex;align-items:center;gap:10px}' +
'#bil-root .tbar{flex:1;height:11px;border-radius:6px;overflow:hidden;display:flex;background:#f1efe8;min-width:80px}' +
'#bil-root .tbar i{display:block;height:100%}' +
'#bil-root .seg-t{background:#53bda7}#bil-root .seg-p{background:#fac055}#bil-root .seg-n{background:#e24b4a}#bil-root .seg-c{background:#d8dfe9}' +
'#bil-root .tpct{font-size:15px;font-weight:800;min-width:42px;text-align:right}' +
'#bil-root .tdet{font-size:11px;color:#888780}' +
'#bil-root .acons{display:inline-flex;align-items:center;gap:6px}#bil-root .acons .ph{width:70px;height:8px;border-radius:5px;border:1px dashed #cfcdc5}' +
'#bil-root .vtf{font-size:14px;font-weight:800}' +
'#bil-root .vtf.up{color:#2c7a68}#bil-root .vtf.down{color:#b23433}#bil-root .vtf.flat{color:#888780}#bil-root .vtf.na{color:#cfcdc5;font-style:italic;font-size:12px}' +
'#bil-root .vchev{color:#b4b2a9;font-size:20px;font-weight:700;text-align:right}' +
'#bil-root .bil-legend{display:flex;gap:16px;flex-wrap:wrap;margin:10px 2px 6px;font-size:11px;color:#888780}' +
'#bil-root .bil-legend .lg{display:inline-flex;align-items:center;gap:5px}' +
'#bil-root .bil-legend .sw{width:11px;height:11px;border-radius:3px;display:inline-block}' +
'#bil-root .bil-legend b{color:#3a3a38}' +
'#bil-root .ctbl{background:#fff;border:1px solid #ece9e1;border-radius:12px;overflow:hidden}' +
'#bil-root .crow{display:grid;grid-template-columns:1.55fr 190px 1fr .85fr .85fr 24px;align-items:center;gap:14px;padding:14px 18px;border-bottom:1px solid #f1efe8;cursor:pointer;transition:background .12s}' +
'#bil-root .crow:last-child{border-bottom:none}' +
'#bil-root .crow.cthead{cursor:default;background:rgba(172,197,228,.16);padding:10px 18px}' +
'#bil-root .crow:not(.cthead):hover{background:rgba(172,197,228,.10)}' +
'#bil-root .cth{font-size:11px;font-weight:800;color:#888780;text-transform:uppercase;letter-spacing:.04em}' +
'#bil-root .cname{font-size:15px;font-weight:700;color:#2a5ea9}' +
'#bil-root .cname .csite{display:block;font-size:11.5px;font-weight:600;color:#888780;margin-top:1px}' +
'#bil-root .cflag{display:inline-block;font-size:10px;font-weight:800;border-radius:5px;padding:1px 7px;margin-left:6px;vertical-align:middle}' +
'#bil-root .cflag.irr{background:rgba(226,75,74,.13);color:#b23433}' +
'#bil-root .cflag.exe{background:rgba(83,189,167,.16);color:#2c7a68}' +
'#bil-root .reg{display:flex;flex-direction:column;gap:3px}' +
'#bil-root .reg-cells{display:flex;gap:3px}' +
'#bil-root .reg-c{width:24px;height:22px;border-radius:5px;background:#f1efe8}' +
'#bil-root .reg-c.empty{border:1px dashed #d8d5cc;background:repeating-linear-gradient(45deg,#fafafa,#fafafa 3px,#f1efe8 3px,#f1efe8 6px)}' +
'#bil-root .reg-labels{display:flex;gap:3px}' +
'#bil-root .reg-labels span{width:24px;text-align:center;font-size:9px;color:#b4b2a9;font-weight:700}' +
'#bil-root .ccov{font-size:14px;font-weight:800}#bil-root .ccov .cfrac{font-size:11px;font-weight:600;color:#888780;display:block;margin-top:1px}' +
'#bil-root .cten{font-size:15px;font-weight:800}' +
'#bil-root .cdel{font-size:14px;font-weight:800}#bil-root .cdel .u{font-size:11px;font-weight:600;color:#888780}' +
'#bil-root .cchev{color:#b4b2a9;font-size:20px;font-weight:700;text-align:right}' +
'#bil-root .bil-period{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#fff;border:1px solid #ece9e1;border-radius:12px;padding:10px 14px;margin-bottom:14px}' +
'#bil-root .bp-lbl{font-size:11px;font-weight:800;color:#888780;text-transform:uppercase;letter-spacing:.04em}' +
'#bil-root .bp-wrap{position:relative}' +
'#bil-root .bp-trigger{display:inline-flex;align-items:center;gap:9px;border:1px solid #ece9e1;border-radius:10px;padding:8px 12px;background:#fff;color:#2a5ea9;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:.12s}' +
'#bil-root .bp-trigger:hover{background:rgba(172,197,228,.12);border-color:#acc5e4}' +
'#bil-root .bp-cal-ico{display:inline-flex;color:#2a5ea9}' +
'#bil-root .bp-range-txt{display:inline-flex;align-items:center;gap:8px;color:#3a3a38;font-weight:700}' +
'#bil-root .bp-arrow{color:#b4b2a9;font-weight:400}' +
'#bil-root .bp-chev{font-size:9px;color:#b4b2a9}' +
'#bil-root .bp-backdrop{position:fixed;inset:0;z-index:40;background:transparent}' +
'#bil-root .bp-pop{position:absolute;top:calc(100% + 6px);left:0;z-index:41;background:#fff;border:1px solid #e3e1d9;border-radius:14px;box-shadow:0 16px 44px rgba(42,52,60,.22);padding:14px;width:290px}' +
'#bil-root .bp-cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}' +
'#bil-root .bp-cal-title{font-size:14px;font-weight:800;color:#2a5ea9;text-transform:capitalize}' +
'#bil-root .bp-nav{width:28px;height:28px;border-radius:8px;border:1px solid #ece9e1;background:#fff;color:#2a5ea9;font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
'#bil-root .bp-nav:hover{background:rgba(172,197,228,.16)}' +
'#bil-root .bp-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}' +
'#bil-root .bp-wd{font-size:10px;font-weight:800;color:#b4b2a9;text-align:center;padding:2px 0 4px}' +
'#bil-root .bp-day{aspect-ratio:1/1;border:none;background:none;border-radius:8px;font-family:inherit;font-size:12.5px;font-weight:600;color:#3a3a38;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center}' +
'#bil-root .bp-day:hover:not(.empty){background:rgba(172,197,228,.22)}' +
'#bil-root .bp-day.empty{cursor:default}' +
'#bil-root .bp-day.today{box-shadow:inset 0 0 0 1.5px #acc5e4}' +
'#bil-root .bp-day.in-range{background:rgba(42,94,169,.10);border-radius:0;color:#2a5ea9}' +
'#bil-root .bp-day.sel-start{background:#2a5ea9;color:#fff;border-radius:8px 0 0 8px}' +
'#bil-root .bp-day.sel-end{background:#2a5ea9;color:#fff;border-radius:0 8px 8px 0}' +
'#bil-root .bp-day.sel-single{background:#2a5ea9;color:#fff;border-radius:8px}' +
'#bil-root .bp-day.pending{background:#53bda7;color:#fff;box-shadow:0 0 0 3px rgba(83,189,167,.25)}' +
'#bil-root .bp-pop-foot{margin-top:12px;padding-top:10px;border-top:1px solid #f0eee6;display:flex;flex-direction:column;gap:8px}' +
'#bil-root .bp-hint{font-size:11px;color:#888780}#bil-root .bp-hint b{color:#2a5ea9}' +
'#bil-root .bp-presets{display:flex;gap:6px;flex-wrap:wrap}' +
'#bil-root .bp-preset{font-size:12px;font-weight:700;color:#2a5ea9;background:#fff;border:1px solid #ece9e1;border-radius:16px;padding:5px 12px;cursor:pointer;font-family:inherit}' +
'#bil-root .bp-preset:hover{background:rgba(172,197,228,.16)}' +
'#bil-root .bil-perim{background:#fff;border:1px solid #ece9e1;border-radius:12px;margin-bottom:14px;padding:10px 12px 12px}' +
'#bil-root .perim-title{font-size:11px;font-weight:800;color:#888780;text-transform:uppercase;letter-spacing:.04em;margin:2px 4px 6px}' +
'#bil-root .tree-row.lv-root{font-weight:800;color:#1c2b45}' +
'#bil-root .tree-row.sel{background:rgba(42,94,169,.10);border-radius:7px}' +
'#bil-root .bil-tabs{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}' +
'#bil-root .bil-tab{font-size:13px;font-weight:700;color:#2a5ea9;background:#fff;border:1px solid #ece9e1;border-radius:9px;padding:8px 16px;cursor:pointer}' +
'#bil-root .bil-tab:hover{background:rgba(172,197,228,.16)}' +
'#bil-root .bil-tab.on{background:#2a5ea9;color:#fff;border-color:#2a5ea9}' +
'#bil-root .hint-line{font-size:12px;color:#888780;margin:2px 0 14px}' +
'#bil-root .lead-head{display:grid;grid-template-columns:46px 1.6fr 150px 1fr 1fr 24px;gap:14px;padding:4px 16px;font-size:11px;font-weight:800;color:#888780;text-transform:uppercase;letter-spacing:.04em}' +
'#bil-root .lead-list{display:flex;flex-direction:column;gap:8px}' +
'#bil-root .lead-row{display:grid;grid-template-columns:46px 1.6fr 150px 1fr 1fr 24px;align-items:center;gap:14px;background:#fff;border:1px solid #ece9e1;border-radius:12px;padding:13px 16px;cursor:pointer;transition:box-shadow .15s,transform .12s}' +
'#bil-root .lead-row:hover{box-shadow:0 4px 16px rgba(42,94,169,.10);transform:translateY(-1px)}' +
'#bil-root .lead-score{width:46px;height:42px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800}' +
'#bil-root .lead-name{font-size:15px;font-weight:700;color:#2a5ea9}' +
'#bil-root .lead-name .lead-sub{display:block;font-size:11.5px;font-weight:600;color:#888780;margin-top:1px}' +
'#bil-root .lead-metric{font-size:14px;font-weight:800}' +
'#bil-root .lead-metric .lm-l{display:block;font-size:10px;font-weight:700;color:#b4b2a9;text-transform:uppercase;letter-spacing:.03em;margin-bottom:1px}' +
'#bil-root .lead-na{font-size:11px;color:#b4b2a9}' +
'#bil-root .lead-chev{color:#b4b2a9;font-size:20px;font-weight:700;text-align:right}' +
'#bil-root .bil-hscroll{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}' +
'#bil-root .bil-hscroll-inner{min-width:700px}' +
'#bil-root .bil-hscroll .vtbl{min-width:720px}' +
'#bil-root .bil-hscroll .ctbl{min-width:760px}' +
'@media (max-width:760px){' +
  '#bil-root .suivi-search{flex:1 1 100%;max-width:none}' +
  '#bil-root .tl::before{left:13px}' +
  '#bil-root .tl-sep{text-align:left;padding-left:0}' +
  '#bil-root .tl-row,#bil-root .tl-row.left,#bil-root .tl-row.right{justify-content:flex-end;min-height:auto;margin-bottom:24px}' +
  '#bil-root .tl-dot{left:13px;top:6px;transform:none}' +
  '#bil-root .tl-date{left:36px;top:-4px;transform:none}' +
  '#bil-root .tl-card{width:calc(100% - 36px);margin-top:14px}' +
  '#bil-root .tl-row.left .tl-card::after,#bil-root .tl-row.right .tl-card::after{display:none}' +
  '#bil-root .bil-ov{padding:12px}' +
'}' +
'#bil-root.bil-narrow .suivi-search{flex:1 1 100%;max-width:none}' +
'#bil-root.bil-narrow .tl::before{left:13px}' +
'#bil-root.bil-narrow .tl-sep{text-align:left;padding-left:0}' +
'#bil-root.bil-narrow .tl-row,#bil-root.bil-narrow .tl-row.left,#bil-root.bil-narrow .tl-row.right{justify-content:flex-end;min-height:auto;margin-bottom:24px}' +
'#bil-root.bil-narrow .tl-dot{left:13px;top:6px;transform:none}' +
'#bil-root.bil-narrow .tl-date{left:36px;top:-4px;transform:none}' +
'#bil-root.bil-narrow .tl-card{width:calc(100% - 36px);margin-top:14px}' +
'#bil-root.bil-narrow .tl-row.left .tl-card::after,#bil-root.bil-narrow .tl-row.right .tl-card::after{display:none}' +
'</style>';

// --- Watcher période DÉSACTIVÉ ----------------------------------------------
// La période est désormais pilotée par le sélecteur de dates autonome de la page
// (voir renderDatePicker / __bilSetPeriod). On s'assure juste qu'un ancien timer
// éventuellement laissé par une précédente version soit bien arrêté.
(function stopLegacyPeriodWatcher() {
  if (window.__bilPeriodTimer) { clearInterval(window.__bilPeriodTimer); window.__bilPeriodTimer = null; }
})();

// --- Démarrage robuste (attend #bil-root si pas encore monté) ---------------
// Démarrage : le loader fournit __anchor et possède le cycle de vie (re-montage
// SPA compris) -> plus d'attente d'ancre ni de filets de re-render.
render(); loadData();


// ============================================================================
//  MODULE POPUP RÉALISATION (intégré dans le suivi)
//  Ouvre un grand popup #real-ov avec tout le contexte vendeur + saisie + histo.
//  Sous-état R isolé. Fonctions préfixées R_. Réutilise esc/fmtDate/fmtHeure du suivi.
// ============================================================================
const R = { bilId:null, detail:null, synth:null, hist:null, loading:false, error:null, kpi:'cmd_vn', histIdx:0, saving:false, b2filter:'tous',
  engagements:[], ouverts:[], revues:{}, engLoaded:false, reunion:false, _draftApplied:false };

const R_WF_GET_FICHE  = '53250f54-d14c-4622-baf4-0b89064316b6';
const R_PAGE_FICHE_ID = '259f1951-a2d4-4b90-ac83-0b3febe1d4ec';
const R_TAB_CONTACTS  = 2;
const R_PAGE_PROPALE_UPDATE = 'efb6187d-2330-4392-86ed-bc5ad2489fed';
const R_VAR_ID_PROPALE      = 'aac565e9-ad32-4f81-bf8d-adb611322e62';
const R_PDF_EDGE_FN   = 'generate-document';
const R_TPL_PROPOSITION  = 'a8a39792-b795-4a07-92a2-8bd307ec105b';
const R_TPL_BON_COMMANDE = 'a440bca0-e10a-4549-a11b-f4ad512b010d';
const R_PDF_BUCKET    = 'commercial-documents';

function R_eur(n){ if(n==null) return ''; return new Intl.NumberFormat('fr-FR').format(Math.round(n))+' €'; }


// Navigation ÉDITEUR vs PROD (patron topnav) : en prod, un UID s'inscrit tel quel
// dans l'URL -> route inexistante -> page blanche. On navigue donc par CHEMIN.
const R_SELECTED_CLIENT_VAR = '55490583-c88b-4748-916e-4d203db07742';
const R_PATH_FICHE_CLIENT   = '/fr/fiche-client';
const R_PATH_PROPALE_UPDATE = '/fr/propo-vo-update';
function R_inEditor(){
  try { return (window.self !== window.top) || /-editor\.weweb\.io|weweb\.io/i.test(location.hostname); }
  catch(e){ return true; }
}
function R_goPage(pageId, path){
  if (R_inEditor()) { try { wwLib.wwApp.goTo(pageId); return; } catch(e){} }
  try { wwLib.goTo(path); return; } catch(e){}
  try { (doc.defaultView || window).location.href = path; } catch(e){}
}
// Ouvre la fiche client : le client passe par SA variable (fiche-shell recharge
// lui-même) et l'onglet par le global lu par fiche-shell. Le workflow WeWeb
// R_WF_GET_FICHE a été supprimé du projet -> on ne l'appelle plus.
function R_setClientAndTab(idClient, tab){
  try { wwLib.wwVariable.updateValue(R_SELECTED_CLIENT_VAR, { IDVu: Number(idClient) }); } catch(e){}
  try { const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window; w.__odFicheTab = (tab != null ? tab : 0); } catch(e){}
}
async function R_openClientFiche(idClient){
  if(!idClient){ console.warn('[real] openClientFiche: id_client manquant'); return; }
  try {
    R_setClientAndTab(idClient, R_TAB_CONTACTS);
    R_close();
    R_goPage(R_PAGE_FICHE_ID, R_PATH_FICHE_CLIENT);
  } catch(e){ console.error('[real] openClientFiche', e); }
}
async function R_openClientFicheTab(idClient, tab){
  if(!idClient){ return; }
  try {
    R_setClientAndTab(idClient, tab);
    R_close();
    R_goPage(R_PAGE_FICHE_ID, R_PATH_FICHE_CLIENT);
  } catch(e){ console.error('[real] openClientFicheTab', e); }
}
function R_modifPropale(idPropale){
  try { wwLib.wwVariable.updateValue(R_VAR_ID_PROPALE, Number(idPropale)); }
  catch(e){ console.error('[real] updateValue id_propale_bdc', e); }
  try { R_close(); R_goPage(R_PAGE_PROPALE_UPDATE, R_PATH_PROPALE_UPDATE); }
  catch(e){ console.error('[real] navigation propale update', e); }
}
async function R_pdfPropale(idPropale, status, majIso){
  const supabase = ctx.supabase;
  const isPropale = (status==='propale');
  const type = isPropale ? 'proposition_commerciale' : 'bon_de_commande';
  const templateId = isPropale ? R_TPL_PROPOSITION : R_TPL_BON_COMMANDE;
  const btn = doc.querySelector('[data-rpdf="'+idPropale+':'+status+'"]');
  if(btn){ btn.disabled=true; btn.style.opacity='.5'; }
  const open = (url)=>{ try { wwLib.getFrontWindow().open(url, '_blank'); } catch(e){ window.open(url,'_blank'); } };
  const done = ()=>{ if(btn){ btn.disabled=false; btn.style.opacity=''; } };
  const generer = async ()=>{
    const { data: gen, error: gErr } = await supabase.functions.invoke(R_PDF_EDGE_FN, {
      body: { id_propale_bdc: idPropale, template_id: templateId, type: type }
    });
    if(gErr) throw gErr;
    if(gen && gen.ok && gen.signed_url){ open(gen.signed_url); }
    else { throw new Error(gen && gen.error ? gen.error : 'Génération PDF échouée'); }
  };
  try {
    const { data: docs, error: qErr } = await supabase
      .from('generated_documents')
      .select('storage_path, ready_at')
      .eq('id_propale_bdc', idPropale)
      .eq('type', type)
      .eq('status', 'ready')
      .order('ready_at', { ascending: false })
      .limit(1);
    if(qErr) throw qErr;
    if(docs && docs.length && docs[0].storage_path){
      const pdfTime = docs[0].ready_at ? new Date(docs[0].ready_at).getTime() : 0;
      const majTime = majIso ? new Date(String(majIso).replace(' ','T')).getTime() : 0;
      const aJour = pdfTime >= majTime;
      if(aJour){
        const { data: signed, error: sErr } = await supabase.storage
          .from(R_PDF_BUCKET).createSignedUrl(docs[0].storage_path, 3600);
        if(!sErr && signed && signed.signedUrl){ open(signed.signedUrl); return; }
      }
    }
    await generer();
  } catch(e){
    console.error('[real] PDF propale', e);
    alert('Impossible de générer le PDF : '+((e && e.message)?e.message:e));
  } finally { done(); }
}

function R_LS(){ try { return wwLib.getFrontWindow().localStorage; } catch(e){ return window.localStorage; } }
let R_draftTimer=null;
function R_saveDraft(){
  if(R.bilId==null) return;
  if(R_draftTimer) clearTimeout(R_draftTimer);
  R_draftTimer=setTimeout(()=>{
    try {
      const payload={ resultat:(R.detail&&R.detail.resultat)||'', actions:(R.detail&&R.detail.actions)||'',
        engagements:(R.engagements||[]).map(e=>({libelle:e.libelle,ordre:e.ordre})), revues:R.revues||{}, ts:Date.now() };
      R_LS().setItem('bil_draft_'+R.bilId, JSON.stringify(payload));
      const ind=doc.getElementById('r-draft-ind'); if(ind){ ind.textContent='brouillon enregistré'; ind.style.opacity='1'; setTimeout(()=>{ if(ind) ind.style.opacity='.5'; },1200); }
    } catch(e){}
  }, 500);
}
function R_clearDraft(){ try { R_LS().removeItem('bil_draft_'+R.bilId); } catch(e){} }
function R_applyDraft(){
  if(R._draftApplied) return; R._draftApplied=true;
  try {
    const raw=R_LS().getItem('bil_draft_'+R.bilId); if(!raw) return;
    const d=JSON.parse(raw); if(!d) return;
    if(R.detail){ if(d.resultat) R.detail.resultat=d.resultat; if(d.actions) R.detail.actions=d.actions; }
    if(Array.isArray(d.engagements) && d.engagements.length) R.engagements=d.engagements.map((e,i)=>({ libelle:e.libelle||'', ordre:e.ordre!=null?e.ordre:i }));
    if(d.revues && typeof d.revues==='object') R.revues=d.revues;
  } catch(e){}
}
window.__bilDraftField=function(which,val){ if(!R.detail) return; if(which==='res') R.detail.resultat=val; if(which==='act') R.detail.actions=val; R_saveDraft(); };
window.__bilEngInput=function(i,val){ if(R.engagements && R.engagements[i]){ R.engagements[i].libelle=val; R_saveDraft(); } };

function R_print(){
  const d=R.detail; if(!d) return;
  const res=(doc.getElementById('rf-res')&&doc.getElementById('rf-res').value) || d.resultat || '';
  const act=(doc.getElementById('rf-act')&&doc.getElementById('rf-act').value) || d.actions || '';
  const inps=doc.querySelectorAll('#real-ov .eng-inp');
  (R.engagements||[]).forEach((e,i)=>{ if(inps[i]) e.libelle=inps[i].value; });
  const engs=(R.engagements||[]).map(e=>(e.libelle||'').trim()).filter(Boolean);
  const stLbl=(st)=> st==='tenu'?'Tenu':st==='partiel'?'Partiel':st==='non_tenu'?'Non tenu':'En cours';
  const ouvertsHtml=(R.ouverts||[]).map(o=>'<li>'+esc(o.libelle)+' — <b>'+stLbl(R.revues[o.id])+'</b></li>').join('');
  const today=new Date(); const todayStr=today.getDate()+' '+MOIS_FR[today.getMonth()]+' '+today.getFullYear();
  const html='<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bilatérale '+esc(d.nom_vendeur)+'</title>'+
    '<style>body{font-family:Arial,Helvetica,sans-serif;color:#1c2b45;max-width:720px;margin:30px auto;padding:0 24px;line-height:1.5}'+
    'h1{color:#2a5ea9;font-size:22px;margin:0 0 4px}.sub{color:#888;font-size:13px;margin-bottom:22px}'+
    'h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid #acc5e4;padding-bottom:4px;margin:22px 0 8px;color:#2a5ea9}'+
    '.txt{white-space:pre-wrap;font-size:14px}ul{margin:6px 0;padding-left:20px}li{margin:3px 0;font-size:14px}'+
    '.foot{margin-top:34px;color:#aaa;font-size:11px;border-top:1px solid #eee;padding-top:8px}@media print{body{margin:0}}</style>'+
    '</head><body>'+
    '<h1>Compte-rendu de bilatérale</h1>'+
    '<div class="sub">'+esc(d.nom_vendeur)+(d.vn_vo?(' · '+esc(d.vn_vo)):'')+' · '+esc(d.nom_site||'')+'<br>'+esc(fmtDate(d.start_date))+' · avec '+esc(d.nom_chef||'')+'</div>'+
    (ouvertsHtml?'<h2>Suivi des engagements précédents</h2><ul>'+ouvertsHtml+'</ul>':'')+
    '<h2>Résultat</h2><div class="txt">'+esc(res||'—')+'</div>'+
    '<h2>Actions</h2><div class="txt">'+esc(act||'—')+'</div>'+
    '<h2>Engagements pris</h2>'+(engs.length?('<ul>'+engs.map(e=>'<li>'+esc(e)+'</li>').join('')+'</ul>'):'<div class="txt">—</div>')+
    '<div class="foot">Édité le '+todayStr+' depuis CRM360</div>'+
    '<scr'+'ipt>window.onload=function(){setTimeout(function(){window.print();},250);};</scr'+'ipt>'+
    '</body></html>';
  let w; try { w=wwLib.getFrontWindow().open('','_blank'); } catch(e){ w=window.open('','_blank'); }
  if(!w){ alert('Veuillez autoriser les fenêtres pop-up pour imprimer le compte-rendu.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

function R_open(bilId){
  R.bilId = Number(bilId); R.detail=null; R.synth=null; R.hist=null;
  R.error=null; R.kpi='cmd_vn'; R.histIdx=0; R.saving=false;
  R.synthLoading=false; R.histLoading=false; R.synthError=null;
  R.engagements=[]; R.ouverts=[]; R.revues={}; R.engLoaded=false; R.reunion=false; R._draftApplied=false;
  R_ensureOverlay();
  R_render();
  R_load();
}
function R_close(){ const ov = doc.getElementById('real-ov'); if(ov) ov.remove(); }
function R_ensureOverlay(){
  let ov = doc.getElementById('real-ov');
  if(!ov){ ov = doc.createElement('div'); ov.id='real-ov'; doc.body.appendChild(ov); }
}

async function R_load(){
  const id = R.bilId;
  if(id==null){ R.error='Aucune bilatérale spécifiée.'; R_render(); return; }
  if(R.loading) return;
  R.loading=true; R.error=null; R_render();
  try {
    const supabase = ctx.supabase;
    const rDet = await supabase.rpc('get_bilaterale_detail', { p_id: id });
    if(rDet.error) throw rDet.error;
    R.detail = rDet.data || null;
    if(!R.detail || R.detail.id_user==null){ R.error='Bilatérale introuvable.'; R.loading=false; R_render(); return; }
    R.loading=false;
    R.synthLoading=true; R.histLoading=true;
    R_render();
    const idUser = Number(R.detail.id_user);
    const sd = R.detail.start_date ? new Date(String(R.detail.start_date).replace(' ','T')) : new Date();
    const now = new Date();
    const from = new Date(sd.getFullYear(), sd.getMonth(), 1);
    const finMois = new Date(sd.getFullYear(), sd.getMonth()+1, 0);
    const to = (now < finMois) ? now : finMois;
    const ymd = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    supabase.rpc('get_vendeur_synthese', { p_id_user: idUser, p_date_from: ymd(from), p_date_to: ymd(to) })
      .then(r=>{ if(r.error) throw r.error; R.synth=r.data||{}; })
      .catch(e=>{ console.error('[real] synthese', e); R.synth={}; R.synthError=(e&&e.message)?e.message:String(e); })
      .finally(()=>{ R.synthLoading=false; R_render(); });
    supabase.rpc('get_bilaterales_historique', { p_id_user: idUser, p_exclure_id: id })
      .then(r=>{ if(r.error) throw r.error; R.hist=r.data||[]; })
      .catch(e=>{ console.error('[real] historique', e); R.hist=[]; })
      .finally(()=>{ R.histLoading=false; R_render(); });
    supabase.rpc('get_bilaterale_engagements', { p_id_bilaterales: id })
      .then(r=>{ if(r.error) throw r.error; R.engagements=(r.data||[]).map(x=>({ id:x.id, libelle:x.libelle, ordre:x.ordre })); })
      .catch(e=>{ console.error('[real] engagements', e); R.engagements=[]; })
      .finally(()=>{ R.engLoaded=true; R_applyDraft(); R_render(); });
    supabase.rpc('get_engagements_ouverts', { p_id_user: idUser, p_exclure_bilaterale: id })
      .then(r=>{ if(r.error) throw r.error; R.ouverts=(r.data||[]).map(x=>({ id:x.id, libelle:x.libelle, statut_suivi:x.statut_suivi, id_bilaterales:x.id_bilaterales, bilaterale_date:x.bilaterale_date })); })
      .catch(e=>{ console.error('[real] ouverts', e); R.ouverts=[]; })
      .finally(()=>{ R_render(); });
  } catch(e){
    console.error('[real] RPC', e);
    R.error = (e && e.message) ? e.message : String(e);
    R.loading=false; R_render();
  }
}

function R_kpiData(){
  const k=(R.synth&&R.synth.kpi)||{};
  const cycles=(R.synth&&R.synth.cycles)||[];
  const clos=(R.synth&&R.synth.clos)||[];
  const pipeline=(R.synth&&R.synth.pipeline)||[];
  const rdv=(R.synth&&R.synth.rdv)||[];
  const atraiter=cycles.filter(c=>c.categorie==='retard'||c.categorie==='urgent');
  const nbRetardRdv=rdv.filter(r=>r.en_retard===true).length;
  const nbAvenirRdv=rdv.filter(r=>r.categorie==='avenir').length;
  const wins=clos.filter(c=>c.type_cloture==='win').length;
  const abandons=clos.filter(c=>c.type_cloture==='abandon').length;
  return {k,cycles,clos,pipeline,rdv,atraiter,nbRetardRdv,nbAvenirRdv,wins,abandons};
}
function R_kpis(){
  const D=R_kpiData(); const k=D.k;
  const pctK=(rea,obj)=>{ rea=rea||0; obj=obj||0; if(obj>0) return Math.round(100*rea/obj); if(rea>0) return 100; return 0; };
  const cmdVN=(k.commandes_realisees_vn!=null?k.commandes_realisees_vn:0)+' / '+(k.objectif_commandes_vn!=null?k.objectif_commandes_vn:0);
  const cmdVO=(k.commandes_realisees_vo!=null?k.commandes_realisees_vo:0)+' / '+(k.objectif_commandes_vo!=null?k.objectif_commandes_vo:0);
  const pctVN=pctK(k.commandes_realisees_vn,k.objectif_commandes_vn);
  const pctVO=pctK(k.commandes_realisees_vo,k.objectif_commandes_vo);
  const tr=(R.synth&&R.synth.transfo)||{};
  const transfo = (tr.taux!=null) ? tr.taux : null;
  const on=s=>R.kpi===s?' on':'';
  let h='<div class="kpis">';
  h+='<div class="kpi clik kvn'+on('cmd_vn')+'" data-rkpi="cmd_vn"><div class="k-l">Commandes VN</div><div class="k-v" style="color:#53bda7">'+cmdVN+'</div><div class="k-s">'+pctVN+'%</div></div>';
  h+='<div class="kpi clik kvo'+on('cmd_vo')+'" data-rkpi="cmd_vo"><div class="k-l">Commandes VO</div><div class="k-v" style="color:#d9892a">'+cmdVO+'</div><div class="k-s">'+pctVO+'%</div></div>';
  h+='<div class="kpi mute" data-rkpi="transfo"><div class="k-l">Transfo</div><div class="k-v" style="color:#53bda7">'+(transfo!=null?transfo+'%':'—')+'</div><div class="k-s">wins / propales</div></div>';
  h+='<div class="kpi clik'+on('cycles')+'" data-rkpi="cycles"><div class="k-l">Cycles ouverts</div><div class="k-v" style="color:#2a5ea9">'+D.cycles.length+'</div><div class="k-s">au total</div></div>';
  h+='<div class="kpi clik'+on('atraiter')+'" data-rkpi="atraiter"><div class="k-l">À traiter</div><div class="k-v" style="color:#8a6410">'+D.atraiter.length+'</div><div class="k-s">retard + urgents</div></div>';
  h+='<div class="kpi clik'+on('pipeline')+'" data-rkpi="pipeline"><div class="k-l">Pipeline</div><div class="k-v" style="color:#53bda7">'+D.pipeline.length+'</div><div class="k-s">propales/BDC</div></div>';
  h+='<div class="kpi clik'+on('rdv')+'" data-rkpi="rdv"><div class="k-l">RDV</div><div class="k-v" style="color:#2a5ea9">'+D.nbAvenirRdv+(D.nbRetardRdv>0?' <span style="font-size:12px;color:#e24b4a;font-weight:800">⚠'+D.nbRetardRdv+'</span>':'')+'</div><div class="k-s">à venir'+(D.nbRetardRdv>0?' · '+D.nbRetardRdv+' sans CR':'')+'</div></div>';
  h+='<div class="kpi clik'+on('clos')+'" data-rkpi="clos"><div class="k-l">Clos 30j</div><div class="k-v" style="color:#888780">'+D.clos.length+'</div><div class="k-s">'+D.wins+' wins · '+D.abandons+' abandons</div></div>';
  h+='</div>';
  return h;
}
function R_row(cli,info,badge,onclick){
  return '<div class="cyc" data-rgo="'+onclick+'"><div><div class="c-cli">'+esc(cli)+'</div><div class="c-info">'+esc(info)+'</div></div>'+
         '<div class="c-right">'+(badge||'')+'<span class="c-arrow">›</span></div></div>';
}
function R_propaleRow(p){
  const st=p.status;
  const badge = st==='propale'?'<span class="badge prop">propale</span>'
              : st==='bdc'?'<span class="badge bdc">BDC</span>'
              : st==='win'?'<span class="badge win">vendu</span>'
              : '<span class="badge lose">perdu</span>';
  const info=[R_eur(p.montant),p.label,p.vin].filter(Boolean).join(' · ');
  const id=p.id_propale_bdc;
  const pdfBtn = (st==='propale'||st==='bdc'||st==='win')
    ? '<button class="pp-icon pp-pdf" data-rpdf="'+id+':'+st+'" data-rmaj="'+(p.maj||'')+'" title="PDF du document">'+R_PDF_SVG+'</button>'
    : '';
  const modBtn = (st==='propale')
    ? '<button class="pp-icon pp-mod" data-rmodif="'+id+'" title="Modifier la propale">'+R_EDIT_SVG+'</button>'
    : '';
  return '<div class="cyc pp-row">'+
    '<div class="pp-main" data-rgo="client:'+p.id_client+'"><div class="c-cli">'+esc(p.client)+'</div><div class="c-info">'+esc(info)+'</div></div>'+
    '<div class="c-right">'+badge+pdfBtn+modBtn+'</div>'+
  '</div>';
}
const R_PDF_SVG='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>';
const R_EDIT_SVG='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
function R_chips(cats){
  let h='<div class="b2-chips">';
  cats.forEach(([key,label,count])=>{
    if(count===0 && key!=='tous') return;
    h+='<span class="b2-chip'+(R.b2filter===key?' on':'')+'" data-rchip="'+key+'">'+label+'<span class="b2-chip-n">'+count+'</span></span>';
  });
  h+='</div>';
  return h;
}
function R_bloc2(){
  const D=R_kpiData(); const k=R.kpi;
  if(k==='cmd_vn' || k==='cmd_vo'){
    const x=D.k; const isVN=(k==='cmd_vn');
    const col=isVN?'#53bda7':'#d9892a';
    const sfx=isVN?'_vn':'_vo';
    const g=(base)=>x[base+sfx];
    const pct=(rea,obj)=>{ rea=rea||0; obj=obj||0; if(obj>0) return Math.round(100*rea/obj); if(rea>0) return 100; return null; };
    const cell=(lbl,rea,obj,cc)=>{
      rea=rea||0; obj=obj||0; const p=pct(rea,obj);
      if(p===null) return '';
      const barCol = p>=100?'#53bda7':(p>=60?cc:'#d9892a');
      return '<div class="perf-row"><div class="p-l">'+lbl+'</div>'+
        '<div class="p-v"'+(cc?' style="color:'+cc+'"':'')+'>'+rea+' / '+obj+'</div>'+
        '<div class="perf-bar"><i style="width:'+Math.min(p,100)+'%;background:'+barCol+'"></i></div>'+
        '<div class="perf-pct">'+p+'% de l\'objectif</div></div>';
    };
    let cells='';
    cells+=cell('Commandes '+(isVN?'VN':'VO'),g('commandes_realisees'),g('objectif_commandes'),col);
    cells+=cell('Financements',g('financements_realises'),g('objectif_financements'),'#2a5ea9');
    cells+=cell('Contrats service',g('contrats_realises'),g('objectif_contrat_service'),'#2a5ea9');
    cells+=cell('Gravages',g('gravages_realises'),g('objectif_gravage'),'#2a5ea9');
    cells+=cell('Waxoyl',g('waxoyls_realises'),g('objectif_waxoyl'),'#2a5ea9');
    return '<div class="b2-title">Détail des performances '+(isVN?'VN (véhicules neufs)':'VO (véhicules d\'occasion)')+'</div><div class="perf-grid">'+cells+'</div>';
  }
  if(k==='cycles'){
    const cats=[['tous','Tous',D.cycles.length],['retard','En retard',D.cycles.filter(c=>c.categorie==='retard').length],['urgent','Urgents',D.cycles.filter(c=>c.categorie==='urgent').length],['cours','En cours',D.cycles.filter(c=>c.categorie==='cours').length]];
    let h='<div class="b2-title">'+D.cycles.length+' cycles ouverts</div>'+R_chips(cats);
    const grp=(titre,cls,cat)=>{ if(R.b2filter!=='tous'&&R.b2filter!==cat) return ''; const list=D.cycles.filter(c=>c.categorie===cat); if(!list.length) return '';
      let s='<div class="pipe-group"><div class="pipe-gt '+cls+'">'+titre+' <span class="gn">'+list.length+'</span></div>';
      list.slice(0,12).forEach(c=> s+=R_row(c.client,(c.temperature||'')+(c.heures_inactivite!=null?' · inactif '+Math.round(c.heures_inactivite/24)+'j':''),'','cycle:'+(c.id_cycle_com||'')+':'+c.id_client));
      if(list.length>12) s+='<div class="b2-empty">+ '+(list.length-12)+' autres</div>'; return s+'</div>'; };
    return h+grp('En retard','retard','retard')+grp('Urgents','urgent','urgent')+grp('En cours','cours','cours');
  }
  if(k==='atraiter'){
    if(!D.atraiter.length) return '<div class="b2-empty">Aucun lead à traiter.</div>';
    let s='<div class="b2-title">'+D.atraiter.length+' à traiter (retard + urgents)</div>';
    D.atraiter.forEach(c=> s+=R_row(c.client,[c.source_lead,c.canal_lead,c.message_lead].filter(Boolean).join(' · '),'','cycle:'+(c.id_cycle_com||'')+':'+c.id_client));
    return s;
  }
  if(k==='pipeline'){
    if(!D.pipeline.length) return '<div class="b2-empty">Aucune propale/BDC en cours.</div>';
    const cats=[['tous','Tous',D.pipeline.length],['propale','Propales',D.pipeline.filter(p=>p.status==='propale').length],['bdc','BDC',D.pipeline.filter(p=>p.status==='bdc').length],['win','Wins',D.pipeline.filter(p=>p.status==='win').length],['lose','Abandons',D.pipeline.filter(p=>p.status==='lose').length]];
    let h='<div class="b2-title">Pipeline commercial — '+D.pipeline.length+' documents</div>'+R_chips(cats);
    const filtered = R.b2filter==='tous' ? D.pipeline : D.pipeline.filter(p=>p.status===R.b2filter);
    const sect=(label,cls,vnvo)=>{
      const list=filtered.filter(p=>(p.vn_vo||'').toUpperCase()===vnvo);
      if(!list.length) return '';
      let s='<div class="pipe-group"><div class="pipe-gt '+cls+'">'+label+' <span class="gn">'+list.length+'</span></div>';
      list.forEach(p=> s+=R_propaleRow(p));
      return s+'</div>';
    };
    let body=sect('VN — véhicules neufs','cours','VN')+sect('VO — véhicules d\'occasion','urgent','VO');
    const autres=filtered.filter(p=>!['VN','VO'].includes((p.vn_vo||'').toUpperCase()));
    if(autres.length){ let s='<div class="pipe-group"><div class="pipe-gt win">Autres <span class="gn">'+autres.length+'</span></div>'; autres.forEach(p=> s+=R_propaleRow(p)); body+=s+'</div>'; }
    if(!body) body='<div class="b2-empty">Aucun document pour ce filtre.</div>';
    return h+body;
  }
  if(k==='rdv'){
    const retards=D.rdv.filter(r=>r.en_retard===true); const avenir=D.rdv.filter(r=>r.categorie==='avenir');
    let s='<div class="b2-title">Rendez-vous</div>';
    if(retards.length){ s+='<div class="pipe-group"><div class="pipe-gt aband">En retard — compte-rendu manquant <span class="gn">'+retards.length+'</span></div>';
      retards.forEach(r=> s+=R_row(r.client,fmtDate(r.start_date)+' · '+(r.commentaire||''),'','cycle:'+(r.id_cycle_com||'')+':'+r.id_client)); s+='</div>'; }
    if(avenir.length){ s+='<div class="pipe-group"><div class="pipe-gt cours">À venir <span class="gn">'+avenir.length+'</span></div>';
      avenir.slice(0,10).forEach(r=> s+=R_row(r.client,fmtDate(r.start_date)+' '+fmtHeure(r.start_date)+' · '+(r.commentaire||''),'','cycle:'+(r.id_cycle_com||'')+':'+r.id_client));
      if(avenir.length>10) s+='<div class="b2-empty">+ '+(avenir.length-10)+' autres RDV</div>'; s+='</div>'; }
    if(!retards.length&&!avenir.length) s+='<div class="b2-empty">Aucun RDV.</div>';
    return s;
  }
  if(k==='clos'){
    const cats=[['tous','Tous',D.clos.length],['win','Wins',D.clos.filter(c=>c.type_cloture==='win').length],['abandon','Abandons',D.clos.filter(c=>c.type_cloture==='abandon').length],['autre','Autres',D.clos.filter(c=>c.type_cloture==='autre').length]];
    let h='<div class="b2-title">'+D.clos.length+' cycles clos sur 30 jours</div>'+R_chips(cats);
    const grp=(titre,cls,type)=>{ if(R.b2filter!=='tous'&&R.b2filter!==type) return ''; const list=D.clos.filter(c=>c.type_cloture===type); if(!list.length) return '';
      let s='<div class="pipe-group"><div class="pipe-gt '+cls+'">'+titre+' <span class="gn">'+list.length+'</span></div>';
      list.forEach(c=> s+=R_row(c.client,'clôturé il y a '+(c.jours_depuis_cloture!=null?c.jours_depuis_cloture:'?')+'j','','cycle:'+(c.id_cycle_com||'')+':'+c.id_client));
      return s+'</div>'; };
    return h+grp('Wins','win','win')+grp('Abandons','aband','abandon')+grp('Autres','cours','autre');
  }
  return '';
}
function R_engStatutBtns(o){
  const cur=R.revues[o.id];
  const opt=(val,lbl,cls)=> '<button class="rev-b '+cls+(cur===val?' on':'')+'" data-ract="rev:'+o.id+':'+val+'">'+lbl+'</button>';
  return '<div class="rev-btns">'+opt('tenu','Tenu','t')+opt('partiel','Partiel','p')+opt('non_tenu','Non tenu','n')+'</div>';
}
function R_saisie(){
  const d=R.detail;
  let h='<div class="sec"><div class="sec-t">Compte-rendu de l\'entretien <span id="r-draft-ind" class="draft-ind">brouillon auto</span></div>';
  if(R.ouverts && R.ouverts.length){
    h+='<div class="rev-block"><div class="rev-title">Engagements de la dernière fois <span class="pill">à pointer</span></div>';
    R.ouverts.forEach(o=>{
      h+='<div class="rev-row"><div class="rev-lib">'+esc(o.libelle)+(o.bilaterale_date?'<span class="rev-date">pris le '+fmtDate(o.bilaterale_date)+'</span>':'')+'</div>'+R_engStatutBtns(o)+'</div>';
    });
    h+='</div>';
  }
  h+='<div class="field res"><label>Résultat</label><textarea id="rf-res" oninput="window.__bilDraftField(\'res\',this.value)" placeholder="Bilan de la période…">'+esc(d.resultat||'')+'</textarea></div>'+
     '<div class="field act"><label>Actions</label><textarea id="rf-act" oninput="window.__bilDraftField(\'act\',this.value)" placeholder="Actions décidées, accompagnement…">'+esc(d.actions||'')+'</textarea></div>';
  h+='<div class="eng-block"><label class="eng-lbl">Engagements pris</label>';
  if(!R.engLoaded){ h+='<div class="r-load-inline">Chargement…</div>'; }
  else {
    const list=R.engagements||[];
    if(!list.length){ h+='<div class="eng-empty">Aucun engagement saisi pour l\'instant.</div>'; }
    list.forEach((e,i)=>{
      h+='<div class="eng-item"><span class="eng-h">'+(i+1)+'</span>'+
        '<input class="eng-inp" value="'+esc(e.libelle||'')+'" oninput="window.__bilEngInput('+i+',this.value)" placeholder="Engagement pris par le vendeur…">'+
        '<button class="eng-del" data-ract="eng_del:'+i+'" title="Supprimer">×</button></div>';
    });
    h+='<button class="eng-add" data-ract="eng_add">+ Ajouter un engagement</button>';
  }
  h+='</div>';
  h+='<div class="save-bar"><span id="r-save-msg" class="save-msg"></span>'+
    '<button class="btn btn-ghost" data-ract="print">Imprimer / PDF</button>'+
    '<button class="btn btn-sec" data-ract="annuler">Annuler</button>'+
    '<button class="btn btn-prim" data-ract="save"'+(R.saving?' disabled':'')+'>'+(R.saving?'Enregistrement…':'Enregistrer la bilatérale')+'</button></div></div>';
  return h;
}
function R_histo(){
  const hist=R.hist||[];
  let h='<div class="sec"><div class="sec-t">Bilatérales précédentes <span class="pill">naviguez dans l\'historique</span></div>';
  if(!hist.length){ h+='<div class="b2-empty">Aucune bilatérale réalisée précédemment pour ce vendeur.</div></div>'; return h; }
  const n=hist.length;
  const idx=Math.min(R.histIdx||0, n-1);
  const tsOf=b=>{ try{ return new Date(String(b.start_date).replace(' ','T')).getTime(); }catch(e){ return 0; } };
  const times=hist.map(tsOf);
  const MAX_DOTS=8;
  let winStart=0, winEnd=n;
  if(n>MAX_DOTS){ winStart=Math.max(0, Math.min(idx-Math.floor(MAX_DOTS/2), n-MAX_DOTS)); winEnd=winStart+MAX_DOTS; }
  const win=[]; for(let i=winStart;i<winEnd;i++) win.push(i);
  const wTimes=win.map(i=>times[i]);
  const wMin=Math.min.apply(null,wTimes), wMax=Math.max.apply(null,wTimes);
  const wSpan=(wMax-wMin)||1;
  const posOf=i=> win.length===1 ? 50 : (4 + 92*(times[i]-wMin)/wSpan);
  const b=hist[idx];
  h+='<div class="tl2-nav">';
  h+='<button class="tl2-arrow" data-rhistnav="prev"'+(idx>=n-1?' disabled':'')+' title="Plus ancienne">‹</button>';
  h+='<div class="tl2-cur"><span class="tl2-cur-date">'+esc(fmtDate(b.start_date))+'</span><span class="tl2-cur-pos">'+(idx+1)+' / '+n+'</span></div>';
  h+='<button class="tl2-arrow" data-rhistnav="next"'+(idx<=0?' disabled':'')+' title="Plus récente">›</button>';
  h+='</div>';
  h+='<div class="tl2-track-wrap"><div class="tl2-track"><div class="tl2-line"></div>';
  h+='<div class="tl2-line-fill" style="width:'+posOf(idx)+'%"></div>';
  win.forEach(i=>{ const p=posOf(i); const active=i===idx;
    h+='<button class="tl2-dot'+(active?' on':'')+'" data-rhistdot="'+i+'" style="left:'+p+'%" title="'+esc(fmtDate(hist[i].start_date))+'">'+(active?'<span class="tl2-dot-bubble">'+esc(fmtDate(hist[i].start_date))+'</span>':'')+'</button>';
  });
  h+='</div></div>';
  const moreOld=(winEnd<n)?(' · +'+(n-winEnd)+' plus anciennes'):'';
  const moreNew=(winStart>0)?('+'+winStart+' plus récentes · '):'';
  h+='<div class="tl2-ends"><span>'+esc(fmtDate(hist[winEnd-1].start_date))+moreOld+'</span><span>'+moreNew+esc(fmtDate(hist[winStart].start_date))+'</span></div>';
  h+='<div class="hist-card"><div class="hist-date">Entretien du '+esc(fmtDate(b.start_date))+(b.nom_chef?(' · avec '+esc(b.nom_chef)):'')+'</div>'+
    '<div class="hist-sec res"><div class="h-l">Résultat</div><div class="h-t">'+esc(b.resultat||'—')+'</div></div>'+
    '<div class="hist-sec act"><div class="h-l">Actions</div><div class="h-t">'+esc(b.actions||'—')+'</div></div>'+
    '<div class="hist-sec eng"><div class="h-l">Engagement</div><div class="h-t">'+esc(b.engagement||'—')+'</div></div></div>';
  h+='</div>';
  return h;
}
function R_render(){
  const ov=doc.getElementById('real-ov'); if(!ov) return;
  let body='';
  if(R.detail===null && !R.error){ body='<div class="r-load">Chargement…</div>'; }
  else if(R.error){ body='<div class="r-err">Erreur : '+esc(R.error)+'</div>'; }
  else {
    const d=R.detail;
    body+='<div class="r-head"><div><div class="r-vend">'+esc(d.nom_vendeur)+'</div>'+
      '<div class="r-sub">'+(d.vn_vo?('Vendeur '+esc(d.vn_vo)+' · '):'')+esc(d.nom_site)+'</div></div>'+
      '<div class="r-meta">Bilatérale du <b>'+fmtDate(d.start_date)+'</b><br>avec '+esc(d.nom_chef)+
      (d.start_date?(' · '+fmtHeure(d.start_date)+(d.end_date?' → '+fmtHeure(d.end_date):'')):'')+'</div></div>';
    body+='<div class="sec"><div class="sec-t">Performance &amp; activité <span class="pill">cliquez un indicateur pour le détail</span></div>';
    if(R.synthLoading || R.synth===null){
      body+='<div class="r-load-inline">Chargement des indicateurs…</div>';
    } else if(R.synthError){
      body+='<div class="r-err" style="padding:14px">Indicateurs indisponibles : '+esc(R.synthError)+'</div>';
    } else {
      body+=R_kpis();
      body+='<div class="bloc2">'+R_bloc2()+'</div>';
    }
    body+='</div>';
    body+=R_saisie();
    if(R.histLoading || R.hist===null){
      body+='<div class="sec"><div class="sec-t">Bilatérales précédentes</div><div class="r-load-inline">Chargement de l\'historique…</div></div>';
    } else {
      body+=R_histo();
    }
  }
  ov.innerHTML = R_STYLE + '<div class="real-modal'+(R.reunion?' reunion':'')+'">'+
    '<div class="real-toolbar"><button class="real-mode" data-ract="reunion">'+(R.reunion?'↙ Quitter le mode réunion':'⤢ Mode réunion')+'</button></div>'+
    '<button class="real-close" data-ract="annuler" title="Fermer">×</button>'+body+'</div>';
}

async function R_save(){
  if(R.saving) return;
  const res=(doc.getElementById('rf-res')&&doc.getElementById('rf-res').value)||'';
  const act=(doc.getElementById('rf-act')&&doc.getElementById('rf-act').value)||'';
  const inps=doc.querySelectorAll('#real-ov .eng-inp');
  (R.engagements||[]).forEach((e,i)=>{ if(inps[i]) e.libelle=inps[i].value; });
  const nouveaux=(R.engagements||[]).map((e,i)=>({ libelle:(e.libelle||'').trim(), ordre:i })).filter(e=>e.libelle);
  const revues=Object.keys(R.revues||{}).map(id=>({ id:Number(id), statut_suivi:R.revues[id] }));
  const engResume=nouveaux.map((e,i)=>(i+1)+'. '+e.libelle).join('\n');
  R.saving=true; R_render();
  try {
    const supabase=ctx.supabase;
    const r=await supabase.rpc('realiser_bilaterale_complet',{ p_id:R.bilId, p_resultat:res, p_actions:act, p_engagement:engResume, p_nouveaux:nouveaux, p_revues:revues });
    if(r.error) throw r.error;
    R.saving=false;
    R_clearDraft();
    R_close();
    if(window.__bilLoadData){ state.sites=null; state.bils=null; state.cadence=null; window.__bilLoadData(); }
  } catch(e){
    console.error('[real] save', e);
    R.saving=false; R_render();
    const m=doc.getElementById('r-save-msg'); if(m){ m.textContent='Erreur : '+(e.message||e); m.style.color='#a32d2d'; }
  }
}

// Routeur du popup (capture, distinct du routeur suivi)
window.__realRoute2 = function(e){
  if(e.__realDone) return;
  if(e.target.closest('#real-contacts-ov')){ e.__realDone = true; RC_route(e); return; }
  const ov = e.target.closest('#real-ov'); if(!ov) return;
  e.__realDone = true;
  if(e.target.id==='real-ov'){ R_close(); return; }
  const kpi=e.target.closest('[data-rkpi]');
  if(kpi){ const k=kpi.getAttribute('data-rkpi'); if(k==='transfo') return; R.kpi=k; R.b2filter='tous'; R_render(); return; }
  const chip=e.target.closest('[data-rchip]');
  if(chip){ R.b2filter=chip.getAttribute('data-rchip');
    const b2=ov.querySelector('.bloc2'); if(b2){ b2.innerHTML=R_bloc2(); } return; }
  const mod=e.target.closest('[data-rmodif]');
  if(mod){ R_modifPropale(Number(mod.getAttribute('data-rmodif'))); return; }
  const pdf=e.target.closest('[data-rpdf]');
  if(pdf){ const v=pdf.getAttribute('data-rpdf'); const [pid,st]=v.split(':'); const maj=pdf.getAttribute('data-rmaj')||null; R_pdfPropale(Number(pid), st, maj); return; }
  const go=e.target.closest('[data-rgo]');
  if(go){ const v=go.getAttribute('data-rgo'); const parts=v.split(':'); const type=parts[0];
    if(type==='cycle'){ const idCycle=parts[1]||null; const idClient=parts[2]||null; RC_open(idCycle, idClient); return; }
    if(type==='client'){ R_openClientFiche(Number(parts[1])); return; }
    return; }
  const hn=e.target.closest('[data-rhistnav]');
  if(hn){ const n=(R.hist||[]).length; const dir=hn.getAttribute('data-rhistnav');
    if(dir==='prev') R.histIdx=Math.min((R.histIdx||0)+1, n-1); else R.histIdx=Math.max((R.histIdx||0)-1, 0);
    R_render(); return; }
  const hd=e.target.closest('[data-rhistdot]');
  if(hd){ R.histIdx=Number(hd.getAttribute('data-rhistdot')); R_render(); return; }
  const act=e.target.closest('[data-ract]');
  if(act){ const a=act.getAttribute('data-ract');
    if(a==='save'){ R_save(); return; }
    if(a==='annuler'){ R_close(); return; }
    if(a==='reunion'){ R.reunion=!R.reunion; R_render(); return; }
    if(a==='print'){ R_print(); return; }
    if(a==='eng_add'){
      if(!R.engagements) R.engagements=[];
      R.engagements.push({ libelle:'', ordre:R.engagements.length }); R_saveDraft(); R_render();
      setTimeout(()=>{ const ins=doc.querySelectorAll('#real-ov .eng-inp'); if(ins.length) ins[ins.length-1].focus(); }, 20);
      return;
    }
    if(a.indexOf('eng_del:')===0){ const i=Number(a.split(':')[1]); if(R.engagements){ R.engagements.splice(i,1); R_saveDraft(); R_render(); } return; }
    if(a.indexOf('rev:')===0){ const p=a.split(':'); const id=p[1], st=p[2]; if(!R.revues) R.revues={};
      if(R.revues[id]===st) delete R.revues[id]; else R.revues[id]=st; R_saveDraft(); R_render(); return; }
    return;
  }
};
if(!window.__realDocClickBound2){
  doc.addEventListener('click', function(e){ if(window.__realRoute2) window.__realRoute2(e); }, true);
  window.__realDocClickBound2 = true;
}

const R_STYLE = '<style>'+
'#real-ov{position:fixed;inset:0;background:rgba(42,52,60,.55);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:24px;overflow-y:auto;font-family:"Nunito Sans",sans-serif}'+
'#real-ov .real-modal{position:relative;background:#eef3f9;border-radius:18px;max-width:940px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3);margin:auto}'+
'#real-ov .real-close{position:absolute;top:16px;right:18px;width:34px;height:34px;border-radius:50%;border:none;background:#fff;color:#888780;font-size:20px;line-height:34px;text-align:center;padding:0;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.1);z-index:2;display:flex;align-items:center;justify-content:center}'+
'#real-ov .real-close:hover{background:#e24b4a;color:#fff}'+
'#real-ov .r-head{padding-right:44px}'+
'#real-ov .real{font-family:"Nunito Sans",sans-serif;color:#3a3a38;max-width:920px;margin:0 auto}'+
'#real-ov .r-load,#real-ov .r-err,#real-ov .b2-empty{padding:22px;text-align:center;color:#888780;font-size:14px}'+
'#real-ov .r-load-inline{padding:24px;text-align:center;color:#888780;font-size:13px;font-style:italic}'+
'#real-ov .r-err{color:#a32d2d}'+
'#real-ov .r-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px}'+
'#real-ov .r-vend{font-size:22px;font-weight:800;color:#2a5ea9}'+
'#real-ov .r-sub{font-size:13px;color:#888780;margin-top:2px}'+
'#real-ov .r-meta{font-size:13px;color:#888780;text-align:right}#real-ov .r-meta b{color:#3a3a38}'+
'#real-ov .sec{background:#fff;border:1px solid #ece9e1;border-radius:14px;padding:18px 20px;margin-bottom:18px}'+
'#real-ov .sec-t{font-size:15px;font-weight:800;color:#2a5ea9;margin-bottom:14px;display:flex;align-items:center;gap:8px}'+
'#real-ov .sec-t .pill{font-size:11px;font-weight:600;color:#2a5ea9;background:rgba(172,197,228,.18);border-radius:20px;padding:2px 10px}'+
'#real-ov .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(115px,1fr));gap:10px;margin-bottom:16px}'+
'#real-ov .kpi{background:rgba(172,197,228,.12);border-radius:10px;padding:10px 12px;border:2px solid transparent;transition:.12s}'+
'#real-ov .kpi.clik{cursor:pointer}#real-ov .kpi.clik:hover{background:rgba(172,197,228,.22)}'+
'#real-ov .kpi.on{border-color:#2a5ea9;background:#fff}#real-ov .kpi.mute{cursor:default}'+
'#real-ov .kpi.kvn.on{border-color:#53bda7}'+
'#real-ov .kpi.kvo.on{border-color:#d9892a}'+
'#real-ov .kpi .k-l{font-size:11px;color:#888780;font-weight:600}'+
'#real-ov .kpi .k-v{font-size:20px;font-weight:800;margin-top:2px}'+
'#real-ov .kpi .k-s{font-size:11px;color:#b4b2a9;margin-top:1px}'+
'#real-ov .bloc2{border-top:1px dashed #ece9e1;padding-top:16px;min-height:110px}'+
'#real-ov .b2-title{font-size:13px;font-weight:800;color:#2a5ea9;margin-bottom:12px}'+
'#real-ov .b2-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}'+
'#real-ov .b2-chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#2a5ea9;background:#fff;border:1px solid #ece9e1;border-radius:16px;padding:4px 11px;cursor:pointer;transition:.12s}'+
'#real-ov .b2-chip:hover{background:rgba(172,197,228,.16)}'+
'#real-ov .b2-chip.on{background:#2a5ea9;color:#fff;border-color:#2a5ea9}'+
'#real-ov .b2-chip-n{font-size:10px;font-weight:700;opacity:.7}'+
'#real-ov .perf-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}'+
'#real-ov .perf-row{background:rgba(172,197,228,.12);border-radius:10px;padding:12px 14px}'+
'#real-ov .perf-row .p-l{font-size:12px;color:#888780;font-weight:600}'+
'#real-ov .perf-row .p-v{font-size:18px;font-weight:800;margin-top:3px}'+
'#real-ov .perf-bar{height:7px;background:rgba(172,197,228,.35);border-radius:4px;margin-top:8px;overflow:hidden}'+
'#real-ov .perf-bar i{display:block;height:7px;border-radius:4px}'+
'#real-ov .perf-pct{font-size:11px;color:#888780;font-weight:600;margin-top:5px}'+
'#real-ov .pipe-group{margin-bottom:14px}'+
'#real-ov .pipe-gt{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;display:flex;align-items:center;gap:6px}'+
'#real-ov .pipe-gt.retard{color:#b23433}#real-ov .pipe-gt.urgent{color:#8a6410}#real-ov .pipe-gt.cours{color:#2c7a68}'+
'#real-ov .pipe-gt.win{color:#2c7a68}#real-ov .pipe-gt.aband{color:#b23433}'+
'#real-ov .pipe-gt .gn{font-size:11px;font-weight:700;color:#fff;border-radius:10px;padding:1px 8px}'+
'#real-ov .pipe-gt.retard .gn,#real-ov .pipe-gt.aband .gn{background:#e24b4a}'+
'#real-ov .pipe-gt.urgent .gn{background:#fac055;color:#5a4408}'+
'#real-ov .pipe-gt.cours .gn,#real-ov .pipe-gt.win .gn{background:#53bda7}'+
'#real-ov .cyc{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid #ece9e1;border-radius:10px;margin-bottom:6px;cursor:pointer;transition:background .12s}'+
'#real-ov .cyc:hover{background:rgba(172,197,228,.14)}'+
'#real-ov .cyc .c-cli{font-weight:700;color:#2a5ea9;font-size:14px}'+
'#real-ov .cyc .c-info{font-size:12px;color:#888780}'+
'#real-ov .cyc .c-right{margin-left:auto;display:flex;align-items:center;gap:8px}'+
'#real-ov .cyc .badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px}'+
'#real-ov .badge.prop{background:rgba(42,94,169,.12);color:#2a5ea9}'+
'#real-ov .badge.bdc{background:rgba(250,192,85,.22);color:#8a6410}'+
'#real-ov .badge.win{background:rgba(83,189,167,.18);color:#2c7a68}'+
'#real-ov .badge.lose{background:rgba(226,75,74,.14);color:#b23433}'+
'#real-ov .cyc .c-arrow{color:#b4b2a9;font-size:16px}'+
'#real-ov .pp-row{align-items:center}'+
'#real-ov .pp-main{flex:1;min-width:0;cursor:pointer;border-radius:8px;padding:2px 4px;margin:-2px -4px}'+
'#real-ov .pp-main:hover{background:rgba(172,197,228,.14)}'+
'#real-ov .pp-icon{width:30px;height:30px;border-radius:8px;border:1px solid #ece9e1;background:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;transition:.12s}'+
'#real-ov .pp-pdf{color:#e24b4a}#real-ov .pp-pdf:hover{background:#fdeaea;border-color:#e24b4a}'+
'#real-ov .pp-mod{color:#2a5ea9}#real-ov .pp-mod:hover{background:rgba(42,94,169,.10);border-color:#2a5ea9}'+
'#real-ov .field{margin-bottom:14px}'+
'#real-ov .field label{display:block;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}'+
'#real-ov .field.res label{color:#2a5ea9}#real-ov .field.act label{color:#8a6410}#real-ov .field.eng label{color:#2c7a68}'+
'#real-ov .field textarea{width:100%;border:1px solid #ece9e1;border-radius:10px;padding:11px 13px;font-family:inherit;font-size:14px;color:#3a3a38;resize:vertical;min-height:80px;background:rgba(172,197,228,.10);box-sizing:border-box}'+
'#real-ov .field textarea:focus{outline:none;border-color:#2a5ea9;background:#fff}'+
'#real-ov .save-bar{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:4px}'+
'#real-ov .save-msg{font-size:13px;font-weight:700;margin-right:auto}'+
'#real-ov .btn{border:none;border-radius:9px;padding:10px 20px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer}'+
'#real-ov .btn-prim{background:#53bda7;color:#fff}#real-ov .btn-prim:disabled{opacity:.6;cursor:default}'+
'#real-ov .btn-sec{background:rgba(172,197,228,.18);color:#2a5ea9;border:1px solid #ece9e1}'+
'#real-ov .histbl-wrap{max-height:340px;overflow-y:auto;border:1px solid rgba(172,197,228,.4);border-radius:12px}'+
'#real-ov .histbl{width:100%;border-collapse:collapse;font-size:13px}'+
'#real-ov .histbl thead th{position:sticky;top:0;z-index:5;text-align:left;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:10px 12px;background:#e3ecf6;border-bottom:2px solid #acc5e4}'+
'#real-ov .histbl thead th.col-date{color:#2a5ea9;background:#e3ecf6}'+
'#real-ov .histbl thead th.col-res{color:#2a5ea9;background:#dde8f5}'+
'#real-ov .histbl thead th.col-act{color:#8a6410;background:#f6ead0}'+
'#real-ov .histbl thead th.col-eng{color:#2c7a68;background:#dcf0e9}'+
'#real-ov .histbl tbody td{padding:11px 12px;vertical-align:top;border-bottom:1px solid rgba(172,197,228,.25);line-height:1.45}'+
'#real-ov .histbl tbody tr:last-child td{border-bottom:none}'+
'#real-ov .histbl tbody tr:hover td{background:rgba(172,197,228,.08)}'+
'#real-ov .histbl td.col-date{white-space:nowrap;min-width:108px}'+
'#real-ov .histbl td.col-res{background:rgba(42,94,169,.05);color:#2a3a4a}'+
'#real-ov .histbl td.col-act{background:rgba(250,192,85,.07);color:#5a4408}'+
'#real-ov .histbl td.col-eng{background:rgba(83,189,167,.06);color:#1f5a4c}'+
'#real-ov .histbl .hd-date{font-weight:800;color:#2a5ea9}'+
'#real-ov .histbl .hd-chef{font-size:11px;color:#888780;margin-top:2px}'+
'#real-ov .real-toolbar{margin-bottom:10px}'+
'#real-ov .real-mode{background:#fff;border:1px solid #ece9e1;color:#2a5ea9;font-family:inherit;font-size:12px;font-weight:700;border-radius:8px;padding:6px 12px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.08)}'+
'#real-ov .real-mode:hover{background:rgba(172,197,228,.18)}'+
'#real-ov .real-modal.reunion{max-width:1180px}'+
'#real-ov .real-modal.reunion .r-vend{font-size:26px}'+
'#real-ov .real-modal.reunion .field textarea{min-height:120px;font-size:15px}'+
'#real-ov .real-modal.reunion .eng-inp{font-size:15px;padding:11px 13px}'+
'#real-ov .real-modal.reunion .sec{padding:22px 26px}'+
'#real-ov .draft-ind{margin-left:auto;font-size:11px;font-weight:600;color:#888780;background:#f7f6f2;border-radius:20px;padding:2px 10px;opacity:.5;transition:opacity .2s}'+
'#real-ov .rev-block{background:rgba(250,192,85,.10);border:1px solid rgba(250,192,85,.40);border-radius:12px;padding:14px 16px;margin-bottom:16px}'+
'#real-ov .rev-title{font-size:13px;font-weight:800;color:#8a6410;margin-bottom:10px;display:flex;align-items:center;gap:8px}'+
'#real-ov .rev-title .pill{font-size:10px;font-weight:700;color:#8a6410;background:rgba(250,192,85,.30);border-radius:20px;padding:2px 9px}'+
'#real-ov .rev-row{display:flex;align-items:center;gap:12px;padding:8px 0;border-top:1px solid rgba(250,192,85,.30)}'+
'#real-ov .rev-row:first-of-type{border-top:none}'+
'#real-ov .rev-lib{flex:1;min-width:0;font-size:13px;color:#3a3a38;font-weight:600}'+
'#real-ov .rev-date{display:block;font-size:11px;font-weight:400;color:#a78a4a;margin-top:1px}'+
'#real-ov .rev-btns{display:flex;gap:5px;flex-shrink:0}'+
'#real-ov .rev-b{font-size:12px;font-weight:700;border:1px solid #ece9e1;background:#fff;border-radius:7px;padding:5px 11px;cursor:pointer;color:#888780;font-family:inherit}'+
'#real-ov .rev-b:hover{background:#f7f6f2}'+
'#real-ov .rev-b.t.on{background:#53bda7;color:#fff;border-color:#53bda7}'+
'#real-ov .rev-b.p.on{background:#fac055;color:#5a4408;border-color:#fac055}'+
'#real-ov .rev-b.n.on{background:#e24b4a;color:#fff;border-color:#e24b4a}'+
'#real-ov .eng-block{margin-bottom:16px}'+
'#real-ov .eng-lbl{display:block;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;color:#2c7a68}'+
'#real-ov .eng-empty{font-size:13px;color:#b4b2a9;font-style:italic;margin-bottom:8px}'+
'#real-ov .eng-item{display:flex;align-items:center;gap:8px;margin-bottom:7px}'+
'#real-ov .eng-h{flex-shrink:0;width:22px;height:22px;border-radius:50%;background:rgba(83,189,167,.18);color:#2c7a68;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}'+
'#real-ov .eng-inp{flex:1;border:1px solid #ece9e1;border-radius:9px;padding:9px 12px;font-family:inherit;font-size:14px;color:#3a3a38;background:rgba(83,189,167,.06)}'+
'#real-ov .eng-inp:focus{outline:none;border-color:#53bda7;background:#fff}'+
'#real-ov .eng-del{flex-shrink:0;width:28px;height:28px;border-radius:8px;border:1px solid #ece9e1;background:#fff;color:#e24b4a;font-size:17px;line-height:1;cursor:pointer}'+
'#real-ov .eng-del:hover{background:#fdeaea;border-color:#e24b4a}'+
'#real-ov .eng-add{margin-top:4px;background:rgba(83,189,167,.12);border:1px dashed #53bda7;color:#2c7a68;font-family:inherit;font-size:13px;font-weight:700;border-radius:9px;padding:8px 14px;cursor:pointer}'+
'#real-ov .eng-add:hover{background:rgba(83,189,167,.20)}'+
'#real-ov .btn-ghost{background:#fff;color:#2a5ea9;border:1px solid #ece9e1}'+
'#real-ov .btn-ghost:hover{background:rgba(172,197,228,.16)}'+
'#real-ov .tl2-nav{display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:6px}'+
'#real-ov .tl2-arrow{width:34px;height:34px;border-radius:50%;border:1px solid #ece9e1;background:#fff;color:#2a5ea9;font-size:20px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.12s;flex-shrink:0}'+
'#real-ov .tl2-arrow:hover:not(:disabled){background:#2a5ea9;color:#fff;border-color:#2a5ea9}'+
'#real-ov .tl2-arrow:disabled{opacity:.3;cursor:default}'+
'#real-ov .tl2-cur{text-align:center;min-width:160px}'+
'#real-ov .tl2-cur-date{display:block;font-size:15px;font-weight:800;color:#2a5ea9}'+
'#real-ov .tl2-cur-pos{display:block;font-size:11px;color:#b4b2a9;font-weight:600;margin-top:1px}'+
'#real-ov .tl2-track-wrap{padding:26px 6px 6px}'+
'#real-ov .tl2-track{position:relative;height:24px}'+
'#real-ov .tl2-line{position:absolute;left:0;right:0;top:11px;height:3px;background:#ece9e1;border-radius:2px}'+
'#real-ov .tl2-line-fill{position:absolute;left:0;top:11px;height:3px;background:#acc5e4;border-radius:2px;transition:width .25s ease}'+
'#real-ov .tl2-dot{position:absolute;top:5px;width:14px;height:14px;border-radius:50%;border:2px solid #fff;background:#acc5e4;cursor:pointer;padding:0;transform:translateX(-50%);box-shadow:0 0 0 1px #d8dfe9;transition:.15s;z-index:1}'+
'#real-ov .tl2-dot:hover{background:#53bda7;transform:translateX(-50%) scale(1.25);z-index:3}'+
'#real-ov .tl2-dot.on{background:#2a5ea9;width:18px;height:18px;top:3px;box-shadow:0 0 0 4px rgba(42,94,169,.18);z-index:4}'+
'#real-ov .tl2-dot-bubble{position:absolute;bottom:26px;left:50%;transform:translateX(-50%);background:#2a5ea9;color:#fff;font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px;white-space:nowrap;pointer-events:none}'+
'#real-ov .tl2-dot-bubble::after{content:"";position:absolute;top:100%;left:50%;transform:translateX(-50%);border:5px solid transparent;border-top-color:#2a5ea9}'+
'#real-ov .tl2-ends{display:flex;justify-content:space-between;font-size:10px;color:#b4b2a9;font-weight:600;margin:2px 6px 14px}'+
'#real-ov .hist-card{border:1px solid #ece9e1;border-radius:10px;padding:14px 16px}'+
'#real-ov .hist-date{font-size:12px;color:#888780;margin-bottom:10px}'+
'#real-ov .hist-sec{margin-bottom:12px}#real-ov .hist-sec:last-child{margin-bottom:0}'+
'#real-ov .hist-sec .h-l{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}'+
'#real-ov .hist-sec.res .h-l{color:#2a5ea9}#real-ov .hist-sec.act .h-l{color:#8a6410}#real-ov .hist-sec.eng .h-l{color:#2c7a68}'+
'#real-ov .hist-sec .h-t{font-size:13px;line-height:1.5;white-space:pre-wrap}'+
'@media (max-width:760px){'+
'#real-ov{padding:10px}'+
'#real-ov .real-modal{padding:16px;border-radius:14px}'+
'#real-ov .real-modal.reunion{max-width:none}'+
'#real-ov .sec{padding:14px 14px}'+
'#real-ov .r-meta{text-align:left}'+
'#real-ov .save-bar{flex-wrap:wrap}'+
'#real-ov .save-bar .btn{flex:1 1 auto}'+
'#real-ov .save-msg{flex:1 1 100%;margin-bottom:6px}'+
'#real-ov .tl2-cur{min-width:0}'+
'}'+
'</style>';
// --- fin module popup réalisation ---


// ============================================================================
//  SOUS-POPUP CONTACTS DU CYCLE (par-dessus la réalisation)
//  Affiche les contacts de v_contacts_client filtrés par id_cycle_com.
//  Lien "Ouvrir la fiche complète" (tab 0) qui ferme les deux popups.
// ============================================================================
const RC = { idCycle:null, idClient:null, rows:null, loading:false, error:null };

function RC_open(idCycle, idClient){
  RC.idCycle = idCycle || null;
  RC.idClient = idClient || null;
  RC.rows = null; RC.error = null; RC.loading = false;
  RC_ensureOverlay();
  RC_render();
  RC_load();
}
function RC_close(){ const ov = doc.getElementById('real-contacts-ov'); if(ov) ov.remove(); }
function RC_ensureOverlay(){
  let ov = doc.getElementById('real-contacts-ov');
  if(!ov){ ov = doc.createElement('div'); ov.id='real-contacts-ov'; doc.body.appendChild(ov); }
}
async function RC_load(){
  if(!RC.idCycle){ RC.error='Cycle introuvable pour ce contact.'; RC_render(); return; }
  if(RC.loading) return;
  RC.loading=true; RC.error=null; RC_render();
  try {
    const supabase = ctx.supabase;
    const { data, error } = await supabase
      .from('v_contacts_client')
      .select('*')
      .eq('id_cycle_com', RC.idCycle)
      .order('date_contact', { ascending: false });
    if(error) throw error;
    RC.rows = data || [];
  } catch(e){
    console.error('[real-contacts] load', e);
    RC.error = (e && e.message) ? e.message : String(e);
  } finally {
    RC.loading=false; RC_render();
  }
}

function RC_esc(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function RC_fmtDate(d){ if(!d) return ''; const dt=new Date(String(d).replace(' ','T'));
  return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear()+
    ' '+String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0'); }
function RC_truncate(str,n){ return str&&str.length>n?str.substring(0,n)+'…':(str||''); }
function RC_parseAtt(raw){ try{ if(Array.isArray(raw)) return raw; if(typeof raw==='string'&&raw) return JSON.parse(raw); }catch(e){} return []; }

// Rendu FIDÈLE d'une carte de contact (transcription du template onglet Contacts de la fiche client)
function RC_card(item){
  const media = item?.media;
  const sens = item?.sens;
  const agent = item?.agent || '';
  const dateContact = item?.date_contact;
  const idLigne = (item?.id_ligne || Math.random().toString(36).substring(2,10));
  const uid = idLigne.toString().replace(/-/g,'').substring(0,8);

  const mediaAccent = { WHATSAPP:'#4CAF7D', RAPPORT_VENDEUR:'#E05252', VOIP:'#60AEDF', EMAIL:'#9E9E9E', SMS:'#F5A623', LEAD_EXTERNE:'#7C3AED' };
  const mediaBg = { WHATSAPP:'#F0FDF4', RAPPORT_VENDEUR:'#FFF5F5', VOIP:'#F0F9FF', EMAIL:'#F8F8F8', SMS:'#FFFBEB', LEAD_EXTERNE:'#F5F3FF' };
  const accent = mediaAccent[media] || '#E0E0E0';
  const bg = mediaBg[media] || '#FFFFFF';

  const formatDate = (d)=>{ if(!d) return ''; const dt=new Date(String(d).replace(' ','T'));
    return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear()+'<br>'+
      String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0'); };
  const formatRdv = (d)=>{ if(!d) return ''; const dt=new Date(String(d).replace(' ','T'));
    return 'RDV '+String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear(); };
  const truncate = (str,n)=> str&&str.length>n ? str.substring(0,n)+'…' : (str||'');
  const esc = (s)=>(s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const parseAttachments = (raw)=>{ try{ if(Array.isArray(raw)) return raw; if(typeof raw==='string'&&raw) return JSON.parse(raw); }catch(e){} return []; };

  const mediaIcons = {
    WHATSAPP: '<svg width="14" height="14" viewBox="0 0 24 24" fill="'+accent+'"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.556 4.111 1.514 5.842L.057 23.428a.75.75 0 0 0 .921.921l5.629-1.456A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.722 9.722 0 0 1-4.953-1.355l-.355-.211-3.685.954.974-3.564-.23-.368A9.722 9.722 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>',
    VOIP: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.1a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.24h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.08 6.08l1.03-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    EMAIL: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
    SMS: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    RAPPORT_VENDEUR: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    LEAD_EXTERNE: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>'
  };
  const mediaIcon = mediaIcons[media] || '';

  const isInbound = sens==='inbound' || sens==='in';
  const arrowSvg = isInbound
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';
  const arrowHtml = media!=='RAPPORT_VENDEUR'
    ? '<div style="flex-shrink:0;width:30px;height:30px;border-radius:50%;border:1.5px solid '+accent+';display:flex;align-items:center;justify-content:center;background:#fff;">'+arrowSvg+'</div>'
    : '';

  const toggleBtn = (tid,label)=> '<button id="tgl_'+tid+'" onclick="window.__rcToggle(\''+tid+'\')" style="background:none;border:none;cursor:pointer;padding:0 2px;font-size:12px;color:#9ca3af;display:inline;vertical-align:middle;margin-left:3px;line-height:1;font-family:sans-serif;">▸ '+(label||'voir plus')+'</button>';

  const SVG_PDF='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="#E94335" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6z"/><path fill="#B53024" d="M14 2v6h6l-6-6z"/><text x="12" y="17.5" text-anchor="middle" fill="#FFF" font-size="5.5" font-weight="900" font-family="Arial Black,sans-serif">PDF</text></svg>';
  const SVG_IMAGE_I='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" fill="#34A853"/><circle cx="8.5" cy="9.5" r="1.5" fill="#FFF"/><path fill="#FFF" d="M21 15l-3.5-4.5-3 4-2-2.5L8 17h13z"/></svg>';
  const SVG_GENERIC='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" stroke="#6B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const getIcon = (att)=>{ const mime=(att?.mime_type||'').toLowerCase(); const fname=(att?.filename||'').toLowerCase();
    if(mime==='application/pdf'||fname.endsWith('.pdf')) return SVG_PDF;
    if(mime.startsWith('image/')||/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(fname)) return SVG_IMAGE_I;
    return SVG_GENERIC; };
  const formatSize = (b)=>{ if(!b) return ''; if(b<1024) return b+' o'; if(b<1048576) return Math.round(b/1024)+' Ko'; return (b/1048576).toFixed(1)+' Mo'; };

  let contentHtml=''; let metaRight=''; let headerMiddle=''; let footerHtml='';

  if(media==='VOIP'){
    const url=item?.voip_recording_url; const duration=item?.voip_duration_seconds||0;
    const summary=item?.voip_summary; const transcription=item?.contenu_texte; const tonalite=item?.voip_summary?.tonalite||'';
    if(url){ const pid='vp_'+uid;
      contentHtml+='<div style="display:inline-flex;align-items:center;gap:8px;background:rgba(96,174,223,0.12);border-radius:999px;padding:5px 14px;">'+
        '<button id="btn_'+pid+'" onclick="window.__rcVoipPlay(\''+pid+'\')" style="background:none;border:none;cursor:pointer;padding:0;width:16px;height:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="10" height="12" viewBox="0 0 10 12" fill="#60AEDF"><path d="M0 0l10 6-10 6z"/></svg></button>'+
        '<span id="cur_'+pid+'" style="font-size:12px;color:#60AEDF;min-width:28px;font-variant-numeric:tabular-nums;">0:00</span>'+
        '<div style="width:130px;height:3px;background:rgba(96,174,223,0.3);border-radius:2px;cursor:pointer;position:relative;" onclick="window.__rcVoipSeek(event,this,\''+pid+'\')"><div id="prg_'+pid+'" style="height:100%;width:0%;background:#60AEDF;border-radius:2px;pointer-events:none;transition:width 0.1s linear;"></div></div>'+
        '<span id="rem_'+pid+'" style="font-size:12px;color:#60AEDF;min-width:28px;text-align:right;font-variant-numeric:tabular-nums;">'+Math.floor(duration/60)+':'+String(duration%60).padStart(2,'0')+'</span>'+
        '<div id="data_'+pid+'" data-src="'+esc(url)+'" data-dur="'+duration+'" style="display:none;"></div></div>'; }
    if(summary||transcription){ const tid='tr_'+uid; const objet=esc(summary?.objet||''); const texte=esc(transcription||'').replace(/\n/g,'<br>');
      contentHtml+='<div style="font-size:13px;color:#4b5563;line-height:1.6;margin-top:7px;"><span id="sum_'+tid+'">'+objet+'</span>'+(objet&&texte?toggleBtn(tid):'')+'<span id="ful_'+tid+'" style="display:none;color:#6b7280;font-style:italic;">'+texte+toggleBtn(tid,'voir moins')+'</span></div>'; }
    metaRight='<span style="font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;line-height:1.4">'+formatDate(dateContact)+'</span>'+(tonalite?'<span style="font-size:11px;color:#60AEDF;background:rgba(96,174,223,0.1);border:1px solid rgba(96,174,223,0.3);border-radius:999px;padding:1px 8px;white-space:nowrap;">'+esc(tonalite)+'</span>':'');
  }
  else if(media==='WHATSAPP'){
    const statut=item?.statut; const contenu=item?.contenu_texte||''; const deliveryStatus=item?.delivery_status; const isOut=sens==='out';
    const attachments=parseAttachments(item?.attachments); const att=attachments[0]; const url=att?.public_url||''; const fname=att?.filename||'';
    const placeholders=['[image]','[video]','[audio]','[document]','[sticker]'];
    const hasCaption=contenu&&!placeholders.includes(contenu.trim())&&statut!=='text';
    const captionHtml=hasCaption?'<div style="font-size:13px;color:#4b5563;line-height:1.5;word-break:break-word;margin-top:5px;">'+esc(contenu)+'</div>':'';
    if(statut==='text'){ const sid='wt_'+uid; const resume=truncate(contenu,80); const showToggle=contenu.length>80;
      contentHtml='<div style="font-size:13px;color:#4b5563;line-height:1.5;word-break:break-word;"><span id="sum_'+sid+'">'+esc(resume)+'</span>'+(showToggle?toggleBtn(sid):'')+'<span id="ful_'+sid+'" style="display:none;">'+esc(contenu)+toggleBtn(sid,'voir moins')+'</span></div>'; }
    else if(statut==='audio'){ if(url){ const wid='wa_'+uid;
      contentHtml='<div style="display:inline-flex;align-items:center;gap:8px;background:rgba(76,175,125,0.12);border-radius:999px;padding:5px 14px;width:fit-content;'+(isOut?'margin-left:auto;':'')+'">'+
        '<button id="btn_'+wid+'" onclick="window.__rcWaPlay(\''+wid+'\')" style="background:none;border:none;cursor:pointer;padding:0;width:16px;height:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="10" height="12" viewBox="0 0 10 12" fill="#4CAF7D"><path d="M0 0l10 6-10 6z"/></svg></button>'+
        '<span id="cur_'+wid+'" style="font-size:12px;color:#4CAF7D;min-width:28px;font-variant-numeric:tabular-nums;">0:00</span>'+
        '<div style="width:80px;height:3px;background:rgba(76,175,125,0.25);border-radius:2px;cursor:pointer;position:relative;flex-shrink:0;" onclick="window.__rcWaSeek(event,this,\''+wid+'\')"><div id="prg_'+wid+'" style="height:100%;width:0%;background:#4CAF7D;border-radius:2px;pointer-events:none;"></div></div>'+
        '<audio id="aud_'+wid+'" data-src="'+esc(url)+'" preload="none" style="display:none;"></audio></div>'+captionHtml; } }
    else if(statut==='image'){ if(url){
      contentHtml='<a href="'+esc(url)+'" target="_blank" class="rc-thumb" style="display:inline-block;position:relative;width:72px;height:72px;border-radius:10px;overflow:hidden;border:1px solid rgba(76,175,125,0.25);flex-shrink:0;cursor:pointer;"><img src="'+esc(url)+'" style="width:72px;height:72px;object-fit:cover;display:block;" /></a>'+captionHtml; } }
    else if(statut==='video'){ if(url){
      contentHtml='<a href="'+esc(url)+'" target="_blank" class="rc-thumb" style="display:inline-block;position:relative;width:72px;height:72px;border-radius:10px;overflow:hidden;border:1px solid rgba(76,175,125,0.25);flex-shrink:0;cursor:pointer;background:#000;"><video src="'+esc(url)+'" preload="metadata" muted style="width:72px;height:72px;object-fit:cover;display:block;pointer-events:none;"></video><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;"><svg width="10" height="12" viewBox="0 0 10 12" fill="#374151"><path d="M0 0l10 6-10 6z"/></svg></div></div></a>'+captionHtml; } }
    else if(statut==='document'){ if(url){ const short=truncate(fname,30);
      contentHtml='<div onclick="window.open(\''+esc(url)+'\',\'_blank\')" class="rc-doc" style="display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border:1px solid rgba(76,175,125,0.25);border-radius:8px;background:rgba(76,175,125,0.06);cursor:pointer;">'+getIcon(att)+'<div style="display:flex;flex-direction:column;gap:1px;"><span style="font-size:12px;color:#374151;font-weight:500;">'+esc(short)+'</span>'+(att.file_size?'<span style="font-size:11px;color:#9ca3af;">'+formatSize(att.file_size)+'</span>':'')+'</div></div>'+captionHtml; } }
    const deliveryHtml=isOut&&deliveryStatus?'<span style="font-size:14px;color:'+(deliveryStatus==='read'?'#0075df':'#9ca3af')+';">'+(deliveryStatus==='sent'?'✓':'✓✓')+'</span>':'';
    metaRight='<span style="font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;line-height:1.4">'+formatDate(dateContact)+'</span>'+deliveryHtml;
  }
  else if(media==='SMS'){
    const contenu=item?.contenu_texte||'';
    if(contenu){ const sid='sm_'+uid; const resume=truncate(contenu,80); const showToggle=contenu.length>80;
      contentHtml='<div style="font-size:13px;color:#4b5563;line-height:1.6;word-break:break-word;"><span id="sum_'+sid+'">'+esc(resume)+'</span>'+(showToggle?toggleBtn(sid):'')+'<span id="ful_'+sid+'" style="display:none;white-space:pre-wrap;">'+esc(contenu)+toggleBtn(sid,'voir moins')+'</span></div>'; }
    metaRight='<span style="font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;line-height:1.4">'+formatDate(dateContact)+'</span>';
  }
  else if(media==='EMAIL'){
    const eid='em_'+uid; const subject=item?.email_subject||'(sans sujet)'; const snippetSrc=item?.email_snippet||item?.contenu_texte||''; const snippetTrunc=truncate(snippetSrc,60);
    const sanitize=(html)=>html?html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<iframe[\s\S]*?<\/iframe>/gi,'').replace(/\s+on\w+\s*=\s*"[^"]*"/gi,'').replace(/javascript:/gi,''):'';
    const stripHtml=(html)=>html?html.replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim():'';
    const bodyHtml=sanitize(item?.email_body_html||''); const fullContent=bodyHtml||esc(item?.contenu_texte||'');
    const fullPlain=stripHtml(item?.email_body_html||'')||(item?.contenu_texte||''); const showToggle=fullPlain.length>snippetSrc.length+10;
    headerMiddle='<span style="font-size:13px;font-weight:600;color:#111827;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+esc(subject)+'">'+esc(subject)+'</span>';
    contentHtml='<div style="font-size:13px;color:#4b5563;line-height:1.5;"><span id="sum_'+eid+'" style="color:#6b7280;">'+esc(snippetTrunc)+'</span>'+(showToggle?toggleBtn(eid):'')+'<div id="ful_'+eid+'" style="display:none;color:#374151;word-break:break-word;overflow-wrap:anywhere;margin-top:4px;">'+fullContent+toggleBtn(eid,'voir moins')+'</div></div>';
    metaRight='<span style="font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;line-height:1.4">'+formatDate(dateContact)+'</span>';
  }
  else if(media==='RAPPORT_VENDEUR'){
    const resultat=item?.resultat||''; const canalContact=item?.canal_contact||''; const dtActivation=item?.dt_activation; const commentaire=item?.contenu_texte||''; const note=item?.note_chatgpt;
    const chipColors={ 'Abandon':{bg:'#fee2e2',color:'#9B1C1C',border:'#fca5a5'},'Marketing':{bg:'#ede9fe',color:'#5b21b6',border:'#c4b5fd'},'Choc':{bg:'#fef3c7',color:'#92400e',border:'#fcd34d'},'Commande':{bg:'#d1fae5',color:'#065f46',border:'#6ee7b7'},'Relance':{bg:'#dbeafe',color:'#1e40af',border:'#93c5fd'} };
    const chip=chipColors[resultat]||{bg:'#f3f4f6',color:'#374151',border:'#d1d5db'};
    headerMiddle='<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;flex:1;min-width:0;">'+
      (resultat?'<span style="background:'+chip.bg+';color:'+chip.color+';border:1px solid '+chip.border+';border-radius:999px;padding:2px 10px;font-size:12px;font-weight:500;white-space:nowrap;">'+esc(resultat)+'</span>':'')+
      (canalContact?'<span style="background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;border-radius:999px;padding:2px 10px;font-size:12px;white-space:nowrap;">'+esc(canalContact)+'</span>':'')+
      (dtActivation?'<span style="background:#eff6ff;color:#2a5ea9;border:1px solid #bfdbfe;border-radius:999px;padding:2px 10px;font-size:12px;white-space:nowrap;">'+formatRdv(dtActivation)+'</span>':'')+'</div>';
    const sid='rv_'+uid; const showToggle=commentaire.length>80; const resume=truncate(commentaire,80);
    contentHtml=commentaire?'<div style="font-size:13px;color:#4b5563;line-height:1.5;"><span id="sum_'+sid+'">'+esc(resume)+'</span>'+(showToggle?toggleBtn(sid):'')+'<span id="ful_'+sid+'" style="display:none;">'+esc(commentaire)+toggleBtn(sid,'voir moins')+'</span></div>':'';
    const noteHtml=note!=null?(()=>{ const isGood=note>=7; return '<div style="display:flex;flex-direction:column;align-items:center;gap:1px;flex-shrink:0;"><span style="font-size:13px;font-weight:700;color:'+(isGood?'#4CAF7D':'#E05252')+';background:'+(isGood?'#D1FAE5':'#FEE2E2')+';border:1.5px solid '+(isGood?'#4CAF7D':'#E05252')+';border-radius:50%;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;">'+note+'</span><span style="font-size:9px;color:#9ca3af;letter-spacing:0.02em;">IA</span></div>'; })():'';
    metaRight='<span style="font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;line-height:1.4">'+formatDate(dateContact)+'</span>'+noteHtml;
  }
  else if(media==='LEAD_EXTERNE'){
    const source=item?.origine_echange||''; const sourceRef=item?.canal_contact||''; const vehicule=item?.vehicule_interet||''; const statutBrut=item?.statut||''; const contenu=item?.contenu_texte||''; const phone=item?.phone_from||'';
    const sourceChip=source?'<span style="background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:500;white-space:nowrap;">'+esc(source)+(sourceRef?' · '+esc(truncate(sourceRef,20)):'')+'</span>':'';
    const isTraite=statutBrut==='traite';
    const statutChip=statutBrut?'<span style="background:'+(isTraite?'#d1fae5':'#fef3c7')+';color:'+(isTraite?'#065f46':'#92400e')+';border:1px solid '+(isTraite?'#6ee7b7':'#fcd34d')+';border-radius:999px;padding:2px 10px;font-size:12px;font-weight:500;white-space:nowrap;">'+(isTraite?'✓ Traité':'⏱ Non traité')+'</span>':'';
    const vehiculeChip=vehicule?'<span style="background:#f5f3ff;color:#5b21b6;border:1px solid #ddd6fe;border-radius:999px;padding:2px 10px;font-size:12px;white-space:nowrap;" title="'+esc(vehicule)+'">🚗 '+esc(truncate(vehicule,30))+'</span>':'';
    headerMiddle='<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;flex:1;min-width:0;">'+sourceChip+statutChip+vehiculeChip+'</div>';
    if(contenu||phone){ const sid='le_'+uid; const showToggle=contenu.length>80; const resume=truncate(contenu,80);
      const phoneHtml=phone?'<div style="font-size:12px;color:#6b7280;margin-top:4px;display:inline-flex;align-items:center;gap:4px;"><a href="tel:'+esc(phone)+'" style="color:#7C3AED;text-decoration:none;">'+esc(phone)+'</a></div>':'';
      contentHtml='<div style="font-size:13px;color:#4b5563;line-height:1.5;word-break:break-word;">'+(contenu?'<span id="sum_'+sid+'">'+esc(resume)+'</span>'+(showToggle?toggleBtn(sid):'')+'<span id="ful_'+sid+'" style="display:none;white-space:pre-wrap;">'+esc(contenu)+toggleBtn(sid,'voir moins')+'</span>':'')+phoneHtml+'</div>'; }
    metaRight='<span style="font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;line-height:1.4">'+formatDate(dateContact)+'</span>';
  }

  const indent = arrowHtml ? '38px' : '0';
  return '<div style="background:'+bg+';border-left:3px solid '+accent+';border-top:1px solid '+accent+'22;border-right:1px solid '+accent+'22;border-bottom:1px solid '+accent+'22;border-radius:10px;padding:10px 14px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;width:100%;box-sizing:border-box;box-shadow:0 2px 6px rgba(0,0,0,0.08);margin-bottom:8px;">'+
    '<div style="display:flex;align-items:center;gap:8px;min-width:0;">'+arrowHtml+
      '<div style="display:flex;align-items:center;gap:5px;flex-shrink:0;max-width:140px;">'+mediaIcon+'<span style="font-size:13px;font-weight:600;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="'+esc(agent)+'">'+esc(agent)+'</span></div>'+
      (headerMiddle?'<span style="color:#e5e7eb;font-size:13px;flex-shrink:0;">|</span>'+headerMiddle:'<div style="flex:1;"></div>')+
      '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:auto;">'+metaRight+'</div>'+
    '</div>'+
    (contentHtml?'<div style="margin-top:8px;padding-left:'+indent+';">'+contentHtml+'</div>':'')+
    (footerHtml?'<div style="padding-left:'+indent+';">'+footerHtml+'</div>':'')+
  '</div>';
}

function RC_render(){
  const ov = doc.getElementById('real-contacts-ov'); if(!ov) return;
  let body='';
  if(RC.loading || RC.rows===null && !RC.error){ body='<div class="rc-load">Chargement des échanges…</div>'; }
  else if(RC.error){ body='<div class="rc-err">Erreur : '+RC_esc(RC.error)+'</div>'; }
  else if(!RC.rows.length){ body='<div class="rc-load">Aucun échange enregistré pour ce cycle.</div>'; }
  else { body = RC.rows.map(RC_card).join(''); }

  const ficheBtn = RC.idClient ? '<button class="rc-fiche" data-rcfiche="'+RC.idClient+'">Ouvrir la fiche complète →</button>' : '';
  ov.innerHTML = RC_STYLE + '<div class="rc-modal">'+
    '<div class="rc-head"><div class="rc-title">Échanges du cycle</div>'+
      '<div class="rc-head-actions">'+ficheBtn+'<button class="rc-close" data-rcclose title="Fermer">×</button></div>'+
    '</div>'+
    '<div class="rc-body">'+body+'</div>'+
  '</div>';
}

// Routeur du sous-popup contacts
function RC_route(e){
  if(e.target.id==='real-contacts-ov'){ RC_close(); return; }
  const cl=e.target.closest('[data-rcclose]'); if(cl){ RC_close(); return; }
  const f=e.target.closest('[data-rcfiche]'); if(f){ const id=f.getAttribute('data-rcfiche'); RC_close(); R_openClientFicheTab(Number(id), 0); return; }
}

// Fonctions globales d'interactivité des cartes contacts (toggle + lecteurs audio)
window.__rcToggle = function(id){
  const sum=doc.getElementById('sum_'+id); const ful=doc.getElementById('ful_'+id); const btn=doc.getElementById('tgl_'+id);
  if(!ful) return; const open=ful.style.display!=='none';
  ful.style.display=open?'none':'block'; if(sum) sum.style.display=open?'inline':'none';
  if(btn) btn.innerHTML=open?'▸ voir plus':'▸ voir moins';
};
if(!window.__rcVoipAudio) window.__rcVoipAudio=new Audio();
window.__rcVoipPlay = function(pid){
  const b=doc.getElementById('btn_'+pid);
  const pauseIcon='<svg width="12" height="12" viewBox="0 0 12 12" fill="#60AEDF"><rect x="0" y="0" width="4" height="12" rx="1"/><rect x="8" y="0" width="4" height="12" rx="1"/></svg>';
  const playIcon='<svg width="10" height="12" viewBox="0 0 10 12" fill="#60AEDF"><path d="M0 0l10 6-10 6z"/></svg>';
  const a=window.__rcVoipAudio;
  if(a.dataset.currentId&&a.dataset.currentId!==pid){ const pb=doc.getElementById('btn_'+a.dataset.currentId); const pp=doc.getElementById('prg_'+a.dataset.currentId); if(pb) pb.innerHTML=playIcon; if(pp) pp.style.width='0%'; a.pause(); a.src=''; }
  a.dataset.currentId=pid;
  if(!a.src||a.dataset.loadedId!==pid){ const dataEl=doc.getElementById('data_'+pid); if(!dataEl) return; a.src=dataEl.dataset.src; a.dataset.loadedId=pid; const dur=parseFloat(dataEl.dataset.dur)||0;
    a.ontimeupdate=function(){ const d=a.duration||dur,c=a.currentTime; const prg=doc.getElementById('prg_'+pid); const cur=doc.getElementById('cur_'+pid); const rem=doc.getElementById('rem_'+pid);
      if(prg) prg.style.width=(d>0?c/d*100:0)+'%'; if(cur) cur.textContent=Math.floor(c/60)+':'+String(Math.floor(c%60)).padStart(2,'0'); if(rem) rem.textContent=Math.floor((d-c)/60)+':'+String(Math.floor((d-c)%60)).padStart(2,'0'); };
    a.onended=function(){ if(b) b.innerHTML=playIcon; const prg=doc.getElementById('prg_'+pid); if(prg) prg.style.width='0%'; };
    a.play().then(()=>{ if(b) b.innerHTML=pauseIcon; }).catch(e=>console.warn('voip:',e)); return; }
  if(a.paused){ a.play().then(()=>{ if(b) b.innerHTML=pauseIcon; }).catch(e=>console.warn(e)); } else { a.pause(); if(b) b.innerHTML=playIcon; }
};
window.__rcVoipSeek = function(e,bar,pid){ const a=window.__rcVoipAudio; if(!a||!a.duration) return; const r=bar.getBoundingClientRect(); a.currentTime=(e.clientX-r.left)/r.width*a.duration; };
window.__rcWaPlay = function(wid){
  const a=doc.getElementById('aud_'+wid); const b=doc.getElementById('btn_'+wid); if(!a||!b) return;
  const pauseIcon='<svg width="12" height="12" viewBox="0 0 12 12" fill="#4CAF7D"><rect x="0" y="0" width="4" height="12" rx="1"/><rect x="8" y="0" width="4" height="12" rx="1"/></svg>';
  const playIcon='<svg width="10" height="12" viewBox="0 0 10 12" fill="#4CAF7D"><path d="M0 0l10 6-10 6z"/></svg>';
  if(!a.getAttribute('src')){ a.setAttribute('src',a.dataset.src); a.load();
    a.ontimeupdate=function(){ const d=a.duration,c=a.currentTime; const prg=doc.getElementById('prg_'+wid); const cur=doc.getElementById('cur_'+wid); if(prg) prg.style.width=(d>0?c/d*100:0)+'%'; if(cur) cur.textContent=Math.floor(c/60)+':'+String(Math.floor(c%60)).padStart(2,'0'); };
    a.onended=function(){ b.innerHTML=playIcon; const prg=doc.getElementById('prg_'+wid); if(prg) prg.style.width='0%'; };
    a.addEventListener('canplay',function onR(){ a.removeEventListener('canplay',onR); a.play(); b.innerHTML=pauseIcon; }); return; }
  if(a.paused){ a.play(); b.innerHTML=pauseIcon; } else { a.pause(); b.innerHTML=playIcon; }
};
window.__rcWaSeek = function(e,bar,wid){ const a=doc.getElementById('aud_'+wid); if(!a||!a.duration) return; const r=bar.getBoundingClientRect(); a.currentTime=(e.clientX-r.left)/r.width*a.duration; };

const RC_STYLE = '<style>'+
'#real-contacts-ov{position:fixed;inset:0;background:rgba(42,52,60,.45);z-index:70;display:flex;align-items:flex-start;justify-content:center;padding:32px;overflow-y:auto;font-family:"Nunito Sans",sans-serif}'+
'#real-contacts-ov .rc-modal{position:relative;background:#fff;border-radius:16px;max-width:680px;width:100%;box-shadow:0 24px 70px rgba(0,0,0,.35);margin:auto;display:flex;flex-direction:column;max-height:82vh}'+
'#real-contacts-ov .rc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid #eef0f3}'+
'#real-contacts-ov .rc-title{font-size:16px;font-weight:800;color:#2a5ea9}'+
'#real-contacts-ov .rc-head-actions{display:flex;align-items:center;gap:10px}'+
'#real-contacts-ov .rc-fiche{background:#2a5ea9;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer}'+
'#real-contacts-ov .rc-fiche:hover{background:#1f4a87}'+
'#real-contacts-ov .rc-close{width:32px;height:32px;border-radius:50%;border:none;background:#f1f3f6;color:#888;font-size:19px;line-height:32px;text-align:center;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center}'+
'#real-contacts-ov .rc-close:hover{background:#e24b4a;color:#fff}'+
'#real-contacts-ov .rc-body{padding:16px 20px;overflow-y:auto}'+
'#real-contacts-ov .rc-load,#real-contacts-ov .rc-err{padding:30px;text-align:center;color:#888;font-size:14px}'+
'#real-contacts-ov .rc-err{color:#a32d2d}'+
'#real-contacts-ov .rc-doc:hover{background:rgba(76,175,125,0.12)!important}'+
'#real-contacts-ov .rc-thumb{transition:opacity .15s}'+
'@media (max-width:760px){'+
'#real-contacts-ov{padding:12px}'+
'#real-contacts-ov .rc-modal{max-height:88vh}'+
'#real-contacts-ov .rc-head{padding:12px 14px}'+
'#real-contacts-ov .rc-body{padding:12px 14px}'+
'}'+
'</style>';
// --- fin sous-popup contacts ---


// ============================================================================
//  RÉALISATION DEPUIS L'AGENDA
//  Le bouton "Réaliser la Bilatérale" de l'agenda remplit la variable
//  id_bilate_real puis navigue vers cette page. Si la variable porte un id au
//  chargement, on ouvre directement le popup de réalisation (R_open) sur cette
//  bilatérale, puis on vide la variable pour ne pas la rouvrir aux visites
//  suivantes.
// ============================================================================
(function bilAutoOpenFromAgenda(){
  function tryOpen(){
    try {
      const v = wwLib.wwVariable.getValue(VAR_ID_BILATE_REAL);
      if (v != null && v !== '' && !Number.isNaN(Number(v))) {
        const id = Number(v);
        try { wwLib.wwVariable.updateValue(VAR_ID_BILATE_REAL, null); } catch(e){}
        R_open(id);
        return true;
      }
    } catch(e){}
    return false;
  }
  if (tryOpen()) return;
  let n = 0;
  const iv = setInterval(() => { n++; if (tryOpen() || n > 15) clearInterval(iv); }, 200);
})();

// --- Responsive : bascule #bil-root.bil-narrow selon la largeur RÉELLE du root
(function bindBilNarrow(tries){
  tries = tries || 0;
  try { window.__bilVer = 'v2-responsive'; } catch(e){}
  const root = getRoot();
  if (!root) { if (tries < 40) setTimeout(function(){ bindBilNarrow(tries + 1); }, 200); return; }
  const W = doc.defaultView || window;
  function apply(){
    const r = getRoot(); if (!r) return;
    let w = 0;
    try { w = r.getBoundingClientRect().width || r.clientWidth || 0; } catch(e){}
    if (!w) return;
    if (w <= 760) r.classList.add('bil-narrow'); else r.classList.remove('bil-narrow');
  }
  apply();
  [120, 400, 900, 1800, 3200].forEach(function(d){ setTimeout(apply, d); });
  try {
    if ('ResizeObserver' in W) {
      if (window.__bilRO) { try { window.__bilRO.disconnect(); } catch(e){} }
      window.__bilRO = new W.ResizeObserver(apply);
      window.__bilRO.observe(root);
    } else {
      if (window.__bilResize) W.removeEventListener('resize', window.__bilResize);
      window.__bilResize = apply;
      W.addEventListener('resize', window.__bilResize);
    }
  } catch(e){}
})();


}
});
