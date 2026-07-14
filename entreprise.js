// ENTREPRISE — module One Data (OD.define) v1 (Lot B)
OD.define('entreprise', {
  mount(__anchor, ctx) {
    __anchor.id = 'oropra-entreprise-rattachement';

// ============================================================================
//  ONGLET ENTREPRISE — Rattachement particulier ↔ société (CRM360 / One Data)
//  Root : #oropra-entreprise-rattachement (bloc HTML embed de l'onglet 7).
//  - Lit le client courant via la variable fiche (SELECTED_CLIENT_VAR_ID).
//  - Liste les rattachements actifs (RPC get_rattachements_particulier).
//  - Modale : recherche société (CLIENT idmultivu=1) ou création (SIRENE),
//    SANS navigation — on récupère juste l'IDVu, puis attach_entreprise.
//  - Détachement = soft delete (detach_rattachement).
// ============================================================================

const SELECTED_CLIENT_VAR_ID   = '55490583-c88b-4748-916e-4d203db07742';
const LOOKUP_VAR_ID            = 'cced74ab-5a0a-418d-9479-2366e05a8754';
const EDGE_FN_SIRENE_SEARCH    = 'sirene-search';
const EDGE_FN_SIRENE_UPSERT    = 'sirene-upsert';

const TYPES = ['Gérant', 'Dirigeant', 'Associé', 'Salarié', 'Conducteur', 'Autre'];
const TYPE_CLS = { 'Gérant': 'b-gerant', 'Dirigeant': 'b-gerant', 'Associé': 'b-assoc', 'Salarié': 'b-assoc', 'Conducteur': 'b-cond' };

const doc = __anchor.ownerDocument || document;
function getRoot() { return __anchor; }

// Observateur PERSISTANT : (re)monte l'onglet Entreprise dès que sa div réapparaît
// vide (changement d'onglet ou changement de client via le shell).
// persist retiré (loader)

// --- Démarrage robuste (attend le root) -------------------------------------
// self-boot retiré (loader)

// --- Helpers ----------------------------------------------------------------
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function cleanDigits(s) { return s == null ? '' : String(s).replace(/\D/g, ''); }
function readVar(id) { try { return wwLib.wwVariable.getValue(id); } catch (e) { return null; } }
function supa() { return ctx.supabase; }

const userConnected = ((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser || {};
const viewerId = userConnected.ID_User != null ? Number(userConnected.ID_User) : null;
const lookup = Array.isArray(readVar(LOOKUP_VAR_ID)) ? readVar(LOOKUP_VAR_ID) : [];
const typesS = lookup.filter(x => x.multivu === 1);   // types juridiques société (CIVILITE)

function currentClient() {
  const c = readVar(SELECTED_CLIENT_VAR_ID);
  return c && typeof c === 'object' ? c : null;
}
function currentIdvu() { const c = currentClient(); return c && c.IDVu != null ? Number(c.IDVu) : null; }
function isParticulier() { const c = currentClient(); return c ? (c.idmultivu === 0 || c.idmultivu === '0') : false; }
function societeName(c) {
  if (!c) return '';
  return [c.CIVILITE, c.NOM, c.PRENOM].filter(Boolean).join(' ').trim();
}

// --- État -------------------------------------------------------------------
const state = window.__entr || {};
if (state.idParticulier === undefined) state.idParticulier = null;
if (state.list === undefined)          state.list = null;   // null = pas chargé
if (state.loading === undefined)       state.loading = false;
if (state.error === undefined)         state.error = null;
if (state.modal === undefined)         state.modal = null;
window.__entr = state;

// --- Chargement de la liste -------------------------------------------------
async function loadList() {
  const id = currentIdvu();
  state.idParticulier = id;
  if (id == null) { state.list = []; render(); return; }
  state.loading = true; render();
  try {
    const r = await supa().rpc('get_rattachements_particulier', { p_id_particulier: id });
    if (r.error) throw r.error;
    state.list = (r.data || []).map(x => ({
      id_entreprise: Number(x.id_entreprise),
      id_societe: x.id_societe != null ? Number(x.id_societe) : null,
      nom: x.societe_nom || ('Société #' + x.id_societe),
      siret: x.societe_siret || '',
      type: x.type_rattachement || '',
      fonction: x.fonction || '',
      date_debut: x.date_debut || null,
      commentaire: x.commentaire || ''
    }));
    state.error = null;
  } catch (e) {
    console.error('[entr] get_rattachements_particulier', e);
    state.error = (e && e.message) ? e.message : 'Erreur de chargement';
    state.list = [];
  } finally {
    state.loading = false; render();
  }
}

// --- Modale -----------------------------------------------------------------
function openModal() {
  state.modal = {
    search: { NOM: '', SIRET: '', EMAIL: '', IDVu: '' },
    results: [], searching: false, searched: false, totalCount: 0,
    selected: null,            // { IDVu, nom, siret }
    form: { type: 'Gérant', fonction: '', date_debut: '', commentaire: '' },
    saving: false, error: null,
    create: null               // sous-formulaire création (null = fermé)
  };
  render();
}
function closeModal() { state.modal = null; render(); }

function setSearchField(f, v) { if (state.modal) state.modal.search[f] = v; }
function clearSearch() {
  if (!state.modal) return;
  state.modal.search = { NOM: '', SIRET: '', EMAIL: '', IDVu: '' };
  state.modal.results = []; state.modal.searched = false; state.modal.totalCount = 0; state.modal.error = null;
  render();
}
// Recherche société sur la base CLIENT (idmultivu=1), même logique que le
// composant oropra-client-search (branche société de buildQuery).
async function runSearch() {
  if (!state.modal) return;
  const f = state.modal.search;
  state.modal.searching = true; state.modal.searched = true; state.modal.error = null; render();
  try {
    let q = supa().from('CLIENT').select('IDVu, CIVILITE, NOM, SIRET, EMAIL, code_postal, ville', { count: 'exact' }).eq('idmultivu', 1);
    if (f.SIRET) { const c = cleanDigits(f.SIRET); if (c) q = q.eq('SIRET', Number(c)); }
    if (f.NOM)   q = q.ilike('NOM', `%${f.NOM}%`);
    if (f.EMAIL) q = q.ilike('EMAIL', `%${f.EMAIL}%`);
    if (f.IDVu)  q = q.eq('IDVu', Number(f.IDVu));
    q = q.order('NOM', { ascending: true, nullsFirst: false }).range(0, 14);
    const { data, error, count } = await q;
    if (error) throw error;
    state.modal.results = data || [];
    state.modal.totalCount = count || 0;
  } catch (e) {
    console.error('[entr] recherche société', e);
    state.modal.results = []; state.modal.totalCount = 0;
    state.modal.error = (e && e.message) ? e.message : String(e);
  } finally {
    state.modal.searching = false; render();
  }
}
function selectCompany(row) {
  if (!state.modal) return;
  state.modal.selected = {
    IDVu: Number(row.IDVu),
    nom: societeName(row) || ('Société #' + row.IDVu),
    siret: row.SIRET ? String(row.SIRET) : ''
  };
  state.modal.results = [];
  state.modal.create = null;
  render();
}
function clearSelected() { if (state.modal) { state.modal.selected = null; render(); } }

// --- Création société (SIRENE), sans navigation -----------------------------
function openCreate() {
  if (!state.modal) return;
  const s = state.modal.search || {};
  state.modal.create = {
    sireneQ: s.SIRET || s.NOM || '', sireneResults: [], sireneLoading: false,
    data: { CIVILITE: '', NOM: s.NOM || '', SIRET: cleanDigits(s.SIRET || ''), ADRESSE: '', code_postal: '', ville: '', adresse_label: '', adresse_source: 'manual', adresse_status: null },
    saving: false, error: null
  };
  state.modal.results = [];
  render();
}
function cancelCreate() { if (state.modal) { state.modal.create = null; render(); } }

let sireneDebounce = null;
function onSireneInput(q) {
  if (!state.modal || !state.modal.create) return;
  state.modal.create.sireneQ = q;
  const digits = cleanDigits(q);
  if (digits === q.replace(/\s/g, '')) state.modal.create.data.SIRET = digits;
  if (sireneDebounce) clearTimeout(sireneDebounce);
  if (!q || q.trim().length < 2) { state.modal.create.sireneResults = []; render(); return; }
  sireneDebounce = setTimeout(() => runSireneSearch(q.trim()), 400);
}
async function runSireneSearch(term) {
  if (!state.modal || !state.modal.create) return;
  state.modal.create.sireneLoading = true; render();
  try {
    const qs = new URLSearchParams({ query: term, limit: '8', activeOnly: 'false' }).toString();
    const { data, error } = await supa().functions.invoke(`${EDGE_FN_SIRENE_SEARCH}?${qs}`, { method: 'GET' });
    if (error) throw error;
    state.modal.create.sireneResults = (data && data.items) || [];
  } catch (e) {
    console.error('[entr] sirene-search', e);
    state.modal.create.sireneResults = [];
    state.modal.create.error = (e && e.message) ? e.message : String(e);
  } finally {
    state.modal.create.sireneLoading = false; render();
  }
}
function pickSirene(item) {
  if (!state.modal || !state.modal.create) return;
  const t = typesS.find(x => String(x.code) === String(item.categorie_juridique_code));
  Object.assign(state.modal.create.data, {
    SIRET: cleanDigits(item.siret),
    NOM: item.raison_sociale || state.modal.create.data.NOM,
    CIVILITE: t ? t.libelle_court : state.modal.create.data.CIVILITE,
    ADRESSE: item.adresse_ligne1 || '',
    code_postal: item.code_postal || '',
    ville: item.commune || '',
    adresse_label: item.adresse || '',
    adresse_source: 'sirene',
    adresse_status: 'verified'
  });
  state.modal.create.sireneResults = [];
  state.modal.create.sireneQ = cleanDigits(item.siret);
  render();
}
async function saveCreate() {
  if (!state.modal || !state.modal.create) return;
  const c = state.modal.create;
  const d = c.data;
  const siret = cleanDigits(d.SIRET);
  if (!d.NOM || !String(d.NOM).trim()) { c.error = 'La raison sociale est obligatoire.'; render(); return; }
  if (siret && siret.length !== 14) { c.error = 'Le SIRET doit comporter 14 chiffres.'; render(); return; }
  c.saving = true; c.error = null; render();
  try {
    const sb = supa();
    const now = new Date().toISOString();
    const { data: maxRow } = await sb.from('CLIENT').select('IDVu').order('IDVu', { ascending: false }).limit(1).maybeSingle();
    const nextIDVu = (maxRow && maxRow.IDVu != null ? Number(maxRow.IDVu) : 0) + 1;
    const payload = {
      IDVu: nextIDVu, idmultivu: 1,
      CIVILITE: d.CIVILITE || null, NOM: String(d.NOM).trim(), SIRET: siret ? Number(siret) : null,
      ADRESSE: d.ADRESSE || null, code_postal: d.code_postal || null, ville: d.ville || null,
      CP_VILLE: [d.code_postal, d.ville].filter(Boolean).join(' ') || null,
      adresse_label: d.adresse_label || null, adresse_source: d.adresse_source || 'manual',
      adresse_status: d.adresse_status || null,
      CreationDate: now, UpdateDate: now,
      ID_VENDEUR_CREATION: viewerId != null ? String(viewerId) : null,
      ID_VENDEUR_UPDATE: viewerId != null ? String(viewerId) : null
    };
    const { data: inserted, error } = await sb.from('CLIENT').insert(payload).select('IDVu, CIVILITE, NOM, SIRET').single();
    if (error) throw error;
    if (siret) {
      try { await sb.functions.invoke(EDGE_FN_SIRENE_UPSERT, { body: { siret: String(siret), idvu: String(nextIDVu), setPrimary: true } }); }
      catch (eLink) { console.warn('[entr] sirene-upsert (non bloquant):', eLink && eLink.message); }
    }
    state.modal.selected = { IDVu: Number(inserted.IDVu), nom: societeName(inserted) || ('Société #' + inserted.IDVu), siret: inserted.SIRET ? String(inserted.SIRET) : '' };
    state.modal.create = null;
    render();
  } catch (e) {
    console.error('[entr] création société', e);
    c.saving = false; c.error = (e && e.message) ? e.message : String(e); render();
  }
}

// --- Attacher / Détacher ----------------------------------------------------
async function doAttach() {
  if (!state.modal || !state.modal.selected) return;
  const m = state.modal;
  if (!m.form.type) { m.error = 'Le type de rattachement est obligatoire.'; render(); return; }
  m.saving = true; m.error = null; render();
  try {
    const r = await supa().rpc('attach_entreprise', {
      p_id_societe: m.selected.IDVu,
      p_id_particulier: state.idParticulier,
      p_type: m.form.type,
      p_fonction: m.form.fonction || null,
      p_date_debut: m.form.date_debut || null,
      p_commentaire: m.form.commentaire || null,
      p_id_user: viewerId
    });
    if (r.error) throw r.error;
    state.modal = null;
    await loadList();
  } catch (e) {
    console.error('[entr] attach_entreprise', e);
    m.saving = false; m.error = (e && e.message) ? e.message : String(e); render();
  }
}
async function doDetach(idEntreprise) {
  const fw = wwLib.getFrontWindow ? wwLib.getFrontWindow() : window;
  if (!fw.confirm('Détacher cette entreprise du client ?')) return;
  try {
    const r = await supa().rpc('detach_rattachement', { p_id_entreprise: Number(idEntreprise) });
    if (r.error) throw r.error;
    await loadList();
  } catch (e) {
    console.error('[entr] detach_rattachement', e);
  }
}

// --- Icônes (SVG inline) ----------------------------------------------------
const I = {
  building: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21V12h6v9"/></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  unlink: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 13l-2 2a3 3 0 0 1-4-4l2-2"/><path d="M15 11l2-2a3 3 0 0 0-4-4l-2 2"/><line x1="3" y1="3" x2="21" y2="21"/></svg>',
  link: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  back: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  spin: '<span class="er-spin"></span>'
};

const STYLE = `<style>
#oropra-entreprise-rattachement{font-family:"Nunito Sans",system-ui,sans-serif;color:#2a5ea9}
#oropra-entreprise-rattachement *{box-sizing:border-box}
#oropra-entreprise-rattachement .er-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:12px}
#oropra-entreprise-rattachement .er-head-t{font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:#7a98c5;font-weight:700;display:flex;align-items:center;gap:8px}
#oropra-entreprise-rattachement .er-count{background:#e6f1fb;color:#2a5ea9;border-radius:10px;padding:1px 8px;font-size:11px}
#oropra-entreprise-rattachement .er-btn{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:6px;font-size:12.5px;font-weight:600;cursor:pointer;border:1px solid transparent;font-family:inherit}
#oropra-entreprise-rattachement .er-btn-primary{background:#53bda7;color:#fff;border-color:#53bda7}
#oropra-entreprise-rattachement .er-btn-primary:disabled{background:#a9d9cd;border-color:#a9d9cd;cursor:not-allowed}
#oropra-entreprise-rattachement .er-btn-ghost{background:transparent;color:#2a5ea9;border-color:#2a5ea9}
#oropra-entreprise-rattachement .er-list{display:flex;flex-direction:column;gap:8px}
#oropra-entreprise-rattachement .er-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #eef3fb;border-radius:8px}
#oropra-entreprise-rattachement .er-row-ic{width:32px;height:32px;border-radius:7px;background:#f2f6fc;color:#2a5ea9;display:flex;align-items:center;justify-content:center;flex-shrink:0}
#oropra-entreprise-rattachement .er-row-main{flex:1;min-width:0}
#oropra-entreprise-rattachement .er-row-name{font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#oropra-entreprise-rattachement .er-row-sub{font-size:11px;color:#7a98c5;margin-top:1px}
#oropra-entreprise-rattachement .er-badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;white-space:nowrap;background:#f0f2f5;color:#5f5e5a}
#oropra-entreprise-rattachement .er-badge.b-gerant{background:#e1f5ee;color:#0f6e56}
#oropra-entreprise-rattachement .er-badge.b-assoc{background:#e6f1fb;color:#0c447c}
#oropra-entreprise-rattachement .er-badge.b-cond{background:#faeeda;color:#854f0b}
#oropra-entreprise-rattachement .er-row-date{font-size:11px;color:#8aa3c3;white-space:nowrap}
#oropra-entreprise-rattachement .er-ic{width:30px;height:30px;border-radius:6px;border:none;background:transparent;color:#7a98c5;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
#oropra-entreprise-rattachement .er-ic:hover{background:#fcebeb;color:#c63a3a}
#oropra-entreprise-rattachement .er-empty{padding:34px 16px;text-align:center;color:#8aa3c3;font-size:13px}
#oropra-entreprise-rattachement .er-overlay{position:fixed;inset:0;background:rgba(42,94,169,.35);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto}
#oropra-entreprise-rattachement .er-modal{background:#fff;border-radius:12px;width:100%;max-width:560px;box-shadow:0 20px 60px rgba(0,0,0,.18);display:flex;flex-direction:column;max-height:calc(100vh - 80px)}
#oropra-entreprise-rattachement .er-modal-h{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #f0f4fa}
#oropra-entreprise-rattachement .er-modal-t{font-size:16px;font-weight:700}
#oropra-entreprise-rattachement .er-modal-b{padding:18px 20px;overflow-y:auto;display:flex;flex-direction:column;gap:10px}
#oropra-entreprise-rattachement .er-modal-f{display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;border-top:1px solid #f0f4fa}
#oropra-entreprise-rattachement .er-step{font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#7a98c5;font-weight:700;margin-top:4px}
#oropra-entreprise-rattachement .er-search{display:flex;align-items:center;gap:8px;border:1px solid #d9e3f2;border-radius:6px;padding:10px 12px;color:#7a98c5}
#oropra-entreprise-rattachement .er-search input{border:none;outline:none;flex:1;font-family:inherit;color:#2a5ea9;font-size:13px;background:transparent}
#oropra-entreprise-rattachement .er-drop{border:1px solid #d9e3f2;border-radius:6px;overflow:hidden}
#oropra-entreprise-rattachement .er-drop-item{padding:10px 12px;font-size:13px;color:#2a5ea9;border-bottom:1px solid #f0f4fa;cursor:pointer}
#oropra-entreprise-rattachement .er-drop-item:last-child{border-bottom:none}
#oropra-entreprise-rattachement .er-drop-item:hover{background:#f2f6fc}
#oropra-entreprise-rattachement .er-drop-sub{font-size:11px;color:#7a98c5;margin-top:2px}
#oropra-entreprise-rattachement .er-drop-create{padding:10px 12px;font-size:12.5px;color:#53bda7;font-weight:600;display:flex;align-items:center;gap:6px;cursor:pointer;background:#f7fdfb}
#oropra-entreprise-rattachement .er-chip{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid #9ad9c5;background:#e1f5ee;border-radius:8px;padding:11px 14px}
#oropra-entreprise-rattachement .er-chip-name{font-weight:700;font-size:13px;color:#0f6e56}
#oropra-entreprise-rattachement .er-chip-sub{font-size:11px;color:#3a8a76;margin-top:1px}
#oropra-entreprise-rattachement .er-chip-x{background:none;border:none;color:#0f6e56;cursor:pointer;font-size:12px;font-weight:600}
#oropra-entreprise-rattachement .er-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px}
#oropra-entreprise-rattachement .er-f{display:flex;flex-direction:column;gap:4px}
#oropra-entreprise-rattachement .er-f-full{grid-column:1 / -1}
#oropra-entreprise-rattachement .er-f label{font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#7a98c5;font-weight:600}
#oropra-entreprise-rattachement .er-req{color:#c63a3a}
#oropra-entreprise-rattachement .er-input,#oropra-entreprise-rattachement .er-select,#oropra-entreprise-rattachement .er-ta{border:1px solid #d9e3f2;border-radius:6px;padding:10px 12px;font-size:13px;color:#2a5ea9;outline:none;font-family:inherit;width:100%;background:#fff}
#oropra-entreprise-rattachement .er-input:focus,#oropra-entreprise-rattachement .er-select:focus,#oropra-entreprise-rattachement .er-ta:focus{border-color:#2a5ea9}
#oropra-entreprise-rattachement .er-ta{resize:vertical;min-height:58px}
#oropra-entreprise-rattachement .er-err{color:#c63a3a;font-size:12.5px;background:#fdf0f0;border:1px solid #f5d0d0;border-radius:6px;padding:10px 12px}
#oropra-entreprise-rattachement .er-status{font-size:11px;color:#53bda7;display:inline-flex;align-items:center;gap:5px;margin-top:2px}
#oropra-entreprise-rattachement .er-spin{display:inline-block;width:12px;height:12px;border:2px solid #e3edf9;border-top-color:#53bda7;border-radius:50%;animation:er-spin .8s linear infinite}
@keyframes er-spin{to{transform:rotate(360deg)}}
@media (max-width:560px){
  #oropra-entreprise-rattachement .er-grid{grid-template-columns:1fr}
  #oropra-entreprise-rattachement .er-head{flex-wrap:wrap}
  #oropra-entreprise-rattachement .er-head .er-btn-primary{flex:1 1 100%;justify-content:center}
  #oropra-entreprise-rattachement .er-row{flex-wrap:wrap}
  #oropra-entreprise-rattachement .er-row-main{flex:1 1 auto;min-width:140px}
  #oropra-entreprise-rattachement .er-overlay{padding:16px 10px}
  #oropra-entreprise-rattachement .er-modal{max-height:calc(100vh - 32px)}
  #oropra-entreprise-rattachement .er-modal-b{padding:16px}
}
</style>`;

// --- Rendu ------------------------------------------------------------------
function badgeCls(type) { return TYPE_CLS[type] || ''; }
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00');
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('fr-FR', { month: '2-digit', year: 'numeric' });
}

function renderList() {
  if (state.loading || state.list === null) return '<div class="er-empty">Chargement…</div>';
  if (state.error) return `<div class="er-empty">Erreur : ${esc(state.error)}</div>`;
  if (!state.list.length) return '<div class="er-empty">Aucune entreprise rattachée. Cliquez « Rattacher à une entreprise » pour en ajouter une.</div>';
  let h = '<div class="er-list">';
  for (const r of state.list) {
    h += `<div class="er-row">
      <span class="er-row-ic">${I.building}</span>
      <div class="er-row-main">
        <div class="er-row-name">${esc(r.nom)}</div>
        <div class="er-row-sub">${r.siret ? 'SIRET ' + esc(r.siret) : 'SIRET —'}${r.fonction ? ' · ' + esc(r.fonction) : ''}</div>
      </div>
      ${r.type ? `<span class="er-badge ${badgeCls(r.type)}">${esc(r.type)}</span>` : ''}
      ${r.date_debut ? `<span class="er-row-date">depuis ${esc(fmtDate(r.date_debut))}</span>` : ''}
      <button class="er-ic" data-detach="${r.id_entreprise}" title="Détacher" aria-label="Détacher">${I.unlink}</button>
    </div>`;
  }
  h += '</div>';
  return h;
}

function renderSearchForm(m) {
  const sf = (label, field, ph) => `<div class="er-f"><label>${esc(label)}</label><input class="er-input" data-sf="${field}" value="${esc(m.search[field])}" placeholder="${esc(ph || '')}" autocomplete="off"></div>`;
  let h = '<div class="er-grid">';
  h += sf('Raison sociale', 'NOM');
  h += sf('SIRET', 'SIRET');
  h += sf('Email', 'EMAIL');
  h += sf('ID client', 'IDVu');
  h += '</div>';
  h += `<div style="display:flex;justify-content:flex-end;gap:8px"><button class="er-btn er-btn-ghost" data-clear-search="1">Effacer</button><button class="er-btn er-btn-primary" data-run-search="1">${I.search} Rechercher</button></div>`;
  if (m.searching) { h += '<div class="er-status">' + I.spin + ' Recherche…</div>'; return h; }
  if (!m.searched) return h;
  if (m.results.length) {
    h += '<div class="er-drop">';
    for (let i = 0; i < m.results.length; i++) {
      const r = m.results[i];
      const nom = societeName(r) || ('Société #' + r.IDVu);
      const sub = [r.SIRET ? String(r.SIRET) : '', [r.code_postal, r.ville].filter(Boolean).join(' '), r.EMAIL || ''].filter(Boolean).join(' — ');
      h += `<div class="er-drop-item" data-pick="${i}"><div style="font-weight:700">${esc(nom)}</div><div class="er-drop-sub">${esc(sub)}</div></div>`;
    }
    h += '</div>';
    if (m.totalCount > m.results.length) h += `<div class="er-status" style="color:#8aa3c3">${m.totalCount} résultats — affinez la recherche.</div>`;
    h += `<div class="er-drop-create" data-open-create="1" style="border:1px solid #d9e3f2;border-radius:6px">${I.plus} Pas la bonne ? Créer une entreprise</div>`;
  } else {
    h += `<div class="er-drop"><div class="er-drop-create" data-open-create="1">${I.plus} Aucune entreprise trouvée — créer une entreprise</div></div>`;
  }
  return h;
}

function renderModal() {
  if (!state.modal) return '';
  const m = state.modal;
  let body = '';
  if (m.error) body += `<div class="er-err">${esc(m.error)}</div>`;

  body += '<div class="er-step">1 · Entreprise</div>';
  if (m.create) {
    body += renderCreate(m.create);
  } else if (m.selected) {
    body += `<div class="er-chip"><div><div class="er-chip-name">${esc(m.selected.nom)}</div><div class="er-chip-sub">${m.selected.siret ? 'SIRET ' + esc(m.selected.siret) : 'IDVu ' + m.selected.IDVu}</div></div><button class="er-chip-x" data-clear-selected="1">Changer</button></div>`;
  } else {
    body += renderSearchForm(m);
  }

  // Étape 2 : visible une fois la société choisie
  if (m.selected && !m.create) {
    body += '<div class="er-step">2 · Rattachement</div>';
    body += '<div class="er-grid">';
    body += `<div class="er-f"><label>Type <span class="er-req">*</span></label><select class="er-select" data-ff="type">${TYPES.map(t => `<option value="${esc(t)}"${m.form.type === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
    body += `<div class="er-f"><label>Fonction</label><input class="er-input" data-ff="fonction" value="${esc(m.form.fonction)}" placeholder="ex. DAF" autocomplete="off"></div>`;
    body += `<div class="er-f"><label>Date de début</label><input class="er-input" type="date" data-ff="date_debut" value="${esc(m.form.date_debut)}"></div>`;
    body += '<div class="er-f"></div>';
    body += `<div class="er-f er-f-full"><label>Commentaire</label><textarea class="er-ta" data-ff="commentaire" placeholder="Optionnel">${esc(m.form.commentaire)}</textarea></div>`;
    body += '</div>';
  }

  const canAttach = m.selected && !m.create;
  let footer = `<button class="er-btn er-btn-ghost" data-close-modal="1">Annuler</button>`;
  footer += `<button class="er-btn er-btn-primary" data-attach="1"${(!canAttach || m.saving) ? ' disabled' : ''}>${m.saving ? I.spin : I.link} <span>Rattacher</span></button>`;

  return `<div class="er-overlay" data-overlay="1"><div class="er-modal">
    <div class="er-modal-h"><div class="er-modal-t">Rattacher à une entreprise</div><button class="er-ic" data-close-modal="1" aria-label="Fermer">${I.x}</button></div>
    <div class="er-modal-b">${body}</div>
    <div class="er-modal-f">${footer}</div>
  </div></div>`;
}

function renderCreate(c) {
  let h = '';
  if (c.error) h += `<div class="er-err">${esc(c.error)}</div>`;
  h += `<div class="er-search">${I.search}<input data-cf="sirene" value="${esc(c.sireneQ || '')}" placeholder="Rechercher dans SIRENE (SIRET, SIREN, raison sociale)…" autocomplete="off"></div>`;
  if (c.sireneLoading) h += '<div class="er-status">' + I.spin + ' Recherche SIRENE…</div>';
  if (c.sireneResults && c.sireneResults.length) {
    h += '<div class="er-drop">';
    for (let i = 0; i < c.sireneResults.length; i++) {
      const s = c.sireneResults[i];
      h += `<div class="er-drop-item" data-pick-sirene="${i}"><div style="font-weight:700">${esc(s.raison_sociale || '(sans dénomination)')}</div><div class="er-drop-sub">${esc(s.siret || '')} — ${esc(s.commune || '')} — ${esc(s.statut || '')}</div></div>`;
    }
    h += '</div>';
  }
  h += '<div class="er-grid">';
  h += `<div class="er-f er-f-full"><label>Raison sociale <span class="er-req">*</span></label><input class="er-input" data-cf="NOM" value="${esc(c.data.NOM)}" autocomplete="off"></div>`;
  h += `<div class="er-f"><label>SIRET</label><input class="er-input" data-cf="SIRET" value="${esc(c.data.SIRET)}" placeholder="14 chiffres" autocomplete="off"></div>`;
  h += `<div class="er-f"><label>Ville</label><input class="er-input" data-cf="ville" value="${esc(c.data.ville)}" autocomplete="off"></div>`;
  if (c.data.adresse_status === 'verified') h += `<div class="er-f er-f-full"><div class="er-status">✓ Établissement SIRENE</div></div>`;
  h += '</div>';
  h += `<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
    <button class="er-btn er-btn-ghost" data-cancel-create="1">${I.back} Retour</button>
    <button class="er-btn er-btn-primary" data-save-create="1"${c.saving ? ' disabled' : ''}>${c.saving ? I.spin : I.plus} <span>Créer et sélectionner</span></button>
  </div>`;
  return h;
}

function render() {
  const root = getRoot(); if (!root) return;
  const active = doc.activeElement;
  let focusAttr = null, focusKey = null;
  if (active && active.getAttribute) {
    for (const k of ['data-sf', 'data-cf', 'data-ff', 'data-ef']) { const v = active.getAttribute(k); if (v != null) { focusAttr = k; focusKey = v; break; } }
  }
  const cursor = focusKey && active && typeof active.selectionStart === 'number' ? active.selectionStart : null;

  if (!isParticulier() && state.modal == null) {
    root.innerHTML = STYLE + '<div class="er-empty">Le rattachement d\'entreprise se gère depuis une fiche particulier.</div>';
    return;
  }

  let h = STYLE;
  h += `<div class="er-head"><div class="er-head-t">Entreprises rattachées${state.list && state.list.length ? ' <span class="er-count">' + state.list.length + '</span>' : ''}</div>`;
  h += `<button class="er-btn er-btn-primary" data-open-modal="1">${I.plus} Rattacher à une entreprise</button></div>`;
  h += renderList();
  h += renderModal();
  root.innerHTML = h;
  bindEvents();

  if (focusKey) {
    const el = root.querySelector(`[${focusAttr}="${focusKey}"]`);
    if (el) { el.focus(); if (cursor != null && el.setSelectionRange) { try { el.setSelectionRange(cursor, cursor); } catch (e) {} } }
  }
}

function bindEvents() {
  const root = getRoot(); if (!root) return;
  const on = (sel, ev, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn));

  on('[data-open-modal]', 'click', openModal);
  on('[data-close-modal]', 'click', closeModal);
  on('[data-overlay]', 'click', (e) => { if (e.target === e.currentTarget) closeModal(); });
  on('[data-detach]', 'click', (e) => doDetach(e.currentTarget.getAttribute('data-detach')));
  on('[data-clear-selected]', 'click', clearSelected);
  on('[data-open-create]', 'click', openCreate);
  on('[data-cancel-create]', 'click', cancelCreate);
  on('[data-save-create]', 'click', saveCreate);
  on('[data-attach]', 'click', doAttach);

  on('[data-pick]', 'click', (e) => {
    const i = Number(e.currentTarget.getAttribute('data-pick'));
    if (state.modal && state.modal.results[i]) selectCompany(state.modal.results[i]);
  });
  on('[data-pick-sirene]', 'click', (e) => {
    const i = Number(e.currentTarget.getAttribute('data-pick-sirene'));
    if (state.modal && state.modal.create && state.modal.create.sireneResults[i]) pickSirene(state.modal.create.sireneResults[i]);
  });

  on('[data-run-search]', 'click', runSearch);
  on('[data-clear-search]', 'click', clearSearch);
  root.querySelectorAll('[data-sf]').forEach(el => {
    const f = el.getAttribute('data-sf');
    el.addEventListener('input', () => setSearchField(f, el.value));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });
  });
  const sirene = root.querySelector('[data-cf="sirene"]');
  if (sirene) sirene.addEventListener('input', () => onSireneInput(sirene.value));

  // Champs création (sauf sirene) : écriture sans re-render
  root.querySelectorAll('[data-cf]').forEach(el => {
    const f = el.getAttribute('data-cf');
    if (f === 'sirene') return;
    el.addEventListener('input', () => { if (state.modal && state.modal.create) state.modal.create.data[f] = el.value; });
  });
  // Champs rattachement : écriture sans re-render
  root.querySelectorAll('[data-ff]').forEach(el => {
    const f = el.getAttribute('data-ff');
    const ev = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, () => { if (state.modal) state.modal.form[f] = el.value; });
  });
}

// --- Go ---------------------------------------------------------------------
window.__renderEntr = render;
loadList();

(function ensureRenderedEntr() {
  // Recharge si la fiche change de client (sans remount).
  let last = currentIdvu();
  const iv = setInterval(() => {
    const id = currentIdvu();
    if (id !== last) { last = id; state.list = null; state.modal = null; loadList(); }
    const root = getRoot();
    if (root && !root.querySelector('.er-head') && state.modal == null) render();
  }, 600);
  setTimeout(() => clearInterval(iv), 600000);
})();

}
});
