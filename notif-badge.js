// ============================================================================
//  NOTIF BADGE — module One Data (OD.define)  v1
//  Ex-bloc on-app-load n°5. Module app-level : ancre masquée dans le header,
//  PERSISTANT. Calcule nb_notifs (rôle-aware) et le publie pour la top nav.
// ============================================================================
OD.define('notif-badge', {
  async mount(__anchor, ctx) {
  const wwLib = window.wwLib;

  /* ---- Config ------------------------------------------------------------- */
  const VAR_NB_NOTIFS = '9fc0eca4-2325-4774-8e27-4c66515a9166';   // sortie : nb_notifs (Number)
  const VENDEUR_ROLE  = 4;
  const PERIOD_MS     = 10 * 60 * 1000;                            // rafraîchissement périodique
  const LOG = (...a) => console.log('%c[notif-badge]', 'color:#2a5ea9;font-weight:bold', ...a);

  function sb()  { return ctx.supabase; }   // client du tenant (fourni par le socle)
  function fwin(){ try { return (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window; } catch (e) { return window; } }
  function bus() { try { const w = fwin(); return (w && w.oropraSite) || window.oropraSite || null; } catch (e) { return window.oropraSite || null; } }

  function getConnectedUser() {
    try { return fwin().oropraUser || {}; } catch (e) {}
    return {};
  }

  function pushVar(n) {
    const v = Number(n) || 0;
    try { wwLib.wwVariable.updateValue(VAR_NB_NOTIFS, v); } catch (e) { console.error('[notif-badge] updateValue', e); }
    try { const w = fwin(); if (w.variables) w.variables[VAR_NB_NOTIFS + '-value'] = v; } catch (e) {}
  }

  /* ---- État --------------------------------------------------------------- */
  const STATE_VERSION = 10;  // v10 : le rôle prime sur le bus (un vendeur ne compte que ses notifs)
  function st() {
    const cur = window.__OROPRA_NOTIF_BADGE__;
    if (!cur || cur._v !== STATE_VERSION) {
      try { if (cur && cur.poll) clearInterval(cur.poll); } catch (e) {}
      try { if (cur && cur.tick) clearInterval(cur.tick); } catch (e) {}
      window.__OROPRA_NOTIF_BADGE__ = { _v: STATE_VERSION, count: 0, debounce: null, tick: null, ready: false, busBound: false, bound: false };
    }
    return window.__OROPRA_NOTIF_BADGE__;
  }

  /* ---- Périmètre : LE RÔLE PRIME -------------------------------------------
     Un vendeur (rôle 4) ne compte JAMAIS que ses propres notifications, même
     si le bus de site (qui porte toute l'équipe pour les managers) est prêt.
     On consulte le bus uniquement pour les managers.
  --------------------------------------------------------------------------- */
  async function resolveUserIds() {
    const me   = getConnectedUser();
    const meId = me.ID_User != null ? Number(me.ID_User) : null;
    const role = me.ID_Role != null ? Number(me.ID_Role) : null;

    // Vendeur : lui seul, on ignore totalement le bus.
    if (role === VENDEUR_ROLE) return meId != null ? [meId] : [];

    // Managers : périmètre du bus (équipe du site sélectionné).
    const b = bus();
    if (b) {
      const users = b.getUsers();
      if (users && users.length) return users.map(u => Number(u.ID_User)).filter(x => !isNaN(x));
    }

    // Repli manager (bus pas prêt) : site par défaut de l'utilisateur.
    if (meId == null) return [];
    const c = sb(); if (!c) return [meId];
    try {
      let siteIds = me.ID_SITE != null ? [Number(me.ID_SITE)] : [];
      if (!siteIds.length) {
        const { data: perim } = await c.from('v_user_perimeter').select('id_site').eq('viewer_id_user', meId);
        siteIds = Array.from(new Set((perim || []).map(r => Number(r.id_site)).filter(x => !isNaN(x))));
      }
      if (!siteIds.length) return [meId];
      const { data: us } = await c.from('USER_SITE').select('ID_User').in('ID_SITE', siteIds);
      const ids = Array.from(new Set((us || []).map(r => Number(r.ID_User)).filter(x => !isNaN(x))));
      return ids.length ? ids : [meId];
    } catch (e) { return [meId]; }
  }

  async function fetchCount() {
    const s = st(); const c = sb(); if (!c) return;
    const ids = await resolveUserIds();
    if (!ids.length) { s.count = 0; pushVar(0); return; }
    try {
      const { data, error } = await c.rpc('get_user_notifications', { p_user_ids: ids });
      if (error) throw error;
      const counts = (data && data.counts) || {};
      s.count = Number(counts.a_traiter || 0) || 0;    // uniquement "à traiter"
    } catch (e) { console.error('[notif-badge] rpc', e); }
    pushVar(s.count);
    LOG('nb_notifs =', s.count, '(' + ids.length + ' users)');
  }

  function scheduleRefetch(delay) {
    const s = st();
    if (s.debounce) clearTimeout(s.debounce);
    s.debounce = setTimeout(() => fetchCount(), delay || 800);
  }

  /* ---- Déclencheurs --------------------------------------------------------
     1) changement de site -> abonnement au bus (managers ; un vendeur recalcule
        le même [meId], sans effet de bord)
     2) périodique 10 min
     3) à la demande : oropraNotifBadgeRefresh() / événement 'oropra-notif-refresh'
        (appelés au traitement d'une notification)
  ----------------------------------------------------------------------------- */
  function bindBus(tries) {
    tries = tries || 0;
    const s = st();
    const b = bus();
    if (!b) { if (tries < 240) setTimeout(() => bindBus(tries + 1), 250); return; }
    if (s.busBound) return;
    s.busBound = true;
    b.onChange(() => scheduleRefetch(100));   // rappel immédiat à l'abonnement = 1er calcul
  }

  function periodic() {
    const s = st();
    if (s.tick) return;
    s.tick = setInterval(() => fetchCount(), PERIOD_MS);
  }

  function bindRefresh() {
    const s = st();
    if (s.bound) return;
    s.bound = true;
    const handler = () => scheduleRefetch(0);
    try { fwin().oropraNotifBadgeRefresh = handler; } catch (e) {}
    try { window.oropraNotifBadgeRefresh = handler; } catch (e) {}
    try { wwLib.getFrontDocument().addEventListener('oropra-notif-refresh', handler); } catch (e) {}
  }

  /* ---- Démarrage ------------------------------------------------------------ */
  function start(tries) {
    tries = tries || 0;
    if (!sb() || getConnectedUser().ID_User == null) {
      if (tries < 120) return void setTimeout(() => start(tries + 1), 250);
      console.error('[notif-badge] Supabase ou utilisateur connecté jamais prêt');
      return;
    }
    const s = st();
    if (s.ready) { pushVar(s.count); return; }
    s.ready = true;
    LOG('démarrage');
    pushVar(0);

    const me   = getConnectedUser();
    const role = me.ID_Role != null ? Number(me.ID_Role) : null;

    if (role === VENDEUR_ROLE) {
      // Vendeur : pas besoin du bus, on calcule directement son compteur.
      fetchCount();
    } else {
      bindBus();    // manager : le 1er calcul part du rappel immédiat du bus
      // filet : si le bus n'apparaît pas vite, premier calcul en repli
      setTimeout(() => { const x = st(); if (!x.busBound) fetchCount(); }, 3000);
    }

    periodic();
    bindRefresh();
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
