# Route Inventory — WeWeb → Modern Router

Source: `topnav.js` `PAGE_UID` map (production navigates by clean path under the
`/fr` prefix; the WeWeb editor navigates by page UID). Additional paths found in
feature modules are listed below.

## Canonical routes (topnav.js PAGE_UID)

| Production path | WeWeb page UID | Primary module(s) |
|---|---|---|
| `/fr/accueil` | `f84d6f00-de35-45b9-ae23-c1f1e46bfa69` | dashboard |
| `/fr/admin` | `1d30e3ac-fdee-4cce-b9c5-190aee995d23` | admin |
| `/fr/client` | `f5b60fe2-bc14-4b3e-ba84-82ddfa11248c` | client-search |
| `/fr/notifications` | `8868fa49-e115-482d-9da2-4249e16196da` | notifications |
| `/fr/pipe-commercial` | `9e90d49a-215f-4c2b-b2bb-2d7c4f9aabd6` | kanban |
| `/fr/performances` | `1499f15f-e8cb-4561-aea8-bdeeeb080b68` | performances |
| `/fr/objectifs` | `c9b4f9a6-460a-4365-8a06-95e30a13cbdb` | objectifs |
| `/fr/bilaterales` | `7bfcfe73-4e89-40cf-bc84-1e07ddb478a6` | bilaterales |
| `/fr/activite` | `55717966-7e07-4957-9969-399198cce1ad` | activite, agenda |
| `/fr/marketing` | `99519997-f935-471a-9147-b0118191b991` | lead-mgmt |
| `/fr/vo-liste` | `188b0f0b-5e80-4a77-a856-26469b08b614` | vo-liste |
| `/fr/vn-liste` | `5a11786d-59a3-49eb-a7a9-542f7d3c460e` | (VN list) |
| `/fr/bdc-vn` | `5ecc8832-d99b-47c7-a853-0921624d80ef` | bdc-vn |
| `/fr/delco` | `da5005d5-42e4-4b37-9d42-f8b8728ddb0e` | delco-page, delco-chat |
| `/fr/annuaire` | `a6c1a683-2490-4263-8dc5-5e187bcbec87` | annuaire |
| `/fr/tutos` | `3395973c-c8eb-476b-bda2-9862b5a3e30f` | tutos |
| `/fr/authentification` | `a97c534c-b592-4282-bd20-d0333f28ff75` | auth (editor-only; prod login is served at `/fr/`) |
| `/fr/fiche-client` | `259f1951-a2d4-4b90-ac83-0b3febe1d4ec` | fiche-shell + 8 nested modules |

## Additional paths referenced in feature modules

| Path | Referenced from |
|---|---|
| `/fr/propo-vo-create` | kanban, likes, vo-liste |
| `/fr/propo-vo-update` | bilaterales, kanban, likes, vo-liste |

## WeWeb variable UUIDs (state to replace)

| UUID | Purpose (from topnav.js comments) |
|---|---|
| `55490583-c88b-4748-916e-4d203db07742` | `VAR_CLIENT` — selected client |
| `fb2cad2c-cd04-42e0-8909-e3c91c8dcfac` | `FICHE_TAB_VAR` — active client-workspace tab index |
| `9fc0eca4-2325-4774-8e27-4c66515a9166` | `VAR_NB_NOTIFS` — notification badge count |

## Modern routing decisions (per plan §2.4)

- Named React Router route constants replace `PAGE_UID`; no page UUIDs in the
  modern app.
- Client workspace moves from global `VAR_CLIENT` + tab-index variable to
  parameterized routes: `/fr/clients/:clientId/<tab>`.
- `/fr/authentification` becomes `/auth` handling in the modern SPA; unauthen-
  ticated users are redirected there, with deep-link return after login.
- Proposal create/update become `/fr/pipe-commercial/propositions/nouvelle` and
  `/fr/pipe-commercial/propositions/:proposalId` (final slugs confirmed in
  Task 12).
