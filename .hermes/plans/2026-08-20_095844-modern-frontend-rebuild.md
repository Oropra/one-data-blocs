# One Data Modern Frontend Rebuild Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Rebuild the One Data CRM as a maintainable, tested, independently deployable web application, replacing the current WeWeb shell and 43 CDN-loaded `OD.define(...)` modules without interrupting tenant operations.

**Architecture:** Build a React + TypeScript single-page application around the existing tenant Supabase projects, control-plane tenant resolution, database schema, RPCs, Row Level Security, Edge Functions, and communication providers. Use a modular monolith organized by business domain, with typed infrastructure packages and route-level feature boundaries. Migrate incrementally behind tenant- and feature-level flags, running the new application beside WeWeb until parity is proven; do not rewrite the database and frontend simultaneously.

**Tech Stack:** React 19, TypeScript, Vite, React Router, TanStack Query, Zustand, React Hook Form, Zod, Supabase JS v2, Tailwind CSS with Radix UI primitives, Vitest, Testing Library, Mock Service Worker, Playwright, Storybook, ESLint, Prettier, pnpm, GitHub Actions, Sentry, and a static host such as Cloudflare Pages or Vercel.

---

## 1. Current Context and Repository Findings

This repository is not a conventional frontend project. It contains approximately 34,700 lines of unbundled browser JavaScript and no package manifest, framework, automated test suite, type system, or local application entry point.

The current runtime is:

1. A minimal WeWeb shell loads `socle.js`.
2. `socle.js` resolves a tenant through a Supabase control plane, creates the tenant-specific Supabase client, restores authentication, loads the current application user, retrieves a module manifest, injects CDN scripts, and mounts modules into `[data-od-module]` anchors.
3. Forty-three files register modules through `OD.define(...)`.
4. WeWeb page routes, page UUIDs, variable UUIDs, `wwLib`, global `window.__*` objects, DOM events, polling intervals, and `sessionStorage` act as the router, state layer, event bus, and lifecycle manager.
5. Modules call tenant Supabase tables, views, RPCs, Realtime, Storage, and Edge Functions directly.
6. `publish.sh`, `refresh.sh`, and `publish_rpc.sql` publish immutable module versions through jsDelivr and a control-plane registry, including tenant-specific pins.

Representative coupling discovered in the repository:

- `socle.js`: tenant bootstrap, authentication, user profile, WeWeb variable shim, module loader, and SPA remount behavior.
- `topnav.js`: route map, WeWeb page UUID map, user/site/client state, navigation, and persistent layout.
- `site-bus.js`: site selection and user-per-site state through a global API and polling.
- `fiche-shell.js`: client workspace composition and eight nested feature modules.
- `client-search.js`: client querying/creation, address lookup, SIRENE functions, duplicate checks, and navigation.
- `dashboard.js`: role-specific dashboards backed by existing RPCs.
- `kanban.js`, `admin.js`, `bilaterales.js`, `lead-mgmt.js`, and `vo-liste.js`: very large feature modules with UI, state, data access, authorization assumptions, CSS, and integrations combined in single files.
- Communication modules include VoIP/Twilio, SMS, WhatsApp, and email, communicating through globals such as `__VOIP_UI__`, `__SMS_UI__`, `__WA_UI__`, and `__EMAIL_UI__`.

### Constraints to preserve

- Multi-tenant resolution by host/slug and tenant-specific Supabase credentials.
- Supabase Auth session behavior, password recovery, first-login password change, and `get_current_user` profile resolution.
- Existing RLS and role/perimeter behavior; UI checks are not a security boundary.
- Existing database tables, views, RPCs, Edge Functions, Storage buckets, Realtime subscriptions, and external providers until explicitly migrated.
- Tenant branding, tenant-specific module/version rollout, and fast rollback.
- Production French routes such as `/fr/accueil`, `/fr/client`, `/fr/fiche-client`, `/fr/pipe-commercial`, and `/fr/admin`.
- Responsive behavior and all role-specific experiences.
- No exposure of service-role keys or tenant secrets in the browser bundle.

### Explicit non-goals for the first release

- Redesigning the Supabase database while rebuilding the UI.
- Introducing micro-frontends or many independently deployed frontend applications.
- Preserving WeWeb page UUIDs as a permanent abstraction.
- Reproducing the `OD.define` CDN registry in the final architecture.
- Rewriting every feature before any user can test the new application.

---

## 2. Target Architecture

### 2.1 Repository layout

Create the modern application inside this repository while leaving legacy files operational during migration:

```text
apps/
  web/
    src/
      app/                    # providers, router, layouts, route guards
      routes/                 # lazy route entry points
      features/               # business-domain slices
        auth/
        dashboard/
        clients/
        client-workspace/
        sales-pipeline/
        activity/
        objectives/
        notifications/
        vehicles/
        administration/
        communications/
      components/             # application-level shared components
      styles/
      main.tsx
packages/
  api/                        # Supabase clients and typed repositories
  auth/                       # session/profile/permission model
  config/                     # runtime tenant and environment schemas
  contracts/                  # generated database types + shared Zod schemas
  design-system/              # tokens, primitives, Storybook
  observability/              # logging, Sentry, telemetry
  test-utils/                 # factories, MSW handlers, render helpers
supabase/
  contracts/                  # checked-in API inventory and migration notes
legacy/
  README.md                   # map to existing root modules during transition
scripts/
  inventory-legacy.mjs
  check-contracts.mjs
```

Do not move the existing root `.js` modules during the first phases; current publishing scripts depend on those paths. Move or archive them only after WeWeb retirement.

### 2.2 Runtime bootstrap

1. Read a non-secret control-plane URL and anon key from build/runtime configuration.
2. Determine the tenant slug from an explicit development override or hostname.
3. Call `resolve_tenant_public` and validate its response with Zod.
4. Create exactly one tenant Supabase client.
5. Initialize auth and call `get_current_user` for the application profile.
6. Provide `TenantProvider`, `AuthProvider`, `CurrentUserProvider`, `SiteProvider`, `QueryClientProvider`, and `ErrorBoundary` at the application root.
7. Route unauthenticated users to `/auth`; route authenticated users according to permissions.
8. Keep tenant configuration and session state in providers; keep server data in TanStack Query; use Zustand only for small cross-route UI state such as selected client/site.

### 2.3 Data-access boundary

Components must not scatter raw `supabase.from(...)`, `.rpc(...)`, or Edge Function calls throughout the tree. Each feature owns typed query and mutation functions under `features/<domain>/api`, backed by shared clients in `packages/api`.

Use:

- generated Supabase database types for tables/views/functions;
- Zod for control-plane, Edge Function, and loosely typed RPC responses;
- TanStack Query keys and invalidation conventions;
- explicit adapters that normalize legacy column naming (`ID_User`, `IDVu`, `TEl_MOB`, etc.) into stable frontend domain models;
- `AbortSignal` for cancellable queries;
- centralized error normalization and user-safe messages.

### 2.4 State replacement map

| Legacy mechanism | Replacement |
|---|---|
| WeWeb variable UUIDs | named Zustand/provider state |
| `window.oropraUser` | typed current-user context |
| `window.oropraSite` | `SiteProvider` and hooks |
| `window.__odSelectedClient` / storage | selected-client store plus URL ID where appropriate |
| `window.__dash`, `window.__kanban`, etc. | feature-local state and TanStack Query cache |
| custom DOM events | typed store actions or query invalidation |
| 300–1200 ms polling for local state | subscriptions/hooks |
| `[data-od-module]` + MutationObserver | React route/component composition |
| page UUID navigation | React Router named route helpers |
| injected `<style>` strings | design-system tokens and component styles |
| global communication UI APIs | typed communication service/context |

Prefer route parameters such as `/fr/clients/:clientId` over hidden global selection where links and refreshes should preserve context.

### 2.5 Deployment and rollout

- Build one immutable versioned artifact per release.
- Resolve tenant branding/configuration at runtime so one artifact serves all tenants.
- Deploy preview, staging, and production environments.
- Use the control plane (or a small equivalent configuration table) for `frontend_channel`/feature flags: `legacy`, `pilot`, `modern`.
- Route pilot tenants to the modern host/application while all others remain on WeWeb.
- Keep the last known-good artifact available for one-step rollback.
- Add schema/contract compatibility checks before deployment.

---

## 3. Delivery Strategy and Milestones

Use a strangler migration. The unit of migration is a complete user journey, not an arbitrary source file. A feature is not migrated when it merely renders; it is migrated when permissions, loading/error/empty states, mutations, realtime behavior, responsive behavior, accessibility, telemetry, and rollback are covered.

Suggested order:

1. Foundation and inventory.
2. Tenant bootstrap, authentication, shell, routing, site selection.
3. Read-only dashboard pilot.
4. Client search, creation, and client workspace.
5. Sales pipeline and proposals/orders.
6. Activity, objectives, notifications, appointments, and management views.
7. Vehicles and administration.
8. Communication providers.
9. Tenant cutovers and WeWeb retirement.

The dashboard is the safest first vertical slice because it is primarily read-only and already relies on explicit RPCs. Administration and communications should migrate late because they are mutation-heavy and integration-heavy.

---

## 4. Implementation Tasks

### Task 1: Freeze and document the migration baseline

**Objective:** Make the current application behavior and migration scope observable before changing architecture.

**Files:**
- Create: `docs/modernization/current-system.md`
- Create: `docs/modernization/module-inventory.csv`
- Create: `docs/modernization/route-inventory.md`
- Create: `docs/modernization/integration-inventory.md`
- Create: `scripts/inventory-legacy.mjs`
- Read: all root `*.js`, `README-publication.md`, `publish.sh`, `refresh.sh`, `publish_rpc.sql`

**Steps:**

1. Parse every `OD.define('<key>')` declaration and record source file, approximate size, mount dependencies, persistent/page-level status, and known route.
2. Extract and classify all table/view names, RPC names, Edge Function names, Storage buckets, Realtime channels, WeWeb variable UUIDs, workflow UUIDs, page UUIDs, global `window` contracts, DOM events, and external URLs.
3. Build a route-to-module map from `topnav.js`, WeWeb configuration, and production observation.
4. Record role-dependent behavior for roles 1–8 and site/perimeter rules.
5. Record critical journeys: login/recovery, site switch, client search/create/open, client communication, pipeline state transition, proposal/order generation, appointment and RPV, user administration, and logout.
6. Mark apparent temporary behavior that must not survive, including `kanban.js` falling back to mock cards when `get_kanban_cards` fails.
7. Capture screenshots or Playwright traces for desktop/mobile and each role in a controlled test tenant.

**Verification:**

```bash
node scripts/inventory-legacy.mjs --check
```

Expected: all 43 module definitions are represented; unresolved globals, UUIDs, and backend calls are reported as errors rather than silently skipped.

**Commit:** `docs: inventory legacy WeWeb application`

### Task 2: Create the workspace and quality gates

**Objective:** Establish a reproducible modern frontend development environment without changing production behavior.

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `.editorconfig`
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app/App.tsx`
- Modify: `.gitignore`
- Create: `.github/workflows/web-ci.yml`

**Steps:**

1. Initialize pnpm workspaces and pin the package-manager version.
2. Configure strict TypeScript, including `noUncheckedIndexedAccess` and path aliases.
3. Configure ESLint, Prettier, Vitest, Testing Library, and Playwright.
4. Add scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `test:e2e`, and `storybook`.
5. Render a minimal application and a test that verifies the root bootstraps.
6. Add CI for install, generated-contract drift check, lint, typecheck, unit tests, production build, and smoke E2E.
7. Keep legacy publication scripts untouched.

**Verification:**

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test --run
pnpm build
```

Expected: all commands pass and `apps/web/dist/` is produced.

**Commit:** `build: scaffold typed frontend workspace`

### Task 3: Establish the design system and accessibility baseline

**Objective:** Replace duplicated CSS strings with a coherent, tenant-aware component system.

**Files:**
- Create: `packages/design-system/package.json`
- Create: `packages/design-system/src/tokens.css`
- Create: `packages/design-system/src/theme.ts`
- Create: `packages/design-system/src/components/*`
- Create: `apps/web/.storybook/*`
- Create: `docs/modernization/design-tokens.md`

**Steps:**

1. Extract current colors, typography, spacing, radii, shadows, breakpoints, and states from representative modules.
2. Define semantic tokens rather than feature-prefixed values: background, surface, text, muted, primary, success, warning, danger, border, focus.
3. Map tenant logo, group name, and optional brand overrides onto CSS custom properties without allowing arbitrary unsafe CSS.
4. Build accessible primitives: Button, Input, Select, Dialog, DropdownMenu, Tabs, Table, Badge, Toast, Skeleton, EmptyState, ErrorState, DateRangePicker, and responsive PageShell.
5. Add keyboard, focus, reduced-motion, color-contrast, and screen-reader requirements.
6. Add Storybook stories and interaction tests for all states.

**Verification:**

```bash
pnpm --filter @one-data/design-system test --run
pnpm --filter web storybook:build
```

Expected: component tests pass; Storybook builds; automated accessibility checks report no serious violations.

**Commit:** `feat: add One Data design system`

### Task 4: Inventory and type backend contracts

**Objective:** Turn the existing Supabase surface into explicit, checked contracts before features are migrated.

**Files:**
- Create: `packages/contracts/src/database.types.ts`
- Create: `packages/contracts/src/control-plane.ts`
- Create: `packages/contracts/src/domain/*`
- Create: `packages/api/src/client.ts`
- Create: `packages/api/src/errors.ts`
- Create: `packages/api/src/edge-functions.ts`
- Create: `supabase/contracts/backend-inventory.yaml`
- Create: `scripts/check-contracts.mjs`

**Steps:**

1. Generate database types from a sanitized development tenant; never commit credentials.
2. Compare tenant schemas and document whether all tenant projects are schema-compatible.
3. Add Zod schemas for `resolve_tenant_public`, `get_current_user`, key RPC responses, and Edge Function responses.
4. Define normalized domain types for User, Site, Client, Appointment, Proposal, Vehicle, Notification, and communication records.
5. Add adapters from legacy database column names to domain names.
6. Add repository helpers that require an injected tenant Supabase client.
7. Add contract fixtures derived from sanitized responses.
8. Make CI fail if generated types or the backend inventory drift unexpectedly.

**Verification:**

```bash
pnpm contracts:generate
pnpm contracts:check
pnpm --filter @one-data/api test --run
```

Expected: generated types are current; fixtures validate; no service-role value or real customer data is present.

**Commit:** `feat: define typed Supabase contracts`

### Task 5: Implement tenant bootstrap and runtime configuration

**Objective:** Replace the bootstrap portion of `socle.js` without WeWeb dependencies.

**Files:**
- Create: `packages/config/src/env.ts`
- Create: `packages/config/src/tenant.ts`
- Create: `apps/web/src/app/providers/TenantProvider.tsx`
- Create: `apps/web/src/app/BootstrapScreen.tsx`
- Test: `apps/web/src/app/providers/TenantProvider.test.tsx`
- Test: `apps/web/e2e/bootstrap.spec.ts`

**Steps:**

1. Write failing tests for hostname resolution, explicit local override, unknown tenant, malformed response, and network failure.
2. Implement validated public environment loading.
3. Implement hostname-to-slug logic using control-plane data/configuration rather than hard-coded production host maps where possible.
4. Call `resolve_tenant_public`, validate the response, and create one Supabase client.
5. Display branded loading and actionable error screens.
6. Ensure logs redact anon tokens and never include sessions.
7. Run unit and E2E tests.

**Verification:**

```bash
pnpm --filter web test --run TenantProvider
pnpm --filter web test:e2e --grep "tenant bootstrap"
```

Expected: known tenants initialize once; unknown tenants receive a controlled error page; no `wwLib` access exists.

**Commit:** `feat: add tenant-aware application bootstrap`

### Task 6: Implement authentication and current-user resolution

**Objective:** Rebuild login, logout, recovery, first-login password change, session refresh, and application-profile loading.

**Files:**
- Create: `packages/auth/src/AuthProvider.tsx`
- Create: `packages/auth/src/permissions.ts`
- Create: `apps/web/src/features/auth/routes/LoginRoute.tsx`
- Create: `apps/web/src/features/auth/components/*`
- Create: `apps/web/src/app/guards/RequireAuth.tsx`
- Test: `packages/auth/src/AuthProvider.test.tsx`
- Test: `apps/web/e2e/auth.spec.ts`

**Steps:**

1. Model auth states explicitly: booting, anonymous, authenticated/profile-loading, ready, and fatal-profile-error.
2. Implement email/password login and generic failure messaging.
3. Implement password-reset email and recovery callback handling.
4. Implement `must_change_password` and `set_password_changed` behavior.
5. Load `get_current_user` once per authenticated user and invalidate it on auth changes.
6. Implement logout that clears user/site/client state and Query cache.
7. Implement permission helpers for role and capability checks, while relying on RLS/Edge Functions for enforcement.
8. Cover refresh, expired token, second account in the same browser, and deep-link return after login.

**Verification:**

```bash
pnpm --filter @one-data/auth test --run
pnpm --filter web test:e2e --grep "authentication"
```

Expected: all legacy auth paths work without WeWeb; protected routes cannot flash sensitive content.

**Commit:** `feat: rebuild authentication flows`

### Task 7: Build the application shell, router, and named navigation

**Objective:** Replace WeWeb pages, page UUIDs, `topnav.js`, and remount observers with declarative routing and layout.

**Files:**
- Create: `apps/web/src/app/router.tsx`
- Create: `apps/web/src/app/routes.ts`
- Create: `apps/web/src/app/layout/AppLayout.tsx`
- Create: `apps/web/src/app/layout/TopNavigation.tsx`
- Create: `apps/web/src/app/layout/MobileNavigation.tsx`
- Create: `apps/web/src/app/ErrorBoundary.tsx`
- Test: `apps/web/src/app/router.test.tsx`
- Test: `apps/web/e2e/navigation.spec.ts`

**Steps:**

1. Define stable route constants and a French route hierarchy.
2. Add lazy-loaded route boundaries and route-level error handling.
3. Recreate menus and role-driven visibility from `topnav.js` using route metadata.
4. Support deep links, browser back/forward, refresh, and 404 handling.
5. Show tenant branding and current-user controls.
6. Add route-level loading indicators rather than a full-page loader for all transitions.
7. Verify desktop, tablet, mobile, and keyboard navigation.

**Verification:**

```bash
pnpm --filter web test --run router
pnpm --filter web test:e2e --grep "navigation"
```

Expected: all supported paths survive refresh; no page UUID or `wwLib.goTo` remains in the modern app.

**Commit:** `feat: add application shell and routing`

### Task 8: Replace the site bus and global selection state

**Objective:** Replace WeWeb variable shims, `site-bus.js`, global client selection, DOM events, and polling with typed state.

**Files:**
- Create: `apps/web/src/app/providers/SiteProvider.tsx`
- Create: `apps/web/src/app/stores/useWorkspaceStore.ts`
- Create: `apps/web/src/features/sites/api/siteQueries.ts`
- Create: `apps/web/src/app/layout/SiteSelector.tsx`
- Test: `apps/web/src/app/providers/SiteProvider.test.tsx`

**Steps:**

1. Write tests for initial site selection, out-of-perimeter rejection, account changes, and site switches.
2. Load the current user's perimeter and sites with typed queries.
3. Select the profile's site when permitted, otherwise the first permitted site.
4. Keep site selection in memory by default; persist only if product requirements explicitly approve it.
5. Invalidate site-scoped queries when the site changes.
6. Store selected client by ID, preferably in the route; do not store whole database rows in global state or `sessionStorage`.
7. Add a temporary compatibility bridge only if an embedded legacy module must coexist on a modern page; isolate it under `features/legacy-bridge` and give it a removal issue.

**Verification:**

```bash
pnpm --filter web test --run SiteProvider
```

Expected: no local polling; changing site updates all subscribed features once and cannot select a forbidden site.

**Commit:** `feat: replace WeWeb global application state`

### Task 9: Deliver the dashboard vertical slice to a pilot tenant

**Objective:** Prove the architecture with a read-only, role-aware production feature.

**Files:**
- Create: `apps/web/src/features/dashboard/api/dashboardQueries.ts`
- Create: `apps/web/src/features/dashboard/model/*`
- Create: `apps/web/src/features/dashboard/routes/DashboardRoute.tsx`
- Create: `apps/web/src/features/dashboard/components/*`
- Test: `apps/web/src/features/dashboard/**/*.test.tsx`
- Test: `apps/web/e2e/dashboard.spec.ts`

**Steps:**

1. Port `get_dashboard`, `get_activite_equipe`, `get_stock_synthese`, and `get_dashboard_leads` behind typed query functions.
2. Extract projections, working-day calculations, grouping, and role-view logic into pure tested functions.
3. Rebuild seller, team-lead, director, admin, and marketing views with the design system.
4. Preserve period defaults and avoid cross-user/cross-navigation state leakage.
5. Add loading, partial-error, empty, and stale-data states.
6. Compare KPI values against the legacy dashboard on fixed fixtures and a staging tenant.
7. Enable only for an internal/pilot tenant and collect telemetry.

**Verification:**

```bash
pnpm --filter web test --run dashboard
pnpm --filter web test:e2e --grep "dashboard"
```

Expected: fixture-level KPI parity; staging data parity within documented formatting differences; role snapshots approved.

**Commit:** `feat: migrate role-aware dashboard`

### Task 10: Migrate client search and client creation

**Objective:** Rebuild client lookup/create as the entry point to the primary CRM journey.

**Files:**
- Create: `apps/web/src/features/clients/api/clientQueries.ts`
- Create: `apps/web/src/features/clients/api/clientMutations.ts`
- Create: `apps/web/src/features/clients/routes/ClientSearchRoute.tsx`
- Create: `apps/web/src/features/clients/components/ClientSearchForm.tsx`
- Create: `apps/web/src/features/clients/components/CreateClientDialog.tsx`
- Create: `apps/web/src/features/clients/model/clientSchema.ts`
- Test: `apps/web/src/features/clients/**/*.test.tsx`
- Test: `apps/web/e2e/clients.spec.ts`

**Steps:**

1. Port individual/company filters, pagination, and exact search semantics.
2. Put filter/page state in URL search parameters where practical.
3. Rebuild address autocomplete and SIRENE lookup behind typed, cancellable services.
4. Port duplicate detection from `oropra-doublons.js` into pure domain functions and mutations.
5. Port `client_creer`, `cycle_ouvrir`, duplicate signaling, and SIRENE upsert behavior.
6. Navigate to `/fr/clients/:clientId` after selection or creation.
7. Test permission-denied, out-of-perimeter duplicate, unavailable external lookup, invalid data, and double-submit behavior.

**Verification:**

```bash
pnpm --filter web test --run clients
pnpm --filter web test:e2e --grep "client search|client creation"
```

Expected: query and mutation parity; one client/cycle is created under retry/double-click tests; external lookup failure remains non-blocking when legacy behavior is non-blocking.

**Commit:** `feat: migrate client search and creation`

### Task 11: Migrate the client workspace one tab at a time

**Objective:** Replace `fiche-shell.js` and its eight nested modules with a stable route and independently testable tabs.

**Files:**
- Create: `apps/web/src/features/client-workspace/routes/ClientWorkspaceRoute.tsx`
- Create: `apps/web/src/features/client-workspace/components/ClientHeader.tsx`
- Create: `apps/web/src/features/client-workspace/components/ClientTabs.tsx`
- Create feature folders for `profile`, `likes`, `contacts`, `appointments`, `vehicles`, `commercial`, `company`, and `history`
- Test: `apps/web/e2e/client-workspace.spec.ts`

**Steps:**

1. Load the client by route ID and handle not-found/forbidden states.
2. Build the header and tab routing, e.g. `/fr/clients/:clientId/profile`.
3. Migrate tabs in this order: profile (`cf-fiche.js`), contacts (`contacts.js`), history (`historique.js`), appointments (`rdv.js`), commercial (`pcom.js`), vehicles (`vehicules.js`), company (`entreprise.js`), likes (`likes.js`).
4. For each tab, first write repository/model tests, then component tests, then E2E for its critical mutation.
5. Replace interval-based client change detection with route changes and Query cache invalidation.
6. Add tab-level lazy loading and error boundaries.
7. Preserve action entry points for call, SMS, WhatsApp, email, and RPV, initially through a typed adapter if their full migration is later.

**Verification:**

```bash
pnpm --filter web test --run client-workspace
pnpm --filter web test:e2e --grep "client workspace"
```

Expected: direct links to every tab work after refresh; changing client cannot show stale data from the previous client; all writes refresh dependent tabs.

**Commit pattern:** one commit per tab, e.g. `feat: migrate client contacts tab`

### Task 12: Migrate the sales pipeline and proposal/order journey

**Objective:** Replace `kanban.js`, `propale-vo.js`, and related proposal/order flows without carrying over global state or silent mocks.

**Files:**
- Create: `apps/web/src/features/sales-pipeline/api/*`
- Create: `apps/web/src/features/sales-pipeline/model/transitions.ts`
- Create: `apps/web/src/features/sales-pipeline/routes/PipelineRoute.tsx`
- Create: `apps/web/src/features/sales-pipeline/routes/ProposalRoute.tsx`
- Create: `apps/web/src/features/sales-pipeline/components/*`
- Test: `apps/web/e2e/sales-pipeline.spec.ts`

**Steps:**

1. Encode transition rules and manager permissions as pure tested functions.
2. Port seller/site/period filters with URL-backed state.
3. Implement accessible pointer and keyboard movement; use optimistic updates with rollback only after backend semantics are confirmed.
4. Remove the production fallback to mock cards; backend failure must produce an observable error state.
5. Port proposal/version loading, archive rules, client/vehicle selection, finance data, and document generation.
6. Confirm Storage bucket and generated-document behavior with contract tests.
7. Add concurrency tests for two users moving/updating the same deal.

**Verification:**

```bash
pnpm --filter web test --run sales-pipeline
pnpm --filter web test:e2e --grep "pipeline|proposal|order"
```

Expected: allowed transitions match legacy rules; forbidden transitions fail in UI and backend; generation/download works in staging; no mock data appears in production.

**Commit:** `feat: migrate sales pipeline and proposals`

### Task 13: Migrate remaining business domains in risk order

**Objective:** Complete functional parity while keeping each domain independently releasable.

**Files:**
- Create feature slices under `apps/web/src/features/` for the mapped legacy modules.
- Update: `apps/web/src/app/router.tsx`
- Update: `docs/modernization/module-inventory.csv`

**Order and source mapping:**

1. Activity and appointments: `activite.js`, `agenda.js`, `rdv.js`, `rpv.js`.
2. Objectives and performance: `objectifs.js`, `performances.js`.
3. Notifications and lead management: `notifications.js`, `notif-badge.js`, `lead-mgmt.js`.
4. Bilaterals and tours: `bilaterales.js`, `tours.js`.
5. Vehicles: `vo-liste.js`, `bdc-vn.js`, vehicle portions of `kanban.js`.
6. Directory and tutorials: `annuaire.js`, `tutos.js`.
7. Administration and onboarding: `admin.js`, `onboarding.js`.
8. Delco: `delco-page.js`, `delco-chat.js`, `delco-badge.js`.

For every feature:

1. Identify its backend contracts and permissions.
2. Write fixtures and repository tests.
3. Extract pure business rules before porting UI.
4. Build route/component behavior with loading/error/empty states.
5. Cover its highest-risk mutation with Playwright.
6. Run parity review with a domain owner.
7. Mark the legacy module as replaced in the inventory and enable it for the pilot cohort.

**Verification:**

```bash
pnpm quality
pnpm --filter web test:e2e
```

Expected: all migrated domains pass CI and domain-owner acceptance; inventory has no unowned module.

**Commit pattern:** one feature journey per commit, never a single bulk “migrate remaining modules” commit.

### Task 14: Migrate communication integrations behind typed adapters

**Objective:** Replace global communication APIs and cross-window state while preserving Twilio/email/SMS/WhatsApp behavior.

**Files:**
- Create: `apps/web/src/features/communications/services/CommunicationGateway.ts`
- Create: `apps/web/src/features/communications/providers/CommunicationProvider.tsx`
- Create feature folders for `voip`, `sms`, `whatsapp`, and `email`
- Create: `apps/web/src/features/communications/components/CommunicationDock.tsx`
- Test: `apps/web/e2e/communications.spec.ts`

**Steps:**

1. Inventory provider tokens, token-fetch Edge Functions, callbacks, database logging, incoming events, and browser permission requirements without printing secrets.
2. Define a provider-neutral interface for start/open/send/status/end operations.
3. Port VoIP initialization and UI with explicit lifecycle cleanup.
4. Port SMS, WhatsApp, and email composers and history updates.
5. Replace globals and `window.parent/top` lookup with React context and typed events.
6. Mock providers in unit/E2E tests; run separate staging integration tests with test accounts/numbers.
7. Add consent, error, reconnect, duplicate-send, and interrupted-navigation tests.

**Verification:**

```bash
pnpm --filter web test --run communications
pnpm --filter web test:e2e --grep "communications"
```

Expected: provider mocks verify exactly-once commands; staging smoke tests verify real token acquisition and status callbacks without exposing credentials.

**Commit:** `feat: migrate customer communication integrations`

### Task 15: Add observability, performance budgets, and security checks

**Objective:** Make the modern app safer and easier to operate than the legacy frontend.

**Files:**
- Create: `packages/observability/src/*`
- Create: `apps/web/src/app/Telemetry.tsx`
- Create: `lighthouserc.json`
- Update: `.github/workflows/web-ci.yml`
- Create: `docs/operations/frontend-runbook.md`
- Create: `docs/security/frontend-threat-model.md`

**Steps:**

1. Add Sentry with tenant slug, release, route, and role family; exclude PII, tokens, message bodies, and customer details.
2. Add structured events for bootstrap/auth failures, route errors, mutation failures, and feature-flag exposure.
3. Define Core Web Vitals and bundle-size budgets; inspect route chunks.
4. Add dependency audit, secret scanning, CSP, security headers, and source-map policy.
5. Threat-model tenant resolution, session storage, XSS, unsafe HTML, document URLs, communication integrations, and cross-tenant data leakage.
6. Test RLS across representative roles/tenants; do not infer security from hidden controls.
7. Create rollback and incident procedures.

**Verification:**

```bash
pnpm audit --prod
pnpm build
pnpm lighthouse
pnpm security:check
```

Expected: budgets pass; test errors reach the non-production Sentry project with redacted context; cross-tenant/RLS tests pass.

**Commit:** `chore: add frontend observability and security gates`

### Task 16: Build deployment, feature flags, and rollback

**Objective:** Deploy immutable modern builds and control tenant rollout independently from legacy module publishing.

**Files:**
- Create: `apps/web/Dockerfile` or host-specific deployment config
- Create: `.github/workflows/web-preview.yml`
- Create: `.github/workflows/web-deploy.yml`
- Create: `docs/operations/deployment.md`
- Create: `docs/operations/rollback.md`
- Update control-plane schema through a separately reviewed migration repository/process if it is not managed here

**Steps:**

1. Produce immutable artifacts labeled by commit SHA.
2. Configure preview, staging, and production environments with public runtime configuration only.
3. Add control-plane rollout fields/flags for tenant channel and per-feature overrides.
4. Route internal tenants first, then one low-risk pilot tenant, then cohorts.
5. Add synthetic smoke tests after deploy: tenant resolution, login page, authenticated dashboard, client search, and logout.
6. Automatically halt promotion when smoke/error/performance thresholds fail.
7. Document one-command rollback to the previous frontend release and legacy WeWeb routing.

**Verification:**

```bash
pnpm release:dry-run
pnpm smoke --base-url "$STAGING_URL" --tenant "$TEST_TENANT"
```

Expected: staging serves a SHA-addressable artifact; a tenant can switch modern → legacy without database changes; rollback is exercised, not merely documented.

**Commit:** `ci: add tenant-aware frontend deployment`

### Task 17: Execute tenant cutover and retire WeWeb

**Objective:** Remove WeWeb only after measurable parity and safe rollback exist.

**Files:**
- Update: `docs/modernization/module-inventory.csv`
- Create: `docs/modernization/cutover-checklist.md`
- Create: `docs/modernization/decommission-report.md`
- Eventually archive: root legacy `*.js`, `publish.sh`, `refresh.sh`, `publish_rpc.sql`, `README-publication.md`

**Cutover gate per tenant:**

- All required routes and role families accepted.
- Critical E2E journeys pass against that tenant's staging clone or sanitized equivalent.
- Schema/Edge Function compatibility is green.
- Error rate and Web Vitals meet targets during pilot.
- Communications and generated documents pass real integration smoke tests.
- Support and rollback owners are assigned.
- Database backup and operational rollback are confirmed.

**Steps:**

1. Run internal staff exclusively on modern for at least one full business cycle.
2. Cut over one pilot tenant and compare support/error/business metrics.
3. Expand in small cohorts; keep legacy read/write behavior available only for the documented rollback window.
4. Freeze legacy feature development except severity-one fixes.
5. When all tenants are modern and the rollback window expires, disable WeWeb traffic.
6. Revoke obsolete control-plane publication permissions, remove the module registry only after confirming no consumer remains, and remove stale CDN pins/tags according to retention policy.
7. Archive legacy modules in a tagged release or `legacy-weweb` branch, then remove them from `main` in a dedicated reviewed change.
8. Update system and onboarding documentation.

**Verification:**

```bash
pnpm quality
pnpm --filter web test:e2e
pnpm smoke --base-url "$PRODUCTION_URL" --all-cutover-tenants
```

Expected: every active tenant passes smoke checks; traffic and logs show no WeWeb/module-registry consumer for the agreed observation period; rollback has a retained artifact until formal closure.

**Commit:** `chore: retire legacy WeWeb frontend`

---

## 5. Testing and Validation Strategy

### Unit tests

Prioritize business rules that are currently embedded in render functions:

- role/capability mapping;
- site/perimeter selection;
- dashboard aggregation and projections;
- sales transition rules;
- date/working-day calculations;
- client and phone/email validation;
- duplicate detection;
- formatting and legacy-to-domain adapters.

### Component tests

Use Testing Library and MSW for forms, dialogs, tabs, tables, pagination, optimistic states, errors, empty states, and keyboard behavior. Test behavior rather than implementation details.

### Contract tests

Validate sanitized real response shapes for the control plane, high-value RPCs, and Edge Functions. Run compatibility checks against every tenant schema before a cohort rollout.

### E2E tests

Maintain a small, high-value suite across roles:

1. Login, recovery, first password change, logout.
2. Site selection and permission boundaries.
3. Search, create, and open a client.
4. Edit the client and create an appointment/RPV.
5. Move a sales card through an allowed transition and reject a forbidden transition.
6. Generate/download a proposal or order document.
7. Admin creates/updates/deactivates a user.
8. Communication smoke flows with provider mocks; real staging smoke separately.

### Visual and accessibility validation

- Storybook visual snapshots for primitives and critical composite components.
- Playwright screenshots at phone, tablet, laptop, and wide desktop sizes.
- axe checks on routes and dialogs.
- Manual keyboard and screen-reader review for authentication, navigation, data tables, drag/drop alternatives, forms, and modals.

### Parity validation

For each migrated journey, run legacy and modern against the same fixed fixture or staging dataset and compare:

- returned record IDs/counts;
- KPI calculations;
- mutation payloads and resulting rows;
- permissions and error behavior;
- generated document metadata;
- user-visible loading, empty, and failure states.

Do not use pixel identity as the sole parity criterion; semantic and business parity matter more than preserving legacy markup.

---

## 6. Risks and Mitigations

### Undocumented backend contracts

**Risk:** The frontend references many tables, RPCs, functions, naming variants, and globals without a central schema.

**Mitigation:** Complete Task 1 and Task 4 before broad feature work; generate types; use fixtures; run tenant compatibility checks.

### Cross-tenant schema drift

**Risk:** Separate tenant Supabase projects may not expose identical contracts.

**Mitigation:** Build a schema fingerprint/migration-level check and block rollout for incompatible tenants. Prefer converging tenant schemas before adding frontend branches.

### Security regressions

**Risk:** Current role checks are mixed into UI code and could be mistaken for authorization.

**Mitigation:** Preserve and test RLS/Edge Function enforcement; run negative tests by role and tenant; never put service-role keys in frontend configuration.

### Big-bang rewrite failure

**Risk:** Thirty-four thousand lines and many integrations cannot safely switch at once.

**Mitigation:** Vertical slices, pilot tenants, feature flags, dual operation, immutable artifacts, and rehearsed rollback.

### Hidden behavior in globals and polling

**Risk:** Removing `window.__*`, DOM events, and timers may reveal implicit coupling.

**Mitigation:** Inventory producers and consumers; add temporary typed compatibility adapters with explicit deletion criteria; migrate complete journeys.

### Stale data and race conditions

**Risk:** Existing modules frequently persist state on `window`, poll, and remount, which can leak state across routes/users.

**Mitigation:** Query keys include tenant/user/site/client scope; logout clears caches; route changes cancel stale work; tests cover rapid switching and account changes.

### Provider integration complexity

**Risk:** VoIP, SMS, WhatsApp, email, SIRENE, geocoding, PDF generation, and Delco can block cutover.

**Mitigation:** Typed adapters, mocks in CI, dedicated staging accounts, late migration, provider-specific runbooks, and observability.

### Feature freeze duration

**Risk:** Maintaining legacy and modern implementations doubles effort.

**Mitigation:** Set explicit ownership, migrate by domain, freeze each legacy domain after acceptance, and time-box the coexistence period.

---

## 7. Decisions to Confirm Before Task 2

1. **Framework:** This plan recommends React rather than Vue because the ecosystem fit for TanStack Query, Radix, Storybook, Playwright, and hiring is strong; confirm team competency.
2. **Hosting:** Choose Cloudflare Pages, Vercel, or equivalent based on custom-domain routing, runtime config, preview deployments, EU requirements, logs, and rollback support.
3. **Repository strategy:** This plan assumes the new app remains in this repository during migration. A new repository is reasonable if access/deployment ownership differs, but the migration inventory must still link both.
4. **Control-plane ownership:** Confirm where schema changes and migrations for tenant rollout flags are managed.
5. **Tenant schema parity:** Confirm whether all tenant Supabase projects share a migration history and how schema upgrades are deployed.
6. **Browser support:** Define supported browsers/devices, especially for VoIP and mobile workflows.
7. **Compliance and telemetry:** Confirm data residency, analytics consent, retention, and PII constraints.
8. **UI direction:** Decide whether the goal is visual parity first or an approved redesign. The implementation should not improvise a product redesign feature by feature.
9. **Internationalization:** Confirm whether French-only is intentional; this plan preserves `/fr` while making strings structurally ready for i18n.
10. **Offline/PWA:** Treat as out of scope unless a documented field-use case requires it.

---

## 8. Definition of Done

The rebuild is complete when:

- all active tenant routes and role-based journeys are implemented in the modern app;
- no modern code imports or accesses `wwLib`, WeWeb UUIDs, `OD.define`, or legacy window globals;
- all Supabase and external interactions pass through typed, tested boundaries;
- tenant/user/site/client cache isolation is verified;
- CI enforces lint, types, unit/component tests, build, contracts, and critical E2E tests;
- deployment is immutable, monitored, cohort-controlled, and rollback-tested;
- every tenant has completed acceptance and cutover;
- production telemetry shows no remaining WeWeb/module-registry consumer for the agreed period;
- obsolete publication credentials and infrastructure are revoked or removed;
- the legacy source is retained only in an immutable archive/tag according to the retention policy.
