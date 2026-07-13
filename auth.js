// ============================================================================
//  AUTHENTIFICATION — module One Data (OD.define)  v1 (étape A)
//  Branding via ctx.tenant ; rendu dans __anchor ; login via ctx.supabase
//  (repli plugin). bootTopNav()/bootHistoClient() CONSERVÉS (étape B).
// ============================================================================
OD.define('auth', {
  mount(__anchor, ctx) {
    // --- branding fourni par le loader (control plane) ---
    const TENANT = (ctx && ctx.tenant) || window.__OD_TENANT__ || {};
    __anchor.id = 'oropra-auth';
  /* =========================================================================
     OROPRA — Page d'authentification  (100% Supabase, sans Heroku)
     À poser sur la page /authentification :  <div id="oropra-auth"></div>
     Charger ce fichier en on-page-load de cette page.

     Écrans (une seule carte, bascule de vue) :
       - login   : connexion email + mot de passe
       - forgot  : demande de réinitialisation (envoi email)
       - reset   : nouveau mot de passe (arrivée depuis le lien email)
       - setpwd  : 1re connexion -> définition du mot de passe (must_change_password)

     Après connexion : oropraLoadUser() -> selected_id_site -> navigation Accueil.
     ========================================================================= */

  /* ----- PARAMÉTRABLE PAR PROJET (par tenant) ----------------------------- */
  // Renseigne le logo + le nom du groupe ici (ou via les variables globales
  // WeWeb ci-dessous si tu préfères piloter depuis l'éditeur).
  const LOGO_URL = '';     // <-- URL du logo du groupe (laisser vide si pas de logo)
  const GROUP_NAME = 'GROUPE AVENIR AUTO';            // <-- nom du groupe
  const TAGLINE = TENANT.auth_baseline || 'Votre CRM, au quotidien.';
  // (Optionnel) IDs de variables globales WeWeb pour surcharger logo/nom :
  const LOGO_VAR_ID = '';   // ex. 'xxxxxxxx-...' (String) — laissez vide si non utilisé
  const NAME_VAR_ID = '';

  const SELECTED_SITE_VAR_ID = '39fecccf-9296-43b7-b5b6-eadaa928290d';
  const ACCUEIL_PATH = '/accueil';  // WeWeb ajoute le préfixe de langue (/fr) lui-même
  const ROOT_ID = 'oropra-auth';

  const doc = __anchor.ownerDocument || document;
  const win = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window;
  function getRoot() { return __anchor; }
  function sb() { return (ctx && ctx.supabase) || (wwLib.wwPlugins && wwLib.wwPlugins.supabase && wwLib.wwPlugins.supabase.instance) || null; }
  function readVar(id) { try { return id ? wwLib.wwVariable.getValue(id) : null; } catch (e) { return null; } }
  function esc(s) { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function logoUrl() { const u = TENANT.logo_url || ''; return (u && u.indexOf('://') !== -1) ? u : ''; }
  function groupName() { return TENANT.group_name || 'One Data'; }

  const state = window.__authState || {};
  if (state.view === undefined) state.view = 'login';   // login | forgot | reset | setpwd | sent
  if (state.email === undefined) state.email = '';
  if (state.busy === undefined) state.busy = false;
  if (state.error === undefined) state.error = null;
  if (state.info === undefined) state.info = null;
  window.__authState = state;

  function isEmail(v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || '').trim()); }

  /* ----- actions ----------------------------------------------------------- */
  async function doLogin() {
    if (state.busy) return;
    const email = (getRoot().querySelector('[data-f="email"]') || {}).value || '';
    const pwd = (getRoot().querySelector('[data-f="pwd"]') || {}).value || '';
    if (!isEmail(email)) { state.error = 'Adresse email invalide.'; state.info = null; render(); return; }
    if (!pwd) { state.error = 'Saisissez votre mot de passe.'; render(); return; }
    state.email = email; state.busy = true; state.error = null; state.info = null; render();
    try {
      const { data, error } = await sb().auth.signInWithPassword({ email: email.trim(), password: pwd });
      if (error) { state.busy = false; state.error = 'Email ou mot de passe incorrect.'; render(); return; }
      const uid = data && data.user && data.user.id;
      // 1re connexion ? -> must_change_password sur la ligne USER
      let mustChange = false;
      try {
        const u = await sb().from('USER').select('must_change_password').eq('auth_uid', uid).maybeSingle();
        mustChange = !!(u.data && u.data.must_change_password);
      } catch (e) { mustChange = false; }
      if (mustChange) { state.busy = false; state.view = 'setpwd'; state.error = null; render(); return; }
      await finishLogin();
    } catch (e) { console.error('[auth] login', e); state.busy = false; state.error = 'Connexion impossible. Réessayez.'; render(); }
  }

  // Charge le user (socle) + site sélectionné, puis navigue vers l'accueil.
  async function finishLogin() {
    try {
      let user = null;
      if (typeof win.oropraLoadUser === 'function') { user = await win.oropraLoadUser(); }
      else { const r = await sb().rpc('get_current_user'); user = r && r.data ? (Array.isArray(r.data) ? r.data[0] : r.data) : null; win.oropraUser = user; }
      if (user && user.ID_SITE != null) { try { wwLib.wwVariable.updateValue(SELECTED_SITE_VAR_ID, Number(user.ID_SITE)); } catch (e) {} }
    } catch (e) { console.warn('[auth] bootstrap', e); }
    // Démarre la top nav + l'historique (comme l'ancien workflow de connexion).
    // Leurs observers attendent leurs conteneurs et se montent sur l'accueil.
    try { bootTopNav(); } catch (e) { console.warn('[auth] bootTopNav', e); }
    try { bootHistoClient(); } catch (e) { console.warn('[auth] bootHistoClient', e); }
    navigateAccueil();
  }

  function navigateAccueil() {
    // Navigation SPA (pas de reload) : la top nav + l'historique sont démarrés
    // juste avant (comme l'ancien workflow de connexion) et se montent via leurs
    // observers sur la page d'accueil.
    try { if (wwLib.wwApp && wwLib.wwApp.goTo) { wwLib.wwApp.goTo(ACCUEIL_PATH); return; } } catch (e) {}
    try { wwLib.goTo(ACCUEIL_PATH); return; } catch (e) {}
    try { if (wwLib.wwLocation && wwLib.wwLocation.goTo) { wwLib.wwLocation.goTo(ACCUEIL_PATH); return; } } catch (e) {}
    try { win.location.href = '/fr' + ACCUEIL_PATH; } catch (e) {}
  }

  async function doForgot() {
    if (state.busy) return;
    const email = (getRoot().querySelector('[data-f="email"]') || {}).value || state.email || '';
    if (!isEmail(email)) { state.error = 'Adresse email invalide.'; render(); return; }
    state.email = email; state.busy = true; state.error = null; render();
    try {
      const redirectTo = win.location.origin + win.location.pathname;  // revient sur cette page
      const { error } = await sb().auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo });
      state.busy = false;
      if (error) { state.error = "Impossible d'envoyer l'email. Réessayez."; render(); return; }
      state.view = 'sent'; state.info = 'Si un compte existe pour ' + email + ', un email de réinitialisation vient d\'être envoyé.'; render();
    } catch (e) { console.error('[auth] forgot', e); state.busy = false; state.error = "Impossible d'envoyer l'email."; render(); }
  }

  async function doReset() {
    if (state.busy) return;
    const p1 = (getRoot().querySelector('[data-f="p1"]') || {}).value || '';
    const p2 = (getRoot().querySelector('[data-f="p2"]') || {}).value || '';
    const err = validatePwd(p1, p2); if (err) { state.error = err; render(); return; }
    state.busy = true; state.error = null; render();
    try {
      const { error } = await sb().auth.updateUser({ password: p1 });
      if (error) { state.busy = false; state.error = 'Échec : ' + error.message; render(); return; }
      state.busy = false; state.view = 'login'; state.info = 'Mot de passe mis à jour. Connectez-vous.'; state.error = null; render();
    } catch (e) { console.error('[auth] reset', e); state.busy = false; state.error = 'Échec de la mise à jour.'; render(); }
  }

  async function doSetPwd() {
    if (state.busy) return;
    const p1 = (getRoot().querySelector('[data-f="p1"]') || {}).value || '';
    const p2 = (getRoot().querySelector('[data-f="p2"]') || {}).value || '';
    const err = validatePwd(p1, p2); if (err) { state.error = err; render(); return; }
    state.busy = true; state.error = null; render();
    try {
      const up = await sb().auth.updateUser({ password: p1 });
      if (up.error) { state.busy = false; state.error = 'Échec : ' + up.error.message; render(); return; }
      try { await sb().rpc('set_password_changed'); } catch (e) { console.warn('[auth] set_password_changed', e); }
      await finishLogin();
    } catch (e) { console.error('[auth] setpwd', e); state.busy = false; state.error = 'Échec de la mise à jour.'; render(); }
  }

  function validatePwd(p1, p2) {
    if (!p1 || p1.length < 8) return 'Le mot de passe doit faire au moins 8 caractères.';
    if (p1 !== p2) return 'Les deux mots de passe ne correspondent pas.';
    return null;
  }

  /* ----- styles ------------------------------------------------------------ */
  const STYLE = '<style>' +
    '#' + ROOT_ID + '{font-family:"Nunito Sans",system-ui,-apple-system,sans-serif;position:fixed;inset:0;display:flex;color:#1F4A85;background:#eef2f8}' +
    '#' + ROOT_ID + ' *{box-sizing:border-box}' +
    '.oa-brand{flex:1 1 46%;position:relative;display:flex;flex-direction:column;justify-content:center;padding:56px;color:#fff;overflow:hidden;background:linear-gradient(140deg,#1F4A85 0%,#2a5ea9 55%,#3f78c9 100%)}' +
    '.oa-brand::after{content:"";position:absolute;inset:0;background-image:radial-gradient(circle at 20% 30%,rgba(255,255,255,.10) 0,transparent 40%),radial-gradient(circle at 80% 70%,rgba(255,255,255,.08) 0,transparent 45%);pointer-events:none}' +
    '.oa-brand-in{position:relative;z-index:1;max-width:440px}' +
    '.oa-logo{height:64px;width:auto;max-width:220px;object-fit:contain;background:#fff;border-radius:14px;padding:10px 14px;box-shadow:0 10px 30px rgba(0,0,0,.18)}' +
    '.oa-gname{font-size:30px;font-weight:800;letter-spacing:.4px;margin:26px 0 10px;line-height:1.15}' +
    '.oa-tag{font-size:16px;color:#dbe7fb;font-weight:500;line-height:1.5}' +
    '.oa-brand-foot{position:absolute;bottom:26px;left:56px;right:56px;z-index:1;font-size:12px;color:#bdd2f2}' +
    '.oa-pane{flex:1 1 54%;display:flex;align-items:center;justify-content:center;padding:32px;background:#f7f9fc}' +
    '.oa-card{width:100%;max-width:400px}' +
    '.oa-card-logo{display:none}' +
    '.oa-title{font-size:23px;font-weight:800;margin:0 0 4px}' +
    '.oa-sub{font-size:14px;color:#5a7196;margin:0 0 24px}' +
    '.oa-field{position:relative;margin-bottom:16px}' +
    '.oa-field input{width:100%;border:1.5px solid #d7e0ee;border-radius:11px;padding:15px 14px 15px 44px;font-size:15px;color:#1F4A85;font-family:inherit;background:#fff;transition:border-color .15s,box-shadow .15s}' +
    '.oa-field input:focus{outline:none;border-color:#2a5ea9;box-shadow:0 0 0 4px rgba(42,94,169,.12)}' +
    '.oa-field .oa-ic{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#9db4d6;pointer-events:none}' +
    '.oa-field .oa-eye{position:absolute;right:12px;top:50%;transform:translateY(-50%);color:#9db4d6;cursor:pointer;background:none;border:none;padding:4px;display:flex}' +
    '.oa-field .oa-eye:hover{color:#2a5ea9}' +
    '.oa-btn{width:100%;border:none;border-radius:11px;padding:15px;font-size:15px;font-weight:800;font-family:inherit;color:#fff;background:#2a5ea9;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:background-color .15s}' +
    '.oa-btn:hover{background:#1F4A85}.oa-btn:disabled{opacity:.65;cursor:default}' +
    '.oa-link{background:none;border:none;color:#2a5ea9;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;padding:0}' +
    '.oa-link:hover{text-decoration:underline}' +
    '.oa-row{display:flex;justify-content:flex-end;margin:-6px 0 20px}' +
    '.oa-foot{text-align:center;margin-top:22px;font-size:13.5px;color:#5a7196}' +
    '.oa-alert{border-radius:10px;padding:11px 14px;font-size:13.5px;margin-bottom:18px;font-weight:600;display:flex;gap:9px;align-items:flex-start}' +
    '.oa-alert.err{background:#fdecec;color:#c0392b;border:1px solid #f3c8c4}' +
    '.oa-alert.ok{background:#eafaf1;color:#1e7a4d;border:1px solid #bfe6cf}' +
    '.oa-spin{display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.5);border-top-color:#fff;border-radius:50%;animation:oa-spin .7s linear infinite}' +
    '@keyframes oa-spin{to{transform:rotate(360deg)}}' +
    '.oa-hint{font-size:12px;color:#8aa3c3;margin:-8px 0 16px}' +
    '@media(max-width:860px){.oa-brand{display:none}.oa-pane{flex:1;background:#eef2f8}.oa-card-logo{display:flex;flex-direction:column;align-items:center;gap:14px;margin-bottom:24px;text-align:center}.oa-card-logo img{height:56px;background:#fff;border-radius:12px;padding:8px 12px;box-shadow:0 8px 22px rgba(31,74,133,.14)}.oa-card-logo .g{font-size:18px;font-weight:800;color:#1F4A85}}' +
    '</style>';

  const IC_MAIL = '<svg class="oa-ic" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>';
  const IC_LOCK = '<svg class="oa-ic" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  const IC_EYE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';

  function brandHtml() {
    return '<div class="oa-brand"><div class="oa-brand-in">' +
      (logoUrl() ? '<img class="oa-logo" src="' + esc(logoUrl()) + '" alt="' + esc(groupName()) + '">' : '') +
      '<div class="oa-gname">' + esc(groupName()) + '</div>' +
      '<div class="oa-tag">' + esc(TAGLINE) + '</div>' +
      '</div><div class="oa-brand-foot">Propulsé par Oropra · One Data</div></div>';
  }
  function cardLogoHtml() {
    return '<div class="oa-card-logo">' + (logoUrl() ? '<img src="' + esc(logoUrl()) + '" alt="">' : '') + '<div class="g">' + esc(groupName()) + '</div></div>';
  }
  function alertHtml() {
    if (state.error) return '<div class="oa-alert err">' + esc(state.error) + '</div>';
    if (state.info) return '<div class="oa-alert ok">' + esc(state.info) + '</div>';
    return '';
  }
  function pwdField(name, ph) {
    return '<div class="oa-field">' + IC_LOCK +
      '<input data-f="' + name + '" type="password" placeholder="' + esc(ph) + '" autocomplete="new-password">' +
      '<button class="oa-eye" data-eye="' + name + '" tabindex="-1" title="Afficher/masquer">' + IC_EYE + '</button></div>';
  }

  function formHtml() {
    if (state.view === 'forgot') {
      return '<h1 class="oa-title">Mot de passe oublié</h1>' +
        '<p class="oa-sub">Saisissez votre email : nous vous enverrons un lien de réinitialisation.</p>' +
        alertHtml() +
        '<div class="oa-field">' + IC_MAIL + '<input data-f="email" type="email" placeholder="Adresse email" value="' + esc(state.email) + '" autocomplete="email"></div>' +
        '<button class="oa-btn" data-act="forgot"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? '<span class="oa-spin"></span>Envoi…' : 'Envoyer le lien') + '</button>' +
        '<div class="oa-foot"><button class="oa-link" data-act="tologin">&larr; Retour à la connexion</button></div>';
    }
    if (state.view === 'sent') {
      return '<h1 class="oa-title">Vérifiez vos emails</h1>' + alertHtml() +
        '<p class="oa-sub">Cliquez sur le lien reçu pour définir un nouveau mot de passe.</p>' +
        '<div class="oa-foot"><button class="oa-link" data-act="tologin">&larr; Retour à la connexion</button></div>';
    }
    if (state.view === 'reset') {
      return '<h1 class="oa-title">Nouveau mot de passe</h1>' +
        '<p class="oa-sub">Choisissez un nouveau mot de passe pour votre compte.</p>' +
        alertHtml() + pwdField('p1', 'Nouveau mot de passe') + pwdField('p2', 'Confirmer le mot de passe') +
        '<p class="oa-hint">Au moins 8 caractères.</p>' +
        '<button class="oa-btn" data-act="reset"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? '<span class="oa-spin"></span>Mise à jour…' : 'Mettre à jour') + '</button>';
    }
    if (state.view === 'setpwd') {
      return '<h1 class="oa-title">Bienvenue 👋</h1>' +
        '<p class="oa-sub">Pour votre première connexion, définissez votre mot de passe personnel.</p>' +
        alertHtml() + pwdField('p1', 'Nouveau mot de passe') + pwdField('p2', 'Confirmer le mot de passe') +
        '<p class="oa-hint">Au moins 8 caractères.</p>' +
        '<button class="oa-btn" data-act="setpwd"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? '<span class="oa-spin"></span>Enregistrement…' : 'Définir et continuer') + '</button>';
    }
    // login
    return '<h1 class="oa-title">Connexion</h1>' +
      '<p class="oa-sub">Accédez à votre espace One Data.</p>' +
      alertHtml() +
      '<div class="oa-field">' + IC_MAIL + '<input data-f="email" type="email" placeholder="Adresse email" value="' + esc(state.email) + '" autocomplete="email"></div>' +
      '<div class="oa-field">' + IC_LOCK + '<input data-f="pwd" type="password" placeholder="Mot de passe" autocomplete="current-password"><button class="oa-eye" data-eye="pwd" tabindex="-1" title="Afficher/masquer">' + IC_EYE + '</button></div>' +
      '<div class="oa-row"><button class="oa-link" data-act="toforgot">Mot de passe oublié ?</button></div>' +
      '<button class="oa-btn" data-act="login"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? '<span class="oa-spin"></span>Connexion…' : 'Se connecter') + '</button>';
  }

  function render() {
    const root = getRoot(); if (!root) return;
    root.innerHTML = STYLE + brandHtml() + '<div class="oa-pane"><div class="oa-card">' + cardLogoHtml() + formHtml() + '</div></div>';
    bind(root);
  }

  function bind(root) {
    const on = (sel, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener('click', fn));
    on('[data-act="login"]', doLogin);
    on('[data-act="forgot"]', doForgot);
    on('[data-act="reset"]', doReset);
    on('[data-act="setpwd"]', doSetPwd);
    on('[data-act="toforgot"]', () => { state.view = 'forgot'; state.error = null; state.info = null; render(); });
    on('[data-act="tologin"]', () => { state.view = 'login'; state.error = null; render(); });
    on('[data-eye]', (e) => { const n = e.currentTarget.getAttribute('data-eye'); const inp = root.querySelector('[data-f="' + n + '"]'); if (inp) inp.type = inp.type === 'password' ? 'text' : 'password'; });
    // Entrée pour valider
    root.querySelectorAll('input').forEach(inp => inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return; e.preventDefault();
      if (state.view === 'login') doLogin();
      else if (state.view === 'forgot') doForgot();
      else if (state.view === 'reset') doReset();
      else if (state.view === 'setpwd') doSetPwd();
    }));
    const first = root.querySelector('input'); if (first) setTimeout(() => { try { first.focus(); } catch (e) {} }, 40);
  }

  /* ----- arrivée depuis le lien email (récupération) ---------------------- */
  function detectRecovery() {
    try {
      const h = win.location.hash || '';
      if (h.indexOf('type=recovery') !== -1) { state.view = 'reset'; }
    } catch (e) {}
    try {
      sb().auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') { state.view = 'reset'; render(); } });
    } catch (e) {}
  }

  /* ----- boot -------------------------------------------------------------- */
  function boot() {
    // (le loader garantit __anchor)
    // Réinit à chaque affichage : l'état persiste sur window.__authState -> après
    // déconnexion/reconnexion, repartir propre (sinon spinner figé + email réinjecté).
    state.busy = false;
    state.error = null;
    state.info = null;
    state.email = '';
    state.view = 'login';
    detectRecovery();   // peut basculer en 'reset' si arrivée depuis un lien email
    render();
  }

  // ---- Modules embarqués (démarrés après login) --------------------------
  // Code EXACT de onedata-nav.js et histo-client.js, encapsulé dans une fonction
  // appelable. Leurs IIFE internes s'exécutent à l'appel de la fonction.
  function bootTopNav() {
// ============================================================================
//  One Data — Top navigation  (onedata-nav.js)
//  Rendu dans <div id="nav-root"></div> placé dans le header partagé.
//  Crée les ancres des embeds existants :
//   - #oropra-client-history  -> embed historique client (rempli par son JS)
//   - #delco-header-link / #delco-header-badge / .delco-header-badge-num
//                             -> badge Delco (alimenté par son JS)
//   - site selector           -> piloté via window.oropraSite (site-bus)
//  Rendu UNE fois + responsive 100% CSS (burger <= 1024 px).
//
//  CORRECTIF sélecteur de site vide après login : l'ancien renderSiteState
//  pouvait tomber en dead-end silencieux (api/DOM/sites transitoirement absents),
//  et les filets (poll tué à 15s, flags __navSiteSub/__navSiteEvt persistants)
//  cédaient tous ensemble sur un login malchanceux. Remplacés par UN SEUL
//  heartbeat persistant + renderSiteState idempotent + réabonnement suivant
//  l'instance oropraSite.
//
//  v23 : logo Delco en SVG inline (I.delco, l'éclair officiel repris de la page
//  Delco, recolorable en CSS) à la place de l'éclair générique I.bolt ; badge
//  d'alertes Delco détaché et recentré.
//  v24 : contenu des deux barres CAPÉ à --od-maxw (1200px par défaut), centré,
//  au lieu d'un padding fixe -> aligne le logo (gauche) et l'avatar (droite) sur
//  le contenu 1200px de la page. Fonds/bordures restent pleine largeur grâce aux
//  wrappers .od-bar-inner / .od-sub-inner. Éclair Delco agrandi (17->20px) et
//  badge davantage détaché du mot.
// ============================================================================
(function () {
  if (!window.wwLib) { return; }
  const wwLib = window.wwLib;
  const doc = wwLib.getFrontDocument();
  const ROOT_ID = 'nav-root';
  const NAV_VER = 27; // <- numéro de version (témoin de chargement)
  try { window.__navVer = NAV_VER; } catch (e) {}
  function root() { return doc.getElementById(ROOT_ID); }
  // NB : on ne fait PLUS de "early return" si #nav-root est absent. Tout le démarrage
  // (rendu immédiat si possible + observer ré-armé + filets) est géré par boot(),
  // appelé en bas après toutes les déclarations. L'ancien flag __navWaiting pouvait
  // rester coincé à true (poll épuisé / navigation) et bloquait définitivement le
  // rendu -> nav qui ne réapparaissait qu'en relançant le JS à la main.

  // ---------------------------------------------------------------- constantes
  // Navigation par CHEMIN d'URL (comme l'embed Delco : wwLib.goTo("/fr/delco")).
  // LANG_PREFIX = préfixe de langue de l'app. Mets '' si un jour l'app n'a plus de /fr/.
  const LANG_PREFIX = '/fr';
  const P = {
    accueil:   '/accueil',
    admin:     '/admin',
    client:    '/client',
    notifs:    '/notifications',
    pipe:      '/pipe-commercial',
    perf:      '/performances',
    objectifs: '/objectifs',
    bilat:     '/bilaterales',
    activite:  '/activite',
    marketing: '/marketing',
    voListe:   '/vo-liste',
    vnListe:   '/vn-liste',
    vnConfig:  '/bdc-vn',
    delco:     '/delco',
    annuaire:  '/annuaire',
    tutos:     '/tutos',
    auth:      '/authentification',
    ficheClient: '/fiche-client'
  };
  // UID de page WeWeb (réf. référentiel section 5.1 + UID /vn-liste & /vn-config fournis).
  // Utilisés UNIQUEMENT dans l'ÉDITEUR : wwLib.wwApp.goTo(uid) y donne un vrai SPA, fenêtres
  // synchronisées, sans imbrication. En PROD, on navigue par CHEMIN (URL propre /fr/xxx, voir
  // goPage), car un UID en prod s'inscrit tel quel dans l'URL -> route inexistante au refresh
  // -> page blanche. Clé = path de P.
  const PAGE_UID = {
    '/accueil':          'f84d6f00-de35-45b9-ae23-c1f1e46bfa69',
    '/admin':            '1d30e3ac-fdee-4cce-b9c5-190aee995d23',
    '/client':           'f5b60fe2-bc14-4b3e-ba84-82ddfa11248c',
    '/notifications':    '8868fa49-e115-482d-9da2-4249e16196da',
    '/pipe-commercial':  '9e90d49a-215f-4c2b-b2bb-2d7c4f9aabd6',
    '/performances':     '1499f15f-e8cb-4561-aea8-bdeeeb080b68',
    '/objectifs':        'c9b4f9a6-460a-4365-8a06-95e30a13cbdb',
    '/bilaterales':      '7bfcfe73-4e89-40cf-bc84-1e07ddb478a6',
    '/activite':         '55717966-7e07-4957-9969-399198cce1ad',
    '/marketing':        '99519997-f935-471a-9147-b0118191b991',
    '/vo-liste':         '188b0f0b-5e80-4a77-a856-26469b08b614',
    '/vn-liste':         '5a11786d-59a3-49eb-a7a9-542f7d3c460e',
    '/bdc-vn':           '5ecc8832-d99b-47c7-a853-0921624d80ef',
    '/delco':            'da5005d5-42e4-4b37-9d42-f8b8728ddb0e',
    '/annuaire':         'a6c1a683-2490-4263-8dc5-5e187bcbec87',
    '/tutos':            '3395973c-c8eb-476b-bda2-9862b5a3e30f',
    '/authentification': 'a97c534c-b592-4282-bd20-d0333f28ff75',
    '/fiche-client':     '259f1951-a2d4-4b90-ac83-0b3febe1d4ec'
  };
  const VAR_CLIENT = '55490583-c88b-4748-916e-4d203db07742';
  // Onglet actif de la fiche client : variable globale (Number) liée au champ
  // "Active tab index" du composant Tabs. On la force à 0 (= onglet "Fiche client")
  // au clic sur le nom du client, pour ne pas retomber sur le dernier onglet consulté.
  const FICHE_TAB_VAR = 'fb2cad2c-cd04-42e0-8909-e3c91c8dcfac';
  const FICHE_TAB_DEFAULT = 0;
  const VAR_NB_NOTIFS = '9fc0eca4-2325-4774-8e27-4c66515a9166';
  const COLLECTION_USERCONNECTED = 'e6331054-02e1-4f9d-b737-753455040b93';
  const SUPPORT_MAIL = 'oropra.gen@gmail.com';
  const LOGO_URL = "images/logo-team-colin-groupe90x90-1-0x90.webp?_wwcv=235"; // logo Oropra (assets WeWeb)

  // ---------------------------------------------------------------- helpers
  // Détecte l'éditeur WeWeb : l'app y tourne dans une iframe de preview (window != top),
  // alors qu'en prod elle est au top-level. On NE FAIT JAMAIS de changement de location.*
  // dans l'éditeur : une URL relative s'y résout sur l'origine de l'ÉDITEUR -> l'éditeur se
  // recharge dans sa propre preview -> imbrications en poupées russes.
  function inEditor() {
    try { return window.self !== window.top; } catch (e) { return true; } // cross-origin -> iframe -> éditeur
  }
  function goPage(path) {
    if (!path) return;
    const uid = PAGE_UID[path];
    if (inEditor()) {
      // ÉDITEUR : navigation par UID UNIQUEMENT -> vrai SPA interne, fenêtres synchronisées,
      // aucune imbrication. Surtout PAS de chemin ici : une URL relative se résoudrait sur
      // l'origine de l'ÉDITEUR -> l'éditeur se recharge dans sa preview (poupées russes).
      if (uid) {
        try { wwLib.wwApp.goTo(uid); return; } catch (e) {}
        try { wwLib.goTo(uid); return; } catch (e) {}
      }
      return; // pas d'UID connu -> on ne tente rien en éditeur (éviter l'imbrication)
    }
    // PROD : navigation par CHEMIN -> URL propre /fr/xxx (comme l'embed Delco : wwLib.goTo("/fr/delco")).
    // C'est une vraie route, donc le rechargement de page fonctionne. À l'inverse, l'UID en prod
    // s'inscrit tel quel dans l'URL -> route inexistante au refresh -> page blanche.
    const href = LANG_PREFIX + path;
    try { wwLib.goTo(href); return; } catch (e) {}
    try { const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window; w.location.href = href; } catch (e) {}
  }
  // Déconnexion RÉELLE :
  //  - on coupe la session Supabase (signOut vide le token en localStorage) ;
  //  - puis on revient au login. ÉDITEUR : par UID (vrai SPA, aucune imbrication, aucun
  //    location.*). PROD : la page d'auth est la page d'ACCUEIL servie à la racine (/fr/),
  //    donc on force un rechargement complet vers '/' -> état réinitialisé + URL propre.
  //    (Naviguer vers /fr/authentification serait un 404 : cette route n'existe pas.)
  async function goAuth() {
    // vide le cache user AVANT de couper la session (éditeur SPA + prod)
    try { const w = wwLib.getFrontWindow(); w.oropraUser = null; w.__oropraUserPromise = null; w.__oropraAuthUid = null; } catch (e) {}
    try {
      const sb = wwLib.wwPlugins && wwLib.wwPlugins.supabase && wwLib.wwPlugins.supabase.instance;
      if (sb && sb.auth && typeof sb.auth.signOut === 'function') { await sb.auth.signOut(); }
    } catch (e) {}
    if (inEditor()) {
      const authUid = PAGE_UID['/authentification'];
      try { wwLib.wwApp.goTo(authUid); return; } catch (e) {}
      try { wwLib.goTo(authUid); return; } catch (e) {}
      return;
    }
    try { const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window; w.location.assign('/'); return; } catch (e) {}
    try { window.location.assign('/'); } catch (e) {}
  }
  // Pose l'index d'onglet de la fiche (Number) sur la variable globale liée au composant Tabs.
  function setFicheTab(idx) {
    try { wwLib.wwVariable.updateValue(FICHE_TAB_VAR, idx); } catch (e) {}
  }
  // Clic sur le nom du client -> fiche, sur l'onglet "Fiche client" (index 0).
  // On pose l'onglet UNE seule fois avant la navigation. Aucune ré-application :
  // les ré-applications répétées écrasaient le clic suivant de l'utilisateur sur
  // un autre onglet (Contacts, RDV, P.Com, Historique) et le laissaient vide.
  function openFicheClient() {
    setFicheTab(FICHE_TAB_DEFAULT);
    goPage(P.ficheClient);
  }
  // Delco : relance l'embed externe pour réafficher le nombre après un (re)rendu de la nav.
  function kickDelco() {
    try { if (window.__delcoBadge && typeof window.__delcoBadge.refresh === 'function') window.__delcoBadge.refresh(); } catch (e) {}
  }
  function getVar(id) { try { return wwLib.wwVariable.getValue(id); } catch (e) { return null; } }
  function user() {
    try { return wwLib.getFrontWindow().oropraUser || {}; }
    catch (e) { return {}; }
  }
  function pick(o, keys) { for (const k of keys) { if (o && o[k] != null && o[k] !== '') return o[k]; } return ''; }
  function esc(s) { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function clientLabelFrom(c) {
    if (!c || (c.NOM == null && c.PRENOM == null)) return null;
    const part = (c.idmultivu === 0 || c.idmultivu === '0');
    if (part) return [c.PRENOM, (c.NOM || '').toUpperCase()].filter(Boolean).join(' ');
    return [c.CIVILITE, c.NOM].filter(Boolean).join(' ');
  }
  function clientLabel() { return clientLabelFrom(getVar(VAR_CLIENT)); }
  function userInitials() {
    const u = user();
    const p = pick(u, ['prenom', 'Prenom', 'PRENOM', 'firstname']);
    const n = pick(u, ['nom', 'Nom', 'NOM', 'lastname']);
    const i = ((p || '')[0] || '') + ((n || '')[0] || '');
    return (i || pick(u, ['nomComplet', 'nom_complet_affichage']).slice(0, 2) || 'U').toUpperCase();
  }
  function userFullName() {
    const u = user();
    return pick(u, ['nomComplet', 'nom_complet_affichage'])
      || [pick(u, ['prenom', 'Prenom', 'PRENOM']), pick(u, ['nom', 'Nom', 'NOM'])].filter(Boolean).join(' ')
      || 'Mon compte';
  }

  // ---------------------------------------------------------------- icons
  const I = {
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    person:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    pin:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    bolt:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
    // Logo Delco : l'éclair officiel repris de la page Delco (LOGO_SVG),
    // fill=currentColor -> recoloré par `.od-delco svg{color:#53bda7}`. viewBox
    // RECADRÉ au plus près du tracé (bbox x18-46 / y8-56, +2 de marge) : sans ça
    // l'éclair flottait, petit, au centre d'un 64x64 quasi vide.
    delco:   '<svg viewBox="16 6 32 52" fill="currentColor"><path d="M 36 8 L 18 36 L 30 36 L 26 56 L 46 28 L 34 28 L 36 8 Z"/></svg>',
    burger:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    close:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>'
  };

  // ---------------------------------------------------------------- menus
  const MENUS = [
    { label: 'Clients', badge: true, items: [
      { t: 'Base client', p: P.client },
      { t: 'Notifications', p: P.notifs, badge: true }
    ] },
    { label: 'Ventes', items: [
      { t: 'Gestion des ventes', p: P.pipe },
      { t: 'Performances', p: P.perf },
      { t: 'Objectifs', p: P.objectifs }
    ] },
    { label: 'Management', items: [
      { t: 'Bilatérales', p: P.bilat },
      { t: 'Suivi activité', p: P.activite },
      { t: 'Lead Management', p: P.marketing }
    ] },
    { label: 'Véhicules', items: [
      { t: 'Stock VO', p: P.voListe },
      { t: 'Import VN', p: P.vnConfig }
    ] }
  ];
  const USER_MENU = [
    { t: 'Mon compte', act: 'account' },
    { t: 'Annuaire', p: P.annuaire },
    { t: 'Tutos', p: P.tutos },
    { t: 'Email Support', act: 'support' },
    { t: 'Se déconnecter', act: 'logout', danger: true }
  ];

  // ---------------------------------------------------------------- CSS
  const STYLE = `<style id="onedata-nav-css">
/* --od-maxw = largeur du contenu (À CALER sur ta page : 1200px). --od-gutter =
   gouttière latérale. Mets 0 si tes blocs sont flush au 1200 ; sinon mets la
   même valeur que le padding horizontal de ton conteneur de page. */
#nav-root{--od-maxw:1200px;--od-gutter:0px;font-family:"Nunito Sans",system-ui,sans-serif;color:#1F4A85;width:100%}
#nav-root *{box-sizing:border-box}
.od-nav{background:#fff;border-bottom:1px solid #e8eef7;width:100%}
.od-bar{width:100%}
.od-bar-inner{display:flex;align-items:center;gap:8px;padding:9px var(--od-gutter);position:relative;max-width:var(--od-maxw);margin:0 auto}
.od-logo{display:flex;align-items:center;gap:8px;cursor:pointer;flex:0 0 auto;margin-right:14px;font-weight:800;font-size:21px;color:#1F4A85;letter-spacing:-.5px}
.od-logo-img{height:32px;width:auto;max-width:min(150px,42vw);display:block}
.od-menus{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px;flex:1 1 auto;min-width:0}
.od-m{position:relative}
.od-m>button{display:flex;align-items:center;gap:6px;background:none;border:none;cursor:pointer;font:inherit;font-size:14px;font-weight:600;color:#1F4A85;padding:10px 18px;border-radius:9px;transition:background .15s,color .15s;white-space:nowrap}
.od-m>button:hover{background:#f2f6fc;color:#2a5ea9}
.od-m.open>button{background:#eef4fc;color:#2a5ea9}
.od-m>button>svg{width:14px;height:14px;transition:transform .18s}
.od-m.open>button>svg{transform:rotate(180deg)}
.od-pill{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#e24b4a;color:#fff;font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;line-height:1}
.od-drop{position:absolute;top:calc(100% + 6px);left:0;min-width:230px;background:#fff;border:1px solid #e8eef7;border-radius:12px;box-shadow:0 12px 32px rgba(31,74,133,.14);padding:6px;z-index:300;display:none}
.od-m.open .od-drop,.od-user.open .od-drop,.od-site.open .od-drop{display:block}
.od-drop a{display:flex;align-items:center;justify-content:flex-start;gap:8px;padding:10px 12px;border-radius:8px;font-size:14px;color:#1F4A85;text-decoration:none;cursor:pointer}
.od-drop a:hover{background:#f2f6fc;color:#2a5ea9}
.od-spacer{display:none}
.od-delco{display:flex;align-items:center;gap:8px;padding:10px 18px;border-radius:9px;cursor:pointer;font-size:14px;font-weight:600;color:#1F4A85;text-decoration:none;transition:background .15s;white-space:nowrap}
.od-delco:hover{background:#f2f6fc;color:#2a5ea9}
.od-delco svg{width:auto;height:26px;margin-top:-6px;margin-bottom:-6px;color:#53bda7;flex:0 0 auto}
#delco-header-badge{min-width:18px;height:18px;padding:0 5px;border-radius:9px;font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;line-height:1;margin-left:8px}
#delco-header-badge[data-state="idle"]{display:none}
#delco-header-badge[data-state="warn"]{background:#fac055;color:#5a3d05}
#delco-header-badge[data-state="urgent"]{background:#e24b4a;color:#fff}
.od-user{position:relative;flex:0 0 auto}
.od-user>button{display:flex;align-items:center;gap:7px;background:none;border:none;cursor:pointer;padding:4px 6px 4px 4px;border-radius:30px;transition:background .15s}
.od-user>button:hover{background:#f2f6fc}
  .od-user-btn{position:relative}
  .od-user-btn::after{content:attr(data-tip);position:absolute;top:calc(100% + 8px);right:0;background:#2a5ea9;color:#fff;font-size:11px;font-weight:600;padding:5px 10px;border-radius:8px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .12s ease;z-index:1200;box-shadow:0 6px 18px rgba(31,74,133,.28)}
  .od-user-btn:hover::after{opacity:1}
.od-avatar{width:34px;height:34px;border-radius:50%;background:#2a5ea9;color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.od-user>button>svg{width:14px;height:14px;color:#7a98c5}
.od-user .od-drop{left:auto;right:0}
.od-drop a.od-danger{color:#e24b4a}
.od-drop a.od-danger:hover{background:#fcebeb}
.od-drop .od-sep{height:1px;background:#f0f4fa;margin:5px 8px}
/* barre secondaire : client + site */
.od-sub{width:100%;border-bottom:1px solid #eef2f8;background:#fbfcfe}
.od-sub-inner{display:flex;align-items:center;gap:10px;padding:8px var(--od-gutter);max-width:var(--od-maxw);margin:0 auto}
.od-client{display:inline-flex;align-items:center;gap:8px}
.od-client-btn{display:inline-flex;align-items:center;gap:7px;background:none;border:none;cursor:pointer;font:inherit;font-size:14px;font-weight:600;color:#2a5ea9;padding:5px 8px;border-radius:7px;transition:background .15s}
.od-client-btn:hover{background:#eef4fc}
.od-client-btn svg{width:15px;height:15px;flex:0 0 auto}
.od-client-btn.is-empty{color:#9bb3d1;font-weight:500;cursor:default}
#oropra-client-history{display:inline-flex;flex:0 0 auto}
#nav-root #oropra-client-history .ch-trigger svg{transform:none}
.od-site{position:relative;margin-left:auto;flex:0 0 auto}
.od-site>button{display:inline-flex;align-items:center;gap:7px;background:#fff;border:1px solid #d6e2f2;cursor:pointer;font:inherit;font-size:13px;font-weight:600;color:#2a5ea9;padding:7px 11px;border-radius:9px}
.od-site>button:hover{border-color:#acc5e4}
.od-site>button svg.od-pin{width:15px;height:15px;color:#53bda7;flex:0 0 auto}
.od-site>button svg.od-cv{width:13px;height:13px;color:#7a98c5;transition:transform .18s}
.od-site.open>button svg.od-cv{transform:rotate(180deg)}
.od-site .od-drop{left:auto;right:0;min-width:220px;max-height:320px;overflow-y:auto}
.od-site .od-drop a.is-active{background:#eef4fc;color:#2a5ea9;font-weight:700}
/* burger */
.od-burger{display:none;background:none;border:none;cursor:pointer;color:#1F4A85;padding:7px;border-radius:9px;flex:0 0 auto}
.od-burger:hover{background:#f2f6fc}
.od-burger svg{width:24px;height:24px}
/* modale compte */
.od-modal-bg{position:fixed;inset:0;background:rgba(31,74,133,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:18px}
.od-modal{background:#fff;border-radius:16px;width:380px;max-width:100%;overflow:hidden;box-shadow:0 24px 60px rgba(31,74,133,.3)}
.od-modal-head{background:#2a5ea9;color:#fff;padding:20px;display:flex;align-items:center;gap:14px}
.od-modal-head .od-avatar{width:48px;height:48px;font-size:18px;background:rgba(255,255,255,.18)}
.od-modal-head .od-mh-name{font-size:17px;font-weight:700}
.od-modal-body{padding:8px 20px 16px}
.od-row{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-top:1px solid #f1f5fb;font-size:14px}
.od-row:first-child{border-top:none}
.od-row .od-k{color:#7a98c5}
.od-row .od-v{color:#1F4A85;font-weight:600;text-align:right;word-break:break-word}
.od-modal-foot{padding:0 20px 20px;display:flex;gap:10px}
.od-modal-foot button{flex:1;padding:11px;border-radius:10px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;border:1px solid #d6e2f2;background:#fff;color:#2a5ea9}
.od-modal-foot button.od-logout{border:none;background:#e24b4a;color:#fff}
@media (max-width:1024px){
  .od-bar-inner{padding:8px 14px;flex-wrap:nowrap}
  .od-logo{flex:0 1 auto;min-width:0;margin-right:8px}
  .od-burger{display:inline-flex;order:3}
  .od-user{order:2;margin-left:auto}
  .od-menus{position:absolute;top:100%;left:0;right:0;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:0;background:#fff;border-bottom:1px solid #e8eef7;box-shadow:0 16px 30px rgba(31,74,133,.14);padding:8px;display:none;z-index:400}
  .od-nav.open .od-menus{display:flex}
  .od-m>button{width:100%;justify-content:flex-start;font-size:15px;padding:13px 14px}
  .od-drop{position:static;border:none;box-shadow:none;padding:0 0 6px 14px;min-width:0}
  .od-delco{width:100%;justify-content:flex-start;font-size:15px;padding:13px 14px;border-radius:0}
  .od-delco:hover{background:#f2f6fc}
  .od-sub-inner{padding:8px 14px;gap:8px;flex-wrap:wrap}
  .od-client{flex:1 1 auto;min-width:0}
  .od-client-btn{flex:1 1 auto;min-width:0;max-width:100%}
  .od-client-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .od-site{flex:0 1 auto;max-width:48%}
  .od-site>button{padding:7px 10px}
  .od-site-name{display:inline-block;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle}
  .od-site .od-drop{max-width:calc(100vw - 28px)}
}
@media (max-width:560px){
  .od-bar-inner{padding:7px 11px}
  .od-sub-inner{padding:7px 11px;flex-wrap:wrap}
  .od-logo-img{height:27px}
  .od-avatar{width:30px;height:30px;font-size:12px}
  /* barre 2 empilée : client en haut, sélecteur de site dessous -> jamais de débordement */
  .od-client{flex:1 1 100%;min-width:0}
  .od-site{flex:1 1 100%;max-width:100%;margin-left:0}
  .od-site>button{width:100%;justify-content:flex-start}
  .od-site-name{flex:1 1 auto;min-width:0;max-width:none;text-align:left}
  .od-modal{width:100%}
}
</style>`;

  // ---------------------------------------------------------------- render
  function build() {
    const r = root();
    if (!r) return;
    if (r.querySelector('#onedata-nav-css') && r.getAttribute('data-nav-ver') === String(NAV_VER)) return; // déjà rendu (même version)

    let menusHtml = '';
    MENUS.forEach(function (m, mi) {
      let items = '';
      m.items.forEach(function (it) {
        items += '<a data-page="' + it.p + '">' + esc(it.t) +
          (it.badge ? '<span class="od-pill od-notifs-pill" style="display:none"></span>' : '') + '</a>';
      });
      menusHtml += '<div class="od-m" data-mi="' + mi + '"><button data-toggle="' + mi + '">' + esc(m.label) +
        (m.badge ? '<span class="od-pill od-notifs-pill" style="display:none"></span>' : '') +
        '</button><div class="od-drop">' + items + '</div></div>';
    });

    var __u = user();
    var __role = Number(__u.ID_Role != null ? __u.ID_Role : __u.id_role);
    var __userMenu = USER_MENU.slice();
    if (__role === 1 || __role === 8) { __userMenu.splice(__userMenu.length - 1, 0, { t: 'Administration', p: P.admin }); }
    let userItems = '';
    __userMenu.forEach(function (it) {
      if (it.t === 'Se déconnecter') userItems += '<div class="od-sep"></div>';
      userItems += '<a ' + (it.p ? 'data-page="' + it.p + '"' : 'data-act="' + it.act + '"') + (it.danger ? ' class="od-danger"' : '') + '>' + esc(it.t) + '</a>';
    });

    r.innerHTML = STYLE +
      '<div class="od-nav">' +
        '<div class="od-bar"><div class="od-bar-inner">' +
          '<div class="od-logo" data-page="' + P.accueil + '">' + (LOGO_URL ? '<img class="od-logo-img" src="' + LOGO_URL + '" alt="Oropra">' : 'Oropra') + '</div>' +
          '<button class="od-burger" data-burger>' + I.burger + '</button>' +
          '<div class="od-menus">' + menusHtml +
            '<a class="od-delco" id="delco-header-link">' + I.delco + '<span class="od-delco-txt">Delco</span><span id="delco-header-badge" data-state="idle"><span class="delco-header-badge-num"></span></span></a>' +
          '</div>' +
          '<div class="od-user"><button class="od-user-btn" data-toggle="user" data-tip="' + esc(userFullName()) + '"><span class="od-avatar">' + esc(userInitials()) + '</span></button>' +
            '<div class="od-drop">' + userItems + '</div></div>' +
        '</div></div>' +
        '<div class="od-sub"><div class="od-sub-inner">' +
          '<span class="od-client">' +
            '<button class="od-client-btn" data-act="fiche">' + I.person + '<span class="od-client-name"></span></button>' +
            '<div id="oropra-client-history"></div>' +
          '</span>' +
          '<div class="od-site"><button data-toggle="site">' + I.pin.replace('<svg', '<svg class="od-pin"') +
            '<span class="od-site-name">Site</span></button>' +
            '<div class="od-drop"></div></div>' +
        '</div></div>' +
      '</div>';

    bind();
    r.setAttribute('data-nav-ver', String(NAV_VER));
    refreshClient();
    refreshNotifs();
    mountSite();
    watchHistoryIcon();
    kickDelco();
  }

  // ---------------------------------------------------------------- interactions
  function closeAll(except) {
    root().querySelectorAll('.od-m.open, .od-user.open, .od-site.open').forEach(function (el) { if (el !== except) el.classList.remove('open'); });
  }
  function bind() {
    const r = root();
    // dropdowns (menus, user, site)
    r.querySelectorAll('[data-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const parent = btn.closest('.od-m, .od-user, .od-site');
        const wasOpen = parent.classList.contains('open');
        closeAll(parent);
        parent.classList.toggle('open', !wasOpen);
      });
    });
    // navigation par data-page
    r.querySelectorAll('[data-page]').forEach(function (el) {
      el.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); closeAll(); closeBurger(); goPage(el.getAttribute('data-page')); });
    });
    // actions
    r.querySelectorAll('[data-act]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        const a = el.getAttribute('data-act');
        closeAll();
        if (a === 'account') openAccount();
        else if (a === 'support') { try { (wwLib.getFrontWindow && wwLib.getFrontWindow() || window).location.href = 'mailto:' + SUPPORT_MAIL; } catch (er) {} }
        else if (a === 'logout') goAuth();
        else if (a === 'fiche') { if (clientLabel()) openFicheClient(); }
      });
    });
    // burger
    const bg = r.querySelector('[data-burger]');
    if (bg) bg.addEventListener('click', function (e) { e.stopPropagation(); r.querySelector('.od-nav').classList.toggle('open'); });
    // Delco : on gère le clic nous-mêmes (l'embed externe ne fait QUE le badge/compteur)
    const delcoLink = r.querySelector('#delco-header-link');
    if (delcoLink) delcoLink.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); closeAll(); closeBurger(); goPage(P.delco); });
    // clic dehors
    if (!window.__navOutside) {
      doc.addEventListener('mousedown', function (e) { const rr = root(); if (rr && !rr.contains(e.target)) { closeAll(); } }, true);
      window.__navOutside = true;
    }
    // mise à jour du label client quand l'embed historique change de client
    if (!window.__navClientEvt) {
      const onSel = function (e) {
        refreshClient(e && e.detail);   // immédiat via le client de l'event
        setTimeout(function () { refreshClient(); }, 150);  // relecture après MAJ de la variable
        setTimeout(function () { refreshClient(); }, 500);
      };
      window.addEventListener('oropra-client-selected', onSel);
      try { doc.addEventListener('oropra-client-selected', onSel); } catch (er) {}
      window.__navClientEvt = true;
    }
    // filet : suit la variable client en continu (au cas où l'event est manqué)
    if (!window.__navClientPoll) {
      window.__navClientPoll = setInterval(function () { refreshClient(); }, 1200);
    }
  }
  function closeBurger() { const n = root() && root().querySelector('.od-nav'); if (n) n.classList.remove('open'); }

  // ---------------------------------------------------------------- client (barre 2)
  function refreshClient(c) {
    const el = root() && root().querySelector('.od-client-name');
    const btn = root() && root().querySelector('.od-client-btn');
    if (!el || !btn) return;
    const lbl = (c ? clientLabelFrom(c) : null) || clientLabel();
    const next = lbl || 'Aucun client sélectionné';
    if (el.textContent === next) return; // pas de changement -> rien à faire
    el.textContent = next;
    btn.classList.toggle('is-empty', !lbl);
  }

  // ---------------------------------------------------------------- icône historique (forçage)
  // Remplace l'icône du déclencheur de l'embed historique par une icône "historique"
  // (horloge + flèche), quelle que soit la version de l'embed, et re-applique à chaque rendu.
  function fixHistoryIcon() {
    const r = root(); if (!r) return;
    const trg = r.querySelector('#oropra-client-history .ch-trigger');
    if (!trg || trg.getAttribute('data-od-icon') === 'clock') return;
    trg.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l3 3"/></svg>';
    trg.setAttribute('data-od-icon', 'clock');
  }
  function watchHistoryIcon() {
    const r = root(); if (!r) return;
    const host = r.querySelector('#oropra-client-history');
    if (!host) return;
    try { if (window.__navHistoMO) window.__navHistoMO.disconnect(); } catch (e) {}
    try {
      const mo = new MutationObserver(function () { fixHistoryIcon(); });
      mo.observe(host, { childList: true, subtree: true });
      window.__navHistoMO = mo;
    } catch (e) {}
    fixHistoryIcon();
  }

  // ---------------------------------------------------------------- badge Clients/Notifs
  function refreshNotifs() {
    const n = Number(getVar(VAR_NB_NOTIFS) || 0);
    const txt = n > 99 ? '99+' : String(n);
    (root() ? root().querySelectorAll('.od-notifs-pill') : []).forEach(function (p) {
      if (n > 0) { p.textContent = txt; p.style.display = ''; } else { p.style.display = 'none'; }
    });
  }
  if (!window.__navNotifsPoll) { window.__navNotifsPoll = setInterval(refreshNotifs, 20000); }

  // ---------------------------------------------------------------- site selector
  // La nav ne fait que LIRE le site-bus (window.oropraSite). Toute la logique de
  // récupération est concentrée dans UN SEUL heartbeat persistant (jamais tué) +
  // un renderSiteState IDEMPOTENT qui ne casse plus aucune chaîne de retry. Fini
  // les dead-ends silencieux et les filets (poll 15s / flags persistants) qui
  // cédaient ensemble sur un login malchanceux -> "Site" vide + dropdown vide.
  function getSiteApi() {
    try {
      const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window;
      return w.oropraSite || window.oropraSite || null;
    } catch (e) { return window.oropraSite || null; }
  }
  function siteName(api, id) {
    const sites = api && api.getSites && api.getSites();
    if (!sites || id == null) return null;
    const s = sites.find(function (x) { return String(x.id_site) === String(id); });
    return s ? s.site : null;
  }
  // Rend l'état SI les données sont là. Ne casse JAMAIS de chaîne : en cas
  // d'indispo transitoire (api/DOM absents, sites vides) -> renvoie false, le
  // heartbeat rappellera. Idempotent via une signature -> coût négligeable par
  // battement + ne reconstruit pas le DOM (et ne ferme pas un menu ouvert).
  function renderSiteState() {
    const api = getSiteApi();
    const r = root();
    if (!api || !r) return false;
    const box = r.querySelector('.od-site');
    const nameEl = r.querySelector('.od-site-name');
    const drop = r.querySelector('.od-site .od-drop');
    if (!box || !nameEl || !drop) return false;
    const sites = (api.getSites && api.getSites()) || [];
    if (!sites.length) return false; // pas encore chargé -> heartbeat rappellera
    const curId = api.getSiteId && api.getSiteId();
    const sig = String(curId) + '|' + sites.map(function (s) { return s.id_site; }).join(',');
    if (box.getAttribute('data-sig') === sig) return true;   // déjà à jour
    if (box.classList.contains('open')) return true;         // ne pas reconstruire un menu ouvert
    nameEl.textContent = siteName(api, curId) || (curId != null ? ('Site ' + curId) : 'Site');
    drop.innerHTML = sites.slice().sort(function (a, b) {
      return String(a.site).localeCompare(String(b.site), 'fr');
    }).map(function (s) {
      return '<a data-site="' + s.id_site + '"' + (String(s.id_site) === String(curId) ? ' class="is-active"' : '') + '>' + esc(s.site) + '</a>';
    }).join('');
    drop.querySelectorAll('[data-site]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        const id = Number(a.getAttribute('data-site'));
        try { api.setSiteId(id); } catch (er) {}
        box.classList.remove('open');
        renderSiteState();
      });
    });
    box.setAttribute('data-sig', sig);
    return true;
  }
  // (Ré)abonne si l'instance oropraSite a changé (site-bus ré-init après login).
  function subscribeSite() {
    const api = getSiteApi();
    if (!api || !api.onChange) return;
    if (window.__navSiteApi === api) return; // déjà abonné à CETTE instance
    try { if (typeof window.__navSiteUnsub === 'function') window.__navSiteUnsub(); } catch (e) {}
    try {
      const h = api.onChange(function () { renderSiteState(); });
      window.__navSiteUnsub = (typeof h === 'function') ? h : null;
    } catch (e) {}
    window.__navSiteApi = api;
  }
  // UN SEUL heartbeat persistant, jamais tué : couvre login lent, re-mount du
  // header, ré-init du site-bus et changement d'instance. renderSiteState étant
  // idempotent (signature), le coût par battement est négligeable.
  function mountSite() {
    subscribeSite();
    if (!window.__navSiteEvt) {
      try { doc.addEventListener('oropra-site-changed', renderSiteState); } catch (e) {}
      try { window.addEventListener('oropra-site-changed', renderSiteState); } catch (e) {}
      window.__navSiteEvt = true;
    }
    renderSiteState();
    if (!window.__navSiteBeat) {
      window.__navSiteBeat = setInterval(function () {
        subscribeSite();
        renderSiteState();
      }, 800);
    }
  }

  // ---------------------------------------------------------------- modale "Mon compte"
  function openAccount() {
    closeBurger();
    const u = user();
    const fullName = [pick(u, ['prenom', 'Prenom', 'PRENOM']), pick(u, ['nom', 'Nom', 'NOM'])].filter(Boolean).join(' ') || pick(u, ['nomComplet', 'nom_complet_affichage']) || 'Mon compte';
    const email = pick(u, ['email', 'Email', 'mail', 'EMAIL']);
    const tel = pick(u, ['N_de_telephone', 'telephone', 'tel', 'phone', 'voip_number']);
    const api = getSiteApi();
    const site = api ? siteName(api, api.getSiteId && api.getSiteId()) : null;

    let rows = '';
    if (email) rows += '<div class="od-row"><span class="od-k">Email</span><span class="od-v">' + esc(email) + '</span></div>';
    if (tel) rows += '<div class="od-row"><span class="od-k">Téléphone</span><span class="od-v">' + esc(tel) + '</span></div>';
    if (site) rows += '<div class="od-row"><span class="od-k">Site</span><span class="od-v">' + esc(site) + '</span></div>';
    if (!rows) rows = '<div class="od-row"><span class="od-k">Compte</span><span class="od-v">' + esc(fullName) + '</span></div>';

    const bg = doc.createElement('div'); bg.className = 'od-modal-bg';
    bg.innerHTML = STYLE +
      '<div class="od-modal">' +
        '<div class="od-modal-head"><span class="od-avatar">' + esc(userInitials()) + '</span><div><div class="od-mh-name">' + esc(fullName) + '</div></div></div>' +
        '<div class="od-modal-body">' + rows + '</div>' +
        '<div class="od-modal-foot"><button data-close>Fermer</button><button class="od-logout" data-logout>Se déconnecter</button></div>' +
      '</div>';
    bg.addEventListener('mousedown', function (e) { if (e.target === bg) bg.remove(); });
    bg.querySelector('[data-close]').addEventListener('click', function () { bg.remove(); });
    bg.querySelector('[data-logout]').addEventListener('click', function () { bg.remove(); goAuth(); });
    doc.body.appendChild(bg);
  }

  // ---------------------------------------------------------------- boot robuste & ré-entrant
  // (Re)construit la nav dès que #nav-root est présent mais vide : premier rendu,
  // apparition du header APRÈS le login, re-mount du header par WeWeb, changement
  // de page... Idempotent : si la nav est déjà rendue (CSS présent), ne fait rien.
  function ensureNav() {
    const r = root();
    if (r && !r.querySelector('#onedata-nav-css')) { build(); return true; }
    return !!r;
  }
  // UN SEUL observer persistant, (RÉ)ARMÉ à chaque exécution pour toujours pointer
  // le <body> vivant du front (après une navigation, l'ancien peut être mort).
  function armNavObserver() {
    try { if (window.__navMo && typeof window.__navMo.disconnect === 'function') window.__navMo.disconnect(); } catch (e) {}
    try {
      const mo = new MutationObserver(function () { ensureNav(); });
      mo.observe(doc.body, { childList: true, subtree: true });
      window.__navMo = mo;
    } catch (e) {}
  }
  // Le user arrive de façon asynchrone (socle). Quand il est prêt, on FORCE un
  // re-render (sinon la garde de version empêche la mise à jour avec le user).
  function onUserReady() {
    try { const r = root(); if (r) r.setAttribute('data-nav-ver', ''); build(); } catch (e) {}
  }
  if (!window.__navUserReadyBound) {
    window.__navUserReadyBound = true;
    try { const wf = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window; wf.addEventListener('oropra-user-ready', onUserReady); } catch (e) {}
    try { window.addEventListener('oropra-user-ready', onUserReady); } catch (e) {}
  }
  function boot() {
    ensureNav();          // rendu immédiat si #nav-root est déjà là
    armNavObserver();     // (ré)arme le watcher sur le body vivant
    // filets : tentatives échelonnées (header monté en différé) + intervalle léger permanent
    [50, 150, 300, 600, 1200, 2500, 5000].forEach(function (d) { setTimeout(ensureNav, d); });
    if (!window.__navSafety) { window.__navSafety = setInterval(ensureNav, 4000); }
  }
  boot();
})();
  }

  function bootHistoClient() {
(function __chMain() {

const SELECTED_CLIENT_VAR_ID = '55490583-c88b-4748-916e-4d203db07742';
const FICHE_CLIENT_PAGE_ID = '259f1951-a2d4-4b90-ac83-0b3febe1d4ec';
const FICHE_CLIENT_WORKFLOW_ID = 'ec8bcc55-a733-4982-a946-13e10ba3b09b';

const doc = wwLib.getFrontDocument();
function getRoot() { return doc.getElementById('oropra-client-history'); }

if (!getRoot()) {
  if (!window.__chWaiting) {
    window.__chWaiting = true;
    let tries = 0;
    const stop = (obs) => { if (obs) { try { obs.disconnect(); } catch (e) {} } window.__chWaiting = false; };
    const tryBoot = (obs) => { if (getRoot()) { stop(obs); __chMain(); return true; } return false; };
    let mo = null;
    try { mo = new MutationObserver(() => tryBoot(mo)); mo.observe(doc.body, { childList: true, subtree: true }); } catch (e) {}
    const poll = () => { tries++; if (tryBoot(mo)) return; if (tries < 50) setTimeout(poll, 100); else stop(mo); };
    setTimeout(poll, 50);
  }
  return;
}
window.__chWaiting = false;

const userConnected = (((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser || {});
const viewerId = userConnected.ID_User;

const state = window.__ch || { open: false, list: null, loading: false, error: null, autoPopulated: false };
window.__ch = state;

function readVar(id) { try { return wwLib.wwVariable.getValue(id); } catch (e) { return null; } }

function _writeVar(varId, value) {
  try { wwLib.wwVariable.updateValue(varId, value); return; }
  catch (e) { console.warn('[ch]', varId, 'failed:', e && e.message); }
  try {
    const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window;
    if (w.variables && Object.prototype.hasOwnProperty.call(w.variables, varId + '-value')) {
      w.variables[varId + '-value'] = value;
    }
  } catch (e) {}
}

// 🔵 Déclenche le workflow "fiche client" (fetch + re-subscribe realtime) pour le client passé
function triggerFicheClient(idvu) {
  try { wwLib.wwWorkflow.executeGlobal(FICHE_CLIENT_WORKFLOW_ID, { IDVu: idvu }); } catch (e) { console.warn('[ch] executeGlobal fiche client KO', e && e.message); }
}

function navigateToFiche() {
  if (!FICHE_CLIENT_PAGE_ID) return;
  try { wwLib.goTo('/fr/fiche-client'); return; } catch (e) { }
  try { if (wwLib.wwLocation && wwLib.wwLocation.goTo) wwLib.wwLocation.goTo({ pageId: FICHE_CLIENT_PAGE_ID }); } catch (e) {}
}

async function autoPopulateFromHistory() {
  if (state.autoPopulated) return;
  if (viewerId == null) return;
  const current = readVar(SELECTED_CLIENT_VAR_ID);
  if (current && current.IDVu != null) { state.autoPopulated = true; return; }
  try {
    const supabase = wwLib.wwPlugins.supabase.instance;
    const { data, error } = await supabase
      .from('client_view_history')
      .select('CLIENT(*)')
      .eq('user_id', String(viewerId))
      .order('viewed_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    state.autoPopulated = true;
    if (data && data[0] && data[0].CLIENT) {
      _writeVar(SELECTED_CLIENT_VAR_ID, Object.assign({}, data[0].CLIENT));
      try { window.dispatchEvent(new CustomEvent('oropra-client-selected', { detail: data[0].CLIENT })); } catch (e) {}
    }
  } catch (e) {
    console.warn('[ch] auto-populate failed:', e && e.message);
    state.autoPopulated = true;
  }
}

async function loadHistory() {
  if (viewerId == null) { state.list = []; return; }
  state.loading = true;
  state.error = null;
  render();
  try {
    const supabase = wwLib.wwPlugins.supabase.instance;
    const { data, error } = await supabase
      .from('client_view_history')
      .select('viewed_at, CLIENT(*)')
      .eq('user_id', String(viewerId))
      .order('viewed_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    state.list = (data || []).filter(r => r.CLIENT);
  } catch (e) {
    console.error('[ch]', e);
    state.error = e.message || String(e);
    state.list = [];
  } finally {
    state.loading = false;
    render();
  }
}

function selectHistoryEntry(entry) {
  if (!entry || !entry.CLIENT) return;
  _writeVar(SELECTED_CLIENT_VAR_ID, Object.assign({}, entry.CLIENT));
  triggerFicheClient(entry.CLIENT.IDVu);          // 🔵 fetch + re-subscribe realtime
  state.open = false;
  render();
  try { window.dispatchEvent(new CustomEvent('oropra-client-selected', { detail: entry.CLIENT })); } catch (e) {}
  navigateToFiche();
}

function toggle() { state.open = !state.open; if (state.open) loadHistory(); render(); }
function close() { if (state.open) { state.open = false; render(); } }

function esc(s) { if (s == null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function formatRelativeTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'à l\'instant';
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `il y a ${diffHour} h`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `il y a ${diffDay} j`;
  return d.toLocaleDateString('fr-FR');
}

function clientLabel(c) {
  const soc = c.idmultivu === 1 || c.idmultivu === '1';
  if (soc) return [c.CIVILITE, c.NOM].filter(Boolean).join(' ');
  return [c.PRENOM, (c.NOM || '').toUpperCase()].filter(Boolean).join(' ');
}

// Icône "historique" (horloge avec flèche de retour) — remplace l'ancien chevron
const ICON_CHEVRON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l3 3"/></svg>';
const ICON_P = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
const ICON_S = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21V12h6v9"/></svg>';
const ICON_CLOCK = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

const STYLE = `<style>
#oropra-client-history{font-family:"Nunito Sans",system-ui,sans-serif;position:relative;display:inline-block}
#oropra-client-history *{box-sizing:border-box}
#oropra-client-history .ch-trigger{background:none;border:none;cursor:pointer;color:#2a5ea9;padding:5px 7px;display:inline-flex;align-items:center;border-radius:5px;line-height:0;transition:background-color .15s,color .15s}
#oropra-client-history .ch-trigger:hover{color:#0c447c;background:#f2f6fc}
#oropra-client-history .ch-trigger.is-open{color:#0c447c;background:#eef4fc}
#oropra-client-history .ch-panel{position:absolute;top:calc(100% + 8px);left:0;background:#fff;border:1px solid #e3edf9;border-radius:10px;box-shadow:0 10px 30px rgba(42,94,169,.16);width:340px;max-height:480px;display:flex;flex-direction:column;z-index:200;color:#2a5ea9}
#oropra-client-history .ch-panel-header{padding:14px 16px;border-bottom:1px solid #f0f4fa;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#7a98c5;font-weight:600}
#oropra-client-history .ch-list{overflow-y:auto;flex:1}
#oropra-client-history .ch-item{padding:11px 16px;cursor:pointer;border-bottom:1px solid #f5f8fc;display:flex;align-items:flex-start;gap:10px}
#oropra-client-history .ch-item:last-child{border-bottom:none}
#oropra-client-history .ch-item:hover{background:#f7fafd}
#oropra-client-history .ch-item-icon{flex:0 0 auto;color:#53bda7;background:#eef9f5;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-top:1px}
#oropra-client-history .ch-item-body{flex:1;min-width:0}
#oropra-client-history .ch-item-name{font-size:13px;font-weight:500;color:#2a5ea9;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#oropra-client-history .ch-item-meta{font-size:11px;color:#7a98c5;margin-top:3px;display:flex;align-items:center;gap:5px;flex-wrap:wrap}
#oropra-client-history .ch-item-meta-sep{opacity:.5}
#oropra-client-history .ch-empty{padding:40px 16px;text-align:center;color:#8aa3c3;font-size:12px;display:flex;align-items:center;justify-content:center;gap:8px}
#oropra-client-history .ch-spinner{display:inline-block;width:12px;height:12px;border:2px solid #e3edf9;border-top-color:#53bda7;border-radius:50%;animation:ch-spin .8s linear infinite}
@keyframes ch-spin{to{transform:rotate(360deg)}}
</style>`;

function render() {
  const root = getRoot();
  if (!root) return;
  let h = `<button class="ch-trigger${state.open ? ' is-open' : ''}" data-ch-action="toggle" title="Historique des clients consultés">${ICON_CHEVRON}</button>`;
  if (state.open) {
    h += '<div class="ch-panel">';
    h += '<div class="ch-panel-header">Clients consultés récemment</div>';
    h += '<div class="ch-list">';
    if (state.loading) {
      h += '<div class="ch-empty"><span class="ch-spinner"></span> Chargement…</div>';
    } else if (state.error) {
      h += `<div class="ch-empty">Erreur : ${esc(state.error)}</div>`;
    } else if (!state.list || !state.list.length) {
      h += '<div class="ch-empty">Aucun client consulté pour le moment.</div>';
    } else {
      for (let i = 0; i < state.list.length; i++) {
        const entry = state.list[i];
        const c = entry.CLIENT;
        const soc = c.idmultivu === 1 || c.idmultivu === '1';
        const ville = [c.code_postal, c.ville].filter(Boolean).join(' ');
        const time = entry.viewed_at ? formatRelativeTime(entry.viewed_at) : '';
        h += `<div class="ch-item" data-ch-action="pick" data-idx="${i}">
          <div class="ch-item-icon">${soc ? ICON_S : ICON_P}</div>
          <div class="ch-item-body">
            <div class="ch-item-name">${esc(clientLabel(c))}</div>
            <div class="ch-item-meta">
              ${ICON_CLOCK}<span>${esc(time)}</span>
              ${ville ? `<span class="ch-item-meta-sep">·</span><span>${esc(ville)}</span>` : ''}
            </div>
          </div>
        </div>`;
      }
    }
    h += '</div></div>';
  }
  root.innerHTML = STYLE + h;
  bindEvents();
}

function bindEvents() {
  const root = getRoot();
  if (!root) return;
  root.querySelectorAll('[data-ch-action="toggle"]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); toggle(); }));
  root.querySelectorAll('[data-ch-action="pick"]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const idx = Number(el.getAttribute('data-idx'));
    if (state.list && state.list[idx]) selectHistoryEntry(state.list[idx]);
  }));
}

if (!window.__chDocOutsideBound) {
  doc.addEventListener('mousedown', function (e) {
    const r = doc.getElementById('oropra-client-history');
    if (r && !r.contains(e.target)) close();
  }, true);
  window.__chDocOutsideBound = true;
}

if (!window.__chHistoryListenerBound) {
  window.addEventListener('oropra-history-updated', () => { if (state.open) loadHistory(); });
  window.__chHistoryListenerBound = true;
}

autoPopulateFromHistory();
render();

if (!window.__chMoBound) {
  const mo = new MutationObserver(() => {
    const root = getRoot();
    if (root && !root.querySelector('style')) render();
  });
  try { mo.observe(doc.body, { childList: true, subtree: true }); } catch (e) {}
  window.__chMoBound = true;
}

(function ensureRenderedCh() {
  const delays = [250, 600, 1200, 2500];
  delays.forEach(d => setTimeout(() => { const root = getRoot(); if (root && !root.querySelector('style')) render(); }, d));
})();

// Le user arrive de façon asynchrone (socle) : quand il est prêt, on relance le
// module pour recharger viewerId + l'historique (sinon viewerId reste null).
if (!window.__chUserReadyBound) {
  window.__chUserReadyBound = true;
  const reboot = () => { try { __chMain(); } catch (e) {} };
  try { const wf = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window; wf.addEventListener('oropra-user-ready', reboot); } catch (e) {}
  try { window.addEventListener('oropra-user-ready', reboot); } catch (e) {}
}

})();
  }

  boot();
  }
});