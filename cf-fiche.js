// ============================================================================
//  FICHE CLIENT (onglet) — module One Data (OD.define)  v1 (Lot A)
//  cfMain migré : rendu dans __anchor ; client via ctx.supabase ; self-boots
//  retirés ; edge sirène via functions.invoke (tenant). Vars WeWeb conservées.
// ============================================================================
OD.define('cf-fiche', {
  mount(__anchor, ctx) {
    __anchor.id = 'oropra-client-fiche';

const SELECTED_CLIENT_VAR_ID = '55490583-c88b-4748-916e-4d203db07742';
const LOOKUP_VAR_ID = 'cced74ab-5a0a-418d-9479-2366e05a8754';
const NPAI_VAR_ID = '7e24f595-e1fd-4257-99f4-76f179032788';
const GEOPF_ENDPOINT = 'https://data.geopf.fr/geocodage/search';
const EDGE_FN_SIRENE_SEARCH = 'sirene-search';
const EDGE_FN_SIRENE_UPSERT = 'sirene-upsert';

const doc = __anchor.ownerDocument || document;
function getRoot() { return __anchor; }

// Onglet "Fiche client" monté paresseusement par WeWeb : sa div n'existe pas au
// chargement si on arrive sur un autre onglet, et elle réapparaît vide au retour.
// Observateur PERSISTANT (sans timeout) -> on (re)rend dès qu'elle réapparaît vide.
// Le garde !querySelector('style') évite tout re-rendu intempestif (donc pas de
// perte de saisie en édition, pas de boucle) : on ne (re)boote que sur une div vide.
// __cfPersistBoot retiré (loader)

// self-boot retiré (loader)

const userConnected = ((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser || {};
const viewerId = userConnected.ID_User;

function readVar(id) { try { return wwLib.wwVariable.getValue(id); } catch (e) { return null; } }
const lookup = Array.isArray(readVar(LOOKUP_VAR_ID)) ? readVar(LOOKUP_VAR_ID) : [];
const civilitesP = lookup.filter(x => x.multivu === 0);
const typesS = lookup.filter(x => x.multivu === 1);
const npaiOptionsRaw = readVar(NPAI_VAR_ID);
const npaiOptions = Array.isArray(npaiOptionsRaw) && npaiOptionsRaw.length ? npaiOptionsRaw : ['Aucun', 'NPAI', 'Décédé'];

const state = window.__cf || {};
if (state.mode === undefined)          state.mode = 'view';
if (state.client === undefined)        state.client = null;
if (state.original === undefined)      state.original = null;
if (state.saving === undefined)        state.saving = false;
if (state.error === undefined)         state.error = null;
if (state.duplicate === undefined)     state.duplicate = null;
if (state.addressQuery === undefined)  state.addressQuery = '';
if (state.addressSuggestions === undefined) state.addressSuggestions = [];
if (state.addressLoading === undefined) state.addressLoading = false;
if (state.siretQuery === undefined)    state.siretQuery = '';
if (state.siretSuggestions === undefined) state.siretSuggestions = [];
if (state.siretLoading === undefined)  state.siretLoading = false;
window.__cf = state;

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function cleanDigits(s) { return s == null ? '' : String(s).replace(/\D/g, ''); }
function cleanEmail(s) { return s == null ? '' : String(s).trim().toLowerCase(); }
function isValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim()); }
function isValidMobile(s) { const d = cleanDigits(s); return /^(0[67]\d{8}|33[67]\d{8})$/.test(d); }
function isValidFixe(s) { const d = cleanDigits(s); return /^(0[1-589]\d{8}|33[1-589]\d{8})$/.test(d); }
function isSoc() { return state.client && (state.client.idmultivu === 1 || state.client.idmultivu === '1'); }
function clientFullName(c) {
  if (!c) return '';
  const soc = c.idmultivu === 1 || c.idmultivu === '1';
  return soc ? [c.CIVILITE, c.NOM].filter(Boolean).join(' ') : [c.CIVILITE, c.NOM, c.PRENOM].filter(Boolean).join(' ');
}

function _writeVar(varId, value) {
  try { wwLib.wwVariable.updateValue(varId, value); return; }
  catch (e) { console.warn('[cf]', varId, 'failed:', e && e.message); }
  try {
    const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window;
    if (w.variables && Object.prototype.hasOwnProperty.call(w.variables, varId + '-value')) {
      w.variables[varId + '-value'] = value;
    }
  } catch (e) {}
}

async function pushClientHistory(client) {
  if (!client || client.IDVu == null) return;
  if (viewerId == null) return;
  try {
    const supabase = ctx.supabase;
    const { error } = await supabase
      .from('client_view_history')
      .upsert(
        {
          user_id: String(viewerId),
          idvu: Number(client.IDVu),
          viewed_at: new Date().toISOString()
        },
        { onConflict: 'user_id,idvu' }
      );
    if (error) throw error;
    try { window.dispatchEvent(new CustomEvent('oropra-history-updated')); } catch (e) {}
  } catch (e) {
    console.warn('[cf] push history failed:', e && e.message);
  }
}

  async function refreshClientFromDB(idvu) {
    if (idvu == null) return;
    try {
      const supabase = ctx.supabase;
      const { data, error } = await supabase
        .from('CLIENT')
        .select('*')
        .eq('IDVu', idvu)
        .single();
      if (error) throw error;
      if (!data) return;
      if (state.mode === 'edit') return;
      if (!state.client || String(state.client.IDVu) !== String(idvu)) return;
      if (data.NPAI == null || data.NPAI === '') data.NPAI = 'Aucun';
      state.client = JSON.parse(JSON.stringify(data));
      state.original = JSON.parse(JSON.stringify(data));
      _writeVar(SELECTED_CLIENT_VAR_ID, Object.assign({}, data));
      render();
    } catch (e) {
      console.warn('[cf] refresh client failed:', e && e.message);
    }
  }

function loadClient() {
  const v = readVar(SELECTED_CLIENT_VAR_ID);
  if (v && typeof v === 'object' && v.IDVu != null) {
    const cloned = JSON.parse(JSON.stringify(v));
    delete cloned.full_count;
    if (cloned.NPAI == null || cloned.NPAI === '') cloned.NPAI = 'Aucun';
    state.client = cloned;
    state.original = JSON.parse(JSON.stringify(cloned));
    state.mode = 'view';
    state.error = null;
    state.duplicate = null;
    state.addressQuery = '';
    state.addressSuggestions = [];
    state.siretQuery = '';
    state.siretSuggestions = [];
    pushClientHistory(cloned);
    refreshClientFromDB(cloned.IDVu);
  } else {
    state.client = null;
    state.original = null;
  }
}

function enterEdit() {
  state.mode = 'edit';
  state.original = JSON.parse(JSON.stringify(state.client));
  state.error = null;
  state.duplicate = null;
  render();
}

function cancelEdit() {
  state.client = JSON.parse(JSON.stringify(state.original));
  state.mode = 'view';
  state.error = null;
  state.duplicate = null;
  state.addressSuggestions = [];
  state.siretSuggestions = [];
  render();
}

function updateClientField(field, value) {
  if (state.mode !== 'edit' || !state.client) return;
  state.client[field] = value;
}

function validate() {
  const d = state.client;
  const soc = isSoc();
  const errors = [];
  if (soc) {
    if (!cleanDigits(d.SIRET) || cleanDigits(d.SIRET).length !== 14) errors.push('Le SIRET doit comporter 14 chiffres.');
    if (!d.NOM || !String(d.NOM).trim()) errors.push('La raison sociale est obligatoire.');
  } else {
    if (!d.CIVILITE) errors.push('La civilité est obligatoire.');
    if (!d.NOM || !String(d.NOM).trim()) errors.push('Le nom est obligatoire.');
    if (!d.PRENOM || !String(d.PRENOM).trim()) errors.push('Le prénom est obligatoire.');
    if (!d.TEl_MOB) errors.push('Le téléphone portable est obligatoire.');
    else if (!isValidMobile(d.TEl_MOB)) errors.push('Le téléphone portable n\'est pas valide.');
    if (!d.EMAIL) errors.push('L\'email est obligatoire.');
    else if (!isValidEmail(d.EMAIL)) errors.push('L\'email n\'est pas valide.');
  }
  if (d.TEL_FIXE && !isValidFixe(d.TEL_FIXE)) errors.push('Le téléphone fixe n\'est pas valide.');
  if (soc && d.TEl_MOB && !isValidMobile(d.TEl_MOB)) errors.push('Le téléphone portable n\'est pas valide.');
  if (soc && d.EMAIL && !isValidEmail(d.EMAIL)) errors.push('L\'email n\'est pas valide.');
  return errors.length ? errors : null;
}

async function checkDuplicates() {
  const d = state.client;
  const supabase = ctx.supabase;
  const selectCols = 'IDVu, CIVILITE, NOM, PRENOM, EMAIL, TEl_MOB, idmultivu, code_postal, ville';
  const cleanMob = cleanDigits(d.TEl_MOB);
  if (cleanMob) {
    const { data: dup } = await supabase.from('CLIENT').select(selectCols).eq('TEl_MOB', cleanMob).neq('IDVu', d.IDVu).limit(1).maybeSingle();
    if (dup) return { field: 'TEl_MOB', label: 'Ce numéro de portable', client: dup };
  }
  const e = cleanEmail(d.EMAIL);
  if (e) {
    const { data: dup } = await supabase.from('CLIENT').select(selectCols).ilike('EMAIL', e).neq('IDVu', d.IDVu).limit(1).maybeSingle();
    if (dup) return { field: 'EMAIL', label: 'Cette adresse email', client: dup };
  }
  return null;
}

function dismissDuplicate() { state.duplicate = null; render(); }
function viewDuplicate() {
  if (!state.duplicate) return;
  _writeVar(SELECTED_CLIENT_VAR_ID, Object.assign({}, state.duplicate.client));
  loadClient();
  render();
}

async function saveEdit() {
  const errs = validate();
  if (errs) { state.error = errs.join(' '); state.duplicate = null; render(); return; }
  state.saving = true;
  state.error = null;
  state.duplicate = null;
  render();
  try {
    const dup = await checkDuplicates();
    if (dup) { state.duplicate = dup; state.saving = false; render(); return; }
    const supabase = ctx.supabase;
    const now = new Date().toISOString();
    const soc = isSoc();
    const payload = Object.assign({}, state.client, {
      UpdateDate: now,
      ID_VENDEUR_UPDATE: viewerId != null ? String(viewerId) : null,
      adresse_checked_at: state.client.adresse_status === 'verified' ? now : state.client.adresse_checked_at,
      CP_VILLE: [state.client.code_postal, state.client.ville].filter(Boolean).join(' ')
    });
    if (payload.TEl_MOB)  payload.TEl_MOB  = cleanDigits(payload.TEl_MOB);
    if (payload.TEL_FIXE) payload.TEL_FIXE = cleanDigits(payload.TEL_FIXE);
    if (payload.EMAIL)    payload.EMAIL    = cleanEmail(payload.EMAIL);
    ['ANNEE_CLIENT_VEHICULE','KM_CLIENT_VEHICULE','KM_MOY','SIRET','adresse_score'].forEach(k => {
      if (payload[k] === '' || payload[k] == null) payload[k] = null;
      else if (k === 'adresse_score') payload[k] = Number(payload[k]);
      else payload[k] = Number(cleanDigits(payload[k])) || null;
    });
    if (payload.BIRTHDAY === '') payload.BIRTHDAY = null;
    delete payload.CreationDate;
    delete payload.ID_VENDEUR_CREATION;
    const idvu = state.client.IDVu;
    delete payload.IDVu;
    const { data: updated, error } = await supabase.from('CLIENT').update(payload).eq('IDVu', idvu).select('*').single();
    if (error) throw error;
    if (soc && payload.SIRET) {
      try {
        await supabase.functions.invoke(EDGE_FN_SIRENE_UPSERT, {
          body: { siret: String(payload.SIRET), idvu: String(idvu), setPrimary: true }
        });
      } catch (eLink) { console.warn('[cf] sirene-upsert failed (non bloquant):', eLink && eLink.message); }
    }
    if (updated.NPAI == null || updated.NPAI === '') updated.NPAI = 'Aucun';
    state.client = JSON.parse(JSON.stringify(updated));
    state.original = JSON.parse(JSON.stringify(updated));
    _writeVar(SELECTED_CLIENT_VAR_ID, Object.assign({}, updated));
    state.mode = 'view';
  } catch (e) {
    console.error('[cf] save', e);
    state.error = e.message || String(e);
  } finally {
    state.saving = false;
    render();
  }
}

async function searchAddress(query) {
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
  state.addressQuery = query;
  state.client.ADRESSE = query;
  state.client.adresse_source = 'manual';
  state.client.adresse_status = null;
  if (!query || query.length < 4) { state.addressSuggestions = []; render(); return; }
  if (addressDebounce) clearTimeout(addressDebounce);
  addressDebounce = setTimeout(async () => {
    state.addressLoading = true;
    render();
    try { state.addressSuggestions = await searchAddress(query); }
    catch (e) { console.error('[cf] address', e); state.addressSuggestions = []; }
    finally { state.addressLoading = false; render(); }
  }, 350);
}

function applyAddressSuggestion(s) {
  const p = (s.raw && s.raw.properties) || {};
  const c = (s.raw && s.raw.geometry && s.raw.geometry.coordinates) || [];
  Object.assign(state.client, {
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
  state.addressSuggestions = [];
  state.addressQuery = p.label || '';
  render();
}

async function searchSirene(query) {
  const supabase = ctx.supabase;
  const qs = new URLSearchParams({ query, limit: '8', activeOnly: 'false' }).toString();
  const { data, error } = await supabase.functions.invoke(`${EDGE_FN_SIRENE_SEARCH}?${qs}`, { method: 'GET' });
  if (error) throw error;
  return (data && data.items) || [];
}

let siretDebounce = null;
function onSiretInput(query) {
  state.siretQuery = query;
  const onlyDigits = cleanDigits(query);
  if (onlyDigits === query.replace(/\s/g, '')) state.client.SIRET = onlyDigits;
  if (!query || query.length < 2) { state.siretSuggestions = []; render(); return; }
  if (siretDebounce) clearTimeout(siretDebounce);
  siretDebounce = setTimeout(async () => {
    state.siretLoading = true;
    render();
    try { state.siretSuggestions = await searchSirene(query); }
    catch (e) { console.error('[cf] siret', e); state.siretSuggestions = []; state.error = e.message || String(e); }
    finally { state.siretLoading = false; render(); }
  }, 400);
}

function applySiretSuggestion(item) {
  const t = typesS.find(x => String(x.code) === String(item.categorie_juridique_code));
  Object.assign(state.client, {
    SIRET: cleanDigits(item.siret),
    NOM: item.raison_sociale || state.client.NOM,
    CIVILITE: t ? t.libelle_court : state.client.CIVILITE,
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
  state.siretSuggestions = [];
  state.siretQuery = cleanDigits(item.siret);
  state.addressQuery = item.adresse || item.adresse_ligne1 || '';
  render();
}

const ICON_EDIT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>';
const ICON_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const ICON_WARN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17"/></svg>';
const ICON_P = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';

const STYLE = `<style>
#oropra-client-fiche{font-family:"Nunito Sans",system-ui,sans-serif;color:#2a5ea9}
#oropra-client-fiche *{box-sizing:border-box}
#oropra-client-fiche .cf-section{margin-bottom:22px;border:1px solid #e3edf9;border-radius:8px;padding:18px 20px}
#oropra-client-fiche .cf-section-title{font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#7a98c5;margin:0 0 12px;font-weight:600}
#oropra-client-fiche .cf-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px 16px}
#oropra-client-fiche .cf-grid .full{grid-column:1 / -1}
#oropra-client-fiche .cf-grid .two{grid-column:span 2}
#oropra-client-fiche .cf-field{display:flex;flex-direction:column}
#oropra-client-fiche .cf-label{font-size:11px;color:#7a98c5;margin-bottom:4px;text-transform:uppercase;letter-spacing:.4px;font-weight:500}
#oropra-client-fiche .cf-required{color:#c63a3a;margin-left:2px}
#oropra-client-fiche .cf-input{border:1px solid #d9e3f2;border-radius:6px;padding:11px 13px;font-size:13px;color:#2a5ea9;outline:none;background:#fff;font-family:inherit;width:100%}
#oropra-client-fiche .cf-input:focus{border-color:#2a5ea9}
#oropra-client-fiche .cf-input::placeholder{color:#7a98c5}
#oropra-client-fiche .cf-input[disabled]{background:#f7faff;color:#2a5ea9;opacity:1;cursor:default;border-color:#eaf0f9}
#oropra-client-fiche textarea.cf-input{resize:vertical;min-height:64px;font-family:inherit}
#oropra-client-fiche select.cf-input{cursor:pointer;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237a98c5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");background-repeat:no-repeat;background-position:right 10px center;background-size:14px;appearance:none;padding-right:32px}
#oropra-client-fiche select.cf-input[disabled]{cursor:default}
#oropra-client-fiche .cf-checkbox{display:flex;align-items:center;gap:8px;font-size:13px;color:#2a5ea9;cursor:pointer;padding:11px 0}
#oropra-client-fiche .cf-checkbox.is-stop-com{color:#2a5ea9}
#oropra-client-fiche .cf-checkbox.is-stop-com input{accent-color:#2a5ea9}
#oropra-client-fiche .cf-checkbox.is-stop-com.is-checked,
#oropra-client-fiche .cf-checkbox.is-stop-com:has(input:checked){color:#c63a3a}
#oropra-client-fiche .cf-checkbox.is-stop-com.is-checked input,
#oropra-client-fiche .cf-checkbox.is-stop-com:has(input:checked) input{accent-color:#c63a3a}
#oropra-client-fiche .cf-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
#oropra-client-fiche .cf-btn{padding:9px 18px;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;border:1px solid transparent;outline:none;font-family:inherit;display:inline-flex;align-items:center;gap:6px;text-transform:uppercase;letter-spacing:.3px}
#oropra-client-fiche .cf-btn-primary{background:#53bda7;color:#fff;border-color:#53bda7}
#oropra-client-fiche .cf-btn-primary:hover{background:#45a791;border-color:#45a791}
#oropra-client-fiche .cf-btn-primary:disabled{background:#a9d9cd;border-color:#a9d9cd;cursor:not-allowed}
#oropra-client-fiche .cf-btn-ghost{background:transparent;color:#2a5ea9;border-color:#2a5ea9}
#oropra-client-fiche .cf-btn-ghost:hover{background:#f2f6fc}
#oropra-client-fiche .cf-error{color:#c63a3a;font-size:13px;padding:11px 14px;background:#fdf0f0;border-radius:6px;margin-bottom:16px;border:1px solid #f5d0d0}
#oropra-client-fiche .cf-duplicate{background:#fff7e6;border:1px solid #f5c785;border-radius:8px;padding:16px;margin-bottom:18px;display:flex;flex-direction:column;gap:12px}
#oropra-client-fiche .cf-duplicate-head{display:flex;gap:10px;align-items:flex-start;color:#a85c0e}
#oropra-client-fiche .cf-duplicate-title{font-size:13px;font-weight:600;margin-bottom:6px}
#oropra-client-fiche .cf-duplicate-client{color:#2a5ea9;font-size:13px;line-height:1.5}
#oropra-client-fiche .cf-duplicate-client strong{display:block;margin-bottom:2px}
#oropra-client-fiche .cf-duplicate-actions{display:flex;gap:8px;justify-content:flex-end}
#oropra-client-fiche .cf-autocomplete-wrap{position:relative}
#oropra-client-fiche .cf-suggestions{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1px solid #d9e3f2;border-radius:6px;box-shadow:0 6px 20px rgba(42,94,169,.12);z-index:10;max-height:280px;overflow-y:auto}
#oropra-client-fiche .cf-suggestion{padding:10px 12px;cursor:pointer;font-size:13px;color:#2a5ea9;border-bottom:1px solid #f0f4fa}
#oropra-client-fiche .cf-suggestion:last-child{border-bottom:none}
#oropra-client-fiche .cf-suggestion:hover{background:#f2f6fc}
#oropra-client-fiche .cf-suggestion.is-inactive{font-style:italic;color:#c4d2e7}
#oropra-client-fiche .cf-suggestion.is-inactive .cf-suggestion-sub{color:#c4d2e7}
#oropra-client-fiche .cf-suggestion-sub{font-size:11px;color:#7a98c5;margin-top:2px}
#oropra-client-fiche .cf-field-status{font-size:11px;color:#53bda7;margin-top:4px;display:inline-flex;align-items:center;gap:4px}
#oropra-client-fiche .cf-spinner{display:inline-block;width:12px;height:12px;border:2px solid #e3edf9;border-top-color:#53bda7;border-radius:50%;animation:cf-spin .8s linear infinite}
@keyframes cf-spin{to{transform:rotate(360deg)}}
#oropra-client-fiche .cf-empty{padding:48px 16px;text-align:center;color:#8aa3c3;font-size:13px}
/* ============ RESPONSIVE ============ */
@media (max-width:880px){
  #oropra-client-fiche .cf-grid{grid-template-columns:1fr 1fr}
  #oropra-client-fiche .cf-section{padding:16px 16px}
}
@media (max-width:560px){
  #oropra-client-fiche .cf-grid{grid-template-columns:1fr}
  #oropra-client-fiche .cf-grid .two{grid-column:auto}
  #oropra-client-fiche .cf-section{padding:14px 13px;margin-bottom:16px}
  #oropra-client-fiche .cf-footer{flex-wrap:wrap}
  #oropra-client-fiche .cf-footer .cf-btn{flex:1;justify-content:center}
  #oropra-client-fiche .cf-duplicate-actions{flex-wrap:wrap}
  #oropra-client-fiche .cf-duplicate-actions .cf-btn{flex:1;justify-content:center}
}
</style>`;

function fieldInput(label, field, type, opts) {
  opts = opts || {};
  const val = state.client[field];
  const v = val == null ? '' : val;
  const editable = state.mode === 'edit';
  const reqMark = opts.required && editable ? ' <span class="cf-required">*</span>' : '';
  const cls = opts.gridClass ? `cf-field ${opts.gridClass}` : 'cf-field';
  const dis = editable ? '' : ' disabled';
  let inputHtml;
  if (type === 'textarea') {
    inputHtml = `<textarea class="cf-input" data-cf-field="${esc(field)}" rows="3"${dis}>${esc(v)}</textarea>`;
  } else if (type === 'select') {
    const options = (opts.options || []).map(o => `<option value="${esc(o.value)}"${String(o.value) === String(v) ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
    const ph = opts.noPlaceholder ? '' : '<option value="">— Sélectionner —</option>';
    inputHtml = `<select class="cf-input" data-cf-field="${esc(field)}"${dis}>${ph}${options}</select>`;
  } else if (type === 'checkbox') {
    const stopCls = field === 'STOP_COM' ? ` is-stop-com${v ? ' is-checked' : ''}` : '';
    return `<div class="${cls}"><label class="cf-checkbox${stopCls}"><input type="checkbox" data-cf-field="${esc(field)}"${v ? ' checked' : ''}${dis}/> <span>${esc(label)}</span></label></div>`;
  } else {
    inputHtml = `<input class="cf-input" type="${type || 'text'}" data-cf-field="${esc(field)}" value="${esc(v)}"${dis}/>`;
  }
  return `<div class="${cls}"><label class="cf-label">${esc(label)}${reqMark}</label>${inputHtml}</div>`;
}

function renderSiretField() {
  if (state.mode === 'view') return fieldInput('SIRET', 'SIRET', 'text', { gridClass: 'two' });
  let h = '<div class="cf-field two"><label class="cf-label">SIRET / SIREN / Raison sociale <span class="cf-required">*</span></label>';
  h += '<div class="cf-autocomplete-wrap">';
  h += `<input class="cf-input" type="text" data-cf-field="__siretQuery" value="${esc(state.siretQuery || state.client.SIRET || '')}" placeholder="Rechercher dans SIRENE" autocomplete="off"/>`;
  if (state.siretLoading) h += '<div class="cf-field-status"><span class="cf-spinner"></span> Recherche SIRENE…</div>';
  if (state.siretSuggestions && state.siretSuggestions.length) {
    h += '<div class="cf-suggestions">';
    state.siretSuggestions.forEach((s, i) => {
      const inactive = s.statut && s.statut !== 'ACTIF';
      h += `<div class="cf-suggestion${inactive ? ' is-inactive' : ''}" data-cf-action="pick-siret" data-idx="${i}">
        <div><strong>${esc(s.raison_sociale || '(sans dénomination)')}</strong></div>
        <div class="cf-suggestion-sub">${esc(s.siret || '')} — ${esc(s.commune || '')} — ${esc(s.statut || '')}</div>
      </div>`;
    });
    h += '</div>';
  }
  h += '</div></div>';
  return h;
}

function renderAddressField() {
  if (state.mode === 'view') return fieldInput('Adresse', 'ADRESSE', 'text', { gridClass: 'full' });
  const verified = state.client.adresse_status === 'verified';
  let h = '<div class="cf-field full"><label class="cf-label">Adresse</label>';
  h += '<div class="cf-autocomplete-wrap">';
  h += `<input class="cf-input" type="text" data-cf-field="__addressQuery" value="${esc(state.addressQuery || state.client.ADRESSE || '')}" placeholder="Tapez une adresse" autocomplete="off"/>`;
  if (state.addressLoading) h += '<div class="cf-field-status"><span class="cf-spinner"></span> Recherche…</div>';
  else if (verified) h += `<div class="cf-field-status">✓ Adresse vérifiée (${esc(state.client.adresse_source || '')})</div>`;
  if (state.addressSuggestions && state.addressSuggestions.length) {
    h += '<div class="cf-suggestions">';
    state.addressSuggestions.forEach((s, i) => {
      h += `<div class="cf-suggestion" data-cf-action="pick-address" data-idx="${i}">${esc(s.label || '')}</div>`;
    });
    h += '</div>';
  }
  h += '</div></div>';
  return h;
}

function renderDuplicateBlock() {
  if (!state.duplicate) return '';
  const c = state.duplicate.client;
  const detail = [
    `ID Client : ${esc(c.IDVu)}`,
    c.EMAIL ? esc(c.EMAIL) : '',
    c.TEl_MOB ? esc(c.TEl_MOB) : '',
    [c.code_postal, c.ville].filter(Boolean).join(' ')
  ].filter(Boolean).join(' — ');
  return `<div class="cf-duplicate">
    <div class="cf-duplicate-head">${ICON_WARN}<div>
      <div class="cf-duplicate-title">${esc(state.duplicate.label)} est déjà utilisé(e) par :</div>
      <div class="cf-duplicate-client"><strong>${esc(clientFullName(c))}</strong>${detail}</div>
    </div></div>
    <div class="cf-duplicate-actions">
      <button class="cf-btn cf-btn-ghost" data-cf-action="dismiss-duplicate">Modifier ma saisie</button>
      <button class="cf-btn cf-btn-primary" data-cf-action="view-duplicate">${ICON_P}<span>Voir ce client</span></button>
    </div>
  </div>`;
}

function render() {
  const root = getRoot();
  if (!root) return;
  if (!state.client) { root.innerHTML = STYLE + '<div class="cf-empty">Aucun client sélectionné.</div>'; return; }

  const active = doc.activeElement;
  const activeAttr = active && active.getAttribute ? active.getAttribute('data-cf-field') : null;
  const activeCursor = activeAttr && typeof active.selectionStart === 'number' ? active.selectionStart : null;

  const soc = isSoc();
  let body = '';
  body += renderDuplicateBlock();
  if (state.error && !state.duplicate) body += `<div class="cf-error">${esc(state.error)}</div>`;

  body += '<div class="cf-section"><div class="cf-section-title">Identité</div><div class="cf-grid">';
  if (soc) {
    body += fieldInput('Type', 'CIVILITE', 'select', { options: typesS.map(t => ({ value: t.libelle_court, label: `${t.libelle_court} — ${t.libelle}` })) });
    body += renderSiretField();
    body += fieldInput('Raison sociale', 'NOM', 'text', { gridClass: 'full', required: true });
  } else {
    body += fieldInput('Civilité', 'CIVILITE', 'select', { options: civilitesP.map(c => ({ value: c.libelle, label: c.libelle })), required: true });
    body += fieldInput('Nom', 'NOM', 'text', { required: true });
    body += fieldInput('Prénom', 'PRENOM', 'text', { required: true });
    body += fieldInput('Date de naissance', 'BIRTHDAY', 'date');
  }
  body += '</div></div>';

  body += '<div class="cf-section"><div class="cf-section-title">Contact</div><div class="cf-grid">';
  body += fieldInput('Téléphone portable', 'TEl_MOB', 'text', { required: !soc });
  body += fieldInput('Téléphone fixe', 'TEL_FIXE');
  body += fieldInput('Email', 'EMAIL', 'text', { required: !soc });
  body += '</div></div>';

  body += '<div class="cf-section"><div class="cf-section-title">Adresse</div><div class="cf-grid">';
  body += renderAddressField();
  body += fieldInput('Code postal', 'code_postal');
  body += fieldInput('Ville', 'ville', 'text', { gridClass: 'two' });
  body += '</div></div>';

  if (!soc) {
    body += '<div class="cf-section"><div class="cf-section-title">Préférences</div><div class="cf-grid">';
    body += fieldInput('Stop com', 'STOP_COM', 'checkbox');
    body += fieldInput('NPAI', 'NPAI', 'select', { options: npaiOptions.map(o => ({ value: o, label: o })), noPlaceholder: true });
    body += '</div></div>';
    body += '<div class="cf-section"><div class="cf-section-title">Profil</div><div class="cf-grid">';
    body += fieldInput('CSP', 'CSP');
    body += fieldInput('Profession', 'PROFESSION');
    body += fieldInput('Loisir', 'LOISIR');
    body += '</div></div>';
    body += '<div class="cf-section"><div class="cf-section-title">Véhicule</div><div class="cf-grid">';
    body += fieldInput('Marque', 'MARQUE_CLIENT_VEHICULE');
    body += fieldInput('Modèle', 'MODELE_CLIENT_VEHICULE');
    body += fieldInput('Année', 'ANNEE_CLIENT_VEHICULE', 'number');
    body += fieldInput('KMs', 'KM_CLIENT_VEHICULE', 'number');
    body += fieldInput('KMs par an', 'KM_MOY', 'number');
    body += '</div></div>';
  }

  body += '<div class="cf-section"><div class="cf-section-title">Commentaires</div><div class="cf-grid">';
  body += fieldInput('Commentaires', 'COMMENTAIRE', 'textarea', { gridClass: 'full' });
  body += '</div></div>';

  body += '<div class="cf-footer">';
  if (state.mode === 'view') {
    body += `<button class="cf-btn cf-btn-primary" data-cf-action="enter-edit">${ICON_EDIT}<span>Modifier</span></button>`;
  } else {
    body += `<button class="cf-btn cf-btn-ghost" data-cf-action="cancel-edit">Annuler</button>`;
    body += `<button class="cf-btn cf-btn-primary" data-cf-action="save-edit"${state.saving ? ' disabled' : ''}>${state.saving ? '<span class="cf-spinner"></span>' : ICON_CHECK}<span>${state.saving ? 'Enregistrement…' : 'Enregistrer'}</span></button>`;
  }
  body += '</div>';

  root.innerHTML = STYLE + body;
  bindEvents();

  if (activeAttr) {
    const next = root.querySelector(`[data-cf-field="${activeAttr}"]`);
    if (next) { next.focus(); if (activeCursor != null && next.setSelectionRange) try { next.setSelectionRange(activeCursor, activeCursor); } catch (e) {} }
  }
}

function bindEvents() {
  const root = getRoot();
  if (!root) return;
  root.querySelectorAll('[data-cf-action="enter-edit"]').forEach(el => el.addEventListener('click', enterEdit));
  root.querySelectorAll('[data-cf-action="cancel-edit"]').forEach(el => el.addEventListener('click', cancelEdit));
  root.querySelectorAll('[data-cf-action="save-edit"]').forEach(el => el.addEventListener('click', saveEdit));
  root.querySelectorAll('[data-cf-action="dismiss-duplicate"]').forEach(el => el.addEventListener('click', dismissDuplicate));
  root.querySelectorAll('[data-cf-action="view-duplicate"]').forEach(el => el.addEventListener('click', viewDuplicate));
  root.querySelectorAll('[data-cf-action="pick-address"]').forEach(el => el.addEventListener('click', () => {
    const idx = Number(el.getAttribute('data-idx'));
    if (state.addressSuggestions[idx]) applyAddressSuggestion(state.addressSuggestions[idx]);
  }));
  root.querySelectorAll('[data-cf-action="pick-siret"]').forEach(el => el.addEventListener('click', () => {
    const idx = Number(el.getAttribute('data-idx'));
    if (state.siretSuggestions[idx]) applySiretSuggestion(state.siretSuggestions[idx]);
  }));
  root.querySelectorAll('[data-cf-field]').forEach(el => {
    const field = el.getAttribute('data-cf-field');
    if (field === '__addressQuery') { el.addEventListener('input', () => onAddressInput(el.value)); return; }
    if (field === '__siretQuery')   { el.addEventListener('input', () => onSiretInput(el.value));   return; }
    if (el.tagName === 'SELECT') el.addEventListener('change', () => updateClientField(field, el.value));
    else if (el.type === 'checkbox') el.addEventListener('change', () => updateClientField(field, el.checked));
    else el.addEventListener('input', () => updateClientField(field, el.value));
  });
}

if (!window.__cfListenerBound) {
  window.addEventListener('oropra-client-selected', () => { loadClient(); render(); });
  window.__cfListenerBound = true;
}

loadClient();
render();
// ensureRenderedCf retiré (loader)

}
});
