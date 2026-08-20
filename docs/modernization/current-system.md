# Current System — Migration Baseline

> Baseline frozen on 2026-08-20 by `scripts/inventory-legacy.mjs`.
> Re-run `node scripts/inventory-legacy.mjs --check` to re-verify.

## Runtime topology

1. A minimal WeWeb shell loads `socle.js`.
2. `socle.js` resolves the tenant through a Supabase control plane, creates the
   tenant-specific Supabase client, restores auth, loads the application user via
   `get_current_user`, fetches the module manifest, injects CDN scripts
   (jsDelivr), and mounts modules into `[data-od-module]` anchors.
3. 43 files register modules through `OD.define('<key>', ...)` (see
   `module-inventory.csv`). Two root files are not modules: `socle.js` (the
   loader) and `oropra-doublons.js` (shared duplicate-detection helper).
4. WeWeb page routes, page UUIDs, variable UUIDs, `wwLib`, `window.__*` globals,
   DOM events, polling intervals, and `sessionStorage` act as router, state
   layer, event bus, and lifecycle manager.
5. Modules call tenant Supabase tables, views, RPCs, Realtime, Storage, and Edge
   Functions directly.
6. `publish.sh`, `refresh.sh`, and `publish_rpc.sql` publish immutable module
   versions through jsDelivr plus a control-plane registry with tenant pins.

## Measured surface (from inventory-report.json)

| Surface | Count |
|---|---|
| `OD.define` modules | 43 |
| Distinct tables/views referenced | 43 |
| Distinct RPCs referenced | 61 |
| Edge Functions invoked | 3 |
| Storage buckets | 1 |
| Realtime channels | 3 |
| `window.__*` / `oropra*` globals | 159 |
| DOM/custom event names | 32 |
| External URLs | 16 |
| WeWeb/UUID literals | 55 |

Full detail: `integration-inventory.md` and `inventory-report.json` (generated).

## Key couplings

- `socle.js` — tenant bootstrap, auth restore, WeWeb variable shim, module
  loader, SPA remount behavior.
- `topnav.js` — `PAGE_UID` route map (18 WeWeb pages, see route-inventory.md),
  user/site/client state, persistent layout. Navigates by path `/fr/...` in
  production, by page UID inside the WeWeb editor.
- `site-bus.js` — site selection shared via a global API plus polling.
- `fiche-shell.js` — client workspace composing 8 nested feature modules
  (`cf-fiche`, `contacts`, `historique`, `rdv`, `pcom`, `vehicules`,
  `entreprise`, `likes`).
- `client-search.js` — client query/create, address lookup, SIRENE, duplicate
  checks, navigation.
- Communication modules (`voip-init`, `voip-ui`, `sms`, `whatsapp`, `email`)
  communicate through globals such as `__VOIP_UI__`, `__SMS_UI__`, `__WA_UI__`,
  `__EMAIL_UI__`.

## Role model

Roles 1–8 gate navigation and feature visibility in `topnav.js` and individual
modules. Enforcement is via Supabase RLS and Edge Functions; UI checks are
cosmetic only and must not be treated as a security boundary in the rebuild.

## Known temporary behavior that must NOT survive migration

- `kanban.js` falls back to **mock cards** when `get_kanban_cards` fails — this
  hides production outages; the modern pipeline must surface an observable
  error state instead.
- Local-state polling via `setInterval` (flagged per-module in the inventory
  CSV, `polling=yes`) must be replaced by subscriptions/hooks.
- Mock markers (`mock_fallback=yes` in the CSV) must be reviewed before the
  corresponding feature is migrated.

## Constraints to preserve

- Multi-tenant resolution by host/slug and tenant-specific Supabase credentials.
- Supabase Auth session behavior, password recovery, first-login password
  change, `get_current_user` profile resolution.
- Existing RLS, tables, views, RPCs, Edge Functions, Storage, Realtime, and
  external providers until explicitly migrated.
- Tenant branding, tenant-pinned module versions, fast rollback.
- Production French routes (`/fr/...`) and responsive, role-specific UX.
- No service-role keys or tenant secrets in the browser bundle.

## Visual baseline

Playwright screenshot/trace capture per role and viewport is pending access to
a controlled test tenant (see plan Task 1 step 7). Tracked as a cutover gate.
