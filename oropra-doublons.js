/* =====================================================================
 * oropra-doublons.js — détection de doublons client, partagée
 *
 * Le même contrôle était copié-collé dans cf-fiche, client-search,
 * agenda, kanban et vo-liste. Un seul endroit désormais : le jour où le
 * score évolue, rien à répercuter.
 *
 * Expose window.oropraDoublons :
 *   check(supabase, data, opts)   -> null | { score, seuil, candidats }
 *   html(dup, prefixe)            -> le bloc d'alerte
 *   css(prefixe)                  -> le style, à injecter une fois
 *   signaler(supabase, idvu, cands)
 *   prochainIdvu(supabase)        -> numéro de fiche, sans collision
 *
 * Aucun état interne : l'appelant garde le sien.
 * ===================================================================== */
(function () {
  'use strict';

  var SEUIL_AFFICHAGE = 40;   // en dessous, c'est un homonyme, pas un doublon

  var LIBELLES = {
    siret_identique:      'même SIRET',
    mobile_identique:     'même portable',
    email_identique:      'même e-mail',
    fixe_identique:       'même fixe',
    nom_prenom_exact:     'même nom et prénom',
    nom_prenom_inverses:  'nom et prénom inversés',
    nom_trigram:          'nom très proche',
    naissance_identique:  'même date de naissance',
    naissance_differente: 'dates de naissance différentes',
    insee_identique:      'même commune',
    adresse_trigram:      'adresse très proche',
    email_different:      'e-mails différents',
    nature_differente:    'société contre particulier',
    vin_commun:           'même véhicule'
  };

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function payloadDepuis(d, opts) {
    opts = opts || {};
    return {
      id_client: d.IDVu != null ? String(d.IDVu) : null,
      nom:       d.NOM || null,
      prenom:    d.PRENOM || null,
      mobile:    d.TEl_MOB || null,
      fixe:      d.TEL_FIXE || null,
      email:     d.EMAIL || null,
      cp:        d.code_postal || d.CP_VILLE || null,
      insee:     d.code_insee || null,
      adresse:   d.ADRESSE || null,
      naissance: d.BIRTHDAY || null,
      siret:     (d.SIRET != null && d.SIRET !== '') ? String(d.SIRET) : null,
      nature:    (opts.societe || d.idmultivu === 1 || d.idmultivu === '1') ? '1' : '0'
    };
  }

  /* --- la détection ---------------------------------------------------
   * Ne lève jamais : une panne du contrôle ne doit pas empêcher un
   * vendeur d'enregistrer son client.
   */
  async function check(supabase, data, opts) {
    if (!supabase || !data) return null;
    opts = opts || {};
    try {
      var r = await supabase.rpc('client_doublons', {
        p_payload: payloadDepuis(data, opts)
      });
      if (r.error) { console.warn('[doublons]', r.error.message); return null; }
      var d = r.data || {};
      var seuil = opts.seuilAffichage != null ? opts.seuilAffichage : SEUIL_AFFICHAGE;
      var retenus = (d.candidats || []).filter(function (c) {
        return (c.score || 0) >= seuil;
      });
      if (!retenus.length) return null;
      return { score: d.score, seuil: d.seuil, candidats: retenus };
    } catch (e) {
      console.warn('[doublons] indisponible:', e && e.message);
      return null;
    }
  }

  /* --- le rendu -------------------------------------------------------
   * prefixe = le préfixe CSS de l'embed appelant ('crs', 'cf', 'kb'…)
   */
  function html(dup, prefixe, opts) {
    if (!dup || !dup.candidats || !dup.candidats.length) return '';
    var p = prefixe || 'od';
    opts = opts || {};
    var pluriel = dup.candidats.length > 1;

    var cartes = dup.candidats.map(function (c) {
      var a = c.apercu || {};
      var nom = [a.civilite, a.nom, a.societe ? '' : a.prenom].filter(Boolean).join(' ');
      var signaux = Object.keys(c.detail || {})
        .filter(function (k) { return (c.detail[k] || 0) > 0; })
        .map(function (k) {
          return '<span class="' + p + '-dup-tag">' + esc(LIBELLES[k] || k) + '</span>';
        }).join('');
      var lieu = [a.code_postal, a.ville].filter(Boolean).join(' ');
      var contact = [a.mobile, a.email].filter(Boolean).join(' · ');
      var veh = a.vehicules > 0
        ? '<span class="' + p + '-dup-veh">' + esc(a.vehicules) +
          ' véhicule' + (a.vehicules > 1 ? 's' : '') + '</span>'
        : '';
      return '<div class="' + p + '-dup-card">' +
        '<div class="' + p + '-dup-card-head"><strong>' + esc(nom) + '</strong>' +
        '<span class="' + p + '-dup-score">' + esc(c.score) + '/100</span></div>' +
        '<div class="' + p + '-dup-card-body">' + esc(lieu) +
        (lieu && contact ? ' — ' : '') + esc(contact) + ' ' + veh + '</div>' +
        '<div class="' + p + '-dup-tags">' + signaux + '</div>' +
        '<button class="' + p + '-btn ' + p + '-btn-ghost ' + p + '-dup-open" ' +
        'data-od-action="dup-open" data-od-idvu="' + esc(c.id_client) + '">' +
        'Ouvrir cette fiche</button>' +
        '</div>';
    }).join('');

    return '<div class="' + p + '-dup">' +
      '<div class="' + p + '-dup-head"><div>' +
      '<div class="' + p + '-dup-title">' +
      (pluriel ? 'Ces clients existent' : 'Ce client existe') + ' peut-être déjà</div>' +
      '<div class="' + p + '-dup-sub">Vous pouvez enregistrer sans choisir : ' +
      'un administrateur vérifiera.</div></div></div>' +
      cartes +
      '<div class="' + p + '-dup-actions">' +
      '<button class="' + p + '-btn ' + p + '-btn-ghost" data-od-action="dup-dismiss">' +
      'Modifier ma saisie</button>' +
      '<button class="' + p + '-btn ' + p + '-btn-primary" data-od-action="dup-force"' +
      (opts.saving ? ' disabled' : '') + '>' +
      (opts.libelleForce || 'Enregistrer quand même') + '</button>' +
      '</div></div>';
  }

  function css(prefixe) {
    var p = '.' + (prefixe || 'od');
    return p + '-dup{background:#fff7e6;border:1px solid #f5c785;border-radius:8px;padding:16px;margin-bottom:18px;display:flex;flex-direction:column;gap:12px}' +
      p + '-dup-head{display:flex;gap:10px;align-items:flex-start;color:#a85c0e}' +
      p + '-dup-title{font-size:13px;font-weight:600}' +
      p + '-dup-sub{font-size:12px;color:#8a6a3a;margin-top:2px}' +
      p + '-dup-card{background:#fff;border:1px solid #f0d9b5;border-radius:6px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}' +
      p + '-dup-card-head{display:flex;justify-content:space-between;align-items:center;gap:10px}' +
      p + '-dup-card-head strong{font-size:14px;color:#1f2937}' +
      p + '-dup-score{font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:600;color:#a85c0e;border:1px solid #e8b877;border-radius:4px;padding:1px 7px;white-space:nowrap}' +
      p + '-dup-card-body{font-size:12.5px;color:#6b7280}' +
      p + '-dup-veh{color:#2a5ea9;font-weight:500}' +
      p + '-dup-tags{display:flex;flex-wrap:wrap;gap:5px}' +
      p + '-dup-tag{font-size:11px;background:#fdf3e3;color:#a85c0e;border-radius:3px;padding:2px 7px}' +
      p + '-dup-open{align-self:flex-start;font-size:12px;padding:4px 10px}' +
      p + '-dup-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}';
  }

  /* --- la trace -------------------------------------------------------
   * « Créer quand même » n'est pas un échec : c'est un choix, et il
   * atterrit dans la file d'arbitrage plutôt que dans l'oubli.
   */
  async function signaler(supabase, idvu, candidats) {
    if (!supabase || idvu == null || !candidats) return 0;
    var n = 0;
    for (var i = 0; i < candidats.length; i++) {
      var c = candidats[i];
      try {
        var r = await supabase.rpc('client_signaler_doublon', {
          p_id_client_entrant:  idvu,
          p_id_client_candidat: c.id_client,
          p_score:  c.score,
          p_detail: c.detail || {}
        });
        if (!r.error) n++;
      } catch (e) { console.warn('[doublons] signalement:', e && e.message); }
    }
    return n;
  }

  /* --- l'identifiant de fiche -----------------------------------------
   * Les embeds font un max(IDVu)+1 en lecture simple : deux vendeurs qui
   * créent en même temps tirent le même numéro. La RPC pose un verrou.
   * Repli sur l'ancienne méthode si elle n'est pas encore déployée.
   */
  async function prochainIdvu(supabase) {
    try {
      var r = await supabase.rpc('client_prochain_idvu');
      if (!r.error && r.data != null) return Number(r.data);
    } catch (e) { /* repli */ }
    var m = await supabase.from('CLIENT').select('IDVu')
      .order('IDVu', { ascending: false }).limit(1).maybeSingle();
    var row = m && m.data;
    return (row && row.IDVu != null ? Number(row.IDVu) : 0) + 1;
  }

  /* --- colonnes que la base calcule elle-même -------------------------- */
  var NON_ECRIVABLES = ['nom_norm', 'prenom_norm', 'identite_norm', 'tel_mob_e164',
    'tel_fixe_e164', 'email_norm', 'cp5', 'siret_txt', 'adresse_norm',
    'statut', 'merged_into'];

  function nettoyerPayload(payload) {
    NON_ECRIVABLES.forEach(function (k) { delete payload[k]; });
    return payload;
  }

  window.oropraDoublons = {
    check: check,
    html: html,
    css: css,
    signaler: signaler,
    prochainIdvu: prochainIdvu,
    nettoyerPayload: nettoyerPayload,
    SEUIL_AFFICHAGE: SEUIL_AFFICHAGE,
    LIBELLES: LIBELLES
  };
})();
