// ============================================================================
//  DASHBOARD « TOUR DE CONTRÔLE » — module One Data (OD.define)  v5
//  Cockpit orienté action + projection. Remplace le dashboard-rapport v3.
//  Rôles : vendeur · chef · directeur · marketing · admin.
//  Rendu dans __anchor ; RPC via ctx.supabase ; tenant via ctx.tenant.
//  Conserve window.__dash (lu par l'agenda) et le site-bus.
// ----------------------------------------------------------------------------
//  ══ LES 2 SEULS POINTS À CÂBLER ══
//  (1) ROLE_MAP : mets les vrais ID_Role d'admin et marketing (⬇︎ TODO).
//  (2) RPC.* : 4 fonctions SQL nouvelles (daily, todo, marketing, admin).
//      Le module RENDU DÈS MAINTENANT sans elles : projection/pouls tombent
//      sur un calcul de run-rate, la pile d'actions tombe sur tes compteurs,
//      marketing/admin affichent un état « à brancher ». Aucun crash.
// ============================================================================

OD.define('dashboard', {
  async mount(__anchor, ctx) {
    __anchor.id = 'dash-root';
    const doc = __anchor.ownerDocument || document;
    const sb  = ctx.supabase;
    function getRoot() { return __anchor; }

    // ══ (1) MAPPING DES RÔLES ════════════════════════════════════════════
    const ROLE_MAP = {
      1: 'admin',       // Admin
      2: 'directeur',   // Directeur
      3: 'chef',        // Chef des ventes
      4: 'vendeur',     // Vendeur
      5: 'marketing',   // Responsable Marketing
      6: 'directeur',   // Directeur plaque
      7: 'directeur',   // Directeur marque
      8: 'directeur',   // Directeur groupe
    };
    const FALLBACK_FAMILY = 'directeur';

    // ══ (2) NOMS DES RPC ═════════════════════════════════════════════════
    const RPC = {
      dashboard: 'get_dashboard',           // EXISTE (p_viewer_id_user, p_date_from, p_date_to)
      leads:     'get_dashboard_leads',     // EXISTE (p_viewer_id_user)
      stock:     'get_stock_synthese',      // EXISTE (p_viewer_id_user)
      daily:     'get_dashboard_daily',     // NOUVEAU — pouls  (voir contrat plus bas)
      todo:      'get_dashboard_todo',      // NOUVEAU — pile d'actions
      marketing: 'get_dashboard_marketing', // NOUVEAU — rôle marketing
      admin:     'get_dashboard_admin',     // NOUVEAU — rôle admin
    };
    // Coupe une brique si tu ne veux pas encore la câbler :
    const FLAGS = { delta: true, daily: true, todo: true };

    // ── Socle : attendre oropraUser ──────────────────────────────────────
    {
      const _w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window;
      const _uid = () => { let d = _w.oropraUser; if (Array.isArray(d)) d = d[0]; return d && d.ID_User; };
      for (let i = 0; i < 40 && _uid() == null; i++) await new Promise(r => setTimeout(r, 250));
    }
    const _w  = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window;
    const _uc = Array.isArray(_w.oropraUser) ? (_w.oropraUser[0] || {}) : (_w.oropraUser || {});
    const viewerId    = _uc.ID_User;
    const viewerName  = _uc.nomComplet || '';
    const viewerRole  = _uc.ID_Role != null ? Number(_uc.ID_Role) : null;
    const viewerSite  = _uc.ID_SITE  != null ? Number(_uc.ID_SITE)  : null;
    if (viewerId == null) { const r0 = getRoot(); if (r0) r0.innerHTML = '<div style="padding:20px;color:#7a9cc4">Utilisateur non identifié.</div>'; return; }

    function roleFamily() { const f = ROLE_MAP[viewerRole]; return f || FALLBACK_FAMILY; }
    function siteBus() { try { const w = wwLib.getFrontWindow(); if (w && w.oropraSite) return w.oropraSite; } catch (e) {} return window.oropraSite || null; }

    // ── État (window.__dash, lu par l'agenda) ────────────────────────────
    const state = window.__dash || {};
    if (state.period === undefined) { const n = new Date(); state.period = { from: ymd(new Date(n.getFullYear(), n.getMonth(), 1)), to: ymd(n) }; }
    if (state.rawData === undefined)     state.rawData = null;
    if (state.prevData === undefined)    state.prevData = null;
    if (state.daily === undefined)       state.daily = null;
    if (state.todo === undefined)        state.todo = null;
    if (state.marketing === undefined)   state.marketing = null;
    if (state.admin === undefined)       state.admin = null;
    if (state.stock === undefined)       state.stock = null;
    if (state.leadsLoaded === undefined) state.leadsLoaded = false;
    if (state.error === undefined)       state.error = null;
    if (state.loadKey === undefined)     state.loadKey = null;
    if (state.selection === undefined)   state.selection = { level: 'all', key: null, label: 'Tout le périmètre' };
    if (state.busSite === undefined)     state.busSite = (viewerSite != null ? String(viewerSite) : null);
    if (state.vnvo === undefined)        state.vnvo = 'tous';
    if (state.viewerId !== undefined && String(state.viewerId) !== String(viewerId)) {
      state.rawData = state.prevData = state.daily = state.todo = state.marketing = state.admin = state.stock = null;
      state.leadsLoaded = false; state.selection = { level: 'all', key: null, label: 'Tout le périmètre' };
    }
    state.loading = false; state.viewerId = viewerId; window.__dash = state;

    // ══ HELPERS ══════════════════════════════════════════════════════════
    function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function esc(s) { if (s == null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
    function num(v) { if (v == null) return 0; if (typeof v === 'number') return v; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; }
    function pct(re, ob) { const o = num(ob); return o > 0 ? Math.round(num(re) / o * 100) : (num(re) > 0 ? 100 : 0); }
    function tauxTransfo(d) { const den = num(d.nb_propales_tx); return den > 0 ? Math.round(num(d.nb_wins_tx) / den * 100) : 0; }
    function prenom(n) { return (n || '').trim().split(/\s+/)[0] || ''; }
    function fmtEuro(v) { const n = num(v); if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' M€'; if (n >= 1e3) return Math.round(n / 1e3) + ' k€'; return Math.round(n) + ' €'; }
    function fmtPeriod() { const f = s => new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); return f(state.period.from) + ' → ' + f(state.period.to); }
    function periodKey() { return viewerId + '_' + state.period.from + '_' + state.period.to; }

    function joursOuvres(from, to) { let n = 0; const d = new Date(from + 'T12:00:00'), e = new Date(to + 'T12:00:00'); while (d <= e) { if (d.getDay() !== 0) n++; d.setDate(d.getDate() + 1); } return n; }
    function prorataTemps() {
      const to = new Date(state.period.to + 'T12:00:00');
      const deb = new Date(to.getFullYear(), to.getMonth(), 1), fin = new Date(to.getFullYear(), to.getMonth() + 1, 0);
      const total = joursOuvres(ymd(deb), ymd(fin)), ecoules = joursOuvres(ymd(deb), state.period.to);
      return total > 0 ? Math.min(1, ecoules / total) : 1;
    }
    // Projection fin de mois = extrapolation run-rate sur les jours ouvrés
    function projection(realise, objectif) {
      const pr = prorataTemps();
      const land = pr > 0 ? Math.round(num(realise) / pr) : num(realise);
      const o = num(objectif);
      const verdict = o <= 0 ? 'neutre' : land >= o ? 'good' : land >= o * 0.9 ? 'warn' : 'bad';
      return { realise: num(realise), objectif: o, land, prorata: pr, verdict };
    }

    // ── Agrégats ─────────────────────────────────────────────────────────
    const SUM_FIELDS = ['commandes_realisees','objectif_commandes','financements_realises','objectif_financements','contrats_service_realises','objectif_contrat_service','gravages_realises','objectif_gravage','waxoyls_realises','objectif_waxoyl','cycles_ouverts','leads_a_traiter','nb_contacts','nb_entrants','nb_sortants','nb_propales','nb_bdc','nb_wins','nb_wins_tx','nb_propales_tx','nb_bdc_tx','rdv_a_venir','rdv_aujourdhui','rdv_sans_cr'];
    function emptyAgg() { const o = {}; for (const k of SUM_FIELDS) o[k] = 0; return o; }
    function addAgg(t, r) { for (const k of SUM_FIELDS) t[k] += num(r[k]); }
    function sumRows(rows) { const o = emptyAgg(); for (const r of rows) addAgg(o, r); return o; }
    function mapRow(r) { const o = { id_user: Number(r.id_user), nom_complet: r.nom_complet || ('Vendeur ' + r.id_user), fonction: r.fonction || '', id_site: r.id_site != null ? Number(r.id_site) : null, nom_site: r.nom_site || ('Site ' + r.id_site), reseau: r.reseau || '(Sans réseau)', affaire: r.affaire || '(Sans affaire)', id_affaire: r.id_affaire != null ? Number(r.id_affaire) : null, vn_vo: (r.vn_vo || '').toString().toUpperCase() }; for (const k of SUM_FIELDS) o[k] = num(r[k]); return o; }
    function byVendeur(rows) { const m = {}; for (const r of rows) { const k = String(r.id_user); if (!m[k]) m[k] = { id_user: r.id_user, nom_complet: r.nom_complet, id_site: r.id_site, nom_site: r.nom_site, ...emptyAgg() }; addAgg(m[k], r); } return Object.values(m); }
    function aggBy(rows, keyFn, labelFn) { const m = {}; for (const r of rows) { const k = keyFn(r); if (k == null || k === 'null' || k === '') continue; if (!m[k]) m[k] = { key: k, label: labelFn(r), ...emptyAgg() }; addAgg(m[k], r); } return Object.values(m).sort((a, b) => b.commandes_realisees - a.commandes_realisees); }

    function scopeRows() {
      let rows = state.rawData || [];
      const s = state.selection;
      if (s && s.level === 'site')    rows = rows.filter(r => String(r.id_site) === String(s.key));
      else if (s && s.level === 'reseau') rows = rows.filter(r => r.reseau === s.key);
      if (state.vnvo === 'vn') rows = rows.filter(r => (r.vn_vo || '').includes('VN'));
      else if (state.vnvo === 'vo') rows = rows.filter(r => (r.vn_vo || '').includes('VO'));
      return rows;
    }

    // ══ CHARGEMENT ═══════════════════════════════════════════════════════
    function prevWindow() { // même plage, un mois avant → base « ce qui a bougé »
      const shift = s => { const d = new Date(s + 'T12:00:00'); d.setMonth(d.getMonth() - 1); return ymd(d); };
      return { from: shift(state.period.from), to: shift(state.period.to) };
    }
    async function loadData() {
      window.__dashLoadData = loadData;
      const key = periodKey();
      if (state.loading) return;
      if (state.loadKey === key && state.rawData !== null) return;
      state.loading = true; state.error = null; state.loadKey = key; render();
      const fam = roleFamily();
      try {
        if (fam === 'marketing') { await loadMarketing(); state.loading = false; render(); return; }
        if (fam === 'admin')     { await loadAdmin();     state.loading = false; render(); return; }
        // Familles ventes ↓
        const { data, error } = await sb.rpc(RPC.dashboard, { p_viewer_id_user: Number(viewerId), p_date_from: state.period.from, p_date_to: state.period.to });
        if (error) throw error;
        state.rawData = (data || []).map(mapRow);
        state.viewerRole = (data && data[0] && data[0].viewer_role != null) ? Number(data[0].viewer_role) : viewerRole;
        state.leadsLoaded = false;
        state.loading = false; render();
        loadLeads(key);
        if (fam === 'chef') loadStock();
        if (FLAGS.delta) loadPrev(key);
        if (FLAGS.daily) loadDaily(key);
        if (FLAGS.todo)  loadTodo(key);
      } catch (e) {
        console.error('[dash] ' + RPC.dashboard, e);
        state.error = (e && e.message) || String(e); state.rawData = []; state.loading = false; render();
      }
    }
    async function loadPrev(k) {
      try { const w = prevWindow();
        const { data, error } = await sb.rpc(RPC.dashboard, { p_viewer_id_user: Number(viewerId), p_date_from: w.from, p_date_to: w.to });
        if (error) throw error; if (state.loadKey !== k) return;
        state.prevData = (data || []).map(mapRow); render();
      } catch (e) { console.warn('[dash] prev', e); state.prevData = []; }
    }
    async function loadLeads(k) {
      try { const { data, error } = await sb.rpc(RPC.leads, { p_viewer_id_user: Number(viewerId) });
        if (error) throw error; if (state.loadKey !== k) return;
        const idx = {}; for (const r of (data || [])) idx[Number(r.id_user) + '_' + Number(r.id_site)] = num(r.leads_a_traiter);
        for (const row of (state.rawData || [])) { const kk = row.id_user + '_' + row.id_site; row.leads_a_traiter = idx[kk] != null ? idx[kk] : 0; }
        state.leadsLoaded = true; render();
      } catch (e) { console.warn('[dash] ' + RPC.leads, e); state.leadsLoaded = true; render(); }
    }
    async function loadStock() {
      if (state.stock !== null) return;
      try { const { data, error } = await sb.rpc(RPC.stock, { p_viewer_id_user: Number(viewerId) });
        if (error) throw error;
        state.stock = (data || []).map(r => ({ categorie: r.categorie, id_site: r.id_site != null ? Number(r.id_site) : null, nb_vehicules: num(r.nb_vehicules), age_moyen_jours: num(r.age_moyen_jours), nb_vieillissants: num(r.nb_vieillissants), valeur_stock: num(r.valeur_stock) }));
        render();
      } catch (e) { console.warn('[dash] ' + RPC.stock, e); state.stock = []; }
    }
    // CONTRAT get_dashboard_daily(p_viewer_id_user, p_date_from, p_date_to)
    //   → lignes { jour date, commandes int }  (périmètre du viewer, ordonné)
    async function loadDaily(k) {
      const site = (state.selection && state.selection.level === 'site') ? Number(state.selection.key) : null;
      const vv   = (state.vnvo && state.vnvo !== 'tous') ? state.vnvo.toUpperCase() : null;
      const base = { p_viewer_id_user: Number(viewerId), p_date_from: state.period.from, p_date_to: state.period.to };
      try {
        // Signature scopee (site + VN/VO) : indispensable pour que la courbe colle
        // au chiffre affiche. Repli sur l'ancienne signature si le SQL n'est pas a jour.
        let res = await sb.rpc(RPC.daily, Object.assign({}, base, { p_id_site: site, p_vn_vo: vv }));
        if (res.error) res = await sb.rpc(RPC.daily, base);
        if (res.error) throw res.error;
        if (state.loadKey !== k) return;
        state.daily = (res.data || []).map(r => ({ jour: String(r.jour).slice(0, 10), commandes: num(r.commandes) })); render();
      } catch (e) { console.warn('[dash] ' + RPC.daily + ' (fallback run-rate)', e); state.daily = []; }
    }
    // CONTRAT get_dashboard_todo(p_viewer_id_user, p_date_from, p_date_to)
    //   → lignes { type text, priorite int, titre text, sous_titre text,
    //              hot bool, cible_type text, cible_id text }
    //   ordonnées par priorite ASC. C'est le territoire Delco (next-best-action).
    async function loadTodo(k) {
      try { const { data, error } = await sb.rpc(RPC.todo, { p_viewer_id_user: Number(viewerId), p_date_from: state.period.from, p_date_to: state.period.to });
        if (error) throw error; if (state.loadKey !== k) return;
        state.todo = (data || []).map(r => ({ type: r.type || 'lead', titre: r.titre || '', sous_titre: r.sous_titre || '', hot: !!r.hot, cible_type: r.cible_type, cible_id: r.cible_id, nb_type: num(r.nb_type) })); render();
      } catch (e) { console.warn('[dash] ' + RPC.todo + ' (fallback compteurs)', e); state.todo = null; }
    }
    // CONTRAT get_dashboard_marketing(p_viewer_id_user, p_date_from, p_date_to)
    //   → lignes { source text, leads int, rdv int, ventes int, leads_web_a_qualifier int }
    //   (une ligne par source/campagne ; RDV issus de RAPPORT_VENDEUR.resultat_rdv='Sollicitation')
    async function loadMarketing() {
      try { const { data, error } = await sb.rpc(RPC.marketing, { p_viewer_id_user: Number(viewerId), p_date_from: state.period.from, p_date_to: state.period.to });
        if (error) throw error;
        state.marketing = (data || []).map(r => ({ source: r.source || '(inconnue)', leads: num(r.leads), rdv: num(r.rdv), ventes: num(r.ventes), a_qualifier: num(r.leads_web_a_qualifier) }));
      } catch (e) { console.warn('[dash] ' + RPC.marketing, e); state.marketing = []; }
    }
    // CONTRAT get_dashboard_admin(p_viewer_id_user)  → 1 ligne :
    //   { users_actifs int, users_sans_site int, users_connectes_7j int,
    //     dernier_import_dms timestamptz, rapports_saisis_7j int, sites_sans_data int }
    async function loadAdmin() {
      try { const { data, error } = await sb.rpc(RPC.admin, { p_viewer_id_user: Number(viewerId) });
        if (error) throw error; const r = (data && data[0]) || {};
        state.admin = { users_actifs: num(r.users_actifs), users_sans_site: num(r.users_sans_site), users_connectes_7j: num(r.users_connectes_7j), dernier_import_dms: r.dernier_import_dms || null, rapports_saisis_7j: num(r.rapports_saisis_7j), sites_sans_data: num(r.sites_sans_data) };
      } catch (e) { console.warn('[dash] ' + RPC.admin, e); state.admin = {}; }
    }

    // ══ COMPOSANTS SVG ═══════════════════════════════════════════════════
    // Couleurs du graphe — SOURCE UNIQUE, partagee par le trace ET la legende.
    function projColors(p) {
      return {
        real: p.verdict === 'bad' ? '#e24b4a' : p.verdict === 'warn' ? '#854f0b' : p.verdict === 'good' ? '#0f6e56' : '#2a5ea9',
        proj: p.verdict === 'bad' ? '#e24b4a' : p.verdict === 'warn' ? '#d99a1f' : p.verdict === 'good' ? '#53bda7' : '#acc5e4',
        obj:  '#9bb3d1'
      };
    }
    function periodDays() {
      const to = new Date(state.period.to + 'T12:00:00');
      const deb = new Date(to.getFullYear(), to.getMonth(), 1), fin = new Date(to.getFullYear(), to.getMonth() + 1, 0);
      return Math.max(2, joursOuvres(ymd(deb), ymd(fin)) || 22);
    }
    // Garde de coherence : la courbe cumulee DOIT finir sur le realise affiche.
    // Sinon (perimetre du RPC different du filtre en cours) on refuse le trace
    // et on retombe sur une droite honnete plutot qu'une courbe fausse.
    function cumForChart(dailyCum, p) {
      if (!dailyCum || !dailyCum.length) return null;
      const nTot = periodDays();
      const nCur = Math.min(nTot, Math.max(1, Math.round(p.prorata * nTot)));
      const cum = dailyCum.slice(0, nCur);
      if (!cum.length) return null;
      const last = cum[cum.length - 1];
      if (!(p.realise > 0) || Math.abs(last - p.realise) > Math.max(1, p.realise * 0.02)) return null;
      return cum;
    }
    function svgTrajectory(p, cum) {
      const W = 560, H = 158, padL = 8, padR = 52, padT = 16, padB = 18;
      const nTot = periodDays();
      const nCur = Math.min(nTot, Math.max(1, Math.round(p.prorata * nTot)));
      const c = projColors(p);
      const maxY = Math.max(p.objectif, p.land, p.realise, cum ? Math.max.apply(null, cum) : 0, 1) * 1.12;
      const x = i => padL + i * (W - padL - padR) / (nTot - 1);
      const y = v => H - padB - v * (H - padT - padB) / maxY;
      let real;
      if (cum) { real = 'M' + x(0) + ',' + y(cum[0]); cum.forEach((v, i) => real += ' L' + x(i) + ',' + y(v)); }
      else real = 'M' + x(0) + ',' + y(0) + ' L' + x(nCur - 1) + ',' + y(p.realise);
      const proj = 'M' + x(nCur - 1) + ',' + y(p.realise) + ' L' + x(nTot - 1) + ',' + y(p.land);
      const obj  = 'M' + x(0) + ',' + y(0) + ' L' + x(nTot - 1) + ',' + y(p.objectif);
      const yL = y(p.land), yO = y(p.objectif);
      const yOlbl = Math.abs(yL - yO) < 13 ? yO + 13 : yO;   // evite le chevauchement des libelles
      const lbl = (vx, vy, txt, col) => '<text x="' + vx + '" y="' + vy + '" font-size="11.5" font-weight="800" fill="' + col + '" font-family="Nunito Sans,system-ui,sans-serif">' + txt + '</text>';
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="display:block;width:100%;height:auto" xmlns="http://www.w3.org/2000/svg">' +
        '<line x1="' + padL + '" y1="' + y(0) + '" x2="' + x(nTot - 1) + '" y2="' + y(0) + '" stroke="#eef2f8" stroke-width="1"/>' +
        '<line x1="' + x(nCur - 1) + '" y1="' + padT + '" x2="' + x(nCur - 1) + '" y2="' + y(0) + '" stroke="#e8eef7" stroke-width="1.5" stroke-dasharray="3 3"/>' +
        '<path d="' + obj + '" fill="none" stroke="' + c.obj + '" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round"/>' +
        '<path d="' + real + '" fill="none" stroke="' + c.real + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="' + proj + '" fill="none" stroke="' + c.proj + '" stroke-width="2.5" stroke-dasharray="2 5" stroke-linecap="round"/>' +
        '<circle cx="' + x(nCur - 1) + '" cy="' + y(p.realise) + '" r="4.5" fill="' + c.real + '"/>' +
        (p.objectif > 0 ? '<circle cx="' + x(nTot - 1) + '" cy="' + yO + '" r="3.5" fill="' + c.obj + '"/>' : '') +
        '<circle cx="' + x(nTot - 1) + '" cy="' + yL + '" r="5.5" fill="#fff" stroke="' + c.proj + '" stroke-width="3"/>' +
        lbl(x(nTot - 1) + 10, yL + 4, p.land, c.proj) +
        (p.objectif > 0 ? lbl(x(nTot - 1) + 10, yOlbl + 4, p.objectif, c.obj) : '') +
        '</svg>';
    }
    // Legende construite AVEC les memes couleurs et les memes pointilles que le trace.
    function projLegend(p, simplifie) {
      const c = projColors(p);
      const sw = (stroke, dash) => '<svg width="18" height="8" viewBox="0 0 18 8" style="flex:none"><line x1="1.5" y1="4" x2="16.5" y2="4" stroke="' + stroke + '" stroke-width="3" stroke-linecap="round"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/></svg>';
      return '<div class="d-proj-lg">' +
        '<span class="d-lg">' + sw(c.real) + 'realise</span>'.replace('realise', 'réalisé') +
        '<span class="d-lg">' + sw(c.obj, '5 4') + 'trajectoire objectif</span>' +
        '<span class="d-lg">' + sw(c.proj, '2 4') + 'atterrissage prévu</span>' +
        (simplifie ? '<span class="d-lg" style="color:#9bb3d1">· courbe simplifiée</span>' : '') +
        '</div>';
    }
    function svgSpark(vals) {
      const W = 240, H = 46, pad = 4, max = Math.max(...vals, 1);
      const x = i => pad + i * (W - 2 * pad) / (vals.length - 1), y = v => H - pad - v * (H - 2 * pad) / max;
      let bars = ''; vals.forEach((v, i) => { const bh = v * (H - 2 * pad) / max; bars += '<rect x="' + (x(i) - 4) + '" y="' + (H - pad - bh) + '" width="8" height="' + bh + '" rx="2" fill="#eef4fc"/>'; });
      let d = 'M' + x(0) + ',' + y(vals[0]); vals.forEach((v, i) => d += ' L' + x(i) + ',' + y(v));
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="46" preserveAspectRatio="none">' + bars +
        '<path d="' + d + '" fill="none" stroke="#2a5ea9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="' + x(vals.length - 1) + '" cy="' + y(vals[vals.length - 1]) + '" r="3.5" fill="#2a5ea9"/></svg>';
    }

    // ══ BRIQUES DE CARTE ═════════════════════════════════════════════════
    function brief(eyebrow, line, meta) {
      const now = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      return '<div class="d-brief"><div class="d-brief-eb"><span class="d-brief-dot"></span>' + esc(eyebrow || 'Le point du jour') + ' · ' + now + '</div>' +
        '<div class="d-brief-line">' + line + '</div>' +
        (meta && meta.length ? '<div class="d-brief-meta">' + meta.map(m => '<span>' + esc(m[0]) + ' : <b>' + esc(m[1]) + '</b></span>').join('') + '</div>' : '') + '</div>';
    }
    function projCard(p, sub) {
      const vs = p.verdict === 'bad' ? ['#a32d2d', '#fff', '\u26a0 retard'] : p.verdict === 'warn' ? ['#fac055', '#854f0b', 'à surveiller'] : p.verdict === 'good' ? ['#53bda7', '#fff', '\u2713 dans les temps'] : ['#eef2f8', '#54678a', '—'];
      const numCol = projColors(p).real;
      let daily = null; if (state.daily && state.daily.length) { let c = 0; daily = state.daily.map(d => c += d.commandes); }
      const cum = cumForChart(daily, p);
      return '<div class="d-card"><div class="d-card-hd"><span class="d-ttl">Projection fin de mois</span><span class="d-sub">' + esc(sub || 'rythme réel extrapolé') + '</span></div>' +
        '<div class="d-proj-top"><div class="d-proj-land" style="color:' + numCol + '">' + p.land + '</div>' +
        '<div class="d-proj-of">' + (p.objectif > 0 ? 'commandes prévues<br>objectif <b>' + p.objectif + '</b>' : 'commandes prévues') + '</div>' +
        '<div class="d-proj-vd" style="background:' + vs[0] + ';color:' + vs[1] + '">' + vs[2] + '</div></div>' +
        '<div>' + svgTrajectory(p, cum) + '</div>' +
        projLegend(p, !cum && !!daily) + '</div>';
    }
    const TODO_IC = { fire: '🔥', lead: '📨', rdv: '📅', cal: '📅', coach: '👤', propale: '📝', stock: '🚗', call: '📞', chart: '📉', default: '›' };
    const TODO_GROUP = { fire: 'Leads qui refroidissent', propale: 'Propales à relancer', rdv: 'Comptes-rendus manquants', cal: 'Comptes-rendus manquants', lead: 'Leads à traiter', coach: 'Coaching', stock: 'Stock à arbitrer', chart: 'À analyser', call: 'Appels à passer', hygiene: 'Hygiène du pipe' };
    // Destination d'un lien de GROUPE : toujours une LISTE (jamais une fiche,
    // qui exigerait un id_client — c'etait le bug du « + N autres »).
    const TODO_DEST = { propale: 'propale', fire: 'propale', hygiene: 'propale', stock: 'propale', rdv: 'rdv', cal: 'rdv', lead: 'lead', coach: 'performances', chart: 'performances', call: 'propale' };
    function todoRow(t) {
      return '<div class="d-todo-row" data-todo="' + esc(t.cible_type || t.type) + '" data-key="' + esc(t.cible_id || '') + '">' +
        '<div class="d-todo-ic">' + (TODO_IC[t.type] || TODO_IC.default) + '</div>' +
        '<div class="d-todo-mid"><div class="d-todo-t">' + esc(t.titre) + '</div><div class="d-todo-s">' + (t.hot ? '<span class="hot">' : '') + esc(t.sous_titre) + (t.hot ? '</span>' : '') + '</div></div>' +
        '<div class="d-todo-go">\u203a</div></div>';
    }
    function todoCard(items, title) {
      items = items || [];
      let body;
      if (!items.length) body = '<div class="d-empty" style="color:#0f6e56">Rien d\'urgent. Bon rythme 👍</div>';
      else {
        const order = [], grp = {};
        for (const t of items) {
          const g = TODO_GROUP[t.type] || 'À traiter';
          if (!grp[g]) { grp[g] = { items: [], nb: 0, famille: t.type }; order.push(g); }
          grp[g].items.push(t);
          grp[g].nb = Math.max(grp[g].nb, num(t.nb_type) || 0);
        }
        const perGrp = order.length > 2 ? 2 : 3;
        body = order.map(g => {
          const gr = grp[g], hyg = gr.famille === 'hygiene';
          const tot = Math.max(gr.nb, gr.items.length), reste = tot - Math.min(perGrp, gr.items.length);
          const dest = TODO_DEST[gr.famille] || 'performances';
          if (hyg) return '<div class="d-todo-grp hyg"><span>' + esc(g) + '</span></div>' +
            gr.items.map(t => '<div class="d-todo-hyg" data-todo="' + esc(dest) + '"><b>' + esc(t.titre) + '</b><span>' + esc(t.sous_titre) + '</span></div>').join('');
          return '<div class="d-todo-grp"><span>' + esc(g) + '</span><b>' + tot + '</b></div>' +
            gr.items.slice(0, perGrp).map(todoRow).join('') +
            (reste > 0 ? '<div class="d-todo-rest" data-todo="' + esc(dest) + '">+ ' + reste + ' autres</div>' : '');
        }).join('');
        body += '<div class="d-todo-more" data-todo="all">Voir toute ma liste \u2192</div>';
      }
      return '<div class="d-card d-act"><div class="d-card-hd"><span class="d-ttl act">' + esc(title || 'À faire maintenant') + '</span><span class="d-sub">priorisé pour toi</span></div>' +
        '<div class="d-todo">' + body + '</div></div>';
    }
    // Fallback pile d'actions : synthétise depuis les compteurs get_dashboard
    function todoFallback(agg) {
      const t = [];
      if (num(agg.leads_a_traiter) > 0) t.push({ type: 'lead', titre: num(agg.leads_a_traiter) + ' leads à traiter', sous_titre: 'certains dorment depuis plusieurs jours', hot: num(agg.leads_a_traiter) > 15, cible_type: 'leads' });
      if (num(agg.rdv_sans_cr) > 0) t.push({ type: 'cal', titre: num(agg.rdv_sans_cr) + ' RDV sans compte-rendu', sous_titre: 'à clôturer pour libérer le pipeline', cible_type: 'rdv_sans_cr' });
      if (num(agg.rdv_aujourdhui) > 0) t.push({ type: 'rdv', titre: num(agg.rdv_aujourdhui) + ' RDV aujourd\'hui', sous_titre: 'préparés ?', cible_type: 'rdv' });
      if (num(agg.nb_propales) > 0 && num(agg.nb_bdc) < num(agg.nb_propales)) t.push({ type: 'propale', titre: (num(agg.nb_propales) - num(agg.nb_bdc)) + ' propales ouvertes à relancer', sous_titre: 'transformer avant qu\'elles refroidissent', cible_type: 'propales' });
      return t;
    }
    function signalsCard(sigs) {
      if (!sigs || !sigs.length) return '';
      return '<div class="d-card d-full"><div class="d-card-hd"><span class="d-ttl">Ce qui a bougé</span><span class="d-sub">' + (state.prevData === null ? 'calcul en cours…' : 'vs même période le mois dernier') + '</span></div>' +
        '<div class="d-sigs">' + sigs.map(s => '<div class="d-sig ' + s.c + '"><span class="d-sig-a">' + s.a + '</span><div class="d-sig-v">' + s.v + '</div><div class="d-sig-l">' + esc(s.l) + '</div></div>').join('') + '</div></div>';
    }
    function pulseCard(agg) {
      let big, trend, trendTxt, note, spark;
      if (state.daily && state.daily.length >= 4) {
        const v = state.daily.map(d => d.commandes); spark = v.slice(-14);
        const last7 = v.slice(-7).reduce((a, b) => a + b, 0), prev7 = v.slice(-14, -7).reduce((a, b) => a + b, 0);
        const perDay = last7 / 7; big = perDay.toFixed(1).replace('.', ',');
        const delta = prev7 > 0 ? Math.round((last7 / prev7 - 1) * 100) : 0;
        trend = delta > 5 ? 'up' : delta < -5 ? 'dn' : 'flat'; trendTxt = (delta >= 0 ? '+' : '') + delta + ' %';
        note = 'Rythme des 7 derniers jours <b>' + (trend === 'up' ? 'en hausse' : trend === 'dn' ? 'en baisse' : 'stable') + '</b> vs les 7 précédents.';
      } else {
        const ecoules = joursOuvres(ymd(new Date(new Date(state.period.to + 'T12:00:00').getFullYear(), new Date(state.period.to + 'T12:00:00').getMonth(), 1)), state.period.to) || 1;
        const perDay = num(agg.commandes_realisees) / ecoules; big = perDay.toFixed(1).replace('.', ',');
        trend = 'flat'; trendTxt = 'run-rate'; note = 'Rythme moyen depuis le début du mois. <b>Branche get_dashboard_daily</b> pour le momentum 14 jours.';
        spark = null;
      }
      const ts = trend === 'up' ? ['#eefaf6', '#0f6e56', '▲'] : trend === 'dn' ? ['#fff2f1', '#a32d2d', '▼'] : ['#eef4fc', '#2a5ea9', '▬'];
      return '<div class="d-card"><div class="d-card-hd"><span class="d-ttl">Le pouls</span><span class="d-sub">' + (spark ? '14 derniers jours' : 'mois en cours') + '</span></div>' +
        '<div class="d-pulse-top"><span class="d-pulse-big">' + big + '<span class="d-pulse-u"> cmd/jour</span></span><span class="d-pulse-tr" style="background:' + ts[0] + ';color:' + ts[1] + '">' + ts[2] + ' ' + trendTxt + '</span></div>' +
        '<div class="d-pulse-note">' + note + '</div>' + (spark ? svgSpark(spark) : '') + '</div>';
    }
    function fireCard(title, sub, rows) { // rows: [label, gap, detail]
      if (!rows || !rows.length) return '<div class="d-card"><div class="d-card-hd"><span class="d-ttl">' + esc(title) + '</span></div><div class="d-empty" style="color:#0f6e56">Aucune alerte 👍</div></div>';
      return '<div class="d-card"><div class="d-card-hd"><span class="d-ttl">' + esc(title) + '</span><span class="d-sub">' + esc(sub) + '</span></div>' +
        '<div class="d-fire">' + rows.map(r => '<div class="d-fire-row" data-fire="' + esc(r[3] || '') + '"><span class="d-fire-nm">' + esc(r[0]) + '</span><span class="d-fire-gap">' + esc(r[1]) + '<small>' + esc(r[2]) + '</small></span></div>').join('') + '</div></div>';
    }
    function rankCard(title, vendeurs) {
      const sorted = vendeurs.slice().sort((a, b) => b.commandes_realisees - a.commandes_realisees).slice(0, 6);
      const max = Math.max(1, ...sorted.map(v => v.commandes_realisees));
      const rows = sorted.map((v, i) => { const me = String(v.id_user) === String(viewerId); const w = Math.round(v.commandes_realisees / max * 100); const col = i === 0 ? '#53bda7' : me ? '#2a5ea9' : '#acc5e4'; return '<div class="d-rank-row' + (me ? ' me' : '') + '"><span class="d-rank-pos" style="' + (i === 0 ? 'color:#854f0b' : me ? 'color:#2a5ea9' : '') + '">' + (i + 1) + '</span><span class="d-rank-nm">' + esc(v.nom_complet) + (me ? ' (vous)' : '') + '</span><div class="d-rank-bar"><i style="width:' + Math.max(6, w) + '%;background:' + col + '"></i></div><span class="d-rank-v">' + v.commandes_realisees + '</span></div>'; }).join('');
      return '<div class="d-card"><div class="d-card-hd"><span class="d-ttl">' + esc(title) + '</span><span class="d-sub">commandes du mois</span></div><div class="d-rank">' + rows + '</div></div>';
    }
    function exploreLink(label) { return '<div class="d-explore"><a data-nav="performances">' + esc(label || 'Explorer le détail par périmètre → Performances') + '</a></div>'; }

    // Deltas « ce qui a bougé » (ventes) à partir de cur vs prev
    function salesSignals(cur) {
      const prev = state.prevData ? sumRows(state.prevData) : null;
      const sig = [];
      if (prev) {
        const dTr = tauxTransfo(cur) - tauxTransfo(prev);
        sig.push({ c: dTr >= 0 ? 'good' : 'bad', a: dTr >= 0 ? '▲' : '▼', v: (dTr >= 0 ? '+' : '') + dTr + ' pts', l: 'Taux de transfo vs mois dernier' });
        const fp = num(prev.financements_realises); const dF = fp > 0 ? Math.round((num(cur.financements_realises) / fp - 1) * 100) : (num(cur.financements_realises) > 0 ? 100 : 0);
        sig.push({ c: dF >= 0 ? 'good' : 'bad', a: dF >= 0 ? '▲' : '▼', v: (dF >= 0 ? '+' : '') + dF + ' %', l: 'Financements vs mois dernier' });
      } else {
        sig.push({ c: 'warn', a: '●', v: '…', l: 'Comparaison au mois dernier en cours' });
        sig.push({ c: 'warn', a: '●', v: '…', l: '' });
      }
      const p = projection(cur.commandes_realisees, cur.objectif_commandes);
      sig.push({ c: p.verdict === 'bad' ? 'bad' : p.verdict === 'warn' ? 'warn' : 'good', a: '◎', v: p.land + '/' + p.objectif, l: 'Atterrissage prévu vs objectif' });
      return sig;
    }

    // ══ RENDER PAR RÔLE ══════════════════════════════════════════════════
    function renderVendeur() {
      const all = state.rawData || [];
      let scope = (state.busSite && all.some(r => String(r.id_site) === String(state.busSite))) ? all.filter(r => String(r.id_site) === String(state.busSite)) : all;
      const mine = scope.filter(r => String(r.id_user) === String(viewerId));
      const me = sumRows(mine.length ? mine : all.filter(r => String(r.id_user) === String(viewerId)));
      const p = projection(me.commandes_realisees, me.objectif_commandes);
      const manque = Math.max(0, p.objectif - p.land);
      const line = 'Tu es à <b>' + num(me.commandes_realisees) + ' commandes</b>, tu atterris à <b>' + p.land + '</b> — objectif <b>' + p.objectif + '</b>' + (manque > 0 ? ', <dn>il t\'en manque ' + manque + '</dn>.' : ', <up>objectif tenu</up>.') + ' Transfo <b>' + tauxTransfo(me) + '%</b>, pipeline <b>' + num(me.cycles_ouverts) + ' cycles</b>.';
      const equipe = byVendeur(scope);
      const pos = equipe.slice().sort((a, b) => b.commandes_realisees - a.commandes_realisees).findIndex(v => String(v.id_user) === String(viewerId)) + 1;
      const items = state.todo || todoFallback(me);
      return brief('Ta journée', line, [['Ta position', pos > 0 ? pos + (pos === 1 ? 'er' : 'e') + ' / ' + equipe.length : '—'], ['Pipeline', num(me.cycles_ouverts) + ' cycles'], ['Prorata mois', Math.round(p.prorata * 100) + ' %']]) +
        '<div class="d-grid">' + projCard(p, 'ta projection perso') + todoCard(items, 'Mes relances du jour') +
        signalsCard(salesSignals(me)) + pulseCard(me) +
        (equipe.length > 1 ? rankCard('Ma position dans l\'équipe', equipe) : '<div class="d-card"><div class="d-card-hd"><span class="d-ttl">Mon pipeline</span></div><div class="d-empty">' + num(me.cycles_ouverts) + ' cycles ouverts</div></div>') +
        '</div>' + exploreLink('Voir mon détail → Performances');
    }
    function renderChef() {
      loadStock();
      const rows = scopeRows(); const vendeurs = byVendeur(rows); const tot = sumRows(rows); const p = projection(tot.commandes_realisees, tot.objectif_commandes);
      const moyContacts = vendeurs.length ? vendeurs.reduce((s, v) => s + num(v.nb_contacts), 0) / vendeurs.length : 0;
      const scored = vendeurs.map(v => ({ v, s: scoreReactivite(v, moyContacts) })).sort((a, b) => a.s - b.s);
      const risk = scored.filter(x => x.s < 60);
      const line = 'Ton équipe atterrit à <b>' + p.land + ' commandes</b> pour un objectif de <b>' + p.objectif + '</b>' + (p.verdict === 'bad' ? ' — <dn>' + (p.objectif - p.land) + ' de retard</dn>' : '') + '.' + (risk.length ? ' <b>' + esc(prenom(risk[0].v.nom_complet)) + '</b> a besoin de toi (<dn>réactivité en baisse</dn>).' : '') + (num(tot.rdv_sans_cr) ? ' <b>' + num(tot.rdv_sans_cr) + ' RDV</b> attendent leur compte-rendu.' : '');
      const items = state.todo || todoFallback(tot);
      const fire = risk.slice(0, 3).map(x => [x.v.nom_complet, x.s < 45 ? 'à risque' : 'à surveiller', 'score ' + x.s, '']);
      return brief('Ton équipe', line, [['Site', state.selection.level === 'site' ? state.selection.label : 'Tous mes sites'], ['Équipe', vendeurs.length + ' vendeurs'], ['Prorata mois', Math.round(p.prorata * 100) + ' %']]) +
        chefFilters() +
        '<div class="d-grid">' + projCard(p, 'équipe · run-rate') + todoCard(items, 'À traiter avec l\'équipe') +
        signalsCard(salesSignals(tot)) + pulseCard(tot) +
        fireCard('Qui a besoin de toi', 'réactivité en baisse', fire) +
        '</div>' + blocStockCard() + exploreLink('Analyser mon équipe → Performances');
    }
    function renderDirecteur() {
      const rows = scopeRows(); const tot = sumRows(rows); const p = projection(tot.commandes_realisees, tot.objectif_commandes);
      const parSite = aggBy(rows, r => String(r.id_site), r => r.nom_site);
      const retard = parSite.filter(s => { const o = num(s.objectif_commandes); return o > 0 && num(s.commandes_realisees) / o < p.prorata - 0.15; }).sort((a, b) => pct(a.commandes_realisees, a.objectif_commandes) - pct(b.commandes_realisees, b.objectif_commandes));
      const worst = retard[0];
      const line = 'Le groupe atterrit à <b>' + p.land + ' commandes</b> pour un objectif de <b>' + p.objectif + '</b>' + (p.verdict === 'bad' ? ' — <dn>' + (p.objectif - p.land) + ' de retard</dn>' : p.verdict === 'good' ? ' — <up>dans les temps</up>' : '') + '.' + (worst ? ' Le site de <b>' + esc(worst.label) + '</b> décroche le plus.' : '');
      const items = state.todo || todoFallback(tot);
      const fire = retard.slice(0, 3).map(s => [s.label, '‑' + Math.max(0, Math.round((p.prorata - num(s.commandes_realisees) / Math.max(1, num(s.objectif_commandes))) * 100)) + ' pts', num(s.commandes_realisees) + ' / ' + num(s.objectif_commandes), 'site:' + s.key]);
      return brief('Le groupe', line, [['Périmètre', state.selection.level === 'all' ? parSite.length + ' sites' : state.selection.label], ['À traiter', (state.leadsLoaded ? num(tot.leads_a_traiter) : '…') + ' leads'], ['Prorata mois', Math.round(p.prorata * 100) + ' %']]) +
        (state.selection.level !== 'all' ? '<div class="d-scope"><span>' + esc(state.selection.label) + '</span><button type="button" data-clear="1">↺ tout le périmètre</button></div>' : '') +
        '<div class="d-grid">' + projCard(p, 'groupe · run-rate') + todoCard(items, 'Où intervenir') +
        signalsCard(salesSignals(tot)) + pulseCard(tot) +
        fireCard('Où est le feu', 'sites sous prorata', fire) +
        '</div>' + exploreLink('Explorer par réseau · affaire · site · vendeur → Performances');
    }
    function renderMarketing() {
      if (state.marketing === null) return skeleton();
      const M = state.marketing || [];
      if (!M.length) return brief('Marketing', 'Aucune donnée marketing sur la période. <b>Branche get_dashboard_marketing</b> (contrat en tête de fichier) pour activer ce dashboard.', []) + placeholderMarketing();
      const T = M.reduce((a, s) => ({ leads: a.leads + s.leads, rdv: a.rdv + s.rdv, ventes: a.ventes + s.ventes, aq: a.aq + s.a_qualifier }), { leads: 0, rdv: 0, ventes: 0, aq: 0 });
      const txLR = T.leads > 0 ? Math.round(T.rdv / T.leads * 100) : 0, txRV = T.rdv > 0 ? Math.round(T.ventes / T.rdv * 100) : 0, txLV = T.leads > 0 ? Math.round(T.ventes / T.leads * 100) : 0;
      const bySource = M.slice().sort((a, b) => b.ventes - a.ventes);
      const worst = M.filter(s => s.leads >= 10 && (s.ventes / Math.max(1, s.leads)) < txLV / 100 * 0.6).sort((a, b) => (a.ventes / Math.max(1, a.leads)) - (b.ventes / Math.max(1, b.leads)));
      const line = '<b>' + T.leads + ' leads</b> générés → <b>' + T.ventes + ' ventes</b> (<b>' + txLV + '%</b> lead→vente).' + (T.aq ? ' <dn>' + T.aq + ' leads web</dn> attendent d\'être qualifiés.' : '') + (bySource[0] ? ' Meilleure source : <b>' + esc(bySource[0].source) + '</b>.' : '');
      const items = [];
      if (T.aq) items.push({ type: 'lead', titre: T.aq + ' leads web à qualifier', sous_titre: 'certains sur des modèles en stock', hot: T.aq > 10, cible_type: 'leads_web' });
      worst.slice(0, 3).forEach(s => items.push({ type: 'chart', titre: 'Source « ' + s.source + ' » sous-performe', sous_titre: s.leads + ' leads · ' + s.ventes + ' ventes', cible_type: 'source:' + s.source }));
      return brief('Marketing', line, [['Leads période', String(T.leads)], ['Lead → vente', txLV + ' %'], ['À qualifier', String(T.aq)]]) +
        '<div class="d-grid">' + funnelCard('Entonnoir marketing', [['Leads', T.leads, '#acc5e4'], ['RDV', T.rdv, '#53bda7'], ['Ventes', T.ventes, '#fac055']], [txLR, txRV]) +
        todoCard(items, 'À activer maintenant') +
        '<div class="d-card d-full"><div class="d-card-hd"><span class="d-ttl">Performance par source</span><span class="d-sub">leads → RDV → ventes</span></div>' + sourceTable(bySource) + '</div>' +
        '</div>';
    }
    function renderAdmin() {
      if (state.admin === null) return skeleton();
      const A = state.admin || {};
      const hasRpc = A.users_actifs !== undefined && Object.keys(A).length;
      const imp = A.dernier_import_dms ? new Date(A.dernier_import_dms) : null;
      const impAge = imp ? Math.round((Date.now() - imp.getTime()) / 36e5) : null; // heures
      const impStale = impAge != null && impAge > 30; // > ~1j+
      const line = hasRpc
        ? '<b>' + num(A.users_actifs) + ' utilisateurs actifs</b>, <b>' + num(A.users_connectes_7j) + '</b> connectés cette semaine.' + (num(A.users_sans_site) ? ' <dn>' + num(A.users_sans_site) + ' comptes sans site</dn> à rattacher.' : '') + (impStale ? ' <dn>Import DMS en retard</dn> (' + impAge + ' h).' : imp ? ' Import DMS OK.' : '')
        : 'Dashboard admin prêt. <b>Branche get_dashboard_admin</b> (contrat en tête de fichier) pour l\'activer.';
      const items = [];
      if (num(A.users_sans_site)) items.push({ type: 'coach', titre: num(A.users_sans_site) + ' comptes sans site', sous_titre: 'rattacher via Admin › périmètre', hot: true, cible_type: 'admin_users' });
      if (impStale) items.push({ type: 'chart', titre: 'Import DMS en retard (' + impAge + ' h)', sous_titre: 'vérifier la pipeline GCP', cible_type: 'pipeline' });
      const sigs = hasRpc ? [
        { c: impStale ? 'bad' : 'good', a: impStale ? '▼' : '▲', v: impAge != null ? impAge + ' h' : '—', l: 'Fraîcheur des données (dernier import DMS)' },
        { c: 'good', a: '▲', v: num(A.rapports_saisis_7j), l: 'Rapports vendeur saisis (7 j) — adoption temps réel' },
        { c: num(A.users_sans_site) ? 'warn' : 'good', a: '●', v: num(A.users_sans_site), l: 'Comptes sans site rattaché' },
      ] : [];
      return brief('Santé de la plateforme', line, hasRpc ? [['Utilisateurs', num(A.users_actifs) + ' actifs'], ['Connexions 7 j', String(num(A.users_connectes_7j))], ['Sites sans data', String(num(A.sites_sans_data))]] : []) +
        (hasRpc ? '<div class="d-grid">' + todoCard(items, 'À traiter (admin)') +
          '<div class="d-card"><div class="d-card-hd"><span class="d-ttl">Adoption</span><span class="d-sub">7 derniers jours</span></div><div class="d-pulse-top"><span class="d-pulse-big">' + num(A.users_connectes_7j) + '<span class="d-pulse-u"> / ' + num(A.users_actifs) + ' actifs</span></span></div><div class="d-pulse-note">Part des utilisateurs qui se sont connectés cette semaine.</div></div>' +
          signalsCard(sigs) + '</div>' : placeholderAdmin());
    }

    // ── Composants annexes marketing/admin ───────────────────────────────
    function funnelCard(title, stages, convs) {
      const max = Math.max(...stages.map(s => s[1]), 1);
      let bars = stages.map((s, i) => { const w = Math.max(14, Math.round(s[1] / max * 100)); return '<div class="d-fn-stage"><div class="d-fn-bar" style="width:' + w + '%;background:' + s[2] + '"><b>' + s[1] + '</b><span>' + esc(s[0]) + '</span></div></div>' + (convs[i] != null ? '<div class="d-fn-conv">↓ <b>' + convs[i] + '%</b></div>' : ''); }).join('');
      return '<div class="d-card"><div class="d-card-hd"><span class="d-ttl">' + esc(title) + '</span></div><div class="d-fn">' + bars + '</div></div>';
    }
    function sourceTable(rows) {
      let h = '<table class="d-tbl"><thead><tr><th>Source</th><th class="c">Leads</th><th class="c">RDV</th><th class="c">Ventes</th><th class="c">Lead→vente</th></tr></thead><tbody>';
      for (const s of rows.slice(0, 12)) { const tx = s.leads > 0 ? Math.round(s.ventes / s.leads * 100) : 0; const c = tx >= 8 ? '#0f6e56' : tx >= 4 ? '#854f0b' : '#a32d2d'; h += '<tr><td class="d-nm">' + esc(s.source) + '</td><td class="c">' + s.leads + '</td><td class="c">' + s.rdv + '</td><td class="c">' + s.ventes + '</td><td class="c"><span class="d-tag" style="color:' + c + '">' + tx + '%</span></td></tr>'; }
      return h + '</tbody></table>';
    }
    function placeholderMarketing() { return '<div class="d-card"><div class="d-empty">Contrat attendu : <code>get_dashboard_marketing(p_viewer_id_user, p_date_from, p_date_to)</code> → { source, leads, rdv, ventes, leads_web_a_qualifier }. Les RDV « Sollicitation » viennent de RAPPORT_VENDEUR.resultat_rdv.</div></div>'; }
    function placeholderAdmin() { return '<div class="d-card"><div class="d-empty">Contrat attendu : <code>get_dashboard_admin(p_viewer_id_user)</code> → { users_actifs, users_sans_site, users_connectes_7j, dernier_import_dms, rapports_saisis_7j, sites_sans_data }.</div></div>'; }

    // ── Chef : filtres + stock (repris de v3, allégés) ───────────────────
    function chefFilters() {
      const sites = {}; for (const r of (state.rawData || [])) if (r.id_site != null) sites[String(r.id_site)] = r.nom_site;
      const arr = Object.keys(sites).map(k => ({ id: k, nom: sites[k] }));
      let h = '<div class="d-filters">';
      if (arr.length > 1) { h += '<select class="d-select" id="d-site"><option value="">Tous mes sites</option>'; for (const s of arr) h += '<option value="' + esc(s.id) + '"' + (state.selection.level === 'site' && String(state.selection.key) === String(s.id) ? ' selected' : '') + '>' + esc(s.nom) + '</option>'; h += '</select>'; }
      h += '<div class="d-toggle">'; [['tous', 'Tous'], ['vn', 'VN'], ['vo', 'VO']].forEach(o => h += '<button type="button" class="' + (state.vnvo === o[0] ? 'active' : '') + '" data-vnvo="' + o[0] + '">' + o[1] + '</button>'); h += '</div></div>';
      return h;
    }
    function scoreReactivite(v, moy) { let s = 100; s -= Math.min(40, num(v.leads_a_traiter) * 2.5); s -= Math.min(35, num(v.rdv_sans_cr) * 0.4); if (moy > 0) { const r = num(v.nb_contacts) / moy; if (r < 0.6) s -= 25; else if (r < 0.85) s -= 12; } return Math.max(0, Math.round(s)); }
    function blocStockCard() {
      if (state.stock === null) return '';
      const rows = state.stock || []; if (!rows.length) return '';
      const agg = {}; for (const r of rows) { if (!agg[r.categorie]) agg[r.categorie] = { nb: 0, vieil: 0, val: 0, aS: 0, aN: 0 }; const a = agg[r.categorie]; a.nb += r.nb_vehicules; a.vieil += r.nb_vieillissants; a.val += r.valeur_stock; if (r.age_moyen_jours > 0) { a.aS += r.age_moyen_jours * r.nb_vehicules; a.aN += r.nb_vehicules; } }
      const card = (cat, col) => { const a = agg[cat]; if (!a) return ''; const age = a.aN > 0 ? Math.round(a.aS / a.aN) : 0; return '<div class="d-stock-c"><div class="d-stock-h"><span style="color:' + col + '">' + cat + '</span><b>' + a.nb + '</b></div><div class="d-stock-l"><span>Âge moyen</span><b>' + (age || '—') + ' j</b></div><div class="d-stock-l"><span>Vieillissants</span><b style="color:' + (a.vieil ? '#a32d2d' : '#0f6e56') + '">' + a.vieil + '</b></div>' + (a.val ? '<div class="d-stock-l"><span>Valeur</span><b>' + fmtEuro(a.val) + '</b></div>' : '') + '</div>'; };
      return '<div class="d-card"><div class="d-card-hd"><span class="d-ttl">Stock en un coup d\'œil</span><span class="d-sub">VN · VO</span></div><div class="d-stock">' + card('VN', '#2a5ea9') + card('VO', '#854f0b') + '</div></div>';
    }

    // ══ SHELL / RENDER ═══════════════════════════════════════════════════
    function skeleton() { const b = '<div class="d-sk"></div>'; return '<div class="d-card">' + b + b + '</div><div class="d-grid"><div class="d-card">' + b + b + '</div><div class="d-card">' + b + b + '</div></div>'; }
    function shell(inner) {
      const showPeriod = ['vendeur', 'chef', 'directeur', 'marketing'].includes(roleFamily());
      let h = '<div class="dash">' + STYLE;
      if (showPeriod) h += '<div class="d-pbar"><span class="d-pbar-l">Période</span><button type="button" class="d-range" id="d-range">📅 ' + esc(fmtPeriod()) + ' ▾</button></div>';
      return h + inner + '</div>';
    }
    function render() {
      const root = getRoot(); if (!root) return;
      if (state.loading && state.rawData === null && state.marketing === null && state.admin === null) { root.innerHTML = shell(skeleton()); bind(); return; }
      if (state.error) { root.innerHTML = shell('<div class="d-card"><div class="d-empty" style="color:#a32d2d">Erreur : ' + esc(state.error) + '</div></div>'); bind(); return; }
      const fam = roleFamily(); let body = '';
      try {
        body = fam === 'vendeur' ? renderVendeur() : fam === 'chef' ? renderChef() : fam === 'marketing' ? renderMarketing() : fam === 'admin' ? renderAdmin() : renderDirecteur();
      } catch (e) { console.error('[dash] render', e); body = '<div class="d-card"><div class="d-empty" style="color:#a32d2d">Erreur d\'affichage : ' + esc((e && e.message) || e) + '</div></div>'; }
      root.innerHTML = shell(body); bind();
      try { (wwLib.getFrontWindow ? wwLib.getFrontWindow() : window).dispatchEvent(new Event('resize')); } catch (e) {}
    }

    // ══ NAVIGATION (calquée sur topnav.js — routes et UID réels) ═════════
    //  ÉDITEUR : par UID (wwApp.goTo) sinon imbrication de la preview.
    //  PROD : par CHEMIN /fr/xxx (un UID en prod → route inexistante → page blanche).
    //  Fiche client : on écrit {IDVu} dans VAR_CLIENT puis on navigue ; le shell
    //  fiche recharge le client depuis l'IDVu (pas de WF_GET_FICHE).
    const LANG_PREFIX = '/fr';
    const VAR_CLIENT  = '55490583-c88b-4748-916e-4d203db07742';
    const P = { client: '/fiche-client', propale: '/pipe-commercial', lead: '/marketing',
                marketing: '/marketing', admin: '/admin', performances: '/performances' };
    const PAGE_UID = {
      '/fiche-client':    '259f1951-a2d4-4b90-ac83-0b3febe1d4ec',
      '/pipe-commercial': '9e90d49a-215f-4c2b-b2bb-2d7c4f9aabd6',
      '/marketing':       '99519997-f935-471a-9147-b0118191b991',
      '/admin':           '1d30e3ac-fdee-4cce-b9c5-190aee995d23',
      '/performances':    '1499f15f-e8cb-4561-aea8-bdeeeb080b68'
    };
    const NAV_ALIAS = { rdv_sans_cr: 'rdv', propales: 'propale', stock: 'propale', leads: 'lead',
      leads_web: 'lead', all: 'propale', admin_users: 'admin', pipeline: 'admin',
      coach: 'performances', decroche_vendeur: 'performances', chart: 'performances' };
    function inEditor() { try { return window.self !== window.top; } catch (e) { return true; } }
    function goPage(path) {
      if (!path) return;
      const uid = PAGE_UID[path];
      if (inEditor()) {
        if (uid) { try { wwLib.wwApp.goTo(uid); return; } catch (e) {} try { wwLib.goTo(uid); return; } catch (e) {} }
        return;                                   // pas d'UID → on ne tente rien en éditeur
      }
      const href = LANG_PREFIX + path;
      try { wwLib.goTo(href); return; } catch (e) {}
      try { ((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).location.href = href; } catch (e) {}
    }
    // L'agenda est un module de CETTE page (accueil) : on y défile au lieu de naviguer.
    function scrollToAgenda() {
      try {
        const d = (wwLib.getFrontWindow && wwLib.getFrontWindow().document) || doc;
        const el = d.getElementById('agenda-root') || d.querySelector('[data-od-module="agenda"]');
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {}
    }
    function todoNav(type, key) {
      type = String(type || '');
      if (type.indexOf('source:') === 0) return goPage(P.marketing);
      if (type.indexOf('site:') === 0) return;              // géré par le site-bus
      const dest = NAV_ALIAS[type] || type;
      if (dest === 'rdv') return scrollToAgenda();          // agenda = même page
      if (dest === 'client') {
        if (key != null && key !== '') { try { wwLib.wwVariable.updateValue(VAR_CLIENT, { IDVu: Number(key) }); } catch (e) {} }
        return goPage(P.client);
      }
      goPage(P[dest]);
    }

    // ══ BINDINGS ═════════════════════════════════════════════════════════
    function bind() {
      const root = getRoot(); if (!root) return;
      const rg = root.querySelector('#d-range'); if (rg) rg.addEventListener('click', () => openRangePicker(rg));
      const ss = root.querySelector('#d-site'); if (ss) ss.addEventListener('change', () => { const v = ss.value || null; state.selection = v ? { level: 'site', key: v, label: (ss.options[ss.selectedIndex] || {}).text || v } : { level: 'all', key: null, label: 'Tout le périmètre' }; if (v) { const b = siteBus(); if (b) b.setSiteId(Number(v)); } state.daily = null; if (FLAGS.daily) loadDaily(state.loadKey); render(); });
      root.querySelectorAll('[data-vnvo]').forEach(b => b.addEventListener('click', () => { state.vnvo = b.getAttribute('data-vnvo'); state.daily = null; if (FLAGS.daily) loadDaily(state.loadKey); render(); }));
      root.querySelectorAll('[data-clear]').forEach(b => b.addEventListener('click', () => { state.selection = { level: 'all', key: null, label: 'Tout le périmètre' }; state.daily = null; if (FLAGS.daily) loadDaily(state.loadKey); render(); }));
      root.querySelectorAll('[data-fire]').forEach(b => b.addEventListener('click', () => { const k = b.getAttribute('data-fire'); if (k && k.indexOf('site:') === 0) { const id = k.slice(5); const bus = siteBus(); if (bus) bus.setSiteId(Number(id)); state.selection = { level: 'site', key: id, label: b.querySelector('.d-fire-nm').textContent }; render(); } }));
      root.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => todoNav(b.getAttribute('data-nav'))));
      // Pile d'actions : à toi de router selon cible_type/cible_id vers fiche client / lead / RDV.
      root.querySelectorAll('[data-todo]').forEach(b => b.addEventListener('click', () => todoNav(b.getAttribute('data-todo'), b.getAttribute('data-key'))));
    }

    // ── Sélecteur de plage (repris tel quel de v3) ───────────────────────
    function closeRangePicker() { const e = doc.getElementById('d-dp'); if (e) e.remove(); if (window.__dashDpOut) { doc.removeEventListener('mousedown', window.__dashDpOut, true); window.__dashDpOut = null; } }
    function applyPeriod(from, to) { closeRangePicker(); if (!from || !to || (from === state.period.from && to === state.period.to)) return; state.period.from = from; state.period.to = to; state.rawData = state.prevData = state.daily = state.todo = state.marketing = state.admin = null; state.loadKey = null; state.leadsLoaded = false; loadData(); }
    function openRangePicker(anchor) {
      closeRangePicker(); const pk = { month: null, start: null, end: null, hover: null }; const m0 = new Date(state.period.from + 'T12:00:00'); pk.month = new Date(m0.getFullYear(), m0.getMonth(), 1);
      const pop = doc.createElement('div'); pop.id = 'd-dp'; const r = anchor.getBoundingClientRect(); pop.style.cssText = 'position:fixed;z-index:9999;top:' + (r.bottom + 6) + 'px;left:' + Math.max(8, r.left) + 'px'; injectDpStyle(); doc.body.appendChild(pop);
      function cal() { const y = pk.month.getFullYear(), m = pk.month.getMonth(); const first = new Date(y, m, 1); const si = (first.getDay() + 6) % 7; const nd = new Date(y, m + 1, 0).getDate(); const today = ymd(new Date()); const a = pk.start, b = pk.end || pk.hover; const lo = a && b ? (a < b ? a : b) : null, hi = a && b ? (a < b ? b : a) : null; let h = '<div class="d-dp-box"><div class="d-dp-hd"><button type="button" data-nav="-1">‹</button><span>' + esc(first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })) + '</span><button type="button" data-nav="1">›</button></div><div class="d-dp-grid">'; for (const d of ['L', 'M', 'M', 'J', 'V', 'S', 'D']) h += '<span class="d-dp-dow">' + d + '</span>'; for (let i = 0; i < si; i++) h += '<span></span>'; for (let d = 1; d <= nd; d++) { const ds = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'); let c = 'd-dp-day'; if (ds === today) c += ' today'; if (pk.start === ds || pk.end === ds) c += ' sel'; else if (lo && hi && ds > lo && ds < hi) c += ' inr'; h += '<span class="' + c + '" data-d="' + ds + '">' + d + '</span>'; } return h + '</div><div class="d-dp-ft">' + (pk.start ? 'Cliquez la date de fin' : 'Cliquez la date de début') + '</div></div>'; }
      function wire() { pop.querySelectorAll('[data-nav]').forEach(bt => bt.addEventListener('click', e => { e.stopPropagation(); pk.month = new Date(pk.month.getFullYear(), pk.month.getMonth() + Number(bt.getAttribute('data-nav')), 1); paint(); })); pop.querySelectorAll('.d-dp-day').forEach(c => { c.addEventListener('click', () => { const ds = c.getAttribute('data-d'); if (!pk.start || pk.end) { pk.start = ds; pk.end = null; pk.hover = null; paint(); return; } pk.end = ds; let x = pk.start, z = pk.end; if (z < x) { const t = x; x = z; z = t; } applyPeriod(x, z); }); c.addEventListener('mouseenter', () => { if (pk.start && !pk.end && pk.hover !== c.getAttribute('data-d')) { pk.hover = c.getAttribute('data-d'); paint(); } }); }); }
      function paint() { pop.innerHTML = cal(); wire(); } paint();
      window.__dashDpOut = e => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closeRangePicker(); }; setTimeout(() => doc.addEventListener('mousedown', window.__dashDpOut, true), 0);
    }
    function injectDpStyle() { if (doc.getElementById('d-dp-style')) return; const s = doc.createElement('style'); s.id = 'd-dp-style'; s.textContent = '#d-dp .d-dp-box{background:#fff;border:1.5px solid #e8eef7;border-radius:12px;box-shadow:0 8px 30px rgba(42,94,169,.18);padding:13px;width:262px;font-family:"Nunito Sans",system-ui,sans-serif}#d-dp .d-dp-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}#d-dp .d-dp-hd span{font-size:12px;font-weight:700;color:#2a5ea9;text-transform:capitalize}#d-dp .d-dp-hd button{width:26px;height:26px;border:1.5px solid #e8eef7;background:#fff;border-radius:8px;cursor:pointer;color:#2a5ea9}#d-dp .d-dp-grid{display:grid;grid-template-columns:repeat(7,33px);gap:2px}#d-dp .d-dp-dow{font-size:9px;color:#acc5e4;text-align:center;font-weight:800;padding-bottom:3px}#d-dp .d-dp-day{height:29px;line-height:29px;text-align:center;font-size:11px;color:#2c2c2a;border-radius:7px;cursor:pointer}#d-dp .d-dp-day:hover{background:#eef4fc}#d-dp .d-dp-day.today{box-shadow:inset 0 0 0 1.5px #acc5e4}#d-dp .d-dp-day.sel{background:#2a5ea9;color:#fff;font-weight:800}#d-dp .d-dp-day.inr{background:#eef4fc}#d-dp .d-dp-ft{margin-top:8px;text-align:center;font-size:10px;color:#9bb3d1;font-style:italic}'; doc.head.appendChild(s); }

    // ══ STYLE ════════════════════════════════════════════════════════════
    const STYLE = '<style>' +
    '#dash-root{--blue:#2a5ea9;--blue-dk:#1F4A85;--green:#53bda7;--green-dk:#0f6e56;--amber:#fac055;--amber-dk:#854f0b;--red:#e24b4a;--red-dk:#a32d2d;--ink:#2c2c2a;--grey:#54678a;--grey-lt:#9bb3d1;--line:#eef2f8;--line2:#e8eef7;--fill:#f7f9fc;--fill2:#eef4fc;--act:#ff6a4d;--act-dk:#c23c1f;--act-bg:#fff2ee;--act-line:#ffd9cf;font-family:"Nunito Sans",system-ui,sans-serif;color:var(--ink)}' +
    '#dash-root *{box-sizing:border-box}' +
    '#dash-root .d-pbar{display:flex;align-items:center;gap:10px;margin-bottom:14px}' +
    '#dash-root .d-pbar-l{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--grey-lt)}' +
    '#dash-root .d-range{border:1.5px solid var(--line2);background:#fff;color:var(--blue);font-weight:800;font-size:12.5px;padding:7px 13px;border-radius:10px;cursor:pointer;font-family:inherit}' +
    '#dash-root .d-range:hover{border-color:var(--blue)}' +
    '#dash-root .d-brief{background:linear-gradient(120deg,#1F4A85,#2a5ea9 55%,#356bb8);border-radius:18px;padding:22px 24px;color:#fff;position:relative;overflow:hidden;box-shadow:0 14px 34px -14px rgba(31,74,133,.55)}' +
    '#dash-root .d-brief::after{content:"";position:absolute;right:-40px;top:-60px;width:230px;height:230px;background:radial-gradient(circle,rgba(255,255,255,.14),transparent 65%)}' +
    '#dash-root .d-brief-eb{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#bcd4f2;display:flex;align-items:center;gap:8px;margin-bottom:9px;text-transform:capitalize}' +
    '#dash-root .d-brief-dot{width:7px;height:7px;border-radius:50%;background:#53bda7;box-shadow:0 0 0 4px rgba(83,189,167,.3)}' +
    '#dash-root .d-brief-line{font-size:19px;font-weight:800;line-height:1.4;letter-spacing:-.01em;max-width:780px}' +
    '#dash-root .d-brief-line b{color:#ffd98a}#dash-root .d-brief-line up{color:#7fe3cd}#dash-root .d-brief-line dn{color:#ff9f8f}' +
    '#dash-root .d-brief-meta{margin-top:14px;display:flex;gap:20px;flex-wrap:wrap;font-size:12.5px;color:#cfe0f5;font-weight:600}#dash-root .d-brief-meta b{color:#fff}' +
    '#dash-root .d-grid{display:grid;grid-template-columns:1.35fr 1fr;gap:16px;margin-top:16px}' +
    '#dash-root .d-card{background:#fff;border:1px solid var(--line2);border-radius:16px;padding:18px 19px}' +
    '#dash-root .d-full{grid-column:1/-1}' +
    '#dash-root .d-card-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:15px;gap:8px}' +
    '#dash-root .d-ttl{font-size:12px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:var(--blue-dk)}' +
    '#dash-root .d-ttl.act{color:var(--act-dk)}' +
    '#dash-root .d-sub{font-size:11px;color:var(--grey-lt);font-weight:700;text-align:right}' +
    '#dash-root .d-proj-top{display:flex;align-items:flex-end;gap:16px;margin-bottom:4px}' +
    '#dash-root .d-proj-land{font-size:50px;font-weight:900;line-height:.9;letter-spacing:-.03em}' +
    '#dash-root .d-proj-of{font-size:14px;font-weight:800;color:var(--grey);margin-bottom:6px}#dash-root .d-proj-of b{color:var(--ink)}' +
    '#dash-root .d-proj-vd{margin-left:auto;font-size:12px;font-weight:800;padding:6px 12px;border-radius:10px;margin-bottom:5px}' +
    '#dash-root .d-proj-lg{display:flex;gap:16px;margin-top:8px;font-size:11px;font-weight:700;color:var(--grey);flex-wrap:wrap}' +
    '#dash-root .d-lg{display:flex;align-items:center;gap:6px}#dash-root .d-lg i{width:16px;height:3px;border-radius:2px;display:inline-block}#dash-root .d-lg i.dash{border-top:2px dashed var(--grey-lt);height:0}' +
    '#dash-root .d-act{background:var(--act-bg);border-color:var(--act-line)}' +
    '#dash-root .d-todo{display:flex;flex-direction:column;gap:9px}' +
    '#dash-root .d-todo-row{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--act-line);border-left:3px solid var(--act);border-radius:11px;padding:11px 13px;cursor:pointer;transition:.14s}' +
    '#dash-root .d-todo-row:hover{transform:translateX(2px);box-shadow:0 6px 16px -8px rgba(194,60,31,.4)}' +
    '#dash-root .d-todo-ic{width:34px;height:34px;flex-shrink:0;border-radius:9px;display:grid;place-items:center;font-size:15px;background:var(--act-bg)}' +
    '#dash-root .d-todo-mid{flex:1;min-width:0}#dash-root .d-todo-t{font-size:13.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#dash-root .d-todo-s{font-size:11.5px;color:var(--grey);font-weight:600;margin-top:1px}#dash-root .d-todo-s .hot{color:var(--act-dk);font-weight:800}' +
    '#dash-root .d-todo-go{font-size:18px;color:var(--act);font-weight:800}' +
    '#dash-root .d-todo-grp{display:flex;align-items:center;justify-content:space-between;font-size:10.5px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:var(--act-dk);padding:9px 3px 3px}' +
    '#dash-root .d-todo-grp b{background:#fff;border:1px solid var(--act-line);border-radius:999px;padding:1px 9px;font-size:11px}' +
    '#dash-root .d-todo-grp.hyg{color:var(--grey);margin-top:4px}' +
    '#dash-root .d-todo-hyg{background:#fff;border:1px dashed var(--line2);border-radius:11px;padding:10px 13px;cursor:pointer}' +
    '#dash-root .d-todo-hyg b{display:block;font-size:12.5px;font-weight:800;color:var(--grey)}' +
    '#dash-root .d-todo-hyg span{font-size:11.5px;color:var(--grey-lt);font-weight:600}' +
    '#dash-root .d-todo-hyg:hover{border-color:var(--grey-lt)}' +
    '#dash-root .d-todo-rest{font-size:11.5px;font-weight:800;color:var(--act-dk);opacity:.8;padding:3px 3px 0;cursor:pointer}' +
    '#dash-root .d-todo-rest:hover{text-decoration:underline}' +
    '#dash-root .d-todo-more{text-align:center;font-size:12px;font-weight:800;color:var(--act-dk);padding:8px;cursor:pointer;border-radius:9px}#dash-root .d-todo-more:hover{background:#fff}' +
    '#dash-root .d-sigs{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}' +
    '#dash-root .d-sig{border:1px solid var(--line2);border-radius:13px;padding:13px 14px;background:var(--fill)}' +
    '#dash-root .d-sig-a{font-size:12px;font-weight:900}#dash-root .d-sig-v{font-size:23px;font-weight:900;letter-spacing:-.02em;margin:2px 0 4px;line-height:1}#dash-root .d-sig-l{font-size:11.5px;color:var(--grey);font-weight:700;line-height:1.35}' +
    '#dash-root .d-sig.good{background:#eefaf6;border-color:#c6ebe0}#dash-root .d-sig.good .d-sig-v,#dash-root .d-sig.good .d-sig-a{color:var(--green-dk)}' +
    '#dash-root .d-sig.bad{background:#fff2f1;border-color:#f6cfcc}#dash-root .d-sig.bad .d-sig-v,#dash-root .d-sig.bad .d-sig-a{color:var(--red-dk)}' +
    '#dash-root .d-sig.warn{background:#fff8ec;border-color:#f4e2bf}#dash-root .d-sig.warn .d-sig-v,#dash-root .d-sig.warn .d-sig-a{color:var(--amber-dk)}' +
    '#dash-root .d-pulse-top{display:flex;align-items:baseline;gap:10px;margin-bottom:2px}#dash-root .d-pulse-big{font-size:29px;font-weight:900;letter-spacing:-.02em}#dash-root .d-pulse-u{font-size:14px;color:var(--grey);font-weight:800}' +
    '#dash-root .d-pulse-tr{font-size:12.5px;font-weight:800;padding:3px 9px;border-radius:8px}' +
    '#dash-root .d-pulse-note{font-size:12px;color:var(--grey);font-weight:600;margin-bottom:10px}#dash-root .d-pulse-note b{color:var(--ink)}' +
    '#dash-root .d-fire{display:flex;flex-direction:column;gap:8px}' +
    '#dash-root .d-fire-row{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:11px;background:var(--fill);border:1px solid var(--line2);border-left:3px solid var(--red);cursor:pointer;transition:.14s}' +
    '#dash-root .d-fire-row:hover{background:#fff;box-shadow:0 4px 12px -6px rgba(163,45,45,.35)}' +
    '#dash-root .d-fire-nm{flex:1;font-size:13px;font-weight:800;color:var(--blue-dk)}#dash-root .d-fire-gap{font-size:12px;font-weight:800;color:var(--red-dk);text-align:right}#dash-root .d-fire-gap small{display:block;font-size:10px;color:var(--grey-lt);font-weight:700}' +
    '#dash-root .d-rank{display:flex;flex-direction:column;gap:7px}#dash-root .d-rank-row{display:flex;align-items:center;gap:10px}#dash-root .d-rank-row.me{background:var(--fill2);border-radius:8px;margin:0 -6px;padding:4px 6px}' +
    '#dash-root .d-rank-pos{width:20px;text-align:center;font-weight:900;font-size:13px;color:var(--grey)}#dash-root .d-rank-nm{flex:1;font-size:12.5px;font-weight:700;color:var(--blue);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#dash-root .d-rank-bar{width:84px;height:12px;background:var(--line);border-radius:4px;overflow:hidden}#dash-root .d-rank-bar i{display:block;height:100%;border-radius:4px}#dash-root .d-rank-v{width:26px;text-align:right;font-size:12px;font-weight:800;color:var(--grey)}' +
    '#dash-root .d-fn{display:flex;flex-direction:column;gap:2px}#dash-root .d-fn-stage{display:flex}#dash-root .d-fn-bar{height:38px;border-radius:8px;display:flex;align-items:center;gap:8px;padding:0 12px;min-width:70px}#dash-root .d-fn-bar b{font-size:16px;font-weight:900;color:#fff}#dash-root .d-fn-bar span{font-size:11px;font-weight:800;color:rgba(255,255,255,.9)}#dash-root .d-fn-conv{font-size:10px;font-weight:800;color:var(--grey-lt);padding:2px 0 2px 12px}' +
    '#dash-root .d-tbl{width:100%;border-collapse:collapse;font-size:12px}#dash-root .d-tbl th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--grey-lt);font-weight:800;padding:7px 9px;border-bottom:1.5px solid var(--line)}#dash-root .d-tbl th.c{text-align:center}#dash-root .d-tbl td{padding:9px;border-bottom:1px solid var(--line)}#dash-root .d-tbl td.c{text-align:center}#dash-root .d-nm{color:var(--blue);font-weight:700}#dash-root .d-tag{font-weight:800}' +
    '#dash-root .d-stock{display:grid;grid-template-columns:1fr 1fr;gap:12px}#dash-root .d-stock-c{background:var(--fill);border:1px solid var(--line2);border-radius:12px;padding:13px}#dash-root .d-stock-h{display:flex;justify-content:space-between;font-weight:900;font-size:12px;margin-bottom:9px}#dash-root .d-stock-h b{font-size:20px;color:var(--blue-dk)}#dash-root .d-stock-l{display:flex;justify-content:space-between;font-size:11px;color:var(--grey);font-weight:600;margin-top:5px}#dash-root .d-stock-l b{color:var(--ink)}' +
    '#dash-root .d-filters{display:flex;gap:10px;margin:14px 0 0;flex-wrap:wrap}#dash-root .d-select{border:1.5px solid var(--line2);border-radius:9px;padding:7px 11px;font-size:12px;font-family:inherit;color:var(--ink);font-weight:600}#dash-root .d-toggle{display:inline-flex;background:var(--fill);border-radius:9px;padding:3px}#dash-root .d-toggle button{border:0;background:transparent;font-family:inherit;font-weight:800;font-size:12px;color:var(--grey);padding:6px 13px;border-radius:7px;cursor:pointer}#dash-root .d-toggle button.active{background:#fff;color:var(--blue);box-shadow:0 1px 4px rgba(42,94,169,.15)}' +
    '#dash-root .d-scope{display:flex;align-items:center;gap:10px;margin-top:12px;font-size:13px;font-weight:700;color:var(--blue-dk)}#dash-root .d-scope button{border:1.5px solid var(--line2);background:#fff;color:var(--grey-lt);border-radius:8px;padding:4px 11px;font-size:11px;cursor:pointer;font-family:inherit;font-weight:700}' +
    '#dash-root .d-explore{margin-top:16px;display:flex;justify-content:center}#dash-root .d-explore a{font-size:12.5px;font-weight:800;color:var(--blue);background:#fff;border:1px solid var(--line2);padding:11px 22px;border-radius:12px;cursor:pointer;transition:.15s}#dash-root .d-explore a:hover{border-color:var(--blue);box-shadow:0 6px 16px -8px rgba(42,94,169,.4)}' +
    '#dash-root .d-empty{padding:16px;text-align:center;color:var(--grey-lt);font-size:12.5px;font-weight:600}#dash-root .d-empty code{background:var(--fill);padding:2px 6px;border-radius:5px;font-size:11px}' +
    '#dash-root .d-sk{height:14px;border-radius:7px;background:linear-gradient(90deg,#eef2f8 25%,#e2eaf5 50%,#eef2f8 75%);background-size:200% 100%;animation:dSk 1.4s infinite;margin-bottom:10px}@keyframes dSk{0%{background-position:200% 0}100%{background-position:-200% 0}}' +
    '@media(max-width:820px){#dash-root .d-grid{grid-template-columns:1fr}#dash-root .d-sigs{grid-template-columns:1fr}#dash-root .d-brief-line{font-size:16px}#dash-root .d-proj-land{font-size:40px}#dash-root .d-stock{grid-template-columns:1fr}}' +
    '</style>';

    // ══ SITE-BUS ═════════════════════════════════════════════════════════
    function bindBus(t) {
      t = t || 0; const b = siteBus(); if (!b) { if (t < 120) setTimeout(() => bindBus(t + 1), 250); return; }
      if (window.__dashBusBound) { const id = b.getSiteId(); if (id != null) applyBus(id); return; }
      window.__dashBusBound = true; b.onChange(({ siteId }) => applyBus(siteId));
    }
    function applyBus(siteId) {
      if (siteId == null) return; const id = String(siteId); state.busSite = id;
      const fam = roleFamily();
      if (fam === 'directeur' && state.rawData) { const row = (state.rawData || []).find(r => String(r.id_site) === id); if (row) state.selection = { level: 'site', key: id, label: row.nom_site }; }
      if (fam === 'chef') { const row = (state.rawData || []).find(r => String(r.id_site) === id); state.selection = row ? { level: 'site', key: id, label: row.nom_site } : state.selection; if (state.stock !== null) { state.stock = null; loadStock(); } }
      render();
    }

    // ══ DÉMARRAGE ════════════════════════════════════════════════════════
    bindBus();
    loadData();
    (function ensure() { [250, 600, 1200, 2500].forEach(d => setTimeout(() => { const r = getRoot(); if (r && !r.querySelector('.dash')) render(); }, d)); })();
  }
});
