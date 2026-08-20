# Design Tokens

Tokens live in `packages/design-system/src/tokens.css` as CSS custom properties
(`--od-*`). Values were extracted from the legacy WeWeb modules on 2026-08-20
(frequency-ranked; see Task 1 inventory).

## Source analysis (legacy)

| Token | Value | Legacy usage rank |
|---|---|---|
| `--od-color-primary` | `#2a5ea9` | most-used color (476 occurrences) |
| `--od-color-accent` | `#53bda7` | 2nd (150) |
| `--od-color-primary-strong` | `#1f4a85` | 3rd (138) |
| `--od-color-danger` | `#e24b4a` | 4th (110) |
| `--od-color-info` | `#7a98c5` | 5th |
| `--od-color-warning` | `#fac055` | frequent accent |
| `--od-color-background` | `#f5f8fc` | common page background |
| `--od-color-surface-muted` | `#eef2f8` | common muted surface |
| radii | 6 / 8 / 10 / 12 / 999 px | dominant legacy radii |
| font | system stack (`-apple-system, …`) | dominant legacy stack |

## Rules

1. Components consume **semantic** tokens (`--od-color-primary`,
   `--od-color-surface`, …), never raw hex values.
2. Tenant branding may only override the allowlisted brand properties through
   `applyTenantBranding()` (`src/theme.ts`). Values must be hex colors — the
   guard rejects anything else, so control-plane payloads cannot inject CSS.
3. Focus visibility: every interactive component exposes a `:focus-visible`
   outline using `--od-color-focus`.
4. Reduced motion: animations and the motion scale collapse under
   `prefers-reduced-motion`.
5. Contrast: text/background pairs must meet WCAG AA (4.5:1). The
   `--od-color-on-*` tokens define the paired foreground for solid fills.

## Primitives

Button, Input, Select, Dialog, Tabs, Table, Badge, Toast, Skeleton,
EmptyState, ErrorState, PageShell, DropdownMenu, DateRangePicker — exported
from `@one-data/design-system`, styled by `components.css`, documented in
Storybook (`pnpm --filter web storybook`).

## Deviation from plan stack

The plan mentions Tailwind + Radix. The baseline ships dependency-free CSS
custom properties and hand-rolled accessible primitives instead: zero extra
runtime/build dependencies, same token model. Adopting Tailwind/Radix later is
compatible with this token layer (tokens stay the single source of truth).
