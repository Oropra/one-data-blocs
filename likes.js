// LIKES — module One Data (OD.define) v1 (Lot B)
// ============================================================================
//  FICHE CLIENT — Onglet LIKES  ·  root: #oropra-likes-root
//  Véhicules qui INTÉRESSENT le client : CLIENT_STOCK.Status = 'interested'.
//  Lecture 100 % Supabase via RPC get_v_likes(p_id_client, p_id_user) — pas d'Heroku.
//  Grille de cartes responsive : photo, marque/modèle, immat/date, badges
//  (VO, Contremarqué), action Pcom (Nouvelle Pcom / propale en cours).
// ============================================================================
OD.define('likes', {
  mount(__anchor, ctx) {
    __anchor.id = 'oropra-likes-root';
  if (!window.wwLib) return;
  var VAR_CLIENT = '55490583-c88b-4748-916e-4d203db07742';
  var doc = wwLib.getFrontDocument();
  var sb = ctx.supabase;
  function getRoot() { return __anchor; }
  var VO_VAR_ID = 'bcb187ac-e66e-4bfb-bc48-1b7b7dfda0ba';
  var PROPALE_VAR_ID = 'aac565e9-ad32-4f81-bf8d-adb611322e62';
  var PAGE_CREATE = '8c7d5738-4d1f-4047-b101-814651576678';
  var PAGE_UPDATE = 'efb6187d-2330-4392-86ed-bc5ad2489fed';
  var PAGE_PATHS = { '8c7d5738-4d1f-4047-b101-814651576678': '/fr/propo-vo-create', 'efb6187d-2330-4392-86ed-bc5ad2489fed': '/fr/propo-vo-update' };
  function inEditor() { try { return window.self !== window.top; } catch (e) { return true; } }
  function _writeVar(id, v) { try { wwLib.wwVariable.updateValue(id, v); } catch (e) {} }
  function goToPage(pageId) {
    if (inEditor()) { try { wwLib.wwApp.goTo(pageId); return; } catch (e) {} try { wwLib.goTo(pageId); } catch (e) {} }
    else { var path = PAGE_PATHS[pageId]; if (path) { try { wwLib.goTo(path); return; } catch (e) {} } try { wwLib.wwApp.goTo(pageId); } catch (e) {} }
  }
  var cmCache = {};
  async function loadCM(vin) {
    if (cmCache[vin]) return cmCache[vin];
    var txt = 'Contremarqué';
    try {
      var r = await sb.from('CONTRE_MARQUE').select('*').eq('VIN', vin).order('DATE_CM', { ascending: false }).limit(1);
      var cm = r.data && r.data[0];
      if (cm) {
        var date = cm.DATE_CM || cm.date_cm;
        var uid = cm.ID_USER_CM || cm.id_user_cm;
        var cid = cm.ID_CLIENT_CM || cm.id_client_cm;
        var who = '', forWho = '';
        if (uid != null) { var u = await sb.from('USER').select('nomComplet, prenom, nom').eq('ID_User', uid).limit(1); var ur = u.data && u.data[0]; if (ur) who = ur.nomComplet || [ur.prenom, ur.nom].filter(Boolean).join(' '); }
        if (cid != null) { var cl = await sb.from('CLIENT').select('CIVILITE, PRENOM, NOM').eq('IDVu', cid).limit(1); var cr = cl.data && cl.data[0]; if (cr) forWho = [cr.CIVILITE, cr.PRENOM, cr.NOM].filter(Boolean).join(' '); }
        txt = 'Contremarqué' + (date ? ' le ' + fmtDate(date) : '') + (who ? ' par ' + who : '') + (forWho ? ' pour ' + forWho : '');
      }
    } catch (e) {}
    cmCache[vin] = txt; return txt;
  }

  // ---- modale de confirmation (remplace le confirm() natif) ----
  if (!window.__oropraConfirm) {
    window.__oropraConfirm = function (opts) {
      opts = opts || {};
      var d = (wwLib.getFrontDocument ? wwLib.getFrontDocument() : document);
      return new Promise(function (resolve) {
        if (!d.getElementById('oropra-cf-css')) {
          var st = d.createElement('style'); st.id = 'oropra-cf-css';
          st.textContent = '.ocf-ov{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;font-family:"Nunito Sans",system-ui,sans-serif}'
            + '.ocf-bg{position:absolute;inset:0;background:rgba(20,40,80,.45)}'
            + '.ocf-box{position:relative;background:#fff;border-radius:16px;width:min(420px,92vw);box-shadow:0 24px 60px rgba(20,40,80,.35);padding:22px 22px 18px;text-align:center;animation:ocfIn .16s ease}'
            + '@keyframes ocfIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}'
            + '.ocf-ic{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}'
            + '.ocf-ic svg{width:24px;height:24px}'
            + '.ocf-title{font-size:16px;font-weight:800;color:#1F4A85;margin-bottom:6px}'
            + '.ocf-msg{font-size:13.5px;color:#5a7196;line-height:1.5;margin-bottom:18px}'
            + '.ocf-btns{display:flex;gap:10px}'
            + '.ocf-btn{flex:1;font:inherit;font-size:14px;font-weight:700;border-radius:10px;padding:10px 14px;cursor:pointer;border:1px solid;transition:.15s}'
            + '.ocf-cancel{background:#fff;border-color:#e8eef7;color:#5a7196}.ocf-cancel:hover{background:#f2f6fc}'
            + '.ocf-ok{border-color:transparent;color:#fff}.ocf-ok:hover{filter:brightness(.95)}';
          (d.head || d.documentElement).appendChild(st);
        }
        var danger = opts.danger !== false;
        var accent = danger ? '#e24b4a' : '#2a5ea9';
        var icBg = danger ? '#fdecec' : '#eef4fc';
        var icon = danger
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="' + accent + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="' + accent + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>';
        var ov = d.createElement('div'); ov.className = 'ocf-ov';
        ov.innerHTML = '<div class="ocf-bg"></div><div class="ocf-box">'
          + '<div class="ocf-ic" style="background:' + icBg + '">' + icon + '</div>'
          + (opts.title ? '<div class="ocf-title">' + opts.title + '</div>' : '')
          + '<div class="ocf-msg">' + (opts.message || 'Confirmer cette action ?') + '</div>'
          + '<div class="ocf-btns"><button class="ocf-btn ocf-cancel">' + (opts.cancelLabel || 'Annuler') + '</button>'
          + '<button class="ocf-btn ocf-ok" style="background:' + accent + '">' + (opts.confirmLabel || 'Confirmer') + '</button></div></div>';
        (d.body || d.documentElement).appendChild(ov);
        var done = function (v) { try { ov.remove(); } catch (e) {} resolve(v); };
        ov.querySelector('.ocf-bg').addEventListener('click', function () { done(false); });
        ov.querySelector('.ocf-cancel').addEventListener('click', function () { done(false); });
        ov.querySelector('.ocf-ok').addEventListener('click', function () { done(true); });
      });
    };
  }


  // self-boot/observer retiré (loader)

  var state = window.__likesState || (window.__likesState = { rows: null, loading: true, err: null, idvu: null, affaires: {}, propales: {} });
  function readVar(id) { try { return wwLib.wwVariable.getValue(id); } catch (e) { return null; } }
  function currentIdvu() { var c = readVar(VAR_CLIENT); return c && c.IDVu != null ? Number(c.IDVu) : null; }
  function meId() { var u = ((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser || {}; return u.ID_User; }
  var esc = function (s) { return (s || '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
  var cap = function (s) { return (s || '').toString().toLowerCase().replace(/(^|[\s\-'])([a-zà-ÿ])/g, function (m, sep, c) { return sep + c.toUpperCase(); }); };
  function fmtDate(d) { if (!d) return ''; var dt = new Date(d); if (isNaN(dt)) return ''; var p = function (n) { return String(n).padStart(2, '0'); }; return p(dt.getDate()) + '/' + p(dt.getMonth() + 1) + '/' + dt.getFullYear(); }

  // ---- data ----
  async function load() {
    var idvu = currentIdvu();
    if (idvu == null) { state.rows = []; state.loading = false; return; }
    try {
      var res = await sb.rpc('get_v_likes', { p_id_client: Number(idvu), p_id_user: Number(meId()) });
      if (res.error) throw res.error;
      var rows = (res.data || []).filter(function (r) { return (r.Status || '').toLowerCase() === 'interested'; });
      // noms d'affaires (batch) pour l'ID_AFFAIRE
      var affIds = [...new Set(rows.map(function (r) { return r.ID_AFFAIRE; }).filter(function (x) { return x != null; }))];
      if (affIds.length) {
        try {
          var a = await sb.from('SITE').select('ID_AFFAIRE, AFFAIRE').in('ID_AFFAIRE', affIds);
          (a.data || []).forEach(function (s) { if (s.ID_AFFAIRE != null && !state.affaires[s.ID_AFFAIRE]) state.affaires[s.ID_AFFAIRE] = s.AFFAIRE; });
        } catch (e) {}
      }
      // propales actives (draft OU propale) de CE user pour CE client, par VIN
      state.propales = {};
      var vins = [...new Set(rows.map(function (r) { return r.VIN; }).filter(Boolean))];
      if (vins.length) {
        try {
          var pp = await sb.from('PROPALE_BDC').select('VIN, id_propale_bdc, status')
            .in('VIN', vins).eq('id_client_vu', Number(idvu)).eq('id_user_creation', Number(meId()))
            .in('status', ['draft', 'propale']).neq('Archived', true);
          (pp.data || []).forEach(function (x) { if (x.VIN && state.propales[x.VIN] == null) state.propales[x.VIN] = x.id_propale_bdc; });
        } catch (e) {}
      }
      // préchargement des tooltips contremarqué
      try { await Promise.all(rows.filter(function (r) { return r.etat_cm; }).map(function (r) { return loadCM(r.VIN); })); } catch (e) {}
      state.rows = rows; state.idvu = idvu; state.loading = false;
    } catch (e) { console.error('[likes]', e); state.err = e.message || String(e); state.loading = false; }
  }

  // ---- actions (à recréer côté Supabase — placeholders pour l'instant) ----
  async function goPcom(row) {
    if (!row || !row.VIN) return;
    // la page propale lit le véhicule via VO_VAR_ID (objet STOCKVO)
    try { var sres = await sb.from('STOCKVO').select('*').eq('VIN', row.VIN).limit(1).maybeSingle(); if (sres.data) _writeVar(VO_VAR_ID, sres.data); } catch (e) {}
    var pid = state.propales[row.VIN];
    if (pid != null) { _writeVar(PROPALE_VAR_ID, Number(pid)); goToPage(PAGE_UPDATE); }
    else { goToPage(PAGE_CREATE); }
  }
  async function actArchive(id, btn) {
    var ok = await window.__oropraConfirm({ title: 'Retirer le like', message: 'Retirer ce véhicule des likes du client ?', confirmLabel: 'Retirer', danger: true });
    if (!ok) return;
    if (btn) { btn.disabled = true; }
    try {
      var stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
      var r = await sb.from('CLIENT_STOCK').update({ Status: 'archived', update_date: stamp }).eq('id_client_stock', Number(id));
      if (r.error) throw r.error;
      state.rows = null; load().then(render);
    } catch (e) {
      console.error('[likes] archive', e);
      if (btn) { btn.disabled = false; }
      try { alert('Échec : ' + (e.message || e)); } catch (x) {}
    }
  }

  var CAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16.5h14M6.5 16.5v2M17.5 16.5v2"/><path d="M4 16.5l1.5-5A2 2 0 0 1 7.4 10h9.2a2 2 0 0 1 1.9 1.5l1.5 5"/><circle cx="7.5" cy="16.5" r="1.6"/><circle cx="16.5" cy="16.5" r="1.6"/></svg>';

  function card(r, i) {
    var titre = [r.MARQUE ? String(r.MARQUE).toUpperCase() : '', cap(r.NomModele || r.VERSION || '')].filter(Boolean).join(' ') || 'Véhicule';
    var ver = (r.NomModele && r.VERSION) ? cap(r.VERSION) : '';
    var immat = r.IMMAT || '';
    var dt = fmtDate(r.DT_PMEC || r.creation_date);
    var aff = r.ID_AFFAIRE != null ? state.affaires[r.ID_AFFAIRE] : '';
    var photo = r.photo_url ? '<img class="lk-img" src="' + esc(r.photo_url) + '" loading="lazy" alt="">' : '<div class="lk-img lk-noimg">' + CAR + '</div>';
    var badges = '';
    if (r.vin_stock === 'VIN') badges += '<span class="lk-badge lk-vo">VO</span>';
    if (r.etat_cm) badges += '<span class="lk-badge lk-cm" data-cmvin="' + esc(r.VIN) + '" title="' + esc(cmCache[r.VIN] || 'Contremarqué') + '">Contremarqué</span>';
    var action;
    if (r.etat_cm) action = '';                                   // contremarqué -> aucune action propale
    else if (state.propales[r.VIN] != null) action = '<button class="lk-act lk-upd" data-pcom="' + i + '">Modifier la propale</button>';
    else action = '<button class="lk-act lk-new" data-pcom="' + i + '">+ Nouvelle Pcom</button>';
    return '<div class="lk-card">' +
      '<div class="lk-photo">' + photo + (badges ? '<div class="lk-badges">' + badges + '</div>' : '') + '</div>' +
      '<div class="lk-body">' +
        '<div class="lk-title">' + esc(titre) + '</div>' +
        (ver ? '<div class="lk-sub">' + esc(ver) + '</div>' : '') +
        '<div class="lk-meta">' + (immat ? '<span class="lk-immat">' + esc(immat) + '</span>' : '') + (dt ? '<span class="lk-date">' + esc(dt) + '</span>' : '') + '</div>' +
        (aff ? '<div class="lk-aff">' + esc(aff) + '</div>' : '') +
        '<div class="lk-foot">' + action + '<button class="lk-arch" data-arch="' + esc(r.id_client_stock) + '" title="Retirer le like">&times;</button></div>' +
      '</div></div>';
  }

  var STYLE = '<style>' +
    '#oropra-likes-root{font-family:"Nunito Sans",system-ui,sans-serif;color:#1F4A85}' +
    '#oropra-likes-root *{box-sizing:border-box}' +
    '.lk-head{font-size:14px;font-weight:700;color:#5a7196;margin:2px 2px 14px}' +
    '.lk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}' +
    '.lk-card{background:#fff;border:1px solid #e8eef7;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;transition:box-shadow .18s,transform .18s}' +
    '.lk-card:hover{box-shadow:0 14px 32px rgba(31,74,133,.13);transform:translateY(-2px)}' +
    '.lk-photo{position:relative;aspect-ratio:16/10;background:#eef2f8}' +
    '.lk-img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.lk-noimg{display:flex;align-items:center;justify-content:center;color:#adc0dd}' +
    '.lk-noimg svg{width:56px;height:56px}' +
    '.lk-badges{position:absolute;top:8px;left:8px;display:flex;gap:6px;flex-wrap:wrap}' +
    '.lk-badge{font-size:10.5px;font-weight:800;letter-spacing:.4px;padding:3px 9px;border-radius:20px;color:#fff;text-transform:uppercase}' +
    '.lk-vo{background:#e6a817}' +
    '.lk-cm{background:#e24b4a}' +
    '.lk-body{padding:12px 14px;display:flex;flex-direction:column;gap:3px;flex:1}' +
    '.lk-title{font-size:15px;font-weight:800;color:#1F4A85;line-height:1.2}' +
    '.lk-sub{font-size:12.5px;color:#7a98c5;font-weight:600}' +
    '.lk-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:3px}' +
    '.lk-immat{font-size:11px;font-weight:800;letter-spacing:.5px;color:#2a5ea9;background:#eef4fc;border:1px solid #d6e2f2;border-radius:6px;padding:2px 7px}' +
    '.lk-date{font-size:12px;color:#7a98c5;font-weight:600}' +
    '.lk-aff{font-size:12px;color:#5a7196;font-weight:600;margin-top:1px}' +
    '.lk-foot{display:flex;align-items:center;gap:8px;margin-top:10px}' +
    '.lk-act{flex:1;font:inherit;font-size:12.5px;font-weight:700;border-radius:9px;padding:8px 10px;text-align:center;cursor:pointer;border:1px solid}' +
    '.lk-new{background:#e4f5f0;color:#2f8a76;border-color:#a9e0d3}' +
    '.lk-new:hover{background:#d5efe7}' +
    '.lk-upd{background:#eef4fc;color:#2a5ea9;border-color:#c9dcf3}' +
    '.lk-upd:hover{background:#e0ecfa}' +
    '.lk-arch{flex:0 0 auto;width:32px;height:32px;border-radius:8px;border:1px solid #e8eef7;background:#fff;color:#adc0dd;font-size:20px;line-height:1;cursor:pointer;transition:.15s;display:inline-flex;align-items:center;justify-content:center;padding:0}' +
    '.lk-arch:hover{color:#e24b4a;border-color:#f3c9c9;background:#fdf4f4}' +
    '.lk-msg{text-align:center;padding:48px 20px;color:#7a98c5;font-size:14px}' +
    '.lk-err{color:#e24b4a}' +
    '</style>';

  function render() {
    var root = getRoot(); if (!root) return;
    if (state.loading) { root.innerHTML = STYLE + '<div class="lk-msg">Chargement des véhicules likés…</div>'; return; }
    if (state.err) { root.innerHTML = STYLE + '<div class="lk-msg lk-err">Erreur : ' + esc(state.err) + '</div>'; return; }
    if (!state.rows || !state.rows.length) { root.innerHTML = STYLE + '<div class="lk-msg">Aucun véhicule liké pour ce client.</div>'; return; }
    root.innerHTML = STYLE + '<div class="lk-head">' + state.rows.length + ' véhicule' + (state.rows.length > 1 ? 's' : '') + ' d\'intérêt</div>' +
      '<div class="lk-grid">' + state.rows.map(function (r, i) { return card(r, i); }).join('') + '</div>';
    root.querySelectorAll('[data-pcom]').forEach(function (b) { b.addEventListener('click', function () { goPcom(state.rows[Number(b.getAttribute('data-pcom'))]); }); });
    root.querySelectorAll('[data-arch]').forEach(function (b) { b.addEventListener('click', function () { actArchive(b.getAttribute('data-arch'), b); }); });
  }

  // surveillance du changement de client
  if (!window.__likesWatch) window.__likesWatch = setInterval(function () {
    var c = currentIdvu();
    if (c != null && c !== state.idvu) { state.rows = null; state.loading = true; state.err = null; state.idvu = c; render(); load().then(render); }
  }, 500);

  if (!getRoot()) return;
  var _cur = currentIdvu();
  if (_cur !== state.idvu) { state.rows = null; state.loading = true; state.err = null; state.idvu = _cur; }
  render();
  if (state.rows == null) { load().then(render); }
}
});
