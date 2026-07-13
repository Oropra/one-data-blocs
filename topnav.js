// ============================================================================
//  TOP NAV — module One Data (OD.define)  v1 (étape B)
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
});
