// ============================================================================
//  TOP NAV — module One Data (OD.define)  v2 (étape B) — refresh user au montage
//  Extrait de authDefine. Rendu dans __anchor (#nav-root) ; logo via
//  ctx.tenant.logo_url ; ref morte Userconnected retirée.
//  GARDÉS (constants de l'app partagée, identiques pour tous les tenants) :
//  PAGE_UID, VAR_CLIENT, VAR_NB_NOTIFS, FICHE_TAB_VAR + tout l'auto-persistance
//  (observer/heartbeat) qui maintient la nav à travers les navigations.
// ============================================================================
OD.define('topnav', {
  _inited: false,
  mount(__anchor, ctx) {
    __anchor.id = 'nav-root';
    if (this._inited) return;
    this._inited = true;
(function () {
  if (!window.wwLib) { return; }
  const wwLib = window.wwLib;
  const doc = __anchor.ownerDocument || wwLib.getFrontDocument();
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
  const SUPPORT_MAIL = 'oropra.gen@gmail.com';
  const LOGO_URL = (ctx && ctx.tenant && ctx.tenant.logo_url) || "";   // logo du tenant

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
    { t: 'Doublons', act: 'doublons', badge: true },
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
      var extra = it.badge ? '<span class="od-arb-badge" id="od-arb-badge" hidden></span>' : '';
      userItems += '<a ' + (it.p ? 'data-page="' + it.p + '"' : 'data-act="' + it.act + '"') + (it.danger ? ' class="od-danger"' : '') + '>' + esc(it.t) + extra + '</a>';
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
            // Ancre : le loader y monte le module 'client-history'. Il vivait
            // dans auth.js et n'était initialisé qu'au login -> absent après un
            // F5 ou en navigation. Monté ici, il est présent partout.
            '<div id="oropra-client-history" data-od-module="client-history"></div>' +
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
        if (!wasOpen && parent.classList.contains('od-user')) rafraichirBadgeArbitrage();
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
        else if (a === 'doublons') openArbitrage();
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

  const ARB_STYLE = '<style id="od-arb-css">' +
'.od-arb-bg{align-items:flex-start;padding:40px 18px;overflow:auto}' +
'.od-arb-modal{background:#fff;border-radius:20px;width:680px;max-width:100%;overflow:hidden;box-shadow:0 24px 70px -18px rgba(31,74,133,.4);font-family:"Nunito Sans",system-ui,sans-serif;color:#1F4A85}' +
'.od-arb-modal *{box-sizing:border-box}' +
'.od-arb-head{display:flex;align-items:center;gap:14px;padding:18px 22px 15px;border-bottom:1px solid #e8eef7}' +
'.od-arb-ic{width:40px;height:40px;border-radius:11px;background:#2a5ea9;display:flex;align-items:center;justify-content:center;color:#fff;flex:0 0 auto}' +
'.od-arb-ic svg{width:21px;height:21px}' +
'.od-arb-htxt{flex:1 1 auto;min-width:0}.od-arb-htxt h1{font-size:17px;font-weight:900;margin:0;letter-spacing:-.02em}.od-arb-htxt p{margin:2px 0 0;font-size:12px;color:#7a98c5}' +
'.od-arb-x{width:32px;height:32px;border-radius:8px;border:none;background:none;color:#7a98c5;font-size:20px;cursor:pointer;flex:0 0 auto}.od-arb-x:hover{background:#f7f9fc;color:#1F4A85}' +
'.od-arb-load{padding:50px 24px;text-align:center;color:#7a98c5;font-size:13.5px}' +
'.od-arb-erru{margin:12px 22px 0;padding:10px 14px;background:#fcebeb;border:1px solid #f3d4d4;color:#e24b4a;border-radius:10px;font-size:12.5px;font-weight:600}' +
'.od-arb-ruban{display:flex;align-items:center;gap:12px;padding:11px 22px;background:#f7f9fc;border-bottom:1px solid #e8eef7;font-size:12px;color:#7a98c5;font-weight:600}' +
'.od-arb-ruban .reste{color:#1F4A85;font-weight:800;font-size:14px}' +
'.od-arb-jauge{flex:1 1 auto;height:6px;border-radius:99px;background:#e8eef7;overflow:hidden}.od-arb-jauge i{display:block;height:100%;background:#53bda7;border-radius:99px;transition:width .4s cubic-bezier(.3,.8,.3,1)}' +
'.od-arb-mini{display:flex;gap:14px}.od-arb-mini b{color:#3a8d7b}.od-arb-mini .r b{color:#7a98c5}' +
'.od-arb-pile{position:relative;padding:22px}' +
'.od-arb-ghost{position:absolute;left:22px;right:22px;top:22px;height:170px;border-radius:15px;background:#fff;border:1px solid #e8eef7}' +
'.od-arb-ghost.g1{transform:translateY(9px) scale(.97);opacity:.6;z-index:1}.od-arb-ghost.g2{transform:translateY(18px) scale(.945);opacity:.35;z-index:0}' +
'.od-arb-carte{position:relative;z-index:2;background:#fff;border:1px solid #e8eef7;border-radius:15px;box-shadow:0 12px 32px -14px rgba(31,74,133,.22);overflow:hidden;animation:odArbMonte .42s cubic-bezier(.2,.7,.3,1)}' +
'@keyframes odArbMonte{from{transform:translateY(24px) scale(.97);opacity:0}to{transform:none;opacity:1}}' +
'.od-arb-carte.partir-fusion{animation:odArbFus .5s forwards cubic-bezier(.4,0,.6,1)}@keyframes odArbFus{to{transform:translateY(-38px) scale(.9);opacity:0}}' +
'.od-arb-carte.partir-rejet{animation:odArbRej .45s forwards ease-in}@keyframes odArbRej{to{transform:translateX(56px) rotate(4deg);opacity:0}}' +
'.od-arb-carte.partir-report{animation:odArbRep .45s forwards ease-in}@keyframes odArbRep{to{transform:translateY(56px) scale(.94);opacity:0}}' +
'.od-arb-mtf{display:flex;align-items:center;gap:9px;padding:12px 18px;background:#f7f9fc;border-bottom:1px solid #e8eef7;flex-wrap:wrap}' +
'.od-arb-force{font-size:10.5px;font-weight:900;letter-spacing:.05em;padding:4px 9px;border-radius:6px;text-transform:uppercase}.od-arb-force.fort{background:#eaf7f4;color:#3a8d7b}.od-arb-force.moyen{background:#fdf6e6;color:#8a5e08}' +
'.od-arb-mtf .sur{font-size:12px;color:#7a98c5}' +
'.od-arb-tag{font-size:11px;font-weight:700;background:#fff;border:1px solid #e8eef7;color:#7a98c5;padding:3px 9px;border-radius:99px}.od-arb-tag.pos{border-color:#bce4db;color:#3a8d7b;background:#eaf7f4}.od-arb-tag.neg{border-color:#f3d4d4;color:#e24b4a;background:#fcebeb}' +
'.od-arb-simple{padding:20px 22px}.od-arb-simple .duo{display:flex;border:1px solid #e8eef7;border-radius:13px;overflow:hidden}' +
'.od-arb-simple .mini{flex:1;padding:15px 17px}.od-arb-simple .mini.a{background:#eef4fc}.od-arb-simple .mini.b{background:#eaf7f4}' +
'.od-arb-simple .ref{font-size:10.5px;font-weight:800;letter-spacing:.03em;margin-bottom:6px}.od-arb-simple .mini.a .ref{color:#2a5ea9}.od-arb-simple .mini.b .ref{color:#53bda7}' +
'.od-arb-simple .n{font-size:15px;font-weight:800;margin-bottom:2px}.od-arb-simple .l{font-size:12px;color:#5a72a0}' +
'.od-arb-simple .fleche{display:flex;align-items:center;justify-content:center;padding:0 5px;background:#fff;color:#53bda7}.od-arb-simple .fleche svg{width:21px;height:21px}' +
'.od-arb-simple .verdict{margin-top:15px;text-align:center;font-size:13px;color:#5a72a0}.od-arb-simple .verdict b{color:#1F4A85}' +
'.od-arb-peint{padding:18px 22px}.od-arb-peint .intro{font-size:12px;color:#7a98c5;margin:0 0 15px;text-align:center}.od-arb-peint .intro b{color:#1F4A85}' +
'.od-arb-res{border:1.5px solid #bce4db;border-radius:13px;padding:15px 17px;margin-bottom:17px;background:#eaf7f4;position:relative}' +
'.od-arb-res::before{content:"FICHE FINALE";position:absolute;top:-9px;left:15px;background:#53bda7;color:#fff;font-size:9px;font-weight:900;letter-spacing:.08em;padding:2px 8px;border-radius:5px}' +
'.od-arb-res .rg{display:grid;grid-template-columns:1fr 1fr;gap:7px 18px;margin-top:3px}' +
'.od-arb-res .rc{display:flex;flex-direction:column;gap:1px}.od-arb-res .rk{font-size:10px;font-weight:700;color:#7a98c5;text-transform:uppercase;letter-spacing:.03em}' +
'.od-arb-res .rv{font-size:13px;font-weight:600;min-height:18px}.od-arb-res .rv.vide{color:#7a98c5;opacity:.6;font-weight:400;font-style:italic}' +
'.od-arb-res .pin{display:inline-block;width:7px;height:7px;border-radius:99px;margin-right:6px;vertical-align:1px}.od-arb-res .pin.a{background:#2a5ea9}.od-arb-res .pin.b{background:#53bda7}' +
'.od-arb-peint .ct{font-size:11px;font-weight:800;color:#7a98c5;text-transform:uppercase;letter-spacing:.04em;margin:0 0 9px}' +
'.od-arb-cf{display:grid;grid-template-columns:90px 1fr 1fr;gap:9px;align-items:stretch;margin-bottom:8px}.od-arb-cf .ck{display:flex;align-items:center;font-size:12px;font-weight:700;color:#5a72a0}' +
'.od-arb-opt{border:2px solid #e8eef7;border-radius:10px;padding:9px 24px 9px 11px;text-align:left;background:#fff;cursor:pointer;position:relative;transition:.15s;font-family:inherit}.od-arb-opt:hover{border-color:#acc5e4}' +
'.od-arb-opt .ov{font-size:13px;font-weight:700;color:#1F4A85;word-break:break-word;line-height:1.3}.od-arb-opt .ov.vide{color:#7a98c5;opacity:.6;font-weight:400;font-style:italic}' +
'.od-arb-opt .os{font-size:10px;font-weight:600;margin-left:6px;white-space:nowrap}.od-arb-opt.a .os{color:#2a5ea9}.od-arb-opt.b .os{color:#53bda7}' +
'.od-arb-opt.a[aria-pressed="true"]{border-color:#2a5ea9;background:#eef4fc}.od-arb-opt.b[aria-pressed="true"]{border-color:#53bda7;background:#eaf7f4}' +
'.od-arb-opt[aria-pressed="true"]::after{content:"✓";position:absolute;top:8px;right:9px;font-size:11px;font-weight:900}.od-arb-opt.a[aria-pressed="true"]::after{color:#2a5ea9}.od-arb-opt.b[aria-pressed="true"]::after{color:#53bda7}' +
'.od-arb-id{margin-top:5px}.od-arb-id summary{font-size:12px;color:#7a98c5;cursor:pointer;padding:8px 0;font-weight:600;list-style:none}.od-arb-id summary::-webkit-details-marker{display:none}.od-arb-id summary::before{content:"▸ ";color:#acc5e4}.od-arb-id[open] summary::before{content:"▾ "}' +
'.od-arb-id .idr{display:grid;grid-template-columns:90px 1fr;gap:9px;font-size:12px;padding:4px 0;color:#5a72a0}.od-arb-id .idk{font-weight:700;color:#7a98c5}' +
'.od-arb-act{display:flex;gap:9px;padding:15px 22px;border-top:1px solid #e8eef7;background:#f7f9fc}' +
'.od-arb-b{flex:1;padding:12px 14px;border-radius:11px;font-size:13.5px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer;border:none;font-family:inherit;transition:.15s}.od-arb-b svg{width:16px;height:16px}.od-arb-b:disabled{opacity:.5;cursor:default}' +
'.od-arb-b.fusion{background:#53bda7;color:#fff;flex:1.6}.od-arb-b.fusion:hover:not(:disabled){background:#48ad98}' +
'.od-arb-b.rejet{background:#fff;border:1.5px solid #e8eef7;color:#5a72a0}.od-arb-b.rejet:hover:not(:disabled){border-color:#e24b4a;color:#e24b4a;background:#fcebeb}' +
'.od-arb-b.report{background:#fff;border:1.5px solid #e8eef7;color:#5a72a0}.od-arb-b.report:hover:not(:disabled){border-color:#fac055;color:#8a5e08;background:#fdf6e6}' +
'.od-arb-vide{padding:60px 30px;text-align:center}.od-arb-vide .ok{width:64px;height:64px;border-radius:50%;background:#eaf7f4;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:#53bda7}.od-arb-vide .ok svg{width:30px;height:30px}' +
'.od-arb-vide h2{font-size:18px;font-weight:900;margin:0 0 6px}.od-arb-vide p{color:#7a98c5;margin:0;font-size:13px}' +
'.od-arb-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;margin-left:auto;background:#e24b4a;color:#fff;font-size:11px;font-weight:800;border-radius:99px}' +
'@media(max-width:620px){.od-arb-modal{width:100%}.od-arb-res .rg{grid-template-columns:1fr}.od-arb-cf{grid-template-columns:1fr;gap:5px}.od-arb-act{flex-wrap:wrap}.od-arb-b{flex:1 1 100%}}' +
'</style>';



  // ================================================================
  //  ARBITRAGE DES DOUBLONS  — modale, dans le menu utilisateur
  //  Câblé sur : client_file_arbitrage, client_arbitrage_detail,
  //  client_arbitrer. Périmètre géré côté RPC.
  // ================================================================
  const ARB_CHAMPS = [
    ['civilite','Civilité'], ['nom','Nom'], ['prenom','Prénom'],
    ['mobile','Portable'], ['email','E-mail'], ['adresse','Adresse'],
    ['code_postal','Code postal'], ['ville','Ville'], ['naissance','Naissance']
  ];
  const ARB_LIB = {
    siret_identique:'même SIRET', mobile_identique:'même portable',
    email_identique:'même e-mail', fixe_identique:'même fixe',
    nom_prenom_exact:'même nom et prénom', nom_prenom_inverses:'nom et prénom inversés',
    nom_trigram:'nom très proche', naissance_identique:'même naissance',
    naissance_differente:'naissances différentes', insee_identique:'même commune',
    adresse_trigram:'adresse très proche', email_different:'e-mails différents',
    nature_differente:'société vs particulier', vin_commun:'même véhicule'
  };

  function arbSb() {
    try { return wwLib.wwPlugins && wwLib.wwPlugins.supabase && wwLib.wwPlugins.supabase.instance; }
    catch (e) { return null; }
  }
  function arbUserId() {
    const u = user();
    const v = pick(u, ['ID_User','id_user','ID_USER']);
    return v !== '' ? Number(v) : null;
  }
  function arbVal(f, k) { return f && f[k] != null ? String(f[k]).trim() : ''; }
  function arbNom(f) { return [f.civilite, f.nom, (f.societe ? '' : f.prenom)].filter(Boolean).join(' '); }

  // ---- badge compteur dans le menu -------------------------------
  async function rafraichirBadgeArbitrage() {
    const el = root() && root().querySelector('#od-arb-badge');
    if (!el) return;
    const sb = arbSb(), uid = arbUserId();
    if (!sb || uid == null) return;
    try {
      const { data, error } = await sb.rpc('client_file_arbitrage', { p_id_user: uid, p_statut: 'en_attente', p_limit: 99 });
      if (error) return;
      const n = data && data.lignes ? data.lignes.length : 0;
      if (n > 0) { el.textContent = n > 99 ? '99+' : String(n); el.hidden = false; }
      else { el.hidden = true; }
    } catch (e) {}
  }

  // ---- ouverture de la modale ------------------------------------
  let ARB = null;   // état courant : { file, i, choix, survivant }

  async function openArbitrage() {
    closeBurger();
    const sb = arbSb(), uid = arbUserId();
    const bg = doc.createElement('div');
    bg.className = 'od-modal-bg od-arb-bg';
    bg.innerHTML = ARB_STYLE + '<div class="od-arb-modal" id="od-arb"></div>';
    bg.addEventListener('mousedown', function (e) { if (e.target === bg) bg.remove(); });
    doc.body.appendChild(bg);
    ARB = { file: [], i: 0, choix: {}, survivant: 'a', busy: false, fus: 0, rej: 0 };

    arbRender(true);   // état de chargement
    if (!sb || uid == null) { ARB.err = "Session indisponible."; arbRender(); return; }
    try {
      const { data, error } = await sb.rpc('client_file_arbitrage', { p_id_user: uid, p_statut: 'en_attente', p_limit: 200 });
      if (error) throw error;
      ARB.file = (data && data.lignes) ? data.lignes : [];
    } catch (e) { ARB.err = (e && e.message) || 'Erreur de chargement.'; }
    arbRender();
  }

  function arbClose() { const bg = doc.querySelector('.od-arb-bg'); if (bg) bg.remove(); ARB = null; rafraichirBadgeArbitrage(); }

  // ---- rendu ------------------------------------------------------
  function arbRender(loading) {
    const box = doc.getElementById('od-arb'); if (!box) return;
    if (loading && !ARB.file.length && !ARB.err) { box.innerHTML = arbHead() + '<div class="od-arb-load">Chargement de la file…</div>'; arbBindClose(); return; }
    if (ARB.err) { box.innerHTML = arbHead() + '<div class="od-arb-load">' + esc(ARB.err) + '</div>'; arbBindClose(); return; }
    const reste = ARB.file.length - ARB.i;
    if (reste <= 0) { box.innerHTML = arbHead() + arbVide(); arbBindClose(); return; }

    const d = ARB.detail || null;
    if (!d) { box.innerHTML = arbHead() + arbRuban(reste) + '<div class="od-arb-load">Ouverture du dossier…</div>'; arbBindClose(); arbLoadDetail(); return; }

    const conflits = arbAnalyse(d).conflits;
    const identiques = arbAnalyse(d).identiques;
    const simple = conflits.length === 0;
    if (!simple && Object.keys(ARB.choix).length === 0) ARB.choix = arbPreselection(d, conflits);

    box.innerHTML = arbHead() + arbRuban(reste) +
      '<div class="od-arb-pile">' +
        (reste > 1 ? '<div class="od-arb-ghost g1"></div>' : '') +
        (reste > 2 ? '<div class="od-arb-ghost g2"></div>' : '') +
        '<div class="od-arb-carte" id="od-arb-carte">' +
          arbMotif(d) +
          (simple ? arbSimple(d) : arbPeint(d, conflits, identiques)) +
          arbActions(simple) +
        '</div>' +
      '</div>';
    arbBind(d, conflits, simple);
  }

  async function arbLoadDetail() {
    const sb = arbSb(), uid = arbUserId();
    const ligne = ARB.file[ARB.i]; if (!ligne) return;
    try {
      const { data, error } = await sb.rpc('client_arbitrage_detail', { p_id_file: ligne.id_file, p_id_user: uid });
      if (error) throw error;
      // fiche_entrant = 'b' (créée), fiche_candidat = 'a' (existante)
      ARB.detail = {
        id_file: ligne.id_file, score: ligne.score, detail: ligne.detail || {},
        a: data.fiche_candidat || {}, b: data.fiche_entrant || {}
      };
      ARB.choix = {}; ARB.survivant = 'a';
      arbRender();
    } catch (e) { ARB.err = (e && e.message) || 'Dossier illisible.'; arbRender(); }
  }

  function arbAnalyse(d) {
    const conflits = [], identiques = [];
    ARB_CHAMPS.forEach(function (pair) {
      const k = pair[0], lbl = pair[1];
      const va = arbVal(d.a, k), vb = arbVal(d.b, k);
      if (va && vb && va.toLowerCase() === vb.toLowerCase()) identiques.push([k, lbl, va]);
      else if (!va && !vb) {}
      else conflits.push([k, lbl, va, vb]);
    });
    return { conflits: conflits, identiques: identiques };
  }
  function arbPreselection(d, conflits) {
    const c = {};
    conflits.forEach(function (row) {
      const k = row[0], va = row[2], vb = row[3];
      c[k] = (vb && (!va || vb.length > va.length)) ? 'b' : 'a';
    });
    return c;
  }

  function arbHead() {
    return '<div class="od-arb-head"><div class="od-arb-ic">' + I_ARB.users + '</div>' +
      '<div class="od-arb-htxt"><h1>Arbitrage des doublons</h1><p>Deux fiches semblent désigner le même client. Vous tranchez.</p></div>' +
      '<button class="od-arb-x" data-arb-close>&times;</button></div>';
  }
  function arbRuban(reste) {
    const tot = ARB.file.length, pct = tot ? Math.round(ARB.i / tot * 100) : 0;
    return '<div class="od-arb-ruban"><span class="reste">' + reste + '</span><span>à arbitrer</span>' +
      '<div class="od-arb-jauge"><i style="width:' + pct + '%"></i></div>' +
      '<div class="od-arb-mini"><span><b>' + ARB.fus + '</b> fusionnés</span><span class="r"><b>' + ARB.rej + '</b> écartés</span></div></div>';
  }
  function arbMotif(d) {
    const fort = (d.score >= 90);
    const sig = Object.keys(d.detail || {}).map(function (k) {
      const val = d.detail[k]; const cls = val > 0 ? 'pos' : 'neg';
      return '<span class="od-arb-tag ' + cls + '">' + esc(ARB_LIB[k] || k) + '</span>';
    }).join('');
    return '<div class="od-arb-mtf"><span class="od-arb-force ' + (fort ? 'fort' : 'moyen') + '">' +
      (fort ? 'Quasi certain' : 'À vérifier') + '</span><span class="sur">rapprochement sur</span>' + sig + '</div>';
  }

  function arbSimple(d) {
    return '<div class="od-arb-simple"><div class="duo">' +
      arbMini('a', d.a) + '<div class="fleche">' + I_ARB.arrow + '</div>' + arbMini('b', d.b) +
    '</div><p class="verdict">Les deux fiches concordent. La fusion conserve <b>' + esc(arbNom(d.a)) +
    '</b> (fiche ' + esc(d.a.idvu) + ') et récupère les infos de la fiche ' + esc(d.b.idvu) + '.</p></div>';
  }
  function arbMini(cote, f) {
    return '<div class="mini ' + cote + '"><div class="ref">' + (cote === 'a' ? 'Fiche existante' : 'Vient d\'être créée') + '</div>' +
      '<div class="n">' + esc(arbNom(f)) + '</div>' +
      '<div class="l">' + esc([f.mobile, f.email].filter(Boolean).join(' · ')) + '</div>' +
      '<div class="l">' + esc([f.code_postal, f.ville].filter(Boolean).join(' ') + (f.vehicules ? ' · ' + f.vehicules + ' véh.' : '')) + '</div></div>';
  }

  function arbPeint(d, conflits, identiques) {
    return '<div class="od-arb-peint">' +
      '<p class="intro">Pour chaque ligne, <b>touchez la valeur à conserver</b>. La fiche finale se compose au-dessus.</p>' +
      arbResultat(d, conflits) +
      '<p class="ct">À trancher — ' + conflits.length + ' champ' + (conflits.length > 1 ? 's' : '') + '</p>' +
      conflits.map(function (c) { return arbLigne(d, c); }).join('') +
      (identiques.length ? arbIdentiques(identiques) : '') + '</div>';
  }
  function arbResultat(d, conflits) {
    const cells = ARB_CHAMPS.map(function (pair) {
      const k = pair[0], lbl = pair[1], va = arbVal(d.a, k), vb = arbVal(d.b, k);
      let src, v;
      if (va && vb && va.toLowerCase() === vb.toLowerCase()) { src = ARB.survivant; v = va; }
      else if (!va && !vb) { src = null; v = ''; }
      else if (va && vb) { src = ARB.choix[k] || 'a'; v = (src === 'a') ? va : vb; }
      else { src = va ? 'a' : 'b'; v = va || vb; }
      const pin = src ? '<span class="pin ' + src + '"></span>' : '';
      return '<div class="rc"><span class="rk">' + lbl + '</span><span class="rv' + (v ? '' : ' vide') + '">' + pin + (esc(v) || '—') + '</span></div>';
    }).join('');
    return '<div class="od-arb-res"><div class="rg">' + cells + '</div></div>';
  }
  function arbLigne(d, row) {
    const k = row[0], lbl = row[1], va = row[2], vb = row[3];
    return '<div class="od-arb-cf" data-champ="' + k + '"><div class="ck">' + lbl + '</div>' +
      arbOpt('a', k, va) + arbOpt('b', k, vb) + '</div>';
  }
  function arbOpt(cote, k, v) {
    const on = (ARB.choix[k] || 'a') === cote;
    const src = (cote === 'a') ? 'existante' : 'saisie vendeur';
    return '<button class="od-arb-opt ' + cote + '" data-champ="' + k + '" data-cote="' + cote + '" aria-pressed="' + on + '">' +
      '<span class="ov' + (v ? '' : ' vide') + '">' + (esc(v) || 'non renseigné') + '</span>' +
      '<span class="os">(' + src + ')</span></button>';
  }
  function arbIdentiques(identiques) {
    return '<details class="od-arb-id"><summary>' + identiques.length + ' champ' + (identiques.length > 1 ? 's identiques' : ' identique') + '</summary>' +
      identiques.map(function (r) { return '<div class="idr"><span class="idk">' + r[1] + '</span><span>' + esc(r[2]) + '</span></div>'; }).join('') + '</details>';
  }

  function arbActions(simple) {
    return '<div class="od-arb-act">' +
      '<button class="od-arb-b fusion" data-arb="fusion"' + (ARB.busy ? ' disabled' : '') + '>' + I_ARB.check + '<span>' + (simple ? 'Fusionner' : 'Fusionner ainsi') + '</span></button>' +
      '<button class="od-arb-b rejet" data-arb="rejet"' + (ARB.busy ? ' disabled' : '') + '>' + I_ARB.x + '<span>Pas un doublon</span></button>' +
      '<button class="od-arb-b report" data-arb="report"' + (ARB.busy ? ' disabled' : '') + '>' + I_ARB.clock + '<span>Plus tard</span></button></div>';
  }
  function arbVide() {
    return '<div class="od-arb-vide"><div class="ok">' + I_ARB.check + '</div><h2>File vide</h2>' +
      '<p>Plus aucun doublon à arbitrer dans votre périmètre. ' + ARB.fus + ' fusionnés, ' + ARB.rej + ' écartés.</p></div>';
  }

  // ---- interactions ----------------------------------------------
  function arbBindClose() {
    const x = doc.querySelector('[data-arb-close]'); if (x) x.addEventListener('click', arbClose);
  }
  function arbBind(d, conflits, simple) {
    arbBindClose();
    if (!simple) {
      doc.querySelectorAll('.od-arb-opt').forEach(function (b) {
        b.addEventListener('click', function () {
          ARB.choix[b.getAttribute('data-champ')] = b.getAttribute('data-cote');
          arbRepeindre(d, conflits);
        });
      });
    }
    doc.querySelectorAll('[data-arb]').forEach(function (b) {
      b.addEventListener('click', function () { arbTrancher(b.getAttribute('data-arb'), d, conflits); });
    });
  }
  function arbRepeindre(d, conflits) {
    const carte = doc.getElementById('od-arb-carte'); if (!carte) return;
    const old = carte.querySelector('.od-arb-res');
    const tmp = doc.createElement('div'); tmp.innerHTML = arbResultat(d, conflits);
    if (old) old.replaceWith(tmp.firstChild);
    carte.querySelectorAll('.od-arb-opt').forEach(function (b) {
      b.setAttribute('aria-pressed', String((ARB.choix[b.getAttribute('data-champ')] || 'a') === b.getAttribute('data-cote')));
    });
  }

  async function arbTrancher(action, d, conflits) {
    if (ARB.busy) return;
    ARB.busy = true;
    const sb = arbSb(), uid = arbUserId();
    const carte = doc.getElementById('od-arb-carte');
    const anim = action === 'fusion' ? 'partir-fusion' : action === 'rejet' ? 'partir-rejet' : 'partir-report';

    try {
      let params;
      if (action === 'fusion') {
        // survivant = fiche qui garde l'identité (le nom) = 'a' par défaut (existante).
        // Champs peints : pour chaque conflit où l'arbitre a choisi la valeur de
        // l'absorbé, on la passe à client_merge via p_champs.
        const survCote = ARB.survivant;                 // 'a'
        const survivant = survCote === 'a' ? d.a.idvu : d.b.idvu;
        const absorbe   = survCote === 'a' ? d.b.idvu : d.a.idvu;
        const champs = {};
        (conflits || []).forEach(function (row) {
          const k = row[0]; const choisi = ARB.choix[k] || 'a';
          if (choisi !== survCote) {
            // la valeur retenue vient de l'absorbé -> on l'impose
            const f = choisi === 'a' ? d.a : d.b;
            champs[k] = f[k];
          }
        });
        params = { p_id_file: d.id_file, p_decision: 'fusionner', p_survivant: Number(survivant), p_absorbe: Number(absorbe), p_id_user: uid, p_champs: champs };
      } else if (action === 'rejet') {
        params = { p_id_file: d.id_file, p_decision: 'rejeter', p_id_user: uid };
      } else {
        params = { p_id_file: d.id_file, p_decision: 'reporter', p_id_user: uid };
      }
      const { error } = await sb.rpc('client_arbitrer', params);
      if (error) throw error;
    } catch (e) {
      ARB.busy = false;
      // afficher l'erreur sans perdre la carte
      const box = doc.getElementById('od-arb');
      if (box) { const w = doc.createElement('div'); w.className = 'od-arb-erru'; w.textContent = (e && e.message) || 'Action refusée.'; box.prepend(w); setTimeout(function(){ w.remove(); }, 4000); }
      return;
    }

    if (action === 'fusion') ARB.fus++; else if (action === 'rejet') ARB.rej++;
    if (carte) carte.classList.add(anim);
    setTimeout(function () {
      ARB.i++; ARB.detail = null; ARB.choix = {}; ARB.survivant = 'a'; ARB.busy = false;
      arbRender();
    }, action === 'fusion' ? 480 : 430);
  }

  const I_ARB = {
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 6M18.5 20a5.5 5.5 0 0 0-3-4.9"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  };


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
    // La nav s'est peut-être construite AVANT que oropraUser soit à jour (event
    // 'oropra-user-ready' émis par le socle avant le chargement CDN du module).
    // On re-déclenche l'event -> onUserReady() force un rebuild avec le user courant.
    try {
      const W = (window.wwLib && window.wwLib.getFrontWindow && window.wwLib.getFrontWindow()) || window;
      const fire = () => { try { W.dispatchEvent(new CustomEvent('oropra-user-ready')); } catch (e) {} };
      fire(); setTimeout(fire, 300); setTimeout(fire, 1000);
    } catch (e) {}

  }
});
