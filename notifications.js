// ============================================================================
//  NOTIFICATIONS — module One Data (OD.define)  v1 (checklist)
//  Paramètre __anchor ; D() -> __anchor.ownerDocument ; user via socle oropraUser.
//  L'observer interne (cycle realtime) est CONSERVÉ (exception légitime règle 3).
// ============================================================================
(function () {
  let __od_inited = false;
  OD.define('notifications', {
    mount(__anchor /*, ctx */) {
      __anchor.setAttribute('data-oropra-notifs', '');
      if (__od_inited) return;
      __od_inited = true;
/* =============================================================================
   OROPRA — Page Notifications (composant autonome)
   À coller dans le code de la page Notifications (ou un élément HTML).
   Monte dans l'élément portant l'attribut [data-oropra-notifs] s'il existe,
   sinon crée son propre root.

   Dépendances backend : RPC get_user_notifications(p_user_ids) + fonctions
   notif_ignorer_cycle / notif_ignorer_rpv / notif_ignorer_orphelin.
   Realtime à activer sur : sms_messages, wa_messages, voip_calls, emails,
   RDV_CLIENT, RAPPORT_VENDEUR.
   ============================================================================= */
(function () {
  const WW = window.wwLib;
  if (!WW) { return; }

  // Purge d'un éventuel timer laissé par une version antérieure du composant.
  try {
    const fw = WW.getFrontWindow ? WW.getFrontWindow() : window;
    if (fw && fw.__oNotifsSiteWatch) { clearInterval(fw.__oNotifsSiteWatch); fw.__oNotifsSiteWatch = null; }
  } catch (e) {}

  /* ---- Config (à ajuster si besoin) -------------------------------------- */
  const FICHE_CLIENT_WORKFLOW_ID = 'ec8bcc55-a733-4982-a946-13e10ba3b09b'; // workflow réutilisable "fiche client" : met TOUT à jour (charge SELECTED_CLIENT par IDVu)
  const USERCONNECTED_VAR_ID     = 'e6331054-02e1-4f9d-b737-753455040b93';
  const FICHE_PAGE_ID            = '259f1951-a2d4-4b90-ac83-0b3febe1d4ec'; // page Fiche Client
  const SELECTED_CLIENT_VAR_ID   = '55490583-c88b-4748-916e-4d203db07742'; // variable SELECTED_CLIENT (objet CLIENT)
  // Variable GLOBALE (Number) liée au champ "Active tab index" du composant Tabs.
  // (On ne peut pas piloter la variable interne currentTab du composant depuis ce code.)
  const FICHE_TAB_VAR_ID         = 'fb2cad2c-cd04-42e0-8909-e3c91c8dcfac'; // ficheActiveTab
  const TAB_CONTACTS = 2;   // onglet "contacts" (cycle) de la fiche
  const TAB_RDV      = 3;   // onglet "RDV" de la fiche
  const VENDEUR_ROLE = 4;                       // rôle vendeur = ne voit que lui-même ; tout autre rôle = équipe du site
  // Sélection site intégrée au bloc. On écrit le site choisi dans cette variable
  // pour rester cohérent avec le reste de l'app (SMS, fiche, etc.).
  // Utilisateur connecté : collection e6331054 -> .data -> { ID_User, ID_Role, nomComplet, ID_SITE }

  const MEDIA = {
    SMS:          { color: '#F5A623', label: 'SMS' },
    WHATSAPP:     { color: '#4CAF7D', label: 'WhatsApp' },
    EMAIL:        { color: '#9E9E9E', label: 'Email' },
    VOIP:         { color: '#60AEDF', label: 'Appel' },
    RPV:          { color: '#E05252', label: 'RPV' },
    LEAD_EXTERNE: { color: '#8e6fc6', label: 'Lead' }
  };
  const ICON = {
    SMS:      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z"/></svg>',
    WHATSAPP: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.5 9.5c0 3 2 5 5 5"/></svg>',
    EMAIL:    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    VOIP:     '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
    RPV:      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M17 9h4M19 7v4"/></svg>',
    LEAD_EXTERNE: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l19-8-8 19-2.5-8.5z"/></svg>'
  };
  const IC_X = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  const ROOT_ID = 'oropra-notifs';
  const STATE_KEY = '__OROPRA_NOTIFS__';
  const STATE_VERSION = 7;   // v7 = fetch de toute l'équipe + filtres (vendeur / VN-VO / média) côté client

  function W() { return WW.getFrontWindow(); }
  function D() { return __anchor.ownerDocument || (WW.getFrontDocument && WW.getFrontDocument()) || document; }
  function sb() { return WW.wwPlugins && WW.wwPlugins.supabase ? WW.wwPlugins.supabase.instance : null; }
  function readVar(id) { try { return WW.wwVariable.getValue(id); } catch (e) { return null; } }

  // Utilisateur connecté : c'est une COLLECTION (e6331054), la donnée est dans .data.
  function getConnectedUser() {
    try {
      const fw = (WW.getFrontWindow && WW.getFrontWindow()) || window;
      let u = fw.oropraUser;
      if (Array.isArray(u)) u = u[0];
      if (u && u.ID_User != null) return u;   // socle app oropraUser (source de vérité)
    } catch (e) {}
    const id = USERCONNECTED_VAR_ID;
    try {
      const col = WW.wwCollection && WW.wwCollection.getCollection ? WW.wwCollection.getCollection(id) : null;
      if (col && col.data != null) {
        let d = col.data;
        if (Array.isArray(d)) d = d[0] || {};
        return d || {};
      }
    } catch (e) {}
    try {
      let v = WW.wwVariable.getValue(id);
      if (v && v.data !== undefined) v = v.data;
      if (Array.isArray(v)) v = v[0];
      if (v) return v;
    } catch (e) {}
    return {};
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  function rel(iso) {
    if (!iso) return '';
    const d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
    if (s < 0) return dt(iso);
    if (s < 60) return "à l'instant";
    const m = Math.floor(s / 60); if (m < 60) return 'il y a ' + m + ' min';
    const h = Math.floor(m / 60); if (h < 24) return 'il y a ' + h + ' h';
    const j = Math.floor(h / 24); if (j < 7) return 'il y a ' + j + ' j';
    return d.toLocaleDateString('fr-FR');
  }
  function dt(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' ' +
           d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  /* ---- État --------------------------------------------------------------- */
  function st() {
    const w = W();
    if (!w[STATE_KEY] || w[STATE_KEY]._v !== STATE_VERSION) {
      // Coupe proprement le realtime d'un éventuel état précédent avant de le remplacer.
      try { const old = w[STATE_KEY]; if (old && old.channel && sb()) sb().removeChannel(old.channel); } catch (e) {}
      w[STATE_KEY] = {
        _v: STATE_VERSION,
        data: { a_traiter: [], rdv: [], a_identifier: [], counts: {} },
        section: 'a_traiter',
        media: 'ALL',
        me: null, isManager: false, team: [], userIds: [], vendor: 'ALL', vnvo: 'ALL',
        // sélection site intégrée
        siteId: null, busBound: false, busTries: 0,
        loading: true, error: null, channel: null, debounce: null, ready: false
      };
    }
    return w[STATE_KEY];
  }

  /* ---- Périmètre + sélection site (intégrée) ------------------------------ */
  function resolvePerimeter() {
    const s = st();
    const me = getConnectedUser() || {};
    s.me = me;
    const meId = me.ID_User != null ? Number(me.ID_User) : null;
    const role = me.ID_Role != null ? Number(me.ID_Role) : null;
    s.meId = meId;

    // Vendeur (rôle 4) ou identité inconnue -> lui-même seulement, pas de sélecteur.
    if (role === VENDEUR_ROLE || meId == null) {
      s.isManager = false;
      s.team = meId != null ? [{ ID_User: meId, nomComplet: me.nomComplet || 'Moi' }] : [];
      s.vendor = meId != null ? meId : 'ALL';
      applyVendor();
      return;
    }
    s.isManager = true;
    if (s.vendor == null) s.vendor = 'ALL';
  }

  // Équipe restreinte par le filtre VN/VO.
  function filteredTeam() {
    const s = st();
    if (!s.vnvo || s.vnvo === 'ALL') return s.team;
    return s.team.filter(u => u.vnvo === s.vnvo);
  }

  function applyVendor() {
    const s = st();
    if (!s.isManager) { s.userIds = s.meId != null ? [s.meId] : []; return; }
    // Le fetch couvre TOUJOURS toute l'équipe du site. Les filtres vendeur,
    // VN/VO et média sont appliqués côté client (voir currentList / sectionItems).
    // Ainsi le menu déroulant peut savoir quels vendeurs ont réellement des
    // notifications, et changer de vendeur ne déclenche plus de re-fetch.
    s.userIds = (s.team || []).map(u => Number(u.ID_User)).filter(x => !isNaN(x));
  }

  /* ---- Filtres côté client ------------------------------------------------ */
  // Ensemble des id_user de l'équipe restreinte par le filtre VN/VO.
  function teamIdSet() {
    return new Set(filteredTeam().map(u => Number(u.ID_User)));
  }
  function itemsOf(section) {
    const s = st();
    if (section === 'a_traiter') return s.data.a_traiter || [];
    if (section === 'rdv')       return s.data.rdv || [];
    return s.data.a_identifier || [];
  }
  function inTeam(x) { return teamIdSet().has(Number(x.id_user)); }         // filtre VN/VO
  function matchVendor(x) {                                                  // filtre vendeur sélectionné
    const s = st();
    return s.vendor === 'ALL' || s.vendor == null || Number(x.id_user) === Number(s.vendor);
  }
  function matchMedia(x) {                                                   // filtre chip média (a_traiter)
    const s = st();
    return s.media === 'ALL' || x.media === s.media;
  }
  // Compteur d'une section : respecte le vendeur + VN/VO, mais PAS le média
  // (le média est un sous-filtre de la liste "à traiter", pas du total de section).
  function sectionCount(section) {
    return itemsOf(section).filter(inTeam).filter(matchVendor).length;
  }
  // Vendeurs réellement présents dans la vue courante (section + média + VN/VO),
  // hors filtre vendeur -> sert à peupler le menu déroulant.
  function presentVendorIds() {
    const s = st();
    let arr = itemsOf(s.section).filter(inTeam);
    if (s.section === 'a_traiter') arr = arr.filter(matchMedia);
    return new Set(arr.map(x => Number(x.id_user)));
  }

  // Accès au bus de site (oropra-site-bus.js, chargé au niveau app).
  function siteBus() {
    try { const w = W(); if (w && w.oropraSite) return w.oropraSite; } catch (e) {}
    return window.oropraSite || null;
  }

  // v6 : la page n'a plus de cascade de site. Elle suit le bus : à l'abonnement puis à
  // chaque changement de site (sélecteur du header), le bus pousse {siteId, users}.
  async function loadSites() {
    const s = st();
    const bus = siteBus();
    if (!bus || !bus.getSites()) {        // bus pas encore prêt -> on réessaie
      if ((s.busTries = (s.busTries || 0) + 1) < 120) setTimeout(loadSites, 250);
      else { s.error = 'Bus de site indisponible'; render(); }
      return;
    }
    if (!s.busBound) {
      s.busBound = true;
      bus.onChange(({ siteId, users }) => {
        s.siteId = Number(siteId);
        s.team = (users || []);            // déjà au format {ID_User, nomComplet, nom, vnvo}, trié
        reconcileVendor();                 // garde le vendeur s'il existe encore, sinon "toute l'équipe"
        render();
        fetchData();
      });
      // onChange rappelle immédiatement avec l'état courant -> initialisation comprise
    } else {
      // retour sur la page : se recaler sur l'état courant du bus
      const cur = bus.getSiteId();
      if (cur != null) s.siteId = Number(cur);
      s.team = bus.getUsers();
      reconcileVendor();
      render();
      fetchData();
    }
  }

  // Le défaut est "toute l'équipe du site" ; on conserve un vendeur choisi
  // seulement s'il est encore présent dans l'équipe filtrée (site + VN/VO).
  function reconcileVendor() {
    const s = st();
    if (s.vendor == null) s.vendor = 'ALL';
    if (s.vendor !== 'ALL' && !filteredTeam().some(u => String(u.ID_User) === String(s.vendor))) s.vendor = 'ALL';
    applyVendor();
  }

  /* ---- Fetch -------------------------------------------------------------- */
  async function fetchData() {
    const s = st(); const c = sb();
    if (!c || !s.userIds.length) { s.data = { a_traiter: [], rdv: [], a_identifier: [], counts: {} }; s.loading = false; render(); return; }
    s.loading = true; render();
    try {
      const { data, error } = await c.rpc('get_user_notifications', { p_user_ids: s.userIds });
      if (error) throw error;
      s.data = data || { a_traiter: [], rdv: [], a_identifier: [], counts: {} };
      s.error = null;
    } catch (e) {
      s.error = (e && e.message) ? e.message : String(e);
    }
    s.loading = false; render();
  }

  function scheduleRefetch() {
    const s = st();
    if (s.debounce) clearTimeout(s.debounce);
    s.debounce = setTimeout(fetchData, 800);
  }

  /* ---- Realtime ----------------------------------------------------------- */
  function subscribe() {
    const s = st(); const c = sb(); if (!c || s.channel) return;
    try {
      const ch = c.channel('oropra-notifs');
      ['sms_messages', 'wa_messages', 'voip_calls', 'emails', 'RDV_CLIENT', 'RAPPORT_VENDEUR'].forEach(t => {
        ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, scheduleRefetch);
      });
      ch.subscribe();
      s.channel = ch;
    } catch (e) { /* realtime non critique */ }
  }

  /* ---- Actions ------------------------------------------------------------ */
  function setFicheTab(idx) {
    if (idx == null) return;
    try { WW.wwVariable.updateValue(FICHE_TAB_VAR_ID, idx); } catch (e) {}
  }

  // Écriture de variable avec repli sur le slot "-value" (comme le sélecteur d'historique).
  function writeVar(varId, value) {
    try { WW.wwVariable.updateValue(varId, value); return; }
    catch (e) {}
    try {
      const w = W();
      if (w.variables && Object.prototype.hasOwnProperty.call(w.variables, varId + '-value')) {
        w.variables[varId + '-value'] = value;
      }
    } catch (e) {}
  }

  // Navigation alignée sur le sélecteur d'historique.
  function navigateToFiche() {
    try { WW.goTo(FICHE_PAGE_ID); return; } catch (e) {}
    try { if (WW.wwLocation && WW.wwLocation.goTo) WW.wwLocation.goTo({ pageId: FICHE_PAGE_ID }); } catch (e) {}
  }

  async function openFiche(idvu, tab) {
    if (idvu == null || idvu === '') return;
    const id = Number(idvu);
    try {
      // Une notification ne porte que l'IDVu (l'historique a déjà l'objet CLIENT) :
      // on récupère la fiche pour écrire un objet complet dans SELECTED_CLIENT.
      let client = null;
      try {
        const c = sb();
        if (c) { const res = await c.from('CLIENT').select('*').eq('IDVu', id).single(); client = res && res.data ? res.data : null; }
      } catch (e) {}

      // --- exactement comme selectHistoryEntry() du sélecteur d'historique ---
      writeVar(SELECTED_CLIENT_VAR_ID, client ? Object.assign({}, client) : { IDVu: id });
      try { WW.wwWorkflow.executeGlobal(FICHE_CLIENT_WORKFLOW_ID, { IDVu: id }); } catch (e) {}
      try { W().dispatchEvent(new CustomEvent('oropra-client-selected', { detail: client || { IDVu: id } })); } catch (e) {}
      if (tab != null) setFicheTab(tab);
      navigateToFiche();
      // Filet : repositionner l'onglet après montage / après l'éventuel workflow on-load.
      if (tab != null) [150, 400, 800, 1500].forEach(ms => setTimeout(() => setFicheTab(tab), ms));
    } catch (e) {
      console.error('[notifs] openFiche', e);
    }
  }

  async function ignore(item) {
    const c = sb(); const s = st(); if (!c) return;
    const meId = s.me && s.me.ID_User != null ? s.me.ID_User : null;
    try {
      if (item._kind === 'rpv' && item.id_rapport != null) {
        await c.rpc('notif_ignorer_rpv', { p_id_rapport: item.id_rapport, p_through: item.last_at, p_id_user: meId });
      } else if (item._kind === 'orphan') {
        await c.rpc('notif_ignorer_orphelin', { p_interlocuteur: item.interlocuteur, p_canal_ref: item.canal_ref || null, p_through: item.last_at, p_id_user: meId });
      } else {
        await c.rpc('notif_ignorer_cycle', { p_id_cycle_com: item.id_cycle_com, p_through: item.last_at, p_id_user: meId });
      }
    } catch (e) {}
    fetchData();
    // prévenir le badge d'en-tête qu'une notification vient d'être traitée
    try {
      const fw = W() || window;
      if (fw && typeof fw.oropraNotifBadgeRefresh === 'function') fw.oropraNotifBadgeRefresh();
      else if (typeof window.oropraNotifBadgeRefresh === 'function') window.oropraNotifBadgeRefresh();
      try { D().dispatchEvent(new CustomEvent('oropra-notif-refresh')); } catch (e2) {}
    } catch (e) {}
  }

  /* ---- Rendu -------------------------------------------------------------- */
  function getHost() { try { return D().querySelector('[data-oropra-notifs]'); } catch (e) { return null; } }
  function ensureRoot() {
    const host = getHost();
    if (!host) return null;                 // pas d'hôte = pas la page Notifications -> ne rien afficher
    let root = host.querySelector('#' + ROOT_ID);
    if (!root) { root = D().createElement('div'); root.id = ROOT_ID; host.appendChild(root); }
    return root;
  }

  const STYLE = `
#${ROOT_ID}{font-family:'Nunito Sans',sans-serif;color:#1c2b45;max-width:880px;margin:0 auto;padding:8px 0 40px}
#${ROOT_ID} *{box-sizing:border-box}
#${ROOT_ID} .nh{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
#${ROOT_ID} .nh h2{margin:0;font-size:20px;font-weight:700;display:flex;align-items:center;gap:8px}
#${ROOT_ID} .nsel{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
#${ROOT_ID} .ncard{border-radius:12px;padding:12px 14px;cursor:pointer;background:#f4f6fa;border:1px solid transparent;transition:.15s}
#${ROOT_ID} .ncard.on{background:#fff;border-color:#2a5ea9}
#${ROOT_ID} .ncard .nl{font-size:13px;color:#5a6b8c}
#${ROOT_ID} .ncard .nv{font-size:24px;font-weight:700;margin-top:4px}
#${ROOT_ID} .nbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}
#${ROOT_ID} .chip{font-size:13px;padding:5px 12px;border-radius:8px;border:1px solid #e3e8f0;background:#fff;color:#5a6b8c;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
#${ROOT_ID} .chip.on{background:#eef3fb;color:#2a5ea9;border-color:#acc5e4}
#${ROOT_ID} .chip .dot{width:8px;height:8px;border-radius:50%}
#${ROOT_ID} select.vsel{margin-left:8px;font-size:13px;font-weight:500;padding:6px 10px;border-radius:8px;border:1px solid #2a5ea9;background:#fff;color:#2a5ea9}
#${ROOT_ID} select.vsel option{color:#2a5ea9}
#${ROOT_ID} .vnvo-wrap{display:inline-flex;align-items:center;gap:4px;margin-left:8px}
#${ROOT_ID} .vnchip{font-size:12px;padding:5px 11px;border-radius:14px;border:1px solid #d9e3f2;color:#2a5ea9;background:#fff;cursor:pointer;user-select:none;font-weight:500}
#${ROOT_ID} .vnchip:hover{background:#eef4fc}
#${ROOT_ID} .vnchip.on{background:#2a5ea9;color:#fff;border-color:#2a5ea9}
#${ROOT_ID} .row{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #eef1f6;border-radius:12px;padding:11px 13px;margin-bottom:9px}
#${ROOT_ID} .row.clk{cursor:pointer}
#${ROOT_ID} .row.clk:hover{border-color:#acc5e4}
#${ROOT_ID} .ic{flex-shrink:0;width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:#fff}
#${ROOT_ID} .mid{min-width:0;flex:1}
#${ROOT_ID} .nm{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#${ROOT_ID} .nm b{font-size:15px;font-weight:700}
#${ROOT_ID} .tag{font-size:11px;color:#5a6b8c;background:#f1f4f9;padding:2px 7px;border-radius:6px}
#${ROOT_ID} .tag.late{color:#9a2f2f;background:#fbe9e9}
#${ROOT_ID} .snip{font-size:13px;color:#6b7894;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
#${ROOT_ID} .rt{flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
#${ROOT_ID} .tm{font-size:12px;color:#9aa6bd;white-space:nowrap}
#${ROOT_ID} .ig{border:none;background:#f1f4f9;color:#8893a8;width:26px;height:26px;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center}
#${ROOT_ID} .ig:hover{background:#fbe9e9;color:#9a2f2f}
#${ROOT_ID} .empty{text-align:center;color:#9aa6bd;font-size:14px;padding:40px 0}
#${ROOT_ID} .err{color:#9a2f2f;font-size:13px;background:#fbe9e9;padding:10px 12px;border-radius:8px;margin-bottom:12px}
`;

  function mediaChip(m) {
    const meta = MEDIA[m] || { color: '#9E9E9E', label: m };
    return `<div class="ic" style="background:${meta.color}">${ICON[m] || ''}</div>`;
  }

  function rowATraiter(it) {
    const meta = MEDIA[it.media] || { label: it.media };
    const flag = it.en_retard ? '<span class="tag late">en retard</span>'
               : (it.is_missed ? '<span class="tag">manqué</span>' : '');
    const vendeur = st().isManager && it.vendeur_nom ? `<span class="tag">${esc(it.vendeur_nom)}</span>` : '';
    return `<div class="row clk" data-act="open" data-idvu="${esc(it.idvu)}" data-tab="${TAB_CONTACTS}">
      ${mediaChip(it.media)}
      <div class="mid">
        <div class="nm"><b>${esc(it.client_nom || ('Client ' + (it.idvu ?? '')))}</b>${vendeur}${flag}</div>
        <div class="snip">${esc(it.preview || meta.label)}</div>
      </div>
      <div class="rt">
        <span class="tm">${esc(rel(it.last_at))}</span>
        <button class="ig" data-act="ignore" title="Ignorer">${IC_X}</button>
      </div>
    </div>`;
  }

  function rowRdv(it) {
    return `<div class="row clk" data-act="open" data-idvu="${esc(it.idvu)}" data-tab="${TAB_RDV}">
      <div class="ic" style="background:#2a5ea9"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg></div>
      <div class="mid">
        <div class="nm"><b>${esc(it.client_nom || ('Client ' + (it.idvu ?? '')))}</b>${it.vin ? `<span class="tag">${esc(it.vin)}</span>` : ''}</div>
        <div class="snip">${esc(it.commentaire || 'Rendez-vous')}</div>
      </div>
      <div class="rt"><span class="tm">${esc(dt(it.start_at))}</span></div>
    </div>`;
  }

  function rowIdent(it) {
    const meta = MEDIA[it.media] || { label: it.media };
    return `<div class="row">
      ${mediaChip(it.media)}
      <div class="mid">
        <div class="nm"><b>${esc(it.interlocuteur || 'Inconnu')}</b><span class="tag">Non identifié</span></div>
        <div class="snip">${esc(it.preview || meta.label)}</div>
      </div>
      <div class="rt">
        <span class="tm">${esc((it.nb_messages > 1 ? it.nb_messages + ' msg · ' : '') + rel(it.last_at))}</span>
        <button class="ig" data-act="ignore" title="Ignorer">${IC_X}</button>
      </div>
    </div>`;
  }

  function render() {
    const s = st();
    const root = ensureRoot();
    if (!root) return;                       // pas sur la page Notifications

    // Si le vendeur sélectionné n'a plus aucune notif dans la vue courante,
    // on repasse sur "toute l'équipe" (cohérent avec un menu qui ne liste que
    // les vendeurs présents).
    if (s.isManager && s.vendor !== 'ALL' && s.vendor != null && !presentVendorIds().has(Number(s.vendor))) {
      s.vendor = 'ALL';
    }

    const list = currentList();
    const cnt = { a_traiter: sectionCount('a_traiter'), rdv: sectionCount('rdv'), a_identifier: sectionCount('a_identifier') };

    const controls = s.isManager ? (vnvoFilter() + vendorSelect()) : '';

    let bar = '';
    if (s.section === 'a_traiter') {
      const chip = (k, label, dotColor) => `<span class="chip ${s.media === k ? 'on' : ''}" data-act="media" data-media="${k}">${dotColor ? `<span class="dot" style="background:${dotColor}"></span>` : ''}${label}</span>`;
      bar = `<div class="nbar">
        ${chip('ALL', 'Tous', '')}
        ${chip('SMS', 'SMS', MEDIA.SMS.color)}
        ${chip('WHATSAPP', 'WhatsApp', MEDIA.WHATSAPP.color)}
        ${chip('EMAIL', 'Email', MEDIA.EMAIL.color)}
        ${chip('VOIP', 'Appels', MEDIA.VOIP.color)}
        ${chip('RPV', 'RPV', MEDIA.RPV.color)}
        ${chip('LEAD_EXTERNE', 'Leads', MEDIA.LEAD_EXTERNE.color)}
        ${controls}
      </div>`;
    } else if (controls) {
      bar = `<div class="nbar">${controls}</div>`;
    }

    let body;
    if (s.loading) body = `<div class="empty">Chargement…</div>`;
    else if (!list.length) body = `<div class="empty">Rien à afficher ici.</div>`;
    else if (s.section === 'a_traiter') body = list.map((it, i) => { it._kind = it.media === 'RPV' ? 'rpv' : 'cycle'; it._i = i; return rowATraiter(it); }).join('');
    else if (s.section === 'rdv') body = list.map(rowRdv).join('');
    else body = list.map((it, i) => { it._kind = 'orphan'; it._i = i; return rowIdent(it); }).join('');

    root.innerHTML = `<style>${STYLE}</style>
      <div class="nh"><h2><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#5a6b8c" stroke-width="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg> Notifications</h2></div>
      <div class="nsel">
        <div class="ncard ${s.section === 'a_traiter' ? 'on' : ''}" data-act="sec" data-sec="a_traiter"><div class="nl">À traiter</div><div class="nv">${cnt.a_traiter}</div></div>
        <div class="ncard ${s.section === 'rdv' ? 'on' : ''}" data-act="sec" data-sec="rdv"><div class="nl">RDV à venir</div><div class="nv">${cnt.rdv}</div></div>
        <div class="ncard ${s.section === 'a_identifier' ? 'on' : ''}" data-act="sec" data-sec="a_identifier"><div class="nl">À identifier</div><div class="nv">${cnt.a_identifier}</div></div>
      </div>
      ${s.error ? `<div class="err">Erreur : ${esc(s.error)}</div>` : ''}
      ${bar}
      <div class="nlist">${body}</div>`;

    bind(root);
  }

  function vendorSelect() {
    const s = st();
    if (!s.isManager) return '';
    // On ne propose que les vendeurs ayant réellement des notifs dans la vue
    // courante (section + média + VN/VO).
    const present = presentVendorIds();
    const team = filteredTeam().filter(u => present.has(Number(u.ID_User)));
    if (!team.length) return `<select class="vsel" data-act="vendor"><option value="ALL">Toute l'équipe du site</option></select>`;

    // Tri alphabétique sur USER.nom (repli sur nomComplet), insensible casse/accents.
    const byNom = (a, b) => String(a.nom || a.nomComplet || '')
      .localeCompare(String(b.nom || b.nomComplet || ''), 'fr', { sensitivity: 'base' });

    const opt = (u) => `<option value="${esc(u.ID_User)}" ${String(s.vendor) === String(u.ID_User) ? 'selected' : ''}>${esc(u.nomComplet || ('User ' + u.ID_User))}</option>`;

    // Regroupement VN / VO / VN+VO (+ Autres pour un vnvo non renseigné).
    const groups = [
      { key: 'VN',   label: 'VN' },
      { key: 'VO',   label: 'VO' },
      { key: 'VNVO', label: 'VN + VO' },
    ];

    let inner = `<option value="ALL">Toute l'équipe du site</option>`;
    const used = new Set();
    for (const g of groups) {
      const list = team.filter(u => String(u.vnvo || '').toUpperCase() === g.key).sort(byNom);
      list.forEach(u => used.add(String(u.ID_User)));
      if (list.length) inner += `<optgroup label="${g.label}">${list.map(opt).join('')}</optgroup>`;
    }
    const autres = team.filter(u => !used.has(String(u.ID_User))).sort(byNom);
    if (autres.length) inner += `<optgroup label="Autres">${autres.map(opt).join('')}</optgroup>`;

    return `<select class="vsel" data-act="vendor">${inner}</select>`;
  }

  // Filtre VN / VO / VN+VO basé sur USER.VN_VO.
  function vnvoFilter() {
    const s = st();
    if (!s.isManager || !s.team.length) return '';
    const chip = (k, label) => `<span class="vnchip ${s.vnvo === k ? 'on' : ''}" data-act="vnvo" data-vnvo="${k}">${label}</span>`;
    return `<span class="vnvo-wrap">${chip('ALL', 'Tous')}${chip('VN', 'VN')}${chip('VO', 'VO')}${chip('VNVO', 'VN+VO')}</span>`;
  }

  function currentList() {
    const s = st();
    let arr = itemsOf(s.section).filter(inTeam).filter(matchVendor);
    if (s.section === 'a_traiter') arr = arr.filter(matchMedia);
    return arr;
  }

  function bind(root) {
    const s = st();
    root.querySelectorAll('[data-act="sec"]').forEach(el => el.addEventListener('click', () => { s.section = el.getAttribute('data-sec'); render(); }));
    root.querySelectorAll('[data-act="media"]').forEach(el => el.addEventListener('click', () => { s.media = el.getAttribute('data-media'); render(); }));
    root.querySelectorAll('[data-act="vnvo"]').forEach(el => el.addEventListener('click', () => {
      s.vnvo = el.getAttribute('data-vnvo');
      // si le vendeur sélectionné sort de l'équipe filtrée, on revient à "toute l'équipe"
      if (s.vendor !== 'ALL' && !filteredTeam().some(u => String(u.ID_User) === String(s.vendor))) s.vendor = 'ALL';
      render();   // filtre client, pas de re-fetch (l'équipe entière est déjà chargée)
    }));
    const vs = root.querySelector('[data-act="vendor"]');
    if (vs) vs.addEventListener('change', () => { s.vendor = vs.value; render(); });


    root.querySelectorAll('.row[data-act="open"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-act="ignore"]')) return;
        openFiche(el.getAttribute('data-idvu'), Number(el.getAttribute('data-tab')));
      });
    });
    const list = currentList();
    root.querySelectorAll('[data-act="ignore"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = el.closest('.row');
        const rows = [...root.querySelectorAll('.nlist .row')];
        const idx = rows.indexOf(row);
        if (idx >= 0 && list[idx]) ignore(list[idx]);
      });
    });
  }


  /* ---- Init --------------------------------------------------------------- */
  async function start() {
    const s = st();
    if (s.ready) { render(); return; }
    s.ready = true;
    resolvePerimeter();
    render();
    if (s.isManager) {
      await loadSites();        // abonnement au bus -> team + fetchData via onChange
    } else {
      await fetchData();        // vendeur : ses propres notifications
    }
    subscribe();
  }

  function ensureRendered(tries) {
    tries = tries || 0;
    try {
      const me = getConnectedUser();
      if (getHost() && WW.getFrontDocument && sb() && me && me.ID_User != null) { start(); return; }
    } catch (e) {}
    if (tries < 60) setTimeout(() => ensureRendered(tries + 1), 250);
  }
  ensureRendered();

  // Monte UNIQUEMENT sur la page Notifications (présence de [data-oropra-notifs]).
  // Quand on quitte la page, on coupe le realtime et on réarme pour le prochain passage.
  try {
    const obs = new MutationObserver(() => {
      const s = st();
      const host = getHost();
      if (host && !s.ready) {
        ensureRendered();
      } else if (!host && s.ready) {
        s.ready = false;
        try { if (s.channel && sb()) sb().removeChannel(s.channel); } catch (e) {}
        s.channel = null;
      }
    });
    obs.observe(D().body, { childList: true, subtree: true });
  } catch (e) {}
})();
    }
  });
})();
