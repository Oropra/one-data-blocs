// ============================================================================
//  DELCO — PAGE (brief + radar) — module One Data (OD.define)  v1
//  Rendu dans __anchor ; client via ctx.supabase ; création de #dp-root retirée
//  (le loader fournit l'ancre). Navigation fiche client corrigée : préfixe /fr
//  en prod (sans lui -> page blanche). Le CTA chat cible #cp-root sur la page.
// ============================================================================
OD.define('delco-page', {
  async mount(__anchor, ctx) {
  __anchor.id = 'dp-root';
// ====================================================================
//  Delco CRM360 — Page Tableau du jour (Custom JS WeWeb) v5
//  --------------------------------------------------------------------
//  V5 : réactivité au bus de site pour le profil manager (rôles 3/5).
//   Focaliser un site dans la topnav filtre brief + radar sur ce site
//   (pastille de focus). La direction n'y réagit pas. Tri des signaux
//   par importance (urgents + enjeu). Détail des propales agrégées.
//  V4 : responsive (grille empilée + radar fluide via ResizeObserver).
//   - les signaux de +30 j ne sont plus exclus : ils sont épinglés sur
//     l'anneau extérieur (rayon 46) au lieu de disparaître. Les urgents
//     (leads fantômes >60 j) redeviennent donc visibles.
//   - plafond de points porté de 30 à 60 pour couvrir tout le périmètre.
//  V2 : layout 2 colonnes (signaux + radar), scroll interne, CTA chat.
// ====================================================================

await (async function () {
  // Navigation : en PROD, WeWeb sert les pages sous /fr/… ; un chemin sans le
  // préfixe de langue mène à une route inexistante -> PAGE BLANCHE. En éditeur,
  // le chemin nu est correct.
  function dpInEditor() {
    try { return (window.self !== window.top) || /-editor\.weweb\.io|weweb\.io/i.test(location.hostname); }
    catch (e) { return true; }
  }
  const LANG_PREFIX     = dpInEditor() ? "" : "/fr";
  const CHAT_PAGE_URL   = LANG_PREFIX + "/agent-test";
  const CLIENT_PAGE_URL = LANG_PREFIX + "/fiche-client";
  const VAR_FICHE_CLIENT_ID = "55490583-c88b-4748-916e-4d203db07742"; // Variable WeWeb FICHE_CLIENT
  const REFRESH_MS    = 5 * 60 * 1000;
  const RADAR_MAX_POINTS = 60;             // plafond d'affichage de points sur le radar
  const BRIEF_LIMIT = 15;                  // brief plafonné au top N (le reste derrière « voir tout »)

  const LOGO_SVG = `
    <svg viewBox="0 0 64 64" fill="none">
      <path d="M 36 8 L 18 36 L 30 36 L 26 56 L 46 28 L 34 28 L 36 8 Z" fill="currentColor"/>
    </svg>
  `;

  if (window.__delcoPage) {
    try { window.__delcoPage.destroy && window.__delcoPage.destroy(); } catch (_) {}
  }
  window.__delcoPage = {};

  const doc = __anchor.ownerDocument || document;

  // ───── CSS ──────────────────────────────────────────────────
  {
    const __oldStyle = doc.getElementById("delco-page-style");
    if (__oldStyle) __oldStyle.remove();   // injection forcée (le CSS responsive doit s'appliquer au reload)
    const style = doc.createElement("style");
    style.id = "delco-page-style";
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Nunito+Sans:opsz,wght@6..12,400;6..12,500;6..12,600;6..12,700;6..12,800;6..12,900&display=swap');

      #dp-root {
        --green:#53bda7; --blue:#2a5ea9; --lblue:#acc5e4; --orange:#fac055;
        --red:#d97070; --text:#1c2b45; --muted:#7a8aa3;
        --soft:#f5f7fb; --line:#e3eaf3;
        font-family:"Nunito Sans",-apple-system,sans-serif;
        color:var(--text);
        background:var(--soft);
        padding:28px;
        border-radius:16px;
      }
      #dp-root *{box-sizing:border-box;}

      /* Header de page */
      .dp-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;}
      .dp-head-left{display:flex;align-items:center;gap:14px;}
      .dp-mark{
        width:44px;height:44px;border-radius:11px;
        background:linear-gradient(135deg,var(--green),var(--blue));
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 4px 12px rgba(42,94,169,0.15);
      }
      .dp-mark svg{width:24px;height:24px;color:#fff;}
      .dp-title{font-size:22px;font-weight:800;color:var(--blue);letter-spacing:-0.3px;}
      .dp-sub{font-size:12px;color:var(--muted);margin-top:2px;}
      .dp-head-right{display:flex;align-items:center;gap:14px;}
      .dp-date{font-size:11px;color:var(--muted);font-weight:700;letter-spacing:1.5px;text-transform:uppercase;font-variant-numeric:tabular-nums;}
      .dp-refresh{
        background:#fff;border:1px solid var(--line);
        border-radius:8px;padding:7px 12px;
        font-family:inherit;font-size:12px;font-weight:600;
        color:var(--blue);cursor:pointer;display:inline-flex;align-items:center;gap:6px;
        transition:all .15s;
      }
      .dp-refresh:hover:not(:disabled){border-color:var(--green);}
      .dp-refresh svg{width:12px;height:12px;}

      /* ═══ Grid 2 colonnes ═══ */
      .dp-grid {
        display: grid;
        grid-template-columns: minmax(560px, 1fr) 400px;
        gap: 16px;
        align-items: stretch;   /* les 2 colonnes prennent la même hauteur */
      }
      @media (max-width: 1080px) {
        .dp-grid { grid-template-columns: 1fr; }
      }

      /* Carte conteneur */
      .dp-card{
        background:#fff;border-radius:14px;
        box-shadow:0 1px 3px rgba(42,94,169,0.04),0 4px 12px rgba(42,94,169,0.04);
      }
      .dp-brief-card{ display:flex; flex-direction:column; }
      .dp-card-head{
        display:flex;align-items:center;justify-content:space-between;
        padding:14px 18px;border-bottom:1px solid var(--line);
      }
      .dp-card-head h2{font-size:13.5px;font-weight:700;color:var(--blue);margin:0;}
      .dp-badge-cnt{
        display:inline-flex;align-items:center;gap:6px;
        background:var(--soft);border-radius:12px;padding:3px 10px;
        font-size:11.5px;font-weight:700;color:var(--blue);
      }
      .dp-badge-cnt-dot{width:6px;height:6px;background:var(--orange);border-radius:50%;}
      .dp-badge-cnt-dot.urgent{background:var(--red);}

      /* Liste des signaux avec scroll interne — hauteur = ~5,3 cartes */
      .dp-signals-list{
        padding:6px;
        height: 510px;          /* ≈ 5,3 cartes de brief */
        overflow-y: auto;
      }
      .dp-signals-list::-webkit-scrollbar{width:8px;}
      .dp-signals-list::-webkit-scrollbar-thumb{background:var(--line);border-radius:4px;}
      .dp-signals-list::-webkit-scrollbar-thumb:hover{background:var(--muted);}

      .dp-signal{
        display:grid;grid-template-columns:4px minmax(0, 1fr) auto;
        padding:12px;border-radius:9px;
        transition:background .15s,opacity .25s,transform .25s;
        animation:dp-fade .35s ease-out;
      }
      .dp-signal:hover{background:var(--soft);}
      .dp-signal.dp-removing{opacity:0;transform:translateX(20px);pointer-events:none;}
      @keyframes dp-fade{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:none;}}

      .dp-signal-bar{width:3px;border-radius:3px;align-self:stretch;}
      .dp-signal.urgent .dp-signal-bar{background:var(--red);}
      .dp-signal.warn   .dp-signal-bar{background:var(--orange);}
      .dp-signal.info   .dp-signal-bar{background:var(--blue);}
      .dp-signal.good   .dp-signal-bar{background:var(--green);}

      .dp-signal-content{padding:0 14px;min-width:0;max-width:560px;}
      .dp-signal-meta{display:flex;align-items:center;gap:10px;margin-bottom:5px;}
      .dp-signal-prio{font-size:9.5px;letter-spacing:1.5px;text-transform:uppercase;font-weight:800;}
      .dp-signal.urgent .dp-signal-prio{color:var(--red);}
      .dp-signal.warn   .dp-signal-prio{color:#b58634;}
      .dp-signal.info   .dp-signal-prio{color:var(--blue);}
      .dp-signal.good   .dp-signal-prio{color:var(--green);}
      .dp-signal-time{font-size:10.5px;color:var(--muted);font-weight:600;}
      .dp-signal-time::before{content:"·";margin-right:6px;}

      .dp-signal-title{font-size:13.5px;font-weight:700;color:var(--text);margin-bottom:3px;line-height:1.3;}
      .dp-signal-desc{font-size:12.5px;color:var(--muted);line-height:1.5;}
      .dp-signal-desc strong{color:var(--text);font-weight:600;}

      .dp-expand-toggle{
        background:none;border:none;padding:0;margin-top:6px;
        font-family:inherit;font-size:11.5px;color:var(--blue);
        font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px;
      }
      .dp-expand-toggle:hover{color:var(--green);}
      .dp-expand-toggle .dp-chevron{transition:transform .2s;}
      .dp-expand-toggle.open .dp-chevron{transform:rotate(180deg);}

      .dp-expand-zone{
        margin-top:8px;padding:0 10px;
        background:var(--soft);border-radius:8px;
        max-height:0;overflow:hidden;transition:max-height .3s ease,padding .3s ease;
      }
      .dp-expand-zone.open{max-height:300px;padding:10px;overflow-y:auto;}
      .dp-expand-item{
        display:flex;justify-content:space-between;align-items:center;
        padding:5px 8px;font-size:12px;border-radius:5px;
      }
      .dp-expand-item:hover{background:#fff;}
      .dp-expand-item-name{font-weight:500;color:var(--text);}
      .dp-expand-item-meta{font-size:10.5px;color:var(--muted);font-variant-numeric:tabular-nums;}
      .dp-expand-item.dp-expand-item-clickable{cursor:pointer;transition:background .15s;}
      .dp-expand-item.dp-expand-item-clickable:hover{background:#fff;}
      .dp-expand-item.dp-expand-item-clickable:hover .dp-expand-item-name{color:var(--blue);font-weight:600;text-decoration:underline;}
      .dp-sub-head{
        font-size:10.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;
        color:var(--muted);padding:8px 8px 3px;margin-top:2px;
        border-top:1px solid var(--line);
      }
      .dp-sub-head:first-child{border-top:0;margin-top:0;}

      .dp-signal-actions{display:flex;flex-direction:column;gap:5px;align-self:center;margin-left:10px;}
      .dp-btn{
        border:none;border-radius:6px;padding:5px 11px;
        font-family:inherit;font-size:11.5px;font-weight:700;cursor:pointer;
        transition:all .15s;white-space:nowrap;
      }
      .dp-btn.primary{background:var(--blue);color:#fff;}
      .dp-btn.primary:hover{background:#234d8c;}
      .dp-btn.ghost{background:transparent;color:var(--muted);}
      .dp-btn.ghost:hover{color:var(--blue);}

      /* États */
      .dp-loading,.dp-empty,.dp-noauth{
        text-align:center;padding:60px 24px;color:var(--muted);
      }
      .dp-loading .dp-spinner{
        width:32px;height:32px;border-radius:50%;
        border:3px solid var(--line);border-top-color:var(--blue);
        margin:0 auto 16px;animation:dp-spin .9s linear infinite;
      }
      @keyframes dp-spin{to{transform:rotate(360deg);}}
      .dp-empty-icon,.dp-noauth-icon{
        width:56px;height:56px;margin:0 auto 16px;border-radius:14px;
        background:linear-gradient(135deg,var(--green),var(--blue));
        display:flex;align-items:center;justify-content:center;
      }
      .dp-empty-icon svg,.dp-noauth-icon svg{width:32px;height:32px;color:#fff;}
      .dp-empty h3,.dp-noauth h3{color:var(--blue);font-size:17px;font-weight:800;margin-bottom:6px;}
      .dp-empty p,.dp-noauth p{font-size:14px;max-width:420px;margin:0 auto;line-height:1.5;}

      /* ═══ RADAR ═══ */
      .dp-radar-card {
        display: flex;
        flex-direction: column;
      }
      /* Zone centrale qui prend la hauteur dispo et centre le radar dedans */
      .dp-radar-body {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 0;
        padding: 8px 0;
      }
      .dp-radar-wrap {
        width: min(300px, 100%);       /* fluide : 300px en large, rétrécit en étroit */
        aspect-ratio: 1 / 1;           /* reste carré quoi qu'il arrive (sinon ellipse) */
        height: auto;
        position: relative;
        margin: 0 auto;
      }
      .dp-radar-disk {
        position: absolute; inset: 0;
        background: radial-gradient(circle at center, var(--soft) 0%, #fff 100%);
        border-radius: 50%; border: 1px solid var(--line);
      }
      .dp-radar-svg { position: absolute; inset: 0; width: 100%; height: 100%; }
      .dp-radar-svg circle.ring { fill: none; stroke: var(--line); stroke-width: 0.3; }
      .dp-radar-svg line.axis { stroke: var(--line); stroke-width: 0.3; stroke-dasharray: 1 1.5; }
      .dp-radar-svg text.label { fill: var(--muted); font-family: "Nunito Sans", sans-serif; font-size: 3px; font-weight: 700; letter-spacing: 0.8px; }
      .dp-radar-svg rect.label-bg { fill: #fff; }

      .dp-radar-sweep {
        position: absolute; inset: 0;
        animation: dp-sweep 8s linear infinite;
        transform-origin: center; pointer-events: none;
      }
      .dp-radar-sweep::after {
        content: ""; position: absolute; top: 0; left: 50%;
        width: 50%; height: 50%;
        background: conic-gradient(from 0deg, transparent 0deg, rgba(83,189,167,0.18) 40deg, transparent 70deg);
        transform-origin: 0 100%;
      }
      @keyframes dp-sweep { to { transform: rotate(360deg); } }

      .dp-radar-points { position: absolute; inset: 0; }
      .dp-radar-point {
        position: absolute; width: 9px; height: 9px;
        transform: translate(-50%, -50%); cursor: pointer;
      }
      .dp-radar-point-dot {
        width: 100%; height: 100%; border-radius: 50%;
        background: currentColor; box-shadow: 0 0 8px currentColor;
      }
      .dp-radar-point.urgent { color: var(--red); }
      .dp-radar-point.warn   { color: var(--orange); }
      .dp-radar-point.good   { color: var(--green); }
      .dp-radar-point.info   { color: var(--blue); }
      .dp-radar-point-pulse {
        position: absolute; inset: 0; border-radius: 50%;
        border: 1.5px solid currentColor;
        animation: dp-dot-pulse 2.5s ease-out infinite; opacity: 0.5;
      }
      @keyframes dp-dot-pulse {
        0%   { transform: scale(1); opacity: 0.6; }
        100% { transform: scale(2.4); opacity: 0; }
      }
      /* Tooltip : base */
      .dp-radar-point .dp-radar-tooltip {
        position: absolute;
        background: var(--text); color: #fff;
        padding: 8px 12px; border-radius: 6px;
        font-size: 11px; line-height: 1.4;
        opacity: 0; transition: opacity 0.15s;
        pointer-events: none; z-index: 99;
        box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        width: 200px;
        white-space: normal;
        text-align: left;
        cursor: pointer;
      }
      .dp-radar-point:hover .dp-radar-tooltip { opacity: 1; pointer-events: auto; }

      /* Tooltip à droite du point : on tire fort à droite (75px du dot) */
      .dp-radar-point.tooltip-right .dp-radar-tooltip {
        left: 75px;
        top: 50%;
        transform: translateY(-50%);
      }
      /* Tooltip à gauche du point */
      .dp-radar-point.tooltip-left .dp-radar-tooltip {
        right: 75px;
        top: 50%;
        transform: translateY(-50%);
      }
      /* Tooltip en haut du point */
      .dp-radar-point.tooltip-top .dp-radar-tooltip {
        bottom: 75px;
        left: 50%;
        transform: translateX(-50%);
      }
      /* Tooltip en bas du point */
      .dp-radar-point.tooltip-bottom .dp-radar-tooltip {
        top: 75px;
        left: 50%;
        transform: translateX(-50%);
      }

      /* Curseur main sur les points (cliquables) */
      .dp-radar-point { cursor: pointer; }
      .dp-radar-tooltip-name { font-weight: 700; }
      .dp-radar-tooltip-meta { font-size: 9px; color: var(--lblue); margin-top: 2px; letter-spacing: 0.8px; text-transform: uppercase; font-weight: 600; }

      .dp-radar-center {
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        width: 64px; height: 64px;
        background: #fff; border: 1px solid var(--line);
        border-radius: 50%;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        box-shadow: 0 2px 8px rgba(42,94,169,0.06);
      }
      .dp-radar-center .now { font-size: 7.5px; letter-spacing: 1.3px; color: var(--green); font-weight: 800; }
      .dp-radar-center .time { font-size: 15px; font-weight: 800; color: var(--blue); line-height: 1; margin: 1px 0; font-variant-numeric: tabular-nums; }
      .dp-radar-center .date { font-size: 8.5px; color: var(--muted); letter-spacing: 0.6px; font-weight: 700; text-transform: uppercase; }

      .dp-radar-legend {
        padding: 0 18px 10px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 5px 12px;
      }
      .dp-radar-chips {
        padding: 6px 14px 16px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        justify-content: center;
        border-top: 1px solid var(--line);
        margin-top: 6px;
      }
      .dp-chip {
        background: transparent;
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 4px 10px;
        font-family: inherit;
        font-size: 11px;
        font-weight: 700;
        color: var(--muted);
        cursor: pointer;
        transition: all .15s;
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .dp-chip:hover { border-color: var(--green); color: var(--text); }
      .dp-chip.active { background: var(--blue); border-color: var(--blue); color: #fff; }
      .dp-chip-dot {
        width: 6px; height: 6px; border-radius: 50%;
      }
      .dp-chip-dot.urgent { background: var(--red); }
      .dp-chip-dot.warn   { background: var(--orange); }
      .dp-chip-dot.good   { background: var(--green); }
      .dp-chip-dot.info   { background: var(--blue); }
      .dp-leg { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--text); font-weight: 500; }
      .dp-leg-dot { width: 6px; height: 6px; border-radius: 50%; box-shadow: 0 0 3px currentColor; }
      .dp-leg.urgent .dp-leg-dot { background: var(--red);    color: var(--red); }
      .dp-leg.warn   .dp-leg-dot { background: var(--orange); color: var(--orange); }
      .dp-leg.good   .dp-leg-dot { background: var(--green);  color: var(--green); }
      .dp-leg.info   .dp-leg-dot { background: var(--blue);   color: var(--blue); }

/* Toast */
      .dp-toast {
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: var(--text); color: #fff; padding: 10px 18px;
        border-radius: 8px; font-size: 13px; font-weight: 600;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        z-index: 9999;
        animation: dp-toast-in .25s ease-out;
      }
      @keyframes dp-toast-in {
        from { opacity: 0; transform: translate(-50%, 8px); }
        to   { opacity: 1; transform: translateX(-50%); }
      }

      /* ═══ RESPONSIVE ═══ */
      /* Repli viewport (fallback si le ResizeObserver ne tourne pas) */
      @media (max-width: 1080px) {
        #dp-root .dp-grid { grid-template-columns: 1fr; }
      }
      @media (max-width: 560px) {
        #dp-root { padding: 14px; }
        #dp-root .dp-head { flex-wrap: wrap; gap: 12px; }
        #dp-root .dp-head-right { width: 100%; justify-content: space-between; }
        #dp-root .dp-signals-list { height: auto; max-height: 60vh; }
        #dp-root .dp-signal-content { max-width: none; }
      }

      /* Repli .dp-narrow / .dp-compact : largeur RÉELLE de #dp-root (ResizeObserver),
         indépendant du viewport — c'est ce qui compte dans un conteneur WeWeb étroit. */
      #dp-root.dp-narrow .dp-grid { grid-template-columns: 1fr; }
      #dp-root.dp-compact { padding: 14px; }
      #dp-root.dp-compact .dp-head { flex-wrap: wrap; gap: 12px; }
      #dp-root.dp-compact .dp-head-right { width: 100%; justify-content: space-between; }
      #dp-root.dp-compact .dp-signals-list { height: auto; max-height: 60vh; }
      #dp-root.dp-compact .dp-signal-content { max-width: none; }
      #dp-root.dp-compact .dp-btn { padding: 6px 9px; font-size: 11px; }

      /* Pastille de focus site (managers) */
      .dp-focus-pill{
        display:inline-flex; align-items:center; gap:5px;
        background:#e1f5ee; border:1px solid #9ad9c5; color:#085041;
        border-radius:999px; padding:4px 11px; font-size:11px; font-weight:800;
        letter-spacing:.3px; white-space:nowrap;
      }

      /* Bouton « voir tout / réduire » du brief */
      .dp-brief-more{
        width:calc(100% - 24px); margin:4px 12px 8px;
        background:var(--soft); border:1px solid var(--line); color:var(--blue);
        border-radius:9px; padding:10px; cursor:pointer;
        font-family:inherit; font-size:12.5px; font-weight:700; transition:all .15s;
      }
      .dp-brief-more:hover{ border-color:var(--green); background:#ecf8f5; }
    `;
    doc.head.appendChild(style);
  }

  // ───── Container ──────────────────────────────────────────
  let root = __anchor;   // fourni par le loader

  // ───── Supabase ────────────────────────────────────────────
  const sb = ctx.supabase;   // client du tenant (fourni par le Shell)

  // ───── Garde de rôle + profil ──────────────────────────────
  //  Delco côté vendeur = le chat conversationnel. Le brief + radar
  //  (alertes) sont réservés aux managers/direction. Un rôle 4 ne
  //  déclenche donc aucun rendu ni aucun polling de signaux.
  //  Profil manager (chef des ventes / resp. marketing, rôles 3 et 5) :
  //  ses signaux sont agrégés par vendeur (sans site sur la carte), donc
  //  il RÉAGIT au bus de site de la topnav. La direction (2/6/7/8) reste
  //  sur son périmètre — ses agrégats portent déjà le site.
  let isManagerProfile = false;
  try {
    const { data: { session: gateSession } } = await sb.auth.getSession();
    if (gateSession) {
      const { data: gateUser } = await sb
        .from("USER")
        .select('"ID_Role"')
        .eq("auth_uid", gateSession.user.id)
        .maybeSingle();
      const r = Number(gateUser?.ID_Role);
      if (r === 4) {
        root.innerHTML = "";   // pas de tableau : le chat reste seul sur la page
        window.__delcoPage.destroy = function () {
          try { root.innerHTML = ""; } catch (_) {}
        };
        return;
      }
      isManagerProfile = (r === 3 || r === 5);
    }
  } catch (e) {
    console.warn("[delco-page] résolution rôle:", e);
    // en cas d'échec on laisse la page se rendre normalement (managers)
  }

  // ───── Helpers ─────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => (
      { "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]
    ));
  }

  function fmtDateLong() {
    const d = new Date();
    const opts = { weekday: "short", day: "numeric", month: "short" };
    const str = d.toLocaleDateString("fr-FR", opts).replace(/\./g, "");
    const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return str + " · " + time;
  }
  function fmtTimeShort() {
    return new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  function fmtDayShort() {
    return new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(/\./g, "");
  }
  function fmtPrioLabel(p) {
    return { urgent: "Urgent", warn: "À traiter", info: "Info", good: "Bonne nouvelle" }[p] || p;
  }

  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
    return Math.abs(h);
  }

  function fmtEur(n) {
    if (n == null) return "";
    try { return Math.round(Number(n)).toLocaleString("fr-FR") + " €"; }
    catch (e) { return n + " €"; }
  }

  // Signaux visibles = filtrés par le site focalisé (managers uniquement).
  // Un signal sans id_site n'est jamais masqué (sécurité).
  function scopedSignals() {
    if (!isManagerProfile || busSite == null) return signals;
    const target = String(busSite);
    return signals.filter(s => {
      const sid = s && s.payload ? s.payload.id_site : null;
      return sid == null || String(sid) === target;
    });
  }

  // Tri d'affichage : urgents d'abord, puis par enjeu (montant / volume) décroissant.
  function severity(s) {
    const p = s.payload || {};
    if (s.rule_code === "vendeur_synthese") {
      return Number(p.propales_montant_total)
        || ((Number(p.nb_zombies) || 0) + (Number(p.nb_stagnants) || 0)
            + (Number(p.nb_propales) || 0) + (Number(p.nb_rdv) || 0)) * 1000;
    }
    return Number(p.montant_total) || Number(p.nb_propales) || Number(p.nb_leads)
        || Number(p.nb_vendeurs) || Number(p.rdv_sans_cr) || 0;
  }
  function sortByImportance(list) {
    const order = { urgent: 0, warn: 1, good: 2, info: 3 };
    return [...list].sort((a, b) => {
      const pa = order[a.priority] ?? 9, pb = order[b.priority] ?? 9;
      if (pa !== pb) return pa - pb;
      return severity(b) - severity(a);
    });
  }

  function showToast(msg) {
    const old = doc.querySelector(".dp-toast");
    if (old) old.remove();
    const t = doc.createElement("div");
    t.className = "dp-toast";
    t.textContent = msg;
    doc.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  // ───── State ───────────────────────────────────────────────
  let signals = [];
  let isLoading = false;
  let intervalId = null;
  let radarFilter = "all";  // 'all' | 'urgent' | 'warn' | 'good'
  let busSite = null;       // site focalisé via la topnav (managers uniquement)
  let busSiteName = null;   // libellé du site focalisé (pour la pastille)
  let showAllBrief = false; // brief : afficher tout ou seulement le top BRIEF_LIMIT

  // ───── Rendu cartes signaux ──────────────────────────────
  function hasExpandable(signal) {
    const p = signal.payload || {};
    if (signal.rule_code === "vendeur_synthese") {
      return (Array.isArray(p.zombies_leads)   && p.zombies_leads.length > 0)
          || (Array.isArray(p.stagnants_leads) && p.stagnants_leads.length > 0)
          || (Array.isArray(p.propales)        && p.propales.length > 0)
          || (Number(p.nb_rdv) > 0);
    }
    return (Array.isArray(p.leads) && p.leads.length > 0)
        || (Array.isArray(p.propales) && p.propales.length > 0)
        || (Array.isArray(p.vendeurs) && p.vendeurs.length > 0);
  }

  // Compte total de dossiers derrière une carte (pour « Voir le détail (N) »).
  function detailCount(signal) {
    const p = signal.payload || {};
    if (signal.rule_code === "vendeur_synthese") {
      return (Number(p.nb_zombies) || 0) + (Number(p.nb_stagnants) || 0)
           + (Number(p.nb_propales) || 0) + (Number(p.nb_rdv) > 0 ? 1 : 0);
    }
    return (p.leads?.length) || (p.propales?.length) || (p.vendeurs?.length) || 0;
  }

  function renderExpandContent(signal) {
    const p = signal.payload || {};

    // ── Carte synthèse vendeur : sous-sections regroupées ──
    if (signal.rule_code === "vendeur_synthese") {
      const clientRows = (items, withMontant) => (items || []).map(it => {
        const idClient = it.id_client;
        const clickable = idClient ? `data-client-id="${idClient}"` : "";
        const clsClickable = idClient ? "dp-expand-item-clickable" : "";
        const name = it.client_nom || ("Client " + (it.id_client ?? it.id_cycle_com ?? it.id_propale ?? ""));
        const montant = (withMontant && it.montant != null) ? fmtEur(it.montant) + " · " : "";
        return `
          <div class="dp-expand-item ${clsClickable}" ${clickable}>
            <span class="dp-expand-item-name">${escapeHtml(name)}</span>
            <span class="dp-expand-item-meta">${montant}${it.anciennete_jours != null ? it.anciennete_jours + " j" : ""}</span>
          </div>`;
      }).join("");

      let html = "";
      if (Array.isArray(p.zombies_leads) && p.zombies_leads.length > 0) {
        html += `<div class="dp-sub-head">Leads &gt; 60 jours (${p.nb_zombies})</div>` + clientRows(p.zombies_leads, false);
      }
      if (Array.isArray(p.stagnants_leads) && p.stagnants_leads.length > 0) {
        html += `<div class="dp-sub-head">Leads stagnants 14–60 j (${p.nb_stagnants})</div>` + clientRows(p.stagnants_leads, false);
      }
      if (Array.isArray(p.propales) && p.propales.length > 0) {
        const total = p.propales_montant_total ? " · " + fmtEur(p.propales_montant_total) : "";
        html += `<div class="dp-sub-head">Propales à l'arrêt 45 j+ (${p.nb_propales}${total})</div>` + clientRows(p.propales, true);
      }
      if (Number(p.nb_rdv) > 0) {
        html += `<div class="dp-sub-head">RDV sans compte-rendu</div>
          <div class="dp-expand-item">
            <span class="dp-expand-item-name">${p.nb_rdv} RDV en attente de CR</span>
            <span class="dp-expand-item-meta"></span>
          </div>`;
      }
      return html;
    }

    if (Array.isArray(p.leads) && p.leads.length > 0) {
      return p.leads.map(l => {
        const idClient = l.id_client;
        const clickable = idClient ? `data-client-id="${idClient}"` : "";
        const clsClickable = idClient ? "dp-expand-item-clickable" : "";
        return `
          <div class="dp-expand-item ${clsClickable}" ${clickable}>
            <span class="dp-expand-item-name">${escapeHtml(l.client_nom || "Client " + l.id_cycle_com)}</span>
            <span class="dp-expand-item-meta">${l.anciennete_jours} j</span>
          </div>
        `;
      }).join("");
    }
    if (Array.isArray(p.propales) && p.propales.length > 0) {
      return p.propales.map(pr => {
        const idClient = pr.id_client;
        const clickable = idClient ? `data-client-id="${idClient}"` : "";
        const clsClickable = idClient ? "dp-expand-item-clickable" : "";
        const montant = pr.montant != null ? fmtEur(pr.montant) + " · " : "";
        return `
          <div class="dp-expand-item ${clsClickable}" ${clickable}>
            <span class="dp-expand-item-name">${escapeHtml(pr.client_nom || "Client " + pr.id_client)}</span>
            <span class="dp-expand-item-meta">${montant}${pr.anciennete_jours} j</span>
          </div>
        `;
      }).join("");
    }
    if (Array.isArray(p.vendeurs) && p.vendeurs.length > 0) {
      return p.vendeurs.map(v => `
        <div class="dp-expand-item">
          <span class="dp-expand-item-name">${escapeHtml(v.nom)}</span>
          <span class="dp-expand-item-meta">${v.contacts_hier || 0} hier</span>
        </div>
      `).join("");
    }
    return "";
  }

  function renderSignalCard(signal) {
    const prio  = signal.priority || "info";
    const title = signal.title || signal.subject_name || "Sans titre";
    const desc  = signal.description || "";
    const expandable = hasExpandable(signal);
    const countDetails = expandable ? detailCount(signal) : 0;
    return `
      <article class="dp-signal ${prio}" data-id="${signal.id}">
        <div class="dp-signal-bar"></div>
        <div class="dp-signal-content">
          <div class="dp-signal-meta">
            <span class="dp-signal-prio">${fmtPrioLabel(prio)}</span>
            <span class="dp-signal-time">${escapeHtml(signal.subject_name || "")}</span>
          </div>
          <h3 class="dp-signal-title">${escapeHtml(title)}</h3>
          ${desc ? `<p class="dp-signal-desc">${escapeHtml(desc)}</p>` : ""}
          ${expandable && countDetails > 1 ? `
            <button class="dp-expand-toggle" data-toggle="${signal.id}">
              <span>Voir le détail (${countDetails})</span>
              <svg class="dp-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="dp-expand-zone" data-zone="${signal.id}"></div>
          ` : ""}
        </div>
        <div class="dp-signal-actions">
          <button class="dp-btn primary" data-action="analyser" data-id="${signal.id}">Analyser</button>
          <button class="dp-btn ghost"   data-action="dismiss"  data-id="${signal.id}">Plus tard</button>
        </div>
      </article>
    `;
  }

  function renderSignalsCard() {
    const full = sortByImportance(scopedSignals());
    const total = full.length;
    if (total === 0) {
      const focusMsg = (isManagerProfile && busSite != null)
        ? "Rien à signaler sur le site focalisé."
        : "Delco a passé en revue ton périmètre et n'a rien à te signaler.";
      return `
        <div class="dp-card">
          <div class="dp-card-head"><h2>Brief du jour</h2></div>
          <div class="dp-empty">
            <div class="dp-empty-icon">${LOGO_SVG}</div>
            <h3>Tout est calme</h3>
            <p>${focusMsg}</p>
          </div>
        </div>`;
    }
    const urgentCount = full.filter(s => s.priority === "urgent").length;
    const capped = (!showAllBrief && total > BRIEF_LIMIT);
    const list = capped ? full.slice(0, BRIEF_LIMIT) : full;
    const remaining = total - list.length;
    const moreBtn = (total > BRIEF_LIMIT)
      ? `<button class="dp-brief-more" data-brief-toggle>${showAllBrief
          ? "Réduire le brief"
          : "Voir les " + remaining + " autre" + (remaining > 1 ? "s" : "") + " signal" + (remaining > 1 ? "s" : "")}</button>`
      : "";
    return `
      <div class="dp-card dp-brief-card">
        <div class="dp-card-head">
          <h2>Brief du jour</h2>
          <span class="dp-badge-cnt">
            <span class="dp-badge-cnt-dot ${urgentCount > 0 ? "urgent" : ""}"></span>
            ${total} signal${total > 1 ? "s" : ""}${urgentCount > 0 ? " · " + urgentCount + " urgent" + (urgentCount > 1 ? "s" : "") : ""}
          </span>
        </div>
        <div class="dp-signals-list">
          ${list.map(renderSignalCard).join("")}
          ${moreBtn}
        </div>
      </div>
    `;
  }

  // ───── Rendu radar ─────────────────────────────────────────
  //  Le radar est TEMPOREL :
  //   - Rayon = âge du signal (created_at) : < 24h au centre → 30j au bord,
  //     les +30j étant épinglés sur l'anneau extérieur (rayon 46).
  //   - Angle = FAMILLE du signal (leads / propales / RDV-activité / wins),
  //     répartie en 4 secteurs de 90°. Position fine déterministe (hash id).
  //   - Couleur = priorité (inchangé).

  // Âge du signal en heures, à partir de created_at (fallback updated_at).
  function signalAgeHours(signal) {
    // Pour une synthèse vendeur, le rayon reflète l'ancienneté RÉELLE du pire
    // dossier (zombie / stagnant / propale), pas l'âge du signal (qui est
    // recréé à chaque scan → sinon tous les points seraient sur le même anneau).
    if (signal.rule_code === "vendeur_synthese") {
      const p = signal.payload || {};
      const days = Math.max(
        Number(p.zombie_max_jours) || 0,
        Number(p.stagnant_max_jours) || 0,
        Number(p.propale_max_jours) || 0
      );
      if (days > 0) return days * 24;
    }
    const ts = signal.created_at || signal.updated_at;
    if (!ts) return 0;
    const ageMs = Date.now() - new Date(ts).getTime();
    return Math.max(0, ageMs / 3600000);
  }

  // Famille métier d'un signal d'après son rule_code → angle de base (degrés).
  //  LEADS   : haut    (centre 270°)
  //  PROPALES/VENTES/STOCK : droite (centre 0°)
  //  RDV/ACTIVITÉ/COACHING : bas    (centre 90°)
  //  WINS/POSITIF          : gauche (centre 180°)
  function signalFamilyAngle(signal) {
    const rc = (signal.rule_code || "").toLowerCase();
    const isLead = /lead|pipeline_stagnant|couverture_relance/.test(rc);
    const isWin  = /win|top_flop|tendance_marque|meteo_site|angle_mort/.test(rc);
    const isRdv  = /rdv|silencieux|coaching|desequilibre_charge/.test(rc);
    const isProp = /propale|sous_conversion|velocite|financement|stock/.test(rc);
    if (isLead) return 270;
    if (isProp) return 0;
    if (isWin)  return 180;
    if (isRdv)  return 90;
    return 90; // défaut : secteur activité
  }

  // Secteur angulaire dédié à chaque STATUT (centre en degrés).
  //  urgent : haut (270°) · à traiter : droite (0°)
  //  bonne nouvelle : gauche (180°) · coaching : bas (90°)
  const PRIO_SECTOR = { urgent: 270, warn: 0, good: 180, info: 90 };
  const SECTOR_SPAN = 80;  // largeur de l'éventail dans un secteur (±40°)

  function pointPosition(signal, angleOverride) {
    // ── RAYON selon l'âge (created_at) ──
    // Le bloc NOW central occupe ~r=13. On démarre donc les points à r=16
    // pour qu'ils restent toujours visibles, et on étale jusqu'à r=46.
    // Repères anneaux : 24h→r≈20, 7j→r≈32, 30j→r≈45, +30j→r=46 (bord).
    const ageH = signalAgeHours(signal);
    const ageDays = ageH / 24;
    let radius;
    if (ageH <= 24) {
      radius = 16 + (ageH / 24) * 4;            // 16 → 20 sur les premières 24h
    } else if (ageDays <= 7) {
      radius = 20 + ((ageDays - 1) / 6) * 12;   // 20 → 32 de 1j à 7j
    } else if (ageDays <= 30) {
      radius = 32 + ((ageDays - 7) / 23) * 13;  // 32 → 45 de 7j à 30j
    } else {
      radius = 46;                              // +30j épinglés sur l'anneau extérieur
    }

    // ── ANGLE ──
    // Si un angle de secteur est imposé (répartition par statut, cf.
    // renderRadarPoints), on l'utilise tel quel. Sinon, fallback historique
    // par famille de règle + dispersion déterministe.
    let angle;
    if (angleOverride != null) {
      angle = ((angleOverride % 360) + 360) % 360;
    } else {
      const h = hashStr(signal.id);
      const baseAngle = signalFamilyAngle(signal);
      const spread = ((h % 80) - 40);           // -40° à +40° autour du centre
      angle = (baseAngle + spread + 360) % 360;
    }

    const rad = (angle * Math.PI) / 180;
    const cx = 50 + radius * Math.cos(rad);
    const cy = 50 + radius * Math.sin(rad);
    return { cx, cy, angle, radius };
  }

  function renderRadarPoints() {
    // Filtre selon le site focalisé (managers) puis selon les chips de priorité
    let filtered = scopedSignals();
    if (radarFilter !== "all") {
      filtered = filtered.filter(s => s.priority === radarFilter);
    }
    // NB : on n'exclut plus les signaux de +30 j. pointPosition() les épingle
    // sur l'anneau extérieur (rayon 46) au lieu de les faire disparaître.
    // C'est ce qui faisait sauter les urgents (leads fantômes >60 j) du radar.

    // Tri par priorité urgente d'abord
    const sorted = [...filtered].sort((a, b) => {
      const order = { urgent: 0, warn: 1, good: 2, info: 3 };
      return (order[a.priority] || 9) - (order[b.priority] || 9);
    });
    // Plafond d'affichage pour ne pas surcharger (porté à 60)
    const top = sorted.slice(0, RADAR_MAX_POINTS);

    // Répartition ANGULAIRE par statut : chaque priorité occupe son secteur,
    // et ses points s'éventent régulièrement dedans (plus d'empilement, plus
    // de recouvrement d'une couleur par une autre).
    const angleFor = new Map();
    const byPrio = {};
    for (const s of top) (byPrio[s.priority] ||= []).push(s);
    for (const prio in byPrio) {
      const arr = byPrio[prio];
      // tri par ancienneté pour un éventail ordonné (récent → ancien)
      arr.sort((a, b) => signalAgeHours(a) - signalAgeHours(b));
      const center = PRIO_SECTOR[prio] != null ? PRIO_SECTOR[prio] : 90;
      const n = arr.length;
      arr.forEach((s, i) => {
        const a = n === 1 ? center : center - SECTOR_SPAN / 2 + (i / (n - 1)) * SECTOR_SPAN;
        angleFor.set(s.id, a);
      });
    }

    return top.map(s => {
      const { cx, cy } = pointPosition(s, angleFor.get(s.id));
      const tooltip = s.title || s.subject_name || "Signal";
      const meta = fmtPrioLabel(s.priority);

      // Positionnement du tooltip basé sur la position du point
      // Le tooltip s'éloigne du CENTRE du radar, pas du point lui-même.
      const classes = ["dp-radar-point", s.priority];
      const dx = cx - 50;  // direction horizontale depuis le centre
      const dy = cy - 50;  // direction verticale depuis le centre
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx > absDy) {
        if (dx > 0) classes.push("tooltip-right");
        else        classes.push("tooltip-left");
      } else {
        if (dy > 0) classes.push("tooltip-bottom");
        else        classes.push("tooltip-top");
      }

      return `
        <div class="${classes.join(" ")}" style="top: ${cy}%; left: ${cx}%;" data-signal-id="${s.id}">
          <div class="dp-radar-point-pulse"></div>
          <div class="dp-radar-point-dot"></div>
          <div class="dp-radar-tooltip">
            <div class="dp-radar-tooltip-name">${escapeHtml(tooltip.slice(0, 80))}</div>
            <div class="dp-radar-tooltip-meta">${meta}</div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderRadarCard() {
    const base = scopedSignals();
    const urgentCount = base.filter(s => s.priority === "urgent").length;
    const warnCount   = base.filter(s => s.priority === "warn").length;
    const goodCount   = base.filter(s => s.priority === "good").length;
    const infoCount   = base.filter(s => s.priority === "info").length;
    return `
      <div class="dp-card dp-radar-card">
        <div class="dp-card-head">
          <h2>Vue d'ensemble</h2>
        </div>

        <div class="dp-radar-body">
        <div class="dp-radar-wrap">
          <div class="dp-radar-disk"></div>
          <svg class="dp-radar-svg" viewBox="0 0 100 100">
            <circle class="ring" cx="50" cy="50" r="45"/>
            <circle class="ring" cx="50" cy="50" r="32"/>
            <circle class="ring" cx="50" cy="50" r="20"/>
            <circle class="ring" cx="50" cy="50" r="13"/>
            <line class="axis" x1="50" y1="2"  x2="50" y2="98"/>
            <line class="axis" x1="2"  y1="50" x2="98" y2="50"/>
            <!-- Labels des cercles, avec petit fond blanc pour lisibilité -->
            <rect class="label-bg" x="44" y="2.5" width="12" height="3.5"/>
            <text class="label" x="50" y="5" text-anchor="middle">+ 30 J</text>
            <rect class="label-bg" x="44" y="15.5" width="12" height="3.5"/>
            <text class="label" x="50" y="18" text-anchor="middle">7 J</text>
            <rect class="label-bg" x="44" y="27.5" width="12" height="3.5"/>
            <text class="label" x="50" y="30" text-anchor="middle">24 H</text>
          </svg>
          <div class="dp-radar-sweep"></div>

          <div class="dp-radar-points">
            ${renderRadarPoints()}
          </div>

          <div class="dp-radar-center">
            <div class="now">NOW</div>
            <div class="time">${fmtTimeShort()}</div>
            <div class="date">${fmtDayShort()}</div>
          </div>
        </div>
        </div><!-- /dp-radar-body -->

        <div class="dp-radar-chips">
          <button class="dp-chip ${radarFilter==="all"?"active":""}" data-filter="all">Tous (${base.length})</button>
          ${urgentCount ? `<button class="dp-chip ${radarFilter==="urgent"?"active":""}" data-filter="urgent"><span class="dp-chip-dot urgent"></span>Urgent (${urgentCount})</button>` : ""}
          ${warnCount   ? `<button class="dp-chip ${radarFilter==="warn"?"active":""}" data-filter="warn"><span class="dp-chip-dot warn"></span>À traiter (${warnCount})</button>` : ""}
          ${goodCount   ? `<button class="dp-chip ${radarFilter==="good"?"active":""}" data-filter="good"><span class="dp-chip-dot good"></span>Bonne nouvelle (${goodCount})</button>` : ""}
          ${infoCount   ? `<button class="dp-chip ${radarFilter==="info"?"active":""}" data-filter="info"><span class="dp-chip-dot info"></span>Coaching (${infoCount})</button>` : ""}
        </div>
      </div>`;
  }

  // ───── Render page entière ────────────────────────────────
  function renderPage(session) {
    if (!session) {
      root.innerHTML = `
        <div class="dp-noauth">
          <div class="dp-noauth-icon">${LOGO_SVG}</div>
          <h3>Tu dois être connecté</h3>
          <p>Connecte-toi à ton compte Oropra pour voir les signaux de ton équipe.</p>
        </div>`;
      return;
    }
    if (isLoading) {
      root.innerHTML = `
        <header class="dp-head">
          <div class="dp-head-left">
            <div class="dp-mark">${LOGO_SVG}</div>
            <div>
              <div class="dp-title">Delco — Tableau du jour</div>
              <div class="dp-sub">Ton agent passe en revue ton périmètre</div>
            </div>
          </div>
        </header>
        <div class="dp-loading"><div class="dp-spinner"></div>Delco charge ton tableau du jour…</div>
      `;
      return;
    }

    root.innerHTML = `
      <header class="dp-head">
        <div class="dp-head-left">
          <div class="dp-mark">${LOGO_SVG}</div>
          <div>
            <div class="dp-title">Delco — Tableau du jour</div>
            <div class="dp-sub">Ton agent a passé en revue ton périmètre</div>
          </div>
        </div>
        <div class="dp-head-right">
          ${(isManagerProfile && busSite != null)
            ? `<span class="dp-focus-pill">📍 ${escapeHtml(busSiteName || ("Site " + busSite))}</span>`
            : ""}
          <span class="dp-date">${fmtDateLong()}</span>
          <button class="dp-refresh" id="dp-refresh-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Rafraîchir
          </button>
        </div>
      </header>
      <div class="dp-grid">
        ${renderSignalsCard()}
        ${renderRadarCard()}
      </div>
    `;
    bindEvents();
  }

  // ───── Bind events ─────────────────────────────────────────
  function bindEvents() {
    const refreshBtn = doc.getElementById("dp-refresh-btn");
    if (refreshBtn) refreshBtn.addEventListener("click", () => load(true));

    const moreBtn = root.querySelector("[data-brief-toggle]");
    if (moreBtn) moreBtn.addEventListener("click", () => {
      showAllBrief = !showAllBrief;
      renderPage({ ok: true });
    });

    root.querySelectorAll("[data-toggle]").forEach(btn => {
      btn.addEventListener("click", () => toggleExpand(btn.dataset.toggle));
    });
    root.querySelectorAll("[data-action='dismiss']").forEach(btn => {
      btn.addEventListener("click", () => onDismiss(btn.dataset.id));
    });
    root.querySelectorAll("[data-action='analyser']").forEach(btn => {
      btn.addEventListener("click", () => onAnalyser(btn.dataset.id));
    });

    // Chips de filtre radar
    root.querySelectorAll(".dp-chip").forEach(chip => {
      chip.addEventListener("click", () => onChipClick(chip.dataset.filter));
    });

    // Clic sur un point du radar = comportement Analyser
    root.querySelectorAll(".dp-radar-point[data-signal-id]").forEach(point => {
      point.addEventListener("click", () => onAnalyser(point.dataset.signalId));
    });
  }

  // Les clics sur les éléments client du détail (event delegation pour les éléments dépliés à la volée)
  function bindExpandClicks(zone) {
    zone.querySelectorAll(".dp-expand-item-clickable[data-client-id]").forEach(el => {
      el.addEventListener("click", () => onClickClient(el.dataset.clientId));
    });
  }

  // ───── Actions ─────────────────────────────────────────────
  function toggleExpand(signalId) {
    const signal = signals.find(s => s.id === signalId);
    if (!signal) return;
    const zone = doc.querySelector(`[data-zone="${signalId}"]`);
    const btn  = doc.querySelector(`[data-toggle="${signalId}"]`);
    if (!zone || !btn) return;
    const open = zone.classList.contains("open");
    if (open) {
      zone.classList.remove("open");
      btn.classList.remove("open");
      setTimeout(() => { zone.innerHTML = ""; }, 300);
    } else {
      zone.innerHTML = renderExpandContent(signal);
      zone.classList.add("open");
      btn.classList.add("open");
      bindExpandClicks(zone);
    }
  }

  function onChipClick(filter) {
    radarFilter = filter;
    // On re-render toute la page (simple et suffisant)
    renderPage({ ok: true });
  }

  async function onClickClient(idClient) {
    if (!idClient) return;
    showToast("Chargement de la fiche client…");
    try {
      // Charger toute la fiche client depuis Supabase
      const { data, error } = await sb
        .from("CLIENT")
        .select("*")
        .eq("IDVu", idClient)
        .maybeSingle();
      if (error) {
        console.error("[delco-page] client:", error);
        showToast("Erreur — impossible de charger le client");
        return;
      }
      if (!data) {
        showToast("Client introuvable");
        return;
      }
      // Mettre à jour la variable WeWeb FICHE_CLIENT
      try {
        if (typeof wwLib !== "undefined" && wwLib.wwVariable && wwLib.wwVariable.updateValue) {
          wwLib.wwVariable.updateValue(VAR_FICHE_CLIENT_ID, data);
        }
      } catch (e) {
        console.warn("[delco-page] updateValue:", e);
      }
      // Naviguer vers la fiche client
      if (typeof wwLib !== "undefined" && wwLib.goTo) {
        wwLib.goTo(CLIENT_PAGE_URL);
      } else {
        doc.defaultView.location.href = CLIENT_PAGE_URL;
      }
    } catch (e) {
      console.error("[delco-page] client click", e);
      showToast("Erreur — fiche client");
    }
  }

  async function onDismiss(signalId) {
    const card = doc.querySelector(`.dp-signal[data-id="${signalId}"]`);
    if (card) card.classList.add("dp-removing");
    try {
      const { error } = await sb.rpc("agent_signal_mark", {
        p_signal_id: signalId, p_status: "dismissed"
      });
      if (error) {
        console.error("[delco-page] dismiss:", error);
        showToast("Erreur — impossible de marquer le signal");
        if (card) card.classList.remove("dp-removing");
        return;
      }
      setTimeout(() => {
        signals = signals.filter(s => s.id !== signalId);
        renderPage({ ok: true });
        // Demander au badge header de se rafraîchir aussi
        try {
          if (window.__delcoBadge && window.__delcoBadge.refresh) {
            window.__delcoBadge.refresh();
          }
        } catch(_) {}
      }, 250);
    } catch (e) {
      console.error("[delco-page] dismiss", e);
      if (card) card.classList.remove("dp-removing");
    }
  }

  async function onAnalyser(signalId) {
    const signal = signals.find(s => s.id === signalId);
    if (!signal) return;

    // Marquer le signal comme 'read'
    sb.rpc("agent_signal_mark", { p_signal_id: signalId, p_status: "read" })
      .then(({ error }) => {
        if (error) console.warn("mark read:", error);
        try {
          if (window.__delcoBadge && window.__delcoBadge.refresh) {
            window.__delcoBadge.refresh();
          }
        } catch (_) {}
      });

    // Retirer de la liste pour synchro visuelle
    signals = signals.filter(s => s.id !== signalId);
    renderPage({ ok: true });

    // Préparer le prompt
    const prompt = buildAnalyserPrompt(signal);

    // Injecter dans le chat de la MÊME page (#cp-input)
    const chatInput = doc.getElementById("cp-input");
    if (chatInput) {
      chatInput.value = prompt;
      // Ajuste hauteur si textarea
      chatInput.style.height = "44px";
      chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + "px";
      // Scroller vers le chat
      const chatRoot = doc.getElementById("cp-root");
      if (chatRoot) {
        chatRoot.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      // Focus + curseur en fin
      setTimeout(() => {
        chatInput.focus();
        const len = chatInput.value.length;
        chatInput.setSelectionRange(len, len);
      }, 500);
      showToast("Contexte injecté dans le chat");
    } else {
      // Fallback : stocker pour navigation future
      try { doc.defaultView.sessionStorage.setItem("delco-prompt-pending", prompt); } catch (_) {}
      showToast("Chat introuvable — contexte sauvegardé");
    }
  }

  function buildAnalyserPrompt(signal) {
    const title = signal.title || signal.subject_name;
    const desc  = signal.description || "";
    const payload = JSON.stringify(signal.payload || {}, null, 2);
    return `Aide-moi à analyser ce signal :

**${title}**
${desc}

Données brutes du signal :
\`\`\`json
${payload}
\`\`\`

Quelles sont les pistes d'action ?`;
  }

  function navigateToChat() {
    if (typeof wwLib !== "undefined" && wwLib.goTo) {
      wwLib.goTo(CHAT_PAGE_URL);
    } else {
      doc.defaultView.location.href = CHAT_PAGE_URL;
    }
  }

  // ───── Chargement ──────────────────────────────────────────
  async function load(forceLoading = false) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { renderPage(null); return; }
    if (forceLoading) {
      isLoading = true;
      renderPage(session);
    }
    try {
      const { data, error } = await sb.rpc("agent_signals_list", { p_limit: 200 });
      if (error) {
        console.error("[delco-page] list:", error);
        showToast("Erreur — impossible de charger les signaux");
        isLoading = false;
        return;
      }
      signals = data || [];
      isLoading = false;
      renderPage(session);
    } catch (e) {
      console.error("[delco-page]", e);
      isLoading = false;
    }
  }

  // ───── Démarrage ───────────────────────────────────────────
  await load(true);
  intervalId = setInterval(() => load(false), REFRESH_MS);

  const onVisChange = () => { if (doc.visibilityState === "visible") load(false); };
  doc.addEventListener("visibilitychange", onVisChange);

  // ───── Responsive : bascule .dp-narrow / .dp-compact ───────
  //  Basé sur la largeur RÉELLE de #dp-root (ResizeObserver), comme leadMgmt.
  //  Les classes posées sur root survivent aux re-render (innerHTML ne touche
  //  pas la classList de l'élément lui-même).
  let resizeObserver = null;
  (function bindDelcoNarrow() {
    const W = doc.defaultView || window;
    function apply() {
      if (!root) return;
      let w = 0;
      try { w = root.getBoundingClientRect().width || root.clientWidth || 0; } catch (e) {}
      if (!w) return;
      root.classList.toggle("dp-narrow", w <= 980);    // grille empilée (la 2-col a besoin de ~980px)
      root.classList.toggle("dp-compact", w <= 560);   // chrome mobile (padding, header, listes)
    }
    apply();
    [120, 400, 900, 1800, 3200].forEach(d => setTimeout(apply, d));
    try {
      if ("ResizeObserver" in W) {
        if (window.__delcoPageRO) { try { window.__delcoPageRO.disconnect(); } catch (e) {} }
        resizeObserver = new W.ResizeObserver(apply);
        window.__delcoPageRO = resizeObserver;
        resizeObserver.observe(root);
      } else {
        if (window.__delcoPageResize) W.removeEventListener("resize", window.__delcoPageResize);
        window.__delcoPageResize = apply;
        W.addEventListener("resize", window.__delcoPageResize);
      }
    } catch (e) {}
  })();

  // ───── Bus de site (managers uniquement) ───────────────────
  //  Le chef des ventes agrège par vendeur (le site n'est pas sur la carte) :
  //  focaliser un site dans la topnav filtre brief + radar sur ce site.
  //  La direction n'y touche pas (ses agrégats portent déjà le site).
  function siteBus() {
    try { const w = wwLib.getFrontWindow && wwLib.getFrontWindow(); if (w && w.oropraSite) return w.oropraSite; } catch (e) {}
    try { return (doc.defaultView && doc.defaultView.oropraSite) || window.oropraSite || null; } catch (e) { return null; }
  }
  async function applyBusSite(siteId) {
    const id = siteId != null ? String(siteId) : null;
    const cur = busSite != null ? String(busSite) : null;
    if (id === cur) return;
    busSite = id;
    busSiteName = null;
    showAllBrief = false;   // nouveau focus → brief replié sur le top
    if (id != null) {
      try {
        const { data } = await sb.from("SITE").select('"SITE"').eq("ID_SITE", id).maybeSingle();
        busSiteName = data?.SITE || null;
      } catch (e) {}
    }
    if (!isLoading) renderPage({ ok: true });
  }
  if (isManagerProfile) {
    // Un seul dispatcher onChange, qui appelle toujours le handler courant
    // (évite les callbacks périmés après un hot-reload).
    window.__delcoBusHandler = applyBusSite;
    (function bindDelcoBus(tries) {
      tries = tries || 0;
      const b = siteBus();
      if (!b) { if (tries < 120) setTimeout(() => bindDelcoBus(tries + 1), 250); return; }
      try {
        const id = b.getSiteId ? b.getSiteId() : null;
        if (id != null) applyBusSite(id);
      } catch (e) {}
      if (!window.__delcoPageBusBound) {
        window.__delcoPageBusBound = true;
        try {
          b.onChange(({ siteId }) => {
            try { window.__delcoBusHandler && window.__delcoBusHandler(siteId); } catch (e) {}
          });
        } catch (e) {}
      }
    })();
  }

  window.__delcoPage.destroy = function () {
    try {
      if (intervalId) clearInterval(intervalId);
      doc.removeEventListener("visibilitychange", onVisChange);
      if (resizeObserver) { try { resizeObserver.disconnect(); } catch (e) {} }
      else if (window.__delcoPageResize) {
        (doc.defaultView || window).removeEventListener("resize", window.__delcoPageResize);
      }
      window.__delcoBusHandler = null;   // le prochain init réassignera le sien
      root.innerHTML = "";
    } catch (_) {}
  };
})();
  }
});
