// ============================================================================
//  SITE BUS — module One Data (OD.define)  v1
//  Ex-bloc on-app-load n°2. Devenu un module app-level : ancre masquée dans le
//  header partagé, monté par le loader et PERSISTANT (jamais re-monté).
//  L'utilisateur est garanti par le socle AVANT le montage -> les attentes
//  internes ne servent plus que de filet.
// ============================================================================
OD.define('site-bus', {
  async mount(__anchor, ctx) {
  const wwLib = window.wwLib;

  /* ---- Config ------------------------------------------------------------- */
  const VAR_SITE_SELECTED = '39fecccf-9296-43b7-b5b6-eadaa928290d';   // selected_site_id (source de vérité)
  const EVENT_NAME = 'oropra-site-changed';
  const LOG = (...a) => console.log('%c[site-bus]', 'color:#53bda7;font-weight:bold', ...a);

  function sb() { return ctx.supabase; }   // client du tenant (fourni par le socle)
  function fdoc() { return __anchor.ownerDocument || document; }
  function fwin() { try { return (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window; } catch (e) { return window; } }
  function getVar(id) { try { return wwLib.wwVariable.getValue(id); } catch (e) { return null; } }
  function setVar(id, v) {
    try { wwLib.wwVariable.updateValue(id, v); } catch (e) {}
    try { const w = fwin(); if (w.variables) w.variables[id + '-value'] = v; } catch (e) {}
  }

  function getConnectedUser() {
    // MIGRÉ : lit le socle window.oropraUser (front window) au lieu de la collection.
    try { return fwin().oropraUser || {}; } catch (e) {}
    return {};
  }

  /* ---- État (singleton sur window) ----------------------------------------- */
  const STATE_VERSION = 1;
  function st() {
    const w = window;
    const cur = w.__OROPRA_SITE_BUS__;
    if (!cur || cur._v !== STATE_VERSION) {
      try { if (cur && cur.poll) clearInterval(cur.poll); } catch (e) {}
      w.__OROPRA_SITE_BUS__ = {
        _v: STATE_VERSION,
        ready: false,            // bus démarré
        booted: false,           // présélection initiale faite (une seule fois par session)
        sites: null,             // périmètre [{id_site, site, affaire, id_affaire, reseau}]
        usersBySite: {},         // cache { siteId: [{ID_User, nomComplet, nom, vnvo}] }
        siteId: null,            // site courant connu du bus
        users: [],               // users du site courant
        loadingUsersFor: null,
        listeners: [],
        poll: null
      };
    }
    return w.__OROPRA_SITE_BUS__;
  }

  /* ---- Données ------------------------------------------------------------- */
  async function loadPerimeter(meId) {
    const s = st(); const c = sb();
    if (s.sites !== null) return s.sites;
    const { data: perim, error: e1 } = await c.from('v_user_perimeter').select('id_site').eq('viewer_id_user', Number(meId));
    if (e1) throw e1;
    const siteIds = Array.from(new Set((perim || []).map(r => Number(r.id_site)).filter(x => !isNaN(x))));
    if (!siteIds.length) { s.sites = []; return s.sites; }
    const { data: sites, error: e2 } = await c.from('SITE').select('ID_SITE,SITE,AFFAIRE,ID_AFFAIRE,RESEAU').in('ID_SITE', siteIds);
    if (e2) throw e2;
    s.sites = (sites || []).map(x => ({
      id_site: Number(x.ID_SITE), site: x.SITE, affaire: x.AFFAIRE,
      id_affaire: x.ID_AFFAIRE != null ? Number(x.ID_AFFAIRE) : null, reseau: x.RESEAU
    }));
    return s.sites;
  }

  async function loadUsers(siteId) {
    const s = st(); const c = sb();
    const key = String(siteId);
    if (s.usersBySite[key]) return s.usersBySite[key];
    s.loadingUsersFor = key;
    const { data: us, error: e1 } = await c.from('USER_SITE').select('ID_User').eq('ID_SITE', Number(siteId));
    if (e1) throw e1;
    const ids = Array.from(new Set((us || []).map(r => Number(r.ID_User)).filter(x => !isNaN(x))));
    let list = [];
    if (ids.length) {
      const { data: users, error: e2 } = await c.from('USER').select('ID_User, nomComplet, nom, VN_VO').in('ID_User', ids);
      if (e2) throw e2;
      list = (users || []).map(u => ({
        ID_User: Number(u.ID_User),
        nomComplet: u.nomComplet || ('User ' + u.ID_User),
        nom: u.nom || u.nomComplet || '',
        vnvo: String(u.VN_VO || '').toUpperCase().replace(/[^A-Z]/g, '')
      })).sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr'));
    }
    s.usersBySite[key] = list;
    return list;
  }

  /* ---- Cœur : adoption d'un site + notification ----------------------------- */
  async function adoptSite(siteId, origin) {
    const s = st();
    const id = siteId != null ? Number(siteId) : null;
    if (id == null || isNaN(id)) return;
    if (s.sites !== null && s.sites.length && !s.sites.some(x => Number(x.id_site) === id)) {
      const fb = Number(s.sites[0].id_site);
      if (String(getVar(VAR_SITE_SELECTED)) !== String(fb)) setVar(VAR_SITE_SELECTED, fb);
      if (origin !== 'boot') { console.warn('[site-bus] site ' + id + ' hors perimetre -> ignore (repli ' + fb + ')'); return; }
    }
    if (s.siteId === id && s.users.length) return;   // rien de neuf
    s.siteId = id;
    if (String(getVar(VAR_SITE_SELECTED)) !== String(id)) setVar(VAR_SITE_SELECTED, id);
    let users = [];
    try { users = await loadUsers(id); } catch (e) { console.error('[site-bus] loadUsers', e); }
    if (s.siteId !== id) return;                      // un autre site choisi entre-temps
    s.users = users;
    LOG('site =', id, '(' + users.length + ' users)', origin ? '[' + origin + ']' : '');
    const detail = { siteId: id, users: users.slice() };
    // listeners API
    s.listeners.slice().forEach(cb => { try { cb(detail); } catch (e) {} });
    // événement DOM
    try { fdoc().dispatchEvent(new CustomEvent(EVENT_NAME, { detail })); } catch (e) {}
  }

  /* ---- Présélection initiale (UNE seule fois par session) ------------------- */
  // Règle : on repart TOUJOURS du ID_SITE du user connecté à chaque connexion
  // (s'il est dans le périmètre), sinon le 1er site du périmètre.
  async function bootPreselection() {
    const s = st();
    if (s.booted) return;
    s.booted = true;
    const me = getConnectedUser();
    let target = null;
    try {
      const sites = await loadPerimeter(Number(me.ID_User));
      if (sites.length) {
        if (me.ID_SITE != null && sites.some(x => String(x.id_site) === String(me.ID_SITE))) target = Number(me.ID_SITE);
        else target = sites[0].id_site;
      }
    } catch (e) { console.error('[site-bus] perimeter', e); }
    if (target == null && me.ID_SITE != null) target = Number(me.ID_SITE);
    if (target != null) await adoptSite(target, 'boot');
  }

  /* ---- Watcher central : suit selected_site_id ------------------------------ */
  // Compatibilité : tout composant existant qui écrit selected_site_id
  // (sélecteur accueil, cascade page notifs…) est automatiquement pris en compte.
  function watch() {
    const s = st();
    if (s.poll) return;
    s.poll = setInterval(() => {
      const v = getVar(VAR_SITE_SELECTED);
      const id = (v == null || v === '') ? null : Number(v);
      if (id != null && !isNaN(id) && id !== s.siteId) adoptSite(id, 'var');
    }, 400);
  }

  /* ---- API publique ---------------------------------------------------------
     window.oropraSite.getSiteId()        -> Number|null  site courant
     window.oropraSite.getUsers()         -> Array        users du site courant
     window.oropraSite.getSites()         -> Array|null   périmètre complet
     window.oropraSite.setSiteId(id)      -> Promise      change de site (les sélecteurs UI appellent ça)
     window.oropraSite.onChange(cb)       -> Function     s'abonne ({siteId, users}) ; retourne un unsubscribe
     (+ événement DOM 'oropra-site-changed' sur le front document, detail {siteId, users})
  ----------------------------------------------------------------------------- */
  function exposeApi() {
    const api = {
      getSiteId: () => st().siteId,
      getUsers:  () => st().users.slice(),
      getSites:  () => (st().sites ? st().sites.slice() : null),
      setSiteId: (id) => adoptSite(id, 'api'),
      onChange:  (cb) => {
        const s = st();
        if (typeof cb !== 'function') return () => {};
        s.listeners.push(cb);
        if (s.siteId != null) { try { cb({ siteId: s.siteId, users: s.users.slice() }); } catch (e) {} }
        return () => { const i = s.listeners.indexOf(cb); if (i >= 0) s.listeners.splice(i, 1); };
      }
    };
    try { fwin().oropraSite = api; } catch (e) {}
    try { window.oropraSite = api; } catch (e) {}
  }

  /* ---- Démarrage ------------------------------------------------------------ */
  function start(tries) {
    tries = tries || 0;
    if (!sb() || getConnectedUser().ID_User == null) {
      if (tries < 120) return void setTimeout(() => start(tries + 1), 250);
      console.error('[site-bus] Supabase ou utilisateur connecté jamais prêt');
      return;
    }
    const s = st();
    if (s.ready) return;
    s.ready = true;
    exposeApi();
    LOG('démarrage');
    bootPreselection();   // présélection unique : ID_SITE du user (jamais re-déclenchée ensuite)
    watch();              // suit selected_site_id écrit par n'importe quel composant
  }
  start();

  // Robustesse : si l'utilisateur applicatif arrive tardivement (session restaurée
  // après coup, changement de compte), démarrer sur l'événement du socle au lieu
  // d'abandonner après la boucle d'attente. start() est idempotent (garde s.ready).
  try {
    const _w = fwin();
    const _kick = () => { try { start(0); } catch (e) {} };
    _w.addEventListener('oropra-user-ready', _kick);
    if (_w !== window) window.addEventListener('oropra-user-ready', _kick);
  } catch (e) {}
}
});
