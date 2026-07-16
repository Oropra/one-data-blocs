// RPV (overlay) — module One Data (OD.define) v1 (Lot B)
// ============================================================================
//  POPUP NEW RPV — CRM360
//  Root : #rpv-root (Embed dans le popup "New RPV").
//  À charger via le workflow "on page load" de la page client : un observateur
//  persistant rend le contenu à chaque ouverture du popup.
//
//  Saisie d'un Rapport Vendeur (RAPPORT_VENDEUR) pour le cycle com ouvert du
//  client sélectionné : contexte du cycle, résultat, canal, origine, compte-rendu
//  avec jauge qualité, et prochaine action obligatoire (sauf Abandon = clôture).
// ============================================================================
OD.define('rpv', {
  mount(__anchor, ctx) {
    __anchor.id = 'rpv-root';

  // --- Constantes éditables ---------------------------------------------------
  const RPV_ROOT_ID = 'rpv-root';
  const VAR_SELECTED_CLIENT_ID = '55490583-c88b-4748-916e-4d203db07742'; // client sélectionné (objet CLIENT)
  const VAR_SELECTED_SITE_ID = '39fecccf-9296-43b7-b5b6-eadaa928290d'; // selected_id_site
  const WF_OUT_NEW_RPV = '7531d18e-6175-4ec4-bbb3-c309b01eea0e'; // [reusable workflow] out New RPV (ferme le popup)
  const NEXT_ACTION_TIME = '09:00:00'; // heure appliquée à dt_activation (chip ou date)

  // Résultats possibles d'un RPV (resultat_rdv). closure : clôt le cycle.
  // reopen : Abandon = clôture du cycle ouvert + ouverture d'un nouveau cycle.
  const RESULTATS = [
    { key: 'Relance', color: '#2a5ea9', bg: 'rgba(42,94,169,.10)', fg: '#214e8c', closure: false },
    { key: 'Choc', color: '#e8950c', bg: 'rgba(250,192,85,.20)', fg: '#9a6a07', closure: false },
    { key: 'Abandon', color: '#e24b4a', bg: 'rgba(226,75,74,.12)', fg: '#b23433', closure: true, reopen: true }
  ];
  const NEXT_DEFAULT_DAYS = { Relance: 7, Choc: 2, Abandon: null };

  // Canaux de contact (canal_contact) — valeurs réelles dominantes.
  const CANAUX = ['Concession', 'Email', 'Agent', 'Showroom', 'Téléphone'];

  // Origine de l'échange (origine_echange) — OBLIGATOIRE.
  const ORIGINES = ['CR RDV', 'CR Essai', 'Contact spontané', 'Initiatives personnelles', 'Suivi de commande', 'Indication', 'Marketing Affaire', 'Infomédiaire', 'Entreprise', 'Atelier', 'Marketing Financement', 'Marketing Constructeur'];

  // Amorces de commentaire contextuelles au résultat.
  const AMORCES = {
    Relance: ['Toujours en réflexion sur', 'Point sur la proposition :', 'Recontacté suite à'],
    Choc: ['Découverte du besoin :', 'Véhicule présenté :', 'Essai réalisé,'],
    Abandon: ['Abandon — motif :', 'Parti à la concurrence (', "N'a pas donné suite à"]
  };

  const doc = __anchor.ownerDocument || document;
  function getRoot() { return doc.getElementById(RPV_ROOT_ID); }
  function readVar(id) { try { return wwLib.wwVariable.getValue(id); } catch (e) { return null; } }
  function supa() { return ctx.supabase; }

  // Lecture de la collection userconnected, résiliente à l'évolution de l'API WeWeb.
  function getUserConnected() {
    try { return ((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser || {}; } catch (e) { return {}; }
  }
  function getViewerId() {
    const u = getUserConnected();
    return (u && u.ID_User != null) ? Number(u.ID_User) : null;
  }
  let viewerId = null;

  // --- État -------------------------------------------------------------------
  const state = window.__rpv || {};
  if (state.booted === undefined) {
    state.idvu = null; state.idSite = null; state.idCycle = null;
    state.ctx = null; state.ctxLoading = false; state.ctxError = null; state.clientName = '';
    state.resultat = null; state.canal = null; state.origine = null; state.commentaire = '';
    state.nextDate = null; state.nextTouched = false;
    state.saving = false; state.saved = false; state.error = null;
    state.booted = true;
  }
  window.__rpv = state;

  // --- Utilitaires ------------------------------------------------------------
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  const MOIS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // creation_date en UTC (aligné sur les autres sources : SMS, VOIP...), sinon
  // décalage de fuseau -> mauvais tri dans la timeline Contacts.
  function fmtSqlTs(d) { return d.toISOString().slice(0, 19).replace('T', ' '); }
  function fmtDateShort(v) {
    if (!v) return '';
    const d = new Date(String(v).replace(' ', 'T'));
    if (isNaN(d)) return '';
    return d.getDate() + ' ' + MOIS_FR[d.getMonth()] + ' ' + d.getFullYear();
  }
  function daysSince(v) {
    if (!v) return null;
    const d = new Date(String(v).replace(' ', 'T'));
    if (isNaN(d)) return null;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  }
  function pick(obj, keys) { for (const k of keys) { if (obj && obj[k] != null && obj[k] !== '') return obj[k]; } return null; }
  function resultatDef(k) { return RESULTATS.find(r => r.key === k) || null; }
  function isClosure(k) { const r = resultatDef(k); return !!(r && r.closure); }
  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const a = parts[0][0] || '';
    const b = parts.length > 1 ? (parts[parts.length - 1][0] || '') : '';
    return (a + b).toUpperCase();
  }

  // --- Résolution client + site + cycle + contexte ----------------------------
  function resolveClientAndSite() {
    const c = readVar(VAR_SELECTED_CLIENT_ID);
    if (c && typeof c === 'object' && c.IDVu != null) {
      state.idvu = Number(c.IDVu);
      const soc = c.idmultivu === 1 || c.idmultivu === '1';
      state.clientName = soc
        ? [c.CIVILITE, c.NOM].filter(Boolean).join(' ')
        : [c.CIVILITE, c.NOM, c.PRENOM].filter(Boolean).join(' ');
      // Initiales avatar : sur le prénom + nom (sans la civilité)
      var _inm = soc ? (c.NOM || '') : [c.PRENOM, c.NOM].filter(Boolean).join(' ');
      state.clientInitials = initials(_inm);
    } else { state.idvu = null; state.clientName = ''; state.clientInitials = '?'; }
    const s = readVar(VAR_SELECTED_SITE_ID);
    state.idSite = s != null && s !== '' ? Number(s) : null;
  }

  async function loadContext() {
    if (state.idvu == null || state.idSite == null) {
      state.ctxError = 'Client ou site non identifié.'; render(); return;
    }
    state.ctxLoading = true; state.ctxError = null; render();
    const sb = supa();
    try {
      let cycleRow = null;
      try {
        const { data, error } = await sb.from('CYCLE_COM').select('*')
          .eq('id_client', state.idvu).eq('id_site', state.idSite);
        if (error) throw error;
        const rows = data || [];
        const isOpen = (r) => {
          const st = pick(r, ['status', 'statut', 'STATUT', 'Status']);
          return st != null && String(st).toLowerCase().indexOf('ouvert') === 0;
        };
        cycleRow = rows.find(isOpen) || rows.slice().sort((a, b) => {
          const da = pick(a, ['created_at', 'creation_date']) || '';
          const db = pick(b, ['created_at', 'creation_date']) || '';
          return String(db).localeCompare(String(da));
        })[0] || null;
      } catch (eCyc) { console.warn('[rpv] CYCLE_COM lookup', eCyc && eCyc.message); }

      let ctx = { temperature: null, propale: null, prochainRdv: null, dernier: null, nbEchanges: null };
      if (cycleRow) {
        state.idCycle = pick(cycleRow, ['id_cycle_com', 'id_cycle_comm', 'ID_CYCLE_COM']);
        ctx.temperature = pick(cycleRow, ['temperature', 'Temperature', 'temp']);
        ctx.propale = pick(cycleRow, ['statut_propale', 'status_propale', 'propale_statut']);
        ctx.prochainRdv = pick(cycleRow, ['prochain_rdv', 'next_rdv', 'rdv_at']);
      }

      if (state.idCycle != null) {
        try {
          const { data, error } = await sb.from('v_contacts_client')
            .select('media, sens, date_contact, resultat')
            .eq('id_cycle_com', state.idCycle)
            .order('date_contact', { ascending: false }).limit(50);
          if (error) throw error;
          const rows = data || [];
          ctx.nbEchanges = rows.length;
          if (rows.length) {
            const d = rows[0];
            ctx.dernier = { media: d.media, date: d.date_contact, resultat: d.resultat, sens: d.sens };
          }
        } catch (eC) { console.warn('[rpv] v_contacts_client', eC && eC.message); }
      }

      state.ctx = ctx;
      state.ctxError = (state.idCycle == null && !cycleRow) ? 'Aucun cycle ouvert identifié pour ce client.' : null;
    } catch (e) {
      console.error('[rpv] loadContext', e);
      state.ctxError = (e && e.message) ? e.message : String(e);
    } finally {
      state.ctxLoading = false; render();
    }
  }

  // --- Jauge qualité heuristique (instantanée, locale) ------------------------
  function qualityNote() {
    const txt = (state.commentaire || '').trim();
    const low = txt.toLowerCase();
    let score = 0;
    const has = (re) => re.test(low);
    if (txt.length >= 40) score += 2;
    if (txt.length >= 110) score += 1;
    const nextStep = has(/(rappel|relanc|recontact|revoir|envoy|rdv|rendez|devis|propal|essai|signer|d[ée]cision|semaine|demain|lundi|mardi|mercredi|jeudi|vendredi)/);
    if (nextStep) score += 2;
    const objection = has(/(h[ée]site|frein|objection|budget|financ|concurrent|attend|r[ée]fl[ée]chi|prix|trop cher|d[ée]lai|reprise)/);
    if (objection) score += 2;
    if (has(/(\d|€|km|euro)/)) score += 1;
    if (state.resultat) score += 1;
    if (state.canal) score += 1;
    if (score > 10) score = 10;

    let tip;
    if (!txt) tip = "Décris l'échange : ce qui s'est dit, le besoin, la suite.";
    else if (!nextStep) tip = 'Précise la prochaine étape (quand et comment recontacter ?).';
    else if (!objection) tip = "Note le frein ou la motivation du client.";
    else if (txt.length < 40) tip = "Détaille un peu plus le déroulé de l'échange.";
    else tip = 'Compte-rendu complet et actionnable.';
    return { score, tip };
  }
  function noteColor(s) { return s >= 8 ? '#2c7a68' : (s >= 5 ? '#c98a12' : '#cf5b5a'); }

  // --- Prochaine action -------------------------------------------------------
  function defaultNextDate(resultatKey) {
    const days = NEXT_DEFAULT_DAYS[resultatKey];
    if (days == null) return null;
    const d = new Date(); d.setDate(d.getDate() + days);
    return ymd(d);
  }
  function applyResultat(key) {
    state.resultat = key;
    if (!state.nextTouched) state.nextDate = defaultNextDate(key);
    render();
  }
  function setNextRelative(days) {
    state.nextTouched = true;
    if (days == null) { state.nextDate = null; }
    else { const d = new Date(); d.setDate(d.getDate() + days); state.nextDate = ymd(d); }
    render();
  }

  // --- Enregistrement ---------------------------------------------------------
  function validate() {
    const errs = [];
    if (!state.resultat) errs.push('Choisis un résultat.');
    if (!state.canal) errs.push('Choisis un canal.');
    if (!state.origine) errs.push("Choisis l'origine de l'échange.");
    if (!(state.commentaire || '').trim()) errs.push('Renseigne un compte-rendu.');
    if (!isClosure(state.resultat) && !state.nextDate) errs.push('Programme une prochaine action.');
    return errs.length ? errs : null;
  }
  async function nextRapportId(sb) {
    try {
      const { data, error } = await sb.from('RAPPORT_VENDEUR')
        .select('id_rapport').order('id_rapport', { ascending: false }).limit(1);
      if (error) throw error;
      const top = (data && data[0] && data[0].id_rapport != null) ? Number(data[0].id_rapport) : 0;
      return top + 1;
    } catch (e) { console.warn('[rpv] nextRapportId', e && e.message); return Date.now(); }
  }
  async function save() {
    const errs = validate();
    if (errs) { state.error = errs.join(' '); render(); return; }
    if (state.saving) return;
    state.saving = true; state.error = null; render();
    const sb = supa();
    try {
      const now = new Date();
      const note = qualityNote().score;
      const id = await nextRapportId(sb);
      const closure = isClosure(state.resultat);
      const payload = {
        id_rapport: id,
        id_user: viewerId,
        idvu: state.idvu,
        id_site: state.idSite,
        creation_date: fmtSqlTs(now),
        update_date: fmtSqlTs(now),
        dt_activation: state.nextDate ? (state.nextDate + ' ' + NEXT_ACTION_TIME) : null,
        commentaire: (state.commentaire || '').trim(),
        canal_contact: state.canal,
        resultat_rdv: state.resultat,
        origine_echange: state.origine,
        status_resultat_rdv_type: closure ? 'Cloturé' : 'En cours',
        note_chatgpt: note,
        traite: null
      };
      if (state.idCycle != null) payload.id_cycle_comm = Number(state.idCycle);

      const { error } = await sb.from('RAPPORT_VENDEUR').insert(payload);
      if (error) throw error;

      const def = resultatDef(state.resultat);
      if (def && def.reopen) {
        try {
          const { error: eC } = await sb.rpc('rpv_close_reopen_cycle', {
            p_id_cycle: state.idCycle != null ? Number(state.idCycle) : null,
            p_idvu: state.idvu, p_id_site: state.idSite, p_id_user: viewerId
          });
          if (eC) console.warn('[rpv] rpv_close_reopen_cycle:', eC.message || eC);
        } catch (eC) { console.warn('[rpv] cascade abandon:', eC && eC.message); }
      }

      // (Le workflow WeWeb 'fiche client' (ec8bcc55) a été SUPPRIMÉ du projet :
      //  il rafraîchissait une collection WeWeb devenue inutile. Le rafraîchissement
      //  des onglets Contacts / Historique est fait juste en dessous, côté JS.)
      // Rafraîchit aussi les onglets 100% JS (Contacts / Historique), qui ont leur
      // propre cache : on invalide (rows=null) et on vide leur div -> leur
      // observateur les recharge avec le nouveau rapport.
      try {
        var _d = wwLib.getFrontDocument ? wwLib.getFrontDocument() : document;
        if (window.__contactsState) { window.__contactsState.rows = null; window.__contactsState.loading = true; }
        if (window.__histoState) { window.__histoState.rows = null; window.__histoState.loading = true; }
        var _c = _d.getElementById('oropra-contacts-root'); if (_c) _c.innerHTML = '';
        var _h = _d.getElementById('oropra-historique-root'); if (_h) _h.innerHTML = '';
      } catch (eX) { }

      state.saved = true;
      try { (wwLib.getFrontWindow() || window).dispatchEvent(new CustomEvent('oropra-rpv-saved', { detail: { idvu: state.idvu, idCycle: state.idCycle, resultat: state.resultat } })); } catch (e) { }
      render();
    } catch (e) {
      console.error('[rpv] save', e);
      state.error = (e && e.message) ? e.message : String(e);
    } finally {
      state.saving = false; render();
    }
  }
  function resetForm() {
    state.resultat = null; state.canal = null; state.origine = null; state.commentaire = '';
    state.nextDate = null; state.nextTouched = false; state.saved = false; state.error = null;
    render();
  }
  function closePopup() {
    if (state.__closeTimer) { clearTimeout(state.__closeTimer); state.__closeTimer = null; }
    // Overlay JS du shell (fiche 100% JS) : on la ferme directement. Sinon, fallback
    // sur le workflow qui ferme la popup native (compatibilité ancienne fiche).
    try { var ov = doc.getElementById('fs-rpv-overlay'); if (ov) { ov.remove(); return; } } catch (e) { }
    try { wwLib.executeWorkflow(WF_OUT_NEW_RPV, {}); }
    catch (e) { console.warn('[rpv] close workflow', e && e.message); }
  }

  // --- Rendu : briques --------------------------------------------------------
  function ctxCard() {
    const c = state.ctx || {};
    const metrics = [];
    if (c.dernier) {
      const j = daysSince(c.dernier.date);
      const age = j == null ? '' : (j === 0 ? "aujourd'hui" : 'il y a ' + j + ' j');
      const v = esc(fmtDateShort(c.dernier.date)) + (age ? ' · ' + age : '');
      metrics.push(['Dernier échange', v + (c.dernier.media ? ' <span class="rpv-m-sub">(' + esc(c.dernier.media) + ')</span>' : '')]);
    }
    if (c.nbEchanges != null) metrics.push(['Échanges', String(c.nbEchanges)]);
    if (c.temperature != null) metrics.push(['Température', esc(String(c.temperature))]);
    if (c.propale != null) metrics.push(['Propale', esc(String(c.propale))]);
    if (c.prochainRdv != null) metrics.push(['Prochain RDV', esc(fmtDateShort(c.prochainRdv))]);

    let h = '<div class="rpv-ctx">';
    h += '<div class="rpv-ctx-bar"></div>';
    h += '<div class="rpv-ctx-body">';
    h += '<div class="rpv-ctx-top">';
    h += '<div class="rpv-ava">' + esc(state.clientInitials || '?') + '</div>';
    h += '<div class="rpv-ctx-id"><div class="rpv-ctx-name">' + (esc(state.clientName) || 'Client') + '</div>';
    h += '<div class="rpv-ctx-meta">' + (state.idCycle != null ? 'Cycle #' + esc(String(state.idCycle)) + ' ouvert' : 'Nouveau cycle') + '</div></div>';
    h += '</div>';
    if (state.ctxLoading) {
      h += '<div class="rpv-ctx-note">Chargement du contexte…</div>';
    } else if (metrics.length) {
      h += '<div class="rpv-metrics">' + metrics.map(m =>
        '<div class="rpv-metric"><span class="rpv-m-lbl">' + m[0] + '</span><span class="rpv-m-val">' + m[1] + '</span></div>'
      ).join('') + '</div>';
    } else {
      h += '<div class="rpv-ctx-note">' + (state.ctxError ? esc(state.ctxError) : "Pas encore d'historique sur ce cycle.") + '</div>';
    }
    h += '</div></div>';
    return h;
  }
  function resultatChips() {
    return '<div class="rpv-res-grid">' + RESULTATS.map(r => {
      const on = state.resultat === r.key;
      const st = on ? ('background:' + r.bg + ';border-color:' + r.color + ';color:' + r.fg) : '';
      return '<button type="button" class="rpv-res' + (on ? ' on' : '') + '" data-res="' + esc(r.key) + '" style="' + st + '">' +
        '<span class="rpv-res-dot" style="background:' + r.color + '"></span>' + esc(r.key) + '</button>';
    }).join('') + '</div>';
  }
  function chipRow(items, dataAttr, current) {
    return '<div class="rpv-chips">' + items.map(k => {
      const on = current === k;
      return '<button type="button" class="rpv-chip' + (on ? ' on' : '') + '" data-' + dataAttr + '="' + esc(k) + '">' + esc(k) + '</button>';
    }).join('') + '</div>';
  }
  function origineSelect() {
    const opts = ['<option value="">Sélectionner…</option>'].concat(
      ORIGINES.map(o => '<option value="' + esc(o) + '"' + (state.origine === o ? ' selected' : '') + '>' + esc(o) + '</option>')
    ).join('');
    return '<div class="rpv-select-wrap"><select class="rpv-select" data-origine="1">' + opts + '</select>' +
      '<svg class="rpv-select-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></div>';
  }
  function amorceChips() {
    const list = (state.resultat && AMORCES[state.resultat]) || [];
    if (!list.length) return '';
    return '<div class="rpv-amorces">' + list.map((a, i) => '<button type="button" class="rpv-amorce" data-amorce="' + i + '">+ ' + esc(a) + '</button>').join('') + '</div>';
  }
  function nextActionRow() {
    if (isClosure(state.resultat)) {
      const def = resultatDef(state.resultat) || {};
      if (def.reopen) {
        return '<div class="rpv-close-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64A9 9 0 1 1 5.64 6.64"/><line x1="12" y1="2" x2="12" y2="12"/></svg>' +
          '<span>Le cycle ouvert passe à <b>Fermé</b> et un <b>nouveau cycle</b> est ouvert pour ce client. Aucune relance à programmer.</span></div>';
      }
      return '<div class="rpv-close-note ok"><span>Cycle clôturé — pas de relance.</span></div>';
    }
    const opts = [['Demain', 1], ['+3 j', 3], ['+1 sem.', 7], ['+2 sem.', 14]];
    let h = '<div class="rpv-next">';
    h += '<div class="rpv-seg">';
    opts.forEach(([lbl, d]) => {
      const target = (() => { const x = new Date(); x.setDate(x.getDate() + d); return ymd(x); })();
      const on = state.nextDate === target;
      h += '<button type="button" class="rpv-seg-b' + (on ? ' on' : '') + '" data-next="' + d + '">' + esc(lbl) + '</button>';
    });
    h += '</div>';
    h += '<div class="rpv-date-wrap"><input type="date" class="rpv-date" value="' + esc(state.nextDate || '') + '" data-next-date="1"></div>';
    h += '</div>';
    if (state.nextDate) {
      h += '<div class="rpv-next-hint">Relance calée au ' + esc(fmtDateShort(state.nextDate)) + ' à ' + NEXT_ACTION_TIME.slice(0, 5).replace(':', 'h') + '</div>';
    }
    return h;
  }
  function gaugeInner(q) {
    const col = noteColor(q.score);
    const pct = Math.round(q.score * 10);
    let ticks = '';
    for (let i = 0; i < 10; i++) ticks += '<span class="rpv-tick' + (i < q.score ? ' on' : '') + '" style="' + (i < q.score ? 'background:' + col : '') + '"></span>';
    return '<div class="rpv-gauge-row"><div class="rpv-ticks">' + ticks + '</div>' +
      '<div class="rpv-gauge-score" style="color:' + col + '">' + q.score + '<span>/10</span></div></div>' +
      '<div class="rpv-gauge-tip">' + esc(q.tip) + '</div>';
  }
  function refreshGauge() {
    const g = doc.getElementById('rpv-gauge');
    if (g) g.innerHTML = gaugeInner(qualityNote());
  }

  // --- Rendu : écran ----------------------------------------------------------
  function render() {
    const root = getRoot();
    if (!root) return;

    if (state.saved) {
      const reopen = (resultatDef(state.resultat) || {}).reopen;
      const sub = reopen
        ? 'Abandon enregistré. Cycle clôturé et nouveau cycle ouvert pour ' + (esc(state.clientName) || 'ce client') + '.'
        : 'Compte-rendu ajouté au cycle de ' + (esc(state.clientName) || 'ce client') + '.';
      root.innerHTML = STYLE +
        '<div class="rpv"><div class="rpv-done">' +
        '<div class="rpv-done-ic">' + ICON_CHECK + '</div>' +
        '<div class="rpv-done-t">Rapport enregistré</div>' +
        '<div class="rpv-done-s">' + sub + '</div>' +
        '<button type="button" class="rpv-btn primary" data-act="close">Fermer</button>' +
        '</div></div>';
      bind();
      if (!state.__closeTimer) state.__closeTimer = setTimeout(() => { state.__closeTimer = null; closePopup(); }, 1500);
      return;
    }

    const q = qualityNote();
    let body = '<div class="rpv">';
    body += ctxCard();
    if (state.error) body += '<div class="rpv-error">' + esc(state.error) + '</div>';

    body += '<div class="rpv-field"><div class="rpv-lbl">Résultat <i>*</i></div>' + resultatChips() + '</div>';

    body += '<div class="rpv-grid2">';
    body += '<div class="rpv-field"><div class="rpv-lbl">Canal <i>*</i></div>' + chipRow(CANAUX, 'canal', state.canal) + '</div>';
    body += '<div class="rpv-field"><div class="rpv-lbl">Origine <i>*</i></div>' + origineSelect() + '</div>';
    body += '</div>';

    body += '<div class="rpv-field"><div class="rpv-lbl">Compte-rendu <i>*</i></div>';
    body += amorceChips();
    body += '<textarea class="rpv-textarea" id="rpv-comment" placeholder="Ce qui s\'est dit, le besoin, les freins, la suite décidée…">' + esc(state.commentaire || '') + '</textarea>';
    body += '<div class="rpv-gauge" id="rpv-gauge">' + gaugeInner(q) + '</div>';
    body += '</div>';

    body += '<div class="rpv-field"><div class="rpv-lbl">Prochaine action ' + (isClosure(state.resultat) ? '' : '<i>*</i>') + '</div>' + nextActionRow() + '</div>';

    body += '<div class="rpv-foot">' +
      '<button type="button" class="rpv-btn ghost" data-act="cancel">Annuler</button>' +
      '<button type="button" class="rpv-btn primary" data-act="save"' + (state.saving ? ' disabled' : '') + '>' +
      (state.saving ? '<span class="rpv-spin"></span> Enregistrement…' : 'Enregistrer le rapport') + '</button>' +
      '</div>';

    body += '</div>';
    root.innerHTML = STYLE + body;
    bind();
  }

  function bind() {
    const root = getRoot();
    if (!root) return;
    root.querySelectorAll('[data-res]').forEach(el => el.addEventListener('click', () => applyResultat(el.getAttribute('data-res'))));
    root.querySelectorAll('[data-canal]').forEach(el => el.addEventListener('click', () => { state.canal = el.getAttribute('data-canal'); render(); }));
    root.querySelectorAll('[data-next]').forEach(el => el.addEventListener('click', () => setNextRelative(Number(el.getAttribute('data-next')))));
    const dateInp = root.querySelector('[data-next-date]');
    if (dateInp) dateInp.addEventListener('change', () => { state.nextTouched = true; state.nextDate = dateInp.value || null; render(); });

    root.querySelectorAll('[data-amorce]').forEach(el => el.addEventListener('click', () => {
      const list = (state.resultat && AMORCES[state.resultat]) || [];
      const a = list[Number(el.getAttribute('data-amorce'))];
      if (!a) return;
      const ta = doc.getElementById('rpv-comment');
      const cur = (state.commentaire || '').trim();
      state.commentaire = cur ? (cur + ' ' + a + ' ') : (a + ' ');
      if (ta) { ta.value = state.commentaire; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      refreshGauge();
    }));

    const ta = doc.getElementById('rpv-comment');
    if (ta) ta.addEventListener('input', () => { state.commentaire = ta.value; refreshGauge(); });

    const origSel = root.querySelector('[data-origine]');
    if (origSel) origSel.addEventListener('change', () => { state.origine = origSel.value || null; });

    const act = (name, fn) => root.querySelectorAll('[data-act="' + name + '"]').forEach(el => el.addEventListener('click', fn));
    act('save', save);
    act('cancel', resetForm);
    act('close', closePopup);
  }

  const ICON_CHECK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  // --- Styles -----------------------------------------------------------------
  const STYLE = '<style>' +
    '#' + RPV_ROOT_ID + '{--blue:#2a5ea9;--green:#53bda7;--ink:#1c2b45;--muted:#8295b3;--line:#e8eef6;--panel:#f5f8fc;--red:#e24b4a}' +
    '#' + RPV_ROOT_ID + ' .rpv{font-family:"Nunito Sans",system-ui,-apple-system,sans-serif;color:var(--ink);font-size:14px;line-height:1.5}' +
    '#' + RPV_ROOT_ID + ' .rpv *{box-sizing:border-box}' +
    '#' + RPV_ROOT_ID + ' .rpv-field{margin-bottom:13px}' +
    '#' + RPV_ROOT_ID + ' .rpv-grid2{display:grid;grid-template-columns:1fr 1fr;gap:13px 20px;margin-bottom:13px}' +
    '#' + RPV_ROOT_ID + ' .rpv-grid2 .rpv-field{margin-bottom:0}' +
    '#' + RPV_ROOT_ID + ' .rpv-lbl{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:7px}' +
    '#' + RPV_ROOT_ID + ' .rpv-lbl i{color:var(--red);font-style:normal;margin-left:1px}' +
    '#' + RPV_ROOT_ID + ' .rpv-error{background:#fdf1f1;border:1px solid #f3cfcf;color:#b23433;border-radius:10px;padding:11px 15px;font-size:13px;margin-bottom:18px;font-weight:600}' +
    // Context card
    '#' + RPV_ROOT_ID + ' .rpv-ctx{position:relative;display:flex;background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;margin-bottom:15px;box-shadow:0 4px 18px rgba(42,94,169,.06)}' +
    '#' + RPV_ROOT_ID + ' .rpv-ctx-bar{width:6px;flex-shrink:0;background:linear-gradient(180deg,var(--blue),var(--green))}' +
    '#' + RPV_ROOT_ID + ' .rpv-ctx-body{flex:1;padding:13px 16px;min-width:0}' +
    '#' + RPV_ROOT_ID + ' .rpv-ctx-top{display:flex;align-items:center;gap:13px;margin-bottom:11px}' +
    '#' + RPV_ROOT_ID + ' .rpv-ava{width:44px;height:44px;border-radius:12px;flex-shrink:0;background:linear-gradient(135deg,var(--blue),var(--green));color:#fff;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center;letter-spacing:.02em}' +
    '#' + RPV_ROOT_ID + ' .rpv-ctx-name{font-size:17px;font-weight:800;color:var(--blue);line-height:1.2}' +
    '#' + RPV_ROOT_ID + ' .rpv-ctx-meta{font-size:12px;font-weight:700;color:var(--green);margin-top:2px}' +
    '#' + RPV_ROOT_ID + ' .rpv-metrics{display:flex;flex-wrap:wrap;gap:10px}' +
    '#' + RPV_ROOT_ID + ' .rpv-metric{flex:1 1 auto;min-width:120px;background:var(--panel);border-radius:10px;padding:8px 12px}' +
    '#' + RPV_ROOT_ID + ' .rpv-m-lbl{display:block;font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#a6b6d2;margin-bottom:2px}' +
    '#' + RPV_ROOT_ID + ' .rpv-m-val{font-size:13px;font-weight:700;color:var(--ink)}' +
    '#' + RPV_ROOT_ID + ' .rpv-m-sub{font-weight:600;color:var(--muted)}' +
    '#' + RPV_ROOT_ID + ' .rpv-ctx-note{font-size:12.5px;color:var(--muted);font-style:italic}' +
    // Result chips
    '#' + RPV_ROOT_ID + ' .rpv-res-grid{display:flex;flex-wrap:wrap;gap:10px}' +
    '#' + RPV_ROOT_ID + ' .rpv-res{flex:1 1 130px;display:inline-flex;align-items:center;gap:9px;justify-content:center;font-family:inherit;font-size:14px;font-weight:700;color:var(--ink);background:#fff;border:1.5px solid var(--line);border-radius:12px;padding:11px 16px;cursor:pointer;transition:all .14s}' +
    '#' + RPV_ROOT_ID + ' .rpv-res:hover{border-color:#cdd9ea;background:var(--panel)}' +
    '#' + RPV_ROOT_ID + ' .rpv-res.on{font-weight:800;box-shadow:0 2px 10px rgba(42,94,169,.08)}' +
    '#' + RPV_ROOT_ID + ' .rpv-res-dot{width:11px;height:11px;border-radius:50%;flex-shrink:0}' +
    // Chips
    '#' + RPV_ROOT_ID + ' .rpv-chips{display:flex;flex-wrap:wrap;gap:8px}' +
    '#' + RPV_ROOT_ID + ' .rpv-chip{font-family:inherit;font-size:13px;font-weight:700;color:var(--blue);background:#fff;border:1.5px solid var(--line);border-radius:999px;padding:8px 15px;cursor:pointer;transition:all .14s}' +
    '#' + RPV_ROOT_ID + ' .rpv-chip:hover{border-color:#bcd0ea;background:var(--panel)}' +
    '#' + RPV_ROOT_ID + ' .rpv-chip.on{background:var(--blue);color:#fff;border-color:var(--blue);box-shadow:0 2px 8px rgba(42,94,169,.18)}' +
    // Select
    '#' + RPV_ROOT_ID + ' .rpv-select-wrap{position:relative}' +
    '#' + RPV_ROOT_ID + ' .rpv-select{width:100%;appearance:none;-webkit-appearance:none;border:1.5px solid var(--line);border-radius:11px;padding:11px 38px 11px 14px;font-family:inherit;font-size:14px;font-weight:600;color:var(--blue);background:#fff;outline:none;cursor:pointer;transition:border-color .14s}' +
    '#' + RPV_ROOT_ID + ' .rpv-select:focus{border-color:var(--blue)}' +
    '#' + RPV_ROOT_ID + ' .rpv-select option{color:var(--blue);font-weight:600}' +
    '#' + RPV_ROOT_ID + ' .rpv-select-ic{position:absolute;right:13px;top:50%;transform:translateY(-50%);width:17px;height:17px;color:var(--muted);pointer-events:none}' +
    // Amorces + textarea
    '#' + RPV_ROOT_ID + ' .rpv-amorces{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:9px}' +
    '#' + RPV_ROOT_ID + ' .rpv-amorce{font-family:inherit;font-size:12px;font-weight:600;color:var(--blue);background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:5px 11px;cursor:pointer;transition:all .14s}' +
    '#' + RPV_ROOT_ID + ' .rpv-amorce:hover{background:#e9f0fa;border-color:#cdd9ea}' +
    '#' + RPV_ROOT_ID + ' .rpv-textarea{width:100%;border:1.5px solid var(--line);border-radius:12px;padding:13px 15px;font-family:inherit;font-size:14px;color:var(--ink);line-height:1.55;resize:vertical;min-height:82px;outline:none;background:#fff;transition:border-color .14s}' +
    '#' + RPV_ROOT_ID + ' .rpv-textarea:focus{border-color:var(--blue)}' +
    '#' + RPV_ROOT_ID + ' .rpv-textarea::placeholder{color:#a6b6d2}' +
    // Gauge
    '#' + RPV_ROOT_ID + ' .rpv-gauge{margin-top:11px;background:var(--panel);border-radius:11px;padding:12px 15px}' +
    '#' + RPV_ROOT_ID + ' .rpv-gauge-row{display:flex;align-items:center;gap:13px}' +
    '#' + RPV_ROOT_ID + ' .rpv-ticks{flex:1;display:flex;gap:4px}' +
    '#' + RPV_ROOT_ID + ' .rpv-tick{flex:1;height:7px;border-radius:99px;background:#dde6f2;transition:background .25s}' +
    '#' + RPV_ROOT_ID + ' .rpv-gauge-score{font-size:16px;font-weight:800;white-space:nowrap}' +
    '#' + RPV_ROOT_ID + ' .rpv-gauge-score span{font-size:11px;color:#a6b6d2;font-weight:700}' +
    '#' + RPV_ROOT_ID + ' .rpv-gauge-tip{font-size:12px;color:var(--muted);margin-top:8px;line-height:1.45}' +
    // Next action
    '#' + RPV_ROOT_ID + ' .rpv-next{display:flex;flex-wrap:wrap;align-items:center;gap:12px}' +
    '#' + RPV_ROOT_ID + ' .rpv-seg{display:inline-flex;background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:4px;gap:3px}' +
    '#' + RPV_ROOT_ID + ' .rpv-seg-b{border:none;background:transparent;font-family:inherit;font-size:13px;font-weight:700;color:var(--muted);padding:8px 15px;border-radius:8px;cursor:pointer;transition:all .14s}' +
    '#' + RPV_ROOT_ID + ' .rpv-seg-b:hover{color:var(--blue)}' +
    '#' + RPV_ROOT_ID + ' .rpv-seg-b.on{background:#fff;color:var(--blue);box-shadow:0 1px 4px rgba(42,94,169,.14)}' +
    '#' + RPV_ROOT_ID + ' .rpv-date{border:1.5px solid var(--line);border-radius:10px;padding:9px 12px;font-family:inherit;font-size:13px;font-weight:600;color:var(--ink);outline:none;background:#fff}' +
    '#' + RPV_ROOT_ID + ' .rpv-date:focus{border-color:var(--blue)}' +
    '#' + RPV_ROOT_ID + ' .rpv-next-hint{font-size:12px;color:var(--green);font-weight:700;margin-top:9px}' +
    '#' + RPV_ROOT_ID + ' .rpv-close-note{display:flex;align-items:flex-start;gap:10px;font-size:13px;color:#b23433;background:rgba(226,75,74,.08);border:1px solid #f3cfcf;border-radius:11px;padding:13px 15px;font-weight:600;line-height:1.5}' +
    '#' + RPV_ROOT_ID + ' .rpv-close-note svg{width:18px;height:18px;flex-shrink:0;margin-top:1px}' +
    '#' + RPV_ROOT_ID + ' .rpv-close-note b{color:#b23433}' +
    '#' + RPV_ROOT_ID + ' .rpv-close-note.ok{color:#2c7a68;background:#ecf8f5;border-color:#bde7dc}' +
    // Footer + buttons
    '#' + RPV_ROOT_ID + ' .rpv-foot{display:flex;justify-content:flex-end;gap:12px;margin-top:24px;padding-top:20px;border-top:1px solid var(--line)}' +
    '#' + RPV_ROOT_ID + ' .rpv-btn{font-family:inherit;font-size:14px;font-weight:800;border-radius:11px;padding:13px 24px;cursor:pointer;border:1.5px solid transparent;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:all .14s}' +
    '#' + RPV_ROOT_ID + ' .rpv-btn.primary{background:var(--green);color:#fff;box-shadow:0 3px 12px rgba(83,189,167,.28)}' +
    '#' + RPV_ROOT_ID + ' .rpv-btn.primary:hover{background:#48a994;box-shadow:0 4px 16px rgba(83,189,167,.34)}' +
    '#' + RPV_ROOT_ID + ' .rpv-btn.primary:disabled{background:#a9ddd0;box-shadow:none;cursor:default}' +
    '#' + RPV_ROOT_ID + ' .rpv-btn.ghost{background:#fff;color:var(--blue);border-color:var(--line)}' +
    '#' + RPV_ROOT_ID + ' .rpv-btn.ghost:hover{border-color:#bcd0ea;background:var(--panel)}' +
    '#' + RPV_ROOT_ID + ' .rpv-spin{width:14px;height:14px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:rpv-spin .8s linear infinite}' +
    '@keyframes rpv-spin{to{transform:rotate(360deg)}}' +
    // Done
    '#' + RPV_ROOT_ID + ' .rpv-done{text-align:center;padding:36px 20px}' +
    '#' + RPV_ROOT_ID + ' .rpv-done-ic{width:58px;height:58px;border-radius:16px;background:rgba(83,189,167,.16);color:#2c7a68;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}' +
    '#' + RPV_ROOT_ID + ' .rpv-done-t{font-size:19px;font-weight:800;color:var(--blue)}' +
    '#' + RPV_ROOT_ID + ' .rpv-done-s{font-size:13.5px;color:var(--muted);margin:7px 0 20px;max-width:340px;margin-left:auto;margin-right:auto}' +
    // Responsive (largeur réelle du root via .rpv-narrow)
    '#' + RPV_ROOT_ID + '.rpv-narrow .rpv-grid2{grid-template-columns:1fr;gap:18px}' +
    '#' + RPV_ROOT_ID + '.rpv-narrow .rpv-res{flex:1 1 100%}' +
    '#' + RPV_ROOT_ID + '.rpv-narrow .rpv-foot{flex-direction:column-reverse}' +
    '#' + RPV_ROOT_ID + '.rpv-narrow .rpv-btn{width:100%}' +
    '#' + RPV_ROOT_ID + '.rpv-narrow .rpv-next{flex-direction:column;align-items:stretch}' +
    '#' + RPV_ROOT_ID + '.rpv-narrow .rpv-seg{justify-content:space-between}' +
    '#' + RPV_ROOT_ID + '.rpv-narrow .rpv-seg-b{flex:1;padding:8px 6px}' +
    '#' + RPV_ROOT_ID + '.rpv-narrow .rpv-date{width:100%}' +
    '@media (max-width:560px){' +
    '#' + RPV_ROOT_ID + ' .rpv-grid2{grid-template-columns:1fr}' +
    '#' + RPV_ROOT_ID + ' .rpv-foot{flex-direction:column-reverse}' +
    '#' + RPV_ROOT_ID + ' .rpv-btn{width:100%}}' +
    '</style>';

  // --- Responsive : .rpv-narrow selon la largeur réelle du root ---------------
  function bindNarrow(tries) {
    tries = tries || 0;
    const root = getRoot();
    if (!root) { if (tries < 40) setTimeout(() => bindNarrow(tries + 1), 200); return; }
    const W = doc.defaultView || window;
    function apply() {
      const r = getRoot(); if (!r) return;
      let w = 0; try { w = r.getBoundingClientRect().width || r.clientWidth || 0; } catch (e) { }
      if (!w) return;
      r.classList.toggle('rpv-narrow', w <= 600);
    }
    apply();
    [120, 400, 900, 1800].forEach(d => setTimeout(apply, d));
    try {
      if ('ResizeObserver' in W) {
        if (window.__rpvRO) { try { window.__rpvRO.disconnect(); } catch (e) { } }
        window.__rpvRO = new W.ResizeObserver(apply);
        window.__rpvRO.observe(root);
      } else {
        if (window.__rpvResize) W.removeEventListener('resize', window.__rpvResize);
        window.__rpvResize = apply; W.addEventListener('resize', window.__rpvResize);
      }
    } catch (e) { }
  }

  // --- Démarrage --------------------------------------------------------------
  function boot() {
    if (!getRoot()) { console.warn('[rpv] boot sans #rpv-root'); return; }
    console.log('[rpv] boot OK');
    viewerId = getViewerId();
    resolveClientAndSite();
    state.resultat = null; state.canal = null; state.origine = null; state.commentaire = '';
    state.nextDate = null; state.nextTouched = false; state.saved = false;
    state.error = null; state.ctx = null; state.idCycle = null;
    if (state.__closeTimer) { clearTimeout(state.__closeTimer); state.__closeTimer = null; }
    render();
    loadContext();
    bindNarrow();
  }

  // Boot persistant : (re)rend dès que #rpv-root apparaît vide (popup ouvert).
  // persist retiré (loader)

  boot();

}
});
