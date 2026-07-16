// RDV — module One Data (OD.define) v1 (Lot B)
/* ============================================================================
   ONGLET RDV — Timeline des rendez-vous d'un client (fiche client)
   - RPC get_rdv_client(p_id_client)
   - Timeline en cartes, chips de filtre (Tous/À venir/En retard/Passés/Traités)
   - Clic sur une carte -> sous-popup contacts du cycle (module RDC_ intégré,
     rendu fidèle de l'onglet Contacts, filtré par id_cycle_com via v_contacts_client)
   Stack : WeWeb + Supabase. Montage : <div id="rdv-root"> dans HTML Embed + JS on page load.
   ============================================================================ */
OD.define('rdv', {
  mount(__anchor, ctx) {
    __anchor.id = 'rdv-root';
  const doc = __anchor.ownerDocument || document;

  // ─── CONSTANTES ──────────────────────────────────────────────────────────
  const RV_VAR_CLIENT = '55490583-c88b-4748-916e-4d203db07742'; // objet client courant (champ IDVu)
  const RV_VAR_CACHE  = '77236b74-a383-48cc-b5df-d798ea1c65d0'; // variable objet RDV (cache persistant)
  // navigation fiche (réutilisé) pour "ouvrir la fiche complète" depuis le sous-popup
  const RV_WF_GET_FICHE = '53250f54-d14c-4622-baf4-0b89064316b6';
  const RV_PAGE_FICHE_ID = '259f1951-a2d4-4b90-ac83-0b3febe1d4ec';
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


  // ─── ÉTAT (hydraté depuis la variable WeWeb pour survivre aux destructions de DOM) ──
  function RV_readCache(){
    try { const v = wwLib.wwVariable.getValue(RV_VAR_CACHE); return (v && typeof v==='object') ? v : null; }
    catch(e){ return null; }
  }
  function RV_writeCache(){ /* cache WeWeb retiré (variable supprimée du projet) : l'état en mémoire (S) suffit */ }
  const _cache = RV_readCache();
  const S = {
    idClient: (_cache && _cache.idClient!=null) ? _cache.idClient : null,
    rows: (_cache && Array.isArray(_cache.rows)) ? _cache.rows : null,
    loading: false, error: null,
    filter: (_cache && _cache.filter) ? _cache.filter : 'tous'
  };

  // ─── HELPERS ─────────────────────────────────────────────────────────────
  function esc(s){ return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtDate(d){ if(!d) return '—'; const dt=new Date(String(d).replace(' ','T'));
    return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear(); }
  function fmtHeure(d){ if(!d) return ''; const dt=new Date(String(d).replace(' ','T'));
    return String(dt.getHours()).padStart(2,'0')+'h'+String(dt.getMinutes()).padStart(2,'0'); }
  function fmtJour(d){ if(!d) return ''; const dt=new Date(String(d).replace(' ','T'));
    const j=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'][dt.getDay()];
    return j.charAt(0).toUpperCase()+j.slice(1); }

  function getIdClient(){
    try { const cli = wwLib.wwVariable.getValue(RV_VAR_CLIENT);
      const idvu = cli && (cli.IDVu!=null ? cli.IDVu : cli['IDVu']);
      return idvu!=null ? Number(idvu) : null;
    } catch(e){ console.error('[rdv] id_client', e); return null; }
  }

  // ─── CHARGEMENT ────────────────────────────────────────────────────────────
  async function RV_load(force){
    if(S.loading) return;
    const idClient = getIdClient();
    if(idClient==null || isNaN(idClient)){ S.error='Client introuvable.'; RV_render(); return; }
    // Si le client a changé, on invalide le cache mémoire
    if(S.idClient!==idClient){ S.idClient=idClient; S.rows=null; }
    // Données déjà en cache pour ce client et pas de refresh forcé -> on garde (rendu instantané)
    if(S.rows!==null && !force){ RV_render(); return; }
    S.loading=true; S.error=null;
    if(S.rows===null) RV_render();
    try {
      const supabase = ctx.supabase;
      const { data, error } = await supabase.rpc('get_rdv_client', { p_id_client: idClient });
      if(error) throw error;
      S.rows = Array.isArray(data) ? data : [];
      RV_writeCache();
    } catch(e){
      console.error('[rdv] load', e);
      S.error = (e && e.message) ? e.message : String(e);
    } finally {
      S.loading=false; RV_render();
    }
  }

  // ─── FILTRES ───────────────────────────────────────────────────────────────
  function counts(){
    const r = S.rows || [];
    return {
      tous:   r.length,
      avenir: r.filter(x=>x.categorie==='avenir').length,
      retard: r.filter(x=>x.categorie==='retard').length,
      passe:  r.filter(x=>x.passe).length,
      traite: r.filter(x=>x.traite).length
    };
  }
  function filteredRows(){
    const r = S.rows || [];
    switch(S.filter){
      case 'avenir': return r.filter(x=>x.categorie==='avenir');
      case 'retard': return r.filter(x=>x.categorie==='retard');
      case 'passe':  return r.filter(x=>x.passe);
      case 'traite': return r.filter(x=>x.traite);
      default:       return r;
    }
  }

  // ─── RENDU ───────────────────────────────────────────────────────────────
  function chip(val, label, count){
    const on = S.filter===val;
    return '<button class="rv-chip'+(on?' on':'')+'" data-rvchip="'+esc(val)+'">'+esc(label)+
      (count!=null?'<span class="rv-cn">'+count+'</span>':'')+'</button>';
  }

  // pastille de catégorie
  function catBadge(cat){
    const map = { avenir:['À venir','av'], retard:['En retard','rt'], traite:['Traité','tr'] };
    const m = map[cat] || ['—','autre'];
    return '<span class="rv-cat '+m[1]+'">'+m[0]+'</span>';
  }

  function RV_card(p){
    const dt = p.start_date;
    const heure = fmtHeure(dt);
    const jour = fmtJour(dt);
    // bloc date à gauche
    const dd = dt ? new Date(String(dt).replace(' ','T')) : null;
    const dateBox = dd
      ? '<div class="rv-datebox"><div class="rv-d-jour">'+esc(jour)+'</div>'+
        '<div class="rv-d-num">'+String(dd.getDate()).padStart(2,'0')+'</div>'+
        '<div class="rv-d-mois">'+['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'][dd.getMonth()]+' '+dd.getFullYear()+'</div>'+
        (heure?'<div class="rv-d-h">'+heure+'</div>':'')+'</div>'
      : '<div class="rv-datebox"><div class="rv-d-num">—</div></div>';
    const meta = [];
    if(p.type) meta.push('<span class="rv-tag">'+esc(p.type)+'</span>');
    if(p.duree) meta.push('<span class="rv-mut">'+esc(p.duree)+'</span>');
    if(p.vin) meta.push('<span class="rv-mut mono">VIN '+esc(p.vin)+'</span>');
    if(p.resultat) meta.push('<span class="rv-res">'+esc(p.resultat)+'</span>');
    const hasCycle = p.id_cycle_com!=null && p.id_cycle_com!=='';
    return '<div class="rv-card'+(hasCycle?' clk':'')+'"'+(hasCycle?(' data-rvcycle="'+esc(p.id_cycle_com)+':'+esc(p.id_client)+'"'):'')+'>'+
      dateBox+
      '<div class="rv-body">'+
        '<div class="rv-line1">'+catBadge(p.categorie)+
          (p.vendeur?'<span class="rv-vend">'+esc(p.vendeur)+'</span>':'')+
          (hasCycle?'<span class="rv-open">voir les échanges ›</span>':'')+'</div>'+
        (meta.length?'<div class="rv-meta">'+meta.join('')+'</div>':'')+
        (p.commentaire?'<div class="rv-com">'+esc(p.commentaire)+'</div>':'')+
      '</div>'+
    '</div>';
  }

  function RV_render(){
    const all = doc.querySelectorAll('#rdv-root');
    for(let i=1;i<all.length;i++){ all[i].remove(); }
    const root = all[0];
    if(!root) return;
    let body='';
    if(S.loading || (S.rows===null && !S.error)){ body='<div class="rv-load">Chargement des rendez-vous…</div>'; }
    else if(S.error){ body='<div class="rv-err">Erreur : '+esc(S.error)+'</div>'; }
    else {
      const c = counts();
      let filters = '<div class="rv-filters">'+
        chip('tous','Tous',c.tous)+
        chip('avenir','À venir',c.avenir)+
        chip('retard','En retard',c.retard)+
        chip('passe','Passés',c.passe)+
        chip('traite','Traités',c.traite)+'</div>';
      const rows = filteredRows();
      let list = '';
      if(!rows.length){ list = '<div class="rv-empty">Aucun rendez-vous pour ce filtre.</div>'; }
      else { list = '<div class="rv-timeline">'+rows.map(RV_card).join('')+'</div>'; }
      body = '<div class="rv-head"><div class="rv-title">Rendez-vous</div>'+
             '<div class="rv-sub">'+rows.length+' RDV'+(rows.length!==c.tous?(' sur '+c.tous):'')+'</div></div>'+
             filters + list;
    }
    root.innerHTML = RV_STYLE + body;
  }

  // ─── STYLE TIMELINE RDV ────────────────────────────────────────────────────
  const RV_STYLE = '<style>'+
  '#rdv-root{font-family:"Nunito Sans",sans-serif;color:#2c2c2a;padding:0 4px}'+
  '#rdv-root .rv-head{display:flex;align-items:baseline;gap:10px;margin-bottom:10px}'+
  '#rdv-root .rv-title{font-size:17px;font-weight:800;color:#2a5ea9}'+
  '#rdv-root .rv-sub{font-size:13px;color:#888780}'+
  '#rdv-root .rv-load,#rdv-root .rv-err,#rdv-root .rv-empty{padding:26px;text-align:center;color:#888780;font-size:14px}'+
  '#rdv-root .rv-err{color:#a32d2d}'+
  '#rdv-root .rv-filters{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}'+
  '#rdv-root .rv-chip{border:1px solid #e3e0d8;background:#fff;border-radius:999px;padding:5px 13px;font-family:inherit;font-size:12px;font-weight:600;color:#5f5e5a;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:.12s}'+
  '#rdv-root .rv-chip:hover{border-color:#acc5e4}'+
  '#rdv-root .rv-chip.on{background:#2a5ea9;border-color:#2a5ea9;color:#fff}'+
  '#rdv-root .rv-cn{background:rgba(0,0,0,.08);border-radius:999px;padding:0 6px;font-size:11px;font-weight:700}'+
  '#rdv-root .rv-chip.on .rv-cn{background:rgba(255,255,255,.25)}'+
  '#rdv-root .rv-timeline{display:flex;flex-direction:column;gap:10px}'+
  '#rdv-root .rv-card{display:flex;gap:14px;border:1px solid #eceae3;border-radius:12px;padding:12px 14px;background:#fff;transition:.12s}'+
  '#rdv-root .rv-card.clk{cursor:pointer}'+
  '#rdv-root .rv-card.clk:hover{border-color:#acc5e4;box-shadow:0 2px 10px rgba(42,94,169,.08)}'+
  '#rdv-root .rv-datebox{flex-shrink:0;width:64px;text-align:center;border-right:1px solid #f1efe8;padding-right:12px;display:flex;flex-direction:column;justify-content:center}'+
  '#rdv-root .rv-d-jour{font-size:10px;color:#888780;text-transform:uppercase;letter-spacing:.04em}'+
  '#rdv-root .rv-d-num{font-size:24px;font-weight:800;color:#2a5ea9;line-height:1.1}'+
  '#rdv-root .rv-d-mois{font-size:10px;color:#5f5e5a}'+
  '#rdv-root .rv-d-h{font-size:12px;font-weight:700;color:#fac055;margin-top:2px}'+
  '#rdv-root .rv-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}'+
  '#rdv-root .rv-line1{display:flex;align-items:center;gap:8px;flex-wrap:wrap}'+
  '#rdv-root .rv-cat{font-size:11px;font-weight:700;border-radius:999px;padding:2px 9px}'+
  '#rdv-root .rv-cat.av{background:#eaf1fb;color:#2a5ea9}'+
  '#rdv-root .rv-cat.rt{background:#fdeaea;color:#c0392b}'+
  '#rdv-root .rv-cat.tr{background:#e1f5ee;color:#0f6e56}'+
  '#rdv-root .rv-cat.autre{background:#f1efe8;color:#5f5e5a}'+
  '#rdv-root .rv-vend{font-size:13px;font-weight:700;color:#3a3a37}'+
  '#rdv-root .rv-open{margin-left:auto;font-size:12px;font-weight:700;color:#2a5ea9}'+
  '#rdv-root .rv-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center}'+
  '#rdv-root .rv-tag{font-size:11px;font-weight:600;background:#fff1d6;color:#c08a1c;border-radius:6px;padding:2px 8px}'+
  '#rdv-root .rv-mut{font-size:12px;color:#888780}'+
  '#rdv-root .rv-mut.mono{font-variant-numeric:tabular-nums}'+
  '#rdv-root .rv-res{font-size:11px;font-weight:600;background:#f0f6f4;color:#0f6e56;border-radius:6px;padding:2px 8px}'+
  '#rdv-root .rv-com{font-size:13px;color:#4b5563;line-height:1.45}'+
  '@media (max-width:560px){'+
    '#rdv-root .rv-filters{gap:5px}'+
    '#rdv-root .rv-card{gap:10px;padding:11px 12px}'+
    '#rdv-root .rv-datebox{width:54px;padding-right:10px}'+
    '#rdv-root .rv-d-num{font-size:21px}'+
  '}'+
  '</style>';

  // ─── Fonction utilisée par le sous-popup contacts (ouvrir la fiche complète) ──
  async function R_openClientFicheTab(idClient, tab){
    if(!idClient) return;
    try {
      // Le workflow WeWeb RV_WF_GET_FICHE (53250f54) a été SUPPRIMÉ du projet :
      // on écrit le client dans SA variable (fiche-shell recharge lui-même) et
      // l'onglet voulu passe par le global lu par fiche-shell.
      try { wwLib.wwVariable.updateValue('55490583-c88b-4748-916e-4d203db07742', { IDVu: Number(idClient) }); } catch(e){}
      try { const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window; w.__odFicheTab = (tab != null ? tab : 0); } catch(e){}
      odGoFiche(RV_PAGE_FICHE_ID);
    } catch(e){ console.error('[rdv] openClientFicheTab', e); }
  }

  /* ===== MODULE SOUS-POPUP CONTACTS (repris fidèlement des bilatérales) ===== */
const RC = { idCycle:null, idClient:null, rows:null, loading:false, error:null };

function RC_open(idCycle, idClient){
  RC.idCycle = idCycle || null;
  RC.idClient = idClient || null;
  RC.rows = null; RC.error = null; RC.loading = false;
  RC_ensureOverlay();
  RC_render();
  RC_load();
}
function RC_close(){ const ov = doc.getElementById('real-contacts-ov'); if(ov) ov.remove(); }
function RC_ensureOverlay(){
  let ov = doc.getElementById('real-contacts-ov');
  if(!ov){ ov = doc.createElement('div'); ov.id='real-contacts-ov'; doc.body.appendChild(ov); }
}
async function RC_load(){
  if(!RC.idCycle){ RC.error='Cycle introuvable pour ce contact.'; RC_render(); return; }
  if(RC.loading) return;
  RC.loading=true; RC.error=null; RC_render();
  try {
    const supabase = ctx.supabase;
    const { data, error } = await supabase
      .from('v_contacts_client')
      .select('*')
      .eq('id_cycle_com', RC.idCycle)
      .order('date_contact', { ascending: false });
    if(error) throw error;
    RC.rows = data || [];
  } catch(e){
    console.error('[real-contacts] load', e);
    RC.error = (e && e.message) ? e.message : String(e);
  } finally {
    RC.loading=false; RC_render();
  }
}

function RC_esc(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function RC_fmtDate(d){ if(!d) return ''; const dt=new Date(String(d).replace(' ','T'));
  return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear()+
    ' '+String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0'); }
function RC_truncate(str,n){ return str&&str.length>n?str.substring(0,n)+'…':(str||''); }
function RC_parseAtt(raw){ try{ if(Array.isArray(raw)) return raw; if(typeof raw==='string'&&raw) return JSON.parse(raw); }catch(e){} return []; }

// Rendu d'une carte de contact (version simplifiée du template fiche client)
// Rendu FIDÈLE d'une carte de contact (transcription du template onglet Contacts de la fiche client)
function RC_card(item){
  const media = item?.media;
  const sens = item?.sens;
  const agent = item?.agent || '';
  const dateContact = item?.date_contact;
  const idLigne = (item?.id_ligne || Math.random().toString(36).substring(2,10));
  const uid = idLigne.toString().replace(/-/g,'').substring(0,8);

  const mediaAccent = { WHATSAPP:'#4CAF7D', RAPPORT_VENDEUR:'#E05252', VOIP:'#60AEDF', EMAIL:'#9E9E9E', SMS:'#F5A623', LEAD_EXTERNE:'#7C3AED' };
  const mediaBg = { WHATSAPP:'#F0FDF4', RAPPORT_VENDEUR:'#FFF5F5', VOIP:'#F0F9FF', EMAIL:'#F8F8F8', SMS:'#FFFBEB', LEAD_EXTERNE:'#F5F3FF' };
  const accent = mediaAccent[media] || '#E0E0E0';
  const bg = mediaBg[media] || '#FFFFFF';

  const formatDate = (d)=>{ if(!d) return ''; const dt=new Date(String(d).replace(' ','T'));
    return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear()+'<br>'+
      String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0'); };
  const formatRdv = (d)=>{ if(!d) return ''; const dt=new Date(String(d).replace(' ','T'));
    return 'RDV '+String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear(); };
  const truncate = (str,n)=> str&&str.length>n ? str.substring(0,n)+'…' : (str||'');
  const esc = (s)=>(s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const parseAttachments = (raw)=>{ try{ if(Array.isArray(raw)) return raw; if(typeof raw==='string'&&raw) return JSON.parse(raw); }catch(e){} return []; };

  const mediaIcons = {
    WHATSAPP: '<svg width="14" height="14" viewBox="0 0 24 24" fill="'+accent+'"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.556 4.111 1.514 5.842L.057 23.428a.75.75 0 0 0 .921.921l5.629-1.456A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.722 9.722 0 0 1-4.953-1.355l-.355-.211-3.685.954.974-3.564-.23-.368A9.722 9.722 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>',
    VOIP: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.1a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.24h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.08 6.08l1.03-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    EMAIL: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
    SMS: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    RAPPORT_VENDEUR: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    LEAD_EXTERNE: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>'
  };
  const mediaIcon = mediaIcons[media] || '';

  const isInbound = sens==='inbound' || sens==='in';
  const arrowSvg = isInbound
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';
  const arrowHtml = media!=='RAPPORT_VENDEUR'
    ? '<div style="flex-shrink:0;width:30px;height:30px;border-radius:50%;border:1.5px solid '+accent+';display:flex;align-items:center;justify-content:center;background:#fff;">'+arrowSvg+'</div>'
    : '';

  const toggleBtn = (tid,label)=> '<button id="tgl_'+tid+'" onclick="window.__rcToggle(\''+tid+'\')" style="background:none;border:none;cursor:pointer;padding:0 2px;font-size:12px;color:#9ca3af;display:inline;vertical-align:middle;margin-left:3px;line-height:1;font-family:sans-serif;">▸ '+(label||'voir plus')+'</button>';

  const SVG_PDF='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="#E94335" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6z"/><path fill="#B53024" d="M14 2v6h6l-6-6z"/><text x="12" y="17.5" text-anchor="middle" fill="#FFF" font-size="5.5" font-weight="900" font-family="Arial Black,sans-serif">PDF</text></svg>';
  const SVG_IMAGE_I='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" fill="#34A853"/><circle cx="8.5" cy="9.5" r="1.5" fill="#FFF"/><path fill="#FFF" d="M21 15l-3.5-4.5-3 4-2-2.5L8 17h13z"/></svg>';
  const SVG_GENERIC='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" stroke="#6B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const getIcon = (att)=>{ const mime=(att?.mime_type||'').toLowerCase(); const fname=(att?.filename||'').toLowerCase();
    if(mime==='application/pdf'||fname.endsWith('.pdf')) return SVG_PDF;
    if(mime.startsWith('image/')||/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(fname)) return SVG_IMAGE_I;
    return SVG_GENERIC; };
  const formatSize = (b)=>{ if(!b) return ''; if(b<1024) return b+' o'; if(b<1048576) return Math.round(b/1024)+' Ko'; return (b/1048576).toFixed(1)+' Mo'; };

  let contentHtml=''; let metaRight=''; let headerMiddle=''; let footerHtml='';

  if(media==='VOIP'){
    const url=item?.voip_recording_url; const duration=item?.voip_duration_seconds||0;
    const summary=item?.voip_summary; const transcription=item?.contenu_texte; const tonalite=item?.voip_summary?.tonalite||'';
    if(url){ const pid='vp_'+uid;
      contentHtml+='<div style="display:inline-flex;align-items:center;gap:8px;background:rgba(96,174,223,0.12);border-radius:999px;padding:5px 14px;">'+
        '<button id="btn_'+pid+'" onclick="window.__rcVoipPlay(\''+pid+'\')" style="background:none;border:none;cursor:pointer;padding:0;width:16px;height:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="10" height="12" viewBox="0 0 10 12" fill="#60AEDF"><path d="M0 0l10 6-10 6z"/></svg></button>'+
        '<span id="cur_'+pid+'" style="font-size:12px;color:#60AEDF;min-width:28px;font-variant-numeric:tabular-nums;">0:00</span>'+
        '<div style="width:130px;height:3px;background:rgba(96,174,223,0.3);border-radius:2px;cursor:pointer;position:relative;" onclick="window.__rcVoipSeek(event,this,\''+pid+'\')"><div id="prg_'+pid+'" style="height:100%;width:0%;background:#60AEDF;border-radius:2px;pointer-events:none;transition:width 0.1s linear;"></div></div>'+
        '<span id="rem_'+pid+'" style="font-size:12px;color:#60AEDF;min-width:28px;text-align:right;font-variant-numeric:tabular-nums;">'+Math.floor(duration/60)+':'+String(duration%60).padStart(2,'0')+'</span>'+
        '<div id="data_'+pid+'" data-src="'+esc(url)+'" data-dur="'+duration+'" style="display:none;"></div></div>'; }
    if(summary||transcription){ const tid='tr_'+uid; const objet=esc(summary?.objet||''); const texte=esc(transcription||'').replace(/\n/g,'<br>');
      contentHtml+='<div style="font-size:13px;color:#4b5563;line-height:1.6;margin-top:7px;"><span id="sum_'+tid+'">'+objet+'</span>'+(objet&&texte?toggleBtn(tid):'')+'<span id="ful_'+tid+'" style="display:none;color:#6b7280;font-style:italic;">'+texte+toggleBtn(tid,'voir moins')+'</span></div>'; }
    metaRight='<span style="font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;line-height:1.4">'+formatDate(dateContact)+'</span>'+(tonalite?'<span style="font-size:11px;color:#60AEDF;background:rgba(96,174,223,0.1);border:1px solid rgba(96,174,223,0.3);border-radius:999px;padding:1px 8px;white-space:nowrap;">'+esc(tonalite)+'</span>':'');
  }
  else if(media==='WHATSAPP'){
    const statut=item?.statut; const contenu=item?.contenu_texte||''; const deliveryStatus=item?.delivery_status; const isOut=sens==='out';
    const attachments=parseAttachments(item?.attachments); const att=attachments[0]; const url=att?.public_url||''; const fname=att?.filename||'';
    const placeholders=['[image]','[video]','[audio]','[document]','[sticker]'];
    const hasCaption=contenu&&!placeholders.includes(contenu.trim())&&statut!=='text';
    const captionHtml=hasCaption?'<div style="font-size:13px;color:#4b5563;line-height:1.5;word-break:break-word;margin-top:5px;">'+esc(contenu)+'</div>':'';
    if(statut==='text'){ const sid='wt_'+uid; const resume=truncate(contenu,80); const showToggle=contenu.length>80;
      contentHtml='<div style="font-size:13px;color:#4b5563;line-height:1.5;word-break:break-word;"><span id="sum_'+sid+'">'+esc(resume)+'</span>'+(showToggle?toggleBtn(sid):'')+'<span id="ful_'+sid+'" style="display:none;">'+esc(contenu)+toggleBtn(sid,'voir moins')+'</span></div>'; }
    else if(statut==='audio'){ if(url){ const wid='wa_'+uid;
      contentHtml='<div style="display:inline-flex;align-items:center;gap:8px;background:rgba(76,175,125,0.12);border-radius:999px;padding:5px 14px;width:fit-content;'+(isOut?'margin-left:auto;':'')+'">'+
        '<button id="btn_'+wid+'" onclick="window.__rcWaPlay(\''+wid+'\')" style="background:none;border:none;cursor:pointer;padding:0;width:16px;height:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="10" height="12" viewBox="0 0 10 12" fill="#4CAF7D"><path d="M0 0l10 6-10 6z"/></svg></button>'+
        '<span id="cur_'+wid+'" style="font-size:12px;color:#4CAF7D;min-width:28px;font-variant-numeric:tabular-nums;">0:00</span>'+
        '<div style="width:80px;height:3px;background:rgba(76,175,125,0.25);border-radius:2px;cursor:pointer;position:relative;flex-shrink:0;" onclick="window.__rcWaSeek(event,this,\''+wid+'\')"><div id="prg_'+wid+'" style="height:100%;width:0%;background:#4CAF7D;border-radius:2px;pointer-events:none;"></div></div>'+
        '<audio id="aud_'+wid+'" data-src="'+esc(url)+'" preload="none" style="display:none;"></audio></div>'+captionHtml; } }
    else if(statut==='image'){ if(url){
      contentHtml='<a href="'+esc(url)+'" target="_blank" class="rc-thumb" style="display:inline-block;position:relative;width:72px;height:72px;border-radius:10px;overflow:hidden;border:1px solid rgba(76,175,125,0.25);flex-shrink:0;cursor:pointer;"><img src="'+esc(url)+'" style="width:72px;height:72px;object-fit:cover;display:block;" /></a>'+captionHtml; } }
    else if(statut==='video'){ if(url){
      contentHtml='<a href="'+esc(url)+'" target="_blank" class="rc-thumb" style="display:inline-block;position:relative;width:72px;height:72px;border-radius:10px;overflow:hidden;border:1px solid rgba(76,175,125,0.25);flex-shrink:0;cursor:pointer;background:#000;"><video src="'+esc(url)+'" preload="metadata" muted style="width:72px;height:72px;object-fit:cover;display:block;pointer-events:none;"></video><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;"><svg width="10" height="12" viewBox="0 0 10 12" fill="#374151"><path d="M0 0l10 6-10 6z"/></svg></div></div></a>'+captionHtml; } }
    else if(statut==='document'){ if(url){ const short=truncate(fname,30);
      contentHtml='<div onclick="window.open(\''+esc(url)+'\',\'_blank\')" class="rc-doc" style="display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border:1px solid rgba(76,175,125,0.25);border-radius:8px;background:rgba(76,175,125,0.06);cursor:pointer;">'+getIcon(att)+'<div style="display:flex;flex-direction:column;gap:1px;"><span style="font-size:12px;color:#374151;font-weight:500;">'+esc(short)+'</span>'+(att.file_size?'<span style="font-size:11px;color:#9ca3af;">'+formatSize(att.file_size)+'</span>':'')+'</div></div>'+captionHtml; } }
    const deliveryHtml=isOut&&deliveryStatus?'<span style="font-size:14px;color:'+(deliveryStatus==='read'?'#0075df':'#9ca3af')+';">'+(deliveryStatus==='sent'?'✓':'✓✓')+'</span>':'';
    metaRight='<span style="font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;line-height:1.4">'+formatDate(dateContact)+'</span>'+deliveryHtml;
  }
  else if(media==='SMS'){
    const contenu=item?.contenu_texte||'';
    if(contenu){ const sid='sm_'+uid; const resume=truncate(contenu,80); const showToggle=contenu.length>80;
      contentHtml='<div style="font-size:13px;color:#4b5563;line-height:1.6;word-break:break-word;"><span id="sum_'+sid+'">'+esc(resume)+'</span>'+(showToggle?toggleBtn(sid):'')+'<span id="ful_'+sid+'" style="display:none;white-space:pre-wrap;">'+esc(contenu)+toggleBtn(sid,'voir moins')+'</span></div>'; }
    metaRight='<span style="font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;line-height:1.4">'+formatDate(dateContact)+'</span>';
  }
  else if(media==='EMAIL'){
    const eid='em_'+uid; const subject=item?.email_subject||'(sans sujet)'; const snippetSrc=item?.email_snippet||item?.contenu_texte||''; const snippetTrunc=truncate(snippetSrc,60);
    const sanitize=(html)=>html?html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<iframe[\s\S]*?<\/iframe>/gi,'').replace(/\s+on\w+\s*=\s*"[^"]*"/gi,'').replace(/javascript:/gi,''):'';
    const stripHtml=(html)=>html?html.replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim():'';
    const bodyHtml=sanitize(item?.email_body_html||''); const fullContent=bodyHtml||esc(item?.contenu_texte||'');
    const fullPlain=stripHtml(item?.email_body_html||'')||(item?.contenu_texte||''); const showToggle=fullPlain.length>snippetSrc.length+10;
    headerMiddle='<span style="font-size:13px;font-weight:600;color:#111827;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+esc(subject)+'">'+esc(subject)+'</span>';
    contentHtml='<div style="font-size:13px;color:#4b5563;line-height:1.5;"><span id="sum_'+eid+'" style="color:#6b7280;">'+esc(snippetTrunc)+'</span>'+(showToggle?toggleBtn(eid):'')+'<div id="ful_'+eid+'" style="display:none;color:#374151;word-break:break-word;overflow-wrap:anywhere;margin-top:4px;">'+fullContent+toggleBtn(eid,'voir moins')+'</div></div>';
    metaRight='<span style="font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;line-height:1.4">'+formatDate(dateContact)+'</span>';
  }
  else if(media==='RAPPORT_VENDEUR'){
    const resultat=item?.resultat||''; const canalContact=item?.canal_contact||''; const dtActivation=item?.dt_activation; const commentaire=item?.contenu_texte||''; const note=item?.note_chatgpt;
    const chipColors={ 'Abandon':{bg:'#fee2e2',color:'#9B1C1C',border:'#fca5a5'},'Marketing':{bg:'#ede9fe',color:'#5b21b6',border:'#c4b5fd'},'Choc':{bg:'#fef3c7',color:'#92400e',border:'#fcd34d'},'Commande':{bg:'#d1fae5',color:'#065f46',border:'#6ee7b7'},'Relance':{bg:'#dbeafe',color:'#1e40af',border:'#93c5fd'} };
    const chip=chipColors[resultat]||{bg:'#f3f4f6',color:'#374151',border:'#d1d5db'};
    headerMiddle='<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;flex:1;min-width:0;">'+
      (resultat?'<span style="background:'+chip.bg+';color:'+chip.color+';border:1px solid '+chip.border+';border-radius:999px;padding:2px 10px;font-size:12px;font-weight:500;white-space:nowrap;">'+esc(resultat)+'</span>':'')+
      (canalContact?'<span style="background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;border-radius:999px;padding:2px 10px;font-size:12px;white-space:nowrap;">'+esc(canalContact)+'</span>':'')+
      (dtActivation?'<span style="background:#eff6ff;color:#2a5ea9;border:1px solid #bfdbfe;border-radius:999px;padding:2px 10px;font-size:12px;white-space:nowrap;">'+formatRdv(dtActivation)+'</span>':'')+'</div>';
    const sid='rv_'+uid; const showToggle=commentaire.length>80; const resume=truncate(commentaire,80);
    contentHtml=commentaire?'<div style="font-size:13px;color:#4b5563;line-height:1.5;"><span id="sum_'+sid+'">'+esc(resume)+'</span>'+(showToggle?toggleBtn(sid):'')+'<span id="ful_'+sid+'" style="display:none;">'+esc(commentaire)+toggleBtn(sid,'voir moins')+'</span></div>':'';
    const noteHtml=note!=null?(()=>{ const isGood=note>=7; return '<div style="display:flex;flex-direction:column;align-items:center;gap:1px;flex-shrink:0;"><span style="font-size:13px;font-weight:700;color:'+(isGood?'#4CAF7D':'#E05252')+';background:'+(isGood?'#D1FAE5':'#FEE2E2')+';border:1.5px solid '+(isGood?'#4CAF7D':'#E05252')+';border-radius:50%;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;">'+note+'</span><span style="font-size:9px;color:#9ca3af;letter-spacing:0.02em;">IA</span></div>'; })():'';
    metaRight='<span style="font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;line-height:1.4">'+formatDate(dateContact)+'</span>'+noteHtml;
  }
  else if(media==='LEAD_EXTERNE'){
    const source=item?.origine_echange||''; const sourceRef=item?.canal_contact||''; const vehicule=item?.vehicule_interet||''; const statutBrut=item?.statut||''; const contenu=item?.contenu_texte||''; const phone=item?.phone_from||'';
    const sourceChip=source?'<span style="background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:500;white-space:nowrap;">'+esc(source)+(sourceRef?' · '+esc(truncate(sourceRef,20)):'')+'</span>':'';
    const isTraite=statutBrut==='traite';
    const statutChip=statutBrut?'<span style="background:'+(isTraite?'#d1fae5':'#fef3c7')+';color:'+(isTraite?'#065f46':'#92400e')+';border:1px solid '+(isTraite?'#6ee7b7':'#fcd34d')+';border-radius:999px;padding:2px 10px;font-size:12px;font-weight:500;white-space:nowrap;">'+(isTraite?'✓ Traité':'⏱ Non traité')+'</span>':'';
    const vehiculeChip=vehicule?'<span style="background:#f5f3ff;color:#5b21b6;border:1px solid #ddd6fe;border-radius:999px;padding:2px 10px;font-size:12px;white-space:nowrap;" title="'+esc(vehicule)+'">🚗 '+esc(truncate(vehicule,30))+'</span>':'';
    headerMiddle='<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;flex:1;min-width:0;">'+sourceChip+statutChip+vehiculeChip+'</div>';
    if(contenu||phone){ const sid='le_'+uid; const showToggle=contenu.length>80; const resume=truncate(contenu,80);
      const phoneHtml=phone?'<div style="font-size:12px;color:#6b7280;margin-top:4px;display:inline-flex;align-items:center;gap:4px;"><a href="tel:'+esc(phone)+'" style="color:#7C3AED;text-decoration:none;">'+esc(phone)+'</a></div>':'';
      contentHtml='<div style="font-size:13px;color:#4b5563;line-height:1.5;word-break:break-word;">'+(contenu?'<span id="sum_'+sid+'">'+esc(resume)+'</span>'+(showToggle?toggleBtn(sid):'')+'<span id="ful_'+sid+'" style="display:none;white-space:pre-wrap;">'+esc(contenu)+toggleBtn(sid,'voir moins')+'</span>':'')+phoneHtml+'</div>'; }
    metaRight='<span style="font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;line-height:1.4">'+formatDate(dateContact)+'</span>';
  }

  const indent = arrowHtml ? '38px' : '0';
  return '<div style="background:'+bg+';border-left:3px solid '+accent+';border-top:1px solid '+accent+'22;border-right:1px solid '+accent+'22;border-bottom:1px solid '+accent+'22;border-radius:10px;padding:10px 14px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;width:100%;box-sizing:border-box;box-shadow:0 2px 6px rgba(0,0,0,0.08);margin-bottom:8px;">'+
    '<div style="display:flex;align-items:center;gap:8px;min-width:0;">'+arrowHtml+
      '<div style="display:flex;align-items:center;gap:5px;flex-shrink:0;max-width:140px;">'+mediaIcon+'<span style="font-size:13px;font-weight:600;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="'+esc(agent)+'">'+esc(agent)+'</span></div>'+
      (headerMiddle?'<span style="color:#e5e7eb;font-size:13px;flex-shrink:0;">|</span>'+headerMiddle:'<div style="flex:1;"></div>')+
      '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:auto;">'+metaRight+'</div>'+
    '</div>'+
    (contentHtml?'<div style="margin-top:8px;padding-left:'+indent+';">'+contentHtml+'</div>':'')+
    (footerHtml?'<div style="padding-left:'+indent+';">'+footerHtml+'</div>':'')+
  '</div>';
}

function RC_render(){
  const ov = doc.getElementById('real-contacts-ov'); if(!ov) return;
  let body='';
  if(RC.loading || RC.rows===null && !RC.error){ body='<div class="rc-load">Chargement des échanges…</div>'; }
  else if(RC.error){ body='<div class="rc-err">Erreur : '+RC_esc(RC.error)+'</div>'; }
  else if(!RC.rows.length){ body='<div class="rc-load">Aucun échange enregistré pour ce cycle.</div>'; }
  else { body = RC.rows.map(RC_card).join(''); }

  const ficheBtn = RC.idClient ? '<button class="rc-fiche" data-rcfiche="'+RC.idClient+'">Ouvrir la fiche complète →</button>' : '';
  ov.innerHTML = RC_STYLE + '<div class="rc-modal">'+
    '<div class="rc-head"><div class="rc-title">Échanges du cycle</div>'+
      '<div class="rc-head-actions">'+ficheBtn+'<button class="rc-close" data-rcclose title="Fermer">×</button></div>'+
    '</div>'+
    '<div class="rc-body">'+body+'</div>'+
  '</div>';
}

// Routeur du sous-popup contacts
function RC_route(e){
  if(e.target.id==='real-contacts-ov'){ RC_close(); return; } // clic sur le fond
  const cl=e.target.closest('[data-rcclose]'); if(cl){ RC_close(); return; }
  const f=e.target.closest('[data-rcfiche]'); if(f){ const id=f.getAttribute('data-rcfiche'); RC_close(); R_openClientFicheTab(Number(id), 0); return; }
  // les liens <a> internes (pièces jointes) gardent leur comportement natif
}

// Fonctions globales d'interactivité des cartes contacts (toggle + lecteurs audio)
window.__rcToggle = function(id){
  const sum=doc.getElementById('sum_'+id); const ful=doc.getElementById('ful_'+id); const btn=doc.getElementById('tgl_'+id);
  if(!ful) return; const open=ful.style.display!=='none';
  ful.style.display=open?'none':'block'; if(sum) sum.style.display=open?'inline':'none';
  if(btn) btn.innerHTML=open?'▸ voir plus':'▸ voir moins';
};
if(!window.__rcVoipAudio) window.__rcVoipAudio=new Audio();
window.__rcVoipPlay = function(pid){
  const b=doc.getElementById('btn_'+pid);
  const pauseIcon='<svg width="12" height="12" viewBox="0 0 12 12" fill="#60AEDF"><rect x="0" y="0" width="4" height="12" rx="1"/><rect x="8" y="0" width="4" height="12" rx="1"/></svg>';
  const playIcon='<svg width="10" height="12" viewBox="0 0 10 12" fill="#60AEDF"><path d="M0 0l10 6-10 6z"/></svg>';
  const a=window.__rcVoipAudio;
  if(a.dataset.currentId&&a.dataset.currentId!==pid){ const pb=doc.getElementById('btn_'+a.dataset.currentId); const pp=doc.getElementById('prg_'+a.dataset.currentId); if(pb) pb.innerHTML=playIcon; if(pp) pp.style.width='0%'; a.pause(); a.src=''; }
  a.dataset.currentId=pid;
  if(!a.src||a.dataset.loadedId!==pid){ const dataEl=doc.getElementById('data_'+pid); if(!dataEl) return; a.src=dataEl.dataset.src; a.dataset.loadedId=pid; const dur=parseFloat(dataEl.dataset.dur)||0;
    a.ontimeupdate=function(){ const d=a.duration||dur,c=a.currentTime; const prg=doc.getElementById('prg_'+pid); const cur=doc.getElementById('cur_'+pid); const rem=doc.getElementById('rem_'+pid);
      if(prg) prg.style.width=(d>0?c/d*100:0)+'%'; if(cur) cur.textContent=Math.floor(c/60)+':'+String(Math.floor(c%60)).padStart(2,'0'); if(rem) rem.textContent=Math.floor((d-c)/60)+':'+String(Math.floor((d-c)%60)).padStart(2,'0'); };
    a.onended=function(){ if(b) b.innerHTML=playIcon; const prg=doc.getElementById('prg_'+pid); if(prg) prg.style.width='0%'; };
    a.play().then(()=>{ if(b) b.innerHTML=pauseIcon; }).catch(e=>console.warn('voip:',e)); return; }
  if(a.paused){ a.play().then(()=>{ if(b) b.innerHTML=pauseIcon; }).catch(e=>console.warn(e)); } else { a.pause(); if(b) b.innerHTML=playIcon; }
};
window.__rcVoipSeek = function(e,bar,pid){ const a=window.__rcVoipAudio; if(!a||!a.duration) return; const r=bar.getBoundingClientRect(); a.currentTime=(e.clientX-r.left)/r.width*a.duration; };
window.__rcWaPlay = function(wid){
  const a=doc.getElementById('aud_'+wid); const b=doc.getElementById('btn_'+wid); if(!a||!b) return;
  const pauseIcon='<svg width="12" height="12" viewBox="0 0 12 12" fill="#4CAF7D"><rect x="0" y="0" width="4" height="12" rx="1"/><rect x="8" y="0" width="4" height="12" rx="1"/></svg>';
  const playIcon='<svg width="10" height="12" viewBox="0 0 10 12" fill="#4CAF7D"><path d="M0 0l10 6-10 6z"/></svg>';
  if(!a.getAttribute('src')){ a.setAttribute('src',a.dataset.src); a.load();
    a.ontimeupdate=function(){ const d=a.duration,c=a.currentTime; const prg=doc.getElementById('prg_'+wid); const cur=doc.getElementById('cur_'+wid); if(prg) prg.style.width=(d>0?c/d*100:0)+'%'; if(cur) cur.textContent=Math.floor(c/60)+':'+String(Math.floor(c%60)).padStart(2,'0'); };
    a.onended=function(){ b.innerHTML=playIcon; const prg=doc.getElementById('prg_'+wid); if(prg) prg.style.width='0%'; };
    a.addEventListener('canplay',function onR(){ a.removeEventListener('canplay',onR); a.play(); b.innerHTML=pauseIcon; }); return; }
  if(a.paused){ a.play(); b.innerHTML=pauseIcon; } else { a.pause(); b.innerHTML=playIcon; }
};
window.__rcWaSeek = function(e,bar,wid){ const a=doc.getElementById('aud_'+wid); if(!a||!a.duration) return; const r=bar.getBoundingClientRect(); a.currentTime=(e.clientX-r.left)/r.width*a.duration; };

const RC_STYLE = '<style>'+
'#real-contacts-ov{position:fixed;inset:0;background:rgba(42,52,60,.45);z-index:70;display:flex;align-items:flex-start;justify-content:center;padding:32px;overflow-y:auto;font-family:"Nunito Sans",sans-serif}'+
'#real-contacts-ov .rc-modal{position:relative;background:#fff;border-radius:16px;max-width:680px;width:100%;box-shadow:0 24px 70px rgba(0,0,0,.35);margin:auto;display:flex;flex-direction:column;max-height:82vh}'+
'#real-contacts-ov .rc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid #eef0f3}'+
'#real-contacts-ov .rc-title{font-size:16px;font-weight:800;color:#2a5ea9}'+
'#real-contacts-ov .rc-head-actions{display:flex;align-items:center;gap:10px}'+
'#real-contacts-ov .rc-fiche{background:#2a5ea9;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer}'+
'#real-contacts-ov .rc-fiche:hover{background:#1f4a87}'+
'#real-contacts-ov .rc-close{width:32px;height:32px;border-radius:50%;border:none;background:#f1f3f6;color:#888;font-size:19px;line-height:32px;text-align:center;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center}'+
'#real-contacts-ov .rc-close:hover{background:#e24b4a;color:#fff}'+
'#real-contacts-ov .rc-body{padding:16px 20px;overflow-y:auto}'+
'#real-contacts-ov .rc-load,#real-contacts-ov .rc-err{padding:30px;text-align:center;color:#888;font-size:14px}'+
'#real-contacts-ov .rc-err{color:#a32d2d}'+
'#real-contacts-ov .rc-doc:hover{background:rgba(76,175,125,0.12)!important}'+
'#real-contacts-ov .rc-thumb{transition:opacity .15s}'+
'@media (max-width:560px){'+
  '#real-contacts-ov{padding:10px 8px}'+
  '#real-contacts-ov .rc-modal{max-height:94vh}'+
  '#real-contacts-ov .rc-head{padding:13px 14px}'+
  '#real-contacts-ov .rc-body{padding:12px 14px}'+
  '#real-contacts-ov .rc-title{font-size:15px}'+
  '#real-contacts-ov .rc-fiche{padding:7px 10px;font-size:12px}'+
'}'+
'</style>';
// --- fin sous-popup contacts ---


  // ─── ROUTEUR PRINCIPAL RDV ─────────────────────────────────────────────────
  function RV_route(e){
    if(e.target.closest('#real-contacts-ov')){ RC_route(e); return; }
    const root = e.target.closest('#rdv-root'); if(!root) return;
    const chipEl = e.target.closest('[data-rvchip]');
    if(chipEl){ S.filter = chipEl.getAttribute('data-rvchip'); RV_writeCache(); RV_render(); return; }
    const card = e.target.closest('[data-rvcycle]');
    if(card){ const v=card.getAttribute('data-rvcycle'); const [idCycle,idClient]=v.split(':'); RC_open(idCycle, idClient); return; }
  }

  if(window.__rdvClickHandler){ doc.removeEventListener('click', window.__rdvClickHandler, true); }
  window.__rdvClickHandler = RV_route;
  doc.addEventListener('click', RV_route, true);

  // ─── BOOT ────────────────────────────────────────────────────────────────
  function RV_dedupe(){ const all=doc.querySelectorAll('#rdv-root'); for(let i=1;i<all.length;i++){ all[i].remove(); } return all[0]||null; }
  function RV_boot(){
    let tries=0;
    const tryBoot=()=>{
      const root=RV_dedupe();
      const ready = root && (getIdClient()!=null) && wwLib.wwPlugins && wwLib.wwPlugins.supabase && ctx.supabase;
      if(ready){ RV_render(); RV_load(); return; }
      if(tries++ < 30){ setTimeout(tryBoot, 150); return; }
      if(root){ RV_render(); RV_load(); }
    };
    tryBoot();
  }
  window.__rdvReload = function(){ RV_dedupe(); RV_load(true); };

  // Détecte si le #rdv-root présent dans le DOM est "le nôtre" (déjà rendu) ou un
  // conteneur vide (re)monté par WeWeb au retour d'onglet -> dans ce cas on re-rend.
  function RV_needsRender(){
    const root = __anchor;
    if(!root) return false;
    // notre rendu contient toujours .rv-head / .rv-load / .rv-err ; sinon c'est un conteneur vide
    return !root.querySelector('.rv-head, .rv-load, .rv-err, .rv-empty');
  }
  // Observateur : surveille les (ré)apparitions de #rdv-root et relance le boot.
  // self-boot/observer retiré (loader)

  // Premier lancement immédiat.
  RV_boot();

}
});
