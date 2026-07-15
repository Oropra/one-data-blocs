// ============================================================================
//  LISTE VO — module One Data (OD.define)  v1
//  Rendu dans __anchor ; SUPABASE_URL + clé -> ctx.tenant (9 edge functions) ;
//  client via ctx.supabase ; attente d'ancre + garde de version retirées.
//  Picker client VO : workflow WeWeb supprimé retiré, onglet via __odFicheTab.
// ============================================================================
// ============================================================================
//  One Data — Liste VO  (vo_liste_v1.js)
//  Rendu dans <div id="stockvo-root"></div> (bloc HTML Embed de la page /vo-liste).
//  JS placé dans le workflow "on page load" de la page.
//  Source : vue v_liste_vo (= STOCKVO + cover_url). Référentiel : table SITE.
//
//  Vues       : tableau (colonnes gelées + tri toutes colonnes) + cartes (Mode photo, responsive).
//  Périmètre  : chips RESEAU / AFFAIRE / SITE posées par défaut depuis le site sélectionné
//               (résolu via la table SITE), toutes retirables.
//  Rôle       : prix d'achat (PA) visible uniquement si ID_Role ∈ {1,2,3,6,7,8}.
//  Sélection  : cases à cocher (tout / partie) -> affiches PDF + export Excel.
//  Actions    : loupe -> var fiche VO (row complet) + workflow Display Fiche VO ;
//               photos -> workflow Diaporama ; globe -> URL360 (nouvel onglet) ; rss -> n/a.
// ============================================================================
OD.define('vo-liste', {
  async mount(__anchor, ctx) {
  __anchor.id = 'stockvo-root';
  var VER = 1;

  // ─────────────────────────────────────────────────────────── config projet
  var ROOT_ID = 'stockvo-root';
  var VAR_FICHE_VO = 'bcb187ac-e66e-4bfb-bc48-1b7b7dfda0ba';
  var WF_FICHE_VO = 'c9982ed5-2c7e-4a79-8f0f-b8fb1a0e499d';
  var WF_DIAPORAMA = 'c1c31cbb-851a-42dc-ab6a-147c6fe2fd3e';
  var PA_ROLES = [1, 2, 3, 6, 7, 8];                      // rôles voyant le prix d'achat
  var SUPABASE_URL = ctx.tenant.supabase_url;
  var SUPABASE_KEY = ctx.tenant.supabase_anon_key;
  var TEMPLATE_VO = '05ac91b9-fc68-470e-aa7b-1cbbbfdcd154';  // template affiche VO
  var MAX_AFFICHES = 50;
  var FN_POSTER = SUPABASE_URL + '/functions/v1/generate-vo-poster';
  var FN_XLSX = SUPABASE_URL + '/functions/v1/export-xslx';
  var FN_PHOTOS = SUPABASE_URL + '/functions/v1/vo-photos-list';
  var FN_PHOTOS_INIT = SUPABASE_URL + '/functions/v1/vo-photos-init-upload';
  var FN_PHOTOS_UPLOAD = SUPABASE_URL + '/functions/v1/vo-photos-upload';
  var FN_PHOTOS_CONFIRM = SUPABASE_URL + '/functions/v1/vo-photos-confirm-upload';
  var FN_PHOTOS_DELETE = SUPABASE_URL + '/functions/v1/delete-stockvo-photo';
  var FN_PHOTOS_MOVE = SUPABASE_URL + '/functions/v1/vo-photos-move';
  var FN_PHOTOS_COVER = SUPABASE_URL + '/functions/v1/vo-photos-iscover';
  var AUTH_VAR = '1fa0dd68-5069-436c-9a7d-3b54c340f1fa';
  // WF_LIKE_CLIENT supprimé (workflow WeWeb supprimé, picker intégré en JS pur)
  var VAR_DIAPORAMA = '12e65fb5-6e56-410b-b8df-8fd226a132de';

  var COLS = [
    'VIN', 'NO_VO', 'NO_IMMAT', 'VERSION_EUROTAX', 'DESIGNATION_DMS', 'MARQUE_DMS', 'MODELE_DMS',
    'CARBURANT_DMS', 'BOITEV_EUROTAX', 'D_1MEC', 'D_ACHAT', 'PVENTE', 'PA_HT_TTC', 'KMS', 'SITE', 'AFFAIRE',
    'RESEAU', 'SOCIETE', 'POINT_VENTE', 'IDSITE', 'IDSITE_Codifie', 'NBPORTE_EUROTAX', 'ImageUrls', 'cover_url', 'URL360', 'radarLink', 'ID_CM', 'PRET_A_LA_VENTE',
    'TVA', 'CODETVA', 'CV_DMS', 'TAUX_CO2', 'GARANTIE', 'CODE_GARANTIE', 'LIBELLE_GARANTIE', 'COULEUR_DMS',
    'CARROSSERIE_EUROTAX', 'LABEL_Codifie', 'LIEU_STOCKAGE_Codifie', 'DETAIL_STOCKAGE_Codifie',
    'ORIGINEACHAT_Codifie', 'MIL', 'NATCODE_SELECTED', 'INFOMEDIAIRE_Codifie'
  ].join(',');

  // ─────────────────────────────────────────────────────────── bootstrap WeWeb
  // (garde 'wwLib pas prêt' retirée : le loader ne monte le module qu'une fois wwLib et le tenant résolus)
  var wwLib = window.wwLib;
  var doc = __anchor.ownerDocument || document;
  var win = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window;

  function root() { return __anchor; }
  function sb() { return ctx.supabase; }
  function siteApi() { return win.oropraSite || window.oropraSite || null; }
  function connectedUser() { try { var d = ((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser; if (Array.isArray(d)) d = d[0]; return d || {}; } catch (e) { return {}; } }

  // ─────────────────────────────────────────────────────────── état module
  var S = {
    raw: [], loading: true, error: null,
    view: 'table', search: '', immat: '', page: 1,
    sortKey: 'NBJ', sortDir: 'desc',
    cmCache: {}, sel: {}, showPA: false,
    photoCache: {},  // cache signed URLs par VIN
    f: {
      affaire: null, reseau: null, societe: null, pointVente: null, site: null,
      marque: null, modele: null, version: null,
      label: null, stockage: null,
      photos: null, contremarque: null, eurotax: null, infomediaire: null,
      tvaRecup: null, pretVente: null, destination: null,
      prixMin: null, prixMax: null, milMin: null, milMax: null,
      kmsMin: null, kmsMax: null, nbjMin: null, nbjMax: null, co2Min: null, co2Max: null,
      carrosserie: null, carburant: null, boite: null
    }
  };
  function defaultPerPage() { return 12; }

  // ─────────────────────────────────────────────────────────── helpers
  function esc(s) { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function num(v) { if (v == null || v === '') return null; var n = Number(v); return isNaN(n) ? null : n; }
  function notEmpty(v) { return v != null && String(v).trim() !== ''; }
  function eur(v) { var n = num(v); return n == null ? '-' : Math.round(n).toLocaleString('fr-FR') + ' €'; }

  function images(row) {
    var raw = row.ImageUrls;
    if (!notEmpty(raw)) return [];
    if (raw[0] === '[') { try { var a = JSON.parse(raw); if (Array.isArray(a)) return a.filter(Boolean); } catch (e) { } }
    return String(raw).split(/[;\n|,]+/).map(function (x) { return x.trim(); }).filter(function (x) { return /^https?:\/\//.test(x); });
  }
  function mainImage(row) { if (notEmpty(row.cover_url)) return row.cover_url; var a = images(row); return a.length ? a[0] : null; }
  function hasPhoto(row) { return notEmpty(row.cover_url) || images(row).length > 0; }

  function designation(row) { return notEmpty(row.VERSION_EUROTAX) ? row.VERSION_EUROTAX : (row.DESIGNATION_DMS || '-'); }
  function priceTxt(row) { return eur(row.PVENTE); }
  function kmTxt(row) { var n = num(row.KMS); return n == null ? '-' : n.toLocaleString('fr-FR') + ' km'; }
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
  function runWf(id, params) {
    try { if (wwLib.wwWorkflow && typeof wwLib.wwWorkflow.executeGlobal === 'function') { wwLib.wwWorkflow.executeGlobal(id, params || {}); return; } } catch (e) { }
    try { wwLib.executeWorkflow(id, params || {}); } catch (e) { console.error('[vo] runWf', id, e); }
  }
  function openDiaporama(vin) { runWf(WF_DIAPORAMA, { VIN: vin }); }
  function openWeb(url) { if (notEmpty(url)) { try { win.open(url, '_blank', 'noopener'); } catch (e) { window.open(url, '_blank'); } } }

  // ─────────────────────────────────────────────────────────── popup fiche VO
  var ficheState = { vin: null, row: null, tab: 'fiche', photos: null, photosLoading: false, apv: null, apvLoading: false };

  function fmtEurTTC(v) { var n = num(v); return n ? n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' € TTC' : '-'; }

  async function openFicheVO(vin) {
    // Récupère la row (depuis S.raw ou supabase)
    var row = S.raw.find(function (x) { return x.VIN === vin; }) || null;
    if (!row) {
      var c = sb();
      if (c) { var r = await c.from('v_liste_vo').select('*').eq('VIN', vin).limit(1); row = (r.data && r.data[0]) || { VIN: vin }; }
      else row = { VIN: vin };
    }
    // Met à jour la variable WeWeb (pour les autres composants qui l'écoutent)
    try { wwLib.wwVariable.updateValue(VAR_FICHE_VO, row); } catch (e) { }
    ficheState.vin = vin; ficheState.row = row; ficheState.tab = 'fiche';
    // Lit le cache de photos (préchargé en arrière-plan) → miniatures instantanées
    ficheState.photos = S.photoCache[vin] || null;
    ficheState.apv = null;
    ficheState.photosLoading = !ficheState.photos; ficheState.apvLoading = false;
    renderFichePopup();
    // Charge les photos seulement si pas en cache
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

  function openFicheDiaporama(idx) {
    var urls = [];
    if (ficheState.photos && ficheState.photos.length) {
      urls = ficheState.photos.map(function (p) { return p.signedUrl; }).filter(Boolean);
    } else {
      urls = images(ficheState.row || {});
      if (!urls.length && mainImage(ficheState.row || {})) urls = [mainImage(ficheState.row || {})];
    }
    if (!urls.length) return;
    var vin = ficheState.vin;
    try { wwLib.wwVariable.updateValue(VAR_DIAPORAMA, { urls: urls, index: idx || 0 }); } catch (e) { }
    withFicheClosed(function () { runWf(WF_DIAPORAMA, { VIN: vin }); });
  }


  // ─────────────────────────────────────────────────────────────── Diaporama JS natif  // ─────────────────────────────────────────────────────────────── Diaporama JS natif (z-index contrôlé)
  function openFicheDiaporama(startIdx) {
    var urls = [];
    if (ficheState.photos && ficheState.photos.length) {
      urls = ficheState.photos.map(function (p) { return p.signedUrl; }).filter(Boolean);
    } else {
      urls = images(ficheState.row || {});
      if (!urls.length && mainImage(ficheState.row || {})) urls = [mainImage(ficheState.row || {})];
    }
    if (!urls.length) return;
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
    try { wwLib.wwVariable.updateValue(VAR_FICHE_VO, row); } catch (e) { }
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
    const COLLECTION_USERCONNECTED = 'e6331054-02e1-4f9d-b737-753455040b93';
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

    let userConnected = (((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser); if (Array.isArray(userConnected)) userConnected = userConnected[0]; userConnected = userConnected || {};
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
          .in('status', ['draft', 'propale'])
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
        // (client déjà écrit dans SELECTED_CLIENT_VAR_ID -> fiche-shell recharge ; workflow WeWeb supprimé)
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
      S.photoCache[vin] = ficheState.photos; // stocke en cache
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
        try { wwLib.wwVariable.updateValue(VAR_DIAPORAMA, { urls: urls, index: idx }); } catch (e) { }
        runWf(WF_DIAPORAMA, { VIN: ficheState.vin });
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

  // ─────────────────────────────────────────────────────────── contremarque (lazy)
  function pick(o, keys) { for (var i = 0; i < keys.length; i++) { var v = o ? o[keys[i]] : null; if (v != null && v !== '') return v; } return null; }
  async function loadCM(vin, idcm) {
    if (S.cmCache[vin]) return S.cmCache[vin];
    var out = { txt: 'Contremarqué' };
    var c = sb(); if (!c) { S.cmCache[vin] = out; return out; }
    try {
      var cm = null;
      if (notEmpty(idcm)) { var r1 = await c.from('CONTRE_MARQUE').select('*').eq('ID_CM', idcm).limit(1); if (r1.error) console.warn('[vo] CM byId', r1.error); cm = r1.data && r1.data[0]; }
      if (!cm && notEmpty(vin)) { var r2 = await c.from('CONTRE_MARQUE').select('*').eq('VIN', vin).order('DATE_CM', { ascending: false }).limit(1); if (r2.error) console.warn('[vo] CM byVin', r2.error); cm = r2.data && r2.data[0]; }
      if (cm) {
        var date = pick(cm, ['DATE_CM', 'date_cm', 'Date_CM']);
        var uid_ = pick(cm, ['ID_USER_CM', 'id_user_cm']);
        var cid_ = pick(cm, ['ID_CLIENT_CM', 'id_client_cm']);
        var who = '', forWho = '';
        if (uid_ != null) { var u = await c.from('USER').select('*').eq('ID_User', uid_).limit(1); if (u.error) console.warn('[vo] USER', u.error); var ur = u.data && u.data[0]; if (ur) who = pick(ur, ['nomComplet', 'NomComplet']) || [pick(ur, ['prenom', 'PRENOM']), pick(ur, ['nom', 'NOM'])].filter(Boolean).join(' '); }
        if (cid_ != null) { var cl = await c.from('CLIENT').select('*').eq('IDVu', cid_).limit(1); if (cl.error) console.warn('[vo] CLIENT', cl.error); var cr = cl.data && cl.data[0]; if (cr) forWho = pick(cr, ['nom_complet', 'nomComplet']) || [pick(cr, ['CIVILITE', 'Civilite']), pick(cr, ['PRENOM', 'Prenom']), pick(cr, ['NOM', 'Nom'])].filter(Boolean).join(' ') || pick(cr, ['nom']); }
        out.txt = 'Contremarqué' + (date ? ' le ' + fmtDateFR(date) : '') + (who ? ' par ' + who : '') + (forWho ? ' pour ' + forWho : '');
      } else {
        console.warn('[vo] contremarque introuvable', { vin: vin, idcm: idcm });
      }
    } catch (e) { console.warn('[vo] loadCM', e); }
    S.cmCache[vin] = out;
    return out;
  }

  // ─────────────────────────────────────────────────────────── chargement données
  async function loadAll() {
    var c = sb(); if (!c) return [];
    var all = [], from = 0, size = 1000;
    while (true) {
      var res = await c.from('v_liste_vo').select(COLS).range(from, from + size - 1);
      if (res.error) { S.error = res.error.message || String(res.error); break; }
      var batch = res.data || [];
      all = all.concat(batch);
      if (batch.length < size) break;
      from += size;
      if (from > 20000) break;
    }
    return all;
  }
  // RESEAU / AFFAIRE / SITE du site sélectionné via la table SITE (référentiel).
  async function resolveDefaults() {
    var api = siteApi();
    var id = api && api.getSiteId && api.getSiteId();
    if (id != null) {
      try { var c = sb(); if (c) { var r = await c.from('SITE').select('SITE,AFFAIRE,RESEAU').eq('ID_SITE', id).limit(1); var s = r.data && r.data[0]; if (s) return { reseau: s.RESEAU, affaire: s.AFFAIRE, site: s.SITE }; } } catch (e) { }
    }
    // fallback : nom du site (oropraSite) -> 1ère ligne du stock
    var sites = (api && api.getSites && api.getSites()) || [];
    var so = sites.find(function (x) { return String(x.id_site) === String(id); }) || {};
    var name = so.site || so.SITE || null;
    if (name) { var hit = S.raw.find(function (r) { return r.SITE === name; }); if (hit) return { reseau: hit.RESEAU, affaire: hit.AFFAIRE, site: hit.SITE }; }
    return {};
  }

  // ─────────────────────────────────────────────────────────── filtrage / tri
  function passFilters(r) {
    var f = S.f;
    if (f.reseau && r.RESEAU !== f.reseau) return false;
    if (f.affaire && r.AFFAIRE !== f.affaire) return false;
    if (f.site && r.SITE !== f.site) return false;
    if (f.societe && r.SOCIETE !== f.societe) return false;
    if (f.pointVente && r.POINT_VENTE !== f.pointVente) return false;
    if (f.marque && r.MARQUE_DMS !== f.marque) return false;
    if (f.modele && r.MODELE_DMS !== f.modele) return false;
    if (f.version && r.VERSION_EUROTAX !== f.version) return false;
    if (f.label && r.LABEL_Codifie !== f.label) return false;
    if (f.stockage && r.LIEU_STOCKAGE_Codifie !== f.stockage) return false;
    if (f.carrosserie && r.CARROSSERIE_EUROTAX !== f.carrosserie) return false;
    if (f.carburant && r.CARBURANT_DMS !== f.carburant) return false;
    if (f.boite && r.BOITEV_EUROTAX !== f.boite) return false;

    if (f.photos != null && hasPhoto(r) !== f.photos) return false;
    if (f.contremarque != null && contremarque(r) !== f.contremarque) return false;
    if (f.eurotax != null && (String(r.NATCODE_SELECTED) === 'true') !== f.eurotax) return false;
    if (f.infomediaire != null && notEmpty(r.INFOMEDIAIRE_Codifie) !== f.infomediaire) return false;
    if (f.tvaRecup != null && (String(r.CODETVA) === '1') !== f.tvaRecup) return false;
    if (f.pretVente != null && (r.PRET_A_LA_VENTE === 'O') !== f.pretVente) return false;
    if (f.destination && destination(r) !== f.destination) return false;

    var p = num(r.PVENTE); if (f.prixMin != null && (p == null || p < f.prixMin)) return false; if (f.prixMax != null && (p == null || p > f.prixMax)) return false;
    var mil = num(r.MIL); if (f.milMin != null && (mil == null || mil < f.milMin)) return false; if (f.milMax != null && (mil == null || mil > f.milMax)) return false;
    var km = num(r.KMS); if (f.kmsMin != null && (km == null || km < f.kmsMin)) return false; if (f.kmsMax != null && (km == null || km > f.kmsMax)) return false;
    var co2 = num(r.TAUX_CO2); if (f.co2Min != null && (co2 == null || co2 < f.co2Min)) return false; if (f.co2Max != null && (co2 == null || co2 > f.co2Max)) return false;
    if (f.nbjMin != null || f.nbjMax != null) { var nb = nbjDays(r); if (f.nbjMin != null && (nb == null || nb < f.nbjMin)) return false; if (f.nbjMax != null && (nb == null || nb > f.nbjMax)) return false; }

    if (notEmpty(S.search)) { var q = S.search.toLowerCase(); var hay = [r.NO_VO, r.VIN, designation(r), r.MARQUE_DMS, r.MODELE_DMS, r.DESIGNATION_DMS].join(' ').toLowerCase(); if (hay.indexOf(q) === -1) return false; }
    if (notEmpty(S.immat)) { var qi = S.immat.toLowerCase().replace(/[\s-]/g, ''); var im = String(r.NO_IMMAT || '').toLowerCase().replace(/[\s-]/g, ''); if (im.indexOf(qi) === -1) return false; }
    return true;
  }
  function sortVal(r, key) {
    switch (key) {
      case 'NBJ': return nbjDays(r) == null ? -1 : nbjDays(r);
      case 'PVENTE': return num(r.PVENTE) == null ? -1 : num(r.PVENTE);
      case 'PA_HT_TTC': return num(r.PA_HT_TTC) == null ? -1 : num(r.PA_HT_TTC);
      case 'KMS': return num(r.KMS) == null ? -1 : num(r.KMS);
      case 'CV_DMS': return num(r.CV_DMS) == null ? -1 : num(r.CV_DMS);
      case 'TAUX_CO2': return num(r.TAUX_CO2) == null ? -1 : num(r.TAUX_CO2);
      case 'D_1MEC': return String(r.D_1MEC || '');
      case 'CRITAIR': return critairNum(r);
      case 'DESIGN': return designation(r).toLowerCase();
      case 'GAR': return num(r.CODE_GARANTIE) == null ? -1 : num(r.CODE_GARANTIE);
      default: return String(r[key] || '').toLowerCase();
    }
  }
  function filtered() {
    var arr = S.raw.filter(passFilters);
    var k = S.sortKey, dir = S.sortDir === 'asc' ? 1 : -1;
    arr.sort(function (a, b) { var va = sortVal(a, k), vb = sortVal(b, k); if (va < vb) return -1 * dir; if (va > vb) return 1 * dir; return 0; });
    return arr;
  }
  function distinct(field, base) { var set = {}; (base || S.raw).forEach(function (r) { if (notEmpty(r[field])) set[r[field]] = 1; }); return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'fr'); }); }
  function activeFilterCount() { var f = S.f, n = 0; for (var k in f) if (f[k] != null) n++; return n; }

  // ─────────────────────────────────────────────────────────── sélection
  function selVins() { return Object.keys(S.sel).filter(function (v) { return S.sel[v]; }); }
  function selCount() { return selVins().length; }
  function selectedRows() { return S.raw.filter(function (r) { return S.sel[r.VIN]; }); }
  function toggleSel(vin, on) { if (on) S.sel[vin] = true; else delete S.sel[vin]; }

  // ─────────────────────────────────────────────────────────── icônes
  var IC = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    rss: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/></svg>',
    photos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13"/><path d="M3 13h18v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><circle cx="7.5" cy="15.5" r="1"/><circle cx="16.5" cy="15.5" r="1"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="18" x2="13" y2="18"/></svg>',
    xls: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>'
  };
  var LOGO = {
    pdf: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#E94335" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path fill="#B53024" d="M14 2v6h6z"/><path fill="#fff" d="M8 13h1.5a1.5 1.5 0 0 0 0-3H7v5h1v-2zm0-2h1.5a.5.5 0 0 1 0 1H8zm4 4V10h1.5a2.5 2.5 0 0 1 0 5zm1-1h.5a1.5 1.5 0 0 0 0-3H12zm4-4h2v1h-2v1h1.5v1H17v2h-1v-5z"/></svg>',
    xls: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="3" fill="#107C41"/><path fill="#fff" d="M7 8l2.5 4L7 16h1.8l1.7-2.8L12.2 16H14l-2.5-4L14 8h-1.8l-1.7 2.8L8.8 8z"/><path fill="#fff" d="M15 8h1.2v6.8H19V16h-4z"/></svg>'
  };

  // ─────────────────────────────────────────────────────────── CSS
  var STYLE = '<style id="vo-css">'
    + '#stockvo-root{font-family:"Nunito Sans",system-ui,sans-serif;color:#1F4A85;width:100%}'
    + '#stockvo-root *{box-sizing:border-box}'
    + '.vo-wrap{padding:4px 2px 40px}'
    + '.vo-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:4px 4px 16px}'
    + '.vo-title{font-size:26px;font-weight:800;letter-spacing:-.5px;line-height:1.1}'
    + '.vo-sub{font-size:13px;color:#7a98c5;margin-top:2px}'
    + '.vo-count{font-size:13px;font-weight:700;color:#2a5ea9;background:#eef4fc;padding:6px 12px;border-radius:20px;white-space:nowrap}'
    + '.vo-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#fff;border:1px solid #e8eef7;border-radius:16px;padding:12px;box-shadow:0 6px 20px rgba(31,74,133,.05)}'
    + '.vo-field{position:relative;flex:1 1 240px;min-width:170px}'
    + '.vo-field svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:#9bb3d1;pointer-events:none}'
    + '.vo-field input{width:100%;border:1.5px solid #e2eaf5;border-radius:11px;padding:11px 12px 11px 38px;font:inherit;font-size:14px;color:#1F4A85;outline:none;transition:border .15s}'
    + '.vo-field input:focus{border-color:#53bda7}.vo-field input::placeholder{color:#9bb3d1}'
    + '.vo-immat{flex:0 1 170px}'
    + '.vo-btn{display:inline-flex;align-items:center;gap:7px;border:1.5px solid #d6e2f2;background:#fff;color:#2a5ea9;font:inherit;font-size:14px;font-weight:700;padding:10px 16px;border-radius:11px;cursor:pointer;transition:all .15s;white-space:nowrap}'
    + '.vo-btn:hover{border-color:#53bda7;color:#1F4A85}.vo-btn svg{width:16px;height:16px}'
    + '.vo-btn.primary{border:none;background:#2a5ea9;color:#fff}.vo-btn.primary:hover{background:#1F4A85;color:#fff}'
    + '.vo-btn.ghost{border:none;background:transparent;color:#7a98c5}.vo-btn.ghost:hover{color:#e24b4a}'
    + '.vo-btn .vo-fbadge{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#53bda7;color:#fff;font-size:10px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}'
    + '.vo-toggle{display:flex;align-items:center;gap:9px;margin-left:auto;font-size:13px;font-weight:700;color:#7a98c5}'
    + '.vo-switch{position:relative;width:46px;height:26px;border-radius:14px;background:#d8e2f0;cursor:pointer;transition:background .2s;flex:0 0 auto}'
    + '.vo-switch.on{background:#53bda7}.vo-switch::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:left .2s}.vo-switch.on::after{left:23px}'
    + '.vo-chips{display:flex;flex-wrap:wrap;gap:8px;margin:14px 4px 4px;min-height:2px}'
    + '.vo-chip{display:inline-flex;align-items:center;gap:7px;background:#fff;border:1.5px solid #e2eaf5;color:#2a5ea9;font-size:12.5px;font-weight:700;padding:6px 8px 6px 12px;border-radius:20px}'
    + '.vo-chip b{font-weight:800}'
    + '.vo-chip .vo-cx{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#f0f4fa;color:#7a98c5;cursor:pointer;transition:all .15s}'
    + '.vo-chip .vo-cx:hover{background:#e24b4a;color:#fff}.vo-chip .vo-cx svg{width:9px;height:9px}'
    + '.vo-chip-clear{cursor:pointer;color:#9bb3d1;font-size:12px;font-weight:700;text-decoration:underline;padding:6px 4px}'
    + '.vo-state{padding:60px 20px;text-align:center;color:#9bb3d1;font-size:15px;font-weight:600}'
    + '.vo-spin{width:30px;height:30px;border:3px solid #e2eaf5;border-top-color:#53bda7;border-radius:50%;animation:vospin .8s linear infinite;margin:0 auto 14px}@keyframes vospin{to{transform:rotate(360deg)}}'
    + '.vo-chk{width:16px;height:16px;cursor:pointer;accent-color:#2a5ea9;flex:0 0 auto}'
    // barre de sélection
    + '.vo-selbar{display:flex;align-items:center;gap:14px;background:#eef4fc;border:1px solid #cfe0f5;border-radius:14px;padding:10px 16px;margin:16px 0 0}'
    + '.vo-selbar-n{font-size:14px;font-weight:700;color:#2a5ea9}.vo-selbar-n b{font-weight:800}'
    + '.vo-selbar-acts{display:flex;align-items:center;gap:10px;margin-left:auto;flex-wrap:wrap}'
    + '.vo-logo{background:none;border:none;padding:3px;cursor:pointer;line-height:0;border-radius:10px;position:relative;z-index:1;transition:transform .12s,background .12s}'
    + '.vo-logo:hover{background:#fff;transform:translateY(-1px);box-shadow:0 4px 12px rgba(31,74,133,.15)}'
    + '.vo-logo svg{width:34px;height:34px;display:block;pointer-events:none}.vo-logo:disabled{opacity:.45;cursor:default;transform:none;box-shadow:none}'
    + '.vo-tip{position:fixed;z-index:2000;max-width:280px;background:#1F4A85;color:#fff;font-size:12px;font-weight:600;line-height:1.45;padding:8px 11px;border-radius:9px;box-shadow:0 8px 24px rgba(31,74,133,.3);pointer-events:none;opacity:0;transition:opacity .12s}'
    // pager
    + '.vo-pager{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}'
    + '.vo-pager.top{margin:16px 2px 0}'
    + '.vo-pg{min-width:36px;height:36px;padding:0 10px;border:1.5px solid #e2eaf5;background:#fff;color:#2a5ea9;font:inherit;font-size:13px;font-weight:700;border-radius:10px;cursor:pointer;transition:all .15s}'
    + '.vo-pg:hover{border-color:#53bda7}.vo-pg.on{background:#2a5ea9;color:#fff;border-color:#2a5ea9}.vo-pg:disabled{opacity:.4;cursor:default}.vo-pg-dots{color:#9bb3d1;padding:0 4px}'
    // tableau
    + '.vo-tablewrap{margin-top:12px;background:#fff;border:1px solid #e8eef7;border-radius:16px;overflow:auto;box-shadow:0 6px 20px rgba(31,74,133,.05)}'
    + '.vo-table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;min-width:1400px}'
    + '.vo-table th{position:sticky;top:0;background:#f7faff;color:#7a98c5;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;text-align:left;padding:13px 12px;border-bottom:1px solid #e8eef7;white-space:nowrap;z-index:2}'
    + '.vo-table th.vo-sortable{cursor:pointer;user-select:none}.vo-table th.vo-sortable:hover{color:#2a5ea9}'
    + '.vo-table th .vo-arrow{opacity:.6;font-size:9px;margin-left:3px}'
    + '.vo-table td{padding:9px 12px;border-bottom:1px solid #f1f5fb;white-space:nowrap;vertical-align:middle;background:#fff}'
    + '.vo-table tbody tr:last-child td{border-bottom:none}'
    + '.vo-table tbody tr:hover td{background:#fafcff}'
    + '.vo-infos{display:flex;align-items:center;gap:5px}'
    + '.vo-iact{display:inline-flex;align-items:center;justify-content:center;width:27px;height:27px;border-radius:8px;cursor:pointer;color:#7a98c5;transition:all .15s;flex:0 0 auto}'
    + '.vo-iact svg{width:15px;height:15px}'
    + '.vo-iact.eye{color:#53bda7}.vo-iact.eye:hover{background:#e7f6f1}'
    + '.vo-iact.globe:hover{background:#eef4fc;color:#2a5ea9}.vo-iact.photos:hover{background:#eef4fc;color:#2a5ea9}'
    + '.vo-iact.rss{color:#cdd9ea;cursor:default}.vo-iact.disabled{opacity:.3;cursor:default}'
    + '.vo-thumb-wrap{display:inline-flex;flex:0 0 auto}'
    + '.vo-thumb{width:46px;height:32px;border-radius:6px;object-fit:cover;background:#eef2f8}'
    + '.vo-thumb-ph{width:46px;height:32px;border-radius:6px;background:#eef2f8;display:flex;align-items:center;justify-content:center;color:#c0cee0}.vo-thumb-ph svg{width:20px;height:20px}'
    + '.vo-dot{width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;position:relative;cursor:default}'
    + '.vo-dot.green{background:#e7f6f1}.vo-dot.green::after{content:"";width:9px;height:9px;border-radius:50%;background:#2bb673}'
    + '.vo-dot.red{background:#fcebeb;cursor:default}.vo-dot.red::after{content:"";width:9px;height:9px;border-radius:50%;background:#e24b4a}'
    + '.vo-novo{font-weight:800;color:#1F4A85}.vo-link{color:#2a5ea9;font-weight:600}'
    + '.vo-pa{color:#9a6b00;font-weight:700}'
    + '.vo-ca{display:inline-flex;align-items:center;gap:5px;font-weight:800;font-size:12px}.vo-ca i{width:9px;height:9px;border-radius:50%;display:inline-block}'
    // cartes
    + '.vo-grid{margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}'
    + '.vo-card{background:#fff;border:1px solid #e8eef7;border-radius:16px;overflow:hidden;box-shadow:0 6px 20px rgba(31,74,133,.05);transition:transform .15s,box-shadow .15s;display:flex;flex-direction:column}'
    + '.vo-card:hover{transform:translateY(-2px);box-shadow:0 14px 30px rgba(31,74,133,.12)}'
    + '.vo-card.sel{outline:2px solid #2a5ea9;outline-offset:-2px}'
    + '.vo-card-img{position:relative;width:100%;aspect-ratio:16/10;background:#eef2f8;overflow:hidden}'
    + '.vo-card-img img{width:100%;height:100%;object-fit:cover;display:block}'
    + '.vo-card-img .vo-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#c0cee0}.vo-card-img .vo-ph svg{width:56px;height:56px}'
    + '.vo-card-acts{position:absolute;top:10px;left:10px;right:10px;display:flex;align-items:center;justify-content:space-between}'
    + '.vo-card-acts .vo-grp{display:flex;align-items:center;gap:6px}'
    + '.vo-card-acts .vo-iact{background:rgba(255,255,255,.92);backdrop-filter:blur(4px);box-shadow:0 2px 6px rgba(0,0,0,.12)}'
    + '.vo-cardchk{width:18px;height:18px;accent-color:#2a5ea9;cursor:pointer;background:#fff;border-radius:4px}'
    + '.vo-card-ca{position:absolute;left:10px;bottom:10px;background:rgba(255,255,255,.94);backdrop-filter:blur(4px);padding:4px 9px;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,.1)}'
    + '.vo-card-body{padding:13px 15px 15px;display:flex;flex-direction:column;gap:9px;flex:1}'
    + '.vo-card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}'
    + '.vo-card-name{font-size:15px;font-weight:800;line-height:1.2}.vo-card-name .vo-vers{display:block;font-size:12px;font-weight:600;color:#7a98c5;margin-top:1px}'
    + '.vo-card-price{font-size:17px;font-weight:800;color:#53bda7;white-space:nowrap}'
    + '.vo-card-pa{font-size:11.5px;color:#9a6b00;font-weight:700;margin-top:1px}'
    + '.vo-card-site{font-size:12px;color:#2a5ea9;font-weight:700}'
    + '.vo-card-meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:12px;color:#54678a;border-top:1px solid #f1f5fb;padding-top:9px}.vo-card-meta b{color:#1F4A85;font-weight:700}'
    + '.vo-card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto}.vo-card-foot .vo-meta-s{font-size:11.5px;color:#9bb3d1;font-weight:700}'
    // modal filtre
    + '.vo-modal-bg{position:fixed;inset:0;background:rgba(31,74,133,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px}'
    + '.vo-modal{background:#f7faff;border-radius:20px;width:1080px;max-width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 70px rgba(31,74,133,.35)}'
    + '.vo-modal-head{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;background:#fff;border-bottom:1px solid #e8eef7}.vo-modal-head h3{font-size:18px;font-weight:800;margin:0}'
    + '.vo-modal-x{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;cursor:pointer;color:#7a98c5;transition:all .15s}.vo-modal-x:hover{background:#f0f4fa;color:#e24b4a}.vo-modal-x svg{width:18px;height:18px}'
    + '.vo-modal-body{padding:18px 22px;overflow-y:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:start}'
    + '.vo-fcol{display:flex;flex-direction:column;gap:12px}'
    + '.vo-fsec{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#fff;padding:9px 12px;border-radius:10px;text-align:center}.vo-fsec.b{background:#2a5ea9}.vo-fsec.g{background:#53bda7}.vo-fsec.o{background:#fac055;color:#5a3d05}'
    + '.vo-lab{font-size:11px;font-weight:700;color:#7a98c5;margin:2px 2px -4px}'
    + '.vo-sel{width:100%;border:1.5px solid #e2eaf5;border-radius:10px;padding:9px 11px;font:inherit;font-size:13px;color:#1F4A85;background:#fff;outline:none;cursor:pointer}.vo-sel:focus{border-color:#53bda7}'
    + '.vo-tri{display:flex;align-items:center;justify-content:space-between;gap:8px;background:#fff;border:1.5px solid #e2eaf5;border-radius:10px;padding:8px 11px}'
    + '.vo-tri-lab{font-size:12.5px;font-weight:700;color:#54678a}.vo-tri-opts{display:flex;gap:3px}'
    + '.vo-tri-opt{font-size:11.5px;font-weight:700;color:#7a98c5;padding:4px 9px;border-radius:7px;cursor:pointer;transition:all .12s}.vo-tri-opt.on{background:#2a5ea9;color:#fff}'
    + '.vo-range{display:flex;align-items:center;gap:7px}.vo-range input{width:100%;border:1.5px solid #e2eaf5;border-radius:9px;padding:8px 10px;font:inherit;font-size:12.5px;color:#1F4A85;outline:none}.vo-range input:focus{border-color:#53bda7}.vo-range span{font-size:11px;color:#9bb3d1;font-weight:700}'
    + '.vo-modal-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 22px;background:#fff;border-top:1px solid #e8eef7}'
    + '.vo-foot-btn{flex:1;padding:12px;border-radius:12px;font:inherit;font-size:14px;font-weight:800;cursor:pointer;border:1.5px solid #d6e2f2;background:#fff;color:#2a5ea9;transition:all .15s}.vo-foot-btn:hover{border-color:#53bda7}.vo-foot-btn.primary{border:none;background:#2a5ea9;color:#fff}.vo-foot-btn.primary:hover{background:#1F4A85}'
    // responsive
    + '@media(max-width:900px){.vo-modal-body{grid-template-columns:1fr}}'
    + '@media(max-width:760px){.vo-head{flex-direction:column;align-items:flex-start;gap:6px}.vo-title{font-size:22px}.vo-toggle{margin-left:0}.vo-grid{grid-template-columns:1fr;gap:14px}.vo-modal{border-radius:0;max-height:100vh;height:100vh;width:100vw}.vo-modal-bg{padding:0}.vo-selbar{flex-wrap:wrap}.vo-selbar-acts{margin-left:0;width:100%}}'
    + '@media(max-width:520px){.vo-card-meta{grid-template-columns:1fr 1fr}.vo-field{flex:1 1 100%}.vo-immat{flex:1 1 100%}}'
    + '</style>';

  // ─────────────────────────────────────────────────────────── colonnes tableau
  function columns() {
    var cols = [
      { k: '__chk', t: '', w: 40, kind: 'chk' },
      { k: '__infos', t: 'Infos', w: 222, kind: 'infos' },
      { k: 'NO_VO', t: 'VO', w: 112, sort: true },
      { k: 'NO_IMMAT', t: 'Immat', w: 100, sort: true },
      { k: 'VIN', t: 'VIN', w: 150, sort: true },
      { k: 'NBJ', t: 'NBJ', sort: true }, { k: 'MARQUE_DMS', t: 'Marque', sort: true }, { k: 'MODELE_DMS', t: 'Modèle', sort: true },
      { k: 'DESIGN', t: 'Désignation', sort: true }, { k: 'PVENTE', t: 'Prix', sort: true }
    ];
    if (S.showPA) cols.push({ k: 'PA_HT_TTC', t: 'PA HT/TTC', sort: true });
    cols = cols.concat([
      { k: 'KMS', t: 'Kms', sort: true }, { k: 'D_1MEC', t: 'PMEC', sort: true }, { k: 'GAR', t: 'Garantie', sort: true },
      { k: 'CRITAIR', t: "Crit'Air", sort: true }, { k: 'CV_DIN', t: 'CV', sort: true }, { k: 'TAUX_CO2', t: 'CO2', sort: true },
      { k: 'TVA', t: 'TVA', sort: true }, { k: 'COULEUR_DMS', t: 'Couleur', sort: true }, { k: 'SITE', t: 'Site', sort: true },
      { k: 'LABEL_Codifie', t: 'Label', sort: true }, { k: 'ORIGINEACHAT_Codifie', t: 'Origine', sort: true },
      { k: 'LIEU_STOCKAGE_Codifie', t: 'Stockage', sort: true }, { k: 'DETAIL_STOCKAGE_Codifie', t: 'Détail st.', sort: true }
    ]);
    return cols;
  }
  function frzAttr(c) { return c.w ? ' style="min-width:' + c.w + 'px;width:' + c.w + 'px"' : ''; }

  // ─────────────────────────────────────────────────────────── cellules
  function infosHtml(r) {
    var hasUrl = notEmpty(r.URL360), cm = contremarque(r), img = mainImage(r);
    var thumb = img
      ? '<span class="vo-thumb-wrap"><img class="vo-thumb" src="' + esc(img) + '" loading="lazy" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'"><span class="vo-thumb-ph" style="display:none">' + IC.car + '</span></span>'
      : '<span class="vo-thumb-ph">' + IC.car + '</span>';
    return '<div class="vo-infos">'
      + '<span class="vo-iact eye" data-act="eye" data-vin="' + esc(r.VIN) + '" title="Fiche VO">' + IC.eye + '</span>'
      + '<span class="vo-iact rss" title="Diffusion (à venir)">' + IC.rss + '</span>'
      + '<span class="vo-iact globe' + (hasUrl ? '' : ' disabled') + '" ' + (hasUrl ? 'data-act="globe" data-url="' + esc(r.URL360) + '"' : '') + ' title="Annonce web">' + IC.globe + '</span>'
      + '<span class="vo-iact photos" data-act="photos" data-vin="' + esc(r.VIN) + '" title="Diaporama">' + IC.photos + '</span>'
      + thumb
      + '<span class="vo-dot ' + (cm ? 'red' : 'green') + '" data-vin="' + esc(r.VIN) + '" data-cm="' + esc(r.ID_CM || '') + '"' + (cm ? '' : ' title="Disponible à la vente"') + '></span>'
      + '</div>';
  }
  function cellInner(r, key) {
    var ca;
    switch (key) {
      case 'NO_VO': return '<span class="vo-novo">' + esc(r.NO_VO || '-') + '</span>';
      case 'NO_IMMAT': return esc(r.NO_IMMAT || '-');
      case 'VIN': return '<span style="color:#9bb3d1;font-size:12px">' + esc(r.VIN || '-') + '</span>';
      case 'NBJ': var nb = nbjDays(r); return nb == null ? '-' : '<span title="Entré le ' + esc(fmtDateFR(r.D_ACHAT)) + '">' + nb + '</span>';
      case 'MARQUE_DMS': return esc(r.MARQUE_DMS || '-');
      case 'MODELE_DMS': return esc(r.MODELE_DMS || '-');
      case 'DESIGN': return esc(designation(r));
      case 'PVENTE': return '<b>' + esc(priceTxt(r)) + '</b>';
      case 'PA_HT_TTC': return '<span class="vo-pa">' + esc(eur(r.PA_HT_TTC)) + '</span>';
      case 'KMS': return '<span class="vo-link">' + (num(r.KMS) == null ? '-' : num(r.KMS).toLocaleString('fr-FR')) + '</span>';
      case 'D_1MEC': return esc(fmtDateFR(r.D_1MEC));
      case 'GAR': return esc(garantieTxt(r));
      case 'CRITAIR': ca = critair(r); return '<span class="vo-ca"><i style="background:' + ca.color + '"></i>' + (ca.n === 99 ? 'NC' : ca.n) + '</span>';
      case 'CV_DMS': return esc(r.CV_DMS || '-');
      case 'TAUX_CO2': return esc(r.TAUX_CO2 || '-');
      case 'TVA': return esc(r.TVA || '-');
      case 'COULEUR_DMS': return esc(r.COULEUR_DMS || '-');
      case 'SITE': return '<span class="vo-link">' + esc(r.SITE || '-') + '</span>';
      case 'LABEL_Codifie': return '<span class="vo-link">' + esc(r.LABEL_Codifie || '-') + '</span>';
      case 'ORIGINEACHAT_Codifie': return '<span class="vo-link">' + esc(r.ORIGINEACHAT_Codifie || '-') + '</span>';
      case 'LIEU_STOCKAGE_Codifie': return '<span class="vo-link">' + esc(r.LIEU_STOCKAGE_Codifie || '-') + '</span>';
      case 'DETAIL_STOCKAGE_Codifie': return '<span class="vo-link">' + esc(r.DETAIL_STOCKAGE_Codifie || '-') + '</span>';
      default: return '-';
    }
  }
  function thHtml(cols) {
    return cols.map(function (c) {
      if (c.kind === 'chk') return '<th' + frzAttr(c) + '><input type="checkbox" class="vo-chk" id="vo-selall"></th>';
      var cl = c.sort ? 'vo-sortable' : '';
      var ar = (c.sort && S.sortKey === c.k) ? '<span class="vo-arrow">' + (S.sortDir === 'asc' ? '▲' : '▼') + '</span>' : '';
      return '<th' + (cl ? ' class="' + cl + '"' : '') + frzAttr(c) + (c.sort ? ' data-sort="' + c.k + '"' : '') + '>' + esc(c.t) + ar + '</th>';
    }).join('');
  }
  function rowHtml(r, cols) {
    var tds = cols.map(function (c) {
      var inner;
      if (c.kind === 'chk') inner = '<input type="checkbox" class="vo-chk vo-rowchk" data-vin="' + esc(r.VIN) + '"' + (S.sel[r.VIN] ? ' checked' : '') + '>';
      else if (c.kind === 'infos') inner = infosHtml(r);
      else inner = cellInner(r, c.k);
      return '<td' + frzAttr(c) + '>' + inner + '</td>';
    }).join('');
    return '<tr>' + tds + '</tr>';
  }

  // ─────────────────────────────────────────────────────────── carte
  function cardHtml(r) {
    var img = mainImage(r), ca = critair(r), cm = contremarque(r), hasUrl = notEmpty(r.URL360), sel = !!S.sel[r.VIN];
    var imgPart = img
      ? '<img src="' + esc(img) + '" alt="" loading="lazy" onerror="this.style.display=\'none\';this.parentNode.querySelector(\'.vo-ph\')&&(this.parentNode.querySelector(\'.vo-ph\').style.display=\'flex\')"><div class="vo-ph" style="display:none">' + IC.car + '</div>'
      : '<div class="vo-ph">' + IC.car + '</div>';
    return '<div class="vo-card' + (sel ? ' sel' : '') + '">'
      + '<div class="vo-card-img">' + imgPart
      + '<div class="vo-card-acts">'
      + '<div class="vo-grp">'
      + '<input type="checkbox" class="vo-cardchk" data-vin="' + esc(r.VIN) + '"' + (sel ? ' checked' : '') + ' title="Sélectionner">'
      + '<span class="vo-iact eye" data-act="eye" data-vin="' + esc(r.VIN) + '" title="Fiche VO">' + IC.eye + '</span>'
      + '<span class="vo-dot ' + (cm ? 'red' : 'green') + '" data-vin="' + esc(r.VIN) + '" data-cm="' + esc(r.ID_CM || '') + '"' + (cm ? '' : ' title="Disponible à la vente"') + '></span>'
      + '</div>'
      + '<div class="vo-grp">'
      + '<span class="vo-iact rss" title="Diffusion (à venir)">' + IC.rss + '</span>'
      + '<span class="vo-iact globe' + (hasUrl ? '' : ' disabled') + '" ' + (hasUrl ? 'data-act="globe" data-url="' + esc(r.URL360) + '"' : '') + ' title="Annonce web">' + IC.globe + '</span>'
      + '<span class="vo-iact photos" data-act="photos" data-vin="' + esc(r.VIN) + '" title="Diaporama">' + IC.photos + '</span>'
      + '</div>'
      + '</div>'
      + '<div class="vo-card-ca"><span class="vo-ca"><i style="background:' + ca.color + '"></i>' + esc(ca.label) + '</span></div>'
      + '</div>'
      + '<div class="vo-card-body">'
      + '<div class="vo-card-top"><div><div class="vo-card-name">' + esc((r.MARQUE_DMS || '') + ' ' + (r.MODELE_DMS || '')) + '<span class="vo-vers">' + esc(designation(r)) + '</span></div></div>'
      + '<div style="text-align:right"><div class="vo-card-price">' + esc(priceTxt(r)) + '</div>' + (S.showPA ? '<div class="vo-card-pa">PA ' + esc(eur(r.PA_HT_TTC)) + '</div>' : '') + '</div></div>'
      + '<div class="vo-card-site">' + esc(r.SITE || '-') + '</div>'
      + '<div class="vo-card-meta">'
      + '<div>N° <b>' + esc(r.NO_VO || '-') + '</b></div><div style="text-align:right">' + esc(r.NO_IMMAT || '-') + '</div>'
      + '<div><b>' + esc(kmTxt(r)) + '</b></div><div style="text-align:right">' + esc(r.BOITEV_EUROTAX || '-') + '</div>'
      + '<div>' + esc(fmtDateFR(r.D_1MEC)) + '</div><div style="text-align:right">' + esc(r.CARBURANT_DMS || '-') + '</div>'
      + '</div>'
      + '<div class="vo-card-foot"><span class="vo-meta-s">' + (nbjDays(r) == null ? '-' : nbjDays(r) + ' jrs en stock') + '</span><span class="vo-meta-s">' + esc(garantieTxt(r)) + '</span></div>'
      + '</div>'
      + '</div>';
  }

  // ─────────────────────────────────────────────────────────── pager / selbar
  function pagerHtml(total, page, perPage, cls) {
    var pages = Math.max(1, Math.ceil(total / perPage));
    if (pages <= 1) return '';
    var out = '<button class="vo-pg" data-pg="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>‹</button>';
    var list = [];
    for (var i = 1; i <= pages; i++) { if (i === 1 || i === pages || Math.abs(i - page) <= 1) list.push(i); else if (list[list.length - 1] !== '…') list.push('…'); }
    list.forEach(function (i) { out += i === '…' ? '<span class="vo-pg-dots">…</span>' : '<button class="vo-pg' + (i === page ? ' on' : '') + '" data-pg="' + i + '">' + i + '</button>'; });
    out += '<button class="vo-pg" data-pg="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + '>›</button>';
    return '<div class="vo-pager ' + (cls || '') + '">' + out + '</div>';
  }
  function selbarHtml() {
    var n = selCount();
    return '<div class="vo-selbar" id="vo-selbar"' + (n ? '' : ' style="display:none"') + '>'
      + '<span class="vo-selbar-n"><b id="vo-seln">' + n + '</b> véhicule(s) sélectionné(s)</span>'
      + '<div class="vo-selbar-acts">'
      + '<button type="button" class="vo-logo" id="vo-pdf" title="Générer les affiches prix (PDF)" onclick="window.__voPosters()">' + LOGO.pdf + '</button>'
      + '<button type="button" class="vo-logo" id="vo-xls" title="Exporter la sélection (Excel)" onclick="window.__voExcel()">' + LOGO.xls + '</button>'
      + '<button type="button" class="vo-btn ghost" id="vo-selclear" onclick="window.__voClearSel()">Effacer la sélection</button>'
      + '</div></div>';
  }

  // ─────────────────────────────────────────────────────────── rendu contenu
  function renderContent() {
    var host = root() && root().querySelector('#vo-content');
    if (!host) return;
    if (S.loading) { host.innerHTML = '<div class="vo-state"><div class="vo-spin"></div>Chargement du stock…</div>'; return; }
    if (S.error) { host.innerHTML = '<div class="vo-state">Erreur de chargement.<br><span style="font-size:12px">' + esc(S.error) + '</span></div>'; return; }

    var data = filtered();
    var perPage = defaultPerPage();
    var pages = Math.max(1, Math.ceil(data.length / perPage));
    if (S.page > pages) S.page = pages;
    var slice = data.slice((S.page - 1) * perPage, S.page * perPage);

    var cnt = root().querySelector('.vo-count');
    if (cnt) cnt.textContent = data.length + ' véhicule' + (data.length > 1 ? 's' : '') + " d'occasion";

    var top = selbarHtml() + pagerHtml(data.length, S.page, perPage, 'top');
    if (!slice.length) { host.innerHTML = top + '<div class="vo-state">Aucun véhicule ne correspond aux filtres.</div>'; bindContent(host); return; }

    if (S.view === 'photo') {
      host.innerHTML = top + '<div class="vo-grid">' + slice.map(cardHtml).join('') + '</div>';
    } else {
      var cols = columns();
      host.innerHTML = top + '<div class="vo-tablewrap"><table class="vo-table"><thead><tr>' + thHtml(cols) + '</tr></thead><tbody>'
        + slice.map(function (r) { return rowHtml(r, cols); }).join('') + '</tbody></table></div>';
    }
    bindContent(host);
  }

  // ─────────────────────────────────────────────────────────── chips
  function chipDefs() {
    var f = S.f, out = [];
    function add(key, label, val) { if (val != null) out.push({ key: key, label: label, val: val }); }
    add('reseau', 'Réseau', f.reseau); add('affaire', 'Affaire', f.affaire); add('site', 'Site', f.site);
    add('societe', 'Société', f.societe); add('pointVente', 'Point de vente', f.pointVente);
    add('marque', 'Marque', f.marque); add('modele', 'Modèle', f.modele); add('version', 'Version', f.version);
    add('label', 'Label', f.label); add('stockage', 'Stockage', f.stockage);
    add('carrosserie', 'Carrosserie', f.carrosserie); add('carburant', 'Carburant', f.carburant); add('boite', 'Boîte', f.boite);
    if (f.photos != null) add('photos', 'Photos', f.photos ? 'Oui' : 'Non');
    if (f.contremarque != null) add('contremarque', 'Contremarqué', f.contremarque ? 'Oui' : 'Non');
    if (f.eurotax != null) add('eurotax', 'Codifié Eurotax', f.eurotax ? 'Oui' : 'Non');
    if (f.infomediaire != null) add('infomediaire', 'Codifié Infomédiaire', f.infomediaire ? 'Oui' : 'Non');
    if (f.tvaRecup != null) add('tvaRecup', 'TVA récup.', f.tvaRecup ? 'Oui' : 'Non');
    if (f.pretVente != null) add('pretVente', 'Prêt à la vente', f.pretVente ? 'Oui' : 'Non');
    if (f.destination) add('destination', 'Destination', f.destination);
    if (f.prixMin != null || f.prixMax != null) add('prix', 'Prix', (f.prixMin || 0) + ' → ' + (f.prixMax != null ? f.prixMax : '∞') + ' €');
    if (f.milMin != null || f.milMax != null) add('mil', 'Millésime', (f.milMin || '') + ' → ' + (f.milMax != null ? f.milMax : ''));
    if (f.kmsMin != null || f.kmsMax != null) add('kms', 'Kms', (f.kmsMin || 0) + ' → ' + (f.kmsMax != null ? f.kmsMax : '∞'));
    if (f.nbjMin != null || f.nbjMax != null) add('nbj', 'NBJ', (f.nbjMin || 0) + ' → ' + (f.nbjMax != null ? f.nbjMax : '∞'));
    if (f.co2Min != null || f.co2Max != null) add('co2', 'CO2', (f.co2Min || 0) + ' → ' + (f.co2Max != null ? f.co2Max : '∞'));
    return out;
  }
  function clearChip(key) {
    var f = S.f;
    if (key === 'prix') { f.prixMin = f.prixMax = null; }
    else if (key === 'mil') { f.milMin = f.milMax = null; }
    else if (key === 'kms') { f.kmsMin = f.kmsMax = null; }
    else if (key === 'nbj') { f.nbjMin = f.nbjMax = null; }
    else if (key === 'co2') { f.co2Min = f.co2Max = null; }
    else f[key] = null;
  }
  function renderChips() {
    var box = root() && root().querySelector('.vo-chips'); if (!box) return;
    var defs = chipDefs();
    var html = defs.map(function (c) { return '<span class="vo-chip">' + esc(c.label) + ' : <b>' + esc(c.val) + '</b><span class="vo-cx" data-chip="' + esc(c.key) + '">' + IC.x + '</span></span>'; }).join('');
    if (defs.length > 1) html += '<span class="vo-chip-clear" data-clear="1">Tout effacer</span>';
    box.innerHTML = html;
    box.querySelectorAll('[data-chip]').forEach(function (el) { el.addEventListener('click', function () { clearChip(el.getAttribute('data-chip')); S.page = 1; renderChips(); renderContent(); }); });
    var clr = box.querySelector('[data-clear]'); if (clr) clr.addEventListener('click', function () { for (var k in S.f) S.f[k] = null; S.page = 1; renderChips(); renderContent(); });
    refreshFilterBadge();
  }

  // ─────────────────────────────────────────────────────────── popup filtre
  function selHtml(field, current, base, ph) {
    var opts = '<option value="">' + esc(ph) + '</option>';
    distinct(field, base).forEach(function (v) { opts += '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>'; });
    return opts;
  }
  function triHtml(name, val) {
    function o(v, lab) { var on = (val === v) || (val == null && v === 'all'); return '<span class="vo-tri-opt' + (on ? ' on' : '') + '" data-tri="' + name + '" data-val="' + v + '">' + lab + '</span>'; }
    return '<div class="vo-tri-opts">' + o('all', 'Tous') + o('yes', 'Oui') + o('no', 'Non') + '</div>';
  }
  function destHtml(val) {
    function o(v, lab) { var on = (val === v) || (val == null && v === 'all'); return '<span class="vo-tri-opt' + (on ? ' on' : '') + '" data-dest="' + v + '">' + lab + '</span>'; }
    return '<div class="vo-tri-opts">' + o('all', 'Tous') + o('VOP', 'VOP') + o('VOM', 'VOM') + '</div>';
  }
  function openFilter() {
    var f = JSON.parse(JSON.stringify(S.f));
    var bg = doc.createElement('div'); bg.className = 'vo-modal-bg';

    function societeBase() { return S.raw; }
    function siteBase() { return S.raw.filter(function (r) { return (!f.reseau || r.RESEAU === f.reseau) && (!f.affaire || r.AFFAIRE === f.affaire); }); }
    function pvBase() { return S.raw; }
    function modeleBase() { return f.marque ? S.raw.filter(function (r) { return r.MARQUE_DMS === f.marque; }) : S.raw; }
    function versionBase() { return S.raw.filter(function (r) { return (!f.marque || r.MARQUE_DMS === f.marque) && (!f.modele || r.MODELE_DMS === f.modele); }); }
    function triVal(b) { return b == null ? null : (b ? 'yes' : 'no'); }
    function rng(id, min, max) { return '<div class="vo-range"><input type="number" id="' + id + '_min" placeholder="' + min + '" value="' + (f[id + 'Min'] != null ? f[id + 'Min'] : '') + '"><span>→</span><input type="number" id="' + id + '_max" placeholder="' + max + '" value="' + (f[id + 'Max'] != null ? f[id + 'Max'] : '') + '"></div>'; }

    function build() {
      return STYLE
        + '<div class="vo-modal">'
        + '<div class="vo-modal-head"><h3>Filtrer le stock VO</h3><span class="vo-modal-x" data-x>' + IC.close + '</span></div>'
        + '<div class="vo-modal-body">'
        + '<div class="vo-fcol">'
        + '<div class="vo-fsec b">Propriétaire</div>'
        + '<div><div class="vo-lab">Réseau</div><select class="vo-sel" id="f_reseau">' + selHtml('RESEAU', f.reseau, S.raw, 'Tous les réseaux') + '</select></div>'
        + '<div><div class="vo-lab">Affaire</div><select class="vo-sel" id="f_affaire">' + selHtml('AFFAIRE', f.affaire, S.raw, 'Toutes les affaires') + '</select></div>'
        + '<div><div class="vo-lab">Site</div><select class="vo-sel" id="f_site">' + selHtml('SITE', f.site, siteBase(), 'Tous les sites') + '</select></div>'
        + '<div class="vo-fsec g">Localisation</div>'
        + '<div><div class="vo-lab">Label</div><select class="vo-sel" id="f_label">' + selHtml('LABEL_Codifie', f.label, S.raw, 'Tous les labels') + '</select></div>'
        + '<div><div class="vo-lab">Lieu de stockage</div><select class="vo-sel" id="f_stockage">' + selHtml('LIEU_STOCKAGE_Codifie', f.stockage, S.raw, 'Tous les lieux') + '</select></div>'
        + '<div class="vo-fsec o">Véhicule</div>'
        + '<div><div class="vo-lab">Marque</div><select class="vo-sel" id="f_marque">' + selHtml('MARQUE_DMS', f.marque, S.raw, 'Toutes les marques') + '</select></div>'
        + '<div><div class="vo-lab">Modèle</div><select class="vo-sel" id="f_modele">' + selHtml('MODELE_DMS', f.modele, modeleBase(), 'Tous les modèles') + '</select></div>'
        + '<div><div class="vo-lab">Version</div><select class="vo-sel" id="f_version">' + selHtml('VERSION_EUROTAX', f.version, versionBase(), 'Toutes les versions') + '</select></div>'
        + '</div>'
        + '<div class="vo-fcol">'
        + '<div class="vo-tri"><span class="vo-tri-lab">Photos</span>' + triHtml('photos', triVal(f.photos)) + '</div>'
        + '<div class="vo-tri"><span class="vo-tri-lab">Contremarqué</span>' + triHtml('contremarque', triVal(f.contremarque)) + '</div>'
        + '<div class="vo-tri"><span class="vo-tri-lab">Codifié Eurotax</span>' + triHtml('eurotax', triVal(f.eurotax)) + '</div>'
        + '<div class="vo-tri"><span class="vo-tri-lab">Codifié Infomédiaire</span>' + triHtml('infomediaire', triVal(f.infomediaire)) + '</div>'
        + '<div class="vo-tri"><span class="vo-tri-lab">TVA récupérable</span>' + triHtml('tvaRecup', triVal(f.tvaRecup)) + '</div>'
        + '<div class="vo-tri"><span class="vo-tri-lab">Prêt à la vente</span>' + triHtml('pretVente', triVal(f.pretVente)) + '</div>'
        + '<div class="vo-tri"><span class="vo-tri-lab">Destination</span>' + destHtml(f.destination) + '</div>'
        + '</div>'
        + '<div class="vo-fcol">'
        + '<div><div class="vo-lab">Prix (€)</div>' + rng('prix', '0', '1 000 000') + '</div>'
        + '<div><div class="vo-lab">Millésime</div>' + rng('mil', '1900', '2100') + '</div>'
        + '<div><div class="vo-lab">Kilométrage</div>' + rng('kms', '0', '1 000 000') + '</div>'
        + '<div><div class="vo-lab">NBJ en stock</div>' + rng('nbj', '0', '1 000') + '</div>'
        + '<div><div class="vo-lab">CO2 (g/km)</div>' + rng('co2', '0', '1 000') + '</div>'
        + '<div><div class="vo-lab">Carrosserie</div><select class="vo-sel" id="f_carrosserie">' + selHtml('CARROSSERIE_EUROTAX', f.carrosserie, S.raw, 'Toutes') + '</select></div>'
        + '<div><div class="vo-lab">Carburant</div><select class="vo-sel" id="f_carburant">' + selHtml('CARBURANT_DMS', f.carburant, S.raw, 'Tous') + '</select></div>'
        + '<div><div class="vo-lab">Boîte de vitesse</div><select class="vo-sel" id="f_boite">' + selHtml('BOITEV_EUROTAX', f.boite, S.raw, 'Toutes') + '</select></div>'
        + '</div>'
        + '</div>'
        + '<div class="vo-modal-foot"><button class="vo-foot-btn" data-reset>Réinitialiser</button><button class="vo-foot-btn primary" data-apply>Appliquer les filtres</button></div>'
        + '</div>';
    }
    function readRanges() {
      ['prix', 'mil', 'kms', 'nbj', 'co2'].forEach(function (id) {
        var mi = bg.querySelector('#' + id + '_min'), ma = bg.querySelector('#' + id + '_max');
        f[id + 'Min'] = mi && mi.value !== '' ? num(mi.value) : null;
        f[id + 'Max'] = ma && ma.value !== '' ? num(ma.value) : null;
      });
    }
    function rerender() { bg.innerHTML = build(); wire(); }
    function wire() {
      bg.querySelector('[data-x]').addEventListener('click', function () { bg.remove(); });
      function onSel(id, key, deps) { var el = bg.querySelector('#' + id); if (!el) return; el.addEventListener('change', function () { readRanges(); f[key] = el.value || null; if (deps) deps(); rerender(); }); }
      onSel('f_reseau', 'reseau', function () { f.site = null; });
      onSel('f_affaire', 'affaire', function () { f.site = null; });
      onSel('f_site', 'site');
      onSel('f_label', 'label'); onSel('f_stockage', 'stockage');
      onSel('f_marque', 'marque', function () { f.modele = null; f.version = null; });
      onSel('f_modele', 'modele', function () { f.version = null; });
      onSel('f_version', 'version');
      onSel('f_carrosserie', 'carrosserie'); onSel('f_carburant', 'carburant'); onSel('f_boite', 'boite');
      bg.querySelectorAll('[data-tri]').forEach(function (el) { el.addEventListener('click', function () { var name = el.getAttribute('data-tri'), v = el.getAttribute('data-val'); f[name] = v === 'all' ? null : (v === 'yes'); readRanges(); rerender(); }); });
      bg.querySelectorAll('[data-dest]').forEach(function (el) { el.addEventListener('click', function () { var v = el.getAttribute('data-dest'); f.destination = v === 'all' ? null : v; readRanges(); rerender(); }); });
      bg.querySelector('[data-reset]').addEventListener('click', function () { for (var k in f) f[k] = null; rerender(); });
      bg.querySelector('[data-apply]').addEventListener('click', function () { readRanges(); S.f = f; S.page = 1; bg.remove(); renderChips(); renderContent(); });
    }
    bg.addEventListener('mousedown', function (e) { if (e.target === bg) bg.remove(); });
    rerender();
    doc.body.appendChild(bg);
  }

  // ─────────────────────────────────────────────────────────── export Excel
  function xlsxCols() {
    var cols = [
      ['N° VO', function (r) { return r.NO_VO; }], ['Immat', function (r) { return r.NO_IMMAT; }], ['VIN', function (r) { return r.VIN; }],
      ['Marque', function (r) { return r.MARQUE_DMS; }], ['Modèle', function (r) { return r.MODELE_DMS; }], ['Désignation', function (r) { return designation(r); }],
      ['Carburant', function (r) { return r.CARBURANT_DMS; }], ['Boîte', function (r) { return r.BOITEV_EUROTAX; }],
      ['PMEC', function (r) { return fmtDateFR(r.D_1MEC); }], ['Kms', function (r) { return num(r.KMS); }], ['Prix', function (r) { return num(r.PVENTE); }]
    ];
    if (S.showPA) cols.push(['PA HT/TTC', function (r) { return num(r.PA_HT_TTC); }]);
    return cols.concat([
      ["Crit'Air", function (r) { return critair(r).label; }], ['CV', function (r) { return r.CV_DMS; }], ['CO2', function (r) { return r.TAUX_CO2; }],
      ['TVA', function (r) { return r.TVA; }], ['Destination', function (r) { return destination(r); }], ['Couleur', function (r) { return r.COULEUR_DMS; }],
      ['Site', function (r) { return r.SITE; }], ['Affaire', function (r) { return r.AFFAIRE; }], ['Réseau', function (r) { return r.RESEAU; }],
      ['NBJ', function (r) { return nbjDays(r); }], ['Garantie', function (r) { return garantieTxt(r); }], ['Stockage', function (r) { return r.LIEU_STOCKAGE_Codifie; }]
    ]);
  }
  function stamp() { var d = new Date(); function p(n) { return ('0' + n).slice(-2); } return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()); }
  function rowsForExcel() {
    var cols = xlsxCols(), rows = selectedRows();
    return rows.map(function (r) { var o = {}; cols.forEach(function (c) { var v = c[1](r); o[c[0]] = v == null ? '' : v; }); return o; });
  }
  function aoaData() {
    var cols = xlsxCols(), rows = selectedRows();
    var aoa = [cols.map(function (c) { return c[0]; })];
    rows.forEach(function (r) { aoa.push(cols.map(function (c) { var v = c[1](r); return v == null ? '' : v; })); });
    return aoa;
  }
  function downloadCSV(aoa) {
    var csv = aoa.map(function (row) { return row.map(function (v) { var s = String(v).replace(/"/g, '""'); return /[";\n]/.test(s) ? '"' + s + '"' : s; }).join(';'); }).join('\r\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = doc.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'export_vo_' + stamp() + '.csv'; doc.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 0);
  }
  async function exportExcel(btn) {
    var rows = rowsForExcel();
    if (!rows.length) return;
    busy(btn, true);
    try {
      var jwt = await getJwt();
      if (!jwt) throw new Error('no-jwt');
      var res = await fetch(FN_XLSX, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt, 'apikey': SUPABASE_KEY },
        body: JSON.stringify({ rows: rows, fileName: 'export_vo_' + stamp() + '.xlsx', sheetName: 'Stock VO', expiresIn: 300 })
      });
      if (!res.ok) { var t = ''; try { t = await res.text(); } catch (e) { } throw new Error('Erreur ' + res.status + (t ? ' : ' + t : '')); }
      var result = await res.json();
      var url = result.url || result.signed_url;
      if (!url) throw new Error(result.error || 'Pas de fichier renvoyé');
      var a = doc.createElement('a'); a.href = url; a.download = 'export_vo_' + stamp() + '.xlsx'; a.target = '_blank'; doc.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 0);
    } catch (err) {
      console.error('[vo] export xlsx', err);
      downloadCSV(aoaData()); // repli local si la fonction est indisponible
    } finally {
      busy(btn, false);
    }
  }

  // ─────────────────────────────────────────────────────────── affiches PDF (Edge Function)
  async function getJwt() {
    // 1) variable du plugin Supabase Auth (chemin qui fonctionne dans l'app et l'éditeur)
    try {
      var pv = wwLib.wwVariable.getValue(AUTH_VAR);
      var u = pv && (pv.user || pv);
      var tok = u && u._session && u._session.access_token;
      if (tok) return tok;
    } catch (e) { }
    // 2) client supabase (v2 puis v1)
    var c = sb(); if (!c || !c.auth) return null;
    try { if (typeof c.auth.getSession === 'function') { var r = await c.auth.getSession(); if (r && r.data && r.data.session) return r.data.session.access_token; } } catch (e) { }
    try { if (typeof c.auth.session === 'function') { var s = c.auth.session(); if (s) return s.access_token; } } catch (e) { }
    return null;
  }
  function busy(btn, on) { if (!btn) return; btn.disabled = on; btn.style.opacity = on ? '.45' : ''; }
  async function generatePosters(btn) {
    var rows = selectedRows();
    if (!rows.length) return;
    if (rows.length > MAX_AFFICHES) { try { alert('Trop de véhicules (' + rows.length + '). Maximum ' + MAX_AFFICHES + '.'); } catch (e) { } return; }
    var jwt = await getJwt();
    if (!jwt) { try { alert('Session expirée, reconnecte-toi.'); } catch (e) { } return; }

    busy(btn, true);
    try {
      var res = await fetch(FN_POSTER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt, 'apikey': SUPABASE_KEY },
        body: JSON.stringify({ template_id: TEMPLATE_VO, vehicules: rows })
      });
      if (!res.ok) {
        var t = ''; try { t = await res.text(); } catch (e) { }
        if (res.status === 401) throw new Error('Session expirée');
        throw new Error('Erreur ' + res.status + (t ? ' : ' + t : ''));
      }
      var result = await res.json();
      if (!result.ok) throw new Error(result.error || 'Erreur de génération');
      var a = doc.createElement('a');
      a.href = result.signed_url;
      a.download = 'affiches_vo_' + (result.nb_vehicules || rows.length) + 'veh.pdf';
      a.target = '_blank';
      doc.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 0);
    } catch (err) {
      console.error('[vo] affiches', err);
      try { alert('Erreur : ' + err.message); } catch (e) { }
    } finally {
      busy(btn, false);
    }
  }

  // ─────────────────────────────────────────────────────────── tooltip custom
  function tipEl() { var t = doc.getElementById('vo-tip'); if (!t) { t = doc.createElement('div'); t.id = 'vo-tip'; t.className = 'vo-tip'; doc.body.appendChild(t); } return t; }
  function positionTip(x, y) { var t = tipEl(); var w = t.offsetWidth || 220; var vw = win.innerWidth || window.innerWidth || 1200; var px = Math.min(x + 14, vw - w - 10); if (px < 8) px = 8; t.style.left = px + 'px'; t.style.top = (y + 16) + 'px'; }
  function showTip(x, y, txt) { var t = tipEl(); t.textContent = txt; t.style.opacity = '1'; positionTip(x, y); }
  function hideTip() { var t = doc.getElementById('vo-tip'); if (t) t.style.opacity = '0'; }

  // ─────────────────────────────────────────────────────────── bindings contenu
  function setSelAllState(host) {
    var selall = host.querySelector('#vo-selall'); if (!selall) return;
    var all = filtered();
    var every = all.length > 0 && all.every(function (r) { return S.sel[r.VIN]; });
    var some = all.some(function (r) { return S.sel[r.VIN]; });
    selall.checked = every; selall.indeterminate = some && !every;
  }
  function updateSelUI(host) {
    host = host || (root() && root().querySelector('#vo-content')); if (!host) return;
    var n = selCount();
    var bar = host.querySelector('#vo-selbar'); if (bar) { bar.style.display = n ? '' : 'none'; var nn = bar.querySelector('#vo-seln'); if (nn) nn.textContent = n; }
    setSelAllState(host);
  }
  function bindContent(host) {
    host.querySelectorAll('[data-act="eye"]').forEach(function (el) { el.addEventListener('click', function (e) { e.stopPropagation(); openFicheVO(el.getAttribute('data-vin')); }); });
    host.querySelectorAll('[data-act="photos"]').forEach(function (el) { el.addEventListener('click', function (e) { e.stopPropagation(); openDiaporama(el.getAttribute('data-vin')); }); });
    host.querySelectorAll('[data-act="globe"]').forEach(function (el) { el.addEventListener('click', function (e) { e.stopPropagation(); openWeb(el.getAttribute('data-url')); }); });
    host.querySelectorAll('th[data-sort]').forEach(function (el) {
      el.addEventListener('click', function () { var k = el.getAttribute('data-sort'); if (S.sortKey === k) S.sortDir = S.sortDir === 'asc' ? 'desc' : 'asc'; else { S.sortKey = k; S.sortDir = 'asc'; } renderContent(); });
    });
    host.querySelectorAll('.vo-pg[data-pg]').forEach(function (el) {
      el.addEventListener('click', function () { var p = Number(el.getAttribute('data-pg')); if (p >= 1) { S.page = p; renderContent(); try { root().scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { } } });
    });
    // sélection
    host.querySelectorAll('.vo-rowchk, .vo-cardchk').forEach(function (el) {
      el.addEventListener('change', function () { toggleSel(el.getAttribute('data-vin'), el.checked); var card = el.closest('.vo-card'); if (card) card.classList.toggle('sel', el.checked); updateSelUI(host); });
    });
    var selall = host.querySelector('#vo-selall');
    if (selall) { setSelAllState(host); selall.addEventListener('change', function () { var all = filtered(); if (selall.checked) all.forEach(function (r) { S.sel[r.VIN] = true; }); else all.forEach(function (r) { delete S.sel[r.VIN]; }); renderContent(); }); }
    // tooltip contremarque lazy
    // tooltip contremarque (chargement lazy, mise à jour fiable)
    host.querySelectorAll('.vo-dot.red').forEach(function (el) {
      var vin = el.getAttribute('data-vin'), cm = el.getAttribute('data-cm');
      el.addEventListener('mouseenter', function (e) {
        el._h = true; el._x = e.clientX; el._y = e.clientY;
        var cached = S.cmCache[vin];
        showTip(e.clientX, e.clientY, cached ? cached.txt : 'Chargement…');
        if (!cached) loadCM(vin, cm).then(function (r) { if (el._h) showTip(el._x, el._y, r.txt); });
      });
      el.addEventListener('mousemove', function (e) { el._x = e.clientX; el._y = e.clientY; positionTip(e.clientX, e.clientY); });
      el.addEventListener('mouseleave', function () { el._h = false; hideTip(); });
    });
    updateSelUI(host);
  }

  // ─────────────────────────────────────────────────────────── shell
  function refreshFilterBadge() {
    var b = root() && root().querySelector('#vo-fbadge'); if (!b) return;
    var n = activeFilterCount();
    if (n > 0) { b.textContent = n; b.style.display = ''; } else b.style.display = 'none';
  }
  function renderShell() {
    var r = root(); if (!r) return;
    r.innerHTML = STYLE
      + '<div class="vo-wrap">'
      + '<div class="vo-head"><div><div class="vo-title">Liste VO</div><div class="vo-sub">Gestion des véhicules d\'occasion</div></div><div class="vo-count">…</div></div>'
      + '<div class="vo-bar">'
      + '<div class="vo-field">' + IC.search + '<input id="vo-search" type="text" placeholder="Désignation / VIN / N° ordre"></div>'
      + '<div class="vo-field vo-immat">' + IC.search + '<input id="vo-immat" type="text" placeholder="Immatriculation"></div>'
      + '<button class="vo-btn" id="vo-filter">' + IC.filter + 'Tous les filtres<span class="vo-fbadge" id="vo-fbadge" style="display:none"></span></button>'
      + '<div class="vo-toggle">Mode photo<div class="vo-switch" id="vo-switch"></div></div>'
      + '</div>'
      + '<div class="vo-chips"></div>'
      + '<div id="vo-content"></div>'
      + '</div>';

    var sIn = r.querySelector('#vo-search'), iIn = r.querySelector('#vo-immat'), deb;
    function onType() { clearTimeout(deb); deb = setTimeout(function () { S.search = sIn.value; S.immat = iIn.value; S.page = 1; renderContent(); }, 220); }
    sIn.addEventListener('input', onType); iIn.addEventListener('input', onType);
    r.querySelector('#vo-filter').addEventListener('click', openFilter);
    var sw = r.querySelector('#vo-switch');
    sw.addEventListener('click', function () { S.view = S.view === 'photo' ? 'table' : 'photo'; sw.classList.toggle('on', S.view === 'photo'); S.page = 1; renderContent(); });
    try { if ((win.innerWidth || window.innerWidth) <= 760) { S.view = 'photo'; sw.classList.add('on'); } } catch (e) { }
    refreshFilterBadge();
    r.setAttribute('data-vo-ver', String(VER));
  }

  // ─────────────────────────────────────────────────────────── init / reload
  async function start() {
    S.loading = true; S.error = null; renderContent();
    try { var role = num(connectedUser().ID_Role); S.showPA = role != null && PA_ROLES.indexOf(role) !== -1; } catch (e) { S.showPA = false; }
    S.raw = await loadAll();
    var d = await resolveDefaults();
    if (d) { if (S.f.reseau == null) S.f.reseau = d.reseau || null; if (S.f.affaire == null) S.f.affaire = d.affaire || null; if (S.f.site == null) S.f.site = d.site || null; }
    S.loading = false;
    renderChips(); renderContent();
    prefetchPhotos(); // précharge les photos de la page visible en arrière-plan
  }
  // Précharge les signed URLs des photos pour la page visible (max 12 VINs, concurrence 3)
  async function prefetchPhotos() {
    var jwt = await getJwt();
    if (!jwt) return;
    var data = filtered();
    var perPage = 12;
    var slice = data.slice((S.page - 1) * perPage, S.page * perPage);
    var vins = slice.map(function (r) { return r.VIN; }).filter(function (v) { return v && !S.photoCache[v]; });
    if (!vins.length) return;
    var BATCH = 3;
    for (var i = 0; i < vins.length; i += BATCH) {
      var batch = vins.slice(i, i + BATCH);
      await Promise.all(batch.map(function (vin) {
        return fetch(FN_PHOTOS, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt, 'apikey': SUPABASE_KEY }, body: JSON.stringify({ vin: vin, expiresIn: 3600 }) })
          .then(function (r) { return r.json(); })
          .then(function (d) { if (d && d.photos) S.photoCache[vin] = d.photos; })
          .catch(function () { });
      }));
    }
  }
  function reloadForSite() { S.f.reseau = null; S.f.affaire = null; S.f.site = null; S.sel = {}; start(); }
  window.__voReload = function () { start(); };
  win.__voPosters = window.__voPosters = function () { generatePosters(doc.getElementById('vo-pdf')); };
  win.__voExcel = window.__voExcel = function () { exportExcel(doc.getElementById('vo-xls')); };
  win.__voClearSel = window.__voClearSel = function () { S.sel = {}; renderContent(); };

  function watchSite() {
    var api = siteApi(); if (!api) return;
    if (api.onChange && !window.__voSiteSub) { window.__voSiteSub = api.onChange(function () { reloadForSite(); }); }
    if (!window.__voSiteEvt) { try { doc.addEventListener('oropra-site-changed', reloadForSite); } catch (e) { } window.__voSiteEvt = true; }
  }
  function boot(tries) {
    tries = tries || 0;
    var r = root(), c = sb();
    if (!r || !c) { if (tries < 120) setTimeout(function () { boot(tries + 1); }, 150); return; }
    if (r.getAttribute('data-vo-ver') === String(VER) && r.querySelector('#vo-content')) return;
    renderShell(); watchSite(); start();
  }
  boot();
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
    // Re-render seulement si on est sur l'onglet photos (pas fiche, pour ne pas interrompre l'affichage)
    if (ficheState.tab === 'photos') renderFichePopup();
    try {
      var data = await callPhotosEF(FN_PHOTOS, { vin: vin, expiresIn: 3600 });
      ficheState.photos = (data && data.photos) ? data.photos : [];
    } catch (e) { console.error('[vo] loadPhotos', e); ficheState.photos = []; }
    ficheState.photosLoading = false;
    // Re-render dans tous les cas pour afficher miniatures (onglet fiche) ou grille (onglet photos)
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
        try { wwLib.wwVariable.updateValue(VAR_DIAPORAMA, { urls: urls, index: idx }); } catch (e) { }
        runWf(WF_DIAPORAMA, { VIN: ficheState.vin });
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

  // ─────────────────────────────────────────────────────────── contremarque (lazy)
  function pick(o, keys) { for (var i = 0; i < keys.length; i++) { var v = o ? o[keys[i]] : null; if (v != null && v !== '') return v; } return null; }
  async function loadCM(vin, idcm) {
    if (S.cmCache[vin]) return S.cmCache[vin];
    var out = { txt: 'Contremarqué' };
    var c = sb(); if (!c) { S.cmCache[vin] = out; return out; }
    try {
      var cm = null;
      if (notEmpty(idcm)) { var r1 = await c.from('CONTRE_MARQUE').select('*').eq('ID_CM', idcm).limit(1); if (r1.error) console.warn('[vo] CM byId', r1.error); cm = r1.data && r1.data[0]; }
      if (!cm && notEmpty(vin)) { var r2 = await c.from('CONTRE_MARQUE').select('*').eq('VIN', vin).order('DATE_CM', { ascending: false }).limit(1); if (r2.error) console.warn('[vo] CM byVin', r2.error); cm = r2.data && r2.data[0]; }
      if (cm) {
        var date = pick(cm, ['DATE_CM', 'date_cm', 'Date_CM']);
        var uid_ = pick(cm, ['ID_USER_CM', 'id_user_cm']);
        var cid_ = pick(cm, ['ID_CLIENT_CM', 'id_client_cm']);
        var who = '', forWho = '';
        if (uid_ != null) { var u = await c.from('USER').select('*').eq('ID_User', uid_).limit(1); if (u.error) console.warn('[vo] USER', u.error); var ur = u.data && u.data[0]; if (ur) who = pick(ur, ['nomComplet', 'NomComplet']) || [pick(ur, ['prenom', 'PRENOM']), pick(ur, ['nom', 'NOM'])].filter(Boolean).join(' '); }
        if (cid_ != null) { var cl = await c.from('CLIENT').select('*').eq('IDVu', cid_).limit(1); if (cl.error) console.warn('[vo] CLIENT', cl.error); var cr = cl.data && cl.data[0]; if (cr) forWho = pick(cr, ['nom_complet', 'nomComplet']) || [pick(cr, ['CIVILITE', 'Civilite']), pick(cr, ['PRENOM', 'Prenom']), pick(cr, ['NOM', 'Nom'])].filter(Boolean).join(' ') || pick(cr, ['nom']); }
        out.txt = 'Contremarqué' + (date ? ' le ' + fmtDateFR(date) : '') + (who ? ' par ' + who : '') + (forWho ? ' pour ' + forWho : '');
      } else {
        console.warn('[vo] contremarque introuvable', { vin: vin, idcm: idcm });
      }
    } catch (e) { console.warn('[vo] loadCM', e); }
    S.cmCache[vin] = out;
    return out;
  }

  // ─────────────────────────────────────────────────────────── chargement données
  async function loadAll() {
    var c = sb(); if (!c) return [];
    var all = [], from = 0, size = 1000;
    while (true) {
      var res = await c.from('v_liste_vo').select(COLS).range(from, from + size - 1);
      if (res.error) { S.error = res.error.message || String(res.error); break; }
      var batch = res.data || [];
      all = all.concat(batch);
      if (batch.length < size) break;
      from += size;
      if (from > 20000) break;
    }
    return all;
  }
  // RESEAU / AFFAIRE / SITE du site sélectionné via la table SITE (référentiel).
  async function resolveDefaults() {
    var api = siteApi();
    var id = api && api.getSiteId && api.getSiteId();
    if (id != null) {
      try { var c = sb(); if (c) { var r = await c.from('SITE').select('SITE,AFFAIRE,RESEAU').eq('ID_SITE', id).limit(1); var s = r.data && r.data[0]; if (s) return { reseau: s.RESEAU, affaire: s.AFFAIRE, site: s.SITE }; } } catch (e) { }
    }
    // fallback : nom du site (oropraSite) -> 1ère ligne du stock
    var sites = (api && api.getSites && api.getSites()) || [];
    var so = sites.find(function (x) { return String(x.id_site) === String(id); }) || {};
    var name = so.site || so.SITE || null;
    if (name) { var hit = S.raw.find(function (r) { return r.SITE === name; }); if (hit) return { reseau: hit.RESEAU, affaire: hit.AFFAIRE, site: hit.SITE }; }
    return {};
  }

  // ─────────────────────────────────────────────────────────── filtrage / tri
  function passFilters(r) {
    var f = S.f;
    if (f.reseau && r.RESEAU !== f.reseau) return false;
    if (f.affaire && r.AFFAIRE !== f.affaire) return false;
    if (f.site && r.SITE !== f.site) return false;
    if (f.societe && r.SOCIETE !== f.societe) return false;
    if (f.pointVente && r.POINT_VENTE !== f.pointVente) return false;
    if (f.marque && r.MARQUE_DMS !== f.marque) return false;
    if (f.modele && r.MODELE_DMS !== f.modele) return false;
    if (f.version && r.VERSION_EUROTAX !== f.version) return false;
    if (f.label && r.LABEL_Codifie !== f.label) return false;
    if (f.stockage && r.LIEU_STOCKAGE_Codifie !== f.stockage) return false;
    if (f.carrosserie && r.CARROSSERIE_EUROTAX !== f.carrosserie) return false;
    if (f.carburant && r.CARBURANT_DMS !== f.carburant) return false;
    if (f.boite && r.BOITEV_EUROTAX !== f.boite) return false;

    if (f.photos != null && hasPhoto(r) !== f.photos) return false;
    if (f.contremarque != null && contremarque(r) !== f.contremarque) return false;
    if (f.eurotax != null && (String(r.NATCODE_SELECTED) === 'true') !== f.eurotax) return false;
    if (f.infomediaire != null && notEmpty(r.INFOMEDIAIRE_Codifie) !== f.infomediaire) return false;
    if (f.tvaRecup != null && (String(r.CODETVA) === '1') !== f.tvaRecup) return false;
    if (f.pretVente != null && (r.PRET_A_LA_VENTE === 'O') !== f.pretVente) return false;
    if (f.destination && destination(r) !== f.destination) return false;

    var p = num(r.PVENTE); if (f.prixMin != null && (p == null || p < f.prixMin)) return false; if (f.prixMax != null && (p == null || p > f.prixMax)) return false;
    var mil = num(r.MIL); if (f.milMin != null && (mil == null || mil < f.milMin)) return false; if (f.milMax != null && (mil == null || mil > f.milMax)) return false;
    var km = num(r.KMS); if (f.kmsMin != null && (km == null || km < f.kmsMin)) return false; if (f.kmsMax != null && (km == null || km > f.kmsMax)) return false;
    var co2 = num(r.TAUX_CO2); if (f.co2Min != null && (co2 == null || co2 < f.co2Min)) return false; if (f.co2Max != null && (co2 == null || co2 > f.co2Max)) return false;
    if (f.nbjMin != null || f.nbjMax != null) { var nb = nbjDays(r); if (f.nbjMin != null && (nb == null || nb < f.nbjMin)) return false; if (f.nbjMax != null && (nb == null || nb > f.nbjMax)) return false; }

    if (notEmpty(S.search)) { var q = S.search.toLowerCase(); var hay = [r.NO_VO, r.VIN, designation(r), r.MARQUE_DMS, r.MODELE_DMS, r.DESIGNATION_DMS].join(' ').toLowerCase(); if (hay.indexOf(q) === -1) return false; }
    if (notEmpty(S.immat)) { var qi = S.immat.toLowerCase().replace(/[\s-]/g, ''); var im = String(r.NO_IMMAT || '').toLowerCase().replace(/[\s-]/g, ''); if (im.indexOf(qi) === -1) return false; }
    return true;
  }
  function sortVal(r, key) {
    switch (key) {
      case 'NBJ': return nbjDays(r) == null ? -1 : nbjDays(r);
      case 'PVENTE': return num(r.PVENTE) == null ? -1 : num(r.PVENTE);
      case 'PA_HT_TTC': return num(r.PA_HT_TTC) == null ? -1 : num(r.PA_HT_TTC);
      case 'KMS': return num(r.KMS) == null ? -1 : num(r.KMS);
      case 'CV_DMS': return num(r.CV_DMS) == null ? -1 : num(r.CV_DMS);
      case 'TAUX_CO2': return num(r.TAUX_CO2) == null ? -1 : num(r.TAUX_CO2);
      case 'D_1MEC': return String(r.D_1MEC || '');
      case 'CRITAIR': return critairNum(r);
      case 'DESIGN': return designation(r).toLowerCase();
      case 'GAR': return num(r.CODE_GARANTIE) == null ? -1 : num(r.CODE_GARANTIE);
      default: return String(r[key] || '').toLowerCase();
    }
  }
  function filtered() {
    var arr = S.raw.filter(passFilters);
    var k = S.sortKey, dir = S.sortDir === 'asc' ? 1 : -1;
    arr.sort(function (a, b) { var va = sortVal(a, k), vb = sortVal(b, k); if (va < vb) return -1 * dir; if (va > vb) return 1 * dir; return 0; });
    return arr;
  }
  function distinct(field, base) { var set = {}; (base || S.raw).forEach(function (r) { if (notEmpty(r[field])) set[r[field]] = 1; }); return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'fr'); }); }
  function activeFilterCount() { var f = S.f, n = 0; for (var k in f) if (f[k] != null) n++; return n; }

  // ─────────────────────────────────────────────────────────── sélection
  function selVins() { return Object.keys(S.sel).filter(function (v) { return S.sel[v]; }); }
  function selCount() { return selVins().length; }
  function selectedRows() { return S.raw.filter(function (r) { return S.sel[r.VIN]; }); }
  function toggleSel(vin, on) { if (on) S.sel[vin] = true; else delete S.sel[vin]; }

  // ─────────────────────────────────────────────────────────── icônes
  var IC = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    rss: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/></svg>',
    photos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13"/><path d="M3 13h18v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><circle cx="7.5" cy="15.5" r="1"/><circle cx="16.5" cy="15.5" r="1"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="18" x2="13" y2="18"/></svg>',
    xls: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>'
  };
  var LOGO = {
    pdf: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#E94335" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path fill="#B53024" d="M14 2v6h6z"/><path fill="#fff" d="M8 13h1.5a1.5 1.5 0 0 0 0-3H7v5h1v-2zm0-2h1.5a.5.5 0 0 1 0 1H8zm4 4V10h1.5a2.5 2.5 0 0 1 0 5zm1-1h.5a1.5 1.5 0 0 0 0-3H12zm4-4h2v1h-2v1h1.5v1H17v2h-1v-5z"/></svg>',
    xls: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="3" fill="#107C41"/><path fill="#fff" d="M7 8l2.5 4L7 16h1.8l1.7-2.8L12.2 16H14l-2.5-4L14 8h-1.8l-1.7 2.8L8.8 8z"/><path fill="#fff" d="M15 8h1.2v6.8H19V16h-4z"/></svg>'
  };

  // ─────────────────────────────────────────────────────────── CSS
  var STYLE = '<style id="vo-css">'
    + '#stockvo-root{font-family:"Nunito Sans",system-ui,sans-serif;color:#1F4A85;width:100%}'
    + '#stockvo-root *{box-sizing:border-box}'
    + '.vo-wrap{padding:4px 2px 40px}'
    + '.vo-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:4px 4px 16px}'
    + '.vo-title{font-size:26px;font-weight:800;letter-spacing:-.5px;line-height:1.1}'
    + '.vo-sub{font-size:13px;color:#7a98c5;margin-top:2px}'
    + '.vo-count{font-size:13px;font-weight:700;color:#2a5ea9;background:#eef4fc;padding:6px 12px;border-radius:20px;white-space:nowrap}'
    + '.vo-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#fff;border:1px solid #e8eef7;border-radius:16px;padding:12px;box-shadow:0 6px 20px rgba(31,74,133,.05)}'
    + '.vo-field{position:relative;flex:1 1 240px;min-width:170px}'
    + '.vo-field svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:#9bb3d1;pointer-events:none}'
    + '.vo-field input{width:100%;border:1.5px solid #e2eaf5;border-radius:11px;padding:11px 12px 11px 38px;font:inherit;font-size:14px;color:#1F4A85;outline:none;transition:border .15s}'
    + '.vo-field input:focus{border-color:#53bda7}.vo-field input::placeholder{color:#9bb3d1}'
    + '.vo-immat{flex:0 1 170px}'
    + '.vo-btn{display:inline-flex;align-items:center;gap:7px;border:1.5px solid #d6e2f2;background:#fff;color:#2a5ea9;font:inherit;font-size:14px;font-weight:700;padding:10px 16px;border-radius:11px;cursor:pointer;transition:all .15s;white-space:nowrap}'
    + '.vo-btn:hover{border-color:#53bda7;color:#1F4A85}.vo-btn svg{width:16px;height:16px}'
    + '.vo-btn.primary{border:none;background:#2a5ea9;color:#fff}.vo-btn.primary:hover{background:#1F4A85;color:#fff}'
    + '.vo-btn.ghost{border:none;background:transparent;color:#7a98c5}.vo-btn.ghost:hover{color:#e24b4a}'
    + '.vo-btn .vo-fbadge{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#53bda7;color:#fff;font-size:10px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}'
    + '.vo-toggle{display:flex;align-items:center;gap:9px;margin-left:auto;font-size:13px;font-weight:700;color:#7a98c5}'
    + '.vo-switch{position:relative;width:46px;height:26px;border-radius:14px;background:#d8e2f0;cursor:pointer;transition:background .2s;flex:0 0 auto}'
    + '.vo-switch.on{background:#53bda7}.vo-switch::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:left .2s}.vo-switch.on::after{left:23px}'
    + '.vo-chips{display:flex;flex-wrap:wrap;gap:8px;margin:14px 4px 4px;min-height:2px}'
    + '.vo-chip{display:inline-flex;align-items:center;gap:7px;background:#fff;border:1.5px solid #e2eaf5;color:#2a5ea9;font-size:12.5px;font-weight:700;padding:6px 8px 6px 12px;border-radius:20px}'
    + '.vo-chip b{font-weight:800}'
    + '.vo-chip .vo-cx{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#f0f4fa;color:#7a98c5;cursor:pointer;transition:all .15s}'
    + '.vo-chip .vo-cx:hover{background:#e24b4a;color:#fff}.vo-chip .vo-cx svg{width:9px;height:9px}'
    + '.vo-chip-clear{cursor:pointer;color:#9bb3d1;font-size:12px;font-weight:700;text-decoration:underline;padding:6px 4px}'
    + '.vo-state{padding:60px 20px;text-align:center;color:#9bb3d1;font-size:15px;font-weight:600}'
    + '.vo-spin{width:30px;height:30px;border:3px solid #e2eaf5;border-top-color:#53bda7;border-radius:50%;animation:vospin .8s linear infinite;margin:0 auto 14px}@keyframes vospin{to{transform:rotate(360deg)}}'
    + '.vo-chk{width:16px;height:16px;cursor:pointer;accent-color:#2a5ea9;flex:0 0 auto}'
    // barre de sélection
    + '.vo-selbar{display:flex;align-items:center;gap:14px;background:#eef4fc;border:1px solid #cfe0f5;border-radius:14px;padding:10px 16px;margin:16px 0 0}'
    + '.vo-selbar-n{font-size:14px;font-weight:700;color:#2a5ea9}.vo-selbar-n b{font-weight:800}'
    + '.vo-selbar-acts{display:flex;align-items:center;gap:10px;margin-left:auto;flex-wrap:wrap}'
    + '.vo-logo{background:none;border:none;padding:3px;cursor:pointer;line-height:0;border-radius:10px;position:relative;z-index:1;transition:transform .12s,background .12s}'
    + '.vo-logo:hover{background:#fff;transform:translateY(-1px);box-shadow:0 4px 12px rgba(31,74,133,.15)}'
    + '.vo-logo svg{width:34px;height:34px;display:block;pointer-events:none}.vo-logo:disabled{opacity:.45;cursor:default;transform:none;box-shadow:none}'
    + '.vo-tip{position:fixed;z-index:2000;max-width:280px;background:#1F4A85;color:#fff;font-size:12px;font-weight:600;line-height:1.45;padding:8px 11px;border-radius:9px;box-shadow:0 8px 24px rgba(31,74,133,.3);pointer-events:none;opacity:0;transition:opacity .12s}'
    // pager
    + '.vo-pager{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}'
    + '.vo-pager.top{margin:16px 2px 0}'
    + '.vo-pg{min-width:36px;height:36px;padding:0 10px;border:1.5px solid #e2eaf5;background:#fff;color:#2a5ea9;font:inherit;font-size:13px;font-weight:700;border-radius:10px;cursor:pointer;transition:all .15s}'
    + '.vo-pg:hover{border-color:#53bda7}.vo-pg.on{background:#2a5ea9;color:#fff;border-color:#2a5ea9}.vo-pg:disabled{opacity:.4;cursor:default}.vo-pg-dots{color:#9bb3d1;padding:0 4px}'
    // tableau
    + '.vo-tablewrap{margin-top:12px;background:#fff;border:1px solid #e8eef7;border-radius:16px;overflow:auto;box-shadow:0 6px 20px rgba(31,74,133,.05)}'
    + '.vo-table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;min-width:1400px}'
    + '.vo-table th{position:sticky;top:0;background:#f7faff;color:#7a98c5;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;text-align:left;padding:13px 12px;border-bottom:1px solid #e8eef7;white-space:nowrap;z-index:2}'
    + '.vo-table th.vo-sortable{cursor:pointer;user-select:none}.vo-table th.vo-sortable:hover{color:#2a5ea9}'
    + '.vo-table th .vo-arrow{opacity:.6;font-size:9px;margin-left:3px}'
    + '.vo-table td{padding:9px 12px;border-bottom:1px solid #f1f5fb;white-space:nowrap;vertical-align:middle;background:#fff}'
    + '.vo-table tbody tr:last-child td{border-bottom:none}'
    + '.vo-table tbody tr:hover td{background:#fafcff}'
    + '.vo-infos{display:flex;align-items:center;gap:5px}'
    + '.vo-iact{display:inline-flex;align-items:center;justify-content:center;width:27px;height:27px;border-radius:8px;cursor:pointer;color:#7a98c5;transition:all .15s;flex:0 0 auto}'
    + '.vo-iact svg{width:15px;height:15px}'
    + '.vo-iact.eye{color:#53bda7}.vo-iact.eye:hover{background:#e7f6f1}'
    + '.vo-iact.globe:hover{background:#eef4fc;color:#2a5ea9}.vo-iact.photos:hover{background:#eef4fc;color:#2a5ea9}'
    + '.vo-iact.rss{color:#cdd9ea;cursor:default}.vo-iact.disabled{opacity:.3;cursor:default}'
    + '.vo-thumb-wrap{display:inline-flex;flex:0 0 auto}'
    + '.vo-thumb{width:46px;height:32px;border-radius:6px;object-fit:cover;background:#eef2f8}'
    + '.vo-thumb-ph{width:46px;height:32px;border-radius:6px;background:#eef2f8;display:flex;align-items:center;justify-content:center;color:#c0cee0}.vo-thumb-ph svg{width:20px;height:20px}'
    + '.vo-dot{width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;position:relative;cursor:default}'
    + '.vo-dot.green{background:#e7f6f1}.vo-dot.green::after{content:"";width:9px;height:9px;border-radius:50%;background:#2bb673}'
    + '.vo-dot.red{background:#fcebeb;cursor:default}.vo-dot.red::after{content:"";width:9px;height:9px;border-radius:50%;background:#e24b4a}'
    + '.vo-novo{font-weight:800;color:#1F4A85}.vo-link{color:#2a5ea9;font-weight:600}'
    + '.vo-pa{color:#9a6b00;font-weight:700}'
    + '.vo-ca{display:inline-flex;align-items:center;gap:5px;font-weight:800;font-size:12px}.vo-ca i{width:9px;height:9px;border-radius:50%;display:inline-block}'
    // cartes
    + '.vo-grid{margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}'
    + '.vo-card{background:#fff;border:1px solid #e8eef7;border-radius:16px;overflow:hidden;box-shadow:0 6px 20px rgba(31,74,133,.05);transition:transform .15s,box-shadow .15s;display:flex;flex-direction:column}'
    + '.vo-card:hover{transform:translateY(-2px);box-shadow:0 14px 30px rgba(31,74,133,.12)}'
    + '.vo-card.sel{outline:2px solid #2a5ea9;outline-offset:-2px}'
    + '.vo-card-img{position:relative;width:100%;aspect-ratio:16/10;background:#eef2f8;overflow:hidden}'
    + '.vo-card-img img{width:100%;height:100%;object-fit:cover;display:block}'
    + '.vo-card-img .vo-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#c0cee0}.vo-card-img .vo-ph svg{width:56px;height:56px}'
    + '.vo-card-acts{position:absolute;top:10px;left:10px;right:10px;display:flex;align-items:center;justify-content:space-between}'
    + '.vo-card-acts .vo-grp{display:flex;align-items:center;gap:6px}'
    + '.vo-card-acts .vo-iact{background:rgba(255,255,255,.92);backdrop-filter:blur(4px);box-shadow:0 2px 6px rgba(0,0,0,.12)}'
    + '.vo-cardchk{width:18px;height:18px;accent-color:#2a5ea9;cursor:pointer;background:#fff;border-radius:4px}'
    + '.vo-card-ca{position:absolute;left:10px;bottom:10px;background:rgba(255,255,255,.94);backdrop-filter:blur(4px);padding:4px 9px;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,.1)}'
    + '.vo-card-body{padding:13px 15px 15px;display:flex;flex-direction:column;gap:9px;flex:1}'
    + '.vo-card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}'
    + '.vo-card-name{font-size:15px;font-weight:800;line-height:1.2}.vo-card-name .vo-vers{display:block;font-size:12px;font-weight:600;color:#7a98c5;margin-top:1px}'
    + '.vo-card-price{font-size:17px;font-weight:800;color:#53bda7;white-space:nowrap}'
    + '.vo-card-pa{font-size:11.5px;color:#9a6b00;font-weight:700;margin-top:1px}'
    + '.vo-card-site{font-size:12px;color:#2a5ea9;font-weight:700}'
    + '.vo-card-meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:12px;color:#54678a;border-top:1px solid #f1f5fb;padding-top:9px}.vo-card-meta b{color:#1F4A85;font-weight:700}'
    + '.vo-card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto}.vo-card-foot .vo-meta-s{font-size:11.5px;color:#9bb3d1;font-weight:700}'
    // modal filtre
    + '.vo-modal-bg{position:fixed;inset:0;background:rgba(31,74,133,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px}'
    + '.vo-modal{background:#f7faff;border-radius:20px;width:1080px;max-width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 70px rgba(31,74,133,.35)}'
    + '.vo-modal-head{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;background:#fff;border-bottom:1px solid #e8eef7}.vo-modal-head h3{font-size:18px;font-weight:800;margin:0}'
    + '.vo-modal-x{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;cursor:pointer;color:#7a98c5;transition:all .15s}.vo-modal-x:hover{background:#f0f4fa;color:#e24b4a}.vo-modal-x svg{width:18px;height:18px}'
    + '.vo-modal-body{padding:18px 22px;overflow-y:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:start}'
    + '.vo-fcol{display:flex;flex-direction:column;gap:12px}'
    + '.vo-fsec{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#fff;padding:9px 12px;border-radius:10px;text-align:center}.vo-fsec.b{background:#2a5ea9}.vo-fsec.g{background:#53bda7}.vo-fsec.o{background:#fac055;color:#5a3d05}'
    + '.vo-lab{font-size:11px;font-weight:700;color:#7a98c5;margin:2px 2px -4px}'
    + '.vo-sel{width:100%;border:1.5px solid #e2eaf5;border-radius:10px;padding:9px 11px;font:inherit;font-size:13px;color:#1F4A85;background:#fff;outline:none;cursor:pointer}.vo-sel:focus{border-color:#53bda7}'
    + '.vo-tri{display:flex;align-items:center;justify-content:space-between;gap:8px;background:#fff;border:1.5px solid #e2eaf5;border-radius:10px;padding:8px 11px}'
    + '.vo-tri-lab{font-size:12.5px;font-weight:700;color:#54678a}.vo-tri-opts{display:flex;gap:3px}'
    + '.vo-tri-opt{font-size:11.5px;font-weight:700;color:#7a98c5;padding:4px 9px;border-radius:7px;cursor:pointer;transition:all .12s}.vo-tri-opt.on{background:#2a5ea9;color:#fff}'
    + '.vo-range{display:flex;align-items:center;gap:7px}.vo-range input{width:100%;border:1.5px solid #e2eaf5;border-radius:9px;padding:8px 10px;font:inherit;font-size:12.5px;color:#1F4A85;outline:none}.vo-range input:focus{border-color:#53bda7}.vo-range span{font-size:11px;color:#9bb3d1;font-weight:700}'
    + '.vo-modal-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 22px;background:#fff;border-top:1px solid #e8eef7}'
    + '.vo-foot-btn{flex:1;padding:12px;border-radius:12px;font:inherit;font-size:14px;font-weight:800;cursor:pointer;border:1.5px solid #d6e2f2;background:#fff;color:#2a5ea9;transition:all .15s}.vo-foot-btn:hover{border-color:#53bda7}.vo-foot-btn.primary{border:none;background:#2a5ea9;color:#fff}.vo-foot-btn.primary:hover{background:#1F4A85}'
    // responsive
    + '@media(max-width:900px){.vo-modal-body{grid-template-columns:1fr}}'
    + '@media(max-width:760px){.vo-head{flex-direction:column;align-items:flex-start;gap:6px}.vo-title{font-size:22px}.vo-toggle{margin-left:0}.vo-grid{grid-template-columns:1fr;gap:14px}.vo-modal{border-radius:0;max-height:100vh;height:100vh;width:100vw}.vo-modal-bg{padding:0}.vo-selbar{flex-wrap:wrap}.vo-selbar-acts{margin-left:0;width:100%}}'
    + '@media(max-width:520px){.vo-card-meta{grid-template-columns:1fr 1fr}.vo-field{flex:1 1 100%}.vo-immat{flex:1 1 100%}}'
    + '</style>';

  // ─────────────────────────────────────────────────────────── colonnes tableau
  function columns() {
    var cols = [
      { k: '__chk', t: '', w: 40, kind: 'chk' },
      { k: '__infos', t: 'Infos', w: 222, kind: 'infos' },
      { k: 'NO_VO', t: 'VO', w: 112, sort: true },
      { k: 'NO_IMMAT', t: 'Immat', w: 100, sort: true },
      { k: 'VIN', t: 'VIN', w: 150, sort: true },
      { k: 'NBJ', t: 'NBJ', sort: true }, { k: 'MARQUE_DMS', t: 'Marque', sort: true }, { k: 'MODELE_DMS', t: 'Modèle', sort: true },
      { k: 'DESIGN', t: 'Désignation', sort: true }, { k: 'PVENTE', t: 'Prix', sort: true }
    ];
    if (S.showPA) cols.push({ k: 'PA_HT_TTC', t: 'PA HT/TTC', sort: true });
    cols = cols.concat([
      { k: 'KMS', t: 'Kms', sort: true }, { k: 'D_1MEC', t: 'PMEC', sort: true }, { k: 'GAR', t: 'Garantie', sort: true },
      { k: 'CRITAIR', t: "Crit'Air", sort: true }, { k: 'CV_DIN', t: 'CV', sort: true }, { k: 'TAUX_CO2', t: 'CO2', sort: true },
      { k: 'TVA', t: 'TVA', sort: true }, { k: 'COULEUR_DMS', t: 'Couleur', sort: true }, { k: 'SITE', t: 'Site', sort: true },
      { k: 'LABEL_Codifie', t: 'Label', sort: true }, { k: 'ORIGINEACHAT_Codifie', t: 'Origine', sort: true },
      { k: 'LIEU_STOCKAGE_Codifie', t: 'Stockage', sort: true }, { k: 'DETAIL_STOCKAGE_Codifie', t: 'Détail st.', sort: true }
    ]);
    return cols;
  }
  function frzAttr(c) { return c.w ? ' style="min-width:' + c.w + 'px;width:' + c.w + 'px"' : ''; }

  // ─────────────────────────────────────────────────────────── cellules
  function infosHtml(r) {
    var hasUrl = notEmpty(r.URL360), cm = contremarque(r), img = mainImage(r);
    var thumb = img
      ? '<span class="vo-thumb-wrap"><img class="vo-thumb" src="' + esc(img) + '" loading="lazy" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'"><span class="vo-thumb-ph" style="display:none">' + IC.car + '</span></span>'
      : '<span class="vo-thumb-ph">' + IC.car + '</span>';
    return '<div class="vo-infos">'
      + '<span class="vo-iact eye" data-act="eye" data-vin="' + esc(r.VIN) + '" title="Fiche VO">' + IC.eye + '</span>'
      + '<span class="vo-iact rss" title="Diffusion (à venir)">' + IC.rss + '</span>'
      + '<span class="vo-iact globe' + (hasUrl ? '' : ' disabled') + '" ' + (hasUrl ? 'data-act="globe" data-url="' + esc(r.URL360) + '"' : '') + ' title="Annonce web">' + IC.globe + '</span>'
      + '<span class="vo-iact photos" data-act="photos" data-vin="' + esc(r.VIN) + '" title="Diaporama">' + IC.photos + '</span>'
      + thumb
      + '<span class="vo-dot ' + (cm ? 'red' : 'green') + '" data-vin="' + esc(r.VIN) + '" data-cm="' + esc(r.ID_CM || '') + '"' + (cm ? '' : ' title="Disponible à la vente"') + '></span>'
      + '</div>';
  }
  function cellInner(r, key) {
    var ca;
    switch (key) {
      case 'NO_VO': return '<span class="vo-novo">' + esc(r.NO_VO || '-') + '</span>';
      case 'NO_IMMAT': return esc(r.NO_IMMAT || '-');
      case 'VIN': return '<span style="color:#9bb3d1;font-size:12px">' + esc(r.VIN || '-') + '</span>';
      case 'NBJ': var nb = nbjDays(r); return nb == null ? '-' : '<span title="Entré le ' + esc(fmtDateFR(r.D_ACHAT)) + '">' + nb + '</span>';
      case 'MARQUE_DMS': return esc(r.MARQUE_DMS || '-');
      case 'MODELE_DMS': return esc(r.MODELE_DMS || '-');
      case 'DESIGN': return esc(designation(r));
      case 'PVENTE': return '<b>' + esc(priceTxt(r)) + '</b>';
      case 'PA_HT_TTC': return '<span class="vo-pa">' + esc(eur(r.PA_HT_TTC)) + '</span>';
      case 'KMS': return '<span class="vo-link">' + (num(r.KMS) == null ? '-' : num(r.KMS).toLocaleString('fr-FR')) + '</span>';
      case 'D_1MEC': return esc(fmtDateFR(r.D_1MEC));
      case 'GAR': return esc(garantieTxt(r));
      case 'CRITAIR': ca = critair(r); return '<span class="vo-ca"><i style="background:' + ca.color + '"></i>' + (ca.n === 99 ? 'NC' : ca.n) + '</span>';
      case 'CV_DMS': return esc(r.CV_DMS || '-');
      case 'TAUX_CO2': return esc(r.TAUX_CO2 || '-');
      case 'TVA': return esc(r.TVA || '-');
      case 'COULEUR_DMS': return esc(r.COULEUR_DMS || '-');
      case 'SITE': return '<span class="vo-link">' + esc(r.SITE || '-') + '</span>';
      case 'LABEL_Codifie': return '<span class="vo-link">' + esc(r.LABEL_Codifie || '-') + '</span>';
      case 'ORIGINEACHAT_Codifie': return '<span class="vo-link">' + esc(r.ORIGINEACHAT_Codifie || '-') + '</span>';
      case 'LIEU_STOCKAGE_Codifie': return '<span class="vo-link">' + esc(r.LIEU_STOCKAGE_Codifie || '-') + '</span>';
      case 'DETAIL_STOCKAGE_Codifie': return '<span class="vo-link">' + esc(r.DETAIL_STOCKAGE_Codifie || '-') + '</span>';
      default: return '-';
    }
  }
  function thHtml(cols) {
    return cols.map(function (c) {
      if (c.kind === 'chk') return '<th' + frzAttr(c) + '><input type="checkbox" class="vo-chk" id="vo-selall"></th>';
      var cl = c.sort ? 'vo-sortable' : '';
      var ar = (c.sort && S.sortKey === c.k) ? '<span class="vo-arrow">' + (S.sortDir === 'asc' ? '▲' : '▼') + '</span>' : '';
      return '<th' + (cl ? ' class="' + cl + '"' : '') + frzAttr(c) + (c.sort ? ' data-sort="' + c.k + '"' : '') + '>' + esc(c.t) + ar + '</th>';
    }).join('');
  }
  function rowHtml(r, cols) {
    var tds = cols.map(function (c) {
      var inner;
      if (c.kind === 'chk') inner = '<input type="checkbox" class="vo-chk vo-rowchk" data-vin="' + esc(r.VIN) + '"' + (S.sel[r.VIN] ? ' checked' : '') + '>';
      else if (c.kind === 'infos') inner = infosHtml(r);
      else inner = cellInner(r, c.k);
      return '<td' + frzAttr(c) + '>' + inner + '</td>';
    }).join('');
    return '<tr>' + tds + '</tr>';
  }

  // ─────────────────────────────────────────────────────────── carte
  function cardHtml(r) {
    var img = mainImage(r), ca = critair(r), cm = contremarque(r), hasUrl = notEmpty(r.URL360), sel = !!S.sel[r.VIN];
    var imgPart = img
      ? '<img src="' + esc(img) + '" alt="" loading="lazy" onerror="this.style.display=\'none\';this.parentNode.querySelector(\'.vo-ph\')&&(this.parentNode.querySelector(\'.vo-ph\').style.display=\'flex\')"><div class="vo-ph" style="display:none">' + IC.car + '</div>'
      : '<div class="vo-ph">' + IC.car + '</div>';
    return '<div class="vo-card' + (sel ? ' sel' : '') + '">'
      + '<div class="vo-card-img">' + imgPart
      + '<div class="vo-card-acts">'
      + '<div class="vo-grp">'
      + '<input type="checkbox" class="vo-cardchk" data-vin="' + esc(r.VIN) + '"' + (sel ? ' checked' : '') + ' title="Sélectionner">'
      + '<span class="vo-iact eye" data-act="eye" data-vin="' + esc(r.VIN) + '" title="Fiche VO">' + IC.eye + '</span>'
      + '<span class="vo-dot ' + (cm ? 'red' : 'green') + '" data-vin="' + esc(r.VIN) + '" data-cm="' + esc(r.ID_CM || '') + '"' + (cm ? '' : ' title="Disponible à la vente"') + '></span>'
      + '</div>'
      + '<div class="vo-grp">'
      + '<span class="vo-iact rss" title="Diffusion (à venir)">' + IC.rss + '</span>'
      + '<span class="vo-iact globe' + (hasUrl ? '' : ' disabled') + '" ' + (hasUrl ? 'data-act="globe" data-url="' + esc(r.URL360) + '"' : '') + ' title="Annonce web">' + IC.globe + '</span>'
      + '<span class="vo-iact photos" data-act="photos" data-vin="' + esc(r.VIN) + '" title="Diaporama">' + IC.photos + '</span>'
      + '</div>'
      + '</div>'
      + '<div class="vo-card-ca"><span class="vo-ca"><i style="background:' + ca.color + '"></i>' + esc(ca.label) + '</span></div>'
      + '</div>'
      + '<div class="vo-card-body">'
      + '<div class="vo-card-top"><div><div class="vo-card-name">' + esc((r.MARQUE_DMS || '') + ' ' + (r.MODELE_DMS || '')) + '<span class="vo-vers">' + esc(designation(r)) + '</span></div></div>'
      + '<div style="text-align:right"><div class="vo-card-price">' + esc(priceTxt(r)) + '</div>' + (S.showPA ? '<div class="vo-card-pa">PA ' + esc(eur(r.PA_HT_TTC)) + '</div>' : '') + '</div></div>'
      + '<div class="vo-card-site">' + esc(r.SITE || '-') + '</div>'
      + '<div class="vo-card-meta">'
      + '<div>N° <b>' + esc(r.NO_VO || '-') + '</b></div><div style="text-align:right">' + esc(r.NO_IMMAT || '-') + '</div>'
      + '<div><b>' + esc(kmTxt(r)) + '</b></div><div style="text-align:right">' + esc(r.BOITEV_EUROTAX || '-') + '</div>'
      + '<div>' + esc(fmtDateFR(r.D_1MEC)) + '</div><div style="text-align:right">' + esc(r.CARBURANT_DMS || '-') + '</div>'
      + '</div>'
      + '<div class="vo-card-foot"><span class="vo-meta-s">' + (nbjDays(r) == null ? '-' : nbjDays(r) + ' jrs en stock') + '</span><span class="vo-meta-s">' + esc(garantieTxt(r)) + '</span></div>'
      + '</div>'
      + '</div>';
  }

  // ─────────────────────────────────────────────────────────── pager / selbar
  function pagerHtml(total, page, perPage, cls) {
    var pages = Math.max(1, Math.ceil(total / perPage));
    if (pages <= 1) return '';
    var out = '<button class="vo-pg" data-pg="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>‹</button>';
    var list = [];
    for (var i = 1; i <= pages; i++) { if (i === 1 || i === pages || Math.abs(i - page) <= 1) list.push(i); else if (list[list.length - 1] !== '…') list.push('…'); }
    list.forEach(function (i) { out += i === '…' ? '<span class="vo-pg-dots">…</span>' : '<button class="vo-pg' + (i === page ? ' on' : '') + '" data-pg="' + i + '">' + i + '</button>'; });
    out += '<button class="vo-pg" data-pg="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + '>›</button>';
    return '<div class="vo-pager ' + (cls || '') + '">' + out + '</div>';
  }
  function selbarHtml() {
    var n = selCount();
    return '<div class="vo-selbar" id="vo-selbar"' + (n ? '' : ' style="display:none"') + '>'
      + '<span class="vo-selbar-n"><b id="vo-seln">' + n + '</b> véhicule(s) sélectionné(s)</span>'
      + '<div class="vo-selbar-acts">'
      + '<button type="button" class="vo-logo" id="vo-pdf" title="Générer les affiches prix (PDF)" onclick="window.__voPosters()">' + LOGO.pdf + '</button>'
      + '<button type="button" class="vo-logo" id="vo-xls" title="Exporter la sélection (Excel)" onclick="window.__voExcel()">' + LOGO.xls + '</button>'
      + '<button type="button" class="vo-btn ghost" id="vo-selclear" onclick="window.__voClearSel()">Effacer la sélection</button>'
      + '</div></div>';
  }

  // ─────────────────────────────────────────────────────────── rendu contenu
  function renderContent() {
    var host = root() && root().querySelector('#vo-content');
    if (!host) return;
    if (S.loading) { host.innerHTML = '<div class="vo-state"><div class="vo-spin"></div>Chargement du stock…</div>'; return; }
    if (S.error) { host.innerHTML = '<div class="vo-state">Erreur de chargement.<br><span style="font-size:12px">' + esc(S.error) + '</span></div>'; return; }

    var data = filtered();
    var perPage = defaultPerPage();
    var pages = Math.max(1, Math.ceil(data.length / perPage));
    if (S.page > pages) S.page = pages;
    var slice = data.slice((S.page - 1) * perPage, S.page * perPage);

    var cnt = root().querySelector('.vo-count');
    if (cnt) cnt.textContent = data.length + ' véhicule' + (data.length > 1 ? 's' : '') + " d'occasion";

    var top = selbarHtml() + pagerHtml(data.length, S.page, perPage, 'top');
    if (!slice.length) { host.innerHTML = top + '<div class="vo-state">Aucun véhicule ne correspond aux filtres.</div>'; bindContent(host); return; }

    if (S.view === 'photo') {
      host.innerHTML = top + '<div class="vo-grid">' + slice.map(cardHtml).join('') + '</div>';
    } else {
      var cols = columns();
      host.innerHTML = top + '<div class="vo-tablewrap"><table class="vo-table"><thead><tr>' + thHtml(cols) + '</tr></thead><tbody>'
        + slice.map(function (r) { return rowHtml(r, cols); }).join('') + '</tbody></table></div>';
    }
    bindContent(host);
  }

  // ─────────────────────────────────────────────────────────── chips
  function chipDefs() {
    var f = S.f, out = [];
    function add(key, label, val) { if (val != null) out.push({ key: key, label: label, val: val }); }
    add('reseau', 'Réseau', f.reseau); add('affaire', 'Affaire', f.affaire); add('site', 'Site', f.site);
    add('societe', 'Société', f.societe); add('pointVente', 'Point de vente', f.pointVente);
    add('marque', 'Marque', f.marque); add('modele', 'Modèle', f.modele); add('version', 'Version', f.version);
    add('label', 'Label', f.label); add('stockage', 'Stockage', f.stockage);
    add('carrosserie', 'Carrosserie', f.carrosserie); add('carburant', 'Carburant', f.carburant); add('boite', 'Boîte', f.boite);
    if (f.photos != null) add('photos', 'Photos', f.photos ? 'Oui' : 'Non');
    if (f.contremarque != null) add('contremarque', 'Contremarqué', f.contremarque ? 'Oui' : 'Non');
    if (f.eurotax != null) add('eurotax', 'Codifié Eurotax', f.eurotax ? 'Oui' : 'Non');
    if (f.infomediaire != null) add('infomediaire', 'Codifié Infomédiaire', f.infomediaire ? 'Oui' : 'Non');
    if (f.tvaRecup != null) add('tvaRecup', 'TVA récup.', f.tvaRecup ? 'Oui' : 'Non');
    if (f.pretVente != null) add('pretVente', 'Prêt à la vente', f.pretVente ? 'Oui' : 'Non');
    if (f.destination) add('destination', 'Destination', f.destination);
    if (f.prixMin != null || f.prixMax != null) add('prix', 'Prix', (f.prixMin || 0) + ' → ' + (f.prixMax != null ? f.prixMax : '∞') + ' €');
    if (f.milMin != null || f.milMax != null) add('mil', 'Millésime', (f.milMin || '') + ' → ' + (f.milMax != null ? f.milMax : ''));
    if (f.kmsMin != null || f.kmsMax != null) add('kms', 'Kms', (f.kmsMin || 0) + ' → ' + (f.kmsMax != null ? f.kmsMax : '∞'));
    if (f.nbjMin != null || f.nbjMax != null) add('nbj', 'NBJ', (f.nbjMin || 0) + ' → ' + (f.nbjMax != null ? f.nbjMax : '∞'));
    if (f.co2Min != null || f.co2Max != null) add('co2', 'CO2', (f.co2Min || 0) + ' → ' + (f.co2Max != null ? f.co2Max : '∞'));
    return out;
  }
  function clearChip(key) {
    var f = S.f;
    if (key === 'prix') { f.prixMin = f.prixMax = null; }
    else if (key === 'mil') { f.milMin = f.milMax = null; }
    else if (key === 'kms') { f.kmsMin = f.kmsMax = null; }
    else if (key === 'nbj') { f.nbjMin = f.nbjMax = null; }
    else if (key === 'co2') { f.co2Min = f.co2Max = null; }
    else f[key] = null;
  }
  function renderChips() {
    var box = root() && root().querySelector('.vo-chips'); if (!box) return;
    var defs = chipDefs();
    var html = defs.map(function (c) { return '<span class="vo-chip">' + esc(c.label) + ' : <b>' + esc(c.val) + '</b><span class="vo-cx" data-chip="' + esc(c.key) + '">' + IC.x + '</span></span>'; }).join('');
    if (defs.length > 1) html += '<span class="vo-chip-clear" data-clear="1">Tout effacer</span>';
    box.innerHTML = html;
    box.querySelectorAll('[data-chip]').forEach(function (el) { el.addEventListener('click', function () { clearChip(el.getAttribute('data-chip')); S.page = 1; renderChips(); renderContent(); }); });
    var clr = box.querySelector('[data-clear]'); if (clr) clr.addEventListener('click', function () { for (var k in S.f) S.f[k] = null; S.page = 1; renderChips(); renderContent(); });
    refreshFilterBadge();
  }

  // ─────────────────────────────────────────────────────────── popup filtre
  function selHtml(field, current, base, ph) {
    var opts = '<option value="">' + esc(ph) + '</option>';
    distinct(field, base).forEach(function (v) { opts += '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>'; });
    return opts;
  }
  function triHtml(name, val) {
    function o(v, lab) { var on = (val === v) || (val == null && v === 'all'); return '<span class="vo-tri-opt' + (on ? ' on' : '') + '" data-tri="' + name + '" data-val="' + v + '">' + lab + '</span>'; }
    return '<div class="vo-tri-opts">' + o('all', 'Tous') + o('yes', 'Oui') + o('no', 'Non') + '</div>';
  }
  function destHtml(val) {
    function o(v, lab) { var on = (val === v) || (val == null && v === 'all'); return '<span class="vo-tri-opt' + (on ? ' on' : '') + '" data-dest="' + v + '">' + lab + '</span>'; }
    return '<div class="vo-tri-opts">' + o('all', 'Tous') + o('VOP', 'VOP') + o('VOM', 'VOM') + '</div>';
  }
  function openFilter() {
    var f = JSON.parse(JSON.stringify(S.f));
    var bg = doc.createElement('div'); bg.className = 'vo-modal-bg';

    function societeBase() { return S.raw; }
    function siteBase() { return S.raw.filter(function (r) { return (!f.reseau || r.RESEAU === f.reseau) && (!f.affaire || r.AFFAIRE === f.affaire); }); }
    function pvBase() { return S.raw; }
    function modeleBase() { return f.marque ? S.raw.filter(function (r) { return r.MARQUE_DMS === f.marque; }) : S.raw; }
    function versionBase() { return S.raw.filter(function (r) { return (!f.marque || r.MARQUE_DMS === f.marque) && (!f.modele || r.MODELE_DMS === f.modele); }); }
    function triVal(b) { return b == null ? null : (b ? 'yes' : 'no'); }
    function rng(id, min, max) { return '<div class="vo-range"><input type="number" id="' + id + '_min" placeholder="' + min + '" value="' + (f[id + 'Min'] != null ? f[id + 'Min'] : '') + '"><span>→</span><input type="number" id="' + id + '_max" placeholder="' + max + '" value="' + (f[id + 'Max'] != null ? f[id + 'Max'] : '') + '"></div>'; }

    function build() {
      return STYLE
        + '<div class="vo-modal">'
        + '<div class="vo-modal-head"><h3>Filtrer le stock VO</h3><span class="vo-modal-x" data-x>' + IC.close + '</span></div>'
        + '<div class="vo-modal-body">'
        + '<div class="vo-fcol">'
        + '<div class="vo-fsec b">Propriétaire</div>'
        + '<div><div class="vo-lab">Réseau</div><select class="vo-sel" id="f_reseau">' + selHtml('RESEAU', f.reseau, S.raw, 'Tous les réseaux') + '</select></div>'
        + '<div><div class="vo-lab">Affaire</div><select class="vo-sel" id="f_affaire">' + selHtml('AFFAIRE', f.affaire, S.raw, 'Toutes les affaires') + '</select></div>'
        + '<div><div class="vo-lab">Site</div><select class="vo-sel" id="f_site">' + selHtml('SITE', f.site, siteBase(), 'Tous les sites') + '</select></div>'
        + '<div class="vo-fsec g">Localisation</div>'
        + '<div><div class="vo-lab">Label</div><select class="vo-sel" id="f_label">' + selHtml('LABEL_Codifie', f.label, S.raw, 'Tous les labels') + '</select></div>'
        + '<div><div class="vo-lab">Lieu de stockage</div><select class="vo-sel" id="f_stockage">' + selHtml('LIEU_STOCKAGE_Codifie', f.stockage, S.raw, 'Tous les lieux') + '</select></div>'
        + '<div class="vo-fsec o">Véhicule</div>'
        + '<div><div class="vo-lab">Marque</div><select class="vo-sel" id="f_marque">' + selHtml('MARQUE_DMS', f.marque, S.raw, 'Toutes les marques') + '</select></div>'
        + '<div><div class="vo-lab">Modèle</div><select class="vo-sel" id="f_modele">' + selHtml('MODELE_DMS', f.modele, modeleBase(), 'Tous les modèles') + '</select></div>'
        + '<div><div class="vo-lab">Version</div><select class="vo-sel" id="f_version">' + selHtml('VERSION_EUROTAX', f.version, versionBase(), 'Toutes les versions') + '</select></div>'
        + '</div>'
        + '<div class="vo-fcol">'
        + '<div class="vo-tri"><span class="vo-tri-lab">Photos</span>' + triHtml('photos', triVal(f.photos)) + '</div>'
        + '<div class="vo-tri"><span class="vo-tri-lab">Contremarqué</span>' + triHtml('contremarque', triVal(f.contremarque)) + '</div>'
        + '<div class="vo-tri"><span class="vo-tri-lab">Codifié Eurotax</span>' + triHtml('eurotax', triVal(f.eurotax)) + '</div>'
        + '<div class="vo-tri"><span class="vo-tri-lab">Codifié Infomédiaire</span>' + triHtml('infomediaire', triVal(f.infomediaire)) + '</div>'
        + '<div class="vo-tri"><span class="vo-tri-lab">TVA récupérable</span>' + triHtml('tvaRecup', triVal(f.tvaRecup)) + '</div>'
        + '<div class="vo-tri"><span class="vo-tri-lab">Prêt à la vente</span>' + triHtml('pretVente', triVal(f.pretVente)) + '</div>'
        + '<div class="vo-tri"><span class="vo-tri-lab">Destination</span>' + destHtml(f.destination) + '</div>'
        + '</div>'
        + '<div class="vo-fcol">'
        + '<div><div class="vo-lab">Prix (€)</div>' + rng('prix', '0', '1 000 000') + '</div>'
        + '<div><div class="vo-lab">Millésime</div>' + rng('mil', '1900', '2100') + '</div>'
        + '<div><div class="vo-lab">Kilométrage</div>' + rng('kms', '0', '1 000 000') + '</div>'
        + '<div><div class="vo-lab">NBJ en stock</div>' + rng('nbj', '0', '1 000') + '</div>'
        + '<div><div class="vo-lab">CO2 (g/km)</div>' + rng('co2', '0', '1 000') + '</div>'
        + '<div><div class="vo-lab">Carrosserie</div><select class="vo-sel" id="f_carrosserie">' + selHtml('CARROSSERIE_EUROTAX', f.carrosserie, S.raw, 'Toutes') + '</select></div>'
        + '<div><div class="vo-lab">Carburant</div><select class="vo-sel" id="f_carburant">' + selHtml('CARBURANT_DMS', f.carburant, S.raw, 'Tous') + '</select></div>'
        + '<div><div class="vo-lab">Boîte de vitesse</div><select class="vo-sel" id="f_boite">' + selHtml('BOITEV_EUROTAX', f.boite, S.raw, 'Toutes') + '</select></div>'
        + '</div>'
        + '</div>'
        + '<div class="vo-modal-foot"><button class="vo-foot-btn" data-reset>Réinitialiser</button><button class="vo-foot-btn primary" data-apply>Appliquer les filtres</button></div>'
        + '</div>';
    }
    function readRanges() {
      ['prix', 'mil', 'kms', 'nbj', 'co2'].forEach(function (id) {
        var mi = bg.querySelector('#' + id + '_min'), ma = bg.querySelector('#' + id + '_max');
        f[id + 'Min'] = mi && mi.value !== '' ? num(mi.value) : null;
        f[id + 'Max'] = ma && ma.value !== '' ? num(ma.value) : null;
      });
    }
    function rerender() { bg.innerHTML = build(); wire(); }
    function wire() {
      bg.querySelector('[data-x]').addEventListener('click', function () { bg.remove(); });
      function onSel(id, key, deps) { var el = bg.querySelector('#' + id); if (!el) return; el.addEventListener('change', function () { readRanges(); f[key] = el.value || null; if (deps) deps(); rerender(); }); }
      onSel('f_reseau', 'reseau', function () { f.site = null; });
      onSel('f_affaire', 'affaire', function () { f.site = null; });
      onSel('f_site', 'site');
      onSel('f_label', 'label'); onSel('f_stockage', 'stockage');
      onSel('f_marque', 'marque', function () { f.modele = null; f.version = null; });
      onSel('f_modele', 'modele', function () { f.version = null; });
      onSel('f_version', 'version');
      onSel('f_carrosserie', 'carrosserie'); onSel('f_carburant', 'carburant'); onSel('f_boite', 'boite');
      bg.querySelectorAll('[data-tri]').forEach(function (el) { el.addEventListener('click', function () { var name = el.getAttribute('data-tri'), v = el.getAttribute('data-val'); f[name] = v === 'all' ? null : (v === 'yes'); readRanges(); rerender(); }); });
      bg.querySelectorAll('[data-dest]').forEach(function (el) { el.addEventListener('click', function () { var v = el.getAttribute('data-dest'); f.destination = v === 'all' ? null : v; readRanges(); rerender(); }); });
      bg.querySelector('[data-reset]').addEventListener('click', function () { for (var k in f) f[k] = null; rerender(); });
      bg.querySelector('[data-apply]').addEventListener('click', function () { readRanges(); S.f = f; S.page = 1; bg.remove(); renderChips(); renderContent(); });
    }
    bg.addEventListener('mousedown', function (e) { if (e.target === bg) bg.remove(); });
    rerender();
    doc.body.appendChild(bg);
  }

  // ─────────────────────────────────────────────────────────── export Excel
  function xlsxCols() {
    var cols = [
      ['N° VO', function (r) { return r.NO_VO; }], ['Immat', function (r) { return r.NO_IMMAT; }], ['VIN', function (r) { return r.VIN; }],
      ['Marque', function (r) { return r.MARQUE_DMS; }], ['Modèle', function (r) { return r.MODELE_DMS; }], ['Désignation', function (r) { return designation(r); }],
      ['Carburant', function (r) { return r.CARBURANT_DMS; }], ['Boîte', function (r) { return r.BOITEV_EUROTAX; }],
      ['PMEC', function (r) { return fmtDateFR(r.D_1MEC); }], ['Kms', function (r) { return num(r.KMS); }], ['Prix', function (r) { return num(r.PVENTE); }]
    ];
    if (S.showPA) cols.push(['PA HT/TTC', function (r) { return num(r.PA_HT_TTC); }]);
    return cols.concat([
      ["Crit'Air", function (r) { return critair(r).label; }], ['CV', function (r) { return r.CV_DMS; }], ['CO2', function (r) { return r.TAUX_CO2; }],
      ['TVA', function (r) { return r.TVA; }], ['Destination', function (r) { return destination(r); }], ['Couleur', function (r) { return r.COULEUR_DMS; }],
      ['Site', function (r) { return r.SITE; }], ['Affaire', function (r) { return r.AFFAIRE; }], ['Réseau', function (r) { return r.RESEAU; }],
      ['NBJ', function (r) { return nbjDays(r); }], ['Garantie', function (r) { return garantieTxt(r); }], ['Stockage', function (r) { return r.LIEU_STOCKAGE_Codifie; }]
    ]);
  }
  function stamp() { var d = new Date(); function p(n) { return ('0' + n).slice(-2); } return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()); }
  function rowsForExcel() {
    var cols = xlsxCols(), rows = selectedRows();
    return rows.map(function (r) { var o = {}; cols.forEach(function (c) { var v = c[1](r); o[c[0]] = v == null ? '' : v; }); return o; });
  }
  function aoaData() {
    var cols = xlsxCols(), rows = selectedRows();
    var aoa = [cols.map(function (c) { return c[0]; })];
    rows.forEach(function (r) { aoa.push(cols.map(function (c) { var v = c[1](r); return v == null ? '' : v; })); });
    return aoa;
  }
  function downloadCSV(aoa) {
    var csv = aoa.map(function (row) { return row.map(function (v) { var s = String(v).replace(/"/g, '""'); return /[";\n]/.test(s) ? '"' + s + '"' : s; }).join(';'); }).join('\r\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = doc.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'export_vo_' + stamp() + '.csv'; doc.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 0);
  }
  async function exportExcel(btn) {
    var rows = rowsForExcel();
    if (!rows.length) return;
    busy(btn, true);
    try {
      var jwt = await getJwt();
      if (!jwt) throw new Error('no-jwt');
      var res = await fetch(FN_XLSX, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt, 'apikey': SUPABASE_KEY },
        body: JSON.stringify({ rows: rows, fileName: 'export_vo_' + stamp() + '.xlsx', sheetName: 'Stock VO', expiresIn: 300 })
      });
      if (!res.ok) { var t = ''; try { t = await res.text(); } catch (e) { } throw new Error('Erreur ' + res.status + (t ? ' : ' + t : '')); }
      var result = await res.json();
      var url = result.url || result.signed_url;
      if (!url) throw new Error(result.error || 'Pas de fichier renvoyé');
      var a = doc.createElement('a'); a.href = url; a.download = 'export_vo_' + stamp() + '.xlsx'; a.target = '_blank'; doc.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 0);
    } catch (err) {
      console.error('[vo] export xlsx', err);
      downloadCSV(aoaData()); // repli local si la fonction est indisponible
    } finally {
      busy(btn, false);
    }
  }

  // ─────────────────────────────────────────────────────────── affiches PDF (Edge Function)
  async function getJwt() {
    // 1) variable du plugin Supabase Auth (chemin qui fonctionne dans l'app et l'éditeur)
    try {
      var pv = wwLib.wwVariable.getValue(AUTH_VAR);
      var u = pv && (pv.user || pv);
      var tok = u && u._session && u._session.access_token;
      if (tok) return tok;
    } catch (e) { }
    // 2) client supabase (v2 puis v1)
    var c = sb(); if (!c || !c.auth) return null;
    try { if (typeof c.auth.getSession === 'function') { var r = await c.auth.getSession(); if (r && r.data && r.data.session) return r.data.session.access_token; } } catch (e) { }
    try { if (typeof c.auth.session === 'function') { var s = c.auth.session(); if (s) return s.access_token; } } catch (e) { }
    return null;
  }
  function busy(btn, on) { if (!btn) return; btn.disabled = on; btn.style.opacity = on ? '.45' : ''; }
  async function generatePosters(btn) {
    var rows = selectedRows();
    if (!rows.length) return;
    if (rows.length > MAX_AFFICHES) { try { alert('Trop de véhicules (' + rows.length + '). Maximum ' + MAX_AFFICHES + '.'); } catch (e) { } return; }
    var jwt = await getJwt();
    if (!jwt) { try { alert('Session expirée, reconnecte-toi.'); } catch (e) { } return; }

    busy(btn, true);
    try {
      var res = await fetch(FN_POSTER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt, 'apikey': SUPABASE_KEY },
        body: JSON.stringify({ template_id: TEMPLATE_VO, vehicules: rows })
      });
      if (!res.ok) {
        var t = ''; try { t = await res.text(); } catch (e) { }
        if (res.status === 401) throw new Error('Session expirée');
        throw new Error('Erreur ' + res.status + (t ? ' : ' + t : ''));
      }
      var result = await res.json();
      if (!result.ok) throw new Error(result.error || 'Erreur de génération');
      var a = doc.createElement('a');
      a.href = result.signed_url;
      a.download = 'affiches_vo_' + (result.nb_vehicules || rows.length) + 'veh.pdf';
      a.target = '_blank';
      doc.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 0);
    } catch (err) {
      console.error('[vo] affiches', err);
      try { alert('Erreur : ' + err.message); } catch (e) { }
    } finally {
      busy(btn, false);
    }
  }

  // ─────────────────────────────────────────────────────────── tooltip custom
  function tipEl() { var t = doc.getElementById('vo-tip'); if (!t) { t = doc.createElement('div'); t.id = 'vo-tip'; t.className = 'vo-tip'; doc.body.appendChild(t); } return t; }
  function positionTip(x, y) { var t = tipEl(); var w = t.offsetWidth || 220; var vw = win.innerWidth || window.innerWidth || 1200; var px = Math.min(x + 14, vw - w - 10); if (px < 8) px = 8; t.style.left = px + 'px'; t.style.top = (y + 16) + 'px'; }
  function showTip(x, y, txt) { var t = tipEl(); t.textContent = txt; t.style.opacity = '1'; positionTip(x, y); }
  function hideTip() { var t = doc.getElementById('vo-tip'); if (t) t.style.opacity = '0'; }

  // ─────────────────────────────────────────────────────────── bindings contenu
  function setSelAllState(host) {
    var selall = host.querySelector('#vo-selall'); if (!selall) return;
    var all = filtered();
    var every = all.length > 0 && all.every(function (r) { return S.sel[r.VIN]; });
    var some = all.some(function (r) { return S.sel[r.VIN]; });
    selall.checked = every; selall.indeterminate = some && !every;
  }
  function updateSelUI(host) {
    host = host || (root() && root().querySelector('#vo-content')); if (!host) return;
    var n = selCount();
    var bar = host.querySelector('#vo-selbar'); if (bar) { bar.style.display = n ? '' : 'none'; var nn = bar.querySelector('#vo-seln'); if (nn) nn.textContent = n; }
    setSelAllState(host);
  }
  function bindContent(host) {
    host.querySelectorAll('[data-act="eye"]').forEach(function (el) { el.addEventListener('click', function (e) { e.stopPropagation(); openFicheVO(el.getAttribute('data-vin')); }); });
    host.querySelectorAll('[data-act="photos"]').forEach(function (el) { el.addEventListener('click', function (e) { e.stopPropagation(); openDiaporama(el.getAttribute('data-vin')); }); });
    host.querySelectorAll('[data-act="globe"]').forEach(function (el) { el.addEventListener('click', function (e) { e.stopPropagation(); openWeb(el.getAttribute('data-url')); }); });
    host.querySelectorAll('th[data-sort]').forEach(function (el) {
      el.addEventListener('click', function () { var k = el.getAttribute('data-sort'); if (S.sortKey === k) S.sortDir = S.sortDir === 'asc' ? 'desc' : 'asc'; else { S.sortKey = k; S.sortDir = 'asc'; } renderContent(); });
    });
    host.querySelectorAll('.vo-pg[data-pg]').forEach(function (el) {
      el.addEventListener('click', function () { var p = Number(el.getAttribute('data-pg')); if (p >= 1) { S.page = p; renderContent(); try { root().scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { } } });
    });
    // sélection
    host.querySelectorAll('.vo-rowchk, .vo-cardchk').forEach(function (el) {
      el.addEventListener('change', function () { toggleSel(el.getAttribute('data-vin'), el.checked); var card = el.closest('.vo-card'); if (card) card.classList.toggle('sel', el.checked); updateSelUI(host); });
    });
    var selall = host.querySelector('#vo-selall');
    if (selall) { setSelAllState(host); selall.addEventListener('change', function () { var all = filtered(); if (selall.checked) all.forEach(function (r) { S.sel[r.VIN] = true; }); else all.forEach(function (r) { delete S.sel[r.VIN]; }); renderContent(); }); }
    // tooltip contremarque lazy
    // tooltip contremarque (chargement lazy, mise à jour fiable)
    host.querySelectorAll('.vo-dot.red').forEach(function (el) {
      var vin = el.getAttribute('data-vin'), cm = el.getAttribute('data-cm');
      el.addEventListener('mouseenter', function (e) {
        el._h = true; el._x = e.clientX; el._y = e.clientY;
        var cached = S.cmCache[vin];
        showTip(e.clientX, e.clientY, cached ? cached.txt : 'Chargement…');
        if (!cached) loadCM(vin, cm).then(function (r) { if (el._h) showTip(el._x, el._y, r.txt); });
      });
      el.addEventListener('mousemove', function (e) { el._x = e.clientX; el._y = e.clientY; positionTip(e.clientX, e.clientY); });
      el.addEventListener('mouseleave', function () { el._h = false; hideTip(); });
    });
    updateSelUI(host);
  }

  // ─────────────────────────────────────────────────────────── shell
  function refreshFilterBadge() {
    var b = root() && root().querySelector('#vo-fbadge'); if (!b) return;
    var n = activeFilterCount();
    if (n > 0) { b.textContent = n; b.style.display = ''; } else b.style.display = 'none';
  }
  function renderShell() {
    var r = root(); if (!r) return;
    r.innerHTML = STYLE
      + '<div class="vo-wrap">'
      + '<div class="vo-head"><div><div class="vo-title">Liste VO</div><div class="vo-sub">Gestion des véhicules d\'occasion</div></div><div class="vo-count">…</div></div>'
      + '<div class="vo-bar">'
      + '<div class="vo-field">' + IC.search + '<input id="vo-search" type="text" placeholder="Désignation / VIN / N° ordre"></div>'
      + '<div class="vo-field vo-immat">' + IC.search + '<input id="vo-immat" type="text" placeholder="Immatriculation"></div>'
      + '<button class="vo-btn" id="vo-filter">' + IC.filter + 'Tous les filtres<span class="vo-fbadge" id="vo-fbadge" style="display:none"></span></button>'
      + '<div class="vo-toggle">Mode photo<div class="vo-switch" id="vo-switch"></div></div>'
      + '</div>'
      + '<div class="vo-chips"></div>'
      + '<div id="vo-content"></div>'
      + '</div>';

    var sIn = r.querySelector('#vo-search'), iIn = r.querySelector('#vo-immat'), deb;
    function onType() { clearTimeout(deb); deb = setTimeout(function () { S.search = sIn.value; S.immat = iIn.value; S.page = 1; renderContent(); }, 220); }
    sIn.addEventListener('input', onType); iIn.addEventListener('input', onType);
    r.querySelector('#vo-filter').addEventListener('click', openFilter);
    var sw = r.querySelector('#vo-switch');
    sw.addEventListener('click', function () { S.view = S.view === 'photo' ? 'table' : 'photo'; sw.classList.toggle('on', S.view === 'photo'); S.page = 1; renderContent(); });
    try { if ((win.innerWidth || window.innerWidth) <= 760) { S.view = 'photo'; sw.classList.add('on'); } } catch (e) { }
    refreshFilterBadge();
    r.setAttribute('data-vo-ver', String(VER));
  }

  // ─────────────────────────────────────────────────────────── init / reload
  async function start() {
    S.loading = true; S.error = null; renderContent();
    try { var role = num(connectedUser().ID_Role); S.showPA = role != null && PA_ROLES.indexOf(role) !== -1; } catch (e) { S.showPA = false; }
    S.raw = await loadAll();
    var d = await resolveDefaults();
    if (d) { if (S.f.reseau == null) S.f.reseau = d.reseau || null; if (S.f.affaire == null) S.f.affaire = d.affaire || null; if (S.f.site == null) S.f.site = d.site || null; }
    S.loading = false;
    renderChips(); renderContent();
  }
  function reloadForSite() { S.f.reseau = null; S.f.affaire = null; S.f.site = null; S.sel = {}; start(); }
  window.__voReload = function () { start(); };
  win.__voPosters = window.__voPosters = function () { generatePosters(doc.getElementById('vo-pdf')); };
  win.__voExcel = window.__voExcel = function () { exportExcel(doc.getElementById('vo-xls')); };
  win.__voClearSel = window.__voClearSel = function () { S.sel = {}; renderContent(); };

  function watchSite() {
    var api = siteApi(); if (!api) return;
    if (api.onChange && !window.__voSiteSub) { window.__voSiteSub = api.onChange(function () { reloadForSite(); }); }
    if (!window.__voSiteEvt) { try { doc.addEventListener('oropra-site-changed', reloadForSite); } catch (e) { } window.__voSiteEvt = true; }
  }
  // Boot : le loader fournit __anchor et possède le cycle de vie (re-montage SPA
  // compris). Plus d'attente d'ancre, plus de garde de version (elle empêcherait
  // le re-rendu au retour sur la page).
  renderShell(); watchSite(); start();
  }
});