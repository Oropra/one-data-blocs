// ============================================================================
//  ADMIN — module One Data (OD.define)  v1
//  Rendu dans __anchor ; SUPA_URL -> ctx.tenant (couvre les 7 edge functions) ;
//  client via ctx.supabase ; self-boot + garde de version + ensureRoot retirés
//  (le loader possède le cycle de vie et re-monte à chaque navigation SPA).
//  User via socle oropraUser (cas tableau déjà géré par connectedUser()).
// ============================================================================
/* ============================================================================
 * admin_v1.js — Panneau d'administration ONE DATA (embed unique) — v1.3
 * ----------------------------------------------------------------------------
 * On Page Load (Custom JS) de /admin, ou <script> d'un embed contenant
 *   <div id="od-admin-root"></div>.
 *
 * v1.3 :
 *   - Créer un utilisateur (Edge Function admin-create-user) + MDP temporaire.
 *   - Éditeur "Périmètre et Hiérarchie" (USER_SITE) via Edge Functions
 *     admin-user-site-upsert / admin-user-site-delete : cartes site +
 *     rattachement hiérarchique (manager choisi dans l'organigramme du site).
 *   - Rôles chargés en direct depuis la table ROLE.
 *   - Cascade Réseau->Affaire->Site issue du référentiel complet des sites.
 *   - Charte Oropra (aucun noir), responsive, gating id_role ∈ {1,8}.
 * ==========================================================================*/
OD.define('admin', {
  async mount(__anchor, ctx) {
  'use strict';
  __anchor.id = 'od-admin-root';

  /* ------------------------------------------------------------------ config */
  var MOUNT_ID   = 'od-admin-root';
  var FLAG       = '__od_admin_v1_ver__';
  var VER        = '1.3';
  var SUPA_URL   = ctx.tenant.supabase_url;
  var FN_RESET   = SUPA_URL + '/functions/v1/admin-reset-password';
  var FN_INVITE  = SUPA_URL + '/functions/v1/email-invite-create';
  var FN_CREATE  = SUPA_URL + '/functions/v1/admin-create-user';
  var FN_US_UP   = SUPA_URL + '/functions/v1/admin-user-site-upsert';
  var FN_US_DEL  = SUPA_URL + '/functions/v1/admin-user-site-delete';
  var FN_PERI    = SUPA_URL + '/functions/v1/admin-user-perimeter-set';
  var FN_SUB     = SUPA_URL + '/functions/v1/admin-user-subordinates-attach';
  var TABLE_VIEW = 'v_admin_users';
  var TABLE_USER = 'USER';
  var TABLE_ROLE = 'ROLE';

  var ADMIN_ROLES = [1, 8];
  var VAR_SITES = 'cbf8b908-0928-4b91-8d97-1321f14f957a'; // SITES AFFAIRES MARQUES

  var REQUIRE_LEVEL = 'site';
  // Regroupement : rôle "propre" en tête (Vendeur / Chef des ventes), puis VN_VO.
  // On évite FONCTION en priorité car elle contient déjà le suffixe VN/VO ("Vendeur VN").
  var FONCTION_FIELDS = ['site_role_name', 'user_role_name', 'fonction', 'Fonction', 'FONCTION'];
  var VNVO_FIELDS     = ['VN_VO', 'vn_vo', 'VnVo', 'vnvo', 'VNVO'];

  var COLUMNS = [
    { field: 'nom',                  label: 'Nom' },
    { field: 'prenom',               label: 'Prénom' },
    { field: 'email',                label: 'Email', grow: true },
    { field: 'telephone',            label: 'Tél' },
    { field: 'voip_number',          label: 'VOIP' },
    { field: 'email_account_status', label: 'Email statut', kind: 'status' }
  ];

  /* ------------------------------------------------------------- utilitaires */
  function inEditor() { try { return window.self !== window.top; } catch (e) { return true; } }
  function sb() { return ctx.supabase; }
  function frontDoc() { return __anchor.ownerDocument || document; }
  function frontWin() { try { return (__anchor.ownerDocument && __anchor.ownerDocument.defaultView) || window; } catch (e) { return window; } }
  function getVar(id) { try { return window.wwLib.wwVariable.getValue(id); } catch (e) { return null; } }

  function esc(v) {
    if (v == null) return '';
    return String(v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function distinct(arr) {
    var seen = Object.create(null), out = [];
    arr.forEach(function (x) { if (x == null || x === '') return; var k = String(x); if (!seen[k]) { seen[k] = 1; out.push(x); } });
    return out;
  }
  function byLocale(a, b) { return String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function connectedUser() {
    try {
      var L = window.wwLib;
      var d = ((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser;
      if (Array.isArray(d)) d = d[0]; return d || null;
    } catch (e) { return null; }
  }
  function pick(o, keys) { for (var i = 0; i < keys.length; i++) { var k = keys[i]; if (o && o[k] != null && o[k] !== '') return o[k]; } return null; }
  function userRole(u) { var v = pick(u || connectedUser(), ['id_role', 'ID_Role', 'id_Role', 'ID_role', 'role_id', 'idRole']); var n = Number(v); return Number.isFinite(n) ? n : null; }
  async function accessToken() { var c = sb(); if (!c) return null; var r = await c.auth.getSession(); return r && r.data && r.data.session ? r.data.session.access_token : null; }

  /* --------------------------------------------------------------- état app */
  var state = {
    rows: [], loading: true, error: null, isAdmin: null,
    filters: { reseau: '', affaire: '', site: '' },
    expanded: {}, fonctionField: null, vnvoField: null, roles: []
  };
  var root = null;

  function detectGroupFields() {
    function fieldOf(cands) {
      for (var i = 0; i < state.rows.length; i++) for (var j = 0; j < cands.length; j++) { var v = state.rows[i][cands[j]]; if (v != null && v !== '') return cands[j]; }
      return null;
    }
    state.fonctionField = fieldOf(FONCTION_FIELDS);
    state.vnvoField = fieldOf(VNVO_FIELDS);
  }

  /* ----------------------------------------------------------------- styles */
  var TOKENS = '--green:#53bda7;--blue-lt:#acc5e4;--orange:#fac055;--blue-dk:#2a5ea9;'
    + '--bg:#fafbfd;--card:#fff;--border:#eaf0f9;'
    + '--text:#2a5ea9;--text-mut:#7a9cc4;--text-soft:#4a6a8a;'
    + '--red-soft:#c4554a;--red-bg:#fcebeb;--orange-bg:#fdf2dd;--green-bg:#e1f5ee;--blue-bg:#eaf0f9;'
    + '--grey-bg:#f0f2f5;--grey-text:#8a96a8;--grey-border:#dde2ea;';
  var CSS =
  '#' + MOUNT_ID + ',.oda-overlay,.oda-menu,.oda-toast{' + TOKENS + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;color:var(--text);}'
  + '#' + MOUNT_ID + '{width:100%;}'
  + '#' + MOUNT_ID + ' *,.oda-overlay *,.oda-menu *{box-sizing:border-box;}'
  + '.oda-wrap{padding:18px 22px;max-width:1400px;margin:0 auto;}'
  + '.oda-head{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;}'
  + '.oda-head h1{font-size:18px;font-weight:700;margin:0;color:var(--blue-dk);letter-spacing:-.2px;}'
  + '.oda-head .oda-count{font-size:12px;color:var(--text-mut);}'
  + '.oda-head .oda-create{margin-left:auto;}'
  + '.oda-filters{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px;align-items:flex-end;}'
  + '.oda-field{display:flex;flex-direction:column;gap:4px;min-width:170px;flex:1 1 170px;max-width:260px;}'
  + '.oda-field label{font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--text-mut);}'
  + '.oda-field select,.oda-modal select{appearance:none;border:1px solid var(--border);border-radius:8px;padding:8px 30px 8px 10px;font-size:13px;background:var(--card);color:var(--text);cursor:pointer;font-family:inherit;width:100%;'
    + 'background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%232a5ea9\' stroke-width=\'2\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;}'
  + '.oda-field select:focus,.oda-modal select:focus{outline:none;border-color:var(--blue-dk);box-shadow:0 0 0 3px var(--blue-bg);}'
  + '.oda-field select[disabled]{opacity:.5;cursor:default;}'
  + '.oda-reset{margin-left:auto;border:1px solid var(--border);background:var(--card);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--text-mut);cursor:pointer;font-family:inherit;font-weight:600;}'
  + '.oda-reset:hover{border-color:var(--blue-dk);color:var(--blue-dk);}'
  + '.oda-tablewrap{border:1px solid var(--border);border-radius:10px;overflow:auto;background:var(--card);max-height:calc(100vh - 240px);}'
  + '.oda-table{width:100%;border-collapse:collapse;font-size:13px;min-width:720px;}'
  + '.oda-table th{text-align:left;padding:9px 14px;background:#f9fbfd;color:var(--text-mut);font-weight:700;font-size:10px;letter-spacing:.3px;text-transform:uppercase;border-bottom:1px solid var(--border);white-space:nowrap;position:sticky;top:0;z-index:2;}'
  + '.oda-table td{padding:10px 14px;border-bottom:.5px solid var(--border);vertical-align:middle;color:var(--text-soft);}'
  + '.oda-table tbody tr:last-child td{border-bottom:none;}'
  + '.oda-table tr.oda-user:hover{background:var(--blue-bg);}'
  + '.oda-table td.oda-nom{color:var(--blue-dk);font-weight:600;}'
  + '.oda-grow{width:99%;}'
  + '.oda-actions-cell{width:52px;text-align:right;}'
  + '.oda-grp td{background:#f5f8fc;cursor:pointer;font-weight:700;color:var(--blue-dk);border-bottom:.5px solid var(--border);}'
  + '.oda-grp.vnvo td{background:#fafbfd;font-weight:600;color:var(--text-soft);}'
  + '.oda-grp:hover td{filter:brightness(.98);}'
  + '.oda-exp{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:3px;background:var(--blue-bg);font-size:9px;color:var(--text-mut);margin-right:8px;}'
  + '.oda-grp .ind{padding-left:26px;}'
  + '.oda-grp-count{font-weight:600;color:var(--text-mut);font-size:11px;margin-left:8px;}'
  + '.oda-user .ind1{padding-left:26px;} .oda-user .ind2{padding-left:44px;}'
  + '.oda-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:var(--grey-bg);color:var(--grey-text);text-transform:capitalize;}'
  + '.oda-badge.ok{background:var(--green-bg);color:#1b7a44;} .oda-badge.pending{background:var(--orange-bg);color:#8a6014;} .oda-badge.none{background:var(--grey-bg);color:var(--grey-text);}'
  + '.oda-iconbtn{border:none;background:transparent;cursor:pointer;padding:6px;border-radius:8px;color:var(--text-mut);line-height:0;}'
  + '.oda-iconbtn:hover{background:var(--blue-bg);color:var(--blue-dk);}'
  + '.oda-menu{position:fixed;z-index:2147483000;min-width:220px;background:var(--card);border:1px solid var(--border);border-radius:10px;box-shadow:0 12px 34px rgba(42,94,169,.18);padding:6px;}'
  + '.oda-menu button{display:flex;align-items:center;gap:10px;width:100%;border:none;background:transparent;padding:9px 10px;border-radius:8px;font-size:13px;color:var(--text-soft);cursor:pointer;text-align:left;font-family:inherit;}'
  + '.oda-menu button:hover{background:var(--blue-bg);color:var(--blue-dk);}'
  + '.oda-empty,.oda-loading{padding:44px 20px;text-align:center;color:var(--text-mut);font-size:13px;}'
  + '.oda-spin{display:inline-block;width:18px;height:18px;border:2px solid var(--blue-bg);border-top-color:var(--blue-dk);border-radius:50%;animation:oda-rot .7s linear infinite;vertical-align:-4px;margin-right:8px;}'
  + '@keyframes oda-rot{to{transform:rotate(360deg)}}'
  + '.oda-overlay{position:fixed;inset:0;z-index:2147483100;background:rgba(28,43,69,.45);display:flex;align-items:center;justify-content:center;padding:20px;}'
  + '.oda-modal{background:var(--card);border-radius:14px;width:100%;max-width:min(520px,94vw);box-shadow:0 16px 48px rgba(28,43,69,.3);overflow:hidden;display:flex;flex-direction:column;max-height:92vh;}'
  + '.oda-modal-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);flex:0 0 auto;}'
  + '.oda-modal-head h2{margin:0;font-size:15px;font-weight:700;color:var(--blue-dk);}'
  + '.oda-modal-head p{margin:2px 0 0;font-size:12px;color:var(--text-mut);}'
  + '.oda-modal-body{padding:18px 20px;overflow:auto;}'
  + '.oda-modal-foot{padding:14px 20px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:flex-end;flex:0 0 auto;}'
  + '.oda-form{display:flex;flex-direction:column;gap:14px;}'
  + '.oda-two{display:grid;grid-template-columns:1fr 1fr;gap:12px;}'
  + '.oda-form label,.oda-place-role label{font-size:11px;font-weight:600;color:var(--text-mut);display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:.3px;}'
  + '.oda-form input{width:100%;border:1px solid var(--border);border-radius:8px;padding:9px 11px;font-size:14px;color:var(--text);font-family:inherit;background:var(--card);}'
  + '.oda-form input:focus{outline:none;border-color:var(--blue-dk);box-shadow:0 0 0 3px var(--blue-bg);}'
  + '.oda-subhead{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-mut);margin:0 0 10px;}'
  + '.oda-sep2{height:1px;background:var(--border);margin:16px 0;}'
  + '.oda-cascade{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;}'
  + '.oda-cascade .oda-field{min-width:140px;flex:1;max-width:none;}'
  + '.oda-place-role{margin:12px 0;}'
  + '.oda-mgr-list{display:flex;flex-direction:column;gap:6px;max-height:230px;overflow:auto;}'
  + '.oda-mrow{display:flex;align-items:center;gap:10px;border:1px solid var(--border);border-radius:8px;padding:8px 12px;cursor:pointer;background:var(--card);}'
  + '.oda-mrow:hover{border-color:var(--blue-dk);background:var(--blue-bg);}'
  + '.oda-mrow.active{border:2px solid var(--blue-dk);background:var(--blue-bg);}'
  + '.oda-mrow .dot{width:14px;height:14px;border-radius:50%;border:2px solid var(--text-mut);flex:0 0 auto;}'
  + '.oda-mrow.active .dot{border-color:var(--blue-dk);background:radial-gradient(circle,var(--blue-dk) 0 4px,transparent 5px);}'
  + '.oda-mrow .nm{font-weight:600;color:var(--text-soft);font-size:13px;} .oda-mrow.active .nm{color:var(--blue-dk);}'
  + '.oda-mrow .rl{margin-left:auto;font-size:11px;color:var(--text-mut);}'
  + '.oda-assign{display:flex;flex-direction:column;gap:10px;margin-bottom:14px;}'
  + '.oda-acard{border:1px solid var(--border);border-radius:12px;padding:12px 14px;background:var(--card);}'
  + '.oda-acard .crumb{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px;color:var(--text-soft);margin-bottom:8px;}'
  + '.oda-acard .crumb .sep{color:var(--text-mut);} .oda-acard .crumb b{color:var(--blue-dk);}'
  + '.oda-acard .rolebadge{margin-left:auto;background:var(--blue-bg);color:var(--blue-dk);font-size:11px;padding:2px 10px;border-radius:20px;}'
  + '.oda-acard .mgr{font-size:12px;color:var(--text-mut);padding-top:8px;border-top:.5px solid var(--border);}'
  + '.oda-addbtn{width:100%;}'
  + '.oda-addwrap{border:1.5px dashed var(--blue-lt);border-radius:12px;padding:14px;}'
  + '.oda-btn{border:none;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}'
  + '.oda-btn.primary{background:var(--blue-dk);color:#fff;} .oda-btn.primary:hover{background:#1f4a87;}'
  + '.oda-btn.ghost{background:var(--card);border:1px solid var(--border);color:var(--text-soft);} .oda-btn.ghost:hover{border-color:var(--blue-dk);color:var(--blue-dk);}'
  + '.oda-btn[disabled]{opacity:.55;cursor:default;}'
  + '.oda-provider{display:flex;gap:12px;}'
  + '.oda-provider button{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;padding:18px;border:1px solid var(--border);border-radius:12px;background:var(--card);cursor:pointer;font-size:14px;font-weight:600;color:var(--text-soft);font-family:inherit;}'
  + '.oda-provider button:hover{border-color:var(--blue-dk);background:var(--blue-bg);color:var(--blue-dk);}'
  + '.oda-secret{display:flex;align-items:center;gap:10px;background:var(--bg);border:1px dashed var(--border);border-radius:10px;padding:12px 14px;margin-top:6px;}'
  + '.oda-secret code{flex:1;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;color:var(--blue-dk);word-break:break-all;}'
  + '.oda-note{font-size:13px;color:var(--text-soft);margin:0 0 8px;} .oda-note b{color:var(--blue-dk);}'
  + '.oda-error{background:var(--red-bg);color:var(--red-soft);border-radius:8px;padding:10px 12px;font-size:13px;margin-top:12px;}'
  + '.oda-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483300;background:var(--blue-dk);color:#fff;padding:11px 18px;border-radius:10px;font-size:13px;box-shadow:0 10px 30px rgba(28,43,69,.28);opacity:0;transition:opacity .2s,transform .2s;}'
  + '.oda-toast.show{opacity:1;transform:translateX(-50%) translateY(-4px);}'
  + '#' + MOUNT_ID + '.oda-narrow .oda-wrap{padding:14px 12px;}'
  + '#' + MOUNT_ID + '.oda-narrow .oda-field{max-width:none;min-width:0;flex:1 1 100%;}'
  + '#' + MOUNT_ID + '.oda-narrow .oda-reset{margin-left:0;width:100%;}'
  + '#' + MOUNT_ID + '.oda-narrow .oda-head .oda-create{margin-left:0;width:100%;}'
  + '#' + MOUNT_ID + '.oda-narrow .oda-tablewrap{max-height:none;}'
  + '#' + MOUNT_ID + '.oda-narrow .oda-two{grid-template-columns:1fr;}'
  + '@media (max-width:700px){#' + MOUNT_ID + ' .oda-field{max-width:none;flex:1 1 100%;}#' + MOUNT_ID + ' .oda-two{grid-template-columns:1fr;}}';

  function injectStyle() { var d = frontDoc(); if (d.getElementById('oda-style')) return; var s = d.createElement('style'); s.id = 'oda-style'; s.textContent = CSS; d.head.appendChild(s); }

  /* ----------------------------------------------------------------- icônes */
  var ICON = {
    dots: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>',
    edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    key: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>',
    mail: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>',
    org: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M6.5 10v4h11v-4"/></svg>',
    copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    open: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
    trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
    x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  };

  /* ------------------------------------------------------------------ toast */
  var toastEl = null, toastT = null;
  function toast(msg) {
    var d = frontDoc();
    if (!toastEl || !d.body.contains(toastEl)) { toastEl = d.createElement('div'); toastEl.className = 'oda-toast'; d.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
  }
  async function copyText(text) {
    try { await frontWin().navigator.clipboard.writeText(text); toast('Copié'); }
    catch (e) { var d = frontDoc(); var ta = d.createElement('textarea'); ta.value = text; d.body.appendChild(ta); ta.select(); try { d.execCommand('copy'); toast('Copié'); } catch (e2) {} d.body.removeChild(ta); }
  }

  /* ----------------------------------------------------------- données / api */
  async function loadUsers() {
    state.loading = true; state.error = null; render();
    var c = sb(); if (!c) { state.loading = false; state.error = 'Plugin Supabase indisponible.'; render(); return; }
    var res = await c.from(TABLE_VIEW).select('*').order('nom', { ascending: true });
    state.loading = false;
    if (res.error) { state.error = res.error.message || 'Erreur de chargement des utilisateurs.'; render(); return; }
    state.rows = res.data || []; detectGroupFields(); render();
  }
  async function loadRoles() {
    try {
      var c = sb(); if (!c) return;
      var res = await c.from(TABLE_ROLE).select('*');
      if (res.error || !res.data) return;
      state.roles = res.data.map(function (r) {
        var id = (r.id != null) ? r.id : (r.ID_Role != null ? r.ID_Role : r.id_role);
        var label = r.Role || r.role || r.nom || r.Nom || r.name || r.libelle || r.Libelle || ('Rôle ' + id);
        return { id: id, label: label };
      }).filter(function (r) { return r.id != null; }).sort(function (a, b) { return byLocale(a.label, b.label); });
    } catch (e) {}
  }
  async function updateProfile(idUser, data) {
    return sb().from(TABLE_USER).update({ prenom: data.prenom, nom: data.nom, email: data.email, N_de_telephone: data.telephone, voip_number: data.voip }).eq('ID_User', idUser);
  }
  async function callFn(url, payload) {
    var token = await accessToken(); if (!token) return { error: 'Session expirée, reconnectez-vous.' };
    var r = await fetch(url, { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) return { error: (d.error || 'Erreur inconnue') + (d.detail ? ' — ' + d.detail : '') };
    return d;
  }
  async function resetPassword(idUser) { return callFn(FN_RESET, { target_user_id: idUser }); }
  async function createInvite(idUser, provider) { return callFn(FN_INVITE, { target_user_id: idUser, provider: provider }); }
  async function createUser(payload) { return callFn(FN_CREATE, payload); }
  async function upsertUserSite(target, id_site, id_role, manager) { return callFn(FN_US_UP, { target_user_id: target, id_site: id_site, id_role: id_role, manager_user_id: manager }); }
  async function deleteUserSite(target, id_site) { return callFn(FN_US_DEL, { target_user_id: target, id_site: id_site }); }

  /* --------------------------------------------------------- filtres/cascade */
  function reseauOptions() { return distinct(state.rows.map(function (r) { return r.reseau; })).sort(byLocale); }
  function affaireOptions() { var f = state.filters; return distinct(state.rows.filter(function (r) { return !f.reseau || r.reseau === f.reseau; }).map(function (r) { return r.affaire; })).sort(byLocale); }
  function siteOptions() { var f = state.filters; return distinct(state.rows.filter(function (r) { return (!f.reseau || r.reseau === f.reseau) && (!f.affaire || r.affaire === f.affaire); }).map(function (r) { return r.site_name; })).sort(byLocale); }
  function filteredRows() {
    var f = state.filters;
    return state.rows.filter(function (r) {
      if (f.reseau && r.reseau !== f.reseau) return false;
      if (f.affaire && r.affaire !== f.affaire) return false;
      if (f.site && !(r.site_name || '').toLowerCase().includes(f.site.toLowerCase())) return false;
      return true;
    });
  }
  function listReady() { if (REQUIRE_LEVEL === 'reseau') return !!state.filters.reseau; if (REQUIRE_LEVEL === 'affaire') return !!state.filters.affaire; return !!state.filters.site; }
  function requirePrompt() { if (REQUIRE_LEVEL === 'reseau') return 'Sélectionnez un réseau pour afficher les utilisateurs.'; if (REQUIRE_LEVEL === 'affaire') return 'Sélectionnez un réseau puis une affaire pour afficher les utilisateurs.'; return 'Sélectionnez un réseau, une affaire puis un site pour afficher les utilisateurs.'; }
  function isOpen(key) { return state.expanded[key] !== false; }

  /* --------------------------------- référentiel des sites (pour créer/ajouter) */
  function sitesRef() {
    var v = getVar(VAR_SITES);
    if (Array.isArray(v) && v.length) {
      return v.map(function (o) { return { reseau: o.MARQUE_SITE, affaire: o.AFFAIRE, site: o.SITE, id_site: o.ID_SITE, id_affaire: o.ID_AFFAIRE }; })
              .filter(function (o) { return o.id_site != null; });
    }
    // fallback : dériver des utilisateurs chargés (sites ayant ≥1 user)
    var seen = {}, out = [];
    state.rows.forEach(function (r) { if (r.id_site == null) return; var k = String(r.id_site); if (seen[k]) return; seen[k] = 1; out.push({ reseau: r.reseau, affaire: r.affaire, site: r.site_name, id_site: r.id_site, id_affaire: r.id_affaire }); });
    return out;
  }
  function refReseaux() { return distinct(sitesRef().map(function (o) { return o.reseau; })).sort(byLocale); }
  function refAffaires(res) { return distinct(sitesRef().filter(function (o) { return !res || o.reseau === res; }).map(function (o) { return o.affaire; })).sort(byLocale); }
  function refSites(res, aff) {
    var seen = {}, out = [];
    sitesRef().forEach(function (o) {
      if ((res && o.reseau !== res) || (aff && o.affaire !== aff)) return;
      var k = String(o.id_site); if (seen[k]) return; seen[k] = 1; out.push({ site: o.site, id_site: o.id_site });
    });
    return out.sort(function (a, b) { return byLocale(a.site, b.site); });
  }
  function managersOnSite(idSite) {
    var seen = {}, out = [];
    state.rows.forEach(function (r) {
      if (String(r.id_site) !== String(idSite) || r.id_user == null) return;
      var k = String(r.id_user); if (seen[k]) return; seen[k] = 1;
      out.push({ id_user: r.id_user, name: [r.prenom, r.nom].filter(Boolean).join(' ') || ('#' + r.id_user), role: r.site_role_name || r.user_role_name || '' });
    });
    return out.sort(function (a, b) { return byLocale(a.role + a.name, b.role + b.name); });
  }

  /* ------------------------------------------------------------------ rendu */
  function statusBadge(v) {
    var s = (v == null || v === '') ? '—' : String(v);
    if (s === '—') return '<span class="oda-badge none">—</span>';
    var low = s.toLowerCase(), cls = 'none';
    if (/(connect|active|ok|ready|valid)/.test(low)) cls = 'ok';
    else if (/(pending|attente|invit|progress)/.test(low)) cls = 'pending';
    return '<span class="oda-badge ' + cls + '">' + esc(s) + '</span>';
  }
  function selectHtml(id, label, value, options, placeholder) {
    var opts = '<option value="">' + esc(placeholder) + '</option>';
    options.forEach(function (o) { opts += '<option value="' + esc(o) + '"' + (String(o) === String(value) ? ' selected' : '') + '>' + esc(o) + '</option>'; });
    return '<div class="oda-field"><label>' + esc(label) + '</label><select data-filter="' + id + '">' + opts + '</select></div>';
  }
  function rowKey(r) { return r.user_site_unique_id != null ? r.user_site_unique_id : r.id_user; }

  function userRowHtml(r, indentClass) {
    var html = '<tr class="oda-user">';
    COLUMNS.forEach(function (c, i) {
      var cls = (i === 0 ? 'oda-nom ' + (indentClass || '') : (c.grow ? 'oda-grow' : '')).trim();
      var cell = (c.kind === 'status') ? statusBadge(r[c.field]) : esc(r[c.field]);
      html += '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + cell + '</td>';
    });
    html += '<td class="oda-actions-cell"><button class="oda-iconbtn" data-menu="' + esc(rowKey(r)) + '" title="Actions">' + ICON.dots + '</button></td>';
    return html + '</tr>';
  }
  function groupHeaderHtml(label, count, key, sub) {
    var span = COLUMNS.length + 1;
    return '<tr class="oda-grp' + (sub ? ' vnvo' : '') + '" data-exp="' + esc(key) + '"><td colspan="' + span + '"><span class="' + (sub ? 'ind' : '') + '"><span class="oda-exp">' + (isOpen(key) ? '▼' : '▶') + '</span>' + esc(label) + '<span class="oda-grp-count">' + count + '</span></span></td></tr>';
  }
  function tableBody(rows) {
    var fF = state.fonctionField, vF = state.vnvoField;
    if (!fF && !vF) return rows.map(function (r) { return userRowHtml(r, ''); }).join('');
    var topField = fF || vF, subField = (fF && vF) ? vF : null, groups = {};
    rows.forEach(function (r) { var g = (r[topField] == null || r[topField] === '') ? '—' : String(r[topField]); (groups[g] = groups[g] || []).push(r); });
    var out = '';
    Object.keys(groups).sort(byLocale).forEach(function (g) {
      var list = groups[g], gKey = 'g:' + g;
      out += groupHeaderHtml(g, list.length, gKey, false);
      if (!isOpen(gKey)) return;
      if (!subField) { list.forEach(function (r) { out += userRowHtml(r, 'ind1'); }); return; }
      var subs = {};
      list.forEach(function (r) { var s = (r[subField] == null || r[subField] === '') ? '—' : String(r[subField]); (subs[s] = subs[s] || []).push(r); });
      Object.keys(subs).sort(byLocale).forEach(function (s) {
        var sKey = gKey + '|s:' + s;
        out += groupHeaderHtml(s, subs[s].length, sKey, true);
        if (!isOpen(sKey)) return;
        subs[s].forEach(function (r) { out += userRowHtml(r, 'ind2'); });
      });
    });
    return out;
  }

  function render() {
    if (!root) return;
    if (state.isAdmin === false) { root.innerHTML = '<div class="oda-wrap"><div class="oda-empty">Accès réservé aux administrateurs.</div></div>'; return; }
    var rows = filteredRows(), ready = listReady();
    var html = '<div class="oda-wrap"><div class="oda-head"><h1>Administration des utilisateurs</h1>'
      + '<span class="oda-count">' + ((state.loading || !ready) ? '' : rows.length + ' utilisateur' + (rows.length > 1 ? 's' : '')) + '</span>'
      + '<button class="oda-btn primary oda-create" data-action="create-user">+ Créer un utilisateur</button></div>';
    html += '<div class="oda-filters">'
      + selectHtml('reseau', 'Réseau', state.filters.reseau, reseauOptions(), 'Tous les réseaux')
      + selectHtml('affaire', 'Affaire', state.filters.affaire, affaireOptions(), 'Toutes les affaires')
      + selectHtml('site', 'Site', state.filters.site, siteOptions(), 'Tous les sites')
      + '<button class="oda-reset" data-action="reset-filters">Réinitialiser</button></div>';
    html += '<div class="oda-tablewrap">';
    if (state.loading) html += '<div class="oda-loading"><span class="oda-spin"></span>Chargement des utilisateurs…</div>';
    else if (state.error) html += '<div class="oda-error" style="margin:16px;">' + esc(state.error) + '</div>';
    else if (!ready) html += '<div class="oda-empty">' + esc(requirePrompt()) + '</div>';
    else if (rows.length === 0) html += '<div class="oda-empty">Aucun utilisateur ne correspond aux filtres.</div>';
    else {
      html += '<table class="oda-table"><thead><tr>';
      COLUMNS.forEach(function (c) { html += '<th' + (c.grow ? ' class="oda-grow"' : '') + '>' + esc(c.label) + '</th>'; });
      html += '<th class="oda-actions-cell"></th></tr></thead><tbody>' + tableBody(rows) + '</tbody></table>';
    }
    html += '</div></div>';
    root.innerHTML = html;
  }

  /* --------------------------------------------------------- menu d'actions */
  var openMenuEl = null;
  function closeMenu() { if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; } }
  function rowByKey(key) { return state.rows.filter(function (r) { return String(rowKey(r)) === String(key); })[0]; }
  function openMenu(btn, row) {
    closeMenu();
    var d = frontDoc(), m = d.createElement('div'); m.className = 'oda-menu';
    m.innerHTML = '<button data-act="edit">' + ICON.edit + 'Éditer le profil</button>'
      + '<button data-act="perimetre">' + ICON.org + 'Périmètre et Hiérarchie</button>'
      + '<button data-act="reset">' + ICON.key + 'Réinitialiser le mot de passe</button>'
      + '<button data-act="invite">' + ICON.mail + 'Inviter (email)</button>';
    d.body.appendChild(m);
    var rect = btn.getBoundingClientRect(), top = rect.bottom + 6, left = rect.right - 220;
    if (left < 8) left = 8;
    if (top + m.offsetHeight > (frontWin().innerHeight || 800) - 8) top = rect.top - m.offsetHeight - 6;
    m.style.top = Math.max(8, top) + 'px'; m.style.left = left + 'px';
    openMenuEl = m;
    m.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return; var act = b.getAttribute('data-act'); closeMenu();
      if (act === 'edit') modalEdit(row);
      else if (act === 'perimetre') modalPerimetre(row);
      else if (act === 'reset') modalReset(row);
      else if (act === 'invite') modalInvite(row);
    });
  }

  /* ------------------------------------------------------------- modales */
  function overlay(inner) {
    var d = frontDoc(), ov = d.createElement('div'); ov.className = 'oda-overlay';
    ov.innerHTML = '<div class="oda-modal">' + inner + '</div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    d.body.appendChild(ov); return ov;
  }
  function fullName(r) { return [r.prenom, r.nom].filter(Boolean).join(' ') || r.email || 'Utilisateur'; }

  /* -- panneau de placement réutilisable (site + rôle + manager) ------------ */
  function buildPlacement(container, initial) {
    var st = { reseau: '', affaire: '', site: '', id_site: null, id_role: '', manager: null };
    if (initial) {
      st.reseau = initial.reseau || '';
      st.affaire = initial.affaire || '';
      st.site = initial.site || '';
      st.id_site = initial.id_site != null ? Number(initial.id_site) : null;
    }
    function optList(items, sel, ph) { var o = '<option value="">' + esc(ph) + '</option>'; items.forEach(function (x) { o += '<option value="' + esc(x) + '"' + (String(x) === String(sel) ? ' selected' : '') + '>' + esc(x) + '</option>'; }); return o; }
    function roleOpts(sel) { var o = '<option value="">Choisir un rôle…</option>'; state.roles.forEach(function (r) { o += '<option value="' + esc(r.id) + '"' + (String(r.id) === String(sel) ? ' selected' : '') + '>' + esc(r.label) + '</option>'; }); return o; }
    function mrow(id, name, role, active) { return '<div class="oda-mrow' + (active ? ' active' : '') + '" data-mgr="' + esc(id) + '"><span class="dot"></span><span class="nm">' + esc(name) + '</span>' + (role ? '<span class="rl">' + esc(role) + '</span>' : '') + '</div>'; }
    function draw() {
      var reseaux = refReseaux(), affaires = st.reseau ? refAffaires(st.reseau) : [], sites = (st.reseau && st.affaire) ? refSites(st.reseau, st.affaire) : [];
      var h = '<div class="oda-cascade">'
        + '<div class="oda-field"><label>Réseau</label><select data-c="reseau">' + optList(reseaux, st.reseau, 'Choisir…') + '</select></div>'
        + '<div class="oda-field"><label>Affaire</label><select data-c="affaire"' + (st.reseau ? '' : ' disabled') + '>' + optList(affaires, st.affaire, 'Choisir…') + '</select></div>'
        + '<div class="oda-field"><label>Site</label><select data-c="site"' + (st.affaire ? '' : ' disabled') + '>';
      h += '<option value="">Choisir…</option>';
      sites.forEach(function (s) { h += '<option value="' + esc(s.id_site) + '"' + (String(s.id_site) === String(st.id_site) ? ' selected' : '') + '>' + esc(s.site) + '</option>'; });
      h += '</select></div></div>';
      if (st.id_site != null) {
        h += '<div class="oda-place-role"><label>Rôle sur ce site</label><select data-c="role">' + roleOpts(st.id_role) + '</select></div>';
        h += '<p class="oda-note">Rattaché à (manager sur ce site) :</p><div class="oda-mgr-list">';
        h += mrow('__self__', 'Responsable du site', 'aucun manager au-dessus', st.manager === '__self__');
        managersOnSite(st.id_site).forEach(function (m) { h += mrow(m.id_user, m.name, m.role, String(st.manager) === String(m.id_user)); });
        h += '</div>';
      }
      container.innerHTML = h; bind();
    }
    function bind() {
      container.querySelectorAll('select[data-c]').forEach(function (sel) {
        sel.onchange = function () {
          var c = sel.getAttribute('data-c'), v = sel.value;
          if (c === 'reseau') { st.reseau = v; st.affaire = ''; st.site = ''; st.id_site = null; st.manager = null; }
          else if (c === 'affaire') { st.affaire = v; st.site = ''; st.id_site = null; st.manager = null; }
          else if (c === 'site') { st.id_site = v ? Number(v) : null; st.site = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : ''; st.manager = null; }
          else if (c === 'role') { st.id_role = v; return; }
          draw();
        };
      });
      container.querySelectorAll('.oda-mrow').forEach(function (el) { el.onclick = function () { st.manager = el.getAttribute('data-mgr'); draw(); }; });
    }
    draw();
    return { get: function () { return st; }, valid: function () { return st.id_site != null && st.id_role && st.manager != null; } };
  }

  function modalEdit(row) {
    var ov = overlay('<div class="oda-modal-head"><div><h2>Éditer le profil</h2><p>' + esc(fullName(row)) + '</p></div><button class="oda-iconbtn" data-x>' + ICON.x + '</button></div>'
      + '<div class="oda-modal-body"><div class="oda-form">'
      + '<div class="oda-two"><div><label>Prénom</label><input data-f="prenom" value="' + esc(row.prenom) + '"></div><div><label>Nom</label><input data-f="nom" value="' + esc(row.nom) + '"></div></div>'
      + '<div><label>Email</label><input data-f="email" value="' + esc(row.email) + '"></div>'
      + '<div class="oda-two"><div><label>Téléphone</label><input data-f="telephone" value="' + esc(row.telephone) + '"></div><div><label>Numéro VOIP</label><input data-f="voip" value="' + esc(row.voip_number) + '"></div></div>'
      + '<div class="oda-err-slot"></div></div></div>'
      + '<div class="oda-modal-foot"><button class="oda-btn ghost" data-x>Annuler</button><button class="oda-btn primary" data-save>Enregistrer</button></div>');
    ov.querySelectorAll('[data-x]').forEach(function (b) { b.onclick = function () { ov.remove(); }; });
    ov.querySelector('[data-save]').onclick = async function () {
      var btn = this; btn.disabled = true; btn.textContent = 'Enregistrement…';
      var g = function (f) { return ov.querySelector('[data-f="' + f + '"]').value.trim(); };
      var res = await updateProfile(row.id_user, { prenom: g('prenom'), nom: g('nom'), email: g('email'), telephone: g('telephone'), voip: g('voip') });
      if (res && res.error) { btn.disabled = false; btn.textContent = 'Enregistrer'; ov.querySelector('.oda-err-slot').innerHTML = '<div class="oda-error">' + esc(res.error.message || 'Erreur d\'enregistrement.') + '</div>'; return; }
      ov.remove(); toast('Profil mis à jour'); await loadUsers();
    };
  }

  function modalReset(row) {
    var ov = overlay('<div class="oda-modal-head"><div><h2>Réinitialiser le mot de passe</h2><p>' + esc(fullName(row)) + '</p></div><button class="oda-iconbtn" data-x>' + ICON.x + '</button></div>'
      + '<div class="oda-modal-body oda-reset-body"><p class="oda-note">Un mot de passe temporaire sera généré. Communiquez-le à l\'utilisateur ; il devra le changer à la première connexion.</p></div>'
      + '<div class="oda-modal-foot oda-reset-foot"><button class="oda-btn ghost" data-x>Annuler</button><button class="oda-btn primary" data-go>Générer</button></div>');
    ov.querySelectorAll('[data-x]').forEach(function (b) { b.onclick = function () { ov.remove(); }; });
    ov.querySelector('[data-go]').onclick = async function () {
      var btn = this; btn.disabled = true; btn.textContent = 'Génération…';
      var res = await resetPassword(row.id_user), body = ov.querySelector('.oda-reset-body'), foot = ov.querySelector('.oda-reset-foot');
      if (res.error) { btn.disabled = false; btn.textContent = 'Générer'; if (!body.querySelector('.oda-error')) body.insertAdjacentHTML('beforeend', '<div class="oda-error">' + esc(res.error) + '</div>'); else body.querySelector('.oda-error').textContent = res.error; return; }
      body.innerHTML = '<p class="oda-note">Mot de passe temporaire :</p><div class="oda-secret"><code>' + esc(res.temp_password) + '</code><button class="oda-iconbtn" data-copy title="Copier">' + ICON.copy + '</button></div>';
      foot.innerHTML = '<button class="oda-btn primary" data-x>C\'est noté</button>';
      foot.querySelector('[data-x]').onclick = function () { ov.remove(); };
      body.querySelector('[data-copy]').onclick = function () { copyText(res.temp_password); };
    };
  }

  function modalInvite(row) {
    var ov = overlay('<div class="oda-modal-head"><div><h2>Inviter par email</h2><p>' + esc(fullName(row)) + '</p></div><button class="oda-iconbtn" data-x>' + ICON.x + '</button></div>'
      + '<div class="oda-modal-body oda-inv-body"><p class="oda-note">Choisissez le fournisseur de messagerie à connecter pour cet utilisateur.</p>'
      + '<div class="oda-provider"><button data-prov="gmail">' + ICON.mail + 'Gmail</button><button data-prov="outlook">' + ICON.mail + 'Outlook</button></div></div>'
      + '<div class="oda-modal-foot"><button class="oda-btn ghost" data-x>Fermer</button></div>');
    ov.querySelectorAll('[data-x]').forEach(function (b) { b.onclick = function () { ov.remove(); }; });
    ov.querySelectorAll('[data-prov]').forEach(function (b) {
      b.onclick = async function () {
        var body = ov.querySelector('.oda-inv-body'); body.innerHTML = '<div class="oda-loading"><span class="oda-spin"></span>Création du lien…</div>';
        var res = await createInvite(row.id_user, b.getAttribute('data-prov'));
        if (res.error) { body.innerHTML = '<div class="oda-error">' + esc(res.error) + '</div>'; return; }
        body.innerHTML = '<p class="oda-note">Lien de connexion généré. Transmettez-le à l\'utilisateur :</p><div class="oda-secret"><code>' + esc(res.auth_url) + '</code><button class="oda-iconbtn" data-copy title="Copier">' + ICON.copy + '</button><button class="oda-iconbtn" data-open title="Ouvrir">' + ICON.open + '</button></div>';
        body.querySelector('[data-copy]').onclick = function () { copyText(res.auth_url); };
        body.querySelector('[data-open]').onclick = function () { frontWin().open(res.auth_url, '_blank', 'noopener'); };
      };
    });
  }

  function modalCreate() {
    var ov = overlay('<div class="oda-modal-head"><div><h2>Créer un utilisateur</h2><p>Nouvel accès + affectation initiale</p></div><button class="oda-iconbtn" data-x>' + ICON.x + '</button></div>'
      + '<div class="oda-modal-body"><div class="oda-form">'
      + '<div class="oda-two"><div><label>Prénom</label><input data-f="prenom"></div><div><label>Nom</label><input data-f="nom"></div></div>'
      + '<div><label>Email</label><input data-f="email" type="email"></div>'
      + '<div class="oda-two"><div><label>Téléphone</label><input data-f="telephone"></div><div><label>Numéro VOIP</label><input data-f="voip"></div></div>'
      + '<div class="oda-two"><div><label>Matricule</label><input data-f="matricule"></div><div><label>Fonction</label><input data-f="fonction"></div></div>'
      + '<div><label>VN / VO / VNVO</label><select data-f="vnvo"><option value="">—</option><option value="VN">VN</option><option value="VO">VO</option><option value="VNVO">VNVO</option></select></div>'
      + '</div><div class="oda-sep2"></div><p class="oda-subhead">Affectation initiale</p><div id="oda-place"></div><div class="oda-err-slot"></div></div>'
      + '<div class="oda-modal-foot"><button class="oda-btn ghost" data-x>Annuler</button><button class="oda-btn primary" data-go>Créer</button></div>');
    ov.querySelectorAll('[data-x]').forEach(function (b) { b.onclick = function () { ov.remove(); }; });
    // Pré-sélection : si un site est déjà filtré, on le reprend dans le placement.
    var pre = null;
    if (state.filters.site) {
      var match = state.rows.filter(function (r) {
        return (!state.filters.reseau || r.reseau === state.filters.reseau)
            && (!state.filters.affaire || r.affaire === state.filters.affaire)
            && r.site_name === state.filters.site;
      })[0];
      if (match && match.id_site != null) {
        var ref = sitesRef().filter(function (o) { return String(o.id_site) === String(match.id_site); })[0];
        pre = ref ? { reseau: ref.reseau, affaire: ref.affaire, site: ref.site, id_site: ref.id_site }
                  : { reseau: match.reseau, affaire: match.affaire, site: match.site_name, id_site: match.id_site };
      }
    }
    var place = buildPlacement(ov.querySelector('#oda-place'), pre);
    ov.querySelector('[data-go]').onclick = async function () {
      var btn = this, g = function (f) { var e = ov.querySelector('[data-f="' + f + '"]'); return e ? e.value.trim() : ''; };
      var errSlot = ov.querySelector('.oda-err-slot');
      var showErr = function (m) { errSlot.innerHTML = '<div class="oda-error">' + esc(m) + '</div>'; };
      var email = g('email'), prenom = g('prenom'), nom = g('nom');
      if (!email || !prenom || !nom) { showErr('Prénom, nom et email sont requis.'); return; }
      if (!place.valid()) { showErr('Choisis un site, un rôle et un rattachement.'); return; }
      var p = place.get();
      btn.disabled = true; btn.textContent = 'Création…';
      var ref2 = sitesRef().filter(function (o) { return String(o.id_site) === String(p.id_site); })[0];
      var payload = {
        email: email, prenom: prenom, nom: nom,
        telephone: g('telephone') || null, voip_number: g('voip') || null,
        matricule: g('matricule') || null, fonction: g('fonction') || null, vn_vo: g('vnvo') || null,
        id_role: Number(p.id_role), id_site_main: Number(p.id_site),
        reseau: p.reseau || null, affaire: p.affaire || null, site: p.site || null,
        id_affaire: ref2 && ref2.id_affaire != null ? Number(ref2.id_affaire) : null,
        initial_assignment: { id_site: Number(p.id_site), id_role: Number(p.id_role), manager_user_id: p.manager === '__self__' ? null : Number(p.manager) }
      };
      var res = await createUser(payload);
      if (res.error) { btn.disabled = false; btn.textContent = 'Créer'; showErr(res.error); return; }
      var body = ov.querySelector('.oda-modal-body'), foot = ov.querySelector('.oda-modal-foot');
      body.innerHTML = '<p class="oda-note">Utilisateur <b>' + esc(prenom + ' ' + nom) + '</b> créé. Mot de passe temporaire :</p>'
        + '<div class="oda-secret"><code>' + esc(res.temp_password) + '</code><button class="oda-iconbtn" data-copy title="Copier">' + ICON.copy + '</button></div>'
        + '<p class="oda-note" style="margin-top:10px">Communiquez-le à l\'utilisateur ; il le changera à la première connexion.</p>';
      foot.innerHTML = '<button class="oda-btn primary" data-x>Terminé</button>';
      foot.querySelector('[data-x]').onclick = function () { ov.remove(); };
      body.querySelector('[data-copy]').onclick = function () { copyText(res.temp_password); };
      toast('Utilisateur créé'); await loadUsers();
    };
  }

  async function modalPerimetre(row) {
    var target = row.id_user;
    var ov = overlay('<div class="oda-modal-head"><div><div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#7a98c5;font-weight:700;margin-bottom:3px">Périmètre &amp; hiérarchie</div><h2 style="margin:0;font-size:23px;font-weight:800;color:#1f4a85;letter-spacing:-.01em;line-height:1.1">' + esc(fullName(row)) + '</h2></div><button class="oda-iconbtn" data-x>' + ICON.x + '</button></div>'
      + '<div class="oda-modal-body" style="padding:0"><div class="pe-wrap"></div></div>');
    ov.querySelectorAll('[data-x]').forEach(function (b) { b.onclick = function () { ov.remove(); }; });
    var __m = ov.querySelector('.oda-modal'); if (__m) { __m.style.maxWidth = 'min(1080px, 96vw)'; __m.style.width = '100%'; }
    injectPeriCss();
    try { ov.querySelector('.pe-wrap').innerHTML = '<div style="padding:48px;text-align:center;color:#7a98c5;font-family:Inter,sans-serif">Chargement…</div>'; } catch (e) {}

    // ----- rôles + couleurs + hiérarchie -----
    var roles = (state.roles || []).slice();
    var PALETTE = { 4: '#3b82c4', 3: '#12a594', 2: '#7c5cd6', 6: '#e0803b', 7: '#d14b8f', 8: '#24406e', 1: '#64748b' };
    var FALLBACK = ['#3b82c4', '#12a594', '#7c5cd6', '#e0803b', '#d14b8f', '#24406e', '#0e7490', '#9333ea'];
    var roleColorMap = {}; roles.forEach(function (r, i) { roleColorMap[r.id] = PALETTE[r.id] || FALLBACK[i % FALLBACK.length]; });
    function roleColor(id) { return roleColorMap[id] || '#64748b'; }
    function roleLabel(id) { var r = roles.filter(function (x) { return String(x.id) === String(id); })[0]; return r ? r.label : ''; }
    function roleIdByLabel(lbl) { if (!lbl) return null; var m = roles.filter(function (r) { return String(r.label).toLowerCase() === String(lbl).toLowerCase(); })[0]; return m ? m.id : null; }
    // rang hiérarchique : Vendeur < Chef < Directeur < Dir. plaque < Dir. marque < Dir. groupe < Admin
    var RANK = { 4: 0, 3: 1, 2: 2, 6: 3, 7: 4, 8: 5, 1: 6 };
    function rank(r) { return RANK[r] != null ? RANK[r] : null; }

    // ----- arbre depuis sitesRef() -----
    var refs = sitesRef();
    var tree = (function () {
      var byR = {};
      refs.forEach(function (s) {
        if (s.id_site == null) return;
        var rk = s.reseau || '—';
        if (!byR[rk]) byR[rk] = { reseau: rk, affaires: {} };
        var ak = (s.id_affaire != null ? s.id_affaire : s.affaire) + '';
        if (!byR[rk].affaires[ak]) byR[rk].affaires[ak] = { id: ak, affaire: s.affaire || '—', sites: [] };
        byR[rk].affaires[ak].sites.push({ id: Number(s.id_site), n: s.site || ('Site ' + s.id_site) });
      });
      return Object.keys(byR).sort(byLocale).map(function (rk) {
        var rz = byR[rk];
        return { reseau: rz.reseau, affaires: Object.keys(rz.affaires).map(function (ak) { return rz.affaires[ak]; }).sort(function (a, b) { return byLocale(a.affaire, b.affaire); }) };
      });
    })();
    var SITE = [], PARENT = {};
    tree.forEach(function (rz) { rz.affaires.forEach(function (af) { af.sites.forEach(function (s) { SITE.push(s.id); PARENT[s.id] = { affaire: af.id, reseau: rz.reseau, name: s.n }; }); }); });
    function afById(id) { for (var i = 0; i < tree.length; i++) for (var j = 0; j < tree[i].affaires.length; j++) if (tree[i].affaires[j].id === id) return { af: tree[i].affaires[j], rz: tree[i] }; return null; }

    // ----- index utilisateurs (rôle global + réseaux couverts) pour les managers -----
    var uindex = {};
    state.rows.forEach(function (r) {
      if (r.id_user == null) return;
      if (!uindex[r.id_user]) uindex[r.id_user] = { id: Number(r.id_user), name: [r.prenom, r.nom].filter(Boolean).join(' ') || ('#' + r.id_user), role: Number(r.user_role_id != null ? r.user_role_id : r.id_role), sites: {}, affaires: {}, reseaux: {} };
      if (r.id_site != null) { uindex[r.id_user].sites[Number(r.id_site)] = 1; var pp = PARENT[r.id_site]; if (pp) { uindex[r.id_user].affaires[pp.affaire] = 1; uindex[r.id_user].reseaux[pp.reseau] = 1; } }
    });
    // Directeurs de groupe = N+1 universel, même sans affectation USER_SITE : on les charge depuis USER.
    try {
      var _gd = await sb().from('USER').select('ID_User, prenom, nom, ID_Role, VN_VO').eq('ID_Role', 8);
      (_gd && _gd.data ? _gd.data : []).forEach(function (u) { var id = Number(u.ID_User); if (!uindex[id]) uindex[id] = { id: id, name: [u.prenom, u.nom].filter(Boolean).join(' ') || ('#' + id), role: 8, sites: {}, affaires: {}, reseaux: {} }; });
    } catch (e) {}
    // managers pertinents pour (réseau, rôle) : rôle strictement supérieur, couvrant le réseau
    // Candidats N+1 = la chaîne hiérarchique EXACTE du périmètre peint :
    //  - dir. site (2)   : a une ligne sur CE site
    //  - dir. plaque (6) : couvre l'AFFAIRE du site
    //  - dir. marque (7) : couvre le RÉSEAU du site
    //  - dir. groupe (8) : partout
    function managerCandidates(scope, roleId) {
      var rk = rank(roleId); if (rk == null) rk = -1;
      var siteId = scope.type === 'site' ? scope.ref : null;
      var aff = scope.type === 'site' ? (PARENT[scope.ref] ? PARENT[scope.ref].affaire : null) : (scope.type === 'affaire' ? scope.ref : null);
      var rez = scope.reseau;
      var out = [];
      Object.keys(uindex).forEach(function (uid) {
        var u = uindex[uid]; if (String(u.id) === String(target)) return;
        var ur = rank(u.role); if (ur == null || ur <= rk || u.role === 1) return; // admin hors chaîne
        var ok = false;
        if (u.role === 8) ok = true;            // directeur de groupe : N+1 universel
        else if (u.role === 2) ok = siteId != null && !!u.sites[siteId];
        else if (u.role === 6) ok = aff != null && !!u.affaires[aff];
        else if (u.role === 7) ok = rez != null && !!u.reseaux[rez];
        else ok = siteId != null && !!u.sites[siteId];
        if (ok) out.push(u);
      });
      out.sort(function (a, b) { return rank(a.role) - rank(b.role); }); // le plus proche d'abord
      return out;
    }
    // N+1 DÉDUIT (unique) : le supérieur le plus proche couvrant le périmètre.
    function deducedMgrForSite(siteId, role) { if (role === 8) return null; var c = managerCandidates({ type: 'site', ref: siteId, reseau: PARENT[siteId] ? PARENT[siteId].reseau : null }, role); return c.length ? c[0].id : null; }
    function deducedMgr(r) { if (r.role === 8) return null; var c = managerCandidates(r.scope, r.role); return c.length ? c[0].id : null; }
    function mgrName(id) { if (id == null) return ''; var u = uindex[id]; return u ? u.name : ('#' + id); }

    // ----- rôle principal du user (défaut du pinceau) -----
    var principalRole = Number(row.user_role_id != null ? row.user_role_id : row.id_role);
    if (!(principalRole in RANK)) principalRole = roles.length ? roles[roles.length - 1].id : null;
    function pickRoleId(a) { var c = [a.site_role_id, a.id_site_role, a.role_id, a.id_role, a.ID_Role].filter(function (x) { return x != null; })[0]; if (c != null) return Number(c); return roleIdByLabel(a.site_role_name || a.user_role_name); }

    // ----- état + présélection -----
    // rôle + N+1 existants par site (depuis USER_SITE)
    var siteRole0 = {}, siteMgr0 = {};
    state.rows.filter(function (r) { return String(r.id_user) === String(target); }).forEach(function (a) {
      if (a.id_site == null || !PARENT[a.id_site]) return;
      siteRole0[Number(a.id_site)] = pickRoleId(a);
      siteMgr0[Number(a.id_site)] = (a.manager_user_id != null && String(a.manager_user_id) !== String(target)) ? Number(a.manager_user_id) : null;
    });
    // N+1 initial d'une règle : le manager en base s'il est cohérent et uniforme, sinon le plus proche
    function initialMgr(scope, role, siteIds) {
      if (role === 8) return null;
      var cands = managerCandidates(scope, role); if (!cands.length) return null;
      var base = undefined, uniform = true;
      siteIds.forEach(function (id) { var m = siteMgr0[id]; if (base === undefined) base = m; else if (base !== m) uniform = false; });
      if (uniform && base != null && cands.some(function (u) { return u.id === base; })) return base;
      return cands[0].id;
    }
    // regroupe : réseau entier même rôle -> 1 règle réseau ; affaire entière -> 1 règle affaire ; sinon sites
    function groupRules(siteRole) {
      var out = [];
      function sameRole(ids) { var r0 = siteRole[ids[0]]; return ids.every(function (id) { return siteRole[id] === r0; }); }
      tree.forEach(function (rz) {
        var rzSites = []; rz.affaires.forEach(function (af) { af.sites.forEach(function (x) { rzSites.push(x.id); }); });
        var rzCov = rzSites.filter(function (id) { return siteRole[id] != null; });
        if (rzSites.length && rzCov.length === rzSites.length && sameRole(rzSites)) {
          out.push({ scope: { type: 'reseau', ref: rz.reseau, label: rz.reseau, reseau: rz.reseau }, role: siteRole[rzSites[0]], mgr: initialMgr({ type: 'reseau', ref: rz.reseau, reseau: rz.reseau }, siteRole[rzSites[0]], rzSites) });
          return;
        }
        rz.affaires.forEach(function (af) {
          var afSites = af.sites.map(function (x) { return x.id; });
          var afCov = afSites.filter(function (id) { return siteRole[id] != null; });
          if (afSites.length && afCov.length === afSites.length && sameRole(afSites)) {
            out.push({ scope: { type: 'affaire', ref: af.id, label: af.affaire, reseau: rz.reseau }, role: siteRole[afSites[0]], mgr: initialMgr({ type: 'affaire', ref: af.id, reseau: rz.reseau }, siteRole[afSites[0]], afSites) });
          } else {
            afCov.forEach(function (id) { out.push({ scope: { type: 'site', ref: id, label: PARENT[id].name, reseau: PARENT[id].reseau }, role: siteRole[id], mgr: initialMgr({ type: 'site', ref: id, reseau: PARENT[id].reseau }, siteRole[id], [id]) }); });
          }
        });
      });
      return out;
    }
    var rules = groupRules(siteRole0);
    rules.forEach(function (r) { r._saved = true; });
    var ui = { tab: 'perimeter', attachSel: {}, brushRole: principalRole, expanded: {}, search: '', saving: false, error: null };
    if (tree[0]) ui.expanded[tree[0].reseau] = true;
    rules.forEach(function (r) { if (r.scope.type === 'site') { var pp = PARENT[r.scope.ref]; if (pp) { ui.expanded[pp.reseau] = true; ui.expanded[pp.affaire] = true; } } else if (r.scope.type === 'affaire') { ui.expanded[r.scope.reseau] = true; } });

    // ----- résolution "le plus spécifique gagne" -----
    function effective(id) {
      var p = PARENT[id]; if (!p) return null; var best = null, rk = -1;
      rules.forEach(function (r) {
        var k = -1;
        if (r.scope.type === 'site' && r.scope.ref === id) k = 3;
        else if (r.scope.type === 'affaire' && r.scope.ref === p.affaire) k = 2;
        else if (r.scope.type === 'reseau' && r.scope.ref === p.reseau) k = 1;
        if (k > rk) { rk = k; best = r; }
      });
      return best;
    }
    function isCovered(id) { var e = effective(id); return !!(e && e.role !== 'none'); }
    function coveredSites() { return SITE.filter(function (id) { return isCovered(id); }); }
    function overridden() { return SITE.filter(function (id) { var p = PARENT[id], n = 0; rules.forEach(function (r) { if ((r.scope.type === 'site' && r.scope.ref === id) || (r.scope.type === 'affaire' && r.scope.ref === p.affaire) || (r.scope.type === 'reseau' && r.scope.ref === p.reseau)) n++; }); return n > 1; }); }
    // sites sans N+1 valide (obligatoire sauf directeur de groupe = rôle 8)
    function missingMgr() { return coveredSites().filter(function (id) { var e = effective(id); if (!e || e.role === 8) return false; return e.mgr == null; }); }

    function ruleWithin(r, type, ref, reseau) {
      if (type === 'reseau') return r.scope.reseau === ref;
      if (type === 'affaire') { if (r.scope.type === 'site') { var p = PARENT[r.scope.ref]; return p && p.affaire === ref; } if (r.scope.type === 'affaire') return r.scope.ref === ref; return false; }
      return r.scope.type === 'site' && r.scope.ref === ref;
    }
    // règle de niveau supérieur couvrant déjà ce scope (pour détecter une redondance / exception)
    function coveringRule(type, ref, reseau) {
      if (type === 'reseau') return null;
      if (type === 'affaire') return rules.filter(function (r) { return r.scope.type === 'reseau' && r.scope.ref === reseau; })[0] || null;
      var pp = PARENT[ref]; if (!pp) return null;
      var af = rules.filter(function (r) { return r.scope.type === 'affaire' && String(r.scope.ref) === String(pp.affaire); })[0];
      if (af) return af;
      return rules.filter(function (r) { return r.scope.type === 'reseau' && r.scope.ref === pp.reseau; })[0] || null;
    }
    function paint(type, ref, label, reseau) {
      var role = ui.brushRole;
      rules = rules.filter(function (r) { return !ruleWithin(r, type, ref, reseau); }); // retire les règles plus fines couvertes
      var sc = { type: type, ref: ref, reseau: reseau };
      var mgr = null; if (role !== 8) { var c = managerCandidates(sc, role); if (c.length) mgr = c[0].id; }
      var cover = coveringRule(type, ref, reseau);
      if (cover && cover.role === role && String(cover.mgr) === String(mgr)) { draw(); return; } // identique au niveau supérieur -> inutile
      rules.push({ scope: { type: type, ref: ref, label: label, reseau: reseau }, role: role, mgr: mgr, _just: true, _saved: false });
      draw();
    }
    function removeRule(idx) { rules.splice(idx, 1); draw(); }

    // ----- rendu -----
    function tint(c) { return c + '14'; }
    function swatches() {
      var h = '';
      roles.forEach(function (r) { h += '<span class="pe-sw ' + (String(ui.brushRole) === String(r.id) ? 'on' : '') + '" data-brush="' + r.id + '" style="--c:' + roleColor(r.id) + '"><span class="pe-c"></span>' + esc(r.label) + '</span>'; });
      return h;
    }
    function mtch(s, q) { return !q || (s.n || '').toLowerCase().indexOf(q) !== -1; }
    function mtchAf(af, q) { return !q || (af.affaire || '').toLowerCase().indexOf(q) !== -1 || af.sites.some(function (s) { return mtch(s, q); }); }
    function mtchRz(rz, q) { return !q || (rz.reseau || '').toLowerCase().indexOf(q) !== -1 || rz.affaires.some(function (af) { return mtchAf(af, q); }); }

    function siteRow(s) {
      var e = effective(s.id), painted = e && e.role !== 'none', excluded = e && e.role === 'none';
      var role = painted ? e.role : null;
      var ovr = (painted || excluded) && overridden().indexOf(s.id) !== -1 && e.scope.type !== 'reseau';
      var style = painted ? ('--role:' + roleColor(role) + ';--tint:' + tint(roleColor(role))) : '';
      var pill = painted ? (role != null ? '<span class="pe-pill" style="background:' + roleColor(role) + '1a;color:' + roleColor(role) + '">' + esc(roleLabel(role) || 'rôle ?') + '</span>' : '<span class="pe-pill warn">rôle ?</span>') : (excluded ? '<span class="pe-pill excl">exclu</span>' : '');
      return '<div class="pe-row site paintable ' + (painted ? 'painted' : '') + ' ' + (excluded ? 'excluded' : '') + ' ' + (s._just ? 'just' : '') + '" data-site="' + s.id + '" style="' + style + '"><span class="pe-bar"></span><span style="width:14px"></span><span class="pe-dot"></span><span class="pe-name">' + esc(s.n) + '</span>' + (ovr ? '<span class="pe-ov" title="Cette règle prime sur la règle de niveau supérieur pour ce site">exception</span>' : '') + pill + '</div>';
    }
    function afCount(af) { return af.sites.filter(function (s) { return isCovered(s.id); }).length; }
    function ruleOn(type, ref) { return rules.filter(function (r) { return r.scope.type === type && String(r.scope.ref) === String(ref); })[0]; }
    function nodePill(type, ref) { var r = ruleOn(type, ref); if (!r || r.role === 'none') return ''; var c = roleColor(r.role); return '<span class="pe-pill" style="background:' + c + '1a;color:' + c + '">' + esc(roleLabel(r.role)) + '</span>'; }

    function treeHtml() {
      var q = (ui.search || '').toLowerCase(), h = '';
      tree.forEach(function (rz) {
        if (!mtchRz(rz, q)) return;
        var open = ui.expanded[rz.reseau] || !!q;
        var nS = rz.affaires.reduce(function (a, af) { return a + af.sites.length; }, 0);
        var nC = rz.affaires.reduce(function (a, af) { return a + afCount(af); }, 0);
        h += '<div class="pe-node"><div class="pe-row reseau paintable" data-reseau="' + esc(rz.reseau) + '"><span class="pe-chev ' + (open ? 'open' : '') + '" data-exp="' + esc(rz.reseau) + '">&#9654;</span><span class="pe-dot"></span><span class="pe-name">' + esc(rz.reseau) + '</span>' + nodePill('reseau', rz.reseau) + '<span class="pe-cnt">' + nC + '/' + nS + '</span></div>';
        if (open) {
          h += '<div class="pe-kids">';
          rz.affaires.forEach(function (af) {
            if (!mtchAf(af, q)) return;
            var aopen = ui.expanded[af.id] || !!q;
            h += '<div class="pe-node"><div class="pe-row affaire paintable" data-affaire="' + esc(af.id) + '"><span class="pe-chev ' + (aopen ? 'open' : '') + '" data-exp="' + esc(af.id) + '">&#9654;</span><span class="pe-dot"></span><span class="pe-name">' + esc(af.affaire) + '</span>' + nodePill('affaire', af.id) + '<span class="pe-cnt">' + afCount(af) + '/' + af.sites.length + '</span></div>';
            if (aopen) { h += '<div class="pe-kids">'; af.sites.forEach(function (s) { if (mtch(s, q)) h += siteRow(s); }); h += '</div>'; }
            h += '</div>';
          });
          h += '</div>';
        }
        h += '</div>';
      });
      return h || '<div class="pe-empty">Aucun site.</div>';
    }
    function rulesHtml() {
      if (!rules.length) return '<div class="pe-empty">Aucune règle.<br>Choisissez un rôle puis peignez l\'organisation.</div>';
      return rules.map(function (r, idx) {
        var excl = r.role === 'none';
        var c = excl ? '#94a3b8' : roleColor(r.role);
        var scope = r.scope.type === 'reseau' ? ('Réseau ' + r.scope.label) : r.scope.type === 'affaire' ? ('Affaire ' + r.scope.label) : ('Site ' + r.scope.label);
        var ctrls;
        if (excl) { ctrls = '<div class="pe-ctrls"><span class="pe-exl">Exclu du périmètre</span></div>'; }
        else {
          var opts = roles.map(function (x) { return '<option value="' + x.id + '"' + (String(x.id) === String(r.role) ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('');
          var mgrLine;
          if (r.role === 8) { mgrLine = '<div class="pe-mgrfix top">Sommet — aucun N+1</div>'; }
          else {
            var cands = managerCandidates(r.scope, r.role);
            if (!cands.length) mgrLine = '<div class="pe-mgrfix need">N+1 introuvable — créez le supérieur sur ce périmètre</div>';
            else {
              var mopts = cands.map(function (u) { return '<option value="' + u.id + '"' + (String(u.id) === String(r.mgr) ? ' selected' : '') + '>' + esc(u.name) + ' — ' + esc(roleLabel(u.role)) + '</option>'; }).join('');
              mgrLine = '<div class="pe-mgrrow"><span class="pe-mgrlbl">N+1</span><select data-rmgr="' + idx + '">' + mopts + '</select></div>';
            }
          }
          ctrls = '<div class="pe-ctrls"><select class="pe-rsel" data-rrole="' + idx + '" title="Rôle">' + opts + '</select></div>' + mgrLine;
        }
        var eligible = (!excl && rank(r.role) > 0);
        var saved = r._saved === true;
        var teamBtn = eligible ? (saved ? '<button class="pe-team-btn" data-attachrule="' + idx + '" title="Rattacher des collaborateurs (N-1)">N-1</button>' : '<button class="pe-team-btn off" disabled title="Enregistrez d\'abord le périmètre pour rattacher des N-1">N-1</button>') : '';
        return '<div class="pe-rule" style="--role:' + c + '"><div class="pe-rhead"><span class="pe-scope">' + esc(scope) + '</span>' + teamBtn + '<button class="pe-del" data-del="' + idx + '">&times;</button></div>' + ctrls + '</div>';
      }).join('');
    }

    // ----- Onglet Équipe (N-1) : collaborateurs rattachables à ce manager -----




    function perimeterBody() {
      return '<div class="pe-body">'
        + '<div class="pe-left"><div class="pe-otop"><span class="pe-h">Organisation</span><span class="pe-hint">Choisissez un rôle, puis cliquez un <b>site</b>, une <b>affaire</b> ou un <b>réseau</b>.</span></div>'
        + '<div class="pe-search"><input data-search placeholder="Rechercher…" value="' + esc(ui.search) + '"></div>'
        + '<div class="pe-tree">' + treeHtml() + '</div></div>'
        + '<div class="pe-right">'
        + '<div class="pe-brush"><p class="pe-lab">Rôle</p><div class="pe-sws">' + swatches() + '</div>'
        + '<p class="pe-tip" data-tip></p></div>'
        + '<div class="pe-rules"><p class="pe-lab">Règles du périmètre <span class="pe-rc">' + rules.length + '</span></p>' + rulesHtml() + '</div>'
        + '</div></div>';
    }

    function ruleSites(r) {
      if (r.scope.type === 'site') return [r.scope.ref];
      if (r.scope.type === 'affaire') { var f = afById(r.scope.ref); return f ? f.af.sites.map(function (s) { return s.id; }) : []; }
      var out = []; tree.forEach(function (rz) { if (rz.reseau === r.scope.ref) rz.affaires.forEach(function (af) { af.sites.forEach(function (s) { out.push(s.id); }); }); }); return out;
    }
    function afLabel(ak) { var f = afById(ak); return f ? f.af.affaire : ('Affaire ' + ak); }
    // Candidats groupés par AFFAIRE puis SITE (arbre) pour éviter l'empilement.
    function ruleAttachTree(r) {
      var sites = ruleSites(r), xr = rank(r.role), byAff = {};
      sites.forEach(function (S) {
        var users = [];
        state.rows.forEach(function (row2) {
          if (row2.id_user == null || String(row2.id_user) === String(target) || Number(row2.id_site) !== S) return;
          var ly = pickRoleId(row2); if (rank(ly) == null || xr == null || rank(ly) >= xr) return;
          var cur = row2.manager_user_id != null ? Number(row2.manager_user_id) : null;
          users.push({ id: Number(row2.id_user), name: [row2.prenom, row2.nom].filter(Boolean).join(' ') || ('#' + row2.id_user), role: Number(row2.user_role_id != null ? row2.user_role_id : ly), vnvo: row2.vn_vo || row2.VN_VO || '', cur: cur, alreadyX: String(cur) === String(target) });
        });
        if (!users.length) return;
        users.sort(function (a, b) { return (rank(b.role) - rank(a.role)) || byLocale(String(a.vnvo), String(b.vnvo)) || byLocale(a.name, b.name); });
        var p = PARENT[S]; var ak = p ? p.affaire : '—';
        if (!byAff[ak]) byAff[ak] = { id: ak, name: afLabel(ak), sites: [] };
        byAff[ak].sites.push({ id: S, name: p ? p.name : ('Site ' + S), users: users });
      });
      return Object.keys(byAff).map(function (k) { return byAff[k]; }).sort(function (a, b) { return byLocale(a.name, b.name); });
    }
    function openAttach(idx) {
      var r = rules[idx];
      var scopeLabel = r.scope.type === 'reseau' ? ('Réseau ' + r.scope.label) : r.scope.type === 'affaire' ? ('Affaire ' + r.scope.label) : ('Site ' + r.scope.label);
      var groups = ruleAttachTree(r);
      var sel = {}, exp = {}, saving = false, err = null;
      groups.forEach(function (g) { exp[g.id] = (groups.length === 1); }); // 1 affaire -> ouverte ; sinon repliées
      var ov2 = overlay('<div class="oda-modal-head"><div><div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a98c5;font-weight:700;margin-bottom:3px">Rattacher des N-1 · ' + esc(scopeLabel) + '</div><h2 style="margin:0;font-size:20px;font-weight:800;color:#1f4a85">' + esc(fullName(row)) + ' <span style="font-size:13px;font-weight:600;color:#7a98c5">— ' + esc(roleLabel(r.role)) + '</span></h2></div><button class="oda-iconbtn" data-x3>' + ICON.x + '</button></div><div class="oda-modal-body" style="padding:0"><div class="pe-attach"></div></div>');
      var m2 = ov2.querySelector('.oda-modal'); if (m2) { m2.style.maxWidth = 'min(680px,96vw)'; m2.style.width = '100%'; }
      function siteKeys(s) { return s.users.filter(function (u) { return !u.alreadyX; }).map(function (u) { return u.id + '_' + s.id; }); }
      function affKeys(g) { var out = []; g.sites.forEach(function (s) { out = out.concat(siteKeys(s)); }); return out; }
      function drawA() {
        var host = ov2.querySelector('.pe-attach');
        var body;
        if (!groups.length) body = '<div class="pe-teamwrap"><div class="pe-empty">Aucun collaborateur rattachable sur ce périmètre.<br>Ils doivent y travailler avec un rôle inférieur à ' + esc(roleLabel(r.role)) + '.</div></div>';
        else body = '<div class="pe-teamwrap"><div class="pe-team-head">Ces collaborateurs auront <b>' + esc(fullName(row)) + '</b> comme N+1. Un lien existant sera <b>remplacé</b>.</div>' + groups.map(function (g) {
          var open = !!exp[g.id];
          var aKeys = affKeys(g), affAllOn = aKeys.length > 0 && aKeys.every(function (k) { return sel[k]; });
          var totU = g.sites.reduce(function (a, s) { return a + s.users.length; }, 0);
          var head = '<div class="pa-affh" data-aexp="' + esc(g.id) + '"><span class="pe-chev ' + (open ? 'open' : '') + '">&#9654;</span><span class="pa-affname">' + esc(g.name) + '</span><span class="pa-affcnt">' + g.sites.length + ' site(s) · ' + totU + '</span>' + (aKeys.length ? '<label class="pe-all"><input type="checkbox" data-allaff="' + esc(g.id) + '"' + (affAllOn ? ' checked' : '') + '><span>Tous</span></label>' : '') + '</div>';
          var inner = '';
          if (open) inner = g.sites.map(function (s) {
            var sKeys = siteKeys(s), siteAllOn = sKeys.length > 0 && sKeys.every(function (k) { return sel[k]; });
            var rows = s.users.map(function (u) {
              var key = u.id + '_' + s.id, checked = sel[key];
              var cur = u.alreadyX ? '<span class="pe-cur ok">déjà rattaché</span>' : (u.cur != null ? '<span class="pe-cur warn">actuellement : ' + esc(mgrName(u.cur)) + '</span>' : '<span class="pe-cur">sans N+1</span>');
              var uc = roleColor(u.role);
              return '<label class="pe-site ' + (u.alreadyX ? 'done' : '') + '"><input type="checkbox" data-a="' + key + '"' + (checked ? ' checked' : '') + (u.alreadyX ? ' disabled' : '') + '><span class="sn">' + esc(u.name) + '</span><span class="ur" style="background:' + uc + '1a;color:' + uc + '">' + esc(roleLabel(u.role)) + (u.vnvo ? ' · ' + esc(u.vnvo) : '') + '</span>' + cur + '</label>';
            }).join('');
            var siteAll = sKeys.length ? '<label class="pe-all"><input type="checkbox" data-allsite="' + s.id + '"' + (siteAllOn ? ' checked' : '') + '><span>Tous</span></label>' : '';
            return '<div class="pe-cand"><div class="pe-cand-h"><span class="nm">' + esc(s.name) + '</span><span class="rl" style="background:' + roleColor(r.role) + '1a;color:' + roleColor(r.role) + '">' + esc(roleLabel(r.role)) + '</span>' + siteAll + '</div><div class="pe-sites">' + rows + '</div></div>';
          }).join('');
          return '<div class="pa-aff">' + head + (open ? '<div class="pa-body">' + inner + '</div>' : '') + '</div>';
        }).join('') + '</div>';
        host.innerHTML = body + '<div class="pe-ft">' + (err ? '<span class="pe-err">' + esc(err) + '</span>' : '<span class="pe-cover"></span>') + '<button class="oda-btn ghost" data-x3>Annuler</button><button class="oda-btn primary" data-asave' + (saving ? ' disabled' : '') + '>' + (saving ? 'Rattachement…' : 'Rattacher') + '</button></div>';
        ov2.querySelectorAll('[data-x3]').forEach(function (el) { el.onclick = function () { ov2.remove(); }; });
        ov2.querySelectorAll('[data-aexp]').forEach(function (el) { el.onclick = function (e) { if (e.target.closest('.pe-all')) return; var id = el.getAttribute('data-aexp'); exp[id] = !exp[id]; drawA(); }; });
        ov2.querySelectorAll('input[data-a]').forEach(function (el) { el.onchange = function () { sel[el.getAttribute('data-a')] = el.checked; drawA(); }; });
        ov2.querySelectorAll('input[data-allsite]').forEach(function (el) { el.onchange = function () { var sid = el.getAttribute('data-allsite'); groups.forEach(function (g) { g.sites.forEach(function (s) { if (String(s.id) === String(sid)) s.users.forEach(function (u) { if (!u.alreadyX) sel[u.id + '_' + s.id] = el.checked; }); }); }); drawA(); }; });
        ov2.querySelectorAll('input[data-allaff]').forEach(function (el) { el.onchange = function () { var aid = el.getAttribute('data-allaff'); var g = groups.filter(function (x) { return String(x.id) === String(aid); })[0]; if (g) g.sites.forEach(function (s) { s.users.forEach(function (u) { if (!u.alreadyX) sel[u.id + '_' + s.id] = el.checked; }); }); drawA(); }; });
        ov2.querySelectorAll('[data-asave]').forEach(function (el) { el.onclick = saveA; });
      }
      async function saveA() {
        if (saving) return;
        var map = {}; Object.keys(sel).forEach(function (k) { if (!sel[k]) return; var pr = k.split('_'); if (!map[pr[0]]) map[pr[0]] = []; map[pr[0]].push(Number(pr[1])); });
        var attachments = Object.keys(map).map(function (uid) { return { user_id: Number(uid), id_sites: map[uid] }; });
        if (!attachments.length) { err = 'Sélectionnez au moins un collaborateur / site.'; drawA(); return; }
        saving = true; err = null; drawA();
        var res = await callFn(FN_SUB, { manager_user_id: target, attachments: attachments });
        if (res && res.error) { saving = false; err = res.error; drawA(); return; }
        attachments.forEach(function (a) { a.id_sites.forEach(function (sid) { state.rows.forEach(function (rr) { if (String(rr.id_user) === String(a.user_id) && Number(rr.id_site) === sid) rr.manager_user_id = target; }); }); });
        toast('Collaborateur(s) rattaché(s)'); ov2.remove(); draw();
      }
      drawA();
    }

    function draw() {
      var host = ov.querySelector('.pe-wrap');
      var footer = '<div class="pe-ft">' + (ui.error ? '<span class="pe-err">' + esc(ui.error) + '</span>' : '<span class="pe-cover"><b>' + coveredSites().length + '</b> site(s) couvert(s)' + (missingMgr().length ? ' — <span class="pe-warn">' + missingMgr().length + ' N+1 à définir</span>' : (overridden().length ? ' — <span class="pe-warn">' + overridden().length + ' exception(s)</span>' : '')) + '</span>')
        + '<button class="oda-btn ghost" data-x2>Annuler</button><button class="oda-btn primary" data-save' + (ui.saving ? ' disabled' : '') + '>' + (ui.saving ? 'Enregistrement…' : 'Enregistrer le périmètre') + '</button></div>';
      host.innerHTML = perimeterBody() + footer;
      var tip = ov.querySelector('[data-tip]'); if (tip) tip.innerHTML = '<b>' + esc(roleLabel(ui.brushRole)) + '</b> sera appliqué. Le N+1 se règle par règle ; le bouton <b>N-1</b> rattache des collaborateurs.';
      bind();
    }

    function bind() {
      ov.querySelectorAll('[data-x2]').forEach(function (el) { el.onclick = function () { ov.remove(); }; });
      ov.querySelectorAll('[data-exp]').forEach(function (el) { el.onclick = function (e) { e.stopPropagation(); var k = el.getAttribute('data-exp'); ui.expanded[k] = !ui.expanded[k]; draw(); }; });
      ov.querySelectorAll('[data-site]').forEach(function (el) { el.onclick = function () { var id = Number(el.getAttribute('data-site')); paint('site', id, PARENT[id].name, PARENT[id].reseau); }; });
      ov.querySelectorAll('[data-affaire]').forEach(function (el) { el.onclick = function (e) { if (e.target.closest('[data-exp]')) return; var id = el.getAttribute('data-affaire'); var f = afById(id); if (f) paint('affaire', id, f.af.affaire, f.rz.reseau); }; });
      ov.querySelectorAll('[data-reseau]').forEach(function (el) { el.onclick = function (e) { if (e.target.closest('[data-exp]')) return; var id = el.getAttribute('data-reseau'); paint('reseau', id, id, id); }; });
      ov.querySelectorAll('[data-brush]').forEach(function (el) { el.onclick = function () { var v = el.getAttribute('data-brush'); ui.brushRole = (v === 'none') ? 'none' : Number(v); draw(); }; });
      ov.querySelectorAll('[data-del]').forEach(function (el) { el.onclick = function () { removeRule(Number(el.getAttribute('data-del'))); }; });
      ov.querySelectorAll('[data-rrole]').forEach(function (el) { el.onchange = function () { var i = Number(el.getAttribute('data-rrole')); rules[i].role = Number(el.value); rules[i]._saved = false; if (rules[i].role === 8) { rules[i].mgr = null; } else { var c = managerCandidates(rules[i].scope, rules[i].role); if (!c.some(function (u) { return u.id === rules[i].mgr; })) rules[i].mgr = (c.length ? c[0].id : null); } draw(); }; });
      ov.querySelectorAll('[data-rmgr]').forEach(function (el) { el.onchange = function () { var i = Number(el.getAttribute('data-rmgr')); rules[i].mgr = el.value === '' ? null : Number(el.value); rules[i]._saved = false; draw(); }; });
      var srch = ov.querySelector('[data-search]'); if (srch) srch.oninput = function (e) { ui.search = e.target.value; draw(); setTimeout(function () { var s = ov.querySelector('[data-search]'); if (s) { s.focus(); var v = s.value; s.value = ''; s.value = v; } }, 0); };
      ov.querySelectorAll('[data-save]').forEach(function (el) { el.onclick = doSave; });
      ov.querySelectorAll('[data-attachrule]').forEach(function (el) { el.onclick = function (e) { e.stopPropagation(); openAttach(Number(el.getAttribute('data-attachrule'))); }; });
    }

    async function doSave() {
      if (ui.saving) return;
      var covered = coveredSites();
      var missing = covered.filter(function (id) { var e = effective(id); return e.role == null; });
      if (missing.length) { ui.error = missing.length + ' site(s) sans rôle valide. Repeignez-les.'; draw(); return; }
      var nm = missingMgr();
      if (nm.length) { ui.error = nm.length + ' site(s) sans supérieur trouvé. Créez le directeur de l\'échelon au-dessus sur ce périmètre.'; draw(); return; }
      ui.saving = true; ui.error = null; draw();
      var assignments = covered.map(function (id) { var e = effective(id); return { id_site: id, id_role: Number(e.role), manager_user_id: e.role === 8 ? null : (e.mgr != null ? Number(e.mgr) : null) }; });
      var res = await callFn(FN_PERI, { target_user_id: target, assignments: assignments });
      if (res && res.error) { ui.saving = false; ui.error = res.error; draw(); return; }
      toast('Périmètre enregistré'); await loadUsers(); ov.remove();
    }

    draw();
  }

  function injectPeriCss() {
    var d = frontDoc(); if (d.getElementById('oda-peri-css')) return;
    var st = d.createElement('style'); st.id = 'oda-peri-css';
    st.textContent = [
      '.pe-wrap{--bl:#2a5ea9;--bldk:#1f4a85;--ink:#16233d;--mut:#5a6b8a;--line:#dde5f0;display:flex;flex-direction:column;height:min(640px,76vh);font-family:Inter,system-ui,sans-serif;color:var(--ink)}',
      '.pe-wrap *{box-sizing:border-box}',
      '.pe-body{flex:1;display:flex;min-height:0}',
      '.pe-left{flex:1 1 56%;display:flex;flex-direction:column;border-right:1px solid var(--line);min-width:0}',
      '.pe-otop{padding:12px 18px 6px;display:flex;flex-direction:column;gap:2px}',
      '.pe-h{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}',
      '.pe-hint{font-size:12px;color:var(--mut)}.pe-hint b{color:var(--bl)}',
      '.pe-search{padding:6px 16px 10px}',
      '.pe-search input{width:100%;border:1.5px solid var(--line);border-radius:10px;padding:9px 12px;font:inherit;font-size:13.5px;color:var(--ink);outline:none}',
      '.pe-search input:focus{border-color:var(--bl)}',
      '.pe-tree{flex:1;overflow:auto;padding:2px 12px 14px}',
      '.pe-node{margin:2px 0}',
      '.pe-row{display:flex;align-items:center;gap:9px;padding:8px 11px;border-radius:11px;cursor:pointer;position:relative;border:1px solid transparent;transition:background .15s,box-shadow .15s}',
      '.pe-row:hover{background:#f4f8fe}',
      '.pe-row.paintable:hover{box-shadow:inset 0 0 0 1.5px #bcd2f0}',
      '.pe-chev{width:14px;color:#93a6c6;font-size:10px;flex:0 0 auto;transition:transform .15s;text-align:center}.pe-chev.open{transform:rotate(90deg)}',
      '.pe-dot{width:9px;height:9px;border-radius:50%;background:#cbd7ea;flex:0 0 auto}',
      '.pe-name{flex:1;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.pe-row.reseau .pe-name{font-weight:700}.pe-row.affaire .pe-name{font-weight:600;color:#334b70}.pe-row.site .pe-name{color:#3d5578}',
      '.pe-pill{font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;flex:0 0 auto;white-space:nowrap}',
      '.pe-pill.warn{background:#fdeede;color:#b06a2e}.pe-pill.excl{background:#eef1f6;color:#8494ad}.pe-pill.mixed,.pe-pill.mixed{background:#eef2f8;color:#7286a8}',
      '.pe-cnt{font-family:ui-monospace,monospace;font-size:11px;color:#93a6c6;flex:0 0 auto}',
      '.pe-kids{margin-left:15px;padding-left:9px;border-left:1.5px dashed #e4ebf5}',
      '.pe-row.site.painted{background:var(--tint)}',
      '.pe-row.site .pe-bar{position:absolute;left:0;top:6px;bottom:6px;width:4px;border-radius:4px;background:transparent;transition:background .2s}',
      '.pe-row.site.painted .pe-bar{background:var(--role)}.pe-row.site.painted .pe-dot{background:var(--role)}',
      '.pe-row.site.excluded{opacity:.55}.pe-row.site.excluded .pe-name{text-decoration:line-through;text-decoration-color:#c3cfe2}',
      '.pe-row.site.just{animation:pe-dab .5s ease}',
      '@keyframes pe-dab{0%{transform:scale(.98);filter:saturate(1.6)}100%{transform:scale(1)}}',
      '.pe-ov{font-size:10.5px;color:#b06a2e;font-weight:600;flex:0 0 auto}',
      '.pe-right{flex:1 1 44%;display:flex;flex-direction:column;min-width:0;background:#fbfcfe}',
      '.pe-brush{padding:15px 16px;border-bottom:1px solid var(--line)}',
      '.pe-lab{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);font-weight:700;margin:0 0 8px;display:flex;justify-content:space-between}',
      '.pe-rc{font-family:ui-monospace,monospace;color:#93a6c6}',
      '.pe-sws{display:flex;flex-wrap:wrap;gap:6px}',
      '.pe-sw{display:inline-flex;align-items:center;gap:6px;border:1.5px solid var(--line);background:#fff;border-radius:9px;padding:6px 10px;cursor:pointer;font-size:12px;font-weight:600;color:#40527a}',
      '.pe-sw .pe-c{width:11px;height:11px;border-radius:3px;background:var(--c,#cbd7ea)}',
      '.pe-sw.auto .pe-c{background:conic-gradient(#3b82c4,#12a594,#7c5cd6,#e0803b,#d14b8f,#24406e,#3b82c4)}',
      '.pe-sw.erase .pe-c{background:repeating-linear-gradient(45deg,#e2e8f0,#e2e8f0 3px,#fff 3px,#fff 6px);border:1px solid #cbd5e1}',
      '.pe-sw:hover{border-color:#bcd2f0}.pe-sw.on{border-color:var(--bl);background:#eef4fc;color:var(--bldk)}',
      '.pe-mgrsel input{width:100%;border:1.5px solid var(--line);border-radius:10px;padding:10px 12px;font:inherit;font-size:14px;color:var(--ink);background:#fff;outline:none}',
      '.pe-mgrsel input:focus{border-color:var(--bl)}',
      '.pe-mgrchip{display:inline-flex;align-items:center;gap:8px;background:var(--bl);color:#fff;border-radius:9px;padding:8px 12px;font-size:13px;font-weight:600}',
      '.pe-mgrchip button{border:none;background:none;color:#cfe0f5;cursor:pointer;font-size:15px}.pe-mgrchip button:hover{color:#fff}',
      '.pe-sugg{position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 30px rgba(20,40,80,.18);z-index:5;margin-top:3px;max-height:210px;overflow:auto}',
      '.pe-sugg-i{padding:8px 12px;cursor:pointer;display:flex;flex-direction:column;gap:1px}.pe-sugg-i:hover{background:#eef4fc}.pe-sugg-i .nm{font-size:13px;font-weight:700}.pe-sugg-i .mt{font-size:11px;color:var(--mut)}',
      '.pe-tip{font-size:12px;color:var(--mut);line-height:1.5;margin:11px 0 0}.pe-tip b{color:var(--bldk)}',
      '.pe-rules{flex:1;overflow:auto;padding:13px 16px}',
      '.pe-rule{display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-left:4px solid var(--role);border-radius:11px;padding:9px 12px;margin-bottom:7px;background:#fff}',
      '.pe-rtxt{flex:1;min-width:0;font-size:12.5px;line-height:1.45}.pe-rn{font-weight:700}.pe-scope{font-weight:600}.pe-mut{color:var(--mut)}',
      '.pe-del{border:none;background:none;color:#c3cfe2;cursor:pointer;font-size:16px}.pe-del:hover{color:#d1495b}',
      '.pe-empty{border:1.5px dashed #d5e0ef;border-radius:11px;padding:20px;text-align:center;color:#93a6c6;font-size:13px;line-height:1.6}',
      '.pe-ft{display:flex;align-items:center;gap:12px;padding:12px 16px;border-top:1px solid var(--line);background:#fff}',
      '.pe-cover{flex:1;font-size:13px}.pe-cover b{font-family:ui-monospace,monospace;font-size:16px;color:var(--bldk)}',
      '.pe-warn{color:#b06a2e;font-size:12px}.pe-err{flex:1;color:#c0392b;font-size:12.5px;font-weight:600}',
      '.pe-rule{flex-direction:column;align-items:stretch;gap:7px}',
      '.pe-rhead{display:flex;align-items:center;gap:8px}.pe-rhead .pe-scope{flex:1;font-weight:600;font-size:12.5px}',
      '.pe-ctrls{display:flex;gap:6px}',
      '.pe-ctrls select{flex:1;min-width:0;border:1.5px solid var(--line);border-radius:8px;padding:7px 8px;font:inherit;font-size:12px;color:var(--bldk);background:#fff;cursor:pointer}',
      '.pe-ctrls select option{color:var(--bldk)}',
      '.pe-ctrls select:focus{outline:none;border-color:var(--bl)}',
      '.pe-rsel{max-width:42%}',
      '.pe-exl{font-size:12px;color:#64748b;font-style:italic}',
      '.pe-nomgr{font-size:12px;color:#64748b;font-style:italic;padding:6px 2px}',
      '.pe-mgrfix{font-size:12.5px;color:var(--mut);padding:3px 2px 0}.pe-mgrfix b{color:var(--bldk)}',
      '.pe-mgrfix .rl2{font-size:10.5px;color:var(--bl);background:#eef4fc;border-radius:20px;padding:1px 7px;margin-left:4px}',
      '.pe-mgrfix.top{font-style:italic}.pe-mgrfix.need{color:#b06a2e}',
      '.pe-mgrrow{display:flex;align-items:center;gap:8px;margin-top:7px}',
      '.pe-mgrlbl{font-size:11px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}',
      '.pe-mgrrow select{flex:1;min-width:0;border:1.5px solid var(--line);border-radius:8px;padding:7px 8px;font:inherit;font-size:12px;color:var(--bldk);background:#fff;cursor:pointer}',
      '.pe-mgrrow select:focus{outline:none;border-color:var(--bl)}',
      '.pe-rsel{max-width:none !important}',
      '.pe-tabs{display:flex;gap:2px;padding:10px 16px 0}',
      '.pe-tab{border:none;background:none;padding:9px 14px;font:inherit;font-size:13px;font-weight:700;color:var(--mut);cursor:pointer;border-bottom:2.5px solid transparent}',
      '.pe-tab.on{color:var(--bldk);border-bottom-color:var(--bl)}',
      '.pe-teamwrap{flex:1;overflow:auto;padding:16px 18px;border-top:1px solid var(--line)}',
      '.pe-team-head{font-size:12.5px;color:var(--mut);line-height:1.55;margin-bottom:14px}.pe-team-head b{color:var(--bldk)}',
      '.pe-cand{border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:12px}',
      '.pe-cand-h{display:flex;align-items:center;gap:10px;padding:11px 14px;background:#f7faff;border-bottom:1px solid var(--line)}',
      '.pe-cand-h .nm{font-weight:800;font-size:16px;color:var(--bldk)}',
      '.pe-cand-h .rl{font-size:11px;font-weight:600;background:#eef4fc;color:var(--bldk);border-radius:20px;padding:2px 9px}',
      '.pe-sites{display:flex;flex-direction:column;padding:4px 6px}',
      '.pe-site{display:flex;align-items:center;gap:11px;font-size:13px;cursor:pointer;padding:9px 8px;border-radius:8px}',
      '.pe-site:hover{background:#f4f8fe}.pe-site.done{opacity:.55;cursor:default}',
      '.pe-site + .pe-site{border-top:1px solid #f1f5fb}',
      '.pe-site input{width:17px;height:17px;accent-color:var(--bl);cursor:pointer;flex:0 0 auto}',
      '.pe-site .sn{font-weight:600;color:var(--bldk)}',
      '.pe-cur{font-size:11px;color:var(--mut)}.pe-cur.warn{color:#b06a2e}.pe-cur.ok{color:#12a594}',
      '.pe-team-btn{border:1px solid var(--line);background:#fff;color:var(--bl);border-radius:7px;font:inherit;font-size:10.5px;font-weight:800;letter-spacing:.04em;padding:3px 8px;cursor:pointer;margin-right:2px}',
      '.pe-team-btn:hover{background:#eef4fc;border-color:#bcd2f0}',
      '.pe-team-btn.off{opacity:.45;cursor:not-allowed;color:var(--mut);border-style:dashed}.pe-team-btn.off:hover{background:#fff}',
      '.pe-attach{--bl:#2a5ea9;--bldk:#1f4a85;--mut:#5a6b8a;--line:#dde5f0;display:flex;flex-direction:column;height:min(560px,72vh)}',
      '.pa-aff{border:1px solid var(--line);border-radius:12px;margin-bottom:10px;overflow:hidden}',
      '.pa-affh{display:flex;align-items:center;gap:9px;padding:11px 14px;background:#eef3fb;cursor:pointer}',
      '.pa-affh .pe-chev{color:#7a98c5}',
      '.pa-affname{font-weight:800;font-size:15px;color:var(--bldk);flex:1}',
      '.pa-affcnt{font-size:11px;color:var(--mut);font-family:ui-monospace,monospace}',
      '.pa-affh .pe-all{margin-left:8px}',
      '.pa-body{padding:6px}',
      '.pa-body .pe-cand{border:1px solid #edf1f7;margin-bottom:6px}',
      '.pa-body .pe-cand-h{background:#fbfcfe}',
      '.pe-cand-h .nm{font-size:16px}',
      '.pe-all{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--bl);cursor:pointer}',
      '.pe-all input{width:16px;height:16px;accent-color:var(--bl);cursor:pointer}',
      '.pe-site .ur{font-size:11px;color:var(--mut);background:#eef2f8;border-radius:20px;padding:2px 9px;font-weight:600}',
      '.pe-site .pe-cur{margin-left:auto;text-align:right}',
      '.pe-ctrls select.pe-need{border-color:#e0803b;background:#fff8f1}',
      '.pe-mwarn{font-size:11px;color:#b06a2e;margin-top:2px}',
      '@media(max-width:780px){.pe-wrap{height:82vh}.pe-body{flex-direction:column}.pe-left{border-right:none;border-bottom:1px solid var(--line)}}'
    ].join('');
    d.head.appendChild(st);
  }

  /* --------------------------------------------------------- interactions */
  function bindGlobal() {
    var d = frontDoc();
    root.addEventListener('change', function (e) {
      var sel = e.target.closest('select[data-filter]'); if (!sel) return;
      var f = sel.getAttribute('data-filter'); state.filters[f] = sel.value;
      if (f === 'reseau') { state.filters.affaire = ''; state.filters.site = ''; }
      if (f === 'affaire') { state.filters.site = ''; }
      render();
    });
    root.addEventListener('click', function (e) {
      var create = e.target.closest('[data-action="create-user"]'); if (create) { modalCreate(); return; }
      var reset = e.target.closest('[data-action="reset-filters"]'); if (reset) { state.filters = { reseau: '', affaire: '', site: '' }; render(); return; }
      var grp = e.target.closest('[data-exp]'); if (grp) { var k = grp.getAttribute('data-exp'); state.expanded[k] = !isOpen(k); render(); return; }
      var mb = e.target.closest('[data-menu]'); if (mb) { e.stopPropagation(); var row = rowByKey(mb.getAttribute('data-menu')); if (row) openMenu(mb, row); return; }
    });
    d.addEventListener('click', function (e) { if (openMenuEl && !e.target.closest('.oda-menu') && !e.target.closest('[data-menu]')) closeMenu(); });
    frontWin().addEventListener('resize', closeMenu, { passive: true });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeMenu(); var ov = d.querySelector('.oda-overlay'); if (ov) ov.remove(); } });
  }
  function bindNarrow() {
    var W = frontWin();
    function apply() { if (!root) return; var w = 0; try { w = root.getBoundingClientRect().width || root.clientWidth || 0; } catch (e) {} if (!w) return; root.classList.toggle('oda-narrow', w <= 700); }
    apply(); [120, 400, 900].forEach(function (dl) { setTimeout(apply, dl); });
    try { if ('ResizeObserver' in W) { if (window.__odaRO) { try { window.__odaRO.disconnect(); } catch (e) {} } window.__odaRO = new W.ResizeObserver(apply); window.__odaRO.observe(root); } else { W.addEventListener('resize', apply); } } catch (e) {}
  }

  /* ------------------------------------------------------- gate + démarrage */
  async function currentRole() {
    var role = userRole();
    for (var i = 0; i < 15 && role == null; i++) { await sleep(150); role = userRole(); }
    if (role != null) return role;
    try {
      var c = sb(); if (!c) return null;
      var u = await c.auth.getUser(); var uid = u && u.data && u.data.user ? u.data.user.id : null; if (!uid) return null;
      var res = await c.from(TABLE_VIEW).select('user_role_id').eq('auth_uid', uid).limit(1);
      var r0 = res && res.data && res.data[0]; var n = r0 ? Number(r0.user_role_id) : NaN;
      return Number.isFinite(n) ? n : null;
    } catch (e) { return null; }
  }
  async function checkAdmin() { var role = await currentRole(); state.isAdmin = role != null ? (ADMIN_ROLES.indexOf(role) !== -1) : false; }

  function seedEditorPreview() {
    // Aperçu éditeur : jeu d'exemple pour visualiser la mise en page quand aucune
    // donnée réelle n'est disponible (pas de session Supabase en preview).
    var mk = function (id, prenom, nom, role, vnvo) {
      return {
        user_site_unique_id: 900 + id, id_user: 900 + id,
        prenom: prenom, nom: nom, email: (prenom[0] + '.' + nom).toLowerCase() + '@oropra.com',
        telephone: '04 74 00 00 0' + id, voip_number: '80' + id,
        email_account_status: id % 3 === 0 ? 'pending' : 'connected',
        reseau: 'Renault', affaire: 'Auto Bourg', site_name: 'Bourg-en-Bresse VO', id_site: 501,
        id_affaire: 10, site_role_name: role, user_role_name: role, fonction: role, vn_vo: vnvo, is_admin: false,
        manager_user_id: role === 'Chef des ventes' ? 901 : 902,
        manager_prenom: 'Jean', manager_nom: 'Duval'
      };
    };
    state.rows = [
      mk(1, 'Jean', 'Duval', 'Chef des ventes', 'VNVO'),
      mk(2, 'Sandra', 'Marin', 'Vendeur', 'VO'),
      mk(3, 'Thomas', 'Lefranc', 'Vendeur', 'VN'),
      mk(4, 'Claire', 'Vasseur', 'Vendeur', 'VO')
    ];
    state.filters = { reseau: 'Renault', affaire: 'Auto Bourg', site: 'Bourg-en-Bresse VO' };
    detectGroupFields();
  }

  async function start() {
    injectStyle(); bindGlobal(); bindNarrow();
    render();
    if (inEditor()) {
      state.isAdmin = true;         // ne pas bloquer l'aperçu éditeur
      loadRoles();
      await loadUsers();            // tente le chargement réel si session dispo
      if (!state.rows.length && !state.error) { /* données réelles OK mais vides */ }
      if (!state.rows.length) { seedEditorPreview(); render(); }
      return;
    }
    await checkAdmin();
    if (state.isAdmin === false) { render(); return; }
    loadRoles();
    await loadUsers();
  }

  /* ----------------------------------------------------------- montage DOM */
  function pageHost() {
    var d = frontDoc();
    return d.querySelector('.ww-page-content') || d.querySelector('[class*="ww-page-content"]') || d.querySelector('.ww-page') || d.querySelector('main') || d.querySelector('#app > *') || null;
  }
  function cleanStrayRoot() { var d = frontDoc(), el = d.getElementById(MOUNT_ID); if (el && el.parentElement === d.body) { try { el.remove(); } catch (e) {} } }
  function ensureRoot() {
    var d = frontDoc(), el = d.getElementById(MOUNT_ID);
    if (el && el.parentElement !== d.body) return el;
    cleanStrayRoot(); var host = pageHost(); if (!host) return null;
    el = d.createElement('div'); el.id = MOUNT_ID; host.appendChild(el); return el;
  }
  // Boot : le loader fournit __anchor et possède le cycle de vie (y compris le
  // re-montage à chaque navigation SPA). Pas de garde de version (elle bloquerait
  // le re-rendu au retour sur la page), pas d'attente, pas d'ensureRoot.
  root = __anchor;
  await start();
  }
});