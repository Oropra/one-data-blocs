// TUTOS v1 (b) — INSTRUMENTÉ (sondes [tutos][probe])
OD.define('tutos', {
  mount(el, ctx) {
  

  el.id = 'tutos-root';
  const doc = el.ownerDocument || document;
  const win = doc.defaultView || window;

  /* ---------- À COMPLÉTER ---------- */
  // SUPABASE_URL / SUPABASE_ANON supprimés -> ctx.fn (projet du tenant)
  const INSTALL_LINK  = '[LIEN_INSTALLATION]';
  const USER_COLLECTION_ID = 'e6331054-02e1-4f9d-b737-753455040b93'; // Userconnected

  /* =======================  RÔLE  ======================= */
  function rawCollections() {
    try { if (typeof collections !== 'undefined') return collections; } catch (e) {}
    return win.collections || (window.wwLib && wwLib.collections) || {};
  }
  function getRole() {
    try {
      const fw = (window.wwLib && wwLib.getFrontWindow && wwLib.getFrontWindow()) || win;
      let u = fw.oropraUser; if (Array.isArray(u)) u = u[0];
      const r = u && u.ID_Role;
      return r != null ? Number(r) : null;
    } catch (e) { return null; }
  }
  function groupOf(role) {
    if (role === 4) return 'vendeur';
    if (role === 3) return 'chef';
    return 'manager'; // 1,2,5,6,7,8
  }
  let roleNum = getRole();
  let group = groupOf(roleNum);

  /* =======================  DONNÉES  ======================= */
  const BRANDS = {
    samsung:  { label: 'Samsung (One UI)', match: /samsung|\bSM-[A-Z0-9]/i, steps: [
      'Réglages > Applications > One-Data Phone > Batterie : « Sans restriction ».',
      'Réglages > Batterie > Limites d\u2019usage en arrière-plan : retire l\u2019app des « applis en veille » et ne l\u2019ajoute pas à « veille profonde ».',
      'Désactive « Mettre en veille les applis inutilisées » pour cette application.' ] },
    xiaomi:   { label: 'Xiaomi / Redmi / POCO (MIUI/HyperOS)', match: /xiaomi|redmi|poco|\bMI\b|miui/i, steps: [
      'Gérer les applications > One-Data Phone : active « Démarrage automatique ».',
      '« Économiseur de batterie » : « Pas de restrictions ».',
      'Récents (multitâche) : verrouille l\u2019app (cadenas).',
      'Autres autorisations : active « Afficher les fenêtres popup en arrière-plan ».' ] },
    huawei:   { label: 'Huawei / Honor (EMUI)', match: /huawei|honor|-L29|\bCLT-|\bANE-|\bELE-/i, steps: [
      'Réglages > Batterie > Lancement des applications > One-Data Phone : désactive « Gérer automatiquement ».',
      'Active « Lancement auto », « Lancement secondaire », « Exécution en arrière-plan ».',
      'Sors l\u2019app de l\u2019optimisation de la batterie.' ] },
    pixel:    { label: 'Google Pixel (Android standard)', match: /pixel/i, steps: [
      'Réglages > Applications > One-Data Phone > Batterie : « Sans restriction ».',
      'Vérifie que les notifications sont activées.' ] },
    oppo:     { label: 'Oppo (ColorOS)', match: /\boppo\b|\bCPH[0-9]/i, steps: [
      'Réglages > Batterie > One-Data Phone : autorise arrière-plan + démarrage auto.',
      'Gestionnaire de démarrage : autorise One-Data Phone.',
      'Verrouille l\u2019app dans les Récents.' ] },
    oneplus:  { label: 'OnePlus (OxygenOS)', match: /oneplus/i, steps: [
      'Optimisation de la batterie > One-Data Phone : « Ne pas optimiser ».',
      'Autorise l\u2019arrière-plan ; désactive « Optimisation poussée ».',
      'Verrouille l\u2019app dans les Récents.' ] },
    autre:    { label: 'Autre / Android standard', match: null, steps: [
      'Réglages > Applications > One-Data Phone > Batterie : « Sans restriction ».',
      'Autorise notifications + affichage par-dessus les autres applications.',
      'Active un éventuel « démarrage auto » propre à ta surcouche.' ] },
  };

  const PERMS = [
    { id: 'perm:micro',   label: 'Microphone autorisé', help: 'Demandé au 1er appel — touche « Autoriser ».' },
    { id: 'perm:notif',   label: 'Notifications autorisées', help: 'Pour être prévenu des appels entrants.' },
    { id: 'perm:overlay', label: '« Afficher par-dessus les autres applications » activé', help: 'Pour voir l\u2019écran d\u2019appel même verrouillé.' },
  ];

  const ALL = ['vendeur', 'chef', 'manager'];
  function crm(id, title, sub, aud) { return { id, product: 'crm', category: title, title, subtitle: sub, available: false, aud: aud || ALL }; }

  const TUTOS = [
    { id: 'phone-install', product: 'phone', category: 'Premiers pas', duration: '2 min', available: true, aud: ALL,
      title: 'Installer l\u2019application', steps: [
        { title: 'Récupère ton lien d\u2019accès', body: 'Tu reçois (ou demandes à ton administrateur) un lien d\u2019accès.', action: { label: 'Copier le lien', copy: INSTALL_LINK } },
        { title: 'Ouvre le lien sur ton téléphone', body: 'Connecte-toi avec ton compte Google et accepte de rejoindre le test.' },
        { title: 'Installe depuis le Play Store', body: 'Suis « Télécharger sur Google Play » puis installe One-Data Phone.' },
        { title: 'Lance l\u2019application', body: 'Ouvre One-Data Phone : tu arrives sur l\u2019écran de connexion.' } ] },
    { id: 'phone-login', product: 'phone', category: 'Premiers pas', duration: '1 min', available: true, aud: ALL,
      title: 'Se connecter', steps: [
        { title: 'Saisis tes identifiants', body: 'Email + mot de passe One Data, les mêmes que sur le CRM web.' },
        { title: 'Connecte-toi', body: 'Touche « Se connecter ». Tu dois voir « Prêt à appeler ».' },
        { title: 'En cas d\u2019erreur', body: 'Si « identifiants incorrects », revérifie ; en cas de doute, contacte ton administrateur.' } ] },
    { id: 'phone-setup', product: 'phone', category: 'Paramétrage', duration: '3 min', available: true, aud: ALL,
      title: 'Paramétrer son téléphone (appels entrants)', type: 'phoneSetup',
      intro: 'Pour recevoir les appels même app fermée ou téléphone verrouillé. Les chemins exacts varient selon la version.' },
    { id: 'phone-call', product: 'phone', category: 'Utiliser', duration: '2 min', available: true, aud: ALL,
      title: 'Passer un appel', steps: [
        { title: 'Rechercher un client', body: 'Onglet « Rechercher » : filtre Tous/Particuliers/Sociétés, tape le nom, touche le client.' },
        { title: 'Composer un numéro', body: 'Onglet « Clavier » : 06\u2026 ou +33\u2026 (appui long sur 0 = « + »). « Appeler » quand valide.' },
        { title: 'Pendant l\u2019appel', body: 'Muet, clavier, haut-parleur, bouton rouge pour raccrocher.' } ] },
    { id: 'phone-incoming', product: 'phone', category: 'Utiliser', duration: '2 min', available: true, aud: ALL,
      title: 'Recevoir un appel', steps: [
        { title: 'L\u2019écran d\u2019appel s\u2019affiche', body: 'Même verrouillé : nom + numéro de l\u2019appelant.' },
        { title: 'Le briefing client', body: 'Contexte : véhicule, dernier devis, dernier échange, suggestion d\u2019accroche.' },
        { title: 'Accepte ou refuse', body: 'Vert pour répondre, rouge pour refuser.' } ] },
    { id: 'phone-recents', product: 'phone', category: 'Utiliser', duration: '1 min', available: true, aud: ALL,
      title: 'Consulter ses appels récents', steps: [
        { title: 'Onglet « Récents »', body: 'Entrants, sortants, manqués (rouge), avec le nom du client si connu.' },
        { title: 'Rappeler en un tap', body: 'Touche une ligne pour rappeler.' } ] },
    { id: 'phone-trouble-incoming', product: 'phone', category: 'Dépannage', duration: '2 min', available: true, aud: ALL,
      title: 'Je ne reçois pas les appels', steps: [
        { title: 'Vérifie ton paramétrage', body: 'Cause n°1 : ouvre « Paramétrer son téléphone » et déroule la checklist de ta marque.' },
        { title: 'Affichage + notifications', body: '« Afficher par-dessus » et notifications doivent être autorisés.' },
        { title: 'Batterie & arrière-plan', body: 'Optimisation batterie désactivée, arrière-plan autorisé.' },
        { title: 'Toujours rien ?', body: 'Ferme/rouvre l\u2019app (réenregistre l\u2019appareil) et vérifie ta connexion.' } ] },
    { id: 'phone-trouble-audio', product: 'phone', category: 'Dépannage', duration: '1 min', available: true, aud: ALL,
      title: 'Pas de son / micro', steps: [
        { title: 'Autorisation micro', body: 'Réglages > Applications > One-Data Phone > Autorisations > Micro.' },
        { title: 'Volume d\u2019appel', body: 'Monte le volume pendant l\u2019appel.' },
        { title: 'Haut-parleur', body: 'Teste le haut-parleur pour isoler le souci.' } ] },

    /* CRM — phase 2 */
    crm('crm-start', 'Démarrer', 'Connexion, navigation, périmètre'),
    { id: 'crm-dashboard', product: 'crm', category: 'Piloter son activité', duration: '3 min', available: true, aud: ALL,
      title: 'Suivi d\u2019activité', subtitle: 'Indicateurs, arbre, graphes, export', tour: 'suivi-activite',
      intro: 'Mesure l\u2019activité de l\u2019équipe : contacts, RDV choc, pipeline et transformation. Lance la visite guidée pour parcourir la page.',
      steps: [
        { title: 'Choisis période et périmètre', body: 'La barre du haut fixe la période ; l\u2019arbre en bas filtre par réseau, affaire, site, type ou vendeur.' },
        { title: 'Lis les indicateurs', body: 'Le résumé et les deux graphes (contacts par jour, pipeline dans le temps) se recalculent selon ta sélection.' },
        { title: 'Va dans le détail', body: 'Sélectionne un site ou un vendeur pour la cadence jour par jour et le détail par vendeur. Le logo Excel exporte le tout.' } ] },
    { id: 'crm-leads', product: 'crm', category: 'Piloter son activité', duration: '2 min', available: true, aud: ALL,
      title: 'Lead Management', subtitle: 'À traiter, pipeline, suivi', tour: 'lead-management',
      intro: 'Le poste de pilotage des leads et des cycles commerciaux. Lance la visite guidée pour le parcourir sur ton écran.',
      steps: [
        { title: 'Choisis ta vue', body: 'Vendeur : « À traiter » et « Pipeline ». Manager : « Synthèse », « Suivi leads » et « Campagnes ».' },
        { title: 'Traite les urgences', body: 'Dans « À traiter », les cycles sont triés par urgence (SLA). Clique une carte pour ouvrir la fiche client.' },
        { title: 'Analyse et pilote', body: 'Manager : la Synthèse donne KPI, classement et graphes ; l\u2019équipe se déplie par réseau, affaire et site.' } ] },
    { id: 'crm-kanban', product: 'crm', category: 'Piloter son activité', duration: '2 min', available: true, aud: ALL,
      title: 'Gestion des ventes (Kanban)', subtitle: 'Piloter son pipeline', tour: 'gestion-ventes',
      intro: 'Ton pipe commercial, du brouillon à la vente. Lance la visite guidée pour le découvrir directement sur ton écran.',
      steps: [
        { title: 'Ouvre la page', body: 'Menu > Gestion des ventes. Tes affaires sont réparties en colonnes : Brouillon, Propale, BDC, Gagné, Perdu.' },
        { title: 'Choisis le périmètre', body: 'Filtre par période, par VN/VO, par type de client ou par financement. Les managers peuvent changer de vendeur.' },
        { title: 'Fais avancer une affaire', body: 'Glisse-dépose une carte d\u2019une colonne à l\u2019autre, ou utilise le bouton « Déplacer ». Le passage en Gagné ou Perdu est réservé aux managers.' },
        { title: 'Agis depuis la carte', body: 'Génère le PDF (proposition ou bon de commande), modifie la propale, ouvre la fiche client, ou archive l\u2019affaire.' } ] },
    { id: 'crm-performances', product: 'crm', category: 'Piloter son activité', duration: '3 min', available: true, aud: ALL,
      title: 'Performances', subtitle: 'Réalisé vs objectifs', tour: 'performances',
      intro: 'Suis ton réalisé face aux objectifs : commandes, financement, Waxoyl, CS, gravage. Lance la visite guidée pour parcourir la page.',
      steps: [
        { title: 'Choisis période et périmètre', body: 'La barre du haut fixe la période et le type (VN/VO) ; l\u2019arbre filtre par réseau, affaire, site ou vendeur.' },
        { title: 'Lis au prorata du mois', body: 'Les couleurs comparent ton atteinte au temps écoulé du mois : vert dans les temps, orange léger retard, rouge loin derrière.' },
        { title: 'Va dans le détail', body: 'Clique un chiffre pour voir les commandes correspondantes (et télécharger le BDC). Le logo Excel exporte le périmètre affiché.' } ] },
    { id: 'crm-objectifs', product: 'crm', category: 'Piloter son activité', duration: '3 min', available: true, aud: ALL,
      title: 'Objectifs', subtitle: 'Définir et suivre', tour: 'objectifs',
      intro: 'Définis les objectifs du mois et suis ton rythme. La page s\u2019adapte : saisie pour le chef, tableau de marche pour le vendeur. Lance la visite guidée pour la parcourir.',
      steps: [
        { title: 'Vendeur : ton rythme', body: 'Chaque indicateur montre ton réalisé sur l\u2019objectif et le rythme attendu au prorata du mois, avec la cadence pour finir dans les temps.' },
        { title: 'Chef : le cap d\u2019équipe', body: 'Pose la cible de commandes, laisse les taux M-1 déduire les cibles secondaires, puis répartis entre tes vendeurs (équitable, prorata M-1, jours de présence).' },
        { title: 'Brouillon puis enregistrement', body: 'Tes saisies restent en brouillon ; le bandeau « Enregistrer les objectifs » valide tout en une fois.' } ] },
    crm('crm-client', 'Fiche client (CRM 360)', 'Historique multicanal'),
    crm('crm-propales', 'Propositions & bons de commande', 'Propale, BDC, PDF, VN/VO'),
    crm('crm-bilaterales', 'Bilatérales', 'Suivi propales & BDC'),
    crm('crm-whatsapp', 'Messagerie WhatsApp', 'Échanger avec ses clients'),
    crm('crm-emails', 'Emails', 'Rédiger et suivre'),
    crm('crm-delco', 'Delco (assistant IA)', 'Signaux & recommandations'),
    crm('crm-team', 'Piloter son équipe', 'Suivi et coaching', ['chef', 'manager']),
    crm('crm-rollout', 'Adoption & déploiement', 'Suivi par site', ['manager']),
  ];

  /* =======================  ÉTAT  ======================= */
  const STORE_KEY = 'onedata_tutos';
  const state = loadState();
  window.__tutosState = state;
  let curFilter = 'all', curSearch = '';
  function loadState() { try { return Object.assign({ brand: null, checks: {}, learned: {} }, JSON.parse(win.localStorage.getItem(STORE_KEY) || '{}')); } catch (e) { return { brand: null, checks: {}, learned: {} }; } }
  function saveState() { try { win.localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }

  /* =======================  HELPERS  ======================= */
  function el(tag, attrs, kids) {
    const n = doc.createElement(tag);
    if (attrs) for (const k in attrs) { const v = attrs[k];
      if (k === 'class') n.className = v; else if (k === 'html') n.innerHTML = v; else if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v != null) n.setAttribute(k, v); }
    if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(c => { if (c == null) return; n.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); });
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function detectBrand() { const ua = win.navigator.userAgent || ''; for (const k in BRANDS) { const m = BRANDS[k].match; if (m && m.test(ua)) return k; } return null; }

  function visibleTutos() { return TUTOS.filter(t => (t.aud || ALL).includes(group)); }
  function learnable() { return visibleTutos().filter(t => t.available); }
  function isLearned(t) { return !!state.learned[t.id]; }
  function scorePct() { const L = learnable(); return L.length ? Math.round(L.filter(isLearned).length / L.length * 100) : 0; }
  function niveau(p) { if (p >= 100) return 'Expert'; if (p >= 67) return 'Confirmé'; if (p >= 34) return 'En progression'; if (p > 0) return 'Débutant'; return 'Nouveau'; }

  let toastTimer;
  function toast(msg) { let t = doc.getElementById('od-toast'); if (!t) { t = el('div', { id: 'od-toast', class: 'od-toast' }); mount.appendChild(t); } t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200); }

  /* =======================  CSS  ======================= */
  function injectCSS() {
    if (doc.getElementById('od-tutos-css')) return;
    if (!doc.getElementById('od-tutos-font')) (doc.head || doc.documentElement).appendChild(el('link', { id: 'od-tutos-font', rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700;800&display=swap' }));
    const css = `
.od-tutos{--p:#2a5ea9;--a:#53bda7;--bl:#acc5e4;--o:#fac055;--d:#e24b4a;--t:#1c2b45;--s:#f6f8fc;font-family:'Nunito Sans',-apple-system,Segoe UI,Roboto,sans-serif;color:var(--t);max-width:900px;margin:0 auto;padding:18px 16px 64px;}
.od-tutos *{box-sizing:border-box;}
.od-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;}
.od-tutos h1{font-size:26px;font-weight:800;margin:0 0 4px;}
.od-tutos .sub{color:#5b6b86;font-size:15px;margin:0;}
.od-score{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #e6ebf4;border-radius:14px;padding:10px 14px;}
.od-score .lvl{font-size:13px;color:#7282a0;}
.od-score .lvl b{display:block;color:var(--t);font-size:16px;}
.od-coach{background:linear-gradient(135deg,#2a5ea9,#3f78c9);border-radius:18px;padding:18px;margin:18px 0;color:#fff;box-shadow:0 10px 30px rgba(42,94,169,.25);}
.od-coach h2{margin:0 0 2px;font-size:19px;font-weight:800;}
.od-coach p.h{margin:0 0 12px;opacity:.85;font-size:14px;}
.od-ask{display:flex;gap:8px;}
.od-ask input{flex:1;border:none;border-radius:11px;padding:13px 15px;font:inherit;font-size:15px;outline:none;}
.od-ask button{border:none;border-radius:11px;padding:0 18px;background:var(--a);color:#fff;font:inherit;font-weight:700;cursor:pointer;}
.od-ask button:disabled{opacity:.6;cursor:default;}
.od-sugg{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
.od-sugg button{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer;}
.od-sugg button:hover{background:rgba(255,255,255,.26);}
.od-ans{background:rgba(255,255,255,.12);border-radius:12px;padding:14px;margin-top:12px;font-size:15px;line-height:1.55;display:none;}
.od-ans.on{display:block;}
.od-ans p{margin:0 0 8px;} .od-ans p:last-child{margin:0;}
.od-ans .links{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
.od-ans .links a{background:#fff;color:var(--p);border-radius:999px;padding:6px 12px;font-size:13px;font-weight:700;text-decoration:none;cursor:pointer;}
.od-search{width:100%;padding:13px 16px;border:1px solid #d4dcea;border-radius:12px;font:inherit;font-size:15px;background:#fff;outline:none;}
.od-search:focus{border-color:var(--p);box-shadow:0 0 0 3px rgba(42,94,169,.12);}
.od-chips{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 6px;}
.od-chip{border:1px solid #d4dcea;background:#fff;color:var(--t);padding:7px 14px;border-radius:999px;font:inherit;font-size:14px;cursor:pointer;transition:.15s;}
.od-chip:hover{border-color:var(--bl);} .od-chip.on{background:var(--p);border-color:var(--p);color:#fff;font-weight:700;}
.od-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;margin-top:16px;}
.od-card{background:#fff;border:1px solid #e6ebf4;border-radius:14px;padding:16px;cursor:pointer;transition:.18s;display:flex;flex-direction:column;gap:8px;position:relative;}
.od-card:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(28,43,69,.10);border-color:var(--bl);}
.od-card.soon{cursor:default;opacity:.7;} .od-card.soon:hover{transform:none;box-shadow:none;border-color:#e6ebf4;}
.od-card .done-dot{position:absolute;top:14px;right:14px;width:20px;height:20px;border-radius:50%;background:var(--a);display:none;align-items:center;justify-content:center;}
.od-card.learned .done-dot{display:flex;} .od-card .done-dot svg{width:12px;height:12px;}
.od-badge{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.02em;padding:3px 9px;border-radius:999px;width:fit-content;}
.od-badge.phone{background:rgba(83,189,167,.16);color:#2c7a68;} .od-badge.crm{background:rgba(42,94,169,.12);color:var(--p);} .od-badge.soon{background:#eef1f7;color:#8895ad;}
.od-card h3{margin:0;font-size:16px;font-weight:700;} .od-card .meta{font-size:13px;color:#8895ad;}
.od-empty{text-align:center;color:#8895ad;padding:40px 0;}
.od-back{background:none;border:none;color:var(--p);font:inherit;font-size:15px;font-weight:700;cursor:pointer;padding:6px 0;}
.od-detail h2{font-size:22px;font-weight:800;margin:6px 0 2px;} .od-detail .intro{color:#5b6b86;font-size:15px;margin:8px 0 18px;}
.od-tour-btn{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;margin:2px 0 20px;background:linear-gradient(135deg,#2a5ea9,#3f78c9);color:#fff;border:none;border-radius:12px;padding:14px;font:inherit;font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 8px 22px rgba(42,94,169,.22);transition:.15s;}
.od-tour-btn:hover{filter:brightness(1.05);transform:translateY(-1px);}
.od-tour-btn svg{flex-shrink:0;}
.od-step{display:flex;gap:14px;padding:14px 0;border-top:1px solid #eef1f7;} .od-step:first-of-type{border-top:none;}
.od-num{flex:0 0 30px;height:30px;border-radius:50%;background:var(--p);color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:14px;}
.od-step .st-t{font-weight:700;margin:2px 0 4px;} .od-step .st-b{color:#41506b;font-size:15px;line-height:1.5;}
.od-act{margin-top:8px;background:var(--a);color:#fff;border:none;border-radius:9px;padding:8px 14px;font:inherit;font-weight:700;cursor:pointer;}
.od-learn{margin-top:22px;width:100%;border:2px solid var(--a);background:#fff;color:#2c7a68;border-radius:12px;padding:13px;font:inherit;font-weight:800;cursor:pointer;}
.od-learn.on{background:var(--a);color:#fff;}
.od-sec-title{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#8895ad;margin:22px 0 10px;}
.od-check{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border:1px solid #e6ebf4;border-radius:11px;margin-bottom:8px;cursor:pointer;background:#fff;transition:.15s;}
.od-check:hover{border-color:var(--bl);} .od-check.done{background:rgba(83,189,167,.07);border-color:rgba(83,189,167,.4);}
.od-box{flex:0 0 22px;height:22px;border-radius:6px;border:2px solid #c3cde0;display:flex;align-items:center;justify-content:center;margin-top:1px;}
.od-check.done .od-box{background:var(--a);border-color:var(--a);} .od-box svg{width:14px;height:14px;display:none;} .od-check.done .od-box svg{display:block;}
.od-check .ck-l{font-weight:600;font-size:15px;} .od-check .ck-h{color:#7282a0;font-size:13px;margin-top:2px;}
.od-progress{height:8px;background:#e9eef6;border-radius:999px;overflow:hidden;margin:6px 0 4px;} .od-progress i{display:block;height:100%;background:var(--a);width:0;transition:width .3s;}
.od-progress-l{font-size:13px;color:#7282a0;margin-bottom:14px;}
.od-ready{background:rgba(83,189,167,.14);color:#2c7a68;border:1px solid rgba(83,189,167,.4);border-radius:11px;padding:12px 14px;font-weight:700;display:none;align-items:center;gap:8px;} .od-ready.on{display:flex;}
.od-tip{background:rgba(250,192,85,.14);border:1px solid rgba(250,192,85,.5);border-radius:11px;padding:13px 15px;margin-top:20px;} .od-tip b{color:#9a6a00;}
.od-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(14px);background:var(--t);color:#fff;padding:11px 18px;border-radius:10px;font-size:14px;opacity:0;pointer-events:none;transition:.25s;z-index:9999;} .od-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}
`;
    (doc.head || doc.documentElement).appendChild(el('style', { id: 'od-tutos-css', html: css }));
  }
  const CHK = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  function ringSVG(pct) { const r = 30, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    return `<svg width="74" height="74" viewBox="0 0 74 74"><circle cx="37" cy="37" r="${r}" fill="none" stroke="#e9eef6" stroke-width="7"/><circle cx="37" cy="37" r="${r}" fill="none" stroke="#53bda7" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 37 37)"/><text x="37" y="42" text-anchor="middle" font-size="18" font-weight="800" fill="#1c2b45">${pct}%</text></svg>`; }

  /* =======================  COACH  ======================= */
  async function askCoach(q) {
    const res = await ctx.fn('tutos-coach', { question: q, role: roleNum, catalog: TUTOS.map(t => ({ id: t.id, title: t.title, desc: t.subtitle || t.category })) });
    return res.json();
  }

  /* =======================  RENDER  ======================= */
  let mount;
  function build(root) { injectCSS(); mount = root; mount.className = 'od-tutos'; if (!state.brand) { state.brand = detectBrand(); saveState(); } win.addEventListener('hashchange', routeFromHash); routeFromHash(); }
  function routeFromHash() { const m = (win.location.hash || '').match(/tuto=([\w-]+)/); const t = m && TUTOS.find(x => x.id === m[1] && x.available); if (t) renderDetail(t); else renderHome(); }
  function go(id) { win.location.hash = id ? ('tuto=' + id) : ''; }

  function renderHome() {
    clear(mount);
    const pct = scorePct(), L = learnable(), remain = L.filter(t => !isLearned(t)).length;
    const top = el('div', { class: 'od-top' });
    const left = el('div', {});
    left.appendChild(el('h1', { text: 'Centre d\u2019aide One Data' }));
    left.appendChild(el('p', { class: 'sub', text: 'Apprends l\u2019app à ton rythme — et demande au coach quand tu bloques.' }));
    top.appendChild(left);
    const score = el('div', { class: 'od-score' });
    score.appendChild(el('div', { html: ringSVG(pct) }));
    score.appendChild(el('div', { class: 'lvl', html: 'Niveau<b>' + niveau(pct) + '</b>' + (remain ? ('Reste ' + remain + ' tuto' + (remain > 1 ? 's' : '')) : 'Tout est acquis 🎉') }));
    top.appendChild(score);
    mount.appendChild(top);

    const coach = el('div', { class: 'od-coach' });
    coach.appendChild(el('h2', { text: 'Demande à Delco' }));
    coach.appendChild(el('p', { class: 'h', text: 'Pose ta question, il te répond et te pointe le bon tuto.' }));
    const ask = el('div', { class: 'od-ask' });
    const input = el('input', { type: 'text', placeholder: 'Ex. : comment passer un appel ?' });
    const send = el('button', { text: 'Demander' });
    const ans = el('div', { class: 'od-ans' });
    function submit() {
      const q = input.value.trim(); if (!q) return;
      send.disabled = true; ans.classList.add('on'); clear(ans); ans.appendChild(el('p', { text: 'Delco réfléchit…' }));
      askCoach(q).then(r => {
        clear(ans);
        String(r.answer || 'Je n\u2019ai pas de réponse.').split(/\n+/).forEach(line => { if (line.trim()) ans.appendChild(el('p', { text: line.trim() })); });
        const ids = (r.tutos || []).map(id => TUTOS.find(t => t.id === id && t.available)).filter(Boolean);
        if (ids.length) { const links = el('div', { class: 'links' }); ids.forEach(t => links.appendChild(el('a', { text: t.title, onclick: () => go(t.id) }))); ans.appendChild(links); }
      }).catch(() => { clear(ans); ans.appendChild(el('p', { text: 'Désolé, le coach est indisponible. Réessaie.' })); })
        .finally(() => { send.disabled = false; });
    }
    send.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    ask.appendChild(input); ask.appendChild(send);
    coach.appendChild(ask);
    const sugg = el('div', { class: 'od-sugg' });
    suggestions().forEach(q => sugg.appendChild(el('button', { text: q, onclick: () => { input.value = q; submit(); } })));
    coach.appendChild(sugg);
    coach.appendChild(ans);
    mount.appendChild(coach);

    const search = el('input', { class: 'od-search', type: 'text', placeholder: 'Rechercher un tutoriel\u2026', value: curSearch });
    search.addEventListener('input', () => { curSearch = search.value; updateList(); });
    mount.appendChild(search);
    const chips = el('div', { class: 'od-chips' });
    [['all', 'Tout'], ['phone', 'Application téléphone'], ['crm', 'CRM']].forEach(([k, lbl]) => chips.appendChild(el('button', { class: 'od-chip' + (curFilter === k ? ' on' : ''), text: lbl, onclick: () => { curFilter = k; renderHome(); } })));
    mount.appendChild(chips);
    mount.appendChild(el('div', { class: 'od-grid', id: 'od-grid' }));
    updateList();
  }

  function suggestions() {
    if (group === 'vendeur') return ['Mon téléphone ne sonne pas', 'Comment passer un appel ?', 'Comment créer une propale ?'];
    if (group === 'chef') return ['Comment suivre mon équipe ?', 'Lire le tableau de bord', 'Paramétrer mon téléphone'];
    return ['Suivre l\u2019adoption par site', 'Lire les performances', 'Premiers pas avec One Data'];
  }

  function updateList() {
    const grid = doc.getElementById('od-grid'); if (!grid) return; clear(grid);
    const q = norm(curSearch);
    const list = visibleTutos().filter(t => {
      if (curFilter !== 'all' && t.product !== curFilter) return false;
      if (!q) return true; return norm(t.title).includes(q) || norm(t.category).includes(q) || norm(t.subtitle).includes(q);
    });
    if (!list.length) { grid.appendChild(el('div', { class: 'od-empty', text: 'Aucun tutoriel ne correspond.' })); return; }
    list.forEach(t => grid.appendChild(card(t)));
  }

  function card(t) {
    const c = el('div', { class: 'od-card' + (t.available ? '' : ' soon') + (isLearned(t) ? ' learned' : '') });
    c.appendChild(el('div', { class: 'done-dot', html: CHK }));
    c.appendChild(el('span', { class: 'od-badge ' + t.product, text: t.product === 'phone' ? 'Téléphone' : 'CRM' }));
    c.appendChild(el('h3', { text: t.title }));
    c.appendChild(el('div', { class: 'meta', text: t.available ? (t.category + ' \u00b7 ' + t.duration) : (t.subtitle || t.category) }));
    if (t.available) c.addEventListener('click', () => go(t.id));
    else { c.appendChild(el('span', { class: 'od-badge soon', text: 'Bientôt disponible' })); c.addEventListener('click', () => toast('Ce tutoriel arrive bientôt.')); }
    return c;
  }

  function renderDetail(t) {
    clear(mount);
    mount.appendChild(el('button', { class: 'od-back', html: '\u2190 Retour', onclick: () => go(null) }));
    const wrap = el('div', { class: 'od-detail' });
    wrap.appendChild(el('span', { class: 'od-badge ' + t.product, text: t.product === 'phone' ? 'Téléphone' : 'CRM' }));
    wrap.appendChild(el('h2', { text: t.title }));
    if (t.intro) wrap.appendChild(el('p', { class: 'intro', text: t.intro }));
    mount.appendChild(wrap);
    if (t.tour) {
      const tb = el('button', { class: 'od-tour-btn', html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Montre-moi en vrai' });
      tb.addEventListener('click', () => {
        if (win.OneDataTour && win.OneDataTour.launch) win.OneDataTour.launch(t.tour);
        else toast('La visite guidée n\u2019est pas encore disponible.');
      });
      wrap.appendChild(tb);
    }
    if (t.type === 'phoneSetup') renderPhoneSetup(wrap, t);
    else (t.steps || []).forEach((s, i) => wrap.appendChild(step(i + 1, s)));
    const btn = el('button', { class: 'od-learn' + (isLearned(t) ? ' on' : ''), text: isLearned(t) ? '\u2713 Appris' : 'Marquer comme appris' });
    btn.addEventListener('click', () => { state.learned[t.id] = !state.learned[t.id]; saveState(); btn.classList.toggle('on', state.learned[t.id]); btn.textContent = state.learned[t.id] ? '\u2713 Appris' : 'Marquer comme appris'; toast(state.learned[t.id] ? 'Bravo, tuto acquis !' : 'Retiré de tes acquis.'); });
    wrap.appendChild(btn);
  }

  function step(n, s) {
    const row = el('div', { class: 'od-step' });
    row.appendChild(el('div', { class: 'od-num', text: String(n) }));
    const body = el('div', {});
    body.appendChild(el('div', { class: 'st-t', text: s.title }));
    body.appendChild(el('div', { class: 'st-b', text: s.body }));
    if (s.action) { const b = el('button', { class: 'od-act', text: s.action.label }); b.addEventListener('click', () => { const v = s.action.copy || ''; if (win.navigator.clipboard) win.navigator.clipboard.writeText(v).then(() => toast('Lien copié.'), () => toast(v)); else toast(v); }); body.appendChild(b); }
    row.appendChild(body); return row;
  }

  function renderPhoneSetup(wrap, t) {
    wrap.appendChild(el('div', { class: 'od-sec-title', text: 'Ta marque de téléphone' }));
    const chips = el('div', { class: 'od-chips' });
    Object.keys(BRANDS).forEach(k => chips.appendChild(el('button', { class: 'od-chip' + (state.brand === k ? ' on' : ''), text: BRANDS[k].label, onclick: () => { state.brand = k; saveState(); renderDetail(t); } })));
    wrap.appendChild(chips);

    const items = []; PERMS.forEach(p => items.push(p));
    const bk = state.brand;
    if (bk && BRANDS[bk]) BRANDS[bk].steps.forEach((s, i) => items.push({ id: 'brand:' + bk + ':' + i, label: s }));

    const prog = el('div', { class: 'od-progress' }); const bar = el('i'); prog.appendChild(bar);
    const progL = el('div', { class: 'od-progress-l' });
    const ready = el('div', { class: 'od-ready', html: '<span>\u2713</span> Tout est prêt : tu peux recevoir les appels.' });
    function refresh() { const done = items.filter(it => state.checks[it.id]).length; bar.style.width = (items.length ? Math.round(done / items.length * 100) : 0) + '%'; progL.textContent = done + ' / ' + items.length + ' validé' + (done > 1 ? 's' : ''); const full = items.length > 0 && done === items.length; ready.classList.toggle('on', full); if (full && !state.learned['phone-setup']) { state.learned['phone-setup'] = true; saveState(); } }

    wrap.appendChild(el('div', { class: 'od-sec-title', text: 'Autorisations' }));
    PERMS.forEach(p => wrap.appendChild(checkRow(p, refresh)));
    if (bk && BRANDS[bk]) { wrap.appendChild(el('div', { class: 'od-sec-title', text: BRANDS[bk].label + ' \u2014 batterie & arrière-plan' })); BRANDS[bk].steps.forEach((s, i) => wrap.appendChild(checkRow({ id: 'brand:' + bk + ':' + i, label: s }, refresh))); }
    else wrap.appendChild(el('p', { class: 'intro', text: 'Choisis ta marque pour afficher les réglages batterie.' }));

    wrap.appendChild(prog); wrap.appendChild(progL); wrap.appendChild(ready);
    wrap.appendChild(el('div', { class: 'od-tip', html: '<b>Teste un appel entrant.</b> Demande à un collègue de t\u2019appeler, téléphone verrouillé : l\u2019écran d\u2019appel doit s\u2019afficher.' }));
    refresh();
  }

  function checkRow(item, onChange) {
    const row = el('div', { class: 'od-check' + (state.checks[item.id] ? ' done' : '') });
    row.appendChild(el('div', { class: 'od-box', html: CHK }));
    const txt = el('div', {}); txt.appendChild(el('div', { class: 'ck-l', text: item.label })); if (item.help) txt.appendChild(el('div', { class: 'ck-h', text: item.help }));
    row.appendChild(txt);
    row.addEventListener('click', () => { state.checks[item.id] = !state.checks[item.id]; row.classList.toggle('done', state.checks[item.id]); saveState(); onChange && onChange(); });
    return row;
  }

  /* =======================  BOOT  ======================= */
  function resolveRoleThenMaybeRerender() {
    [400, 1200, 2500].forEach(d => setTimeout(() => {
      const r = getRole();
      if (r != null && r !== roleNum) { roleNum = r; group = groupOf(r); if (mount && !(win.location.hash || '').includes('tuto=')) renderHome(); }
    }, d));
  }
  function start() {
    const root = doc.getElementById('tutos-root');
    console.log('[tutos][probe] start root=', !!root, 'docIsAnchorDoc=', doc === el.ownerDocument);
    if (!root) return false;
    if (root.dataset.tutosBuilt) return true; root.dataset.tutosBuilt = '1';
    build(root); resolveRoleThenMaybeRerender();
    queueMicrotask(() => { try { const r = root.getBoundingClientRect(); console.log('[tutos][probe] built innerHTML=' + root.innerHTML.length + ' inDOM=' + root.isConnected + ' visible=' + (!!root.offsetParent) + ' rect=' + JSON.stringify({w:Math.round(r.width),h:Math.round(r.height)}) + ' role=' + roleNum); } catch(e){ console.warn('[tutos][probe] err', e); } });
    return true;
  }
  if (!start()) { [100, 300, 600, 1000, 2000].forEach(d => setTimeout(start, d)); const obs = new MutationObserver(() => { if (start()) obs.disconnect(); }); obs.observe(doc.body || doc.documentElement, { childList: true, subtree: true }); }
  }
});
