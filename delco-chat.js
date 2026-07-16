// ============================================================================
//  DELCO — CHAT AGENT — module One Data (OD.define)  v1
//  Rendu dans __anchor ; FN_URL (agent-orchestrator) -> ctx.tenant ;
//  client via ctx.supabase ; création de #cp-root retirée (loader).
// ============================================================================
OD.define('delco-chat', {
  async mount(__anchor, ctx) {
  __anchor.id = 'cp-root';
// ====================================================================
//  Delco CRM360 — Chat agent (Custom JS WeWeb) — Logo Éclair — v2 responsive
//  --------------------------------------------------------------------
//  À coller dans un Custom JS de workflow (ex : On page load).
//  Prérequis dans la page : un Embed contenant <div id="cp-root"></div>
//  Si #cp-root n'existe pas, le JS le crée et l'attache au <body>.
//
//  Responsive : sous 680px de large (largeur RÉELLE de #cp-root via
//  ResizeObserver), la sidebar « Conversations » se replie en tiroir
//  coulissant (burger ☰ + backdrop). Au-dessus, sidebar fixe 260px.
// ====================================================================

await (async function () {
  const FN_URL = ctx.tenant.supabase_url + "/functions/v1/agent-orchestrator";

  // Logo Delco · Éclair (SVG inline réutilisé pour l'avatar)
  // currentColor → adapte la couleur via CSS.
  const LOGO_SVG = `
    <svg viewBox="0 0 64 64" fill="none">
      <path d="M 36 8 L 18 36 L 30 36 L 26 56 L 46 28 L 34 28 L 36 8 Z" fill="currentColor"/>
    </svg>
  `;

  // Raccourcis adaptés au profil de l'utilisateur connecté.
  // Le bon jeu est sélectionné après résolution du rôle (voir plus bas).
  const QUICK_BY_PROFILE = {
    vendeur: [
      { emoji: "📋", label: "Mes leads à relancer", prompt: "Quels sont mes leads à relancer en priorité ?" },
      { emoji: "📄", label: "Mes propales",          prompt: "Où en sont mes propositions commerciales en cours ?" },
      { emoji: "🔍", label: "Préparer un RDV",       prompt: "Aide-moi à préparer mon prochain rendez-vous client." },
      { emoji: "🚗", label: "Stock VO",              prompt: "Quels véhicules d'occasion peuvent intéresser mes clients en cours ?" },
    ],
    manager: [
      { emoji: "🌅", label: "Brief du matin",    prompt: "Fais-moi le brief du matin." },
      { emoji: "🔥", label: "Dossiers chauds",   prompt: "Quels sont les dossiers les plus chauds à signer cette semaine ?" },
      { emoji: "📊", label: "Synthèse pipeline", prompt: "Fais-moi la synthèse du pipeline de mon équipe sur les 30 derniers jours." },
      { emoji: "📱", label: "Activité 7j",       prompt: "Comment se débrouille mon équipe en termes d'activité ces 7 derniers jours ?" },
    ],
    direction: [
      { emoji: "🌅", label: "Brief du matin",    prompt: "Fais-moi le brief du matin." },
      { emoji: "📊", label: "Synthèse pipeline", prompt: "Fais-moi la synthèse du pipeline de mon périmètre sur les 30 derniers jours." },
      { emoji: "🏆", label: "Comparer mes sites", prompt: "Compare mes sites entre eux : qui sur-performe, qui décroche, et sur quels critères ?" },
      { emoji: "📡", label: "Signaux faibles",   prompt: "Détecte les signaux faibles de mon périmètre : qu'est-ce qui se prépare ou décroche avant que ça touche les ventes ?" },
    ],
    admin: [
      { emoji: "🌅", label: "Brief du matin",     prompt: "Fais-moi le brief du matin." },
      { emoji: "📊", label: "Synthèse pipeline",  prompt: "Fais-moi la synthèse du pipeline sur les 30 derniers jours." },
      { emoji: "🏆", label: "Comparer mes sites", prompt: "Compare mes sites entre eux : qui sur-performe, qui décroche ?" },
      { emoji: "📡", label: "Signaux faibles",    prompt: "Détecte les signaux faibles : qu'est-ce qui se prépare ?" },
    ],
  };
  // Par défaut (avant résolution du rôle) : jeu manager. Réassigné plus bas.
  let QUICK = QUICK_BY_PROFILE.manager;

  if (window.__delco) {
    try { window.__delco.destroy && window.__delco.destroy(); } catch (_) {}
  }
  window.__delco = {};

  const doc = __anchor.ownerDocument || document;

  // Style : injection forcée (recréé à chaque exécution pour que le CSS
  // responsive s'applique aussi lors d'un reload dans l'éditeur WeWeb).
  {
    const __oldStyle = doc.getElementById("delco-style");
    if (__oldStyle) __oldStyle.remove();
    const style = doc.createElement("style");
    style.id = "delco-style";
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Nunito+Sans:opsz,wght@6..12,400;6..12,500;6..12,600;6..12,700;6..12,800&display=swap');

      #cp-root {
        --green:#53bda7; --blue:#2a5ea9; --lblue:#acc5e4; --orange:#fac055; --red:#d97070;
        --ink:#2a5ea9; --text:#1c2b45; --muted:#7a8aa3;
        --soft:#f5f7fb; --line:#e3eaf3;
        display:flex; height:78vh; min-height:560px;
        font-family:"Nunito Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        color:var(--text); background:#fff; border-radius:16px;
        box-shadow:0 4px 24px rgba(42,94,169,0.08); overflow:hidden;
      }
      #cp-root *{box-sizing:border-box;}
      #cp-side{width:260px;background:var(--soft);border-right:1px solid var(--line);display:flex;flex-direction:column;}
      #cp-side-head{padding:16px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;}
      #cp-side-head h3{margin:0;font-size:13px;font-weight:700;color:var(--blue);letter-spacing:.3px;text-transform:uppercase;}
      #cp-newthread{background:var(--green);color:#fff;border:none;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:background .15s;font-family:inherit;}
      #cp-newthread:hover{background:#45a892;}
      #cp-threads{flex:1;overflow-y:auto;padding:8px;}
      .cp-thread{padding:10px 12px;margin-bottom:4px;border-radius:8px;cursor:pointer;font-size:13px;color:var(--text);transition:background .15s;border:1px solid transparent;position:relative;}
      .cp-thread:hover{background:#fff;border-color:var(--line);}
      .cp-thread.active{background:#fff;border-color:var(--green);box-shadow:0 1px 4px rgba(83,189,167,.15);}
      .cp-thread-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .cp-thread-date{font-size:11px;color:var(--muted);margin-top:2px;font-weight:500;}
      .cp-thread-del{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:#c44;cursor:pointer;opacity:0;transition:opacity .15s;font-size:14px;padding:4px;}
      .cp-thread:hover .cp-thread-del{opacity:.7;}
      .cp-thread-del:hover{opacity:1 !important;}
      .cp-side-empty{padding:24px 16px;text-align:center;color:#98a6bd;font-size:12px;font-style:italic;}
      #cp-main{flex:1;display:flex;flex-direction:column;background:#fff;min-width:0;}
      #cp-head{padding:16px 24px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px;}
      #cp-head-icon{width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,var(--green),var(--blue));display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 4px 12px rgba(42,94,169,0.15);}
      #cp-head-icon svg{width:24px;height:24px;color:#fff;}
      #cp-head-text h2{margin:0;font-size:17px;color:var(--blue);font-weight:800;letter-spacing:-0.2px;}
      #cp-head-text p{margin:0;font-size:12px;color:var(--muted);font-weight:500;}
      #cp-stream{flex:1;overflow-y:auto;padding:24px;background:var(--soft);}
      .cp-msg{margin-bottom:16px;display:flex;gap:10px;animation:cp-fade .25s ease-out;}
      @keyframes cp-fade{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:none;}}
      .cp-msg.user{justify-content:flex-end;}
      .cp-bubble{max-width:78%;padding:12px 16px;border-radius:14px;font-size:14px;line-height:1.55;}
      .cp-msg.user .cp-bubble{background:var(--blue);color:#fff;border-bottom-right-radius:4px;font-weight:500;}
      .cp-msg.assistant .cp-bubble{background:#fff;border:1px solid var(--line);border-bottom-left-radius:4px;box-shadow:0 1px 2px rgba(42,94,169,.04);}
      .cp-avatar{width:32px;height:32px;border-radius:9px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:#fff;}
      .cp-avatar svg{width:20px;height:20px;color:#fff;}
      .cp-msg.assistant .cp-avatar{background:linear-gradient(135deg,var(--green),var(--blue));}
      .cp-msg.user .cp-avatar{background:var(--orange);order:2;color:var(--text);}
      .cp-bubble h1,.cp-bubble h2,.cp-bubble h3{color:var(--blue);margin:12px 0 6px 0;font-weight:700;}
      .cp-bubble h1{font-size:17px;} .cp-bubble h2{font-size:16px;} .cp-bubble h3{font-size:15px;}
      .cp-bubble p{margin:6px 0;}
      .cp-bubble ul,.cp-bubble ol{margin:6px 0;padding-left:22px;}
      .cp-bubble li{margin:3px 0;}
      .cp-bubble strong{color:var(--blue);font-weight:700;}
      .cp-msg.user .cp-bubble strong{color:#fff;}
      .cp-bubble code{background:var(--soft);padding:2px 6px;border-radius:4px;font-size:13px;font-family:"SF Mono",Monaco,monospace;}
      .cp-bubble table{border-collapse:collapse;margin:8px 0;font-size:13px;width:100%;}
      .cp-bubble th,.cp-bubble td{border:1px solid var(--line);padding:6px 10px;text-align:left;}
      .cp-bubble th{background:var(--lblue);color:var(--blue);font-weight:700;}
      .cp-bubble hr{border:none;border-top:1px solid var(--line);margin:12px 0;}
      .cp-bubble blockquote{border-left:3px solid var(--orange);margin:8px 0;padding:4px 12px;background:#fff8eb;border-radius:0 6px 6px 0;}
      .cp-typing{display:inline-flex;gap:4px;padding:6px 0;}
      .cp-typing span{width:6px;height:6px;background:var(--green);border-radius:50%;animation:cp-bounce 1.2s infinite;}
      .cp-typing span:nth-child(2){animation-delay:.15s;}
      .cp-typing span:nth-child(3){animation-delay:.3s;}
      @keyframes cp-bounce{0%,60%,100%{transform:translateY(0);opacity:.5;}30%{transform:translateY(-4px);opacity:1;}}
      .cp-empty{text-align:center;padding:60px 24px;color:var(--muted);}
      .cp-empty-logo{width:64px;height:64px;margin:0 auto 16px;border-radius:16px;background:linear-gradient(135deg,var(--green),var(--blue));display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(42,94,169,0.15);}
      .cp-empty-logo svg{width:40px;height:40px;color:#fff;}
      .cp-empty h3{margin:0 0 8px;color:var(--blue);font-size:18px;font-weight:800;}
      .cp-empty p{margin:0;font-size:14px;max-width:380px;margin-left:auto;margin-right:auto;}
      #cp-quick{display:flex;gap:8px;padding:12px 24px 0;background:#fff;border-top:1px solid var(--line);flex-wrap:wrap;}
      .cp-q{background:#fff;border:1px solid var(--line);border-radius:18px;padding:7px 14px;font-size:12px;font-weight:600;color:var(--blue);cursor:pointer;transition:all .15s;display:inline-flex;align-items:center;gap:6px;font-family:inherit;}
      .cp-q:hover{border-color:var(--green);background:#ecf8f5;}
      .cp-q-em{font-size:14px;}
      #cp-input-row{padding:16px 24px 20px;background:#fff;display:flex;gap:10px;align-items:flex-end;}
      #cp-input{flex:1;border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:14px;font-family:inherit;color:var(--text);resize:none;min-height:44px;max-height:140px;outline:none;transition:border-color .15s;font-weight:500;}
      #cp-input:focus{border-color:var(--green);}
      #cp-send{background:var(--green);color:#fff;border:none;border-radius:12px;padding:0 18px;height:44px;font-weight:700;font-size:14px;cursor:pointer;transition:background .15s;font-family:inherit;}
      #cp-send:hover:not(:disabled){background:#45a892;}
      #cp-send:disabled{background:#c5d3e3;cursor:not-allowed;}

      /* ─── Boutons d'export sous une réponse ─── */
      .cp-export-bar{
        display:flex; flex-wrap:wrap; gap:8px;
        margin-top:12px; padding-top:12px;
        border-top:1px solid var(--line);
      }
      .cp-export-btn{
        display:inline-flex; align-items:center; gap:7px;
        border:1px solid var(--line); border-radius:8px;
        padding:7px 13px; cursor:pointer;
        font-family:inherit; font-size:12.5px; font-weight:700;
        background:#fff; transition:all .15s;
      }
      .cp-export-btn svg{width:15px; height:15px;}
      .cp-export-btn.pdf{ color:var(--red); }
      .cp-export-btn.pdf:hover{ background:#fdf0f0; border-color:var(--red); }
      .cp-export-btn.xlsx{ color:var(--green); }
      .cp-export-btn.xlsx:hover{ background:#ecf8f5; border-color:var(--green); }
      .cp-export-btn:disabled{ opacity:.55; cursor:wait; }

      /* ─── Modale de confirmation chartée ─── */
      .cp-modal-overlay{
        position:fixed; inset:0; z-index:10000;
        background:rgba(28,43,69,0.45);
        backdrop-filter:blur(2px);
        display:flex; align-items:center; justify-content:center;
        opacity:0; transition:opacity .18s ease;
      }
      .cp-modal-overlay.open{opacity:1;}
      .cp-modal{
        background:#fff; border-radius:16px; padding:28px 26px 22px;
        width:380px; max-width:calc(100vw - 40px);
        box-shadow:0 20px 60px rgba(28,43,69,0.3);
        text-align:center;
        transform:translateY(8px) scale(0.98);
        transition:transform .18s ease;
        font-family:"Nunito Sans",-apple-system,sans-serif;
      }
      .cp-modal-overlay.open .cp-modal{transform:translateY(0) scale(1);}
      .cp-modal-icon{
        width:52px; height:52px; border-radius:13px;
        background:rgba(42,94,169,0.1); color:var(--blue);
        display:flex; align-items:center; justify-content:center;
        margin:0 auto 16px;
      }
      .cp-modal-icon.danger{
        background:rgba(217,112,112,0.12); color:var(--red,#d97070);
      }
      .cp-modal-icon svg{width:26px; height:26px;}
      .cp-modal-title{
        margin:0 0 8px; font-size:17px; font-weight:800; color:var(--text,#1c2b45);
      }
      .cp-modal-message{
        margin:0 0 22px; font-size:13.5px; color:var(--muted,#7a8aa3); line-height:1.5;
      }
      .cp-modal-actions{display:flex; gap:10px; justify-content:center;}
      .cp-modal-btn{
        flex:1; border:none; border-radius:9px; padding:11px 16px;
        font-family:inherit; font-size:13.5px; font-weight:700; cursor:pointer;
        transition:all .15s;
      }
      .cp-modal-cancel{
        background:var(--soft,#f5f7fb); color:var(--text,#1c2b45);
      }
      .cp-modal-cancel:hover{background:#e8edf5;}
      .cp-modal-confirm{
        background:var(--blue,#2a5ea9); color:#fff;
      }
      .cp-modal-confirm:hover{background:#234d8c;}
      .cp-modal-confirm.danger{background:var(--red,#d97070);}
      .cp-modal-confirm.danger:hover{background:#c95f5f;}

      /* ═══ RESPONSIVE ═══ */
      #cp-root{ position:relative; }   /* ancre le tiroir + le backdrop */
      .cp-side-toggle{
        display:none; width:36px; height:36px; flex-shrink:0;
        background:var(--soft); border:1px solid var(--line); color:var(--blue);
        border-radius:9px; cursor:pointer; font-size:16px; line-height:1;
        align-items:center; justify-content:center;
      }
      .cp-side-toggle:hover{ border-color:var(--green); }
      .cp-backdrop{
        display:none; position:absolute; inset:0; z-index:14;
        background:rgba(28,43,69,.35);
      }
      @media (max-width:560px){ #cp-root{ height:82vh; } }

      /* Largeur RÉELLE de #cp-root (ResizeObserver) — fiable en conteneur WeWeb */
      #cp-root.cp-narrow #cp-side{
        position:absolute; top:0; left:0; bottom:0; z-index:15;
        width:min(82%,300px); transform:translateX(-100%);
        transition:transform .22s ease; box-shadow:4px 0 24px rgba(28,43,69,.18);
      }
      #cp-root.cp-narrow.cp-side-open #cp-side{ transform:translateX(0); }
      #cp-root.cp-narrow.cp-side-open .cp-backdrop{ display:block; }
      #cp-root.cp-narrow .cp-side-toggle{ display:inline-flex; }
      #cp-root.cp-narrow #cp-head{ padding:12px 16px; gap:10px; }
      #cp-root.cp-narrow #cp-stream{ padding:16px; }
      #cp-root.cp-narrow #cp-quick{ padding:10px 16px 0; }
      #cp-root.cp-narrow #cp-input-row{ padding:12px 16px 16px; }
      #cp-root.cp-narrow .cp-bubble{ max-width:88%; }
      #cp-root.cp-compact #cp-head-text p{ display:none; }
      #cp-root.cp-compact .cp-q{ padding:6px 11px; font-size:11.5px; }
    `;
    doc.head.appendChild(style);
  }

  async function ensureMarked() {
    if (doc.defaultView.marked) return doc.defaultView.marked;
    return new Promise((resolve, reject) => {
      const s = doc.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/marked@12/marked.min.js";
      s.onload = () => resolve(doc.defaultView.marked);
      s.onerror = () => reject(new Error("Échec chargement marked.js"));
      doc.head.appendChild(s);
    });
  }
  const marked = await ensureMarked();

  const sb = ctx.supabase;   // client du tenant (fourni par le Shell)
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    console.warn("[delco] Non authentifié — chat non démarré");
    return;
  }

  let root = __anchor;   // fourni par le loader

  let threads = [];
  let currentThreadId = null;
  let currentMessages = [];
  let isSending = false;
  let chatRO = null;   // ResizeObserver (responsive), nettoyé dans destroy

  // ── Résolution du profil de l'utilisateur connecté ──────────
  // Détermine quels raccourcis afficher (vendeur / manager / direction).
  // Mapping rôle → profil identique à l'orchestrator :
  //   4 → vendeur ; 3,5 → manager ; 2,6,7,8 → direction ; 1 → admin.
  function profileFromRole(roleId) {
    const r = Number(roleId);
    if (r === 4) return "vendeur";
    if (r === 1) return "admin";
    if (r === 2 || r === 6 || r === 7 || r === 8) return "direction";
    return "manager"; // 3, 5, défaut
  }
  try {
    const { data: u } = await sb
      .from("USER")
      .select('"ID_Role"')
      .eq("auth_uid", session.user.id)
      .maybeSingle();
    const profile = profileFromRole(u?.ID_Role);
    QUICK = QUICK_BY_PROFILE[profile] || QUICK_BY_PROFILE.manager;
  } catch (e) {
    console.warn("[delco-chat] résolution rôle:", e);
    // QUICK garde sa valeur par défaut (manager)
  }

  root.innerHTML = `
    <aside id="cp-side">
      <div id="cp-side-head">
        <h3>Conversations</h3>
        <button id="cp-newthread">+ Nouveau</button>
      </div>
      <div id="cp-threads"></div>
    </aside>
    <section id="cp-main">
      <div id="cp-head">
        <button id="cp-side-toggle" class="cp-side-toggle" type="button" aria-label="Conversations">☰</button>
        <div id="cp-head-icon">${LOGO_SVG}</div>
        <div id="cp-head-text">
          <h2>Delco</h2>
          <p>Ton agent CRM360</p>
        </div>
      </div>
      <div id="cp-stream"></div>
      <div id="cp-quick">
        ${QUICK.map((q, i) => `<button class="cp-q" data-q="${i}"><span class="cp-q-em">${q.emoji}</span> ${q.label}</button>`).join("")}
      </div>
      <div id="cp-input-row">
        <textarea id="cp-input" placeholder="Pose ta question, ou clique sur un raccourci…" rows="1"></textarea>
        <button id="cp-send">Envoyer</button>
      </div>
    </section>
    <div id="cp-backdrop" class="cp-backdrop"></div>
  `;

  const $stream     = doc.getElementById("cp-stream");
  const $threads    = doc.getElementById("cp-threads");
  const $input      = doc.getElementById("cp-input");
  const $send       = doc.getElementById("cp-send");
  const $newThread  = doc.getElementById("cp-newthread");
  const $sideToggle = doc.getElementById("cp-side-toggle");
  const $backdrop   = doc.getElementById("cp-backdrop");

  // ── Tiroir latéral (mobile) ─────────────────────────────────
  const isNarrow    = () => root.classList.contains("cp-narrow");
  const closeDrawer = () => root.classList.remove("cp-side-open");
  const onSideToggle = () => root.classList.toggle("cp-side-open");
  const onBackdrop   = () => closeDrawer();

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => (
      { "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]
    ));
  }
  function fmtDate(iso) {
    const d = new Date(iso);
    const dt = (Date.now() - d.getTime()) / 1000;
    if (dt < 60)        return "à l'instant";
    if (dt < 3600)      return Math.floor(dt/60) + " min";
    if (dt < 86400)     return Math.floor(dt/3600) + " h";
    if (dt < 7*86400)   return Math.floor(dt/86400) + " j";
    return d.toLocaleDateString("fr-FR", { day:"numeric", month:"short" });
  }
  function renderMarkdown(text) {
    try { return marked.parse(text || "", { breaks: true, gfm: true }); }
    catch (e) { return escapeHtml(text); }
  }

  // Extrait les marqueurs d'export de la réponse de Delco.
  // Retourne { clean: texte sans marqueurs, exports: [{type, sql?}] }
  function parseExports(text) {
    const exports = [];
    let clean = text || "";

    // [[EXPORT_PDF]] ou [[EXPORT_PDF:Titre du document]]
    clean = clean.replace(/\[\[EXPORT_PDF(?::([^\]]*))?\]\]/g, (_, titre) => {
      exports.push({ type: "pdf", titre: (titre || "").trim() || "Synthèse Delco" });
      return "";
    });

    // [[EXPORT_XLSX:<sql>]] — le SQL est entre le ':' et la fermeture ']]'
    clean = clean.replace(/\[\[EXPORT_XLSX:([\s\S]*?)\]\]/g, (_, sql) => {
      exports.push({ type: "xlsx", sql: (sql || "").trim() });
      return "";
    });

    return { clean: clean.trim(), exports };
  }

  // Génère un PDF de la synthèse via jsPDF (côté client)
  // Génère un PDF élégant via l'edge function delco-pdf (Browserless).
  // Delco envoie son markdown, l'edge function le rend en HTML stylé CRM
  // (vrais tableaux, emojis nettoyés) puis en PDF, et renvoie une URL signée.
  async function exportPdf(markdownText, titre, btn) {
    const oldLabel = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Génération…"; }
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) throw new Error("Session expirée, reconnecte-toi.");

      // invokeEdgeFunction (plugin WeWeb) utilise la config DESIGN-TIME du plugin
      // -> taperait le projet OROPRA pour un autre tenant. functions.invoke sur
      // ctx.supabase vise le projet du tenant courant.
      const resp = await ctx.supabase.functions.invoke("delco-pdf", {
        body: { markdown: markdownText, titre: titre || "Synthèse Delco" },
      });

      // Le plugin WeWeb peut envelopper la réponse de plusieurs façons
      const j = resp?.data?.data ?? resp?.data ?? resp;
      if (j?.error) throw new Error(j.error);

      const url = j?.signed_url ?? j?.signedUrl ?? j?.url;
      if (!url) {
        console.error("[delco-chat] réponse PDF:", resp);
        throw new Error("Pas d'URL dans la réponse du PDF");
      }

      // Ouvre le PDF dans un nouvel onglet (téléchargeable depuis le viewer)
      const a = doc.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      doc.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error("[delco-chat] exportPdf:", e);
      alert("Impossible de générer le PDF : " + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = oldLabel; }
    }
  }

  // Génère un XLSX stylé via l'edge function export-xslx (ExcelJS)
  async function exportXlsx(sql, btn) {
    const oldLabel = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Génération…"; }
    try {
      // 1) Exécuter le SQL via la RPC sécurisée pour récupérer les lignes
      const { data: rows, error } = await sb.rpc("delco_query_sql", { p_sql: sql });
      if (error) throw new Error(error.message);
      if (rows && typeof rows === "object" && !Array.isArray(rows) && rows.error) {
        throw new Error(rows.error);
      }
      const arr = Array.isArray(rows) ? rows : [];
      if (arr.length === 0) {
        alert("Aucune donnée à exporter pour cette requête.");
        return;
      }

      // 2) Générer le XLSX stylé via l'edge function (ExcelJS, en-têtes
      //    bleu CRM + bordures + auto-fit). ⚠ Le nom déployé de la fonction
      //    est "export-xslx" (orthographe telle que déployée sur Supabase).
      const resp = await ctx.supabase.functions.invoke("export-xslx", {
        body: { rows: arr, fileName: "export-delco.xlsx", sheetName: "Stock VO" },
      });

      const j = resp?.data?.data ?? resp?.data ?? resp;
      if (j?.error) throw new Error(j.error);

      const url = j?.url ?? j?.signed_url ?? j?.signedUrl;
      if (!url) {
        console.error("[delco-chat] réponse export-xslx:", resp);
        throw new Error("Pas d'URL dans la réponse de l'export");
      }

      // Téléchargement
      const a = doc.createElement("a");
      a.href = url;
      a.download = "export-delco.xlsx";
      a.target = "_blank";
      a.rel = "noopener";
      doc.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error("[delco-chat] exportXlsx:", e);
      alert("Impossible de générer l'Excel : " + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = oldLabel; }
    }
  }
  function scrollToBottom() { $stream.scrollTop = $stream.scrollHeight; }

  function renderEmpty() {
    $stream.innerHTML = `
      <div class="cp-empty">
        <div class="cp-empty-logo">${LOGO_SVG}</div>
        <h3>Bonjour ! Que puis-je faire pour toi ?</h3>
        <p>Pose ta question, ou utilise un raccourci ci-dessous pour démarrer.</p>
      </div>`;
  }
  function renderThreads() {
    if (!threads.length) { $threads.innerHTML = `<div class="cp-side-empty">Aucune conversation</div>`; return; }
    $threads.innerHTML = threads.map(t => `
      <div class="cp-thread ${t.id === currentThreadId ? "active" : ""}" data-id="${t.id}">
        <div class="cp-thread-title">${escapeHtml(t.title || "Sans titre")}</div>
        <div class="cp-thread-date">${fmtDate(t.updated_at)}</div>
        <button class="cp-thread-del" data-del="${t.id}" title="Supprimer">✕</button>
      </div>
    `).join("");
  }
  function renderMessages() {
    if (!currentMessages.length) { renderEmpty(); return; }
    $stream.innerHTML = currentMessages.map((m, idx) => {
      const isUser = m.role === "user";
      const avatar = isUser ? "M" : LOGO_SVG;
      if (isUser) {
        return `
          <div class="cp-msg user">
            <div class="cp-avatar">M</div>
            <div class="cp-bubble"><p>${escapeHtml(m.content)}</p></div>
          </div>`;
      }
      // Assistant : on parse les marqueurs d'export
      const { clean, exports } = parseExports(m.content);
      let exportBtns = "";
      if (exports.length > 0) {
        exportBtns = `<div class="cp-export-bar">` + exports.map((ex, i) => {
          if (ex.type === "pdf") {
            return `<button class="cp-export-btn pdf" data-export="pdf" data-msg="${idx}" data-titre="${escapeHtml(ex.titre)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Télécharger le PDF
            </button>`;
          }
          if (ex.type === "xlsx") {
            return `<button class="cp-export-btn xlsx" data-export="xlsx" data-sql="${escapeHtml(ex.sql)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
              Télécharger l'Excel
            </button>`;
          }
          return "";
        }).join("") + `</div>`;
      }
      return `
        <div class="cp-msg assistant">
          <div class="cp-avatar">${LOGO_SVG}</div>
          <div class="cp-bubble">${renderMarkdown(clean)}${exportBtns}</div>
        </div>`;
    }).join("");
    bindExportButtons();
    scrollToBottom();
  }

  // Branche les boutons d'export après rendu
  function bindExportButtons() {
    $stream.querySelectorAll("[data-export='pdf']").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.msg, 10);
        const msg = currentMessages[idx];
        if (!msg) return;
        const { clean } = parseExports(msg.content);
        exportPdf(clean, btn.dataset.titre, btn);
      });
    });
    $stream.querySelectorAll("[data-export='xlsx']").forEach(btn => {
      btn.addEventListener("click", () => exportXlsx(btn.dataset.sql, btn));
    });
  }
  function showTyping() {
    const el = doc.createElement("div");
    el.className = "cp-msg assistant";
    el.id = "cp-typing-row";
    el.innerHTML = `<div class="cp-avatar">${LOGO_SVG}</div><div class="cp-bubble"><div class="cp-typing"><span></span><span></span><span></span></div></div>`;
    $stream.appendChild(el);
    scrollToBottom();
  }
  function hideTyping() {
    const el = doc.getElementById("cp-typing-row");
    if (el) el.remove();
  }

  async function loadThreads() {
    const { data, error } = await sb
      .from("agent_chat_threads")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) { console.error("[delco] loadThreads", error); return; }
    threads = data || [];
    renderThreads();
  }
  async function loadMessages(threadId) {
    currentThreadId = threadId;
    currentMessages = [];
    renderThreads();
    if (!threadId) { renderEmpty(); return; }
    const { data, error } = await sb
      .from("agent_chat_messages")
      .select("role, content, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    if (error) { console.error("[delco] loadMessages", error); return; }
    currentMessages = data || [];
    renderMessages();
  }
  async function deleteThread(threadId) {
    const thread = threads.find(t => t.id === threadId);
    const titre = thread?.title || "cette conversation";
    const confirmed = await showConfirmModal({
      title: "Supprimer la conversation ?",
      message: `« ${titre} » sera définitivement supprimée. Cette action est irréversible.`,
      confirmLabel: "Supprimer",
      cancelLabel: "Annuler",
      danger: true,
    });
    if (!confirmed) return;
    const { error } = await sb.from("agent_chat_threads").delete().eq("id", threadId);
    if (error) { console.error("[delco] deleteThread", error); return; }
    if (currentThreadId === threadId) {
      currentThreadId = null;
      currentMessages = [];
      renderEmpty();
    }
    await loadThreads();
  }

  // ── Modale de confirmation chartée (remplace confirm() natif) ──────
  function showConfirmModal({ title, message, confirmLabel, cancelLabel, danger }) {
    return new Promise((resolve) => {
      // Overlay
      const overlay = doc.createElement("div");
      overlay.className = "cp-modal-overlay";
      overlay.innerHTML = `
        <div class="cp-modal" role="dialog" aria-modal="true">
          <div class="cp-modal-icon ${danger ? "danger" : ""}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </div>
          <h3 class="cp-modal-title">${escapeHtml(title)}</h3>
          <p class="cp-modal-message">${escapeHtml(message)}</p>
          <div class="cp-modal-actions">
            <button class="cp-modal-btn cp-modal-cancel">${escapeHtml(cancelLabel || "Annuler")}</button>
            <button class="cp-modal-btn cp-modal-confirm ${danger ? "danger" : ""}">${escapeHtml(confirmLabel || "Confirmer")}</button>
          </div>
        </div>
      `;
      doc.body.appendChild(overlay);

      // Animation d'entrée
      requestAnimationFrame(() => overlay.classList.add("open"));

      const close = (result) => {
        overlay.classList.remove("open");
        setTimeout(() => overlay.remove(), 180);
        resolve(result);
      };

      overlay.querySelector(".cp-modal-cancel").addEventListener("click", () => close(false));
      overlay.querySelector(".cp-modal-confirm").addEventListener("click", () => close(true));
      // Clic hors de la modale = annuler
      overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay) close(false);
      });
      // Échap = annuler
      const onKey = (ev) => {
        if (ev.key === "Escape") { close(false); doc.removeEventListener("keydown", onKey); }
      };
      doc.addEventListener("keydown", onKey);
    });
  }

  async function sendPrompt(prompt) {
    if (!prompt || !prompt.trim() || isSending) return;
    isSending = true;
    $send.disabled = true;
    $input.value = "";
    $input.style.height = "44px";

    currentMessages.push({ role: "user", content: prompt });
    renderMessages();
    showTyping();

    try {
      const { data: { session: s2 } } = await sb.auth.getSession();
      const body = { prompt };
      if (currentThreadId) body.thread_id = currentThreadId;

      const r = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${s2.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      const j = await r.json();
      hideTyping();

      if (j.error) {
        currentMessages.push({ role: "assistant", content: `⚠️ **Erreur :** ${j.error}` });
        renderMessages();
        return;
      }

      if (j.threadId && j.threadId !== currentThreadId) {
        currentThreadId = j.threadId;
      }
      await loadThreads();

      currentMessages.push({ role: "assistant", content: j.finalText || "*(réponse vide)*" });
      renderMessages();
    } catch (e) {
      hideTyping();
      currentMessages.push({ role: "assistant", content: `⚠️ **Erreur réseau :** ${escapeHtml(e.message)}` });
      renderMessages();
      console.error("[delco] send", e);
    } finally {
      isSending = false;
      $send.disabled = false;
      $input.focus();
    }
  }

  const onThreadsClick = (ev) => {
    const delBtn = ev.target.closest("[data-del]");
    if (delBtn) { ev.stopPropagation(); deleteThread(delBtn.dataset.del); return; }
    const row = ev.target.closest(".cp-thread");
    if (row) { loadMessages(row.dataset.id); if (isNarrow()) closeDrawer(); }
  };
  const onNew = () => {
    currentThreadId = null;
    currentMessages = [];
    renderEmpty();
    renderThreads();
    if (isNarrow()) closeDrawer();
    $input.focus();
  };
  const onSend = () => sendPrompt($input.value);
  const onInputKey = (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      sendPrompt($input.value);
    }
  };
  const onInputResize = () => {
    $input.style.height = "44px";
    $input.style.height = Math.min($input.scrollHeight, 140) + "px";
  };

  $threads.addEventListener("click", onThreadsClick);
  $newThread.addEventListener("click", onNew);
  $send.addEventListener("click", onSend);
  $input.addEventListener("keydown", onInputKey);
  $input.addEventListener("input", onInputResize);
  if ($sideToggle) $sideToggle.addEventListener("click", onSideToggle);
  if ($backdrop)   $backdrop.addEventListener("click", onBackdrop);

  root.querySelectorAll(".cp-q").forEach(b => {
    b.addEventListener("click", () => {
      const q = QUICK[parseInt(b.dataset.q, 10)];
      if (q) sendPrompt(q.prompt);
    });
  });

  // ── Responsive : bascule .cp-narrow / .cp-compact selon la largeur
  //    RÉELLE de #cp-root (ResizeObserver), comme leadMgmt. Sous 680px,
  //    la sidebar passe en tiroir ; sous 460px, ajustements fins.
  (function bindChatNarrow() {
    const W = doc.defaultView || window;
    function apply() {
      let w = 0;
      try { w = root.getBoundingClientRect().width || root.clientWidth || 0; } catch (e) {}
      if (!w) return;
      const narrow = w <= 680;
      root.classList.toggle("cp-narrow", narrow);
      root.classList.toggle("cp-compact", w <= 460);
      if (!narrow) root.classList.remove("cp-side-open");   // sidebar fixe en large
    }
    apply();
    [120, 400, 900, 1800, 3200].forEach(d => setTimeout(apply, d));
    try {
      if ("ResizeObserver" in W) {
        if (window.__delcoChatRO) { try { window.__delcoChatRO.disconnect(); } catch (e) {} }
        chatRO = new W.ResizeObserver(apply);
        window.__delcoChatRO = chatRO;
        chatRO.observe(root);
      } else {
        if (window.__delcoChatResize) W.removeEventListener("resize", window.__delcoChatResize);
        window.__delcoChatResize = apply;
        W.addEventListener("resize", window.__delcoChatResize);
      }
    } catch (e) {}
  })();

  window.__delco.destroy = function () {
    try {
      $threads.removeEventListener("click", onThreadsClick);
      $newThread.removeEventListener("click", onNew);
      $send.removeEventListener("click", onSend);
      $input.removeEventListener("keydown", onInputKey);
      $input.removeEventListener("input", onInputResize);
      if ($sideToggle) $sideToggle.removeEventListener("click", onSideToggle);
      if ($backdrop)   $backdrop.removeEventListener("click", onBackdrop);
      if (chatRO) { try { chatRO.disconnect(); } catch (e) {} }
      else if (window.__delcoChatResize) {
        (doc.defaultView || window).removeEventListener("resize", window.__delcoChatResize);
      }
      root.innerHTML = "";
    } catch (_) {}
  };

  await loadThreads();
  renderEmpty();
  $input.focus();

  // ───── Reprise du contexte depuis la page Delco ─────────────
  // Si la page Delco a stocké un prompt à analyser, on le pose dans
  // l'input pour que l'utilisateur n'ait qu'à valider (ou modifier).
  try {
    const pendingPrompt = doc.defaultView.sessionStorage.getItem("delco-prompt-pending");
    if (pendingPrompt) {
      doc.defaultView.sessionStorage.removeItem("delco-prompt-pending");
      $input.value = pendingPrompt;
      // Ajuste la hauteur du textarea
      $input.style.height = "44px";
      $input.style.height = Math.min($input.scrollHeight, 140) + "px";
      $input.focus();
      // Place le curseur à la fin
      const len = $input.value.length;
      $input.setSelectionRange(len, len);
    }
  } catch (e) {
    console.warn("[delco-chat] lecture sessionStorage:", e);
  }
})();
  }
});
