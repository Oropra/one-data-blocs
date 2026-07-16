// ============================================================================
//  DELCO BADGE (header) — module One Data (OD.define)  v1
//  Ex-bloc on-app-load n°4. Module app-level : ancre masquée dans le header,
//  PERSISTANT. Il peint le badge #delco-header-badge rendu par la top nav.
// ============================================================================
// ====================================================================
//  Delco · Badge header — Custom JS
//  À placer dans un workflow "On app load" ou "On layout mounted".
//  Le HTML + CSS du badge doit être présent dans un Embed du layout.
//  Ce script s'occupe juste de polller la RPC et mettre à jour le badge.
// ====================================================================

OD.define('delco-badge', {
  async mount(__anchor, ctx) {
  const DELCO_PAGE_URL = "/fr/delco";       // À adapter à ta route Delco
  const REFRESH_MS = 5 * 60 * 1000;  // refresh toutes les 5 min
  const RETRY_MS = 2000;           // retry init toutes les 2s

  // Hot reload : on nettoie les timers précédents s'il y en a
  if (window.__delcoBadge) {
    try { window.__delcoBadge.destroy && window.__delcoBadge.destroy(); } catch (_) { }
  }
  window.__delcoBadge = {};

  const doc = __anchor.ownerDocument || document;

  let intervalId = null;
  let authListener = null;
  let bootTimer = null;
  let isBooted = false;
  let clickBound = false;

  function getSupabase() { return ctx.supabase; }   // client du tenant (socle)

  function getBadge() { return doc.getElementById("delco-header-badge"); }
  function getLink() { return doc.getElementById("delco-header-link"); }

  function applyState(totalUnread, hasUrgent) {
    const badge = getBadge();
    if (!badge) return;
    if (!totalUnread || totalUnread === 0) {
      badge.dataset.state = "idle";
      return;
    }
    badge.dataset.state = hasUrgent ? "urgent" : "warn";
    const numEl = badge.querySelector(".delco-header-badge-num");
    if (numEl) numEl.textContent = totalUnread > 99 ? "99+" : String(totalUnread);
  }

  function bindClickOnce() {
    if (clickBound) return;
    const link = getLink();
    if (!link) return;
    link.addEventListener("click", function (ev) {
      ev.preventDefault();
      if (typeof wwLib !== "undefined" && wwLib.goTo) {
        wwLib.goTo(DELCO_PAGE_URL);
      } else {
        doc.defaultView.location.href = DELCO_PAGE_URL;
      }
    });
    clickBound = true;
  }

  async function fetchAndApply() {
    // Si le DOM du badge n'est pas encore là, on attend
    if (!getBadge() || !getLink()) return false;
    bindClickOnce();

    const sb = getSupabase();
    if (!sb) return false;

    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return false;

      const { data, error } = await sb.rpc("agent_signals_count");
      if (error) { console.error("[delco-badge] RPC:", error); return false; }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) { applyState(0, false); return true; }
      applyState(Number(row.total_unread || 0), Boolean(row.has_urgent));
      return true;
    } catch (e) {
      console.error("[delco-badge]", e);
      return false;
    }
  }

  async function boot() {
    if (isBooted) return;
    const success = await fetchAndApply();
    if (success) {
      isBooted = true;
      console.log("[delco-badge] init OK");
      if (bootTimer) { clearTimeout(bootTimer); bootTimer = null; }
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(fetchAndApply, REFRESH_MS);

      const sb = getSupabase();
      if (sb && !authListener) {
        const { data } = sb.auth.onAuthStateChange((event) => {
          if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
            fetchAndApply();
          } else if (event === "SIGNED_OUT") {
            applyState(0, false);
          }
        });
        authListener = data;
      }
      return;
    }
    // Retry indéfini toutes les 2s
    bootTimer = setTimeout(boot, RETRY_MS);
  }

  const onVisChange = () => {
    if (doc.visibilityState === "visible") {
      if (!isBooted) boot();
      else fetchAndApply();
    }
  };
  doc.addEventListener("visibilitychange", onVisChange);

  // Exposer un refresh public (utilisable par la page Delco après une action)
  window.__delcoBadge.refresh = function () {
    fetchAndApply();
  };

  // Cleanup pour hot reload
  window.__delcoBadge.destroy = function () {
    try {
      if (intervalId) clearInterval(intervalId);
      if (bootTimer) clearTimeout(bootTimer);
      if (kickTimers) kickTimers.forEach((t) => clearTimeout(t));
      doc.removeEventListener("visibilitychange", onVisChange);
    } catch (_) { }
  };

  // Filet de sécurité : on relance fetchAndApply à intervalles fixes sur les
  // 30 premières secondes, indépendamment du boot(). En prod, WeWeb met
  // parfois du temps à hydrater le DOM de l'Embed + la session Supabase ;
  // ces relances garantissent que le badge finit par s'afficher.
  const kickTimers = [];
  [500, 1500, 3000, 5000, 8000, 12000, 20000, 30000].forEach((delay) => {
    kickTimers.push(setTimeout(async () => {
      const ok = await fetchAndApply();
      // Au premier succès, on démarre le refresh régulier s'il n'existe pas
      if (ok && !intervalId) {
        isBooted = true;
        intervalId = setInterval(fetchAndApply, REFRESH_MS);
      }
    }, delay));
  });

  boot();
}
});
