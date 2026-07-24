// ============================================================================
//  DASHBOARD « Tour de contrôle » — module One Data (OD.define)
//  SOCLE v6 — ZÉRO NOUVEAU SQL.
//
//  Tout provient de fonctions DÉJÀ EN PRODUCTION :
//    • get_dashboard(p_viewer_id_user, p_date_from, p_date_to)
//        → 1 ligne par (vendeur × site) : réalisés, objectifs, cycles, RDV, funnel tx
//    • get_activite_equipe(p_viewer_id_user, p_date_from, p_date_to)
//        → 1 ligne par (vendeur × site × JOUR) : contacts, canaux, chocs/relances/
//          abandons, propales, bdc, wins.  jour IS NULL = vendeur SANS activité.
//    • get_stock_synthese(p_viewer_id_user)        (chef / directeur)
//    • get_dashboard_leads(p_viewer_id_user)       (vendeur / chef / marketing)
//
//  COHÉRENCE PAR CONSTRUCTION : la courbe « réalisé » est la somme des nb_wins
//  de get_activite_equipe ; get_dashboard.commandes_realisees compte les mêmes
//  PROPALE_BDC (status='win', Archived=false, datées updated_at) sur le même
//  périmètre. Les deux ne peuvent pas diverger. Un garde-fou le vérifie quand même.
//
//  AGENDA : window.__dash.rawData + .viewerRole sont posés DÈS le retour du 1er
//  RPC, avant tout rendu lourd. agenda.js les récupère via son poll (600 ms).
//  rawData conserve id_user / nom_complet / fonction / vn_vo / id_site, les 5
//  champs que son sélecteur de collaborateur consomme.
// ============================================================================

OD.define('dashboard', {
  async mount(__anchor, ctx) {
    __anchor.id = 'dash-root';
    const doc = __anchor.ownerDocument || document;
    const sb  = ctx.supabase;
    const getRoot = () => __anchor;

    // Rôles (table ROLE) : 1 Admin · 2 Directeur · 3 Chef des ventes · 4 Vendeur
    // 5 Responsable Marketing · 6 Dir. plaque · 7 Dir. marque · 8 Dir. groupe
    const ROLE_FAM = { 1: 'admin', 2: 'directeur', 3: 'chef', 4: 'vendeur',
                       5: 'marketing', 6: 'directeur', 7: 'directeur', 8: 'directeur' };

    // ── Socle : attendre oropraUser ──────────────────────────────────────
    {
      const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window;
      const uid = () => { let d = w.oropraUser; if (Array.isArray(d)) d = d[0]; return d && d.ID_User; };
      for (let i = 0; i < 40 && uid() == null; i++) await new Promise(r => setTimeout(r, 250));
    }
    const FW = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window;
    const U  = Array.isArray(FW.oropraUser) ? (FW.oropraUser[0] || {}) : (FW.oropraUser || {});
    const viewerId   = U.ID_User;
    const viewerName = U.nomComplet || '';
    const viewerRole = U.ID_Role != null ? Number(U.ID_Role) : null;
    if (viewerId == null) { getRoot().innerHTML = '<div style="padding:20px;color:#7a9cc4">Utilisateur non identifié.</div>'; return; }
    const famille = () => ROLE_FAM[state.viewerRole != null ? state.viewerRole : viewerRole] || 'directeur';

    // ── État partagé (window.__dash : lu par agenda.js) ───────────────────
    const state = window.__dash || {};
    if (!state.period) { const n = new Date(); state.period = { from: ymd(new Date(n.getFullYear(), n.getMonth(), 1)), to: ymd(n) }; }
    if (state.rawData === undefined) state.rawData = null;   // get_dashboard
    if (state.act     === undefined) state.act     = null;   // get_activite_equipe
    if (state.stock   === undefined) state.stock   = null;
    if (state.leads   === undefined) state.leads   = null;
    if (!state.selection) state.selection = { level: 'all', key: null, label: 'Tout le périmètre' };
    if (!state.vnvo) state.vnvo = 'tous';
    if (state.viewerId != null && String(state.viewerId) !== String(viewerId)) {
      state.rawData = state.act = state.stock = state.leads = null;
      state.selection = { level: 'all', key: null, label: 'Tout le périmètre' };
    }
    state.viewerId = viewerId;
    state.viewerRole = state.viewerRole != null ? state.viewerRole : viewerRole;
    state.err = null;
    window.__dash = state;
    try { FW.__dash = state; } catch (e) {}

    // ══ HELPERS ══════════════════════════════════════════════════════════
    function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function esc(s) { return s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function num(v) { if (v == null) return 0; if (typeof v === 'number') return isFinite(v) ? v : 0; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; }
    function fr(n) { return String(Math.round(num(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
    function dec1(n) { return (Math.round(num(n) * 10) / 10).toFixed(1).replace('.', ','); }
    function prenom(s) { return (s || '').trim().split(/\s+/)[0] || ''; }
    function fmtEuro(v) { const n = num(v); return n >= 1e6 ? dec1(n / 1e6) + ' M€' : n >= 1e3 ? fr(n / 1e3) + ' k€' : fr(n) + ' €'; }
    function fmtPeriod() { const f = s => new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); return f(state.period.from) + ' → ' + f(state.period.to); }
    // Jours ouvrés = lundi→samedi (dimanche exclu) — même règle que Performances.
    function joursOuvres(a, b) { let n = 0; const d = new Date(a + 'T12:00:00'), e = new Date(b + 'T12:00:00'); while (d <= e) { if (d.getDay() !== 0) n++; d.setDate(d.getDate() + 1); } return n; }
    function moisRef() { const t = new Date(state.period.to + 'T12:00:00'); return { deb: new Date(t.getFullYear(), t.getMonth(), 1), fin: new Date(t.getFullYear(), t.getMonth() + 1, 0), jour: t.getDate() }; }
    function prorata() { const m = moisRef(); const tot = joursOuvres(ymd(m.deb), ymd(m.fin)); const ec = joursOuvres(ymd(m.deb), state.period.to); return tot > 0 ? Math.min(1, ec / tot) : 1; }
    function projection(re, ob) {
      const pr = prorata(), r = num(re), o = num(ob);
      const land = pr > 0 ? Math.round(r / pr) : r;
      return { realise: r, objectif: o, land: land, prorata: pr,
               verdict: o <= 0 ? 'neutre' : land >= o ? 'good' : land >= o * 0.9 ? 'warn' : 'bad' };
    }
    // Objectifs saisis « normalement dès le 8 » → au-delà, l'absence est une anomalie.
    function alerteObjectif(obj) { return num(obj) <= 0 && moisRef().jour >= 8; }

    // ══ MAPPING ══════════════════════════════════════════════════════════
    const SUM_D = ['commandes_realisees','objectif_commandes','financements_realises','objectif_financements',
      'contrats_service_realises','objectif_contrat_service','gravages_realises','objectif_gravage',
      'waxoyls_realises','objectif_waxoyl','cycles_ouverts','leads_a_traiter','nb_contacts','nb_entrants',
      'nb_sortants','nb_propales','nb_bdc','nb_wins','nb_wins_tx','nb_propales_tx','nb_bdc_tx',
      'rdv_a_venir','rdv_aujourdhui','rdv_sans_cr'];
    const SUM_A = ['nb_contacts','nb_entrants','nb_sortants','nb_whatsapp','nb_rpv','nb_voip','nb_sms',
      'nb_chocs','nb_relances','nb_abandons','nb_propales_creees','nb_bdc','nb_wins'];

    function mapD(r) {
      const o = { id_user: Number(r.id_user), nom_complet: r.nom_complet || ('Vendeur ' + r.id_user),
        fonction: r.fonction || '', vn_vo: (r.vn_vo || '').toString().toUpperCase(),
        id_site: r.id_site != null ? Number(r.id_site) : null, nom_site: r.nom_site || ('Site ' + r.id_site),
        reseau: r.reseau || '(Sans réseau)', affaire: r.affaire || '(Sans affaire)',
        id_affaire: r.id_affaire != null ? Number(r.id_affaire) : null };
      for (const k of SUM_D) o[k] = num(r[k]);
      return o;
    }
    function mapA(r) {
      const o = { id_user: Number(r.id_user), nom_complet: r.nom_complet || ('Vendeur ' + r.id_user),
        id_site: r.id_site != null ? Number(r.id_site) : null, nom_site: r.nom_site || '',
        reseau: r.reseau || '', affaire: r.affaire || '',
        vn_vo: (r.vn_vo || '').toString().toUpperCase(),
        jour: r.jour ? String(r.jour).slice(0, 10) : null };   // null = vendeur sans activité
      for (const k of SUM_A) o[k] = num(r[k]);
      return o;
    }
    function zero(keys) { const o = {}; for (const k of keys) o[k] = 0; return o; }
    function addTo(t, r, keys) { for (const k of keys) t[k] += num(r[k]); }
    function sum(rows, keys) { const o = zero(keys); for (const r of rows) addTo(o, r, keys); return o; }

    // Filtre commun aux DEUX sources → jamais de divergence de périmètre.
    function inScope(r) {
      const s = state.selection;
      if (s.level === 'site'    && String(r.id_site) !== String(s.key)) return false;
      if (s.level === 'vendeur' && String(r.id_user) !== String(s.key)) return false;
      if (s.level === 'reseau'  && r.reseau !== s.key) return false;
      if (state.vnvo === 'vn' && !(r.vn_vo || '').includes('VN')) return false;
      if (state.vnvo === 'vo' && !(r.vn_vo || '').includes('VO')) return false;
      return true;
    }
    // Auto-réparation : une sélection qui ne désigne plus rien (donnée rechargée,
    // période changée, identifiant erroné) est annulée au lieu de vider l'écran.
    function selectionValide() {
      const s = state.selection, rows = state.rawData || [];
      if (!s || s.level === 'all') return true;
      if (!rows.length) return true;
      if (s.level === 'site')    return rows.some(r => String(r.id_site) === String(s.key));
      if (s.level === 'vendeur') return rows.some(r => String(r.id_user) === String(s.key));
      if (s.level === 'reseau')  return rows.some(r => r.reseau === s.key);
      return false;
    }
    function resetSelection() { state.selection = { level: 'all', key: null, label: 'Tout le périmètre' }; }
    const dRows = () => (state.rawData || []).filter(inScope);
    const aRows = () => (state.act || []).filter(inScope);

    function groupBy(rows, keyFn, labelFn, keys) {
      const m = {};
      for (const r of rows) {
        const k = keyFn(r); if (k == null || k === 'null' || k === '') continue;
        if (!m[k]) m[k] = Object.assign({ key: k, label: labelFn(r) }, zero(keys));
        addTo(m[k], r, keys);
      }
      return Object.values(m);
    }
    function parVendeur(rows, keys) {
      const m = {};
      for (const r of rows) {
        const k = String(r.id_user);
        if (!m[k]) m[k] = Object.assign({ id_user: r.id_user, nom_complet: r.nom_complet, id_site: r.id_site, nom_site: r.nom_site }, zero(keys));
        addTo(m[k], r, keys);
      }
      return Object.values(m);
    }
    // Vendeurs SANS aucune activité sur la période (jour null et nulle part actifs)
    function vendeursInactifs() {
      const rows = aRows();
      const actifs = {}; for (const r of rows) if (r.jour) actifs[String(r.id_user)] = 1;
      const out = {}; for (const r of rows) if (!r.jour && !actifs[String(r.id_user)]) out[String(r.id_user)] = r;
      return Object.values(out);
    }
    // Série cumulée des commandes, par jour ouvré, depuis get_activite_equipe
    function serieJours() {
      const rows = aRows().filter(r => r.jour);
      if (!rows.length) return null;
      const par = {}; for (const r of rows) par[r.jour] = (par[r.jour] || 0) + num(r.nb_wins);
      const out = []; const d = new Date(state.period.from + 'T12:00:00'), e = new Date(state.period.to + 'T12:00:00');
      while (d <= e) { const k = ymd(d); if (d.getDay() !== 0) out.push({ jour: k, n: par[k] || 0 }); d.setDate(d.getDate() + 1); }
      return out;
    }

    // ══ CHARGEMENT — 2 RPC en parallèle, rendu dès le premier ════════════
    async function load(force) {
      const key = viewerId + '|' + state.period.from + '|' + state.period.to;
      if (!force && state.key === key && state.rawData) return;
      state.key = key; state.loading = true; state.err = null; render();

      const pD = sb.rpc('get_dashboard',        { p_viewer_id_user: Number(viewerId), p_date_from: state.period.from, p_date_to: state.period.to });
      const pA = sb.rpc('get_activite_equipe',  { p_viewer_id_user: Number(viewerId), p_date_from: state.period.from, p_date_to: state.period.to });

      try {
        const rD = await pD;
        if (rD.error) throw rD.error;
        state.rawData = (rD.data || []).map(mapD);
        if (rD.data && rD.data[0] && rD.data[0].viewer_role != null) state.viewerRole = Number(rD.data[0].viewer_role);
        window.__dash = state; try { FW.__dash = state; } catch (e) {}
        state.loading = false; render();          // ← agenda débloqué ici (poll 600 ms)
      } catch (e) {
        console.error('[dash] get_dashboard', e);
        state.err = (e && e.message) || String(e); state.rawData = []; state.loading = false; render(); return;
      }

      try { const rA = await pA; if (rA.error) throw rA.error; state.act = (rA.data || []).map(mapA); render(); }
      catch (e) { console.warn('[dash] get_activite_equipe', e); state.act = []; render(); }

      const f = famille();
      if (f === 'vendeur' || f === 'chef' || f === 'marketing') loadLeads();
      if (f === 'chef' || f === 'directeur' || f === 'admin')   loadStock();
    }
    async function loadLeads() {
      if (state.leads) return;
      try { const r = await sb.rpc('get_dashboard_leads', { p_viewer_id_user: Number(viewerId) });
        if (r.error) throw r.error;
        const idx = {}; for (const x of (r.data || [])) idx[Number(x.id_user) + '_' + Number(x.id_site)] = num(x.leads_a_traiter);
        for (const row of (state.rawData || [])) row.leads_a_traiter = idx[row.id_user + '_' + row.id_site] || 0;
        state.leads = true; render();
      } catch (e) { console.warn('[dash] get_dashboard_leads', e); state.leads = true; }
    }
    async function loadStock() {
      if (state.stock) return;
      try { const r = await sb.rpc('get_stock_synthese', { p_viewer_id_user: Number(viewerId) });
        if (r.error) throw r.error;
        state.stock = (r.data || []).map(x => ({ categorie: x.categorie, id_site: x.id_site != null ? Number(x.id_site) : null,
          nb_vehicules: num(x.nb_vehicules), age_moyen_jours: num(x.age_moyen_jours),
          nb_vieillissants: num(x.nb_vieillissants), valeur_stock: num(x.valeur_stock) }));
        render();
      } catch (e) { console.warn('[dash] get_stock_synthese', e); state.stock = []; }
    }

    // ══ GRAPHIQUES (SVG, sans dépendance) ════════════════════════════════
    const COL = { blue: '#2a5ea9', blueDk: '#1F4A85', green: '#53bda7', greenDk: '#0f6e56',
                  amber: '#fac055', amberDk: '#854f0b', red: '#e24b4a', redDk: '#a32d2d',
                  grey: '#54678a', greyLt: '#9bb3d1', line: '#eef2f8' };
    function couleurs(p) {
      return { real: p.verdict === 'bad' ? COL.red : p.verdict === 'warn' ? COL.amberDk : p.verdict === 'good' ? COL.greenDk : COL.blue,
               proj: p.verdict === 'bad' ? COL.red : p.verdict === 'warn' ? '#d99a1f' : p.verdict === 'good' ? COL.green : '#acc5e4',
               obj: COL.greyLt };
    }
    function svgTraj(p, serie) {
      const W = 560, H = 156, pl = 8, pr = 52, pt = 16, pb = 18;
      const m = moisRef();
      const nTot = Math.max(2, joursOuvres(ymd(m.deb), ymd(m.fin)));
      const nCur = Math.min(nTot, Math.max(1, joursOuvres(ymd(m.deb), state.period.to)));
      let cum = null;
      if (serie && serie.length) { let c = 0; cum = serie.map(s => (c += s.n)).slice(0, nCur); }
      // Garde-fou : la courbe DOIT finir sur le réalisé affiché (même source, donc
      // ça passe ; si un jour ça diverge, on trace une droite au lieu de mentir).
      let approx = false;
      if (cum && cum.length) { const last = cum[cum.length - 1];
        if (!(p.realise > 0) || Math.abs(last - p.realise) > Math.max(1, p.realise * 0.02)) { cum = null; approx = true; } }
      const c = couleurs(p);
      const maxY = Math.max(p.objectif, p.land, p.realise, cum ? Math.max.apply(null, cum) : 0, 1) * 1.12;
      const x = i => pl + i * (W - pl - pr) / (nTot - 1);
      const y = v => H - pb - v * (H - pt - pb) / maxY;
      const real = cum ? 'M' + x(0) + ',' + y(cum[0]) + cum.map((v, i) => ' L' + x(i) + ',' + y(v)).join('')
                       : 'M' + x(0) + ',' + y(0) + ' L' + x(nCur - 1) + ',' + y(p.realise);
      const proj = 'M' + x(nCur - 1) + ',' + y(p.realise) + ' L' + x(nTot - 1) + ',' + y(p.land);
      const obj  = 'M' + x(0) + ',' + y(0) + ' L' + x(nTot - 1) + ',' + y(p.objectif);
      const yL = y(p.land), yO = y(p.objectif), yOl = Math.abs(yL - yO) < 13 ? yO + 13 : yO;
      const txt = (a, b, t, col) => '<text x="' + a + '" y="' + b + '" font-size="11.5" font-weight="800" fill="' + col + '" font-family="Nunito Sans,system-ui,sans-serif">' + t + '</text>';
      return { svg: '<svg viewBox="0 0 ' + W + ' ' + H + '" style="display:block;width:100%;height:auto" xmlns="http://www.w3.org/2000/svg">' +
          '<line x1="' + pl + '" y1="' + y(0) + '" x2="' + x(nTot - 1) + '" y2="' + y(0) + '" stroke="' + COL.line + '"/>' +
          '<line x1="' + x(nCur - 1) + '" y1="' + pt + '" x2="' + x(nCur - 1) + '" y2="' + y(0) + '" stroke="#e8eef7" stroke-dasharray="3 3"/>' +
          (p.objectif > 0 ? '<path d="' + obj + '" fill="none" stroke="' + c.obj + '" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round"/>' : '') +
          '<path d="' + real + '" fill="none" stroke="' + c.real + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<path d="' + proj + '" fill="none" stroke="' + c.proj + '" stroke-width="2.5" stroke-dasharray="2 5" stroke-linecap="round"/>' +
          '<circle cx="' + x(nCur - 1) + '" cy="' + y(p.realise) + '" r="4.5" fill="' + c.real + '"/>' +
          (p.objectif > 0 ? '<circle cx="' + x(nTot - 1) + '" cy="' + yO + '" r="3.5" fill="' + c.obj + '"/>' : '') +
          '<circle cx="' + x(nTot - 1) + '" cy="' + yL + '" r="5.5" fill="#fff" stroke="' + c.proj + '" stroke-width="3"/>' +
          txt(x(nTot - 1) + 10, yL + 4, fr(p.land), c.proj) +
          (p.objectif > 0 ? txt(x(nTot - 1) + 10, yOl + 4, fr(p.objectif), c.obj) : '') + '</svg>', approx: approx };
    }
    function legende(p, approx) {
      const c = couleurs(p);
      const sw = (s, d) => '<svg width="18" height="8" viewBox="0 0 18 8" style="flex:none"><line x1="1.5" y1="4" x2="16.5" y2="4" stroke="' + s + '" stroke-width="3" stroke-linecap="round"' + (d ? ' stroke-dasharray="' + d + '"' : '') + '/></svg>';
      return '<div class="d-lgd"><span>' + sw(c.real) + 'réalisé</span>' +
        (p.objectif > 0 ? '<span>' + sw(c.obj, '5 4') + 'trajectoire objectif</span>' : '') +
        '<span>' + sw(c.proj, '2 4') + 'atterrissage prévu</span>' +
        (approx ? '<span style="color:' + COL.greyLt + '">· courbe simplifiée</span>' : '') + '</div>';
    }
    function svgSpark(vals, col) {
      if (!vals || vals.length < 2) return '';
      const W = 240, H = 44, p = 4, max = Math.max.apply(null, vals.concat([1]));
      const x = i => p + i * (W - 2 * p) / (vals.length - 1), y = v => H - p - v * (H - 2 * p) / max;
      let bars = ''; vals.forEach((v, i) => { const h = v * (H - 2 * p) / max; bars += '<rect x="' + (x(i) - 3.5) + '" y="' + (H - p - h) + '" width="7" height="' + h + '" rx="2" fill="#eef4fc"/>'; });
      const d = 'M' + x(0) + ',' + y(vals[0]) + vals.map((v, i) => ' L' + x(i) + ',' + y(v)).join('');
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:44px" preserveAspectRatio="none">' + bars +
        '<path d="' + d + '" fill="none" stroke="' + (col || COL.blue) + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }

    // ══ CARTES ═══════════════════════════════════════════════════════════
    function bandeau(eyebrow, phrase, meta) {
      const j = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      return '<div class="d-hero"><div class="d-hero-eb"><i></i>' + esc(eyebrow) + ' · ' + j + '</div>' +
        '<div class="d-hero-l">' + phrase + '</div>' +
        (meta && meta.length ? '<div class="d-hero-m">' + meta.map(m => '<span>' + esc(m[0]) + ' : <b>' + esc(m[1]) + '</b></span>').join('') + '</div>' : '') + '</div>';
    }
    function carte(titre, sub, corps, cls) {
      return '<div class="d-c' + (cls ? ' ' + cls : '') + '"><div class="d-c-h"><span class="d-c-t">' + esc(titre) + '</span>' +
        (sub ? '<span class="d-c-s">' + esc(sub) + '</span>' : '') + '</div>' + corps + '</div>';
    }
    function carteProjection(sub) {
      const t = sum(dRows(), SUM_D);
      const p = projection(t.commandes_realisees, t.objectif_commandes);
      if (alerteObjectif(t.objectif_commandes)) {
        return carte('Projection fin de mois', sub,
          '<div class="d-warn"><span class="d-warn-t">Objectifs non saisis</span>' +
          '<span>On est le ' + moisRef().jour + ' du mois et aucun objectif de commandes n\'est renseigné sur ce périmètre. ' +
          'La projection ne peut pas être calculée — à saisir dans <b>Objectifs</b>.</span>' +
          '<div class="d-warn-n">' + fr(t.commandes_realisees) + ' commandes réalisées à ce jour</div></div>');
      }
      const c = couleurs(p), tr = svgTraj(p, serieJours());
      const vd = p.verdict === 'bad' ? [COL.redDk, '#fff', '⚠ retard'] : p.verdict === 'warn' ? [COL.amber, COL.amberDk, 'à surveiller']
               : p.verdict === 'good' ? [COL.green, '#fff', '✓ dans les temps'] : ['#eef2f8', COL.grey, '—'];
      return carte('Projection fin de mois', sub,
        '<div class="d-pj"><div class="d-pj-n" style="color:' + c.real + '">' + fr(p.land) + '</div>' +
        '<div class="d-pj-o">commandes prévues' + (p.objectif > 0 ? '<br>objectif <b>' + fr(p.objectif) + '</b>' : '') + '</div>' +
        '<div class="d-pj-v" style="background:' + vd[0] + ';color:' + vd[1] + '">' + vd[2] + '</div></div>' +
        tr.svg + legende(p, tr.approx));
    }
    function cartePouls() {
      if (!state.act) return carte('Le pouls', null, '<div class="d-empty">Chargement de l\'activité…</div>');
      const s = serieJours();
      if (!s || s.length < 2) return carte('Le pouls', null, '<div class="d-empty">Aucune activité enregistrée sur la période.</div>');
      const vals = s.map(x => x.n), n = vals.length;
      const f = vals.slice(-7).reduce((a, b) => a + b, 0), pr = vals.slice(-14, -7).reduce((a, b) => a + b, 0);
      const jf = Math.min(7, n), jp = Math.max(0, Math.min(7, n - 7));
      const rate = jf > 0 ? f / jf : 0;
      const delta = (jp > 0 && pr > 0) ? Math.round((f / jf) / (pr / jp) * 100 - 100) : null;
      const tr = delta == null ? ['#eef4fc', COL.blue, '▬', 'début de période'] :
        delta > 5 ? ['#eefaf6', COL.greenDk, '▲', '+' + delta + ' %'] :
        delta < -5 ? ['#fff2f1', COL.redDk, '▼', delta + ' %'] : ['#eef4fc', COL.blue, '▬', 'stable'];
      const a = sum(aRows(), SUM_A);
      return carte('Le pouls', jf + ' derniers jours ouvrés',
        '<div class="d-pl"><span class="d-pl-n">' + dec1(rate) + '<i> cmd/jour</i></span>' +
        '<span class="d-pl-t" style="background:' + tr[0] + ';color:' + tr[1] + '">' + tr[2] + ' ' + tr[3] + '</span></div>' +
        '<div class="d-pl-s">' + fr(a.nb_contacts) + ' contacts sur la période · ' + fr(a.nb_sortants) + ' sortants</div>' +
        svgSpark(vals.slice(-14), COL.blue));
    }
    function carteEntonnoir() {
      const a = sum(aRows(), SUM_A);
      const et = [['Contacts', a.nb_contacts, '#acc5e4'], ['Propales', a.nb_propales_creees, COL.blue],
                  ['BDC', a.nb_bdc, COL.green], ['Commandes', a.nb_wins, COL.amber]];
      const max = Math.max.apply(null, et.map(e => e[1]).concat([1]));
      let h = '<div class="d-fn">';
      et.forEach((e, i) => {
        const w = Math.max(16, Math.round(e[1] / max * 100));
        h += '<div class="d-fn-b" style="width:' + w + '%;background:' + e[2] + '"><b>' + fr(e[1]) + '</b><span>' + e[0] + '</span></div>';
        if (i < et.length - 1) { const nx = et[i + 1][1], tx = e[1] > 0 ? Math.round(nx / e[1] * 100) : 0; h += '<div class="d-fn-c">↓ ' + tx + ' %</div>'; }
      });
      return carte('Entonnoir de la période', 'activité réelle', h + '</div>');
    }
    function carteQualite() {
      const a = sum(aRows(), SUM_A);
      const tot = a.nb_chocs + a.nb_relances + a.nb_abandons;
      if (!tot) return '';
      const it = [['Chocs', a.nb_chocs, COL.greenDk, '#eefaf6'], ['Relances', a.nb_relances, COL.blue, '#eef4fc'], ['Abandons', a.nb_abandons, COL.redDk, '#fff2f1']];
      return carte('Qualité des échanges', 'issues des RPV',
        '<div class="d-q">' + it.map(x => '<div class="d-q-i" style="background:' + x[3] + '"><b style="color:' + x[2] + '">' + fr(x[1]) + '</b>' +
          '<span>' + x[0] + '</span><i>' + Math.round(x[1] / tot * 100) + ' %</i></div>').join('') + '</div>');
    }
    function carteInactifs(titre) {
      const inact = vendeursInactifs();
      if (!state.act) return carte(titre, null, '<div class="d-empty">Chargement…</div>');
      if (!inact.length) return carte(titre, null, '<div class="d-ok">✓ Tous les vendeurs ont eu de l\'activité sur la période</div>');
      return carte(titre, inact.length + ' sans aucune activité',
        '<div class="d-lst">' + inact.slice(0, 6).map(v => '<div class="d-lst-r alert"><span class="d-lst-n">' + esc(v.nom_complet) + '</span>' +
          '<span class="d-lst-v">0 contact<small>' + esc(v.nom_site || '') + '</small></span></div>').join('') +
        (inact.length > 6 ? '<div class="d-lst-more">+ ' + (inact.length - 6) + ' autres</div>' : '') + '</div>', 'd-alert');
    }
    function carteRetard(titre, type, keyFn, labelFn) {
      const pr = prorata();
      const g = groupBy(dRows(), keyFn, labelFn, SUM_D)
        .filter(x => x.objectif_commandes > 0)
        .map(x => ({ label: x.label, key: x.key, re: x.commandes_realisees, ob: x.objectif_commandes,
                     ecart: Math.round((x.commandes_realisees / x.objectif_commandes - pr) * 100) }))
        .sort((a, b) => a.ecart - b.ecart);
      const bad = g.filter(x => x.ecart < -10);
      if (!g.length) return carte(titre, null, '<div class="d-empty">Aucun objectif renseigné sur ce périmètre.</div>');
      if (!bad.length) return carte(titre, null, '<div class="d-ok">✓ Tout le monde est au rythme (prorata ' + Math.round(pr * 100) + ' %)</div>');
      return carte(titre, 'écart au prorata (' + Math.round(pr * 100) + ' %)',
        '<div class="d-lst">' + bad.slice(0, 6).map(x => '<div class="d-lst-r' + (x.ecart < -25 ? ' alert' : ' warn') + '" data-pick="' + esc(type) + ':' + esc(x.key) + '">' +
          '<span class="d-lst-n">' + esc(x.label) + '</span><span class="d-lst-v">' + x.ecart + ' pts<small>' + fr(x.re) + ' / ' + fr(x.ob) + '</small></span></div>').join('') + '</div>');
    }
    function carteClassement(titre) {
      const v = parVendeur(dRows(), SUM_D).sort((a, b) => b.commandes_realisees - a.commandes_realisees);
      if (v.length < 2) return '';
      const max = Math.max.apply(null, v.map(x => x.commandes_realisees).concat([1]));
      return carte(titre, 'commandes de la période',
        '<div class="d-rk">' + v.slice(0, 7).map((x, i) => {
          const me = String(x.id_user) === String(viewerId);
          const col = i === 0 ? COL.green : me ? COL.blue : '#acc5e4';
          return '<div class="d-rk-r' + (me ? ' me' : '') + '"><span class="d-rk-p">' + (i + 1) + '</span>' +
            '<span class="d-rk-n">' + esc(x.nom_complet) + (me ? ' (vous)' : '') + '</span>' +
            '<div class="d-rk-b"><i style="width:' + Math.max(5, Math.round(x.commandes_realisees / max * 100)) + '%;background:' + col + '"></i></div>' +
            '<span class="d-rk-v">' + fr(x.commandes_realisees) + '</span></div>';
        }).join('') + '</div>');
    }
    function carteJournee() {
      const t = sum(dRows(), SUM_D);
      const it = [['RDV aujourd\'hui', t.rdv_aujourdhui, COL.blue], ['RDV à venir', t.rdv_a_venir, COL.greenDk],
                  ['CR manquants', t.rdv_sans_cr, t.rdv_sans_cr > 0 ? COL.amberDk : COL.grey],
                  ['Leads à traiter', t.leads_a_traiter, t.leads_a_traiter > 0 ? COL.redDk : COL.grey],
                  ['Cycles ouverts', t.cycles_ouverts, COL.grey]];
      return carte('Ma journée', 'agenda ci-dessous',
        '<div class="d-kpi">' + it.map(x => '<div class="d-kpi-i"><b style="color:' + x[2] + '">' + fr(x[1]) + '</b><span>' + x[0] + '</span></div>').join('') + '</div>');
    }
    function carteStock() {
      if (!state.stock || !state.stock.length) return '';
      const ids = {}; for (const r of dRows()) ids[String(r.id_site)] = 1;
      const rows = state.stock.filter(r => state.selection.level !== 'site' ? ids[String(r.id_site)] : String(r.id_site) === String(state.selection.key));
      if (!rows.length) return '';
      const ag = {};
      for (const r of rows) { const c = r.categorie; if (!ag[c]) ag[c] = { nb: 0, vi: 0, val: 0, as: 0, an: 0 };
        const a = ag[c]; a.nb += r.nb_vehicules; a.vi += r.nb_vieillissants; a.val += r.valeur_stock;
        if (r.age_moyen_jours > 0) { a.as += r.age_moyen_jours * r.nb_vehicules; a.an += r.nb_vehicules; } }
      const bloc = (c, col) => { const a = ag[c]; if (!a) return '';
        return '<div class="d-st-c"><div class="d-st-h"><span style="color:' + col + '">' + c + '</span><b>' + fr(a.nb) + '</b></div>' +
          '<div class="d-st-l"><span>Âge moyen</span><b>' + (a.an > 0 ? fr(a.as / a.an) + ' j' : '—') + '</b></div>' +
          '<div class="d-st-l"><span>Vieillissants</span><b style="color:' + (a.vi ? COL.redDk : COL.greenDk) + '">' + fr(a.vi) + '</b></div>' +
          (a.val ? '<div class="d-st-l"><span>Valeur</span><b>' + fmtEuro(a.val) + '</b></div>' : '') + '</div>'; };
      return carte('Stock', 'VN · VO', '<div class="d-st">' + bloc('VN', COL.blue) + bloc('VO', COL.amberDk) + '</div>');
    }
    function carteLeads() {
      const t = sum(dRows(), SUM_D);
      const v = parVendeur(dRows(), SUM_D).filter(x => x.leads_a_traiter > 0).sort((a, b) => b.leads_a_traiter - a.leads_a_traiter);
      return carte('Leads à traiter', t.leads_a_traiter + ' cycles concernés',
        v.length ? '<div class="d-lst">' + v.slice(0, 6).map(x => '<div class="d-lst-r' + (x.leads_a_traiter > 5 ? ' alert' : ' warn') + '">' +
          '<span class="d-lst-n">' + esc(x.nom_complet) + '</span><span class="d-lst-v">' + fr(x.leads_a_traiter) + '<small>' + esc(x.nom_site || '') + '</small></span></div>').join('') + '</div>'
          : '<div class="d-ok">✓ Aucun lead en attente</div>');
    }

    // ══ VUES PAR RÔLE ════════════════════════════════════════════════════
    // La question du matin décide de la carte qui occupe le haut de l'écran.
    function vueVendeur() {   // « Où j'en suis, et qui je vois aujourd'hui ? »
      const mine = dRows().filter(r => String(r.id_user) === String(viewerId));
      const t = sum(mine.length ? mine : [], SUM_D);
      const p = projection(t.commandes_realisees, t.objectif_commandes);
      const cls = parVendeur(dRows(), SUM_D).sort((a, b) => b.commandes_realisees - a.commandes_realisees);
      const pos = cls.findIndex(x => String(x.id_user) === String(viewerId)) + 1;
      const manque = Math.max(0, p.objectif - p.land);
      const phrase = 'Tu es à <b>' + fr(t.commandes_realisees) + ' commandes</b>' +
        (p.objectif > 0 ? ', tu atterris à <b>' + fr(p.land) + '</b> pour un objectif de <b>' + fr(p.objectif) + '</b>' +
          (manque > 0 ? ' — <dn>il t\'en manque ' + fr(manque) + '</dn>.' : ' — <up>objectif tenu</up>.') : '.') +
        (t.rdv_aujourdhui > 0 ? ' <b>' + fr(t.rdv_aujourdhui) + ' RDV</b> aujourd\'hui.' : '');
      return bandeau('Ma journée', phrase, [['Ma position', pos > 0 ? pos + (pos === 1 ? 'er' : 'e') + ' / ' + cls.length : '—'],
        ['Pipeline', fr(t.cycles_ouverts) + ' cycles'], ['Prorata mois', Math.round(p.prorata * 100) + ' %']]) +
        filtres() + '<div class="d-g">' + carteProjectionPerso(mine) + carteJournee() + carteEntonnoirPerso(mine) + carteClassement('Ma position dans l\'équipe') + '</div>';
    }
    function carteProjectionPerso(mine) {
      const t = sum(mine, SUM_D), p = projection(t.commandes_realisees, t.objectif_commandes);
      if (alerteObjectif(t.objectif_commandes)) return carteProjection('perso');
      const c = couleurs(p);
      const mesJours = (state.act || []).filter(r => String(r.id_user) === String(viewerId) && r.jour && inScope(r));
      const par = {}; for (const r of mesJours) par[r.jour] = (par[r.jour] || 0) + num(r.nb_wins);
      const serie = []; const d = new Date(state.period.from + 'T12:00:00'), e = new Date(state.period.to + 'T12:00:00');
      while (d <= e) { if (d.getDay() !== 0) serie.push({ jour: ymd(d), n: par[ymd(d)] || 0 }); d.setDate(d.getDate() + 1); }
      const tr = svgTraj(p, serie.length ? serie : null);
      const vd = p.verdict === 'bad' ? [COL.redDk, '#fff', '⚠ retard'] : p.verdict === 'warn' ? [COL.amber, COL.amberDk, 'à surveiller']
               : p.verdict === 'good' ? [COL.green, '#fff', '✓ dans les temps'] : ['#eef2f8', COL.grey, '—'];
      return carte('Ma projection fin de mois', 'mon rythme',
        '<div class="d-pj"><div class="d-pj-n" style="color:' + c.real + '">' + fr(p.land) + '</div>' +
        '<div class="d-pj-o">commandes prévues' + (p.objectif > 0 ? '<br>objectif <b>' + fr(p.objectif) + '</b>' : '') + '</div>' +
        '<div class="d-pj-v" style="background:' + vd[0] + ';color:' + vd[1] + '">' + vd[2] + '</div></div>' + tr.svg + legende(p, tr.approx));
    }
    function carteEntonnoirPerso(mine) {
      const mesA = (state.act || []).filter(r => String(r.id_user) === String(viewerId) && inScope(r));
      const a = sum(mesA, SUM_A);
      const et = [['Contacts', a.nb_contacts, '#acc5e4'], ['Propales', a.nb_propales_creees, COL.blue], ['BDC', a.nb_bdc, COL.green], ['Commandes', a.nb_wins, COL.amber]];
      const max = Math.max.apply(null, et.map(e => e[1]).concat([1]));
      let h = '<div class="d-fn">';
      et.forEach((e, i) => { h += '<div class="d-fn-b" style="width:' + Math.max(16, Math.round(e[1] / max * 100)) + '%;background:' + e[2] + '"><b>' + fr(e[1]) + '</b><span>' + e[0] + '</span></div>';
        if (i < et.length - 1) { const tx = e[1] > 0 ? Math.round(et[i + 1][1] / e[1] * 100) : 0; h += '<div class="d-fn-c">↓ ' + tx + ' %</div>'; } });
      return carte('Mon entonnoir', 'ma période', h + '</div>');
    }
    function vueChef() {      // « Qui a besoin de moi aujourd'hui ? »
      const t = sum(dRows(), SUM_D), p = projection(t.commandes_realisees, t.objectif_commandes);
      const inact = vendeursInactifs();
      const nb = parVendeur(dRows(), SUM_D).length;
      const phrase = (inact.length ? '<dn>' + inact.length + ' vendeur' + (inact.length > 1 ? 's' : '') + '</dn> sans aucune activité sur la période. ' : 'Toute l\'équipe est active. ') +
        (p.objectif > 0 ? 'L\'équipe atterrit à <b>' + fr(p.land) + '</b> pour un objectif de <b>' + fr(p.objectif) + '</b>.' : '<b>' + fr(t.commandes_realisees) + ' commandes</b> réalisées.') +
        (t.rdv_sans_cr > 0 ? ' <b>' + fr(t.rdv_sans_cr) + '</b> comptes-rendus manquants.' : '');
      return bandeau('Mon équipe', phrase, [['Périmètre', state.selection.level === 'site' ? state.selection.label : 'Tous mes sites'],
        ['Équipe', nb + ' vendeurs'], ['Prorata mois', Math.round(p.prorata * 100) + ' %']]) +
        filtres() + '<div class="d-g">' + carteInactifs('Qui a besoin de moi') + carteProjection('équipe') +
        carteRetard('Vendeurs sous le rythme', 'vendeur', r => String(r.id_user), r => r.nom_complet) + cartePouls() +
        carteEntonnoir() + carteQualite() + carteLeads() + carteStock() + '</div>';
    }
    function vueDirecteur(titre) {  // « Le mois est-il tenu, et où ça coince ? »
      const t = sum(dRows(), SUM_D), p = projection(t.commandes_realisees, t.objectif_commandes);
      const sites = groupBy(dRows(), r => String(r.id_site), r => r.nom_site, SUM_D);
      const pr = prorata();
      const bad = sites.filter(s => s.objectif_commandes > 0 && (s.commandes_realisees / s.objectif_commandes) < pr - 0.10);
      const phrase = (p.objectif > 0 ? 'Le groupe atterrit à <b>' + fr(p.land) + ' commandes</b> pour un objectif de <b>' + fr(p.objectif) + '</b>' +
          (p.verdict === 'bad' ? ' — <dn>' + fr(p.objectif - p.land) + ' de retard</dn>.' : p.verdict === 'good' ? ' — <up>dans les temps</up>.' : '.')
          : '<b>' + fr(t.commandes_realisees) + ' commandes</b> réalisées.') +
        (bad.length ? ' <dn>' + bad.length + ' site' + (bad.length > 1 ? 's' : '') + '</dn> sous le rythme.' : '');
      return bandeau(titre || 'Le groupe', phrase, [['Périmètre', sites.length + ' sites'],
        ['Équipe', parVendeur(dRows(), SUM_D).length + ' vendeurs'], ['Prorata mois', Math.round(pr * 100) + ' %']]) +
        filtres() + '<div class="d-g">' + carteProjection('groupe') +
        carteRetard('Sites sous le rythme', 'site', r => String(r.id_site), r => r.nom_site) +
        cartePouls() + carteEntonnoir() + carteInactifs('Vendeurs sans activité') + carteQualite() + carteStock() + '</div>';
    }
    function vueMarketing() { // périmètre = les MARQUES du user (v_user_perimeter, rôle 5)
      const t = sum(dRows(), SUM_D), a = sum(aRows(), SUM_A);
      const reseaux = groupBy(dRows(), r => r.reseau, r => r.reseau, SUM_D).sort((x, y) => y.commandes_realisees - x.commandes_realisees);
      const txCmd = a.nb_contacts > 0 ? Math.round(a.nb_wins / a.nb_contacts * 1000) / 10 : 0;
      const phrase = '<b>' + fr(a.nb_contacts) + ' contacts</b> sur le périmètre → <b>' + fr(a.nb_wins) + ' commandes</b> (' + dec1(txCmd) + ' %).' +
        (t.leads_a_traiter > 0 ? ' <dn>' + fr(t.leads_a_traiter) + ' cycles</dn> ont des leads non traités.' : ' Tous les leads sont traités.');
      return bandeau('Mes marques', phrase, [['Marques', reseaux.length + ''], ['Sites', groupBy(dRows(), r => String(r.id_site), r => r.nom_site, SUM_D).length + ''],
        ['Entrants', fr(a.nb_entrants)]]) +
        filtres() + '<div class="d-g">' + carteLeads() + carteEntonnoir() + carteQualite() + cartePouls() +
        carteRetard('Sites sous le rythme', 'site', r => String(r.id_site), r => r.nom_site) +
        carte('Par marque', 'commandes de la période',
          '<div class="d-lst">' + reseaux.slice(0, 8).map(x => '<div class="d-lst-r"><span class="d-lst-n">' + esc(x.label) + '</span>' +
            '<span class="d-lst-v">' + fr(x.commandes_realisees) + '<small>' + (x.objectif_commandes > 0 ? 'obj. ' + fr(x.objectif_commandes) : 'sans objectif') + '</small></span></div>').join('') + '</div>') +
        '</div>';
    }
    function vueAdmin() {     // vue groupe + couverture des données
      const sites = groupBy(dRows(), r => String(r.id_site), r => r.nom_site, SUM_D);
      const sansCmd = sites.filter(s => s.commandes_realisees === 0);
      const sansObj = sites.filter(s => s.objectif_commandes === 0);
      const inact = vendeursInactifs();
      const couv = carte('Couverture des données', 'contrôle plateforme',
        '<div class="d-kpi">' +
        '<div class="d-kpi-i"><b>' + sites.length + '</b><span>sites actifs</span></div>' +
        '<div class="d-kpi-i"><b style="color:' + (sansCmd.length ? COL.amberDk : COL.greenDk) + '">' + sansCmd.length + '</b><span>sans commande</span></div>' +
        '<div class="d-kpi-i"><b style="color:' + (sansObj.length && moisRef().jour >= 8 ? COL.redDk : COL.grey) + '">' + sansObj.length + '</b><span>sans objectif</span></div>' +
        '<div class="d-kpi-i"><b style="color:' + (inact.length ? COL.amberDk : COL.greenDk) + '">' + inact.length + '</b><span>vendeurs inactifs</span></div>' +
        '<div class="d-kpi-i"><b>' + parVendeur(dRows(), SUM_D).length + '</b><span>vendeurs suivis</span></div></div>' +
        (sansObj.length && moisRef().jour >= 8 ? '<div class="d-warn-s">Objectifs manquants après le 8 du mois : ' + sansObj.slice(0, 5).map(s => esc(s.label)).join(' · ') + (sansObj.length > 5 ? ' …' : '') + '</div>' : ''));
      return vueDirecteur('Plateforme').replace('<div class="d-g">', '<div class="d-g">' + couv);
    }

    // ══ FILTRES / SHELL ══════════════════════════════════════════════════
    function filtres() {
      const sites = {}; for (const r of (state.rawData || [])) if (r.id_site != null) sites[String(r.id_site)] = r.nom_site;
      const arr = Object.keys(sites).map(k => ({ id: k, nom: sites[k] })).sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr'));
      let h = '<div class="d-flt">';
      if (arr.length > 1) { h += '<select class="d-sel" id="d-site"><option value="">Tout le périmètre</option>' +
        arr.map(s => '<option value="' + esc(s.id) + '"' + (state.selection.level === 'site' && String(state.selection.key) === s.id ? ' selected' : '') + '>' + esc(s.nom) + '</option>').join('') + '</select>'; }
      h += '<div class="d-tg">' + [['tous', 'Tous'], ['vn', 'VN'], ['vo', 'VO']].map(o =>
        '<button type="button" class="' + (state.vnvo === o[0] ? 'on' : '') + '" data-vnvo="' + o[0] + '">' + o[1] + '</button>').join('') + '</div>';
      if (state.selection.level !== 'all')
        h += '<span class="d-chip">' + esc(state.selection.label) + '<button type="button" data-reset="1" title="Retirer le filtre">×</button></span>';
      return h + '</div>';
    }
    function squelette() { const b = '<div class="d-sk"></div>'; return '<div class="d-c">' + b + b + b + '</div><div class="d-g"><div class="d-c">' + b + b + '</div><div class="d-c">' + b + b + '</div></div>'; }
    function render() {
      const root = getRoot(); if (!root) return;
      // Filet : une sélection devenue invalide est annulée AVANT tout calcul.
      if (state.rawData && state.rawData.length && !selectionValide()) resetSelection();
      let body;
      if (state.err) body = '<div class="d-c"><div class="d-empty" style="color:' + COL.redDk + '">Erreur : ' + esc(state.err) + '</div></div>';
      else if (!state.rawData) body = squelette();
      else if (!state.rawData.length) body = '<div class="d-c"><div class="d-empty">Aucune donnée sur ce périmètre pour la période choisie.</div></div>';
      else if (!dRows().length) body = filtres() + '<div class="d-c"><div class="d-empty">Aucune donnée pour ce filtre.<br><b data-reset="1" style="color:#2a5ea9;cursor:pointer">Revenir à tout le périmètre</b></div></div>';
      else {
        try {
          const f = famille();
          body = f === 'vendeur' ? vueVendeur() : f === 'chef' ? vueChef() : f === 'marketing' ? vueMarketing()
               : f === 'admin' ? vueAdmin() : vueDirecteur();
        } catch (e) { console.error('[dash] render', e); body = '<div class="d-c"><div class="d-empty" style="color:' + COL.redDk + '">Erreur d\'affichage : ' + esc(e && e.message) + '</div></div>'; }
      }
      root.innerHTML = '<div class="dash">' + CSS +
        '<div class="d-pb"><span>Période</span><button type="button" id="d-range">📅 ' + esc(fmtPeriod()) + ' ▾</button></div>' +
        body + '</div>';
      bind();
      try { FW.dispatchEvent(new Event('resize')); } catch (e) {}
    }
    function bind() {
      const root = getRoot(); if (!root) return;
      const rg = root.querySelector('#d-range'); if (rg) rg.addEventListener('click', () => picker(rg));
      const ss = root.querySelector('#d-site');
      if (ss) ss.addEventListener('change', () => {
        const v = ss.value || null;
        state.selection = v ? { level: 'site', key: v, label: (ss.options[ss.selectedIndex] || {}).text || v } : { level: 'all', key: null, label: 'Tout le périmètre' };
        if (v) { const b = bus(); if (b) try { b.setSiteId(Number(v)); } catch (e) {} }
        render();
      });
      root.querySelectorAll('[data-vnvo]').forEach(b => b.addEventListener('click', () => { state.vnvo = b.getAttribute('data-vnvo'); render(); }));
      root.querySelectorAll('[data-pick]').forEach(el => el.addEventListener('click', () => {
        const raw = el.getAttribute('data-pick') || '', i = raw.indexOf(':');
        if (i < 0) return;
        const lvl = raw.slice(0, i), id = raw.slice(i + 1);
        if (!id || (lvl !== 'site' && lvl !== 'vendeur')) return;
        const nm = el.querySelector('.d-lst-n');
        state.selection = { level: lvl, key: id, label: (nm && nm.textContent) || id };
        // Le site-bus ne reçoit QUE des identifiants de site (jamais un id_user).
        if (lvl === 'site') { const b = bus(); if (b) try { b.setSiteId(Number(id)); } catch (e) {} }
        render();
      }));
      root.querySelectorAll('[data-reset]').forEach(el => el.addEventListener('click', () => { resetSelection(); render(); }));
    }

    // ── Sélecteur de période ─────────────────────────────────────────────
    function closePicker() { const e = doc.getElementById('d-dp'); if (e) e.remove(); if (window.__dashOut) { doc.removeEventListener('mousedown', window.__dashOut, true); window.__dashOut = null; } }
    function picker(anchor) {
      closePicker(); const pk = { m: null, a: null, b: null, h: null };
      const m0 = new Date(state.period.from + 'T12:00:00'); pk.m = new Date(m0.getFullYear(), m0.getMonth(), 1);
      const pop = doc.createElement('div'); pop.id = 'd-dp';
      const r = anchor.getBoundingClientRect();
      pop.style.cssText = 'position:fixed;z-index:9999;top:' + (r.bottom + 6) + 'px;left:' + Math.max(8, r.left) + 'px';
      dpCss(); doc.body.appendChild(pop);
      function cal() {
        const y = pk.m.getFullYear(), mo = pk.m.getMonth(), first = new Date(y, mo, 1);
        const si = (first.getDay() + 6) % 7, nd = new Date(y, mo + 1, 0).getDate(), today = ymd(new Date());
        const a = pk.a, b = pk.b || pk.h, lo = a && b ? (a < b ? a : b) : null, hi = a && b ? (a < b ? b : a) : null;
        let h = '<div class="dp"><div class="dp-h"><button type="button" data-n="-1">‹</button><span>' + esc(first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })) + '</span><button type="button" data-n="1">›</button></div><div class="dp-g">';
        for (const d of ['L', 'M', 'M', 'J', 'V', 'S', 'D']) h += '<span class="dp-w">' + d + '</span>';
        for (let i = 0; i < si; i++) h += '<span></span>';
        for (let d = 1; d <= nd; d++) { const ds = y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
          let c = 'dp-d'; if (ds === today) c += ' t'; if (pk.a === ds || pk.b === ds) c += ' s'; else if (lo && hi && ds > lo && ds < hi) c += ' r';
          h += '<span class="' + c + '" data-d="' + ds + '">' + d + '</span>'; }
        return h + '</div><div class="dp-f">' + (pk.a ? 'Cliquez la date de fin' : 'Cliquez la date de début') + '</div></div>';
      }
      function paint() {
        pop.innerHTML = cal();
        pop.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); pk.m = new Date(pk.m.getFullYear(), pk.m.getMonth() + Number(b.getAttribute('data-n')), 1); paint(); }));
        pop.querySelectorAll('.dp-d').forEach(c => {
          c.addEventListener('click', () => { const ds = c.getAttribute('data-d');
            if (!pk.a || pk.b) { pk.a = ds; pk.b = null; pk.h = null; paint(); return; }
            pk.b = ds; let x = pk.a, z = pk.b; if (z < x) { const t = x; x = z; z = t; }
            closePicker(); state.period.from = x; state.period.to = z;
            state.rawData = state.act = null; state.leads = state.stock = null; load(true); });
          c.addEventListener('mouseenter', () => { if (pk.a && !pk.b && pk.h !== c.getAttribute('data-d')) { pk.h = c.getAttribute('data-d'); paint(); } });
        });
      }
      paint();
      window.__dashOut = e => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closePicker(); };
      setTimeout(() => doc.addEventListener('mousedown', window.__dashOut, true), 0);
    }
    function dpCss() {
      if (doc.getElementById('d-dp-css')) return;
      const s = doc.createElement('style'); s.id = 'd-dp-css';
      s.textContent = '#d-dp .dp{background:#fff;border:1.5px solid #e8eef7;border-radius:12px;box-shadow:0 8px 30px rgba(42,94,169,.18);padding:13px;width:262px;font-family:"Nunito Sans",system-ui,sans-serif}#d-dp .dp-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}#d-dp .dp-h span{font-size:12px;font-weight:700;color:#2a5ea9;text-transform:capitalize}#d-dp .dp-h button{width:26px;height:26px;border:1.5px solid #e8eef7;background:#fff;border-radius:8px;cursor:pointer;color:#2a5ea9}#d-dp .dp-g{display:grid;grid-template-columns:repeat(7,33px);gap:2px}#d-dp .dp-w{font-size:9px;color:#acc5e4;text-align:center;font-weight:800;padding-bottom:3px}#d-dp .dp-d{height:29px;line-height:29px;text-align:center;font-size:11px;border-radius:7px;cursor:pointer}#d-dp .dp-d:hover{background:#eef4fc}#d-dp .dp-d.t{box-shadow:inset 0 0 0 1.5px #acc5e4}#d-dp .dp-d.s{background:#2a5ea9;color:#fff;font-weight:800}#d-dp .dp-d.r{background:#eef4fc}#d-dp .dp-f{margin-top:8px;text-align:center;font-size:10px;color:#9bb3d1;font-style:italic}';
      doc.head.appendChild(s);
    }

    // ══ SITE BUS ═════════════════════════════════════════════════════════
    function bus() { try { const w = wwLib.getFrontWindow(); if (w && w.oropraSite) return w.oropraSite; } catch (e) {} return window.oropraSite || null; }
    function bindBus(t) {
      t = t || 0; const b = bus();
      if (!b) { if (t < 120) setTimeout(() => bindBus(t + 1), 250); return; }
      if (!window.__dashBus) { window.__dashBus = 1; try { b.onChange(({ siteId }) => applyBus(siteId)); } catch (e) {} }
      try { const id = b.getSiteId(); if (id != null) applyBus(id); } catch (e) {}
    }
    function applyBus(siteId) {
      if (siteId == null || !state.rawData) return;
      const id = String(siteId);
      const row = (state.rawData || []).find(r => String(r.id_site) === id);
      if (row) { state.selection = { level: 'site', key: id, label: row.nom_site }; render(); }
    }

    // ══ CSS ══════════════════════════════════════════════════════════════
    const CSS = '<style>' +
    '#dash-root{font-family:"Nunito Sans",system-ui,sans-serif;color:#2c2c2a}' +
    '#dash-root *{box-sizing:border-box}' +
    '#dash-root .d-pb{display:flex;align-items:center;gap:10px;margin-bottom:14px}' +
    '#dash-root .d-pb>span{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#9bb3d1}' +
    '#dash-root .d-pb button{border:1.5px solid #e8eef7;background:#fff;color:#2a5ea9;font-weight:800;font-size:12.5px;padding:7px 13px;border-radius:10px;cursor:pointer;font-family:inherit}' +
    '#dash-root .d-pb button:hover{border-color:#2a5ea9}' +
    '#dash-root .d-hero{background:linear-gradient(120deg,#1F4A85,#2a5ea9 55%,#356bb8);border-radius:18px;padding:22px 24px;color:#fff;position:relative;overflow:hidden;box-shadow:0 14px 34px -14px rgba(31,74,133,.55)}' +
    '#dash-root .d-hero::after{content:"";position:absolute;right:-40px;top:-60px;width:230px;height:230px;background:radial-gradient(circle,rgba(255,255,255,.14),transparent 65%)}' +
    '#dash-root .d-hero-eb{font-size:11px;font-weight:800;letter-spacing:.08em;color:#bcd4f2;display:flex;align-items:center;gap:8px;margin-bottom:9px;text-transform:capitalize}' +
    '#dash-root .d-hero-eb i{width:7px;height:7px;border-radius:50%;background:#53bda7;box-shadow:0 0 0 4px rgba(83,189,167,.3)}' +
    '#dash-root .d-hero-l{font-size:19px;font-weight:800;line-height:1.4;max-width:820px}' +
    '#dash-root .d-hero-l b{color:#ffd98a}#dash-root .d-hero-l up{color:#7fe3cd}#dash-root .d-hero-l dn{color:#ff9f8f}' +
    '#dash-root .d-hero-m{margin-top:14px;display:flex;gap:20px;flex-wrap:wrap;font-size:12.5px;color:#cfe0f5;font-weight:600}#dash-root .d-hero-m b{color:#fff}' +
    '#dash-root .d-flt{display:flex;gap:10px;margin:14px 0 0;flex-wrap:wrap}' +
    '#dash-root .d-sel{border:1.5px solid #e8eef7;border-radius:9px;padding:7px 11px;font-size:12px;font-family:inherit;font-weight:600;color:#2c2c2a;background:#fff}' +
    '#dash-root .d-tg{display:inline-flex;background:#f7f9fc;border-radius:9px;padding:3px}' +
    '#dash-root .d-tg button{border:0;background:transparent;font-family:inherit;font-weight:800;font-size:12px;color:#54678a;padding:6px 13px;border-radius:7px;cursor:pointer}' +
    '#dash-root .d-chip{display:inline-flex;align-items:center;gap:7px;background:#eef4fc;border:1px solid #d6e4f6;color:#1F4A85;font-size:12px;font-weight:800;padding:6px 8px 6px 12px;border-radius:9px}' +
    '#dash-root .d-chip button{border:0;background:#fff;color:#54678a;width:18px;height:18px;line-height:16px;border-radius:50%;cursor:pointer;font-size:13px;font-family:inherit;font-weight:800;padding:0}' +
    '#dash-root .d-chip button:hover{background:#e24b4a;color:#fff}' +
    '#dash-root .d-tg button.on{background:#fff;color:#2a5ea9;box-shadow:0 1px 4px rgba(42,94,169,.15)}' +
    '#dash-root .d-g{display:grid;grid-template-columns:1.3fr 1fr;gap:16px;margin-top:16px;align-items:start}' +
    '#dash-root .d-c{background:#fff;border:1px solid #e8eef7;border-radius:16px;padding:18px 19px}' +
    '#dash-root .d-c.d-alert{border-color:#f6cfcc;background:#fffaf9}' +
    '#dash-root .d-c-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px}' +
    '#dash-root .d-c-t{font-size:12px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:#1F4A85}' +
    '#dash-root .d-c-s{font-size:11px;color:#9bb3d1;font-weight:700;text-align:right}' +
    '#dash-root .d-pj{display:flex;align-items:flex-end;gap:16px;margin-bottom:6px}' +
    '#dash-root .d-pj-n{font-size:50px;font-weight:900;line-height:.9;letter-spacing:-.03em}' +
    '#dash-root .d-pj-o{font-size:14px;font-weight:800;color:#54678a;margin-bottom:6px}#dash-root .d-pj-o b{color:#2c2c2a}' +
    '#dash-root .d-pj-v{margin-left:auto;font-size:12px;font-weight:800;padding:6px 12px;border-radius:10px;margin-bottom:5px;white-space:nowrap}' +
    '#dash-root .d-lgd{display:flex;gap:16px;margin-top:8px;font-size:11px;font-weight:700;color:#54678a;flex-wrap:wrap}' +
    '#dash-root .d-lgd span{display:flex;align-items:center;gap:6px}' +
    '#dash-root .d-warn{background:#fff8ec;border:1px solid #f4e2bf;border-radius:12px;padding:15px}' +
    '#dash-root .d-warn .d-warn-t{display:block;font-size:14px;font-weight:900;color:#854f0b;margin-bottom:5px}' +
    '#dash-root .d-warn span{font-size:12.5px;color:#54678a;font-weight:600;line-height:1.5}' +
    '#dash-root .d-warn-n{margin-top:10px;font-size:15px;font-weight:900;color:#1F4A85}' +
    '#dash-root .d-warn-s{margin-top:10px;font-size:11.5px;color:#854f0b;font-weight:700;background:#fff8ec;border-radius:9px;padding:8px 10px}' +
    '#dash-root .d-pl{display:flex;align-items:baseline;gap:10px}' +
    '#dash-root .d-pl-n{font-size:29px;font-weight:900;letter-spacing:-.02em}#dash-root .d-pl-n i{font-size:14px;color:#54678a;font-weight:800;font-style:normal}' +
    '#dash-root .d-pl-t{font-size:12.5px;font-weight:800;padding:3px 9px;border-radius:8px}' +
    '#dash-root .d-pl-s{font-size:12px;color:#54678a;font-weight:600;margin:4px 0 8px}' +
    '#dash-root .d-fn{display:flex;flex-direction:column;gap:2px}' +
    '#dash-root .d-fn-b{height:38px;border-radius:8px;display:flex;align-items:center;gap:8px;padding:0 12px;min-width:86px}' +
    '#dash-root .d-fn-b b{font-size:16px;font-weight:900;color:#fff}#dash-root .d-fn-b span{font-size:11px;font-weight:800;color:rgba(255,255,255,.92)}' +
    '#dash-root .d-fn-c{font-size:10px;font-weight:800;color:#9bb3d1;padding:2px 0 2px 12px}' +
    '#dash-root .d-q{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}' +
    '#dash-root .d-q-i{border-radius:12px;padding:12px;text-align:center}' +
    '#dash-root .d-q-i b{display:block;font-size:22px;font-weight:900;line-height:1}' +
    '#dash-root .d-q-i span{font-size:11px;font-weight:700;color:#54678a}#dash-root .d-q-i i{display:block;font-size:10.5px;color:#9bb3d1;font-weight:800;font-style:normal;margin-top:2px}' +
    '#dash-root .d-lst{display:flex;flex-direction:column;gap:8px}' +
    '#dash-root .d-lst-r{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:11px;background:#f7f9fc;border:1px solid #e8eef7;border-left:3px solid #acc5e4}' +
    '#dash-root .d-lst-r[data-site]{cursor:pointer}#dash-root .d-lst-r[data-site]:hover{background:#fff;box-shadow:0 4px 12px -6px rgba(42,94,169,.35)}' +
    '#dash-root .d-lst-r.warn{border-left-color:#fac055;background:#fffaf0}' +
    '#dash-root .d-lst-r.alert{border-left-color:#e24b4a;background:#fff5f4}' +
    '#dash-root .d-lst-n{flex:1;font-size:13px;font-weight:800;color:#1F4A85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#dash-root .d-lst-v{font-size:12.5px;font-weight:800;color:#a32d2d;text-align:right;white-space:nowrap}' +
    '#dash-root .d-lst-v small{display:block;font-size:10px;color:#9bb3d1;font-weight:700}' +
    '#dash-root .d-lst-more{text-align:center;font-size:11.5px;font-weight:800;color:#9bb3d1;padding:4px}' +
    '#dash-root .d-rk{display:flex;flex-direction:column;gap:7px}' +
    '#dash-root .d-rk-r{display:flex;align-items:center;gap:10px}#dash-root .d-rk-r.me{background:#eef4fc;border-radius:8px;margin:0 -6px;padding:4px 6px}' +
    '#dash-root .d-rk-p{width:20px;text-align:center;font-weight:900;font-size:13px;color:#54678a}' +
    '#dash-root .d-rk-n{flex:1;font-size:12.5px;font-weight:700;color:#2a5ea9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#dash-root .d-rk-b{width:84px;height:12px;background:#eef2f8;border-radius:4px;overflow:hidden}#dash-root .d-rk-b i{display:block;height:100%;border-radius:4px}' +
    '#dash-root .d-rk-v{width:34px;text-align:right;font-size:12px;font-weight:800;color:#54678a}' +
    '#dash-root .d-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:10px}' +
    '#dash-root .d-kpi-i{background:#f7f9fc;border:1px solid #e8eef7;border-radius:12px;padding:12px 8px;text-align:center}' +
    '#dash-root .d-kpi-i b{display:block;font-size:22px;font-weight:900;line-height:1;color:#1F4A85}' +
    '#dash-root .d-kpi-i span{font-size:10.5px;font-weight:700;color:#54678a;line-height:1.25;display:block;margin-top:4px}' +
    '#dash-root .d-st{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
    '#dash-root .d-st-c{background:#f7f9fc;border:1px solid #e8eef7;border-radius:12px;padding:13px}' +
    '#dash-root .d-st-h{display:flex;justify-content:space-between;font-weight:900;font-size:12px;margin-bottom:9px}#dash-root .d-st-h b{font-size:20px;color:#1F4A85}' +
    '#dash-root .d-st-l{display:flex;justify-content:space-between;font-size:11px;color:#54678a;font-weight:600;margin-top:5px}#dash-root .d-st-l b{color:#2c2c2a}' +
    '#dash-root .d-empty{padding:16px;text-align:center;color:#9bb3d1;font-size:12.5px;font-weight:600}' +
    '#dash-root .d-ok{padding:14px;text-align:center;color:#0f6e56;font-size:12.5px;font-weight:700;background:#eefaf6;border-radius:11px}' +
    '#dash-root .d-sk{height:14px;border-radius:7px;background:linear-gradient(90deg,#eef2f8 25%,#e2eaf5 50%,#eef2f8 75%);background-size:200% 100%;animation:dsk 1.4s infinite;margin-bottom:10px}' +
    '@keyframes dsk{0%{background-position:200% 0}100%{background-position:-200% 0}}' +
    '@media(max-width:860px){#dash-root .d-g{grid-template-columns:1fr}#dash-root .d-hero-l{font-size:16px}#dash-root .d-pj-n{font-size:40px}#dash-root .d-st{grid-template-columns:1fr}#dash-root .d-q{grid-template-columns:1fr}}' +
    '</style>';

    // ══ DÉMARRAGE ════════════════════════════════════════════════════════
    bindBus();
    render();          // rendu immédiat au (re)montage — ne pas attendre le réseau
    load(false);
    [300, 900, 2000].forEach(d => setTimeout(() => { const r = getRoot(); if (r && !r.querySelector('.dash')) render(); }, d));
  }
});
