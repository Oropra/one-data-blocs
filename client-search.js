// ============================================================================
//  RECHERCHE CLIENT — module One Data (OD.define)  v1 (checklist)
//  Rendu dans __anchor ; client via ctx.supabase (edge sirene via
//  functions.invoke -> tenant) ; self-boot retiré ; user via socle oropraUser.
//  UUID de navigation/variables/workflow WeWeb conservés (app partagée).
// ============================================================================
OD.define('client-search', {
  mount(__anchor, ctx) {
    __anchor.id = 'oropra-client-search';

  const LOOKUP_VAR_ID = 'cced74ab-5a0a-418d-9479-2366e05a8754';
  const NPAI_VAR_ID = '7e24f595-e1fd-4257-99f4-76f179032788';
  const SELECTED_CLIENT_VAR_ID = '55490583-c88b-4748-916e-4d203db07742';
  const FICHE_CLIENT_PAGE_ID = '259f1951-a2d4-4b90-ac83-0b3febe1d4ec';
  const FICHE_CLIENT_WORKFLOW_ID = 'ec8bcc55-a733-4982-a946-13e10ba3b09b';
  // 🔵 Navigation alignée sur la nav : PROD = chemin d'URL, ÉDITEUR = UID.
  const LANG_PREFIX = '/fr';
  const FICHE_CLIENT_PATH = '/fiche-client';
  // Onglet actif de la fiche (variable globale Number liée au champ "Active tab index" du Tabs).
  const FICHE_TAB_VAR = 'fb2cad2c-cd04-42e0-8909-e3c91c8dcfac';
  const FICHE_TAB_DEFAULT = 0;
  const PAGE_SIZE = 10;
  const GEOPF_ENDPOINT = 'https://data.geopf.fr/geocodage/search';
  const EDGE_FN_SIRENE_SEARCH = 'sirene-search';
  const EDGE_FN_SIRENE_UPSERT = 'sirene-upsert';
  // 🔵 Retour vers l'import BDC VN
  const BDCVN_CTX_VAR = '76d470a8-bc86-490b-be55-c1c6b95d5ddf';
  const BDCVN_IMPORT_PATH = '/bdc-vn';
  const BDCVN_IMPORT_PAGE_ID = '5ecc8832-d99b-47c7-a853-0921624d80ef';

  const doc = __anchor.ownerDocument || document;
  function getRoot() { return __anchor; }
  // Détecte l'éditeur WeWeb : l'app y tourne dans une iframe de preview (window != top).
  function inEditor() { try { return window.self !== window.top; } catch (e) { return true; } }

  // self-boot retiré (le loader monte le module)

  const userConnected = (((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser || {});
  const viewerId = userConnected.ID_User;

  function readVar(id) { try { return wwLib.wwVariable.getValue(id); } catch (e) { return null; } }
  const lookup = Array.isArray(readVar(LOOKUP_VAR_ID)) ? readVar(LOOKUP_VAR_ID) : [];
  const civilitesP = lookup.filter(x => x.multivu === 0);
  const typesS = lookup.filter(x => x.multivu === 1);
  const npaiOptionsRaw = readVar(NPAI_VAR_ID);
  const npaiOptions = Array.isArray(npaiOptionsRaw) && npaiOptionsRaw.length ? npaiOptionsRaw : ['Aucun', 'NPAI', 'Décédé'];

  const emptyP = () => ({ NOM: '', PRENOM: '', EMAIL: '', IDVu: '', tel: '', ville: '', cp: '', birthMin: '', birthMax: '', CSP: '', marque: '' });
  const emptyS = () => ({ SIRET: '', NOM: '', EMAIL: '', IDVu: '' });

  const state = window.__crs || {};
  if (state.activeTab === undefined) state.activeTab = 'particulier';
  if (state.showMore === undefined) state.showMore = false;
  if (state.filters === undefined) state.filters = { particulier: emptyP(), societe: emptyS() };
  if (state.page === undefined) state.page = 1;
  if (state.results === undefined) state.results = [];
  if (state.totalCount === undefined) state.totalCount = 0;
  if (state.loading === undefined) state.loading = false;
  if (state.searched === undefined) state.searched = false;
  if (state.error === undefined) state.error = null;
  if (state.modal === undefined) state.modal = null;
  window.__crs = state;
  (function bdcvnSeed() {
    const c = bdcvnCtx();
    if (!c || !c.importId || c.__seeded) return;
    const p = c.prefill || {};
    if (p.type === 'particulier') {
      state.activeTab = 'particulier';
      const f = state.filters.particulier;
      if (p.nom) f.NOM = p.nom;
      if (p.prenom) f.PRENOM = p.prenom;
      if (p.ville) f.ville = p.ville;
      if (p.code_postal) f.cp = p.code_postal;
    } else {
      state.activeTab = 'societe';
      const f = state.filters.societe;
      if (p.raison_sociale) f.NOM = p.raison_sociale;
      if (p.siret) f.SIRET = p.siret;
    }
    _writeVar(BDCVN_CTX_VAR, Object.assign({}, c, { __seeded: true }));
  })();

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function cleanDigits(s) { return s == null ? '' : String(s).replace(/\D/g, ''); }
  function cleanEmail(s) { return s == null ? '' : String(s).trim().toLowerCase(); }
  function isValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim()); }
  function isValidMobile(s) { const d = cleanDigits(s); return /^(0[67]\d{8}|33[67]\d{8})$/.test(d); }
  function isValidFixe(s) { const d = cleanDigits(s); return /^(0[1-589]\d{8}|33[1-589]\d{8})$/.test(d); }
  function clientFullName(c) {
    if (!c) return '';
    const isSoc = c.idmultivu === 1 || c.idmultivu === '1';
    return isSoc ? [c.CIVILITE, c.NOM].filter(Boolean).join(' ') : [c.CIVILITE, c.NOM, c.PRENOM].filter(Boolean).join(' ');
  }


  // Publie le client sélectionné pour fiche-shell. La variable WeWeb historique a
  // été supprimée du projet -> on passe par un global + sessionStorage (survit à
  // la navigation SPA et à un rechargement). L'écriture de la variable reste
  // tentée pour compatibilité si elle réapparaît.
  function odSetSelectedClient(obj) {
    try { const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window; w.__odSelectedClient = obj; } catch (e) {}
    try { sessionStorage.setItem('od_selected_client', JSON.stringify(obj)); } catch (e) {}
    try { wwLib.wwVariable.updateValue('55490583-c88b-4748-916e-4d203db07742', obj); } catch (e) {}
  }

  function _writeVar(varId, value) {
    try { wwLib.wwVariable.updateValue(varId, value); return; }
    catch (e) { console.warn('[crs]', varId, 'failed:', e && e.message); }
    try {
      const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window;
      if (w.variables && Object.prototype.hasOwnProperty.call(w.variables, varId + '-value')) {
        w.variables[varId + '-value'] = value;
      }
    } catch (e) { }
  }

  // 🔵 Navigation vers la fiche client, alignée sur la nav (corrige la page blanche en prod) :
  //  - on pose d'abord l'onglet "Fiche client" (index 0) en UNE écriture (sans réessai) ;
  //  - ÉDITEUR : navigation par UID (vrai SPA interne, aucune imbrication) ;
  //  - PROD : navigation par CHEMIN /fr/fiche-client (un UID en prod = route inexistante = page blanche).
  function navigateToFiche() {
    // FICHE_TAB_VAR retiré : le Shell (fiche-shell) gère ses onglets en interne, ne lit plus cette variable
    if (inEditor()) {
      try { wwLib.wwApp.goTo(FICHE_CLIENT_PAGE_ID); return; } catch (e) { }
      try { wwLib.goTo(FICHE_CLIENT_PAGE_ID); return; } catch (e) { }
      return;
    }
    const href = LANG_PREFIX + FICHE_CLIENT_PATH;
    try { wwLib.goTo(href); return; } catch (e) { }
    try { const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window; w.location.href = href; } catch (e) { }
  }
  function bdcvnCtx() { try { return wwLib.wwVariable.getValue(BDCVN_CTX_VAR) || null; } catch (e) { return null; } }
  function bdcvnActive() { const c = bdcvnCtx(); return !!(c && c.importId); }
  function bdcvnReturn(idvu) {
    const c = bdcvnCtx() || {};
    _writeVar(BDCVN_CTX_VAR, Object.assign({}, c, { pickedIdvu: String(idvu) }));
    if (inEditor()) {
      try { wwLib.wwApp.goTo(BDCVN_IMPORT_PAGE_ID); return; } catch (e) { }
      try { wwLib.goTo(BDCVN_IMPORT_PAGE_ID); return; } catch (e) { }
      return;
    }
    const href = LANG_PREFIX + BDCVN_IMPORT_PATH;
    try { wwLib.goTo(href); return; } catch (e) { }
    try { const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window; w.location.href = href; } catch (e) { }
  }


  // 🔵 Déclenche le workflow "fiche client" (fetch + re-subscribe realtime) pour le client passé
  function triggerFicheClient(idvu) {
    // Workflow global 'fiche client' (ec8bcc55) DÉSACTIVÉ : reliquat de l'ancienne
    // architecture (fetch client + re-subscribe realtime). Ces rôles sont désormais
    // assurés par les modules (cf-fiche lit le client sélectionné ; contacts/historique
    // gèrent leur propre realtime). Ce workflow insérait dans wa_contacts -> 409.
    // L'appel est coupé ; la fonction reste (no-op) pour ne pas casser les appelants.
    // try { wwLib.wwWorkflow.executeGlobal(FICHE_CLIENT_WORKFLOW_ID, { IDVu: idvu }); }
    // catch (e) { console.warn('[crs] executeGlobal fiche client KO', e && e.message); }
  }

  function buildQuery(supabase) {
    const tab = state.activeTab;
    const f = state.filters[tab];
    let q = supabase.from('CLIENT').select('*', { count: 'exact' });
    q = q.eq('idmultivu', tab === 'societe' ? 1 : 0);
    if (tab === 'particulier') {
      if (f.NOM) q = q.ilike('NOM', `%${f.NOM}%`);
      if (f.PRENOM) q = q.ilike('PRENOM', `%${f.PRENOM}%`);
      if (f.EMAIL) q = q.ilike('EMAIL', `%${f.EMAIL}%`);
      if (f.IDVu) q = q.eq('IDVu', Number(f.IDVu));
      if (f.tel) q = q.or(`TEl_MOB.ilike.%${f.tel}%,TEL_FIXE.ilike.%${f.tel}%`);
      if (f.ville) q = q.ilike('ville', `%${f.ville}%`);
      if (f.cp) q = q.ilike('code_postal', `${f.cp}%`);
      if (f.birthMin) q = q.gte('BIRTHDAY', f.birthMin);
      if (f.birthMax) q = q.lte('BIRTHDAY', f.birthMax);
      if (f.CSP) q = q.ilike('CSP', `%${f.CSP}%`);
      if (f.marque) q = q.ilike('MARQUE_CLIENT_VEHICULE', `%${f.marque}%`);
    } else {
      if (f.SIRET) { const c = cleanDigits(f.SIRET); if (c) q = q.eq('SIRET', c); }
      if (f.NOM) q = q.ilike('NOM', `%${f.NOM}%`);
      if (f.EMAIL) q = q.ilike('EMAIL', `%${f.EMAIL}%`);
      if (f.IDVu) q = q.eq('IDVu', Number(f.IDVu));
    }
    const start = (state.page - 1) * PAGE_SIZE;
    q = q.order('NOM', { ascending: true, nullsFirst: false }).range(start, start + PAGE_SIZE - 1);
    return q;
  }

  async function runSearch() {
    state.loading = true;
    state.searched = true;
    render();
    try {
      const supabase = ctx.supabase;
      const { data, error, count } = await buildQuery(supabase);
      if (error) throw error;
      state.results = data || [];
      state.totalCount = count || 0;
      state.error = null;
    } catch (e) {
      console.error('[crs]', e);
      state.error = e.message || String(e);
      state.results = [];
      state.totalCount = 0;
    } finally {
      state.loading = false;
      render();
    }
  }

  function clearFilters() {
    state.filters[state.activeTab] = state.activeTab === 'particulier' ? emptyP() : emptyS();
    state.page = 1;
    state.results = [];
    state.totalCount = 0;
    state.searched = false;
    state.error = null;
    render();
  }

  function changeTab(tab) {
    if (state.activeTab === tab) return;
    state.activeTab = tab;
    state.page = 1;
    state.results = [];
    state.totalCount = 0;
    state.searched = false;
    state.error = null;
    state.showMore = false;
    render();
  }

  function selectRow(row) {
    if (bdcvnActive()) { bdcvnReturn(row.IDVu); return; }   // 🔵 retour import BDC
    odSetSelectedClient(Object.assign({}, row, { full_count: state.totalCount }));
    triggerFicheClient(row.IDVu);
    navigateToFiche();
  }

  function changePage(p) {
    const total = Math.max(1, Math.ceil(state.totalCount / PAGE_SIZE));
    if (p < 1 || p > total || p === state.page) return;
    state.page = p;
    runSearch();
  }

  function buildPagerItems(current, total) {
    if (total <= 1) return [];
    if (total <= 7) { const a = []; for (let i = 1; i <= total; i++) a.push({ page: i }); return a; }
    const set = new Set([1, total, current]);
    if (current > 1) set.add(current - 1);
    if (current < total) set.add(current + 1);
    const arr = Array.from(set).sort((a, b) => a - b);
    const out = []; let prev = 0;
    for (const p of arr) { if (p > prev + 1) out.push({ ellipsis: true }); out.push({ page: p }); prev = p; }
    return out;
  }

  function openCreateModal() {
    const f = state.filters[state.activeTab];
    const isSoc = state.activeTab === 'societe';
    state.modal = {
      isSoc, saving: false, error: null, duplicate: null,
      addressQuery: '', addressSuggestions: [], addressLoading: false,
      siretQuery: isSoc && f.SIRET ? cleanDigits(f.SIRET) : '',
      siretSuggestions: [], siretLoading: false,
      data: {
        CIVILITE: '', NOM: f.NOM || '', PRENOM: !isSoc ? (f.PRENOM || '') : '',
        BIRTHDAY: '', EMAIL: f.EMAIL || '', TEl_MOB: !isSoc ? (f.tel || '') : '', TEL_FIXE: '',
        ADRESSE: '', code_postal: !isSoc ? (f.cp || '') : '', ville: !isSoc ? (f.ville || '') : '',
        code_insee: '', lat: null, lon: null, adresse_label: '', adresse_source: 'manual',
        adresse_status: null, adresse_score: null, adresse_ban: null,
        STOP_COM: false, NPAI: 'Aucun', CSP: '', PROFESSION: '', LOISIR: '',
        MARQUE_CLIENT_VEHICULE: '', MODELE_CLIENT_VEHICULE: '', ANNEE_CLIENT_VEHICULE: '',
        KM_CLIENT_VEHICULE: '', KM_MOY: '', COMMENTAIRE: '',
        SIRET: isSoc && f.SIRET ? cleanDigits(f.SIRET) : '',
        idmultivu: isSoc ? 1 : 0
      }
    };
    render();
  }

  function closeModal() { state.modal = null; render(); }
  function updateModalField(field, value) { if (state.modal) state.modal.data[field] = value; }

  function validateModal() {
    if (!state.modal) return null;
    const d = state.modal.data;
    const isSoc = state.modal.isSoc;
    const errors = [];
    if (isSoc) {
      if (!cleanDigits(d.SIRET) || cleanDigits(d.SIRET).length !== 14) errors.push('Le SIRET doit comporter 14 chiffres.');
      if (!d.NOM || !String(d.NOM).trim()) errors.push('La raison sociale est obligatoire.');
    } else {
      if (!d.CIVILITE) errors.push('La civilité est obligatoire.');
      if (!d.NOM || !String(d.NOM).trim()) errors.push('Le nom est obligatoire.');
      if (!d.PRENOM || !String(d.PRENOM).trim()) errors.push('Le prénom est obligatoire.');
      if (!d.TEl_MOB) errors.push('Le téléphone portable est obligatoire.');
      else if (!isValidMobile(d.TEl_MOB)) errors.push('Le téléphone portable n\'est pas valide (06/07 + 8 chiffres).');
      if (!d.EMAIL) errors.push('L\'email est obligatoire.');
      else if (!isValidEmail(d.EMAIL)) errors.push('L\'email n\'est pas valide.');
    }
    if (d.TEL_FIXE && !isValidFixe(d.TEL_FIXE)) errors.push('Le téléphone fixe n\'est pas valide.');
    if (isSoc && d.TEl_MOB && !isValidMobile(d.TEl_MOB)) errors.push('Le téléphone portable n\'est pas valide.');
    if (isSoc && d.EMAIL && !isValidEmail(d.EMAIL)) errors.push('L\'email n\'est pas valide.');
    return errors.length ? errors : null;
  }

  async function checkDuplicates() {
    if (!state.modal) return null;
    const d = state.modal.data;
    const supabase = ctx.supabase;
    const selectCols = 'IDVu, CIVILITE, NOM, PRENOM, EMAIL, TEl_MOB, idmultivu, code_postal, ville';
    const cleanMob = cleanDigits(d.TEl_MOB);
    if (cleanMob) {
      const { data: dup } = await supabase.from('CLIENT').select(selectCols).eq('TEl_MOB', cleanMob).limit(1).maybeSingle();
      if (dup) return { field: 'TEl_MOB', label: 'Ce numéro de portable', client: dup };
    }
    const e = cleanEmail(d.EMAIL);
    if (e) {
      const { data: dup } = await supabase.from('CLIENT').select(selectCols).ilike('EMAIL', e).limit(1).maybeSingle();
      if (dup) return { field: 'EMAIL', label: 'Cette adresse email', client: dup };
    }
    return null;
  }

  function dismissDuplicate() { if (state.modal) state.modal.duplicate = null; render(); }
  function viewDuplicate() {
    if (!state.modal || !state.modal.duplicate) return;
    selectRow(state.modal.duplicate.client);
    state.modal = null;
    render();
  }

  async function saveCreation() {
    if (!state.modal) return;
    const errs = validateModal();
    if (errs) { state.modal.error = errs.join(' '); state.modal.duplicate = null; render(); return; }
    state.modal.saving = true;
    state.modal.error = null;
    state.modal.duplicate = null;
    render();
    try {
      const dup = await checkDuplicates();
      if (dup) { state.modal.duplicate = dup; state.modal.saving = false; render(); return; }
      const supabase = ctx.supabase;
      const now = new Date().toISOString();
      const { data: maxRow } = await supabase.from('CLIENT').select('IDVu').order('IDVu', { ascending: false }).limit(1).maybeSingle();
      const nextIDVu = (maxRow && maxRow.IDVu != null ? Number(maxRow.IDVu) : 0) + 1;
      const isSoc = state.modal.isSoc;
      const payload = Object.assign({}, state.modal.data, {
        IDVu: nextIDVu, CreationDate: now, UpdateDate: now,
        ID_VENDEUR_CREATION: viewerId != null ? String(viewerId) : null,
        ID_VENDEUR_UPDATE: viewerId != null ? String(viewerId) : null,
        adresse_checked_at: state.modal.data.adresse_status === 'verified' ? now : null,
        CP_VILLE: [state.modal.data.code_postal, state.modal.data.ville].filter(Boolean).join(' ')
      });
      if (payload.TEl_MOB) payload.TEl_MOB = cleanDigits(payload.TEl_MOB);
      if (payload.TEL_FIXE) payload.TEL_FIXE = cleanDigits(payload.TEL_FIXE);
      if (payload.EMAIL) payload.EMAIL = cleanEmail(payload.EMAIL);
      ['ANNEE_CLIENT_VEHICULE', 'KM_CLIENT_VEHICULE', 'KM_MOY', 'SIRET', 'adresse_score'].forEach(k => {
        if (payload[k] === '' || payload[k] == null) payload[k] = null;
        else if (k === 'adresse_score') payload[k] = Number(payload[k]);
        else payload[k] = Number(cleanDigits(payload[k])) || null;
      });
      if (payload.BIRTHDAY === '') payload.BIRTHDAY = null;
      const { data: inserted, error } = await supabase.from('CLIENT').insert(payload).select('*').single();
      if (error) throw error;
      if (isSoc && payload.SIRET) {
        try {
          await supabase.functions.invoke(EDGE_FN_SIRENE_UPSERT, {
            body: { siret: String(payload.SIRET), idvu: String(nextIDVu), setPrimary: true }
          });
        } catch (eLink) { console.warn('[crs] sirene-upsert failed (non bloquant):', eLink && eLink.message); }
      }
      // 🔵 Créé depuis l'import BDC : on renvoie le nouveau client, pas de fiche.
      if (bdcvnActive()) { state.modal = null; bdcvnReturn(inserted.IDVu); return; }
      odSetSelectedClient(Object.assign({}, inserted, { full_count: state.totalCount + 1 }));
      triggerFicheClient(inserted.IDVu);          // 🔵 fetch + re-subscribe realtime
      state.modal = null;
      if (FICHE_CLIENT_PAGE_ID) navigateToFiche();
      else await runSearch();
    } catch (e) {
      console.error('[crs] save', e);
      state.modal.saving = false;
      state.modal.error = e.message || String(e);
      render();
    }
  }

  async function inseeSearchAddress(query) {
    const url = `${GEOPF_ENDPOINT}?q=${encodeURIComponent(query)}&limit=8`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('Geocoding failed: ' + r.status);
    const json = await r.json();
    return (json?.features || [])
      .map(f => ({ label: f?.properties?.label || '', value: f?.properties?.id || f?.properties?.banId || '', raw: f }))
      .filter(o => o.label && o.value);
  }

  let addressDebounce = null;
  function onAddressInput(query) {
    if (!state.modal) return;
    state.modal.addressQuery = query;
    state.modal.data.ADRESSE = query;
    state.modal.data.adresse_source = 'manual';
    state.modal.data.adresse_status = null;
    if (!query || query.length < 4) { state.modal.addressSuggestions = []; render(); return; }
    if (addressDebounce) clearTimeout(addressDebounce);
    addressDebounce = setTimeout(async () => {
      state.modal.addressLoading = true;
      render();
      try { state.modal.addressSuggestions = await inseeSearchAddress(query); }
      catch (e) { console.error('[crs] address', e); state.modal.addressSuggestions = []; }
      finally { state.modal.addressLoading = false; render(); }
    }, 350);
  }

  function applyAddressSuggestion(s) {
    if (!state.modal) return;
    const p = (s.raw && s.raw.properties) || {};
    const c = (s.raw && s.raw.geometry && s.raw.geometry.coordinates) || [];
    Object.assign(state.modal.data, {
      ADRESSE: p.name || p.label || '',
      code_postal: p.postcode || '',
      ville: p.city || '',
      code_insee: p.citycode || '',
      lat: c[1] != null ? Number(c[1]) : null,
      lon: c[0] != null ? Number(c[0]) : null,
      adresse_label: p.label || '',
      adresse_source: 'ban',
      adresse_status: 'verified',
      adresse_score: p.score != null ? Number(p.score) : null,
      adresse_ban: s.raw || null
    });
    state.modal.addressSuggestions = [];
    state.modal.addressQuery = p.label || '';
    render();
  }

  async function inseeSearchSiret(query) {
    const supabase = ctx.supabase;
    const qs = new URLSearchParams({ query, limit: '8', activeOnly: 'false' }).toString();
    const { data, error } = await supabase.functions.invoke(`${EDGE_FN_SIRENE_SEARCH}?${qs}`, { method: 'GET' });
    if (error) throw error;
    return (data && data.items) || [];
  }

  let siretDebounce = null;
  function onSiretInput(query) {
    if (!state.modal) return;
    state.modal.siretQuery = query;
    const onlyDigits = cleanDigits(query);
    if (onlyDigits === query.replace(/\s/g, '')) state.modal.data.SIRET = onlyDigits;
    if (!query || query.length < 2) { state.modal.siretSuggestions = []; render(); return; }
    if (siretDebounce) clearTimeout(siretDebounce);
    siretDebounce = setTimeout(async () => {
      state.modal.siretLoading = true;
      render();
      try { state.modal.siretSuggestions = await inseeSearchSiret(query); }
      catch (e) { console.error('[crs] siret', e); state.modal.siretSuggestions = []; state.modal.error = e.message || String(e); }
      finally { state.modal.siretLoading = false; render(); }
    }, 400);
  }

  function applySiretSuggestion(item) {
    if (!state.modal) return;
    const t = typesS.find(x => String(x.code) === String(item.categorie_juridique_code));
    Object.assign(state.modal.data, {
      SIRET: cleanDigits(item.siret),
      NOM: item.raison_sociale || state.modal.data.NOM,
      CIVILITE: t ? t.libelle_court : state.modal.data.CIVILITE,
      ADRESSE: item.adresse_ligne1 || '',
      code_postal: item.code_postal || '',
      ville: item.commune || '',
      adresse_label: item.adresse || '',
      adresse_source: 'sirene',
      adresse_status: 'verified',
      adresse_score: null,
      code_insee: '',
      lat: null,
      lon: null
    });
    state.modal.siretSuggestions = [];
    state.modal.siretQuery = cleanDigits(item.siret);
    state.modal.addressQuery = item.adresse || item.adresse_ligne1 || '';
    render();
  }

  const ICON_P = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
  const ICON_S = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21V12h6v9"/></svg>';
  const ICON_MOB = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/></svg>';
  const ICON_FIXE = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
  const ICON_PLUS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
  const ICON_MINUS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
  const ICON_REFRESH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
  const ICON_SEARCH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  const ICON_CLOSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  const ICON_WARN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17"/></svg>';

  const STYLE = `<style>
#oropra-client-search{font-family:"Nunito Sans",system-ui,sans-serif;color:#2a5ea9}
#oropra-client-search *{box-sizing:border-box}
#oropra-client-search .crs-tabs{display:flex;gap:0;border-bottom:1px solid #e3edf9;margin-bottom:24px}
#oropra-client-search .crs-tab{display:inline-flex;align-items:center;gap:8px;padding:12px 18px;cursor:pointer;color:#acc5e4;font-size:14px;font-weight:500;border-bottom:2px solid transparent;margin-bottom:-1px;background:none;border-left:none;border-right:none;border-top:none;font-family:inherit}
#oropra-client-search .crs-tab.is-active{color:#53bda7;border-bottom-color:#53bda7}
#oropra-client-search .crs-tab:hover:not(.is-active){color:#7fb5d8}
#oropra-client-search .crs-form{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px 16px;margin-bottom:16px}
#oropra-client-search .crs-field{display:flex;flex-direction:column}
#oropra-client-search .crs-label{font-size:11px;color:#7a98c5;margin-bottom:4px;text-transform:uppercase;letter-spacing:.4px;font-weight:500}
#oropra-client-search .crs-required{color:#c63a3a;margin-left:2px}
#oropra-client-search .crs-input{border:1px solid #d9e3f2;border-radius:6px;padding:11px 13px;font-size:13px;color:#2a5ea9;outline:none;background:#fff;font-family:inherit;width:100%}
#oropra-client-search .crs-input:focus{border-color:#2a5ea9}
#oropra-client-search .crs-input::placeholder{color:#7a98c5}
#oropra-client-search textarea.crs-input{resize:vertical;min-height:64px;font-family:inherit}
#oropra-client-search select.crs-input{cursor:pointer;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237a98c5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");background-repeat:no-repeat;background-position:right 10px center;background-size:14px;appearance:none;padding-right:32px}
#oropra-client-search .crs-toolbar{display:flex;align-items:center;justify-content:space-between;margin:18px 0;gap:12px}
#oropra-client-search .crs-toolbar-section{display:flex;align-items:center;flex:1}
#oropra-client-search .crs-toolbar-section.center{justify-content:center}
#oropra-client-search .crs-toolbar-section.right{justify-content:flex-end}
#oropra-client-search .crs-more-toggle{display:inline-flex;align-items:center;gap:6px;color:#2a5ea9;font-size:13px;cursor:pointer;padding:6px 0;background:none;border:none;font-family:inherit}
#oropra-client-search .crs-more-toggle:hover{color:#0c447c}
#oropra-client-search .crs-pager{display:inline-flex;align-items:center;gap:2px}
#oropra-client-search .crs-pager-item{padding:6px 11px;cursor:pointer;color:#2a5ea9;font-size:13px;border-radius:4px;background:none;border:none;font-family:inherit;min-width:30px}
#oropra-client-search .crs-pager-item.is-active{background:#f2f6fc;font-weight:600}
#oropra-client-search .crs-pager-item:not(.is-active):not(:disabled):hover{background:#eef4fc}
#oropra-client-search .crs-pager-item:disabled{color:#cad6e5;cursor:not-allowed}
#oropra-client-search .crs-pager-ellipsis{padding:6px 4px;color:#acc5e4}
#oropra-client-search .crs-btns{display:flex;gap:8px}
#oropra-client-search .crs-btn{padding:9px 18px;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;border:1px solid transparent;outline:none;font-family:inherit;display:inline-flex;align-items:center;gap:6px;text-transform:uppercase;letter-spacing:.3px}
#oropra-client-search .crs-btn-primary{background:#53bda7;color:#fff;border-color:#53bda7}
#oropra-client-search .crs-btn-primary:hover{background:#45a791;border-color:#45a791}
#oropra-client-search .crs-btn-primary:disabled{background:#a9d9cd;border-color:#a9d9cd;cursor:not-allowed}
#oropra-client-search .crs-btn-ghost{background:transparent;color:#2a5ea9;border-color:#2a5ea9}
#oropra-client-search .crs-btn-ghost:hover{background:#f2f6fc}
#oropra-client-search .crs-table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
#oropra-client-search .crs-table thead th{background:#f2f6fc;padding:11px 16px;text-align:left;color:#2a5ea9;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.3px}
#oropra-client-search .crs-table tbody tr{border-bottom:1px solid #f0f4fa;cursor:pointer;transition:background-color .1s}
#oropra-client-search .crs-table tbody tr:hover{background:#f7fafd}
#oropra-client-search .crs-table td{padding:14px 16px;color:#2a5ea9;vertical-align:middle}
#oropra-client-search .crs-cell-tel{font-size:12px;line-height:1.5}
#oropra-client-search .crs-cell-tel .crs-tel-row{display:flex;align-items:center;gap:5px}
#oropra-client-search .crs-cell-tel .crs-tel-row + .crs-tel-row{margin-top:3px}
#oropra-client-search .crs-cell-action{width:50px;text-align:right}
#oropra-client-search .crs-action-btn{background:#eef9f5;color:#53bda7;border:none;width:30px;height:30px;border-radius:50%;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;pointer-events:none}
#oropra-client-search .crs-empty{padding:48px 16px;text-align:center;color:#8aa3c3;font-size:13px}
#oropra-client-search .crs-loading{padding:24px;text-align:center;color:#8aa3c3;font-size:13px}
#oropra-client-search .crs-modal-overlay{position:fixed;inset:0;background:rgba(42,94,169,.35);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto}
#oropra-client-search .crs-modal{background:#fff;border-radius:12px;width:100%;max-width:760px;box-shadow:0 20px 60px rgba(0,0,0,.18);display:flex;flex-direction:column;max-height:calc(100vh - 80px)}
#oropra-client-search .crs-modal-header{padding:18px 24px;border-bottom:1px solid #f0f4fa;display:flex;align-items:center;justify-content:space-between}
#oropra-client-search .crs-modal-title{font-size:18px;font-weight:600;color:#2a5ea9;margin:0}
#oropra-client-search .crs-modal-close{background:none;border:none;cursor:pointer;color:#8aa3c3;padding:4px;display:flex;align-items:center}
#oropra-client-search .crs-modal-close:hover{color:#2a5ea9}
#oropra-client-search .crs-modal-body{padding:20px 24px;overflow-y:auto;flex:1}
#oropra-client-search .crs-modal-section{margin-bottom:22px}
#oropra-client-search .crs-modal-section-title{font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#7a98c5;margin:0 0 10px;font-weight:600}
#oropra-client-search .crs-modal-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px 14px}
#oropra-client-search .crs-modal-grid .full{grid-column:1 / -1}
#oropra-client-search .crs-modal-grid .two{grid-column:span 2}
#oropra-client-search .crs-modal-footer{padding:16px 24px;border-top:1px solid #f0f4fa;display:flex;justify-content:flex-end;gap:8px}
#oropra-client-search .crs-modal-error{color:#c63a3a;font-size:13px;padding:11px 14px;background:#fdf0f0;border-radius:6px;margin-bottom:16px;border:1px solid #f5d0d0}
#oropra-client-search .crs-modal-duplicate{background:#fff7e6;border:1px solid #f5c785;border-radius:8px;padding:16px;margin-bottom:18px;display:flex;flex-direction:column;gap:12px}
#oropra-client-search .crs-modal-duplicate-head{display:flex;gap:10px;align-items:flex-start;color:#a85c0e}
#oropra-client-search .crs-modal-duplicate-title{font-size:13px;font-weight:600;margin-bottom:6px}
#oropra-client-search .crs-modal-duplicate-client{color:#2a5ea9;font-size:13px;line-height:1.5}
#oropra-client-search .crs-modal-duplicate-client strong{display:block;margin-bottom:2px}
#oropra-client-search .crs-modal-duplicate-actions{display:flex;gap:8px;justify-content:flex-end}
#oropra-client-search .crs-checkbox{display:flex;align-items:center;gap:8px;font-size:13px;color:#2a5ea9;cursor:pointer;padding:11px 0}
#oropra-client-search .crs-checkbox.is-stop-com{color:#2a5ea9}
#oropra-client-search .crs-checkbox.is-stop-com input{accent-color:#2a5ea9}
#oropra-client-search .crs-checkbox.is-stop-com.is-checked,
#oropra-client-search .crs-checkbox.is-stop-com:has(input:checked){color:#c63a3a}
#oropra-client-search .crs-checkbox.is-stop-com.is-checked input,
#oropra-client-search .crs-checkbox.is-stop-com:has(input:checked) input{accent-color:#c63a3a}
#oropra-client-search .crs-autocomplete-wrap{position:relative}
#oropra-client-search .crs-suggestions{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1px solid #d9e3f2;border-radius:6px;box-shadow:0 6px 20px rgba(42,94,169,.12);z-index:10;max-height:280px;overflow-y:auto}
#oropra-client-search .crs-suggestion{padding:10px 12px;cursor:pointer;font-size:13px;color:#2a5ea9;border-bottom:1px solid #f0f4fa}
#oropra-client-search .crs-suggestion:last-child{border-bottom:none}
#oropra-client-search .crs-suggestion:hover{background:#f2f6fc}
#oropra-client-search .crs-suggestion.is-inactive{font-style:italic;color:#c4d2e7}
#oropra-client-search .crs-suggestion.is-inactive .crs-suggestion-sub{color:#c4d2e7}
#oropra-client-search .crs-suggestion-sub{font-size:11px;color:#7a98c5;margin-top:2px}
#oropra-client-search .crs-field-status{font-size:11px;color:#53bda7;margin-top:4px;display:inline-flex;align-items:center;gap:4px}
#oropra-client-search .crs-spinner{display:inline-block;width:12px;height:12px;border:2px solid #e3edf9;border-top-color:#53bda7;border-radius:50%;animation:crs-spin .8s linear infinite}
@keyframes crs-spin{to{transform:rotate(360deg)}}
/* ============ RESPONSIVE ============ */
.crs-table-wrap{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
@media (max-width:880px){
  #oropra-client-search .crs-form{grid-template-columns:1fr 1fr}
  #oropra-client-search .crs-form > div:empty{display:none}
  #oropra-client-search .crs-modal-grid{grid-template-columns:1fr 1fr}
}
@media (max-width:560px){
  #oropra-client-search .crs-form{grid-template-columns:1fr}
  #oropra-client-search .crs-modal-grid{grid-template-columns:1fr}
  #oropra-client-search .crs-modal-grid .two{grid-column:auto}
  #oropra-client-search .crs-toolbar{flex-wrap:wrap;gap:10px;margin:14px 0}
  #oropra-client-search .crs-toolbar-section,
  #oropra-client-search .crs-toolbar-section.center,
  #oropra-client-search .crs-toolbar-section.right{flex:1 1 100%;justify-content:center}
  #oropra-client-search .crs-btns{width:100%}
  #oropra-client-search .crs-btn{flex:1;justify-content:center}
  #oropra-client-search .crs-table,
  #oropra-client-search .crs-table tbody,
  #oropra-client-search .crs-table tr,
  #oropra-client-search .crs-table td{display:block;width:100%;min-width:0}
  #oropra-client-search .crs-table thead{display:none}
  #oropra-client-search .crs-table{margin-top:4px}
  #oropra-client-search .crs-table tbody tr{position:relative;background:#fff;border:1px solid #ece9e1;border-radius:10px;padding:14px 16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(42,94,169,.05)}
  #oropra-client-search .crs-table tbody tr:hover{background:#f7fafd}
  #oropra-client-search .crs-table td{padding:5px 0;border:none;font-size:13px;line-height:1.45;word-break:break-word}
  #oropra-client-search .crs-table td:empty{display:none}
  #oropra-client-search .crs-table td:not(.crs-cell-action):not(.crs-c-nom)::before{content:attr(data-label);display:block;color:#7a98c5;font-size:10px;text-transform:uppercase;letter-spacing:.4px;font-weight:600;margin-bottom:1px}
  #oropra-client-search .crs-table td.crs-c-nom{font-size:15px;font-weight:700;color:#2a5ea9;padding:0 38px 8px 0;margin-bottom:6px;border-bottom:1px solid #f0f4fa}
  #oropra-client-search .crs-table td.crs-cell-action{position:absolute;top:12px;right:12px;width:auto;padding:0}
  #oropra-client-search .crs-modal-overlay{padding:14px 8px}
  #oropra-client-search .crs-modal{max-height:calc(100vh - 28px)}
  #oropra-client-search .crs-modal-header,
  #oropra-client-search .crs-modal-body,
  #oropra-client-search .crs-modal-footer{padding-left:16px;padding-right:16px}
  #oropra-client-search .crs-tab{padding:12px 12px;font-size:13px}
}
</style>`;

  function fieldHtml(label, field, type, placeholder) {
    const val = state.filters[state.activeTab][field] || '';
    const isDate = type === 'date';
    return `<div class="crs-field">
    ${isDate ? `<label class="crs-label">${esc(label)}</label>` : ''}
    <input class="crs-input" type="${type || 'text'}" data-crs-field="${esc(field)}" value="${esc(val)}" placeholder="${esc(placeholder || label)}" />
  </div>`;
  }

  function renderTabs() {
    return `<div class="crs-tabs">
    <button class="crs-tab${state.activeTab === 'particulier' ? ' is-active' : ''}" data-crs-action="tab" data-tab="particulier">${ICON_P}<span>Particulier</span></button>
    <button class="crs-tab${state.activeTab === 'societe' ? ' is-active' : ''}" data-crs-action="tab" data-tab="societe">${ICON_S}<span>Société</span></button>
  </div>`;
  }

  function renderForm() {
    const tab = state.activeTab;
    let h = '<div class="crs-form">';
    if (tab === 'particulier') {
      h += fieldHtml('Nom', 'NOM');
      h += fieldHtml('Prénom', 'PRENOM');
      h += fieldHtml('Email', 'EMAIL');
      h += fieldHtml('ID Client', 'IDVu');
      h += '<div></div><div></div>';
      if (state.showMore) {
        h += fieldHtml('Téléphone', 'tel');
        h += fieldHtml('Ville', 'ville');
        h += fieldHtml('Code postal', 'cp');
        h += fieldHtml('Né(e) après le', 'birthMin', 'date');
        h += fieldHtml('Né(e) avant le', 'birthMax', 'date');
        h += fieldHtml('CSP', 'CSP');
        h += fieldHtml('Marque véhicule', 'marque');
      }
    } else {
      h += fieldHtml('SIRET', 'SIRET');
      h += fieldHtml('Raison sociale', 'NOM');
      h += fieldHtml('Email', 'EMAIL');
      h += fieldHtml('ID Client', 'IDVu');
      h += '<div></div><div></div>';
    }
    h += '</div>';
    return h;
  }

  function renderToolbar() {
    const total = Math.max(1, Math.ceil(state.totalCount / PAGE_SIZE));
    let h = '<div class="crs-toolbar">';
    h += '<div class="crs-toolbar-section">';
    if (state.activeTab === 'particulier') {
      h += `<button class="crs-more-toggle" data-crs-action="toggle-more">${state.showMore ? ICON_MINUS : ICON_PLUS}<span>${state.showMore ? 'Moins de critères' : 'Plus de critères'}</span></button>`;
    }
    h += '</div><div class="crs-toolbar-section center">';
    if (state.searched && state.totalCount > 0) {
      h += '<div class="crs-pager">';
      h += `<button class="crs-pager-item" data-crs-action="prev-page"${state.page <= 1 ? ' disabled' : ''}>&lsaquo;</button>`;
      for (const it of buildPagerItems(state.page, total)) {
        if (it.ellipsis) h += '<span class="crs-pager-ellipsis">…</span>';
        else h += `<button class="crs-pager-item${it.page === state.page ? ' is-active' : ''}" data-crs-action="page" data-page="${it.page}">${it.page}</button>`;
      }
      h += `<button class="crs-pager-item" data-crs-action="next-page"${state.page >= total ? ' disabled' : ''}>&rsaquo;</button>`;
      h += '</div>';
    }
    h += '</div><div class="crs-toolbar-section right"><div class="crs-btns">';
    h += `<button class="crs-btn crs-btn-ghost" data-crs-action="cancel">${ICON_REFRESH}<span>Annuler</span></button>`;
    h += `<button class="crs-btn crs-btn-primary" data-crs-action="search">${ICON_SEARCH}<span>Rechercher</span></button>`;
    h += '</div></div></div>';
    return h;
  }

  function renderTable() {
    if (state.loading) return '<div class="crs-loading">Chargement…</div>';
    if (state.error) return `<div class="crs-empty">Erreur : ${esc(state.error)}</div>`;
    if (!state.searched) return '';
    if (!state.results.length) {
      const label = state.activeTab === 'societe' ? 'une société' : 'un particulier';
      return `<div class="crs-empty">
      <div>Aucun résultat. Modifie les critères de recherche.</div>
      <div style="margin-top:14px"><button class="crs-btn crs-btn-primary" data-crs-action="create">${ICON_PLUS}<span>Créer ${label}</span></button></div>
    </div>`;
    }
    const isSoc = state.activeTab === 'societe';
    let h = '<div class="crs-table-wrap"><table class="crs-table"><thead><tr>';
    h += '<th>ID Client</th><th>Nom</th><th>Adresse</th><th>Email</th><th>Téléphone</th><th></th>';
    h += '</tr></thead><tbody>';
    for (const r of state.results) {
      const fullName = isSoc ? [r.CIVILITE, r.NOM].filter(Boolean).join(' ') : [r.CIVILITE, r.NOM, r.PRENOM].filter(Boolean).join(' ');
      const cpVille = [r.code_postal, r.ville].filter(Boolean).join(' ') || r.CP_VILLE || '';
      const adresseLines = [r.ADRESSE, cpVille];
      if (isSoc && r.SIRET) adresseLines.push(String(r.SIRET));
      const adresseHtml = adresseLines.filter(Boolean).map(esc).join('<br/>');
      let telHtml = '';
      if (r.TEl_MOB) telHtml += `<div class="crs-tel-row">${ICON_MOB} ${esc(r.TEl_MOB)}</div>`;
      if (r.TEL_FIXE) telHtml += `<div class="crs-tel-row">${ICON_FIXE} ${esc(r.TEL_FIXE)}</div>`;
      h += `<tr data-crs-action="select-row" data-idvu="${esc(r.IDVu)}"><td data-label="ID Client">${esc(r.IDVu)}</td><td class="crs-c-nom" data-label="Nom">${esc(fullName)}</td><td data-label="Adresse">${adresseHtml}</td><td data-label="Email">${esc(r.EMAIL || '')}</td><td class="crs-cell-tel" data-label="Téléphone">${telHtml}</td><td class="crs-cell-action"><span class="crs-action-btn">${isSoc ? ICON_S : ICON_P}</span></td></tr>`;
    }
    h += '</tbody></table></div>';
    return h;
  }

  function mfieldInput(label, field, type, opts) {
    opts = opts || {};
    const val = state.modal.data[field];
    const v = val == null ? '' : val;
    const cls = opts.gridClass ? `crs-field ${opts.gridClass}` : 'crs-field';
    const placeholder = opts.placeholder || '';
    const reqMark = opts.required ? ' <span class="crs-required">*</span>' : '';
    let inputHtml;
    if (type === 'textarea') {
      inputHtml = `<textarea class="crs-input" data-crs-mfield="${esc(field)}" placeholder="${esc(placeholder)}" rows="3">${esc(v)}</textarea>`;
    } else if (type === 'select') {
      const options = (opts.options || []).map(o => `<option value="${esc(o.value)}"${String(o.value) === String(v) ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
      const ph = opts.noPlaceholder ? '' : '<option value="">— Sélectionner —</option>';
      inputHtml = `<select class="crs-input" data-crs-mfield="${esc(field)}">${ph}${options}</select>`;
    } else if (type === 'checkbox') {
      const stopCls = field === 'STOP_COM' ? ` is-stop-com${v ? ' is-checked' : ''}` : '';
      return `<div class="${cls}"><label class="crs-checkbox${stopCls}"><input type="checkbox" data-crs-mfield="${esc(field)}"${v ? ' checked' : ''}/> <span>${esc(label)}</span></label></div>`;
    } else {
      inputHtml = `<input class="crs-input" type="${type || 'text'}" data-crs-mfield="${esc(field)}" value="${esc(v)}" placeholder="${esc(placeholder)}"${opts.disabled ? ' disabled' : ''}/>`;
    }
    return `<div class="${cls}"><label class="crs-label">${esc(label)}${reqMark}</label>${inputHtml}</div>`;
  }

  function renderSiretAutocomplete() {
    const m = state.modal;
    let h = '<div class="crs-field two"><label class="crs-label">SIRET / SIREN / Raison sociale <span class="crs-required">*</span></label>';
    h += '<div class="crs-autocomplete-wrap">';
    h += `<input class="crs-input" type="text" data-crs-mfield="__siretQuery" value="${esc(m.siretQuery || '')}" placeholder="Rechercher dans SIRENE" autocomplete="off"/>`;
    if (m.siretLoading) h += '<div class="crs-field-status"><span class="crs-spinner"></span> Recherche SIRENE…</div>';
    if (m.siretSuggestions && m.siretSuggestions.length) {
      h += '<div class="crs-suggestions">';
      m.siretSuggestions.forEach((s, i) => {
        const inactive = s.statut && s.statut !== 'ACTIF';
        h += `<div class="crs-suggestion${inactive ? ' is-inactive' : ''}" data-crs-action="pick-siret" data-idx="${i}">
        <div><strong>${esc(s.raison_sociale || '(sans dénomination)')}</strong></div>
        <div class="crs-suggestion-sub">${esc(s.siret || '')} — ${esc(s.commune || '')} — ${esc(s.statut || '')}</div>
      </div>`;
      });
      h += '</div>';
    }
    h += '</div></div>';
    return h;
  }

  function renderAddressAutocomplete() {
    const m = state.modal;
    const verified = m.data.adresse_status === 'verified';
    let h = '<div class="crs-field full"><label class="crs-label">Adresse</label>';
    h += '<div class="crs-autocomplete-wrap">';
    h += `<input class="crs-input" type="text" data-crs-mfield="__addressQuery" value="${esc(m.addressQuery || m.data.ADRESSE || '')}" placeholder="Tapez une adresse" autocomplete="off"/>`;
    if (m.addressLoading) h += '<div class="crs-field-status"><span class="crs-spinner"></span> Recherche…</div>';
    else if (verified) h += `<div class="crs-field-status">✓ Adresse vérifiée (${esc(m.data.adresse_source || '')})</div>`;
    if (m.addressSuggestions && m.addressSuggestions.length) {
      h += '<div class="crs-suggestions">';
      m.addressSuggestions.forEach((s, i) => {
        h += `<div class="crs-suggestion" data-crs-action="pick-address" data-idx="${i}">${esc(s.label || '')}</div>`;
      });
      h += '</div>';
    }
    h += '</div></div>';
    return h;
  }

  function renderDuplicateBlock() {
    const m = state.modal;
    if (!m.duplicate) return '';
    const c = m.duplicate.client;
    const detail = [
      `ID Client : ${esc(c.IDVu)}`,
      c.EMAIL ? esc(c.EMAIL) : '',
      c.TEl_MOB ? esc(c.TEl_MOB) : '',
      [c.code_postal, c.ville].filter(Boolean).join(' ')
    ].filter(Boolean).join(' — ');
    return `<div class="crs-modal-duplicate">
    <div class="crs-modal-duplicate-head">${ICON_WARN}<div>
      <div class="crs-modal-duplicate-title">${esc(m.duplicate.label)} est déjà utilisé(e) par :</div>
      <div class="crs-modal-duplicate-client"><strong>${esc(clientFullName(c))}</strong>${detail}</div>
    </div></div>
    <div class="crs-modal-duplicate-actions">
      <button class="crs-btn crs-btn-ghost" data-crs-action="dismiss-duplicate">Modifier ma saisie</button>
      <button class="crs-btn crs-btn-primary" data-crs-action="view-duplicate">${ICON_P}<span>Voir ce client</span></button>
    </div>
  </div>`;
  }

  function renderModal() {
    if (!state.modal) return '';
    const m = state.modal;
    const isSoc = m.isSoc;
    const title = isSoc ? 'Créer une société' : 'Créer un particulier';
    let body = '';
    body += renderDuplicateBlock();
    if (m.error && !m.duplicate) body += `<div class="crs-modal-error">${esc(m.error)}</div>`;

    body += '<div class="crs-modal-section"><div class="crs-modal-section-title">Identité</div><div class="crs-modal-grid">';
    if (isSoc) {
      body += mfieldInput('Type', 'CIVILITE', 'select', { options: typesS.map(t => ({ value: t.libelle_court, label: `${t.libelle_court} — ${t.libelle}` })) });
      body += renderSiretAutocomplete();
      body += mfieldInput('Raison sociale', 'NOM', 'text', { gridClass: 'full', required: true });
    } else {
      body += mfieldInput('Civilité', 'CIVILITE', 'select', { options: civilitesP.map(c => ({ value: c.libelle, label: c.libelle })), required: true });
      body += mfieldInput('Nom', 'NOM', 'text', { required: true });
      body += mfieldInput('Prénom', 'PRENOM', 'text', { required: true });
      body += mfieldInput('Date de naissance', 'BIRTHDAY', 'date');
    }
    body += '</div></div>';

    body += '<div class="crs-modal-section"><div class="crs-modal-section-title">Contact</div><div class="crs-modal-grid">';
    body += mfieldInput('Téléphone portable', 'TEl_MOB', 'text', { required: !isSoc });
    body += mfieldInput('Téléphone fixe', 'TEL_FIXE');
    body += mfieldInput('Email', 'EMAIL', 'text', { required: !isSoc });
    body += '</div></div>';

    body += '<div class="crs-modal-section"><div class="crs-modal-section-title">Adresse</div><div class="crs-modal-grid">';
    body += renderAddressAutocomplete();
    body += mfieldInput('Code postal', 'code_postal');
    body += mfieldInput('Ville', 'ville', 'text', { gridClass: 'two' });
    body += '</div></div>';

    if (!isSoc) {
      body += '<div class="crs-modal-section"><div class="crs-modal-section-title">Préférences</div><div class="crs-modal-grid">';
      body += mfieldInput('Stop com', 'STOP_COM', 'checkbox');
      body += mfieldInput('NPAI', 'NPAI', 'select', { options: npaiOptions.map(o => ({ value: o, label: o })), noPlaceholder: true });
      body += '</div></div>';
      body += '<div class="crs-modal-section"><div class="crs-modal-section-title">Profil</div><div class="crs-modal-grid">';
      body += mfieldInput('CSP', 'CSP');
      body += mfieldInput('Profession', 'PROFESSION');
      body += mfieldInput('Loisir', 'LOISIR');
      body += '</div></div>';
      body += '<div class="crs-modal-section"><div class="crs-modal-section-title">Véhicule</div><div class="crs-modal-grid">';
      body += mfieldInput('Marque', 'MARQUE_CLIENT_VEHICULE');
      body += mfieldInput('Modèle', 'MODELE_CLIENT_VEHICULE');
      body += mfieldInput('Année', 'ANNEE_CLIENT_VEHICULE', 'number');
      body += mfieldInput('KMs', 'KM_CLIENT_VEHICULE', 'number');
      body += mfieldInput('KMs par an', 'KM_MOY', 'number');
      body += '</div></div>';
    }

    body += '<div class="crs-modal-section"><div class="crs-modal-section-title">Commentaires</div><div class="crs-modal-grid">';
    body += mfieldInput('Commentaires', 'COMMENTAIRE', 'textarea', { gridClass: 'full' });
    body += '</div></div>';

    return `<div class="crs-modal-overlay" data-crs-action="close-modal-bg">
    <div class="crs-modal">
      <div class="crs-modal-header">
        <h2 class="crs-modal-title">${esc(title)}</h2>
        <button class="crs-modal-close" data-crs-action="close-modal">${ICON_CLOSE}</button>
      </div>
      <div class="crs-modal-body">${body}</div>
      <div class="crs-modal-footer">
        <button class="crs-btn crs-btn-ghost" data-crs-action="close-modal">Annuler</button>
        <button class="crs-btn crs-btn-primary" data-crs-action="save-modal"${m.saving ? ' disabled' : ''}>${m.saving ? '<span class="crs-spinner"></span>' : ICON_PLUS}<span>${m.saving ? 'Enregistrement…' : 'Enregistrer'}</span></button>
      </div>
    </div>
  </div>`;
  }

  function bdcvnBanner() {
    if (!bdcvnActive()) return '';
    return '<div style="background:#e9f7f3;border:1px solid #bfe7dd;color:#1f6f5c;'
      + 'border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:13px;'
      + 'font-weight:600;font-family:inherit">Sélection d\'un client pour un import BDC — '
      + 'choisissez un client existant ou créez-en un, vous reviendrez automatiquement à l\'import.</div>';
  }

  function render() {
    const root = getRoot();
    if (!root) return;
    const active = doc.activeElement;
    const activeAttr = active && active.getAttribute ? (active.getAttribute('data-crs-field') || active.getAttribute('data-crs-mfield')) : null;
    const activeKind = active && active.getAttribute && active.getAttribute('data-crs-mfield') ? 'm' : 'f';
    const activeCursor = activeAttr && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    root.innerHTML = STYLE + bdcvnBanner() + renderTabs() + renderForm() + renderToolbar() + renderTable() + renderModal();
    bindEvents();
    if (activeAttr) {
      const selector = activeKind === 'm' ? `[data-crs-mfield="${activeAttr}"]` : `input[data-crs-field="${activeAttr}"]`;
      const next = root.querySelector(selector);
      if (next) { next.focus(); if (activeCursor != null && next.setSelectionRange) try { next.setSelectionRange(activeCursor, activeCursor); } catch (e) { } }
    }
  }

  function bindEvents() {
    const root = getRoot();
    if (!root) return;
    root.querySelectorAll('[data-crs-action="tab"]').forEach(el => el.addEventListener('click', () => changeTab(el.getAttribute('data-tab'))));
    root.querySelectorAll('input[data-crs-field]').forEach(el => {
      el.addEventListener('input', () => { state.filters[state.activeTab][el.getAttribute('data-crs-field')] = el.value; });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { state.page = 1; runSearch(); } });
    });
    root.querySelectorAll('[data-crs-action="toggle-more"]').forEach(el => el.addEventListener('click', () => { state.showMore = !state.showMore; render(); }));
    root.querySelectorAll('[data-crs-action="cancel"]').forEach(el => el.addEventListener('click', clearFilters));
    root.querySelectorAll('[data-crs-action="search"]').forEach(el => el.addEventListener('click', () => { state.page = 1; runSearch(); }));
    root.querySelectorAll('[data-crs-action="prev-page"]').forEach(el => el.addEventListener('click', () => changePage(state.page - 1)));
    root.querySelectorAll('[data-crs-action="next-page"]').forEach(el => el.addEventListener('click', () => changePage(state.page + 1)));
    root.querySelectorAll('[data-crs-action="page"]').forEach(el => el.addEventListener('click', () => changePage(Number(el.getAttribute('data-page')))));
    root.querySelectorAll('[data-crs-action="create"]').forEach(el => el.addEventListener('click', openCreateModal));
    root.querySelectorAll('tr[data-crs-action="select-row"]').forEach(el => el.addEventListener('click', () => {
      const idvu = el.getAttribute('data-idvu');
      const row = state.results.find(r => String(r.IDVu) === String(idvu));
      if (row) selectRow(row);
    }));
    root.querySelectorAll('[data-crs-action="close-modal"]').forEach(el => el.addEventListener('click', closeModal));
    root.querySelectorAll('[data-crs-action="close-modal-bg"]').forEach(el => el.addEventListener('click', (e) => { if (e.target === el) closeModal(); }));
    root.querySelectorAll('[data-crs-action="save-modal"]').forEach(el => el.addEventListener('click', saveCreation));
    root.querySelectorAll('[data-crs-action="dismiss-duplicate"]').forEach(el => el.addEventListener('click', dismissDuplicate));
    root.querySelectorAll('[data-crs-action="view-duplicate"]').forEach(el => el.addEventListener('click', viewDuplicate));
    root.querySelectorAll('[data-crs-action="pick-address"]').forEach(el => el.addEventListener('click', () => {
      const idx = Number(el.getAttribute('data-idx'));
      if (state.modal && state.modal.addressSuggestions[idx]) applyAddressSuggestion(state.modal.addressSuggestions[idx]);
    }));
    root.querySelectorAll('[data-crs-action="pick-siret"]').forEach(el => el.addEventListener('click', () => {
      const idx = Number(el.getAttribute('data-idx'));
      if (state.modal && state.modal.siretSuggestions[idx]) applySiretSuggestion(state.modal.siretSuggestions[idx]);
    }));
    root.querySelectorAll('[data-crs-mfield]').forEach(el => {
      const field = el.getAttribute('data-crs-mfield');
      if (field === '__addressQuery') { el.addEventListener('input', () => onAddressInput(el.value)); return; }
      if (field === '__siretQuery') { el.addEventListener('input', () => onSiretInput(el.value)); return; }
      if (el.tagName === 'SELECT') el.addEventListener('change', () => updateModalField(field, el.value));
      else if (el.type === 'checkbox') el.addEventListener('change', () => updateModalField(field, el.checked));
      else el.addEventListener('input', () => updateModalField(field, el.value));
    });
  }

  render();
  (function ensureRenderedCrs() {
    const delays = [250, 600, 1200, 2500];
    delays.forEach(d => setTimeout(() => { const root = getRoot(); if (root && !root.querySelector('style')) render(); }, d));
    const mo = new MutationObserver(() => { const root = getRoot(); if (root && !root.querySelector('style')) render(); });
    try { mo.observe(doc.body, { childList: true, subtree: true }); } catch (e) { }
    setTimeout(() => { try { mo.disconnect(); } catch (e) { } }, 8000);
  })();

}
});
