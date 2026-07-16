// ============================================================================
//  AUTHENTIFICATION — module One Data (OD.define)  v2 (étape B)
//  bootTopNav() NEUTRALISÉ : la top nav est désormais le module 'topnav'.
//  Branding via ctx.tenant ; rendu dans __anchor ; login via ctx.supabase
//  (repli plugin). L'historique client a été extrait -> module client-history.
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
    // (historique client : désormais monté par la top nav via le module 'client-history')
    navigateAccueil();
  }

  function navigateAccueil() {
    // ÉDITEUR vs PROD : en éditeur, location.href recharge l'iframe de preview et
    // emboîte un nouvel éditeur (double bootstrap). On y navigue donc en SPA.
    // En prod, location.href avec préfixe de langue est le plus fiable (/fr/…).
    var inEditor = false;
    try { inEditor = (window.self !== window.top) || /-editor\.weweb\.io|weweb\.io/i.test(location.hostname); } catch (e) {}
    if (inEditor) {
      try { if (wwLib.wwApp && wwLib.wwApp.goTo) { wwLib.wwApp.goTo(ACCUEIL_PATH); return; } } catch (e) {}
      try { wwLib.goTo(ACCUEIL_PATH); return; } catch (e) {}
      return;
    }
    // PROD : navigation par URL avec le préfixe de langue déduit de l'URL courante.
    try {
      var m = (win.location.pathname || '').match(/^\/([a-z]{2})(\/|$)/i);
      var langPrefix = m ? '/' + m[1] : '/fr';
      win.location.href = langPrefix + ACCUEIL_PATH;
      return;
    } catch (e) {}
    try { if (wwLib.wwApp && wwLib.wwApp.goTo) { wwLib.wwApp.goTo(ACCUEIL_PATH); return; } } catch (e) {}
    try { wwLib.goTo(ACCUEIL_PATH); return; } catch (e) {}
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
  function bootTopNav() { /* migré -> module OD.define('topnav'). Ne fait plus rien ici. */ }

  // bootHistoClient() RETIRÉ : l'historique client est devenu le module
  // 'client-history', monté par la top nav (il n'était initialisé qu'au login,
  // donc absent après un F5 ou en navigation SPA).

  boot();
  }
});