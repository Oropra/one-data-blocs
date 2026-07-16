// ============================================================================
//  HISTORIQUE CLIENT (top nav) — module One Data (OD.define)  v1
//  Extrait d'auth.js (bootHistoClient), où il n'était initialisé QU'AU LOGIN :
//  après un F5 ou en navigation, il ne démarrait jamais. Il est désormais monté
//  par la TOP NAV via une ancre (patron sous-loader), donc présent partout.
//  Rendu dans __anchor ; client via ctx.supabase ; self-boot, filet de
//  re-render et workflow supprimé (ec8bcc55) retirés.
// ============================================================================
OD.define('client-history', {
  async mount(__anchor, ctx) {

const SELECTED_CLIENT_VAR_ID = '55490583-c88b-4748-916e-4d203db07742';
const FICHE_CLIENT_PAGE_ID = '259f1951-a2d4-4b90-ac83-0b3febe1d4ec';
const FICHE_CLIENT_WORKFLOW_ID = 'ec8bcc55-a733-4982-a946-13e10ba3b09b';

const doc = __anchor.ownerDocument || document;
function getRoot() { return __anchor; }

// self-boot retiré : la top nav fournit l'ancre, le loader monte le module

const userConnected = (((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser || {});
const viewerId = userConnected.ID_User;

const state = window.__ch || { open: false, list: null, loading: false, error: null, autoPopulated: false };
window.__ch = state;

function readVar(id) { try { return wwLib.wwVariable.getValue(id); } catch (e) { return null; } }

function _writeVar(varId, value) {
  try { wwLib.wwVariable.updateValue(varId, value); return; }
  catch (e) { console.warn('[ch]', varId, 'failed:', e && e.message); }
  try {
    const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window;
    if (w.variables && Object.prototype.hasOwnProperty.call(w.variables, varId + '-value')) {
      w.variables[varId + '-value'] = value;
    }
  } catch (e) {}
}

// 🔵 Déclenche le workflow "fiche client" (fetch + re-subscribe realtime) pour le client passé
function triggerFicheClient(idvu) {
  // workflow global 'fiche client' (ec8bcc55) retiré : supprimé du projet
  // (et responsable du 409 wa_contacts). fiche-shell recharge le client seul.
}

function navigateToFiche() {
  if (!FICHE_CLIENT_PAGE_ID) return;
  try { wwLib.goTo('/fr/fiche-client'); return; } catch (e) { }
  try { if (wwLib.wwLocation && wwLib.wwLocation.goTo) wwLib.wwLocation.goTo({ pageId: FICHE_CLIENT_PAGE_ID }); } catch (e) {}
}

async function autoPopulateFromHistory() {
  if (state.autoPopulated) return;
  if (viewerId == null) return;
  const current = readVar(SELECTED_CLIENT_VAR_ID);
  if (current && current.IDVu != null) { state.autoPopulated = true; return; }
  try {
    const supabase = ctx.supabase;
    const { data, error } = await supabase
      .from('client_view_history')
      .select('CLIENT(*)')
      .eq('user_id', String(viewerId))
      .order('viewed_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    state.autoPopulated = true;
    if (data && data[0] && data[0].CLIENT) {
      _writeVar(SELECTED_CLIENT_VAR_ID, Object.assign({}, data[0].CLIENT));
      try { window.dispatchEvent(new CustomEvent('oropra-client-selected', { detail: data[0].CLIENT })); } catch (e) {}
    }
  } catch (e) {
    console.warn('[ch] auto-populate failed:', e && e.message);
    state.autoPopulated = true;
  }
}

async function loadHistory() {
  if (viewerId == null) { state.list = []; return; }
  state.loading = true;
  state.error = null;
  render();
  try {
    const supabase = ctx.supabase;
    const { data, error } = await supabase
      .from('client_view_history')
      .select('viewed_at, CLIENT(*)')
      .eq('user_id', String(viewerId))
      .order('viewed_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    state.list = (data || []).filter(r => r.CLIENT);
  } catch (e) {
    console.error('[ch]', e);
    state.error = e.message || String(e);
    state.list = [];
  } finally {
    state.loading = false;
    render();
  }
}

function selectHistoryEntry(entry) {
  if (!entry || !entry.CLIENT) return;
  _writeVar(SELECTED_CLIENT_VAR_ID, Object.assign({}, entry.CLIENT));
  triggerFicheClient(entry.CLIENT.IDVu);          // 🔵 fetch + re-subscribe realtime
  state.open = false;
  render();
  try { window.dispatchEvent(new CustomEvent('oropra-client-selected', { detail: entry.CLIENT })); } catch (e) {}
  navigateToFiche();
}

function toggle() { state.open = !state.open; if (state.open) loadHistory(); render(); }
function close() { if (state.open) { state.open = false; render(); } }

function esc(s) { if (s == null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function formatRelativeTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'à l\'instant';
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `il y a ${diffHour} h`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `il y a ${diffDay} j`;
  return d.toLocaleDateString('fr-FR');
}

function clientLabel(c) {
  const soc = c.idmultivu === 1 || c.idmultivu === '1';
  if (soc) return [c.CIVILITE, c.NOM].filter(Boolean).join(' ');
  return [c.PRENOM, (c.NOM || '').toUpperCase()].filter(Boolean).join(' ');
}

// Icône "historique" (horloge avec flèche de retour) — remplace l'ancien chevron
const ICON_CHEVRON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l3 3"/></svg>';
const ICON_P = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
const ICON_S = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21V12h6v9"/></svg>';
const ICON_CLOCK = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

const STYLE = `<style>
#oropra-client-history{font-family:"Nunito Sans",system-ui,sans-serif;position:relative;display:inline-block}
#oropra-client-history *{box-sizing:border-box}
#oropra-client-history .ch-trigger{background:none;border:none;cursor:pointer;color:#2a5ea9;padding:5px 7px;display:inline-flex;align-items:center;border-radius:5px;line-height:0;transition:background-color .15s,color .15s}
#oropra-client-history .ch-trigger:hover{color:#0c447c;background:#f2f6fc}
#oropra-client-history .ch-trigger.is-open{color:#0c447c;background:#eef4fc}
#oropra-client-history .ch-panel{position:absolute;top:calc(100% + 8px);left:0;background:#fff;border:1px solid #e3edf9;border-radius:10px;box-shadow:0 10px 30px rgba(42,94,169,.16);width:340px;max-height:480px;display:flex;flex-direction:column;z-index:200;color:#2a5ea9}
#oropra-client-history .ch-panel-header{padding:14px 16px;border-bottom:1px solid #f0f4fa;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#7a98c5;font-weight:600}
#oropra-client-history .ch-list{overflow-y:auto;flex:1}
#oropra-client-history .ch-item{padding:11px 16px;cursor:pointer;border-bottom:1px solid #f5f8fc;display:flex;align-items:flex-start;gap:10px}
#oropra-client-history .ch-item:last-child{border-bottom:none}
#oropra-client-history .ch-item:hover{background:#f7fafd}
#oropra-client-history .ch-item-icon{flex:0 0 auto;color:#53bda7;background:#eef9f5;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-top:1px}
#oropra-client-history .ch-item-body{flex:1;min-width:0}
#oropra-client-history .ch-item-name{font-size:13px;font-weight:500;color:#2a5ea9;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#oropra-client-history .ch-item-meta{font-size:11px;color:#7a98c5;margin-top:3px;display:flex;align-items:center;gap:5px;flex-wrap:wrap}
#oropra-client-history .ch-item-meta-sep{opacity:.5}
#oropra-client-history .ch-empty{padding:40px 16px;text-align:center;color:#8aa3c3;font-size:12px;display:flex;align-items:center;justify-content:center;gap:8px}
#oropra-client-history .ch-spinner{display:inline-block;width:12px;height:12px;border:2px solid #e3edf9;border-top-color:#53bda7;border-radius:50%;animation:ch-spin .8s linear infinite}
@keyframes ch-spin{to{transform:rotate(360deg)}}
</style>`;

function render() {
  const root = getRoot();
  if (!root) return;
  let h = `<button class="ch-trigger${state.open ? ' is-open' : ''}" data-ch-action="toggle" title="Historique des clients consultés">${ICON_CHEVRON}</button>`;
  if (state.open) {
    h += '<div class="ch-panel">';
    h += '<div class="ch-panel-header">Clients consultés récemment</div>';
    h += '<div class="ch-list">';
    if (state.loading) {
      h += '<div class="ch-empty"><span class="ch-spinner"></span> Chargement…</div>';
    } else if (state.error) {
      h += `<div class="ch-empty">Erreur : ${esc(state.error)}</div>`;
    } else if (!state.list || !state.list.length) {
      h += '<div class="ch-empty">Aucun client consulté pour le moment.</div>';
    } else {
      for (let i = 0; i < state.list.length; i++) {
        const entry = state.list[i];
        const c = entry.CLIENT;
        const soc = c.idmultivu === 1 || c.idmultivu === '1';
        const ville = [c.code_postal, c.ville].filter(Boolean).join(' ');
        const time = entry.viewed_at ? formatRelativeTime(entry.viewed_at) : '';
        h += `<div class="ch-item" data-ch-action="pick" data-idx="${i}">
          <div class="ch-item-icon">${soc ? ICON_S : ICON_P}</div>
          <div class="ch-item-body">
            <div class="ch-item-name">${esc(clientLabel(c))}</div>
            <div class="ch-item-meta">
              ${ICON_CLOCK}<span>${esc(time)}</span>
              ${ville ? `<span class="ch-item-meta-sep">·</span><span>${esc(ville)}</span>` : ''}
            </div>
          </div>
        </div>`;
      }
    }
    h += '</div></div>';
  }
  root.innerHTML = STYLE + h;
  bindEvents();
}

function bindEvents() {
  const root = getRoot();
  if (!root) return;
  root.querySelectorAll('[data-ch-action="toggle"]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); toggle(); }));
  root.querySelectorAll('[data-ch-action="pick"]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const idx = Number(el.getAttribute('data-idx'));
    if (state.list && state.list[idx]) selectHistoryEntry(state.list[idx]);
  }));
}

if (!window.__chDocOutsideBound) {
  doc.addEventListener('mousedown', function (e) {
    const r = doc.getElementById('oropra-client-history');
    if (r && !r.contains(e.target)) close();
  }, true);
  window.__chDocOutsideBound = true;
}

if (!window.__chHistoryListenerBound) {
  window.addEventListener('oropra-history-updated', () => { if (state.open) loadHistory(); });
  window.__chHistoryListenerBound = true;
}

autoPopulateFromHistory();
render();

if (!window.__chMoBound) {
  const mo = new MutationObserver(() => {
    const root = getRoot();
    if (root && !root.querySelector('style')) render();
  });
  try { mo.observe(doc.body, { childList: true, subtree: true }); } catch (e) {}
  window.__chMoBound = true;
}

// ensureRenderedCh retiré : le loader monte/re-monte le module (navigation SPA comprise).

// Le user arrive de façon asynchrone (socle) : quand il est prêt, on relance le
// module pour recharger viewerId + l'historique (sinon viewerId reste null).
// relance sur 'oropra-user-ready' retirée : le Shell charge l'utilisateur
// AVANT de monter les modules -> viewerId est disponible dès le mount.

}
});
