// ============================================================================
//  DASHBOARD — module One Data (OD.define)  v1 (checklist)
//  Rendu dans __anchor ; SUPABASE_URL/clé -> ctx.tenant ; RPC via ctx.supabase ;
//  self-boot retiré. Conserve window.__dash (lu par l'agenda) et
//  VAR_DASHBOARD_READY (signal -> agenda).
// ============================================================================
// ============================================================================
// DASHBOARD ADAPTATIF v3 — style refondu + dashboardReady
// ============================================================================

OD.define('dashboard', {
  async mount(__anchor, ctx) {
    __anchor.id = 'dash-root';
    const SUPABASE_URL = ctx.tenant.supabase_url;

const VAR_DASHBOARD_READY = 'ab8a0894-78dc-4523-8e96-07fdc56bd793';

function getSupabaseKey() { return ctx.tenant.supabase_anon_key; }
const VAR_CLIENT   = '55490583-c88b-4748-916e-4d203db07742';
const VAR_DATE_FROM = 'cad34621-74a3-4efb-bf37-41cdc467dbef';
const VAR_DATE_TO   = '34a6fc5c-abc8-440e-aa87-cbe1d7b00d83';

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

// self-boot retiré (le loader monte le module)

const userConnected = (((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser || {});
const viewerId    = userConnected.ID_User;
const viewerName  = userConnected.nomComplet || '';
const viewerRoleUC = userConnected.ID_Role != null ? Number(userConnected.ID_Role) : null;
const viewerSiteUC = userConnected.ID_SITE != null ? Number(userConnected.ID_SITE) : null;
if (viewerId == null) { const r0 = getRoot(); if (r0) r0.innerHTML = '<div style="padding:20px;color:#7a9cc4">Utilisateur non identifié.</div>'; return; }

function siteBus() {
  try { const w = wwLib.getFrontWindow(); if (w && w.oropraSite) return w.oropraSite; } catch (e) {}
  return window.oropraSite || null;
}

const state = window.__dash || {};
if (state.period === undefined) {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  state.period = { from: ymd(firstOfMonth), to: ymd(now) }; // AUTONOME : défaut mois courant, ignore les variables partagées
}
if (state.rawData === undefined)    state.rawData = null;
if (state.leadsLoaded === undefined) state.leadsLoaded = false;
if (state.error === undefined)      state.error = null;
if (state.loadKey === undefined)    state.loadKey = null;
if (state.selection === undefined)  state.selection = { level: 'all', key: null, label: 'Tout le périmètre' };
if (state.expanded === undefined)   state.expanded = {};
if (state.busSite === undefined)    state.busSite = (viewerSiteUC != null ? String(viewerSiteUC) : null);
if (state.busSelPending === undefined) state.busSelPending = true;
if (state.chefSite === undefined)   state.chefSite = state.busSite;
if (state.vnvo === undefined)       state.vnvo = 'tous';
state.loading = false;

if (state.viewerId !== undefined && String(state.viewerId) !== String(viewerId)) {
  state.rawData = null; state.loadKey = null; state.leadsLoaded = false;
  state.selection = { level: 'all', key: null, label: 'Tout le périmètre' };
  state.expanded = {};
  state.stock = null; state.stockLoaded = false; state.stockLoading = false;
  state.busSelPending = true;
}
state.viewerId = viewerId;
window.__dash = state;

function applyBusSite(siteId) {
    const st = window.__dash; if (!st) return;
    const id = siteId != null ? String(siteId) : null;
    if (id == null) return;
    const changed = st.busSite !== id;
    st.busSite = id; st.chefSite = id;
    if (changed) {
      st.busSelPending = true;
      if (roleFamily() === 'chef' && !st.stockLoading) { st.stockLoaded = false; loadStock(); }
    }
    adoptBusSelection(); render();
}
function adoptBusSelection() {
  const st = window.__dash; if (!st || !st.busSelPending) return;
  if (roleFamily() !== 'directeur') { st.busSelPending = false; return; }
  if (st.rawData === null || st.busSite == null) return;
  const row = (st.rawData || []).find(r => String(r.id_site) === String(st.busSite));
  st.busSelPending = false;
  if (row) st.selection = { level: 'site', key: String(row.id_site), label: row.nom_site };
}
function bindDashBus(tries) {
  tries = tries || 0;
  const b = siteBus();
  if (!b) { if (tries < 120) setTimeout(() => bindDashBus(tries + 1), 250); return; }
  if (window.__dashBusBound) { const id = b.getSiteId(); if (id != null) applyBusSite(id); return; }
  window.__dashBusBound = true;
  b.onChange(({ siteId }) => applyBusSite(siteId));
}

// --- Helpers date -----------------------------------------------------------
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function periodKey() { return viewerId + '_' + state.period.from + '_' + state.period.to; }
function fmtPeriod() {
  const f = (s) => { const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); };
  return f(state.period.from) + ' → ' + f(state.period.to);
}
function prenom(nom) { return (nom || '').trim().split(/\s+/)[0] || ''; }

// --- Helpers HTML -----------------------------------------------------------
function esc(s) { if (s === null || s === undefined) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function num(v) { if (v === null || v === undefined) return 0; if (typeof v === 'number') return v; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; }
function pct(re, ob) { const o = num(ob); return o > 0 ? Math.round(num(re) / o * 100) : (num(re) > 0 ? 100 : 0); }
function tauxTransfo(d) { const den = num(d.nb_propales_tx); return den > 0 ? Math.round(num(d.nb_wins_tx) / den * 100) : 0; }
function kpiColor(re, ob) {
  const r = num(re), o = num(ob);
  if (o === 0 && r > 0) return '#0f6e56';
  if (o === 0 && r === 0) return '#888780';
  const p = r / o;
  if (p >= 0.85) return '#0f6e56';
  if (p >= 0.5)  return '#854f0b';
  return '#a32d2d';
}
function fillWidth(re, ob) { const r = num(re), o = num(ob); if (o === 0) return r > 0 ? 100 : 0; return Math.max(8, Math.min(100, Math.round(r / o * 100))); }

// --- Prorata ----------------------------------------------------------------
function joursOuvres(from, to) {
  let n = 0; const d = new Date(from + 'T12:00:00'); const end = new Date(to + 'T12:00:00');
  while (d <= end) { if (d.getDay() !== 0) n++; d.setDate(d.getDate() + 1); } return n;
}
function prorataTemps() {
  const to = new Date(state.period.to + 'T12:00:00');
  const moisDeb = new Date(to.getFullYear(), to.getMonth(), 1);
  const moisFin = new Date(to.getFullYear(), to.getMonth() + 1, 0);
  const f = (d) => ymd(d);
  const total = joursOuvres(f(moisDeb), f(moisFin));
  const ecoules = joursOuvres(f(moisDeb), state.period.to);
  return total > 0 ? Math.min(1, ecoules / total) : 1;
}
function colorProrata(re, ob, prorata) {
  const o = num(ob); if (o === 0) return num(re) > 0 ? '#0f6e56' : '#888780';
  const atteinte = num(re) / o;
  if (atteinte >= prorata) return '#0f6e56';
  if (atteinte >= prorata - 0.15) return '#854f0b';
  return '#a32d2d';
}
function niveauProrata(re, ob, prorata) {
  const o = num(ob); if (o === 0) return num(re) > 0 ? 'vert' : 'neutre';
  const atteinte = num(re) / o;
  if (atteinte >= prorata) return 'vert';
  if (atteinte >= prorata - 0.15) return 'orange';
  return 'rouge';
}
function colorProrataBar(re, ob, prorata) {
  const niv = niveauProrata(re, ob, prorata);
  if (niv === 'vert')   return 'rgba(83,189,167,0.85)';
  if (niv === 'orange') return 'rgba(250,192,85,0.9)';
  if (niv === 'rouge')  return 'rgba(226,75,74,0.8)';
  return 'rgba(180,178,169,0.5)';
}

// --- Champs / agrégats ------------------------------------------------------
const SUM_FIELDS = [
  'commandes_realisees','objectif_commandes','financements_realises','objectif_financements',
  'contrats_service_realises','objectif_contrat_service','gravages_realises','objectif_gravage',
  'waxoyls_realises','objectif_waxoyl','cycles_ouverts','leads_a_traiter','clos_recent',
  'nb_contacts','nb_entrants','nb_sortants','nb_propales','nb_bdc','nb_wins',
  'nb_wins_tx','nb_propales_tx','nb_bdc_tx','rdv_a_venir','rdv_aujourdhui','rdv_sans_cr'
];
function emptyAgg() { const o = {}; for (const k of SUM_FIELDS) o[k] = 0; return o; }
function addAgg(target, row) { for (const k of SUM_FIELDS) target[k] += num(row[k]); }
function sumRows(rows) { const o = emptyAgg(); for (const r of rows) addAgg(o, r); return o; }

function rowsForSelection() {
  const all = state.rawData || []; const sel = state.selection;
  if (!sel || sel.level === 'all') return all;
  if (sel.level === 'reseau')  return all.filter(r => r.reseau === sel.key);
  if (sel.level === 'affaire') {
    const parts = String(sel.key).split('~~');
    if (parts.length === 2) { const [res, ida] = parts; return all.filter(r => r.reseau === res && String(r.id_affaire) === ida); }
    return all.filter(r => String(r.id_affaire) === String(sel.key));
  }
  if (sel.level === 'site')    return all.filter(r => String(r.id_site) === String(sel.key));
  if (sel.level === 'vendeur') return all.filter(r => String(r.id_user) === String(sel.key));
  return all;
}
function rowsForChef() {
  let rows = state.rawData || [];
  if (state.chefSite != null) { const exists = rows.some(r => String(r.id_site) === String(state.chefSite)); if (!exists) state.chefSite = null; }
  if (state.chefSite != null) rows = rows.filter(r => String(r.id_site) === String(state.chefSite));
  if (state.vnvo === 'vn') rows = rows.filter(r => (r.vn_vo || '').includes('VN'));
  else if (state.vnvo === 'vo') rows = rows.filter(r => (r.vn_vo || '').includes('VO'));
  return rows;
}
function sitesDispo() {
  const m = {};
  for (const r of (state.rawData || [])) { if (r.id_site != null) m[String(r.id_site)] = r.nom_site; }
  return Object.keys(m).map(k => ({ id: k, nom: m[k] }));
}
function byVendeur(rows) {
  const m = {};
  for (const r of rows) {
    const k = String(r.id_user);
    if (!m[k]) m[k] = { id_user: r.id_user, nom_complet: r.nom_complet, id_site: r.id_site, nom_site: r.nom_site, id_manager: r.id_manager, ...emptyAgg() };
    addAgg(m[k], r);
  }
  return Object.values(m);
}

// --- Chargement -------------------------------------------------------------
async function loadData() {
  window.__dashLoadData = loadData;
  const key = periodKey();
  if (state.loading) return;
  if (state.loadKey === key && state.rawData !== null) return;
  state.loading = true; state.error = null; state.loadKey = key;
  render();
  try {
    const supabase = ctx.supabase;
    const { data, error } = await supabase.rpc('get_dashboard', { p_viewer_id_user: Number(viewerId), p_date_from: state.period.from, p_date_to: state.period.to });
    if (error) throw error;
    const rows = (data || []).map(r => {
      const o = { id_user: Number(r.id_user), nom_complet: r.nom_complet || ('Vendeur ' + r.id_user),
        fonction: r.fonction || '', vn_vo: (r.vn_vo || '').toString().toUpperCase(),
        id_manager: r.id_manager != null ? Number(r.id_manager) : null,
        id_site: r.id_site != null ? Number(r.id_site) : null, nom_site: r.nom_site || ('Site ' + r.id_site),
        reseau: r.reseau || '(Sans réseau)', affaire: r.affaire || '(Sans affaire)',
        id_affaire: r.id_affaire != null ? Number(r.id_affaire) : null };
      for (const k of SUM_FIELDS) o[k] = num(r[k]);
      return o;
    });
    state.viewerRole = (data && data[0] && data[0].viewer_role != null) ? Number(data[0].viewer_role) : 0;
    state.rawData = rows;
    adoptBusSelection();
    state.leadsLoaded = false;
    loadLeads(key);
  } catch (e) {
    console.error('[dashboard] RPC get_dashboard', e);
    state.error = (e && e.message) ? e.message : String(e);
    state.rawData = [];
  } finally {
    state.loading = false;
    render();
  }
}
async function loadLeads(loadKeyAtStart) {
  try {
    const supabase = ctx.supabase;
    const { data, error } = await supabase.rpc('get_dashboard_leads', { p_viewer_id_user: Number(viewerId) });
    if (error) throw error;
    if (state.loadKey !== loadKeyAtStart) return;
    const idx = {};
    for (const r of (data || [])) idx[Number(r.id_user) + '_' + Number(r.id_site)] = num(r.leads_a_traiter);
    for (const row of (state.rawData || [])) { const k = row.id_user + '_' + row.id_site; row.leads_a_traiter = idx[k] != null ? idx[k] : 0; }
    state.leadsLoaded = true; render();
  } catch (e) { console.error('[dashboard] RPC get_dashboard_leads', e); state.leadsLoaded = true; render(); }
}
async function loadStock() {
  if (state.stockLoaded || state.stockLoading) return;
  state.stockLoading = true;
  try {
    const supabase = ctx.supabase;
    const { data, error } = await supabase.rpc('get_stock_synthese', { p_viewer_id_user: Number(viewerId) });
    if (error) throw error;
    state.stock = (data || []).map(r => ({ categorie: r.categorie, id_site: r.id_site != null ? Number(r.id_site) : null, nb_vehicules: num(r.nb_vehicules), age_moyen_jours: num(r.age_moyen_jours), nb_vieillissants: num(r.nb_vieillissants), valeur_stock: num(r.valeur_stock) }));
    state.stockLoaded = true;
  } catch (e) { console.error('[dashboard] RPC get_stock_synthese', e); state.stock = []; state.stockLoaded = true; }
  finally { state.stockLoading = false; render(); }
}

function roleFamily() {
  const r = Number(viewerRoleUC != null ? viewerRoleUC : (state.viewerRole || 0));
  if (r === 4) return 'vendeur'; if (r === 3) return 'chef';
  if (r === 1 || r === 6 || r === 7 || r === 8) return 'directeur';
  return 'directeur';
}

// ============================================================================
//  RENDER
// ============================================================================
function render() {
  const root = getRoot(); if (!root) return;

  if (state.loading || state.rawData === null) {
    root.innerHTML = shell(skeletonHtml());
    bind();
    return;
  }
  if (state.error) {
    root.innerHTML = shell('<div style="padding:20px;color:#a32d2d">Erreur : ' + esc(state.error) + '</div>');
    bind(); return;
  }

  const fam = roleFamily();
  let body = '';
  try {
    if (fam === 'vendeur') body = renderVendeur();
    else if (fam === 'chef') body = renderChef();
    else body = renderDirecteur();
  } catch (e) {
    console.error('[dashboard] render', e);
    body = '<div style="padding:20px;color:#a32d2d">Erreur d\'affichage : ' + esc((e && e.message) || e) + '</div>';
  }

  root.innerHTML = shell(body);
  bind();

  // ← dashboardReady : signale à WeWeb que le dashboard est rendu → l'agenda peut s'afficher
  try { wwLib.wwVariable.updateValue(VAR_DASHBOARD_READY, true); } catch (e) {}
  try { (wwLib.getFrontWindow ? wwLib.getFrontWindow() : window).dispatchEvent(new Event('resize')); } catch (e) {}
}

// Skeleton affiché pendant le chargement (remplace le "Chargement…" texte brut)
function skeletonHtml() {
  const bar = '<div style="height:12px;border-radius:6px;background:linear-gradient(90deg,#eef2f8 25%,#e2eaf5 50%,#eef2f8 75%);background-size:200% 100%;animation:dashSkel 1.4s infinite;margin-bottom:8px"></div>';
  const card = '<div style="background:#fff;border:1.5px solid #e8eef7;border-radius:12px;padding:16px">' + bar + bar.replace('height:12px','height:8px') + '</div>';
  return '<style>@keyframes dashSkel{0%{background-position:200% 0}100%{background-position:-200% 0}}</style>'
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px">' + card + card + card + card + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' + card + card + '</div>';
}

function shell(inner) {
  let h = '<div class="dash">';
  h += STYLE;
  h += '<div class="dash-periodbar"><span class="dash-periodbar-lbl">Période</span><button type="button" class="dash-range" id="dash-range">📅 ' + esc(fmtPeriod()) + ' <span class="dash-range-car">▾</span></button></div>';
  h += inner + '</div>';
  return h;
}

// --- Date range picker ------------------------------------------------------
function closeRangePickerDash() {
  const e = doc.getElementById('dash-dp'); if (e) e.remove();
  if (window.__dashDpOutside) { doc.removeEventListener('mousedown', window.__dashDpOutside, true); window.__dashDpOutside = null; }
}
function applyPeriodDash(from, to) {
  closeRangePickerDash();
  if (!from || !to) return;
  if (from === state.period.from && to === state.period.to) return;
  state.period.from = from; state.period.to = to;
  state.rawData = null; state.loadKey = null; state.leadsLoaded = false;
  state.selection = { level: 'all', key: null, label: 'Tout le périmètre' };
  state.busSelPending = true;
  // dashboardReady repasse à false pendant le rechargement
  try { wwLib.wwVariable.updateValue(VAR_DASHBOARD_READY, false); } catch (e) {}
  loadData();
}
function openRangePickerDash(anchor) {
  closeRangePickerDash();
  const pk = { month: null, start: null, end: null, hover: null };
  const m0 = new Date(state.period.from + 'T12:00:00');
  pk.month = new Date(m0.getFullYear(), m0.getMonth(), 1);
  const pop = doc.createElement('div'); pop.id = 'dash-dp';
  const r = anchor.getBoundingClientRect();
  pop.style.cssText = 'position:fixed;z-index:9999;top:' + (r.bottom + 6) + 'px;left:' + Math.max(8, r.left) + 'px';
  injectDpStyleDash(); doc.body.appendChild(pop);
  function calHtml() {
    const y = pk.month.getFullYear(), m = pk.month.getMonth();
    const first = new Date(y, m, 1); const startIdx = (first.getDay() + 6) % 7; const nbDays = new Date(y, m + 1, 0).getDate();
    const today = ymd(new Date()); const selA = pk.start, selB = pk.end || pk.hover;
    const lo = selA && selB ? (selA < selB ? selA : selB) : null; const hi = selA && selB ? (selA < selB ? selB : selA) : null;
    let h = '<div class="dash-dp-box">';
    h += '<div class="dash-dp-head"><button type="button" data-nav="-1">‹</button><span>' + esc(first.toLocaleDateString('fr-FR', { month:'long', year:'numeric' })) + '</span><button type="button" data-nav="1">›</button></div>';
    h += '<div class="dash-dp-grid">';
    for (const d of ['L','M','M','J','V','S','D']) h += '<span class="dash-dp-dow">' + d + '</span>';
    for (let i = 0; i < startIdx; i++) h += '<span></span>';
    for (let d = 1; d <= nbDays; d++) {
      const ds = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      let cls = 'dash-dp-day';
      if (ds === today) cls += ' today'; if (pk.start === ds || pk.end === ds) cls += ' sel'; else if (lo && hi && ds > lo && ds < hi) cls += ' inr';
      h += '<span class="' + cls + '" data-d="' + ds + '">' + d + '</span>';
    }
    h += '</div><div class="dash-dp-foot">' + (pk.start ? 'Cliquez la date de fin' : 'Cliquez la date de début') + '</div></div>';
    return h;
  }
  function wire() {
    pop.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); pk.month = new Date(pk.month.getFullYear(), pk.month.getMonth() + Number(b.getAttribute('data-nav')), 1); paint(); }));
    pop.querySelectorAll('.dash-dp-day').forEach(c => {
      c.addEventListener('click', () => { const ds = c.getAttribute('data-d'); if (!pk.start || pk.end) { pk.start = ds; pk.end = null; pk.hover = null; paint(); return; } pk.end = ds; let a = pk.start, b = pk.end; if (b < a) { const t = a; a = b; b = t; } applyPeriodDash(a, b); });
      c.addEventListener('mouseenter', () => { if (pk.start && !pk.end && pk.hover !== c.getAttribute('data-d')) { pk.hover = c.getAttribute('data-d'); paint(); } });
    });
  }
  function paint() { pop.innerHTML = calHtml(); wire(); }
  paint();
  window.__dashDpOutside = (e) => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closeRangePickerDash(); };
  setTimeout(() => doc.addEventListener('mousedown', window.__dashDpOutside, true), 0);
}
function injectDpStyleDash() {
  if (doc.getElementById('dash-dp-style')) return;
  const st = doc.createElement('style'); st.id = 'dash-dp-style';
  st.textContent = '#dash-dp .dash-dp-box{background:#fff;border:1.5px solid #e8eef7;border-radius:12px;box-shadow:0 8px 30px rgba(42,94,169,.18);padding:13px;width:262px;font-family:"Nunito Sans",system-ui,sans-serif}' +
    '#dash-dp .dash-dp-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}' +
    '#dash-dp .dash-dp-head span{font-size:12px;font-weight:700;color:#2a5ea9;text-transform:capitalize}' +
    '#dash-dp .dash-dp-head button{width:26px;height:26px;border:1.5px solid #e8eef7;background:#fff;border-radius:8px;cursor:pointer;color:#2a5ea9;font-size:13px;line-height:1;padding:0}' +
    '#dash-dp .dash-dp-head button:hover{background:#f5f8fc}' +
    '#dash-dp .dash-dp-grid{display:grid;grid-template-columns:repeat(7,33px);gap:2px}' +
    '#dash-dp .dash-dp-dow{font-size:9px;color:#acc5e4;text-align:center;font-weight:800;padding-bottom:3px}' +
    '#dash-dp .dash-dp-day{height:29px;line-height:29px;text-align:center;font-size:11px;color:#2c2c2a;border-radius:7px;cursor:pointer}' +
    '#dash-dp .dash-dp-day:hover{background:#eef4fc}' +
    '#dash-dp .dash-dp-day.today{box-shadow:inset 0 0 0 1.5px #acc5e4}' +
    '#dash-dp .dash-dp-day.sel{background:#2a5ea9;color:#fff;font-weight:800}' +
    '#dash-dp .dash-dp-day.inr{background:#eef4fc}' +
    '#dash-dp .dash-dp-foot{margin-top:8px;text-align:center;font-size:10px;color:#9bb3d1;font-style:italic}';
  doc.head.appendChild(st);
}

// --- Carte KPI --------------------------------------------------------------
function kpiCard(label, value, sub, color) {
  return '<div class="dash-kpi"><div class="dash-kpi-label">' + esc(label) + '</div><div class="dash-kpi-value" style="color:' + (color || '#2a5ea9') + '">' + value + '</div>' + (sub ? '<div class="dash-kpi-sub">' + sub + '</div>' : '') + '</div>';
}
function kpiCardRO(label, re, ob) {
  const c = kpiColor(re, ob); const p = pct(re, ob);
  return '<div class="dash-kpi"><div class="dash-kpi-label">' + esc(label) + '</div><div class="dash-kpi-value" style="color:' + c + '">' + num(re) + ' <span style="font-size:13px;color:#9bb3d1">/ ' + num(ob) + '</span></div><div class="dash-bar"><div class="dash-bar-fill" style="width:' + fillWidth(re, ob) + '%;background:' + c + '"></div></div><div class="dash-kpi-sub" style="color:' + c + '">' + p + '%</div></div>';
}
function leadsDisplay(n) { return state.leadsLoaded ? num(n) : '…'; }
function alertCell(count, label, color, popupKey) {
  return '<div class="dash-alert-cell" data-popup="' + esc(popupKey) + '"><div class="dash-alert-num" style="color:' + color + '">' + count + '</div><div class="dash-alert-label">' + esc(label) + '</div></div>';
}

// ============================================================================
//  VENDEUR
// ============================================================================
function renderVendeur() {
  const all = state.rawData || [];
  let scope = all;
  if (state.busSite != null && all.some(r => String(r.id_site) === String(state.busSite))) scope = all.filter(r => String(r.id_site) === String(state.busSite));
  let mesLignes = scope.filter(r => String(r.id_user) === String(viewerId));
  if (!mesLignes.length) { mesLignes = all.filter(r => String(r.id_user) === String(viewerId)); scope = all; }
  const me = sumRows(mesLignes.length ? mesLignes : scope);
  const tauxTr = tauxTransfo(me);
  let h = '';
  h += '<div class="dash-banner dash-banner-warn"><div class="dash-banner-title" style="color:#854f0b"><i class="dash-i">⚑</i> À faire en priorité</div><div class="dash-alert-grid">';
  h += alertCell(leadsDisplay(me.leads_a_traiter), 'leads à traiter', '#a32d2d', 'leads');
  h += alertCell(me.cycles_ouverts, 'cycles en cours', '#2a5ea9', 'cycles');
  h += alertCell(me.rdv_sans_cr, 'RDV sans compte-rendu', '#854f0b', 'rdv_sans_cr');
  h += '</div></div>';
  h += '<div class="dash-kpis dash-kpis-4">';
  h += kpiCardRO('Mes commandes', me.commandes_realisees, me.objectif_commandes);
  h += kpiCard('Taux de transfo', tauxTr + '%', 'propales → wins', '#2a5ea9');
  h += kpiCard('Mes contacts', me.nb_contacts, me.nb_entrants + ' entrants · ' + me.nb_sortants + ' sortants', '#2a5ea9');
  h += kpiCard('Mon pipeline', me.cycles_ouverts, 'cycles ouverts', '#2a5ea9');
  h += '</div>';
  const equipe = byVendeur(scope);
  h += '<div class="dash-2col">';
  h += '<div class="dash-card">';
  if (equipe.length > 1) { h += '<div class="dash-card-title">Ma position dans l\'équipe</div>' + classementAvecMoi(equipe, viewerId); }
  else { h += '<div class="dash-card-title">Mon objectif du mois</div>' + ring(pct(me.commandes_realisees, me.objectif_commandes)); const reste = Math.max(0, num(me.objectif_commandes) - num(me.commandes_realisees)); h += '<div class="dash-ring-sub">' + (reste > 0 ? 'Encore ' + reste + ' commande' + (reste > 1 ? 's' : '') + ' pour l\'objectif' : 'Objectif atteint !') + '</div>'; }
  h += '</div><div class="dash-card"><div class="dash-card-title">Mon pipeline</div>' + pipelineFunnel(me) + '</div></div>';
  return h;
}
function classementAvecMoi(vendeurs, moiId) {
  const sorted = vendeurs.slice().sort((a, b) => b.commandes_realisees - a.commandes_realisees);
  const max = Math.max(1, ...sorted.map(v => v.commandes_realisees));
  const maPos = sorted.findIndex(v => String(v.id_user) === String(moiId)) + 1;
  let h = '';
  if (maPos > 0) h += '<div class="dash-mypos">Vous êtes <b>' + maPos + '<sup>' + (maPos === 1 ? 'er' : 'e') + '</sup></b> sur ' + sorted.length + '</div>';
  h += '<div class="dash-rank">';
  sorted.forEach((v, i) => {
    const isMe = String(v.id_user) === String(moiId); const w = Math.round(v.commandes_realisees / max * 100);
    const col = i === 0 ? '#53bda7' : isMe ? '#2a5ea9' : '#acc5e4';
    h += '<div class="dash-rank-row' + (isMe ? ' dash-rank-me' : '') + '"><span class="dash-rank-pos" style="color:' + (i === 0 ? '#854f0b' : isMe ? '#2a5ea9' : '#54678a') + '">' + (i + 1) + '</span><span class="dash-rank-name">' + esc(v.nom_complet) + (isMe ? ' (vous)' : '') + '</span><div class="dash-rank-bar-wrap"><div class="dash-rank-bar" style="width:' + Math.max(4, w) + '%;background:' + col + '"></div></div><span class="dash-rank-val">' + v.commandes_realisees + '</span></div>';
  });
  h += '</div>'; return h;
}

// ============================================================================
//  CHEF
// ============================================================================
  function renderChef() {
  if (!state.stockLoaded && !state.stockLoading) loadStock();
  const rows = rowsForChef(); const vendeurs = byVendeur(rows); const tot = sumRows(rows); const tauxTr = tauxTransfo(tot);
  const enDecrochage = vendeurs.filter(v => pct(v.commandes_realisees, v.objectif_commandes) < 50 || v.rdv_sans_cr > 80).length;
  let h = '';
  h += '<div class="dash-filters">';
  const sites = sitesDispo();
  if (sites.length > 1) {
    h += '<select class="dash-select" id="dash-site"><option value="">Tous mes sites</option>';
    for (const s of sites) h += '<option value="' + esc(s.id) + '"' + (String(state.chefSite) === String(s.id) ? ' selected' : '') + '>' + esc(s.nom) + '</option>';
    h += '</select>';
  }
  h += '<div class="dash-toggle">';
  [['tous','Tous'],['vn','VN'],['vo','VO']].forEach(o => { h += '<button type="button" class="dash-tg-btn ' + (state.vnvo === o[0] ? 'active' : '') + '" data-vnvo="' + o[0] + '">' + o[1] + '</button>'; });
  h += '</div></div>';
  h += '<div class="dash-banner dash-banner-danger"><div class="dash-banner-title" style="color:#a32d2d"><i class="dash-i">▲</i> Points d\'attention équipe</div><div class="dash-alert-grid">';
  h += alertCell(leadsDisplay(tot.leads_a_traiter), 'leads non traités', '#a32d2d', 'leads');
  h += alertCell(enDecrochage, 'vendeurs en décrochage', '#854f0b', 'decrochage');
  h += alertCell(tot.rdv_sans_cr, 'RDV sans compte-rendu', '#2a5ea9', 'rdv_sans_cr');
  h += '</div></div>';
  h += '<div class="dash-kpis dash-kpis-4">';
  h += kpiCardRO('Commandes équipe', tot.commandes_realisees, tot.objectif_commandes);
  h += kpiCard('Pipeline équipe', tot.cycles_ouverts, 'cycles ouverts', '#2a5ea9');
  h += kpiCard('Taux transfo', tauxTr + '%', 'propales → wins', '#0f6e56');
  h += kpiCard('Contacts', tot.nb_contacts, '~' + (vendeurs.length ? Math.round(tot.nb_contacts / vendeurs.length) : 0) + ' / vendeur', '#2a5ea9');
  h += '</div>';
  h += '<div class="dash-2col"><div class="dash-card"><div class="dash-card-title">Synthèse du stock</div>' + blocStock() + '</div>';
  h += '<div class="dash-card"><div class="dash-card-title">Qui décroche <span style="font-size:10px;color:#9bb3d1;font-weight:400">· réactivité commerciale</span></div>' + blocDecroche(vendeurs) + '</div></div>';
  h += '<div class="dash-card" style="margin-top:12px"><div class="dash-card-title">Mon équipe en un coup d\'œil</div>' + tableEquipe(vendeurs) + '</div>';
  return h;
}
function niveauEnfant() {
  const lvl = (state.selection && state.selection.level) || 'all';
  if (lvl === 'all')     return { libelle: 'réseau',  keyFn: r => r.reseau,             labelFn: r => r.reseau };
  if (lvl === 'reseau')  return { libelle: 'affaire', keyFn: r => String(r.id_affaire),  labelFn: r => r.affaire };
  if (lvl === 'affaire') return { libelle: 'site',    keyFn: r => String(r.id_site),     labelFn: r => r.nom_site };
  return { libelle: 'vendeur', keyFn: r => String(r.id_user), labelFn: r => r.nom_complet };
}

// ============================================================================
//  DIRECTEUR
// ============================================================================
function renderDirecteur() {
  const allRows = state.rawData || []; const rows = rowsForSelection(); const tot = sumRows(rows); const tauxTr = tauxTransfo(tot); const prorata = prorataTemps();
  const parSite = aggBy(rows, r => String(r.id_site), r => r.nom_site);
  const sitesAlerte = parSite.filter(s => { const o = num(s.objectif_commandes); return o > 0 && (num(s.commandes_realisees) / o) < (prorata - 0.15); }).length;
  const nbSites = parSite.length; const nbVendeurs = new Set(rows.map(r => String(r.id_user))).size;
  const scoped = state.selection && state.selection.level !== 'all';
  const isBusScope = scoped && state.selection.level === 'site' && String(state.selection.key) === String(state.busSite);
  let h = '';
  h += '<div class="dash-scope"><span class="dash-scope-label">' + (scoped ? '<b>' + esc(state.selection.label) + '</b>' : 'Tout le périmètre') + '</span>';
  if (isBusScope) h += '<span class="dash-scope-bus" title="Ce périmètre est le site global sélectionné dans le header">📍 site global</span>';
  if (scoped) h += '<button type="button" class="dash-scope-clear" data-clear="1">↺ tout le périmètre</button>';
  h += '<span class="dash-scope-prorata">Mois écoulé : ' + Math.round(prorata * 100) + '% (jours ouvrés)</span></div>';
  h += '<div class="dash-kpis dash-kpis-5">';
  h += kpiCardRO('Commandes', tot.commandes_realisees, tot.objectif_commandes);
  h += kpiCard('Pipeline', tot.cycles_ouverts.toLocaleString('fr-FR'), 'cycles ouverts', '#2a5ea9');
  h += kpiCard('Transfo', tauxTr + '%', 'propales → wins', '#0f6e56');
  h += kpiCard('Leads à traiter', leadsDisplay(tot.leads_a_traiter), 'sur ' + nbSites + ' site' + (nbSites > 1 ? 's' : ''), '#854f0b');
  h += kpiCard('Sites en alerte', sitesAlerte, 'en retard / prorata', sitesAlerte > 0 ? '#a32d2d' : '#0f6e56');
  h += '</div>';
  const niv = niveauEnfant(); const parNiveau = aggBy(rows, niv.keyFn, niv.labelFn);
  h += '<div class="dash-2col"><div class="dash-card"><div class="dash-card-title">Atteinte objectif par ' + niv.libelle + ' <span style="font-size:10px;color:#9bb3d1">vs ' + Math.round(prorata * 100) + '% du mois</span></div>';
  const moyLabel = (state.selection && state.selection.level !== 'all') ? state.selection.label : 'Tout';
  h += barsAtteinte(parNiveau, prorata, tot.commandes_realisees, tot.objectif_commandes, moyLabel) + '</div>';
  h += '<div class="dash-card"><div class="dash-card-title">Sites en alerte</div>' + listeSitesAlerte(parSite, prorata) + '</div></div>';
  h += '<div class="dash-card" style="margin-top:12px"><div class="dash-card-title">Performance par périmètre <span style="font-size:10px;color:#9bb3d1">' + nbVendeurs + ' vendeurs · cliquez pour explorer · sélectionner un site le définit comme site global</span></div>' + arbrePerf(allRows, prorata) + '</div>';
  return h;
}
function aggBy(rows, keyFn, labelFn) {
  const m = {};
  for (const r of rows) { const k = keyFn(r); if (k == null || k === 'null' || k === '') continue; if (!m[k]) m[k] = { key: k, label: labelFn(r), ...emptyAgg() }; addAgg(m[k], r); }
  return Object.values(m).sort((a, b) => b.commandes_realisees - a.commandes_realisees);
}

// --- Composants visuels -----------------------------------------------------
function ring(p) {
  const r = 50, c = 2 * Math.PI * r, off = c * (1 - Math.min(100, p) / 100);
  const col = p >= 85 ? '#53bda7' : p >= 50 ? '#fac055' : '#e24b4a';
  return '<div class="dash-ring"><svg viewBox="0 0 120 120" width="92" height="92" style="transform:rotate(-90deg)"><circle cx="60" cy="60" r="' + r + '" fill="none" stroke="#eef2f8" stroke-width="12"/><circle cx="60" cy="60" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/></svg><div class="dash-ring-val" style="color:' + col + '">' + p + '%</div></div>';
}
function pipelineFunnel(d) {
  const propales = num(d.nb_propales_tx), bdc = num(d.nb_bdc_tx), wins = num(d.nb_wins_tx);
  const max = Math.max(propales, bdc, wins, 1);
  const txProp2Bdc = propales > 0 ? Math.round(bdc / propales * 100) : 0;
  const txBdc2Win = bdc > 0 ? Math.round(wins / bdc * 100) : 0;
  const txGlobal = propales > 0 ? Math.round(wins / propales * 100) : 0;
  const stage = (lbl, val, col, txtcol) => { const w = Math.max(14, Math.round(val / max * 100)); return '<div class="dash-funnel-stage"><div class="dash-funnel-bar" style="width:' + w + '%;background:' + col + '"><span class="dash-funnel-val" style="color:' + txtcol + '">' + val + '</span><span class="dash-funnel-lbl" style="color:' + txtcol + '">' + lbl + '</span></div></div>'; };
  const arrow = (txt) => '<div class="dash-funnel-conv">↓ <b>' + txt + '%</b> de passage</div>';
  let friction = '';
  if (propales > 0) { if (txProp2Bdc < txBdc2Win) friction = 'Point d\'attention : transformer les propales en BDC'; else if (bdc > 0) friction = 'Point d\'attention : conclure les BDC en commandes'; }
  return '<div class="dash-funnel">' + stage('Propales', propales, '#acc5e4', '#0c447c') + arrow(txProp2Bdc) + stage('BDC', bdc, '#53bda7', '#04342c') + arrow(txBdc2Win) + stage('Wins', wins, '#fac055', '#633806') + '</div>'
    + '<div class="dash-funnel-foot"><span class="dash-funnel-global">Transfo globale : <b>' + txGlobal + '%</b></span>' + (friction ? '<span class="dash-funnel-fric">' + friction + '</span>' : '') + '</div>';
}
function fmtEuro(v) { const n = num(v); if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + ' M€'; if (n >= 1000) return Math.round(n / 1000) + ' k€'; return Math.round(n) + ' €'; }

function blocStock() {
    if (state.stockLoading) return '<div style="padding:14px;color:#9bb3d1;font-size:12px">Chargement du stock…</div>';
    if (!state.stockLoaded) { loadStock(); return '<div style="padding:14px;color:#9bb3d1;font-size:12px">Chargement du stock…</div>'; }
    const allStock = state.stock || [];
    let rows = allStock;
    if (state.chefSite != null) {
      const scoped = allStock.filter(r => String(r.id_site) === String(state.chefSite));
      rows = scoped.length ? scoped : allStock;
    }
  if (!rows.length) return '<div style="padding:14px;color:#9bb3d1;font-size:12px">Aucune donnée de stock.</div>';
  const agg = {};
  for (const r of rows) { if (!agg[r.categorie]) agg[r.categorie] = { nb: 0, vieil: 0, val: 0, ageSum: 0, ageN: 0 }; const a = agg[r.categorie]; a.nb += r.nb_vehicules; a.vieil += r.nb_vieillissants; a.val += r.valeur_stock; if (r.age_moyen_jours > 0) { a.ageSum += r.age_moyen_jours * r.nb_vehicules; a.ageN += r.nb_vehicules; } }
  const seuil = { VN: 180, VO: 90 };
  const card = (cat, accent) => { const a = agg[cat]; if (!a) return ''; const age = a.ageN > 0 ? Math.round(a.ageSum / a.ageN) : 0; const ageCol = age === 0 ? '#9bb3d1' : age <= (cat === 'VN' ? 90 : 45) ? '#0f6e56' : age <= seuil[cat] ? '#854f0b' : '#a32d2d'; const vieilCol = a.vieil === 0 ? '#0f6e56' : a.vieil > a.nb * 0.3 ? '#a32d2d' : '#854f0b'; return '<div class="dash-stock-card"><div class="dash-stock-head"><span style="color:' + accent + '">' + cat + '</span><span class="dash-stock-vol">' + a.nb + '</span></div><div class="dash-stock-lines"><div class="dash-stock-line"><span>Âge moyen</span><b style="color:' + ageCol + '">' + (age > 0 ? age + ' j' : '—') + '</b></div><div class="dash-stock-line dash-stock-clic" data-popup="stock_vieil" data-key="' + cat + '"><span>Vieillissants &gt;' + seuil[cat] + 'j</span><b style="color:' + vieilCol + '">' + a.vieil + '</b></div>' + (a.val > 0 ? '<div class="dash-stock-line"><span>Valeur stock</span><b>' + fmtEuro(a.val) + '</b></div>' : '') + '</div></div>'; };
  const nbVN = agg.VN ? agg.VN.nb : 0, nbVO = agg.VO ? agg.VO.nb : 0, tot = nbVN + nbVO;
  let h = '<div class="dash-stock-grid">' + card('VN', '#2a5ea9') + card('VO', '#854f0b') + '</div>';
  if (tot > 0) { const pVN = Math.round(nbVN / tot * 100), pVO = 100 - pVN; h += '<div class="dash-stock-mix"><div class="dash-stock-mix-label">Mix du stock</div><div class="dash-stock-mix-bar">' + (pVN > 0 ? '<div style="width:' + pVN + '%;background:#acc5e4"><span style="color:#0c447c">VN ' + pVN + '%</span></div>' : '') + (pVO > 0 ? '<div style="width:' + pVO + '%;background:#fac055"><span style="color:#633806">VO ' + pVO + '%</span></div>' : '') + '</div></div>'; }
  return h;
}
function scoreReactivite(v, moyContacts) {
  let score = 100;
  score -= Math.min(40, num(v.leads_a_traiter) * 2.5);
  score -= Math.min(35, num(v.rdv_sans_cr) * 0.4);
  if (moyContacts > 0) { const ratio = num(v.nb_contacts) / moyContacts; if (ratio < 0.6) score -= 25; else if (ratio < 0.85) score -= 12; }
  return Math.max(0, Math.round(score));
}
function blocDecroche(vendeurs) {
  if (!vendeurs.length) return '<div style="padding:14px;color:#9bb3d1;font-size:12px">Aucun vendeur.</div>';
  const moyContacts = vendeurs.reduce((s, v) => s + num(v.nb_contacts), 0) / vendeurs.length;
  const scored = vendeurs.map(v => ({ v, score: scoreReactivite(v, moyContacts) })).sort((a, b) => a.score - b.score);
  // Fond neutre pour tous — le dot coloré porte l'info
  const palier = (s) => s >= 75 ? { dot: '#53bda7', fg: '#0f6e56', txt: 'réactif' }
                       : s >= 50 ? { dot: '#fac055', fg: '#854f0b', txt: 'à surveiller' }
                       :           { dot: '#e24b4a', fg: '#a32d2d', txt: 'à risque' };
  const tend = (v) => { if (moyContacts <= 0) return ''; const d = Math.round((num(v.nb_contacts) / moyContacts - 1) * 100); return (d >= 0 ? 'activité +' : 'activité ') + d + '%'; };
  let h = '<div class="dash-decroche">';
  for (const { v, score } of scored.slice(0, 6)) {
    const p = palier(score);
    h += '<div class="dash-decroche-row" data-popup="decroche_vendeur" data-key="' + esc(v.id_user) + '"><span class="dash-decroche-dot" style="background:' + p.dot + '"></span><div class="dash-decroche-mid"><div class="dash-decroche-name">' + esc(v.nom_complet) + '</div><div class="dash-decroche-sig">' + num(v.leads_a_traiter) + ' leads dormants · ' + num(v.rdv_sans_cr) + ' RDV non suivis · ' + tend(v) + '</div></div><div class="dash-decroche-score"><div style="color:' + p.fg + '">' + score + '</div><div class="dash-decroche-txt" style="color:' + p.fg + '">' + p.txt + '</div></div></div>';
  }
  h += '</div>'; return h;
}
function statutVendeur(v) {
  const p = pct(v.commandes_realisees, v.objectif_commandes);
  if (p >= 85) return { txt: 'En forme',  bg: '#eaf7f3', fg: '#0f6e56' };
  if (p >= 50) return { txt: 'Régulier',  bg: '#eef4fc', fg: '#2a5ea9' };
  return             { txt: 'À coacher', bg: '#f5f5f5',  fg: '#a32d2d' };
}
function tableEquipe(vendeurs) {
  const sorted = vendeurs.slice().sort((a, b) => b.commandes_realisees - a.commandes_realisees);
  let h = '<table class="dash-table"><thead><tr><th>Vendeur</th><th class="c">Commandes</th><th class="c">Pipeline</th><th class="c">À traiter</th><th class="c">Statut</th></tr></thead><tbody>';
  for (const v of sorted) { const st = statutVendeur(v); const cc = kpiColor(v.commandes_realisees, v.objectif_commandes); h += '<tr><td class="dash-td-name">' + esc(v.nom_complet) + '</td><td class="c" style="color:' + cc + ';font-weight:600">' + v.commandes_realisees + ' / ' + v.objectif_commandes + '</td><td class="c">' + v.cycles_ouverts + '</td><td class="c" style="color:' + (v.leads_a_traiter > 15 ? '#a32d2d' : '#54678a') + '">' + v.leads_a_traiter + '</td><td class="c"><span class="dash-tag" style="background:' + st.bg + ';color:' + st.fg + '">' + st.txt + '</span></td></tr>'; }
  h += '</tbody></table>'; return h;
}
function barsAtteinte(items, prorata, moyRe, moyOb, moyLabel) {
  const moyPct = (num(moyOb) > 0) ? Math.round(num(moyRe) / num(moyOb) * 100) : 0;
  const moyPos = Math.max(0, Math.min(100, moyPct)); const moyColor = colorProrataBar(moyRe, moyOb, prorata); const lbl = (moyLabel || 'Tout') + ' ' + moyPct + '%';
  let h = '<div class="dash-bars2">';
  if (num(moyOb) > 0) { h += '<div class="dash-bars2-avg" style="left:' + moyPos + '%;border-color:' + moyColor + '"></div><div class="dash-bars2-avg-lbl" style="left:' + moyPos + '%;color:' + moyColor + '">' + esc(lbl) + '</div>'; }
  for (const it of items.slice(0, 8)) { const p = pct(it.commandes_realisees, it.objectif_commandes); const cBar = colorProrataBar(it.commandes_realisees, it.objectif_commandes, prorata); const cTxt = colorProrata(it.commandes_realisees, it.objectif_commandes, prorata); h += '<div class="dash-bars2-row"><div class="dash-bars2-head"><span class="dash-bars2-lbl">' + esc(it.label) + '</span><span class="dash-bars2-val" style="color:' + cTxt + '">' + p + '%</span></div><div class="dash-bars2-track"><div class="dash-bars2-fill" style="width:' + Math.max(2, Math.min(100, p)) + '%;background:' + cBar + '"></div></div></div>'; }
  h += '</div>'; return h;
}
function listeSitesAlerte(parSite, prorata) {
  const enRetard = parSite.filter(s => { const o = num(s.objectif_commandes); return o > 0 && (num(s.commandes_realisees) / o) < (prorata - 0.15); }).sort((a, b) => pct(a.commandes_realisees, a.objectif_commandes) - pct(b.commandes_realisees, b.objectif_commandes));
  if (!enRetard.length) return '<div style="padding:14px;color:#0f6e56;font-size:12px;font-weight:600">Aucun site en retard sur le prorata 👍</div>';
  let h = '<div class="dash-sites">';
  for (const s of enRetard.slice(0, 6)) { const p = pct(s.commandes_realisees, s.objectif_commandes); h += '<div class="dash-sites-row" data-popup="site" data-key="' + esc(s.key) + '"><span class="dash-sites-name">' + esc(s.label) + '</span><span class="dash-sites-val">' + s.commandes_realisees + '/' + s.objectif_commandes + ' · ' + p + '%</span></div>'; }
  h += '</div>'; return h;
}
function expIcon(open) { return '<span class="dash-exp">' + (open ? '▾' : '▸') + '</span> '; }
function kpiCellsTree(a, prorata) {
  const p = pct(a.commandes_realisees, a.objectif_commandes);
  const c = prorata != null ? colorProrata(a.commandes_realisees, a.objectif_commandes, prorata) : kpiColor(a.commandes_realisees, a.objectif_commandes);
  const tr = tauxTransfo(a);
  const okP = prorata != null ? (num(a.objectif_commandes) > 0 && (num(a.commandes_realisees) / num(a.objectif_commandes)) >= prorata - 0.15) : (p >= 60);
  return '<td style="color:' + c + ';font-weight:600">' + a.commandes_realisees + ' / ' + a.objectif_commandes + '</td><td>' + a.cycles_ouverts + '</td><td>' + tr + '%</td><td><span class="dash-tag" style="background:' + (okP ? '#eaf7f3' : '#f5f5f5') + ';color:' + (okP ? '#0f6e56' : '#a32d2d') + '">' + p + '%</span></td>';
}
function arbrePerf(rows, prorata) {
  const tree = {};
  for (const r of rows) {
    const rk = r.reseau; if (!tree[rk]) tree[rk] = { label: rk, key: rk, agg: emptyAgg(), affaires: {} }; addAgg(tree[rk].agg, r);
    const ak = String(r.id_affaire); if (!tree[rk].affaires[ak]) tree[rk].affaires[ak] = { label: r.affaire, key: ak, reseau: rk, agg: emptyAgg(), sites: {} }; addAgg(tree[rk].affaires[ak].agg, r);
    const sk = String(r.id_site); const A = tree[rk].affaires[ak]; if (!A.sites[sk]) A.sites[sk] = { label: r.nom_site, key: sk, agg: emptyAgg(), vendeurs: {} }; addAgg(A.sites[sk].agg, r);
    const vk = String(r.id_user); const S = A.sites[sk]; if (!S.vendeurs[vk]) S.vendeurs[vk] = { label: r.nom_complet, key: vk, agg: emptyAgg() }; addAgg(S.vendeurs[vk].agg, r);
  }
  const reseaux = Object.values(tree).sort((a, b) => b.agg.commandes_realisees - a.agg.commandes_realisees);
  if (!reseaux.length) return '<div class="dash-empty">Aucune donnée sur la période.</div>';
  const sel = state.selection || { level: 'all' };
  const isSel = (lvl, key) => sel.level === lvl && String(sel.key) === String(key);
  const selAttr = (lvl, key, label) => ' data-sel-level="' + lvl + '" data-sel-key="' + esc(key) + '" data-sel-label="' + esc(label) + '"';
  let body = '';
  for (const R of reseaux) {
    const rKey = 'r:' + R.key; const rOpen = !!state.expanded[rKey];
    body += '<tr class="lv-reseau' + (isSel('reseau', R.key) ? ' is-sel' : '') + '" data-exp="' + esc(rKey) + '"' + selAttr('reseau', R.key, R.label) + '><td>' + expIcon(rOpen) + esc(R.label) + '</td>' + kpiCellsTree(R.agg, prorata) + '</tr>';
    if (!rOpen) continue;
    const affaires = Object.values(R.affaires).sort((a, b) => b.agg.commandes_realisees - a.agg.commandes_realisees);
    for (const A of affaires) {
      const aKey = rKey + '|a:' + A.key; const aOpen = !!state.expanded[aKey]; const aSelKey = R.key + '~~' + A.key;
      body += '<tr class="lv-affaire' + (isSel('affaire', aSelKey) ? ' is-sel' : '') + '" data-exp="' + esc(aKey) + '"' + selAttr('affaire', aSelKey, A.label) + '><td>' + expIcon(aOpen) + esc(A.label) + '</td>' + kpiCellsTree(A.agg, prorata) + '</tr>';
      if (!aOpen) continue;
      const sites = Object.values(A.sites).sort((a, b) => b.agg.commandes_realisees - a.agg.commandes_realisees);
      for (const S of sites) {
        const sKey = aKey + '|s:' + S.key; const sOpen = !!state.expanded[sKey];
        body += '<tr class="lv-site' + (isSel('site', S.key) ? ' is-sel' : '') + '" data-exp="' + esc(sKey) + '"' + selAttr('site', S.key, S.label) + '><td>' + expIcon(sOpen) + esc(S.label) + '</td>' + kpiCellsTree(S.agg, prorata) + '</tr>';
        if (!sOpen) continue;
        const vendeurs = Object.values(S.vendeurs).sort((a, b) => b.agg.commandes_realisees - a.agg.commandes_realisees);
        if (!vendeurs.length) { body += '<tr class="lv-vendeur"><td style="font-style:italic;color:#9bb3d1">Aucun vendeur</td><td colspan="4"></td></tr>'; }
        else { for (const V of vendeurs) body += '<tr class="lv-vendeur' + (isSel('vendeur', V.key) ? ' is-sel' : '') + '"' + selAttr('vendeur', V.key, V.label) + '><td>' + esc(V.label) + '</td>' + kpiCellsTree(V.agg, prorata) + '</tr>'; }
      }
    }
  }
  return '<table class="dash-tree"><thead><tr><th>Périmètre</th><th>Commandes</th><th>Pipeline</th><th>Transfo</th><th>Atteinte</th></tr></thead><tbody>' + body + '</tbody></table>';
}

// ============================================================================
//  BINDINGS
// ============================================================================
function bind() {
  const root = getRoot(); if (!root) return;
  const siteSel = root.querySelector('#dash-site');
  if (siteSel) siteSel.addEventListener('change', () => { const v = siteSel.value || null; state.chefSite = v; if (v != null) { const b = siteBus(); if (b) b.setSiteId(Number(v)); } render(); });
  window.__dashRoute = function (e) {
    if (e.__dashDone) return;
    if (!(e.target.closest && e.target.closest('#dash-root'))) return;
    const st = window.__dash; if (!st) return;
    e.__dashDone = true;
    try { e.stopImmediatePropagation(); } catch (x) {}
    const rg = e.target.closest('#dash-range'); if (rg) { openRangePickerDash(rg); return; }
    const tg = e.target.closest('[data-vnvo]'); if (tg) { st.vnvo = tg.getAttribute('data-vnvo'); render(); return; }
    const clr = e.target.closest('[data-clear]'); if (clr) { st.selection = { level: 'all', key: null, label: 'Tout le périmètre' }; st.expanded = {}; render(); return; }
    const tr = e.target.closest('tr[data-exp], tr[data-sel-level]');
    if (tr) {
      const lvl = tr.getAttribute('data-sel-level');
      if (lvl) { const key = tr.getAttribute('data-sel-key'); const label = tr.getAttribute('data-sel-label'); if (st.selection && st.selection.level === lvl && String(st.selection.key) === String(key)) { st.selection = { level: 'all', key: null, label: 'Tout le périmètre' }; } else { st.selection = { level: lvl, key: key, label: label }; if (lvl === 'site') { try { const b = siteBus(); if (b) b.setSiteId(Number(key)); } catch (x) {} } } }
      const ek = tr.getAttribute('data-exp'); if (ek) st.expanded[ek] = !st.expanded[ek];
      render(); return;
    }
    const pop = e.target.closest('[data-popup]'); if (pop) { openPopup(pop.getAttribute('data-popup'), pop.getAttribute('data-key') || null); return; }
  };
  if (!window.__dashDocClickBound) { doc.addEventListener('click', function (e) { if (window.__dashRoute) window.__dashRoute(e); }, true); window.__dashDocClickBound = true; }
}

// ============================================================================
//  POPUPS
// ============================================================================
function dashClosePopup() { const e = doc.getElementById('dash-popup-overlay'); if (e) e.remove(); }
function dashOpenShell(titleLabel) {
  dashClosePopup();
  const overlay = doc.createElement('div'); overlay.id = 'dash-popup-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(42,94,169,0.18);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.addEventListener('click', e => { if (e.target === overlay) dashClosePopup(); });
  const modal = doc.createElement('div'); modal.style.cssText = 'background:#fff;border-radius:14px;box-shadow:0 8px 40px rgba(42,94,169,0.18);width:90%;max-width:900px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;font-family:"Nunito Sans",system-ui,sans-serif';
  const header = doc.createElement('div'); header.style.cssText = 'background:#2a5ea9;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0';
  const t = doc.createElement('div'); t.style.cssText = 'color:#fff;font-size:13px;font-weight:700'; t.textContent = titleLabel; header.appendChild(t);
  const btn = doc.createElement('button'); btn.style.cssText = 'width:28px;height:28px;border-radius:50%;border:none;background:rgba(255,255,255,0.2);color:#fff;font-size:18px;cursor:pointer;line-height:1;padding:0'; btn.textContent = '×'; btn.addEventListener('click', dashClosePopup); header.appendChild(btn);
  modal.appendChild(header);
  const bodyDiv = doc.createElement('div'); bodyDiv.style.cssText = 'overflow-y:auto;flex:1;padding:16px';
  bodyDiv.innerHTML = '<div style="padding:24px;text-align:center;color:#9bb3d1;font-size:13px">Chargement…</div>';
  modal.appendChild(bodyDiv); overlay.appendChild(modal); doc.body.appendChild(overlay);
  return bodyDiv;
}
function dashPopupErr(bodyDiv, msg) { if (bodyDiv) bodyDiv.innerHTML = '<div style="padding:24px;text-align:center;color:#a32d2d;font-size:13px">' + esc(msg) + '</div>'; }
function dashPopupEmpty(bodyDiv, msg) { if (bodyDiv) bodyDiv.innerHTML = '<div style="padding:24px;text-align:center;color:#9bb3d1;font-size:13px">' + esc(msg) + '</div>'; }
function dashGoToClient(client) { dashClosePopup(); try { wwLib.wwVariable.updateValue(VAR_CLIENT, client); } catch (e) {} try { wwLib.goTo({ name: 'Fiche Client' }); } catch (e) {} }
async function dashCallRpc(fn, params) { const supabase = ctx.supabase; const { data, error } = await supabase.rpc(fn, params); if (error) throw error; return data || []; }
function openPopup(key, sub) {
  if (key === 'leads')            return popupLeads(sub);
  if (key === 'stock_vieil')      return popupStock(sub);
  if (key === 'cycles')           return popupLeads(sub);
  if (key === 'rdv_sans_cr')      return popupRdvSansCr(sub);
  if (key === 'decroche_vendeur') return popupLeads(sub);
  if (key === 'decrochage')       return popupDecrochage(sub);
  if (key === 'site')             return popupSite(sub);
}
async function popupLeads(sub) {
  const fam = roleFamily(); const body = dashOpenShell('Leads à traiter');
  try {
    const params = { p_viewer_id_user: Number(viewerId), p_id_user: null, p_id_site: null };
    if (fam === 'vendeur') params.p_id_user = Number(viewerId);
    else if (sub) params.p_id_user = Number(sub);
    else if (fam === 'chef' && state.chefSite != null) params.p_id_site = Number(state.chefSite);
    const rows = await dashCallRpc('get_leads_detail', params);
    if (!rows.length) return dashPopupEmpty(body, 'Aucun lead à traiter 👍');
    renderTableLeads(body, rows);
  } catch (e) { console.error('[popup leads]', e); dashPopupErr(body, 'Erreur de chargement : ' + ((e && e.message) || e)); }
}
function renderTableLeads(body, rows) {
  const fam = roleFamily();
  let h = '<table class="dash-pop-tbl"><thead><tr><th>Client</th><th>Date du lead</th><th>Ancienneté</th>' + (fam !== 'vendeur' ? '<th>Vendeur</th>' : '') + '</tr></thead><tbody>';
  for (const r of rows) { const d = r.date_lead ? new Date(r.date_lead).toLocaleDateString('fr-FR') : '—'; const anc = r.anciennete_jours != null ? r.anciennete_jours + ' j' : '—'; const ancCol = num(r.anciennete_jours) > 30 ? '#a32d2d' : num(r.anciennete_jours) > 14 ? '#854f0b' : '#54678a'; h += '<tr><td><span class="dash-pop-link" data-client="' + esc(r.id_client) + '">' + esc(r.nom_client) + '</span></td><td style="color:#9bb3d1">' + d + '</td><td style="color:' + ancCol + ';font-weight:600">' + anc + '</td>' + (fam !== 'vendeur' ? '<td style="color:#54678a">' + esc(r.nom_vendeur) + '</td>' : '') + '</tr>'; }
  h += '</tbody></table>';
  body.innerHTML = '<div class="dash-pop-count">' + rows.length + ' lead' + (rows.length > 1 ? 's' : '') + ' à traiter</div>' + h;
  body.querySelectorAll('.dash-pop-link[data-client]').forEach(el => { el.addEventListener('click', async () => { const id = el.getAttribute('data-client'); try { const key = getSupabaseKey(); const r = await fetch(SUPABASE_URL + '/rest/v1/CLIENT?IDVu=eq.' + id + '&select=*', { headers: { apikey: key, Authorization: 'Bearer ' + key } }); const arr = await r.json(); dashGoToClient(arr && arr[0] ? arr[0] : { IDVu: Number(id) }); } catch (e) { dashGoToClient({ IDVu: Number(id) }); } }); });
}
async function popupStock(categorie) {
  const cat = (categorie || 'VO').toUpperCase(); const body = dashOpenShell('Stock ' + cat + ' vieillissant');
  try {
    const params = { p_viewer_id_user: Number(viewerId), p_categorie: cat, p_id_site: state.chefSite != null ? Number(state.chefSite) : null };
    const rows = await dashCallRpc('get_stock_detail', params);
    if (!rows.length) return dashPopupEmpty(body, 'Aucun véhicule vieillissant 👍');
    let h = '<div class="dash-pop-count">' + rows.length + ' véhicule' + (rows.length > 1 ? 's' : '') + ' (' + cat + ')</div><table class="dash-pop-tbl"><thead><tr><th>Modèle</th><th>Immat / VIN</th><th>Âge</th><th style="text-align:right">Valeur</th></tr></thead><tbody>';
    for (const r of rows) { const ageCol = num(r.age_jours) > (cat === 'VN' ? 270 : 150) ? '#a32d2d' : '#854f0b'; h += '<tr><td style="color:#2a5ea9;font-weight:600">' + esc(r.modele) + '</td><td><div style="color:#54678a">' + esc(r.immat) + '</div><div style="color:#acc5e4;font-size:10px">' + esc(r.vin || '—') + '</div></td><td style="color:' + ageCol + ';font-weight:600">' + num(r.age_jours) + ' j</td><td style="text-align:right">' + (num(r.valeur) > 0 ? fmtEuro(r.valeur) : '—') + '</td></tr>'; }
    h += '</tbody></table>'; body.innerHTML = h;
  } catch (e) { console.error('[popup stock]', e); dashPopupErr(body, 'Erreur de chargement : ' + ((e && e.message) || e)); }
}
async function popupRdvSansCr(sub) { const body = dashOpenShell('RDV sans compte-rendu'); dashPopupEmpty(body, 'Détail des RDV sans compte-rendu — à brancher sur la source RDV_CLIENT.'); }
function popupDecrochage(sub) {
  const body = dashOpenShell('Vendeurs en décrochage');
  const vendeurs = byVendeur(rowsForChef()); const moy = vendeurs.reduce((s, v) => s + num(v.nb_contacts), 0) / (vendeurs.length || 1);
  const scored = vendeurs.map(v => ({ v, score: scoreReactivite(v, moy) })).filter(x => x.score < 75).sort((a, b) => a.score - b.score);
  if (!scored.length) return dashPopupEmpty(body, 'Aucun vendeur en décrochage 👍');
  let h = '<table class="dash-pop-tbl"><thead><tr><th>Vendeur</th><th>Score</th><th>Leads dormants</th><th>RDV non suivis</th></tr></thead><tbody>';
  for (const { v, score } of scored) { const col = score < 50 ? '#a32d2d' : '#854f0b'; h += '<tr><td style="color:#2a5ea9;font-weight:600">' + esc(v.nom_complet) + '</td><td style="color:' + col + ';font-weight:700">' + score + '</td><td>' + num(v.leads_a_traiter) + '</td><td>' + num(v.rdv_sans_cr) + '</td></tr>'; }
  h += '</tbody></table>'; body.innerHTML = h;
}
function popupSite(idSite) {
  const body = dashOpenShell('Détail du site');
  const rows = (state.rawData || []).filter(r => String(r.id_site) === String(idSite));
  if (!rows.length) return dashPopupEmpty(body, 'Aucune donnée pour ce site.');
  const vendeurs = byVendeur(rows);
  let h = '<div class="dash-pop-count">' + esc(rows[0].nom_site) + ' — ' + vendeurs.length + ' vendeur' + (vendeurs.length > 1 ? 's' : '') + '</div><table class="dash-pop-tbl"><thead><tr><th>Vendeur</th><th>Commandes</th><th>Pipeline</th><th>Leads à traiter</th></tr></thead><tbody>';
  for (const v of vendeurs.sort((a, b) => b.commandes_realisees - a.commandes_realisees)) { const cc = kpiColor(v.commandes_realisees, v.objectif_commandes); h += '<tr><td style="color:#2a5ea9;font-weight:600">' + esc(v.nom_complet) + '</td><td style="color:' + cc + ';font-weight:600">' + v.commandes_realisees + ' / ' + v.objectif_commandes + '</td><td>' + v.cycles_ouverts + '</td><td>' + v.leads_a_traiter + '</td></tr>'; }
  h += '</tbody></table>'; body.innerHTML = h;
}

// ============================================================================
//  STYLE
// ============================================================================
const STYLE = '<style>' +
'#dash-root .dash{font-family:"Nunito Sans",system-ui,sans-serif;color:#2c2c2a}' +
'#dash-root .dash-periodbar{display:flex;align-items:center;gap:8px;margin-bottom:14px}' +
'#dash-root .dash-periodbar-lbl{font-size:11px;color:#9bb3d1;text-transform:uppercase;letter-spacing:.4px;font-weight:700}' +
'#dash-root .dash-range{border:1.5px solid #e2eaf5;border-radius:9px;padding:7px 13px;font-size:13px;color:#2a5ea9;background:#fff;cursor:pointer;font-family:inherit;font-weight:700;display:inline-flex;align-items:center;gap:7px;transition:border-color .15s}' +
'#dash-root .dash-range:hover{border-color:#2a5ea9}' +
'#dash-root .dash-range-car{font-size:9px;color:#9bb3d1}' +
'#dash-root .dash-filters{display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap}' +
'#dash-root .dash-select{border:1.5px solid #e2eaf5;border-radius:9px;padding:7px 11px;font-size:13px;font-family:inherit;color:#1F4A85;background:#fff;font-weight:600}' +
'#dash-root .dash-toggle{display:flex;border:1.5px solid #e2eaf5;border-radius:9px;overflow:hidden}' +
'#dash-root .dash-tg-btn{padding:6px 14px;font-size:12px;border:none;cursor:pointer;background:#fff;color:#9bb3d1;font-family:inherit;font-weight:700;transition:all .12s}' +
'#dash-root .dash-tg-btn.active{background:#2a5ea9;color:#fff}' +
'#dash-root .dash-tg-btn:not(:last-child){border-right:1.5px solid #e2eaf5}' +
'#dash-root .dash-banner{border-radius:12px;padding:13px 16px;margin-bottom:14px;background:#fff;border:1px solid #e8eef7}' +
'#dash-root .dash-banner-warn{border-left:4px solid #fac055}' +
'#dash-root .dash-banner-danger{border-left:4px solid #e24b4a}' +
'#dash-root .dash-banner-title{font-size:12px;font-weight:800;margin-bottom:10px;letter-spacing:.02em;text-transform:uppercase}' +
'#dash-root .dash-i{font-style:normal;margin-right:4px}' +
'#dash-root .dash-alert-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}' +
'#dash-root .dash-alert-cell{background:#f7f9fc;border-radius:10px;padding:11px 13px;cursor:pointer;border:1.5px solid #e8eef7;transition:border-color .12s,transform .08s}' +
'#dash-root .dash-alert-cell:hover{border-color:#2a5ea9;transform:translateY(-1px)}' +
'#dash-root .dash-alert-num{font-size:24px;font-weight:800;line-height:1.1}' +
'#dash-root .dash-alert-label{font-size:11px;color:#9bb3d1;font-weight:600;margin-top:2px}' +
'#dash-root .dash-kpis{display:grid;gap:12px;margin-bottom:14px}' +
'#dash-root .dash-kpis-4{grid-template-columns:repeat(4,1fr)}' +
'#dash-root .dash-kpis-5{grid-template-columns:repeat(5,1fr)}' +
'#dash-root .dash-kpi{background:#fff;border:1.5px solid #e8eef7;border-radius:12px;padding:14px}' +
'#dash-root .dash-kpi-label{font-size:11px;color:#9bb3d1;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px}' +
'#dash-root .dash-kpi-value{font-size:24px;font-weight:800;line-height:1}' +
'#dash-root .dash-kpi-sub{font-size:11px;color:#9bb3d1;margin-top:7px}' +
'#dash-root .dash-bar{height:4px;background:#eef2f8;border-radius:3px;margin-top:9px;overflow:hidden}' +
'#dash-root .dash-bar-fill{height:4px;border-radius:3px}' +
'#dash-root .dash-2col{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
'#dash-root .dash-card{background:#fff;border:1.5px solid #e8eef7;border-radius:14px;padding:16px}' +
'#dash-root .dash-card-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;margin-bottom:14px;color:#9bb3d1}' +
'#dash-root .dash-ring{position:relative;display:flex;align-items:center;justify-content:center;height:96px}' +
'#dash-root .dash-ring-val{position:absolute;font-size:19px;font-weight:800}' +
'#dash-root .dash-ring-sub{font-size:11px;color:#9bb3d1;text-align:center;margin-top:6px;font-weight:600}' +
'#dash-root .dash-funnel{display:flex;flex-direction:column;align-items:center;gap:3px;margin-top:8px}' +
'#dash-root .dash-funnel-stage{width:100%;display:flex;justify-content:center}' +
'#dash-root .dash-funnel-bar{height:38px;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:8px;min-width:80px;transition:width .3s}' +
'#dash-root .dash-funnel-val{font-size:16px;font-weight:800}' +
'#dash-root .dash-funnel-lbl{font-size:11px;font-weight:700;opacity:.85}' +
'#dash-root .dash-funnel-conv{font-size:10px;color:#9bb3d1;padding:1px 0;font-weight:600}' +
'#dash-root .dash-funnel-conv b{color:#54678a}' +
'#dash-root .dash-funnel-foot{margin-top:13px;display:flex;flex-direction:column;gap:5px;align-items:center;text-align:center}' +
'#dash-root .dash-funnel-global{font-size:12px;color:#54678a;font-weight:600}' +
'#dash-root .dash-funnel-global b{color:#0f6e56;font-size:15px}' +
'#dash-root .dash-funnel-fric{font-size:11px;color:#854f0b;background:#fff8e8;border:1px solid #fac055;padding:4px 11px;border-radius:8px;font-weight:600}' +
'#dash-root .dash-rank{display:flex;flex-direction:column;gap:8px}' +
'#dash-root .dash-mypos{font-size:12px;color:#54678a;margin-bottom:10px;text-align:center;font-weight:600}' +
'#dash-root .dash-mypos b{color:#2a5ea9;font-size:16px}' +
'#dash-root .dash-rank-me{background:#eef4fc;border-radius:8px;padding:4px 5px;margin:0 -5px}' +
'#dash-root .dash-rank-row{display:flex;align-items:center;gap:9px}' +
'#dash-root .dash-rank-pos{width:18px;font-size:13px;font-weight:800;text-align:center}' +
'#dash-root .dash-rank-name{flex:1;font-size:12px;color:#2a5ea9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}' +
'#dash-root .dash-rank-bar-wrap{width:90px;height:13px;background:#eef2f8;border-radius:4px;overflow:hidden}' +
'#dash-root .dash-rank-bar{height:13px;border-radius:4px}' +
'#dash-root .dash-rank-val{width:28px;text-align:right;font-size:12px;font-weight:700;color:#54678a}' +
'#dash-root .dash-table{width:100%;border-collapse:collapse;font-size:12px}' +
'#dash-root .dash-table th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#9bb3d1;font-weight:800;padding:7px 9px;border-bottom:1.5px solid #eef2f8}' +
'#dash-root .dash-table th.c{text-align:center}' +
'#dash-root .dash-table td{padding:9px;border-bottom:1px solid #f4f6fa}' +
'#dash-root .dash-table td.c{text-align:center}' +
'#dash-root .dash-table tbody tr:hover td{background:#fafcff}' +
'#dash-root .dash-td-name{color:#2a5ea9;font-weight:600}' +
'#dash-root .dash-tag{font-size:10px;padding:3px 9px;border-radius:999px;font-weight:700}' +
'#dash-root .dash-tree{width:100%;border-collapse:collapse;font-size:12px}' +
'#dash-root .dash-tree th{text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#9bb3d1;font-weight:800;padding:9px 10px;background:#f7f9fc;border-bottom:1.5px solid #eef2f8}' +
'#dash-root .dash-tree th:first-child{text-align:left}' +
'#dash-root .dash-tree td{padding:8px 10px;font-size:12px;text-align:center;font-variant-numeric:tabular-nums;border-bottom:.5px solid #eef2f8}' +
'#dash-root .dash-tree td:first-child{text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:340px}' +
'#dash-root .dash-tree tr{cursor:pointer}' +
'#dash-root .dash-tree tr.lv-reseau{background:#f4f7fc}' +
'#dash-root .dash-tree tr.lv-affaire{background:#f9fafd}' +
'#dash-root .dash-tree tr.lv-site,#dash-root .dash-tree tr.lv-vendeur{background:#fff}' +
'#dash-root .dash-tree tr:hover{background:#eef4fc !important}' +
'#dash-root .dash-tree .lv-reseau td:first-child{color:#1F4A85;font-weight:800}' +
'#dash-root .dash-tree .lv-affaire td:first-child{color:#2a5ea9;font-weight:700;padding-left:24px}' +
'#dash-root .dash-tree .lv-site td:first-child{color:#54678a;font-weight:600;padding-left:44px}' +
'#dash-root .dash-tree .lv-vendeur td:first-child{color:#7a98c5;padding-left:64px;font-weight:500}' +
'#dash-root .dash-tree tr.is-sel{background:#eef4fc !important}' +
'#dash-root .dash-tree tr.is-sel td:first-child{font-weight:800;color:#1F4A85}' +
'#dash-root .dash-exp{color:#acc5e4;font-size:10px}' +
'#dash-root .dash-empty{padding:20px;text-align:center;color:#9bb3d1;font-size:12px}' +
'#dash-root .dash-scope{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}' +
'#dash-root .dash-scope-label{font-size:13px;color:#54678a;font-weight:600}' +
'#dash-root .dash-scope-label b{color:#1F4A85}' +
'#dash-root .dash-scope-bus{font-size:10px;color:#0f6e56;background:#eaf7f3;border:1px solid #9ad9c5;border-radius:999px;padding:2px 9px;font-weight:700}' +
'#dash-root .dash-scope-clear{border:1.5px solid #e2eaf5;background:#fff;color:#9bb3d1;border-radius:8px;padding:4px 11px;font-size:11px;cursor:pointer;font-family:inherit;font-weight:700;transition:all .12s}' +
'#dash-root .dash-scope-clear:hover{border-color:#2a5ea9;color:#2a5ea9}' +
'#dash-root .dash-scope-prorata{font-size:11px;color:#9bb3d1;margin-left:auto;font-weight:600}' +
'#dash-root .dash-bars2{position:relative;display:flex;flex-direction:column;gap:14px;padding-top:6px;padding-bottom:22px}' +
'#dash-root .dash-bars2-row{display:flex;flex-direction:column;gap:4px}' +
'#dash-root .dash-bars2-head{display:flex;justify-content:space-between;align-items:baseline}' +
'#dash-root .dash-bars2-lbl{font-size:12px;color:#54678a;font-weight:600}' +
'#dash-root .dash-bars2-val{font-size:13px;font-weight:700}' +
'#dash-root .dash-bars2-track{height:20px;background:#eef2f8;border-radius:6px;overflow:hidden}' +
'#dash-root .dash-bars2-fill{height:20px;border-radius:6px;transition:width .3s}' +
'#dash-root .dash-bars2-avg{position:absolute;top:22px;bottom:18px;width:0;border-left:2px dashed;transform:translateX(-1px);pointer-events:none;z-index:2}' +
'#dash-root .dash-bars2-avg-lbl{position:absolute;bottom:0;transform:translateX(-50%);font-size:10px;font-weight:800;white-space:nowrap;padding:0 3px}' +
'#dash-root .dash-sites{display:flex;flex-direction:column;gap:6px}' +
'#dash-root .dash-sites-row{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#fff;border:1px solid #eef2f8;border-left:3px solid #e24b4a;border-radius:8px;cursor:pointer;transition:background .12s}' +
'#dash-root .dash-sites-row:hover{background:#fafcff}' +
'#dash-root .dash-sites-name{font-size:12px;color:#54678a;font-weight:600}' +
'#dash-root .dash-sites-val{font-size:11px;font-weight:700;color:#a32d2d}' +
'#dash-root .dash-stock-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
'#dash-root .dash-stock-card{background:#f7f9fc;border:1.5px solid #e8eef7;border-radius:12px;padding:13px}' +
'#dash-root .dash-stock-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}' +
'#dash-root .dash-stock-vol{font-size:22px;font-weight:800;color:#1F4A85}' +
'#dash-root .dash-stock-lines{display:flex;flex-direction:column;gap:8px}' +
'#dash-root .dash-stock-line{display:flex;justify-content:space-between;font-size:11px;color:#9bb3d1;font-weight:600}' +
'#dash-root .dash-stock-line b{font-weight:800;color:#2c2c2a}' +
'#dash-root .dash-stock-clic{cursor:pointer;border-radius:6px;margin:0 -4px;padding:0 4px;transition:background .12s}' +
'#dash-root .dash-stock-clic:hover{background:#eef4fc}' +
'#dash-root .dash-stock-mix{margin-top:13px}' +
'#dash-root .dash-stock-mix-label{font-size:10px;color:#9bb3d1;margin-bottom:5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}' +
'#dash-root .dash-stock-mix-bar{display:flex;height:14px;border-radius:6px;overflow:hidden}' +
'#dash-root .dash-stock-mix-bar>div{display:flex;align-items:center;justify-content:center}' +
'#dash-root .dash-stock-mix-bar span{font-size:9px;font-weight:800}' +
'#dash-root .dash-decroche{display:flex;flex-direction:column;gap:7px}' +
'#dash-root .dash-decroche-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;cursor:pointer;background:#f7f9fc;border:1.5px solid #e8eef7;transition:border-color .12s}' +
'#dash-root .dash-decroche-row:hover{border-color:#2a5ea9}' +
'#dash-root .dash-decroche-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}' +
'#dash-root .dash-decroche-mid{flex:1;min-width:0}' +
'#dash-root .dash-decroche-name{font-size:13px;color:#2a5ea9;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
'#dash-root .dash-decroche-sig{font-size:11px;color:#9bb3d1;margin-top:2px;font-weight:600}' +
'#dash-root .dash-decroche-score{text-align:right;font-size:18px;font-weight:800;line-height:1.1}' +
'#dash-root .dash-decroche-txt{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}' +
'.dash-pop-count{font-size:12px;color:#2a5ea9;font-weight:700;margin-bottom:12px}' +
'.dash-pop-tbl{width:100%;border-collapse:collapse;font-size:12px;font-family:"Nunito Sans",system-ui,sans-serif}' +
'.dash-pop-tbl th{background:#2a5ea9;color:#fff;font-weight:700;padding:8px 11px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em}' +
'.dash-pop-tbl th:first-child{border-radius:8px 0 0 8px}.dash-pop-tbl th:last-child{border-radius:0 8px 8px 0}' +
'.dash-pop-tbl td{padding:9px 11px;border-bottom:.5px solid #eef2f8;font-size:12px}' +
'.dash-pop-tbl tr:hover td{background:#f7f9fc}' +
'.dash-pop-link{color:#2a5ea9;font-weight:700;cursor:pointer;text-decoration:underline}' +
'@media(max-width:900px){#dash-root .dash-kpis-4,#dash-root .dash-kpis-5{grid-template-columns:repeat(2,1fr)}#dash-root .dash-2col{grid-template-columns:1fr}}' +
'@media(max-width:600px){#dash-root .dash-card{padding:12px}#dash-root .dash-banner{padding:11px 13px}#dash-root .dash-kpi{padding:11px}#dash-root .dash-kpi-value{font-size:20px}#dash-root .dash-alert-grid{gap:6px}#dash-root .dash-alert-cell{padding:9px}#dash-root .dash-alert-num{font-size:20px}#dash-root .dash-alert-label{font-size:10px;line-height:1.3}#dash-root .dash-stock-grid{grid-template-columns:1fr}#dash-root .dash-card:has(> table){overflow-x:auto;-webkit-overflow-scrolling:touch}#dash-root .dash-table,#dash-root .dash-tree{min-width:460px}#dash-root .dash-tree td:first-child{max-width:170px}#dash-root .dash-tree td,#dash-root .dash-tree th{padding:6px 7px}#dash-root .dash-tree .lv-affaire td:first-child{padding-left:16px}#dash-root .dash-tree .lv-site td:first-child{padding-left:28px}#dash-root .dash-tree .lv-vendeur td:first-child{padding-left:40px}#dash-root .dash-rank-bar-wrap{width:64px}#dash-root .dash-scope-prorata{margin-left:0;flex-basis:100%}#dash-root .dash-funnel-bar{height:34px}}' +
'#dash-popup-overlay div:has(> table.dash-pop-tbl){overflow-x:auto;-webkit-overflow-scrolling:touch}' +
'#dash-dp .dash-dp-box{max-width:calc(100vw - 16px)}' +
'</style>';

// ============================================================================
//  DÉMARRAGE
// ============================================================================
bindDashBus();
// dashboardReady à false avant le chargement initial
try { wwLib.wwVariable.updateValue(VAR_DASHBOARD_READY, false); } catch (e) {}
loadData();
if (roleFamily() === 'chef') loadStock();

(function ensureRenderedDash() {
  const delays = [250, 600, 1200, 2500];
  delays.forEach(d => setTimeout(() => { const root = getRoot(); if (root && !root.querySelector('.dash')) render(); }, d));
  const mo = new MutationObserver(() => { const root = getRoot(); if (root && !root.querySelector('.dash') && state.rawData !== null) render(); });
  try { mo.observe(doc.body, { childList: true, subtree: true }); } catch (e) {}
  setTimeout(() => { try { mo.disconnect(); } catch (e) {} }, 8000);
})();

// (watchPeriodeDash supprimé : plus de variables de dates partagées à surveiller)

}
});
