// HISTORIQUE — module One Data (OD.define) v1 (Lot B)
// ============================================================================
//  FICHE CLIENT — Onglet HISTORIQUE CLIENT  ·  root: #oropra-historique-root
//  Timeline des cycles (v_historique_cycles, id_client=IDVu, id_site=selected).
//  Carte par cycle : résultat, dates, durée, agent, score IA, barre canaux,
//  dernier contact, commentaire. Clic -> modale des échanges du cycle
//  (v_contacts_client, même filtre média, rendu réutilisé depuis contacts.js).
// ============================================================================
OD.define('historique', {
  mount(__anchor, ctx) {
    __anchor.id = 'oropra-historique-root';
  if (!window.wwLib) return;
  var VAR_CLIENT = '55490583-c88b-4748-916e-4d203db07742';
  var VAR_SITE   = '39fecccf-9296-43b7-b5b6-eadaa928290d';
  var doc = wwLib.getFrontDocument();
  var sb = ctx.supabase;
  function getRoot() { return __anchor; }

  // self-boot/observer retiré (loader)
  if (!getRoot()) return;

  var state = window.__histoState || (window.__histoState = { rows: null, loading: true, err: null, idvu: null });
  function readVar(id) { try { return wwLib.wwVariable.getValue(id); } catch (e) { return null; } }
  function currentIdvu() { var c = readVar(VAR_CLIENT); return c && c.IDVu != null ? Number(c.IDVu) : null; }
  var esc = function (s) { return (s || '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
  var fmtD = function (d) { if (!d) return ''; var dt = new Date(d); if (isNaN(dt)) return ''; var p=function(n){return String(n).padStart(2,'0');}; return p(dt.getDate())+'/'+p(dt.getMonth()+1)+'/'+dt.getFullYear(); };
  var fmtRel = function (d) { if (!d) return ''; var dt=new Date(d),now=new Date(),diff=Math.floor((now-dt)/86400000); if(diff===0)return "aujourd'hui"; if(diff===1)return 'hier'; if(diff<7)return 'il y a '+diff+' jours'; if(diff<30)return 'il y a '+Math.floor(diff/7)+' sem.'; if(diff<365)return 'il y a '+Math.floor(diff/30)+' mois'; var y=Math.floor(diff/365); return 'il y a '+y+' an'+(y>1?'s':''); };

  var mediaColors = { VOIP:'#60AEDF', WHATSAPP:'#4CAF7D', EMAIL:'#9E9E9E', SMS:'#F5A623', RAPPORT_VENDEUR:'#E05252', LEAD_EXTERNE:'#7C3AED' };
  var mediaLabels = { VOIP:'Appel', WHATSAPP:'WA', EMAIL:'Email', SMS:'SMS', RAPPORT_VENDEUR:'RPV', LEAD_EXTERNE:'Lead' };
  var resultChip = {
    'Abandon':{bg:'#fee2e2',color:'#9B1C1C',border:'#fca5a5'},'Marketing':{bg:'#ede9fe',color:'#5b21b6',border:'#c4b5fd'},
    'Choc':{bg:'#fef3c7',color:'#92400e',border:'#fcd34d'},'Commande':{bg:'#d1fae5',color:'#065f46',border:'#6ee7b7'},'Relance':{bg:'#dbeafe',color:'#1e40af',border:'#93c5fd'}
  };
  var accentByResult = { 'Abandon':'#E05252','Marketing':'#5b21b6','Choc':'#F5A623','Commande':'#4CAF7D','Relance':'#60AEDF' };

  // ---- carte cycle (porté de histo_item) ----
  function cycleCard(item) {
    var chip = resultChip[item.resultat] || { bg:'#f3f4f6', color:'#374151', border:'#d1d5db' };
    var accent = accentByResult[item.resultat] || '#9E9E9E';
    var canaux = [ {k:'VOIP',n:item.nb_voip},{k:'WHATSAPP',n:item.nb_wa},{k:'EMAIL',n:item.nb_email},{k:'SMS',n:item.nb_sms},{k:'RAPPORT_VENDEUR',n:item.nb_rpv} ];
    var total = canaux.reduce(function(s,c){return s+(c.n||0);},0);
    var barre = total > 0
      ? '<div style="display:flex;gap:2px;height:6px;border-radius:4px;overflow:hidden;margin-top:10px;">' +
          canaux.filter(function(c){return c.n>0;}).map(function(c){return '<div title="'+mediaLabels[c.k]+' : '+c.n+'" style="flex:'+c.n+';background:'+mediaColors[c.k]+';min-width:4px;"></div>';}).join('') +
        '</div><div style="display:flex;gap:8px;margin-top:5px;flex-wrap:wrap;">' +
          canaux.filter(function(c){return c.n>0;}).map(function(c){return '<span style="font-size:11px;color:'+mediaColors[c.k]+';font-weight:600;">'+mediaLabels[c.k]+' '+c.n+'</span>';}).join('') +
        '</div>'
      : '<div style="font-size:11px;color:#d1d5db;margin-top:8px;">Aucun contact enregistré</div>';
    var score = (item.score_ia_moyen != null && item.nb_rpv > 0) ? (function(){ var sc=parseFloat(item.score_ia_moyen); if(sc===0)return ''; var g=sc>=7; return '<div style="display:flex;flex-direction:column;align-items:center;gap:1px;flex-shrink:0;"><span style="font-size:12px;font-weight:700;color:'+(g?'#4CAF7D':'#E05252')+';background:'+(g?'#D1FAE5':'#FEE2E2')+';border:1.5px solid '+(g?'#4CAF7D':'#E05252')+';border-radius:50%;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;">'+sc+'</span><span style="font-size:9px;color:#9ca3af;">IA</span></div>'; })() : '';
    var derMediaColor = mediaColors[item.dernier_contact_media] || '#9ca3af';
    var derMediaLabel = mediaLabels[item.dernier_contact_media] || (item.dernier_contact_media || '');
    var dernier = item.dernier_contact_date ? '<div style="display:flex;align-items:center;gap:5px;margin-top:8px;padding-top:8px;border-top:1px solid #f3f4f6;"><span style="font-size:11px;color:#9ca3af;">Dernier contact :</span><span style="font-size:11px;color:'+derMediaColor+';font-weight:600;">'+esc(derMediaLabel)+'</span><span style="font-size:11px;color:#9ca3af;">'+fmtRel(item.dernier_contact_date)+'</span></div>' : '';
    var comm = item.dernier_commentaire ? '<div style="font-size:12px;color:#6b7280;line-height:1.5;margin-top:8px;padding:7px 10px;background:#f9fafb;border-radius:6px;border-left:2px solid '+accent+';">'+esc(item.dernier_commentaire.length>120?item.dernier_commentaire.substring(0,120)+'\u2026':item.dernier_commentaire)+'</div>' : '';
    var duree = item.duree_jours === 0 ? 'Même jour' : (item.duree_jours < 0 ? Math.abs(item.duree_jours)+' j' : item.duree_jours+' j');
    var dureeColor = item.duree_jours < 0 ? '#E05252' : (item.duree_jours === 0 ? '#9ca3af' : '#4CAF7D');
    return '<div class="hi-card" data-cycle="'+esc(item.id_cycle_com)+'" style="background:#fff;border:1px solid #e5e7eb;border-left:3px solid '+accent+';border-radius:10px;padding:12px 14px;box-shadow:0 2px 6px rgba(0,0,0,.06);cursor:pointer;width:100%;box-sizing:border-box;">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">' +
        '<div style="display:flex;flex-direction:column;gap:5px;min-width:0;">' +
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
            (item.resultat?'<span style="background:'+chip.bg+';color:'+chip.color+';border:1px solid '+chip.border+';border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;">'+esc(item.resultat)+'</span>':'') +
            '<span style="font-size:11px;color:#9ca3af;">N\u00b0 '+esc(item.id_cycle_com)+'</span></div>' +
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><span style="font-size:11px;color:#6b7280;">\ud83d\udcc5 '+fmtD(item.date_ouverture)+' \u2192 '+fmtD(item.date_fermeture)+'</span><span style="font-size:11px;color:'+dureeColor+';font-weight:500;">'+duree+'</span></div>' +
          (item.agent_principal?'<span style="font-size:11px;color:#374151;font-weight:500;">\ud83d\udc64 '+esc(item.agent_principal)+'</span>':'') +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">'+score+'<span style="font-size:11px;color:#9ca3af;white-space:nowrap;">'+(item.total_contacts||0)+' contact'+((item.total_contacts>1)?'s':'')+'</span></div>' +
      '</div>' + barre + comm + dernier +
    '</div>';
  }

  // ---- modale des échanges d'un cycle ----
  async function openModal(idCycle) {
    var ov = doc.getElementById('hi-modal');
    if (ov) ov.remove();
    ov = doc.createElement('div'); ov.id = 'hi-modal';
    ov.innerHTML = '<div class="hi-ov-bg"></div><div class="hi-ov-box"><div class="hi-ov-hd"><span>Échanges du cycle N° '+esc(idCycle)+'</span><button class="hi-ov-x" aria-label="Fermer">&times;</button></div><div class="hi-ov-body"><div class="hi-ov-msg">Chargement…</div></div></div>';
    (doc.body || doc.documentElement).appendChild(ov);
    var close = function () { ov.remove(); };
    ov.querySelector('.hi-ov-bg').addEventListener('click', close);
    ov.querySelector('.hi-ov-x').addEventListener('click', close);
    try {
      var res = await sb.from('v_contacts_client')
        .select('id_ligne, date_contact, media, sens, statut, contenu_texte, agent, voip_recording_url, voip_summary, voip_duration_seconds, delivery_status, email_subject, email_snippet, email_body_html, email_has_attachments, attachments, canal_contact, resultat, dt_activation, note_chatgpt, origine_echange, vehicule_interet, phone_from')
        .eq('id_cycle_com', idCycle).order('date_contact', { ascending: false });
      if (res.error) throw res.error;
      var rows = res.data || [];
      if (window.__oropraContactFilter) rows = window.__oropraContactFilter(rows);
      var body = ov.querySelector('.hi-ov-body');
      if (!rows.length) { body.innerHTML = '<div class="hi-ov-msg">Aucun échange sur ce cycle.</div>'; return; }
      if (window.__oropraContactCard) body.innerHTML = '<div class="hi-ov-list">' + rows.map(window.__oropraContactCard).join('') + '</div>';
      else body.innerHTML = '<div class="hi-ov-msg">' + rows.length + ' échange(s).</div>';
    } catch (e) {
      console.error('[histo] modal', e);
      var b = ov.querySelector('.hi-ov-body'); if (b) b.innerHTML = '<div class="hi-ov-msg" style="color:#e24b4a">Erreur : ' + esc(e.message || e) + '</div>';
    }
  }

  // ---- data ----
  async function load() {
    var idvu = currentIdvu();
    if (idvu == null) { state.rows = []; state.loading = false; return; }
    try {
      var site = readVar(VAR_SITE);
      var q = sb.from('v_historique_cycles').select('*').eq('id_client', idvu).order('date_ouverture', { ascending: false });
      if (site != null && site !== '') q = q.eq('id_site', Number(site));
      var res = await q;
      if (res.error) throw res.error;
      state.rows = res.data || [];
      state.loading = false;
    } catch (e) { console.error('[histo]', e); state.err = e.message || String(e); state.loading = false; }
  }

  var STYLE = '<style>' +
    '#oropra-historique-root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
    '.hi-sum{display:flex;gap:0;flex-wrap:wrap;margin-bottom:22px;padding:14px 8px;background:#fbfcfe;border:1px solid #e8eef7;border-radius:14px}' +
    '.hi-stat{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:2px 20px;border-right:1px solid #e8eef7;flex:0 0 auto}' +
    '.hi-stat:last-child{border-right:none}' +
    '.hi-sv{font-size:21px;font-weight:800;color:#1F4A85;line-height:1}' +
    '.hi-sl{font-size:10.5px;color:#7a98c5;font-weight:700;text-transform:uppercase;letter-spacing:.4px}' +
    '.hi-chip{font-size:12px;font-weight:700;border:1px solid;border-radius:999px;padding:3px 12px;display:inline-block}' +
    '.hi-tl{position:relative;padding:6px 0}' +
    '.hi-tl::before{content:"";position:absolute;left:50%;top:6px;bottom:6px;width:2px;background:#dbe6f5;transform:translateX(-50%)}' +
    '.hi-item{position:relative;width:50%;padding:0 28px;margin-bottom:18px;box-sizing:border-box}' +
    '.hi-item.hi-left{left:0}' +
    '.hi-item.hi-right{left:50%}' +
    '.hi-node{position:absolute;top:15px;width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid #9E9E9E;box-shadow:0 0 0 3px #fff;z-index:1}' +
    '.hi-item.hi-left .hi-node{right:-8px}' +
    '.hi-item.hi-right .hi-node{left:-8px}' +
    '.hi-card{transition:box-shadow .15s,transform .15s}' +
    '.hi-card:hover{box-shadow:0 10px 24px rgba(31,74,133,.14);transform:translateY(-1px)}' +
    '.hi-msg{text-align:center;padding:44px 20px;color:#7a98c5;font-size:14px}' +
    '#hi-modal{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center}' +
    '.hi-ov-bg{position:absolute;inset:0;background:rgba(20,40,80,.45)}' +
    '.hi-ov-box{position:relative;background:#fff;border-radius:14px;width:min(760px,92vw);max-height:86vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(20,40,80,.35);overflow:hidden}' +
    '.hi-ov-hd{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#eef4fc;border-bottom:1px solid #dbe6f5;font-weight:800;color:#1F4A85;font-size:15px}' +
    '.hi-ov-x{border:none;background:none;font-size:24px;line-height:1;color:#5a7196;cursor:pointer;padding:0 4px}' +
    '.hi-ov-x:hover{color:#1F4A85}' +
    '.hi-ov-body{padding:16px 18px;overflow-y:auto}' +
    '.hi-ov-list{display:flex;flex-direction:column;gap:10px}' +
    '.hi-ov-msg{text-align:center;padding:36px 10px;color:#7a98c5;font-size:14px}' +
    '@media(max-width:720px){' +
      '.hi-tl::before{left:11px}' +
      '.hi-item{width:100%;left:0;padding:0 0 0 30px;margin-bottom:14px}' +
      '.hi-item.hi-right{left:0}' +
      '.hi-item .hi-node{left:3px;right:auto}' +
      '.hi-stat{padding:2px 14px}' +
    '}' +
    '</style>';

  function summaryHtml() {
    var rows = state.rows || [];
    var total = rows.length;
    var commandes = rows.filter(function (r) { return r.resultat === 'Commande'; }).length;
    var taux = total ? Math.round(commandes / total * 100) : 0;
    var durs = rows.map(function (r) { return Number(r.duree_jours); }).filter(function (n) { return !isNaN(n) && n > 0; });
    var avg = durs.length ? Math.round(durs.reduce(function (a, b) { return a + b; }, 0) / durs.length) : null;
    var dernier = rows[0] && rows[0].resultat;
    var dChip = resultChip[dernier] || { bg: '#f3f4f6', color: '#374151', border: '#d1d5db' };
    return '<div class="hi-sum">' +
      '<div class="hi-stat"><span class="hi-sv">' + total + '</span><span class="hi-sl">cycle' + (total > 1 ? 's' : '') + '</span></div>' +
      '<div class="hi-stat"><span class="hi-sv" style="color:#2f8a76">' + taux + '%</span><span class="hi-sl">transformation</span></div>' +
      (avg != null ? '<div class="hi-stat"><span class="hi-sv">' + avg + ' j</span><span class="hi-sl">durée moyenne</span></div>' : '') +
      (dernier ? '<div class="hi-stat"><span class="hi-sl" style="margin-bottom:4px">dernier résultat</span><span class="hi-chip" style="background:' + dChip.bg + ';color:' + dChip.color + ';border-color:' + dChip.border + '">' + esc(dernier) + '</span></div>' : '') +
    '</div>';
  }

  function render() {
    var root = getRoot(); if (!root) return;
    if (state.loading) { root.innerHTML = STYLE + '<div class="hi-msg">Chargement de l\'historique…</div>'; return; }
    if (state.err) { root.innerHTML = STYLE + '<div class="hi-msg" style="color:#e24b4a">Erreur : ' + esc(state.err) + '</div>'; return; }
    if (!state.rows || !state.rows.length) { root.innerHTML = STYLE + '<div class="hi-msg">Aucun cycle pour ce client.</div>'; return; }
    root.innerHTML = STYLE + summaryHtml() + '<div class="hi-tl">' + state.rows.map(function (c, i) {
      var accent = accentByResult[c.resultat] || '#9E9E9E';
      var side = (i % 2 === 0) ? 'hi-left' : 'hi-right';
      return '<div class="hi-item ' + side + '"><div class="hi-node" style="border-color:' + accent + '"></div>' + cycleCard(c) + '</div>';
    }).join('') + '</div>';
    root.querySelectorAll('.hi-card').forEach(function (el) {
      el.addEventListener('click', function () { openModal(el.getAttribute('data-cycle')); });
    });
  }

  // surveillance du changement de client (le shell ne détruit plus le panneau)
  if (!window.__histoWatch) window.__histoWatch = setInterval(function () {
    var c = currentIdvu();
    if (c != null && c !== state.idvu) { state.rows = null; state.loading = true; state.err = null; state.idvu = c; render(); load().then(render); }
  }, 500);

  if (!getRoot()) return;
  var _cur = currentIdvu();
  if (_cur !== state.idvu) { state.rows = null; state.loading = true; state.err = null; state.idvu = _cur; }
  render();
  if (state.rows == null) { load().then(render); }
}
});
