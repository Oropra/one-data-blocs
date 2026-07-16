// ============================================================================
//  VOIP-UI — module One Data (OD.define)  v1 (Lot C)
//  Modale d'appel globale (__VOIP_UI__, #voip-ui-root flottant). Migré :
//  SUPA_URL/anonKey via ctx.tenant (voip-end-call -> tenant) ; plus d'esehl.
//  Twilio/__ONE_DATA__ multi-contexte conservés.
// ============================================================================
/* =========================================================================
   CRM360 — VOIP UI (rendu 100% JS, un seul root)
   À exécuter UNE fois au chargement de l'app (ex: au début du "voip init").
   Expose wwLib.getFrontWindow().__VOIP_UI__ avec :
     .incoming({name, number, initials, idvu, client})   → modale entrante (sonnerie)
     .incall  ({name, number, initials, idvu, client})   → modale sortante (en cours, chrono démarré)
     .answer()                                            → passe l'entrant en "décroché" + chrono
     .setName({name, number, initials, client, idvu})     → met à jour l'affichage
     .minimize(true|false|undefined)                      → réduit / agrandit / bascule
     .close()                                             → ferme + reset
   ========================================================================= */
OD.define('voip-ui', {
  mount(__anchor, ctx) {
  // Overlay global (modale d'appel) : crée son propre #voip-ui-root flottant,
  // ne rend pas dans __anchor (qui n'est qu'un déclencheur).
  const W = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window;
  const D = __anchor.ownerDocument || (wwLib.getFrontDocument && wwLib.getFrontDocument()) || document;

  const SUPA_URL = ctx.tenant.supabase_url;
  const FICHE_PAGE_ID = '259f1951-a2d4-4b90-ac83-0b3febe1d4ec';
  const VAR_FICHE = '55490583-c88b-4748-916e-4d203db07742';
  // Navigation ÉDITEUR vs PROD (patron top nav) : en prod, un UID s'inscrit tel
  // quel dans l'URL -> route inexistante -> page blanche. On navigue par CHEMIN.
  const OD_PATH_FICHE_CLIENT = '/fr/fiche-client';
  function odInEditor() {
    try { return (window.self !== window.top) || /-editor\.weweb\.io|weweb\.io/i.test(location.hostname); }
    catch (e) { return true; }
  }
  function odGoFiche(pageId) {
    if (odInEditor()) { try { wwLib.wwApp.goTo(pageId); return; } catch (e) {} }
    try { wwLib.goTo(OD_PATH_FICHE_CLIENT); return; } catch (e) {}
    try { ((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).location.href = OD_PATH_FICHE_CLIENT; } catch (e) {}
  }

  const VAR_STATUT = 'd6e8c441-31a5-4e35-9724-3181f9767292';
  const VAR_DUREE = 'ccf7985b-f492-4a3e-b278-a64a705cb650';

  const S = W.__VOIP_STATE__ || (W.__VOIP_STATE__ = {
    open: false, mode: 'incoming', answered: false, minimized: false, muted: false,
    name: '', number: '', initials: '?', idvu: 0, client: null, seconds: 0, timer: null
  });

  /* ---------- helpers ---------- */
  const fmtTel = (t) => (t || '').replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  const fmtDur = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  const clock = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const initialsOf = (n) => (n || '')
    .replace(/^(M\.|Mme|Mlle|Monsieur|Madame|Mademoiselle)\s+/i, '').trim()
    .split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  const anonKey = () => ctx.tenant.supabase_anon_key;
  const getCall = () =>
    (globalThis.__ONE_DATA__ && globalThis.__ONE_DATA__.call) ||
    (W.__ONE_DATA__ && W.__ONE_DATA__.call) ||
    (W.parent && W.parent.__ONE_DATA__ && W.parent.__ONE_DATA__.call) ||
    W._twilioCall ||
    (W.parent && W.parent._twilioCall) ||
    null;

  /* ---------- DB (non bloquant) ---------- */
  function patchAnswered() {
    const k = anonKey(); if (!k) return;
    fetch(`${SUPA_URL}/rest/v1/voip_calls?answered_at=is.null&order=created_at.desc&limit=1&select=id`,
      { headers: { apikey: k, Authorization: `Bearer ${k}` } })
      .then(r => r.json()).then(rows => {
        const id = rows?.[0]?.id; if (!id) return;
        fetch(`${SUPA_URL}/rest/v1/voip_calls?id=eq.${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', apikey: k, Authorization: `Bearer ${k}` },
          body: JSON.stringify({ answered_at: new Date().toISOString(), status: 'in-progress' })
        });
      }).catch(() => {});
  }
  function patchEnded(seconds) {
    const k = anonKey(); if (!k) return;
    fetch(`${SUPA_URL}/rest/v1/voip_calls?ended_at=is.null&status=in.(ringing,in-progress)&order=created_at.desc&limit=1&select=id`,
      { headers: { apikey: k, Authorization: `Bearer ${k}` } })
      .then(r => r.json()).then(rows => {
        const id = rows?.[0]?.id; if (!id) return;
        fetch(`${SUPA_URL}/rest/v1/voip_calls?id=eq.${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', apikey: k, Authorization: `Bearer ${k}` },
          body: JSON.stringify({
            answered_at: seconds > 0 ? new Date(Date.now() - seconds * 1000).toISOString() : null,
            ended_at: new Date().toISOString(), duration_seconds: seconds, status: 'completed'
          })
        });   // (rafraîchissement de l'ex-collection WeWeb retiré : elle est supprimée)
      }).catch(() => {});
  }

  /* ---------- chrono ---------- */
  function startTimer() {
    stopTimer();
    S.timer = setInterval(() => {
      S.seconds++;
      try { wwLib.wwVariable.updateValue(VAR_DUREE, S.seconds); } catch (e) {}
      try { W.parent._twilioCallDuration = S.seconds; } catch (e) {}
      const t = D.getElementById('vu-timer'); if (t) t.textContent = fmtDur(S.seconds);
    }, 1000);
  }
  function stopTimer() { if (S.timer) { clearInterval(S.timer); S.timer = null; } }

  /* ---------- CSS ---------- */
  function injectCSS() {
    if (D.getElementById('voip-ui-css')) return;
    const st = D.createElement('style'); st.id = 'voip-ui-css';
    st.textContent = `
#voip-ui-root .vu-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:2147483000;pointer-events:none;font-family:'Manrope',system-ui,-apple-system,sans-serif}
#voip-ui-root .vu-overlay.vu-mini{align-items:flex-end;justify-content:flex-end;padding:18px}
#voip-ui-root .vu-phone{pointer-events:auto;position:relative;overflow:hidden;width:232px;padding:13px 16px 18px;border-radius:30px;color:#F4F7FB;
  background:radial-gradient(140% 90% at 50% -10%,#1f3a63 0%,#14203a 42%,#0b1426 100%);border:1px solid rgba(255,255,255,.08);
  box-shadow:0 22px 44px -14px rgba(5,12,28,.85),0 0 0 5px rgba(8,14,28,.55);transition:width .25s ease,padding .25s ease,border-radius .25s ease}
#voip-ui-root .vu-glow{position:absolute;top:8%;left:50%;transform:translateX(-50%);width:160px;height:160px;border-radius:50%;z-index:0;
  background:radial-gradient(circle,rgba(96,174,223,.5) 0%,transparent 68%);filter:blur(14px);opacity:.55}
#voip-ui-root .vu-statusbar{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;font-size:12px;color:rgba(244,247,251,.85);padding:2px 6px 10px}
#voip-ui-root .vu-statusbar .vu-batt{width:22px;height:11px;border:1px solid rgba(244,247,251,.6);border-radius:3px;position:relative}
#voip-ui-root .vu-statusbar .vu-batt:after{content:"";position:absolute;right:-3px;top:3px;width:2px;height:5px;background:rgba(244,247,251,.6);border-radius:0 1px 1px 0}
#voip-ui-root .vu-head{position:relative;z-index:1;text-align:center;font-size:13px;color:rgba(244,247,251,.62);margin-bottom:14px;letter-spacing:.2px}
#voip-ui-root .vu-identity{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:4px}
#voip-ui-root .vu-avatar-wrap{position:relative;width:96px;height:96px;display:flex;align-items:center;justify-content:center;margin-bottom:6px}
#voip-ui-root .vu-ring{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(96,174,223,.5);animation:vu-pulse 1.8s ease-out infinite}
#voip-ui-root .vu-ring.r2{animation-delay:.9s}
@keyframes vu-pulse{0%{transform:scale(.7);opacity:.7}100%{transform:scale(1.25);opacity:0}}
#voip-ui-root .vu-avatar{width:76px;height:76px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:600;
  background:linear-gradient(160deg,#5fb0e0,#2a5ea9);color:#fff;font-family:'Outfit',sans-serif;box-shadow:0 8px 22px -6px rgba(42,94,169,.7)}
#voip-ui-root .vu-name{font-size:18px;font-weight:600;margin:2px 0 0;cursor:pointer;font-family:'Outfit',sans-serif}
#voip-ui-root .vu-name:hover{text-decoration:underline}
#voip-ui-root .vu-number{font-size:13px;color:rgba(244,247,251,.62);margin:0}
#voip-ui-root .vu-timer{position:relative;z-index:1;text-align:center;font-size:15px;color:#60AEDF;margin:8px 0 0;font-variant-numeric:tabular-nums;display:none}
#voip-ui-root .vu-phone.vu-answered .vu-timer{display:block}
#voip-ui-root .vu-phone.vu-answered .vu-ring{display:none}
/* actions */
#voip-ui-root .vu-row{position:relative;z-index:1;display:flex;justify-content:center;gap:26px;margin-top:18px}
#voip-ui-root .vu-ringing{margin-top:20px}
#voip-ui-root .vu-phone.vu-answered .vu-ringing{display:none}
#voip-ui-root .vu-incall{display:none}
#voip-ui-root .vu-phone.vu-answered .vu-incall{display:flex}
#voip-ui-root .vu-col{display:flex;flex-direction:column;align-items:center;gap:6px}
#voip-ui-root .vu-act{width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center}
#voip-ui-root .vu-act svg{width:26px;height:26px;fill:#fff}
#voip-ui-root .vu-accept{background:#3DBE73}
#voip-ui-root .vu-refuse{background:#FF4B55}
#voip-ui-root .vu-refuse svg{transform:rotate(135deg)}
#voip-ui-root .vu-lbl{font-size:11px;color:rgba(244,247,251,.62)}
#voip-ui-root .vu-btn{width:50px;height:50px;border-radius:50%;border:none;cursor:pointer;background:rgba(255,255,255,.09);display:flex;align-items:center;justify-content:center}
#voip-ui-root .vu-btn[aria-pressed="true"]{background:#fff}
#voip-ui-root .vu-btn[aria-pressed="true"] svg{fill:#14203a}
#voip-ui-root .vu-btn svg{width:22px;height:22px;fill:#fff}
#voip-ui-root .vu-hangup-wrap{position:relative;z-index:1;display:none;justify-content:center;margin-top:16px}
#voip-ui-root .vu-phone.vu-answered .vu-hangup-wrap{display:flex}
#voip-ui-root .vu-hangup{width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;background:#FF4B55;display:flex;align-items:center;justify-content:center}
#voip-ui-root .vu-hangup svg{width:26px;height:26px;fill:#fff;transform:rotate(135deg)}
/* bouton réduire */
#voip-ui-root .vu-min-btn{position:absolute;top:12px;left:12px;z-index:2;width:30px;height:30px;border-radius:50%;border:none;cursor:pointer;
  background:rgba(255,255,255,.10);display:none;align-items:center;justify-content:center}
#voip-ui-root .vu-phone.vu-answered .vu-min-btn{display:flex}
#voip-ui-root .vu-min-btn svg{width:16px;height:16px;fill:rgba(244,247,251,.75)}
/* état réduit */
#voip-ui-root .vu-phone.vu-answered.vu-min{width:auto;padding:10px 14px;border-radius:18px;display:flex;align-items:center;gap:12px}
#voip-ui-root .vu-phone.vu-answered.vu-min .vu-glow,
#voip-ui-root .vu-phone.vu-answered.vu-min .vu-statusbar,
#voip-ui-root .vu-phone.vu-answered.vu-min .vu-head,
#voip-ui-root .vu-phone.vu-answered.vu-min .vu-identity,
#voip-ui-root .vu-phone.vu-answered.vu-min .vu-lbl,
#voip-ui-root .vu-phone.vu-answered.vu-min .vu-btn[data-act="keypad"],
#voip-ui-root .vu-phone.vu-answered.vu-min .vu-btn[data-act="hp"]{display:none}
#voip-ui-root .vu-phone.vu-answered.vu-min .vu-min-btn{position:static}
#voip-ui-root .vu-phone.vu-answered.vu-min .vu-timer{margin:0;display:block}
#voip-ui-root .vu-phone.vu-answered.vu-min .vu-row{margin:0}
#voip-ui-root .vu-phone.vu-answered.vu-min .vu-hangup-wrap{margin:0}
#voip-ui-root .vu-phone.vu-answered.vu-min .vu-hangup{width:42px;height:42px}
#voip-ui-root .vu-phone.vu-answered.vu-min .vu-btn{width:40px;height:40px}
`;
    D.head.appendChild(st);
  }

  /* ---------- icônes ---------- */
  const SVG_PHONE = '<path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.3 1l-2.2 2.2Z"/>';
  const SVG_MUTE = '<path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"/>';
  const SVG_KEYPAD = '<path d="M6 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM6 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM6 16a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"/>';
  const SVG_HP = '<path d="M5 9v6h4l5 5V4L9 9H5Zm11.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Z"/>';
  const SVG_MIN = '<path d="M6 13h12v-2H6z"/>';
  const SVG_MAX = '<path d="M4 9V4h5v2H6v3H4Zm14 0V6h-3V4h5v5h-2ZM4 20v-5h2v3h3v2H4Zm11 0v-2h3v-3h2v5h-5Z"/>';

  /* ---------- rendu ---------- */
  function ensureRoot() {
    let r = D.getElementById('voip-ui-root');
    if (!r) {
      r = D.createElement('div'); r.id = 'voip-ui-root'; D.body.appendChild(r);
      r.addEventListener('click', onClick);
    }
    return r;
  }

  function render() {
    const r = ensureRoot();
    if (!S.open) { r.innerHTML = ''; return; }
    injectCSS();
    const ans = S.answered;
    const cls = ['vu-phone', ans ? 'vu-answered' : '', (ans && S.minimized) ? 'vu-min' : ''].filter(Boolean).join(' ');
    const status = ans ? 'Appel en cours…' : (S.mode === 'incoming' ? 'Appel entrant…' : 'Appel en cours…');
    r.innerHTML =
      `<div class="vu-overlay ${ans && S.minimized ? 'vu-mini' : ''}">
        <div class="${cls}">
          <div class="vu-glow"></div>
          <button class="vu-min-btn" data-act="min" aria-label="Réduire / Agrandir">
            <svg viewBox="0 0 24 24">${S.minimized ? SVG_MAX : SVG_MIN}</svg>
          </button>
          <div class="vu-statusbar"><span>${clock()}</span><span class="vu-batt"></span></div>
          <div class="vu-head">${esc(status)}</div>
          <div class="vu-identity">
            <div class="vu-avatar-wrap">
              ${ans ? '' : '<span class="vu-ring"></span><span class="vu-ring r2"></span>'}
              <div class="vu-avatar">${esc(S.initials)}</div>
            </div>
            <h1 class="vu-name" data-act="fiche" title="Voir la fiche client">${esc(S.name || '—')}</h1>
            <p class="vu-number">${esc(fmtTel(S.number))}</p>
          </div>
          <p class="vu-timer" id="vu-timer">${fmtDur(S.seconds)}</p>
          ${S.mode === 'incoming' && !ans ? `
          <div class="vu-row vu-ringing">
            <div class="vu-col"><button class="vu-act vu-refuse" data-act="reject"><svg viewBox="0 0 24 24">${SVG_PHONE}</svg></button><span class="vu-lbl">Refuser</span></div>
            <div class="vu-col"><button class="vu-act vu-accept" data-act="accept"><svg viewBox="0 0 24 24">${SVG_PHONE}</svg></button><span class="vu-lbl">Décrocher</span></div>
          </div>` : ''}
          <div class="vu-row vu-incall">
            <div class="vu-col"><button class="vu-btn" data-act="mute" aria-pressed="${S.muted}"><svg viewBox="0 0 24 24">${SVG_MUTE}</svg></button><span class="vu-lbl">Muet</span></div>
            <div class="vu-col"><button class="vu-btn" data-act="keypad"><svg viewBox="0 0 24 24">${SVG_KEYPAD}</svg></button><span class="vu-lbl">Clavier</span></div>
            <div class="vu-col"><button class="vu-btn" data-act="hp"><svg viewBox="0 0 24 24">${SVG_HP}</svg></button><span class="vu-lbl">HP</span></div>
          </div>
          <div class="vu-hangup-wrap"><button class="vu-hangup" data-act="hangup"><svg viewBox="0 0 24 24">${SVG_PHONE}</svg></button></div>
        </div>
      </div>`;
  }

  /* ---------- événements (délégation, attachée une fois sur le root) ---------- */
  function onClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.getAttribute('data-act');
    const call = getCall();
    if (act === 'accept') {
      if (call && call.accept) call.accept();
      patchAnswered();
      api.answer();
      api.minimize(true);
    } else if (act === 'reject') {
      const callSid = call?.parameters?.CallSid
      if (callSid) {
        const k = anonKey()
        fetch(`${SUPA_URL}/functions/v1/voip-end-call`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': k },
          body: JSON.stringify({ callSid })
        }).catch(e => console.error('voip-end-call error:', e))
      }
      if (call) { if (call.reject) call.reject(); else if (call.disconnect) call.disconnect(); }
      try { wwLib.wwVariable.updateValue(VAR_STATUT, 'idle'); } catch (e2) { }
      api.close();
    } else if (act === 'hangup') {
      try { W.parent._twilioHungUp = true; } catch (e2) { }
      const sec = S.seconds;
      const callSid = call?.parameters?.CallSid

      // Terminer l'appel côté Twilio (coupe aussi l'Android)
      if (callSid) {
        const k = anonKey()
        fetch(`${SUPA_URL}/functions/v1/voip-end-call`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': k },
          body: JSON.stringify({ callSid })
        }).catch(e => console.error('voip-end-call error:', e))
      }

      if (call && call.disconnect) call.disconnect();
      patchEnded(sec);
      try { wwLib.wwVariable.updateValue(VAR_STATUT, 'idle'); } catch (e2) { }
      api.close();
    } else if (act === 'mute') {
      S.muted = !S.muted;
      if (call && call.mute) call.mute(S.muted);
      b.setAttribute('aria-pressed', String(S.muted));
    } else if (act === 'keypad' || act === 'hp') {
      const p = b.getAttribute('aria-pressed') === 'true';
      b.setAttribute('aria-pressed', String(!p));
    } else if (act === 'min') {
      api.minimize();
    } else if (act === 'fiche') {
      if (!S.client) { console.warn('[voip-ui] pas de client'); return; }
      // Le client passe par SA variable ; fiche-shell recharge lui-même.
      // Le workflow global 'ec8bcc55' a été SUPPRIMÉ du projet (et provoquait le
      // 409 wa_contacts) -> on ne l'appelle plus.
      try { wwLib.wwVariable.updateValue(VAR_FICHE, Object.assign({}, S.client, { full_count: 1 })); } catch (e2) { console.warn(e2); }
      api.minimize(true);
      odGoFiche(FICHE_PAGE_ID);
      return;
    }
  }

  /* ---------- API publique ---------- */
  const api = {
    incoming(d) {
      d = d || {};
      Object.assign(S, {
        open: true, mode: 'incoming', answered: false, minimized: false, muted: false, seconds: 0,
        name: d.name || 'Numéro inconnu', number: d.number || '', idvu: d.idvu || 0, client: d.client || null,
        initials: d.initials || initialsOf(d.name)
      });
      stopTimer(); render();
    },
    incall(d) {
      d = d || {};
      Object.assign(S, {
        open: true, mode: 'incall', answered: true, minimized: false, muted: false, seconds: 0,
        name: d.name || '—', number: d.number || '', idvu: d.idvu || 0, client: d.client || null,
        initials: d.initials || initialsOf(d.name)
      });
      render();
    },
    answer() { if (!S.open) return; S.answered = true; S.seconds = 0; render(); startTimer(); },
    setName(d) { if (d) { if (d.name != null) S.name = d.name; if (d.number != null) S.number = d.number; if (d.client !== undefined) S.client = d.client; if (d.idvu != null) S.idvu = d.idvu; S.initials = d.initials || initialsOf(S.name); } render(); },
    minimize(t) { S.minimized = (t == null) ? !S.minimized : !!t; render(); },
    close() { stopTimer(); S.open = false; S.answered = false; S.minimized = false; S.muted = false; S.seconds = 0; render(); }
  };

  W.__VOIP_UI__ = api;
  ensureRoot();
  console.log('✅ VOIP UI prête');
}
});
