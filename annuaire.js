// ============================================================================
//  ANNUAIRE DU GROUPE — module One Data (contrat OD.define)  v1-migré
//  Migré depuis l'embed autoportant. Changements vs original :
//   - racine = l'ancre `el` (el.id = 'oropra-annuaire' pour garder le CSS scopé)
//   - Supabase : ctx.supabase (au lieu de wwLib.wwPlugins.supabase.instance)
//   - doc = el.ownerDocument ; plus de self-boot/poll (le loader appelle mount)
//   - VoIP Twilio (wwLib.getFrontWindow) conservé tel quel
//  Chargé par le shell dans <div data-od-module="annuaire"></div>.
// ============================================================================
OD.define('annuaire', {
  async mount(el, ctx) {
    const ROOT_ID = 'oropra-annuaire';
    el.id = ROOT_ID;                       // la racine = l'ancre (CSS #oropra-annuaire OK)
    const sb  = ctx.supabase;              // client runtime du tenant
    const doc = el.ownerDocument || document;

  // ---- rôles : libellé + niveau hiérarchique (pour tri + couleur de badge) ----
  const ROLE_META = {
    1: { label: 'Admin',           tier: 'admin',   rank: 1 },
    8: { label: 'Directeur groupe', tier: 'lead',   rank: 2 },
    7: { label: 'Directeur marque', tier: 'lead',   rank: 3 },
    6: { label: 'Directeur plaque', tier: 'lead',   rank: 4 },
    2: { label: 'Directeur',        tier: 'dir',    rank: 5 },
    3: { label: 'Chef des ventes',  tier: 'chef',   rank: 6 },
    4: { label: 'Vendeur',          tier: 'vendeur',rank: 7 },
    5: { label: 'Marketing',        tier: 'mkt',    rank: 8 }
  };
  const roleMeta = (id) => ROLE_META[Number(id)] || { label: '—', tier: 'na', rank: 99 };

  // ---------------------------------------------------------------- helpers
  function esc(s) { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function initials(u) {
    const p = (u.prenom || '').trim(), n = (u.nom || '').trim();
    const i = ((p[0] || '') + (n[0] || '')) || (u.nomComplet || 'U').slice(0, 2);
    return i.toUpperCase();
  }
  function fullName(u) { return u.nomComplet || [u.prenom, u.nom].filter(Boolean).join(' ') || '—'; }
  function normPhone(num) {
    const t = (num || '').replace(/\s+/g, '');
    if (!t) return '';
    if (t.startsWith('+')) return t;
    if (t.startsWith('0')) return '+33' + t.slice(1);
    return t;
  }
  function parseSites(u) {
    // multiSite = "2009,2010" ; sinon ID_SITE primaire
    const raw = (u.multiSite && String(u.multiSite).trim()) ? String(u.multiSite) : String(u.ID_SITE || '');
    return raw.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0);
  }
  const state = {
    view: 'grid',            // 'grid' | 'site' | 'org'
    q: '',
    reseau: '',
    affaire: '',
    site: '',
    role: '',
    vnvo: '',
    showInactive: false,
    expanded: {},
    scopeExpanded: {}             // organigramme : nœuds dépliés
  };
  let DATA = null;           // { users, byId, siteMap, roleName, childrenOf, rootIds }

  // ---------------------------------------------------------------- styles
  const CSS = `
#${ROOT_ID}{--dk:#1F4A85;--md:#2a5ea9;--gr:#53bda7;--rd:#e24b4a;--am:#c99a2e;--pu:#8a63c4;
  --bd:#e8eef7;--bd2:#eef2f8;--mut:#7a98c5;--bg:#fff;--soft:#fbfcfe;--hov:#f2f6fc;
  font-family:"Nunito Sans",system-ui,sans-serif;color:var(--dk);max-width:1200px;margin:0 auto;width:100%}
#${ROOT_ID} *{box-sizing:border-box}
.an-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.an-title{font-size:20px;font-weight:800;letter-spacing:-.4px;margin:0}
.an-count{font-size:13px;color:var(--mut);font-weight:600}
.an-spacer{flex:1 1 auto}
.an-search{position:relative;flex:1 1 260px;max-width:360px}
.an-search input{width:100%;padding:9px 12px 9px 34px;border:1px solid var(--bd);border-radius:10px;font:inherit;font-size:14px;color:var(--dk);background:var(--bg);outline:none;transition:border .15s}
.an-search input:focus{border-color:var(--md)}
.an-search svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);width:15px;height:15px;color:var(--mut)}
.an-views{display:inline-flex;background:var(--soft);border:1px solid var(--bd);border-radius:10px;padding:3px;gap:2px}
.an-views button{border:none;background:none;cursor:pointer;font:inherit;font-size:13px;font-weight:600;color:var(--mut);padding:6px 12px;border-radius:8px;display:inline-flex;align-items:center;gap:6px;transition:.15s}
.an-views button svg{width:14px;height:14px}
.an-views button.on{background:var(--md);color:#fff;box-shadow:0 2px 6px rgba(42,94,169,.28)}
.an-views button:not(.on):hover{color:var(--md)}
.an-filters{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.an-sel{position:relative}
.an-sel select{appearance:none;-webkit-appearance:none;border:1px solid var(--bd);background:var(--bg);border-radius:9px;font:inherit;font-size:13px;font-weight:600;color:var(--dk);padding:7px 28px 7px 11px;cursor:pointer;outline:none}
.an-sel select:hover{border-color:#acc5e4}
.an-sel::after{content:"";position:absolute;right:11px;top:50%;width:6px;height:6px;border-right:2px solid var(--mut);border-bottom:2px solid var(--mut);transform:translateY(-70%) rotate(45deg);pointer-events:none}
.an-chk{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--mut);cursor:pointer;user-select:none;margin-left:auto}
.an-chk input{width:15px;height:15px;accent-color:var(--md);cursor:pointer}
.an-reset{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--bd);background:var(--bg);border-radius:9px;font:inherit;font-size:13px;font-weight:600;color:var(--mut);padding:7px 12px;cursor:pointer;transition:.15s}
.an-reset:hover{color:var(--rd);border-color:#f3c9c9;background:#fdf4f4}
.an-reset svg{width:13px;height:13px}

/* ---- cartes (grille) ---- */
.an-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
.an-card{background:var(--bg);border:1px solid var(--bd);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px;transition:box-shadow .18s,transform .18s,border-color .18s}
.an-card:hover{box-shadow:0 14px 34px rgba(31,74,133,.13);transform:translateY(-2px);border-color:#dbe6f5}
.an-card.off{opacity:.55}
.an-hd{display:flex;align-items:center;gap:12px}
.an-av{width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,var(--md),var(--dk));color:#fff;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:0 0 auto;letter-spacing:.5px}
.an-av[data-tier="lead"]{background:linear-gradient(135deg,var(--am),#a87d18)}
.an-av[data-tier="vendeur"]{background:linear-gradient(135deg,var(--gr),#3a9d88)}
.an-idn{min-width:0}
.an-nm{font-size:15px;font-weight:700;color:var(--dk);line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.an-fn{font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.an-badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px;white-space:nowrap;flex:0 0 auto}
.an-badge[data-tier="admin"]{background:#fdecec;color:var(--rd)}
.an-badge[data-tier="lead"]{background:#f7efdb;color:var(--am)}
.an-badge[data-tier="dir"]{background:#e9f0fa;color:var(--dk)}
.an-badge[data-tier="chef"]{background:#e7f1fb;color:var(--md)}
.an-badge[data-tier="vendeur"]{background:#e4f5f0;color:#2f8a76}
.an-badge[data-tier="mkt"]{background:#f0eafa;color:var(--pu)}
.an-badge[data-tier="na"]{background:#eef2f8;color:var(--mut)}
.an-meta{display:flex;flex-wrap:wrap;gap:6px}
.an-chip{font-size:11px;font-weight:600;color:#5a7196;background:var(--hov);border:1px solid var(--bd2);padding:3px 8px;border-radius:7px;display:inline-flex;align-items:center;gap:4px}
.an-chip svg{width:11px;height:11px;color:var(--gr)}
.an-chip.an-plaque svg{color:var(--am)}
.an-chip.an-more{cursor:pointer;font-weight:700;color:var(--md);background:#eef4fc;border-color:#d6e2f2}
.an-chip.an-more:hover{background:#e2ecf9}
.an-chip.an-tag svg{color:var(--dk)}
.an-vnvo{font-size:10px;font-weight:800;letter-spacing:.5px;color:var(--md);border:1px solid #cfe0f4;border-radius:6px;padding:2px 6px}
.an-actions{display:flex;gap:8px;margin-top:2px}
.an-act{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--bd);background:var(--bg);border-radius:9px;padding:8px;cursor:pointer;font:inherit;font-size:12px;font-weight:700;color:var(--md);transition:.15s}
.an-act:hover{background:var(--hov);border-color:#acc5e4}
.an-act svg{width:14px;height:14px}
.an-act.call{color:#2f8a76}
.an-act.call:hover{background:#e4f5f0;border-color:#a9e0d3}
.an-act.dis{opacity:.4;cursor:not-allowed;pointer-events:none}

/* ---- par site ---- */
.an-site{background:var(--bg);border:1px solid var(--bd);border-radius:14px;margin-bottom:12px;overflow:hidden}
.an-site-hd{display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;transition:background .15s}
.an-site-hd:hover{background:var(--soft)}
.an-site-nm{font-size:15px;font-weight:800;color:var(--dk)}
.an-site-sub{font-size:12px;color:var(--mut);font-weight:600}
.an-res{font-size:10px;font-weight:800;letter-spacing:.5px;padding:3px 8px;border-radius:6px;background:#eef2f8;color:var(--md)}
.an-site-n{margin-left:auto;font-size:13px;color:var(--mut);font-weight:700}
.an-caret{width:16px;height:16px;color:var(--mut);transition:transform .2s;flex:0 0 auto}
.an-site.open .an-caret{transform:rotate(90deg)}
.an-site-body{display:none;padding:4px 12px 12px}
.an-site.open .an-site-body{display:block}
.an-row{display:flex;align-items:center;gap:12px;padding:9px 8px;border-radius:9px;transition:background .12s}
.an-row:hover{background:var(--soft)}
.an-av-sm{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--md),var(--dk));color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.an-av-sm[data-tier="lead"]{background:linear-gradient(135deg,var(--am),#a87d18)}
.an-av-sm[data-tier="vendeur"]{background:linear-gradient(135deg,var(--gr),#3a9d88)}
.an-row-main{min-width:0;flex:1}
.an-row-nm{font-size:14px;font-weight:700;color:var(--dk);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.an-row-fn{font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.an-row-acts{display:flex;gap:6px;flex:0 0 auto}
.an-ico{width:32px;height:32px;border-radius:8px;border:1px solid var(--bd);background:var(--bg);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--md);transition:.15s}
.an-ico:hover{background:var(--hov)}
.an-ico.call{color:#2f8a76}
.an-ico.call:hover{background:#e4f5f0}
.an-ico svg{width:15px;height:15px}
.an-ico.dis{opacity:.35;pointer-events:none}

/* ---- organigramme ---- */
.an-org{padding:2px}
.an-node{margin:0}
.an-node-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;position:relative}
.an-node-row:hover{background:var(--soft)}
.an-tog{width:20px;height:20px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--mut);border-radius:5px}
.an-tog:hover{background:var(--hov);color:var(--md)}
.an-tog.leaf{visibility:hidden}
.an-tog svg{width:13px;height:13px;transition:transform .18s}
.an-node.open>.an-node-row .an-tog svg{transform:rotate(90deg)}
.an-children{margin-left:26px;border-left:2px solid var(--bd2);padding-left:8px;display:none}
.an-node.open>.an-children{display:block}
.an-n-nm{font-size:14px;font-weight:700;color:var(--dk)}
.an-n-fn{font-size:12px;color:var(--mut);margin-left:2px}
.an-n-count{font-size:11px;font-weight:700;color:var(--mut);background:var(--hov);border-radius:20px;padding:1px 8px;margin-left:4px}
.an-n-acts{margin-left:auto;display:flex;gap:6px;opacity:0;transition:opacity .12s}
.an-node-row:hover .an-n-acts{opacity:1}

/* ---- états ---- */
.an-empty,.an-loading,.an-err{text-align:center;padding:56px 20px;color:var(--mut);font-size:14px}
.an-err{color:var(--rd)}
.an-spin{width:26px;height:26px;border:3px solid var(--bd);border-top-color:var(--md);border-radius:50%;animation:anspin .8s linear infinite;margin:0 auto 14px}
@keyframes anspin{to{transform:rotate(360deg)}}
.an-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);background:#1F4A85;color:#fff;font-size:13px;font-weight:600;padding:11px 18px;border-radius:10px;box-shadow:0 12px 30px rgba(31,74,133,.32);opacity:0;pointer-events:none;transition:.25s;z-index:9999}
.an-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
@media(max-width:600px){
  #${ROOT_ID}{padding:0 2px}
  .an-grid{grid-template-columns:1fr}
  .an-search{max-width:none;flex:1 1 100%;order:5}
}
`;

  // ---------------------------------------------------------------- toast
  let toastEl = null, toastT = null;
  function toast(msg) {
    try {
      const r = doc.getElementById(ROOT_ID);
      const dd = (r && r.ownerDocument) || doc || document;
      if (!toastEl || !toastEl.isConnected) { toastEl = dd.createElement('div'); toastEl.className = 'an-toast'; (dd.body || dd.documentElement).appendChild(toastEl); }
      toastEl.textContent = msg || '';
      toastEl.classList.add('show');
      clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2200);
    } catch (e) {}
  }

  // ---------------------------------------------------------------- actions
  function callUser(u) {
    const to = normPhone(u.N_de_telephone);
    if (!to) { toast('Aucun numéro pour ' + fullName(u)); return; }
    const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window;
    const device = (typeof globalThis !== 'undefined' && globalThis.__ONE_DATA__ && globalThis.__ONE_DATA__.device)
      || window._twilioDevice || (window.parent && window.parent._twilioDevice) || (window.top && window.top._twilioDevice);
    // __VOIP_UI__ n'est posé que sur wwLib.getFrontWindow() -> on le cherche sur TOUS les contextes possibles
    const UI = (function () {
      const cands = [];
      try { cands.push(wwLib.getFrontWindow && wwLib.getFrontWindow()); } catch (e) {}
      try { cands.push(typeof globalThis !== 'undefined' ? globalThis : null); } catch (e) {}
      cands.push(window);
      try { cands.push(window.parent); } catch (e) {}
      try { cands.push(window.top); } catch (e) {}
      for (let i = 0; i < cands.length; i++) { try { if (cands[i] && cands[i].__VOIP_UI__) return cands[i].__VOIP_UI__; } catch (e) {} }
      return null;
    })();
    if (!device || typeof device.connect !== 'function') {
      // device Twilio non initialisé sur cette page -> composeur natif
      try { w.location.href = 'tel:' + to; } catch (e) { window.location.href = 'tel:' + to; }
      return;
    }
    (async () => {
      try {
        const name = fullName(u);
        const call = await device.connect({ params: { To: to } });
        globalThis.__ONE_DATA__ = globalThis.__ONE_DATA__ || {};
        globalThis.__ONE_DATA__.call = call;
        try { window._twilioCall = call; window.parent._twilioCall = call; window.top._twilioCall = call; } catch (e) {}
        // pilote le softphone (même API que le bouton Appeler de la fiche client)
        if (UI) UI.incall({ name: name, number: u.N_de_telephone, idvu: 0, client: null });
        call.on('accept', () => { if (UI) { UI.answer(); UI.minimize(true); } });
        call.on('disconnect', () => {
          if (UI) UI.close();
          try { window._twilioCall = null; window.parent._twilioCall = null; window.top._twilioCall = null; } catch (e) {}
          if (globalThis.__ONE_DATA__) globalThis.__ONE_DATA__.call = null;
        });
      } catch (e) { console.error('[annuaire] VoIP', e); toast('Appel impossible pour le moment'); }
    })();
  }
  function emailUser(u) {
    if (!u.email) { toast('Aucun email pour ' + fullName(u)); return; }
    try { (wwLib.getFrontWindow ? wwLib.getFrontWindow() : window).location.href = 'mailto:' + u.email; }
    catch (e) { window.location.href = 'mailto:' + u.email; }
  }
  function copyUser(u) {
    const lines = [fullName(u), u.FONCTION, u.N_de_telephone, u.email].filter(Boolean).join('\n');
    const done = () => toast('Contact copié');
    try { navigator.clipboard.writeText(lines).then(done, done); }
    catch (e) { done(); }
  }

  // icônes
  const I = {
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    site: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    org: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="5" rx="1.2"/><rect x="2.5" y="17" width="6" height="5" rx="1.2"/><rect x="15.5" y="17" width="6" height="5" rx="1.2"/><path d="M12 7v4M5.5 17v-2h13v2M12 13v2"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="m3 6 9 6.5L21 6"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    caret: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h6"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/></svg>'
  };

  // ---------------------------------------------------------------- data load
  async function load() {
    const [u, us, s, r] = await Promise.all([
      sb.from('USER').select('ID_User,prenom,nom,nomComplet,email,N_de_telephone,voip_number,ID_Role,status,VN_VO,FONCTION,ID_SITE,multiSite,idSuperieur,RESEAU'),
      sb.from('USER_SITE').select('ID_User,ID_SITE,ID_Role,Manager_User_ID'),
      sb.from('SITE').select('ID_SITE,SITE,VILLE,RESEAU,AFFAIRE'),
      sb.from('ROLE').select('id,name')
    ]);
    if (u.error) throw u.error;
    const siteMap = {};
    (s.data || []).forEach(x => { siteMap[x.ID_SITE] = x; });
    const users = (u.data || []);
    const byId = {}; users.forEach(x => { byId[x.ID_User] = x; });

    // manager par user : priorité au site principal, sinon 1re affectation, sinon idSuperieur
    const usByUser = {};
    (us.data || []).forEach(row => {
      (usByUser[row.ID_User] = usByUser[row.ID_User] || []).push(row);
    });
    const managerOf = {};
    users.forEach(x => {
      const rows = usByUser[x.ID_User] || [];
      let m = null;
      const primary = rows.find(rr => String(rr.ID_SITE) === String(x.ID_SITE) && rr.Manager_User_ID);
      if (primary) m = primary.Manager_User_ID;
      else { const any = rows.find(rr => rr.Manager_User_ID); if (any) m = any.Manager_User_ID; }
      if (m == null && x.idSuperieur) m = x.idSuperieur;
      managerOf[x.ID_User] = (m != null && byId[m]) ? Number(m) : null;
    });
    const childrenOf = {};
    users.forEach(x => {
      const m = managerOf[x.ID_User];
      if (m != null) (childrenOf[m] = childrenOf[m] || []).push(x.ID_User);
    });
    const rootIds = users.filter(x => managerOf[x.ID_User] == null).map(x => x.ID_User);

    DATA = { users, byId, siteMap, managerOf, childrenOf, rootIds };
  }

  // ---------------------------------------------------------------- filtering
  function reseaux() { return [...new Set(Object.values(DATA.siteMap).map(s => s.RESEAU).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')); }
  function affaires() { const set = new Set(); Object.values(DATA.siteMap).forEach(s => { if (s.AFFAIRE && (!state.reseau || s.RESEAU === state.reseau)) set.add(s.AFFAIRE); }); return [...set].sort((a, b) => a.localeCompare(b, 'fr')); }
  function sitesList() { return Object.values(DATA.siteMap).filter(s => (!state.reseau || s.RESEAU === state.reseau) && (!state.affaire || String(s.AFFAIRE) === state.affaire)).sort((a, b) => (a.SITE || '').localeCompare(b.SITE || '', 'fr')); }
  function isFiltering() { return !!(state.q || state.reseau || state.affaire || state.site || state.role || state.vnvo); }
  function matches(u) {
    if (!state.showInactive && String(u.status).toLowerCase() !== 'active') return false;
    const uSites = parseSites(u).map(id => DATA.siteMap[id]).filter(Boolean);
    if (state.reseau && !uSites.some(s => s.RESEAU === state.reseau)) return false;
    if (state.affaire && !uSites.some(s => String(s.AFFAIRE) === state.affaire)) return false;
    if (state.site && !parseSites(u).includes(Number(state.site))) return false;
    if (state.role && String(u.ID_Role) !== state.role) return false;
    if (state.vnvo && !(u.VN_VO || '').toUpperCase().includes(state.vnvo)) return false;
    if (state.q) {
      const q = state.q.toLowerCase();
      const sites = parseSites(u).map(id => (DATA.siteMap[id] && DATA.siteMap[id].SITE) || '').join(' ');
      const hay = [fullName(u), u.FONCTION, u.email, sites, roleMeta(u.ID_Role).label].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }
  function visibleUsers() { return DATA.users.filter(matches).sort((a, b) => roleMeta(a.ID_Role).rank - roleMeta(b.ID_Role).rank || fullName(a).localeCompare(fullName(b), 'fr')); }

  // ---------------------------------------------------------------- render bits
  function avatar(u, cls) {
    return '<span class="' + cls + '" data-tier="' + roleMeta(u.ID_Role).tier + '">' + esc(initials(u)) + '</span>';
  }
  function siteChips(u) {
    const sites = parseSites(u).slice(0, 3).map(id => (DATA.siteMap[id] && DATA.siteMap[id].SITE) || ('Site ' + id));
    const extra = parseSites(u).length - sites.length;
    let h = sites.map(nm => '<span class="an-chip">' + I.pin + esc(nm) + '</span>').join('');
    if (extra > 0) h += '<span class="an-chip">+' + extra + '</span>';
    return h;
  }
  function uniq(a) { return [...new Set(a.filter(Boolean))]; }
  function siteObjs(u) { return parseSites(u).map(id => DATA.siteMap[id]).filter(Boolean); }
  // Périmètre affiché selon le niveau de rôle
  function scopeOf(u) {
    const role = Number(u.ID_Role), objs = siteObjs(u);
    if (role === 7 || role === 8) return { items: uniq(objs.map(s => s.RESEAU)), icon: I.tag, cls: 'an-tag', vnvo: null };   // Dir marque/groupe -> marque(s)
    if (role === 6) return { items: uniq(objs.map(s => s.AFFAIRE)), icon: I.building, cls: 'an-plaque', vnvo: null };        // Dir plaque -> affaire(s)
    const sites = uniq(objs.map(s => s.SITE || null).filter(Boolean));
    if (!sites.length) uniq(parseSites(u).map(id => 'Site ' + id));
    const vnvo = (role === 3 || role === 4) ? (u.VN_VO || null) : null;                                                       // Chef/Vendeur -> site(s) + VN/VO ; Directeur -> site(s)
    return { items: sites.length ? sites : parseSites(u).map(id => 'Site ' + id), icon: I.pin, cls: '', vnvo: vnvo };
  }
  function scopeChips(u) {
    const sc = scopeOf(u), exp = state.scopeExpanded[u.ID_User];
    const shown = exp ? sc.items : sc.items.slice(0, 3);
    let h = shown.map(x => '<span class="an-chip ' + sc.cls + '">' + sc.icon + esc(x) + '</span>').join('');
    const extra = sc.items.length - shown.length;
    if (extra > 0) h += '<span class="an-chip an-more" data-more="' + u.ID_User + '">+' + extra + '</span>';
    else if (exp && sc.items.length > 3) h += '<span class="an-chip an-more" data-more="' + u.ID_User + '">−</span>';
    if (sc.vnvo) h += '<span class="an-vnvo">' + esc(sc.vnvo) + '</span>';
    return h;
  }
  function actBtns(u) {
    const tel = normPhone(u.N_de_telephone);
    return '<div class="an-actions">' +
      '<button class="an-act call' + (tel ? '' : ' dis') + '" data-act="call" data-id="' + u.ID_User + '">' + I.phone + 'Appeler</button>' +
      '<button class="an-act' + (u.email ? '' : ' dis') + '" data-act="email" data-id="' + u.ID_User + '">' + I.mail + 'Email</button>' +
      '<button class="an-act" data-act="copy" data-id="' + u.ID_User + '" title="Copier le contact">' + I.copy + '</button>' +
      '</div>';
  }
  function iconBtns(u) {
    const tel = normPhone(u.N_de_telephone);
    return '<div class="an-row-acts">' +
      '<button class="an-ico call' + (tel ? '' : ' dis') + '" data-act="call" data-id="' + u.ID_User + '" title="Appeler">' + I.phone + '</button>' +
      '<button class="an-ico' + (u.email ? '' : ' dis') + '" data-act="email" data-id="' + u.ID_User + '" title="Email">' + I.mail + '</button>' +
      '<button class="an-ico" data-act="copy" data-id="' + u.ID_User + '" title="Copier">' + I.copy + '</button>' +
      '</div>';
  }

  function renderGrid(list) {
    if (!list.length) return emptyState();
    return '<div class="an-grid">' + list.map(u => {
      const rm = roleMeta(u.ID_Role);
      return '<div class="an-card' + (String(u.status).toLowerCase() !== 'active' ? ' off' : '') + '">' +
        '<div class="an-hd">' + avatar(u, 'an-av') +
          '<div class="an-idn"><div class="an-nm">' + esc(fullName(u)) + '</div>' +
          '<div class="an-fn">' + esc(rm.label) + '</div></div></div>' +
        '<div class="an-meta">' + scopeChips(u) + '</div>' +
        actBtns(u) + '</div>';
    }).join('') + '</div>';
  }

  function renderBySite(list) {
    // regroupe par site (un user multi-site apparaît dans chacun de ses sites)
    const groups = {};
    list.forEach(u => parseSites(u).forEach(sid => { (groups[sid] = groups[sid] || []).push(u); }));
    const ids = Object.keys(groups).map(Number).sort((a, b) => {
      const A = DATA.siteMap[a], B = DATA.siteMap[b];
      return ((A && A.SITE) || '').localeCompare((B && B.SITE) || '', 'fr');
    });
    if (!ids.length) return emptyState();
    return ids.map(sid => {
      const s = DATA.siteMap[sid] || {};
      const team = groups[sid].slice().sort((a, b) => roleMeta(a.ID_Role).rank - roleMeta(b.ID_Role).rank || fullName(a).localeCompare(fullName(b), 'fr'));
      const open = isFiltering() || state.expanded['s' + sid] === true; // contracté par défaut
      return '<div class="an-site' + (open ? ' open' : '') + '" data-sid="' + sid + '">' +
        '<div class="an-site-hd" data-toggle="s' + sid + '">' + I.caret.replace('<svg', '<svg class="an-caret"') +
          '<div><div class="an-site-nm">' + esc(s.SITE || ('Site ' + sid)) + '</div>' +
          '<div class="an-site-sub">' + esc(s.VILLE || '') + (s.AFFAIRE ? ' · ' + esc(s.AFFAIRE) : '') + '</div></div>' +
          (s.RESEAU ? '<span class="an-res">' + esc(s.RESEAU) + '</span>' : '') +
          '<span class="an-site-n">' + team.length + '</span></div>' +
        '<div class="an-site-body">' + team.map(u => {
          const rm = roleMeta(u.ID_Role);
          return '<div class="an-row">' + avatar(u, 'an-av-sm') +
            '<div class="an-row-main"><div class="an-row-nm">' + esc(fullName(u)) +
            ' <span class="an-badge" data-tier="' + rm.tier + '" style="margin-left:4px">' + esc(rm.label) + '</span></div>' +
            '<div class="an-row-fn">' + esc(u.FONCTION || '') + '</div></div>' + iconBtns(u) + '</div>';
        }).join('') + '</div></div>';
    }).join('');
  }

  function renderOrg() {
    // organigramme : arbre via managerOf ; on n'affiche que les sous-arbres contenant un match
    const okId = {};
    DATA.users.filter(matches).forEach(u => { okId[u.ID_User] = true; });
    // marque aussi les ancêtres pour garder les chemins
    Object.keys(okId).forEach(id => { let m = DATA.managerOf[id]; while (m != null && !okId['keep' + m]) { okId['keep' + m] = true; m = DATA.managerOf[m]; } });
    const keep = (id) => okId[id] || okId['keep' + id];
    function subtreeCount(id) { const ch = (DATA.childrenOf[id] || []).filter(keep); return ch.reduce((n, c) => n + 1 + subtreeCount(c), 0); }
    function node(id) {
      const u = DATA.byId[id]; if (!u) return '';
      const ch = (DATA.childrenOf[id] || []).filter(keep).sort((a, b) => roleMeta(DATA.byId[a].ID_Role).rank - roleMeta(DATA.byId[b].ID_Role).rank || fullName(DATA.byId[a]).localeCompare(fullName(DATA.byId[b]), 'fr'));
      const cnt = subtreeCount(id);
      const open = isFiltering() || state.expanded['o' + id] === true;
      const rm = roleMeta(u.ID_Role);
      return '<div class="an-node' + (open ? ' open' : '') + '" data-oid="' + id + '">' +
        '<div class="an-node-row">' +
          '<span class="an-tog' + (ch.length ? '' : ' leaf') + '"' + (ch.length ? ' data-toggle="o' + id + '"' : '') + '>' + I.caret + '</span>' +
          avatar(u, 'an-av-sm') +
          '<span class="an-n-nm">' + esc(fullName(u)) + '</span>' +
          '<span class="an-badge" data-tier="' + rm.tier + '" style="margin-left:2px">' + esc(rm.label) + '</span>' +
          (cnt ? '<span class="an-n-count">' + cnt + '</span>' : '') +
          iconBtns(u).replace('an-row-acts', 'an-n-acts') +
        '</div>' +
        (ch.length ? '<div class="an-children">' + ch.map(node).join('') + '</div>' : '') +
        '</div>';
    }
    const roots = DATA.rootIds.filter(keep).sort((a, b) => roleMeta(DATA.byId[a].ID_Role).rank - roleMeta(DATA.byId[b].ID_Role).rank);
    if (!roots.length) return emptyState();
    return '<div class="an-org">' + roots.map(node).join('') + '</div>';
  }

  function emptyState() { return '<div class="an-empty">Aucun collaborateur ne correspond. Ajustez la recherche ou les filtres.</div>'; }

  // ---------------------------------------------------------------- main render
  function render() {
    const root = doc.getElementById(ROOT_ID);
    if (!root || !DATA) return;
    const list = visibleUsers();
    const total = DATA.users.filter(u => state.showInactive || String(u.status).toLowerCase() === 'active').length;

    let body;
    if (state.view === 'site') body = renderBySite(list);
    else if (state.view === 'org') body = renderOrg();
    else body = renderGrid(list);

    const roleOpts = Object.keys(ROLE_META).sort((a, b) => ROLE_META[a].rank - ROLE_META[b].rank)
      .map(id => '<option value="' + id + '"' + (state.role === id ? ' selected' : '') + '>' + esc(ROLE_META[id].label) + '</option>').join('');
    const resOpts = reseaux().map(r => '<option value="' + esc(r) + '"' + (state.reseau === r ? ' selected' : '') + '>' + esc(r) + '</option>').join('');
    const affOpts = affaires().map(a => '<option value="' + esc(a) + '"' + (state.affaire === a ? ' selected' : '') + '>' + esc(a) + '</option>').join('');
    const siteOpts = sitesList().map(s => '<option value="' + s.ID_SITE + '"' + (String(state.site) === String(s.ID_SITE) ? ' selected' : '') + '>' + esc(s.SITE || ('Site ' + s.ID_SITE)) + '</option>').join('');

    root.innerHTML =
      '<div class="an-top">' +
        '<h2 class="an-title">Annuaire</h2>' +
        '<span class="an-count">' + list.length + ' / ' + total + ' collaborateurs</span>' +
        '<div class="an-spacer"></div>' +
        '<div class="an-search">' + I.search + '<input type="text" placeholder="Rechercher un nom, une fonction, un site…" value="' + esc(state.q) + '"></div>' +
        '<div class="an-views">' +
          '<button data-view="grid" class="' + (state.view === 'grid' ? 'on' : '') + '">' + I.grid + 'Grille</button>' +
          '<button data-view="site" class="' + (state.view === 'site' ? 'on' : '') + '">' + I.site + 'Sites</button>' +
          '<button data-view="org" class="' + (state.view === 'org' ? 'on' : '') + '">' + I.org + 'Organigramme</button>' +
        '</div>' +
      '</div>' +
      '<div class="an-filters">' +
        '<div class="an-sel"><select data-f="reseau"><option value="">Tous réseaux</option>' + resOpts + '</select></div>' +
        '<div class="an-sel"><select data-f="affaire"><option value="">Toutes affaires</option>' + affOpts + '</select></div>' +
        '<div class="an-sel"><select data-f="site"><option value="">Tous les sites</option>' + siteOpts + '</select></div>' +
        '<div class="an-sel"><select data-f="role"><option value="">Tous rôles</option>' + roleOpts + '</select></div>' +
        '<div class="an-sel"><select data-f="vnvo"><option value="">VN &amp; VO</option>' +
          '<option value="VN"' + (state.vnvo === 'VN' ? ' selected' : '') + '>VN</option>' +
          '<option value="VO"' + (state.vnvo === 'VO' ? ' selected' : '') + '>VO</option></select></div>' +
        ((isFiltering() || state.showInactive) ? '<button class="an-reset" data-reset>' + I.reset + 'Réinitialiser</button>' : '') +
        '<label class="an-chk"><input type="checkbox" data-f="inactive"' + (state.showInactive ? ' checked' : '') + '>Afficher les comptes inactifs</label>' +
      '</div>' + body;

    bind(root);
  }

  function bind(root) {
    const search = root.querySelector('.an-search input');
    if (search) search.addEventListener('input', e => { state.q = e.target.value; const pos = e.target.selectionStart; render(); const ns = doc.getElementById(ROOT_ID).querySelector('.an-search input'); if (ns) { ns.focus(); try { ns.setSelectionRange(pos, pos); } catch (x) {} } });
    root.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { state.view = b.getAttribute('data-view'); render(); }));
    root.querySelectorAll('[data-f]').forEach(el => el.addEventListener('change', e => {
      const f = el.getAttribute('data-f');
      if (f === 'inactive') { state.showInactive = e.target.checked; }
      else { state[f] = e.target.value; if (f === 'reseau') { state.affaire = ''; state.site = ''; } if (f === 'affaire') { state.site = ''; } }
      render();
    }));
    root.querySelectorAll('[data-more]').forEach(el => el.addEventListener('click', ev => {
      ev.stopPropagation(); const id = el.getAttribute('data-more');
      state.scopeExpanded[id] = !state.scopeExpanded[id]; render();
    }));
    const rst = root.querySelector('[data-reset]');
    if (rst) rst.addEventListener('click', () => { state.q = ''; state.reseau = ''; state.affaire = ''; state.site = ''; state.role = ''; state.vnvo = ''; state.showInactive = false; render(); });
    root.querySelectorAll('[data-toggle]').forEach(el => el.addEventListener('click', ev => {
      ev.stopPropagation(); const k = el.getAttribute('data-toggle');
      state.expanded[k] = !(state.expanded[k] === true); render();
    }));
    root.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', ev => {
      ev.stopPropagation(); const u = DATA.byId[b.getAttribute('data-id')]; if (!u) return;
      const a = b.getAttribute('data-act');
      if (a === 'call') callUser(u); else if (a === 'email') emailUser(u); else if (a === 'copy') copyUser(u);
    }));
  }

  // ---------------------------------------------------------------- boot
  function ensureCss() {
    // IMPORTANT : le style va dans le <head>, pas dans la div — sinon render()
    // (root.innerHTML = …) l'effacerait à chaque rendu (c'était le bug d'affichage).
    if (doc.getElementById('an-css')) return;
    const head = doc.head || doc.getElementsByTagName('head')[0] || doc.documentElement;
    const st = doc.createElement('style'); st.id = 'an-css'; st.textContent = CSS; head.appendChild(st);
  }
  async function boot() {
    const root = doc.getElementById(ROOT_ID);
    if (!root) return;
    ensureCss();
    root.innerHTML = '<div class="an-loading"><div class="an-spin"></div>Chargement de l\'annuaire…</div>';
    try {
      await load();
      render();
    } catch (e) {
      console.error('[annuaire]', e);
      root.innerHTML = '<div class="an-err">Impossible de charger l\'annuaire.<br>' + esc(e.message || e) + '</div>';
    }
  }
    await boot();                          // le loader garantit que l'ancre existe
  }
});
