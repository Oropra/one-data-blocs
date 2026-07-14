// VEHICULES — module One Data (OD.define) v1 (Lot B)
// ============================================================================
//  FICHE CLIENT — Onglet VÉHICULES  ·  root: #oropra-vehicules-root
//  Véhicules possédés / anciennement possédés : CLIENT_STOCK.Status = 'A' / 'I'.
//  Lecture via get_v_likes (Supabase, sans Heroku), filtré A/I.
//  Deux sections : Possédés (A) et Anciens (I).
//  Action "Passer en ancien" (A -> I) : mise à jour directe CLIENT_STOCK (déclaratif),
//  uniquement sur les véhicules possédés. Pas de réactivation.
// ============================================================================
OD.define('vehicules', {
  mount(__anchor, ctx) {
    __anchor.id = 'oropra-vehicules-root';
  if (!window.wwLib) return;
  var VAR_CLIENT = '55490583-c88b-4748-916e-4d203db07742';
  var doc = wwLib.getFrontDocument();
  var sb = ctx.supabase;
  function getRoot() { return __anchor; }

  // self-boot/observer retiré (loader)

  var state = window.__vehState || (window.__vehState = { rows: null, loading: true, err: null, idvu: null, affaires: {}, soc: false });
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
      try { var cl = await sb.from('CLIENT').select('idmultivu').eq('IDVu', idvu).maybeSingle(); state.soc = !!(cl.data && (cl.data.idmultivu === 1 || cl.data.idmultivu === '1')); } catch (e) { state.soc = false; }
      var res = await sb.rpc('get_v_likes', { p_id_client: Number(idvu), p_id_user: Number(meId()) });
      if (res.error) throw res.error;
      var rows = (res.data || []).filter(function (r) { var st = (r.Status || '').toUpperCase(); return st === 'A' || st === 'I'; });
      var affIds = [...new Set(rows.map(function (r) { return r.ID_AFFAIRE; }).filter(function (x) { return x != null; }))];
      if (affIds.length) {
        try {
          var a = await sb.from('SITE').select('ID_AFFAIRE, AFFAIRE').in('ID_AFFAIRE', affIds);
          (a.data || []).forEach(function (s) { if (s.ID_AFFAIRE != null && !state.affaires[s.ID_AFFAIRE]) state.affaires[s.ID_AFFAIRE] = s.AFFAIRE; });
        } catch (e) {}
      }
      state.rows = rows; state.idvu = idvu; state.loading = false;
    } catch (e) { console.error('[vehicules]', e); state.err = e.message || String(e); state.loading = false; }
  }

  // ---- action : passer un véhicule possédé (A) en ancien (I) ----
  async function toInactive(id, btn) {
    var ok;
    if (window.__oropraConfirm) ok = await window.__oropraConfirm({ title: 'Marquer comme ancien', message: 'Le client sera considéré comme n\'étant plus propriétaire de ce véhicule.', confirmLabel: 'Confirmer', danger: false });
    else { var msg = 'Marquer ce véhicule comme ancien ?'; try { ok = (wwLib.getFrontWindow ? wwLib.getFrontWindow() : window).confirm(msg); } catch (e) { ok = confirm(msg); } }
    if (!ok) return;
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      var stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
      var r = await sb.from('CLIENT_STOCK').update({ Status: 'I', update_date: stamp }).eq('id_client_stock', Number(id));
      if (r.error) throw r.error;
      state.rows = null; load().then(render);
    } catch (e) {
      console.error('[vehicules] toInactive', e);
      if (btn) { btn.disabled = false; btn.textContent = 'Passer en ancien'; }
      try { alert('Échec : ' + (e.message || e)); } catch (x) {}
    }
  }

  var CAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16.5h14M6.5 16.5v2M17.5 16.5v2"/><path d="M4 16.5l1.5-5A2 2 0 0 1 7.4 10h9.2a2 2 0 0 1 1.9 1.5l1.5 5"/><circle cx="7.5" cy="16.5" r="1.6"/><circle cx="16.5" cy="16.5" r="1.6"/></svg>';

  function card(r, actif) {
    var titre = [r.MARQUE ? String(r.MARQUE).toUpperCase() : '', cap(r.NomModele || r.VERSION || '')].filter(Boolean).join(' ') || 'Véhicule';
    var ver = (r.NomModele && r.VERSION) ? cap(r.VERSION) : '';
    var immat = r.IMMAT || '';
    var dt = fmtDate(r.DT_PMEC || r.creation_date);
    var aff = r.ID_AFFAIRE != null ? state.affaires[r.ID_AFFAIRE] : '';
    var photo = r.photo_url ? '<img class="vh-img" src="' + esc(r.photo_url) + '" loading="lazy" alt="">' : '<div class="vh-img vh-noimg">' + CAR + '</div>';
    var badges = '';
    if (r.vin_stock === 'VIN') badges += '<span class="vh-badge vh-vo">VO</span>';
    if (r.etat_cm) badges += '<span class="vh-badge vh-cm">Contremarqué</span>';
    var apvBtn = '<button class="vh-apv" data-apv="' + esc(r.VIN) + '" data-apvlabel="' + esc(titre) + '">Factures APV</button>';
    var ancBtn = actif ? '<button class="vh-anc" data-inact="' + esc(r.id_client_stock) + '" title="Marquer comme ancien véhicule">Marquer ancien</button>' : '';
    var foot = '<div class="vh-foot">' + apvBtn + ancBtn + '</div>';
    return '<div class="vh-card' + (actif ? '' : ' vh-old') + '">' +
      '<div class="vh-photo">' + photo + (badges ? '<div class="vh-badges">' + badges + '</div>' : '') + '</div>' +
      '<div class="vh-body">' +
        '<div class="vh-title">' + esc(titre) + '</div>' +
        (ver ? '<div class="vh-sub">' + esc(ver) + '</div>' : '') +
        '<div class="vh-meta">' + (immat ? '<span class="vh-immat">' + esc(immat) + '</span>' : '') + (dt ? '<span class="vh-date">' + esc(dt) + '</span>' : '') + '</div>' +
        (aff ? '<div class="vh-aff">' + esc(aff) + '</div>' : '') + foot +
      '</div></div>';
  }

  var STYLE = '<style>' +
    '#oropra-vehicules-root{font-family:"Nunito Sans",system-ui,sans-serif;color:#1F4A85}' +
    '#oropra-vehicules-root *{box-sizing:border-box}' +
    '.vh-sec{margin-bottom:26px}' +
    '.vh-sec-hd{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:800;color:#1F4A85;margin:2px 2px 12px}' +
    '.vh-count{font-size:12px;font-weight:700;color:#7a98c5;background:#f2f6fc;border-radius:20px;padding:1px 9px}' +
    '.vh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}' +
    '.vh-card{background:#fff;border:1px solid #e8eef7;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;transition:box-shadow .18s,transform .18s}' +
    '.vh-card:hover{box-shadow:0 14px 32px rgba(31,74,133,.13);transform:translateY(-2px)}' +
    '.vh-card.vh-old{opacity:.72}' +
    '.vh-card.vh-old .vh-img{filter:grayscale(.5)}' +
    '.vh-photo{position:relative;aspect-ratio:16/10;background:#eef2f8}' +
    '.vh-img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.vh-noimg{display:flex;align-items:center;justify-content:center;color:#adc0dd}' +
    '.vh-noimg svg{width:56px;height:56px}' +
    '.vh-badges{position:absolute;top:8px;left:8px;display:flex;gap:6px;flex-wrap:wrap}' +
    '.vh-badge{font-size:10.5px;font-weight:800;letter-spacing:.4px;padding:3px 9px;border-radius:20px;color:#fff;text-transform:uppercase}' +
    '.vh-vo{background:#e6a817}' +
    '.vh-cm{background:#e24b4a}' +
    '.vh-body{padding:12px 14px;display:flex;flex-direction:column;gap:3px;flex:1}' +
    '.vh-title{font-size:15px;font-weight:800;color:#1F4A85;line-height:1.2}' +
    '.vh-sub{font-size:12.5px;color:#7a98c5;font-weight:600}' +
    '.vh-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:3px}' +
    '.vh-immat{font-size:11px;font-weight:800;letter-spacing:.5px;color:#2a5ea9;background:#eef4fc;border:1px solid #d6e2f2;border-radius:6px;padding:2px 7px}' +
    '.vh-date{font-size:12px;color:#7a98c5;font-weight:600}' +
    '.vh-aff{font-size:12px;color:#5a7196;font-weight:600;margin-top:1px}' +
    '.vh-foot{margin-top:10px;display:flex;gap:8px;align-items:center}' +
    '.vh-apv{flex:1;font:inherit;font-size:12.5px;font-weight:700;border-radius:9px;padding:8px 10px;cursor:pointer;border:1px solid #c9dcf3;background:#eef4fc;color:#2a5ea9;transition:.15s;display:inline-flex;align-items:center;justify-content:center;gap:6px}' +
    '.vh-apv:hover{background:#e0ecfa}' +
    '.vh-anc{flex:0 0 auto;font:inherit;font-size:11.5px;font-weight:700;border-radius:9px;padding:8px 10px;cursor:pointer;border:1px solid #ecdcbc;background:#fbf6ec;color:#a9791a;transition:.15s;white-space:nowrap}' +
    '.vh-anc:hover{background:#f6eed9}' +
    '.vh-anc:disabled{opacity:.6;cursor:default}' +
    '#vh-modal{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center}' +
    '.vh-ov-bg{position:absolute;inset:0;background:rgba(20,40,80,.45)}' +
    '.vh-ov-box{position:relative;background:#fff;border-radius:14px;width:min(680px,92vw);max-height:86vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(20,40,80,.35);overflow:hidden}' +
    '.vh-ov-hd{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#eef4fc;border-bottom:1px solid #dbe6f5;font-weight:800;color:#1F4A85;font-size:15px}' +
    '.vh-ov-x{border:none;background:none;font-size:24px;line-height:1;color:#5a7196;cursor:pointer;padding:0 4px}' +
    '.vh-ov-body{padding:14px 18px;overflow-y:auto}' +
    '.vh-ov-msg{text-align:center;padding:34px 10px;color:#7a98c5;font-size:14px}' +
    '.vh-fact{border:1px solid #e8eef7;border-left:3px solid #2a5ea9;border-radius:10px;padding:11px 13px;margin-bottom:10px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px}' +
    '.vh-fact-l{min-width:0}' +
    '.vh-fact-or{font-size:13px;font-weight:800;color:#1F4A85}' +
    '.vh-fact-sub{font-size:12px;color:#7a98c5;font-weight:600;margin-top:2px}' +
    '.vh-fact-mt{font-size:15px;font-weight:800;color:#2f8a76;white-space:nowrap}' +
    '.vh-fact-dt{font-size:11.5px;font-weight:600;color:#7a98c5}' +
    '.vh-total{text-align:right;font-size:13px;color:#5a7196;padding:6px 4px 2px;border-top:1px solid #e8eef7;margin-top:4px}' +
    '.vh-total strong{color:#2f8a76;font-size:15px}' +
    '.vh-fact-kv{font-size:12px;color:#5a7196;margin-top:3px}' +
    '.vh-msg{text-align:center;padding:48px 20px;color:#7a98c5;font-size:14px}' +
    '.vh-err{color:#e24b4a}' +
    '.vh-empty-sec{font-size:13px;color:#adc0dd;padding:6px 2px}' +
    '</style>';

  function section(title, list, actif) {
    var head = '<div class="vh-sec-hd">' + esc(title) + '<span class="vh-count">' + list.length + '</span></div>';
    var body = list.length
      ? '<div class="vh-grid">' + list.map(function (r) { return card(r, actif); }).join('') + '</div>'
      : '<div class="vh-empty-sec">' + (actif ? 'Aucun véhicule possédé.' : 'Aucun ancien véhicule.') + '</div>';
    return '<div class="vh-sec">' + head + body + '</div>';
  }

  function render() {
    var root = getRoot(); if (!root) return;
    if (state.loading) { root.innerHTML = STYLE + '<div class="vh-msg">Chargement des véhicules…</div>'; return; }
    if (state.err) { root.innerHTML = STYLE + '<div class="vh-msg vh-err">Erreur : ' + esc(state.err) + '</div>'; return; }
    var rows = state.rows || [];
    var actifs = rows.filter(function (r) { return (r.Status || '').toUpperCase() === 'A'; });
    var anciens = rows.filter(function (r) { return (r.Status || '').toUpperCase() === 'I'; });
    if (!actifs.length && !anciens.length) { root.innerHTML = STYLE + '<div class="vh-msg">Aucun véhicule pour ce client.</div>'; return; }
    root.innerHTML = STYLE + section('Véhicules possédés', actifs, true) + section('Anciens véhicules', anciens, false);
    root.querySelectorAll('[data-inact]').forEach(function (b) { b.addEventListener('click', function () { toInactive(b.getAttribute('data-inact'), b); }); });
    root.querySelectorAll('[data-apv]').forEach(function (b) { b.addEventListener('click', function () { openApv(b.getAttribute('data-apv'), b.getAttribute('data-apvlabel')); }); });
  }

  // ---- modale factures APV du véhicule (table APV, jointée par VIN) ----
  var TVA = 1.20; // TVA 20% (APV pièces + main d'oeuvre)
  function euroNum(n) { var v = Number(n); return isNaN(v) ? '' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtMt(ht) { var v = Number(ht); if (isNaN(v)) return ''; var ttc = !state.soc; var a = ttc ? v * TVA : v; return euroNum(a) + ' € ' + (ttc ? 'TTC' : 'HT'); }
  function factLine(f) {
    var or = f.NUM_OR ? ('OR ' + esc(f.NUM_OR)) : (f.NUM_FACT_DMS ? ('Facture ' + esc(f.NUM_FACT_DMS)) : 'Facture APV');
    var mt = f.MT_TOT_FACT_HT != null ? fmtMt(f.MT_TOT_FACT_HT) : '';
    var d = fmtDate(f.DT_FAC || f.DT_OR);
    var cat = f.CAT_FACT ? esc(f.CAT_FACT) : '';
    var lib = f.LIB_DESC ? esc(f.LIB_DESC) : '';
    var site = f.SITE ? esc(f.SITE) : '';
    var km = (f.KM != null && f.KM !== '') ? (Number(f.KM).toLocaleString('fr-FR') + ' km') : '';
    var line1 = [d, cat].filter(Boolean).join(' \u00b7 ');
    var line3 = [site, km].filter(Boolean).join(' \u00b7 ');
    return '<div class="vh-fact"><div class="vh-fact-l">' +
      '<div class="vh-fact-or">' + or + (line1 ? ' <span class="vh-fact-dt">' + line1 + '</span>' : '') + '</div>' +
      (lib ? '<div class="vh-fact-sub">' + lib + '</div>' : '') +
      (line3 ? '<div class="vh-fact-kv">' + line3 + '</div>' : '') +
      '</div>' + (mt ? '<div class="vh-fact-mt">' + mt + '</div>' : '') + '</div>';
  }
  async function openApv(vin, label) {
    var ov = doc.getElementById('vh-modal'); if (ov) ov.remove();
    ov = doc.createElement('div'); ov.id = 'vh-modal';
    ov.innerHTML = '<div class="vh-ov-bg"></div><div class="vh-ov-box"><div class="vh-ov-hd"><span>Factures APV — ' + esc(label || '') + '</span><button class="vh-ov-x">&times;</button></div><div class="vh-ov-body"><div class="vh-ov-msg">Chargement…</div></div></div>';
    (doc.body || doc.documentElement).appendChild(ov);
    var close = function () { ov.remove(); };
    ov.querySelector('.vh-ov-bg').addEventListener('click', close);
    ov.querySelector('.vh-ov-x').addEventListener('click', close);
    try {
      var res = await sb.from('APV').select('*').eq('VIN', vin);
      if (res.error) throw res.error;
      var rows = res.data || [];
      var body = ov.querySelector('.vh-ov-body');
      if (!rows.length) { body.innerHTML = '<div class="vh-ov-msg">Aucune facture APV pour ce véhicule.</div>'; return; }
      rows.sort(function (a, b) { return new Date(b.DT_FAC || b.DT_OR || 0) - new Date(a.DT_FAC || a.DT_OR || 0); });
      var total = rows.reduce(function (acc, f) { return acc + (Number(f.MT_TOT_FACT_HT) || 0); }, 0);
      body.innerHTML = rows.map(factLine).join('') +
        '<div class="vh-total">' + rows.length + ' facture' + (rows.length > 1 ? 's' : '') + ' \u00b7 <strong>' + fmtMt(total) + '</strong></div>';
    } catch (e) {
      console.error('[vehicules] APV', e);
      var b = ov.querySelector('.vh-ov-body'); if (b) b.innerHTML = '<div class="vh-ov-msg" style="color:#e24b4a">Erreur : ' + esc(e.message || e) + '</div>';
    }
  }

  // surveillance du changement de client
  if (!window.__vehWatch) window.__vehWatch = setInterval(function () {
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
