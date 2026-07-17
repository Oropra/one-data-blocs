// ============================================================================
//  One Data — SOCLE / PORTE D'ENTRÉE UNIQUE
//  Servi par le CDN (socle.js). WeWeb ne garde qu'une amorce d'une ligne qui
//  charge ce fichier : plus aucune logique métier dans la coquille.
//  Ne peut pas être un module OD.define : c'est lui qui CRÉE le loader.
//  Séquence garantie, derrière un loader plein écran :
//    loader ON → tenant → client runtime → session → oropraUser → mount → loader OFF
//  Si pas de session : on monte quand même (la page login s'affiche).
//  Rapatrie la résolution utilisateur (ex-bloc « User connecté », supprimé).
//  Expose window.oropraLoadUser (rappelé par auth.js après login).
// ============================================================================
(async function odBootstrap() {
    const CP_URL  = 'https://lerofucjmfrrduohnwet.supabase.co';
    const CP_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxlcm9mdWNqbWZycmR1b2hud2V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDQzNDAsImV4cCI6MjA5ODUyMDM0MH0.lPXHIRPtnhc4UTjXyXY--SRU8yqn8JbPHzSgt3m0JtM';

    const FW = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window;
    const FD = (wwLib.getFrontDocument && wwLib.getFrontDocument()) || document;
    const OROPRA_USER_VAR = '8b103baa-30a5-42e5-8f17-42120781a596'; // variable globale WeWeb (Object)

    // ---------------------------------------------------------- loader plein écran
    function showLoader() {
        try {
            if (FD.getElementById('od-boot-loader')) return;
            const ov = FD.createElement('div');
            ov.id = 'od-boot-loader';
            ov.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000;background:#ffffff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;font-family:system-ui,-apple-system,sans-serif');
            ov.innerHTML =
                '<div style="width:46px;height:46px;border:4px solid #e6eef7;border-top-color:#2b6cb0;border-radius:50%;animation:od-spin .8s linear infinite"></div>' +
                '<div style="color:#7a9cc4;font-size:14px;letter-spacing:.02em">Chargement…</div>' +
                '<style>@keyframes od-spin{to{transform:rotate(360deg)}}</style>';
            (FD.body || FD.documentElement).appendChild(ov);
        } catch (e) {}
    }
    function hideLoader() {
        try {
            const ov = FD.getElementById('od-boot-loader');
            if (!ov) return;
            ov.style.transition = 'opacity .25s'; ov.style.opacity = '0';
            setTimeout(() => { try { ov.remove(); } catch (e) {} }, 260);
        } catch (e) {}
    }
    showLoader();

    // ---------------------------------------------------------- résolution du slug
    function getSlug() {
        const DEV_SLUG = 'oropra';
        // Correspondance explicite domaine -> slug (prioritaire). Ajoute chaque client.
        const HOST_MAP = {
            'one-data-dev.oropra.com': 'oropra',
            'app.oropra.com': 'oropra',
        };
        const p = new URLSearchParams(location.search);
        if (p.get('tenant')) return p.get('tenant');
        const host = location.hostname;
        if (HOST_MAP[host]) return HOST_MAP[host];
        const dev = window.self !== window.top ||
            /weweb|-editor|\.pages\.dev$/i.test(host) ||
            host === 'localhost' || host === '127.0.0.1';
        return dev ? DEV_SLUG : host.split('.')[0];
    }

    async function cpRpc(fn, body) {
        const res = await fetch(`${CP_URL}/rest/v1/rpc/${fn}`, {
            method: 'POST',
            headers: { 'apikey': CP_ANON, 'Authorization': `Bearer ${CP_ANON}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`${fn} HTTP ${res.status} ${await res.text()}`);
        return res.json();
    }

    // ===================== 1 — Résolution du tenant ==========================
    let tenant;
    try {
        tenant = await cpRpc('resolve_tenant_public', { p_slug: getSlug() });
        if (!tenant || !tenant.id) { console.error('[bootstrap] tenant introuvable'); hideLoader(); return; }
        window.__OD_TENANT__ = tenant;
        console.log('[bootstrap] ✅ tenant :', tenant.group_name);
    } catch (e) { console.error('[bootstrap] résolution KO', e); hideLoader(); return; }

    // ===================== 2 — Client Supabase runtime =======================
    let sb;
    try {
        let carried = null;
        try {
            const prev = wwLib?.wwPlugins?.supabase?.instance;
            if (prev?.auth?.getSession) carried = (await prev.auth.getSession()).data?.session || null;
        } catch (_) {}

        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        sb = createClient(tenant.supabase_url, tenant.supabase_anon_key,
                          { auth: { persistSession: true, autoRefreshToken: true } });

        if (carried?.access_token && carried?.refresh_token) {
            try { await sb.auth.setSession({ access_token: carried.access_token, refresh_token: carried.refresh_token }); }
            catch (e) { console.warn('[bootstrap] report session KO', e); }
        }
        window.__OD_SB__ = sb;
        if (wwLib?.wwPlugins?.supabase) wwLib.wwPlugins.supabase.instance = sb;
        console.log('[bootstrap] ✅ client runtime →', sb.supabaseUrl);
    } catch (e) { console.error('[bootstrap] client runtime KO', e); hideLoader(); return; }

    // ===================== 3 — Résolution utilisateur (rapatriée) ============
    // Exposée pour être rappelée par auth.js après un login réussi.
    const syncUserVar = (u) => { try { wwLib.wwVariable.updateValue(OROPRA_USER_VAR, u || null); } catch (e) {} };
    FW.oropraLoadUser = async function () {
        // uid via getUser() (fiable même avec plusieurs instances GoTrueClient)
        let uid = null;
        try {
            for (let i = 0; i < 25; i++) {
                const r = await sb.auth.getUser();
                if (r && r.data && r.data.user) { uid = r.data.user.id; break; }
                await new Promise(res => setTimeout(res, 200));
            }
        } catch (e) { console.error('[user] session', e); }
        if (!uid) { FW.oropraUser = null; FW.__oropraAuthUid = null; syncUserVar(null); return null; }
        if (FW.oropraUser && FW.__oropraAuthUid === uid) { syncUserVar(FW.oropraUser); return FW.oropraUser; }
        if (FW.__oropraUserPromise) return FW.__oropraUserPromise;
        FW.__oropraUserPromise = (async () => {
            try {
                const { data, error } = await sb.rpc('get_current_user');
                if (error) throw error;
                FW.oropraUser = Array.isArray(data) ? data[0] : data;
                FW.__oropraAuthUid = uid;
                syncUserVar(FW.oropraUser);
                try {
                    FW.dispatchEvent(new CustomEvent('oropra-user-ready', { detail: FW.oropraUser }));
                    if (FW !== window) window.dispatchEvent(new CustomEvent('oropra-user-ready', { detail: FW.oropraUser }));
                } catch (e) {}
                console.log('[user] bootstrap OK', FW.oropraUser && FW.oropraUser.ID_User);
                return FW.oropraUser;
            } catch (e) { console.error('[user] get_current_user', e); return null; }
            finally { FW.__oropraUserPromise = null; }
        })();
        return FW.__oropraUserPromise;
    };
    // Purge à la déconnexion (auth state) — garde l'app cohérente.
    try {
        if (!FW.__oropraAuthListener) {
            FW.__oropraAuthListener = true;
            sb.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_OUT') {
                    FW.oropraUser = null; FW.__oropraAuthUid = null; FW.__oropraUserPromise = null; syncUserVar(null);
                } else if (session && session.user && (!FW.oropraUser || FW.__oropraAuthUid !== session.user.id)) {
                    try { FW.oropraLoadUser(); } catch (e) {}
                }
            });
        }
    } catch (e) {}

    // ===================== 3ter — Référentiels universels ===================
    // Données IDENTIQUES pour TOUS les tenants (référentiels nationaux / métier).
    // Elles vivaient dans des variables WeWeb : mauvais endroit, car la coquille
    // WeWeb est PARTAGÉE entre tous les clients et n'est pas versionnée avec le
    // code. Leur place est ici : la couche CDN est justement le code commun,
    // versionné, servi à tous. Les modules continuent de les lire via
    // wwLib.wwVariable.getValue(<uuid>) — le filet ci-dessus les sert.
    //
    // Pour les faire évoluer : modifier ces valeurs et republier le Shell.
    const OD_REF_VARS = {
        // ── Frais de carte grise — barème NATIONAL (voir OD.cg ci-dessous) ──
        'a7b18463-aeb8-456a-99ee-9ee0d8b4bca5': 11,      // Y.4 Taxe de gestion (€) — taxe fixe
        'cddb6b4a-7bec-4a8d-9fb5-ce940ea50398': 2.76,    // Y.5 Redevance d'acheminement (€)
        //   ⚠️ CORRIGÉ : valait 1,76 € — le tarif officiel est 2,76 € depuis des
        //   années. Chaque propale sous-facturait 1 € de carte grise.
        //
        // Y.2 « taxe parafiscale » = taxe de formation professionnelle.
        //   Contrairement à ce qu'on croyait, elle ne dépend NI du département,
        //   NI du statut du client (société/particulier) : elle est liée à la
        //   NATURE DU VÉHICULE (utilitaire) et à son PTAC. Un particulier qui
        //   achète une camionnette la paie ; une société qui achète une voiture
        //   particulière (VP) ne la paie PAS. Barème complet dans OD.cg.
        //   Valeur servie ici = tranche PTAC ≤ 3,5 t (cas d'un négoce VO).
        'f2a30399-02d6-4a95-bace-742f23a076f9': 34,      // Y.2 (PTAC ≤ 3,5 t)
        // Référentiel NPAI — alimente le menu déroulant de la fiche client.
        '7e24f595-e1fd-4257-99f4-76f179032788': ["Aucun", "NPAI", "Décédé"],
        // Référentiel des formes juridiques / civilités (code, libellé, multivu).
        'cced74ab-5a0a-418d-9479-2366e05a8754': [{"code": "1000", "libelle": "Entrepreneur individuel", "multivu": 1, "libelle_court": "EI"}, {"code": "1762", "libelle": "Entrepreneur individuel agricole", "multivu": 1, "libelle_court": "EI agricole"}, {"code": "4110", "libelle": "Société en nom collectif", "multivu": 1, "libelle_court": "SNC"}, {"code": "4120", "libelle": "Société en commandite simple", "multivu": 1, "libelle_court": "SCS"}, {"code": "4130", "libelle": "Société en commandite par actions", "multivu": 1, "libelle_court": "SCA"}, {"code": "5498", "libelle": "Société à responsabilité limitée", "multivu": 1, "libelle_court": "SARL"}, {"code": "5499", "libelle": "Entreprise unipersonnelle à responsabilité limitée", "multivu": 1, "libelle_court": "EURL"}, {"code": "5599", "libelle": "Autre société commerciale", "multivu": 1, "libelle_court": "Société commerciale"}, {"code": "5710", "libelle": "Société par actions simplifiée", "multivu": 1, "libelle_court": "SAS"}, {"code": "5720", "libelle": "Société par actions simplifiée unipersonnelle", "multivu": 1, "libelle_court": "SASU"}, {"code": "5590", "libelle": "Société anonyme", "multivu": 1, "libelle_court": "SA"}, {"code": "5310", "libelle": "Société civile immobilière", "multivu": 1, "libelle_court": "SCI"}, {"code": "5320", "libelle": "Société civile professionnelle", "multivu": 1, "libelle_court": "SCP"}, {"code": "5330", "libelle": "Société civile de moyens", "multivu": 1, "libelle_court": "SCM"}, {"code": "5340", "libelle": "Société civile d'exploitation agricole", "multivu": 1, "libelle_court": "SCEA"}, {"code": "5360", "libelle": "Groupement agricole d'exploitation en commun", "multivu": 1, "libelle_court": "GAEC"}, {"code": "5390", "libelle": "Autre société civile", "multivu": 1, "libelle_court": "Société civile"}, {"code": "6310", "libelle": "Association déclarée", "multivu": 1, "libelle_court": "Association"}, {"code": "6510", "libelle": "Fondation", "multivu": 1, "libelle_court": "Fondation"}, {"code": "10000", "libelle": "Monsieur", "multivu": 0, "libelle_court": "M."}, {"code": "10001", "libelle": "Madame", "multivu": 0, "libelle_court": "Mme"}, {"code": "10002", "libelle": "Mademoiselle", "multivu": 0, "libelle_court": "Mlle"}, {"code": "10003", "libelle": "Docteur", "multivu": 0, "libelle_court": "Dr"}, {"code": "10004", "libelle": "Professeur", "multivu": 0, "libelle_court": "Pr"}, {"code": "10005", "libelle": "Maître", "multivu": 0, "libelle_court": "Me"}, {"code": "10006", "libelle": "Monsieur et Madame", "multivu": 0, "libelle_court": "M. & Mme"}, {"code": "10007", "libelle": "Société", "multivu": 0, "libelle_court": "Sté"}],
    };

    // Barème carte grise exposé aux modules (OD.cg). Source : réglementation
    // nationale. À mettre à jour ici puis republier le Shell.
    //   Y.1 taxe régionale = puissance fiscale × tarif CV (table bareme_cheval_fiscal,
    //       par département) ; -50 % si le véhicule a plus de 10 ans.
    //   Y.2 formation professionnelle : SEULEMENT les véhicules utilitaires /
    //       transport en commun (genre CTTE, catégorie européenne N). 0 € pour une
    //       voiture particulière (VP) et les 2-roues. Exonérés : carte grise de
    //       collection, immatriculation provisoire (WW), VASP.
    //   Y.3 malus CO2 : véhicules neufs/importés uniquement.
    //   Y.4 / Y.5 : forfaits nationaux.
    const OD_CG = {
        taxeGestion: 11,          // Y.4 (€)
        acheminement: 2.76,       // Y.5 (€)
        // Y.2 par tranche de PTAC (tonnes) — montant en €
        formationPro: [
            { ptacMax: 3.5,       montant: 34 },
            { ptacMax: 6,         montant: 127 },
            { ptacMax: 11,        montant: 189 },
            { ptacMax: Infinity,  montant: 285 },
        ],
        // Montant Y.2 pour un PTAC donné (en tonnes). 0 si le véhicule n'est pas
        // un utilitaire (à déterminer par l'appelant : genre CTTE / catégorie N).
        y2ParPtac(ptacTonnes) {
            const p = Number(ptacTonnes);
            if (!isFinite(p) || p <= 0) return this.formationPro[0].montant;   // défaut ≤ 3,5 t
            const t = this.formationPro.find(x => p <= x.ptacMax);
            return t ? t.montant : this.formationPro[this.formationPro.length - 1].montant;
        },
    };

    // ===================== 3bis — Filet variables WeWeb =====================
    // Des variables WeWeb utilisées par les modules ont été supprimées du projet
    // ("variable not found") : la communication entre modules tombait en panne
    // (client sélectionné, onglet fiche, id_propale_bdc, caches…).
    //
    // Ce filet les sert depuis un magasin local (+ sessionStorage, pour survivre
    // à un rechargement). Il est AUTO-APPRENANT : à l'écriture, si WeWeb ne peut
    // pas relire la valeur, la variable est classée absente et servie localement.
    // Plus rien à maintenir à la main quand une nouvelle variable disparaît.
    //
    // SÛRETÉ : une variable vivante passe INTACTE (arguments compris) — c'est le
    // point qui avait provoqué une page blanche quand on interceptait tout.
    try {
        if (wwLib.wwVariable && !wwLib.wwVariable.__odShim) {
            const store = new Map();
            const dead  = new Set([
                // Amorce : variables déjà constatées absentes (évite une erreur
                // console au premier passage). La détection couvre le reste.
                '55490583-c88b-4748-916e-4d203db07742', // client sélectionné
                'fb2cad2c-cd04-42e0-8909-e3c91c8dcfac', // onglet fiche client
                'aac565e9-ad32-4f81-bf8d-adb611322e62', // id_propale_bdc
                'ab8a0894-78dc-4523-8e96-07fdc56bd793', // dashboard prêt
                '9fee26d2-65d3-4b66-8105-9ce1e528db9a', // état SMS
                'd6e8c441-31a5-4e35-9724-3181f9767292', // état VOIP
                '77236b74-a383-48cc-b5df-d798ea1c65d0', // cache RDV
                '20ec044e-28cb-4f1e-9d3d-362f3e6c3f38', // cache P.Com
            ]);
            const SKEY = 'od_vars';
            try {
                const raw = sessionStorage.getItem(SKEY);
                if (raw) Object.entries(JSON.parse(raw)).forEach(([k, v]) => store.set(k, v));
            } catch (e) {}
            const persist = () => {
                try { sessionStorage.setItem(SKEY, JSON.stringify(Object.fromEntries(store))); } catch (e) {}
            };
            const realGet = wwLib.wwVariable.getValue.bind(wwLib.wwVariable);
            const realSet = wwLib.wwVariable.updateValue.bind(wwLib.wwVariable);

            wwLib.wwVariable.getValue = function (id) {
                if (dead.has(id)) return store.has(id) ? store.get(id) : undefined;
                let v;
                try { v = realGet.apply(null, arguments); } catch (e) { v = undefined; }
                // Valeur absente côté WeWeb mais connue localement (ex. variable
                // supprimée, écrite avant ce chargement) -> on sert le magasin.
                if (v === undefined && store.has(id)) return store.get(id);
                return v;
            };
            wwLib.wwVariable.updateValue = function (id, val) {
                if (dead.has(id)) { store.set(id, val); persist(); return; }
                let r;
                try { r = realSet.apply(null, arguments); } catch (e) {}
                // Auto-détection : si WeWeb ne relit pas la valeur, la variable
                // n'existe plus -> on la sert localement à partir de maintenant.
                try {
                    if (realGet(id) === undefined) {
                        dead.add(id); store.set(id, val); persist();
                        console.warn('[bootstrap] variable absente du projet, servie localement :', id);
                    }
                } catch (e) { dead.add(id); store.set(id, val); persist(); }
                return r;
            };
            wwLib.wwVariable.__odShim = true;
            // Les référentiels universels (section 3ter) sont servis localement et
            // font autorité : on les injecte après la restauration de sessionStorage.
            try {
                Object.keys(OD_REF_VARS).forEach(k => { dead.add(k); store.set(k, OD_REF_VARS[k]); });
                persist();
            } catch (e) {}
            console.log('[bootstrap] ✅ filet variables (auto-apprenant) + ' + Object.keys(OD_REF_VARS).length + ' référentiels');
        }
    } catch (e) { console.warn('[bootstrap] shim variables KO', e); }

    // ===================== 4 — Loader de modules (setup, sans monter) ========
    const OD = window.OD = window.OD || {};
    OD.tenant   = tenant;
    OD.supabase = sb;
    OD.cg       = OD_CG;   // barème carte grise (national)
    OD.getUser = () => { try { let u = FW.oropraUser; if (Array.isArray(u)) u = u[0]; return u || null; } catch (e) { return null; } };

    OD.fn = async (name, body, opts = {}) => {
        const base = String(tenant.supabase_url).replace(/\/$/, '');
        let token = tenant.supabase_anon_key;
        try { const { data } = await sb.auth.getSession(); if (data?.session?.access_token) token = data.session.access_token; } catch (_) {}
        return fetch(`${base}/functions/v1/${name}`, {
            method: opts.method || 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': tenant.supabase_anon_key,
                'Authorization': 'Bearer ' + token,
                ...(opts.headers || {}),
            },
            body: body != null ? JSON.stringify(body) : undefined,
            signal: opts.signal,
        });
    };

    OD.modules  = OD.modules  || {};
    OD.manifest = OD.manifest || {};
    OD._loading = OD._loading || {};
    OD.define = (key, def) => { OD.modules[key] = def; };

    try {
        const list = await cpRpc('resolve_tenant_modules', { p_tenant_id: tenant.id });
        (list || []).forEach(m => { OD.manifest[m.module_key] = m; });
        console.log('[loader] manifeste :', Object.keys(OD.manifest).length, 'module(s)', Object.keys(OD.manifest));
    } catch (e) { console.error('[loader] manifeste KO', e); }

    function ensureLoaded(key) {
        if (OD.modules[key]) return Promise.resolve();
        if (OD._loading[key]) return OD._loading[key];
        const entry = OD.manifest[key];
        if (!entry) return Promise.reject(new Error(`module '${key}' absent du manifeste`));
        OD._loading[key] = new Promise((resolve, reject) => {
            try {
                if (entry.source === 'inline') { new Function(entry.code)(); resolve(); }
                else if (entry.source === 'cdn') {
                    const s = document.createElement('script');
                    s.src = entry.cdn_url; s.async = true;
                    s.onload = () => resolve();
                    s.onerror = () => reject(new Error(`chargement CDN KO : ${entry.cdn_url}`));
                    document.head.appendChild(s);
                } else reject(new Error(`source inconnue : ${entry.source}`));
            } catch (e) { reject(e); }
        });
        return OD._loading[key];
    }

    async function mountAnchor(el) {
        if (el.dataset.odMounted) return;
        const key = el.dataset.odModule;
        el.dataset.odMounted = '1';
        try {
            await ensureLoaded(key);
            const def = OD.modules[key];
            if (!def?.mount) throw new Error(`module '${key}' chargé mais sans mount()`);
            const props = el.dataset.odProps ? JSON.parse(el.dataset.odProps) : {};
            await def.mount(el, { el, supabase: sb, tenant, user: OD.getUser(), fn: OD.fn, props });
            console.log('[loader] ✅ monté :', key);
        } catch (e) {
            delete el.dataset.odMounted;
            console.error('[loader] montage KO :', key, e);
        }
    }
    OD.mountAll = () => document
        .querySelectorAll('[data-od-module]:not([data-od-mounted])')
        .forEach(mountAnchor);

    // Modules PERSISTANTS (header partagé, présents sur toutes les pages) : on ne
    // les re-monte JAMAIS en navigation (sinon on ré-init la téléphonie, etc.).
    // Tout le reste est "page-level" : re-monté à chaque navigation SPA.
    OD.persistent = OD.persistent || new Set([
        'topnav', 'voip-init', 'voip-ui', 'sms', 'whatsapp', 'email',
        // Rendu DANS la top nav (elle-même persistante) : son ancre ne bouge
        // jamais. Sans ça, chaque navigation le re-montait pour rien — une
        // requête sur client_view_history à chaque fois.
        'client-history',
        // Ex-blocs on-app-load devenus modules : ils portent un état global
        // (bus de site, badges, abonnements) -> montés UNE fois pour toute la
        // session, jamais re-montés en navigation.
        'site-bus', 'delco-badge', 'notif-badge',
    ]);

    // À CHAQUE navigation SPA : WeWeb réutilise les nœuds d'ancre avec leur drapeau
    // data-od-mounted et un contenu figé. On efface le drapeau des ancres NON
    // persistantes et on les re-monte → contenu toujours frais, quelle que soit la
    // page. AUCUNE modif des modules déjà déployés n'est nécessaire.
    OD.remountPage = () => {
        document.querySelectorAll('[data-od-module][data-od-mounted]').forEach(el => {
            if (!OD.persistent.has(el.dataset.odModule)) delete el.dataset.odMounted;
        });
        OD.mountAll();
    };

    // ===================== 5 — PORTE : charger l'utilisateur AVANT de monter =
    // Pré-check RAPIDE : la session (si elle existe) a déjà été reportée via
    // setSession ci-dessus, donc un getUser() immédiat tranche sans attente.
    // Pas de session (ex. page d'auth au 1er chargement) → on n'attend PAS, on
    // monte tout de suite pour afficher le login sans loader interminable.
    let hasSession = false;
    try { const r = await sb.auth.getUser(); hasSession = !!(r && r.data && r.data.user); } catch (e) {}

    let user = null;
    if (hasSession) {
        try { user = await FW.oropraLoadUser(); } catch (e) { console.warn('[bootstrap] user load KO', e); }
        if (user) console.log('[bootstrap] ✅ session + user', user.ID_User);
        else       console.log('[bootstrap] session présente mais user introuvable');
    } else {
        console.log('[bootstrap] pas de session → page login (montage immédiat)');
    }

    // ===================== 6 — Montage + navigation SPA =====================
    OD.mountAll();

    // (a) Nouvelles ancres qui apparaissent (débounce léger).
    let t;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(OD.mountAll, 50); })
        .observe(document.body, { childList: true, subtree: true });

    // (b) Navigation SPA → re-montage des ancres de page. On ne réagit QUE si le
    //     CHEMIN change réellement : WeWeb appelle replaceState très souvent
    //     (query params, scroll…) et re-monter à chaque appel bouclerait à l'infini.
    let _navT;
    let _lastPath = location.pathname;
    const onNav = () => {
        clearTimeout(_navT);
        _navT = setTimeout(() => {
            if (location.pathname === _lastPath) return;   // même page → rien à faire
            _lastPath = location.pathname;
            try { OD.remountPage(); } catch (e) {}
        }, 80);
    };
    try {
        const _ps = history.pushState, _rs = history.replaceState;
        history.pushState = function () { const r = _ps.apply(this, arguments); onNav(); return r; };
        history.replaceState = function () { const r = _rs.apply(this, arguments); onNav(); return r; };
    } catch (e) {}
    try { window.addEventListener('popstate', onNav); } catch (e) {}
    setInterval(onNav, 300);   // filet : WeWeb ne déclenche pas toujours popstate

    console.log('[loader] ✅ prêt');
    hideLoader();
})();
