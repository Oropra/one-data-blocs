// ============================================================================
//  AGENDA (FullCalendar) — module One Data (OD.define)  v1 (checklist)
//  Rendu dans __anchor ; client via __OD_SB__ ; frontDoc/Win -> ancre ;
//  self-boot retiré ; re-render (ex-bloc « Re-render agenda ») intégré.
//  Lit window.__dash.rawData (dashboard). User via socle oropraUser.
// ============================================================================
// ============================================================================
//  One Data — Agenda (agenda_v1.js)  — PHASE 2 / LECTURE  (v4 — design dashboard)
//  Embed FullCalendar dans <div id="agenda-root"></div>.
//
//  Design calé sur le dashboard v3 (cartes #e8eef7 r14, labels #9bb3d1 maj,
//  titres #1F4A85, Nunito Sans).
//
//  Sources :
//   - USER affiché : variable "Agenda user" 3f02442f (suit le sélecteur intégré,
//     défaut = user connecté). SITE : selected_id_site 39fecccf (topnav).
//   - Sélecteur de collaborateur : alimenté par window.__dash.rawData (dashboard)
//     => fonction / vn_vo / id_site / reseau / affaire + viewerRole. AUCUNE RPC.
//
//  Rôles : 4=vendeur (pas de sélecteur) · 3=chef (ses vendeurs groupés VN/VO/VNVO
//  + lui) · 1/5/6/7/8=managers (collaborateurs du site courant par fonction/nom).
//
//  LECTURE SEULE (écritures = sous-lot suivant).
// ============================================================================
OD.define('agenda', {
  mount(__anchor, ctx) {
    'use strict';
    __anchor.id = 'agenda-root';

  const CFG = {
    rootId: 'agenda-root',
    agendaUserVar: '3f02442f-a00f-41ba-93ad-787c7fd82763',     // "Agenda user" (collaborateur affiché)
    siteVar: '39fecccf-9296-43b7-b5b6-eadaa928290d',           // selected_id_site (topnav)
    selectedClientVar: '55490583-c88b-4748-916e-4d203db07742', // client sélectionné (topnav)
    lookupVar: 'cced74ab-5a0a-418d-9479-2366e05a8754',         // civilités / types société
    npaiVar: '7e24f595-e1fd-4257-99f4-76f179032788',           // options NPAI
    fcVersion: '6.1.15',
    timeZone: 'Europe/Paris',
    initialView: 'timeGridWeek',
    hideLinkedRpv: true,
    colors: { bilat: '#53bda7', rdvRelance: '#9aa3ad', rdvPhone: '#f0a93b', rdvDefault: '#2a5ea9', rpv: '#7e57c2' },
  };

  // --- accès WeWeb / Supabase -------------------------------------------------
  const wwLib = () => window.wwLib;
  function frontWin() { try { return (__anchor.ownerDocument && __anchor.ownerDocument.defaultView) || window; } catch (e) { return window; } }
  function frontDoc() { return __anchor.ownerDocument || document; }
  const sb = () => window.__OD_SB__ || window.wwLib?.wwPlugins?.supabase?.instance;
  function wwVal(id) { try { const v = wwLib().wwVariable.getValue(id); return (v == null || v === '') ? null : v; } catch (e) { return null; } }

  function siteValRaw() { return wwVal(CFG.siteVar); }
  function siteIds() { const v = siteValRaw(); return v == null ? null : (Array.isArray(v) ? v.map(Number) : [Number(v)]); }
  function agendaUserVal() { return wwVal(CFG.agendaUserVar); }
  function setAgendaUser(id) { try { wwLib().wwVariable.updateValue(CFG.agendaUserVar, Number(id)); } catch (e) {} }

  function userRow() { try { let d = frontWin().oropraUser; if (Array.isArray(d)) d = d[0]; return d || {}; } catch (e) { return {}; } }
  function viewerName() { const u = userRow(); return u.nomComplet || u.nom_complet || ''; }
  let CACHED_UID = null;
  async function getUserId() {
    if (CACHED_UID != null) return CACHED_UID;
    const u = userRow();
    let id = u.ID_User ?? u.id_user;
    if (id != null && id !== '') { CACHED_UID = Number(id); return CACHED_UID; }
    try {
      const c = sb(); const { data: auth } = await c.auth.getUser(); const authUid = auth?.user?.id;
      if (authUid) { const { data, error } = await c.from('USER').select('"ID_User"').eq('auth_uid', authUid).single(); if (!error && data && data.ID_User != null) { CACHED_UID = Number(data.ID_User); return CACHED_UID; } }
    } catch (e) { console.error('[agenda] résolution ID_User', e); }
    return null;
  }
  function viewerRole() {
    const u = userRow(); let r = (u.ID_Role != null) ? Number(u.ID_Role) : null;
    if (r == null) { const d = dash(); if (d && d.viewerRole != null) r = Number(d.viewerRole); }
    return r;
  }

  // Données du dashboard (périmètre du viewer) — partagées via window.__dash.
  function dash() { try { return frontWin().__dash || window.__dash || null; } catch (e) { return null; } }
  function dashRows() { const d = dash(); return (d && Array.isArray(d.rawData)) ? d.rawData : null; }

  async function effectiveUserIds() {
    const a = agendaUserVal();
    if (a != null) return Array.isArray(a) ? a.map(Number) : [Number(a)];
    const uid = await getUserId();
    return uid != null ? [uid] : [-1];
  }

  // --- couleurs / mapping -----------------------------------------------------
  function strongColor(e) {
    if (e.source_type === 'bilat') return CFG.colors.bilat;
    if (e.source_type === 'rpv')   return CFG.colors.rpv;
    const t = String(e.id_rdv_type ?? e.extra?.ID_Rdv_Type ?? '');
    if (t === '6')               return CFG.colors.rdvRelance;
    if (t === '5' || t === '10') return CFG.colors.rdvPhone;
    return CFG.colors.rdvDefault;
  }
  function tint(hex, a) { const h = hex.replace('#', ''); const n = parseInt(h, 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  const toFc = (ts) => (ts ? String(ts).replace(' ', 'T') : null);

  function agToday() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  function agNowMin() { const d = new Date(); const z = (n) => String(n).padStart(2,'0'); return d.getFullYear() + '-' + z(d.getMonth()+1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()); }
  function normTs(x) { return (typeof x === 'string') ? x.slice(0,16).replace('T',' ') : ''; }
  function isPastSlot(ts) { const n = normTs(ts); return n !== '' && n < agNowMin(); }
  function clientName(e) { return [e.civilite, e.nom, e.prenom].filter(Boolean).join(' ').trim(); }
  function typeLabel(e) { if (e.source_type === 'rdv') return e.title || 'RDV'; if (e.source_type === 'bilat') return 'Bilatérale'; if (e.source_type === 'rpv') return 'Rapport vendeur'; return ''; }
  function composeTitle(e) { const cn = clientName(e); if (e.source_type === 'rdv') return cn || (e.title || ''); return e.title || ''; }

  function mapEvent(e) {
    const c = strongColor(e);
    return {
      id: e.uid, title: composeTitle(e),
      start: toFc(e.event_start_time), end: toFc(e.event_end_time), allDay: !!e.is_event_all_day,
      backgroundColor: tint(c, 0.14), borderColor: tint(c, 0.14), textColor: '#1F4A85',
      editable: (!!e.can_edit && (e.source_type === 'rdv' || e.source_type === 'bilat') && !isPastSlot(e.event_start_time)),
      extendedProps: Object.assign({ _accent: c }, e),
    };
  }
  function buildEvents(rows) {
    const linked = new Set();
    if (CFG.hideLinkedRpv) rows.forEach(r => { if (r.source_type === 'rdv' && r.id_rpv != null) linked.add(String(r.id_rpv)); });
    const out = [];
    for (const e of rows) { if (CFG.hideLinkedRpv && e.source_type === 'rpv' && linked.has(String(e.origin_id))) continue; out.push(mapEvent(e)); }
    return out;
  }
  async function fetchEvents(info, success, failure) {
    const client = sb(); if (!client) return failure(new Error('no supabase'));
    try {
      const p_start = info.startStr.slice(0, 19).replace('T', ' ');
      const p_end   = info.endStr.slice(0, 19).replace('T', ' ');
      // Un collaborateur précis est sélectionné -> on montre TOUT son agenda
      // (ne pas restreindre au site top-nav, sinon un vendeur d'un autre site
      //  du périmètre apparaît avec un agenda vide). Filtre site seulement en
      //  l'absence de collaborateur explicite (repli périmètre).
      const p_site_ids = (agendaUserVal() != null) ? null : siteIds();
      const { data, error } = await client.rpc('get_calendar_events', { p_start, p_end, p_user_ids: await effectiveUserIds(), p_site_ids });
      if (error) throw error;
      success(buildEvents(data || []));
    } catch (err) { console.error('[agenda] erreur fetch', err); failure(err); }
  }

  // ==========================================================================
  //  SÉLECTEUR DE COLLABORATEUR (role-aware, à partir de window.__dash.rawData)
  // ==========================================================================
  function uniqVendeurs(rows) {
    const seen = {}, out = [];
    for (const r of rows) { const k = String(r.id_user); if (seen[k]) continue; seen[k] = 1; out.push({ id: Number(r.id_user), nom: r.nom_complet || ('Vendeur ' + r.id_user), vnvo: (r.vn_vo || '').toUpperCase(), fonction: (r.fonction || '').trim(), id_site: r.id_site }); }
    return out;
  }
  const sortNom = (a, b) => String(a.nom).localeCompare(String(b.nom), 'fr');

  // null = pas encore prêt ; {mode:'none'} = pas de sélecteur (vendeur)
  function buildCollaborators() {
    const role = viewerRole();
    if (role === 4) return { mode: 'none' };
    const rows = dashRows();
    if (rows == null) return null;
    const vid = Number(CACHED_UID); const vname = viewerName();
    const allById = {}; const groups = [];

    if (role === 3) {
      const vd = uniqVendeurs(rows).filter(v => v.id !== vid);
      const vn = [], vo = [], vnvo = [], autre = [];
      for (const v of vd) { const s = v.vnvo; if (s.includes('VN') && s.includes('VO')) vnvo.push(v); else if (s.includes('VN')) vn.push(v); else if (s.includes('VO')) vo.push(v); else autre.push(v); }
      [vn, vo, vnvo, autre].forEach(a => a.sort(sortNom));
      groups.push({ label: 'Chef des ventes', items: [{ id: vid, nom: vname }] });
      if (vn.length)   groups.push({ label: 'VN', items: vn });
      if (vo.length)   groups.push({ label: 'VO', items: vo });
      if (vnvo.length) groups.push({ label: 'VN / VO', items: vnvo });
      if (autre.length) groups.push({ label: 'Autres', items: autre });
    } else {
      // rôles 1/2/5/6/7/8 : cascade Réseau→Affaire→Site→Vendeur (périmètre complet, RPC dédié)
      return { mode: 'cascade', selfName: vname, selfId: vid };
    }
    groups.forEach(g => g.items.forEach(it => { allById[it.id] = it.nom; }));
    allById[vid] = vname;
    return { mode: role === 3 ? 'chef' : 'manager', groups, allById, selfName: vname };
  }

  function initials(name) { const p = String(name || '').trim().split(/\s+/); return ((p[0] || '')[0] || '').toUpperCase() + ((p[1] || '')[0] || '').toUpperCase(); }
  function currentCollabId() { const a = agendaUserVal(); return a != null ? Number(a) : Number(CACHED_UID); }

  let collabMenuOpen = false;
  let collabSig = null;
  function collabSignature() { const r = dashRows(); return JSON.stringify([viewerRole(), siteValRaw(), r ? r.length : -1, currentCollabId()]); }

  // ---- Cascade directeur : Réseau → Affaire → Site → Vendeur ----------------
  function perimRows() { try { return frontWin().__agendaPerim || window.__agendaPerim || null; } catch (e) { return (typeof window !== 'undefined' ? window.__agendaPerim : null) || null; } }
  function setPerimRows(v) { try { frontWin().__agendaPerim = v; } catch (e) { try { window.__agendaPerim = v; } catch (x) {} } }
  let perimLoading = false;
  async function loadPerim() {
    if (perimRows() || perimLoading) return;
    perimLoading = true;
    try {
      const c = sb();
      const { data, error } = await c.rpc('get_agenda_perimeter', { p_viewer_id_user: (CACHED_UID != null ? Number(CACHED_UID) : null) });
      if (error) throw error;
      const rows = (data || []).map(r => ({
        id_user: r.id_user != null ? Number(r.id_user) : null,
        nom: r.nom_complet || ('Vendeur ' + r.id_user),
        id_site: r.id_site != null ? Number(r.id_site) : null,
        nom_site: r.nom_site || ('Site ' + r.id_site),
        reseau: r.reseau || '(Sans réseau)',
        affaire: r.affaire || '(Sans affaire)',
        id_affaire: r.id_affaire != null ? Number(r.id_affaire) : null,
        id_role: r.id_role != null ? Number(r.id_role) : null,
        vn_vo: (r.vn_vo || '').toUpperCase()
      }));
      setPerimRows(rows);
    } catch (e) { console.error('[agenda] get_agenda_perimeter', e); setPerimRows([]); }
    finally { perimLoading = false; renderCollab(true); }
  }
  function perimSel() {
    let sObj; try { sObj = frontWin().__agendaPerimSel; } catch (e) { sObj = (typeof window !== 'undefined' ? window.__agendaPerimSel : null); }
    if (!sObj) { sObj = { reseau: null, affKey: null, idSite: null, init: false }; try { frontWin().__agendaPerimSel = sObj; } catch (e) { try { window.__agendaPerimSel = sObj; } catch (x) {} } }
    return sObj;
  }
  function affKeyOf(r) { return r.reseau + '~~' + r.id_affaire; }
  function uniqOpts(arr, keyFn, labelFn) {
    const m = {}; for (const x of arr) { const k = keyFn(x); if (k == null) continue; if (!(k in m)) m[k] = { key: k, label: labelFn(x) }; }
    return Object.values(m).sort((a, b) => String(a.label).localeCompare(String(b.label), 'fr'));
  }
  // Résout la sélection (auto-collapse des niveaux à 1 valeur) + renvoie les options.
  function resolveCascade(rows) {
    const sel = perimSel();
    if (!sel.init) {                                   // défaut : le site du viewer (sinon 1re ligne)
      let self = rows.find(r => String(r.id_user) === String(CACHED_UID));
      if (!self) { const us = userRow(); const sid = us.ID_SITE != null ? Number(us.ID_SITE) : null; if (sid != null) self = rows.find(r => r.id_site === sid); }
      if (!self) self = rows[0];
      if (self) { sel.reseau = self.reseau; sel.affKey = affKeyOf(self); sel.idSite = self.id_site; }
      sel.init = true;
    }
    const reseaux = uniqOpts(rows, r => r.reseau, r => r.reseau);
    if (!reseaux.some(o => o.key === sel.reseau)) sel.reseau = reseaux.length ? reseaux[0].key : null;
    const afRows = rows.filter(r => r.reseau === sel.reseau);
    const affaires = uniqOpts(afRows, affKeyOf, r => r.affaire);
    if (!affaires.some(o => o.key === sel.affKey)) sel.affKey = affaires.length ? affaires[0].key : null;
    const stRows = afRows.filter(r => affKeyOf(r) === sel.affKey);
    const sites = uniqOpts(stRows, r => String(r.id_site), r => r.nom_site);
    if (!sites.some(o => String(o.key) === String(sel.idSite))) sel.idSite = sites.length ? Number(sites[0].key) : null;
    const veRows = stRows.filter(r => String(r.id_site) === String(sel.idSite));
    const seenV = {}, vendeurs = [];
    for (const v of veRows) { const k = String(v.id_user); if (seenV[k]) continue; seenV[k] = 1; vendeurs.push(v); }
    return { reseaux, affaires, sites, vendeurs, sel };
  }
  // Catégorie d'un collaborateur pour le regroupement du menu (rôle, + VN/VO pour les vendeurs).
  function collabCategory(r) {
    const role = Number(r.id_role);
    if (role === 4) {
      const s = String(r.vn_vo || '').toUpperCase(); const vn = s.includes('VN'), vo = s.includes('VO');
      if (vn && vo) return { key: 'v3', label: 'Vendeurs VN/VO', order: 90 };
      if (vn)       return { key: 'v1', label: 'Vendeurs VN',    order: 88 };
      if (vo)       return { key: 'v2', label: 'Vendeurs VO',    order: 89 };
      return { key: 'v0', label: 'Vendeurs', order: 91 };
    }
    const M = { 8: ['Directeurs groupe', 10], 7: ['Directeurs marque', 20], 6: ['Directeurs plaque', 30], 2: ['Directeurs', 40], 5: ['Responsables Marketing', 50], 1: ['Admins', 60], 3: ['Chefs des ventes', 70] };
    const m = M[role] || ['Autres', 99];
    return { key: 'r' + role, label: m[0], order: m[1] };
  }
  function renderCascade(host, model) {
    const rows = perimRows();
    host.style.display = '';
    if (rows === null) { loadPerim(); host.innerHTML = '<div class="agc-cascade"><span class="agc-loading">Chargement du périmètre…</span></div>'; return; }
    if (!rows.length) { host.innerHTML = ''; host.style.display = 'none'; return; }
    const r = resolveCascade(rows);
    const curId = currentCollabId();
    const selfId = model.selfId != null ? model.selfId : CACHED_UID;
    const selVal = r.vendeurs.some(v => String(v.id_user) === String(curId)) ? curId : selfId;
    const lvl = (id, label, opts, val, show) => {
      if (!show) return '';
      return '<label class="agc-lvl"><span class="agc-lvl-lbl">' + esc(label) + '</span>'
        + '<select class="agc-sel" id="' + id + '">'
        + opts.map(o => '<option value="' + esc(o.key) + '"' + (String(o.key) === String(val) ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('')
        + '</select></label>';
    };
    // Menu collaborateur : "Moi" épinglé, puis optgroups par catégorie, triés par nom dans chaque groupe.
    const cats = {};
    for (const v of r.vendeurs) {
      if (String(v.id_user) === String(selfId)) continue;          // le viewer est déjà épinglé en "Moi"
      const c = collabCategory(v);
      (cats[c.key] = cats[c.key] || { label: c.label, order: c.order, items: [] }).items.push(v);
    }
    const grps = Object.values(cats).sort((a, b) => a.order - b.order);
    grps.forEach(g => g.items.sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr')));
    const vendOpts = '<option value="' + esc(selfId) + '"' + (String(selVal) === String(selfId) ? ' selected' : '') + '>Moi (mon agenda)</option>'
      + grps.map(g => '<optgroup label="' + esc(g.label) + '">'
          + g.items.map(v => '<option value="' + esc(v.id_user) + '"' + (String(v.id_user) === String(selVal) ? ' selected' : '') + '>' + esc(v.nom) + '</option>').join('')
          + '</optgroup>').join('');
    host.innerHTML = '<div class="agc-cascade">'
      + lvl('agc-reseau', 'Réseau', r.reseaux, r.sel.reseau, r.reseaux.length > 1)
      + lvl('agc-affaire', 'Affaire', r.affaires, r.sel.affKey, r.affaires.length > 1)
      + lvl('agc-site', 'Site', r.sites, r.sel.idSite, r.sites.length > 1)
      + '<label class="agc-lvl"><span class="agc-lvl-lbl">Collaborateur</span><select class="agc-sel" id="agc-vendeur">' + vendOpts + '</select></label>'
      + '</div>';
    wireCascade(host);
  }
  function wireCascade(host) {
    const g = (id) => host.querySelector('#' + id);
    const sel = perimSel();
    const re = g('agc-reseau'); if (re) re.addEventListener('change', () => { sel.reseau = re.value; sel.affKey = null; sel.idSite = null; renderCollab(true); });
    const af = g('agc-affaire'); if (af) af.addEventListener('change', () => { sel.affKey = af.value; sel.idSite = null; renderCollab(true); });
    const si = g('agc-site'); if (si) si.addEventListener('change', () => { sel.idSite = Number(si.value); renderCollab(true); });
    const ve = g('agc-vendeur'); if (ve) ve.addEventListener('change', () => { setAgendaUser(ve.value); renderCollab(true); refetch(); });
  }
  function renderCollab(force) {
    const host = document.getElementById('agenda-collab'); if (!host) return;
    const sig = collabSignature();
    if (!force && sig === collabSig && !collabMenuOpen) return;
    collabSig = sig;
    const model = buildCollaborators();
    if (!model) { return; }                              // pas prêt : on retentera au poll
    if (model.mode === 'cascade') { renderCascade(host, model); return; }
    if (model.mode === 'none') { host.style.display = 'none'; host.innerHTML = ''; return; }
    host.style.display = '';
    const curId = currentCollabId();
    const curName = model.allById[curId] || model.selfName || '';
    let menu = '';
    for (const g of model.groups) { if (!g.items.length) continue; menu += '<div class="agc-grp">' + esc(g.label) + '</div>'; for (const it of g.items) menu += '<div class="agc-opt' + (String(it.id) === String(curId) ? ' is-sel' : '') + '" data-id="' + it.id + '">' + esc(it.nom) + '</div>'; }
    host.innerHTML =
      '<button type="button" class="agc-trigger" id="agc-trigger">'
      + '<span class="agc-ava">' + esc(initials(curName)) + '</span>'
      + '<span class="agc-name">' + esc(curName || '—') + '</span>'
      + '<span class="agc-chev">▾</span></button>'
      + '<div class="agc-menu" id="agc-menu"' + (collabMenuOpen ? '' : ' style="display:none"') + '>' + menu + '</div>';
    wireCollab(host);
  }
  function wireCollab(host) {
    const trig = host.querySelector('#agc-trigger'); const menu = host.querySelector('#agc-menu');
    if (trig) trig.addEventListener('click', (e) => { e.stopPropagation(); collabMenuOpen = !collabMenuOpen; menu.style.display = collabMenuOpen ? '' : 'none'; });
    host.querySelectorAll('.agc-opt').forEach(o => o.addEventListener('click', (e) => {
      e.stopPropagation(); const id = o.getAttribute('data-id'); collabMenuOpen = false; setAgendaUser(id); renderCollab(true); refetch();
    }));
  }
  function esc(s) { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

  // --- styles (charte dashboard) ---------------------------------------------
  function injectCss() {
    const d = document; if (d.getElementById('agenda-css')) return;
    const st = d.createElement('style'); st.id = 'agenda-css';
    st.textContent = `
#agenda-root{font-family:"Nunito Sans",system-ui,sans-serif;color:#2c2c2a}
#agenda-root .agenda-card{background:#fff;border:1.5px solid #e8eef7;border-radius:14px;padding:16px 18px}
#agenda-root .agenda-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
#agenda-root .agenda-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#9bb3d1}
#agenda-root #agenda-collab{position:relative}
#agenda-root .agc-trigger{display:inline-flex;align-items:center;gap:9px;background:#fff;border:1.5px solid #e2eaf5;border-radius:10px;padding:5px 11px 5px 6px;cursor:pointer;font-family:inherit;color:#1F4A85;font-weight:700;font-size:13px;transition:border-color .15s}
#agenda-root .agc-cascade{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
#agenda-root .agc-lvl{display:flex;flex-direction:column;gap:3px}
#agenda-root .agc-lvl-lbl{font-size:10px;font-weight:700;color:#9bb3d1;text-transform:uppercase;letter-spacing:.03em;padding-left:2px}
#agenda-root .agc-sel{border:1.5px solid #e2eaf5;border-radius:9px;padding:7px 10px;font-family:inherit;font-size:13px;font-weight:600;color:#1F4A85;background:#fff;cursor:pointer;min-width:118px}
#agenda-root .agc-sel:focus{outline:none;border-color:#2a5ea9}
#agenda-root .agc-loading{font-size:12px;color:#9bb3d1}
#agenda-root .agc-trigger:hover{border-color:#acc5e4}
#agenda-root .agc-ava{width:26px;height:26px;border-radius:50%;background:#2a5ea9;color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center}
#agenda-root .agc-name{max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#agenda-root .agc-chev{color:#9bb3d1;font-size:10px}
#agenda-root .agc-menu{position:absolute;top:calc(100% + 6px);right:0;background:#fff;border:1.5px solid #e8eef7;border-radius:12px;box-shadow:0 10px 34px rgba(42,94,169,.16);padding:6px;z-index:1000;min-width:248px;max-height:340px;overflow-y:auto}
#agenda-root .agc-grp{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#9bb3d1;padding:9px 12px 4px}
#agenda-root .agc-opt{padding:8px 12px;border-radius:8px;font-size:13px;color:#2a5ea9;font-weight:600;cursor:pointer;white-space:nowrap}
#agenda-root .agc-opt:hover{background:#eef4fc}
#agenda-root .agc-opt.is-sel,#agenda-root .agc-opt.is-sel:hover{background:#2a5ea9;color:#fff;font-weight:800}
#agenda-root .fc{--fc-border-color:#eef2f8;--fc-page-bg-color:#fff;--fc-now-indicator-color:#e24b4a;--fc-today-bg-color:#f7f9fc;font-size:12px;
  --fc-button-bg-color:#fff;--fc-button-border-color:#e2eaf5;--fc-button-text-color:#2a5ea9;
  --fc-button-hover-bg-color:#f2f6fc;--fc-button-hover-border-color:#acc5e4;--fc-button-hover-text-color:#2a5ea9;
  --fc-button-active-bg-color:#2a5ea9;--fc-button-active-border-color:#2a5ea9;--fc-button-active-text-color:#fff}
#agenda-root .fc .fc-toolbar.fc-header-toolbar{margin-bottom:12px}
#agenda-root .fc .fc-toolbar-title{font-size:16px;font-weight:800;color:#1F4A85;letter-spacing:-.01em}
#agenda-root .fc .fc-button{font-weight:700;font-size:12px;text-transform:none;border-radius:9px;padding:6px 12px;border-width:1.5px;box-shadow:none!important;transition:background .15s,border-color .15s}
#agenda-root .fc .fc-button:focus,#agenda-root .fc .fc-button:focus-visible{box-shadow:none!important;outline:none}
#agenda-root .fc .fc-button-primary:disabled{opacity:.45}
#agenda-root .fc .fc-button-primary:not(:disabled).fc-button-active,#agenda-root .fc .fc-button-primary:not(:disabled).fc-button-active:focus,#agenda-root .fc .fc-button-primary:not(:disabled):active{background:#2a5ea9;border-color:#2a5ea9;color:#fff}
#agenda-root .fc .fc-button-group>.fc-button:first-child{border-radius:9px 0 0 9px}
#agenda-root .fc .fc-button-group>.fc-button:last-child{border-radius:0 9px 9px 0}
#agenda-root .fc .fc-button-group>.fc-button:not(:first-child):not(:last-child){border-radius:0}
#agenda-root .fc .fc-prev-button,#agenda-root .fc .fc-next-button{padding:6px 9px}
#agenda-root .fc-theme-standard .fc-scrollgrid{border-color:#eef2f8;border-radius:12px;overflow:hidden}
#agenda-root .fc-theme-standard td,#agenda-root .fc-theme-standard th{border-color:#eef2f8}
#agenda-root .fc .fc-col-header-cell{background:#fbfcfe;padding:8px 0}
#agenda-root .fc .fc-col-header-cell-cushion{font-size:11px;font-weight:700;color:#1F4A85;text-decoration:none;text-transform:capitalize}
#agenda-root .fc .fc-timegrid-axis-cushion,#agenda-root .fc .fc-timegrid-slot-label-cushion{font-size:10px;font-weight:700;color:#9bb3d1}
#agenda-root .fc .fc-timegrid-slot{height:1.7em}
#agenda-root .fc .fc-timegrid-slot-minor{border-top-style:dotted;border-top-color:#f1f5fa}
#agenda-root .fc .fc-day-today .fc-col-header-cell-cushion{color:#2a5ea9}
#agenda-root .fc .fc-event{border:none;border-radius:7px;padding:1px 7px;font-size:11px;line-height:1.3;cursor:pointer;box-shadow:none;overflow:hidden}
#agenda-root .fc .fc-event .fc-event-main{padding:1px 0}
#agenda-root .fc .fc-event .fc-event-time{font-weight:700;font-size:10px;opacity:.7}
#agenda-root .fc .fc-event .fc-event-title{font-weight:700;overflow:hidden;text-overflow:ellipsis}
#agenda-root .fc .fc-timegrid-event .fc-event-time{display:none}
#agenda-root .fc .fc-timegrid-event .fc-event-title,#agenda-root .fc .fc-timegrid-event-short .fc-event-title{font-size:10.5px;font-weight:700;line-height:1.2;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:clip}
#agenda-root .fc .fc-timegrid-event-short .fc-event-main,#agenda-root .fc .fc-timegrid-event .fc-event-main{font-size:10.5px}
#agenda-root .fc .fc-list-event:hover td{background:#f2f6fc}
#agenda-root .fc .fc-list-day-cushion{background:#fbfcfe}
#agenda-root .fc .fc-list-event-dot{border-radius:3px}
#agenda-tip{position:fixed;z-index:2000;pointer-events:none;display:none;max-width:280px}
#agenda-tip .agt-card{background:#fff;border:1.5px solid #e8eef7;border-radius:10px;box-shadow:0 8px 26px rgba(42,94,169,.16);padding:9px 12px;font-family:"Nunito Sans",system-ui,sans-serif}
#agenda-tip .agt-title{font-size:12px;font-weight:800;color:#1F4A85;line-height:1.25;display:flex;align-items:flex-start;gap:7px}
#agenda-tip .agt-dot{width:8px;height:8px;border-radius:3px;flex:0 0 auto;margin-top:3px}
#agenda-tip .agt-time{font-size:10px;font-weight:700;color:#9bb3d1;margin-top:4px;padding-left:15px}
#agenda-tip .agt-type{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#7a98c5;margin-top:3px;padding-left:15px}
#agenda-tip .agt-desc{font-size:11px;color:#54678a;margin-top:6px;line-height:1.35;white-space:pre-wrap;padding-left:15px}
#agenda-ov{position:fixed;inset:0;background:rgba(42,94,169,.18);z-index:3000;display:flex;align-items:center;justify-content:center;font-family:"Nunito Sans",system-ui,sans-serif}
#agenda-ov .agm{background:#fff;border-radius:16px;box-shadow:0 16px 50px rgba(42,94,169,.22);width:94%;max-width:520px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column}
#agenda-ov .agm-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1.5px solid #eef2f8}
#agenda-ov .agm-title{font-size:13px;font-weight:800;color:#1F4A85;text-transform:uppercase;letter-spacing:.04em}
#agenda-ov .agm-x{width:28px;height:28px;padding:0;border:none;background:#f2f6fc;border-radius:8px;color:#2a5ea9;font-size:18px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center}
#agenda-ov .agm-x:hover{background:#e6eefb}
#agenda-ov .agm-body{padding:16px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:12px}
#agenda-ov .agm-seg{display:flex;border:1.5px solid #e2eaf5;border-radius:10px;overflow:hidden}
#agenda-ov .agm-seg button{flex:1;padding:9px 6px;border:none;background:#fff;color:#7a98c5;font-family:inherit;font-weight:700;font-size:12px;cursor:pointer;transition:all .12s}
#agenda-ov .agm-seg button:not(:last-child){border-right:1.5px solid #e2eaf5}
#agenda-ov .agm-seg button.on{background:#2a5ea9;color:#fff}
#agenda-ov .agm-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#agenda-ov .agm-inp,#agenda-ov .agm-sel{border:1.5px solid #e2eaf5;border-radius:9px;padding:8px 11px;font-size:13px;font-family:inherit;color:#1F4A85;font-weight:600;background:#fff;outline:none}
#agenda-ov .agm-inp:focus,#agenda-ov .agm-sel:focus,#agenda-ov .agm-ta:focus{border-color:#2a5ea9}
#agenda-ov .agm-ta{width:100%;min-height:64px;resize:vertical;border:1.5px solid #e2eaf5;border-radius:9px;padding:8px 11px;font-size:13px;font-family:inherit;color:#1F4A85;font-weight:500;background:#fff;outline:none}
#agenda-ov .agm-grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px}
#agenda-ov .agm-radio{display:flex;align-items:center;gap:8px;font-size:12px;color:#54678a;font-weight:600;cursor:pointer;padding:5px 2px}
#agenda-ov .agm-radio input{accent-color:#2a5ea9;width:15px;height:15px}
#agenda-ov .agm-cli{position:relative}
#agenda-ov .agm-cli-menu{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1.5px solid #e8eef7;border-radius:10px;box-shadow:0 10px 30px rgba(42,94,169,.16);max-height:200px;overflow-y:auto;z-index:10}
#agenda-ov .agm-cli-opt{padding:8px 11px;font-size:13px;color:#2a5ea9;font-weight:600;cursor:pointer}
#agenda-ov .agm-cli-opt:hover{background:#eef4fc}
#agenda-ov .agm-cli-sel{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1.5px solid #e2eaf5;border-radius:9px;padding:8px 9px 8px 12px;cursor:pointer;background:#f7f9fc;transition:border-color .12s}
#agenda-ov .agm-cli-sel:hover{border-color:#acc5e4}
#agenda-ov .agm-cli-name{font-size:13px;font-weight:700;color:#1F4A85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#agenda-ov .agm-cli-change{flex:0 0 auto;border:none;background:#2a5ea9;color:#fff;border-radius:7px;padding:5px 12px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;text-transform:uppercase;letter-spacing:.03em}
#agenda-ov .agm-cli-change:hover{background:#24508f}
#agenda-ov .agm-cli-pick{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;border:1.5px dashed #cdd9ea;background:#f7f9fc;border-radius:9px;padding:10px;color:#2a5ea9;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:all .12s}
#agenda-ov .agm-cli-pick:hover{border-color:#2a5ea9;background:#eef4fc}
#agenda-ov .agm-tg{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:700;color:#1F4A85;cursor:pointer;user-select:none}
#agenda-ov .agm-tg .sw{width:42px;height:24px;border-radius:999px;background:#cdd9ea;position:relative;transition:background .15s;flex:0 0 auto}
#agenda-ov .agm-tg .sw::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .15s}
#agenda-ov .agm-tg.on .sw{background:#2a5ea9}
#agenda-ov .agm-tg.on .sw::after{left:21px}
#agenda-ov .agm-lbl{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#9bb3d1;margin-bottom:5px}
#agenda-ov .agm-err{color:#a32d2d;font-size:12px;font-weight:700}
#agenda-ov .agm-foot{padding:14px 18px;border-top:1.5px solid #eef2f8}
#agenda-ov .agm-save{width:100%;border:none;border-radius:10px;padding:12px;background:#53bda7;color:#fff;font-family:inherit;font-weight:800;font-size:14px;cursor:pointer;transition:background .15s}
#agenda-ov .agm-save:hover{background:#46a892}
#agenda-ov .agm-save:disabled{opacity:.55;cursor:default}
#agenda-ov .agm-foot-edit{display:flex;gap:10px}
#agenda-ov .agm-foot-edit .agm-save{flex:1}
#agenda-ov .agm-del{border:1.5px solid #f0b6b6;border-radius:10px;padding:12px 16px;background:#fff;color:#c0392b;font-family:inherit;font-weight:800;font-size:14px;cursor:pointer;transition:all .15s}
#agenda-ov .agm-del:hover{background:#fcebeb}
#agenda-ov .agm-del:disabled{opacity:.55;cursor:default}
#agenda-ov .agm-cli-ro{padding:10px 12px;border:1.5px solid #e2eaf5;border-radius:10px;background:#f7f9fc;color:#1F4A85;font-weight:700;font-size:13px}
#agenda-ov .agm-confirm{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
#agenda-ov .agm-confirm-txt{flex:1;min-width:140px;color:#a32d2d;font-weight:800;font-size:13px}
#agenda-ov .agm-cancel{border:1.5px solid #e2eaf5;border-radius:10px;padding:11px 16px;background:#fff;color:#5f5e5a;font-family:inherit;font-weight:700;font-size:13px;cursor:pointer}
#agenda-ov .agm-cancel:hover{background:#f4f6fa}
#agenda-ov .agm-confirm .agm-del{background:#e24b4a;color:#fff;border:none}
#agenda-ov .agm-confirm .agm-del:hover{background:#cf3d3c}
#agenda-err-ov{position:fixed;inset:0;z-index:3500;background:rgba(20,33,61,.28);display:flex;align-items:center;justify-content:center;padding:18px;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
#agenda-err-ov .agm-err-card{background:#fff;border-radius:13px;box-shadow:0 12px 34px rgba(20,33,61,.22);width:286px;max-width:90vw;padding:18px 18px 16px;text-align:center}
#agenda-err-ov .agm-err-ic{width:38px;height:38px;border-radius:50%;margin:0 auto 9px;display:flex;align-items:center;justify-content:center;background:#fdeceb;color:#e24b4a}
#agenda-err-ov .agm-err-ic svg{width:20px;height:20px}
#agenda-err-ov .agm-err-h{font-size:14.5px;font-weight:800;color:#14213d;margin-bottom:4px;line-height:1.3}
#agenda-err-ov .agm-err-m{font-size:12px;line-height:1.45;color:#7b7a76;margin-bottom:14px}
#agenda-err-ov .agm-err-ok{width:100%;border:none;border-radius:9px;padding:9px 14px;background:#1F4A85;color:#fff;font-family:inherit;font-weight:700;font-size:12.5px;cursor:pointer;transition:background .15s}
#agenda-err-ov .agm-err-ok:hover{background:#163864}
`;
    (d.head || d.documentElement).appendChild(st);
  }

  // --- tooltip au survol -----------------------------------------------------
  let tipEl = null;
  function ensureTip() { const d = frontDoc(); if (tipEl && tipEl.isConnected) return tipEl; tipEl = d.createElement('div'); tipEl.id = 'agenda-tip'; (d.body || d.documentElement).appendChild(tipEl); return tipEl; }
  function hhmm(x) { return x ? String(x.getUTCHours()).padStart(2, '0') + ':' + String(x.getUTCMinutes()).padStart(2, '0') : ''; }
  function hhmmStr(s) { return (typeof s === 'string' && s.length >= 16) ? s.slice(11, 16) : ''; }
  function showTip(el, ev) {
    const t = ensureTip(); const p = ev.extendedProps || {};
    const cn = clientName(p); const main = cn || ev.title || '';
    const sub = typeLabel(p);
    const startTxt = hhmmStr(ev.startStr) || hhmm(ev.start);
    const endTxt = ev.endStr ? hhmmStr(ev.endStr) : (ev.end ? hhmm(ev.end) : '');
    const range = startTxt + (endTxt ? ' – ' + endTxt : '');
    const desc = p.description || p.commentaire || p.Commentaire || '';
    const accent = p._accent || '#2a5ea9';
    t.innerHTML = '<div class="agt-card"><div class="agt-title"><span class="agt-dot" style="background:' + accent + '"></span><span>' + esc(main) + '</span></div>'
      + (sub ? '<div class="agt-type">' + esc(sub) + '</div>' : '')
      + '<div class="agt-time">' + esc(range) + '</div>'
      + (desc ? '<div class="agt-desc">' + esc(desc) + '</div>' : '') + '</div>';
    t.style.display = 'block';
    const r = el.getBoundingClientRect(); const tr = t.getBoundingClientRect();
    const vw = frontWin().innerWidth || window.innerWidth;
    let top = r.top - tr.height - 8; if (top < 6) top = r.bottom + 8;
    let left = r.left; if (left + tr.width > vw - 8) left = vw - 8 - tr.width; if (left < 6) left = 6;
    t.style.top = top + 'px'; t.style.left = left + 'px';
  }
  function hideTip() { if (tipEl) tipEl.style.display = 'none'; }

  // --- init FullCalendar ------------------------------------------------------
  let calendar = null;
  let showSunday = false;                              // dimanche masqué par défaut
  const refetch = () => { try { calendar && calendar.refetchEvents(); } catch (e) {} };
  function updateSundayBtn() { try { const b = document.querySelector('#agenda-root .fc-dimanche-button'); if (b) b.classList.toggle('fc-button-active', showSunday); } catch (e) {} }

  function init() {
    const root = __anchor;
    if (!root) { console.warn('[agenda] #' + CFG.rootId + ' absent'); return; }
    if (!window.FullCalendar) { console.error('[agenda] FullCalendar non chargé'); return; }
    injectCss();
    root.innerHTML = '<div class="agenda-card"><div class="agenda-top"><span class="agenda-title">Agenda</span><div id="agenda-collab" style="display:none"></div></div><div id="agenda-fc"></div></div>';
    const mount = root.querySelector('#agenda-fc');

    calendar = new window.FullCalendar.Calendar(mount, {
      timeZone: CFG.timeZone, locale: 'fr', initialView: CFG.initialView, height: 'auto', firstDay: 1,
      nowIndicator: true, allDaySlot: false, slotMinTime: '07:00:00', slotMaxTime: '20:00:00',
      slotDuration: '00:30:00', slotLabelInterval: '01:00', expandRows: true,
      hiddenDays: showSunday ? [] : [0],                // 0 = dimanche
      dayHeaderFormat: { weekday: 'short', day: '2-digit', month: '2-digit', omitCommas: true },
      customButtons: { dimanche: { text: 'Dimanche', click: function () { showSunday = !showSunday; calendar.setOption('hiddenDays', showSunday ? [] : [0]); updateSundayBtn(); } } },
      headerToolbar: { left: 'prev,next today dimanche', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' },
      buttonText: { today: "Aujourd'hui", month: 'Mois', week: 'Semaine', day: 'Jour', list: 'Liste' },
      slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
      eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
      editable: true, selectable: true, selectMirror: true, unselectAuto: false,
      eventStartEditable: true, eventDurationEditable: true,
      select: (sel) => openCreate(sel),
      events: fetchEvents,
      eventDidMount: (info) => {
        const c = info.event.extendedProps._accent; if (c) { info.el.style.borderLeft = '3px solid ' + c; }
        info.el.addEventListener('mouseenter', () => showTip(info.el, info.event));
        info.el.addEventListener('mouseleave', hideTip);
      },
      eventClick: (arg) => { window.__agendaSelected = arg.event.extendedProps; openEdit(arg.event); },
      eventDrop: applyDragResize,
      eventResize: applyDragResize,
    });

    calendar.render();
    updateSundayBtn();
    window.__agendaRefetch = refetch;
    getUserId().then(() => { renderCollab(true); refetch(); });
    wireRefresh();
  }

  function wireRefresh() {
    if (!window.__agendaCollabOutside) {
      window.__agendaCollabOutside = (e) => { const host = document.getElementById('agenda-collab'); if (collabMenuOpen && host && !host.contains(e.target)) { collabMenuOpen = false; const m = document.getElementById('agc-menu'); if (m) m.style.display = 'none'; } };
      try { frontDoc().addEventListener('mousedown', window.__agendaCollabOutside, true); } catch (e) {}
    }
    if (!window.__agendaPoll) {
      let last = JSON.stringify([siteIds(), agendaUserVal()]);
      window.__agendaPoll = setInterval(() => {
        const cur = JSON.stringify([siteIds(), agendaUserVal()]);
        if (cur !== last) { last = cur; refetch(); }
        renderCollab(false);                 // (re)construit le sélecteur dès que le dashboard est prêt / au changement de site
      }, 600);
    }
  }


  // ==========================================================================
  //  POPUP CRÉATION (3 modes : RDV client / Créneau / Bilatérale)
  //  UI à la charte dashboard. Écrit via les RPC create_* (phase2b_creation.sql).
  // ==========================================================================
  const ORIGINES = ['Initiative personnelle', 'Indication', 'Marketing Groupe', 'Campagnes Constructeur', 'Fin de financement', 'Salon - Expo'];
  const DURATIONS = [15, 30, 45, 60, 90, 120];
  let rdvTypesCache = null;
  async function loadRdvTypes() {
    if (rdvTypesCache) return rdvTypesCache;
    try { const { data, error } = await sb().from('rdv_type').select('"ID_RDV_TYPE","DESIGNATION"'); if (error) throw error; rdvTypesCache = (data || []).map(r => ({ id: Number(r.ID_RDV_TYPE), label: r.DESIGNATION })).sort((a, b) => String(a.label).localeCompare(String(b.label), 'fr')); }
    catch (e) { console.error('[agenda] rdv_type', e); rdvTypesCache = []; }
    return rdvTypesCache;
  }
  function creneauTypes() {
    const ex = { 5: 1, 6: 1, 10: 1 }; // RDV Physique / Relance / RDV T\u00e9l\u00e9phonique = rpv, pas des cr\u00e9neaux
    return (rdvTypesCache || []).filter(t => !ex[Number(t.id)]).sort((a, b) => {
      const aA = /^autre$/i.test(String(a.label).trim()), bA = /^autre$/i.test(String(b.label).trim());
      if (aA && !bA) return 1; if (bA && !aA) return -1;
      return String(a.label).localeCompare(String(b.label), 'fr');
    });
  }
  function clientLabel(c) { if (!c) return ''; const soc = (c.idmultivu === 1 || c.idmultivu === '1'); return soc ? [c.CIVILITE, c.NOM].filter(Boolean).join(' ') : [c.CIVILITE, c.NOM, c.PRENOM].filter(Boolean).join(' '); }

  // ==========================================================================
  //  Picker client — comportement identique à oropra-client-search / Like-P.Com
  //  (onglets Particulier/Société, recherche multi-critères, tableau + pagination,
  //   création client avec autocomplete SIRENE + adresse). Overlay au-dessus du
  //   popup RDV. onPick(client) renvoie la row choisie ; n'écrit PAS la var topnav.
  // ==========================================================================
  function openClientPicker(onPick, preselect) {
    const GEOPF_ENDPOINT = 'https://data.geopf.fr/geocodage/search';
    const EDGE_FN_SIRENE_SEARCH = 'sirene-search';
    const EDGE_FN_SIRENE_UPSERT = 'sirene-upsert';
    const PAGE_SIZE = 10;
    const d = frontDoc();
    const supa = () => sb();
    let viewerId = null;
    try { let cd = frontWin().oropraUser; if (Array.isArray(cd)) cd = cd[0]; viewerId = cd && cd.ID_User; } catch (e) {}
    function rv(id) { try { return wwLib().wwVariable.getValue(id); } catch (e) { return null; } }
    const lookup = Array.isArray(rv(CFG.lookupVar)) ? rv(CFG.lookupVar) : [];
    const civilitesP = lookup.filter(x => x.multivu === 0);
    const typesS = lookup.filter(x => x.multivu === 1);
    const npaiRaw = rv(CFG.npaiVar);
    const npaiOptions = Array.isArray(npaiRaw) && npaiRaw.length ? npaiRaw : ['Aucun', 'NPAI', 'Décédé'];

    const emptyP = () => ({ NOM: '', PRENOM: '', EMAIL: '', IDVu: '', tel: '', ville: '', cp: '', birthMin: '', birthMax: '', CSP: '', marque: '' });
    const emptyS = () => ({ SIRET: '', NOM: '', EMAIL: '', IDVu: '' });
    const st = {
      activeTab: 'particulier', showMore: false, filters: { particulier: emptyP(), societe: emptyS() },
      page: 1, results: [], totalCount: 0, loading: false, searched: false, error: null, modal: null,
      selectedClient: (preselect && preselect.IDVu != null) ? Object.assign({}, preselect) : (function () { const c = rv(CFG.selectedClientVar); if (c && typeof c === 'object' && c.IDVu != null) { const o = JSON.parse(JSON.stringify(c)); delete o.full_count; return o; } return null; })()
    };

    function ce(s) { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function cd2(s) { return s == null ? '' : String(s).replace(/\D/g, ''); }
    function cmail(s) { return s == null ? '' : String(s).trim().toLowerCase(); }
    function vMail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim()); }
    function vMob(s) { const x = cd2(s); return /^(0[67]\d{8}|33[67]\d{8})$/.test(x); }
    function vFixe(s) { const x = cd2(s); return /^(0[1-589]\d{8}|33[1-589]\d{8})$/.test(x); }
    function cname(c) { if (!c) return ''; const soc = c.idmultivu === 1 || c.idmultivu === '1'; return soc ? [c.CIVILITE, c.NOM].filter(Boolean).join(' ') : [c.CIVILITE, c.NOM, c.PRENOM].filter(Boolean).join(' '); }

    function buildQuery() {
      const tab = st.activeTab, f = st.filters[tab];
      let q = supa().from('CLIENT').select('*', { count: 'exact' }).eq('idmultivu', tab === 'societe' ? 1 : 0);
      if (tab === 'particulier') {
        if (f.NOM) q = q.ilike('NOM', '%' + f.NOM + '%');
        if (f.PRENOM) q = q.ilike('PRENOM', '%' + f.PRENOM + '%');
        if (f.EMAIL) q = q.ilike('EMAIL', '%' + f.EMAIL + '%');
        if (f.IDVu) q = q.eq('IDVu', Number(f.IDVu));
        if (f.tel) q = q.or('TEl_MOB.ilike.%' + f.tel + '%,TEL_FIXE.ilike.%' + f.tel + '%');
        if (f.ville) q = q.ilike('ville', '%' + f.ville + '%');
        if (f.cp) q = q.ilike('code_postal', f.cp + '%');
        if (f.birthMin) q = q.gte('BIRTHDAY', f.birthMin);
        if (f.birthMax) q = q.lte('BIRTHDAY', f.birthMax);
        if (f.CSP) q = q.ilike('CSP', '%' + f.CSP + '%');
        if (f.marque) q = q.ilike('MARQUE_CLIENT_VEHICULE', '%' + f.marque + '%');
      } else {
        if (f.SIRET) { const c = cd2(f.SIRET); if (c) q = q.eq('SIRET', c); }
        if (f.NOM) q = q.ilike('NOM', '%' + f.NOM + '%');
        if (f.EMAIL) q = q.ilike('EMAIL', '%' + f.EMAIL + '%');
        if (f.IDVu) q = q.eq('IDVu', Number(f.IDVu));
      }
      const start = (st.page - 1) * PAGE_SIZE;
      return q.order('NOM', { ascending: true, nullsFirst: false }).range(start, start + PAGE_SIZE - 1);
    }
    async function runSearch() {
      st.loading = true; st.searched = true; render();
      try { const { data, error, count } = await buildQuery(); if (error) throw error; st.results = data || []; st.totalCount = count || 0; st.error = null; }
      catch (e) { st.error = e.message || String(e); st.results = []; st.totalCount = 0; }
      st.loading = false; render();
    }
    function clearFilters() { st.filters[st.activeTab] = st.activeTab === 'particulier' ? emptyP() : emptyS(); st.page = 1; st.results = []; st.totalCount = 0; st.searched = false; st.error = null; render(); }
    function changeTab(t) { if (st.activeTab === t) return; st.activeTab = t; st.page = 1; st.results = []; st.totalCount = 0; st.searched = false; st.error = null; st.showMore = false; render(); }
    function pickRow(r) { st.selectedClient = Object.assign({}, r); render(); }
    function changePage(p) { const total = Math.max(1, Math.ceil(st.totalCount / PAGE_SIZE)); if (p < 1 || p > total || p === st.page) return; st.page = p; runSearch(); }
    function pagerItems(cur, total) { if (total <= 1) return []; if (total <= 7) { const a = []; for (let i = 1; i <= total; i++) a.push({ page: i }); return a; } const set = new Set([1, total, cur]); if (cur > 1) set.add(cur - 1); if (cur < total) set.add(cur + 1); const arr = Array.from(set).sort((a, b) => a - b); const out = []; let prev = 0; for (const p of arr) { if (p > prev + 1) out.push({ ellipsis: true }); out.push({ page: p }); prev = p; } return out; }

    function openCreateModal() {
      const f = st.filters[st.activeTab]; const isSoc = st.activeTab === 'societe';
      st.modal = {
        isSoc, saving: false, error: null, duplicate: null,
        addressQuery: '', addressSuggestions: [], addressLoading: false,
        siretQuery: isSoc && f.SIRET ? cd2(f.SIRET) : '', siretSuggestions: [], siretLoading: false,
        data: {
          CIVILITE: '', NOM: f.NOM || '', PRENOM: !isSoc ? (f.PRENOM || '') : '',
          BIRTHDAY: '', EMAIL: f.EMAIL || '', TEl_MOB: !isSoc ? (f.tel || '') : '', TEL_FIXE: '',
          ADRESSE: '', code_postal: !isSoc ? (f.cp || '') : '', ville: !isSoc ? (f.ville || '') : '',
          code_insee: '', lat: null, lon: null, adresse_label: '', adresse_source: 'manual',
          adresse_status: null, adresse_score: null, adresse_ban: null,
          STOP_COM: false, NPAI: 'Aucun', CSP: '', PROFESSION: '', LOISIR: '',
          MARQUE_CLIENT_VEHICULE: '', MODELE_CLIENT_VEHICULE: '', ANNEE_CLIENT_VEHICULE: '',
          KM_CLIENT_VEHICULE: '', KM_MOY: '', COMMENTAIRE: '',
          SIRET: isSoc && f.SIRET ? cd2(f.SIRET) : '', idmultivu: isSoc ? 1 : 0
        }
      };
      render();
    }
    function closeModal() { st.modal = null; render(); }
    function updMField(field, value) { if (st.modal) st.modal.data[field] = value; }
    function validateModal() {
      if (!st.modal) return null; const dd = st.modal.data, isSoc = st.modal.isSoc, err = [];
      if (isSoc) {
        if (!cd2(dd.SIRET) || cd2(dd.SIRET).length !== 14) err.push('Le SIRET doit comporter 14 chiffres.');
        if (!dd.NOM || !String(dd.NOM).trim()) err.push('La raison sociale est obligatoire.');
      } else {
        if (!dd.CIVILITE) err.push('La civilité est obligatoire.');
        if (!dd.NOM || !String(dd.NOM).trim()) err.push('Le nom est obligatoire.');
        if (!dd.PRENOM || !String(dd.PRENOM).trim()) err.push('Le prénom est obligatoire.');
        if (!dd.TEl_MOB) err.push('Le téléphone portable est obligatoire.');
        else if (!vMob(dd.TEl_MOB)) err.push('Téléphone portable invalide (06/07).');
        if (!dd.EMAIL) err.push("L'email est obligatoire.");
        else if (!vMail(dd.EMAIL)) err.push('Email invalide.');
      }
      if (dd.TEL_FIXE && !vFixe(dd.TEL_FIXE)) err.push('Téléphone fixe invalide.');
      if (isSoc && dd.TEl_MOB && !vMob(dd.TEl_MOB)) err.push('Téléphone portable invalide.');
      if (isSoc && dd.EMAIL && !vMail(dd.EMAIL)) err.push('Email invalide.');
      return err.length ? err : null;
    }
    async function checkDuplicates() {
      if (!st.modal) return null; const dd = st.modal.data;
      const cols = 'IDVu, CIVILITE, NOM, PRENOM, EMAIL, TEl_MOB, idmultivu, code_postal, ville';
      const mob = cd2(dd.TEl_MOB);
      if (mob) { const { data: dup } = await supa().from('CLIENT').select(cols).eq('TEl_MOB', mob).limit(1).maybeSingle(); if (dup) return { field: 'TEl_MOB', label: 'Ce numéro de portable', client: dup }; }
      const e = cmail(dd.EMAIL);
      if (e) { const { data: dup } = await supa().from('CLIENT').select(cols).ilike('EMAIL', e).limit(1).maybeSingle(); if (dup) return { field: 'EMAIL', label: 'Cette adresse email', client: dup }; }
      return null;
    }
    function dismissDuplicate() { if (st.modal) st.modal.duplicate = null; render(); }
    function viewDuplicate() { if (!st.modal || !st.modal.duplicate) return; st.selectedClient = Object.assign({}, st.modal.duplicate.client); st.modal = null; render(); }
    async function saveCreation() {
      if (!st.modal) return; const errs = validateModal();
      if (errs) { st.modal.error = errs.join(' '); st.modal.duplicate = null; render(); return; }
      st.modal.saving = true; st.modal.error = null; st.modal.duplicate = null; render();
      try {
        const dup = await checkDuplicates();
        if (dup) { st.modal.duplicate = dup; st.modal.saving = false; render(); return; }
        const now = new Date().toISOString();
        const { data: maxRow } = await supa().from('CLIENT').select('IDVu').order('IDVu', { ascending: false }).limit(1).maybeSingle();
        const nextIDVu = (maxRow && maxRow.IDVu != null ? Number(maxRow.IDVu) : 0) + 1;
        const isSoc = st.modal.isSoc;
        const payload = Object.assign({}, st.modal.data, {
          IDVu: nextIDVu, CreationDate: now, UpdateDate: now,
          ID_VENDEUR_CREATION: viewerId != null ? String(viewerId) : null,
          ID_VENDEUR_UPDATE: viewerId != null ? String(viewerId) : null,
          adresse_checked_at: st.modal.data.adresse_status === 'verified' ? now : null,
          CP_VILLE: [st.modal.data.code_postal, st.modal.data.ville].filter(Boolean).join(' ')
        });
        if (payload.TEl_MOB) payload.TEl_MOB = cd2(payload.TEl_MOB);
        if (payload.TEL_FIXE) payload.TEL_FIXE = cd2(payload.TEL_FIXE);
        if (payload.EMAIL) payload.EMAIL = cmail(payload.EMAIL);
        ['ANNEE_CLIENT_VEHICULE', 'KM_CLIENT_VEHICULE', 'KM_MOY', 'SIRET', 'adresse_score'].forEach(k => {
          if (payload[k] === '' || payload[k] == null) payload[k] = null;
          else if (k === 'adresse_score') payload[k] = Number(payload[k]);
          else payload[k] = Number(cd2(payload[k])) || null;
        });
        if (payload.BIRTHDAY === '') payload.BIRTHDAY = null;
        const { data: inserted, error } = await supa().from('CLIENT').insert(payload).select('*').single();
        if (error) throw error;
        if (isSoc && payload.SIRET) { try { await supa().functions.invoke(EDGE_FN_SIRENE_UPSERT, { body: { siret: String(payload.SIRET), idvu: String(nextIDVu), setPrimary: true } }); } catch (e) {} }
        st.selectedClient = Object.assign({}, inserted); st.modal = null; render();
      } catch (e) { st.modal.saving = false; st.modal.error = e.message || String(e); render(); }
    }
    async function inseeAddr(query) {
      const r = await fetch(GEOPF_ENDPOINT + '?q=' + encodeURIComponent(query) + '&limit=8'); if (!r.ok) throw new Error('Geocoding ' + r.status);
      const j = await r.json();
      return (j && j.features || []).map(f => ({ label: (f.properties && f.properties.label) || '', value: (f.properties && f.properties.id) || '', raw: f })).filter(o => o.label && o.value);
    }
    let addrDeb = null;
    function onAddr(query) {
      if (!st.modal) return; st.modal.addressQuery = query; st.modal.data.ADRESSE = query; st.modal.data.adresse_source = 'manual'; st.modal.data.adresse_status = null;
      if (!query || query.length < 4) { st.modal.addressSuggestions = []; render(); return; }
      if (addrDeb) clearTimeout(addrDeb);
      addrDeb = setTimeout(async () => { st.modal.addressLoading = true; render(); try { st.modal.addressSuggestions = await inseeAddr(query); } catch (e) { st.modal.addressSuggestions = []; } st.modal.addressLoading = false; render(); }, 350);
    }
    function applyAddr(s) {
      if (!st.modal) return; const p = (s.raw && s.raw.properties) || {}; const c = (s.raw && s.raw.geometry && s.raw.geometry.coordinates) || [];
      Object.assign(st.modal.data, { ADRESSE: p.name || p.label || '', code_postal: p.postcode || '', ville: p.city || '', code_insee: p.citycode || '', lat: c[1] != null ? Number(c[1]) : null, lon: c[0] != null ? Number(c[0]) : null, adresse_label: p.label || '', adresse_source: 'ban', adresse_status: 'verified', adresse_score: p.score != null ? Number(p.score) : null, adresse_ban: s.raw || null });
      st.modal.addressSuggestions = []; st.modal.addressQuery = p.label || ''; render();
    }
    async function inseeSiret(query) {
      const qs = new URLSearchParams({ query, limit: '8', activeOnly: 'false' }).toString();
      const { data, error } = await supa().functions.invoke(EDGE_FN_SIRENE_SEARCH + '?' + qs, { method: 'GET' });
      if (error) throw error; return (data && data.items) || [];
    }
    let siretDeb = null;
    function onSiret(query) {
      if (!st.modal) return; st.modal.siretQuery = query; const od = cd2(query);
      if (od === query.replace(/\s/g, '')) st.modal.data.SIRET = od;
      if (!query || query.length < 2) { st.modal.siretSuggestions = []; render(); return; }
      if (siretDeb) clearTimeout(siretDeb);
      siretDeb = setTimeout(async () => { st.modal.siretLoading = true; render(); try { st.modal.siretSuggestions = await inseeSiret(query); } catch (e) { st.modal.siretSuggestions = []; st.modal.error = e.message || String(e); } st.modal.siretLoading = false; render(); }, 400);
    }
    function applySiret(item) {
      if (!st.modal) return; const t = typesS.find(x => String(x.code) === String(item.categorie_juridique_code));
      Object.assign(st.modal.data, { SIRET: cd2(item.siret), NOM: item.raison_sociale || st.modal.data.NOM, CIVILITE: t ? t.libelle_court : st.modal.data.CIVILITE, ADRESSE: item.adresse_ligne1 || '', code_postal: item.code_postal || '', ville: item.commune || '', adresse_label: item.adresse || '', adresse_source: 'sirene', adresse_status: 'verified', adresse_score: null, code_insee: '', lat: null, lon: null });
      st.modal.siretSuggestions = []; st.modal.siretQuery = cd2(item.siret); st.modal.addressQuery = item.adresse || item.adresse_ligne1 || ''; render();
    }

    const I_P = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
    const I_S = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21V12h6v9"/></svg>';
    const I_MOB = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/></svg>';
    const I_FIXE = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
    const I_PLUS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
    const I_MINUS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
    const I_REFRESH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
    const I_SEARCH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
    const I_CLOSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    const I_WARN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17"/></svg>';
    const I_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

    const STYLE = '<style>'
      + '#agenda-clp-ov{position:fixed;inset:0;background:rgba(31,74,133,.5);z-index:3200;display:flex;align-items:center;justify-content:center;padding:20px;font-family:"Nunito Sans",system-ui,sans-serif}'
      + '#agenda-clp-ov *{box-sizing:border-box}'
      + '#agenda-clp-ov .clp-modal{background:#fff;border-radius:16px;width:100%;max-width:920px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 80px rgba(31,74,133,.35)}'
      + '#agenda-clp-ov .clp-hd{padding:16px 22px;border-bottom:1px solid #eef2f8;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}'
      + '#agenda-clp-ov .clp-hd-title{font-size:16px;font-weight:800;color:#1F4A85}'
      + '#agenda-clp-ov .clp-hd-x{width:30px;height:30px;border:1.5px solid #e2eaf5;background:#fff;border-radius:8px;color:#7a98c5;font-size:18px;cursor:pointer;line-height:1}'
      + '#agenda-clp-ov .clp-hd-x:hover{background:#f2f6fc}'
      + '#agenda-clp-ov .clp-root{position:relative;flex:1;display:flex;flex-direction:column;min-height:0;color:#2a5ea9}'
      + '#agenda-clp-ov .clp-body{overflow-y:auto;flex:1;padding:18px 22px}'
      + '#agenda-clp-ov .clp-selected{background:#eef9f5;border:1px solid #b6e3d6;border-radius:10px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:flex-start;gap:12px}'
      + '#agenda-clp-ov .clp-selected.is-empty{background:#fdf2dd;border-color:#f5c785}'
      + '#agenda-clp-ov .clp-selicon{flex:0 0 auto;width:34px;height:34px;border-radius:50%;background:#53bda7;color:#fff;display:flex;align-items:center;justify-content:center}'
      + '#agenda-clp-ov .clp-selected.is-empty .clp-selicon{background:#fac055}'
      + '#agenda-clp-ov .clp-sellabel{font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#3d8a76;font-weight:700;margin-bottom:3px}'
      + '#agenda-clp-ov .clp-selected.is-empty .clp-sellabel{color:#a65f00}'
      + '#agenda-clp-ov .clp-selname{font-size:15px;font-weight:700;color:#2a5ea9}'
      + '#agenda-clp-ov .clp-seldetail{font-size:12px;color:#5a7ba8;margin-top:3px}'
      + '#agenda-clp-ov .clp-tabs{display:flex;border-bottom:1px solid #e3edf9;margin-bottom:16px}'
      + '#agenda-clp-ov .clp-tab{display:inline-flex;align-items:center;gap:8px;padding:11px 16px;cursor:pointer;color:#acc5e4;font-size:13px;font-weight:600;border:none;background:none;border-bottom:2px solid transparent;margin-bottom:-1px;font-family:inherit}'
      + '#agenda-clp-ov .clp-tab.is-active{color:#53bda7;border-bottom-color:#53bda7}'
      + '#agenda-clp-ov .clp-form{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 14px;margin-bottom:12px}'
      + '#agenda-clp-ov .clp-field{display:flex;flex-direction:column}'
      + '#agenda-clp-ov .clp-label{font-size:11px;color:#7a98c5;margin-bottom:4px;text-transform:uppercase;letter-spacing:.4px;font-weight:600}'
      + '#agenda-clp-ov .clp-input{border:1.5px solid #e2eaf5;border-radius:8px;padding:9px 11px;font-size:13px;color:#1F4A85;outline:none;background:#fff;font-family:inherit;width:100%;transition:border-color .12s}'
      + '#agenda-clp-ov .clp-input:focus{border-color:#2a5ea9}'
      + '#agenda-clp-ov .clp-input::placeholder{color:#acc5e4}'
      + '#agenda-clp-ov select.clp-input{cursor:pointer;appearance:none}'
      + '#agenda-clp-ov .clp-toolbar{display:flex;align-items:center;justify-content:space-between;margin:12px 0;gap:12px;flex-wrap:wrap}'
      + '#agenda-clp-ov .clp-tsec{display:flex;align-items:center;flex:1}'
      + '#agenda-clp-ov .clp-tsec.right{justify-content:flex-end}'
      + '#agenda-clp-ov .clp-more{display:inline-flex;align-items:center;gap:6px;color:#2a5ea9;font-size:13px;cursor:pointer;background:none;border:none;font-family:inherit;font-weight:600}'
      + '#agenda-clp-ov .clp-pager{display:inline-flex;align-items:center;gap:2px}'
      + '#agenda-clp-ov .clp-pager-item{padding:6px 10px;cursor:pointer;color:#2a5ea9;font-size:13px;border-radius:6px;background:none;border:none;font-family:inherit;min-width:28px;font-weight:600}'
      + '#agenda-clp-ov .clp-pager-item.is-active{background:#eef4fc}'
      + '#agenda-clp-ov .clp-pager-item:disabled{color:#cad6e5;cursor:not-allowed}'
      + '#agenda-clp-ov .clp-btns{display:flex;gap:8px}'
      + '#agenda-clp-ov .clp-btn{padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:1.5px solid transparent;outline:none;font-family:inherit;display:inline-flex;align-items:center;gap:6px}'
      + '#agenda-clp-ov .clp-btn-primary{background:#2a5ea9;color:#fff;border-color:#2a5ea9}'
      + '#agenda-clp-ov .clp-btn-primary:hover{background:#1F4A85}'
      + '#agenda-clp-ov .clp-btn-ghost{background:transparent;color:#2a5ea9;border-color:#e2eaf5}'
      + '#agenda-clp-ov .clp-btn-ghost:hover{border-color:#2a5ea9}'
      + '#agenda-clp-ov .clp-table{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}'
      + '#agenda-clp-ov .clp-table thead th{background:#f4f7fc;padding:9px 12px;text-align:left;color:#2a5ea9;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.04em}'
      + '#agenda-clp-ov .clp-table tbody tr{border-bottom:1px solid #f0f4fa;cursor:pointer;transition:background .1s}'
      + '#agenda-clp-ov .clp-table tbody tr:hover{background:#f7fafd}'
      + '#agenda-clp-ov .clp-table tbody tr.is-picked{background:#eef9f5}'
      + '#agenda-clp-ov .clp-table tbody tr.is-picked td:first-child{box-shadow:inset 3px 0 0 #53bda7}'
      + '#agenda-clp-ov .clp-table td{padding:12px;color:#2a5ea9;vertical-align:middle}'
      + '#agenda-clp-ov .clp-tel-row{display:flex;align-items:center;gap:5px;font-size:12px}'
      + '#agenda-clp-ov .clp-pick-dot{width:22px;height:22px;border-radius:50%;border:2px solid #e2eaf5;display:inline-flex;align-items:center;justify-content:center;color:transparent}'
      + '#agenda-clp-ov tr.is-picked .clp-pick-dot{border-color:#53bda7;background:#53bda7;color:#fff}'
      + '#agenda-clp-ov .clp-empty{padding:36px;text-align:center;color:#9bb3d1;font-size:13px;font-weight:600}'
      + '#agenda-clp-ov .clp-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 22px;border-top:1px solid #eef2f8;flex-shrink:0}'
      + '#agenda-clp-ov .clp-foot-info{font-size:13px;color:#1F4A85;font-weight:600}'
      + '#agenda-clp-ov .clp-foot-info.muted{color:#9bb3d1}'
      + '#agenda-clp-ov .clp-act{padding:10px 22px;border-radius:999px;font-size:14px;font-weight:700;cursor:pointer;border:1.5px solid #53bda7;background:#53bda7;color:#fff;outline:none;font-family:inherit;display:inline-flex;align-items:center;gap:8px;transition:all .12s}'
      + '#agenda-clp-ov .clp-act:hover:not(:disabled){background:#46a892;border-color:#46a892}'
      + '#agenda-clp-ov .clp-act:disabled{opacity:.4;cursor:not-allowed}'
      + '#agenda-clp-ov .clp-spinner{display:inline-block;width:13px;height:13px;border:2px solid #e3edf9;border-top-color:#53bda7;border-radius:50%;animation:clp-spin .8s linear infinite}'
      + '@keyframes clp-spin{to{transform:rotate(360deg)}}'
      + '#agenda-clp-ov .clp-modal-overlay{position:absolute;inset:0;background:rgba(42,94,169,.35);z-index:10;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto}'
      + '#agenda-clp-ov .clp-modal2{background:#fff;border-radius:14px;width:100%;max-width:700px;box-shadow:0 20px 60px rgba(0,0,0,.18);display:flex;flex-direction:column;max-height:calc(100% - 32px)}'
      + '#agenda-clp-ov .clp-modal2-header{padding:14px 20px;border-bottom:1px solid #eef2f8;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}'
      + '#agenda-clp-ov .clp-modal2-title{font-size:16px;font-weight:800;margin:0;color:#1F4A85}'
      + '#agenda-clp-ov .clp-modal2-close{background:none;border:none;cursor:pointer;color:#9bb3d1;padding:4px;display:flex}'
      + '#agenda-clp-ov .clp-modal2-body{padding:16px 20px;overflow-y:auto;flex:1}'
      + '#agenda-clp-ov .clp-section{margin-bottom:18px}'
      + '#agenda-clp-ov .clp-section-title{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9bb3d1;margin:0 0 10px;font-weight:800}'
      + '#agenda-clp-ov .clp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 14px}'
      + '#agenda-clp-ov .clp-grid .full{grid-column:1 / -1}'
      + '#agenda-clp-ov .clp-grid .two{grid-column:span 2}'
      + '#agenda-clp-ov .clp-modal2-footer{padding:12px 20px;border-top:1px solid #eef2f8;display:flex;justify-content:flex-end;gap:8px;flex-shrink:0}'
      + '#agenda-clp-ov .clp-modal2-error{color:#e24b4a;font-size:13px;padding:10px 13px;background:#fcebeb;border-radius:8px;margin-bottom:12px;border:1px solid #f5a5a5;font-weight:600}'
      + '#agenda-clp-ov .clp-dup{background:#fff8e8;border:1px solid #fac055;border-radius:10px;padding:14px;margin-bottom:14px;display:flex;flex-direction:column;gap:10px}'
      + '#agenda-clp-ov .clp-dup-head{display:flex;gap:10px;align-items:flex-start;color:#854f0b;font-weight:700}'
      + '#agenda-clp-ov .clp-dup-actions{display:flex;gap:8px;justify-content:flex-end}'
      + '#agenda-clp-ov .clp-checkbox{display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:8px 0}'
      + '#agenda-clp-ov .clp-ac{position:relative}'
      + '#agenda-clp-ov .clp-suggestions{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1.5px solid #e2eaf5;border-radius:8px;box-shadow:0 6px 20px rgba(42,94,169,.12);z-index:20;max-height:240px;overflow-y:auto}'
      + '#agenda-clp-ov .clp-sg{padding:9px 12px;cursor:pointer;font-size:13px;border-bottom:.5px solid #f0f4fa}'
      + '#agenda-clp-ov .clp-sg:hover{background:#f2f6fc}'
      + '#agenda-clp-ov .clp-status{font-size:11px;color:#53bda7;margin-top:4px;display:inline-flex;align-items:center;gap:4px}'
      + '@media(max-width:640px){#agenda-clp-ov .clp-form{grid-template-columns:1fr 1fr}#agenda-clp-ov .clp-grid{grid-template-columns:1fr 1fr}#agenda-clp-ov .clp-table thead{display:none}#agenda-clp-ov .clp-table tbody tr{display:block;padding:10px 12px}#agenda-clp-ov .clp-table td{display:inline;padding:0 4px 0 0;font-size:12px}}'
      + '</style>';

    function fieldHtml(label, field, type, ph) {
      const val = st.filters[st.activeTab][field] || ''; const isDate = type === 'date';
      return '<div class="clp-field">' + (isDate ? '<label class="clp-label">' + ce(label) + '</label>' : '') + '<input class="clp-input" type="' + (type || 'text') + '" data-clp-field="' + ce(field) + '" value="' + ce(val) + '" placeholder="' + ce(ph || label) + '" /></div>';
    }
    function renderSelected() {
      const c = st.selectedClient;
      if (!c) return '<div class="clp-selected is-empty"><div class="clp-selicon">' + I_WARN + '</div><div><div class="clp-sellabel">Aucun client sélectionné</div><div class="clp-seldetail">Recherchez ou créez un client ci-dessous.</div></div></div>';
      const soc = c.idmultivu === 1 || c.idmultivu === '1';
      const detail = [c.IDVu ? 'ID ' + ce(c.IDVu) : '', c.EMAIL ? ce(c.EMAIL) : '', c.TEl_MOB ? ce(c.TEl_MOB) : '', [c.code_postal, c.ville].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
      return '<div class="clp-selected"><div class="clp-selicon">' + (soc ? I_S : I_P) + '</div><div><div class="clp-sellabel">Client sélectionné</div><div class="clp-selname">' + ce(cname(c)) + '</div><div class="clp-seldetail">' + detail + '</div></div></div>';
    }
    function renderForm() {
      const tab = st.activeTab; let h = '<div class="clp-form">';
      if (tab === 'particulier') {
        h += fieldHtml('Nom', 'NOM') + fieldHtml('Prénom', 'PRENOM') + fieldHtml('Email', 'EMAIL') + fieldHtml('ID Client', 'IDVu') + '<div></div><div></div>';
        if (st.showMore) h += fieldHtml('Téléphone', 'tel') + fieldHtml('Ville', 'ville') + fieldHtml('Code postal', 'cp') + fieldHtml('Né(e) après le', 'birthMin', 'date') + fieldHtml('Né(e) avant le', 'birthMax', 'date') + fieldHtml('CSP', 'CSP') + fieldHtml('Marque véhicule', 'marque');
      } else {
        h += fieldHtml('SIRET', 'SIRET') + fieldHtml('Raison sociale', 'NOM') + fieldHtml('Email', 'EMAIL') + fieldHtml('ID Client', 'IDVu') + '<div></div><div></div>';
      }
      return h + '</div>';
    }
    function renderToolbar() {
      const total = Math.max(1, Math.ceil(st.totalCount / PAGE_SIZE));
      let h = '<div class="clp-toolbar"><div class="clp-tsec">';
      if (st.activeTab === 'particulier') h += '<button class="clp-more" data-clp-action="toggle-more">' + (st.showMore ? I_MINUS : I_PLUS) + '<span>' + (st.showMore ? 'Moins de critères' : 'Plus de critères') + '</span></button>';
      h += '</div><div class="clp-tsec" style="justify-content:center">';
      if (st.searched && st.totalCount > 0) {
        h += '<div class="clp-pager">';
        h += '<button class="clp-pager-item" data-clp-action="prev-page"' + (st.page <= 1 ? ' disabled' : '') + '>‹</button>';
        for (const it of pagerItems(st.page, total)) { if (it.ellipsis) h += '<span style="padding:0 4px;color:#acc5e4">…</span>'; else h += '<button class="clp-pager-item' + (it.page === st.page ? ' is-active' : '') + '" data-clp-action="page" data-page="' + it.page + '">' + it.page + '</button>'; }
        h += '<button class="clp-pager-item" data-clp-action="next-page"' + (st.page >= total ? ' disabled' : '') + '>›</button></div>';
      }
      h += '</div><div class="clp-tsec right"><div class="clp-btns">';
      h += '<button class="clp-btn clp-btn-ghost" data-clp-action="cancel">' + I_REFRESH + '<span>Annuler</span></button>';
      h += '<button class="clp-btn clp-btn-primary" data-clp-action="search">' + I_SEARCH + '<span>Rechercher</span></button>';
      return h + '</div></div></div>';
    }
    function renderTable() {
      if (st.loading) return '<div class="clp-empty">Chargement…</div>';
      if (st.error) return '<div class="clp-empty">Erreur : ' + ce(st.error) + '</div>';
      if (!st.searched) return '';
      if (!st.results.length) { const label = st.activeTab === 'societe' ? 'une société' : 'un particulier'; return '<div class="clp-empty">Aucun résultat.<br><br><button class="clp-btn clp-btn-primary" data-clp-action="create">' + I_PLUS + '<span>Créer ' + label + '</span></button></div>'; }
      const isSoc = st.activeTab === 'societe'; const selId = st.selectedClient ? String(st.selectedClient.IDVu) : null;
      let h = '<table class="clp-table"><thead><tr><th>ID</th><th>Nom</th><th>Adresse</th><th>Email</th><th>Tél.</th><th></th></tr></thead><tbody>';
      for (const r of st.results) {
        const fullName = isSoc ? [r.CIVILITE, r.NOM].filter(Boolean).join(' ') : [r.CIVILITE, r.NOM, r.PRENOM].filter(Boolean).join(' ');
        const cpVille = [r.code_postal, r.ville].filter(Boolean).join(' ') || r.CP_VILLE || '';
        const adr = [r.ADRESSE, cpVille, isSoc && r.SIRET ? String(r.SIRET) : ''].filter(Boolean).map(ce).join('<br>');
        let tel = ''; if (r.TEl_MOB) tel += '<div class="clp-tel-row">' + I_MOB + ' ' + ce(r.TEl_MOB) + '</div>'; if (r.TEL_FIXE) tel += '<div class="clp-tel-row">' + I_FIXE + ' ' + ce(r.TEL_FIXE) + '</div>';
        const picked = selId && String(r.IDVu) === selId;
        h += '<tr class="' + (picked ? 'is-picked' : '') + '" data-clp-action="pick-row" data-idvu="' + ce(r.IDVu) + '"><td>' + ce(r.IDVu) + '</td><td>' + ce(fullName) + '</td><td>' + adr + '</td><td>' + ce(r.EMAIL || '') + '</td><td>' + tel + '</td><td><span class="clp-pick-dot">' + I_CHECK + '</span></td></tr>';
      }
      return h + '</tbody></table>';
    }
    function renderFooter() {
      const dis = !st.selectedClient;
      let h = '<div class="clp-footer">';
      h += st.selectedClient ? '<div class="clp-foot-info">Client : <strong>' + ce(cname(st.selectedClient)) + '</strong></div>' : '<div class="clp-foot-info muted">Aucun client sélectionné</div>';
      h += '<button class="clp-act" data-clp-action="confirm"' + (dis ? ' disabled' : '') + '>' + I_CHECK + '<span>Sélectionner ce client</span></button>';
      return h + '</div>';
    }
    function mfield(label, field, type, opts) {
      opts = opts || {}; const val = st.modal.data[field]; const v = val == null ? '' : val; const cls = opts.gridClass ? 'clp-field ' + opts.gridClass : 'clp-field'; const req = opts.required ? ' <span style="color:#e24b4a">*</span>' : '';
      let inp;
      if (type === 'textarea') inp = '<textarea class="clp-input" data-clp-mfield="' + ce(field) + '" rows="3">' + ce(v) + '</textarea>';
      else if (type === 'select') { const o2 = (opts.options || []).map(o => '<option value="' + ce(o.value) + '"' + (String(o.value) === String(v) ? ' selected' : '') + '>' + ce(o.label) + '</option>').join(''); inp = '<select class="clp-input" data-clp-mfield="' + ce(field) + '"><option value="">—</option>' + o2 + '</select>'; }
      else if (type === 'checkbox') return '<div class="' + cls + '"><label class="clp-checkbox"><input type="checkbox" data-clp-mfield="' + ce(field) + '"' + (v ? ' checked' : '') + '/> <span>' + ce(label) + '</span></label></div>';
      else inp = '<input class="clp-input" type="' + (type || 'text') + '" data-clp-mfield="' + ce(field) + '" value="' + ce(v) + '" placeholder="' + ce(opts.placeholder || '') + '"/>';
      return '<div class="' + cls + '"><label class="clp-label">' + ce(label) + req + '</label>' + inp + '</div>';
    }
    function renderModal() {
      if (!st.modal) return ''; const m = st.modal; const isSoc = m.isSoc; let body = '';
      if (m.duplicate) { const c = m.duplicate.client; body += '<div class="clp-dup"><div class="clp-dup-head">' + I_WARN + '<div>' + ce(m.duplicate.label) + ' est déjà utilisé(e) par :<div style="font-size:13px;line-height:1.5"><strong>' + ce(cname(c)) + '</strong> — ID ' + ce(c.IDVu) + '</div></div></div><div class="clp-dup-actions"><button class="clp-btn clp-btn-ghost" data-clp-action="dismiss-duplicate">Modifier</button><button class="clp-btn clp-btn-primary" data-clp-action="view-duplicate">Choisir ce client</button></div></div>'; }
      if (m.error && !m.duplicate) body += '<div class="clp-modal2-error">' + ce(m.error) + '</div>';
      body += '<div class="clp-section"><div class="clp-section-title">Identité</div><div class="clp-grid">';
      if (isSoc) {
        body += mfield('Type', 'CIVILITE', 'select', { options: typesS.map(t => ({ value: t.libelle_court, label: t.libelle_court + ' — ' + t.libelle })) });
        body += '<div class="clp-field two"><label class="clp-label">SIRET / Raison sociale <span style="color:#e24b4a">*</span></label><div class="clp-ac"><input class="clp-input" type="text" data-clp-mfield="__siretQuery" value="' + ce(m.siretQuery || '') + '" placeholder="Rechercher SIRENE"/>' + (m.siretLoading ? '<div class="clp-status"><span class="clp-spinner"></span> Recherche SIRENE…</div>' : '') + (m.siretSuggestions && m.siretSuggestions.length ? '<div class="clp-suggestions">' + m.siretSuggestions.map((s, i) => '<div class="clp-sg" data-clp-action="pick-siret" data-idx="' + i + '"><strong>' + ce(s.raison_sociale || '') + '</strong><div style="font-size:11px;color:#9bb3d1">' + ce(s.siret || '') + ' — ' + ce(s.commune || '') + '</div></div>').join('') + '</div>' : '') + '</div></div>';
        body += mfield('Raison sociale', 'NOM', 'text', { gridClass: 'full', required: true });
      } else {
        body += mfield('Civilité', 'CIVILITE', 'select', { options: civilitesP.map(c => ({ value: c.libelle, label: c.libelle })), required: true });
        body += mfield('Nom', 'NOM', 'text', { required: true });
        body += mfield('Prénom', 'PRENOM', 'text', { required: true });
        body += mfield('Date de naissance', 'BIRTHDAY', 'date');
      }
      body += '</div></div><div class="clp-section"><div class="clp-section-title">Contact</div><div class="clp-grid">';
      body += mfield('Téléphone portable', 'TEl_MOB', 'text', { required: !isSoc });
      body += mfield('Téléphone fixe', 'TEL_FIXE');
      body += mfield('Email', 'EMAIL', 'text', { required: !isSoc });
      body += '</div></div><div class="clp-section"><div class="clp-section-title">Adresse</div><div class="clp-grid">';
      const verified = m.data.adresse_status === 'verified';
      body += '<div class="clp-field full"><label class="clp-label">Adresse</label><div class="clp-ac"><input class="clp-input" type="text" data-clp-mfield="__addressQuery" value="' + ce(m.addressQuery || m.data.ADRESSE || '') + '" placeholder="Tapez une adresse"/>' + (m.addressLoading ? '<div class="clp-status"><span class="clp-spinner"></span> Recherche…</div>' : (verified ? '<div class="clp-status">✓ Vérifiée (' + ce(m.data.adresse_source || '') + ')</div>' : '')) + (m.addressSuggestions && m.addressSuggestions.length ? '<div class="clp-suggestions">' + m.addressSuggestions.map((s, i) => '<div class="clp-sg" data-clp-action="pick-address" data-idx="' + i + '">' + ce(s.label || '') + '</div>').join('') + '</div>' : '') + '</div></div>';
      body += mfield('Code postal', 'code_postal');
      body += mfield('Ville', 'ville', 'text', { gridClass: 'two' });
      body += '</div></div>';
      if (!isSoc) {
        body += '<div class="clp-section"><div class="clp-section-title">Préférences</div><div class="clp-grid">' + mfield('Stop com', 'STOP_COM', 'checkbox') + mfield('NPAI', 'NPAI', 'select', { options: npaiOptions.map(o => ({ value: o, label: o })) }) + '</div></div>';
        body += '<div class="clp-section"><div class="clp-section-title">Commentaires</div><div class="clp-grid">' + mfield('Commentaires', 'COMMENTAIRE', 'textarea', { gridClass: 'full' }) + '</div></div>';
      }
      return '<div class="clp-modal-overlay" data-clp-action="close-modal-bg"><div class="clp-modal2"><div class="clp-modal2-header"><h2 class="clp-modal2-title">' + (isSoc ? 'Créer une société' : 'Créer un particulier') + '</h2><button class="clp-modal2-close" data-clp-action="close-modal">' + I_CLOSE + '</button></div><div class="clp-modal2-body">' + body + '</div><div class="clp-modal2-footer"><button class="clp-btn clp-btn-ghost" data-clp-action="close-modal">Annuler</button><button class="clp-btn clp-btn-primary" data-clp-action="save-modal"' + (m.saving ? ' disabled' : '') + '>' + (m.saving ? '<span class="clp-spinner"></span>' : I_PLUS) + '<span>' + (m.saving ? 'Enregistrement…' : 'Enregistrer') + '</span></button></div></div></div>';
    }

    function render() {
      const root = d.getElementById('agenda-clp-root'); if (!root) return;
      const active = d.activeElement;
      const af = active && active.getAttribute ? (active.getAttribute('data-clp-field') || active.getAttribute('data-clp-mfield')) : null;
      const ak = active && active.getAttribute && active.getAttribute('data-clp-mfield') ? 'm' : 'f';
      const ac = af && typeof active.selectionStart === 'number' ? active.selectionStart : null;
      root.innerHTML = STYLE + '<div class="clp-body">' + renderSelected() + '<div class="clp-tabs"><button class="clp-tab' + (st.activeTab === 'particulier' ? ' is-active' : '') + '" data-clp-action="tab" data-tab="particulier">' + I_P + '<span>Particulier</span></button><button class="clp-tab' + (st.activeTab === 'societe' ? ' is-active' : '') + '" data-clp-action="tab" data-tab="societe">' + I_S + '<span>Société</span></button></div>' + renderForm() + renderToolbar() + renderTable() + '</div>' + renderFooter() + renderModal();
      bindEvents();
      if (af) { const sel = ak === 'm' ? '[data-clp-mfield="' + af + '"]' : 'input[data-clp-field="' + af + '"]'; const next = root.querySelector(sel); if (next) { next.focus(); if (ac != null && next.setSelectionRange) try { next.setSelectionRange(ac, ac); } catch (e) {} } }
    }
    function bindEvents() {
      const root = d.getElementById('agenda-clp-root'); if (!root) return;
      root.querySelectorAll('[data-clp-action="tab"]').forEach(el => el.addEventListener('click', () => changeTab(el.getAttribute('data-tab'))));
      root.querySelectorAll('input[data-clp-field]').forEach(el => { el.addEventListener('input', () => { st.filters[st.activeTab][el.getAttribute('data-clp-field')] = el.value; }); el.addEventListener('keydown', e => { if (e.key === 'Enter') { st.page = 1; runSearch(); } }); });
      root.querySelectorAll('[data-clp-action="toggle-more"]').forEach(el => el.addEventListener('click', () => { st.showMore = !st.showMore; render(); }));
      root.querySelectorAll('[data-clp-action="cancel"]').forEach(el => el.addEventListener('click', clearFilters));
      root.querySelectorAll('[data-clp-action="search"]').forEach(el => el.addEventListener('click', () => { st.page = 1; runSearch(); }));
      root.querySelectorAll('[data-clp-action="prev-page"]').forEach(el => el.addEventListener('click', () => changePage(st.page - 1)));
      root.querySelectorAll('[data-clp-action="next-page"]').forEach(el => el.addEventListener('click', () => changePage(st.page + 1)));
      root.querySelectorAll('[data-clp-action="page"]').forEach(el => el.addEventListener('click', () => changePage(Number(el.getAttribute('data-page')))));
      root.querySelectorAll('[data-clp-action="create"]').forEach(el => el.addEventListener('click', openCreateModal));
      root.querySelectorAll('tr[data-clp-action="pick-row"]').forEach(el => el.addEventListener('click', () => { const r = st.results.find(r => String(r.IDVu) === el.getAttribute('data-idvu')); if (r) pickRow(r); }));
      root.querySelectorAll('[data-clp-action="confirm"]').forEach(el => el.addEventListener('click', () => { if (!st.selectedClient) return; const cli = st.selectedClient; closePicker(); if (typeof onPick === 'function') onPick(cli); }));
      root.querySelectorAll('[data-clp-action="close-modal"]').forEach(el => el.addEventListener('click', closeModal));
      root.querySelectorAll('[data-clp-action="close-modal-bg"]').forEach(el => el.addEventListener('click', e => { if (e.target === el) closeModal(); }));
      root.querySelectorAll('[data-clp-action="save-modal"]').forEach(el => el.addEventListener('click', saveCreation));
      root.querySelectorAll('[data-clp-action="dismiss-duplicate"]').forEach(el => el.addEventListener('click', dismissDuplicate));
      root.querySelectorAll('[data-clp-action="view-duplicate"]').forEach(el => el.addEventListener('click', viewDuplicate));
      root.querySelectorAll('[data-clp-action="pick-address"]').forEach(el => el.addEventListener('click', () => { const i = Number(el.getAttribute('data-idx')); if (st.modal && st.modal.addressSuggestions[i]) applyAddr(st.modal.addressSuggestions[i]); }));
      root.querySelectorAll('[data-clp-action="pick-siret"]').forEach(el => el.addEventListener('click', () => { const i = Number(el.getAttribute('data-idx')); if (st.modal && st.modal.siretSuggestions[i]) applySiret(st.modal.siretSuggestions[i]); }));
      root.querySelectorAll('[data-clp-mfield]').forEach(el => {
        const field = el.getAttribute('data-clp-mfield');
        if (field === '__addressQuery') { el.addEventListener('input', () => onAddr(el.value)); return; }
        if (field === '__siretQuery') { el.addEventListener('input', () => onSiret(el.value)); return; }
        if (el.tagName === 'SELECT') el.addEventListener('change', () => updMField(field, el.value));
        else if (el.type === 'checkbox') el.addEventListener('change', () => updMField(field, el.checked));
        else el.addEventListener('input', () => updMField(field, el.value));
      });
    }
    function closePicker() { const o = d.getElementById('agenda-clp-ov'); if (o) o.remove(); }

    let ov = d.getElementById('agenda-clp-ov'); if (ov) ov.remove();
    ov = d.createElement('div'); ov.id = 'agenda-clp-ov';
    ov.innerHTML = '<div class="clp-modal"><div class="clp-hd"><span class="clp-hd-title">Sélectionner un client</span><button type="button" class="clp-hd-x" id="clp-close">' + I_CLOSE + '</button></div><div class="clp-root" id="agenda-clp-root"></div></div>';
    (d.body || d.documentElement).appendChild(ov);
    ov.addEventListener('mousedown', e => { if (e.target === ov && !st.modal) closePicker(); });
    d.getElementById('clp-close').addEventListener('click', closePicker);
    render();
  }
  function bilatVendeurs() { const r = dashRows(); return r ? uniqVendeurs(r).map(v => ({ id: v.id, nom: v.nom })).sort(sortNom) : []; }
  function bilatVendeurGroups() {
    const r = dashRows(); if (!r) return [];
    const vn = [], vo = [], vnvo = [], autre = [];
    for (const v of uniqVendeurs(r)) { const sgn = v.vnvo || ''; if (sgn.includes('VN') && sgn.includes('VO')) vnvo.push(v); else if (sgn.includes('VN')) vn.push(v); else if (sgn.includes('VO')) vo.push(v); else autre.push(v); }
    [vn, vo, vnvo, autre].forEach(a => a.sort(sortNom));
    const g = [];
    if (vn.length) g.push({ label: 'VN', items: vn });
    if (vo.length) g.push({ label: 'VO', items: vo });
    if (vnvo.length) g.push({ label: 'VN / VO', items: vnvo });
    if (autre.length) g.push({ label: 'Autres', items: autre });
    return g;
  }
  const pad2 = (n) => String(n).padStart(2, '0');
  function endStrFrom(date, time, mins) { const [Y, Mo, D] = date.split('-').map(Number); const [h, mi] = time.split(':').map(Number); const dt = new Date(Y, Mo - 1, D, h, mi); dt.setMinutes(dt.getMinutes() + Number(mins)); return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate()) + ' ' + pad2(dt.getHours()) + ':' + pad2(dt.getMinutes()) + ':00'; }
  function fmtDuree(min) { min = Number(min) || 0; const h = Math.floor(min / 60), m = min % 60; if (h === 0) return m + ' min'; if (m === 0) return h + 'h'; return h + 'h ' + m + ' min'; }

  let cs = null; // \u00e9tat cr\u00e9ation / \u00e9dition
  function closeCreate() { const o = frontDoc().getElementById('agenda-ov'); if (o) o.remove(); cs = null; try { calendar && calendar.unselect(); } catch (e) {} }
  function openCreate(sel) {
    if (isPastSlot(sel.startStr || '')) { try { calendar && calendar.unselect(); } catch (e) {} hideTip(); showAgError('Impossible de placer un \u00e9v\u00e9nement dans le pass\u00e9.', 'Choisis un cr\u00e9neau \u00e0 partir de maintenant.'); return; }
    const startStr = sel.startStr || '';
    const date = startStr.slice(0, 10) || '';
    const time = (startStr.slice(11, 16)) || '09:00';
    let dur = 30; if (sel.end && sel.start) { const d = Math.round((sel.end - sel.start) / 60000); if (d >= 15) dur = d; }
    cs = { editing: false, editId: null, idRpv: null, mode: 'rdv', date, time, dur, idClient: null, clientLabel: '', client: null, origine: ORIGINES[0], physique: true, rdvType: null, creneauType: null, bilatUser: null, comment: '', saving: false, err: '' };
    const navCli = wwVal(CFG.selectedClientVar);
    if (navCli && typeof navCli === 'object' && navCli.IDVu != null) { cs.idClient = Number(navCli.IDVu); cs.clientLabel = clientLabel(navCli); cs.client = navCli; }
    loadRdvTypes().then(renderCreate);
    renderCreate();
  }
  // Ouverture en \u00c9DITION depuis un clic sur un event existant.
  function openEdit(ev) {
    const p = ev.extendedProps || {};
    const st = String(p.source_type || '');
    if (st === 'bilat' && !p.can_edit) return;            // bilat\u00e9rale : lecture seule c\u00f4t\u00e9 vendeur
    if (isPastSlot(ev.startStr || '') || isPastSlot(p.event_start_time || '')) return; // pass\u00e9 : lecture seule
    if (st !== 'rdv' && st !== 'bilat') return;            // rpv : non \u00e9ditable ici
    const date = (ev.startStr || '').slice(0, 10) || '';
    const time = (ev.startStr || '').slice(11, 16) || '09:00';
    let dur = 30; if (ev.end && ev.start) { const d = Math.round((ev.end - ev.start) / 60000); if (d >= 15) dur = d; }
    const isCreneau = st === 'rdv' && !(Number(p.id_client) > 0);
    cs = {
      editing: true, editId: p.origin_id, idRpv: (p.id_rpv != null ? Number(p.id_rpv) : null),
      mode: st === 'bilat' ? 'bilat' : (isCreneau ? 'creneau' : 'rdv'),
      date, time, dur,
      idClient: (p.id_client != null ? Number(p.id_client) : null),
      clientLabel: [p.civilite, p.nom, p.prenom].filter(Boolean).join(' ').trim(),
      client: null, origine: ORIGINES[0], physique: (Number(p.id_rdv_type) === 5),
      rdvType: (p.id_rdv_type != null ? Number(p.id_rdv_type) : null),
      creneauType: (p.id_rdv_type != null ? Number(p.id_rdv_type) : null),
      bilatUser: (st === 'bilat' && p.id_user != null ? Number(p.id_user) : null),
      comment: (st === 'bilat' ? '' : (p.description || '')), saving: false, err: ''
    };
    loadRdvTypes().then(renderCreate);
    renderCreate();
  }

  const TITLES = { rdv: 'Nouveau RDV Client', creneau: 'Nouveau Cr\u00e9neau', bilat: 'Nouvelle Bilat\u00e9rale' };
  const TITLES_EDIT = { rdv: 'Modifier le RDV', creneau: 'Modifier le cr\u00e9neau', bilat: 'Modifier la bilat\u00e9rale' };
  function popTitle() { return (cs.editing ? TITLES_EDIT : TITLES)[cs.mode]; }
  function bodyHtml() {
    const ed = cs.editing;
    const dateRow = '<div class="agm-row">'
      + '<input type="date" class="agm-inp" id="agm-date" min="' + esc(agToday()) + '" value="' + esc(cs.date) + '" style="flex:1;min-width:130px">'
      + '<input type="time" class="agm-inp" id="agm-time" value="' + esc(cs.time) + '" step="900" style="width:104px">'
      + '<select class="agm-sel" id="agm-dur">' + DURATIONS.map(d => '<option value="' + d + '"' + (d === cs.dur ? ' selected' : '') + '>' + d + ' min</option>').join('') + '</select>'
      + '</div>';
    let mid = '';
    if (cs.mode === 'rdv') {
      if (!ed) mid += '<div><div class="agm-lbl">Origine</div><div class="agm-grid2">' + ORIGINES.map((o, i) => '<label class="agm-radio"><input type="radio" name="agm-ori" value="' + i + '"' + (o === cs.origine ? ' checked' : '') + '>' + esc(o) + '</label>').join('') + '</div></div>';
      if (ed) {
        mid += '<div><div class="agm-lbl">Client</div><div class="agm-cli-ro">' + esc(cs.clientLabel || ('Client ' + (cs.idClient != null ? cs.idClient : ''))) + '</div></div>';
      } else if (cs.idClient != null) {
        mid += '<div><div class="agm-lbl">Client</div><div class="agm-cli-sel" id="agm-cli-box"><span class="agm-cli-name">' + esc(cs.clientLabel || ('Client ' + cs.idClient)) + '</span><button type="button" class="agm-cli-change" id="agm-cli-change">Changer</button></div></div>';
      } else {
        mid += '<div><div class="agm-lbl">Client</div><button type="button" class="agm-cli-pick" id="agm-cli-pick"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><span>Rechercher / choisir un client</span></button></div>';
      }
      if (ed) {
        const types = rdvTypesCache || [];
        mid += '<div><div class="agm-lbl">Type de RDV</div><select class="agm-sel" id="agm-rtype" style="width:100%"><option value="">\u2014 choisir \u2014</option>' + types.map(t => '<option value="' + t.id + '"' + (String(t.id) === String(cs.rdvType) ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('') + '</select></div>';
      } else {
        mid += '<div class="agm-tg' + (cs.physique ? ' on' : '') + '" id="agm-phys"><span class="sw"></span><span>' + (cs.physique ? 'RDV Physique' : 'RDV T\u00e9l\u00e9phonique') + '</span></div>';
      }
    } else if (cs.mode === 'creneau') {
      const types = creneauTypes();
      mid += '<div><div class="agm-lbl">Type de cr\u00e9neau</div><select class="agm-sel" id="agm-ctype" style="width:100%"><option value="">\u2014 choisir \u2014</option>' + types.map(t => '<option value="' + t.id + '"' + (String(t.id) === String(cs.creneauType) ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('') + '</select></div>';
    } else {
      const grp = bilatVendeurGroups();
      mid += '<div><div class="agm-lbl">Vendeur \u00e9valu\u00e9</div><select class="agm-sel" id="agm-bvend" style="width:100%"><option value="">\u2014 choisir \u2014</option>' + grp.map(g => '<optgroup label="' + esc(g.label) + '">' + g.items.map(v => '<option value="' + v.id + '"' + (String(v.id) === String(cs.bilatUser) ? ' selected' : '') + '>' + esc(v.nom) + '</option>').join('') + '</optgroup>').join('') + '</select></div>';
    }
    const seg = ed ? '' : ('<div class="agm-seg">'
      + '<button data-mode="rdv" class="' + (cs.mode === 'rdv' ? 'on' : '') + '">RDV CLIENT</button>'
      + '<button data-mode="creneau" class="' + (cs.mode === 'creneau' ? 'on' : '') + '">CR\u00c9NEAU</button>'
      + '<button data-mode="bilat" class="' + (cs.mode === 'bilat' ? 'on' : '') + '">BILAT\u00c9RALE</button></div>');
    const comment = '<div><div class="agm-lbl">Commentaire</div><textarea class="agm-ta" id="agm-comment" placeholder="Commentaire\u2026">' + esc(cs.comment) + '</textarea></div>';
    return seg + dateRow + mid + (cs.mode !== 'bilat' ? comment : '') + (cs.err ? '<div class="agm-err">' + esc(cs.err) + '</div>' : '');
  }
  function renderCreate() {
    const d = frontDoc(); let ov = d.getElementById('agenda-ov');
    if (!ov) { ov = d.createElement('div'); ov.id = 'agenda-ov'; (d.body || d.documentElement).appendChild(ov); ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeCreate(); }); }
    const saveLbl = cs.saving ? 'Enregistrement\u2026' : (cs.editing ? '\ud83d\udcbe  Enregistrer les modifications' : '\ud83d\udcc5  Enregistrer dans l\'agenda');
    let foot;
    if (cs.editing && cs.confirmDel) {
      foot = '<div class="agm-confirm"><span class="agm-confirm-txt">Supprimer d\u00e9finitivement\u00a0?</span>'
        + '<button class="agm-cancel" id="agm-del-cancel"' + (cs.saving ? ' disabled' : '') + '>Annuler</button>'
        + '<button class="agm-del" id="agm-del-yes"' + (cs.saving ? ' disabled' : '') + '>' + (cs.saving ? 'Suppression\u2026' : 'Supprimer') + '</button></div>';
    } else if (cs.editing) {
      foot = '<button class="agm-del" id="agm-del"' + (cs.saving ? ' disabled' : '') + '>Supprimer</button>'
        + '<button class="agm-save" id="agm-save"' + (cs.saving ? ' disabled' : '') + '>' + saveLbl + '</button>';
    } else {
      foot = '<button class="agm-save" id="agm-save"' + (cs.saving ? ' disabled' : '') + '>' + saveLbl + '</button>';
    }
    ov.innerHTML = '<div class="agm"><div class="agm-head"><span class="agm-title">' + esc(popTitle()) + '</span><button class="agm-x" id="agm-x">\u00d7</button></div>'
      + '<div class="agm-body">' + bodyHtml() + '</div>'
      + '<div class="agm-foot' + (cs.editing ? ' agm-foot-edit' : '') + '">' + foot + '</div></div>';
    wireCreate();
  }
  function syncInputs() {
    const d = frontDoc(); const g = (id) => d.getElementById(id);
    if (g('agm-date')) cs.date = g('agm-date').value;
    if (g('agm-time')) cs.time = g('agm-time').value;
    if (g('agm-dur')) cs.dur = Number(g('agm-dur').value);
    if (g('agm-comment')) cs.comment = g('agm-comment').value;
    if (g('agm-ctype')) cs.creneauType = g('agm-ctype').value || null;
    if (g('agm-rtype')) cs.rdvType = g('agm-rtype').value || null;
    if (g('agm-bvend')) cs.bilatUser = g('agm-bvend').value || null;
  }
  function wireCreate() {
    const d = frontDoc(); const g = (id) => d.getElementById(id);
    g('agm-x').addEventListener('click', closeCreate);
    d.querySelectorAll('#agenda-ov .agm-seg button').forEach(b => b.addEventListener('click', () => { syncInputs(); cs.mode = b.getAttribute('data-mode'); cs.err = ''; renderCreate(); }));
    if (g('agm-phys')) g('agm-phys').addEventListener('click', () => { syncInputs(); cs.physique = !cs.physique; renderCreate(); });
    d.querySelectorAll('#agenda-ov input[name="agm-ori"]').forEach(r => r.addEventListener('change', () => { cs.origine = ORIGINES[Number(r.value)]; }));
    const openPicker = (e) => {
      if (e) e.stopPropagation();
      syncInputs();
      openClientPicker((client) => {
        cs.idClient = Number(client.IDVu); cs.clientLabel = clientLabel(client); cs.client = client; cs.err = '';
        renderCreate();
      }, cs.client || (cs.idClient != null ? { IDVu: cs.idClient, NOM: cs.clientLabel } : null));
    };
    if (g('agm-cli-change')) g('agm-cli-change').addEventListener('click', openPicker);
    if (g('agm-cli-box')) g('agm-cli-box').addEventListener('click', openPicker);
    if (g('agm-cli-pick')) g('agm-cli-pick').addEventListener('click', openPicker);
    if (g('agm-del')) g('agm-del').addEventListener('click', () => { cs.confirmDel = true; cs.err = ''; renderCreate(); });
    if (g('agm-del-cancel')) g('agm-del-cancel').addEventListener('click', () => { cs.confirmDel = false; renderCreate(); });
    if (g('agm-del-yes')) g('agm-del-yes').addEventListener('click', performDelete);
    if (g('agm-save')) g('agm-save').addEventListener('click', doSave);
  }
  async function doSave() {
    syncInputs();
    const s = cs; s.err = '';
    if (!s.date || !s.time) { s.err = 'Date et heure requises.'; return renderCreate(); }
    const site = siteValRaw(); const uid = currentCollabId();
    const startStr = s.date + ' ' + s.time + ':00';
    if (isPastSlot(startStr)) { s.err = 'Date dans le pass\u00e9 : choisis un cr\u00e9neau \u00e0 partir de maintenant.'; return renderCreate(); }
    const endStr = endStrFrom(s.date, s.time, s.dur);
    const dur = fmtDuree(s.dur);
    try {
      const c = sb(); let res;
      if (s.editing) {
        if (s.mode === 'bilat') {
          if (!s.bilatUser) { s.err = 'S\u00e9lectionne le vendeur \u00e9valu\u00e9.'; return renderCreate(); }
          s.saving = true; renderCreate();
          res = await c.rpc('update_bilaterale', { p_id: s.editId, p_id_user: Number(s.bilatUser), p_start: startStr, p_end: endStr, p_duree: dur });
        } else {
          const type = s.mode === 'creneau' ? s.creneauType : s.rdvType;
          if (!type) { s.err = 'S\u00e9lectionne le type.'; return renderCreate(); }
          s.saving = true; renderCreate();
          res = await c.rpc('update_rdv_client', { p_id_rdv: s.editId, p_start: startStr, p_end: endStr, p_duree: dur, p_id_rdv_type: Number(type), p_commentaire: s.comment || null });
        }
      } else if (s.mode === 'rdv') {
        if (!s.idClient) { s.err = 'S\u00e9lectionne un client.'; return renderCreate(); }
        s.saving = true; renderCreate();
        res = await c.rpc('create_rdv_client', { p_id_user: Number(uid), p_id_client: Number(s.idClient), p_id_site: site != null ? Number(site) : null, p_start: startStr, p_end: endStr, p_duree: dur, p_id_rdv_type: s.physique ? 5 : 10, p_origine: s.origine, p_commentaire: s.comment || null });
      } else if (s.mode === 'creneau') {
        if (!s.creneauType) { s.err = 'S\u00e9lectionne un type de cr\u00e9neau.'; return renderCreate(); }
        s.saving = true; renderCreate();
        res = await c.rpc('create_creneau', { p_id_user: Number(uid), p_id_site: site != null ? Number(site) : null, p_start: startStr, p_end: endStr, p_duree: dur, p_id_rdv_type: Number(s.creneauType), p_commentaire: s.comment || null });
      } else {
        if (!s.bilatUser) { s.err = 'S\u00e9lectionne le vendeur \u00e9valu\u00e9.'; return renderCreate(); }
        s.saving = true; renderCreate();
        res = await c.rpc('create_bilaterale', { p_id_user: Number(s.bilatUser), p_id_manager: Number(CACHED_UID), p_id_site: site != null ? Number(site) : null, p_start: startStr, p_end: endStr, p_duree: dur });
      }
      if (res && res.error) throw res.error;
      closeCreate(); refetch();
    } catch (e) { console.error('[agenda] enregistrement', e); s.saving = false; s.err = (e && e.message) ? e.message : String(e); renderCreate(); }
  }
  async function performDelete() {
    const s = cs; if (!s || !s.editing) return; s.err = '';
    s.saving = true; renderCreate();
    try {
      const c = sb(); let res;
      if (s.mode === 'bilat') res = await c.rpc('delete_bilaterale', { p_id: s.editId });
      else res = await c.rpc('delete_rdv_client', { p_id_rdv: s.editId });
      if (res && res.error) throw res.error;
      closeCreate(); refetch();
    } catch (e) { console.error('[agenda] suppression', e); s.saving = false; s.confirmDel = false; s.err = (e && e.message) ? e.message : String(e); renderCreate(); }
  }
  // Popup d'erreur stylé (charte) — bloquant léger, centré.
  function showAgError(title, msg) {
    const d = frontDoc(); try { hideTip(); } catch (e) {} let ov = d.getElementById('agenda-err-ov');
    if (ov) ov.remove();
    ov = d.createElement('div'); ov.id = 'agenda-err-ov';
    ov.innerHTML = '<div class="agm-err-card">'
      + '<div class="agm-err-ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="7.5" x2="12" y2="13"/><circle cx="12" cy="16.5" r="0.6" fill="currentColor"/></svg></div>'
      + '<div class="agm-err-h">' + esc(title || 'Action impossible') + '</div>'
      + (msg ? '<div class="agm-err-m">' + esc(msg) + '</div>' : '')
      + '<button class="agm-err-ok" id="agm-err-ok">J\'ai compris</button></div>';
    (d.body || d.documentElement).appendChild(ov);
    const close = () => { try { ov.remove(); } catch (e) {} };
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    const ok = d.getElementById('agm-err-ok'); if (ok) ok.addEventListener('click', close);
  }
  // Petit toast d'erreur (erreurs techniques inattendues).
  function toast(msg) {
    try {
      const d = frontDoc(); let t = d.getElementById('agenda-toast');
      if (!t) { t = d.createElement('div'); t.id = 'agenda-toast'; t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:4000;background:#a32d2d;color:#fff;font-family:inherit;font-size:13px;font-weight:700;padding:11px 18px;border-radius:10px;box-shadow:0 6px 24px rgba(163,45,45,.35);max-width:80vw'; (d.body || d.documentElement).appendChild(t); }
      t.textContent = msg; t.style.display = 'block';
      clearTimeout(window.__agendaToastT); window.__agendaToastT = setTimeout(() => { try { t.style.display = 'none'; } catch (x) {} }, 5000);
    } catch (e) { console.error(msg); }
  }
  // Drag & resize d'un event -> update_* (type / commentaire inchang\u00e9s).
  async function applyDragResize(arg) {
    const ev = arg.event; const p = ev.extendedProps || {};
    const st = String(p.source_type || '');
    const mins = (ev.end && ev.start) ? Math.max(15, Math.round((ev.end - ev.start) / 60000)) : 30;
    const date = (ev.startStr || '').slice(0, 10); const time = (ev.startStr || '').slice(11, 16);
    const startStr = date + ' ' + time + ':00';
    if (isPastSlot(startStr)) { try { arg.revert(); } catch (x) {} showAgError('D\u00e9placement impossible', 'On ne peut pas d\u00e9placer un \u00e9v\u00e9nement dans le pass\u00e9.'); return; }
    const endStr = endStrFrom(date, time, mins);
    const dur = fmtDuree(mins);
    try {
      const c = sb(); let res;
      if (st === 'rdv') {
        res = await c.rpc('update_rdv_client', { p_id_rdv: p.origin_id, p_start: startStr, p_end: endStr, p_duree: dur, p_id_rdv_type: (p.id_rdv_type != null ? Number(p.id_rdv_type) : null), p_commentaire: p.description || null });
      } else if (st === 'bilat') {
        if (!p.can_edit) { arg.revert(); return; }
        res = await c.rpc('update_bilaterale', { p_id: p.origin_id, p_id_user: Number(p.id_user), p_start: startStr, p_end: endStr, p_duree: dur });
      } else { arg.revert(); return; }
      if (res && res.error) throw res.error;
      refetch();
    } catch (e) { console.error('[agenda] d\u00e9placement', e); try { arg.revert(); } catch (x) {} toast('D\u00e9placement impossible : ' + ((e && e.message) ? e.message : String(e))); }
  }


  // --- bootstrap --------------------------------------------------------------
  function loadScript(src, cb) { const s = document.createElement('script'); s.src = src; s.onload = cb; s.onerror = () => console.error('[agenda] échec chargement ' + src); document.head.appendChild(s); }
  function boot() {
    if (window.FullCalendar) { init(); return; }
    const base = 'https://cdn.jsdelivr.net/npm/fullcalendar@' + CFG.fcVersion + '/index.global.min.js';
    const frLoc = 'https://cdn.jsdelivr.net/npm/@fullcalendar/core@' + CFG.fcVersion + '/locales/fr.global.min.js';
    loadScript(base, () => loadScript(frLoc, init));
  }
  boot();
  // re-render intégré (remplace l'ancien bloc on-page-load « Re-render agenda ») :
  try { const w = frontWin(); [100, 400, 900, 1800].forEach(function (d) { setTimeout(function () { try { w.dispatchEvent(new Event('resize')); } catch (e) {} }, d); }); } catch (e) {}
}
});
