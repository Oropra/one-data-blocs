// ============================================================================
//  FICHE CLIENT — SHELL — module One Data (OD.define)  v1 (Lot A)
//  Orchestrateur : rend le squelette (en-tête + boutons + onglets) dans __anchor
//  et fournit les divs de montage. client via ctx.supabase ; self-boot retiré ;
//  __fsWatch (changement de client) conservé. Onglets encore par id (les briques
//  Lot B/C basculeront chacune en ancre data-od-module).
// ============================================================================
// ============================================================================
//  FICHE CLIENT — SHELL (brique 1)  ·  root: <div id="oropra-fiche-shell"></div>
//  Remplace l'en-tête natif + les 5 boutons + la barre d'onglets (composant Tabs).
//  Le contenu de chaque onglet reste porté par les modules JS existants, qui se
//  montent dans les divs que ce shell fournit :
//     Fiche client  -> #oropra-client-fiche        (cfMain)
//     RDV           -> #rdv-root                    (module RDV)
//     P.Commerciales-> #pcom-root                   (module PCOM)
//     Entreprise    -> #oropra-entreprise-rattachement (entrMain)
//     Likes / Contacts / Véhicules / Historique -> divs prêtes (modules à venir)
//  Bouton Appeler = VoIP JS. Les 4 autres boutons : câblage dans les briques suivantes.
// ============================================================================
OD.define('fiche-shell', {
  mount(__anchor, ctx) {
    if (!window.wwLib) return;
    __anchor.id = 'oropra-fiche-shell';
    const ROOT_ID = 'oropra-fiche-shell';
  const SELECTED_CLIENT_VAR = '55490583-c88b-4748-916e-4d203db07742';
  const doc = __anchor.ownerDocument || document;
  const sb = ctx.supabase;

  // ---- onglets : libellé, icône, div de montage du module ----
  const TABS = [
    { key: 'fiche',      label: 'Fiche client',       icon: 'user',  mount: 'oropra-client-fiche' },
    { key: 'likes',      label: 'Likes',              icon: 'heart', mount: 'oropra-likes-root' },
    { key: 'contacts',   label: 'Contacts',           icon: 'card',  mount: 'oropra-contacts-root' },
    { key: 'rdv',        label: 'RDV',                icon: 'cal',   mount: 'rdv-root' },
    { key: 'vehicules',  label: 'Véhicules',          icon: 'car',   mount: 'oropra-vehicules-root' },
    { key: 'pcom',       label: 'P. Commerciales',    icon: 'doc',   mount: 'pcom-root' },
    { key: 'entreprise', label: 'Entreprise',         icon: 'build', mount: 'oropra-entreprise-rattachement' },
    { key: 'historique', label: 'Historique client',  icon: 'hist',  mount: 'oropra-historique-root' }
  ];
  // modules déjà disponibles (les autres afficheront un placeholder pour l'instant)
  const READY = { fiche: true, likes: true, contacts: true, vehicules: true, rdv: true, pcom: true, entreprise: true, historique: true };

  const state = { tab: 'fiche', client: null, idvu: null };
    // Onglets migrés en module OD.define -> montés par le loader dans une ancre.
    // (les autres gardent leur div par id, remplie par l'ancien bloc on-page-load)
    const MOD = { fiche: 'cf-fiche', likes: 'likes', contacts: 'contacts', rdv: 'rdv', vehicules: 'vehicules', pcom: 'pcom', entreprise: 'entreprise', historique: 'historique' };

  // ---------------------------------------------------------------- helpers
  function esc(s) { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function cap(s) { return (s || '').toString().toLowerCase().replace(/(^|[\s\-'])([a-zà-ÿ])/g, (m, sep, c) => sep + c.toUpperCase()); }
  function readVar(id) { try { return wwLib.wwVariable.getValue(id); } catch (e) { return null; } }
  function currentIdvu() { const c = readVar(SELECTED_CLIENT_VAR); return c && c.IDVu != null ? Number(c.IDVu) : null; }
  function isSoc(c) { return c && (c.idmultivu === 1 || c.idmultivu === '1'); }
  function clientName(c) {
    if (!c) return '—';
    return isSoc(c) ? [c.CIVILITE, cap(c.NOM)].filter(Boolean).join(' ')
                    : [c.CIVILITE, cap(c.PRENOM), cap(c.NOM)].filter(Boolean).join(' ');
  }
  function normPhone(n) { const t = (n || '').replace(/\s+/g, ''); if (!t) return ''; if (t[0] === '+') return t; if (t[0] === '0') return '+33' + t.slice(1); return t; }

  // ---------------------------------------------------------------- data
  async function loadClient() {
    const idvu = currentIdvu();
    if (idvu == null) { state.client = null; return; }
    try {
      const { data, error } = await sb.from('CLIENT')
        .select('IDVu, CIVILITE, NOM, PRENOM, EMAIL, TEl_MOB, idmultivu, code_postal, ville')
        .eq('IDVu', idvu).single();
      if (error) throw error;
      state.client = data; state.idvu = idvu;
    } catch (e) { console.error('[fiche-shell] CLIENT', e); state.client = null; }
  }

  // ---------------------------------------------------------------- VoIP (bouton Appeler)
  function pickVoipUI() {
    const cands = [];
    try { cands.push(wwLib.getFrontWindow && wwLib.getFrontWindow()); } catch (e) {}
    try { cands.push(typeof globalThis !== 'undefined' ? globalThis : null); } catch (e) {}
    cands.push(window);
    try { cands.push(window.parent); } catch (e) {}
    try { cands.push(window.top); } catch (e) {}
    for (let i = 0; i < cands.length; i++) { try { if (cands[i] && cands[i].__VOIP_UI__) return cands[i].__VOIP_UI__; } catch (e) {} }
    return null;
  }
  function callClient() {
    const c = state.client; if (!c) return;
    const to = normPhone(c.TEl_MOB);
    if (!to) return;
    const device = (typeof globalThis !== 'undefined' && globalThis.__ONE_DATA__ && globalThis.__ONE_DATA__.device)
      || window._twilioDevice || (window.parent && window.parent._twilioDevice) || (window.top && window.top._twilioDevice);
    const UI = pickVoipUI();
    const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window;
    if (!device || typeof device.connect !== 'function') { try { w.location.href = 'tel:' + to; } catch (e) { window.location.href = 'tel:' + to; } return; }
    (async () => {
      try {
        const call = await device.connect({ params: { To: to } });
        globalThis.__ONE_DATA__ = globalThis.__ONE_DATA__ || {}; globalThis.__ONE_DATA__.call = call;
        try { window._twilioCall = call; window.parent._twilioCall = call; window.top._twilioCall = call; } catch (e) {}
        if (UI) UI.incall({ name: clientName(c), number: c.TEl_MOB, idvu: c.IDVu, client: c });
        call.on('accept', () => { if (UI) { UI.answer(); UI.minimize(true); } });
        call.on('disconnect', () => { if (UI) UI.close(); try { window._twilioCall = null; window.parent._twilioCall = null; window.top._twilioCall = null; } catch (e) {} if (globalThis.__ONE_DATA__) globalThis.__ONE_DATA__.call = null; });
      } catch (e) { console.error('[fiche-shell] VoIP', e); }
    })();
  }

  // Recherche d'un global exposé par un autre embed (sandbox : front != global != top)
  function pickCtxProp(prop) {
    const cands = [];
    try { cands.push(wwLib.getFrontWindow && wwLib.getFrontWindow()); } catch (e) {}
    try { cands.push(typeof globalThis !== 'undefined' ? globalThis : null); } catch (e) {}
    cands.push(window);
    try { cands.push(window.parent); } catch (e) {}
    try { cands.push(window.top); } catch (e) {}
    for (let i = 0; i < cands.length; i++) { try { if (cands[i] && cands[i][prop]) return cands[i][prop]; } catch (e) {} }
    return null;
  }
  function openSms() {
    const c = state.client; if (!c) return;
    const UI = pickCtxProp('__SMS_UI__');
    if (UI && typeof UI.open === 'function') { UI.open({ client: c }); return; }
    // fallback : app SMS native du device
    const to = normPhone(c.TEl_MOB);
    if (to) { const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window; try { w.location.href = 'sms:' + to; } catch (e) { window.location.href = 'sms:' + to; } }
    else console.warn('[fiche-shell] SMS UI introuvable et pas de mobile');
  }
  function openWa() {
    const c = state.client; if (!c) return;
    const UI = pickCtxProp('__WA_UI__');
    if (UI && typeof UI.open === 'function') { UI.open({ client: c }); return; }
    console.warn('[fiche-shell] WhatsApp UI introuvable');
  }
  function openMail() {
    const c = state.client; if (!c) return;
    const UI = pickCtxProp('__EMAIL_UI__');
    if (UI && typeof UI.open === 'function') { UI.open({ mode: 'new', client: c }); return; }
    console.warn('[fiche-shell] Email UI introuvable');
  }

  // les boutons restants (WA / Email) : hooks à câbler dans les briques suivantes
  function todo(name) { console.log('[fiche-shell] bouton ' + name + ' — à câbler (brique dédiée)'); }

  // ---------------------------------------------------------------- icônes
  const IC = {
    user: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    heart: '<path d="M12 21s-7-4.6-9.3-8.3C1 9.5 2.4 6 5.7 6c2 0 3.2 1.3 3.8 2.3l.5.9.5-.9C11.1 7.3 12.3 6 14.3 6 17.6 6 19 9.5 21.3 12.7 19 16.4 12 21 12 21z"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 9.5h19M6 13h5M6 16h3"/>',
    cal: '<rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M3.5 9h17M8 3v3M16 3v3"/>',
    car: '<path d="M5 16.5h14M6.5 16.5v2M17.5 16.5v2"/><path d="M4 16.5l1.5-5A2 2 0 0 1 7.4 10h9.2a2 2 0 0 1 1.9 1.5l1.5 5"/><circle cx="7.5" cy="16.5" r="1.6"/><circle cx="16.5" cy="16.5" r="1.6"/>',
    doc: '<path d="M6 2.5h8l4 4v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-18a1 1 0 0 1 1-1z"/><path d="M14 2.5v4h4M8.5 13h7M8.5 16.5h7"/>',
    build: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h6"/>',
    hist: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M4 21a8 8 0 0 1 13-6.2"/><path d="M20 16v3h-3"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    wa: '<path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.3A9 9 0 1 0 12 3z"/><path d="M8.5 8.8c.2-.5.4-.5.6-.5h.5c.2 0 .4 0 .6.4l.7 1.6c0 .2.1.3 0 .5l-.4.5c-.1.2-.2.3 0 .5.6 1 1.4 1.6 2.3 2 .2.1.4.1.5 0l.5-.6c.1-.2.3-.2.5-.1l1.5.7c.2.1.3.2.3.4 0 .5-.7 1.3-1.2 1.4-1.3.2-2.9-.7-4-1.7-.8-.8-1.6-1.9-1.7-3 0-.4 0-.8.2-1z" fill="currentColor" stroke="none"/>',
    mail: '<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="m3 6 9 6.5L21 6"/>',
    sms: '<path d="M4 4.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H8l-4 3.5v-3.5H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/>',
    rpv: '<path d="M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M2.5 21a7.5 7.5 0 0 1 13-5.1"/><path d="M17.5 15v6M20.5 18h-6"/>'
  };
  const svg = (p, cls) => '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';

  // ---------------------------------------------------------------- styles
  const CSS = `
#${ROOT_ID}{--dk:#1F4A85;--md:#2a5ea9;--gr:#53bda7;--rd:#e24b4a;--am:#e6a817;--bd:#e8eef7;--bd2:#eef2f8;--mut:#7a98c5;--soft:#fbfcfe;--hov:#f2f6fc;
  font-family:"Nunito Sans",system-ui,sans-serif;color:var(--dk);display:block}
#${ROOT_ID} *{box-sizing:border-box}
.fs-card{background:#fff;border:1px solid var(--bd);border-radius:16px;box-shadow:0 6px 22px rgba(31,74,133,.05)}
/* en-tête */
.fs-head{padding:18px 22px;margin-bottom:14px}
.fs-name{font-size:21px;font-weight:800;letter-spacing:-.4px;margin:0 0 6px}
.fs-detail{display:flex;flex-wrap:wrap;gap:18px;font-size:13px;color:var(--mut);font-weight:600;margin-bottom:14px}
.fs-detail span{display:inline-flex;align-items:center;gap:6px}
.fs-detail svg{width:14px;height:14px;opacity:.8}
.fs-actions{display:flex;flex-wrap:wrap;gap:10px}
.fs-btn{display:inline-flex;align-items:center;gap:8px;border:1.5px solid var(--bd);background:#fff;border-radius:10px;padding:9px 16px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;transition:.15s;color:var(--dk)}
.fs-btn svg{width:17px;height:17px}
.fs-btn:hover{background:var(--hov)}
.fs-btn.call{color:var(--md);border-color:#c9d9ee}.fs-btn.call:hover{background:#eef4fc}
.fs-btn.wa{color:#1f9d63;border-color:#bfe6cf}.fs-btn.wa:hover{background:#eafaf1}
.fs-btn.mail{color:var(--dk);border-color:#d7dfe9}.fs-btn.mail:hover{background:#f2f5f9}
.fs-btn.sms{color:var(--am);border-color:#f0dca6}.fs-btn.sms:hover{background:#fdf7e8}
.fs-btn.rpv{color:var(--rd);border-color:#f2c4c4}.fs-btn.rpv:hover{background:#fdf1f1}
/* onglets */
.fs-tabs-wrap{padding:14px 16px}
.fs-tabs{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.fs-tab{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--bd);background:#fff;border-radius:10px;padding:8px 14px;font:inherit;font-size:13px;font-weight:700;color:var(--dk);cursor:pointer;transition:.15s;position:relative}
.fs-tab svg{width:15px;height:15px;color:var(--md)}
.fs-tab:hover{background:var(--soft)}
.fs-tab.on{border-color:transparent;background:var(--soft)}
.fs-tab.on::after{content:"";position:absolute;left:14px;right:14px;bottom:-1px;height:2.5px;background:var(--md);border-radius:2px}
/* contenu */
.fs-content{margin-top:14px}
#${ROOT_ID} .fs-pane{display:none}
#${ROOT_ID} .fs-pane.on{display:block}
#${ROOT_ID} .fs-pane--mount{padding:16px}
.fs-ph{padding:60px 20px;text-align:center;color:var(--mut);font-size:14px}
#fs-rpv-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center}
.fs-rpv-bg{position:absolute;inset:0;background:rgba(20,40,80,.45)}
.fs-rpv-box{position:relative;background:#fff;border-radius:18px;width:min(920px,94vw);max-height:96vh;overflow-y:auto;box-shadow:0 24px 60px rgba(20,40,80,.35);padding:30px 34px 26px}
.fs-rpv-x{position:absolute;top:12px;right:14px;z-index:3;width:30px;height:30px;border:none;background:#f2f6fc;border-radius:8px;font-size:22px;line-height:1;color:#5a7196;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.fs-rpv-x:hover{color:#1F4A85;background:#e6eef8}
@media(max-width:680px){.fs-tabs{justify-content:flex-start}.fs-detail{gap:12px}.fs-rpv-box{padding:14px}}
`;

  // ---------------------------------------------------------------- render
  function ensureCss() {
    if (doc.getElementById('fs-css')) return;
    const head = doc.head || doc.getElementsByTagName('head')[0] || doc.documentElement;
    const st = doc.createElement('style'); st.id = 'fs-css'; st.textContent = CSS; head.appendChild(st);
  }
  function headerHtml() {
    const c = state.client;
    if (!c) return '<div class="fs-card fs-head"><div class="fs-name">Aucun client sélectionné</div></div>';
    const type = (isSoc(c) ? 'Entreprise' : 'Particulier');
    const loc = [c.code_postal, c.ville].filter(Boolean).join(' ');
    return '<div class="fs-card fs-head">' +
      '<h2 class="fs-name">' + esc(clientName(c)) + '</h2>' +
      '<div class="fs-detail">' +
        (c.TEl_MOB ? '<span>' + svg(IC.phone) + esc(c.TEl_MOB) + '</span>' : '') +
        (c.EMAIL ? '<span>' + svg(IC.mail) + esc(c.EMAIL) + '</span>' : '') +
        '<span>' + svg(IC.user) + esc(type) + (loc ? ' (' + esc(loc) + ')' : '') + '</span>' +
        '<span>ID Client : ' + esc(c.IDVu) + '</span>' +
      '</div>' +
      '<div class="fs-actions">' +
        '<button class="fs-btn call" data-btn="call">' + svg(IC.phone) + 'Appeler</button>' +
        '<button class="fs-btn wa" data-btn="wa">' + svg(IC.wa) + 'WhatsApp</button>' +
        '<button class="fs-btn mail" data-btn="mail">' + svg(IC.mail) + 'Email</button>' +
        '<button class="fs-btn sms" data-btn="sms">' + svg(IC.sms) + 'SMS</button>' +
        '<button class="fs-btn rpv" data-btn="rpv">' + svg(IC.rpv) + 'RPV</button>' +
      '</div></div>';
  }
  // Entreprise n'a de sens que pour un particulier -> masqué (et onglets resserrés)
  // quand le client est une société.
  function visibleTabs() { return TABS.filter(t => !(t.key === 'entreprise' && isSoc(state.client))); }
  function tabsHtml() {
    return '<div class="fs-card fs-tabs-wrap"><div class="fs-tabs">' +
      visibleTabs().map(t => '<button class="fs-tab' + (state.tab === t.key ? ' on' : '') + '" data-tab="' + t.key + '">' + svg(IC[t.icon]) + esc(t.label) + '</button>').join('') +
      '</div></div>';
  }
  function contentHtml() {
    // Toutes les divs de montage sont présentes dès le chargement (masquées sauf
    // l'onglet actif) -> chaque module trouve sa div et se monte, même les onglets
    // non ouverts. Le changement d'onglet ne fait que basculer la visibilité.
    return '<div class="fs-content">' + visibleTabs().map(t => {
      const on = state.tab === t.key;
      const st = ' style="display:' + (on ? 'block' : 'none') + '"';
      if (READY[t.key]) if (MOD[t.key]) return '<div class="fs-pane fs-card fs-pane--mount' + (on ? ' on' : '') + '" data-pane="' + t.key + '"' + st + '><div data-od-module="' + MOD[t.key] + '"></div></div>';
      return '<div class="fs-pane fs-card fs-pane--mount' + (on ? ' on' : '') + '" data-pane="' + t.key + '"' + st + '><div id="' + t.mount + '"></div></div>';
      return '<div class="fs-pane fs-card' + (on ? ' on' : '') + '" data-pane="' + t.key + '"' + st + '><div class="fs-ph">Onglet « ' + esc(t.label) + ' » — module à venir (prochaine brique).</div></div>';
    }).join('') + '</div>';
  }

  function renderContent() {
    const root = __anchor; if (!root) return;
    root.querySelectorAll('.fs-pane').forEach(pn => {
      const on = pn.getAttribute('data-pane') === state.tab;
      pn.classList.toggle('on', on);
      pn.style.display = on ? 'block' : 'none';
    });
    root.querySelectorAll('.fs-tab').forEach(b => b.classList.toggle('on', b.getAttribute('data-tab') === state.tab));
  }
  // Ouvre le formulaire RPV (rpvBoot) dans une overlay JS. rpvBoot possède un
  // observateur persistant qui rend le formulaire dès que #rpv-root apparaît.
  function openRpv() {
    const ex = doc.getElementById('fs-rpv-overlay'); if (ex) ex.remove();
    const ov = doc.createElement('div'); ov.id = 'fs-rpv-overlay';
    ov.innerHTML = '<div class="fs-rpv-bg"></div><div class="fs-rpv-box"><button class="fs-rpv-x" aria-label="Fermer">&times;</button><div data-od-module="rpv"></div></div>';
    (doc.body || doc.documentElement).appendChild(ov);
    const close = () => { try { ov.remove(); } catch (e) {} };
    ov.querySelector('.fs-rpv-bg').addEventListener('click', close);
    ov.querySelector('.fs-rpv-x').addEventListener('click', close);
  }

  function bindHeader(root) {
    root.querySelectorAll('[data-btn]').forEach(b => b.addEventListener('click', () => {
      const k = b.getAttribute('data-btn');
      if (k === 'call') callClient(); else if (k === 'rpv') openRpv(); else if (k === 'sms') openSms(); else if (k === 'wa') openWa(); else if (k === 'mail') openMail(); else todo(k);
    }));
  }

  // Onglets qui reflètent les échanges (SMS, WA, appels, RPV) : on invalide leur
  // cache à l'ouverture pour afficher les nouveaux échanges sans recharger la page.
  function refreshLiveTab(key) {
    // Onglets "live" (contacts / historique) : on force un rechargement frais en
    // RECRÉANT l'ancre -> le loader remonte le module (les observers internes ont
    // été retirés, c'est le loader qui possède désormais le cycle de vie).
    const map = { contacts: ['__contactsState', 'contacts'], historique: ['__histoState', 'historique'] };
    const e = map[key]; if (!e) return;
    try {
      const st = window[e[0]]; if (st) { st.rows = null; st.loading = true; st.idvu = null; }
      const pane = __anchor.querySelector('.fs-pane[data-pane="' + key + '"]');
      if (pane) pane.innerHTML = '<div data-od-module="' + e[1] + '"></div>';
    } catch (x) {}
  }

  function render() {
    const root = __anchor; if (!root) return;
    if (!visibleTabs().some(t => t.key === state.tab)) state.tab = 'fiche';
    root.innerHTML = '<div id="fs-header-holder">' + headerHtml() + '</div>' + tabsHtml() + contentHtml();
    bindHeader(root);
    // onglets
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
      state.tab = b.getAttribute('data-tab');
      refreshLiveTab(state.tab);
      renderContent();
    }));
  }

  // ---------------------------------------------------------------- boot
  async function boot() {
    const root = __anchor; if (!root) return;
    ensureCss();
    await loadClient();
    render();
    // surveille le changement de client (navigation via historique / recherche).
    // Re-rendu complet : en-tête + jeu d'onglets (Entreprise masqué si société) +
    // panneaux recréés -> chaque module d'onglet se re-monte via son observateur.
    if (window.__fsWatch) clearInterval(window.__fsWatch);
    window.__fsWatch = setInterval(async () => {
      const idvu = currentIdvu();
      if (idvu != null && idvu !== state.idvu) { await loadClient(); render(); }
    }, 500);
  }
  boot();   // le loader garantit __anchor
}
});
