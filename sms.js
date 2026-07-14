// SMS (canal) — module One Data (OD.define) v1 (Lot C) — overlay, ctx.tenant/ctx.supabase
OD.define('sms', {
  mount(__anchor, ctx) {

  /* =========================================================================
     OROPRA — SMS UI  (design fidèle à la modale WhatsApp, en orange SMS)
     - Fenêtre flottante NON bloquante, DÉPLAÇABLE (drag en-tête), responsive
       (plein écran < 640px), réductible en barre. Root #oropra-sms-ui sur body.
     - Fil texturé type WhatsApp, bulles à coin coupé (orange sortant / blanc
       entrant), meta dans la bulle. Footer : dictée vocale + saisie + envoi.
     - Realtime, envoi (sms-send), suppression (sélection d'une bulle).
     - API : window.__SMS_UI__ { open, close, minimize, refresh }
     ========================================================================= */

  const SELECTED_CLIENT_VAR_ID = '55490583-c88b-4748-916e-4d203db07742';
  const SELECTED_SITE_VAR_ID = '39fecccf-9296-43b7-b5b6-eadaa928290d';
  const SMS_BODY_VAR_ID = '9fee26d2-65d3-4b66-8105-9ce1e528db9a';
  const COLLECTION_CONTACTS = '097aa7fd-e7eb-40a0-a558-d2f4e437fb0d';
  const SUPABASE_URL = ctx.tenant.supabase_url;
  const ROOT_ID = 'oropra-sms-ui';
  const ORANGE = '#e8ae28';   // header + bouton envoi
  const GREEN = '#d9fdd3';    // fond bulle sortante (identique WhatsApp)

  const doc = (__anchor.ownerDocument || document);
  const win = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window;
  function getRoot() { return doc.getElementById(ROOT_ID); }
  function ensureRoot() { let r = getRoot(); if (!r) { r = doc.createElement('div'); r.id = ROOT_ID; doc.body.appendChild(r); } return r; }
  function sb() { return ctx.supabase; }
  function anonKey() { return ctx.tenant.supabase_anon_key; }
  function readVar(id) { try { return wwLib.wwVariable.getValue(id); } catch (e) { return null; } }

  const state = window.__smsState || {};
  if (state.open === undefined) state.open = false;
  if (state.minimized === undefined) state.minimized = false;
  if (state.messages === undefined) state.messages = [];
  if (state.loading === undefined) state.loading = false;
  if (state.error === undefined) state.error = null;
  if (state.input === undefined) state.input = '';
  if (state.sending === undefined) state.sending = false;
  if (state.channel === undefined) state.channel = null;
  if (state.selectedKey === undefined) state.selectedKey = null;
  if (state.client === undefined) state.client = null;
  if (state.pos === undefined) state.pos = null;
  if (state.dictating === undefined) state.dictating = false;
  if (state.dictFinal === undefined) state.dictFinal = null;
  window.__smsState = state;
  let recog = null;

  /* ---- helpers ------------------------------------------------------------ */
  function esc(s) { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function keyOf(m) { return m.message_sid || m._tmp || ('row_' + m.id); }
  function toE164(tel) { const s = String(tel || '').trim(); if (!s) return null; if (s.startsWith('+')) return s.replace(/[^\d+]/g, ''); const d = s.replace(/\D/g, ''); if (!d) return null; return '+33' + d.replace(/^0/, ''); }
  function clientLabel(c) { if (!c) return ''; const soc = c.idmultivu === 1 || c.idmultivu === '1'; return soc ? [c.CIVILITE, c.NOM].filter(Boolean).join(' ') : [c.PRENOM, (c.NOM || '').toUpperCase()].filter(Boolean).join(' '); }
  function initials(c) { if (!c) return '?'; const soc = c.idmultivu === 1 || c.idmultivu === '1'; const a = soc ? (c.NOM || '') : (c.PRENOM || c.NOM || ''); const b = soc ? '' : (c.NOM || ''); return ((a[0] || '') + (b[0] || '')).toUpperCase() || '?'; }
  function fmtTime(iso) { try { return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function fmtDay(iso) { const d = new Date(iso); const now = new Date(); if (d.toDateString() === now.toDateString()) return "Aujourd'hui"; const y = new Date(now); y.setDate(now.getDate() - 1); if (d.toDateString() === y.toDateString()) return 'Hier'; return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function dayKey(iso) { try { return new Date(iso).toDateString(); } catch (e) { return ''; } }

  /* ---- data --------------------------------------------------------------- */
  async function loadThread(idClient) {
    state.loading = true; state.error = null; render();
    try {
      const { data, error } = await sb().from('sms_messages').select('*').eq('id_client', idClient).order('created_at', { ascending: true });
      if (error) throw error;
      state.messages = data || [];
    } catch (e) { console.error('[sms] loadThread', e); state.error = e.message || String(e); state.messages = []; }
    finally { state.loading = false; render(true); }
  }
  function upsertMessage(row, opts) {
    opts = opts || {};
    if (row.message_sid && state.messages.some(m => m.message_sid === row.message_sid)) { state.messages = state.messages.map(m => m.message_sid === row.message_sid ? Object.assign({}, m, row) : m); return; }
    if (opts.reconcileTemp && row.direction === 'outbound') { const idx = state.messages.findIndex(m => m._tmp && m.direction === 'outbound' && (m.body || '').trim() === (row.body || '').trim()); if (idx !== -1) { state.messages[idx] = row; return; } }
    state.messages.push(row);
    state.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }
  function removeMessageByRow(row) { state.messages = state.messages.filter(m => !((row.message_sid && m.message_sid === row.message_sid) || (row.id != null && m.id === row.id))); }
  function subscribeRealtime(idClient) {
    if (state.channel) { try { sb().removeChannel(state.channel); } catch (e) {} state.channel = null; }
    try {
      state.channel = sb().channel('sms_thread_' + idClient)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_messages', filter: 'id_client=eq.' + idClient },
          (payload) => { if (payload.eventType === 'DELETE') removeMessageByRow(payload.old || {}); else upsertMessage(payload.new, { reconcileTemp: true }); render(true); })
        .subscribe();
    } catch (e) { console.warn('[sms] realtime KO', e && e.message); }
  }

  /* ---- envoi -------------------------------------------------------------- */
  async function sendSms() {
    stopDictation();
    const text = (state.input || '').trim();
    if (!text || state.sending) return;
    const c = state.client || {};
    const toNumber = toE164(c.TEl_MOB);
    if (!toNumber) { state.error = 'Pas de numéro mobile pour ce client.'; render(); return; }
    const agentAuthUid = (function () { try { return wwLib.wwAuth.getUser() && wwLib.wwAuth.getUser().id; } catch (e) { return null; } })() || null;
    const idClient = c.IDVu != null ? c.IDVu : null;
    const idSite = readVar(SELECTED_SITE_VAR_ID) != null ? readVar(SELECTED_SITE_VAR_ID) : null;
    let idCycleCom = null;
    try { const contacts = (typeof collections !== 'undefined') ? (collections[COLLECTION_CONTACTS] && collections[COLLECTION_CONTACTS].data) : null; if (Array.isArray(contacts)) { const f = contacts.find(x => x.idvu == idClient); idCycleCom = f ? (f.id_cycle_com != null ? f.id_cycle_com : null) : null; } } catch (e) {}
    const tmp = '_t' + Date.now();
    state.messages.push({ _tmp: tmp, direction: 'outbound', body: text, status: 'sending', created_at: new Date().toISOString() });
    state.input = ''; state.sending = true;
    try { wwLib.wwVariable.updateValue(SMS_BODY_VAR_ID, ''); } catch (e) {}
    render(true);
    try {
      const res = await fetch(SUPABASE_URL + '/functions/v1/sms-send', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': anonKey() },
        body: JSON.stringify({ to: toNumber, body: text, agent_auth_uid: agentAuthUid, id_client: idClient, id_site: idSite, id_cycle_com: idCycleCom })
      });
      const data = await res.json();
      const m = state.messages.find(x => x._tmp === tmp);
      if (data && data.success) { if (m) { m.message_sid = data.sid; m.status = 'sent'; delete m._tmp; } }
      else { if (m) m.status = 'failed'; state.error = (data && (data.error && (data.error.message || data.error))) ? String(data.error.message || data.error) : "Échec de l'envoi"; console.error('[sms] send error', data && data.error); }
    } catch (e) { const m = state.messages.find(x => x._tmp === tmp); if (m) m.status = 'failed'; state.error = e.message || String(e); console.error('[sms] send exception', e); }
    finally { state.sending = false; render(true); }
  }

  /* ---- suppression -------------------------------------------------------- */
  async function deleteMsg(key) {
    const m = state.messages.find(x => keyOf(x) === key); if (!m) return;
    const backup = state.messages.slice();
    state.messages = state.messages.filter(x => keyOf(x) !== key);
    state.selectedKey = null; render();
    try {
      if (m._tmp && m.id == null && !m.message_sid) return;
      let q = sb().from('sms_messages').delete();
      if (m.id != null) q = q.eq('id', m.id); else if (m.message_sid) q = q.eq('message_sid', m.message_sid); else return;
      const { error } = await q; if (error) throw error;
    } catch (e) { console.error('[sms] delete', e); state.messages = backup; state.error = 'Suppression impossible : ' + (e.message || String(e)); render(); }
  }

  /* ---- dictée vocale (SMS = texte) --------------------------------------- */
  function dictSupported() { return !!(win.SpeechRecognition || win.webkitSpeechRecognition); }
  function stopDictation() { state.dictating = false; state.dictFinal = null; try { if (recog) { recog.onend = null; recog.stop(); } } catch (e) {} recog = null; }
  function toggleDictation() {
    if (state.dictating) { try { recog && recog.stop(); } catch (e) {} return; }
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SR) { win.alert("La dictée vocale n'est pas disponible sur ce navigateur."); return; }
    recog = new SR(); recog.lang = 'fr-FR'; recog.interimResults = true; recog.continuous = true;
    const base = state.input ? (state.input.replace(/\s+$/, '') + ' ') : '';
    recog.onresult = (e) => {
      let finalTxt = '', interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) finalTxt += t; else interim += t; }
      if (finalTxt) state.dictFinal = (state.dictFinal || base) + finalTxt + ' ';
      state.input = ((state.dictFinal || base) + interim).replace(/\s+/g, ' ');
      const el = getRoot() && getRoot().querySelector('.sms-inp');
      if (el) { el.value = state.input; el.style.height = 'auto'; el.style.height = Math.min(96, el.scrollHeight) + 'px'; }
      syncSendBtn();
    };
    recog.onerror = () => { state.dictating = false; state.dictFinal = null; recog = null; render(); };
    recog.onend = () => { state.dictating = false; state.dictFinal = null; recog = null; render(); };
    state.dictFinal = base; state.dictating = true;
    try { recog.start(); } catch (e) {}
    render();
  }
  function syncSendBtn() {
    const btn = getRoot() && getRoot().querySelector('[data-act="send"]');
    if (btn) btn.classList.toggle('on', (state.input || '').trim().length > 0 && !state.sending);
  }

  /* ---- icônes ------------------------------------------------------------- */
  const IC_SEND = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
  const IC_DICT = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3M9 20h6"/></svg>';
  const IC_CLOSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const IC_MIN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/></svg>';
  const IC_EXPAND = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
  const IC_TRASH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  /* ---- styles (fidèles à WhatsApp, teinte orange SMS) -------------------- */
  const STYLE = '<style>' +
    '#' + ROOT_ID + '{font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif}' +
    '#' + ROOT_ID + ' *{box-sizing:border-box}' +
    '.sms-card{position:fixed;left:24px;bottom:24px;width:min(380px,calc(100vw - 32px));height:min(620px,86vh);background:#efeae2;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 18px 52px rgba(0,0,0,.30);z-index:9990}' +
    '.sms-head{display:flex;align-items:center;gap:10px;padding:10px 12px;background:' + ORANGE + ';color:#fff;flex:0 0 auto;cursor:move;touch-action:none;user-select:none}' +
    '.sms-ava{width:38px;height:38px;border-radius:50%;background:#ffffff33;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex:0 0 auto}' +
    '.sms-hinfo{flex:1;min-width:0}' +
    '.sms-hname{font-size:15px;font-weight:600;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.sms-hsub{font-size:12px;color:#fff3df;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.sms-hbtn{background:none;border:none;color:#fff;cursor:pointer;padding:6px;display:flex;border-radius:8px}' +
    '.sms-hbtn:hover{background:#ffffff22}' +
    '.sms-body{flex:1;overflow-y:auto;padding:14px 10px 8px;background-color:#efeae2;background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\' viewBox=\'0 0 60 60\'%3E%3Cg fill=\'%23d9d0c6\' fill-opacity=\'0.35\'%3E%3Ccircle cx=\'12\' cy=\'12\' r=\'1.5\'/%3E%3Ccircle cx=\'40\' cy=\'28\' r=\'1.5\'/%3E%3Ccircle cx=\'22\' cy=\'46\' r=\'1.5\'/%3E%3C/g%3E%3C/svg%3E");display:flex;flex-direction:column;gap:2px}' +
    '.sms-daysep{align-self:center;background:#ffffffdd;color:#54656f;font-size:11px;font-weight:600;padding:4px 12px;border-radius:8px;margin:10px 0 6px;box-shadow:0 1px 1px rgba(0,0,0,.06);text-transform:uppercase;letter-spacing:.3px}' +
    '.sms-row{display:flex;margin-top:2px;align-items:center;gap:6px}' +
    '.sms-row.out{justify-content:flex-end}' +
    '.sms-row.in{justify-content:flex-start}' +
    '.sms-bubble{position:relative;max-width:78%;padding:6px 9px 8px;border-radius:9px;font-size:14px;line-height:1.35;box-shadow:0 1px .5px rgba(0,0,0,.13);word-wrap:break-word;cursor:pointer}' +
    '.sms-row.out .sms-bubble{background:' + GREEN + ';color:#111b21;border-top-right-radius:2px}' +
    '.sms-row.in .sms-bubble{background:#fff;color:#111b21;border-top-left-radius:2px}' +
    '.sms-row.failed .sms-bubble{background:#e2493f;color:#fff}' +
    '.sms-txt{white-space:pre-wrap}' +
    '.sms-meta{float:right;font-size:10.5px;margin:6px 0 -3px 10px}' +
    '.sms-row.out .sms-meta{color:#667781}' +
    '.sms-row.in .sms-meta{color:#667781}' +
    '.sms-del{border:none;background:#fff;color:#e2493f;box-shadow:0 1px 5px rgba(0,0,0,.2);width:28px;height:28px;border-radius:50%;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;order:-1}' +
    '.sms-row.in .sms-del{order:1}' +
    '.sms-foot{flex:0 0 auto;display:flex;align-items:flex-end;gap:6px;padding:8px 8px;background:#f0f2f5}' +
    '.sms-inp{flex:1;border:none;border-radius:22px;padding:10px 14px;font-size:14px;color:#111b21;outline:none;resize:none;max-height:96px;font-family:inherit;line-height:1.35;background:#fff;box-shadow:0 1px 1px rgba(0,0,0,.06)}' +
    '.sms-fbtn{width:40px;height:40px;border-radius:50%;border:none;background:none;color:#54656f;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:0 0 auto}' +
    '.sms-fbtn:hover{background:#00000010}' +
    '.sms-send{background:#cfd9e6;color:#fff}' +
    '.sms-send.on{background:' + ORANGE + ';color:#fff;cursor:pointer}' +
    '.sms-send.on:hover{background:#e6a817}' +
    '.sms-dict-on{background:#e2493f;color:#fff;animation:sms-pulse 1.1s ease-in-out infinite}' +
    '@keyframes sms-pulse{0%,100%{opacity:1}50%{opacity:.55}}' +
    '.sms-msg{margin:auto;text-align:center;color:#54656f;font-size:13px;padding:24px}' +
    '.sms-err{background:#fdecea;border-top:1px solid #f7c8c3;color:#b73a30;font-size:12px;padding:8px 12px;text-align:center}' +
    '.sms-spin{display:inline-block;width:15px;height:15px;border:2px solid rgba(255,255,255,.5);border-top-color:#fff;border-radius:50%;animation:sms-spin .7s linear infinite}' +
    '.sms-spin.dark{border-color:#e7d9c2;border-top-color:' + ORANGE + '}' +
    '@keyframes sms-spin{to{transform:rotate(360deg)}}' +
    '.sms-bar{position:fixed;left:24px;bottom:24px;width:min(300px,calc(100vw - 32px));background:' + ORANGE + ';color:#fff;border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,.24);z-index:9990;display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer}' +
    '@media(max-width:640px){.sms-card{left:0;top:0;bottom:auto;width:100vw;height:100vh;border-radius:0}.sms-bar{left:0;right:0;bottom:0;width:100vw;border-radius:0}}' +
    '</style>';

  /* ---- rendu -------------------------------------------------------------- */
  function renderBar() {
    const c = state.client || {};
    return STYLE + '<div class="sms-bar" data-act="restore">' +
      '<div class="sms-ava">' + esc(initials(c)) + '</div>' +
      '<div class="sms-hinfo"><div class="sms-hname">' + esc(clientLabel(c) || 'SMS') + '</div><div class="sms-hsub">SMS — cliquer pour rouvrir</div></div>' +
      '<button class="sms-hbtn" data-act="restore" title="Agrandir">' + IC_EXPAND + '</button>' +
      '<button class="sms-hbtn" data-act="close" title="Fermer">' + IC_CLOSE + '</button></div>';
  }
  function bubble(m) {
    const out = m.direction === 'outbound';
    const key = keyOf(m);
    const failed = m.status === 'failed';
    const selected = state.selectedKey === key;
    let meta;
    if (out && m.status === 'sending') meta = 'Envoi…'; else if (out && failed) meta = 'Échec'; else meta = fmtTime(m.created_at);
    return '<div class="sms-row ' + (out ? 'out' : 'in') + (failed ? ' failed' : '') + '">' +
      (selected ? '<button class="sms-del" data-act="del" data-key="' + esc(key) + '" title="Supprimer">' + IC_TRASH + '</button>' : '') +
      '<div class="sms-bubble" data-act="sel" data-key="' + esc(key) + '">' +
        '<span class="sms-txt">' + esc(m.body || '') + '</span>' +
        '<span class="sms-meta">' + esc(meta) + '</span>' +
      '</div></div>';
  }
  function renderMessages() {
    if (state.loading) return '<div class="sms-msg"><span class="sms-spin dark"></span><div style="margin-top:8px">Chargement…</div></div>';
    if (!state.messages.length) return '<div class="sms-msg">Aucun message pour le moment.<br>Écris le premier ci-dessous.</div>';
    let h = ''; let lastDay = null;
    for (const m of state.messages) {
      const dk = dayKey(m.created_at);
      if (dk !== lastDay) { h += '<div class="sms-daysep">' + esc(fmtDay(m.created_at)) + '</div>'; lastDay = dk; }
      h += bubble(m);
    }
    return h;
  }
  function render(scrollBottom) {
    const root = getRoot(); if (!root) return;
    if (!state.open) { root.innerHTML = ''; return; }
    if (state.minimized) { root.innerHTML = renderBar(); bindEvents(); return; }
    const c = state.client || {};
    const canSend = (state.input || '').trim().length > 0 && !state.sending;
    root.innerHTML = STYLE + '<div class="sms-card">' +
      '<div class="sms-head">' +
        '<div class="sms-ava">' + esc(initials(c)) + '</div>' +
        '<div class="sms-hinfo"><div class="sms-hname">' + esc(clientLabel(c) || 'Client') + '</div><div class="sms-hsub">' + esc(c.TEl_MOB || 'SMS') + '</div></div>' +
        '<button class="sms-hbtn" data-act="min" title="Réduire">' + IC_MIN + '</button>' +
        '<button class="sms-hbtn" data-act="close" title="Fermer">' + IC_CLOSE + '</button>' +
      '</div>' +
      '<div class="sms-body" data-act="scroll">' + renderMessages() + '</div>' +
      (state.error ? '<div class="sms-err">' + esc(state.error) + '</div>' : '') +
      '<div class="sms-foot">' +
        (dictSupported() ? '<button class="sms-fbtn ' + (state.dictating ? 'sms-dict-on' : '') + '" data-act="dict" title="Dictée vocale">' + IC_DICT + '</button>' : '') +
        '<textarea class="sms-inp" data-act="input" rows="1" placeholder="' + (state.dictating ? 'Parlez…' : 'Saisir le texte') + '">' + esc(state.input || '') + '</textarea>' +
        '<button class="sms-fbtn sms-send' + (canSend ? ' on' : '') + '" data-act="send" title="Envoyer">' + (state.sending ? '<span class="sms-spin"></span>' : IC_SEND) + '</button>' +
      '</div>' +
    '</div>';
    bindEvents();
    applyPos(root); makeDraggable(root);
    const body = root.querySelector('.sms-body'); if (body && (scrollBottom || !state._scrolled)) { body.scrollTop = body.scrollHeight; state._scrolled = true; }
  }

  function autoGrow(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 96) + 'px'; }

  /* ---- déplaçable --------------------------------------------------------- */
  function applyPos(root) {
    const card = root.querySelector('.sms-card'); if (!card || !state.pos) return;
    const w = card.offsetWidth || 360, h = card.offsetHeight || 600, vw = win.innerWidth, vh = win.innerHeight;
    card.style.left = Math.max(6, Math.min(state.pos.left, vw - w - 6)) + 'px';
    card.style.top = Math.max(6, Math.min(state.pos.top, vh - h - 6)) + 'px';
    card.style.right = 'auto'; card.style.bottom = 'auto';
  }
  function makeDraggable(root) {
    const card = root.querySelector('.sms-card'), head = root.querySelector('.sms-head');
    if (!card || !head) return;
    let sx = 0, sy = 0, sl = 0, st = 0, dragging = false;
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.sms-hbtn')) return;
      dragging = true; try { head.setPointerCapture(e.pointerId); } catch (x) {}
      const r = card.getBoundingClientRect();
      card.style.left = r.left + 'px'; card.style.top = r.top + 'px'; card.style.right = 'auto'; card.style.bottom = 'auto';
      sx = e.clientX; sy = e.clientY; sl = r.left; st = r.top; e.preventDefault();
    });
    head.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const w = card.offsetWidth, h = card.offsetHeight, vw = win.innerWidth, vh = win.innerHeight;
      card.style.left = Math.max(6, Math.min(sl + (e.clientX - sx), vw - w - 6)) + 'px';
      card.style.top = Math.max(6, Math.min(st + (e.clientY - sy), vh - h - 6)) + 'px';
    });
    const end = (e) => { if (!dragging) return; dragging = false; try { head.releasePointerCapture(e.pointerId); } catch (x) {} state.pos = { left: parseInt(card.style.left, 10), top: parseInt(card.style.top, 10) }; };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
  }

  function bindEvents() {
    const root = getRoot(); if (!root) return;
    root.querySelectorAll('[data-act="close"]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); closeUi(); }));
    root.querySelectorAll('[data-act="min"]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); setMinimized(true); }));
    root.querySelectorAll('[data-act="restore"]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); setMinimized(false); }));
    root.querySelectorAll('[data-act="send"]').forEach(el => el.addEventListener('click', () => sendSms()));
    root.querySelectorAll('[data-act="dict"]').forEach(el => el.addEventListener('click', () => toggleDictation()));
    root.querySelectorAll('[data-act="sel"]').forEach(el => el.addEventListener('click', () => { const key = el.getAttribute('data-key'); state.selectedKey = state.selectedKey === key ? null : key; render(); }));
    root.querySelectorAll('[data-act="del"]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); deleteMsg(el.getAttribute('data-key')); }));
    const input = root.querySelector('[data-act="input"]');
    if (input) {
      autoGrow(input);
      input.addEventListener('input', () => { state.input = input.value; autoGrow(input); syncSendBtn(); });
      input.addEventListener('keydown', (e) => { if (state.dictating) stopDictation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSms(); } });
      if (!state.dictating) setTimeout(() => { try { input.focus(); } catch (e) {} }, 30);
    }
  }

  /* ---- API ---------------------------------------------------------------- */
  function setMinimized(v) { state.minimized = !!v; render(true); }
  function open(opts) {
    ensureRoot();
    const c = (opts && opts.client) || readVar(SELECTED_CLIENT_VAR_ID) || {};
    state.open = true; state.minimized = false; state.client = c; state.error = null; state.input = ''; state.selectedKey = null; state._scrolled = false;
    render();
    if (c.IDVu != null) { loadThread(c.IDVu).then(() => subscribeRealtime(c.IDVu)); }
    else { state.error = 'Aucun client sélectionné.'; render(); }
  }
  function closeUi() {
    stopDictation();
    if (state.channel) { try { sb().removeChannel(state.channel); } catch (e) {} state.channel = null; }
    state.open = false; state.minimized = false; state.input = ''; state.selectedKey = null;
    const root = getRoot(); if (root) root.innerHTML = '';
    try { wwLib.wwVariable.updateValue(SMS_BODY_VAR_ID, ''); } catch (e) {}
    try { win.dispatchEvent(new CustomEvent('oropra-sms-close')); } catch (e) {}
  }

  window.__SMS_UI__ = {
    open: open, close: closeUi, minimize: setMinimized,
    refresh: () => { if (state.open && state.client && state.client.IDVu != null) loadThread(state.client.IDVu); }
  };
}
});
