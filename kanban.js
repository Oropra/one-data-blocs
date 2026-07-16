// ============================================================================
//  GESTION DES VENTES — KANBAN — module One Data (OD.define)  v1
//  Rendu dans __anchor ; SUPABASE_URL -> ctx.tenant (6 edge functions photos) ;
//  client via ctx.supabase ; attente d'ancre + filets de re-render retirés
//  (le loader possède le cycle de vie). User via socle (cas tableau géré).
//  Contient : kanban, overlay fiche VO, sélecteur client VO (IIFE imbriquées).
// ============================================================================
// ============================================================================
//  PAGE GESTION DES VENTES — KANBAN — CRM360  (v2 : nav prod + fiche VO)
// ============================================================================
OD.define('kanban', {
  async mount(__anchor, ctx) {
  __anchor.id = 'kanban-root';

  const doc = __anchor.ownerDocument || document;
  try { const old = doc.getElementById('kanban-responsive-css'); if (old) old.remove(); } catch (e) { }
  function getRoot() { return __anchor; }

  function viewerData() { try { let d = wwLib.getFrontWindow().oropraUser; if (Array.isArray(d)) d = d[0]; return d || {}; } catch (e) { return {}; } }
  function getViewerId() { const v = viewerData().ID_User; return v != null ? Number(v) : null; }
  function getViewerRole() { const v = viewerData().ID_Role; return v != null ? Number(v) : null; }
  function getViewerName() { return viewerData().nomComplet || ''; }
  function isManager() { const r = getViewerRole(); return r != null && r !== 4; }
  function perimMode() { const r = getViewerRole(); if (r === 4 || r == null) return 'self'; if (r === 3) return 'chef'; return 'cascade'; }
  function fmtPeriodKan() { const f = (s) => { const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); }; return f(state.period.from) + ' \u2192 ' + f(state.period.to); }
  function vnvoNorm(t) { return (t || '').toUpperCase().replace(/[^A-Z]/g, ''); }
  function vnvoRank(t) { const n = vnvoNorm(t); if (n === 'VN') return 0; if (n === 'VO') return 1; if (n === 'VNVO') return 2; return 3; }
  function vnvoLabel(t) { const n = vnvoNorm(t); if (n === 'VN') return 'VN'; if (n === 'VO') return 'VO'; if (n === 'VNVO') return 'VN/VO'; return 'Autres'; }
  function siteBus() { try { const w = wwLib.getFrontWindow(); if (w && w.oropraSite) return w.oropraSite; } catch (e) { } return window.oropraSite || null; }

  // ── Navigation : éditeur vs prod ──────────────────────────────────────────
  const VAR_ID_PROPALE = 'aac565e9-ad32-4f81-bf8d-adb611322e62';
  // L'ancienne variable d'onglet (composant Tabs natif) et la variable "client
  // sélectionné" n'existent plus dans le projet : fiche-shell rend ses propres
  // onglets et lit un global / sessionStorage.

  const VAR_VIN_FICHE = 'bcb187ac-e66e-4bfb-bc48-1b7b7dfda0ba';
  const PAGE_PROPALE_UPDATE = 'efb6187d-2330-4392-86ed-bc5ad2489fed';
  const PAGE_FICHE_ID = '259f1951-a2d4-4b90-ac83-0b3febe1d4ec';
  const WF_GET_FICHE = '53250f54-d14c-4622-baf4-0b89064316b6';
  const TAB_PCOM = 5;
  const PDF_EDGE_FN = 'generate-document';
  const TPL_PROPOSITION = 'a8a39792-b795-4a07-92a2-8bd307ec105b';
  const TPL_BON_COMMANDE = 'a440bca0-e10a-4549-a11b-f4ad512b010d';
  const PDF_BUCKET = 'commercial-documents';

  const PATH_FICHE_CLIENT = '/fr/fiche-client';
  const PATH_PROPALE_UPDATE = '/fr/propo-vo-update';
  const PATH_LISTE_VO = '/fr/vo-liste';
  const PAGE_LISTE_VO = '188b0f0b-5e80-4a77-a856-26469b08b614';

  function inEditor() { try { return window.self !== window.top; } catch (e) { return true; } }
  function kanGoTo(pageId, path) {
    if (inEditor()) {
      try { if (pageId) { wwLib.wwApp.goTo(pageId); return; } } catch (e) { }
    }
    try { if (path) { wwLib.goTo(path); return; } } catch (e) { }
    try { if (pageId) { wwLib.wwApp.goTo(pageId); } } catch (e) { }
  }

  // ── Transitions ─────────────────────────────────────────────────────────
  const TRANSITIONS = {
    draft: { propale: 'V', bdc: 'V' },
    propale: { draft: 'V', bdc: 'V' },
    bdc: { draft: 'V', propale: 'V', win: 'M', lose: 'M' },
    win: { bdc: 'M', lose: 'M' },
    lose: { bdc: 'M' }
  };
  function transitionLevel(from, to) { return (TRANSITIONS[from] && TRANSITIONS[from][to]) || null; }
  function canMove(from, to) { const lvl = transitionLevel(from, to); if (!lvl) return false; if (lvl === 'M' && !isManager()) return false; return true; }
  function canArchive(status) { return status === 'draft' || status === 'propale'; }

  const COLS = [
    { key: 'draft', label: 'Brouillon' },
    { key: 'propale', label: 'Propale' },
    { key: 'bdc', label: 'BDC' },
    { key: 'win', label: 'Gagné' },
    { key: 'lose', label: 'Perdu' }
  ];
  const COL_KEYS = COLS.map(c => c.key);

  function esc(s) { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function eur(n) { if (n == null || n === '') return '—'; return new Intl.NumberFormat('fr-FR').format(Math.round(Number(n))) + ' €'; }
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function ageJours(iso) { if (!iso) return null; const d = new Date(String(iso).replace(' ', 'T')); if (isNaN(d)) return null; return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000)); }
  function ageBadge(j) { if (j == null) return ''; const cls = j <= 7 ? 'ok' : (j <= 21 ? 'warn' : 'late'); return '<span class="k-age ' + cls + '">' + j + ' j</span>'; }

  const state = window.__kanban || {};
  if (state.period === undefined) { const now = new Date(), first = new Date(now.getFullYear(), now.getMonth(), 1); state.period = { from: ymd(first), to: ymd(now) }; }
  if (state.vendeurId === undefined) state.vendeurId = null;
  if (state.busSite === undefined) state.busSite = null;
  if (state.cards === undefined) state.cards = null;
  if (state.loading === undefined) state.loading = false;
  if (state.error === undefined) state.error = null;
  state.fClient = state.fClient || 'tous';
  state.fType = state.fType || 'tous';
  state.fFin = state.fFin || 'tous';
  state.menuFor = null;
  state.openVersions = null;
  state.selOpen = false;
  if (state.vendeurSearch === undefined) state.vendeurSearch = '';
  if (state.vendeurs === undefined) state.vendeurs = null;
  if (state.versionsData === undefined) state.versionsData = {};
  window.__kanban = state;
  window.__kanVer = 11;

  async function loadData() {
    window.__kanLoadData = loadData;
    const _pm = perimMode();
    if (_pm === 'self') {
      if (state.vendeurId == null) state.vendeurId = getViewerId();
      if (state.vendeurId == null) { state.error = 'Utilisateur non identifié'; render(); return; }
    } else if (_pm === 'cascade') {
      if (state.vendeurId == null) { state.cards = []; state.loading = false; state.error = null; render(); return; }
    } else {
      if (state.busSite == null || state.vendeurId == null) { state.cards = []; state.loading = false; state.error = null; render(); return; }
    }
    if (state.loading) return;
    state.loading = true; state.error = null; render();
    try {
      const supabase = ctx.supabase;
      const r = await supabase.rpc('get_kanban_cards', { p_id_user: state.vendeurId, p_date_from: state.period.from, p_date_to: state.period.to });
      if (r.error) throw r.error;
      state.cards = normalizeCards(r.data || []);
    } catch (e) {
      console.warn('[kanban] get_kanban_cards indisponible, fallback mock', e);
      state.cards = MOCK_CARDS();
      state.error = null;
    } finally {
      state.loading = false; render();
    }
  }

  function normalizeCards(rows) {
    return rows.map(c => ({
      id_propale_bdc: Number(c.id_propale_bdc),
      status: c.status,
      id_client: c.id_client != null ? Number(c.id_client) : null,
      client: c.client || '',
      client_type: (c.client_type || '').toLowerCase(),
      vehicule: c.vehicule || '',
      vin: c.vin || '',
      vn_vo: (c.vn_vo || '').toUpperCase(),
      montant: c.montant != null ? Number(c.montant) : null,
      financement: (c.financement || '').toLowerCase(),
      maj: c.maj || c.updated_at || null,
      rpv_cde: c.rpv_cde != null ? Number(c.rpv_cde) : null,
      nb_versions: c.nb_versions != null ? Number(c.nb_versions) : 1,
      _moving: false
    }));
  }

  async function loadVendeurs() {
    if (state.vendeurs !== null) return;
    if (state.busSite == null) { state.vendeurs = []; return; }
    try {
      const supabase = ctx.supabase;
      const r = await supabase.rpc('get_kanban_vendeurs', { p_viewer_id_user: getViewerId(), p_id_site: state.busSite });
      if (r.error) throw r.error;
      state.vendeurs = (r.data || []).map(v => ({ id_user: Number(v.id_user), nom: v.nom_complet || ('#' + v.id_user), site: v.nom_site || '', affaire: v.affaire || '', reseau: v.reseau || '', vn_vo: (v.vn_vo || '').toUpperCase() }));
      if (isManager()) {
        const selfId = getViewerId();
        if (selfId != null) {
          const me = state.vendeurs.find(v => v.id_user === selfId);
          if (me) me.isChef = true;
          else state.vendeurs.push({ id_user: selfId, nom: getViewerName() || ('#' + selfId), site: '', affaire: '', reseau: '', vn_vo: '', isChef: true });
        }
      }
      state.vendeurs.sort((a, b) => { if (!!a.isChef !== !!b.isChef) return a.isChef ? -1 : 1; return (vnvoRank(a.vn_vo) - vnvoRank(b.vn_vo)) || a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }); });
    } catch (e) { console.warn('[kanban] get_kanban_vendeurs', e); state.vendeurs = []; }
    if (state.selOpen) render();
  }

  async function applyBusSite(siteId) {
    if (perimMode() !== 'chef') return;
    const id = siteId != null ? Number(siteId) : null;
    if (String(state.busSite) === String(id)) return;
    state.busSite = id; state.vendeurs = null; state.vendeurId = null; state.vendeurName = '';
    state.vendeurSearch = ''; state.selOpen = false; state.openVersions = null; state.versionsData = {};
    if (id == null) { state.cards = []; render(); return; }
    await loadVendeurs();
    if (state.vendeurId == null) {
      const self = getViewerId();
      if (self != null) { state.vendeurId = self; const me = Array.isArray(state.vendeurs) ? state.vendeurs.find(v => v.id_user === self) : null; state.vendeurName = me ? me.nom : getViewerName(); }
      else if (Array.isArray(state.vendeurs) && state.vendeurs.length) { state.vendeurId = state.vendeurs[0].id_user; state.vendeurName = state.vendeurs[0].nom; }
    }
    loadData();
  }

  async function loadVersions(cardId) {
    try {
      const supabase = ctx.supabase;
      const r = await supabase.rpc('get_affaire_versions', { p_id_propale_bdc: Number(cardId) });
      if (r.error) throw r.error;
      state.versionsData[cardId] = (r.data || []).map(v => ({ id: Number(v.id_propale_bdc), status: v.status, montant: v.montant != null ? Number(v.montant) : null, maj: v.maj || null, official: !!v.is_official }));
    } catch (e) { console.warn('[kanban] get_affaire_versions', e); state.versionsData[cardId] = null; }
    if (state.openVersions === Number(cardId)) render();
  }

  function passFilters(c) {
    if (state.fType !== 'tous' && c.vn_vo !== state.fType) return false;
    if (state.fClient !== 'tous' && c.client_type !== state.fClient) return false;
    if (state.fFin !== 'tous' && c.financement !== state.fFin) return false;
    return true;
  }
  function visibleCards() { return (state.cards || []).filter(passFilters); }
  function cardsOf(statusKey) { return visibleCards().filter(c => c.status === statusKey); }
  function findCard(id) { return (state.cards || []).find(c => c.id_propale_bdc === Number(id)); }
  function shell(inner) { return '<div class="kan">' + STYLE + inner + '</div>'; }

  function render() {
    const root = getRoot(); if (!root) return;
    if (state.loading || state.cards === null) { root.innerHTML = shell('<div class="kan-load">Chargement du pipe commercial…</div>'); return; }
    if (state.error) { root.innerHTML = shell('<div class="kan-err">Erreur : ' + esc(state.error) + '</div>'); return; }
    root.innerHTML = shell(renderToolbar() + renderHint() + renderBoard());
    if (perimMode() === 'cascade') renderKanPerim();
  }

  function renderHint() {
    const pm = perimMode();
    if (pm === 'self') return '';
    if (pm === 'cascade') { if (state.vendeurId == null) return '<div class="kan-hint">Sélectionnez un collaborateur.</div>'; return ''; }
    if (state.busSite == null) return '<div class="kan-hint">Sélectionnez un site pour afficher les affaires.</div>';
    if (state.vendeurId == null) return '<div class="kan-hint">Aucun vendeur sur ce site.</div>';
    return '';
  }

  function renderToolbar() {
    const chip = (group, val, cur, label) => '<span class="k-chip' + (cur === val ? ' on' : '') + '" data-filter="' + group + ':' + val + '">' + esc(label) + '</span>';
    let h = '<div class="kan-toolbar">';
    const vendName = esc(state.vendeurName || getViewerName() || ('#' + state.vendeurId));
    const pmode = perimMode();
    if (pmode === 'cascade') {
      h += '<div class="k-perim" id="kan-perim"><span class="k-perim-load">Chargement du périmètre…</span></div>';
    } else if (pmode === 'chef') {
      if (state.busSite == null) {
        h += '<div class="k-vend k-vend-nosite"><span class="k-vend-l">Vendeur</span><span class="k-vend-n">Sélectionnez un site</span></div>';
      } else {
        h += '<div class="k-vend-sel"><button class="k-vend k-vend-btn" data-selopen="1"><span class="k-vend-l">Vendeur</span><span class="k-vend-n">' + (state.vendeurName ? esc(state.vendeurName) : 'Choisir…') + ' <span class="k-caret">▾</span></span></button>' + (state.selOpen ? renderVendeurPanel() : '') + '</div>';
      }
    } else {
      h += '<div class="k-vend"><span class="k-vend-l">Vendeur</span><span class="k-vend-n">' + vendName + '</span></div>';
    }
    h += '<div class="k-dates"><button type="button" class="k-range" data-krange="1">\ud83d\udcc5 <span class="k-range-t">' + esc(fmtPeriodKan()) + '</span> <span class="k-caret">▾</span></button></div>';
    h += '<div class="k-filters"><div class="k-fgroup">' + chip('type', 'tous', state.fType, 'Tous') + chip('type', 'VN', state.fType, 'VN') + chip('type', 'VO', state.fType, 'VO') + '</div>';
    h += '<div class="k-fgroup">' + chip('client', 'tous', state.fClient, 'Tous clients') + chip('client', 'particulier', state.fClient, 'Particuliers') + chip('client', 'societe', state.fClient, 'Sociétés') + '</div>';
    h += '<div class="k-fgroup">' + chip('fin', 'tous', state.fFin, 'Tous') + chip('fin', 'financement', state.fFin, 'Financement') + chip('fin', 'comptant', state.fFin, 'Comptant') + '</div></div></div>';
    return h;
  }

  function renderVendeurPanel() {
    let h = '<div class="k-vpanel"><input type="text" class="k-vsearch" placeholder="Rechercher un vendeur…" value="' + esc(state.vendeurSearch) + '" oninput="window.__kanVendSearch(this.value)">';
    if (state.vendeurs === null) { h += '<div class="k-vempty">Chargement…</div></div>'; return h; }
    const q = (state.vendeurSearch || '').toLowerCase().trim();
    const list = state.vendeurs.filter(v => !q || v.nom.toLowerCase().includes(q));
    if (!list.length) { h += '<div class="k-vempty">Aucun vendeur sur ce site.</div></div>'; return h; }
    let lastType = null;
    list.forEach(v => {
      const t = v.isChef ? 'Chef des ventes' : vnvoLabel(v.vn_vo);
      if (t !== lastType) { h += '<div class="k-vgroup">' + esc(t) + '</div>'; lastType = t; }
      h += '<button class="k-vitem' + (v.id_user === state.vendeurId ? ' on' : '') + '" data-vend="' + v.id_user + '" data-vname="' + esc(v.nom) + '">' + esc(v.nom) + '</button>';
    });
    return h + '</div>';
  }

  // ============================================================================
  //  AJOUT : date range picker (1 calendrier, 2 clics) + cascade périmètre directeur
  // ============================================================================
  function closeRangePickerKan() {
    const e = doc.getElementById('kan-dp'); if (e) e.remove();
    if (window.__kanDpOutside) { doc.removeEventListener('mousedown', window.__kanDpOutside, true); window.__kanDpOutside = null; }
  }
  function applyPeriodKan(from, to) {
    closeRangePickerKan();
    if (!from || !to) return;
    if (from === state.period.from && to === state.period.to) return;
    state.period.from = from; state.period.to = to;
    state.cards = null; state.versionsData = {}; state.openVersions = null;
    loadData();
  }
  function openRangePickerKan(anchor) {
    closeRangePickerKan();
    const pk = { month: null, start: null, end: null, hover: null };
    const m0 = new Date(state.period.from + 'T12:00:00');
    pk.month = new Date(m0.getFullYear(), m0.getMonth(), 1);
    const pop = doc.createElement('div'); pop.id = 'kan-dp';
    const rct = anchor.getBoundingClientRect();
    pop.style.cssText = 'position:fixed;z-index:9999;top:' + (rct.bottom + 6) + 'px;left:' + Math.max(8, rct.left) + 'px';
    injectDpStyleKan(); doc.body.appendChild(pop);
    function calHtml() {
      const y = pk.month.getFullYear(), m = pk.month.getMonth();
      const first = new Date(y, m, 1); const startIdx = (first.getDay() + 6) % 7; const nbDays = new Date(y, m + 1, 0).getDate();
      const today = ymd(new Date()); const selA = pk.start, selB = pk.end || pk.hover;
      const lo = selA && selB ? (selA < selB ? selA : selB) : null; const hi = selA && selB ? (selA < selB ? selB : selA) : null;
      let h = '<div class="kan-dp-box">';
      h += '<div class="kan-dp-head"><button type="button" data-nav="-1">\u2039</button><span>' + esc(first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })) + '</span><button type="button" data-nav="1">\u203a</button></div>';
      h += '<div class="kan-dp-grid">';
      for (const d of ['L', 'M', 'M', 'J', 'V', 'S', 'D']) h += '<span class="kan-dp-dow">' + d + '</span>';
      for (let i = 0; i < startIdx; i++) h += '<span></span>';
      for (let d = 1; d <= nbDays; d++) {
        const ds = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        let cls = 'kan-dp-day';
        if (ds === today) cls += ' today'; if (pk.start === ds || pk.end === ds) cls += ' sel'; else if (lo && hi && ds > lo && ds < hi) cls += ' inr';
        h += '<span class="' + cls + '" data-d="' + ds + '">' + d + '</span>';
      }
      h += '</div><div class="kan-dp-foot">' + (pk.start ? 'Cliquez la date de fin' : 'Cliquez la date de d\u00e9but') + '</div></div>';
      return h;
    }
    function wire() {
      pop.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); pk.month = new Date(pk.month.getFullYear(), pk.month.getMonth() + Number(b.getAttribute('data-nav')), 1); paint(); }));
      pop.querySelectorAll('.kan-dp-day').forEach(c => {
        c.addEventListener('click', () => { const ds = c.getAttribute('data-d'); if (!pk.start || pk.end) { pk.start = ds; pk.end = null; pk.hover = null; paint(); return; } pk.end = ds; let a = pk.start, b = pk.end; if (b < a) { const t = a; a = b; b = t; } applyPeriodKan(a, b); });
        c.addEventListener('mouseenter', () => { if (pk.start && !pk.end && pk.hover !== c.getAttribute('data-d')) { pk.hover = c.getAttribute('data-d'); paint(); } });
      });
    }
    function paint() { pop.innerHTML = calHtml(); wire(); }
    paint();
    window.__kanDpOutside = (e) => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closeRangePickerKan(); };
    setTimeout(() => doc.addEventListener('mousedown', window.__kanDpOutside, true), 0);
  }
  function injectDpStyleKan() {
    if (doc.getElementById('kan-dp-style')) return;
    const st = doc.createElement('style'); st.id = 'kan-dp-style';
    st.textContent = '#kan-dp .kan-dp-box{background:#fff;border:1.5px solid #e8eef7;border-radius:12px;box-shadow:0 8px 30px rgba(42,94,169,.18);padding:13px;width:262px;font-family:"Nunito Sans",system-ui,sans-serif}'
      + '#kan-dp .kan-dp-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}'
      + '#kan-dp .kan-dp-head span{font-size:12px;font-weight:700;color:#2a5ea9;text-transform:capitalize}'
      + '#kan-dp .kan-dp-head button{width:26px;height:26px;border:1.5px solid #e8eef7;background:#fff;border-radius:8px;cursor:pointer;color:#2a5ea9;font-size:13px;line-height:1;padding:0}'
      + '#kan-dp .kan-dp-head button:hover{background:#f5f8fc}'
      + '#kan-dp .kan-dp-grid{display:grid;grid-template-columns:repeat(7,33px);gap:2px}'
      + '#kan-dp .kan-dp-dow{font-size:9px;color:#acc5e4;text-align:center;font-weight:800;padding-bottom:3px}'
      + '#kan-dp .kan-dp-day{height:29px;line-height:29px;text-align:center;font-size:11px;color:#2c2c2a;border-radius:7px;cursor:pointer}'
      + '#kan-dp .kan-dp-day:hover{background:#eef4fc}'
      + '#kan-dp .kan-dp-day.today{box-shadow:inset 0 0 0 1.5px #acc5e4}'
      + '#kan-dp .kan-dp-day.sel{background:#2a5ea9;color:#fff;font-weight:800}'
      + '#kan-dp .kan-dp-day.inr{background:#eef4fc}'
      + '#kan-dp .kan-dp-foot{margin-top:8px;text-align:center;font-size:10px;color:#9bb3d1;font-style:italic}';
    doc.head.appendChild(st);
  }

  // ── Cascade périmètre directeur (rôles 1/2/6/7/8) : Réseau→Affaire→Site→Vendeur
  function kanPerimRows() { return window.__kanPerim || null; }
  function kanSetPerim(v) { window.__kanPerim = v; }
  let kanPerimLoading = false;
  async function loadKanPerim() {
    if (kanPerimRows() || kanPerimLoading) return;
    kanPerimLoading = true;
    try {
      const supabase = ctx.supabase;
      const r = await supabase.rpc('get_agenda_perimeter', { p_viewer_id_user: getViewerId() });
      if (r.error) throw r.error;
      const rows = (r.data || []).map(x => ({
        id_user: x.id_user != null ? Number(x.id_user) : null,
        nom: x.nom_complet || ('Vendeur ' + x.id_user),
        id_site: x.id_site != null ? Number(x.id_site) : null,
        nom_site: x.nom_site || ('Site ' + x.id_site),
        reseau: x.reseau || '(Sans réseau)',
        affaire: x.affaire || '(Sans affaire)',
        id_affaire: x.id_affaire != null ? Number(x.id_affaire) : null,
        id_role: x.id_role != null ? Number(x.id_role) : null,
        vn_vo: (x.vn_vo || '').toUpperCase()
      }));
      kanSetPerim(rows);
    } catch (e) { console.error('[kanban] get_agenda_perimeter', e); kanSetPerim([]); }
    finally {
      kanPerimLoading = false;
      const had = state.vendeurId != null;
      renderKanPerim();
      if (state.vendeurId != null && !had) { state.cards = null; loadData(); }
    }
  }
  function kanPerimSel() {
    if (!window.__kanPerimSel) window.__kanPerimSel = { reseau: null, affKey: null, idSite: null, init: false };
    return window.__kanPerimSel;
  }
  function kanAffKey(r) { return r.reseau + '~~' + r.id_affaire; }
  function kanUniq(arr, keyFn, labelFn) {
    const m = {}; for (const x of arr) { const k = keyFn(x); if (k == null) continue; if (!(k in m)) m[k] = { key: k, label: labelFn(x) }; }
    return Object.values(m).sort((a, b) => String(a.label).localeCompare(String(b.label), 'fr'));
  }
  function resolveKanCascade(rows) {
    const sel = kanPerimSel();
    if (!sel.init) {
      let self = rows.find(r => String(r.id_user) === String(getViewerId()));
      if (!self) self = rows[0];
      if (self) { sel.reseau = self.reseau; sel.affKey = kanAffKey(self); sel.idSite = self.id_site; }
      sel.init = true;
    }
    const reseaux = kanUniq(rows, r => r.reseau, r => r.reseau);
    if (!reseaux.some(o => o.key === sel.reseau)) sel.reseau = reseaux.length ? reseaux[0].key : null;
    const afRows = rows.filter(r => r.reseau === sel.reseau);
    const affaires = kanUniq(afRows, kanAffKey, r => r.affaire);
    if (!affaires.some(o => o.key === sel.affKey)) sel.affKey = affaires.length ? affaires[0].key : null;
    const stRows = afRows.filter(r => kanAffKey(r) === sel.affKey);
    const sites = kanUniq(stRows, r => String(r.id_site), r => r.nom_site);
    if (!sites.some(o => String(o.key) === String(sel.idSite))) sel.idSite = sites.length ? Number(sites[0].key) : null;
    const veRows = stRows.filter(r => String(r.id_site) === String(sel.idSite));
    const seen = {}, vendeurs = [];
    for (const v of veRows) { const k = String(v.id_user); if (seen[k]) continue; seen[k] = 1; vendeurs.push(v); }
    return { reseaux, affaires, sites, vendeurs, sel };
  }
  function kanCollabCat(r) {
    const role = Number(r.id_role);
    if (role === 4) { const s = String(r.vn_vo || '').toUpperCase(), vn = s.includes('VN'), vo = s.includes('VO'); if (vn && vo) return { key: 'v3', label: 'Vendeurs VN/VO', order: 90 }; if (vn) return { key: 'v1', label: 'Vendeurs VN', order: 88 }; if (vo) return { key: 'v2', label: 'Vendeurs VO', order: 89 }; return { key: 'v0', label: 'Vendeurs', order: 91 }; }
    const M = { 8: ['Directeurs groupe', 10], 7: ['Directeurs marque', 20], 6: ['Directeurs plaque', 30], 2: ['Directeurs', 40], 1: ['Admins', 60], 3: ['Chefs des ventes', 70] };
    const m = M[role] || ['Autres', 99]; return { key: 'r' + role, label: m[0], order: m[1] };
  }
  function renderKanPerim() {
    const host = doc.getElementById('kan-perim'); if (!host) return;
    const rows = kanPerimRows();
    if (rows === null) { loadKanPerim(); host.innerHTML = '<span class="k-perim-load">Chargement du périmètre…</span>'; return; }
    if (!rows.length) { host.innerHTML = ''; return; }
    const r = resolveKanCascade(rows);
    if (state.vendeurId == null || !r.vendeurs.some(v => String(v.id_user) === String(state.vendeurId))) {
      const v0 = r.vendeurs[0] || null;
      if (v0) { state.vendeurId = Number(v0.id_user); state.vendeurName = v0.nom; }
    }
    const lvl = (id, label, opts, val, show) => { if (!show) return ''; return '<label class="k-perim-lvl"><span class="k-perim-lbl">' + esc(label) + '</span><select class="k-perim-sel" id="' + id + '">' + opts.map(o => '<option value="' + esc(o.key) + '"' + (String(o.key) === String(val) ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') + '</select></label>'; };
    const cats = {};
    for (const v of r.vendeurs) { const c = kanCollabCat(v); (cats[c.key] = cats[c.key] || { label: c.label, order: c.order, items: [] }).items.push(v); }
    const grps = Object.values(cats).sort((a, b) => a.order - b.order);
    grps.forEach(g => g.items.sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr')));
    const vendOpts = grps.map(g => '<optgroup label="' + esc(g.label) + '">' + g.items.map(v => '<option value="' + esc(v.id_user) + '"' + (String(v.id_user) === String(state.vendeurId) ? ' selected' : '') + '>' + esc(v.nom) + '</option>').join('') + '</optgroup>').join('');
    host.innerHTML = '<div class="k-perim-row">'
      + lvl('kan-c-reseau', 'Réseau', r.reseaux, r.sel.reseau, r.reseaux.length > 1)
      + lvl('kan-c-affaire', 'Affaire', r.affaires, r.sel.affKey, r.affaires.length > 1)
      + lvl('kan-c-site', 'Site', r.sites, r.sel.idSite, r.sites.length > 1)
      + '<label class="k-perim-lvl"><span class="k-perim-lbl">Vendeur</span><select class="k-perim-sel" id="kan-c-vend">' + vendOpts + '</select></label>'
      + '</div>';
    wireKanCascade(host);
  }
  function kanCascadeChanged() { state.vendeurId = null; state.vendeurName = ''; state.cards = null; state.versionsData = {}; state.openVersions = null; renderKanPerim(); loadData(); }
  function wireKanCascade(host) {
    const g = (id) => host.querySelector('#' + id);
    const sel = kanPerimSel();
    const re = g('kan-c-reseau'); if (re) re.addEventListener('change', () => { sel.reseau = re.value; sel.affKey = null; sel.idSite = null; kanCascadeChanged(); });
    const af = g('kan-c-affaire'); if (af) af.addEventListener('change', () => { sel.affKey = af.value; sel.idSite = null; kanCascadeChanged(); });
    const si = g('kan-c-site'); if (si) si.addEventListener('change', () => { sel.idSite = Number(si.value); kanCascadeChanged(); });
    const ve = g('kan-c-vend'); if (ve) ve.addEventListener('change', () => {
      const opt = ve.options[ve.selectedIndex];
      state.vendeurId = Number(ve.value); state.vendeurName = opt ? opt.textContent : '';
      state.cards = null; state.versionsData = {}; state.openVersions = null;
      loadData();
    });
  }

  function conversion(idx) {
    if (idx === 0) return null;
    const prev = cardsOf(COL_KEYS[idx - 1]).length, cur = cardsOf(COL_KEYS[idx]).length;
    if (prev + cur === 0) return null;
    return Math.round(100 * cur / (prev + cur));
  }

  function renderBoard() {
    let h = '<div class="kan-board">';
    COLS.forEach((col, idx) => {
      const list = cardsOf(col.key);
      const total = list.reduce((s, c) => s + (c.montant || 0), 0);
      const conv = conversion(idx);
      h += '<div class="kan-col" data-col="' + col.key + '">';
      h += '<div class="kc-head kc-' + col.key + '"><div class="kc-title"><span class="kc-dot"></span>' + esc(col.label) + '<span class="kc-n">' + list.length + '</span></div><div class="kc-sum">' + eur(total) + (conv != null ? '<span class="kc-conv">' + conv + '% ↗</span>' : '') + '</div></div>';
      h += '<div class="kc-body">';
      if (!list.length) h += '<div class="kc-empty">—</div>';
      list.forEach(c => { h += renderCard(c); });
      h += '</div></div>';
    });
    return h + '</div>';
  }

  function renderCard(c) {
    const vt = c.vn_vo === 'VN' ? 'vn' : (c.vn_vo === 'VO' ? 'vo' : 'na');
    const j = ageJours(c.maj);
    const isPdf = (c.status === 'propale' || c.status === 'bdc' || c.status === 'win');
    const pdfType = (c.status === 'propale') ? 'propale' : 'bdc';
    let h = '<div class="kc-card vt-' + vt + (c._moving ? ' moving' : '') + '" draggable="true" data-card="' + c.id_propale_bdc + '" data-from="' + c.status + '">';
    if (c._moving) h += '<div class="kc-spin"><span class="kc-spinner"></span></div>';

    // Client
    const cliName = esc(c.client || ('Client #' + (c.id_client || '?')));
    h += '<div class="kc-cli">' + (c.id_client != null ? '<button type="button" class="kc-cli-link" data-fiche="' + c.id_client + '" title="Ouvrir la fiche client — Propositions commerciales">' + cliName + '</button>' : '<span>' + cliName + '</span>') + (c.client_type ? '<span class="kc-ctype">' + (c.client_type === 'societe' ? 'Société' : 'Particulier') + '</span>' : '') + '</div>';

    // Véhicule — cliquable si VO (ouvre la fiche VO)
    if (c.vn_vo === 'VO' && c.vin) {
      h += '<div class="kc-veh"><span class="kc-vdot"></span><button type="button" class="kc-veh-link" data-vin="' + esc(c.vin) + '" title="Ouvrir la fiche VO">' + esc(c.vehicule || c.vin || '—') + '</button> <span class="kc-vt">VO</span></div>';
    } else {
      h += '<div class="kc-veh"><span class="kc-vdot"></span>' + esc(c.vehicule || c.vin || '—') + (c.vn_vo ? ' <span class="kc-vt">' + esc(c.vn_vo) + '</span>' : '') + '</div>';
    }

    h += '<div class="kc-row"><span class="kc-eur">' + eur(c.montant) + '</span>' + ageBadge(j) + '</div>';

    if (c.nb_versions > 1) {
      const open = state.openVersions === c.id_propale_bdc;
      h += '<button class="kc-vers" data-versions="' + c.id_propale_bdc + '">' + c.nb_versions + ' versions ' + (open ? '▾' : '▸') + '</button>';
      if (open) h += renderVersionList(c);
    }

    h += '<div class="kc-actions">';
    if (isPdf) h += '<button class="kc-ic" data-pdf="' + c.id_propale_bdc + ':' + pdfType + '" data-maj="' + esc(c.maj || '') + '" title="PDF">' + ICON_PDF + '</button>';
    if (c.status === 'propale' || c.status === 'draft') h += '<button class="kc-ic" data-modif="' + c.id_propale_bdc + '" title="Modifier">' + ICON_EDIT + '</button>';
    if (canArchive(c.status)) h += '<button class="kc-ic" data-archive="' + c.id_propale_bdc + '" title="Archiver">' + ICON_TRASH + '</button>';
    h += '<button class="kc-ic kc-move" data-menu="' + c.id_propale_bdc + '" title="Déplacer">' + ICON_MOVE + '</button>';
    h += '</div>';
    if (state.menuFor === c.id_propale_bdc) h += renderMoveMenu(c);
    return h + '</div>';
  }

  function renderMoveMenu(c) {
    const targets = COL_KEYS.filter(k => k !== c.status && canMove(c.status, k));
    let h = '<div class="kc-menu">';
    if (!targets.length) h += '<div class="kc-menu-empty">Aucun déplacement possible</div>';
    targets.forEach(k => { const col = COLS.find(x => x.key === k); h += '<button class="kc-menu-b" data-go="' + c.id_propale_bdc + ':' + k + '">→ ' + esc(col.label) + '</button>'; });
    return h + '</div>';
  }

  function renderVersionList(c) {
    const vs = state.versionsData[c.id_propale_bdc];
    if (vs === undefined) return '<div class="kc-vlist"><div class="kc-vload">Chargement…</div></div>';
    if (vs === null) return '<div class="kc-vlist"><div class="kc-vload">Versions indisponibles.</div></div>';
    const swappable = (c.status === 'draft' || c.status === 'propale');
    const lbl = s => ({ draft: 'brouillon', propale: 'propale', bdc: 'BDC', win: 'gagné', lose: 'perdu' })[s] || s;
    let h = '<div class="kc-vlist">';
    vs.forEach(v => {
      const isOfficial = v.status !== 'draft';
      h += '<div class="kc-vrow' + (isOfficial ? ' off' : '') + '"><div class="kc-vinfo"><span class="kc-vst kc-vst-' + v.status + '">' + lbl(v.status) + '</span><span class="kc-vmt">' + eur(v.montant) + '</span></div>';
      if (swappable && v.status === 'draft') h += '<button class="kc-vset" data-setprop="' + v.id + '">Définir comme propale</button>';
      else if (isOfficial) h += '<span class="kc-vactive">active</span>';
      h += '</div>';
    });
    return h + '</div>';
  }

  async function setAsPropale(versionId) {
    try {
      const supabase = ctx.supabase;
      const r = await supabase.rpc('move_propale', { p_id: Number(versionId), p_target_state: 'propale', p_payload: {} });
      if (r.error) throw r.error;
      state.versionsData = {}; state.openVersions = null;
      toast('Version définie comme propale');
      await loadData();
    } catch (e) { console.error('[kanban] setAsPropale', e); toast(humanError(e), true); }
  }

  async function doMove(id, to) {
    const c = findCard(id); if (!c) return;
    const from = c.status;
    if (from === to) return;
    if (!canMove(from, to) && to !== 'archived') { toast('Déplacement interdit', true); return; }
    const prevStatus = c.status;
    c._moving = true;
    if (to !== 'archived') c.status = to;
    state.menuFor = null; render();
    try {
      const supabase = ctx.supabase;
      const r = await supabase.rpc('move_propale', { p_id: Number(id), p_target_state: to, p_payload: {} });
      if (r.error) throw r.error;
      if (to === 'archived') { state.cards = (state.cards || []).filter(x => x.id_propale_bdc !== Number(id)); render(); toast('Affaire archivée'); }
      else { c._moving = false; await loadData(); }
    } catch (e) { console.error('[kanban] move_propale', e); c._moving = false; c.status = prevStatus; render(); toast(humanError(e), true); }
  }

  function humanError(e) {
    const m = (e && e.message) ? e.message : String(e);
    if (/périmètre/i.test(m)) return 'Affaire hors de votre périmètre.';
    if (/manager/i.test(m)) return 'Réservé au manager.';
    if (/propres affaires/i.test(m)) return 'Vous ne pouvez déplacer que vos propres affaires.';
    if (/Réouverture impossible/i.test(m)) return 'Un cycle est déjà ouvert pour ce client.';
    if (/interdite/i.test(m)) return "Ce déplacement n'est pas autorisé.";
    return 'Échec : ' + m;
  }

  let __toastTimer = null;
  function toast(msg, isErr) {
    const root = getRoot(); if (!root) return;
    let t = doc.getElementById('kan-toast');
    if (!t) { t = doc.createElement('div'); t.id = 'kan-toast'; root.appendChild(t); }
    t.className = isErr ? 'err' : 'ok'; t.textContent = msg; t.style.opacity = '1';
    if (__toastTimer) clearTimeout(__toastTimer);
    __toastTimer = setTimeout(() => { if (t) t.style.opacity = '0'; }, isErr ? 4000 : 2200);
  }

  async function pdfDoc(idPropale, kind, majIso) {
    const supabase = ctx.supabase;
    const isProp = (kind === 'propale');
    const type = isProp ? 'proposition_commerciale' : 'bon_de_commande';
    const templateId = isProp ? TPL_PROPOSITION : TPL_BON_COMMANDE;
    const btn = doc.querySelector('[data-pdf="' + idPropale + ':' + kind + '"]');
    if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }
    const open = (url) => { try { wwLib.getFrontWindow().open(url, '_blank'); } catch (e) { window.open(url, '_blank'); } };
    const done = () => { if (btn) { btn.disabled = false; btn.style.opacity = ''; } };
    const generer = async () => {
      const { data: gen, error } = await supabase.functions.invoke(PDF_EDGE_FN, { body: { id_propale_bdc: idPropale, template_id: templateId, type } });
      if (error) throw error;
      if (gen && gen.ok && gen.signed_url) open(gen.signed_url);
      else throw new Error(gen && gen.error ? gen.error : 'Génération PDF échouée');
    };
    try {
      const { data: docs, error } = await supabase.from('generated_documents').select('storage_path,ready_at').eq('id_propale_bdc', idPropale).eq('type', type).eq('status', 'ready').order('ready_at', { ascending: false }).limit(1);
      if (error) throw error;
      if (docs && docs.length && docs[0].storage_path) {
        const pdfTime = docs[0].ready_at ? new Date(docs[0].ready_at).getTime() : 0;
        const majTime = majIso ? new Date(String(majIso).replace(' ', 'T')).getTime() : 0;
        if (pdfTime >= majTime) {
          const { data: signed, error: sErr } = await supabase.storage.from(PDF_BUCKET).createSignedUrl(docs[0].storage_path, 3600);
          if (!sErr && signed && signed.signedUrl) { open(signed.signedUrl); return; }
        }
      }
      await generer();
    } catch (e) { console.error('[kanban] pdf', e); toast('PDF impossible : ' + ((e && e.message) ? e.message : e), true); }
    finally { done(); }
  }

  // ── Navigation : propale update ──────────────────────────────────────────
  function modifPropale(idPropale) {
    try { wwLib.wwVariable.updateValue(VAR_ID_PROPALE, Number(idPropale)); } catch (e) { }
    kanGoTo(PAGE_PROPALE_UPDATE, PATH_PROPALE_UPDATE);
  }

  // ── Navigation : fiche client onglet P.Com ────────────────────────────────
  async function openClientFichePcom(idClient, el) {
    if (!idClient) return;
    if (el) el.classList.add('kc-cli-loading');
    try {
      // fiche-shell lit l'IDVu dans SA variable et recharge le client lui-même
      // -> plus de workflow WeWeb. L'onglet voulu passe par un global.
      try { wwLib.wwVariable.updateValue('55490583-c88b-4748-916e-4d203db07742', { IDVu: Number(idClient) }); } catch (e) { }
      try { const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window; w.__odFicheTab = TAB_PCOM; } catch (e) { }
      kanGoTo(PAGE_FICHE_ID, PATH_FICHE_CLIENT);
    } catch (e) {
      console.error('[kanban] fiche client', e);
      if (el) el.classList.remove('kc-cli-loading');
      toast('Impossible d\'ouvrir la fiche client', true);
    }
  }

  // ── Navigation : fiche VO (liste VO filtrée sur le VIN) ───────────────────
  // ── Fiche VO popup (portée depuis vo_liste_v1.js) ─────────────────────────

  // ── Helpers partagés avec vo_liste (nécessaires pour la fiche VO) ──────────
  function num(v) { if (v == null || v === '') return 0; if (typeof v === 'number') return v; var n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
  function notEmpty(v) { return v != null && v !== '' && v !== 0 && v !== '0'; }
  function images(row) { var u = row && row.ImageUrls; if (!u) return []; if (Array.isArray(u)) return u.filter(Boolean); try { var a = JSON.parse(u); return Array.isArray(a) ? a.filter(Boolean) : []; } catch (e) { return []; } }
  function mainImage(row) { if (!row) return ''; var u = row.cover_url || row.ImageUrls; if (!u) return ''; if (typeof u === 'string') { try { var a = JSON.parse(u); return Array.isArray(a) && a[0] ? a[0] : u; } catch (e) { return u; } } if (Array.isArray(u)) return u[0] || ''; return ''; }
  function destination(row) { return num(row && row.GARANTIE) === -1 ? 'VOM' : 'VOP'; }
  function nbjDays(row) { var d = row && row.D_ENTREE_STOCK; if (!d) return null; var n = Math.floor((Date.now() - new Date(d).getTime()) / 86400000); return isNaN(n) ? null : n; }
  function fmtDateFR(s) { if (!s) return ''; try { var d = new Date(s); return d.toLocaleDateString('fr-FR'); } catch (e) { return s; } }
  // Cache photos pour la fiche VO ouverte depuis le kanban
  if (!window.__kanPhotoCache) window.__kanPhotoCache = {};

  // Constantes Supabase (pour callPhotosEF dans la fiche VO)
  var SUPABASE_URL = ctx.tenant.supabase_url;
  var SUPABASE_KEY = 'sb_publishable_ZoOXdKyHTcyePPDUeeAWBw_rZEFz_tG';
  var FN_PHOTOS = SUPABASE_URL + '/functions/v1/vo-photos-list';
  var FN_PHOTOS_INIT = SUPABASE_URL + '/functions/v1/vo-photos-init-upload';
  var FN_PHOTOS_CONFIRM = SUPABASE_URL + '/functions/v1/vo-photos-confirm-upload';
  var FN_PHOTOS_DELETE = SUPABASE_URL + '/functions/v1/delete-stockvo-photo';
  var FN_PHOTOS_MOVE = SUPABASE_URL + '/functions/v1/vo-photos-move';
  var FN_PHOTOS_COVER = SUPABASE_URL + '/functions/v1/vo-photos-iscover';
  var VAR_FICHE_VO_LOCAL = 'bcb187ac-e66e-4bfb-bc48-1b7b7dfda0ba';
  var VAR_DIAPORAMA_LOCAL = '12e65fb5-6e56-410b-b8df-8fd226a132de';

  // Helpers fiche VO manquants dans le contexte kanban
  function contremarque(row) { return !!(row && row.ID_CM); }
  function designation(row) { if (!row) return ''; return row.DESIGNATION_DMS || row.VERSION_EUROTAX || row.MODELE_DMS || ''; }
  function sb() { return ctx.supabase; }
  var AUTH_VAR_FICHE = '1fa0dd68-5069-436c-9a7d-3b54c340f1fa';
  async function getJwt() {
    try { var pv = wwLib.wwVariable.getValue(AUTH_VAR_FICHE); var u = pv && (pv.user || pv); var tok = u && u._session && u._session.access_token; if (tok) return tok; } catch (e) { }
    var c = sb(); if (!c || !c.auth) return null;
    try { if (typeof c.auth.getSession === 'function') { var r = await c.auth.getSession(); if (r && r.data && r.data.session) return r.data.session.access_token; } } catch (e) { }
    try { if (typeof c.auth.session === 'function') { var s2 = c.auth.session(); if (s2) return s2.access_token; } } catch (e) { }
    return null;
  }
  var win = (function () { try { return wwLib.getFrontWindow(); } catch (e) { return window; } })();

  function fmtDateFR(iso) { if (!notEmpty(iso)) return '-'; var p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? (p[2] + '-' + p[1] + '-' + p[0]) : iso; }
  function nbjDays(row) { if (!notEmpty(row.D_ACHAT)) return null; var d = new Date(String(row.D_ACHAT).slice(0, 10) + 'T00:00:00'); if (isNaN(d.getTime())) return null; return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000)); }
  function garantieTxt(row) { if (notEmpty(row.LIBELLE_GARANTIE)) return row.LIBELLE_GARANTIE; var c = num(row.CODE_GARANTIE); return c != null ? c + ' mois' : '-'; }
  function contremarque(row) { return notEmpty(row.ID_CM); }
  function destination(row) { return num(row.GARANTIE) === -1 ? 'VOM' : 'VOP'; }

  // Crit'Air — réplique exacte de la formule WeWeb.
  function critairNum(row) {
    var carb = (row.CARBURANT_DMS || '').toLowerCase();
    var d = notEmpty(row.D_1MEC) ? String(row.D_1MEC).slice(0, 10) : '';
    if (carb === 'essence') { if (d > '1997-01-01') { if (d >= '2006-01-01') { return d >= '2011-01-01' ? 1 : 2; } return 3; } return 99; }
    if (carb === 'diesel') { if (d >= '1997-01-01') { if (d >= '2001-01-01') { if (d >= '2006-01-01') { if (d >= '2011-01-01') { return d >= '2014-09-01' ? 1 : 2; } return 3; } return 4; } return 5; } return 99; }
    return 0;
  }
  var CRITAIR_COLOR = { 0: '#38723F', 1: '#7A4983', 2: '#EDBE33', 3: '#F1721B', 4: '#472122', 5: '#42535D', 99: '#6b7280' };
  function critair(row) { var n = critairNum(row); return { n: n, color: CRITAIR_COLOR[n] || '#6b7280', label: n === 99 ? 'Non classé' : "Crit'Air " + n }; }

  // ─────────────────────────────────────────────────────────── workflows / nav
  // (helper runWf retiré : plus aucun workflow WeWeb n'est appelé par ce module)
  // Diaporama depuis la liste (fiche non ouverte) : on charge les photos du VIN
  // puis on ouvre le diaporama JS. Remplace le workflow WeWeb « Diaporama ».
  async function openDiaporama(vin) {
    if (!vin) return;
    var photos = null;
    try {
      if (!photos) {
        var d = await callPhotosEF(FN_PHOTOS, { vin: vin, expiresIn: 3600 });
        photos = (d && d.photos) ? d.photos : [];
      }
    } catch (e) { console.error('[vo] openDiaporama', e); photos = []; }
    var urls = (photos || []).map(function (p) { return p.signedUrl; }).filter(Boolean);
    showDiaporama(urls, 0);
  }
  function openWeb(url) { if (notEmpty(url)) { try { win.open(url, '_blank', 'noopener'); } catch (e) { window.open(url, '_blank'); } } }

  // ─────────────────────────────────────────────────────────── popup fiche VO



  function sb() { return ctx.supabase; }
  var win = (function () { try { return wwLib.getFrontWindow(); } catch (e) { return window; } })();

  function fmtDateFR(iso) { if (!notEmpty(iso)) return '-'; var p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? (p[2] + '-' + p[1] + '-' + p[0]) : iso; }
  function nbjDays(row) { if (!notEmpty(row.D_ACHAT)) return null; var d = new Date(String(row.D_ACHAT).slice(0, 10) + 'T00:00:00'); if (isNaN(d.getTime())) return null; return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000)); }
  function garantieTxt(row) { if (notEmpty(row.LIBELLE_GARANTIE)) return row.LIBELLE_GARANTIE; var c = num(row.CODE_GARANTIE); return c != null ? c + ' mois' : '-'; }
  function contremarque(row) { return notEmpty(row.ID_CM); }
  function destination(row) { return num(row.GARANTIE) === -1 ? 'VOM' : 'VOP'; }

  // Crit'Air — réplique exacte de la formule WeWeb.
  function critairNum(row) {
    var carb = (row.CARBURANT_DMS || '').toLowerCase();
    var d = notEmpty(row.D_1MEC) ? String(row.D_1MEC).slice(0, 10) : '';
    if (carb === 'essence') { if (d > '1997-01-01') { if (d >= '2006-01-01') { return d >= '2011-01-01' ? 1 : 2; } return 3; } return 99; }
    if (carb === 'diesel') { if (d >= '1997-01-01') { if (d >= '2001-01-01') { if (d >= '2006-01-01') { if (d >= '2011-01-01') { return d >= '2014-09-01' ? 1 : 2; } return 3; } return 4; } return 5; } return 99; }
    return 0;
  }
  var CRITAIR_COLOR = { 0: '#38723F', 1: '#7A4983', 2: '#EDBE33', 3: '#F1721B', 4: '#472122', 5: '#42535D', 99: '#6b7280' };
  function critair(row) { var n = critairNum(row); return { n: n, color: CRITAIR_COLOR[n] || '#6b7280', label: n === 99 ? 'Non classé' : "Crit'Air " + n }; }

  // ─────────────────────────────────────────────────────────── workflows / nav
  // (helper runWf retiré : plus aucun workflow WeWeb n'est appelé par ce module)
  function openWeb(url) { if (notEmpty(url)) { try { win.open(url, '_blank', 'noopener'); } catch (e) { window.open(url, '_blank'); } } }

  // ─────────────────────────────────────────────────────────── popup fiche VO


  var ficheState = { vin: null, row: null, tab: 'fiche', photos: null, photosLoading: false, apv: null, apvLoading: false };

  function fmtEurTTC(v) { var n = num(v); return n ? n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' € TTC' : '-'; }

  async function openFicheVO(vin, rowArg) {
    if (!vin) return;
    console.log('[kanFiche] openFicheVO', vin, !!rowArg);
    var row = rowArg || window.__kanCurrentVORow || null;
    if (!row) {
      var c = sb();
      if (c) { var r = await c.from('v_liste_vo').select('*').eq('VIN', vin).limit(1); row = (r.data && r.data[0]) || { VIN: vin }; }
      else row = { VIN: vin };
    }
    console.log('[kanFiche] row loaded', !!row);
    try { wwLib.wwVariable.updateValue(VAR_FICHE_VO_LOCAL, row); } catch (e) { }
    ficheState.vin = vin; ficheState.row = row; ficheState.tab = 'fiche';
    ficheState.photos = window.__kanPhotoCache[vin] || null;
    ficheState.apv = null;
    ficheState.photosLoading = !ficheState.photos; ficheState.apvLoading = false;
    renderFichePopup();
    console.log('[kanFiche] renderFichePopup called, overlay:', !!doc.getElementById('vo-fiche-overlay'));
    if (!ficheState.photos) loadPhotos(vin);
  }

  function closeFichePopup() {
    var el = doc.getElementById('vo-fiche-overlay'); if (el) el.remove();
  }

  function renderFichePopup() {
    var old = doc.getElementById('vo-fiche-overlay'); if (old) old.remove();
    var row = ficheState.row || {}; var vin = ficheState.vin;
    var tab = ficheState.tab;
    var isDisp = !contremarque(row);
    var marque = esc((row.MARQUE_DMS || '') + ' ' + (row.MODELE_DMS || '')).trim();
    var version = esc(designation(row));
    var noVo = esc(row.NO_VO || '');
    var noImmat = esc(row.NO_IMMAT || '');
    var site = esc(row.SITE || '');
    var prix = fmtEurTTC(row.PVENTE);
    var nbj = nbjDays(row);

    // ── CSS popup ──
    var CSS = '<style id="vo-fiche-css">'
      + '#vo-fiche-overlay{position:fixed;inset:0;z-index:2000;display:flex;align-items:flex-start;justify-content:center;padding:20px;background:rgba(31,74,133,.45);overflow-y:auto}'
      + '#vo-fiche-modal{background:#fff;border-radius:18px;width:100%;max-width:1080px;box-shadow:0 30px 80px rgba(31,74,133,.35);font-family:"Nunito Sans",system-ui,sans-serif;overflow:hidden;margin:auto}'
      + '.vf-head{padding:18px 52px 12px 24px;border-bottom:1px solid #eef2f8;position:relative}'
      + '.vf-head-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}'
      + '.vf-title{font-size:26px;font-weight:800;color:#1F4A85;line-height:1.1}'
      + '.vf-sub{font-size:13px;color:#9bb3d1;font-weight:600;margin-top:3px}'
      + '.vf-head-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}'
      + '.vf-price{font-size:24px;font-weight:800;color:#1F4A85}'
      + '.vf-status{padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700}'
      + '.vf-status.dispo{background:#eaf7f3;color:#0f6e56;border:1px solid #9ad9c5}'
      + '.vf-status.cm{background:#fcebeb;color:#a32d2d;border:1px solid #f5a5a5}'
      + '.vf-close{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:50%;border:1.5px solid #e2eaf5;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#7a98c5;flex:0 0 auto;transition:all .12s;z-index:10}'
      + '.vf-close:hover{background:#fcebeb;border-color:#e24b4a;color:#e24b4a}'
      + '.vf-like{padding:7px 14px;border-radius:999px;background:#53bda7;color:#fff;font:inherit;font-size:13px;font-weight:700;border:none;cursor:pointer;transition:background .12s;white-space:nowrap;flex-shrink:0}'
      + '.vf-like:hover{background:#3da08a}'
      // chips KPI
      + '.vf-chips{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}'
      + '.vf-chip{background:#f4f7fc;border:1.5px solid #e2eaf5;border-radius:10px;padding:8px 16px;text-align:center;min-width:90px}'
      + '.vf-chip-lbl{font-size:10px;color:#9bb3d1;font-weight:700;text-transform:uppercase;letter-spacing:.04em}'
      + '.vf-chip-val{font-size:14px;font-weight:800;color:#1F4A85;margin-top:2px}'
      // tabs
      + '.vf-tabs{display:flex;gap:0;padding:0 24px;border-bottom:1px solid #eef2f8}'
      + '.vf-tab{padding:12px 20px;font:inherit;font-size:14px;font-weight:700;color:#9bb3d1;background:none;border:none;border-bottom:3px solid transparent;cursor:pointer;transition:all .12s;margin-bottom:-1px}'
      + '.vf-tab.on{color:#2a5ea9;border-bottom-color:#2a5ea9}'
      + '.vf-tab:hover{color:#2a5ea9}'
      // body
      + '.vf-body{padding:20px 24px}'
      // fiche : image + grille
      + '.vf-fiche{display:grid;grid-template-columns:300px 1fr;gap:20px;align-items:start}'
      + '.vf-img-wrap{border-radius:14px;overflow:hidden;background:#eef2f8;aspect-ratio:4/3;position:relative}'
      + '.vf-img-wrap img{width:100%;height:100%;object-fit:cover;display:block}'
      + '.vf-img-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#c0cee0}'
      + '.vf-thumbs{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}'
      + '.vf-thumb{width:50px;height:36px;border-radius:6px;object-fit:cover;cursor:pointer;border:2px solid transparent;transition:border-color .12s}'
      + '.vf-thumb.on,.vf-thumb:hover{border-color:#2a5ea9}'
      + '.vf-grid{display:grid;grid-template-columns:1fr 1fr;gap:0}'
      + '.vf-field{padding:10px 0;border-bottom:1px solid #f1f5fb}'
      + '.vf-field:nth-last-child(-n+2){border-bottom:none}'
      + '.vf-field-lbl{font-size:11px;color:#9bb3d1;font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-bottom:3px}'
      + '.vf-field-val{font-size:14px;font-weight:700;color:#1F4A85}'
      // sections fiche détail
      + '.vf-sections{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:4px}'
      + '.vf-section{background:#f7f9fc;border:1.5px solid #e8eef7;border-radius:12px;padding:14px}'
      + '.vf-section-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#fff;background:#2a5ea9;padding:7px 12px;border-radius:7px;text-align:center;margin-bottom:12px}'
      + '.vf-row{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:.5px solid #eef2f8;font-size:12px}'
      + '.vf-row:last-child{border-bottom:none}'
      + '.vf-row-lbl{color:#9bb3d1;font-weight:600}'
      + '.vf-row-val{color:#1F4A85;font-weight:700;text-align:right}'
      // photos
      + '.vf-photos-header{display:flex;align-items:center;gap:10px;margin-bottom:16px}'
      + '.vf-photos-title{font-size:15px;font-weight:800;color:#1F4A85}'
      + '.vf-photo-actions{display:flex;gap:8px;margin-left:auto}'
      + '.vf-photo-btn{width:34px;height:34px;border-radius:8px;border:1.5px solid #e2eaf5;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#7a98c5;transition:all .12s}'
      + '.vf-photo-btn:hover{border-color:#2a5ea9;color:#2a5ea9}'
      + '.vf-photo-btn.del:hover{border-color:#e24b4a;color:#e24b4a}'
      + '.vf-photo-btn svg{width:16px;height:16px}'
      + '.vf-photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}'
      + '.vf-photo-item{border-radius:10px;overflow:hidden;aspect-ratio:4/3;background:#eef2f8;cursor:pointer;transition:transform .12s}'
      + '.vf-photo-item:hover{transform:scale(1.02)}'
      + '.vf-photo-item img{width:100%;height:100%;object-fit:cover;display:block}'
      // APV
      + '.vf-apv-empty{padding:30px;text-align:center;color:#9bb3d1;font-size:13px;font-weight:600}'
      + '.vf-apv-table{width:100%;border-collapse:collapse;font-size:12px}'
      + '.vf-apv-table th{background:#2a5ea9;color:#fff;font-weight:700;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em}'
      + '.vf-apv-table th:first-child{border-radius:8px 0 0 8px}.vf-apv-table th:last-child{border-radius:0 8px 8px 0}'
      + '.vf-apv-table td{padding:8px 10px;border-bottom:.5px solid #eef2f8}'
      + '.vf-apv-table tbody tr:hover td{background:#f7f9fc}'
      + '.vf-apv-total{margin-top:12px;text-align:right;font-size:13px;font-weight:700;color:#1F4A85}'
      + '@media(max-width:860px){.vf-fiche{grid-template-columns:1fr}.vf-sections{grid-template-columns:1fr 1fr}}'
      + '@media(max-width:600px){.vf-sections{grid-template-columns:1fr}.vf-head{padding:12px 48px 10px 14px}.vf-head-top{flex-wrap:wrap;gap:8px}.vf-head-right{gap:6px;max-width:100%}.vf-title{font-size:16px;line-height:1.2}.vf-sub{font-size:11px}.vf-price{font-size:15px}.vf-status{font-size:10px;padding:3px 8px}.vf-like{font-size:11px;padding:5px 11px}.vf-body{padding:12px 14px}.vf-tabs{padding:0 14px}.vf-tab{padding:9px 12px;font-size:12px}.vf-chips{gap:6px;margin-top:8px}.vf-chip{padding:5px 9px;font-size:11px}}'
      + '</style>';

    // ── header ──
    var headHtml = '<div class="vf-head">'
      + '<button type="button" class="vf-close" id="vf-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" width="16" height="16"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg></button>'
      + '<div class="vf-head-top">'
      + '<div><div class="vf-title">' + marque + ' ' + version + '</div>'
      + '<div class="vf-sub">' + noVo + (noImmat ? ' · ' + noImmat : '') + ' · ' + esc(vin) + (site ? ' · ' + site : '') + '</div></div>'
      + '<div class="vf-head-right">'
      + '<div class="vf-price">' + esc(prix) + '</div>'
      + '<span class="vf-status ' + (isDisp ? 'dispo' : 'cm') + '">' + (isDisp ? 'Disponible à la vente' : 'Contremarqué') + '</span>'
      + (isDisp ? '<button type="button" class="vf-like" id="vf-like">Like / P.Com</button>' : '')
      + '</div>'
      + '</div>';

    // chips KPI
    var ca = critair(row);
    headHtml += '<div class="vf-chips">'
      + vfChip('KMS', num(row.KMS) ? num(row.KMS).toLocaleString('fr-FR') + ' km' : '-')
      + vfChip('Carburant', esc(row.CARBURANT_DMS || '-'))
      + vfChip('Boîte', esc(row.BOITEV_EUROTAX || '-'))
      + vfChip('Carrosserie', esc(row.CARROSSERIE_EUROTAX || '-'))
      + '</div></div>';

    // ── tabs ──
    var tabsHtml = '<div class="vf-tabs">'
      + vfTab('fiche', 'Fiche VO', tab)
      + vfTab('photos', 'Photos', tab)
      + vfTab('apv', 'Factures APV', tab)
      + '</div>';

    // ── body selon onglet ──
    var bodyHtml = '<div class="vf-body">' + renderFicheTab(row, vin, ca) + '</div>';
    if (tab === 'photos') bodyHtml = '<div class="vf-body">' + renderPhotosTab() + '</div>';
    if (tab === 'apv') bodyHtml = '<div class="vf-body">' + renderApvTab() + '</div>';

    // ── assemblage ──
    var overlay = doc.createElement('div');
    overlay.id = 'vo-fiche-overlay';
    overlay.innerHTML = CSS + '<div id="vo-fiche-modal">' + headHtml + tabsHtml + bodyHtml + '</div>';
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closeFichePopup(); });
    doc.body.appendChild(overlay);

    // bindings
    doc.getElementById('vf-close').addEventListener('click', closeFichePopup);
    var likeBtn = doc.getElementById('vf-like');
    if (likeBtn) likeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openLikePopup();
    });
    doc.querySelectorAll('.vf-tab[data-tab]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        ficheState.tab = el.getAttribute('data-tab');
        if (ficheState.tab === 'photos' && !ficheState.photos && !ficheState.photosLoading) loadPhotos(ficheState.vin);
        if (ficheState.tab === 'apv' && !ficheState.apv && !ficheState.apvLoading) loadApv(ficheState.vin);
        renderFichePopup();
      });
    });
    // miniatures onglet Fiche : change image principale ET ouvre diaporama au clic
    doc.querySelectorAll('.vf-thumb[data-src]').forEach(function (el) {
      el.addEventListener('click', function () {
        var main = doc.getElementById('vf-main-img');
        if (main) { main.src = el.getAttribute('data-src'); }
        doc.querySelectorAll('.vf-thumb').forEach(function (t) { t.classList.remove('on'); });
        el.classList.add('on');
        openFicheDiaporama(Number(el.getAttribute('data-idx') || 0));
      });
    });
    // clic image principale ou miniature → diaporama inline
    var mainImg = doc.getElementById('vf-main-img');
    if (mainImg) mainImg.addEventListener('click', function () { openFicheDiaporama(0); });
    // Rebind photos si on est sur l'onglet photos (le DOM vient d'être recréé)
    if (ficheState.tab === 'photos') bindPhotos();
  }


  // ── Point d'entrée kanban → fiche VO ─────────────────────────────────────
  // Charge le véhicule depuis STOCKVO puis ouvre le popup fiche VO.
  async function kanOpenFicheVO(vin) {
    if (!vin) return;
    var supabase = ctx.supabase;
    var row = null;
    try {
      var r = await supabase.from('STOCKVO').select('*').eq('VIN', vin).limit(1);
      row = (r.data && r.data[0]) || { VIN: vin };
    } catch (e) { row = { VIN: vin }; }
    openFicheVO(vin, row);
  }

  // ─────────────────────────────────────────────────────────── diaporama inline fiche
  // Ferme le popup fiche, exécute fn(), puis rouvre quand la popup WeWeb est fermée.
  // WeWeb rend ses popups dans le front-document avec des z-index élevés.
  // On détecte la fermeture en surveillant l'overlay WeWeb (présence puis disparition).
  function withFicheClosed(fn) {
    var snap = { vin: ficheState.vin, row: ficheState.row, tab: ficheState.tab, photos: ficheState.photos, apv: ficheState.apv };
    closeFichePopup();
    // Attend que le popup WeWeb soit visible, puis surveille sa fermeture
    var waitOpen = 0;
    var tiOpen = setInterval(function () {
      waitOpen++;
      // Cherche un overlay WeWeb ouvert (div pleine page avec fond semi-transparent)
      var wwOverlay = findWwOverlay();
      if (wwOverlay || waitOpen > 20) { // 20 × 50ms = 1s max d'attente
        clearInterval(tiOpen);
        if (!wwOverlay) { restoreFiche(snap); return; } // pas de popup WeWeb → rouvre direct
        // Attend la fermeture du popup WeWeb
        var tiClose = setInterval(function () {
          if (!doc.body.contains(wwOverlay) || wwOverlay.style.display === 'none' || parseFloat(getComputedStyle(wwOverlay).opacity) < 0.05) {
            clearInterval(tiClose);
            setTimeout(function () { restoreFiche(snap); }, 80);
          }
        }, 100);
      }
    }, 50);
    fn(); // Lance le workflow immédiatement
  }

  function findWwOverlay() {
    // Cherche un élément WeWeb qui ressemble à un overlay modal (fond semi-transparent pleine page)
    var all = doc.querySelectorAll('body > div, body > section');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.id === 'vo-fiche-overlay' || el.id === 'vo-fiche-modal') continue;
      var st = getComputedStyle(el);
      var pos = st.position;
      if ((pos === 'fixed' || pos === 'absolute') && parseFloat(st.opacity) > 0.1) {
        var bg = st.backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return el;
      }
    }
    // Fallback : cherche dans le front-document (WeWeb iframe)
    try {
      var fw = wwLib.getFrontWindow && wwLib.getFrontWindow();
      if (fw && fw.document && fw.document !== doc) {
        var fdAll = fw.document.querySelectorAll('body > div, body > section');
        for (var j = 0; j < fdAll.length; j++) {
          var fel = fdAll[j]; var fst = fw.getComputedStyle(fel);
          if ((fst.position === 'fixed' || fst.position === 'absolute') && parseFloat(fst.opacity) > 0.1) {
            var fbg = fst.backgroundColor;
            if (fbg && fbg !== 'rgba(0, 0, 0, 0)' && fbg !== 'transparent') return fel;
          }
        }
      }
    } catch (e) { }
    return null;
  }

  function restoreFiche(snap) {
    ficheState.vin = snap.vin; ficheState.row = snap.row; ficheState.tab = snap.tab;
    ficheState.photos = snap.photos; ficheState.apv = snap.apv;
    ficheState.photosLoading = false; ficheState.apvLoading = false;
    renderFichePopup();
    if (snap.tab === 'photos') bindPhotos();
  }

  // (ancienne openFicheDiaporama qui passait par le workflow WeWeb « Diaporama »
  //  RETIRÉE : elle était de toute façon écrasée par la version JS ci-dessous.)


  // ─────────────────────────────────────────────────────────────── Diaporama JS natif  // ─────────────────────────────────────────────────────────────── Diaporama JS natif (z-index contrôlé)
  function openFicheDiaporama(startIdx) {
    var urls = [];
    if (ficheState.photos && ficheState.photos.length) {
      urls = ficheState.photos.map(function (p) { return p.signedUrl; }).filter(Boolean);
    } else {
      urls = images(ficheState.row || {});
      if (!urls.length && mainImage(ficheState.row || {})) urls = [mainImage(ficheState.row || {})];
    }
    showDiaporama(urls, startIdx || 0);
  }

  // Diaporama 100% JS, rendu à partir d'une liste d'URLs. Remplace le workflow
  // WeWeb « Diaporama » et sa popup native : plus aucune dépendance à WeWeb.
  function showDiaporama(urls, startIdx) {
    if (!urls || !urls.length) return;
    var idx = startIdx || 0;
    var old = doc.getElementById('vf-diap-ov'); if (old) old.remove();
    function buildDiap() {
      var total = urls.length;
      var ov = doc.createElement('div'); ov.id = 'vf-diap-ov';
      ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:"Nunito Sans",system-ui,sans-serif';
      // Image principale
      var imgW = doc.createElement('div'); imgW.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;width:100%;padding:48px 70px 10px;position:relative';
      var img = doc.createElement('img'); img.src = urls[idx]; img.style.cssText = 'max-width:100%;max-height:78vh;object-fit:contain;border-radius:8px;display:block;user-select:none';
      imgW.appendChild(img);
      // Compteur
      var ctr = doc.createElement('div'); ctr.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,.12);color:rgba(255,255,255,.85);font-size:13px;font-weight:700;padding:4px 14px;border-radius:999px;white-space:nowrap';
      ctr.textContent = (idx + 1) + ' / ' + total; imgW.appendChild(ctr);
      // Bouton fermer
      var btnClose = doc.createElement('button'); btnClose.style.cssText = 'position:absolute;top:12px;right:16px;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.15);border:none;color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2';
      btnClose.innerHTML = '✕'; btnClose.addEventListener('click', function () { ov.remove(); }); imgW.appendChild(btnClose);
      // Flèches
      if (total > 1) {
        var bL = doc.createElement('button'); bL.style.cssText = 'position:absolute;left:10px;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.15);border:none;color:#fff;font-size:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .12s' + (idx === 0 ? ';opacity:.3;pointer-events:none' : '');
        bL.innerHTML = '‹'; bL.addEventListener('click', function (e) { e.stopPropagation(); if (idx > 0) { idx--; refresh(); } }); imgW.appendChild(bL);
        var bR = doc.createElement('button'); bR.style.cssText = 'position:absolute;right:10px;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.15);border:none;color:#fff;font-size:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .12s' + (idx === total - 1 ? ';opacity:.3;pointer-events:none' : '');
        bR.innerHTML = '›'; bR.addEventListener('click', function (e) { e.stopPropagation(); if (idx < total - 1) { idx++; refresh(); } }); imgW.appendChild(bR);
      }
      ov.appendChild(imgW);
      // Miniatures
      if (total > 1) {
        var thumbRow = doc.createElement('div'); thumbRow.style.cssText = 'display:flex;gap:6px;padding:8px 16px 16px;overflow-x:auto;max-width:100%;justify-content:center;flex-shrink:0';
        urls.forEach(function (u, i) {
          var th = doc.createElement('img'); th.src = u; th.style.cssText = 'width:52px;height:38px;object-fit:cover;border-radius:6px;cursor:pointer;flex:0 0 auto;border:2.5px solid ' + (i === idx ? '#fff' : 'transparent') + ';opacity:' + (i === idx ? '1' : '0.55') + ';transition:all .12s';
          th.addEventListener('click', function (e) { e.stopPropagation(); idx = i; refresh(); }); thumbRow.appendChild(th);
        }); ov.appendChild(thumbRow);
      }
      ov.addEventListener('mousedown', function (e) { if (e.target === ov) ov.remove(); });
      var onKey = function (e) { if (e.key === 'ArrowLeft' && idx > 0) { idx--; refresh(); } else if (e.key === 'ArrowRight' && idx < total - 1) { idx++; refresh(); } else if (e.key === 'Escape') { ov.remove(); doc.removeEventListener('keydown', onKey); } };
      doc.addEventListener('keydown', onKey);
      return ov;
    }
    function refresh() { var old2 = doc.getElementById('vf-diap-ov'); if (old2) old2.remove(); doc.body.appendChild(buildDiap()); }
    doc.body.appendChild(buildDiap());
  }

  // ─────────────────────────────────────────────────────────────── Popup Like / P.Com JS natif
  function openLikePopup() {
    var old = doc.getElementById('vf-like-ov'); if (old) old.remove();
    var row = ficheState.row || {}; var vin = ficheState.vin;
    // Met la variable fiche VO à jour pour que __vopMain la lise
    try { wwLib.wwVariable.updateValue(VAR_FICHE_VO_LOCAL, row); } catch (e) { }
    // Overlay
    var ov = doc.createElement('div'); ov.id = 'vf-like-ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(31,74,133,.5);display:flex;align-items:center;justify-content:center;padding:20px;font-family:"Nunito Sans",system-ui,sans-serif';
    // Modal
    var modal = doc.createElement('div'); modal.style.cssText = 'background:#fff;border-radius:18px;width:100%;max-width:960px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(31,74,133,.35)';
    // Header
    var hd = doc.createElement('div'); hd.style.cssText = 'padding:16px 22px;border-bottom:1px solid #eef2f8;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:#fff';
    var titleEl = doc.createElement('div'); titleEl.style.cssText = 'font-size:17px;font-weight:800;color:#1F4A85';
    titleEl.textContent = 'Like / Proposition commerciale — ' + (esc(row.MARQUE_DMS || '') + ' ' + esc(row.MODELE_DMS || '')).trim() + (vin ? ' (' + esc(vin) + ')' : '');
    var btnX = doc.createElement('button'); btnX.style.cssText = 'width:34px;height:34px;border-radius:50%;border:1.5px solid #e2eaf5;background:#fff;cursor:pointer;color:#7a98c5;display:flex;align-items:center;justify-content:center;font-size:18px';
    btnX.innerHTML = '✕'; btnX.addEventListener('click', function () { ov.remove(); });
    hd.appendChild(titleEl); hd.appendChild(btnX); modal.appendChild(hd);
    // Body : contient le picker
    var body = doc.createElement('div'); body.style.cssText = 'flex:1;overflow-y:auto;padding:20px 22px';
    var pickerRoot = doc.createElement('div'); pickerRoot.id = 'oropra-vo-client-picker';
    body.appendChild(pickerRoot); modal.appendChild(body);
    ov.appendChild(modal);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) ov.remove(); });
    doc.body.appendChild(ov);
    // Lance le picker directement — PAS de workflow (évite le popup WeWeb natif)
    setTimeout(function () { vopBoot(); }, 60);
  }


  // ─────────────────────────────────────────────────────────── Picker Like / P.Com
  // Picker Like/P.Com — injecté dans le scope de vo_liste_v1.js
  // Transformé depuis (function __vopMain(){...})() vers function __vopMain(){...}
  function __vopMain() {

    const VO_VAR_ID = 'bcb187ac-e66e-4bfb-bc48-1b7b7dfda0ba';
    const SELECTED_CLIENT_VAR_ID = '55490583-c88b-4748-916e-4d203db07742';
    const PROPALE_VAR_ID = 'aac565e9-ad32-4f81-bf8d-adb611322e62';
    const LOOKUP_VAR_ID = 'cced74ab-5a0a-418d-9479-2366e05a8754';
    const NPAI_VAR_ID = '7e24f595-e1fd-4257-99f4-76f179032788';
      const WF_GET_FICHE = '53250f54-d14c-4622-baf4-0b89064316b6';
    const PAGE_FICHE_ID = '259f1951-a2d4-4b90-ac83-0b3febe1d4ec';
    const PAGE_PROPO_VO = '8c7d5738-4d1f-4047-b101-814651576678';
    const PAGE_PROPO_VO_UPDATE = 'efb6187d-2330-4392-86ed-bc5ad2489fed';
    const TAB_LIKE = 1;
    const SITE_TABLE = 'SITE';
    const SITE_ID_COL = 'ID_SITE';
    const SITE_AFFAIRE_COL = 'ID_AFFAIRE';
    const GEOPF_ENDPOINT = 'https://data.geopf.fr/geocodage/search';
    const EDGE_FN_SIRENE_SEARCH = 'sirene-search';
    const EDGE_FN_SIRENE_UPSERT = 'sirene-upsert';
    const PAGE_SIZE = 10;

    const vopDoc = doc;
    function getRoot() { return vopDoc.getElementById('oropra-vo-client-picker'); }

    if (!getRoot()) { console.warn('[vop] #oropra-vo-client-picker not found'); return; }

    let userConnected = wwLib.getFrontWindow().oropraUser; if (Array.isArray(userConnected)) userConnected = userConnected[0]; userConnected = userConnected || {};
    const viewerId = userConnected.ID_User;

    function readVar(id) { try { return wwLib.wwVariable.getValue(id); } catch (e) { return null; } }
    const lookup = Array.isArray(readVar(LOOKUP_VAR_ID)) ? readVar(LOOKUP_VAR_ID) : [];
    const civilitesP = lookup.filter(x => x.multivu === 0);
    const typesS = lookup.filter(x => x.multivu === 1);
    const npaiOptionsRaw = readVar(NPAI_VAR_ID);
    const npaiOptions = Array.isArray(npaiOptionsRaw) && npaiOptionsRaw.length ? npaiOptionsRaw : ['Aucun', 'NPAI', 'Décédé'];

    const vo = readVar(VO_VAR_ID) || {};

    const emptyP = () => ({ NOM: '', PRENOM: '', EMAIL: '', IDVu: '', tel: '', ville: '', cp: '', birthMin: '', birthMax: '', CSP: '', marque: '' });
    const emptyS = () => ({ SIRET: '', NOM: '', EMAIL: '', IDVu: '' });

    const state = window.__vop || {};
    state.activeTab = 'particulier';
    state.showMore = false;
    state.filters = { particulier: emptyP(), societe: emptyS() };
    state.page = 1;
    state.results = [];
    state.totalCount = 0;
    state.loading = false;
    state.searched = false;
    state.error = null;
    state.modal = null;
    state.busy = false;
    state.busyError = null;
    (function preselect() {
      const cur = readVar(SELECTED_CLIENT_VAR_ID);
      if (cur && typeof cur === 'object' && cur.IDVu != null) {
        const c = JSON.parse(JSON.stringify(cur));
        delete c.full_count;
        state.selectedClient = c;
      } else { state.selectedClient = null; }
    })();
    window.__vop = state;

    function vopEsc(s) {
      if (s == null) return '';
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function cleanDigits(s) { return s == null ? '' : String(s).replace(/\D/g, ''); }
    function cleanEmail(s) { return s == null ? '' : String(s).trim().toLowerCase(); }
    function isValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim()); }
    function isValidMobile(s) { const d = cleanDigits(s); return /^(0[67]\d{8}|33[67]\d{8})$/.test(d); }
    function isValidFixe(s) { const d = cleanDigits(s); return /^(0[1-589]\d{8}|33[1-589]\d{8})$/.test(d); }
    function clientFullName(c) {
      if (!c) return '';
      const soc = c.idmultivu === 1 || c.idmultivu === '1';
      return soc ? [c.CIVILITE, c.NOM].filter(Boolean).join(' ') : [c.CIVILITE, c.PRENOM, c.NOM].filter(Boolean).join(' ');
    }
    function _writeVar(varId, value) {
      try { wwLib.wwVariable.updateValue(varId, value); return; } catch (e) { }
    }
    const PAGE_PATHS = {
      '259f1951-a2d4-4b90-ac83-0b3febe1d4ec': '/fr/fiche-client',
      '8c7d5738-4d1f-4047-b101-814651576678': '/fr/propo-vo-create',
      'efb6187d-2330-4392-86ed-bc5ad2489fed': '/fr/propo-vo-update'
    };
    function inEditor() { try { return window.self !== window.top; } catch (e) { return true; } }
    function goToPage(pageId) {
      if (inEditor()) {
        // Éditeur : UID uniquement (chemin se résoudrait sur l'origine éditeur → poupées russes)
        try { wwLib.wwApp.goTo(pageId); return; } catch (e) { }
        try { wwLib.goTo(pageId); } catch (e) { }
      } else {
        // Prod : chemin URL propre (/fr/...) — l'UID en prod = route inexistante → page vide
        const path = PAGE_PATHS[pageId];
        if (path) { try { wwLib.goTo(path); return; } catch (e) { } }
        try { wwLib.wwApp.goTo(pageId); } catch (e) { }
      }
    }

    async function lookupAffaire(idSite) {
      if (idSite == null) return null;
      try {
        const supabase = ctx.supabase;
        const { data } = await supabase.from(SITE_TABLE).select(SITE_AFFAIRE_COL).eq(SITE_ID_COL, idSite).limit(1).maybeSingle();
        return (data && data[SITE_AFFAIRE_COL] != null) ? Number(data[SITE_AFFAIRE_COL]) : null;
      } catch (e) { return null; }
    }

    async function upsertClientStock(client) {
      const vin = vo.VIN;
      if (!vin || client.IDVu == null) return;
      const supabase = ctx.supabase;
      const idClient = Number(client.IDVu);
      const now = new Date().toISOString();
      const { data: existing } = await supabase.from('CLIENT_STOCK').select('id_client_stock').eq('ID_CLIENT', idClient).eq('VIN', vin).limit(1).maybeSingle();
      if (existing) {
        await supabase.from('CLIENT_STOCK').update({ Status: 'interested', update_date: now }).eq('id_client_stock', existing.id_client_stock);
        return;
      }
      const { data: maxRow } = await supabase.from('CLIENT_STOCK').select('id_client_stock').order('id_client_stock', { ascending: false }).limit(1).maybeSingle();
      const nextId = (maxRow && maxRow.id_client_stock != null ? Number(maxRow.id_client_stock) : 0) + 1;
      const idAffaire = await lookupAffaire(vo.IDSITE);
      await supabase.from('CLIENT_STOCK').insert({
        id_client_stock: nextId, ID_CLIENT: idClient, VIN: vin, Status: 'interested',
        NomModele: vo.MODELE_DMS || null, VERSION: vo.VERSION_EUROTAX || null, IMMAT: vo.NO_IMMAT || null,
        MARQUE: vo.MARQUE_DMS || null, ID_AFFAIRE: idAffaire, ID_USER: viewerId != null ? Number(viewerId) : null,
        TYPE_STOCK: 'VO', DT_PMEC: vo.D_1MEC || null, creation_date: now, update_date: now
      });
    }

    async function findActivePropale(client) {
      const vin = vo.VIN;
      if (!vin || client.IDVu == null || viewerId == null) return null;
      try {
        const supabase = ctx.supabase;
        const { data, error } = await supabase
          .from('PROPALE_BDC')
          .select('id_propale_bdc')
          .eq('VIN', vin)
          .eq('id_client_vu', Number(client.IDVu))
          .eq('id_user_creation', Number(viewerId))
          .not('status', 'in', '("draft","win","lose")')
          .neq('Archived', true)
          .limit(1)
          .maybeSingle();
        if (error) { console.warn('[vop] findActivePropale', error.message); return null; }
        return data || null;
      } catch (e) { console.warn('[vop] findActivePropale catch', e); return null; }
    }

    function setBusy(v, err) { state.busy = v; state.busyError = err || null; render(); }

    async function doLike() {
      if (!state.selectedClient || state.busy) return;
      setBusy(true);
      try {
        const client = state.selectedClient;
        _writeVar(SELECTED_CLIENT_VAR_ID, Object.assign({}, client));
        await upsertClientStock(client);
        // (client déjà écrit dans SELECTED_CLIENT_VAR_ID ci-dessus -> fiche-shell recharge)
        // Ferme popup Like ET popup Fiche VO
        const ovLike = vopDoc.getElementById('vf-like-ov'); if (ovLike) ovLike.remove();
        const ovFiche = vopDoc.getElementById('vo-fiche-overlay'); if (ovFiche) ovFiche.remove();
        // Onglet demandé (TAB_LIKE = 1) via le global lu par fiche-shell
        try { const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window; w.__odFicheTab = TAB_LIKE; } catch (e) { }
        goToPage(PAGE_FICHE_ID);
      } catch (e) { setBusy(false, e.message || String(e)); }
    }

    async function doPcom() {
      if (!state.selectedClient || state.busy) return;
      setBusy(true);
      try {
        const client = state.selectedClient;
        console.log('[vop] doPcom start', { client: client.IDVu, vin: vo.VIN });
        _writeVar(SELECTED_CLIENT_VAR_ID, Object.assign({}, client));
        console.log('[vop] doPcom writeVar OK');
        await upsertClientStock(client);
        console.log('[vop] doPcom upsertClientStock OK');
        const propale = await findActivePropale(client);
        console.log('[vop] doPcom findActivePropale OK', propale);
        // Ferme les popups
        const ovLike = vopDoc.getElementById('vf-like-ov'); if (ovLike) ovLike.remove();
        const ovFiche = vopDoc.getElementById('vo-fiche-overlay'); if (ovFiche) ovFiche.remove();
        console.log('[vop] doPcom popups fermés, navigation vers', propale ? PAGE_PROPO_VO_UPDATE : PAGE_PROPO_VO);
        if (propale && propale.id_propale_bdc != null) {
          _writeVar(PROPALE_VAR_ID, Number(propale.id_propale_bdc));
          goToPage(PAGE_PROPO_VO_UPDATE);
        } else {
          goToPage(PAGE_PROPO_VO);
        }
        console.log('[vop] doPcom goToPage appelé');
      } catch (e) {
        console.error('[vop] doPcom ERREUR', e);
        setBusy(false, 'Erreur : ' + (e.message || String(e)));
      }
    }

    function buildQuery(supabase) {
      const tab = state.activeTab;
      const f = state.filters[tab];
      let q = supabase.from('CLIENT').select('*', { count: 'exact' });
      q = q.eq('idmultivu', tab === 'societe' ? 1 : 0);
      if (tab === 'particulier') {
        if (f.NOM) q = q.ilike('NOM', `%${f.NOM}%`);
        if (f.PRENOM) q = q.ilike('PRENOM', `%${f.PRENOM}%`);
        if (f.EMAIL) q = q.ilike('EMAIL', `%${f.EMAIL}%`);
        if (f.IDVu) q = q.eq('IDVu', Number(f.IDVu));
        if (f.tel) q = q.or(`TEl_MOB.ilike.%${f.tel}%,TEL_FIXE.ilike.%${f.tel}%`);
        if (f.ville) q = q.ilike('ville', `%${f.ville}%`);
        if (f.cp) q = q.ilike('code_postal', `${f.cp}%`);
        if (f.birthMin) q = q.gte('BIRTHDAY', f.birthMin);
        if (f.birthMax) q = q.lte('BIRTHDAY', f.birthMax);
        if (f.CSP) q = q.ilike('CSP', `%${f.CSP}%`);
        if (f.marque) q = q.ilike('MARQUE_CLIENT_VEHICULE', `%${f.marque}%`);
      } else {
        if (f.SIRET) { const c = cleanDigits(f.SIRET); if (c) q = q.eq('SIRET', c); }
        if (f.NOM) q = q.ilike('NOM', `%${f.NOM}%`);
        if (f.EMAIL) q = q.ilike('EMAIL', `%${f.EMAIL}%`);
        if (f.IDVu) q = q.eq('IDVu', Number(f.IDVu));
      }
      const start = (state.page - 1) * PAGE_SIZE;
      q = q.order('NOM', { ascending: true, nullsFirst: false }).range(start, start + PAGE_SIZE - 1);
      return q;
    }

    async function runSearch() {
      state.loading = true; state.searched = true; render();
      try {
        const supabase = ctx.supabase;
        const { data, error, count } = await buildQuery(supabase);
        if (error) throw error;
        state.results = data || []; state.totalCount = count || 0; state.error = null;
      } catch (e) { state.error = e.message || String(e); state.results = []; state.totalCount = 0; }
      state.loading = false; render();
    }

    function clearFilters() {
      state.filters[state.activeTab] = state.activeTab === 'particulier' ? emptyP() : emptyS();
      state.page = 1; state.results = []; state.totalCount = 0; state.searched = false; state.error = null; render();
    }
    function changeTab(tab) {
      if (state.activeTab === tab) return;
      state.activeTab = tab; state.page = 1; state.results = []; state.totalCount = 0;
      state.searched = false; state.error = null; state.showMore = false; render();
    }
    function pickClient(row) { state.selectedClient = Object.assign({}, row); render(); }
    function changePage(p) {
      const total = Math.max(1, Math.ceil(state.totalCount / PAGE_SIZE));
      if (p < 1 || p > total || p === state.page) return;
      state.page = p; runSearch();
    }
    function buildPagerItems(current, total) {
      if (total <= 1) return [];
      if (total <= 7) { const a = []; for (let i = 1; i <= total; i++) a.push({ page: i }); return a; }
      const set = new Set([1, total, current]);
      if (current > 1) set.add(current - 1);
      if (current < total) set.add(current + 1);
      const arr = Array.from(set).sort((a, b) => a - b);
      const out = []; let prev = 0;
      for (const p of arr) { if (p > prev + 1) out.push({ ellipsis: true }); out.push({ page: p }); prev = p; }
      return out;
    }

    function openCreateModal() {
      const f = state.filters[state.activeTab];
      const isSoc = state.activeTab === 'societe';
      state.modal = {
        isSoc, saving: false, error: null, duplicate: null,
        addressQuery: '', addressSuggestions: [], addressLoading: false,
        siretQuery: isSoc && f.SIRET ? cleanDigits(f.SIRET) : '', siretSuggestions: [], siretLoading: false,
        data: {
          CIVILITE: '', NOM: f.NOM || '', PRENOM: !isSoc ? (f.PRENOM || '') : '',
          BIRTHDAY: '', EMAIL: f.EMAIL || '', TEl_MOB: !isSoc ? (f.tel || '') : '', TEL_FIXE: '',
          ADRESSE: '', code_postal: !isSoc ? (f.cp || '') : '', ville: !isSoc ? (f.ville || '') : '',
          code_insee: '', lat: null, lon: null, adresse_label: '', adresse_source: 'manual',
          adresse_status: null, adresse_score: null, adresse_ban: null,
          STOP_COM: false, NPAI: 'Aucun', CSP: '', PROFESSION: '', LOISIR: '',
          MARQUE_CLIENT_VEHICULE: '', MODELE_CLIENT_VEHICULE: '', ANNEE_CLIENT_VEHICULE: '',
          KM_CLIENT_VEHICULE: '', KM_MOY: '', COMMENTAIRE: '',
          SIRET: isSoc && f.SIRET ? cleanDigits(f.SIRET) : '', idmultivu: isSoc ? 1 : 0
        }
      };
      render();
    }
    function closeModal() { state.modal = null; render(); }
    function updateModalField(field, value) { if (state.modal) state.modal.data[field] = value; }

    function validateModal() {
      if (!state.modal) return null;
      const d = state.modal.data; const isSoc = state.modal.isSoc; const errors = [];
      if (isSoc) {
        if (!cleanDigits(d.SIRET) || cleanDigits(d.SIRET).length !== 14) errors.push('Le SIRET doit comporter 14 chiffres.');
        if (!d.NOM || !String(d.NOM).trim()) errors.push('La raison sociale est obligatoire.');
      } else {
        if (!d.CIVILITE) errors.push('La civilité est obligatoire.');
        if (!d.NOM || !String(d.NOM).trim()) errors.push('Le nom est obligatoire.');
        if (!d.PRENOM || !String(d.PRENOM).trim()) errors.push('Le prénom est obligatoire.');
        if (!d.TEl_MOB) errors.push('Le téléphone portable est obligatoire.');
        else if (!isValidMobile(d.TEl_MOB)) errors.push('Téléphone portable invalide (06/07).');
        if (!d.EMAIL) errors.push("L'email est obligatoire.");
        else if (!isValidEmail(d.EMAIL)) errors.push("Email invalide.");
      }
      if (d.TEL_FIXE && !isValidFixe(d.TEL_FIXE)) errors.push('Téléphone fixe invalide.');
      if (isSoc && d.TEl_MOB && !isValidMobile(d.TEl_MOB)) errors.push('Téléphone portable invalide.');
      if (isSoc && d.EMAIL && !isValidEmail(d.EMAIL)) errors.push('Email invalide.');
      return errors.length ? errors : null;
    }

    async function checkDuplicates() {
      if (!state.modal) return null;
      const d = state.modal.data; const supabase = ctx.supabase;
      const selectCols = 'IDVu, CIVILITE, NOM, PRENOM, EMAIL, TEl_MOB, idmultivu, code_postal, ville';
      const cleanMob = cleanDigits(d.TEl_MOB);
      if (cleanMob) {
        const { data: dup } = await supabase.from('CLIENT').select(selectCols).eq('TEl_MOB', cleanMob).limit(1).maybeSingle();
        if (dup) return { field: 'TEl_MOB', label: 'Ce numéro de portable', client: dup };
      }
      const e = cleanEmail(d.EMAIL);
      if (e) {
        const { data: dup } = await supabase.from('CLIENT').select(selectCols).ilike('EMAIL', e).limit(1).maybeSingle();
        if (dup) return { field: 'EMAIL', label: 'Cette adresse email', client: dup };
      }
      return null;
    }
    function dismissDuplicate() { if (state.modal) state.modal.duplicate = null; render(); }
    function viewDuplicate() {
      if (!state.modal || !state.modal.duplicate) return;
      state.selectedClient = Object.assign({}, state.modal.duplicate.client);
      state.modal = null; render();
    }

    async function saveCreation() {
      if (!state.modal) return;
      const errs = validateModal();
      if (errs) { state.modal.error = errs.join(' '); state.modal.duplicate = null; render(); return; }
      state.modal.saving = true; state.modal.error = null; state.modal.duplicate = null; render();
      try {
        const dup = await checkDuplicates();
        if (dup) { state.modal.duplicate = dup; state.modal.saving = false; render(); return; }
        const supabase = ctx.supabase;
        const now = new Date().toISOString();
        const { data: maxRow } = await supabase.from('CLIENT').select('IDVu').order('IDVu', { ascending: false }).limit(1).maybeSingle();
        const nextIDVu = (maxRow && maxRow.IDVu != null ? Number(maxRow.IDVu) : 0) + 1;
        const isSoc = state.modal.isSoc;
        const payload = Object.assign({}, state.modal.data, {
          IDVu: nextIDVu, CreationDate: now, UpdateDate: now,
          ID_VENDEUR_CREATION: viewerId != null ? String(viewerId) : null,
          ID_VENDEUR_UPDATE: viewerId != null ? String(viewerId) : null,
          adresse_checked_at: state.modal.data.adresse_status === 'verified' ? now : null,
          CP_VILLE: [state.modal.data.code_postal, state.modal.data.ville].filter(Boolean).join(' ')
        });
        if (payload.TEl_MOB) payload.TEl_MOB = cleanDigits(payload.TEl_MOB);
        if (payload.TEL_FIXE) payload.TEL_FIXE = cleanDigits(payload.TEL_FIXE);
        if (payload.EMAIL) payload.EMAIL = cleanEmail(payload.EMAIL);
        ['ANNEE_CLIENT_VEHICULE', 'KM_CLIENT_VEHICULE', 'KM_MOY', 'SIRET', 'adresse_score'].forEach(k => {
          if (payload[k] === '' || payload[k] == null) payload[k] = null;
          else if (k === 'adresse_score') payload[k] = Number(payload[k]);
          else payload[k] = Number(cleanDigits(payload[k])) || null;
        });
        if (payload.BIRTHDAY === '') payload.BIRTHDAY = null;
        const { data: inserted, error } = await supabase.from('CLIENT').insert(payload).select('*').single();
        if (error) throw error;
        if (isSoc && payload.SIRET) {
          try { await supabase.functions.invoke(EDGE_FN_SIRENE_UPSERT, { body: { siret: String(payload.SIRET), idvu: String(nextIDVu), setPrimary: true } }); } catch (e) { }
        }
        state.selectedClient = Object.assign({}, inserted);
        state.modal = null; render();
      } catch (e) { state.modal.saving = false; state.modal.error = e.message || String(e); render(); }
    }

    async function inseeSearchAddress(query) {
      const url = `${GEOPF_ENDPOINT}?q=${encodeURIComponent(query)}&limit=8`;
      const r = await fetch(url); if (!r.ok) throw new Error('Geocoding ' + r.status);
      const json = await r.json();
      return (json?.features || []).map(f => ({ label: f?.properties?.label || '', value: f?.properties?.id || '', raw: f })).filter(o => o.label && o.value);
    }
    let addressDebounce = null;
    function onAddressInput(query) {
      if (!state.modal) return;
      state.modal.addressQuery = query; state.modal.data.ADRESSE = query;
      state.modal.data.adresse_source = 'manual'; state.modal.data.adresse_status = null;
      if (!query || query.length < 4) { state.modal.addressSuggestions = []; render(); return; }
      if (addressDebounce) clearTimeout(addressDebounce);
      addressDebounce = setTimeout(async () => {
        state.modal.addressLoading = true; render();
        try { state.modal.addressSuggestions = await inseeSearchAddress(query); } catch (e) { state.modal.addressSuggestions = []; }
        state.modal.addressLoading = false; render();
      }, 350);
    }
    function applyAddressSuggestion(s) {
      if (!state.modal) return;
      const p = (s.raw && s.raw.properties) || {};
      const c = (s.raw && s.raw.geometry && s.raw.geometry.coordinates) || [];
      Object.assign(state.modal.data, {
        ADRESSE: p.name || p.label || '', code_postal: p.postcode || '', ville: p.city || '',
        code_insee: p.citycode || '', lat: c[1] != null ? Number(c[1]) : null, lon: c[0] != null ? Number(c[0]) : null,
        adresse_label: p.label || '', adresse_source: 'ban', adresse_status: 'verified',
        adresse_score: p.score != null ? Number(p.score) : null, adresse_ban: s.raw || null
      });
      state.modal.addressSuggestions = []; state.modal.addressQuery = p.label || ''; render();
    }
    async function inseeSearchSiret(query) {
      const supabase = ctx.supabase;
      const qs = new URLSearchParams({ query, limit: '8', activeOnly: 'false' }).toString();
      const { data, error } = await supabase.functions.invoke(`${EDGE_FN_SIRENE_SEARCH}?${qs}`, { method: 'GET' });
      if (error) throw error;
      return (data && data.items) || [];
    }
    let siretDebounce = null;
    function onSiretInput(query) {
      if (!state.modal) return;
      state.modal.siretQuery = query;
      const onlyDigits = cleanDigits(query);
      if (onlyDigits === query.replace(/\s/g, '')) state.modal.data.SIRET = onlyDigits;
      if (!query || query.length < 2) { state.modal.siretSuggestions = []; render(); return; }
      if (siretDebounce) clearTimeout(siretDebounce);
      siretDebounce = setTimeout(async () => {
        state.modal.siretLoading = true; render();
        try { state.modal.siretSuggestions = await inseeSearchSiret(query); } catch (e) { state.modal.siretSuggestions = []; state.modal.error = e.message || String(e); }
        state.modal.siretLoading = false; render();
      }, 400);
    }
    function applySiretSuggestion(item) {
      if (!state.modal) return;
      const t = typesS.find(x => String(x.code) === String(item.categorie_juridique_code));
      Object.assign(state.modal.data, {
        SIRET: cleanDigits(item.siret), NOM: item.raison_sociale || state.modal.data.NOM,
        CIVILITE: t ? t.libelle_court : state.modal.data.CIVILITE,
        ADRESSE: item.adresse_ligne1 || '', code_postal: item.code_postal || '', ville: item.commune || '',
        adresse_label: item.adresse || '', adresse_source: 'sirene', adresse_status: 'verified',
        adresse_score: null, code_insee: '', lat: null, lon: null
      });
      state.modal.siretSuggestions = []; state.modal.siretQuery = cleanDigits(item.siret);
      state.modal.addressQuery = item.adresse || item.adresse_ligne1 || ''; render();
    }

    const VOP_ICON_P = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
    const VOP_ICON_S = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21V12h6v9"/></svg>';
    const VOP_ICON_MOB = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/></svg>';
    const VOP_ICON_FIXE = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
    const VOP_ICON_PLUS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
    const VOP_ICON_MINUS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
    const VOP_ICON_REFRESH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
    const VOP_ICON_SEARCH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
    const VOP_ICON_CLOSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    const VOP_ICON_WARN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17"/></svg>';
    const VOP_ICON_HEART = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    const VOP_ICON_DOC = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
    const VOP_ICON_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

    const VOP_STYLE = `<style id="vop-style">
  #oropra-vo-client-picker{font-family:"Nunito Sans",system-ui,sans-serif;color:#2a5ea9;display:flex;flex-direction:column;height:100%}
  #oropra-vo-client-picker *{box-sizing:border-box}
  #oropra-vo-client-picker .vop-body{overflow-y:auto;flex:1;padding:2px}
  #oropra-vo-client-picker .vop-selected{background:#eef9f5;border:1px solid #b6e3d6;border-radius:10px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:flex-start;gap:12px}
  #oropra-vo-client-picker .vop-selected.is-empty{background:#fdf2dd;border-color:#f5c785}
  #oropra-vo-client-picker .vop-selected-icon{flex:0 0 auto;width:34px;height:34px;border-radius:50%;background:#53bda7;color:#fff;display:flex;align-items:center;justify-content:center}
  #oropra-vo-client-picker .vop-selected.is-empty .vop-selected-icon{background:#fac055}
  #oropra-vo-client-picker .vop-selected-label{font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#3d8a76;font-weight:700;margin-bottom:3px}
  #oropra-vo-client-picker .vop-selected.is-empty .vop-selected-label{color:#a65f00}
  #oropra-vo-client-picker .vop-selected-name{font-size:15px;font-weight:700;color:#2a5ea9}
  #oropra-vo-client-picker .vop-selected-detail{font-size:12px;color:#5a7ba8;margin-top:3px}
  #oropra-vo-client-picker .vop-tabs{display:flex;border-bottom:1px solid #e3edf9;margin-bottom:16px}
  #oropra-vo-client-picker .vop-tab{display:inline-flex;align-items:center;gap:8px;padding:11px 16px;cursor:pointer;color:#acc5e4;font-size:13px;font-weight:600;border:none;background:none;border-bottom:2px solid transparent;margin-bottom:-1px;font-family:inherit}
  #oropra-vo-client-picker .vop-tab.is-active{color:#53bda7;border-bottom-color:#53bda7}
  #oropra-vo-client-picker .vop-form{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 14px;margin-bottom:12px}
  #oropra-vo-client-picker .vop-field{display:flex;flex-direction:column}
  #oropra-vo-client-picker .vop-label{font-size:11px;color:#7a98c5;margin-bottom:4px;text-transform:uppercase;letter-spacing:.4px;font-weight:600}
  #oropra-vo-client-picker .vop-input{border:1.5px solid #e2eaf5;border-radius:8px;padding:9px 11px;font-size:13px;color:#1F4A85;outline:none;background:#fff;font-family:inherit;width:100%;transition:border-color .12s}
  #oropra-vo-client-picker .vop-input:focus{border-color:#2a5ea9}
  #oropra-vo-client-picker .vop-input::placeholder{color:#acc5e4}
  #oropra-vo-client-picker select.vop-input{cursor:pointer;appearance:none}
  #oropra-vo-client-picker .vop-toolbar{display:flex;align-items:center;justify-content:space-between;margin:12px 0;gap:12px;flex-wrap:wrap}
  #oropra-vo-client-picker .vop-tsec{display:flex;align-items:center;flex:1}
  #oropra-vo-client-picker .vop-tsec.right{justify-content:flex-end}
  #oropra-vo-client-picker .vop-more{display:inline-flex;align-items:center;gap:6px;color:#2a5ea9;font-size:13px;cursor:pointer;background:none;border:none;font-family:inherit;font-weight:600}
  #oropra-vo-client-picker .vop-pager{display:inline-flex;align-items:center;gap:2px}
  #oropra-vo-client-picker .vop-pager-item{padding:6px 10px;cursor:pointer;color:#2a5ea9;font-size:13px;border-radius:6px;background:none;border:none;font-family:inherit;min-width:28px;font-weight:600}
  #oropra-vo-client-picker .vop-pager-item.is-active{background:#eef4fc}
  #oropra-vo-client-picker .vop-pager-item:disabled{color:#cad6e5;cursor:not-allowed}
  #oropra-vo-client-picker .vop-btns{display:flex;gap:8px}
  #oropra-vo-client-picker .vop-btn{padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:1.5px solid transparent;outline:none;font-family:inherit;display:inline-flex;align-items:center;gap:6px}
  #oropra-vo-client-picker .vop-btn-primary{background:#2a5ea9;color:#fff;border-color:#2a5ea9}
  #oropra-vo-client-picker .vop-btn-primary:hover{background:#1F4A85}
  #oropra-vo-client-picker .vop-btn-ghost{background:transparent;color:#2a5ea9;border-color:#e2eaf5}
  #oropra-vo-client-picker .vop-btn-ghost:hover{border-color:#2a5ea9}
  #oropra-vo-client-picker .vop-table{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}
  #oropra-vo-client-picker .vop-table thead th{background:#f4f7fc;padding:9px 12px;text-align:left;color:#2a5ea9;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
  #oropra-vo-client-picker .vop-table tbody tr{border-bottom:1px solid #f0f4fa;cursor:pointer;transition:background .1s}
  #oropra-vo-client-picker .vop-table tbody tr:hover{background:#f7fafd}
  #oropra-vo-client-picker .vop-table tbody tr.is-picked{background:#eef9f5}
  #oropra-vo-client-picker .vop-table tbody tr.is-picked td:first-child{box-shadow:inset 3px 0 0 #53bda7}
  #oropra-vo-client-picker .vop-table td{padding:12px;color:#2a5ea9;vertical-align:middle}
  #oropra-vo-client-picker .vop-tel-row{display:flex;align-items:center;gap:5px;font-size:12px}
  #oropra-vo-client-picker .vop-pick-dot{width:22px;height:22px;border-radius:50%;border:2px solid #e2eaf5;display:inline-flex;align-items:center;justify-content:center;color:transparent}
  #oropra-vo-client-picker tr.is-picked .vop-pick-dot{border-color:#53bda7;background:#53bda7;color:#fff}
  #oropra-vo-client-picker .vop-empty{padding:36px;text-align:center;color:#9bb3d1;font-size:13px;font-weight:600}
  #oropra-vo-client-picker .vop-footer{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:14px 4px 4px;border-top:1px solid #eef2f8;margin-top:8px;flex-shrink:0}
  #oropra-vo-client-picker .vop-footer-err{flex:1;color:#e24b4a;font-size:12px;font-weight:600}
  #oropra-vo-client-picker .vop-act{padding:10px 22px;border-radius:999px;font-size:14px;font-weight:700;cursor:pointer;border:1.5px solid transparent;outline:none;font-family:inherit;display:inline-flex;align-items:center;gap:8px;transition:all .12s}
  #oropra-vo-client-picker .vop-act-like{background:#fff;color:#e24b4a;border-color:#e24b4a}
  #oropra-vo-client-picker .vop-act-like:hover:not(:disabled){background:#fcebeb}
  #oropra-vo-client-picker .vop-act-pcom{background:#2a5ea9;color:#fff;border-color:#2a5ea9}
  #oropra-vo-client-picker .vop-act-pcom:hover:not(:disabled){background:#1F4A85}
  #oropra-vo-client-picker .vop-act:disabled{opacity:.4;cursor:not-allowed}
  #oropra-vo-client-picker .vop-spinner{display:inline-block;width:13px;height:13px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:vop-spin .8s linear infinite}
  #oropra-vo-client-picker .vop-act-like .vop-spinner{border-color:#f3c4c4;border-top-color:#e24b4a}
  @keyframes vop-spin{to{transform:rotate(360deg)}}
  #oropra-vo-client-picker .vop-modal-overlay{position:absolute;inset:0;background:rgba(42,94,169,.35);z-index:10;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto}
  #oropra-vo-client-picker .vop-modal{background:#fff;border-radius:14px;width:100%;max-width:700px;box-shadow:0 20px 60px rgba(0,0,0,.18);display:flex;flex-direction:column;max-height:calc(100vh - 200px)}
  #oropra-vo-client-picker .vop-modal-header{padding:14px 20px;border-bottom:1px solid #eef2f8;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
  #oropra-vo-client-picker .vop-modal-title{font-size:16px;font-weight:800;margin:0;color:#1F4A85}
  #oropra-vo-client-picker .vop-modal-close{background:none;border:none;cursor:pointer;color:#9bb3d1;padding:4px;display:flex}
  #oropra-vo-client-picker .vop-modal-body{padding:16px 20px;overflow-y:auto;flex:1}
  #oropra-vo-client-picker .vop-section{margin-bottom:18px}
  #oropra-vo-client-picker .vop-section-title{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9bb3d1;margin:0 0 10px;font-weight:800}
  #oropra-vo-client-picker .vop-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 14px}
  #oropra-vo-client-picker .vop-grid .full{grid-column:1 / -1}
  #oropra-vo-client-picker .vop-grid .two{grid-column:span 2}
  #oropra-vo-client-picker .vop-modal-footer{padding:12px 20px;border-top:1px solid #eef2f8;display:flex;justify-content:flex-end;gap:8px;flex-shrink:0}
  #oropra-vo-client-picker .vop-modal-error{color:#e24b4a;font-size:13px;padding:10px 13px;background:#fcebeb;border-radius:8px;margin-bottom:12px;border:1px solid #f5a5a5;font-weight:600}
  #oropra-vo-client-picker .vop-dup{background:#fff8e8;border:1px solid #fac055;border-radius:10px;padding:14px;margin-bottom:14px;display:flex;flex-direction:column;gap:10px}
  #oropra-vo-client-picker .vop-dup-head{display:flex;gap:10px;align-items:flex-start;color:#854f0b;font-weight:700}
  #oropra-vo-client-picker .vop-dup-client{font-size:13px;line-height:1.5}
  #oropra-vo-client-picker .vop-dup-actions{display:flex;gap:8px;justify-content:flex-end}
  #oropra-vo-client-picker .vop-checkbox{display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:8px 0}
  #oropra-vo-client-picker .vop-ac{position:relative}
  #oropra-vo-client-picker .vop-suggestions{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1.5px solid #e2eaf5;border-radius:8px;box-shadow:0 6px 20px rgba(42,94,169,.12);z-index:20;max-height:240px;overflow-y:auto}
  #oropra-vo-client-picker .vop-sg{padding:9px 12px;cursor:pointer;font-size:13px;border-bottom:.5px solid #f0f4fa}
  #oropra-vo-client-picker .vop-sg:hover{background:#f2f6fc}
  #oropra-vo-client-picker .vop-status{font-size:11px;color:#53bda7;margin-top:4px;display:inline-flex;align-items:center;gap:4px}
  @media(max-width:640px){
    #oropra-vo-client-picker .vop-form{grid-template-columns:1fr 1fr}
    #oropra-vo-client-picker .vop-grid{grid-template-columns:1fr 1fr}
    #oropra-vo-client-picker .vop-table thead{display:none}
    #oropra-vo-client-picker .vop-table tbody tr{display:block;padding:10px 12px;border-bottom:1px solid #eef2f8}
    #oropra-vo-client-picker .vop-table td{display:inline;padding:0 4px 0 0;font-size:12px}
    #oropra-vo-client-picker .vop-act{padding:9px 16px;font-size:13px}
  }
  </style>`;

    function fieldHtml(label, field, type, placeholder) {
      const val = state.filters[state.activeTab][field] || '';
      const isDate = type === 'date';
      return `<div class="vop-field">${isDate ? `<label class="vop-label">${vopEsc(label)}</label>` : ''}<input class="vop-input" type="${type || 'text'}" data-vop-field="${vopEsc(field)}" value="${vopEsc(val)}" placeholder="${vopEsc(placeholder || label)}" /></div>`;
    }

    function renderSelectedCard() {
      const c = state.selectedClient;
      if (!c) return `<div class="vop-selected is-empty"><div class="vop-selected-icon">${VOP_ICON_WARN}</div><div><div class="vop-selected-label">Aucun client sélectionné</div><div class="vop-selected-detail">Recherchez ou créez un client ci-dessous.</div></div></div>`;
      const soc = c.idmultivu === 1 || c.idmultivu === '1';
      const detail = [c.IDVu ? 'ID ' + vopEsc(c.IDVu) : '', c.EMAIL ? vopEsc(c.EMAIL) : '', c.TEl_MOB ? vopEsc(c.TEl_MOB) : '', [c.code_postal, c.ville].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
      return `<div class="vop-selected"><div class="vop-selected-icon">${soc ? VOP_ICON_S : VOP_ICON_P}</div><div><div class="vop-selected-label">Client sélectionné</div><div class="vop-selected-name">${vopEsc(clientFullName(c))}</div><div class="vop-selected-detail">${detail}</div></div></div>`;
    }

    function renderForm() {
      const tab = state.activeTab;
      let h = '<div class="vop-form">';
      if (tab === 'particulier') {
        h += fieldHtml('Nom', 'NOM') + fieldHtml('Prénom', 'PRENOM') + fieldHtml('Email', 'EMAIL') + fieldHtml('ID Client', 'IDVu') + '<div></div><div></div>';
        if (state.showMore) h += fieldHtml('Téléphone', 'tel') + fieldHtml('Ville', 'ville') + fieldHtml('Code postal', 'cp') + fieldHtml('Né(e) après le', 'birthMin', 'date') + fieldHtml('Né(e) avant le', 'birthMax', 'date') + fieldHtml('CSP', 'CSP') + fieldHtml('Marque véhicule', 'marque');
      } else {
        h += fieldHtml('SIRET', 'SIRET') + fieldHtml('Raison sociale', 'NOM') + fieldHtml('Email', 'EMAIL') + fieldHtml('ID Client', 'IDVu') + '<div></div><div></div>';
      }
      return h + '</div>';
    }

    function renderToolbar() {
      const total = Math.max(1, Math.ceil(state.totalCount / PAGE_SIZE));
      let h = '<div class="vop-toolbar"><div class="vop-tsec">';
      if (state.activeTab === 'particulier') h += `<button class="vop-more" data-vop-action="toggle-more">${state.showMore ? VOP_ICON_MINUS : VOP_ICON_PLUS}<span>${state.showMore ? 'Moins de critères' : 'Plus de critères'}</span></button>`;
      h += '</div><div class="vop-tsec" style="justify-content:center">';
      if (state.searched && state.totalCount > 0) {
        h += '<div class="vop-pager">';
        h += `<button class="vop-pager-item" data-vop-action="prev-page"${state.page <= 1 ? ' disabled' : ''}>‹</button>`;
        for (const it of buildPagerItems(state.page, total)) {
          if (it.ellipsis) h += '<span style="padding:0 4px;color:#acc5e4">…</span>';
          else h += `<button class="vop-pager-item${it.page === state.page ? ' is-active' : ''}" data-vop-action="page" data-page="${it.page}">${it.page}</button>`;
        }
        h += `<button class="vop-pager-item" data-vop-action="next-page"${state.page >= total ? ' disabled' : ''}>›</button></div>`;
      }
      h += '</div><div class="vop-tsec right"><div class="vop-btns">';
      h += `<button class="vop-btn vop-btn-ghost" data-vop-action="cancel">${VOP_ICON_REFRESH}<span>Annuler</span></button>`;
      h += `<button class="vop-btn vop-btn-primary" data-vop-action="search">${VOP_ICON_SEARCH}<span>Rechercher</span></button>`;
      return h + '</div></div></div>';
    }

    function renderTable() {
      if (state.loading) return '<div class="vop-empty">Chargement…</div>';
      if (state.error) return `<div class="vop-empty">Erreur : ${vopEsc(state.error)}</div>`;
      if (!state.searched) return '';
      if (!state.results.length) {
        const label = state.activeTab === 'societe' ? 'une société' : 'un particulier';
        return `<div class="vop-empty">Aucun résultat.<br><br><button class="vop-btn vop-btn-primary" data-vop-action="create">${VOP_ICON_PLUS}<span>Créer ${label}</span></button></div>`;
      }
      const isSoc = state.activeTab === 'societe';
      const selId = state.selectedClient ? String(state.selectedClient.IDVu) : null;
      let h = '<table class="vop-table"><thead><tr><th>ID</th><th>Nom</th><th>Adresse</th><th>Email</th><th>Tél.</th><th></th></tr></thead><tbody>';
      for (const r of state.results) {
        const fullName = isSoc ? [r.CIVILITE, r.NOM].filter(Boolean).join(' ') : [r.CIVILITE, r.NOM, r.PRENOM].filter(Boolean).join(' ');
        const cpVille = [r.code_postal, r.ville].filter(Boolean).join(' ') || r.CP_VILLE || '';
        const adr = [r.ADRESSE, cpVille, isSoc && r.SIRET ? String(r.SIRET) : ''].filter(Boolean).map(vopEsc).join('<br>');
        let tel = '';
        if (r.TEl_MOB) tel += `<div class="vop-tel-row">${VOP_ICON_MOB} ${vopEsc(r.TEl_MOB)}</div>`;
        if (r.TEL_FIXE) tel += `<div class="vop-tel-row">${VOP_ICON_FIXE} ${vopEsc(r.TEL_FIXE)}</div>`;
        const picked = selId && String(r.IDVu) === selId;
        h += `<tr class="${picked ? 'is-picked' : ''}" data-vop-action="pick-row" data-idvu="${vopEsc(r.IDVu)}"><td>${vopEsc(r.IDVu)}</td><td>${vopEsc(fullName)}</td><td>${adr}</td><td>${vopEsc(r.EMAIL || '')}</td><td>${tel}</td><td><span class="vop-pick-dot">${VOP_ICON_CHECK}</span></td></tr>`;
      }
      return h + '</tbody></table>';
    }

    function renderFooter() {
      const disabled = !state.selectedClient || state.busy;
      let h = '<div class="vop-footer">';
      if (state.busyError) h += `<div class="vop-footer-err">${vopEsc(state.busyError)}</div>`;
      h += `<button class="vop-act vop-act-like" data-vop-action="like"${disabled ? ' disabled' : ''}>${state.busy ? '<span class="vop-spinner"></span>' : VOP_ICON_HEART}<span>Like</span></button>`;
      h += `<button class="vop-act vop-act-pcom" data-vop-action="pcom"${disabled ? ' disabled' : ''}>${state.busy ? '<span class="vop-spinner"></span>' : VOP_ICON_DOC}<span>Proposition</span></button>`;
      return h + '</div>';
    }

    function mfieldInput(label, field, type, opts) {
      opts = opts || {};
      const val = state.modal.data[field]; const v = val == null ? '' : val;
      const cls = opts.gridClass ? `vop-field ${opts.gridClass}` : 'vop-field';
      const req = opts.required ? ' <span style="color:#e24b4a">*</span>' : '';
      let inp;
      if (type === 'textarea') inp = `<textarea class="vop-input" data-vop-mfield="${vopEsc(field)}" rows="3">${vopEsc(v)}</textarea>`;
      else if (type === 'select') {
        const opts2 = (opts.options || []).map(o => `<option value="${vopEsc(o.value)}"${String(o.value) === String(v) ? ' selected' : ''}>${vopEsc(o.label)}</option>`).join('');
        inp = `<select class="vop-input" data-vop-mfield="${vopEsc(field)}"><option value="">—</option>${opts2}</select>`;
      } else if (type === 'checkbox') {
        return `<div class="${cls}"><label class="vop-checkbox"><input type="checkbox" data-vop-mfield="${vopEsc(field)}"${v ? ' checked' : ''}/> <span>${vopEsc(label)}</span></label></div>`;
      } else inp = `<input class="vop-input" type="${type || 'text'}" data-vop-mfield="${vopEsc(field)}" value="${vopEsc(v)}" placeholder="${vopEsc(opts.placeholder || '')}"/>`;
      return `<div class="${cls}"><label class="vop-label">${vopEsc(label)}${req}</label>${inp}</div>`;
    }

    function renderModal() {
      if (!state.modal) return '';
      const m = state.modal; const isSoc = m.isSoc;
      let body = '';
      if (m.duplicate) {
        const c = m.duplicate.client;
        body += `<div class="vop-dup"><div class="vop-dup-head">${VOP_ICON_WARN}<div>${vopEsc(m.duplicate.label)} est déjà utilisé(e) par :<div class="vop-dup-client"><strong>${vopEsc(clientFullName(c))}</strong> — ID ${vopEsc(c.IDVu)}</div></div></div><div class="vop-dup-actions"><button class="vop-btn vop-btn-ghost" data-vop-action="dismiss-duplicate">Modifier</button><button class="vop-btn vop-btn-primary" data-vop-action="view-duplicate">Choisir ce client</button></div></div>`;
      }
      if (m.error && !m.duplicate) body += `<div class="vop-modal-error">${vopEsc(m.error)}</div>`;
      body += '<div class="vop-section"><div class="vop-section-title">Identité</div><div class="vop-grid">';
      if (isSoc) {
        body += mfieldInput('Type', 'CIVILITE', 'select', { options: typesS.map(t => ({ value: t.libelle_court, label: `${t.libelle_court} — ${t.libelle}` })) });
        body += `<div class="vop-field two"><label class="vop-label">SIRET / Raison sociale <span style="color:#e24b4a">*</span></label><input class="vop-input" type="text" data-vop-mfield="__siretQuery" value="${vopEsc(m.siretQuery || '')}" placeholder="Rechercher SIRENE"/>${m.siretSuggestions && m.siretSuggestions.length ? `<div class="vop-suggestions">${m.siretSuggestions.map((s, i) => `<div class="vop-sg" data-vop-action="pick-siret" data-idx="${i}"><strong>${vopEsc(s.raison_sociale || '')}</strong><div style="font-size:11px;color:#9bb3d1">${vopEsc(s.siret || '')} — ${vopEsc(s.commune || '')}</div></div>`).join('')}</div>` : ''}</div>`;
        body += mfieldInput('Raison sociale', 'NOM', 'text', { gridClass: 'full', required: true });
      } else {
        body += mfieldInput('Civilité', 'CIVILITE', 'select', { options: civilitesP.map(c => ({ value: c.libelle, label: c.libelle })), required: true });
        body += mfieldInput('Nom', 'NOM', 'text', { required: true });
        body += mfieldInput('Prénom', 'PRENOM', 'text', { required: true });
        body += mfieldInput('Date de naissance', 'BIRTHDAY', 'date');
      }
      body += '</div></div><div class="vop-section"><div class="vop-section-title">Contact</div><div class="vop-grid">';
      body += mfieldInput('Téléphone portable', 'TEl_MOB', 'text', { required: !isSoc });
      body += mfieldInput('Téléphone fixe', 'TEL_FIXE');
      body += mfieldInput('Email', 'EMAIL', 'text', { required: !isSoc });
      body += '</div></div><div class="vop-section"><div class="vop-section-title">Adresse</div><div class="vop-grid">';
      const verified = m.data.adresse_status === 'verified';
      body += `<div class="vop-field full"><label class="vop-label">Adresse</label><div class="vop-ac"><input class="vop-input" type="text" data-vop-mfield="__addressQuery" value="${vopEsc(m.addressQuery || m.data.ADRESSE || '')}" placeholder="Tapez une adresse"/>${verified ? '<div class="vop-status">✓ Vérifiée</div>' : ''}${m.addressSuggestions && m.addressSuggestions.length ? `<div class="vop-suggestions">${m.addressSuggestions.map((s, i) => `<div class="vop-sg" data-vop-action="pick-address" data-idx="${i}">${vopEsc(s.label || '')}</div>`).join('')}</div>` : ''}</div></div>`;
      body += mfieldInput('Code postal', 'code_postal');
      body += mfieldInput('Ville', 'ville', 'text', { gridClass: 'two' });
      body += '</div></div>';
      if (!isSoc) {
        body += '<div class="vop-section"><div class="vop-section-title">Commentaires</div><div class="vop-grid">' + mfieldInput('Commentaires', 'COMMENTAIRE', 'textarea', { gridClass: 'full' }) + '</div></div>';
      }
      return `<div class="vop-modal-overlay" data-vop-action="close-modal-bg"><div class="vop-modal"><div class="vop-modal-header"><h2 class="vop-modal-title">${isSoc ? 'Créer une société' : 'Créer un particulier'}</h2><button class="vop-modal-close" data-vop-action="close-modal">${VOP_ICON_CLOSE}</button></div><div class="vop-modal-body">${body}</div><div class="vop-modal-footer"><button class="vop-btn vop-btn-ghost" data-vop-action="close-modal">Annuler</button><button class="vop-btn vop-btn-primary" data-vop-action="save-modal"${m.saving ? ' disabled' : ''}>${m.saving ? '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:vop-spin .8s linear infinite"></span>' : VOP_ICON_PLUS}<span>${m.saving ? 'Enregistrement…' : 'Enregistrer'}</span></button></div></div></div>`;
    }

    function render() {
      const root = getRoot(); if (!root) return;
      const active = vopDoc.activeElement;
      const af = active?.getAttribute?.('data-vop-field') || active?.getAttribute?.('data-vop-mfield');
      const ak = active?.getAttribute?.('data-vop-mfield') ? 'm' : 'f';
      const ac = af && typeof active.selectionStart === 'number' ? active.selectionStart : null;
      root.innerHTML = VOP_STYLE + '<div class="vop-body">' + renderSelectedCard() + '<div class="vop-tabs"><button class="vop-tab' + (state.activeTab === 'particulier' ? ' is-active' : '') + '" data-vop-action="tab" data-tab="particulier">' + VOP_ICON_P + '<span>Particulier</span></button><button class="vop-tab' + (state.activeTab === 'societe' ? ' is-active' : '') + '" data-vop-action="tab" data-tab="societe">' + VOP_ICON_S + '<span>Société</span></button></div>' + renderForm() + renderToolbar() + renderTable() + '</div>' + renderFooter() + renderModal();
      bindEvents();
      if (af) {
        const sel = ak === 'm' ? `[data-vop-mfield="${af}"]` : `input[data-vop-field="${af}"]`;
        const next = root.querySelector(sel);
        if (next) { next.focus(); if (ac != null && next.setSelectionRange) try { next.setSelectionRange(ac, ac); } catch (e) { } }
      }
    }

    function bindEvents() {
      const root = getRoot(); if (!root) return;
      root.querySelectorAll('[data-vop-action="tab"]').forEach(el => el.addEventListener('click', () => changeTab(el.getAttribute('data-tab'))));
      root.querySelectorAll('input[data-vop-field]').forEach(el => {
        el.addEventListener('input', () => { state.filters[state.activeTab][el.getAttribute('data-vop-field')] = el.value; });
        el.addEventListener('keydown', e => { if (e.key === 'Enter') { state.page = 1; runSearch(); } });
      });
      root.querySelectorAll('[data-vop-action="toggle-more"]').forEach(el => el.addEventListener('click', () => { state.showMore = !state.showMore; render(); }));
      root.querySelectorAll('[data-vop-action="cancel"]').forEach(el => el.addEventListener('click', clearFilters));
      root.querySelectorAll('[data-vop-action="search"]').forEach(el => el.addEventListener('click', () => { state.page = 1; runSearch(); }));
      root.querySelectorAll('[data-vop-action="prev-page"]').forEach(el => el.addEventListener('click', () => changePage(state.page - 1)));
      root.querySelectorAll('[data-vop-action="next-page"]').forEach(el => el.addEventListener('click', () => changePage(state.page + 1)));
      root.querySelectorAll('[data-vop-action="page"]').forEach(el => el.addEventListener('click', () => changePage(Number(el.getAttribute('data-page')))));
      root.querySelectorAll('[data-vop-action="create"]').forEach(el => el.addEventListener('click', openCreateModal));
      root.querySelectorAll('tr[data-vop-action="pick-row"]').forEach(el => el.addEventListener('click', () => { const r = state.results.find(r => String(r.IDVu) === el.getAttribute('data-idvu')); if (r) pickClient(r); }));
      root.querySelectorAll('[data-vop-action="like"]').forEach(el => el.addEventListener('click', doLike));
      root.querySelectorAll('[data-vop-action="pcom"]').forEach(el => el.addEventListener('click', doPcom));
      root.querySelectorAll('[data-vop-action="close-modal"]').forEach(el => el.addEventListener('click', closeModal));
      root.querySelectorAll('[data-vop-action="close-modal-bg"]').forEach(el => el.addEventListener('click', e => { if (e.target === el) closeModal(); }));
      root.querySelectorAll('[data-vop-action="save-modal"]').forEach(el => el.addEventListener('click', saveCreation));
      root.querySelectorAll('[data-vop-action="dismiss-duplicate"]').forEach(el => el.addEventListener('click', dismissDuplicate));
      root.querySelectorAll('[data-vop-action="view-duplicate"]').forEach(el => el.addEventListener('click', viewDuplicate));
      root.querySelectorAll('[data-vop-action="pick-address"]').forEach(el => el.addEventListener('click', () => { const idx = Number(el.getAttribute('data-idx')); if (state.modal && state.modal.addressSuggestions[idx]) applyAddressSuggestion(state.modal.addressSuggestions[idx]); }));
      root.querySelectorAll('[data-vop-action="pick-siret"]').forEach(el => el.addEventListener('click', () => { const idx = Number(el.getAttribute('data-idx')); if (state.modal && state.modal.siretSuggestions[idx]) applySiretSuggestion(state.modal.siretSuggestions[idx]); }));
      root.querySelectorAll('[data-vop-mfield]').forEach(el => {
        const field = el.getAttribute('data-vop-mfield');
        if (field === '__addressQuery') { el.addEventListener('input', () => onAddressInput(el.value)); return; }
        if (field === '__siretQuery') { el.addEventListener('input', () => onSiretInput(el.value)); return; }
        if (el.tagName === 'SELECT') el.addEventListener('change', () => updateModalField(field, el.value));
        else if (el.type === 'checkbox') el.addEventListener('change', () => updateModalField(field, el.checked));
        else el.addEventListener('input', () => updateModalField(field, el.value));
      });
    }

    render();
  } // end __vopMain


  // Lance le picker Like/P.Com en appelant directement la fonction du script WeWeb
  // Lance le picker directement — workflow WeWeb supprimé, JS inline
  function vopBoot() {
    // __vopMain est défini dans le même scope IIFE que vopBoot,
    // il suffit de l'appeler directement.
    try { __vopMain(); } catch (e) { console.error('[vo] vopBoot', e); }
  }
  function vfChip(lbl, val) { return '<div class="vf-chip"><div class="vf-chip-lbl">' + lbl + '</div><div class="vf-chip-val">' + val + '</div></div>'; }
  function vfTab(id, lbl, cur) { return '<button type="button" class="vf-tab' + (cur === id ? ' on' : '') + '" data-tab="' + id + '">' + lbl + '</button>'; }
  function vfRow(lbl, val) { return '<div class="vf-row"><span class="vf-row-lbl">' + lbl + '</span><span class="vf-row-val">' + val + '</span></div>'; }
  function vfSection(title, rows) { return '<div class="vf-section"><div class="vf-section-title">' + title + '</div>' + rows + '</div>'; }

  function renderFicheTab(row, vin, ca) {
    var cover = mainImage(row);
    // Sources d'images : photos supabase si chargées, sinon ImageUrls
    var thumbUrls = [];
    if (ficheState.photos && ficheState.photos.length) {
      thumbUrls = ficheState.photos.map(function (p) { return p.signedUrl; }).filter(Boolean);
    } else {
      thumbUrls = images(row);
      if (!thumbUrls.length && cover) thumbUrls = [cover];
    }
    var mainSrc = (thumbUrls.length ? thumbUrls[0] : cover) || '';
    var imgHtml;
    if (mainSrc) {
      imgHtml = '<div class="vf-img-wrap" style="cursor:zoom-in"><img id="vf-main-img" src="' + esc(mainSrc) + '" loading="lazy" style="cursor:zoom-in" onerror="this.style.display=\'none\'"></div>';
      if (thumbUrls.length > 1) {
        imgHtml += '<div class="vf-thumbs">';
        thumbUrls.slice(0, 10).forEach(function (u, i) {
          imgHtml += '<img class="vf-thumb' + (i === 0 ? ' on' : '') + '" data-src="' + esc(u) + '" data-idx="' + i + '" src="' + esc(u) + '" loading="lazy">';
        });
        imgHtml += '</div>';
      } else if (ficheState.photosLoading) {
        imgHtml += '<div class="vf-thumbs" style="color:#9bb3d1;font-size:11px;padding:4px 0">Chargement des photos\u2026</div>';
      }
    } else {
      imgHtml = '<div class="vf-img-wrap"><div class="vf-img-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" width="56" height="56"><path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13"/><path d="M3 13h18v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg></div></div>';
    }

    var nbj = nbjDays(row);
    var dest = destination(row);
    // 3 sections : Identité / Technique / Stock-Achat
    var sIdentite = vfSection('Identité',
      vfRow('N° VO', esc(row.NO_VO || '-')) +
      vfRow('VIN', esc(vin || '-')) +
      vfRow('Immatriculation', esc(row.NO_IMMAT || '-')) +
      vfRow('Label', esc(row.LABEL_Codifie || '-')) +
      vfRow('Site', esc(row.SITE || '-'))
    );
    var sTechnique = vfSection('Technique',
      vfRow('Carburant', esc(row.CARBURANT_DMS || '-')) +
      vfRow('Boîte de vitesse', esc(row.BOITEV_EUROTAX || '-')) +
      vfRow('CV', esc(row.CV_DMS != null ? row.CV_DMS + ' Ch' : '-')) +
      vfRow('CO2', esc(row.TAUX_CO2 != null ? row.TAUX_CO2 + ' g' : '-')) +
      vfRow('Carrosserie', esc(row.CARROSSERIE_EUROTAX || '-')) +
      vfRow('Nb de portes', esc(row.NBPORTE_EUROTAX != null ? String(row.NBPORTE_EUROTAX) : '-')) +
      vfRow('Couleur', esc(row.COULEUR_DMS || '-')) +
      vfRow("Crit'Air", '<span style="display:inline-flex;align-items:center;gap:5px"><i style="width:9px;height:9px;border-radius:50%;background:' + ca.color + ';display:inline-block"></i>' + esc(ca.label) + '</span>')
    );
    var sStock = vfSection('Stock · Achat',
      vfRow('Nb jours de stock', nbj != null ? nbj + ' jrs' : '-') +
      vfRow('Détail Stockage', esc(row.DETAIL_STOCKAGE_Codifie || '-')) +
      vfRow('Origine Achat', esc(row.ORIGINEACHAT_Codifie || '-')) +
      vfRow('Origine légale', esc(row.ORIGINEACHAT_Codifie ? row.ORIGINEACHAT_Codifie : (row.ORIGINE_LEGALE || row.ORIGINELEG_Codifie || '-'))) +
      vfRow('Garantie', esc(garantieTxt(row))) +
      vfRow('1ère MEC', esc(fmtDateFR(row.D_1MEC))) +
      vfRow('Date achat', esc(fmtDateFR(row.D_ACHAT))) +
      vfRow('Destination', dest) +
      vfRow('Prêt à la vente', row.PRET_A_LA_VENTE === 'O' ? 'Oui' : 'Non') +
      vfRow('TVA', esc(row.TVA || '-'))
    );

    return '<div class="vf-fiche">'
      + '<div>' + imgHtml + '</div>'
      + '<div class="vf-sections">' + sIdentite + sTechnique + sStock + '</div>'
      + '</div>';
  }

  function renderPhotosTab() {
    var ICO_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
    var ICO_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
    var ICO_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
    var ICO_STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    var ICO_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M9 6V4h6v2"/></svg>';
    var n = ficheState.photos ? ficheState.photos.length : 0;
    var extraCss = '<style id="vf-photo-css">'
      + '.vf-drop{border:1.5px dashed #e2eaf5;border-radius:9px;padding:8px 14px;cursor:pointer;transition:all .15s;position:relative;margin-bottom:12px;display:inline-flex;align-items:center;gap:7px;background:#fff}.vf-drop:hover{border-color:#2a5ea9;background:#f7f9ff}.vf-drop.drag{border-color:#2a5ea9;background:#eef4fc}'
      + '.vf-drop.drag{border-color:#2a5ea9;background:#f0f5ff}'
      + '.vf-drop input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}'
      + '.vf-drop-txt{font-size:13px;font-weight:700;color:#9bb3d1;pointer-events:none}'
      + '.vf-drop-sub{font-size:11px;color:#c0cee0;margin-top:4px;pointer-events:none}'
      + '.vf-upload-status{font-size:12px;color:#9bb3d1;text-align:center;margin-bottom:10px}'
      + '.vf-photo-card{position:relative;border-radius:10px;overflow:hidden;aspect-ratio:4/3;background:#eef2f8;border:2px solid transparent;transition:border-color .12s}'
      + '.vf-photo-card.is-cover{border-color:#fac055}'
      + '.vf-photo-card img{width:100%;height:100%;object-fit:cover;display:block;cursor:pointer}'
      + '.vf-photo-card .vf-pov{position:absolute;inset:0;background:rgba(31,74,133,0);transition:background .15s;display:flex;flex-direction:column;justify-content:flex-end}'
      + '.vf-photo-card:hover .vf-pov{background:rgba(31,74,133,.35)}'
      + '.vf-photo-card .vf-pbar{display:flex;align-items:center;justify-content:center;gap:4px;padding:6px;opacity:0;transition:opacity .15s}'
      + '.vf-photo-card:hover .vf-pbar{opacity:1}'
      + '.vf-pbtn{width:28px;height:28px;border-radius:7px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .12s}'
      + '.vf-pbtn svg{width:13px;height:13px;pointer-events:none}'
      + '.vf-pbtn.move{background:rgba(255,255,255,.9);color:#2a5ea9}.vf-pbtn.move:hover{background:#fff}'
      + '.vf-pbtn.cover{background:rgba(255,255,255,.9);color:#854f0b}.vf-pbtn.cover.on{background:#fac055;color:#fff}'
      + '.vf-pbtn.del{background:rgba(255,255,255,.9);color:#e24b4a}.vf-pbtn.del:hover{background:#e24b4a;color:#fff}'
      + '.vf-cover-badge{position:absolute;top:6px;left:6px;background:#fac055;color:#633806;font-size:9px;font-weight:800;padding:2px 7px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em}'
      + '.vf-photo-msg{font-size:12px;text-align:center;padding:7px;border-radius:8px;margin-bottom:10px}'
      + '.vf-photo-msg.err{background:#fcebeb;color:#a32d2d}.vf-photo-msg.ok{background:#eaf7f3;color:#0f6e56}'
      + '</style>';
    var h = extraCss;
    h += '<div class="vf-photos-header"><span class="vf-photos-title">Photos du véhicule' + (n ? ' (' + n + ')' : '') + '</span></div>';
    h += '<label class="vf-drop" id="vf-drop-zone" for="vf-file-input">'
      + '<input type="file" id="vf-file-input" accept="image/jpeg,image/png,image/webp" multiple>'
      + '<span style="display:inline-flex;align-items:center;gap:6px;color:#9bb3d1;pointer-events:none">' + ICO_UP + '<span class="vf-drop-txt">Importer des photos</span></span>'
      + '</label>';
    h += '<div id="vf-upload-status" class="vf-upload-status" style="display:none"></div>';
    h += '<div id="vf-photo-msg" style="display:none" class="vf-photo-msg"></div>';
    if (ficheState.photosLoading) return h + '<div style="padding:30px;text-align:center;color:#9bb3d1">Chargement des photos…</div>';
    if (!ficheState.photos) { if (!ficheState.photosLoading) loadPhotos(ficheState.vin); return h + '<div style="padding:30px;text-align:center;color:#9bb3d1">Chargement des photos…</div>'; }
    if (!ficheState.photos.length) return h + '<div style="padding:30px;text-align:center;color:#9bb3d1;font-weight:600">Aucune photo — importez-en ci-dessus.</div>';
    h += '<div class="vf-photo-grid" id="vf-photo-grid">';
    ficheState.photos.forEach(function (p, i) {
      if (!p.signedUrl) return;
      var isCov = !!p.is_cover; var isFirst = i === 0; var isLast = i === ficheState.photos.length - 1;
      h += '<div class="vf-photo-card' + (isCov ? ' is-cover' : '') + '" data-id="' + esc(p.id) + '" data-path="' + esc(p.storage_path) + '">';
      h += '<img src="' + esc(p.signedUrl) + '" loading="lazy" data-idx="' + i + '">';
      if (isCov) h += '<span class="vf-cover-badge">\u2605 Cover</span>';
      h += '<div class="vf-pov"><div class="vf-pbar">';
      if (!isFirst) h += '<button type="button" class="vf-pbtn move" data-act="move-left" data-id="' + esc(p.id) + '" title="D\u00e9placer \u00e0 gauche">' + ICO_L + '</button>';
      if (!isLast) h += '<button type="button" class="vf-pbtn move" data-act="move-right" data-id="' + esc(p.id) + '" title="D\u00e9placer \u00e0 droite">' + ICO_R + '</button>';
      h += '<button type="button" class="vf-pbtn cover' + (isCov ? ' on' : '') + '" data-act="cover" data-id="' + esc(p.id) + '" title="D\u00e9finir comme cover">' + ICO_STAR + '</button>';
      h += '<button type="button" class="vf-pbtn del" data-act="del" data-path="' + esc(p.storage_path) + '" title="Supprimer">' + ICO_DEL + '</button>';
      h += '</div></div></div>';
    });
    h += '</div>';
    return h;
  }

  function showPhotoMsg(txt, type) { var el = doc.getElementById('vf-photo-msg'); if (!el) return; el.textContent = txt; el.className = 'vf-photo-msg ' + (type || 'ok'); el.style.display = ''; setTimeout(function () { el.style.display = 'none'; }, 3500); }
  function showUploadStatus(txt) { var el = doc.getElementById('vf-upload-status'); if (el) { el.textContent = txt; el.style.display = txt ? '' : 'none'; } }

  async function callPhotosEF(url, body) {
    var jwt = await getJwt();
    var res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (jwt || ''), 'apikey': SUPABASE_KEY }, body: JSON.stringify(body) });
    return res.json();
  }

  async function uploadFiles(files) {
    if (!files || !files.length) return;
    var total = files.length; var done = 0;
    showUploadStatus('Envoi de ' + total + ' photo' + (total > 1 ? 's' : '') + '\u2026');
    for (var i = 0; i < total; i++) {
      var file = files[i];
      try {
        var init = await callPhotosEF(FN_PHOTOS_INIT, { vin: ficheState.vin, fileName: file.name, contentType: file.type, size: file.size });
        if (!init.signedUrl) throw new Error(init.error || 'init \u00e9chou\u00e9');
        var put = await fetch(init.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type, 'x-upsert': 'false' }, body: file });
        if (!put.ok) throw new Error('PUT ' + put.status);
        var conf = await callPhotosEF(FN_PHOTOS_CONFIRM, { vin: ficheState.vin, path: init.path, fileName: file.name, mimeType: file.type, fileSize: file.size });
        if (!conf.ok && !conf.alreadyExists) throw new Error(conf.error || 'confirm \u00e9chou\u00e9');
        done++;
        showUploadStatus(done + '/' + total + ' photo' + (total > 1 ? 's' : '') + ' envoy\u00e9e' + (done > 1 ? 's' : '') + '\u2026');
      } catch (e) { console.error('[vo] upload', file.name, e); showPhotoMsg('Erreur : ' + file.name + ' \u2014 ' + e.message, 'err'); }
    }
    showUploadStatus('');
    showPhotoMsg(done + ' photo' + (done > 1 ? 's' : '') + ' ajout\u00e9e' + (done > 1 ? 's' : '') + '.', 'ok');
    await loadPhotos(ficheState.vin);
  }

  async function loadPhotos(vin) {
    ficheState.photosLoading = true;
    if (ficheState.tab === 'photos') renderFichePopup();
    try {
      var data = await callPhotosEF(FN_PHOTOS, { vin: vin, expiresIn: 3600 });
      ficheState.photos = (data && data.photos) ? data.photos : [];
      window.__kanPhotoCache[vin] = ficheState.photos; // stocke en cache
    } catch (e) { console.error('[vo] loadPhotos', e); ficheState.photos = []; }
    ficheState.photosLoading = false;
    renderFichePopup();
    if (ficheState.tab === 'photos') bindPhotos();
  }

  function bindPhotos() {
    var dz = doc.getElementById('vf-drop-zone'); var fi = doc.getElementById('vf-file-input');
    if (dz) {
      dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('drag'); });
      dz.addEventListener('dragleave', function () { dz.classList.remove('drag'); });
      dz.addEventListener('drop', function (e) { e.preventDefault(); dz.classList.remove('drag'); uploadFiles(e.dataTransfer.files); });
    }
    if (fi) fi.addEventListener('change', function () { uploadFiles(fi.files); });
    var grid = doc.getElementById('vf-photo-grid'); if (!grid) return;
    grid.addEventListener('click', async function (e) {
      var btn = e.target.closest('[data-act]'); var img = e.target.closest('img[data-idx]');
      if (btn) {
        var act = btn.getAttribute('data-act'); var id = btn.getAttribute('data-id'); var path = btn.getAttribute('data-path');
        if (act === 'move-left' || act === 'move-right') {
          btn.disabled = true;
          var r = await callPhotosEF(FN_PHOTOS_MOVE, { photo_id: id, direction: act === 'move-left' ? 'left' : 'right' });
          if (!r.success) showPhotoMsg('Erreur d\u00e9placement', 'err');
          await loadPhotos(ficheState.vin);
        } else if (act === 'cover') {
          btn.disabled = true;
          var r = await callPhotosEF(FN_PHOTOS_COVER, { photo_id: id });
          if (!r.success) showPhotoMsg('Erreur cover', 'err');
          await loadPhotos(ficheState.vin);
        } else if (act === 'del') {
          if (!confirm('Supprimer cette photo ?')) return;
          btn.disabled = true;
          var r = await callPhotosEF(FN_PHOTOS_DELETE, { path: path });
          if (!r.success) showPhotoMsg('Erreur suppression', 'err');
          await loadPhotos(ficheState.vin);
        }
      } else if (img) {
        var idx = Number(img.getAttribute('data-idx'));
        var urls = (ficheState.photos || []).map(function (p) { return p.signedUrl; }).filter(Boolean);
        showDiaporama(urls, idx);
      }
    });
  }

  function renderApvTab() {
    if (ficheState.apvLoading) return '<div style="padding:40px;text-align:center;color:#9bb3d1;font-size:13px;font-weight:600">Chargement des factures…</div>';
    if (!ficheState.apv) { if (!ficheState.apvLoading) loadApv(ficheState.vin); return '<div style="padding:40px;text-align:center;color:#9bb3d1;font-size:13px;font-weight:600">Chargement des factures…</div>'; }

    var h = '<div style="font-size:16px;font-weight:800;color:#1F4A85;margin-bottom:4px">Historique factures APV</div>'
      + '<div style="font-size:13px;color:#9bb3d1;margin-bottom:16px">Suivi des interventions atelier, montants et dates clés du véhicule</div>';

    if (!ficheState.apv.length) return h + '<div style="padding:30px;text-align:center;color:#9bb3d1;font-weight:600">Aucune facture APV pour ce véhicule.</div>';

    // KPIs synthèse
    var totalCA = ficheState.apv.reduce(function (s, r) { return s + num(r.MT_TOT_FACT_HT); }, 0);
    var nbFact = ficheState.apv.length;
    var caMoyen = nbFact ? Math.round(totalCA / nbFact) : 0;
    // interventions par an : groupe par année
    var years = {}; ficheState.apv.forEach(function (r) { var y = r.DT_FAC ? String(r.DT_FAC).slice(0, 4) : '?'; years[y] = (years[y] || 0) + 1; });
    var nbYears = Object.keys(years).filter(function (y) { return y !== '?'; }).length || 1;
    var intParAn = Math.round(nbFact / nbYears);

    h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px">';
    h += apvKpi('Total CA HT', eur(totalCA), '#2a5ea9');
    h += apvKpi('CA moyen / facture', eur(caMoyen), '#53bda7');
    h += apvKpi('Interventions / an', intParAn, '#854f0b');
    h += '</div>';

    // Tableau
    h += '<div style="overflow-x:auto"><table class="vf-apv-table"><thead><tr>'
      + '<th>Date FAC</th><th>N° Fact.</th><th>OR</th><th>Catégorie</th><th>Description</th>'
      + '<th style="text-align:right">MO HT</th><th style="text-align:right">Pièces HT</th><th style="text-align:right">Total HT</th>'
      + '</tr></thead><tbody>';
    ficheState.apv.forEach(function (r) {
      h += '<tr>'
        + '<td>' + esc(fmtDateFR(r.DT_FAC)) + '</td>'
        + '<td style="color:#2a5ea9;font-weight:600">' + esc(r.NUM_FACT_DMS || '-') + '</td>'
        + '<td>' + esc(r.NUM_OR || '-') + '</td>'
        + '<td><span style="background:#eef4fc;color:#2a5ea9;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px">' + esc(r.CAT_FACT || '-') + '</span></td>'
        + '<td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(r.LIB_DESC || '') + '">' + esc(r.LIB_DESC || '-') + '</td>'
        + '<td style="text-align:right;color:#54678a">' + (num(r.MT_TOT_MO) ? eur(r.MT_TOT_MO) : '-') + '</td>'
        + '<td style="text-align:right;color:#54678a">' + (num(r.MT_TOT_PIECE_INT) ? eur(r.MT_TOT_PIECE_INT) : '-') + '</td>'
        + '<td style="text-align:right;font-weight:700;color:#1F4A85">' + eur(r.MT_TOT_FACT_HT) + '</td>'
        + '</tr>';
    });
    h += '</tbody></table></div>';
    h += '<div class="vf-apv-total">Total HT : ' + eur(totalCA) + '</div>';
    return h;
  }
  function apvKpi(lbl, val, color) {
    return '<div style="background:#f7f9fc;border:1.5px solid #e8eef7;border-radius:12px;padding:14px">'
      + '<div style="font-size:11px;color:#9bb3d1;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">' + esc(lbl) + '</div>'
      + '<div style="font-size:22px;font-weight:800;color:' + color + '">' + val + '</div>'
      + '</div>';
  }

  async function loadApv(vin) {
    ficheState.apvLoading = true; renderFichePopup();
    try {
      var c = sb();
      if (c) { var r = await c.from('APV').select('DT_FAC,NUM_FACT_DMS,NUM_OR,CAT_FACT,LIB_DESC,MT_TOT_MO,MT_TOT_PIECE_INT,MT_TOT_FACT_HT,KM').eq('VIN', vin).order('DT_FAC', { ascending: false }); ficheState.apv = r.data || []; }
      else ficheState.apv = [];
    } catch (e) { console.error('[vo] loadApv', e); ficheState.apv = []; }
    ficheState.apvLoading = false; renderFichePopup();
  }



  // ── Routeur clic ─────────────────────────────────────────────────────────
  window.__kanRoute = function (e) {
    if (e.__kanDone) return;
    if (!(e.target.closest && e.target.closest('#kanban-root'))) return;
    e.__kanDone = true;

    const f = e.target.closest('[data-filter]');
    if (f) { const [g, v] = f.getAttribute('data-filter').split(':'); if (g === 'type') state.fType = v; else if (g === 'client') state.fClient = v; else if (g === 'fin') state.fFin = v; render(); return; }

    const menuBtn = e.target.closest('[data-menu]');
    if (menuBtn) { const id = Number(menuBtn.getAttribute('data-menu')); state.menuFor = (state.menuFor === id) ? null : id; render(); return; }

    const go = e.target.closest('[data-go]');
    if (go) { const [id, to] = go.getAttribute('data-go').split(':'); doMove(Number(id), to); return; }

    const arch = e.target.closest('[data-archive]');
    if (arch) { doMove(Number(arch.getAttribute('data-archive')), 'archived'); return; }

    const pdf = e.target.closest('[data-pdf]');
    if (pdf) { const [id, kind] = pdf.getAttribute('data-pdf').split(':'); pdfDoc(Number(id), kind, pdf.getAttribute('data-maj') || null); return; }

    const mod = e.target.closest('[data-modif]');
    if (mod) { modifPropale(Number(mod.getAttribute('data-modif'))); return; }

    // Fiche client
    const fiche = e.target.closest('[data-fiche]');
    if (fiche) { openClientFichePcom(Number(fiche.getAttribute('data-fiche')), fiche); return; }

    // Fiche VO (véhicule cliquable)
    const vehLink = e.target.closest('[data-vin]');
    if (vehLink) { kanOpenFicheVO(vehLink.getAttribute('data-vin')); return; }

    const kr = e.target.closest('[data-krange]');
    if (kr) { openRangePickerKan(kr); return; }

    const so = e.target.closest('[data-selopen]');
    if (so) { state.selOpen = !state.selOpen; if (state.selOpen) loadVendeurs(); render(); return; }

    const ve = e.target.closest('[data-vend]');
    if (ve) { state.vendeurId = Number(ve.getAttribute('data-vend')); state.vendeurName = ve.getAttribute('data-vname') || ''; state.selOpen = false; state.cards = null; state.versionsData = {}; state.openVersions = null; loadData(); return; }

    const vb = e.target.closest('[data-versions]');
    if (vb) { const id = Number(vb.getAttribute('data-versions')); state.openVersions = (state.openVersions === id) ? null : id; if (state.openVersions === id && state.versionsData[id] === undefined) loadVersions(id); render(); return; }

    const sp = e.target.closest('[data-setprop]');
    if (sp) { setAsPropale(Number(sp.getAttribute('data-setprop'))); return; }

    let dirty = false;
    if (state.menuFor != null && !e.target.closest('.kc-menu') && !e.target.closest('[data-menu]')) { state.menuFor = null; dirty = true; }
    if (state.selOpen && !e.target.closest('.k-vpanel') && !e.target.closest('[data-selopen]')) { state.selOpen = false; dirty = true; }
    if (dirty) render();
  };
  if (!window.__kanDocClickBound) {
    doc.addEventListener('click', function (e) { if (window.__kanRoute) window.__kanRoute(e); }, true);
    window.__kanDocClickBound = true;
  }

  window.__kanVendSearch = function (val) {
    state.vendeurSearch = val; render();
    const inp = doc.querySelector('#kanban-root .k-vsearch');
    if (inp) { inp.focus(); try { inp.setSelectionRange(val.length, val.length); } catch (e) { } }
  };

  doc.addEventListener('change', function (e) {
    const d = e.target.closest && e.target.closest('[data-period]');
    if (!d || !e.target.closest('#kanban-root')) return;
    const which = d.getAttribute('data-period'), val = d.value;
    if (!val) return;
    state.period[which] = val;
    if (state.period.from && state.period.to && state.period.from <= state.period.to) { state.cards = null; loadData(); }
  }, true);

  function bindDnD() {
    if (window.__kanDnDBound) return;
    window.__kanDnDBound = true;
    doc.addEventListener('dragstart', function (e) {
      const card = e.target.closest && e.target.closest('[data-card]');
      if (!card || !e.target.closest('#kanban-root')) return;
      try { e.dataTransfer.setData('text/plain', card.getAttribute('data-card') + '|' + card.getAttribute('data-from')); e.dataTransfer.effectAllowed = 'move'; } catch (x) { }
      card.classList.add('dragging');
    }, true);
    doc.addEventListener('dragend', function (e) {
      const card = e.target.closest && e.target.closest('[data-card]');
      if (card) card.classList.remove('dragging');
      doc.querySelectorAll('#kanban-root .kan-col.over').forEach(el => el.classList.remove('over'));
    }, true);
    doc.addEventListener('dragover', function (e) {
      const col = e.target.closest && e.target.closest('[data-col]');
      if (!col || !e.target.closest('#kanban-root')) return;
      const dragging = doc.querySelector('#kanban-root .kc-card.dragging');
      if (!dragging) return;
      if (canMove(dragging.getAttribute('data-from'), col.getAttribute('data-col'))) { e.preventDefault(); col.classList.add('over'); }
    }, true);
    doc.addEventListener('dragleave', function (e) { const col = e.target.closest && e.target.closest('[data-col]'); if (col) col.classList.remove('over'); }, true);
    doc.addEventListener('drop', function (e) {
      const col = e.target.closest && e.target.closest('[data-col]');
      if (!col || !e.target.closest('#kanban-root')) return;
      e.preventDefault(); col.classList.remove('over');
      let raw = ''; try { raw = e.dataTransfer.getData('text/plain'); } catch (x) { }
      if (!raw) return;
      const [id, from] = raw.split('|'), to = col.getAttribute('data-col');
      if (canMove(from, to)) doMove(Number(id), to);
    }, true);
  }
  bindDnD();

  const ICON_PDF = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>';
  const ICON_EDIT = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  const ICON_TRASH = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  const ICON_MOVE = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>';

  function MOCK_CARDS() {
    return normalizeCards([
      { id_propale_bdc: 1, status: 'draft', id_client: 101, client: 'M. Fabre', client_type: 'particulier', vehicule: 'Peugeot 3008 GT', vin: 'VF3A001', vn_vo: 'VO', montant: 28900, financement: 'comptant', maj: ymdAgo(2), nb_versions: 2 },
      { id_propale_bdc: 2, status: 'draft', id_client: 102, client: 'SARL Tournier', client_type: 'societe', vehicule: 'Peugeot Partner', vin: 'VF3B002', vn_vo: 'VN', montant: 21500, financement: 'financement', maj: ymdAgo(9), nb_versions: 1 },
      { id_propale_bdc: 3, status: 'propale', id_client: 103, client: 'Mme Roussel', client_type: 'particulier', vehicule: 'Renault Clio V', vin: 'VF1C003', vn_vo: 'VN', montant: 23100, financement: 'financement', maj: ymdAgo(4), nb_versions: 3 },
      { id_propale_bdc: 4, status: 'propale', id_client: 104, client: 'M. Lemoine', client_type: 'particulier', vehicule: 'Citroën C5 Aircross', vin: 'VF7D004', vn_vo: 'VO', montant: 34100, financement: 'comptant', maj: ymdAgo(26), nb_versions: 1 },
      { id_propale_bdc: 5, status: 'bdc', id_client: 105, client: 'M. Aubert', client_type: 'particulier', vehicule: 'Peugeot 5008 Allure', vin: 'VF3E005', vn_vo: 'VN', montant: 31800, financement: 'financement', maj: ymdAgo(1), nb_versions: 1 },
      { id_propale_bdc: 6, status: 'win', id_client: 106, client: 'Mme Garnier', client_type: 'particulier', vehicule: 'Renault Captur', vin: 'VF1F006', vn_vo: 'VO', montant: 26400, financement: 'comptant', maj: ymdAgo(3), nb_versions: 1 },
      { id_propale_bdc: 7, status: 'lose', id_client: 107, client: 'Transports Béziers', client_type: 'societe', vehicule: 'VW T-Roc', vin: 'WVGG007', vn_vo: 'VN', montant: 19900, financement: 'financement', maj: ymdAgo(12), nb_versions: 1 }
    ]);
  }
  function ymdAgo(d) { const x = new Date(); x.setDate(x.getDate() - d); return ymd(x); }

  const STYLE = '<style>' +
    '#kanban-root .kan{font-family:"Nunito Sans",sans-serif;color:#1c2b45}' +
    '#kanban-root .kan-load,#kanban-root .kan-err{padding:24px;text-align:center;color:#888780;font-size:14px}' +
    '#kanban-root .kan-err{color:#a32d2d}' +
    '#kanban-root .kan-hint{background:#eef3fb;border:1px solid #d9e4f5;color:#2a5ea9;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;margin-bottom:12px}' +
    '#kanban-root .k-vend-nosite .k-vend-n{color:#888780;font-weight:700}' +
    '#kanban-root .kan-toolbar{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:14px}' +
    '#kanban-root .k-vend{display:flex;flex-direction:column;line-height:1.1}' +
    '#kanban-root .k-vend-l{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#888780}' +
    '#kanban-root .k-vend-n{font-size:15px;font-weight:800;color:#2a5ea9}' +
    '#kanban-root .k-vend-sel{position:relative}' +
    '#kanban-root .k-vend-btn{background:#fff;border:1px solid #ece9e1;border-radius:10px;padding:5px 12px;cursor:pointer;text-align:left;font-family:inherit}' +
    '#kanban-root .k-vend-btn:hover{border-color:#2a5ea9}' +
    '#kanban-root .k-caret{font-size:10px;color:#888780}' +
    '#kanban-root .k-vpanel{position:absolute;top:calc(100% + 6px);left:0;z-index:30;width:300px;max-height:380px;overflow-y:auto;background:#fff;border:1px solid #ece9e1;border-radius:12px;box-shadow:0 12px 32px rgba(42,94,169,.16);padding:8px}' +
    '#kanban-root .k-vsearch{width:100%;border:1px solid #ece9e1;border-radius:8px;padding:8px 11px;font-family:inherit;font-size:13px;color:#1c2b45;box-sizing:border-box;margin-bottom:6px}' +
    '#kanban-root .k-vsearch:focus{outline:none;border-color:#2a5ea9}' +
    '#kanban-root .k-vempty{font-size:12px;color:#b4b2a9;padding:10px;text-align:center}' +
    '#kanban-root .k-vgroup{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#888780;padding:8px 8px 4px}' +
    '#kanban-root .k-vitem{display:flex;align-items:center;gap:6px;width:100%;text-align:left;background:none;border:none;border-radius:8px;padding:8px 10px;font-family:inherit;font-size:13px;font-weight:700;color:#1c2b45;cursor:pointer}' +
    '#kanban-root .k-vitem:hover{background:rgba(172,197,228,.18)}' +
    '#kanban-root .k-vitem.on{background:#2a5ea9;color:#fff}' +
    '#kanban-root .k-dates{display:flex;align-items:center;gap:6px}' +
    '#kanban-root .k-date{border:1px solid #ece9e1;border-radius:8px;padding:6px 9px;font-family:inherit;font-size:12px;color:#1c2b45;background:#fff}' +
    '#kanban-root .k-date:focus{outline:none;border-color:#2a5ea9}' +
    '#kanban-root .k-date-sep{color:#b4b2a9}' +
    '#kanban-root .k-range{background:#fff;border:1px solid #ece9e1;border-radius:10px;padding:7px 12px;font-family:inherit;font-size:12px;font-weight:700;color:#2a5ea9;cursor:pointer;display:inline-flex;align-items:center;gap:6px}' +
    '#kanban-root .k-range:hover{border-color:#2a5ea9}' +
    '#kanban-root .k-perim{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}' +
    '#kanban-root .k-perim-row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}' +
    '#kanban-root .k-perim-lvl{display:flex;flex-direction:column;gap:3px}' +
    '#kanban-root .k-perim-lbl{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#888780}' +
    '#kanban-root .k-perim-sel{border:1px solid #ece9e1;border-radius:9px;padding:6px 10px;font-family:inherit;font-size:13px;font-weight:700;color:#2a5ea9;background:#fff;cursor:pointer}' +
    '#kanban-root .k-perim-sel:focus{outline:none;border-color:#2a5ea9}' +
    '#kanban-root .k-perim-load{font-size:12px;color:#9bb3d1}' +
    '#kanban-root .k-filters{display:flex;gap:10px;flex-wrap:wrap;margin-left:auto}' +
    '#kanban-root .k-fgroup{display:flex;gap:4px;background:#f7f6f2;border-radius:10px;padding:3px}' +
    '#kanban-root .k-chip{font-size:12px;font-weight:700;color:#2a5ea9;border-radius:8px;padding:5px 11px;cursor:pointer;user-select:none}' +
    '#kanban-root .k-chip:hover{background:rgba(172,197,228,.20)}' +
    '#kanban-root .k-chip.on{background:#2a5ea9;color:#fff}' +
    '#kanban-root .kan-board{display:flex;gap:12px;overflow-x:auto;padding-bottom:6px;align-items:flex-start}' +
    '#kanban-root .kan-col{flex:1;min-width:200px;background:#f7f6f2;border-radius:14px;padding:8px;transition:background .12s}' +
    '#kanban-root .kan-col.over{background:rgba(42,94,169,.10);outline:2px dashed #acc5e4}' +
    '#kanban-root .kc-head{padding:8px 10px 10px}' +
    '#kanban-root .kc-title{display:flex;align-items:center;gap:7px;font-size:14px;font-weight:800;color:#1c2b45}' +
    '#kanban-root .kc-dot{width:9px;height:9px;border-radius:50%;background:#b4b2a9}' +
    '#kanban-root .kc-draft .kc-dot{background:#acc5e4}' +
    '#kanban-root .kc-propale .kc-dot{background:#fac055}' +
    '#kanban-root .kc-bdc .kc-dot{background:#2a5ea9}' +
    '#kanban-root .kc-win .kc-dot{background:#53bda7}' +
    '#kanban-root .kc-lose .kc-dot{background:#d97070}' +
    '#kanban-root .kc-n{margin-left:auto;font-size:12px;font-weight:700;color:#888780;background:#fff;border-radius:20px;padding:1px 9px}' +
    '#kanban-root .kc-sum{font-size:12px;color:#888780;margin-top:3px;display:flex;align-items:center;gap:8px}' +
    '#kanban-root .kc-conv{color:#2c7a68;font-weight:700}' +
    '#kanban-root .kc-body{display:flex;flex-direction:column;gap:8px;min-height:40px}' +
    '#kanban-root .kc-empty{text-align:center;color:#cfcdc5;font-size:13px;padding:10px}' +
    '#kanban-root .kc-card{position:relative;background:#fff;border:0.5px solid #ece9e1;border-left:3px solid #cfcdc5;border-radius:10px;padding:10px 12px;cursor:grab;transition:box-shadow .12s}' +
    '#kanban-root .kc-card:hover{box-shadow:0 4px 14px rgba(42,94,169,.10)}' +
    '#kanban-root .kc-card.dragging{opacity:.45}' +
    '#kanban-root .kc-card.vt-vn{border-left-color:#53bda7}' +
    '#kanban-root .kc-card.vt-vo{border-left-color:#fac055}' +
    '#kanban-root .kc-card.moving{pointer-events:none}' +
    '#kanban-root .kc-spin{position:absolute;inset:0;background:rgba(255,255,255,.6);display:flex;align-items:center;justify-content:center;border-radius:10px;z-index:3}' +
    '#kanban-root .kc-spinner{width:18px;height:18px;border:2px solid #acc5e4;border-top-color:#2a5ea9;border-radius:50%;animation:kanspin .7s linear infinite}' +
    '@keyframes kanspin{to{transform:rotate(360deg)}}' +
    '#kanban-root .kc-cli{font-size:14px;font-weight:800;color:#1c2b45;display:flex;align-items:center;gap:6px;flex-wrap:wrap}' +
    '#kanban-root .kc-cli-link{background:none;border:none;padding:0;font:inherit;font-weight:800;color:#1c2b45;cursor:pointer;text-align:left;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#kanban-root .kc-cli-link:hover{color:#2a5ea9;text-decoration:underline}' +
    '#kanban-root .kc-cli-loading{opacity:.5;pointer-events:none}' +
    '#kanban-root .kc-veh-link{background:none;border:none;padding:0;font:inherit;font-size:12px;color:#888780;cursor:pointer;text-align:left}' +
    '#kanban-root .kc-veh-link:hover{color:#fac055;text-decoration:underline}' +
    '#kanban-root .kc-ctype{font-size:10px;font-weight:700;color:#888780;background:#f7f6f2;border-radius:5px;padding:1px 6px}' +
    '#kanban-root .kc-veh{font-size:12px;color:#888780;margin:3px 0 8px;display:flex;align-items:center;gap:6px}' +
    '#kanban-root .kc-vdot{width:7px;height:7px;border-radius:50%;background:#cfcdc5;flex-shrink:0}' +
    '#kanban-root .vt-vn .kc-vdot{background:#53bda7}#kanban-root .vt-vo .kc-vdot{background:#fac055}' +
    '#kanban-root .kc-vt{font-size:10px;font-weight:800;color:#888780}' +
    '#kanban-root .kc-row{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
    '#kanban-root .kc-eur{font-size:14px;font-weight:800;color:#1c2b45}' +
    '#kanban-root .k-age{font-size:10px;font-weight:700;border-radius:6px;padding:2px 7px}' +
    '#kanban-root .k-age.ok{background:rgba(83,189,167,.16);color:#2c7a68}' +
    '#kanban-root .k-age.warn{background:rgba(250,192,85,.22);color:#8a6410}' +
    '#kanban-root .k-age.late{background:rgba(217,112,112,.16);color:#b23433}' +
    '#kanban-root .kc-vers{font-size:11px;font-weight:700;color:#888780;margin-top:6px;background:#f7f6f2;border:none;border-radius:6px;padding:3px 9px;cursor:pointer;font-family:inherit}' +
    '#kanban-root .kc-vers:hover{background:rgba(172,197,228,.20);color:#2a5ea9}' +
    '#kanban-root .kc-vlist{margin-top:7px;display:flex;flex-direction:column;gap:5px}' +
    '#kanban-root .kc-vload{font-size:11px;color:#b4b2a9;padding:4px 2px}' +
    '#kanban-root .kc-vrow{display:flex;align-items:center;gap:8px;background:#f7f6f2;border-radius:8px;padding:6px 9px}' +
    '#kanban-root .kc-vrow.off{background:rgba(250,192,85,.14)}' +
    '#kanban-root .kc-vinfo{display:flex;align-items:center;gap:8px;min-width:0;flex:1}' +
    '#kanban-root .kc-vst{font-size:10px;font-weight:800;border-radius:5px;padding:1px 7px;text-transform:uppercase;letter-spacing:.02em}' +
    '#kanban-root .kc-vst-draft{background:#e7ebf0;color:#5a6b80}' +
    '#kanban-root .kc-vst-propale{background:rgba(250,192,85,.28);color:#8a6410}' +
    '#kanban-root .kc-vst-bdc{background:rgba(42,94,169,.14);color:#2a5ea9}' +
    '#kanban-root .kc-vst-win{background:rgba(83,189,167,.20);color:#2c7a68}' +
    '#kanban-root .kc-vst-lose{background:rgba(217,112,112,.18);color:#b23433}' +
    '#kanban-root .kc-vmt{font-size:12px;font-weight:700;color:#1c2b45}' +
    '#kanban-root .kc-vset{font-size:11px;font-weight:700;color:#fff;background:#2a5ea9;border:none;border-radius:7px;padding:5px 9px;cursor:pointer;white-space:nowrap}' +
    '#kanban-root .kc-vset:hover{background:#1f4a87}' +
    '#kanban-root .kc-vactive{font-size:10px;font-weight:800;color:#8a6410;text-transform:uppercase;letter-spacing:.03em}' +
    '#kanban-root .kc-actions{display:flex;align-items:center;gap:6px;margin-top:9px;padding-top:8px;border-top:1px solid #f1efe8}' +
    '#kanban-root .kc-ic{width:28px;height:28px;border-radius:7px;border:1px solid #ece9e1;background:#fff;color:#2a5ea9;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;transition:.12s}' +
    '#kanban-root .kc-ic:hover{background:rgba(42,94,169,.08);border-color:#2a5ea9}' +
    '#kanban-root .kc-ic[data-pdf]{color:#d97070}#kanban-root .kc-ic[data-pdf]:hover{background:rgba(217,112,112,.10);border-color:#d97070}' +
    '#kanban-root .kc-ic[data-archive]{color:#888780}' +
    '#kanban-root .kc-move{margin-left:auto}' +
    '#kanban-root .kc-menu{margin-top:8px;background:#fff;border:1px solid #ece9e1;border-radius:9px;padding:5px;display:flex;flex-direction:column;gap:3px;box-shadow:0 6px 18px rgba(42,94,169,.12)}' +
    '#kanban-root .kc-menu-b{font-size:12px;font-weight:700;color:#2a5ea9;background:#f7f6f2;border:none;border-radius:7px;padding:7px 10px;text-align:left;cursor:pointer}' +
    '#kanban-root .kc-menu-b:hover{background:rgba(42,94,169,.10)}' +
    '#kanban-root .kc-menu-empty{font-size:11px;color:#b4b2a9;padding:6px 8px}' +
    '#kanban-root #kan-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:80;font-size:13px;font-weight:700;color:#fff;padding:10px 18px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);opacity:0;transition:opacity .25s;pointer-events:none}' +
    '#kanban-root #kan-toast.ok{background:#2c7a68}' +
    '#kanban-root #kan-toast.err{background:#b23433}' +
    '@media(max-width:767px){#kanban-root .kan-toolbar{flex-direction:column!important;align-items:stretch!important;gap:10px!important}#kanban-root .k-dates{width:100%!important}#kanban-root .k-date{flex:1!important}#kanban-root .k-filters{margin-left:0!important;width:100%!important}#kanban-root .kan-board{flex-direction:column!important;overflow-x:visible!important;gap:14px!important;align-items:stretch!important}#kanban-root .kan-col{width:100%!important;min-width:0!important;background:#fff!important;border:1px solid #e8edf5;border-radius:12px;padding:0!important}#kanban-root .kc-head{position:sticky;top:0;z-index:4;border-radius:12px 12px 0 0;padding:11px 14px 10px;border-bottom:1px solid #eef0f4}#kanban-root .kc-body{padding:10px 12px;gap:10px}}' +
    '#kanban-root.kan-narrow .kan-toolbar{flex-direction:column!important;align-items:stretch!important;gap:10px!important}#kanban-root.kan-narrow .k-dates{width:100%!important}#kanban-root.kan-narrow .k-date{flex:1!important}#kanban-root.kan-narrow .k-filters{margin-left:0!important;width:100%!important}#kanban-root.kan-narrow .kan-board{flex-direction:column!important;overflow-x:visible!important;gap:14px!important;align-items:stretch!important}#kanban-root.kan-narrow .kan-col{width:100%!important;min-width:0!important;background:#fff!important;border:1px solid #e8edf5;border-radius:12px;padding:0!important}#kanban-root.kan-narrow .kc-head{position:sticky;top:0;z-index:4;border-radius:12px 12px 0 0;padding:11px 14px 10px;border-bottom:1px solid #eef0f4}#kanban-root.kan-narrow .kc-body{padding:10px 12px;gap:10px}' +
    '</style>';

  // Démarrage : le loader fournit __anchor et possède le cycle de vie (re-montage
  // SPA compris) -> plus d'attente d'ancre ni de filets de re-render.
  {
    const w = wwLib.getFrontWindow();
    if (w.oropraLoadUser) { await w.oropraLoadUser(); }
    if (perimMode() === 'self' && state.vendeurId == null) { state.vendeurId = getViewerId(); state.vendeurName = getViewerName(); }
    render(); loadData();
  }

  (function bindKanNarrow() {
    const W = (doc.defaultView || window);
    function apply() {
      const root = getRoot(); if (!root) return;
      let w = 0; try { w = root.getBoundingClientRect().width || root.clientWidth || 0; } catch (e) { }
      if (!w) return;
      if (w <= 700) root.classList.add('kan-narrow'); else root.classList.remove('kan-narrow');
    }
    apply();[120, 400, 900, 1800, 3200].forEach(d => setTimeout(apply, d));
    try {
      const root = getRoot();
      if (root && 'ResizeObserver' in W) { if (window.__kanRO) { try { window.__kanRO.disconnect(); } catch (e) { } } window.__kanRO = new W.ResizeObserver(apply); window.__kanRO.observe(root); }
      else { if (window.__kanResize) W.removeEventListener('resize', window.__kanResize); window.__kanResize = apply; W.addEventListener('resize', window.__kanResize); }
    } catch (e) { }
  })();

  (function bindKanBus(tries) {
    tries = tries || 0;
    const b = siteBus();
    if (!b) { if (tries < 120) setTimeout(() => bindKanBus(tries + 1), 250); return; }
    if (!window.__kanBusBound) { window.__kanBusBound = true; try { b.onChange(({ siteId }) => applyBusSite(siteId)); } catch (e) { } }
    try { applyBusSite(b.getSiteId()); } catch (e) { }
  })();

}
});
