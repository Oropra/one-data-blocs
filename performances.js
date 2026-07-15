// ============================================================================
//  PERFORMANCES ÉQUIPE — module One Data (OD.define)  v1
//  Rendu dans __anchor ; SUPABASE_URL/clé/JWT via ctx (tenant + session runtime) ;
//  gardes arguments.callee et ensureRenderedPerf retirés (le loader possède le
//  cycle de vie). User via socle oropraUser. VAR_SITES partagé avec objectifs.
// ============================================================================
// ============================================================================
// PERFORMANCES ÉQUIPE v4 — Arbre hiérarchique navigable (marque>affaire>site>vendeur)
//  v4.3 RESPONSIVE :
//   - tableau-arbre dans un conteneur à scroll horizontal interne (.pf-tree-wrap)
//     -> il ne pousse plus la page en largeur ; min-width sur l'arbre en étroit ;
//   - barre d'outils resserrée, résumé qui passe à la ligne ;
//   - popup détail scrollable sur les 2 axes (tableau à colonnes fixes) ;
//   - calendrier borné à la largeur de l'écran ;
//   - repli .perf-narrow : règles mobiles déclenchées par la largeur RÉELLE de
//     #perf-root (ResizeObserver), en plus des @media (l'aperçu WeWeb peut
//     évaluer @media en largeur desktop).
//   PRÉREQUIS : le conteneur de section de la page doit être en width:100%
//   (comme corrigé sur Pipe commercial), sinon #perf-root reste large et déborde.
// ============================================================================

OD.define('performances', {
  async mount(__anchor, ctx) {
  __anchor.id = 'perf-root';

  const SUPABASE_URL = ctx.tenant.supabase_url;
  function getSupabaseKey() { return ctx.tenant.supabase_anon_key; }
  let SUPABASE_KEY = getSupabaseKey();

  const VAR_DATA = 'ee5d0c01-f520-403c-b8bd-ae471c0ac279';
  const VAR_DATE_DEB = 'cf3d0b4f-f6a4-4551-b0bf-d0ab12ab50d9';
  const VAR_DATE_FIN = '66b387eb-ee1c-4ee9-a113-e2617ae8bccc';
  const WF_REFETCH = '8d167d39-be55-45de-940b-78657d7f400d';
  const VAR_SITES = '95f3e5dc-e760-4506-84d8-070c65b3cb07';
  const VAR_CLIENT = '55490583-c88b-4748-916e-4d203db07742';

  const doc = __anchor.ownerDocument || document;
  function getRoot() { return __anchor; }
  try { window.__perfVer = 'v4.4-responsive'; } catch (e) { }

  // --- Bus de site (oropra-site-bus.js) ----------------------------------------
  function siteBus() {
    try { const w = wwLib.getFrontWindow(); if (w && w.oropraSite) return w.oropraSite; } catch (e) { }
    return window.oropraSite || null;
  }

  // Données : relues dynamiquement (la collection peut se charger après ce script en prod).
  const sb = ctx.supabase;
  let allRawData = [];
  // Périmètre : dérivé directement de v_user_perimeter (ne dépend plus de VAR_SITES,
  // qui n'est plus alimentée de façon fiable depuis la migration). Self-sufficient.
  let perimSites = [];
  async function loadPerimeter() {
    const me = (((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser) || {};
    if (me.ID_User == null) return perimSites;
    const { data, error } = await sb.from('v_user_perimeter').select('id_site').eq('viewer_id_user', me.ID_User);
    if (error) { console.error('[perf] v_user_perimeter', error); return perimSites; }
    const arr = [...new Set((data || []).map(r => Number(r.id_site)).filter(n => !isNaN(n)))];
    if (arr.length) perimSites = arr;
    return perimSites;
  }
  // FOLD : requête directe v_performances_v2 (dates + sites du périmètre) au lieu
  // de fetcher col_performances_equipe via workflow puis lire une variable.
  async function loadPerfData(deb, fin) {
    if (!perimSites.length) await loadPerimeter();
    let q = sb.from('v_performances_v2').select('*')
      .gte('date_mois', String(deb).slice(0, 10))
      .lte('date_mois', String(fin).slice(0, 10));
    if (perimSites.length) q = q.in('id_site', perimSites);
    const { data, error } = await q;
    if (error) { console.error('[perf] v_performances_v2', error); return allRawData; }
    allRawData = data || [];
    return allRawData;
  }
  function refreshRawData() { return allRawData; } // FOLD : data en mémoire

  // --- État -------------------------------------------------------------------
  const state = window.__perf || {};
  if (state.vnvo === undefined) state.vnvo = 'ALL';   // ALL | VN | VO
  if (state.mois === undefined) state.mois = 'ALL';   // ALL | 'YYYY-MM'
  if (state.selection === undefined) state.selection = { level: 'all', key: null, label: 'Tout le périmètre' };
  if (state.expanded === undefined) state.expanded = {};
  if (state.busSite === undefined) state.busSite = null;
  if (state.busSelPending === undefined) state.busSelPending = true;
  if (state.compare === undefined) state.compare = { active: false, items: [] };  // comparateur
  window.__perf = state;

  const viewerIdUser = allRawData[0]?.viewer_id_user || null;
  // (périmètre : voir perimSites, dérivé de v_user_perimeter)

  // --- Synchronisation avec le bus ---------------------------------------------
  function applyBusSitePerf(siteId) {
    const st = window.__perf; if (!st) return;
    const id = siteId != null ? String(siteId) : null;
    if (id == null) return;
    const changed = st.busSite !== id;
    st.busSite = id;
    if (changed) st.busSelPending = true;
    adoptBusSelectionPerf();
    if (window.__renderPerf) window.__renderPerf();
  }
  // Focalise la sélection sur le site du bus (niveau 'site'), ancêtres dépliés.
  function adoptBusSelectionPerf() {
    const st = window.__perf; if (!st || !st.busSelPending) return;
    if (st.busSite == null) return;
    const row = (allRawData || []).find(r => String(r.id_site) === String(st.busSite));
    if (!row) return;                       // données pas encore chargées (retenté au render)
    st.busSelPending = false;
    st.selection = { level: 'site', key: String(row.id_site), label: row.SITE || ('Site ' + row.id_site) };
    const rKey = 'r:' + (row.RESEAU || '__sr');
    const aKey = rKey + '|a:' + (row.AFFAIRE || '__sa');
    st.expanded[rKey] = true;
    st.expanded[aKey] = true;
  }
  (function bindPerfBus(tries) {
    tries = tries || 0;
    const b = siteBus();
    if (!b) { if (tries < 120) setTimeout(() => bindPerfBus(tries + 1), 250); return; }
    if (window.__perfBusBound) {
      const id = b.getSiteId();
      if (id != null) applyBusSitePerf(id);   // réexécution : simple recalage
      return;
    }
    window.__perfBusBound = true;
    b.onChange(({ siteId }) => applyBusSitePerf(siteId));
  })();

  // --- KPIs -------------------------------------------------------------------
  const KPIS = [
    { r: 'commandes_realisees', o: 'objectif_commandes', label: 'Commandes' },
    { r: 'financements_realises', o: 'objectif_financements', label: 'Financement' },
    { r: 'waxoyls_realises', o: 'objectif_waxoyl', label: 'Waxoyl' },
    { r: 'contrats_service_realises', o: 'objectif_contrat_service', label: 'CS' },
    { r: 'gravages_realises', o: 'objectif_gravage', label: 'Gravage' }
  ];
  function emptyAgg() { const a = {}; for (const k of KPIS) { a[k.r] = 0; a[k.o] = 0; } a._ids = []; return a; }
  function num(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return isNaN(v) ? 0 : v;
    const n = parseFloat(String(v).replace(',', '.').trim());
    return isNaN(n) ? 0 : n;
  }
  function addAgg(t, row) {
    for (const k of KPIS) { t[k.r] += num(row[k.r]); t[k.o] += num(row[k.o]); }
    if (Array.isArray(row.ids_commandes)) t._ids.push(...row.ids_commandes);
  }
  function pct(realise, objectif) { const o = num(objectif); return o > 0 ? Math.round(num(realise) / o * 100) : 0; }

  // --- PRORATA TEMPS (jours ouvrés lun-sam) ------------------------------------
  let __prorata = 1;   // recalculé à chaque render
  function joursOuvres(from, to) {
    let n = 0;
    const d = new Date(from + 'T12:00:00');
    const end = new Date(to + 'T12:00:00');
    while (d <= end) { if (d.getDay() !== 0) n++; d.setDate(d.getDate() + 1); }
    return n;
  }
  function prorataTemps() {
    let ym = null;
    if (state.mois !== 'ALL') ym = state.mois;
    else {
      const fin = String(wwLib.wwVariable.getValue(VAR_DATE_FIN) || '').slice(0, 10);
      if (/^\d{4}-\d{2}/.test(fin)) ym = fin.slice(0, 7);
    }
    if (!ym) return 1;
    const parts = ym.split('-').map(Number);
    const debM = new Date(parts[0], parts[1] - 1, 1);
    const finM = new Date(parts[0], parts[1], 0);
    let cap = finM;
    const today = new Date();
    if (today < cap) cap = today;
    const finP = String(wwLib.wwVariable.getValue(VAR_DATE_FIN) || '').slice(0, 10);
    if (finP) { const fp = new Date(finP + 'T12:00:00'); if (fp < cap) cap = fp; }
    if (cap < debM) return 0.01;                      // mois futur
    const total = joursOuvres(ymd(debM), ymd(finM));
    const ecoules = joursOuvres(ymd(debM), ymd(cap));
    return total > 0 ? Math.min(1, ecoules / total) : 1;
  }
  function kpiColorPro(realise, objectif) {
    const r = num(realise), o = num(objectif);
    if (o <= 0) {
      if (r > 0) return { bg: '#e1f5ee', text: '#085041', bar: '#53bda7' };
      return { bg: '#f0f2f5', text: '#8a96a8', bar: '#dde2ea' };
    }
    const at = r / o;
    if (at >= __prorata) return { bg: '#e1f5ee', text: '#085041', bar: '#53bda7' };
    if (at >= __prorata - 0.15) return { bg: '#faeeda', text: '#633806', bar: '#fac055' };
    return { bg: '#fcebeb', text: '#791f1f', bar: '#f09595' };
  }
  function pctLabel(realise, objectif) {
    const r = num(realise), o = num(objectif);
    if (o <= 0) return r > 0 ? '✓' : '—';
    return pct(r, o) + '%';
  }
  function fillWidth(realise, objectif) {
    const r = num(realise), o = num(objectif);
    if (o <= 0) return r > 0 ? 100 : 0;
    if (r <= 0) return 10;
    return Math.min(pct(r, o), 100);
  }

  // --- Helpers HTML / DOM -----------------------------------------------------
  function esc(s) { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function el(tag, css, text) { const e = doc.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = String(text); return e; }
  async function getUserJwt() { try { const s = await ctx.supabase.auth.getSession(); return s?.data?.session?.access_token || null; } catch (e) { return null; } }

  // --- Filtrage : VN/VO + mois + périmètre --------------------------------------
  function baseRows() {
    let rows = allRawData;
    if (state.vnvo !== 'ALL') rows = rows.filter(r => r.vn_vo === state.vnvo);
    if (state.mois !== 'ALL') rows = rows.filter(r => r.periode_ym === state.mois);
    return rows;
  }
  function moisDispos() {
    const set = new Set();
    for (const r of allRawData) if (r.periode_ym) set.add(r.periode_ym);
    return Array.from(set).sort();
  }
  function filterByEntity(rows, level, key) {
    if (level === 'all') return rows;
    if (level === 'reseau') return rows.filter(r => (r.RESEAU || '__sr') === key);
    if (level === 'affaire') return rows.filter(r => (r.AFFAIRE || '__sa') === key);
    if (level === 'site') return rows.filter(r => String(r.id_site) === String(key));
    if (level === 'vntype') {
      const parts = String(key).split('~~');
      if (parts.length === 2) {
        return rows.filter(r => String(r.id_site) === parts[0] && normType(r.vn_vo) === parts[1]);
      }
      return rows;
    }
    if (level === 'vendeur') return rows.filter(r => String(vendeurId(r)) === String(key));
    return rows;
  }
  function normType(v) {
    const s = (v == null ? '' : String(v)).trim().toUpperCase();
    return s || '—';
  }
  const TYPE_ORDER = { VN: 0, VO: 1, VNVO: 2 };
  function atteinteScore(agg) {
    const r = num(agg.commandes_realisees), o = num(agg.objectif_commandes);
    if (o > 0) return r / o;
    return r > 0 ? -0.5 : -1;
  }
  function byAtteinteDesc(a, b) {
    const d = atteinteScore(b.agg) - atteinteScore(a.agg);
    if (d !== 0) return d;
    return num(b.agg.commandes_realisees) - num(a.agg.commandes_realisees);
  }
  function rowsForSelection() { return filterByEntity(baseRows(), state.selection.level, state.selection.key); }
  function rowsScopeNoMois() {
    let rows = allRawData;
    if (state.vnvo !== 'ALL') rows = rows.filter(r => r.vn_vo === state.vnvo);
    return filterByEntity(rows, state.selection.level, state.selection.key);
  }
  function vendeurId(r) { return r.id_user != null ? r.id_user : (r.nom_complet_affichage || r.nomComplet); }

  // --- Arbre marque>affaire>site>type(VN/VO/VNVO)>vendeur ----------------------
  function buildTree(rows) {
    const byR = {};
    for (const r of rows) {
      const rk = r.RESEAU || '__sr', rl = r.RESEAU || 'Sans réseau';
      if (!byR[rk]) byR[rk] = { key: rk, label: rl, agg: emptyAgg(), aff: {} };
      addAgg(byR[rk].agg, r);
      const ak = r.AFFAIRE || '__sa', al = r.AFFAIRE || 'Sans affaire';
      if (!byR[rk].aff[ak]) byR[rk].aff[ak] = { key: ak, label: al, agg: emptyAgg(), sites: {} };
      addAgg(byR[rk].aff[ak].agg, r);
      const sk = String(r.id_site), sl = r.SITE || ('Site ' + r.id_site);
      if (!byR[rk].aff[ak].sites[sk]) byR[rk].aff[ak].sites[sk] = { key: sk, label: sl, agg: emptyAgg(), types: {} };
      addAgg(byR[rk].aff[ak].sites[sk].agg, r);
      const S = byR[rk].aff[ak].sites[sk];
      const tk = normType(r.vn_vo);
      if (!S.types[tk]) S.types[tk] = { key: tk, label: tk, agg: emptyAgg(), vend: {} };
      addAgg(S.types[tk].agg, r);
      const T = S.types[tk];
      const vk = String(vendeurId(r)), vl = r.nom_complet_affichage || r.nomComplet || ('Vendeur ' + vk);
      if (!T.vend[vk]) T.vend[vk] = { key: vk, label: vl, fonction: r.FONCTION || '', agg: emptyAgg() };
      addAgg(T.vend[vk].agg, r);
    }
    const reseaux = Object.values(byR).sort((a, b) => (a.label || '').localeCompare(b.label || ''));
    for (const R of reseaux) {
      R.aff = Object.values(R.aff).sort((a, b) => (a.label || '').localeCompare(b.label || ''));
      for (const A of R.aff) {
        A.sites = Object.values(A.sites).sort((a, b) => (a.label || '').localeCompare(b.label || ''));
        for (const S of A.sites) {
          S.types = Object.values(S.types).sort((a, b) => (TYPE_ORDER[a.key] ?? 9) - (TYPE_ORDER[b.key] ?? 9));
          for (const T of S.types) T.vend = Object.values(T.vend).sort(byAtteinteDesc);
        }
      }
    }
    return reseaux;
  }
  function sumAgg(rows) { const a = emptyAgg(); for (const r of rows) addAgg(a, r); return a; }

  // --- STYLE ------------------------------------------------------------------
  function injectStyle() {
    const ID = 'perf-style'; const ex = doc.getElementById(ID); if (ex) ex.remove();
    const st = doc.createElement('style'); st.id = ID;
    st.textContent = `
#perf-root { --green:#53bda7; --blue-lt:#acc5e4; --orange:#fac055; --blue-dk:#2a5ea9;
  --bg:#fafbfd; --card:#fff; --border:#eaf0f9; --text:#2a5ea9; --text-mut:#7a9cc4; --text-soft:#4a6a8a; --red:#c4554a;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; font-size:13px; color:var(--text); }
#perf-root *, #perf-root *::before, #perf-root *::after { box-sizing:border-box; }
#perf-root .pf-bar { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:12px 15px; margin-bottom:16px; display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
#perf-root .pf-label { font-size:11px; color:var(--text-mut); font-weight:500; text-transform:uppercase; letter-spacing:.5px; }
#perf-root .pf-date { border:1px solid var(--blue-lt); border-radius:6px; padding:5px 10px; font-size:11px; color:var(--blue-dk); outline:none; font-family:inherit; }
#perf-root .pf-date:focus { border-color:var(--blue-dk); }
#perf-root .pf-btn { padding:6px 14px; border-radius:6px; font-size:11px; border:1px solid var(--blue-dk); background:var(--blue-dk); color:#fff; cursor:pointer; font-family:inherit; font-weight:600; }
#perf-root .pf-btn:hover { background:#1f4a87; }
#perf-root .pf-btn:disabled { opacity:.6; cursor:wait; }
#perf-root .pf-btn2 { padding:6px 12px; border-radius:6px; font-size:11px; border:1px solid var(--blue-lt); background:#fff; color:var(--blue-dk); cursor:pointer; font-family:inherit; font-weight:600; }
#perf-root .pf-btn2:hover { background:#f5f8fc; }
#perf-root .pf-btn2.on { background:var(--orange); border-color:var(--orange); color:#633806; }
#perf-root .pf-btn2:disabled { opacity:.6; cursor:wait; }
#perf-root .pf-sep { width:1px; height:20px; background:var(--border); }
#perf-root .pf-range { border:1px solid var(--blue-lt); border-radius:6px; padding:6px 12px; font-size:11px; color:var(--blue-dk); background:#fff; cursor:pointer; font-family:inherit; font-weight:600; display:inline-flex; align-items:center; gap:6px; }
#perf-root .pf-range:hover { background:#f5f8fc; border-color:var(--blue-dk); }
#perf-root .pf-range:disabled { opacity:.6; cursor:default; }
#perf-root .pf-range-car { font-size:9px; color:var(--text-mut); }
#perf-root .pf-toggle { display:flex; border:1px solid var(--blue-lt); border-radius:6px; overflow:hidden; }
#perf-root .pf-toggle button { padding:5px 12px; font-size:11px; border:none; cursor:pointer; background:#fff; color:var(--blue-dk); font-family:inherit; }
#perf-root .pf-toggle button.active { background:var(--blue-dk); color:#fff; }
#perf-root .pf-toggle button:not(:last-child) { border-right:1px solid var(--blue-lt); }
#perf-root .pf-chips { display:flex; gap:6px; flex-wrap:wrap; }
#perf-root .pf-chip { padding:4px 11px; border-radius:14px; font-size:11px; border:1px solid var(--border); background:#fff; color:var(--text-soft); cursor:pointer; font-weight:500; }
#perf-root .pf-chip.active { background:var(--blue-dk); color:#fff; border-color:var(--blue-dk); }
#perf-root .pf-resume { font-size:11px; color:var(--text-mut); font-style:italic; margin-left:auto; }
#perf-root .pf-sel-banner { display:inline-flex; align-items:center; gap:8px; background:var(--blue-dk); color:#fff; padding:6px 12px; border-radius:6px; font-size:12px; }
#perf-root .pf-sel-banner button { background:rgba(255,255,255,.18); color:#fff; border:none; padding:3px 9px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600; }
#perf-root .pf-bus-chip { font-size:10px; color:#085041; background:#e1f5ee; border:1px solid #9ad9c5; border-radius:999px; padding:1px 8px; font-weight:600; }

#perf-root .pf-card { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:15px; margin-bottom:16px; }
#perf-root .pf-shead { display:flex; align-items:center; gap:8px; margin-bottom:14px; }
#perf-root .pf-shead .bar { width:3px; height:17px; }
#perf-root .pf-shead .title { font-size:13px; font-weight:500; }
#perf-root .pf-shead .sub { margin-left:auto; font-size:10px; color:var(--blue-lt); }

#perf-root .pf-kpi-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; }
#perf-root .pf-kpi { background:#f5f8fc; border-radius:8px; padding:12px; }
#perf-root .pf-kpi-label { font-size:10px; color:var(--text-mut); margin-bottom:6px; text-transform:uppercase; letter-spacing:.4px; }
#perf-root .pf-kpi-vals { display:flex; align-items:baseline; justify-content:space-between; margin-bottom:6px; }
#perf-root .pf-kpi-ro { font-size:18px; font-weight:600; color:var(--blue-dk); font-variant-numeric:tabular-nums; }
#perf-root .pf-kpi-ro small { font-size:11px; color:var(--text-mut); font-weight:400; }
#perf-root .pf-kpi-pct { font-size:11px; font-weight:600; padding:2px 7px; border-radius:4px; }
#perf-root .pf-kpi-track { height:4px; background:#e3edf9; border-radius:3px; overflow:hidden; }
#perf-root .pf-kpi-fill { height:4px; border-radius:3px; }
@media (max-width:900px){ #perf-root .pf-kpi-grid{ grid-template-columns:repeat(2,1fr);} }

#perf-root .pf-charts { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }
#perf-root .pf-charts > * { min-width:0; }   /* sans ça, les cellules de grille ne rétrécissent pas -> le canvas déborde */
#perf-root .pf-chart-wrap { position:relative; height:200px; min-width:0; }
#perf-root .pf-chart-wrap-lg { position:relative; height:180px; min-width:0; }
#perf-root .pf-chart-wrap canvas, #perf-root .pf-chart-wrap-lg canvas { max-width:100% !important; }
@media (max-width:900px){ #perf-root .pf-charts{ grid-template-columns:1fr;} }

#perf-root .pf-tree-wrap { width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch; }
#perf-root .pf-tree { width:100%; border-collapse:collapse; }
#perf-root .pf-tree th { font-size:10px; font-weight:600; color:var(--text-mut); text-transform:uppercase; letter-spacing:.4px; padding:8px 10px; background:#f9fbfd; border-bottom:1px solid var(--border); text-align:center; }
#perf-root .pf-tree th:first-child { text-align:left; }
#perf-root .pf-tree td { padding:6px 8px; font-size:12px; border-bottom:.5px solid var(--border); vertical-align:middle; }
#perf-root .pf-tree td:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:300px; }
#perf-root .pf-tree tr { cursor:pointer; }
#perf-root .pf-tree tr.lv-reseau  { background:#f5f8fc; }
#perf-root .pf-tree tr.lv-affaire { background:#fafbfd; }
#perf-root .pf-tree tr.lv-site, #perf-root .pf-tree tr.lv-vendeur { background:#fff; }
#perf-root .pf-tree tr:hover { filter:brightness(.97); }
#perf-root .pf-tree tr.is-selected { background:var(--blue-lt) !important; }
#perf-root .pf-tree tr.is-selected td:first-child { font-weight:700; color:var(--blue-dk); }
#perf-root .pf-tree tr.is-compared { outline:2px solid var(--orange); outline-offset:-2px; }
#perf-root .pf-tree .lv-reseau  td:first-child { color:var(--blue-dk); font-weight:600; }
#perf-root .pf-tree .lv-affaire td:first-child { color:var(--blue-dk); font-weight:500; padding-left:24px; }
#perf-root .pf-tree .lv-site    td:first-child { color:var(--text-soft); font-weight:500; padding-left:44px; }
#perf-root .pf-tree .lv-vendeur td:first-child { color:var(--text-soft); padding-left:64px; }
#perf-root .pf-tree .lv-vendeur td:first-child .fct { color:var(--blue-lt); font-size:10px; font-weight:400; }
#perf-root .pf-exp { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:3px; background:#eaf0f9; font-size:9px; color:var(--text-mut); margin-right:6px; }
#perf-root .pf-cell { display:flex; flex-direction:column; gap:3px; min-width:78px; cursor:pointer; }
#perf-root .pf-cell-top { display:flex; align-items:center; justify-content:space-between; gap:6px; }
#perf-root .pf-cell-ro { font-size:11px; color:var(--blue-dk); font-weight:500; font-variant-numeric:tabular-nums; }
#perf-root .pf-cell-pct { font-size:9px; font-weight:600; padding:1px 5px; border-radius:3px; }
#perf-root .pf-cell-track { height:3px; background:#eaf0f9; border-radius:2px; overflow:hidden; }
#perf-root .pf-cell-fill { height:3px; border-radius:2px; }
#perf-root .pf-empty { text-align:center; padding:30px; color:var(--text-mut); font-size:12px; font-style:italic; }
#perf-root .pf-ico-btn { border:1px solid var(--border); background:#fff; border-radius:6px; padding:4px 7px; cursor:pointer; display:inline-flex; align-items:center; line-height:0; }
#perf-root .pf-ico-btn:hover { background:#f0f7f3; border-color:#9ad9c5; }
#perf-root .pf-ico-btn.is-busy { opacity:.45; cursor:wait; pointer-events:none; }
#perf-root .pf-ico-btn.is-err { outline:2px solid #e24b4a; }
#perf-root .pf-tree tr.lv-type { background:#fff; }
#perf-root .pf-tree .lv-type td:first-child { padding-left:64px; }
#perf-root .pf-type-chip { font-size:10px; font-weight:700; border-radius:4px; padding:1px 8px; letter-spacing:.4px; }
#perf-root .pf-type-VN   { background:#e6f1fb; color:#0c447c; }
#perf-root .pf-type-VO   { background:#faeeda; color:#633806; }
#perf-root .pf-type-VNVO { background:#e1f5ee; color:#085041; }
#perf-root .pf-tree .lv-vendeur.deep td:first-child { padding-left:84px; }

#perf-root .pf-cmp-chips { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:12px; }
#perf-root .pf-cmp-chip { display:inline-flex; align-items:center; gap:7px; background:#faeeda; color:#633806; border:1px solid var(--orange); border-radius:14px; padding:4px 11px; font-size:11px; font-weight:600; }
#perf-root .pf-cmp-chip b { cursor:pointer; font-weight:700; }
#perf-root .pf-cmp-grid { display:grid; grid-template-columns:110px 1fr 1fr; gap:8px 14px; align-items:center; }
#perf-root .pf-cmp-head { font-size:12px; font-weight:700; color:var(--blue-dk); text-align:center; padding-bottom:4px; border-bottom:1px solid var(--border); }
#perf-root .pf-cmp-lbl { font-size:11px; color:var(--text-mut); text-transform:uppercase; letter-spacing:.4px; }
#perf-root .pf-cmp-cell { background:#f5f8fc; border-radius:8px; padding:9px 11px; }
#perf-root .pf-cmp-cell.is-win { background:#e1f5ee; box-shadow:inset 0 0 0 1.5px #53bda7; }
#perf-root .pf-cmp-cell .pf-cmp-ro { font-size:13px; font-weight:600; color:var(--blue-dk); margin-right:8px; font-variant-numeric:tabular-nums; }
@media (max-width:900px){ #perf-root .pf-cmp-grid{ grid-template-columns:84px 1fr 1fr; } }

/* ===== RESPONSIVE (ajout v4.3) ============================================= */
@media (max-width:900px){
  #perf-root .pf-bar { gap:8px; }
  #perf-root .pf-resume { margin-left:0; flex-basis:100%; }
  #perf-root .pf-tree { min-width:560px; }
}
/* Repli .perf-narrow : déclenché par la largeur RÉELLE de #perf-root (ResizeObserver),
   indépendant de la media query (l'aperçu WeWeb peut l'évaluer en largeur desktop). */
#perf-root.perf-narrow .pf-kpi-grid { grid-template-columns:repeat(2,1fr); }
#perf-root.perf-narrow .pf-charts   { grid-template-columns:1fr; }
#perf-root.perf-narrow .pf-cmp-grid { grid-template-columns:84px 1fr 1fr; }
#perf-root.perf-narrow .pf-bar      { gap:8px; }
#perf-root.perf-narrow .pf-resume   { margin-left:0; flex-basis:100%; }
#perf-root.perf-narrow .pf-tree     { min-width:560px; }
`;
    doc.head.appendChild(st);
  }

  // --- Cellule KPI dans l'arbre (réalisé/objectif + % + barre) -----------------
  function kpiCell(realise, objectif, kpiLabel, ids) {
    const c = kpiColorPro(realise, objectif);
    const badge = pctLabel(realise, objectif);
    const fillW = fillWidth(realise, objectif);
    const clickable = Array.isArray(ids) && ids.length > 0;
    const idsAttr = clickable ? ' data-kpi-ids="' + esc(ids.join(',')) + '" data-kpi-label="' + esc(kpiLabel) + '"' : '';
    return '<div class="pf-cell"' + (clickable ? ' data-kpi-click="1"' : '') + idsAttr + '>' +
      '<div class="pf-cell-top">' +
      '<span class="pf-cell-ro">' + realise + ' / ' + objectif + '</span>' +
      '<span class="pf-cell-pct" style="background:' + c.bg + ';color:' + c.text + '">' + badge + '</span>' +
      '</div>' +
      '<div class="pf-cell-track"><div class="pf-cell-fill" style="width:' + fillW + '%;background:' + c.bar + '"></div></div>' +
      '</div>';
  }
  function kpiCellsTree(agg, label) {
    let h = '';
    for (const k of KPIS) h += '<td>' + kpiCell(agg[k.r], agg[k.o], (label ? label + ' · ' : '') + k.label, agg._ids) + '</td>';
    return h;
  }
  function expIcon(open) { return '<span class="pf-exp">' + (open ? '▼' : '▶') + '</span>'; }
  function shead(color, title, sub) { return '<div class="pf-shead"><div class="bar" style="background:' + color + '"></div><div class="title" style="color:' + color + '">' + esc(title) + '</div>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>'; }

  // --- COMPARATEUR ---------------------------------------------------------------
  function renderCompare() {
    const c = state.compare;
    let h = '<div class="pf-card">';
    h += shead('var(--orange)', 'Comparateur', c.items.length < 2 ? 'sélectionnez 2 lignes dans l\'arbre' : 'même période · mêmes filtres VN/VO et mois');
    h += '<div class="pf-cmp-chips">';
    c.items.forEach((it, i) => {
      h += '<span class="pf-cmp-chip">' + esc(it.label) + ' <b data-cmp-del="' + i + '">✕</b></span>';
    });
    if (!c.items.length) h += '<span style="color:var(--text-mut);font-size:11px;font-style:italic">Cliquez 2 lignes de l\'arbre (réseau, affaire, site ou vendeur) pour les mettre côte à côte.</span>';
    else if (c.items.length === 1) h += '<span style="color:var(--text-mut);font-size:11px;font-style:italic">… et une seconde ligne.</span>';
    h += '</div>';
    if (c.items.length === 2) {
      const aggs = c.items.map(it => sumAgg(filterByEntity(baseRows(), it.level, it.key)));
      h += '<div class="pf-cmp-grid">';
      h += '<div></div><div class="pf-cmp-head">' + esc(c.items[0].label) + '</div><div class="pf-cmp-head">' + esc(c.items[1].label) + '</div>';
      for (const k of KPIS) {
        const p = [pct(aggs[0][k.r], aggs[0][k.o]), pct(aggs[1][k.r], aggs[1][k.o])];
        const hasO = [num(aggs[0][k.o]) > 0, num(aggs[1][k.o]) > 0];
        const win = (hasO[0] && hasO[1] && p[0] !== p[1]) ? (p[0] > p[1] ? 0 : 1) : -1;
        h += '<div class="pf-cmp-lbl">' + esc(k.label) + '</div>';
        for (let i = 0; i < 2; i++) {
          const cs = kpiColorPro(aggs[i][k.r], aggs[i][k.o]);
          h += '<div class="pf-cmp-cell' + (win === i ? ' is-win' : '') + '">' +
            '<span class="pf-cmp-ro">' + aggs[i][k.r] + ' / ' + aggs[i][k.o] + '</span>' +
            '<span class="pf-cell-pct" style="background:' + cs.bg + ';color:' + cs.text + '">' + pctLabel(aggs[i][k.r], aggs[i][k.o]) + '</span>' +
            '<div class="pf-cell-track" style="margin-top:5px"><div class="pf-cell-fill" style="width:' + fillWidth(aggs[i][k.r], aggs[i][k.o]) + '%;background:' + cs.bar + '"></div></div>' +
            '</div>';
        }
      }
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  // --- EXPORT EXCEL (edge function export-xlsx-to-url) ----------------------------
  function exportRows() {
    const rows = rowsForSelection();
    const m = {};
    for (const r of rows) {
      const tk = normType(r.vn_vo);
      const k = String(vendeurId(r)) + '|' + String(r.id_site) + '|' + tk;
      if (!m[k]) m[k] = {
        reseau: r.RESEAU || '', affaire: r.AFFAIRE || '', site: r.SITE || ('Site ' + r.id_site),
        type: tk, vendeur: r.nom_complet_affichage || r.nomComplet || '', fonction: r.FONCTION || '',
        agg: emptyAgg()
      };
      addAgg(m[k].agg, r);
    }
    return Object.values(m)
      .sort((a, b) => {
        const s = a.site.localeCompare(b.site, 'fr'); if (s !== 0) return s;
        const t = (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9); if (t !== 0) return t;
        return byAtteinteDesc(a, b);
      })
      .map(x => {
        const o = { 'Réseau': x.reseau, 'Affaire': x.affaire, 'Site': x.site, 'Type': x.type, 'Vendeur': x.vendeur, 'Fonction': x.fonction };
        for (const k of KPIS) {
          o[k.label + ' réalisé'] = num(x.agg[k.r]);
          o[k.label + ' objectif'] = num(x.agg[k.o]);
          o[k.label + ' %'] = num(x.agg[k.o]) > 0 ? pct(x.agg[k.r], x.agg[k.o]) : null;
        }
        return o;
      });
  }
  async function exportExcel(btn) {
    const rows = exportRows();
    if (!rows.length) return;
    btn.disabled = true; btn.classList.add('is-busy'); btn.classList.remove('is-err');
    try {
      if (!SUPABASE_KEY) SUPABASE_KEY = getSupabaseKey();
      const jwt = getUserJwt();
      const deb = String(wwLib.wwVariable.getValue(VAR_DATE_DEB) || '').slice(0, 10);
      const fin = String(wwLib.wwVariable.getValue(VAR_DATE_FIN) || '').slice(0, 10);
      const scope = (state.selection.level === 'all' ? 'perimetre' : state.selection.label)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40);
      const res = await fetch(SUPABASE_URL + '/functions/v1/export-xslx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + (jwt || SUPABASE_KEY)
        },
        body: JSON.stringify({
          rows,
          fileName: 'performances_' + scope + '_' + deb + '_' + fin + '.xlsx',
          sheetName: 'Performances',
          expiresIn: 300
        })
      });
      const j = await res.json();
      if (!res.ok || !j.url) throw new Error(j.error || ('HTTP ' + res.status));
      const a = doc.createElement('a'); a.href = j.url; a.target = '_blank'; a.rel = 'noopener';
      doc.body.appendChild(a); a.click(); a.remove();
    } catch (e) {
      console.error('[perf] export xlsx', e);
      btn.classList.remove('is-busy'); btn.classList.add('is-err');
      btn.title = 'Erreur export — voir console';
      setTimeout(() => { btn.classList.remove('is-err'); btn.title = 'Exporter en Excel'; btn.disabled = false; }, 2500);
      return;
    }
    btn.classList.remove('is-busy'); btn.disabled = false;
  }

  // --- RENDER -----------------------------------------------------------------
  function render() {
    const root = getRoot();
    if (!root) return;
    refreshRawData();
    adoptBusSelectionPerf();
    __prorata = prorataTemps();
    injectStyle();
    let html = '';

    const curDeb = wwLib.wwVariable.getValue(VAR_DATE_DEB);
    const curFin = wwLib.wwVariable.getValue(VAR_DATE_FIN);
    html += '<div class="pf-bar">';
    html += '<span class="pf-label">Période</span>';
    html += '<button type="button" class="pf-range" id="pf-range">📅 ' + esc(periodResume(curDeb, curFin)) + ' <span class="pf-range-car">▾</span></button>';
    html += '<span class="pf-sep"></span>';
    html += '<span class="pf-label">Type</span>';
    html += '<div class="pf-toggle">';
    for (const o of [{ k: 'ALL', l: 'Tous' }, { k: 'VN', l: 'VN' }, { k: 'VO', l: 'VO' }, { k: 'VNVO', l: 'VNVO' }])
      html += '<button type="button" class="' + (state.vnvo === o.k ? 'active' : '') + '" data-vnvo="' + o.k + '">' + o.l + '</button>';
    html += '</div>';
    html += '<span class="pf-sep"></span>';
    html += '<button type="button" class="pf-ico-btn" id="pf-export" title="Exporter en Excel">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">' +
      '<rect x="2" y="2" width="20" height="20" rx="3.5" fill="#217346"/>' +
      '<path d="M8 7.2l8 9.6M16 7.2l-8 9.6" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>' +
      '</svg></button>';
    html += '<button type="button" class="pf-btn2 ' + (state.compare.active ? 'on' : '') + '" id="pf-cmp-toggle">⇄ Comparer</button>';
    html += '<span class="pf-resume">mois écoulé ' + Math.round(__prorata * 100) + '% <span title="Jours ouvrés lun-sam écoulés sur le mois de référence ; les couleurs comparent l\'atteinte à ce prorata.">ⓘ</span></span>';
    html += '</div>';

    if (!allRawData.length) {
      html += '<div class="pf-card"><div class="pf-empty">Aucune donnée pour cette période.</div></div>';
      root.innerHTML = html; bind(); return;
    }

    const mois = moisDispos();
    if (mois.length > 1) {
      html += '<div class="pf-bar" style="padding:10px 15px">';
      html += '<span class="pf-label">Mois</span><div class="pf-chips">';
      html += '<span class="pf-chip ' + (state.mois === 'ALL' ? 'active' : '') + '" data-mois="ALL">Cumul période</span>';
      for (const m of mois) {
        const lbl = new Date(m + '-01T12:00:00').toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
        html += '<span class="pf-chip ' + (state.mois === m ? 'active' : '') + '" data-mois="' + esc(m) + '">' + esc(lbl) + '</span>';
      }
      html += '</div></div>';
    } else if (state.mois !== 'ALL') {
      state.mois = 'ALL';
    }

    const selRows = rowsForSelection();
    const agg = sumAgg(selRows);
    const scopeLabel = state.selection.level === 'all' ? 'Tout le périmètre' : state.selection.label;

    if (state.selection.level !== 'all') {
      const isBusScope = state.selection.level === 'site' && String(state.selection.key) === String(state.busSite);
      html += '<div style="margin-bottom:12px"><span class="pf-sel-banner">' + esc(scopeLabel) +
        (isBusScope ? ' <span class="pf-bus-chip">📍 site global</span>' : '') +
        ' <button type="button" id="pf-clear">✕</button></span></div>';
    }

    if (state.compare.active) html += renderCompare();

    html += '<div class="pf-card">';
    html += shead('var(--blue-dk)', 'Performance — ' + scopeLabel, periodResume(curDeb, curFin) + ' · vs ' + Math.round(__prorata * 100) + '% du mois');
    html += '<div class="pf-kpi-grid">';
    for (const k of KPIS) {
      const r = agg[k.r], o = agg[k.o], c = kpiColorPro(r, o);
      const badge = pctLabel(r, o);
      const fillW = fillWidth(r, o);
      html += '<div class="pf-kpi">' +
        '<div class="pf-kpi-label">' + esc(k.label) + '</div>' +
        '<div class="pf-kpi-vals"><span class="pf-kpi-ro">' + r + ' <small>/ ' + o + '</small></span>' +
        '<span class="pf-kpi-pct" style="background:' + c.bg + ';color:' + c.text + '">' + badge + '</span></div>' +
        '<div class="pf-kpi-track"><div class="pf-kpi-fill" style="width:' + fillW + '%;background:' + c.bar + '"></div></div>' +
        '</div>';
    }
    html += '</div></div>';

    html += '<div class="pf-charts">';
    html += '<div class="pf-card" style="margin-bottom:0">' + shead('var(--blue-dk)', 'Réalisé vs Objectif') + '<div class="pf-chart-wrap"><canvas id="pf-c1"></canvas></div></div>';
    html += '<div class="pf-card" style="margin-bottom:0">' + shead('var(--green)', chart2Title()) + '<div class="pf-chart-wrap"><canvas id="pf-c2"></canvas></div></div>';
    html += '</div>';

    if (mois.length > 1) {
      html += '<div class="pf-card">';
      html += shead('var(--orange)', 'Tendance mensuelle — commandes', scopeLabel + (state.vnvo !== 'ALL' ? ' · ' + state.vnvo : ''));
      html += '<div class="pf-chart-wrap-lg"><canvas id="pf-c3"></canvas></div>';
      html += '</div>';
    }

    html += '<div class="pf-card">';
    html += shead('var(--blue-dk)', 'Périmètre',
      state.compare.active ? 'MODE COMPARAISON : cliquez 2 lignes' : 'Cliquez une ligne pour filtrer · un SITE devient le site global · un chiffre = détail');
    html += renderTree(selRows);
    html += '</div>';

    root.innerHTML = html;
    bind();
    setTimeout(drawCharts, 0);
  }

  function periodResume(deb, fin) {
    const f = (s) => { if (!s) return '?'; const d = new Date(String(s).slice(0, 10) + 'T12:00:00'); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); };
    return f(deb) + ' → ' + f(fin);
  }

  // --- SÉLECTEUR DE PLAGE : un calendrier, deux clics ---------------------------
  function closeRangePickerPf() {
    const e = doc.getElementById('pf-dp'); if (e) e.remove();
    if (window.__pfDpOutside) { doc.removeEventListener('mousedown', window.__pfDpOutside, true); window.__pfDpOutside = null; }
  }
  async function applyPeriodPf(from, to) {
    closeRangePickerPf();
    if (!from || !to) return;
    const curDeb = String(wwLib.wwVariable.getValue(VAR_DATE_DEB) || '').slice(0, 10);
    const curFin = String(wwLib.wwVariable.getValue(VAR_DATE_FIN) || '').slice(0, 10);
    if (from === curDeb && to === curFin) return;
    const btn = getRoot() && getRoot().querySelector('#pf-range');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Chargement…'; }
    wwLib.wwVariable.updateValue(VAR_DATE_DEB, from);
    wwLib.wwVariable.updateValue(VAR_DATE_FIN, to);
    try { await loadPerfData(from, to); } catch (e) { console.error('[perf] refetch', e); }
    state.selection = { level: 'all', key: null, label: 'Tout le périmètre' };
    state.busSelPending = true;
    state.mois = 'ALL';
    render();
  }
  function openRangePickerPf(anchor) {
    closeRangePickerPf();
    const pk = { month: null, start: null, end: null, hover: null };
    const cur = String(wwLib.wwVariable.getValue(VAR_DATE_DEB) || '').slice(0, 10);
    const m0 = cur ? new Date(cur + 'T12:00:00') : new Date();
    pk.month = new Date(m0.getFullYear(), m0.getMonth(), 1);

    const pop = doc.createElement('div'); pop.id = 'pf-dp';
    const r = anchor.getBoundingClientRect();
    const winW = (doc.defaultView || window).innerWidth || 360;
    const left = Math.min(Math.max(8, r.left), Math.max(8, winW - 274));   // borné à l'écran
    pop.style.cssText = 'position:fixed;z-index:9999;top:' + (r.bottom + 6) + 'px;left:' + left + 'px';
    injectDpStylePf();
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
      let h = '<div class="pf-dp-box">';
      h += '<div class="pf-dp-head"><button type="button" data-nav="-1">‹</button>' +
        '<span>' + esc(first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })) + '</span>' +
        '<button type="button" data-nav="1">›</button></div>';
      h += '<div class="pf-dp-grid">';
      for (const d of ['L', 'M', 'M', 'J', 'V', 'S', 'D']) h += '<span class="pf-dp-dow">' + d + '</span>';
      for (let i = 0; i < startIdx; i++) h += '<span></span>';
      for (let d = 1; d <= nbDays; d++) {
        const ds = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        let cls = 'pf-dp-day';
        if (ds === today) cls += ' today';
        if (pk.start === ds || pk.end === ds) cls += ' sel';
        else if (lo && hi && ds > lo && ds < hi) cls += ' inr';
        h += '<span class="' + cls + '" data-d="' + ds + '">' + d + '</span>';
      }
      h += '</div>';
      h += '<div class="pf-dp-foot">' + (pk.start ? 'Cliquez la date de fin' : 'Cliquez la date de début') + '</div>';
      h += '</div>';
      return h;
    }
    function wire() {
      pop.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();
        pk.month = new Date(pk.month.getFullYear(), pk.month.getMonth() + Number(b.getAttribute('data-nav')), 1);
        paint();
      }));
      pop.querySelectorAll('.pf-dp-day').forEach(c => {
        c.addEventListener('click', () => {
          const ds = c.getAttribute('data-d');
          if (!pk.start || pk.end) { pk.start = ds; pk.end = null; pk.hover = null; paint(); return; }
          pk.end = ds;
          let a = pk.start, b = pk.end;
          if (b < a) { const t = a; a = b; b = t; }
          applyPeriodPf(a, b);
        });
        c.addEventListener('mouseenter', () => {
          if (pk.start && !pk.end && pk.hover !== c.getAttribute('data-d')) { pk.hover = c.getAttribute('data-d'); paint(); }
        });
      });
    }
    function paint() { pop.innerHTML = calHtml(); wire(); }
    paint();
    window.__pfDpOutside = (e) => {
      if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closeRangePickerPf();
    };
    setTimeout(() => doc.addEventListener('mousedown', window.__pfDpOutside, true), 0);
  }
  function injectDpStylePf() {
    if (doc.getElementById('pf-dp-style')) return;
    const st = doc.createElement('style'); st.id = 'pf-dp-style';
    st.textContent = `
#pf-dp .pf-dp-box { background:#fff; border:1px solid #eaf0f9; border-radius:10px; box-shadow:0 8px 30px rgba(42,94,169,.18); padding:12px; width:262px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
#pf-dp .pf-dp-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
#pf-dp .pf-dp-head span { font-size:12px; font-weight:600; color:#2a5ea9; text-transform:capitalize; }
#pf-dp .pf-dp-head button { width:24px; height:24px; border:1px solid #eaf0f9; background:#fff; border-radius:6px; cursor:pointer; color:#2a5ea9; font-size:13px; line-height:1; padding:0; }
#pf-dp .pf-dp-head button:hover { background:#f5f8fc; }
#pf-dp .pf-dp-grid { display:grid; grid-template-columns:repeat(7,33px); gap:2px; }
#pf-dp .pf-dp-dow { font-size:9px; color:#acc5e4; text-align:center; font-weight:700; padding-bottom:3px; }
#pf-dp .pf-dp-day { height:29px; line-height:29px; text-align:center; font-size:11px; color:#2c2c2a; border-radius:6px; cursor:pointer; }
#pf-dp .pf-dp-day:hover { background:#eaf0f9; }
#pf-dp .pf-dp-day.today { box-shadow:inset 0 0 0 1px #acc5e4; }
#pf-dp .pf-dp-day.sel { background:#2a5ea9; color:#fff; font-weight:700; }
#pf-dp .pf-dp-day.inr { background:#e6f1fb; }
#pf-dp .pf-dp-foot { margin-top:8px; text-align:center; font-size:10px; color:#7a9cc4; font-style:italic; }
`;
    doc.head.appendChild(st);
  }

  function renderTree(rows) {
    const tree = buildTree(rows);
    if (!tree.length) return '<div class="pf-empty">Aucune donnée pour ce filtre.</div>';
    const sel = state.selection;
    const isSel = (lvl, key) => sel.level === lvl && String(sel.key) === String(key);
    const isCmp = (lvl, key) => state.compare.active && state.compare.items.some(x => x.level === lvl && String(x.key) === String(key));
    const cls = (lvl, key) => (isSel(lvl, key) ? ' is-selected' : '') + (isCmp(lvl, key) ? ' is-compared' : '');
    const collapseR = tree.length === 1;
    let body = '';
    for (const R of tree) {
      const rKey = 'r:' + R.key, rOpen = !!state.expanded[rKey] || collapseR;
      if (!collapseR)
        body += '<tr class="lv-reseau' + cls('reseau', R.key) + '" data-exp="' + esc(rKey) + '" data-lvl="reseau" data-key="' + esc(R.key) + '" data-label="' + esc(R.label) + '"><td>' + expIcon(rOpen) + esc(R.label) + '</td>' + kpiCellsTree(R.agg, R.label) + '</tr>';
      if (!rOpen) continue;
      const collapseA = collapseR && R.aff.length === 1;
      for (const A of R.aff) {
        const aKey = rKey + '|a:' + A.key, aOpen = !!state.expanded[aKey] || collapseA;
        if (!collapseA)
          body += '<tr class="lv-affaire' + cls('affaire', A.key) + '" data-exp="' + esc(aKey) + '" data-lvl="affaire" data-key="' + esc(A.key) + '" data-label="' + esc(A.label) + '"><td>' + expIcon(aOpen) + esc(A.label) + '</td>' + kpiCellsTree(A.agg, A.label) + '</tr>';
        if (!aOpen) continue;
        for (const S of A.sites) {
          const sKey = aKey + '|s:' + S.key, sOpen = !!state.expanded[sKey];
          body += '<tr class="lv-site' + cls('site', S.key) + '" data-exp="' + esc(sKey) + '" data-lvl="site" data-key="' + esc(S.key) + '" data-label="' + esc(S.label) + '"><td>' + expIcon(sOpen) + esc(S.label) + '</td>' + kpiCellsTree(S.agg, S.label) + '</tr>';
          if (!sOpen) continue;
          const collapseT = S.types.length === 1;
          for (const T of S.types) {
            const tKey = sKey + '|t:' + T.key, tOpen = !!state.expanded[tKey] || collapseT;
            const tSelKey = S.key + '~~' + T.key;
            if (!collapseT)
              body += '<tr class="lv-type' + cls('vntype', tSelKey) + '" data-exp="' + esc(tKey) + '" data-lvl="vntype" data-key="' + esc(tSelKey) + '" data-label="' + esc(T.label + ' — ' + S.label) + '"><td>' + expIcon(tOpen) + '<span class="pf-type-chip pf-type-' + esc(T.key) + '">' + esc(T.label) + '</span></td>' + kpiCellsTree(T.agg, S.label + ' ' + T.label) + '</tr>';
            if (!tOpen) continue;
            for (const V of T.vend) {
              body += '<tr class="lv-vendeur' + (collapseT ? '' : ' deep') + cls('vendeur', V.key) + '" data-lvl="vendeur" data-key="' + esc(V.key) + '" data-label="' + esc(V.label) + '"><td>' + esc(V.label) + (V.fonction ? ' <span class="fct">· ' + esc(V.fonction) + '</span>' : '') + '</td>' + kpiCellsTree(V.agg, V.label) + '</tr>';
            }
          }
        }
      }
    }
    let h = '<div class="pf-tree-wrap"><table class="pf-tree"><thead><tr><th>Périmètre</th>';
    for (const k of KPIS) h += '<th>' + esc(k.label) + '</th>';
    h += '</tr></thead><tbody>' + body + '</tbody></table></div>';
    return h;
  }

  // --- GRAPHES ----------------------------------------------------------------
  function effectiveChildDim(rows) {
    const lvl = state.selection.level;
    const uniq = (fn) => { const s = new Set(); for (const r of rows) { const v = fn(r); if (v != null && v !== '') s.add(v); } return s; };

    if (lvl === 'vendeur') return { dim: 'kpi' };

    let chain = [];
    if (lvl === 'all') chain = ['reseau', 'affaire', 'site', 'vendeur'];
    else if (lvl === 'reseau') chain = ['affaire', 'site', 'vendeur'];
    else if (lvl === 'affaire') chain = ['site', 'vendeur'];
    else /* site ou vntype */ chain = ['vendeur'];

    const dimDef = {
      reseau: { keyFn: r => r.RESEAU || 'Sans réseau', labelFn: r => r.RESEAU || 'Sans réseau', title: 'réseau' },
      affaire: { keyFn: r => r.AFFAIRE || 'Sans affaire', labelFn: r => r.AFFAIRE || 'Sans affaire', title: 'affaire' },
      site: { keyFn: r => String(r.id_site), labelFn: r => r.SITE || ('Site ' + r.id_site), title: 'site' },
      vendeur: { keyFn: r => String(vendeurId(r)), labelFn: r => r.nom_complet_affichage || r.nomComplet, title: 'vendeur' }
    };

    for (let i = 0; i < chain.length; i++) {
      const d = dimDef[chain[i]];
      const count = uniq(d.keyFn).size;
      if (count > 1 || i === chain.length - 1) return { dim: chain[i], ...d };
    }
    return { dim: chain[chain.length - 1], ...dimDef[chain[chain.length - 1]] };
  }

  function chart2Title() {
    const rows = rowsForSelection();
    const d = effectiveChildDim(rows);
    if (d.dim === 'kpi') return 'Atteinte par indicateur';
    return 'Atteinte commandes par ' + d.title;
  }
  function chart2Data(rows) {
    const d = effectiveChildDim(rows);
    if (d.dim === 'kpi') {
      const a = sumAgg(rows);
      return {
        labels: KPIS.map(k => k.label),
        values: KPIS.map(k => pct(a[k.r], a[k.o])),
        rea: KPIS.map(k => num(a[k.r])),
        obj: KPIS.map(k => num(a[k.o]))
      };
    }
    const m = {};
    for (const r of rows) {
      const k = d.keyFn(r); if (k == null || k === '') continue;
      if (!m[k]) m[k] = { label: d.labelFn(r), rea: 0, obj: 0 };
      m[k].rea += num(r.commandes_realisees);
      m[k].obj += num(r.objectif_commandes);
    }
    const arr = Object.values(m).map(x => ({ label: x.label, p: pct(x.rea, x.obj), rea: x.rea, obj: x.obj }))
      .sort((a, b) => b.p - a.p).slice(0, 15);
    return {
      labels: arr.map(x => x.label),
      values: arr.map(x => x.p),
      rea: arr.map(x => x.rea),
      obj: arr.map(x => x.obj)
    };
  }
  function chart3Data() {
    const rows = rowsScopeNoMois();
    const m = {};
    for (const r of rows) {
      const ym = r.periode_ym; if (!ym) continue;
      if (!m[ym]) m[ym] = { rea: 0, obj: 0 };
      m[ym].rea += num(r.commandes_realisees);
      m[ym].obj += num(r.objectif_commandes);
    }
    const months = Object.keys(m).sort();
    return {
      labels: months.map(ym => new Date(ym + '-01T12:00:00').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })),
      rea: months.map(ym => m[ym].rea),
      obj: months.map(ym => m[ym].obj)
    };
  }

  let __c1 = null, __c2 = null, __c3 = null;
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
  async function drawCharts() {
    let Chart; try { Chart = await loadChartJs(); } catch (e) { console.error('[perf] Chart.js', e); return; }
    if (!Chart) return;
    if (__c1) { try { __c1.destroy(); } catch (e) { } __c1 = null; }
    if (__c2) { try { __c2.destroy(); } catch (e) { } __c2 = null; }
    if (__c3) { try { __c3.destroy(); } catch (e) { } __c3 = null; }
    const rows = rowsForSelection();
    const agg = sumAgg(rows);

    const c1 = doc.getElementById('pf-c1');
    if (c1) {
      __c1 = new Chart(c1.getContext('2d'), {
        type: 'bar',
        data: {
          labels: KPIS.map(k => k.label), datasets: [
            { label: 'Réalisé', data: KPIS.map(k => agg[k.r]), backgroundColor: '#2a5ea9', borderRadius: 3, maxBarThickness: 28 },
            { label: 'Objectif', data: KPIS.map(k => agg[k.o]), backgroundColor: '#d4e3f5', borderRadius: 3, maxBarThickness: 28 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'top', labels: { font: { size: 10 }, color: '#4a6a8a', boxWidth: 10, usePointStyle: true } } },
          scales: {
            x: { ticks: { font: { size: 10 }, color: '#7a9cc4' }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { font: { size: 9 }, color: '#7a9cc4', precision: 0 }, grid: { color: '#eaf0f9' } }
          }
        }
      });
    }

    const c2 = doc.getElementById('pf-c2');
    if (c2) {
      const d = chart2Data(rows);
      const colors = d.values.map((v, i) => kpiColorPro(d.rea[i], d.obj[i]).bar);
      const display = d.values.map((v, i) => {
        const o = num(d.obj[i]), r = num(d.rea[i]);
        if (o > 0 && r <= 0) return 4;
        if (o <= 0 && r <= 0) return 0;
        return v;
      });
      __c2 = new Chart(c2.getContext('2d'), {
        type: 'bar',
        data: { labels: d.labels, datasets: [{ label: '% atteinte', data: display, backgroundColor: colors, borderRadius: 3, maxBarThickness: 20 }] },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false }, tooltip: {
              callbacks: {
                label: i => { const j = i.dataIndex; return d.rea[j] + ' / ' + d.obj[j] + ' · ' + d.values[j] + '%'; }
              }
            }
          },
          scales: {
            x: { beginAtZero: true, suggestedMax: 100, ticks: { font: { size: 9 }, color: '#7a9cc4', callback: v => v + '%' }, grid: { color: '#eaf0f9' } },
            y: { ticks: { font: { size: 10 }, color: '#4a6a8a' }, grid: { display: false } }
          }
        }
      });
    }

    const c3 = doc.getElementById('pf-c3');
    if (c3) {
      const d = chart3Data();
      __c3 = new Chart(c3.getContext('2d'), {
        data: {
          labels: d.labels, datasets: [
            { type: 'bar', label: 'Réalisé', data: d.rea, backgroundColor: '#53bda7', borderRadius: 3, maxBarThickness: 34 },
            {
              type: 'line', label: 'Objectif', data: d.obj, borderColor: '#fac055', backgroundColor: '#fac055',
              borderWidth: 2, borderDash: [6, 4], pointRadius: 3, pointBackgroundColor: '#fac055', tension: 0.2
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'top', labels: { font: { size: 10 }, color: '#4a6a8a', boxWidth: 10, usePointStyle: true } } },
          scales: {
            x: { ticks: { font: { size: 10 }, color: '#7a9cc4' }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { font: { size: 9 }, color: '#7a9cc4', precision: 0 }, grid: { color: '#eaf0f9' } }
          }
        }
      });
    }
  }

  // --- POPUP DÉTAIL (avec synthèse panier moyen + taux d'équipement) -------------
  function closePopup() { const e = doc.getElementById('perf-popup-overlay'); if (e) e.remove(); }
  function canDownloadPdf(pdfDoc) {
    if (!pdfDoc) return false;
    if (viewerIdUser && String(pdfDoc.id_user_creation) === String(viewerIdUser)) return true;
    return perimSites.indexOf(Number(pdfDoc.id_site)) !== -1;
  }
  async function downloadPdf(storagePath, idPropaleBdc, pdfIcon) {
    const userJwt = await getUserJwt(); if (!userJwt) { console.error('Pas de JWT'); return; }
    pdfIcon.style.opacity = '0.4'; pdfIcon.style.pointerEvents = 'none';
    try {
      const res = await fetch(SUPABASE_URL + '/storage/v1/object/sign/commercial-documents/' + storagePath,
        { method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + userJwt, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 60 }) });
      if (!res.ok) { console.error('Erreur signed URL'); return; }
      const data = await res.json(); if (!data.signedURL) { console.error('Pas de signedURL'); return; }
      const a = doc.createElement('a'); a.href = SUPABASE_URL + '/storage/v1' + data.signedURL; a.download = 'bdc_' + idPropaleBdc + '.pdf'; a.target = '_blank'; a.click();
    } catch (e) { console.error('Erreur PDF', e); }
    finally { pdfIcon.style.opacity = '1'; pdfIcon.style.pointerEvents = 'auto'; }
  }
  function normVnVo(v) {
    if (v == null) return '';
    const s = String(v).trim().toUpperCase();
    if (s === 'VN' || s === 'NEUF' || s === 'N') return 'VN';
    if (s === 'VO' || s === 'OCCASION' || s === 'O') return 'VO';
    return s;
  }
  async function openPopup(ids, titleLabel) {
    closePopup();
    if (!ids || !ids.length) return;
    if (!SUPABASE_KEY) SUPABASE_KEY = getSupabaseKey();
    const idsStr = [...new Set(ids)].join(',');
    let propales = []; const stockMap = {}, clientMap = {}, pdfMap = {};
    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/PROPALE_BDC?id_propale_bdc=in.(' + idsStr + ')&select=id_propale_bdc,id_client_vu,VIN,"TotalProp","DateLivraison","TypeFinancement","Contrat_Service","GravageSimple","GravageFranchiseAccident","Waxoyl","VN_VO","LABEL","id_site","id_user_creation"',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
      propales = await res.json();
    } catch (e) { console.error(e); }
    if (state.vnvo !== 'ALL') {
      propales = propales.filter(p => normVnVo(p.VN_VO) === state.vnvo);
    }
    const vins = [...new Set(propales.map(p => p.VIN).filter(Boolean))];
    if (vins.length) {
      try {
        const r2 = await fetch(SUPABASE_URL + '/rest/v1/STOCKVO?VIN=in.(' + vins.join(',') + ')&select=VIN,"MARQUE_DMS","MODELE_DMS","DESIGNATION_DMS","NO_IMMAT"', { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
        for (const s of await r2.json()) stockMap[s.VIN] = s;
      } catch (e) { console.error(e); }
    }
    const clientIds = [...new Set(propales.map(p => p.id_client_vu).filter(Boolean))].join(',');
    if (clientIds) {
      try {
        const r3 = await fetch(SUPABASE_URL + '/rest/v1/CLIENT?IDVu=in.(' + clientIds + ')&select=*', { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
        for (const c of await r3.json()) clientMap[c.IDVu] = c;
      } catch (e) { console.error(e); }
    }
    try {
      const r4 = await fetch(SUPABASE_URL + '/rest/v1/generated_documents?id_propale_bdc=in.(' + idsStr + ')&type=eq.bon_de_commande&status=eq.ready&order=created_at.desc&select=id,id_propale_bdc,storage_path,id_site,id_user_creation,created_at', { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
      for (const d of await r4.json()) { const k = String(d.id_propale_bdc); if (!pdfMap[k]) pdfMap[k] = d; }
    } catch (e) { console.error(e); }

    const overlay = doc.createElement('div'); overlay.id = 'perf-popup-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(42,94,169,0.18);z-index:9999;display:flex;align-items:center;justify-content:center;padding:14px';
    overlay.addEventListener('click', e => { if (e.target === overlay) closePopup(); });
    const modal = doc.createElement('div'); modal.style.cssText = 'background:#fff;border-radius:12px;box-shadow:0 8px 40px rgba(42,94,169,0.18);width:90%;max-width:950px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden';
    const header = doc.createElement('div'); header.style.cssText = 'background:#2a5ea9;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0';
    header.appendChild(el('div', 'color:#fff;font-size:13px;font-weight:500', titleLabel));
    const btnClose = doc.createElement('button'); btnClose.style.cssText = 'width:26px;height:26px;border-radius:50%;border:none;background:rgba(255,255,255,0.2);color:#fff;font-size:18px;cursor:pointer;line-height:1;padding:0'; btnClose.textContent = '×'; btnClose.addEventListener('click', closePopup);
    header.appendChild(btnClose); modal.appendChild(header);
    const bodyDiv = doc.createElement('div'); bodyDiv.style.cssText = 'overflow:auto;flex:1;padding:16px';

    const nb = propales.length;
    const total = propales.reduce((s, p) => s + (p.TotalProp ? parseFloat(p.TotalProp) : 0), 0);
    const nFin = propales.filter(p => p.TypeFinancement && p.TypeFinancement.trim()).length;
    const nCS = propales.filter(p => p.Contrat_Service && p.Contrat_Service.trim() && p.Contrat_Service.toLowerCase() !== 'aucun').length;
    const nGr = propales.filter(p => p.GravageSimple || p.GravageFranchiseAccident).length;
    const nWx = propales.filter(p => p.Waxoyl).length;
    const pe = (n) => nb > 0 ? Math.round(n / nb * 100) : 0;
    const peCol = (p) => p >= 60 ? '#085041' : p >= 30 ? '#633806' : '#791f1f';
    const synth = doc.createElement('div');
    synth.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px';
    const tag = (label, value, color) => '<span style="background:#f5f8fc;border:1px solid #eaf0f9;border-radius:8px;padding:6px 12px;font-size:11px;color:#4a6a8a;font-family:-apple-system,BlinkMacSystemFont,sans-serif">' + label + ' <b style="color:' + (color || '#2a5ea9') + ';font-size:12px">' + value + '</b></span>';
    synth.innerHTML =
      tag('Commandes', nb) +
      tag('Panier moyen', (nb > 0 ? Math.round(total / nb).toLocaleString('fr-FR') : 0) + ' €') +
      tag('Financement', pe(nFin) + '%', peCol(pe(nFin))) +
      tag('CS', pe(nCS) + '%', peCol(pe(nCS))) +
      tag('Gravage', pe(nGr) + '%', peCol(pe(nGr))) +
      tag('Waxoyl', pe(nWx) + '%', peCol(pe(nWx)));
    bodyDiv.appendChild(synth);

    const table = doc.createElement('table'); table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;min-width:760px';
    const cg = doc.createElement('colgroup');['140px', '150px', '90px', '80px', '100px', '55px', '60px', '60px', '40px'].forEach(w => { const c = doc.createElement('col'); c.style.width = w; cg.appendChild(c); }); table.appendChild(cg);
    const thead = doc.createElement('thead'); const hr = doc.createElement('tr'); hr.style.cssText = 'background:#2a5ea9';
    ['Client', 'Véhicule', 'Montant TTC', 'Date', 'Financement', 'CS', 'Gravage', 'Waxoyl', ''].forEach((h, i, arr) => { const th = doc.createElement('th'); th.style.cssText = 'color:#fff;font-weight:400;padding:7px 10px;text-align:left;font-size:10px'; if (i === 0) th.style.borderRadius = '5px 0 0 5px'; if (i === arr.length - 1) th.style.borderRadius = '0 5px 5px 0'; th.textContent = h; hr.appendChild(th); }); thead.appendChild(hr); table.appendChild(thead);
    const tbody = doc.createElement('tbody'); let totalMontant = 0;
    for (const p of propales) {
      const c = clientMap[p.id_client_vu] || {}, s = stockMap[p.VIN] || {}, pdfDoc = pdfMap[String(p.id_propale_bdc)]; const hasPdf = canDownloadPdf(pdfDoc);
      const tr = doc.createElement('tr'); tr.style.cssText = 'border-bottom:0.5px solid #eaf0f9'; tr.onmouseenter = () => tr.style.background = '#f5f8fc'; tr.onmouseleave = () => tr.style.background = '';
      const nomClient = ((c.NOM || '') + ' ' + (c.PRENOM || '')).trim() || '—';
      const vehicule = s.DESIGNATION_DMS || ((s.MARQUE_DMS || '') + ' ' + (s.MODELE_DMS || '')).trim() || p.LABEL || '—';
      const montant = p.TotalProp ? parseFloat(p.TotalProp) : 0; totalMontant += montant;
      const tdC = doc.createElement('td'); tdC.style.cssText = 'padding:8px 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      const link = el('span', 'color:#2a5ea9;font-weight:500;cursor:pointer;text-decoration:underline;font-size:12px', nomClient);
      link.addEventListener('click', () => { closePopup(); wwLib.wwVariable.updateValue(VAR_CLIENT, c); wwLib.goTo({ name: 'Fiche Client' }); });
      tdC.appendChild(link); tr.appendChild(tdC);
      const tdV = doc.createElement('td'); tdV.style.cssText = 'padding:8px 10px';
      tdV.appendChild(el('div', 'color:#4a6a8a;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', vehicule));
      tdV.appendChild(el('div', 'color:#acc5e4;font-size:10px;margin-top:1px', s.NO_IMMAT || '—')); tr.appendChild(tdV);
      const cells = [
        { v: montant ? montant.toLocaleString('fr-FR', { minimumFractionDigits: 0 }) + ' €' : '—', css: 'color:#2a5ea9;font-weight:500;text-align:right' },
        { v: p.DateLivraison ? new Date(p.DateLivraison).toLocaleDateString('fr-FR') : '—', css: 'color:#7a9cc4' },
        { v: (p.TypeFinancement && p.TypeFinancement.trim()) ? p.TypeFinancement : '—', css: 'color:#4a6a8a;font-size:11px' },
        { v: (p.Contrat_Service && p.Contrat_Service.trim() && p.Contrat_Service.toLowerCase() !== 'aucun') ? '✓' : '—', css: 'text-align:center' },
        { v: (p.GravageSimple || p.GravageFranchiseAccident) ? '✓' : '—', css: 'text-align:center' },
        { v: p.Waxoyl ? '✓' : '—', css: 'text-align:center' }
      ];
      for (const cell of cells) { const td = doc.createElement('td'); td.style.cssText = 'padding:8px 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' + cell.css + (cell.v === '✓' ? ';color:#53bda7;font-weight:500' : (cell.v === '—' ? ';color:#acc5e4' : '')); td.textContent = cell.v; tr.appendChild(td); }
      const tdP = doc.createElement('td'); tdP.style.cssText = 'padding:8px 10px;text-align:center';
      if (hasPdf) {
        const ic = doc.createElement('span'); ic.style.cssText = 'cursor:pointer;color:#a32d2d;display:inline-flex'; ic.title = 'Télécharger le BDC';
        ic.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';
        ic.addEventListener('click', e => { e.stopPropagation(); downloadPdf(pdfDoc.storage_path, p.id_propale_bdc, ic); }); tdP.appendChild(ic);
      } else tdP.appendChild(el('span', 'color:#d4e3f5', '—'));
      tr.appendChild(tdP); tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    const tfoot = doc.createElement('tfoot'); const totr = doc.createElement('tr'); totr.style.cssText = 'background:#f5f8fc;border-top:1px solid #eaf0f9';
    const tl = doc.createElement('td'); tl.setAttribute('colspan', '2'); tl.style.cssText = 'padding:8px 10px;color:#2a5ea9;font-weight:500'; tl.textContent = propales.length + ' commande' + (propales.length > 1 ? 's' : ''); totr.appendChild(tl);
    const tm = doc.createElement('td'); tm.style.cssText = 'padding:8px 10px;color:#2a5ea9;font-weight:500;text-align:right'; tm.textContent = totalMontant.toLocaleString('fr-FR', { minimumFractionDigits: 0 }) + ' €'; totr.appendChild(tm);
    const te = doc.createElement('td'); te.setAttribute('colspan', '6'); totr.appendChild(te); tfoot.appendChild(totr); table.appendChild(tfoot);
    bodyDiv.appendChild(table); modal.appendChild(bodyDiv); overlay.appendChild(modal); doc.body.appendChild(overlay);
  }

  // --- BINDINGS ---------------------------------------------------------------
  function bind() {
    const root = getRoot();
    if (!root) return;
    const rangeBtn = root.querySelector('#pf-range');
    if (rangeBtn) rangeBtn.addEventListener('click', () => openRangePickerPf(rangeBtn));
    root.querySelectorAll('[data-vnvo]').forEach(b => b.addEventListener('click', () => { state.vnvo = b.getAttribute('data-vnvo'); render(); }));
    root.querySelectorAll('[data-mois]').forEach(b => b.addEventListener('click', () => { state.mois = b.getAttribute('data-mois'); render(); }));
    const clear = root.querySelector('#pf-clear');
    if (clear) clear.addEventListener('click', () => { state.selection = { level: 'all', key: null, label: 'Tout le périmètre' }; render(); });

    const exp = root.querySelector('#pf-export');
    if (exp) exp.addEventListener('click', () => exportExcel(exp));
    const cmpT = root.querySelector('#pf-cmp-toggle');
    if (cmpT) cmpT.addEventListener('click', () => {
      state.compare.active = !state.compare.active;
      if (!state.compare.active) state.compare.items = [];
      render();
    });
    root.querySelectorAll('[data-cmp-del]').forEach(b => b.addEventListener('click', () => {
      state.compare.items.splice(Number(b.getAttribute('data-cmp-del')), 1);
      render();
    }));

    root.querySelectorAll('.pf-tree tr[data-lvl]').forEach(tr => {
      tr.addEventListener('click', (e) => {
        const cell = e.target.closest('[data-kpi-click]');
        if (cell) {
          e.stopPropagation();
          const idsAttr = cell.getAttribute('data-kpi-ids');
          const label = cell.getAttribute('data-kpi-label') || 'Détail';
          if (idsAttr) {
            const ids = idsAttr.split(',').map(x => x.trim()).filter(Boolean);
            openPopup(ids, label + (state.vnvo !== 'ALL' ? ' · ' + state.vnvo : ''));
          }
          return;
        }
        const expKey = tr.getAttribute('data-exp');
        const onIcon = e.target.closest('.pf-exp');
        if (onIcon && expKey) { e.stopPropagation(); state.expanded[expKey] = !state.expanded[expKey]; render(); return; }
        const lvl = tr.getAttribute('data-lvl'), key = tr.getAttribute('data-key'), label = tr.getAttribute('data-label');
        if (state.compare.active) {
          const items = state.compare.items;
          const idx = items.findIndex(x => x.level === lvl && String(x.key) === String(key));
          if (idx >= 0) items.splice(idx, 1);
          else if (items.length < 2) items.push({ level: lvl, key, label });
          else items[1] = { level: lvl, key, label };
          render();
          return;
        }
        if (state.selection.level === lvl && String(state.selection.key) === String(key)) {
          state.selection = { level: 'all', key: null, label: 'Tout le périmètre' };
        } else {
          state.selection = { level: lvl, key, label };
          if (expKey) state.expanded[expKey] = true;
          if (lvl === 'site') {
            try { const b = siteBus(); if (b) b.setSiteId(Number(key)); } catch (x) { }
          }
        }
        render();
      });
    });
  }

  // --- GO ---------------------------------------------------------------------
  window.__renderPerf = render;

  function ymd(d) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), j = String(d.getDate()).padStart(2, '0'); return y + '-' + m + '-' + j; }

  async function bootstrap() {
    let deb = wwLib.wwVariable.getValue(VAR_DATE_DEB);
    let fin = wwLib.wwVariable.getValue(VAR_DATE_FIN);
    const debEmpty = !deb || String(deb).trim() === '';
    const finEmpty = !fin || String(fin).trim() === '';

    if (debEmpty || finEmpty) {
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      if (debEmpty) { deb = ymd(firstOfMonth); wwLib.wwVariable.updateValue(VAR_DATE_DEB, deb); }
      if (finEmpty) { fin = ymd(now); wwLib.wwVariable.updateValue(VAR_DATE_FIN, fin); }
    }
    try { await loadPerimeter(); await loadPerfData(deb, fin); } catch (e) { console.error('[perf] chargement init', e); }
    render();
    setTimeout(drawCharts, 0);
  }

  bootstrap();

  // ensureRenderedPerf retiré : le loader possède le cycle de vie et re-monte
  // le module à chaque navigation SPA.

  (function bindPerfNarrow() {
    const W = doc.defaultView || window;
    function apply() {
      const root = getRoot();
      if (!root) return;
      let w = 0;
      try { w = root.getBoundingClientRect().width || root.clientWidth || 0; } catch (e) { }
      if (!w) return;
      if (w <= 900) root.classList.add('perf-narrow');
      else root.classList.remove('perf-narrow');
    }
    apply();
    [120, 400, 900, 1800, 3200].forEach(function (d) { setTimeout(apply, d); });
    try {
      const root = getRoot();
      if (root && 'ResizeObserver' in W) {
        if (window.__perfRO) { try { window.__perfRO.disconnect(); } catch (e) { } }
        window.__perfRO = new W.ResizeObserver(apply);
        window.__perfRO.observe(root);
      } else {
        if (window.__perfResize) W.removeEventListener('resize', window.__perfResize);
        window.__perfResize = apply;
        W.addEventListener('resize', window.__perfResize);
      }
    } catch (e) { }
  })();

}
});
