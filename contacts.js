// CONTACTS — module One Data (OD.define) v1 (Lot B)
// ============================================================================
//  FICHE CLIENT — Onglet CONTACTS (v2, aligné sur le rendu natif)
//  root: #oropra-contacts-root
//  Timeline v_contacts_client du cycle en cours (CYCLE_COM ~ "Ouvert").
//  Filtre média : (VOIP && voip_recording_url non vide) || media<>VOIP.
//  Médias : WHATSAPP · VOIP · EMAIL · SMS · RAPPORT_VENDEUR · LEAD_EXTERNE.
// ============================================================================
OD.define('contacts', {
  mount(__anchor, ctx) {
    __anchor.id = 'oropra-contacts-root';
  if (!window.wwLib) return;
  var VAR_CLIENT = '55490583-c88b-4748-916e-4d203db07742';
  var VAR_SITE   = '39fecccf-9296-43b7-b5b6-eadaa928290d';
  var doc = wwLib.getFrontDocument();
  var sb = ctx.supabase;
  function getRoot() { return __anchor; }

  // self-boot/observer retiré (loader)

  var state = window.__contactsState || (window.__contactsState = { rows: null, loading: true, err: null, idvu: null });
  function readVar(id) { try { return wwLib.wwVariable.getValue(id); } catch (e) { return null; } }
  function currentIdvu() { var c = readVar(VAR_CLIENT); return c && c.IDVu != null ? Number(c.IDVu) : null; }

  // ---- helpers (portés du template) ----
  var esc = function (s) { return (s || '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
  var formatDate = function (d) { if (!d) return ''; var dt = new Date(d); if (isNaN(dt)) return esc(d); var p=function(n){return String(n).padStart(2,'0');}; return p(dt.getDate())+'/'+p(dt.getMonth()+1)+'/'+dt.getFullYear()+'<br>'+p(dt.getHours())+':'+p(dt.getMinutes()); };
  var formatRdv = function (d) { if (!d) return ''; var dt = new Date(d); var p=function(n){return String(n).padStart(2,'0');}; return 'RDV '+p(dt.getDate())+'/'+p(dt.getMonth()+1)+'/'+dt.getFullYear(); };
  var truncate = function (str, n) { return str && str.length > n ? str.substring(0, n) + '\u2026' : (str || ''); };
  var parseAttachments = function (raw) { try { if (Array.isArray(raw)) return raw; if (typeof raw === 'string' && raw) return JSON.parse(raw); } catch (e) {} return []; };
  var formatSize = function (b) { if (!b) return ''; if (b < 1024) return b + ' o'; if (b < 1048576) return Math.round(b/1024) + ' Ko'; return (b/1048576).toFixed(1) + ' Mo'; };

  // ---- globals (une fois) : lecteur audio unifié + toggle + download PJ ----
  if (!window.__voipAudio) window.__voipAudio = new Audio();
  if (!window.__ctPlay) window.__ctPlay = function (btnId, accent) {
    var d = document, a = window.__voipAudio;
    var pauseIcon = '<svg width="12" height="12" viewBox="0 0 12 12" fill="'+accent+'"><rect x="0" y="0" width="4" height="12" rx="1"/><rect x="8" y="0" width="4" height="12" rx="1"/></svg>';
    var playIcon  = '<svg width="10" height="12" viewBox="0 0 10 12" fill="'+accent+'"><path d="M0 0l10 6-10 6z"/></svg>';
    var b = d.getElementById('btn_' + btnId);
    if (a.dataset.currentId && a.dataset.currentId !== btnId) {
      var pb = d.getElementById('btn_' + a.dataset.currentId), pp = d.getElementById('prg_' + a.dataset.currentId);
      if (pb) pb.innerHTML = pb.dataset.play || playIcon; if (pp) pp.style.width = '0%'; a.pause(); a.src = '';
    }
    a.dataset.currentId = btnId;
    if (b) b.dataset.play = playIcon;
    if (!a.src || a.dataset.loadedId !== btnId) {
      var dataEl = d.getElementById('data_' + btnId); if (!dataEl) return;
      a.src = dataEl.dataset.src; a.dataset.loadedId = btnId;
      var dur = parseFloat(dataEl.dataset.dur) || 0;
      a.ontimeupdate = function () { var D=a.duration||dur, c=a.currentTime; var prg=d.getElementById('prg_'+btnId),cur=d.getElementById('cur_'+btnId),rem=d.getElementById('rem_'+btnId); if(prg)prg.style.width=(D>0?c/D*100:0)+'%'; if(cur)cur.textContent=Math.floor(c/60)+':'+String(Math.floor(c%60)).padStart(2,'0'); if(rem)rem.textContent=Math.floor((D-c)/60)+':'+String(Math.floor((D-c)%60)).padStart(2,'0'); };
      a.onended = function () { if (b) b.innerHTML = playIcon; var prg=d.getElementById('prg_'+btnId); if(prg)prg.style.width='0%'; };
      a.play().then(function(){ if(b) b.innerHTML = pauseIcon; }).catch(function(e){ console.warn('audio:', e); });
      return;
    }
    if (a.paused) { a.play().then(function(){ if(b) b.innerHTML = pauseIcon; }).catch(function(e){ console.warn(e); }); }
    else { a.pause(); if (b) b.innerHTML = playIcon; }
  };
  if (!window.__ctSeek) window.__ctSeek = function (e, bar) { var a = window.__voipAudio; if (!a || !a.duration) return; var r = bar.getBoundingClientRect(); a.currentTime = (e.clientX - r.left) / r.width * a.duration; };
  if (!window.__toggle) window.__toggle = function (id) { var d=document, sum=d.getElementById('sum_'+id), ful=d.getElementById('ful_'+id), btn=d.getElementById('tgl_'+id); if(!ful)return; var open=ful.style.display!=='none'; ful.style.display=open?'none':'block'; if(sum)sum.style.display=open?'inline':'none'; if(btn)btn.innerHTML=open?'\u25b8 voir plus':'\u25b8 voir moins'; };
  if (!window.__emDownload) window.__emDownload = async function (attId, filename) { try { var supabase = window.wwLib && window.wwLib.wwPlugins && window.wwLib.wwPlugins['supabase'] && window.wwLib.wwPlugins['supabase'].instance; if(!supabase){alert('Supabase indisponible');return;} var card=document.getElementById('att_'+attId); var sp=card&&card.getAttribute('data-storage-path'); if(!sp){alert('Chemin introuvable');return;} var res=await supabase.storage.from('email-attachments').createSignedUrl(sp,60); if(res.error)throw res.error; var a=document.createElement('a'); a.href=res.data.signedUrl; a.download=filename; a.target='_blank'; document.body.appendChild(a); a.click(); a.remove(); } catch(err){ console.error(err); alert('Echec: '+(err&&err.message||err)); } };

  // lecteur audio (pill) réutilisable
  function audioPill(url, duration, accent, uid) {
    var pid = 'a_' + uid;
    return '<div style="display:inline-flex;align-items:center;gap:8px;background:'+accent+'1f;border-radius:999px;padding:5px 14px;max-width:100%;box-sizing:border-box;">' +
      '<button id="btn_'+pid+'" onclick="window.__ctPlay(\''+pid+'\',\''+accent+'\')" style="background:none;border:none;cursor:pointer;padding:0;width:16px;height:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="10" height="12" viewBox="0 0 10 12" fill="'+accent+'"><path d="M0 0l10 6-10 6z"/></svg></button>' +
      '<span id="cur_'+pid+'" style="font-size:12px;color:'+accent+';min-width:28px;font-variant-numeric:tabular-nums;">0:00</span>' +
      '<div style="flex:1 1 60px;min-width:40px;max-width:130px;height:3px;background:'+accent+'4d;border-radius:2px;cursor:pointer;position:relative;" onclick="window.__ctSeek(event,this)"><div id="prg_'+pid+'" style="height:100%;width:0%;background:'+accent+';border-radius:2px;pointer-events:none;transition:width .1s linear;"></div></div>' +
      '<span id="rem_'+pid+'" style="font-size:12px;color:'+accent+';min-width:28px;text-align:right;font-variant-numeric:tabular-nums;">'+Math.floor(duration/60)+':'+String(duration%60).padStart(2,'0')+'</span>' +
      '<div id="data_'+pid+'" data-src="'+esc(url)+'" data-dur="'+duration+'" style="display:none;"></div></div>';
  }

  // ---- icônes média + flèches + toggle ----
  var mediaAccent = { WHATSAPP:'#4CAF7D', RAPPORT_VENDEUR:'#E05252', VOIP:'#60AEDF', EMAIL:'#9E9E9E', SMS:'#F5A623', LEAD_EXTERNE:'#7C3AED' };
  var mediaBg     = { WHATSAPP:'#F0FDF4', RAPPORT_VENDEUR:'#FFF5F5', VOIP:'#F0F9FF', EMAIL:'#F8F8F8', SMS:'#FFFBEB', LEAD_EXTERNE:'#F5F3FF' };
  function mediaIconSvg(media, accent) {
    var I = {
      WHATSAPP:'<svg width="14" height="14" viewBox="0 0 24 24" fill="'+accent+'"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.556 4.111 1.514 5.842L.057 23.428a.75.75 0 0 0 .921.921l5.629-1.456A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.722 9.722 0 0 1-4.953-1.355l-.355-.211-3.685.954.974-3.564-.23-.368A9.722 9.722 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>',
      VOIP:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.1a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.24h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.08 6.08l1.03-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
      EMAIL:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
      SMS:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
      RAPPORT_VENDEUR:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      LEAD_EXTERNE:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>'
    };
    return I[media] || '';
  }
  function toggleBtn(tid, label) {
    label = label || 'voir plus';
    return '<button id="tgl_'+tid+'" onclick="window.__toggle(\''+tid+'\')" style="background:none;border:none;cursor:pointer;padding:0 2px;font-size:12px;color:#9ca3af;display:inline;vertical-align:middle;margin-left:3px;line-height:1;font-family:sans-serif;">\u25b8 '+label+'</button>';
  }

  // ---- rendu d'un item (porté du template natif) ----
  function renderItem(item) {
    var media = item && item.media, sens = item && item.sens, agent = (item && item.agent) || '';
    var dateContact = item && item.date_contact;
    var idLigne = (item && item.id_ligne) || Math.random().toString(36).substring(2,10);
    var uid = idLigne.toString().replace(/-/g,'').substring(0,8);
    var accent = mediaAccent[media] || '#E0E0E0';
    var bg = mediaBg[media] || '#FFFFFF';
    var mediaIcon = mediaIconSvg(media, accent);

    var isInbound = sens === 'inbound' || sens === 'in';
    var arrowSvg = isInbound
      ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></svg>'
      : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';
    var arrowHtml = media !== 'RAPPORT_VENDEUR'
      ? '<div style="flex-shrink:0;width:30px;height:30px;border-radius:50%;border:1.5px solid '+accent+';display:flex;align-items:center;justify-content:center;background:#fff;">'+arrowSvg+'</div>' : '';

    var contentHtml = '', metaRight = '', headerMiddle = '', footerHtml = '';

    if (media === 'VOIP') {
      var url = item.voip_recording_url, duration = item.voip_duration_seconds || 0;
      var summary = item.voip_summary || {}, transcription = item.contenu_texte;
      var tonalite = (summary && summary.tonalite) || '';
      var dialogue = (summary && summary.dialogue) || '', objet = (summary && summary.objet) || '';
      if (url) contentHtml += audioPill(url, duration, '#60AEDF', uid);
      if (objet || dialogue || transcription) {
        var tid = 'tr_' + uid;
        var dialogueHtml = dialogue ? dialogue.split('\n').filter(function(l){return l.trim();}).map(function(line){
          if (line.indexOf('Vendeur:') === 0) return '<div style="margin-bottom:6px;"><span style="font-size:11px;font-weight:700;color:#2a5ea9;text-transform:uppercase;letter-spacing:.4px;">Vendeur</span><span style="font-size:13px;color:#374151;margin-left:6px;">'+esc(line.replace('Vendeur:','').trim())+'</span></div>';
          if (line.indexOf('Client:') === 0) return '<div style="margin-bottom:6px;"><span style="font-size:11px;font-weight:700;color:#53bda7;text-transform:uppercase;letter-spacing:.4px;">Client</span><span style="font-size:13px;color:#374151;margin-left:6px;">'+esc(line.replace('Client:','').trim())+'</span></div>';
          return '<div style="font-size:13px;color:#6b7280;margin-bottom:4px;">'+esc(line)+'</div>';
        }).join('') : '';
        var resumeHtml = objet ? '<span id="sum_'+tid+'" style="font-size:13px;color:#4b5563;line-height:1.6;">'+esc(objet)+'</span>' : '';
        var fullHtml = dialogueHtml || esc(transcription || '').replace(/\n/g,'<br>');
        contentHtml += '<div style="margin-top:7px;">'+resumeHtml+(resumeHtml&&fullHtml?toggleBtn(tid):'')+'<div id="ful_'+tid+'" style="display:none;margin-top:8px;padding:12px;background:#f8fbff;border-radius:8px;border:1px solid rgba(96,174,223,.2);">'+fullHtml+toggleBtn(tid,'voir moins')+'</div></div>';
      }
      metaRight = '<span style="font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;line-height:1.4">'+formatDate(dateContact)+'</span>'+(tonalite?'<span style="font-size:11px;color:#60AEDF;background:rgba(96,174,223,.1);border:1px solid rgba(96,174,223,.3);border-radius:999px;padding:1px 8px;white-space:nowrap;">'+esc(tonalite)+'</span>':'');
    }
    else if (media === 'WHATSAPP') {
      var statut = item.statut, contenu = item.contenu_texte || '', deliveryStatus = item.delivery_status, isOut = sens === 'out';
      var attachments = parseAttachments(item.attachments), att = attachments[0], aurl = (att && att.public_url) || '', fname = (att && att.filename) || '';
      var placeholders = ['[image]','[video]','[audio]','[document]','[sticker]'];
      var hasCaption = contenu && placeholders.indexOf(contenu.trim()) === -1 && statut !== 'text';
      var captionHtml = hasCaption ? '<div style="font-size:13px;color:#4b5563;line-height:1.5;word-break:break-word;margin-top:5px;">'+esc(contenu)+'</div>' : '';
      if (statut === 'text') {
        var sid='wt_'+uid, resume=truncate(contenu,80), showT=contenu.length>80;
        contentHtml = '<div style="font-size:13px;color:#4b5563;line-height:1.5;word-break:break-word;"><span id="sum_'+sid+'">'+esc(resume)+'</span>'+(showT?toggleBtn(sid):'')+'<span id="ful_'+sid+'" style="display:none;">'+esc(contenu)+(showT?toggleBtn(sid,'voir moins'):'')+'</span></div>';
      } else if (statut === 'audio' && aurl) {
        contentHtml = audioPill(aurl, 0, '#4CAF7D', uid) + captionHtml;
      } else if (statut === 'image' && aurl) {
        contentHtml = '<a href="'+esc(aurl)+'" target="_blank" style="display:inline-block;width:72px;height:72px;border-radius:10px;overflow:hidden;border:1px solid rgba(76,175,125,.25);"><img src="'+esc(aurl)+'" style="width:72px;height:72px;object-fit:cover;display:block;"/></a>'+captionHtml;
      } else if (statut === 'video' && aurl) {
        contentHtml = '<a href="'+esc(aurl)+'" target="_blank" style="display:inline-block;position:relative;width:72px;height:72px;border-radius:10px;overflow:hidden;border:1px solid rgba(76,175,125,.25);background:#000;"><video src="'+esc(aurl)+'" preload="metadata" muted style="width:72px;height:72px;object-fit:cover;display:block;pointer-events:none;"></video><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><div style="width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;"><svg width="9" height="11" viewBox="0 0 10 12" fill="#374151"><path d="M0 0l10 6-10 6z"/></svg></div></div></a>'+captionHtml;
      } else if (statut === 'document' && aurl) {
        contentHtml = '<div onclick="window.open(\''+esc(aurl)+'\',\'_blank\')" style="display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border:1px solid rgba(76,175,125,.25);border-radius:8px;background:rgba(76,175,125,.06);cursor:pointer;max-width:100%;box-sizing:border-box;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4CAF7D" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg><span style="font-size:12px;color:#374151;word-break:break-word;">'+esc(truncate(fname,30))+'</span></div>'+captionHtml;
      }
      var deliveryHtml = isOut && deliveryStatus ? '<span style="font-size:14px;color:'+(deliveryStatus==='read'?'#0075df':'#9ca3af')+';">'+(deliveryStatus==='sent'?'\u2713':'\u2713\u2713')+'</span>' : '';
      metaRight = '<span style="font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;line-height:1.4">'+formatDate(dateContact)+'</span>'+deliveryHtml;
    }
    else if (media === 'SMS') {
      var c2 = item.contenu_texte || '';
      if (c2) { var sid2='sm_'+uid, r2=truncate(c2,80), sT2=c2.length>80; contentHtml='<div style="font-size:13px;color:#4b5563;line-height:1.6;word-break:break-word;"><span id="sum_'+sid2+'">'+esc(r2)+'</span>'+(sT2?toggleBtn(sid2):'')+'<span id="ful_'+sid2+'" style="display:none;white-space:pre-wrap;">'+esc(c2)+(sT2?toggleBtn(sid2,'voir moins'):'')+'</span></div>'; }
      metaRight = '<span style="font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;line-height:1.4">'+formatDate(dateContact)+'</span>';
    }
    else if (media === 'EMAIL') {
      var eid='em_'+uid, subject=item.email_subject||'(sans sujet)', snippetSrc=item.email_snippet||item.contenu_texte||'', snippetTrunc=truncate(snippetSrc,60), isInb=sens==='inbound';
      var sanitize=function(h){return h?h.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<iframe[\s\S]*?<\/iframe>/gi,'').replace(/\s+on\w+\s*=\s*"[^"]*"/gi,'').replace(/javascript:/gi,''):'';};
      var stripHtml=function(h){return h?h.replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim():'';};
      var bodyHtml=sanitize(item.email_body_html||''), fullContent=bodyHtml||esc(item.contenu_texte||''), fullPlain=stripHtml(item.email_body_html||'')||(item.contenu_texte||''), showT3=fullPlain.length>snippetSrc.length+10;
      var atts=(item.email_has_attachments&&Array.isArray(item.attachments))?item.attachments:[];
      var attachHtml=atts.length?'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">'+atts.map(function(a){return '<div id="att_'+a.id+'" data-storage-path="'+esc(a.storage_path||'')+'" onclick="window.__emDownload(\''+esc(a.id)+'\',\''+((a.filename||'fichier').replace(/'/g,"\\'"))+'\')" style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;color:#374151;"><span style="word-break:break-word;">'+esc(truncate(a.filename||'fichier',25))+'</span><span style="color:#9ca3af;font-size:11px;">'+formatSize(a.file_size)+'</span></div>';}).join('')+'</div>':'';
      headerMiddle='<span style="font-size:13px;font-weight:600;color:#111827;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+esc(subject)+'">'+esc(subject)+'</span>';
      contentHtml='<div style="font-size:13px;color:#4b5563;line-height:1.5;"><span id="sum_'+eid+'" style="color:#6b7280;">'+esc(snippetTrunc)+'</span>'+(showT3?toggleBtn(eid):'')+'<div id="ful_'+eid+'" style="display:none;color:#374151;word-break:break-word;overflow-wrap:anywhere;margin-top:4px;">'+fullContent+toggleBtn(eid,'voir moins')+'</div>'+attachHtml+'</div>';
      var btnBase='display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;border:1px solid #e5e7eb;background:#fff;color:#4b5563;font-family:sans-serif;';
      footerHtml='<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;padding-top:8px;border-top:1px solid #f3f4f6;flex-wrap:wrap;">'+(isInb?'<button style="'+btnBase+'" onclick="(async()=>{if(!window.handleCompose)return;await window.handleCompose(\'reply\',\''+esc(idLigne)+'\')})()">Repondre</button>':'')+'<button style="'+btnBase+'" onclick="(async()=>{if(!window.handleCompose)return;await window.handleCompose(\'forward\',\''+esc(idLigne)+'\')})()">Transferer</button></div>';
      metaRight='<span style="font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;line-height:1.4">'+formatDate(dateContact)+'</span>';
    }
    else if (media === 'RAPPORT_VENDEUR') {
      var resultat=item.resultat||'', canalContact=item.canal_contact||'', dtActivation=item.dt_activation, commentaire=item.contenu_texte||'', note=item.note_chatgpt;
      var chipColors={'Abandon':{bg:'#fee2e2',color:'#9B1C1C',border:'#fca5a5'},'Marketing':{bg:'#ede9fe',color:'#5b21b6',border:'#c4b5fd'},'Choc':{bg:'#fef3c7',color:'#92400e',border:'#fcd34d'},'Commande':{bg:'#d1fae5',color:'#065f46',border:'#6ee7b7'},'Relance':{bg:'#dbeafe',color:'#1e40af',border:'#93c5fd'}};
      var chip=chipColors[resultat]||{bg:'#f3f4f6',color:'#374151',border:'#d1d5db'};
      headerMiddle='<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;flex:1;min-width:0;">'+(resultat?'<span style="background:'+chip.bg+';color:'+chip.color+';border:1px solid '+chip.border+';border-radius:999px;padding:2px 10px;font-size:12px;font-weight:500;white-space:nowrap;">'+esc(resultat)+'</span>':'')+(canalContact?'<span style="background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;border-radius:999px;padding:2px 10px;font-size:12px;white-space:nowrap;">'+esc(canalContact)+'</span>':'')+(dtActivation?'<span style="background:#eff6ff;color:#2a5ea9;border:1px solid #bfdbfe;border-radius:999px;padding:2px 10px;font-size:12px;white-space:nowrap;">'+formatRdv(dtActivation)+'</span>':'')+'</div>';
      var sidr='rv_'+uid, sTr=commentaire.length>80, rr=truncate(commentaire,80);
      contentHtml=commentaire?'<div style="font-size:13px;color:#4b5563;line-height:1.5;"><span id="sum_'+sidr+'">'+esc(rr)+'</span>'+(sTr?toggleBtn(sidr):'')+'<span id="ful_'+sidr+'" style="display:none;">'+esc(commentaire)+(sTr?toggleBtn(sidr,'voir moins'):'')+'</span></div>':'';
      var noteHtml=note!=null?(function(){var g=note>=7;return '<div style="display:flex;flex-direction:column;align-items:center;gap:1px;flex-shrink:0;"><span style="font-size:13px;font-weight:700;color:'+(g?'#4CAF7D':'#E05252')+';background:'+(g?'#D1FAE5':'#FEE2E2')+';border:1.5px solid '+(g?'#4CAF7D':'#E05252')+';border-radius:50%;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;">'+note+'</span><span style="font-size:9px;color:#9ca3af;">IA</span></div>';})():'';
      metaRight='<span style="font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;line-height:1.4">'+formatDate(dateContact)+'</span>'+noteHtml;
    }
    else if (media === 'LEAD_EXTERNE') {
      var source=item.origine_echange||'', sourceRef=item.canal_contact||'', vehicule=item.vehicule_interet||'', statutBrut=item.statut||'', contenuL=item.contenu_texte||'', phone=item.phone_from||'';
      var sourceChip=source?'<span style="background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:500;white-space:nowrap;">'+esc(source)+(sourceRef?' \u00b7 '+esc(truncate(sourceRef,20)):'')+'</span>':'';
      var isTraite=statutBrut==='traite';
      var statutChip=statutBrut?'<span style="background:'+(isTraite?'#d1fae5':'#fef3c7')+';color:'+(isTraite?'#065f46':'#92400e')+';border:1px solid '+(isTraite?'#6ee7b7':'#fcd34d')+';border-radius:999px;padding:2px 10px;font-size:12px;font-weight:500;white-space:nowrap;">'+(isTraite?'\u2713 Traite':'\u23f1 Non traite')+'</span>':'';
      var vehiculeChip=vehicule?'<span style="background:#f5f3ff;color:#5b21b6;border:1px solid #ddd6fe;border-radius:999px;padding:2px 10px;font-size:12px;white-space:nowrap;" title="'+esc(vehicule)+'">\ud83d\ude97 '+esc(truncate(vehicule,30))+'</span>':'';
      headerMiddle='<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;flex:1;min-width:0;">'+sourceChip+statutChip+vehiculeChip+'</div>';
      if (contenuL || phone) {
        var sidl='le_'+uid, sTl=contenuL.length>80, rl=truncate(contenuL,80);
        var phoneHtml=phone?'<div style="font-size:12px;color:#6b7280;margin-top:4px;"><a href="tel:'+esc(phone)+'" style="color:#7C3AED;text-decoration:none;">'+esc(phone)+'</a></div>':'';
        contentHtml='<div style="font-size:13px;color:#4b5563;line-height:1.5;word-break:break-word;">'+(contenuL?'<span id="sum_'+sidl+'">'+esc(rl)+'</span>'+(sTl?toggleBtn(sidl):'')+'<span id="ful_'+sidl+'" style="display:none;white-space:pre-wrap;">'+esc(contenuL)+(sTl?toggleBtn(sidl,'voir moins'):'')+'</span>':'')+phoneHtml+'</div>';
      }
      metaRight='<span style="font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;line-height:1.4">'+formatDate(dateContact)+'</span>';
    }
    else {
      if (item.contenu_texte) contentHtml='<div style="font-size:13px;color:#4b5563;line-height:1.5;">'+esc(item.contenu_texte)+'</div>';
      metaRight='<span style="font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;line-height:1.4">'+formatDate(dateContact)+'</span>';
    }

    var indent = arrowHtml ? '38px' : '0';
    return '<div style="background:'+bg+';border-left:3px solid '+accent+';border-top:1px solid '+accent+'22;border-right:1px solid '+accent+'22;border-bottom:1px solid '+accent+'22;border-radius:10px;padding:10px 14px;width:100%;box-sizing:border-box;box-shadow:0 2px 6px rgba(0,0,0,.08);">' +
      '<div style="display:flex;align-items:center;gap:8px;min-width:0;">'+arrowHtml +
        '<div style="display:flex;align-items:center;gap:5px;flex-shrink:0;max-width:160px;">'+mediaIcon+'<span style="font-size:13px;font-weight:600;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="'+esc(agent)+'">'+esc(agent)+'</span></div>' +
        (headerMiddle?'<span style="color:#e5e7eb;font-size:13px;flex-shrink:0;">|</span>'+headerMiddle:'<div style="flex:1;"></div>') +
        '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:auto;">'+metaRight+'</div>' +
      '</div>' +
      (contentHtml?'<div style="margin-top:8px;padding-left:'+indent+';">'+contentHtml+'</div>':'') +
      (footerHtml?'<div style="padding-left:'+indent+';">'+footerHtml+'</div>':'') +
    '</div>';
  }

  // expose le rendu d'une carte + le filtre média pour la modale Historique
  window.__oropraContactCard = renderItem;
  window.__oropraContactFilter = function (rows) {
    return (rows || []).filter(function (r) {
      if ((r.media || '').toUpperCase() !== 'VOIP') return true;
      var hasRec = r.voip_recording_url && String(r.voip_recording_url).trim() !== '';
      return hasRec && Number(r.voip_duration_seconds) >= 2;
    });
  };

  // ---- data ----
  async function load() {
    var idvu = currentIdvu();
    if (idvu == null) { state.rows = []; state.loading = false; return; }
    try {
      var site = readVar(VAR_SITE);
      var cq = sb.from('CYCLE_COM').select('id_cycle_com').eq('id_client', idvu).ilike('status', '%Ouvert%').order('id_cycle_com', { ascending: false }).limit(1);
      if (site != null && site !== '') cq = cq.eq('id_site', Number(site));
      var cyc = await cq.maybeSingle();
      var idCycle = cyc && cyc.data ? cyc.data.id_cycle_com : null;
      if (idCycle == null) { state.rows = []; state.loading = false; return; }
      var res = await sb.from('v_contacts_client')
        .select('id_ligne, id_cycle_com, date_contact, media, sens, statut, contenu_texte, agent, voip_recording_url, voip_summary, voip_duration_seconds, delivery_status, email_subject, email_snippet, email_body_html, email_has_attachments, attachments, canal_contact, resultat, dt_activation, note_chatgpt, origine_echange, vehicule_interet, phone_from')
        .eq('id_cycle_com', idCycle).order('date_contact', { ascending: false });
      if (res.error) throw res.error;
      state.rows = (res.data || []).filter(function (r) {
        if ((r.media || '').toUpperCase() !== 'VOIP') return true;
        // VOIP conservé seulement s'il a un enregistrement ET dure >= 2 s
        // (exclut les appels très courts/silencieux -> transcriptions hallucinées).
        var hasRec = r.voip_recording_url && String(r.voip_recording_url).trim() !== '';
        return hasRec && Number(r.voip_duration_seconds) >= 2;
      });
      state.loading = false;
    } catch (e) { console.error('[contacts]', e); state.err = e.message || String(e); state.loading = false; }
  }

  var STYLE = '<style>#oropra-contacts-root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.ct-wrap{display:flex;flex-direction:column;gap:10px;padding:2px}.ct-msg{text-align:center;padding:44px 20px;color:#7a98c5;font-size:14px}.ct-err{color:#e24b4a}</style>';
  function render() {
    var root = getRoot(); if (!root) return;
    if (state.loading) { root.innerHTML = STYLE + '<div class="ct-msg">Chargement des \u00e9changes\u2026</div>'; return; }
    if (state.err) { root.innerHTML = STYLE + '<div class="ct-msg ct-err">Erreur : ' + esc(state.err) + '</div>'; return; }
    if (!state.rows || !state.rows.length) { root.innerHTML = STYLE + '<div class="ct-msg">Aucun \u00e9change sur le cycle en cours.</div>'; return; }
    root.innerHTML = STYLE + '<div class="ct-wrap">' + state.rows.map(renderItem).join('') + '</div>';
  }

  // surveillance du changement de client (le shell ne détruit plus le panneau)
  if (!window.__contactsWatch) window.__contactsWatch = setInterval(function () {
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
