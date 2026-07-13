// ============================================================================
//  OBJECTIFS — module One Data (OD.define)  v1 (checklist)
//  Rendu dans __anchor ; SUPABASE_URL/KEY -> ctx.tenant ; getUserJwt() ->
//  session du client runtime ; doc -> __anchor.ownerDocument. User = oropraUser.
//  Périmètre 100% v_user_perimeter (VAR_SITES retirée). 0 vestige.
// ============================================================================
OD.define('objectifs', {
  async mount(__anchor, ctx) {
    const doc = __anchor.ownerDocument || document;
    __anchor.id = 'obj-root';
    const SUPABASE_URL = ctx.tenant.supabase_url;
    const SUPABASE_KEY = ctx.tenant.supabase_anon_key;
    let __odJwt = null;
    try { __odJwt = (await ctx.supabase.auth.getSession()).data?.session?.access_token || null; } catch (e) {}
(function () {
  var d = doc;
  if (!d.getElementById('obj-responsive-css')) {
    var st = d.createElement('style');
    st.id = 'obj-responsive-css';
    st.textContent =
      '#obj-root{max-width:100vw;overflow-x:hidden;box-sizing:border-box}' +
      '#obj-root .obj-tree{display:block;overflow-x:auto}' +
      '@media(max-width:767px){#obj-root{padding:0 10px}}';
    (d.head || d.documentElement).appendChild(st);
  }
})();
// ============================================================================
// OBJECTIFS v6 — atelier de définition du mois (brouillon -> Enregistrer)
//   Chef : arbre périmètre + cap d'équipe (commandes + taux M-1 -> cibles) +
//          4 modes de répartition (tous indicateurs) + ajustement + commit unique.
//   Vendeur (rôle 4) : tableau de marche (réalisé vs prorata). Rôle 5 : lecture.
//   Réalisé/hiérarchie : v_performances_v2. Édition : OBJECTIF (PATCH au commit).
//   Racine : <div id="obj-root"></div>
// ============================================================================

// SUPABASE_URL défini dans le header (ctx.tenant.supabase_url)
// SUPABASE_KEY défini dans le header (ctx.tenant.supabase_anon_key)
function getUserJwt() { return __odJwt; }   // JWT de session (client runtime)

let perimSites = [];
// Périmètre dérivé de v_user_perimeter (ne dépend plus de VAR_SITES, non fiable depuis la migration).
async function loadPerimeter() {
  try {
    const uid = (((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser || {}).ID_User;
    if (uid == null) return;
    const jwt = getUserJwt();
    const res = await fetch(SUPABASE_URL + '/rest/v1/v_user_perimeter?viewer_id_user=eq.' + uid + '&select=id_site',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + (jwt || SUPABASE_KEY) } });
    if (!res.ok) { console.error('[obj] v_user_perimeter', res.status); return; }
    const rows = await res.json();
    if (Array.isArray(rows)) perimSites = [...new Set(rows.map(function (r) { return Number(r.id_site) }).filter(function (n) { return !isNaN(n) }))];
  } catch (e) { console.error('[obj] perimeter', e); }
}
function getSitesIds() {
  return perimSites;   // périmètre depuis v_user_perimeter (VAR_SITES retirée)
}

const PERF_VIEW = 'v_performances_v2'
const REAL_FIELDS = { commandes: 'commandes_realisees', financements: 'financements_realises', contrat_service: 'contrats_service_realises', waxoyl: 'waxoyls_realises', gravage: 'gravages_realises' }
const FIELDS = ['commandes', 'gravage', 'financements', 'contrat_service', 'waxoyl', 'contacts_jour']
const SECONDARY = [{ k: 'financements', label: 'Financement' }, { k: 'contrat_service', label: 'CS' }, { k: 'waxoyl', label: 'Waxoyl' }, { k: 'gravage', label: 'Gravage' }]

const userConnected = ((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser
const role = Number(userConnected?.ID_Role)
const canEdit = !([4, 5].includes(role))
const isVendeur = (role === 4)
const myId = userConnected?.ID_User

// doc défini dans le header (__anchor.ownerDocument)
const root = __anchor
if (!root) return

const now = new Date()
const state = window.__objState || {
  annee: now.getFullYear(), mois: now.getMonth() + 1, vnvo: 'VNVO',
  methode: 'manuel', cap: null, presence: {},
  sel: { level: 'all', reseau: null, affaire: null, id_site: null, label: 'Tout le périmètre' },
  expanded: {}, _saveMsg: null
}
if (!state.sel) state.sel = { level: 'all', reseau: null, affaire: null, id_site: null, label: 'Tout le périmètre' }
if (!state.expanded) state.expanded = {}
if (!state.presence) state.presence = {}
if (state.atelierOpen === undefined) state.atelierOpen = (role === 3)
window.__objState = state

let data = [], realCur = {}, realM1 = {}, realOk = true, siteMeta = {}, userMeta = {}, originalSnap = {}, loading = false
const MOIS_NOMS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const GKEYS = [{ k: 'commandes', label: 'Commandes' }, { k: 'gravage', label: 'Gravages' }, { k: 'financements', label: 'Financements' }, { k: 'contrat_service', label: 'CS' }, { k: 'waxoyl', label: 'Waxoyl' }, { k: 'contacts_jour', label: 'Contacts/j' }]
const KPIS_SUIVI = [{ k: 'commandes', label: 'Commandes' }, { k: 'financements', label: 'Financements' }, { k: 'contrat_service', label: 'Contrat de service' }, { k: 'waxoyl', label: 'Waxoyl' }, { k: 'gravage', label: 'Gravage' }]

// --- nombres / dates ---
function num(v) { if (v == null) return 0; if (typeof v === 'number') return isNaN(v) ? 0 : v; const n = parseFloat(String(v).replace(',', '.').trim()); return isNaN(n) ? 0 : n }
function ymOf(a, m) { return a + '-' + String(m).padStart(2, '0') }
function prevYM(a, m) { let y = a, mo = m - 1; if (mo === 0) { mo = 12; y-- } return { annee: y, mois: mo, ym: ymOf(y, mo) } }
function byFr(a, b) { return String(a).localeCompare(String(b), 'fr') }
function joursOuvres(from, to) { let n = 0; const d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); const e = new Date(to.getFullYear(), to.getMonth(), to.getDate()); while (d <= e) { if (d.getDay() !== 0) n++; d.setDate(d.getDate() + 1) } return n }
function joursOuvresMois(a, m) { return joursOuvres(new Date(a, m - 1, 1), new Date(a, m, 0)) }
function prorataFor(a, m) { const deb = new Date(a, m - 1, 1), fin = new Date(a, m, 0); let cap = fin; const t = new Date(); if (t < cap) cap = t; if (cap < deb) return 0.01; const tot = joursOuvres(deb, fin), ec = joursOuvres(deb, cap); return tot > 0 ? Math.min(1, ec / tot) : 1 }
function joursOuvresRestants(a, m) { const deb = new Date(a, m - 1, 1), fin = new Date(a, m, 0); let s = new Date(); if (s < deb) s = deb; if (s > fin) return 0; return joursOuvres(s, fin) }

// --- fetch ---
async function fetchObjectifs() {
  const sites = getSitesIds()
  let url = SUPABASE_URL + '/rest/v1/v_objectifs?annee=eq.' + state.annee + '&mois=eq.' + state.mois
  if (sites.length) url += '&id_site=in.(' + sites.join(',') + ')'
  const res = await fetch(url, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } })
  let rows = await res.json(); if (!Array.isArray(rows)) rows = []
  if (isVendeur && myId != null) rows = rows.filter(function (r) { return r.id_user == myId })
  return rows
}
async function fetchRealise(ym) {
  const out = {}
  try {
    const sites = getSitesIds()
    let url = SUPABASE_URL + '/rest/v1/' + PERF_VIEW + '?periode_ym=eq.' + ym
    if (sites.length) url += '&id_site=in.(' + sites.join(',') + ')'
    url += '&select=id_user,vn_vo,' + Object.values(REAL_FIELDS).join(',')
    const jwt = getUserJwt()
    const res = await fetch(url, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + (jwt || SUPABASE_KEY) } })
    let rows; try { rows = await res.json() } catch (e) { rows = null }
    if (!res.ok || !Array.isArray(rows)) { console.warn('[objectifs] réalisé ' + ym + ' indisponible', rows); return { ok: false, map: out } }
    for (const r of rows) { const t = (r.vn_vo == null ? '' : String(r.vn_vo).trim().toUpperCase()); const k = String(r.id_user) + '|' + t; if (!out[k]) { out[k] = {}; for (const c of Object.values(REAL_FIELDS)) out[k][c] = 0 } for (const c of Object.values(REAL_FIELDS)) out[k][c] += num(r[c]) }
    return { ok: true, map: out }
  } catch (e) { console.error('Erreur réalisé:', e); return { ok: false, map: out } }
}
async function fetchHierarchy(ym) {
  const sites = {}, users = {}
  try {
    const s = getSitesIds()
    let url = SUPABASE_URL + '/rest/v1/' + PERF_VIEW + '?periode_ym=eq.' + ym
    if (s.length) url += '&id_site=in.(' + s.join(',') + ')'
    url += '&select=id_user,id_site,"RESEAU","AFFAIRE","SITE",nom_complet_affichage,"FONCTION"'
    const jwt = getUserJwt()
    const res = await fetch(url, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + (jwt || SUPABASE_KEY) } })
    if (!res.ok) { console.warn('[objectifs] hiérarchie HTTP ' + res.status); return { sites, users } }
    const rows = await res.json()
    if (Array.isArray(rows)) for (const r of rows) { if (r.id_site != null && !sites[r.id_site]) sites[r.id_site] = { reseau: r.RESEAU || 'Sans réseau', affaire: r.AFFAIRE || 'Sans affaire', site: r.SITE || ('Site ' + r.id_site) }; if (r.id_user != null && !users[r.id_user]) users[r.id_user] = { nom: r.nom_complet_affichage || null, fonction: r.FONCTION || '' } }
    return { sites, users }
  } catch (e) { console.error('Erreur hiérarchie:', e); return { sites, users } }
}

function realiseFor(mapRef, idUser, col) { const types = state.vnvo === 'VNVO' ? ['VN', 'VO'] : [state.vnvo]; let s = 0; for (const t of types) { const e = mapRef[String(idUser) + '|' + t]; if (e) s += num(e[col]) } return s }
function realiseCommandesM1(id) { return realiseFor(realM1, id, REAL_FIELDS.commandes) }
function getUserName(r) { return r.vendeur_nom || (userMeta[r.id_user] && userMeta[r.id_user].nom) || ('Vendeur ' + r.id_user) }
function enrichRows() { for (const r of data) { const sm = siteMeta[r.id_site]; r._reseau = (sm && sm.reseau) || 'Sans réseau'; r._affaire = (sm && sm.affaire) || 'Sans affaire'; r._site = (sm && sm.site) || ('Site ' + r.id_site); r._vendeur = getUserName(r) } }

function paceStyle(re, ob, pr) { const r = num(re), o = num(ob); if (o <= 0) return { bg: '#f0f2f5', col: '#8a96a8', bar: '#dde2ea', txt: 'pas d\u2019objectif' }; const at = r / o; if (at >= pr) return { bg: '#e1f5ee', col: '#085041', bar: '#1d9e75', txt: 'dans les temps' }; if (at >= pr - 0.15) return { bg: '#faeeda', col: '#633806', bar: '#ef9f27', txt: 'léger retard' }; return { bg: '#fcebeb', col: '#791f1f', bar: '#e24b4a', txt: 'en retard' } }

// --- filtres / périmètre ---
function visibleRows() { const types = state.vnvo === 'VNVO' ? ['VN', 'VO'] : [state.vnvo]; return data.filter(function (r) { return types.indexOf(String(r.vn_vo).toUpperCase()) !== -1 }) }
function scopeRows() { const rows = visibleRows(), s = state.sel; if (!s || s.level === 'all') return rows; if (s.level === 'reseau') return rows.filter(function (r) { return r._reseau === s.reseau }); if (s.level === 'affaire') return rows.filter(function (r) { return r._reseau === s.reseau && r._affaire === s.affaire }); if (s.level === 'site') return rows.filter(function (r) { return String(r.id_site) === String(s.id_site) }); if (s.level === 'sitetype') return rows.filter(function (r) { return String(r.id_site) === String(s.id_site) && String(r.vn_vo).toUpperCase() === s.type }); return rows }

// --- brouillon ---
function rowKey(r) { return r.id_objectif != null ? ('o' + r.id_objectif) : (r.id_user + '|' + r.id_site + '|' + String(r.vn_vo).toUpperCase() + '|' + (r.marque || '')) }
function snapshot() { originalSnap = {}; data.forEach(function (r) { const o = {}; FIELDS.forEach(function (f) { o[f] = num(r[f]) }); originalSnap[rowKey(r)] = o }) }
function rowDirty(r) { const o = originalSnap[rowKey(r)]; if (!o) return true; for (const f of FIELDS) if (num(r[f]) !== o[f]) return true; return false }
function dirtyRows() { return data.filter(rowDirty) }
function isDirty() { return data.some(rowDirty) }
function resetDraft() { data.forEach(function (r) { const o = originalSnap[rowKey(r)]; if (o) FIELDS.forEach(function (f) { r[f] = o[f] }) }); state.methode = 'manuel'; state.cap = null; state._saveMsg = null; renderObj() }
async function saveDraft(btn) {
  const rows = dirtyRows(); if (!rows.length) return
  const old = btn.textContent; btn.disabled = true; btn.textContent = 'Enregistrement…'
  const withId = rows.filter(function (r) { return r.id_objectif != null }), without = rows.filter(function (r) { return r.id_objectif == null })
  let okN = 0, errN = 0
  await Promise.all(withId.map(async function (r) {
    const body = {}; FIELDS.forEach(function (f) { body[f] = parseInt(r[f]) || 0 })
    try { const res = await fetch(SUPABASE_URL + '/rest/v1/OBJECTIF?id_objectif=eq.' + r.id_objectif, { method: 'PATCH', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify(body) }); if (res.ok) { okN++; const o = {}; FIELDS.forEach(function (f) { o[f] = num(r[f]) }); originalSnap[rowKey(r)] = o } else { errN++; console.error('PATCH OBJECTIF', r.id_objectif, res.status) } } catch (e) { errN++; console.error(e) }
  }))
  state._saveMsg = (errN ? ('Enregistré : ' + okN + ' · ' + errN + ' en erreur') : ('Objectifs enregistrés (' + okN + ')')) + (without.length ? (' · ' + without.length + ' sans id_objectif non créés') : '')
  btn.textContent = old; btn.disabled = false; renderObj()
}

// --- cap d'équipe ---
function scopeM1(col) { const users = [...new Set(scopeRows().map(function (r) { return r.id_user }))]; return users.reduce(function (a, u) { return a + realiseFor(realM1, u, col) }, 0) }
function ensureCapDefaults() {
  const rows = scopeRows()
  if (state.cap == null) state.cap = { commandes: null, taux: {}, contacts: null }
  if (state.cap.taux == null) state.cap.taux = {}
  if (state.cap.commandes == null) state.cap.commandes = rows.reduce(function (a, r) { return a + num(r.commandes) }, 0)
  const m1c = scopeM1(REAL_FIELDS.commandes)
  SECONDARY.forEach(function (s) { if (state.cap.taux[s.k] == null) { let t = 0; if (realOk && m1c > 0) t = Math.round(scopeM1(REAL_FIELDS[s.k]) / m1c * 100); else { const oc = rows.reduce(function (a, r) { return a + num(r.commandes) }, 0), os = rows.reduce(function (a, r) { return a + num(r[s.k]) }, 0); t = oc > 0 ? Math.round(os / oc * 100) : 0 } state.cap.taux[s.k] = Math.max(0, Math.min(200, t)) } })
  if (state.cap.contacts == null) { const f = {}; rows.forEach(function (r) { const v = num(r.contacts_jour); f[v] = (f[v] || 0) + 1 }); let best = 0, bc = -1; Object.keys(f).forEach(function (k) { if (f[k] > bc) { bc = f[k]; best = Number(k) } }); state.cap.contacts = best }
}
function cibleOf(k) { return Math.round(Math.max(0, parseInt(state.cap.commandes) || 0) * (num(state.cap.taux[k]) / 100)) }
function allocate(target, weights) { const n = weights.length; if (target <= 0 || n === 0) return new Array(n).fill(0); const sw = weights.reduce(function (a, b) { return a + b }, 0); if (sw <= 0) { const base = Math.floor(target / n), rem = target - base * n; const r = []; for (let i = 0; i < n; i++)r.push(base + (i < rem ? 1 : 0)); return r } const raw = weights.map(function (w) { return target * w / sw }); const res = raw.map(function (x) { return Math.floor(x) }); let rem = target - res.reduce(function (a, b) { return a + b }, 0); const ord = raw.map(function (x, i) { return { i: i, f: x - Math.floor(x) } }).sort(function (a, b) { return b.f - a.f }); for (let k = 0; k < rem; k++)res[ord[k % n].i]++; return res }
function rowWeights(rows, mode) {
  if (mode === 'equitable') return rows.map(function () { return 1 })
  if (mode === 'm1') { const c = {}; rows.forEach(function (r) { c[r.id_user] = (c[r.id_user] || 0) + 1 }); return rows.map(function (r) { const m1 = realiseCommandesM1(r.id_user); return m1 > 0 ? m1 / c[r.id_user] : 0 }) }
  if (mode === 'presence') { const c = {}; rows.forEach(function (r) { c[r.id_user] = (c[r.id_user] || 0) + 1 }); return rows.map(function (r) { const p = num(state.presence[r.id_user]); return p > 0 ? p / c[r.id_user] : 0 }) }
  return rows.map(function () { return 1 })
}
function repartir() {
  if (state.methode === 'manuel') return
  const rows = scopeRows(); if (!rows.length) return
  ensureCapDefaults()
  const w = rowWeights(rows, state.methode)
  const cmd = allocate(Math.max(0, parseInt(state.cap.commandes) || 0), w); rows.forEach(function (r, i) { r.commandes = cmd[i] })
  SECONDARY.forEach(function (s) { const arr = allocate(cibleOf(s.k), w); rows.forEach(function (r, i) { r[s.k] = arr[i] }) })
  const c = Math.max(0, parseInt(state.cap.contacts) || 0); rows.forEach(function (r) { r.contacts_jour = c })
  state._saveMsg = null; renderObj()
}
async function reconduireM1Draft(btn) {
  const rows = scopeRows(); if (!rows.length) return
  const old = btn.textContent; btn.disabled = true; btn.textContent = 'Chargement…'
  const p = prevYM(state.annee, state.mois)
  try {
    const u = [...new Set(rows.map(function (r) { return r.id_user }))].join(','), si = [...new Set(rows.map(function (r) { return r.id_site }))].join(',')
    const jwt = getUserJwt()
    const res = await fetch(SUPABASE_URL + '/rest/v1/OBJECTIF?annee=eq.' + p.annee + '&mois=eq.' + p.mois + '&id_site=in.(' + si + ')&id_user=in.(' + u + ')&select=id_user,id_site,vn_vo,' + FIELDS.join(','), { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + (jwt || SUPABASE_KEY) } })
    const prev = await res.json()
    if (!Array.isArray(prev) || !prev.length) { btn.textContent = 'Aucun objectif M-1'; setTimeout(function () { btn.textContent = old; btn.disabled = false }, 2000); return }
    rows.forEach(function (cur) { const pr = prev.find(function (x) { return x.id_user === cur.id_user && String(x.id_site) === String(cur.id_site) && String(x.vn_vo).toUpperCase() === String(cur.vn_vo).toUpperCase() }); if (pr) FIELDS.forEach(function (f) { if (pr[f] !== undefined) cur[f] = pr[f] }) })
    state._saveMsg = null; renderObj()
  } catch (e) { console.error('Reconduction:', e); btn.textContent = 'Erreur'; setTimeout(function () { btn.textContent = old; btn.disabled = false }, 2000) }
}

// --- sélecteurs ---
function makeSelectors(doc) {
  const bar = doc.createElement('div'); bar.className = 'obj-bar'; bar.style.cssText = 'display:flex;gap:10px;justify-content:center;margin-bottom:18px;flex-wrap:wrap'
  function ss(s) { s.style.cssText = "padding:8px 14px;border-radius:8px;border:0.5px solid #acc5e4;background:#fff;color:#2a5ea9;font-size:13px;cursor:pointer;min-width:140px;outline:none;font-family:'Nunito Sans',sans-serif" }
  function reset() { state.cap = null; state.methode = 'manuel'; state.sel = { level: 'all', reseau: null, affaire: null, id_site: null, label: 'Tout le périmètre' } }
  const a = doc.createElement('select'); a.className = 'obj-sel-annee'; ss(a)
  for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 10; y++) { const o = doc.createElement('option'); o.value = y; o.textContent = y; if (y === state.annee) o.selected = true; a.appendChild(o) }
  a.addEventListener('change', function () { state.annee = Number(a.value); reset(); boot() })
  const m = doc.createElement('select'); m.className = 'obj-sel-mois'; ss(m)
  MOIS_NOMS.forEach(function (nom, i) { const o = doc.createElement('option'); o.value = i + 1; o.textContent = nom; if (i + 1 === state.mois) o.selected = true; m.appendChild(o) })
  m.addEventListener('change', function () { state.mois = Number(m.value); reset(); boot() })
  const v = doc.createElement('select'); v.className = 'obj-sel-vnvo'; ss(v)
    ;[['VNVO', 'VN + VO'], ['VN', 'VN'], ['VO', 'VO']].forEach(function (o) { const op = doc.createElement('option'); op.value = o[0]; op.textContent = o[1]; if (o[0] === state.vnvo) op.selected = true; v.appendChild(op) })
  v.addEventListener('change', function () { state.vnvo = v.value; reset(); renderObj() })
  bar.appendChild(a); bar.appendChild(m); bar.appendChild(v); return bar
}

// --- bandeau brouillon ---
function makeDirtyBar(doc) {
  const dirty = isDirty()
  if (!dirty && !state._saveMsg) return null
  const bar = doc.createElement('div'); bar.className = 'obj-dirty'
  if (dirty) {
    bar.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:#faeeda;border:0.5px solid #fac055;border-radius:10px;padding:10px 14px;margin-bottom:16px'
    const t = doc.createElement('span'); t.style.cssText = 'font-size:12px;color:#633806;font-weight:500'; t.textContent = 'Modifications non enregistrées'; bar.appendChild(t)
    const save = doc.createElement('button'); save.style.cssText = 'margin-left:auto;font-size:12px;font-weight:500;border:none;background:#2a5ea9;color:#fff;border-radius:6px;padding:6px 14px;cursor:pointer'; save.textContent = 'Enregistrer les objectifs'; save.addEventListener('click', function () { saveDraft(save) }); bar.appendChild(save)
    const rst = doc.createElement('button'); rst.style.cssText = 'font-size:12px;border:0.5px solid #acc5e4;background:#fff;color:#2a5ea9;border-radius:6px;padding:6px 12px;cursor:pointer'; rst.textContent = 'Réinitialiser'; rst.addEventListener('click', resetDraft); bar.appendChild(rst)
    state._saveMsg = null
  } else {
    bar.style.cssText = 'display:flex;align-items:center;gap:10px;background:#e1f5ee;border:0.5px solid #9ad9c5;border-radius:10px;padding:10px 14px;margin-bottom:16px'
    const t = doc.createElement('span'); t.style.cssText = 'font-size:12px;color:#085041;font-weight:500'; t.textContent = state._saveMsg; bar.appendChild(t)
  }
  return bar
}

// --- atelier ---
function numInput(val, width) { const i = doc.createElement('input'); i.type = 'number'; i.min = '0'; i.step = '1'; i.value = (val == null ? '' : val); i.style.cssText = 'flex:0 0 auto;box-sizing:border-box;width:' + (width || 64) + 'px;padding:5px 6px;border-radius:7px;border:0.5px solid #acc5e4;font-size:13px;color:#2a5ea9;outline:none;text-align:center;font-family:\'Nunito Sans\',sans-serif'; return i }
function makeAtelier(doc) {
  ensureCapDefaults()
  const card = doc.createElement('div'); card.className = 'obj-repart'; card.style.cssText = 'background:#fff;border:0.5px solid #eaf0f9;border-radius:12px;padding:16px 18px;margin-bottom:16px'

  const open = state.atelierOpen
  const head = doc.createElement('div'); head.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:' + (open ? '14px' : '0') + ';cursor:pointer'
  const car = doc.createElement('span'); car.textContent = open ? '▾ ' : '▸ '; car.style.cssText = 'color:#7a9cc4'; head.appendChild(car)
  const ti = doc.createElement('span'); ti.style.cssText = 'font-size:13px;font-weight:500;color:#2a5ea9'; ti.textContent = 'Définir les objectifs'; head.appendChild(ti)
  const sc = doc.createElement('span'); sc.style.cssText = 'font-size:12px;color:#7a9cc4'; sc.textContent = '· ' + state.sel.label; head.appendChild(sc)
  if (state.sel.level !== 'all') { const c = doc.createElement('button'); c.style.cssText = 'margin-left:auto;font-size:11px;border:0.5px solid #acc5e4;background:#fff;color:#2a5ea9;border-radius:6px;padding:3px 9px;cursor:pointer'; c.textContent = '✕ tout le périmètre'; c.addEventListener('click', function (e) { e.stopPropagation(); state.sel = { level: 'all', reseau: null, affaire: null, id_site: null, label: 'Tout le périmètre' }; state.cap = null; renderObj() }); head.appendChild(c) }
  head.addEventListener('click', function () { state.atelierOpen = !state.atelierOpen; renderObj() })
  card.appendChild(head)

  if (!open) {
    head.style.marginBottom = '6px'
    const hint = doc.createElement('div'); hint.style.cssText = 'font-size:11px;color:#acc5e4'
    hint.textContent = state.sel.level === 'all' ? 'Sélectionne un site ou un métier dans l\u2019arbre, puis déplie pour lui définir ses objectifs.' : 'Déplie pour définir les objectifs de « ' + state.sel.label + ' ».'
    card.appendChild(hint)
    return card
  }

  // Cap : commandes + contacts (haut) ; taux -> cibles (bas)
  const cap = doc.createElement('div'); cap.className = 'obj-cap'; cap.style.cssText = 'margin-bottom:14px'
  const top = doc.createElement('div'); top.style.cssText = 'display:flex;gap:28px;flex-wrap:wrap;margin-bottom:14px'
  const cCmd = doc.createElement('div')
  cCmd.innerHTML = '<div style="font-size:11px;color:#acc5e4;text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Cible commandes</div>'
  const inCmd = numInput(state.cap.commandes, 92); inCmd.className = 'obj-cap'; inCmd.style.fontSize = '17px'; inCmd.style.fontWeight = '500'; cCmd.appendChild(inCmd); top.appendChild(cCmd)
  const cCon = doc.createElement('div')
  cCon.innerHTML = '<div style="font-size:11px;color:#acc5e4;text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Contacts / jour</div>'
  const inCon = numInput(state.cap.contacts, 76); inCon.style.fontSize = '17px'; inCon.style.fontWeight = '500'; cCon.appendChild(inCon); top.appendChild(cCon)
  cap.appendChild(top)

  const secWrap = doc.createElement('div')
  secWrap.innerHTML = '<div style="font-size:11px;color:#acc5e4;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Taux (pré-rempli M-1) → cible d\u2019équipe</div>'
  const grid = doc.createElement('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px'
  const refs = {}
  SECONDARY.forEach(function (s) {
    const cell = doc.createElement('div'); cell.style.cssText = 'display:grid;grid-template-columns:88px 56px 14px 16px 66px;align-items:center;gap:6px;background:#f5f8fc;border-radius:8px;padding:7px 10px'
    const lab = doc.createElement('span'); lab.style.cssText = 'font-size:11px;color:#7a9cc4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'; lab.textContent = s.label
    const taux = numInput(state.cap.taux[s.k], 56)
    const pc = doc.createElement('span'); pc.textContent = '%'; pc.style.cssText = 'font-size:11px;color:#acc5e4'
    const eq = doc.createElement('span'); eq.textContent = '→'; eq.style.cssText = 'font-size:12px;color:#acc5e4;text-align:center'
    const cible = numInput(cibleOf(s.k), 66); cible.style.color = '#2a5ea9'; cible.style.fontWeight = '500'
    refs[s.k] = { taux: taux, cible: cible }
    taux.addEventListener('input', function () { state.cap.taux[s.k] = Math.max(0, parseInt(taux.value) || 0); cible.value = cibleOf(s.k) })
    cible.addEventListener('input', function () { const cmd = Math.max(0, parseInt(state.cap.commandes) || 0); const val = Math.max(0, parseInt(cible.value) || 0); state.cap.taux[s.k] = cmd > 0 ? Math.round(val / cmd * 100) : 0; taux.value = state.cap.taux[s.k] })
    cell.appendChild(lab); cell.appendChild(taux); cell.appendChild(pc); cell.appendChild(eq); cell.appendChild(cible); grid.appendChild(cell)
  })
  secWrap.appendChild(grid); cap.appendChild(secWrap)

  inCmd.addEventListener('input', function () { state.cap.commandes = Math.max(0, parseInt(inCmd.value) || 0); SECONDARY.forEach(function (s) { refs[s.k].cible.value = cibleOf(s.k) }); updateBalanceBar() })
  inCon.addEventListener('input', function () { state.cap.contacts = Math.max(0, parseInt(inCon.value) || 0) })
  card.appendChild(cap)

  // Répartition
  const rep = doc.createElement('div'); rep.style.cssText = 'display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px'
  const gMode = doc.createElement('div'); gMode.style.cssText = 'flex:1;min-width:240px'
  gMode.innerHTML = '<div style="font-size:11px;color:#acc5e4;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Répartir entre les vendeurs</div>'
  const selM = doc.createElement('select'); selM.className = 'obj-mode'; selM.style.cssText = "width:100%;padding:8px 12px;border-radius:8px;border:0.5px solid #acc5e4;background:#fff;color:#2a5ea9;font-size:13px;cursor:pointer;outline:none;font-family:'Nunito Sans',sans-serif"
    ;[['manuel', 'À la main'], ['equitable', 'Équitablement'], ['m1', 'Au prorata du réalisé M-1'], ['presence', 'Selon les jours de présence']].forEach(function (o) { const op = doc.createElement('option'); op.value = o[0]; op.textContent = o[1]; if (o[0] === state.methode) op.selected = true; selM.appendChild(op) })
  selM.addEventListener('change', function () { state.methode = selM.value; renderObj() })
  gMode.appendChild(selM); rep.appendChild(gMode)
  const btnRep = doc.createElement('button'); btnRep.style.cssText = 'font-size:12px;font-weight:500;border:none;background:#53bda7;color:#fff;border-radius:7px;padding:8px 16px;cursor:pointer'; btnRep.textContent = 'Répartir'; btnRep.disabled = (state.methode === 'manuel'); if (btnRep.disabled) btnRep.style.opacity = '.5'; btnRep.addEventListener('click', repartir); rep.appendChild(btnRep)
  card.appendChild(rep)

  // Panneau présence
  if (state.methode === 'presence') {
    const users = []; const seen = {}; scopeRows().forEach(function (r) { if (!seen[r.id_user]) { seen[r.id_user] = 1; users.push({ id: r.id_user, nom: r._vendeur }) } })
    const pres = doc.createElement('div'); pres.style.cssText = 'background:#f5f8fc;border-radius:8px;padding:10px 12px;margin-bottom:12px'
    pres.innerHTML = '<div style="font-size:11px;color:#7a9cc4;margin-bottom:8px">Jours de présence (défaut : ' + joursOuvresMois(state.annee, state.mois) + ' j ouvrés)</div>'
    const w = doc.createElement('div'); w.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'
    users.forEach(function (u) { const chip = doc.createElement('div'); chip.style.cssText = 'display:flex;align-items:center;gap:6px;background:#fff;border:0.5px solid #eaf0f9;border-radius:8px;padding:4px 8px'; const nm = doc.createElement('span'); nm.style.cssText = 'font-size:11px;color:#4a6a8a'; nm.textContent = u.nom; const inp = numInput(state.presence[u.id] != null ? state.presence[u.id] : joursOuvresMois(state.annee, state.mois), 44); inp.style.padding = '3px 6px'; inp.addEventListener('input', function () { state.presence[u.id] = Math.max(0, parseInt(inp.value) || 0) }); chip.appendChild(nm); chip.appendChild(inp); w.appendChild(chip) })
    pres.appendChild(w); card.appendChild(pres)
  }

  // Balance + reconduire
  const bal = doc.createElement('div'); bal.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:12px'
  bal.innerHTML = '<div style="flex:1;height:8px;background:#f0f3f8;border-radius:8px;overflow:hidden"><div id="obj-balfill" style="height:100%;width:0;background:#dde2ea"></div></div><span id="obj-balpill" style="font-size:12px;font-weight:500;padding:3px 9px;border-radius:8px;white-space:nowrap;background:#f0f2f5;color:#8a96a8">—</span>'
  card.appendChild(bal)
  const act = doc.createElement('div'); act.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap'
  const rec = doc.createElement('button'); rec.className = 'obj-reconduire'; rec.style.cssText = 'font-size:11px;border:0.5px solid #acc5e4;background:#fff;color:#2a5ea9;border-radius:6px;padding:5px 12px;cursor:pointer'; rec.textContent = 'Reconduire M-1'; rec.addEventListener('click', function () { reconduireM1Draft(rec) }); act.appendChild(rec)
  const dirty = isDirty()
  const status = doc.createElement('span'); status.style.cssText = 'margin-left:auto;font-size:11px;color:' + (dirty ? '#b8791a' : '#acc5e4'); status.textContent = dirty ? 'Modifications non enregistrées' : 'Tout est enregistré'; act.appendChild(status)
  const reset = doc.createElement('button'); reset.className = 'obj-reset'; reset.disabled = !dirty; reset.style.cssText = 'font-size:11px;border:0.5px solid #acc5e4;background:#fff;color:#2a5ea9;border-radius:6px;padding:5px 12px;cursor:' + (dirty ? 'pointer' : 'default') + ';opacity:' + (dirty ? '1' : '.5'); reset.textContent = 'Réinitialiser'; if (dirty) reset.addEventListener('click', resetDraft); act.appendChild(reset)
  const save = doc.createElement('button'); save.className = 'obj-save'; save.disabled = !dirty; save.style.cssText = 'font-size:12px;font-weight:500;border:none;background:#2a5ea9;color:#fff;border-radius:7px;padding:6px 14px;cursor:' + (dirty ? 'pointer' : 'default') + ';opacity:' + (dirty ? '1' : '.5'); save.textContent = 'Enregistrer les objectifs'; if (dirty) save.addEventListener('click', function () { saveDraft(save) }); act.appendChild(save)
  card.appendChild(act)
  return card
}
function updateBalanceBar() {
  const rd = doc, fill = rd.querySelector('#obj-balfill'), pill = rd.querySelector('#obj-balpill'); if (!fill || !pill) return
  const rows = scopeRows(), sum = rows.reduce(function (a, r) { return a + num(r.commandes) }, 0), target = Math.max(0, parseInt(state.cap && state.cap.commandes) || 0)
  fill.style.width = (target > 0 ? Math.min(100, Math.round(sum / target * 100)) : 0) + '%'
  let bg, col, fc, txt
  if (target === 0) { bg = '#f0f2f5'; col = '#8a96a8'; fc = '#dde2ea'; txt = 'fixez une cible' }
  else if (sum === target) { bg = '#e1f5ee'; col = '#085041'; fc = '#1d9e75'; txt = 'réparti ' + sum + ' / ' + target }
  else if (sum < target) { bg = '#e6f1fb'; col = '#0c447c'; fc = '#378add'; txt = 'reste ' + (target - sum) + ' · ' + sum + ' / ' + target }
  else { bg = '#faeeda'; col = '#633806'; fc = '#ef9f27'; txt = 'dépassement +' + (sum - target) + ' · ' + sum + ' / ' + target }
  fill.style.background = fc; pill.style.background = bg; pill.style.color = col; pill.textContent = txt
}

// --- édition cellule (brouillon, pas de PATCH) ---
function makeEditableCell(r, field, doc) {
  const td = doc.createElement('td')
  if (!canEdit) { td.style.cssText = 'padding:6px 8px;text-align:center'; const s = doc.createElement('span'); s.style.cssText = 'color:#4a6a8a;font-size:12px'; s.textContent = r[field] || 0; td.appendChild(s); return td }
  td.style.cssText = 'padding:6px 8px;text-align:center;cursor:pointer'; let editing = false
  const dirty = function () { const o = originalSnap[rowKey(r)]; return o && num(o[field]) !== num(r[field]) }
  function span() { editing = false; td.innerHTML = ''; const s = doc.createElement('span'); s.style.cssText = 'font-size:12px;color:' + (dirty() ? '#2a5ea9' : '#4a6a8a') + ';font-weight:' + (dirty() ? '500' : '400'); s.textContent = r[field] || 0; td.appendChild(s); td.onmouseenter = function () { td.style.background = '#f5f8fc' }; td.onmouseleave = function () { td.style.background = '' } }
  function editor() {
    editing = true; td.onmouseenter = null; td.onmouseleave = null; td.innerHTML = ''; td.style.background = '#f0f6ff'; const i = doc.createElement('input'); i.type = 'text'; i.value = r[field] || 0; i.style.cssText = 'width:48px;text-align:center;border:none;border-bottom:1.5px solid #2a5ea9;background:transparent;font-size:12px;color:#2a5ea9;outline:none;padding:0'; td.appendChild(i); i.focus(); i.select()
    function val() { r[field] = parseInt(i.value) || 0; state._saveMsg = null; renderObj() }
    i.addEventListener('keydown', function (e) { if (e.key === 'Enter') val(); if (e.key === 'Escape') { td.style.background = ''; span() } })
    i.addEventListener('blur', function () { td.style.background = ''; if (String(parseInt(i.value) || 0) !== String(r[field] || 0)) val(); else span() })
  }
  span(); td.addEventListener('click', function () { if (!editing) editor() }); return td
}

// --- arbre périmètre ---
function aggNew() { const a = {}; GKEYS.forEach(function (k) { a[k.k] = 0 }); return a }
function aggAdd(a, r) { GKEYS.forEach(function (k) { a[k.k] += num(r[k.k]) }) }
function buildTree(rows) {
  const R = {}
  rows.forEach(function (r) { const rk = r._reseau, ak = r._affaire, sk = String(r.id_site), tk = (String(r.vn_vo).toUpperCase() || '—'), vk = String(r.id_user); if (!R[rk]) R[rk] = { label: rk, agg: aggNew(), aff: {} }; aggAdd(R[rk].agg, r); const A = R[rk].aff; if (!A[ak]) A[ak] = { label: ak, agg: aggNew(), sites: {} }; aggAdd(A[ak].agg, r); const S = A[ak].sites; if (!S[sk]) S[sk] = { label: r._site, id_site: r.id_site, agg: aggNew(), types: {} }; aggAdd(S[sk].agg, r); const T = S[sk].types; if (!T[tk]) T[tk] = { label: tk, agg: aggNew(), vend: {} }; aggAdd(T[tk].agg, r); const V = T[tk].vend; if (!V[vk]) V[vk] = { label: r._vendeur, id_user: r.id_user, agg: aggNew(), rows: [] }; aggAdd(V[vk].agg, r); V[vk].rows.push(r) })
  const TORD = { VN: 0, VO: 1, VNVO: 2 }
  return Object.keys(R).sort(byFr).map(function (rk) { const Rn = R[rk]; Rn.affaires = Object.keys(Rn.aff).sort(byFr).map(function (ak) { const An = Rn.aff[ak]; An.sitesArr = Object.keys(An.sites).sort(function (a, b) { return byFr(An.sites[a].label, An.sites[b].label) }).map(function (sk) { const Sn = An.sites[sk]; Sn.typesArr = Object.keys(Sn.types).sort(function (a, b) { return (TORD[a] == null ? 9 : TORD[a]) - (TORD[b] == null ? 9 : TORD[b]) }).map(function (tk) { const Tn = Sn.types[tk]; Tn.vendArr = Object.keys(Tn.vend).sort(function (a, b) { return byFr(Tn.vend[a].label, Tn.vend[b].label) }).map(function (vk) { return Tn.vend[vk] }); return Tn }); return Sn }); return An }); return Rn })
}
function isOpen(k, d) { return state.expanded[k] === undefined ? d : state.expanded[k] }
function selEquals(level, o) { const s = state.sel; if (!s || s.level !== level) return false; if (level === 'reseau') return s.reseau === o.reseau; if (level === 'affaire') return s.reseau === o.reseau && s.affaire === o.affaire; if (level === 'site') return String(s.id_site) === String(o.id_site); if (level === 'sitetype') return String(s.id_site) === String(o.id_site) && s.type === o.type; return false }
function setSel(o) { if (selEquals(o.level, o)) state.sel = { level: 'all', reseau: null, affaire: null, id_site: null, type: null, label: 'Tout le périmètre' }; else state.sel = { level: o.level, reseau: o.reseau || null, affaire: o.affaire || null, id_site: o.id_site || null, type: o.type || null, label: o.label }; state.cap = null; state.methode = 'manuel'; renderObj() }

// --- vue fiches (MOBILE) : filtre site + sections VN/VO + édition ---
function renderCards(rootEl, doc) {
  var allRows = visibleRows()
  if (!allRows.length) { const m = doc.createElement('div'); m.style.cssText = 'text-align:center;padding:30px;color:#9bb3d1;font-size:13px;font-style:italic'; m.textContent = 'Aucun objectif pour cette période.'; rootEl.appendChild(m); return }

  window.__objCardF = window.__objCardF || { site: '__all', type: '__all' }
  var F = window.__objCardF

  // listes distinctes pour les filtres
  var sites = [], seen = {}
  allRows.forEach(function (r) { var s = r._site || ''; if (s && !seen[s]) { seen[s] = 1; sites.push(s) } })
  sites.sort(byFr)
  var hasVN = allRows.some(function (r) { return String(r.vn_vo || '').toUpperCase() === 'VN' })
  var hasVO = allRows.some(function (r) { return String(r.vn_vo || '').toUpperCase() === 'VO' })
  if (F.site !== '__all' && sites.indexOf(F.site) === -1) F.site = '__all'
  if (F.type !== '__all' && !((F.type === 'VN' && hasVN) || (F.type === 'VO' && hasVO))) F.type = '__all'

  // barre de filtres
  var bar = doc.createElement('div'); bar.style.cssText = 'display:flex;gap:8px;margin-bottom:14px'
  function mkSel(opts, val, on) {
    var s = doc.createElement('select')
    s.style.cssText = "flex:1;min-width:0;padding:9px 11px;border:0.5px solid #acc5e4;border-radius:10px;background:#fff;font-size:13px;color:#2a5ea9;font-family:'Nunito Sans',sans-serif;outline:none"
    opts.forEach(function (o) { var op = doc.createElement('option'); op.value = o.v; op.textContent = o.t; if (o.v === val) op.selected = true; s.appendChild(op) })
    s.addEventListener('change', function () { on(s.value); paint() })
    return s
  }
  bar.appendChild(mkSel([{ v: '__all', t: 'Tous les sites' }].concat(sites.map(function (s) { return { v: s, t: s } })), F.site, function (v) { F.site = v }))
  rootEl.appendChild(bar)

  // conteneur des cartes (redessiné par paint())
  var list = doc.createElement('div'); list.className = 'obj-cards'; rootEl.appendChild(list)

  // bouton enregistrer (édition)
  var saveBtn = null
  if (canEdit) {
    saveBtn = doc.createElement('button'); saveBtn.className = 'obj-save'
    saveBtn.style.cssText = 'margin-top:16px;width:100%;font-size:15px;font-weight:600;border:none;background:#2a5ea9;color:#fff;border-radius:12px;padding:14px;cursor:pointer;font-family:inherit'
    saveBtn.textContent = 'Enregistrer les objectifs'
    saveBtn.addEventListener('click', function () { saveDraft(saveBtn) })
  }

  function paint() {
    list.innerHTML = ''
    var rows = allRows.filter(function (r) {
      if (F.site !== '__all' && (r._site || '') !== F.site) return false
      if (F.type !== '__all' && String(r.vn_vo || '').toUpperCase() !== F.type) return false
      return true
    })
    if (!rows.length) { const e = doc.createElement('div'); e.style.cssText = 'text-align:center;padding:24px;color:#9bb3d1;font-size:13px;font-style:italic'; e.textContent = 'Aucun vendeur pour ce filtre.'; list.appendChild(e); return }
    rows.sort(function (a, b) { return byFr(a._site || '', b._site || '') || String(a.vn_vo || '').toUpperCase().localeCompare(String(b.vn_vo || '').toUpperCase()) || byFr(a._vendeur || '', b._vendeur || '') })
    var curSite = null, curType = null
    rows.forEach(function (r) {
      var t = String(r.vn_vo || '').toUpperCase()
      if (r._site !== curSite) {
        curSite = r._site; curType = null
        const sh = doc.createElement('div'); sh.style.cssText = 'font-size:14px;font-weight:600;color:#1c2b45;margin:18px 0 6px;padding-bottom:6px;border-bottom:2px solid #eaf0f9'; sh.textContent = curSite || ''; list.appendChild(sh)
      }
      if (t !== curType) {
        curType = t
        const th = doc.createElement('div'); th.style.cssText = 'display:inline-block;font-size:11px;font-weight:600;color:#2a5ea9;background:#eef3fb;padding:3px 10px;border-radius:20px;margin:10px 0 4px'; th.textContent = 'Objectifs ' + (t || '—'); list.appendChild(th)
      }
      const card = doc.createElement('div'); card.className = 'obj-card'; card.style.cssText = 'background:#fff;border:0.5px solid #e7eef8;border-radius:12px;margin-bottom:10px;overflow:hidden;box-shadow:0 1px 3px rgba(28,43,69,0.06)'
      const head = doc.createElement('div'); head.style.cssText = 'background:#2a5ea9;color:#fff;padding:9px 14px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap'
      const nm = doc.createElement('span'); nm.style.cssText = 'font-size:14px;font-weight:700'; nm.textContent = r._vendeur || ('Vendeur ' + r.id_user); head.appendChild(nm)
      if (r.marque) { const mq = doc.createElement('span'); mq.style.cssText = 'font-size:11px;color:#bcd3ef;font-weight:500'; mq.textContent = r.marque; head.appendChild(mq) }
      card.appendChild(head)
      const body = doc.createElement('div'); body.style.cssText = 'padding:2px 14px 6px'
      GKEYS.forEach(function (k, gi) {
        const line = doc.createElement('div'); line.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 0' + (gi ? ';border-top:0.5px solid #f1f5fb' : '')
        const lab = doc.createElement('span'); lab.style.cssText = 'font-size:13px;color:#4a6a8a'; lab.textContent = k.label; line.appendChild(lab)
        if (canEdit) {
          const inp = doc.createElement('input'); inp.type = 'number'; inp.inputMode = 'numeric'; inp.min = '0'; inp.step = '1'; inp.value = (r[k.k] == null ? 0 : r[k.k])
          inp.style.cssText = 'width:74px;text-align:right;padding:6px 9px;border:0.5px solid #cfe0f2;border-radius:8px;font-size:15px;color:#2a5ea9;font-weight:600;outline:none;font-family:inherit'
          inp.addEventListener('focus', function () { inp.select() })
          inp.addEventListener('input', function () { r[k.k] = parseInt(inp.value) || 0; state._saveMsg = null; try { updateBalanceBar() } catch (e) { } })
          line.appendChild(inp)
        } else {
          const val = doc.createElement('span'); val.style.cssText = 'font-size:16px;font-weight:600;color:#2a5ea9'; val.textContent = Math.round(num(r[k.k])); line.appendChild(val)
        }
        body.appendChild(line)
      })
      card.appendChild(body)
      list.appendChild(card)
    })
  }
  paint()
  if (saveBtn) rootEl.appendChild(saveBtn)
}

function renderTree(rootEl, doc) {
  if ((doc.documentElement.clientWidth || (doc.defaultView || window).innerWidth) <= 767) return renderCards(rootEl, doc)
  const rows = visibleRows()
  if (!rows.length) { const m = doc.createElement('div'); m.style.cssText = 'text-align:center;padding:30px;color:#7a9cc4;font-size:12px;font-style:italic'; m.textContent = 'Aucun objectif pour cette période.'; rootEl.appendChild(m); return }
  const tree = buildTree(rows)
  const nbSites = tree.reduce(function (s, R) { return s + R.affaires.reduce(function (x, A) { return x + A.sitesArr.length }, 0) }, 0)
  const sitesDef = nbSites <= 3, oneR = tree.length === 1
  const table = doc.createElement('table'); table.className = 'obj-tree'; table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed'
  const cg = doc.createElement('colgroup');['230px'].concat(GKEYS.map(function () { return '90px' })).forEach(function (w) { const c = doc.createElement('col'); c.style.width = w; cg.appendChild(c) }); table.appendChild(cg)
  const th = doc.createElement('thead'), hr = doc.createElement('tr'); hr.style.cssText = 'background:#2a5ea9'
    ;['Périmètre'].concat(GKEYS.map(function (k) { return k.label })).forEach(function (h, i, arr) { const e = doc.createElement('th'); e.style.cssText = 'color:#fff;font-weight:400;padding:7px 8px;text-align:' + (i === 0 ? 'left' : 'center') + ';font-size:10px'; if (i === 0) e.style.borderRadius = '5px 0 0 5px'; if (i === arr.length - 1) e.style.borderRadius = '0 5px 5px 0'; e.textContent = h; hr.appendChild(e) })
  th.appendChild(hr); table.appendChild(th)
  const tb = doc.createElement('tbody'); table.appendChild(tb)
  function caret(open, key) { const c = doc.createElement('span'); c.textContent = open ? '▾ ' : '▸ '; c.style.cssText = 'color:#7a9cc4;cursor:pointer'; c.addEventListener('click', function (e) { e.stopPropagation(); state.expanded[key] = !open; renderObj() }); return c }
  function sumTd(v, col, wt) { const td = doc.createElement('td'); td.style.cssText = 'padding:6px 8px;text-align:center;font-size:12px;color:' + col + ';font-weight:' + wt + ';font-variant-numeric:tabular-nums'; td.textContent = Math.round(v); return td }
  function aggRow(label, key, agg, bg, pad, col, wt, open, selObj) {
    const tr = doc.createElement('tr'); tr.style.cssText = 'border-bottom:0.5px solid #eaf0f9;background:' + (selObj && selEquals(selObj.level, selObj) ? '#dde9f7' : bg) + ';cursor:pointer'
    const td0 = doc.createElement('td'); td0.style.cssText = 'padding:6px 8px;padding-left:' + pad + 'px;font-size:12px;color:' + col + ';font-weight:' + wt + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
    td0.appendChild(caret(open, key)); td0.appendChild(doc.createTextNode(label)); tr.appendChild(td0)
    GKEYS.forEach(function (k) { tr.appendChild(sumTd(agg[k.k], col, wt)) })
    if (selObj) tr.addEventListener('click', function () { if (selObj.level === 'site') state.expanded[key] = true; setSel(selObj) })
    tb.appendChild(tr)
  }
  function leaf(r, main, sub, pad) {
    const tr = doc.createElement('tr'); tr.style.cssText = 'border-bottom:0.5px solid #eaf0f9;background:#fff'
    const td0 = doc.createElement('td'); td0.style.cssText = 'padding:6px 8px;padding-left:' + pad + 'px;overflow:hidden'
    const m = doc.createElement('div'); m.style.cssText = 'font-size:12px;color:#2a5ea9;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'; m.textContent = main; td0.appendChild(m)
    if (sub) { const s = doc.createElement('div'); s.style.cssText = 'font-size:10px;color:#acc5e4;margin-top:1px'; s.textContent = sub; td0.appendChild(s) }
    tr.appendChild(td0); GKEYS.forEach(function (k) { tr.appendChild(makeEditableCell(r, k.k, doc)) }); tb.appendChild(tr)
  }
  function marqueSub(r) { let s = r.marque || ''; if (realOk) { const m1 = realiseCommandesM1(r.id_user); s += (s ? ' · ' : '') + 'M-1 ' + Math.round(m1) + ' cmd' } return s }
  function typeRow(T, key, open, site) {
    const label = T.label, isVN = label === 'VN', isVO = label === 'VO'
    const selObj = { level: 'sitetype', id_site: site.id_site, type: label, label: label + ' — ' + site.label }
    const sel = selEquals('sitetype', selObj)
    const tr = doc.createElement('tr'); tr.style.cssText = 'border-bottom:0.5px solid #eaf0f9;background:' + (sel ? '#dde9f7' : '#fbfdff') + ';cursor:pointer'
    const td0 = doc.createElement('td'); td0.style.cssText = 'padding:6px 8px;padding-left:60px;white-space:nowrap;overflow:hidden'
    td0.appendChild(caret(open, key))
    const chip = doc.createElement('span'); chip.textContent = 'Objectifs ' + label
    chip.style.cssText = 'display:inline-block;padding:2px 9px;border-radius:6px;font-size:11px;font-weight:500;background:' + (isVN ? '#e1f5ee' : (isVO ? '#faeeda' : '#e6f1fb')) + ';color:' + (isVN ? '#085041' : (isVO ? '#633806' : '#0c447c'))
    td0.appendChild(chip); tr.appendChild(td0)
    GKEYS.forEach(function (k) { tr.appendChild(sumTd(T.agg[k.k], '#7a9cc4', 500)) })
    tr.addEventListener('click', function () { state.expanded[key] = true; setSel(selObj) })
    tb.appendChild(tr)
  }
  function vendeurNode(V, sKey, vPad, mPad) {
    if (V.rows.length === 1) { leaf(V.rows[0], V.label, marqueSub(V.rows[0]), vPad); return }
    const vKey = sKey + '|v:' + V.id_user, vOpen = isOpen(vKey, true)
    const tr = doc.createElement('tr'); tr.style.cssText = 'border-bottom:0.5px solid #eaf0f9;background:#fff'
    const td0 = doc.createElement('td'); td0.style.cssText = 'padding:6px 8px;padding-left:' + vPad + 'px;font-size:12px;color:#4a6a8a;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
    td0.appendChild(caret(vOpen, vKey)); td0.appendChild(doc.createTextNode(V.label + (realOk ? '  ·  M-1 ' + Math.round(realiseCommandesM1(V.id_user)) + ' cmd' : ''))); tr.appendChild(td0)
    GKEYS.forEach(function (k) { tr.appendChild(sumTd(V.agg[k.k], '#4a6a8a', 500)) }); tb.appendChild(tr)
    if (vOpen) V.rows.forEach(function (r) { leaf(r, r.marque || '—', null, mPad) })
  }
  tree.forEach(function (R) {
    const rKey = 'r:' + R.label, rOpen = oneR ? true : isOpen(rKey, true)
    if (!oneR) aggRow(R.label, rKey, R.agg, '#f5f8fc', 12, '#2a5ea9', 500, rOpen, { level: 'reseau', reseau: R.label, label: R.label })
    if (!rOpen) return
    const oneA = R.affaires.length === 1
    R.affaires.forEach(function (A) {
      const aKey = rKey + '|a:' + A.label, aOpen = oneA ? true : isOpen(aKey, true)
      if (!oneA) aggRow(A.label, aKey, A.agg, '#fafbfd', 28, '#2a5ea9', 500, aOpen, { level: 'affaire', reseau: R.label, affaire: A.label, label: A.label })
      if (!aOpen) return
      A.sitesArr.forEach(function (S) {
        const sKey = aKey + '|s:' + S.id_site, sOpen = isOpen(sKey, sitesDef)
        aggRow(S.label, sKey, S.agg, '#ffffff', 44, '#4a6a8a', 500, sOpen, { level: 'site', id_site: S.id_site, label: S.label })
        if (!sOpen) return
        const oneT = S.typesArr.length === 1
        S.typesArr.forEach(function (T) {
          const tKey = sKey + '|t:' + T.label, tOpen = oneT ? true : isOpen(tKey, true)
          if (!oneT) typeRow(T, tKey, tOpen, S)
          if (!tOpen) return
          const vPad = oneT ? 62 : 76, mPad = oneT ? 82 : 92
          T.vendArr.forEach(function (V) { vendeurNode(V, sKey + '|t:' + T.label, vPad, mPad) })
        })
      })
    })
  })
  const tot = aggNew(); rows.forEach(function (r) { aggAdd(tot, r) })
  const ft = doc.createElement('tfoot'), tr = doc.createElement('tr'); tr.style.cssText = 'background:#f5f8fc;border-top:1px solid #eaf0f9'
  const td0 = doc.createElement('td'); td0.style.cssText = 'padding:7px 8px;color:#2a5ea9;font-weight:500;font-size:12px'; td0.textContent = 'Total — ' + (state.vnvo === 'VNVO' ? 'VN + VO' : state.vnvo); tr.appendChild(td0)
  GKEYS.forEach(function (k) { tr.appendChild(sumTd(tot[k.k], '#2a5ea9', 500)) }); ft.appendChild(tr); table.appendChild(ft)
  table.style.display = 'table'
  table.style.minWidth = '770px'
  const objScroll = doc.createElement('div')
  objScroll.style.cssText = 'overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%'
  objScroll.appendChild(table)
  rootEl.appendChild(objScroll)
}

// --- vue vendeur ---
function aggObjectif(f) { return visibleRows().reduce(function (a, r) { return a + num(r[f]) }, 0) }
function renderVendeur(rootEl, doc) {
  const rows = visibleRows()
  if (!rows.length) { const m = doc.createElement('div'); m.style.cssText = 'text-align:center;padding:30px;color:#7a9cc4;font-size:12px;font-style:italic'; m.textContent = 'Aucun objectif pour cette période.'; rootEl.appendChild(m); return }
  const prorata = prorataFor(state.annee, state.mois)
  const deb = new Date(state.annee, state.mois - 1, 1), fin = new Date(state.annee, state.mois, 0); let cap = fin; const t = new Date(); if (t < cap) cap = t; if (cap < deb) cap = deb
  const ec = joursOuvres(deb, cap), tot = joursOuvres(deb, fin), jr = joursOuvresRestants(state.annee, state.mois)
  const hero = doc.createElement('div'); hero.className = 'obj-hero'; hero.style.cssText = 'background:#fff;border:0.5px solid #eaf0f9;border-radius:12px;padding:16px 18px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px'
  const l = doc.createElement('div'); l.innerHTML = '<div style="font-size:15px;font-weight:500;color:#2a5ea9">Mon mois — ' + MOIS_NOMS[state.mois - 1] + ' ' + state.annee + '</div><div style="font-size:13px;color:#7a9cc4">' + Math.round(ec) + ' jours ouvrés écoulés sur ' + Math.round(tot) + ' · ' + Math.round(prorata * 100) + ' % du mois</div>'; hero.appendChild(l)
  if (!realOk) { const w = doc.createElement('span'); w.style.cssText = 'font-size:12px;font-weight:500;padding:3px 9px;border-radius:8px;background:#faeeda;color:#633806'; w.textContent = 'réalisé indisponible'; hero.appendChild(w) }
  rootEl.appendChild(hero)
  const grid = doc.createElement('div'); grid.className = 'obj-cards'; grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px'
  for (const kp of KPIS_SUIVI) {
    const obj = aggObjectif(kp.k), real = realOk ? realiseFor(realCur, myId, REAL_FIELDS[kp.k]) : 0, pct = obj > 0 ? Math.round(real / obj * 100) : 0, ps = paceStyle(real, obj, prorata), reste = Math.max(0, obj - real)
    let cad
    if (obj <= 0) cad = 'pas d\u2019objectif fixé'
    else if (reste <= 0) cad = 'objectif atteint'
    else if (jr <= 0) cad = 'mois terminé · ' + reste + ' restant' + (reste > 1 ? 's' : '')
    else cad = 'reste ' + reste + ' en ' + jr + ' j ouvrés ≈ 1 tous les ' + (Math.round(jr / reste * 10) / 10) + ' j'
    const card = doc.createElement('div'); card.className = 'obj-card'; card.style.cssText = 'background:#f5f8fc;border-radius:10px;padding:14px 16px'; const tick = Math.round(prorata * 100)
    card.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><span style="font-size:11px;color:#7a9cc4;text-transform:uppercase;letter-spacing:.4px">' + kp.label + '</span><span style="font-size:12px;font-weight:500;padding:3px 9px;border-radius:8px;background:' + ps.bg + ';color:' + ps.col + '">' + (realOk ? ps.txt : '—') + '</span></div><div style="display:flex;align-items:baseline;gap:6px;margin-bottom:10px"><span style="font-size:24px;font-weight:500;color:#2a5ea9">' + (realOk ? Math.round(real) : '—') + '</span><span style="font-size:14px;color:#7a9cc4">/ ' + Math.round(obj) + '</span></div><div style="position:relative;height:6px;background:#fff;border:0.5px solid #eaf0f9;border-radius:8px;overflow:hidden;margin-bottom:6px"><div style="height:100%;width:' + Math.min(100, pct) + '%;background:' + ps.bar + '"></div><div style="position:absolute;top:-2px;bottom:-2px;left:' + tick + '%;width:2px;background:#2a5ea9"></div></div><div style="font-size:11px;color:#4a6a8a">' + cad + '</div>'
    grid.appendChild(card)
  }
  rootEl.appendChild(grid)
  const cj = aggObjectif('contacts_jour')
  if (cj > 0) { const ref = doc.createElement('div'); ref.style.cssText = 'background:#fff;border:0.5px solid #eaf0f9;border-radius:10px;padding:12px 16px;margin-top:12px;display:flex;align-items:center;justify-content:space-between'; ref.innerHTML = '<span style="font-size:12px;color:#7a9cc4">Objectif de contacts par jour</span><span style="font-size:18px;font-weight:500;color:#2a5ea9">' + Math.round(cj) + ' / jour</span>'; rootEl.appendChild(ref) }
  const note = doc.createElement('div'); note.style.cssText = 'font-size:11px;color:#acc5e4;margin-top:12px;text-align:center'; note.textContent = 'Le trait bleu sur chaque barre marque le rythme attendu au prorata du mois.'; rootEl.appendChild(note)
}

// --- render ---
function renderObj() {
  const rootEl = __anchor; if (!rootEl) return
  rootEl.innerHTML = ''; rootEl.appendChild(makeSelectors(doc))
  if (loading) { const m = doc.createElement('div'); m.style.cssText = 'text-align:center;padding:30px;color:#7a9cc4;font-size:12px;font-style:italic'; m.textContent = 'Chargement des objectifs…'; rootEl.appendChild(m); return }
  if (isVendeur) { renderVendeur(rootEl, doc); return }
  if (canEdit) { const db = makeDirtyBar(doc); if (db) rootEl.appendChild(db) }
  if (canEdit && visibleRows().length && (doc.documentElement.clientWidth || (doc.defaultView || window).innerWidth) > 767) rootEl.appendChild(makeAtelier(doc))
  renderTree(rootEl, doc)
  if (canEdit) setTimeout(updateBalanceBar, 0)
}

// --- boot ---
async function boot() {
  loading = true; renderObj()
  try {
    await loadPerimeter();
    const ymCur = ymOf(state.annee, state.mois), ymPrev = prevYM(state.annee, state.mois).ym
    const tasks = [fetchObjectifs(), fetchRealise(ymCur)]
    if (canEdit) { tasks.push(fetchRealise(ymPrev)); tasks.push(fetchHierarchy(ymCur)) }
    else if (!isVendeur) { tasks.push(Promise.resolve({ ok: true, map: {} })); tasks.push(fetchHierarchy(ymCur)) }
    const out = await Promise.all(tasks)
    data = out[0]; const rc = out[1]; realCur = rc.map; realOk = rc.ok
    if (out[2]) realM1 = out[2].map || {}
    siteMeta = {}; userMeta = {}; const h = out[3]; if (h) { siteMeta = h.sites || {}; userMeta = h.users || {} }
    enrichRows(); snapshot(); state.cap = null
  } catch (e) { console.error('Erreur boot objectifs:', e); data = []; realCur = {}; realM1 = {}; realOk = false; siteMeta = {}; userMeta = {}; originalSnap = {} }
  finally { loading = false; renderObj() }
}
window.__renderObj = renderObj; window.__objBoot = boot
boot();

// --- Bascule auto fiches/tableau (chargement, redimensionnement, rotation) ---
; (function () {
  try {
    var d = doc;
    var w = d.defaultView || window;
    if (window.__objResizeObs && window.__objResizeObs.disconnect) { try { window.__objResizeObs.disconnect(); } catch (e) { } window.__objResizeObs = null; }
    if (window.__objBp) { w.removeEventListener('resize', window.__objBp); }
    var last = null;
    window.__objBp = function () {
      var m = (d.documentElement.clientWidth || w.innerWidth) <= 767;
      if (m !== last) { last = m; if (window.__renderObj) window.__renderObj(); }
    };
    w.addEventListener('resize', window.__objBp);
    setTimeout(function () { if (window.__renderObj) window.__renderObj(); }, 60);
    setTimeout(function () { if (window.__renderObj) window.__renderObj(); }, 400);
  } catch (e) { }
})();
  }
});
