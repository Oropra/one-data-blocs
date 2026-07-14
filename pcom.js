// PCOM — module One Data (OD.define) v1 (Lot B)
/* ============================================================================
   P.COMMERCIALES — Tableau des propositions/BDC d'un client (fiche client)
   - RPC get_propales_client(p_id_client, p_viewer_id_user)
   - Colonnes : N°, Date, Réseau, Affaire, Site, Vendeur, VN/VO, VIN, Montant,
     Type paiement, Financement, Statut, Actions
   - Filtres : chips Statut, chips VN/VO, sélection imbriquée Réseau>Affaire>Site
   - Actions (si peut_agir) : Modifier (si status='propale') + PDF (cache/génération)
   Stack : WeWeb + Supabase. À coller dans un composant Code de l'onglet.
   ============================================================================ */
OD.define('pcom', {
  mount(__anchor, ctx) {
    __anchor.id = 'pcom-root';
  const doc = __anchor.ownerDocument || document;

  // ─── CONSTANTES À RENSEIGNER ───────────────────────────────────────────────
  // Variable WeWeb contenant l'OBJET client courant (son champ IDVu = l'id client) :
  const PC_VAR_CLIENT = '55490583-c88b-4748-916e-4d203db07742';
  const PC_VAR_CACHE  = '20ec044e-28cb-4f1e-9d3d-362f3e6c3f38'; // variable objet PCOM (cache persistant)
  // Collection du user connecté (USERCONNECTED) :
  // Navigation propale update (réutilisé des bilatérales) :
  const PC_PAGE_PROPALE_UPDATE = 'efb6187d-2330-4392-86ed-bc5ad2489fed';
  const PC_VAR_ID_PROPALE      = 'aac565e9-ad32-4f81-bf8d-adb611322e62';
  // PDF (Edge Function + templates + bucket) :
  const PC_PDF_EDGE_FN    = 'generate-document';
  const PC_TPL_PROPOSITION  = 'a8a39792-b795-4a07-92a2-8bd307ec105b';
  const PC_TPL_BON_COMMANDE = 'a440bca0-e10a-4549-a11b-f4ad512b010d';
  const PC_PDF_BUCKET     = 'commercial-documents';

  // ─── ÉTAT ──────────────────────────────────────────────────────────────────
  // ─── ÉTAT (hydraté depuis la variable WeWeb pour survivre aux destructions de DOM) ──
  function PC_readCache(){
    try { const v = wwLib.wwVariable.getValue(PC_VAR_CACHE); return (v && typeof v==='object') ? v : null; }
    catch(e){ return null; }
  }
  function PC_writeCache(){
    try { wwLib.wwVariable.updateValue(PC_VAR_CACHE, {
      idClient: S.idClient, rows: S.rows,
      fStatus: S.fStatus, fVnVo: S.fVnVo, fReseau: S.fReseau, fAffaire: S.fAffaire, fSite: S.fSite
    }); } catch(e){ console.error('[pcom] writeCache', e); }
  }
  const _cache = PC_readCache();
  const S = {
    idClient: (_cache && _cache.idClient!=null) ? _cache.idClient : null,
    rows: (_cache && Array.isArray(_cache.rows)) ? _cache.rows : null,
    loading: false, error: null,
    fStatus: (_cache && _cache.fStatus) ? _cache.fStatus : 'tous',
    fVnVo:   (_cache && _cache.fVnVo)   ? _cache.fVnVo   : 'tous',
    fReseau: (_cache && _cache.fReseau) ? _cache.fReseau : '',
    fAffaire:(_cache && _cache.fAffaire)? _cache.fAffaire: '',
    fSite:   (_cache && _cache.fSite)   ? _cache.fSite   : ''
  };

  // ─── HELPERS ─────────────────────────────────────────────────────────────
  function esc(s){ return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function eur(n){ if(n==null||n==='') return '—'; const v=Number(n); if(isNaN(v)) return '—'; return new Intl.NumberFormat('fr-FR').format(Math.round(v))+' €'; }
  function fmtDate(d){ if(!d) return '—'; const dt=new Date(String(d).replace(' ','T'));
    return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear(); }

  function getViewerId(){
    try { const row = ((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser;
      return row && (row.ID_User!=null ? Number(row.ID_User) : null);
    } catch(e){ console.error('[pcom] viewer', e); return null; }
  }
  function getIdClient(){
    try {
      const cli = wwLib.wwVariable.getValue(PC_VAR_CLIENT);
      const idvu = cli && (cli.IDVu!=null ? cli.IDVu : (cli['IDVu']));
      return idvu!=null ? Number(idvu) : null;
    }
    catch(e){ console.error('[pcom] id_client', e); return null; }
  }

  // ─── CHARGEMENT ────────────────────────────────────────────────────────────
  async function PC_load(force){
    if(S.loading) return;
    const idClient = getIdClient();
    const viewer = getViewerId();
    if(idClient==null || isNaN(idClient)){ S.error='Client introuvable.'; PC_render(); return; }
    if(S.idClient!==idClient){ S.idClient=idClient; S.rows=null; }
    if(S.rows!==null && !force){ PC_render(); return; }
    S.loading=true; S.error=null;
    if(S.rows===null) PC_render();
    try {
      const supabase = ctx.supabase;
      const { data, error } = await supabase.rpc('get_propales_client', {
        p_id_client: idClient, p_viewer_id_user: viewer
      });
      if(error) throw error;
      S.rows = Array.isArray(data) ? data : [];
      PC_writeCache();
    } catch(e){
      console.error('[pcom] load', e);
      S.error = (e && e.message) ? e.message : String(e);
    } finally {
      S.loading=false; PC_render();
    }
  }

  // ─── FILTRES (chips + sélection imbriquée) ───────────────────────────────
  function uniqueSorted(arr){ return [...new Set(arr.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'fr')); }

  function filteredRows(){
    let r = S.rows || [];
    if(S.fStatus!=='tous') r = r.filter(x=>x.status===S.fStatus);
    if(S.fVnVo!=='tous')   r = r.filter(x=>(x.vn_vo||'').toUpperCase()===S.fVnVo);
    if(S.fReseau)  r = r.filter(x=>(x.reseau||'')===S.fReseau);
    if(S.fAffaire) r = r.filter(x=>(x.affaire||'')===S.fAffaire);
    if(S.fSite)    r = r.filter(x=>(x.site||'')===S.fSite);
    return r;
  }

  // Listes imbriquées : affaires dépendent du réseau choisi ; sites de l'affaire
  function reseauxList(){ return uniqueSorted((S.rows||[]).map(x=>x.reseau)); }
  function affairesList(){
    let base = S.rows||[];
    if(S.fReseau) base = base.filter(x=>(x.reseau||'')===S.fReseau);
    return uniqueSorted(base.map(x=>x.affaire));
  }
  function sitesList(){
    let base = S.rows||[];
    if(S.fReseau)  base = base.filter(x=>(x.reseau||'')===S.fReseau);
    if(S.fAffaire) base = base.filter(x=>(x.affaire||'')===S.fAffaire);
    return uniqueSorted(base.map(x=>x.site));
  }

  // ─── RENDU ───────────────────────────────────────────────────────────────
  function chip(active, val, label, count){
    const on = active===val;
    return '<button class="pc-chip'+(on?' on':'')+'" data-pcchip="'+esc(val)+'">'+esc(label)+
      (count!=null?'<span class="pc-cn">'+count+'</span>':'')+'</button>';
  }

  function statusBadge(st){
    const map = { propale:['Propale','prop'], bdc:['BDC','bdc'], win:['Vendu','win'], lose:['Abandon','aband'] };
    const m = map[st] || [st||'—','autre'];
    return '<span class="pc-badge '+m[1]+'">'+esc(m[0])+'</span>';
  }

  function PC_render(){
    const all = doc.querySelectorAll('#pcom-root');
    for(let i=1;i<all.length;i++){ all[i].remove(); } // sécurité anti-doublon
    const root = all[0];
    if(!root) return;
    let body = '';
    if(S.loading || (S.rows===null && !S.error)){ body = '<div class="pc-load">Chargement des propositions…</div>'; }
    else if(S.error){ body = '<div class="pc-err">Erreur : '+esc(S.error)+'</div>'; }
    else {
      const rows = filteredRows();
      // ── Barre de filtres
      const all = S.rows||[];
      const stCount = st => all.filter(x=>x.status===st).length;
      let filters = '<div class="pc-filters">';
      // Statut
      filters += '<div class="pc-fgroup"><span class="pc-flabel">Statut</span>'+
        chip(S.fStatus,'tous','Tous',all.length)+
        chip(S.fStatus,'propale','Propales',stCount('propale'))+
        chip(S.fStatus,'bdc','BDC',stCount('bdc'))+
        chip(S.fStatus,'win','Wins',stCount('win'))+
        chip(S.fStatus,'lose','Abandons',stCount('lose'))+'</div>';
      // VN/VO
      const vnCount = all.filter(x=>(x.vn_vo||'').toUpperCase()==='VN').length;
      const voCount = all.filter(x=>(x.vn_vo||'').toUpperCase()==='VO').length;
      filters += '<div class="pc-fgroup"><span class="pc-flabel">Type</span>'+
        chip(S.fVnVo,'tous','Tous',all.length)+
        chip(S.fVnVo,'VN','VN',vnCount)+
        chip(S.fVnVo,'VO','VO',voCount)+'</div>';
      filters += '</div>';
      // Sélection imbriquée Réseau > Affaire > Site (selects)
      const opt = (list,sel)=> '<option value="">Tous</option>'+list.map(v=>'<option value="'+esc(v)+'"'+(sel===v?' selected':'')+'>'+esc(v)+'</option>').join('');
      filters += '<div class="pc-cascade">'+
        '<label>Réseau <select data-pcsel="reseau">'+opt(reseauxList(),S.fReseau)+'</select></label>'+
        '<label>Affaire <select data-pcsel="affaire">'+opt(affairesList(),S.fAffaire)+'</select></label>'+
        '<label>Site <select data-pcsel="site">'+opt(sitesList(),S.fSite)+'</select></label>'+
        (S.fReseau||S.fAffaire||S.fSite||S.fStatus!=='tous'||S.fVnVo!=='tous'
          ? '<button class="pc-reset" data-pcreset>Réinitialiser</button>' : '')+
      '</div>';

      // ── Tableau
      let table = '';
      if(!rows.length){ table = '<div class="pc-empty">Aucune proposition pour ces filtres.</div>'; }
      else {
        table = '<div class="pc-tablewrap"><table class="pc-table"><thead><tr>'+
          '<th>N°</th><th class="ac">Actions</th><th>Date</th><th>Vendeur</th>'+
          '<th>Type</th><th>VIN</th><th class="ar">Montant</th><th>Paiement</th><th>Financement</th>'+
          '<th>Statut</th><th>Réseau</th><th>Affaire</th><th>Site</th></tr></thead><tbody>';
        rows.forEach(p=>{
          const fin = [p.type_financement, p.organisme_financement].filter(Boolean).join(' · ') || '—';
          // Actions visibles seulement si peut_agir. PDF toujours à la même position ;
          // emplacement Modifier réservé (présent si propale, sinon espace vide) pour alignement.
          let actions = '';
          if(p.peut_agir){
            const pdfBtn = '<button class="pc-act pc-pdf" data-pcpdf="'+p.id_propale_bdc+':'+(p.status||'')+'" data-pcmaj="'+(p.updated_at||'')+'" title="PDF">'+PC_PDF_SVG+'</button>';
            const modBtn = (p.status==='propale')
              ? '<button class="pc-act pc-mod" data-pcmod="'+p.id_propale_bdc+'" title="Modifier la propale">'+PC_EDIT_SVG+'</button>'
              : '<span class="pc-act-spacer"></span>';
            actions = '<div class="pc-actions">'+pdfBtn+modBtn+'</div>';
          } else {
            actions = '<span class="pc-noact" title="Action réservée au vendeur créateur et à sa hiérarchie">—</span>';
          }
          table += '<tr>'+
            '<td class="mono">'+esc(p.id_propale_bdc)+'</td>'+
            '<td class="ac">'+actions+'</td>'+
            '<td>'+fmtDate(p.created_at)+'</td>'+
            '<td>'+esc(p.vendeur||'—')+'</td>'+
            '<td>'+esc((p.vn_vo||'—').toUpperCase())+'</td>'+
            '<td class="mono vin">'+esc(p.vin||'—')+'</td>'+
            '<td class="ar">'+eur(p.montant)+'</td>'+
            '<td>'+esc(p.type_paiement||'—')+'</td>'+
            '<td>'+esc(fin)+'</td>'+
            '<td>'+statusBadge(p.status)+'</td>'+
            '<td>'+esc(p.reseau||'—')+'</td>'+
            '<td>'+esc(p.affaire||'—')+'</td>'+
            '<td>'+esc(p.site||'—')+'</td>'+
          '</tr>';
        });
        table += '</tbody></table></div>';
      }

      body = '<div class="pc-head"><div class="pc-title">Propositions commerciales</div>'+
             '<div class="pc-sub">'+rows.length+' document'+(rows.length>1?'s':'')+(rows.length!==all.length?(' sur '+all.length):'')+'</div></div>'+
             filters + table;
    }
    root.innerHTML = PC_STYLE + body;
  }

  // ─── ACTIONS ───────────────────────────────────────────────────────────────
  function PC_modif(idPropale){
    try { wwLib.wwVariable.updateValue(PC_VAR_ID_PROPALE, Number(idPropale)); }
    catch(e){ console.error('[pcom] updateValue', e); }
    try { wwLib.wwApp.goTo(PC_PAGE_PROPALE_UPDATE); }
    catch(e){ console.error('[pcom] goTo', e); }
  }

  // PDF : propale = régénère (modifiable) si périmé ; bdc/win = cache via trace.
  // updated_at fiable en prod -> comparaison de dates.
  async function PC_pdf(idPropale, status, majIso){
    const supabase = ctx.supabase;
    const isPropale = (status==='propale');
    const type = isPropale ? 'proposition_commerciale' : 'bon_de_commande';
    const templateId = isPropale ? PC_TPL_PROPOSITION : PC_TPL_BON_COMMANDE;
    const btn = doc.querySelector('[data-pcpdf="'+idPropale+':'+status+'"]');
    if(btn){ btn.disabled=true; btn.style.opacity='.5'; }
    const open = (url)=>{ try { wwLib.getFrontWindow().open(url,'_blank'); } catch(e){ window.open(url,'_blank'); } };
    const done = ()=>{ if(btn){ btn.disabled=false; btn.style.opacity=''; } };
    const generer = async ()=>{
      const { data: gen, error: gErr } = await supabase.functions.invoke(PC_PDF_EDGE_FN, {
        body: { id_propale_bdc: idPropale, template_id: templateId, type: type }
      });
      if(gErr) throw gErr;
      if(gen && gen.ok && gen.signed_url){ open(gen.signed_url); }
      else { throw new Error(gen && gen.error ? gen.error : 'Génération PDF échouée'); }
    };
    try {
      const { data: docs, error: qErr } = await supabase
        .from('generated_documents').select('storage_path, ready_at')
        .eq('id_propale_bdc', idPropale).eq('type', type).eq('status','ready')
        .order('ready_at',{ascending:false}).limit(1);
      if(qErr) throw qErr;
      if(docs && docs.length && docs[0].storage_path){
        const pdfTime = docs[0].ready_at ? new Date(docs[0].ready_at).getTime() : 0;
        const majTime = majIso ? new Date(String(majIso).replace(' ','T')).getTime() : 0;
        if(pdfTime >= majTime){
          const { data: signed, error: sErr } = await supabase.storage
            .from(PC_PDF_BUCKET).createSignedUrl(docs[0].storage_path, 3600);
          if(!sErr && signed && signed.signedUrl){ open(signed.signedUrl); return; }
        }
      }
      await generer();
    } catch(e){
      console.error('[pcom] pdf', e);
      alert('Impossible de générer le PDF : '+((e&&e.message)?e.message:e));
    } finally { done(); }
  }

  // ─── ROUTEUR (capture) ───────────────────────────────────────────────────
  function PC_route(e){
    const root = e.target.closest('#pcom-root'); if(!root) return;
    const chipEl = e.target.closest('[data-pcchip]');
    if(chipEl){ const v=chipEl.getAttribute('data-pcchip');
      const grp = chipEl.closest('.pc-fgroup');
      const label = grp && grp.querySelector('.pc-flabel') ? grp.querySelector('.pc-flabel').textContent : '';
      if(label.indexOf('Statut')>=0) S.fStatus=v; else S.fVnVo=v;
      PC_writeCache(); PC_render(); return; }
    const reset = e.target.closest('[data-pcreset]');
    if(reset){ S.fStatus='tous'; S.fVnVo='tous'; S.fReseau=''; S.fAffaire=''; S.fSite=''; PC_writeCache(); PC_render(); return; }
    const mod = e.target.closest('[data-pcmod]');
    if(mod){ PC_modif(Number(mod.getAttribute('data-pcmod'))); return; }
    const pdf = e.target.closest('[data-pcpdf]');
    if(pdf){ const v=pdf.getAttribute('data-pcpdf'); const [pid,st]=v.split(':'); const maj=pdf.getAttribute('data-pcmaj')||null; PC_pdf(Number(pid), st, maj); return; }
  }
  function PC_change(e){
    const sel = e.target.closest('[data-pcsel]'); if(!sel) return;
    if(!e.target.closest('#pcom-root')) return;
    const which = sel.getAttribute('data-pcsel'); const val = sel.value;
    if(which==='reseau'){ S.fReseau=val; S.fAffaire=''; S.fSite=''; }   // reset des niveaux inférieurs
    else if(which==='affaire'){ S.fAffaire=val; S.fSite=''; }
    else if(which==='site'){ S.fSite=val; }
    PC_writeCache(); PC_render();
  }

  // Anti-accumulation : on retire les anciens listeners (d'une exécution précédente
  // de l'IIFE) avant d'attacher les nouveaux. Les références sont stockées sur window.
  if(window.__pcomClickHandler){ doc.removeEventListener('click', window.__pcomClickHandler, true); }
  if(window.__pcomChangeHandler){ doc.removeEventListener('change', window.__pcomChangeHandler, true); }
  window.__pcomClickHandler = PC_route;
  window.__pcomChangeHandler = PC_change;
  doc.addEventListener('click', PC_route, true);
  doc.addEventListener('change', PC_change, true);

  // ─── SVG ───────────────────────────────────────────────────────────────────
  const PC_PDF_SVG='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>';
  const PC_EDIT_SVG='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';

  // ─── STYLE ─────────────────────────────────────────────────────────────────
  const PC_STYLE = '<style>'+
  '#pcom-root{font-family:"Nunito Sans",sans-serif;color:#2c2c2a;padding:0 4px}'+
  '#pcom-root .pc-head{display:flex;align-items:baseline;gap:10px;margin-bottom:10px}'+
  '#pcom-root .pc-title{font-size:17px;font-weight:800;color:#2a5ea9}'+
  '#pcom-root .pc-sub{font-size:13px;color:#888780}'+
  '#pcom-root .pc-load,#pcom-root .pc-err,#pcom-root .pc-empty{padding:26px;text-align:center;color:#888780;font-size:14px}'+
  '#pcom-root .pc-err{color:#a32d2d}'+
  '#pcom-root .pc-filters{display:flex;flex-wrap:wrap;gap:18px;margin-bottom:10px}'+
  '#pcom-root .pc-fgroup{display:flex;align-items:center;gap:6px;flex-wrap:wrap}'+
  '#pcom-root .pc-flabel{font-size:11px;font-weight:700;color:#888780;text-transform:uppercase;letter-spacing:.04em;margin-right:2px}'+
  '#pcom-root .pc-chip{border:1px solid #e3e0d8;background:#fff;border-radius:999px;padding:4px 11px;font-family:inherit;font-size:12px;font-weight:600;color:#5f5e5a;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:.12s}'+
  '#pcom-root .pc-chip:hover{border-color:#acc5e4}'+
  '#pcom-root .pc-chip.on{background:#2a5ea9;border-color:#2a5ea9;color:#fff}'+
  '#pcom-root .pc-cn{background:rgba(0,0,0,.08);border-radius:999px;padding:0 6px;font-size:11px;font-weight:700}'+
  '#pcom-root .pc-chip.on .pc-cn{background:rgba(255,255,255,.25)}'+
  '#pcom-root .pc-cascade{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:14px}'+
  '#pcom-root .pc-cascade label{display:flex;flex-direction:column;font-size:11px;font-weight:700;color:#888780;text-transform:uppercase;letter-spacing:.04em;gap:3px}'+
  '#pcom-root .pc-cascade select{font-family:inherit;font-size:13px;font-weight:500;color:#2c2c2a;border:1px solid #e3e0d8;border-radius:8px;padding:6px 10px;background:#fff;min-width:150px;cursor:pointer}'+
  '#pcom-root .pc-cascade select:focus{outline:none;border-color:#2a5ea9}'+
  '#pcom-root .pc-reset{border:none;background:none;color:#2a5ea9;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;text-decoration:underline;padding:7px 0}'+
  '#pcom-root .pc-tablewrap{overflow-x:auto;border:1px solid #eceae3;border-radius:12px}'+
  '#pcom-root .pc-table{width:100%;border-collapse:collapse;font-size:13px}'+
  '#pcom-root .pc-table thead th{background:#acc5e4;color:#2a5ea9;text-align:left;padding:9px 12px;font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap;position:sticky;top:0}'+
  '#pcom-root .pc-table th.ar,#pcom-root .pc-table td.ar{text-align:right}'+
  '#pcom-root .pc-table th.ac,#pcom-root .pc-table td.ac{text-align:center}'+
  '#pcom-root .pc-table tbody td{padding:9px 12px;border-top:1px solid #f1efe8;white-space:nowrap;color:#3a3a37}'+
  '#pcom-root .pc-table tbody tr:hover{background:#f8faf9}'+
  '#pcom-root .pc-table .mono{font-variant-numeric:tabular-nums;color:#5f5e5a}'+
  '#pcom-root .pc-table .vin{font-size:11px;letter-spacing:.02em}'+
  '#pcom-root .pc-badge{display:inline-block;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:700}'+
  '#pcom-root .pc-badge.prop{background:#eaf1fb;color:#2a5ea9}'+
  '#pcom-root .pc-badge.bdc{background:#fff1d6;color:#c08a1c}'+
  '#pcom-root .pc-badge.win{background:#e1f5ee;color:#0f6e56}'+
  '#pcom-root .pc-badge.aband{background:#fdeaea;color:#c0392b}'+
  '#pcom-root .pc-badge.autre{background:#f1efe8;color:#5f5e5a}'+
  '#pcom-root .pc-actions{display:inline-flex;align-items:center;gap:4px;justify-content:flex-start}'+
  '#pcom-root .pc-act{width:30px;height:30px;border-radius:8px;border:1px solid #ece9e1;background:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;transition:.12s;vertical-align:middle}'+
  '#pcom-root .pc-act-spacer{width:30px;height:30px;flex-shrink:0;display:inline-block}'+
  '#pcom-root .pc-pdf{color:#e24b4a}#pcom-root .pc-pdf:hover{background:#fdeaea;border-color:#e24b4a}'+
  '#pcom-root .pc-mod{color:#2a5ea9}#pcom-root .pc-mod:hover{background:rgba(42,94,169,.10);border-color:#2a5ea9}'+
  '#pcom-root .pc-noact{color:#c9c6bd}'+
  '@media (max-width:560px){'+
    '#pcom-root .pc-filters{gap:12px}'+
    '#pcom-root .pc-cascade{gap:10px}'+
    '#pcom-root .pc-cascade label{flex:1 1 100%}'+
    '#pcom-root .pc-cascade select{min-width:0;width:100%}'+
    '#pcom-root .pc-table thead th,#pcom-root .pc-table tbody td{padding:8px 10px}'+
  '}'+
  '</style>';

  // ─── BOOT ────────────────────────────────────────────────────────────────
  // Supprime d'éventuels doublons de #pcom-root (si le boot a tourné plusieurs fois)
  function PC_dedupe(){
    const all = doc.querySelectorAll('#pcom-root');
    for(let i=1;i<all.length;i++){ all[i].remove(); } // ne garde que le premier
    return all[0] || null;
  }

  function PC_boot(){
    // Attendre que le div de l'embed (#pcom-root) ET la variable client + Supabase soient prêts.
    let tries = 0;
    const tryBoot = ()=>{
      const root = PC_dedupe(); // récupère le 1er #pcom-root et purge les doublons
      const ready = root && (getIdClient()!=null) && wwLib.wwPlugins && wwLib.wwPlugins.supabase && ctx.supabase;
      if(ready){ PC_render(); PC_load(); return; }
      if(tries++ < 30){ setTimeout(tryBoot, 150); return; } // ~4.5s max
      if(root){ PC_render(); PC_load(); } // dernier essai (affichera l'erreur si besoin)
    };
    tryBoot();
  }
  // Expose un rechargement manuel (ex. après retour de la page propale update)
  window.__pcomReload = function(){ PC_dedupe(); PC_load(true); };

  // Re-render si le #pcom-root présent est un conteneur vide (re)monté par WeWeb au retour d'onglet.
  function PC_needsRender(){
    const root = __anchor;
    if(!root) return false;
    return !root.querySelector('.pc-head, .pc-load, .pc-err, .pc-empty');
  }
  // self-boot/observer retiré (loader)

  // Premier lancement immédiat.
  PC_boot();
}
});
