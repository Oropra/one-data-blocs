// EMAIL (canal) — module One Data (OD.define) v1 (Lot C) — overlay, ctx.tenant/ctx.supabase
OD.define('email', {
  mount(__anchor, ctx) {
  /* ==========================================================================
     OROPRA — Email UI  ·  window.__EMAIL_UI__ { open, close }
     + window.handleCompose(mode, emailId)  (appelé par les cartes email Contacts)
     - Modale centrée responsive, éditeur rich-text (contenteditable).
     - Expéditeur : email_accounts (par id_user), sélecteur, 1er par défaut.
     - Destinataires To / CC / BCC, objet, corps HTML, pièces jointes.
     - Envoi : RPC enqueue_email -> invoke edge email-send.
     - Répondre / Transférer : charge l'email d'origine (table emails).
     ========================================================================== */
  const SELECTED_CLIENT_VAR_ID = '55490583-c88b-4748-916e-4d203db07742';
  const SELECTED_SITE_VAR_ID = '39fecccf-9296-43b7-b5b6-eadaa928290d';
  const ROOT_ID = 'oropra-email-ui';
  const BUCKET = 'email-attachments';
  const SUPABASE_URL = ctx.tenant.supabase_url;

  const doc = (__anchor.ownerDocument || document);
  const win = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window;
  function getRoot() { return doc.getElementById(ROOT_ID); }
  function ensureRoot() { let r = getRoot(); if (!r) { r = doc.createElement('div'); r.id = ROOT_ID; doc.body.appendChild(r); } return r; }
  function sb() { return ctx.supabase; }
  function readVar(id) { try { return wwLib.wwVariable.getValue(id); } catch (e) { return null; } }
  function anonKey() { return ctx.tenant.supabase_anon_key; }
  function me() { return (win.oropraUser) || {}; }
  function esc(s) { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function clientLabel(c) { if (!c) return ''; const soc = c.idmultivu === 1 || c.idmultivu === '1'; return (soc ? [c.CIVILITE, c.NOM] : [c.CIVILITE, c.PRENOM, c.NOM]).filter(Boolean).join(' ').trim(); }

  const state = window.__emailState || {};
  if (state.open === undefined) state.open = false;
  if (state.mode === undefined) state.mode = 'new';       // new | reply | forward
  if (state.accounts === undefined) state.accounts = [];
  if (state.fromId === undefined) state.fromId = null;
  if (state.toChips === undefined) state.toChips = [];   // {email,name,locked} — À
  if (state.ccChips === undefined) state.ccChips = [];   // {email,name}
  if (state.bccChips === undefined) state.bccChips = [];
  if (state.rcptInput === undefined) state.rcptInput = { field: null, text: '' };
  if (state.sugg === undefined) state.sugg = [];
  if (state.suggIdx === undefined) state.suggIdx = -1;
  if (state.showCc === undefined) state.showCc = false;
  if (state.subject === undefined) state.subject = '';
  if (state.bodyHtml === undefined) state.bodyHtml = '';
  if (state.attachments === undefined) state.attachments = []; // {filename,mime_type,size_bytes,storage_path,is_inline,_uploading}
  if (state.replyToId === undefined) state.replyToId = null;
  if (state.forwardOfId === undefined) state.forwardOfId = null;
  if (state.sending === undefined) state.sending = false;
  if (state.error === undefined) state.error = null;
  if (state.client === undefined) state.client = null;
  if (state.sigOn === undefined) state.sigOn = true;
  if (state.sigPanel === undefined) state.sigPanel = false;
  if (state.sigDraft === undefined) state.sigDraft = '';
  if (state.sigSaving === undefined) state.sigSaving = false;
  window.__emailState = state;

  function currentAccount() { return state.accounts.find(a => a.id === state.fromId) || null; }
  function currentSignature() { const a = currentAccount(); return (a && a.signature_html) ? a.signature_html : ''; }
  function buildSigBlock() { const sig = currentSignature(); return sig ? '<div data-oropra-sig="1"><br>--<br>' + sig + '</div>' : ''; }
  // (Ré)injecte ou retire la signature selon le toggle, placée avant un éventuel
  // bloc cité (réponse/transfert).
  function applySignature() {
    const ed = getRoot() && getRoot().querySelector('.em-body');
    let html = ed ? ed.innerHTML : state.bodyHtml;
    html = html.replace(/<div data-oropra-sig="1">[\s\S]*?<\/div>/, '');
    if (state.sigOn) {
      const sig = buildSigBlock();
      if (sig) {
        const idx = html.indexOf('<blockquote');
        if (idx >= 0) { const cut = html.lastIndexOf('<br><br>', idx); const at = cut >= 0 ? cut : idx; html = html.slice(0, at) + sig + html.slice(at); }
        else { html = html + sig; }
      }
    }
    state.bodyHtml = html; if (ed) ed.innerHTML = html;
  }

  function parseArr(v) { try { if (Array.isArray(v)) return v; if (typeof v === 'string' && v.trim()) return JSON.parse(v); } catch (e) { } return []; }
  function isEmail(v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || '').trim()); }
  function chipsFor(field) { return field === 'to' ? state.toChips : field === 'cc' ? state.ccChips : state.bccChips; }
  function addChip(field, email, name, locked) {
    email = String(email || '').trim(); if (!isEmail(email)) return false;
    const arr = chipsFor(field);
    if (arr.some(c => c.email.toLowerCase() === email.toLowerCase())) return true; // déjà présent
    arr.push({ email: email, name: name || null, locked: !!locked });
    return true;
  }
  function removeChip(field, email) { const arr = chipsFor(field); const i = arr.findIndex(c => c.email === email && !c.locked); if (i >= 0) arr.splice(i, 1); }
  // recherche live USER (nom / prénom / email)
  let suggTimer = null;
  function searchUsers(field, q) {
    clearTimeout(suggTimer);
    suggTimer = setTimeout(async () => {
      const term = q.trim();
      if (term.length < 2) { state.sugg = []; state.suggIdx = -1; paintSugg(field); return; }
      try {
        const or = 'nomComplet.ilike.%' + term + '%,email.ilike.%' + term + '%,nom.ilike.%' + term + '%,prenom.ilike.%' + term + '%';
        const res = await sb().from('USER').select('email, nomComplet, prenom, nom, FONCTION, SITE').or(or).not('email', 'is', null).limit(6);
        const seen = {};
        state.sugg = (res.data || []).filter(u => u.email && !seen[u.email] && (seen[u.email] = 1));
        state.suggIdx = state.sugg.length ? 0 : -1;
      } catch (e) { state.sugg = []; state.suggIdx = -1; }
      paintSugg(field);
    }, 180);
  }
  function suggItemsHtml() {
    return state.sugg.map((u, i) => '<div class="em-sugg-i' + (i === state.suggIdx ? ' sel' : '') + '" data-sugg-email="' + esc(u.email) + '" data-sugg-name="' + esc(u.nomComplet || [u.prenom, u.nom].filter(Boolean).join(' ')) + '">' +
      '<span class="nm">' + esc(u.nomComplet || [u.prenom, u.nom].filter(Boolean).join(' ')) + '</span>' +
      '<span class="em">' + esc(u.email) + '</span>' +
      (u.FONCTION || u.SITE ? '<span class="mt">' + esc([u.FONCTION, u.SITE].filter(Boolean).join(' · ')) + '</span>' : '') +
      '</div>').join('');
  }
  // Met à jour la liste EN PLACE (sans re-render de la modale -> l'input garde le focus)
  function paintSugg(field) {
    const root = getRoot(); if (!root) return;
    const box = root.querySelector('[data-suggbox="' + field + '"]'); if (!box) return;
    if (!state.sugg.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
    box.innerHTML = suggItemsHtml(); box.style.display = 'block';
    box.querySelectorAll('.em-sugg-i').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        addChip(field, el.getAttribute('data-sugg-email'), el.getAttribute('data-sugg-name'));
        state.rcptInput.text = ''; state.sugg = []; state.suggIdx = -1; render();
      });
    });
  }
  function commitInput(field) {
    const t = state.rcptInput.text.trim();
    if (state.suggIdx >= 0 && state.sugg[state.suggIdx]) { const u = state.sugg[state.suggIdx]; addChip(field, u.email, u.nomComplet || [u.prenom, u.nom].filter(Boolean).join(' ')); }
    else if (isEmail(t)) { addChip(field, t); }
    else return false;
    state.rcptInput.text = ''; state.sugg = []; state.suggIdx = -1; return true;
  }
  function fmtDateFR(d) { const dt = new Date(d); if (isNaN(dt)) return ''; const p = n => String(n).padStart(2, '0'); return p(dt.getDate()) + '/' + p(dt.getMonth() + 1) + '/' + dt.getFullYear() + ' ' + p(dt.getHours()) + ':' + p(dt.getMinutes()); }
  function fmtSize(b) { if (!b) return ''; if (b < 1024) return b + ' o'; if (b < 1048576) return Math.round(b / 1024) + ' Ko'; return (b / 1048576).toFixed(1) + ' Mo'; }

  /* ---- chargement comptes expéditeurs ---- */
  async function loadAccounts() {
    try {
      const uid = me().ID_User;
      const res = await sb().from('email_accounts').select('id, email_address, display_name, status, id_site, signature_html').eq('id_user', Number(uid));
      let rows = res.data || [];
      // comptes connectés d'abord
      rows.sort((a, b) => (a.status === 'connected' ? 0 : 1) - (b.status === 'connected' ? 0 : 1));
      state.accounts = rows;
      if (!state.fromId && rows.length) state.fromId = rows[0].id;
    } catch (e) { console.warn('[email] accounts', e); state.accounts = []; }
  }

  /* ---- contexte CRM (client + site + cycle en cours) ---- */
  async function crmContext() {
    const client = state.client || readVar(SELECTED_CLIENT_VAR_ID) || {};
    const idvu = client.IDVu != null ? Number(client.IDVu) : null;
    const site = readVar(SELECTED_SITE_VAR_ID);
    let idCycle = null;
    if (idvu != null) {
      try {
        let q = sb().from('CYCLE_COM').select('id_cycle_com').eq('id_client', idvu).ilike('status', '%Ouvert%').order('id_cycle_com', { ascending: false }).limit(1);
        if (site != null && site !== '') q = q.eq('id_site', Number(site));
        const c = await q.maybeSingle();
        idCycle = c.data ? c.data.id_cycle_com : null;
      } catch (e) { }
    }
    return { id_client: idvu, id_site: site != null && site !== '' ? Number(site) : null, id_cycle_com: idCycle };
  }

  /* ---- reply / forward : charge l'email d'origine ---- */
  async function prefillFrom(emailId, mode) {
    try {
      const res = await sb().from('emails').select('*').eq('id', emailId).maybeSingle();
      const e = res.data; if (!e) return;
      const subj = e.subject || '';
      const quoted = '<br><br><blockquote style="margin:0;border-left:3px solid #d6e2f2;padding-left:12px;color:#5a7196">' +
        'Le ' + fmtDateFR(e.received_at || e.created_at) + ', ' + esc(e.from_name || e.from_email || '') + ' &lt;' + esc(e.from_email || '') + '&gt; a écrit&nbsp;:<br>' +
        (e.body_html || esc(e.body_text || '').replace(/\n/g, '<br>')) + '</blockquote>';
      state.bodyHtml = quoted;
      if (mode === 'reply') {
        state.subject = /^re\s*:/i.test(subj) ? subj : 'Re: ' + subj;
        // répondre : si mail entrant -> à l'expéditeur ; si sortant -> au 1er destinataire
        const rTo = e.direction === 'outbound' ? (parseArr(e.to_emails)[0] || '') : (e.from_email || '');
        if (rTo) addChip('to', rTo, e.from_name, true);
        state.replyToId = emailId; state.forwardOfId = null;
      } else {
        state.subject = /^fwd?\s*:/i.test(subj) ? subj : 'Fwd: ' + subj;
        state.to = ''; state.forwardOfId = emailId; state.replyToId = null;
      }
    } catch (e) { console.warn('[email] prefill', e); }
  }

  /* ---- pièces jointes ---- */
  function pickFiles() {
    const inp = doc.createElement('input'); inp.type = 'file'; inp.multiple = true;
    inp.onchange = () => { Array.from(inp.files || []).forEach(uploadFile); };
    inp.click();
  }
  const MAX_ATT_BYTES = 20 * 1024 * 1024; // 20 Mo par fichier
  async function uploadFile(file) {
    if (file.size > MAX_ATT_BYTES) {
      state.error = 'Fichier trop volumineux : ' + fmtSize(file.size) + ' (max 20 Mo). Privilégiez un lien de partage.';
      render(); return;
    }
    state.error = null; // fichier accepté -> on efface un éventuel warning précédent
    const entry = { filename: file.name, mime_type: file.type || 'application/octet-stream', size_bytes: file.size, storage_path: null, is_inline: false, _uploading: true, _key: Math.random().toString(36).slice(2) };
    state.attachments.push(entry); render();
    try {
      // Le bucket email-attachments est en RLS (service_role only) : on uploade
      // via l'edge function email-attachment-upload plutôt qu'en direct.
      const fd = new FormData();
      fd.append('file', file, file.name);
      fd.append('account_id', String(state.fromId || 'acc'));
      const r = await fetch(SUPABASE_URL + '/functions/v1/email-attachment-upload', {
        method: 'POST', headers: { apikey: anonKey(), Authorization: 'Bearer ' + anonKey() }, body: fd
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 413 || j.error === 'file_too_large') throw new Error('trop volumineux (max 20 Mo)');
      if (!r.ok || !j.ok || !j.storage_path) throw new Error(j.error || ('HTTP ' + r.status));
      entry.storage_path = j.storage_path;
      entry.filename = j.filename || entry.filename;
      entry.mime_type = j.mime_type || entry.mime_type;
      if (j.size_bytes != null) entry.size_bytes = j.size_bytes;
      entry._uploading = false; render();
    } catch (e) {
      console.error('[email] upload', e);
      state.attachments = state.attachments.filter(a => a._key !== entry._key);
      state.error = 'Échec upload ' + file.name + ' : ' + (e.message || e); render();
    }
  }
  function removeAtt(key) { state.attachments = state.attachments.filter(a => a._key !== key); render(); }

  /* ---- envoi ---- */
  async function send() {
    if (state.sending) return;
    // committe une saisie en cours éventuelle
    if (state.rcptInput.field && state.rcptInput.text.trim()) commitInput(state.rcptInput.field);
    if (!state.fromId) { state.error = 'Sélectionnez un compte expéditeur.'; render(); return; }
    if (!state.toChips.length) { state.error = 'Ajoutez au moins un destinataire.'; render(); return; }
    if (!state.subject.trim()) { state.error = "L'objet est obligatoire."; render(); return; }
    if (state.attachments.some(a => a._uploading)) { state.error = 'Pièces jointes en cours d\'envoi…'; render(); return; }
    // corps depuis l'éditeur
    const ed = getRoot() && getRoot().querySelector('.em-body'); if (ed) state.bodyHtml = ed.innerHTML;
    state.error = null; state.sending = true; render();
    try {
      const ctx = await crmContext();
      const attForRpc = state.attachments.filter(a => a.storage_path).map(a => ({ filename: a.filename, mime_type: a.mime_type, size_bytes: a.size_bytes, storage_path: a.storage_path, is_inline: false }));
      const { data: emailId, error: rpcErr } = await sb().rpc('enqueue_email', {
        p_account_id: state.fromId,
        p_to_emails: state.toChips.map(c => ({ email: c.email, name: c.name || null })),
        p_cc_emails: state.ccChips.map(c => ({ email: c.email, name: c.name || null })),
        p_bcc_emails: state.bccChips.map(c => ({ email: c.email, name: c.name || null })),
        p_subject: state.subject.trim(),
        p_body_html: state.bodyHtml,
        p_body_text: null,
        p_reply_to_email_id: state.replyToId,
        p_forward_of_email_id: state.forwardOfId,
        p_attachments: attForRpc,
        p_id_client: ctx.id_client,
        p_id_cycle_com: ctx.id_cycle_com,
        p_id_site: ctx.id_site
      });
      if (rpcErr) throw new Error(rpcErr.message);
      if (!emailId) throw new Error("enqueue_email n'a pas retourné d'id.");
      const { data: sendData, error: sendErr } = await sb().functions.invoke('email-send', { body: { email_id: emailId } });
      if (sendErr) throw new Error(sendErr.message);
      if (sendData && sendData.error) throw new Error(sendData.error);
      // succès
      state.sending = false; api.close();
      // rafraîchit Contacts (l'email va apparaître dans la timeline)
      try { if (window.__contactsState) { window.__contactsState.rows = null; } const cdiv = doc.getElementById('oropra-contacts-root'); if (cdiv) cdiv.innerHTML = ''; } catch (e) { }
    } catch (e) { console.error('[email] send', e); state.sending = false; state.error = e.message || String(e); render(); }
  }

  /* ---- styles (modale centrée responsive) ---- */
  const STYLE = '<style>' +
    '#' + ROOT_ID + '{font-family:"Nunito Sans",system-ui,sans-serif;color:#1F4A85}' +
    '#' + ROOT_ID + ' *{box-sizing:border-box}' +
    '.em-ov{position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px}' +
    '.em-bg{position:absolute;inset:0;background:rgba(20,40,80,.45)}' +
    '.em-box{position:relative;background:#fff;border-radius:16px;width:min(760px,100%);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(20,40,80,.35);overflow:hidden}' +
    '.em-hd{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#eef4fc;border-bottom:1px solid #dbe6f5}' +
    '.em-title{font-size:15px;font-weight:800;color:#1F4A85}' +
    '.em-x{border:none;background:none;font-size:24px;line-height:1;color:#5a7196;cursor:pointer;padding:0 4px}.em-x:hover{color:#1F4A85}' +
    '.em-fields{padding:6px 18px 0}' +
    '.em-row{display:flex;align-items:center;gap:8px;border-bottom:1px solid #eef2f8;padding:8px 0}' +
    '.em-lbl{font-size:12px;font-weight:700;color:#7a98c5;width:52px;flex:0 0 auto}' +
    '.em-in{flex:1;border:none;outline:none;font:inherit;font-size:14px;color:#1F4A85;background:none;min-width:0}' +
    '.em-sel{flex:1;border:none;outline:none;font:inherit;font-size:14px;color:#1F4A85;background:none}' +
    '.em-ccbtn{border:none;background:none;color:#2a5ea9;font:inherit;font-size:12px;font-weight:700;cursor:pointer;flex:0 0 auto;align-self:flex-start;margin-top:3px}' +
    '.em-rcpt{align-items:flex-start;position:relative}' +
    '.em-chips{display:flex;flex-wrap:wrap;gap:5px;flex:1;align-items:center;min-width:0;padding:1px 0}' +
    '.em-chip2{display:inline-flex;align-items:center;gap:5px;background:#eef4fc;border:1px solid #d6e2f2;color:#1F4A85;border-radius:8px;padding:3px 8px;font-size:12.5px;max-width:100%}' +
    '.em-chip2.lock{background:#1F4A85;border-color:#1F4A85;color:#fff}' +
    '.em-chip2 .rmc{border:none;background:none;color:#7a98c5;cursor:pointer;font-size:14px;line-height:1;padding:0}' +
    '.em-chip2 .rmc:hover{color:#e24b4a}' +
    '.em-rcpt-in{border:none;outline:none;flex:1;min-width:130px;font:inherit;font-size:14px;color:#1F4A85;background:none;padding:3px 0}' +
    '.em-sugg{position:absolute;top:100%;left:52px;right:0;background:#fff;border:1px solid #dbe6f5;border-radius:10px;box-shadow:0 12px 30px rgba(20,40,80,.18);z-index:5;margin-top:2px;overflow:hidden;max-height:260px;overflow-y:auto}' +
    '.em-sugg-i{display:flex;flex-direction:column;gap:1px;padding:7px 12px;cursor:pointer}' +
    '.em-sugg-i:hover,.em-sugg-i.sel{background:#eef4fc}' +
    '.em-sugg-i .nm{font-size:13px;font-weight:700;color:#1F4A85}' +
    '.em-sugg-i .em{font-size:12px;color:#5a7196}' +
    '.em-sugg-i .mt{font-size:11px;color:#adc0dd}' +
    '.em-tools{display:flex;flex-wrap:wrap;gap:2px;align-items:center;padding:8px 14px;border-bottom:1px solid #eef2f8;background:#fafcff}' +
    '.em-tb{width:32px;height:30px;border:none;background:none;border-radius:7px;color:#5a7196;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:15px}' +
    '.em-tb:hover{background:#e6eef8;color:#1F4A85}' +
    '.em-tb b,.em-tb i,.em-tb u,.em-tb s{pointer-events:none}' +
    '.em-sep{width:1px;height:20px;background:#dbe6f5;margin:0 4px}' +
    '.em-color{width:22px;height:22px;border:1px solid #dbe6f5;border-radius:6px;padding:0;cursor:pointer;background:#1F4A85}' +
    '.em-body{flex:1;overflow-y:auto;padding:16px 18px;font-size:14px;line-height:1.6;color:#1F4A85;outline:none;min-height:180px}' +
    '.em-body:empty:before{content:attr(data-ph);color:#adc0dd}' +
    '.em-att{display:flex;flex-wrap:wrap;gap:8px;padding:0 18px 10px}' +
    '.em-chip{display:inline-flex;align-items:center;gap:7px;background:#f2f6fc;border:1px solid #dbe6f5;border-radius:9px;padding:6px 10px;font-size:12px;color:#1F4A85;max-width:240px}' +
    '.em-chip .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.em-chip .sz{color:#7a98c5}' +
    '.em-chip .rm{border:none;background:none;color:#adc0dd;cursor:pointer;font-size:16px;line-height:1}.em-chip .rm:hover{color:#e24b4a}' +
    '.em-chip .sp{width:12px;height:12px;border:2px solid #c9dcf3;border-top-color:#2a5ea9;border-radius:50%;animation:em-spin .7s linear infinite}' +
    '@keyframes em-spin{to{transform:rotate(360deg)}}' +
    '.em-ft{display:flex;align-items:center;gap:10px;padding:12px 18px;border-top:1px solid #eef2f8;background:#fafcff;justify-content:space-between;flex-wrap:wrap}' +
    '.em-ft-l,.em-ft-r{display:flex;align-items:center;gap:8px}' +
    '.em-send{background:#1F4A85;color:#fff;border:none;border-radius:10px;padding:10px 20px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:8px}' +
    '.em-send:hover{background:#163a6b}.em-send:disabled{opacity:.6;cursor:default}' +
    '.em-clip{width:38px;height:38px;border:1px solid #dbe6f5;background:#fff;border-radius:10px;color:#5a7196;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}.em-clip:hover{background:#f2f6fc}' +
    '.em-err{color:#e24b4a;font-size:12.5px;flex:1;min-width:120px}' +
    '.em-cancel{border:none;background:none;color:#7a98c5;font:inherit;font-size:13px;font-weight:600;cursor:pointer}' +
    '.em-spin2{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.5);border-top-color:#fff;border-radius:50%;animation:em-spin .7s linear infinite}' +
    '.em-sig-toggle{display:inline-flex;align-items:center;gap:7px;border:none;background:none;font:inherit;font-size:12.5px;font-weight:700;color:#7a98c5;cursor:pointer;padding:4px 6px;border-radius:8px}' +
    '.em-sig-toggle.on{color:#1F4A85}' +
    '.em-sig-toggle .sw{width:30px;height:17px;border-radius:9px;background:#c9d3e3;position:relative;transition:background .15s;flex:0 0 auto}' +
    '.em-sig-toggle.on .sw{background:#2a5ea9}' +
    '.em-sig-toggle .kn{position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:#fff;transition:left .15s}' +
    '.em-sig-toggle.on .kn{left:15px}' +
    '.em-sig-cfg{border:1px solid #dbe6f5;background:#fff;border-radius:8px;width:30px;height:30px;color:#5a7196;cursor:pointer;font-size:14px;display:inline-flex;align-items:center;justify-content:center;line-height:1;padding:0;flex:0 0 auto}.em-sig-cfg:hover{background:#f2f6fc;color:#1F4A85}' +
    '.em-sig-ov{position:fixed;inset:0;background:rgba(20,40,80,.45);display:flex;align-items:center;justify-content:center;padding:20px;z-index:10002}' +
    '.em-sig-box{background:#fff;border-radius:14px;width:min(560px,100%);max-height:80%;display:flex;flex-direction:column;box-shadow:0 18px 44px rgba(20,40,80,.3);overflow:hidden}' +
    '.em-sig-hd{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#eef4fc;border-bottom:1px solid #dbe6f5;font-weight:800;font-size:14px;color:#1F4A85}' +
    '.em-sig-tools{display:flex;flex-wrap:wrap;gap:2px;align-items:center;padding:6px 12px;border-bottom:1px solid #eef2f8;background:#fafcff}' +
    '.em-sig-tb{width:30px;height:28px;border:none;background:none;border-radius:6px;color:#5a7196;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:14px}' +
    '.em-sig-tb:hover{background:#e6eef8;color:#1F4A85}' +
    '.em-sig-ed{flex:1;min-height:150px;overflow-y:auto;padding:14px 16px;font-size:14px;line-height:1.5;color:#1F4A85;outline:none}' +
    '.em-sig-ed img{max-width:100%}' +
    '.em-sig-ed:empty:before{content:attr(data-ph);color:#adc0dd}' +
    '.em-sig-ft{display:flex;align-items:center;gap:10px;padding:10px 16px;border-top:1px solid #eef2f8;background:#fafcff}' +
    '.em-sig-hint{flex:1;font-size:11.5px;color:#7a98c5}' +
    '@media(max-width:640px){.em-ov{padding:0}.em-box{width:100%;height:100%;max-height:100%;border-radius:0}.em-lbl{width:42px}}' +
    '</style>';

  function cmd(c, v) { try { doc.execCommand(c, false, v || null); } catch (e) { } const ed = getRoot() && getRoot().querySelector('.em-body'); if (ed) { state.bodyHtml = ed.innerHTML; ed.focus(); } }

  function toolbar() {
    const tb = (c, label, title, arg) => '<button class="em-tb" title="' + title + '" data-cmd="' + c + '"' + (arg ? ' data-arg="' + arg + '"' : '') + '>' + label + '</button>';
    return '<div class="em-tools">' +
      tb('bold', '<b>B</b>', 'Gras') + tb('italic', '<i>I</i>', 'Italique') + tb('underline', '<u>U</u>', 'Souligné') + tb('strikeThrough', '<s>S</s>', 'Barré') +
      '<span class="em-sep"></span>' +
      tb('justifyLeft', '⯇', 'Aligner à gauche') + tb('justifyCenter', '≡', 'Centrer') + tb('justifyRight', '⯈', 'Aligner à droite') +
      '<span class="em-sep"></span>' +
      tb('insertUnorderedList', '•', 'Liste à puces') + tb('insertOrderedList', '1.', 'Liste numérotée') +
      tb('createLink', '🔗', 'Lien') +
      '<input type="color" class="em-color" title="Couleur du texte" value="#1F4A85">' +
      '<span class="em-sep"></span>' +
      tb('undo', '↶', 'Annuler') + tb('redo', '↷', 'Rétablir') +
      '</div>';
  }

  function accountsHtml() {
    if (!state.accounts.length) return '<span class="em-in" style="color:#adc0dd">Aucun compte email connecté</span>';
    if (state.accounts.length === 1) { const a = state.accounts[0]; return '<span class="em-in">' + esc(a.display_name || a.email_address) + ' &lt;' + esc(a.email_address) + '&gt;</span>'; }
    return '<select class="em-sel" data-act="from">' + state.accounts.map(a => '<option value="' + esc(a.id) + '"' + (a.id === state.fromId ? ' selected' : '') + '>' + esc(a.display_name || a.email_address) + ' <' + esc(a.email_address) + '>' + (a.status !== 'connected' ? ' (déconnecté)' : '') + '</option>').join('') + '</select>';
  }

  function chipHtml(field, c) {
    return '<span class="em-chip2' + (c.locked ? ' lock' : '') + '" title="' + esc(c.email) + '">' +
      esc(c.name || c.email) + (c.locked ? '' : '<button class="rmc" data-rmchip="' + field + '|' + esc(c.email) + '">&times;</button>') + '</span>';
  }
  function rcptRow(field, label, extra) {
    const chips = chipsFor(field).map(c => chipHtml(field, c)).join('');
    const active = state.rcptInput.field === field;
    const val = active ? state.rcptInput.text : '';
    return '<div class="em-row em-rcpt"><span class="em-lbl">' + label + '</span>' +
      '<div class="em-chips">' + chips +
      '<input class="em-in em-rcpt-in" data-rcpt="' + field + '" placeholder="' + (chipsFor(field).length ? '' : 'Nom ou email…') + '" value="' + esc(val) + '">' +
      '</div>' + extra +
      '<div class="em-sugg" data-suggbox="' + field + '" style="display:none"></div></div>';
  }

  function render() {
    const root = getRoot(); if (!root) return;
    if (!state.open) { root.innerHTML = ''; return; }
    const title = state.mode === 'reply' ? 'Répondre' : state.mode === 'forward' ? 'Transférer' : 'Nouveau message';
    const attHtml = state.attachments.length ? '<div class="em-att">' + state.attachments.map(a =>
      '<span class="em-chip"><span class="nm">' + esc(a.filename) + '</span>' + (a._uploading ? '<span class="sp"></span>' : '<span class="sz">' + fmtSize(a.size_bytes) + '</span><button class="rm" data-rm="' + a._key + '">&times;</button>') + '</span>'
    ).join('') + '</div>' : '';

    root.innerHTML = STYLE + '<div class="em-ov"><div class="em-bg" data-act="bg"></div><div class="em-box">' +
      '<div class="em-hd"><span class="em-title">' + title + '</span><button class="em-x" data-act="close">&times;</button></div>' +
      '<div class="em-fields">' +
      '<div class="em-row"><span class="em-lbl">De</span>' + accountsHtml() + '</div>' +
      rcptRow('to', 'À', (state.showCc ? '' : '<button class="em-ccbtn" data-act="togglecc">Cc/Cci</button>')) +
      (state.showCc ? rcptRow('cc', 'Cc', '') + rcptRow('bcc', 'Cci', '') : '') +
      '<div class="em-row"><span class="em-lbl">Objet</span><input class="em-in" data-act="subject" placeholder="Objet du message" value="' + esc(state.subject) + '"></div>' +
      '</div>' +
      toolbar() +
      '<div class="em-body" contenteditable="true" data-ph="Rédigez votre message…">' + state.bodyHtml + '</div>' +
      attHtml +
      '<div class="em-ft"><div class="em-ft-l"><button class="em-clip" data-act="attach" title="Joindre un fichier"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>' +
      '<button class="em-sig-toggle' + (state.sigOn ? ' on' : '') + '" data-act="sigtoggle" title="Signature automatique"><span class="sw"><span class="kn"></span></span>Signature</button>' +
      '<button class="em-sig-cfg" data-act="sigcfg" title="Paramétrer la signature">&#9998;</button>' +
      '</div>' +
      (state.error ? '<span class="em-err">' + esc(state.error) + '</span>' : '') +
      '<div class="em-ft-r">' +
      '<button class="em-cancel" data-act="close">Annuler</button>' +
      '<button class="em-send" data-act="send"' + (state.sending ? ' disabled' : '') + '>' + (state.sending ? '<span class="em-spin2"></span> Envoi…' : 'Envoyer') + '</button>' +
      '</div>' +
      '</div>' +
      '</div></div>' + sigPanelHtml();
    bind(root);
    if (state.rcptInput.field) {
      const inp = root.querySelector('[data-rcpt="' + state.rcptInput.field + '"]');
      if (inp) { inp.focus(); try { const v = inp.value; inp.value = ''; inp.value = v; } catch (e) { } }
    }
  }

  function sigPanelHtml() {
    if (!state.sigPanel) return '';
    const a = currentAccount(); const who = a ? (a.display_name || a.email_address) : '';
    return '<div class="em-sig-ov"><div class="em-sig-box">' +
      '<div class="em-sig-hd"><span>Signature — ' + esc(who) + '</span><button class="em-x" data-act="sigclose">&times;</button></div>' +
      sigToolbar() +
      '<div class="em-sig-ed" contenteditable="true" data-ph="Votre signature…">' + (state.sigDraft || '') + '</div>' +
      '<div class="em-sig-ft"><span class="em-sig-hint">Astuce : la signature s\'ajoute automatiquement si le bouton « Signature » est activé.</span>' +
      '<button class="em-cancel" data-act="sigclose">Annuler</button>' +
      '<button class="em-send" data-act="sigsave"' + (state.sigSaving ? ' disabled' : '') + '>' + (state.sigSaving ? 'Enregistrement…' : 'Enregistrer') + '</button></div>' +
      '</div></div>';
  }

  function sigToolbar() {
    const tb = (c, l, t) => '<button class="em-sig-tb" title="' + t + '" data-sigcmd="' + c + '">' + l + '</button>';
    return '<div class="em-sig-tools">' +
      tb('bold', '<b>B</b>', 'Gras') + tb('italic', '<i>I</i>', 'Italique') + tb('underline', '<u>U</u>', 'Souligné') + tb('strikeThrough', '<s>S</s>', 'Barré') +
      '<span class="em-sep"></span>' +
      tb('justifyLeft', '⯇', 'Aligner à gauche') + tb('justifyCenter', '≡', 'Centrer') + tb('justifyRight', '⯈', 'Aligner à droite') +
      '<span class="em-sep"></span>' +
      tb('insertUnorderedList', '•', 'Liste') + tb('createLink', '🔗', 'Lien') +
      '<input type="color" class="em-sig-color em-color" title="Couleur du texte" value="#1F4A85">' +
      '<span class="em-sep"></span>' +
      tb('image', '🖼', 'Insérer un logo / une image') +
      '</div>';
  }
  function sigCmd(c, v) { const ed = getRoot() && getRoot().querySelector('.em-sig-ed'); if (ed) ed.focus(); try { doc.execCommand(c, false, v || null); } catch (e) { } if (ed) state.sigDraft = ed.innerHTML; }
  function pickSigImage() {
    const inp = doc.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) uploadSigImage(f); };
    inp.click();
  }
  async function uploadSigImage(file) {
    if (file.size > 2 * 1024 * 1024) { state.error = 'Logo trop lourd (max 2 Mo).'; render(); return; }
    state.error = null;
    try {
      const fd = new FormData();
      fd.append('file', file, file.name); fd.append('bucket', 'email-assets'); fd.append('account_id', String(state.fromId || 'acc'));
      const r = await fetch(SUPABASE_URL + '/functions/v1/email-attachment-upload', { method: 'POST', headers: { apikey: anonKey(), Authorization: 'Bearer ' + anonKey() }, body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.public_url) throw new Error(j.error || ('HTTP ' + r.status));
      const ed = getRoot() && getRoot().querySelector('.em-sig-ed');
      if (ed) { ed.focus(); try { doc.execCommand('insertHTML', false, '<img src="' + j.public_url + '" style="max-width:220px;height:auto">'); } catch (e) { } state.sigDraft = ed.innerHTML; }
    } catch (e) { console.error('[email] sig image', e); state.error = 'Échec insertion image : ' + (e.message || e); render(); }
  }

  async function saveSignature() {
    const a = currentAccount(); if (!a || state.sigSaving) return;
    const ed = getRoot() && getRoot().querySelector('.em-sig-ed'); const html = ed ? ed.innerHTML : (state.sigDraft || '');
    state.sigSaving = true; render();
    try {
      const r = await sb().from('email_accounts').update({ signature_html: html }).eq('id', a.id);
      if (r.error) throw r.error;
      a.signature_html = html;
      state.sigSaving = false; state.sigPanel = false;
      applySignature(); render();
    } catch (e) { console.error('[email] saveSig', e); state.sigSaving = false; state.error = 'Échec enregistrement signature : ' + (e.message || e); render(); }
  }

  function bind(root) {
    const on = (sel, ev, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn));
    on('[data-act="bg"]', 'click', () => { /* clic hors modale : ne ferme pas (évite perte de brouillon) */ });
    on('[data-act="close"]', 'click', () => api.close());
    on('[data-act="send"]', 'click', send);
    on('[data-act="attach"]', 'click', pickFiles);
    on('[data-act="sigtoggle"]', 'click', () => { state.sigOn = !state.sigOn; applySignature(); render(); });
    on('[data-act="sigcfg"]', 'click', () => { state.sigDraft = currentSignature(); state.sigPanel = true; render(); });
    on('[data-act="sigclose"]', 'click', () => { state.sigPanel = false; render(); });
    on('[data-act="sigsave"]', 'click', saveSignature);
    root.querySelectorAll('.em-sig-tb').forEach(el => {
      el.addEventListener('mousedown', e => e.preventDefault());
      el.addEventListener('click', () => {
        const c = el.getAttribute('data-sigcmd');
        if (c === 'image') { pickSigImage(); return; }
        if (c === 'createLink') { const u = win.prompt('URL du lien :', 'https://'); if (u) sigCmd('createLink', u); return; }
        sigCmd(c);
      });
    });
    root.querySelectorAll('.em-sig-color').forEach(el => { el.addEventListener('mousedown', e => e.stopPropagation()); el.addEventListener('input', e => sigCmd('foreColor', e.target.value)); });
    on('[data-act="togglecc"]', 'click', () => { state.showCc = true; render(); });
    on('[data-act="from"]', 'change', (e) => { state.fromId = e.target.value; applySignature(); });
    // --- destinataires (chips + autocomplétion) ---
    root.querySelectorAll('[data-rcpt]').forEach(inp => {
      const field = inp.getAttribute('data-rcpt');
      inp.addEventListener('focus', () => { state.rcptInput.field = field; });
      inp.addEventListener('input', (e) => { state.rcptInput = { field: field, text: e.target.value }; searchUsers(field, e.target.value); });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (state.sugg.length) { state.suggIdx = (state.suggIdx + 1) % state.sugg.length; paintSugg(field); } }
        else if (e.key === 'ArrowUp') { e.preventDefault(); if (state.sugg.length) { state.suggIdx = (state.suggIdx - 1 + state.sugg.length) % state.sugg.length; paintSugg(field); } }
        else if (e.key === 'Enter' || e.key === ',' || e.key === ';') { e.preventDefault(); if (commitInput(field)) render(); }
        else if (e.key === 'Backspace' && !e.target.value) { const arr = chipsFor(field); for (let i = arr.length - 1; i >= 0; i--) { if (!arr[i].locked) { arr.splice(i, 1); break; } } render(); }
        else if (e.key === 'Escape') { state.sugg = []; state.suggIdx = -1; paintSugg(field); }
      });
      // Le clic sur une suggestion (mousedown) se fait avant ce blur ; on masque
      // juste la liste. Pas d'ajout auto ici (évite les coupures d'adresse).
      inp.addEventListener('blur', () => { setTimeout(() => { const box = getRoot() && getRoot().querySelector('[data-suggbox="' + field + '"]'); if (box) box.style.display = 'none'; }, 200); });
    });
    root.querySelectorAll('[data-rmchip]').forEach(el => { el.addEventListener('click', () => { const parts = el.getAttribute('data-rmchip').split('|'); removeChip(parts[0], parts[1]); render(); }); });
    on('[data-act="subject"]', 'input', (e) => { state.subject = e.target.value; });
    on('[data-rm]', 'click', (e) => removeAtt(e.currentTarget.getAttribute('data-rm')));
    root.querySelectorAll('.em-tb').forEach(el => el.addEventListener('mousedown', e => e.preventDefault()));
    on('.em-tb', 'click', (e) => {
      const c = e.currentTarget.getAttribute('data-cmd');
      if (c === 'createLink') { const url = win.prompt('URL du lien :', 'https://'); if (url) cmd('createLink', url); return; }
      cmd(c);
    });
    on('.em-color', 'input', (e) => cmd('foreColor', e.target.value));
    // sauvegarde du corps à la frappe
    const ed = root.querySelector('.em-body'); if (ed) ed.addEventListener('input', () => { state.bodyHtml = ed.innerHTML; });
  }

  /* ---- API ---- */
  const api = {
    open: async (opts) => {
      opts = opts || {};
      state.open = true; state.error = null; state.sending = false;
      state.mode = opts.mode || 'new';
      state.client = opts.client || readVar(SELECTED_CLIENT_VAR_ID) || null;
      // reset compose
      state.toChips = []; state.ccChips = []; state.bccChips = []; state.rcptInput = { field: null, text: '' }; state.sugg = []; state.suggIdx = -1; state.showCc = false; state.subject = ''; state.bodyHtml = ''; state.attachments = []; state.replyToId = null; state.forwardOfId = null;
      ensureRoot(); render();
      await loadAccounts();
      if ((state.mode === 'reply' || state.mode === 'forward') && opts.emailId) { await prefillFrom(opts.emailId, state.mode); }
      else if (state.mode === 'new' && state.client && state.client.EMAIL) { addChip('to', state.client.EMAIL, clientLabel(state.client), true); }
      if (state.sigOn) applySignature();
      render();
      const ed = getRoot() && getRoot().querySelector('.em-body'); if (ed && state.mode === 'reply') { ed.focus(); }
      else { const toi = getRoot() && getRoot().querySelector('[data-act="to"]'); if (toi && !state.to) toi.focus(); }
    },
    close: () => { state.open = false; render(); }
  };
  window.__EMAIL_UI__ = api;
  // contrat attendu par les cartes email de Contacts
  window.handleCompose = (mode, emailId) => api.open({ mode: mode, emailId: emailId });
}
});
