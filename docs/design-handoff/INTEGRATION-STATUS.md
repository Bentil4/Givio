# Integration status — Givio donation/admin/operator/family screens handoff

Tracks what has actually been wired into `src/app` from the design handoff bundles, so work
can resume cleanly in a later session without re-deriving it. This file is the single source
of truth for integration state — it supersedes any earlier per-bundle status note.

Two bundles were received and preserved unmodified under `docs/design-handoff/`:

- **`donation-screens/`** — the first handoff: donation model + 5 donation components +
  operator entry / family live pages only.
- **`full-app-screens/`** — a later, much larger handoff covering nearly every screen in the
  app (auth, operator, family, admin). Its `README.md` documents all 30 screens; its
  `angular-reference/` is the canonical source for anything integrated below. Where a file
  exists in both bundles, the two are byte-identical (confirmed by diff) except that
  `full-app-screens` is a superset.

## Context

This work covers **Epic 3 (Donation Recording, Offline Sync & Receipts)** plus large parts
of **Epic 4** (Reporting/Dashboards/Export/Audit) and a restyle of **Epic 1/2** screens
(login, event management), per `_bmad-output/planning-artifacts/epics.md`. At the time this
was integrated, `sprint-status.yaml` had Epic 2 still in progress (Story 2.1 `in-progress`,
2.2–2.4 `backlog`) and Epics 3/4 entirely `backlog` — **no story files exist for Epic 3 or 4
yet**. The user explicitly chose, twice, to skip the normal story-file/branch ceremony and
drop reference components straight into the working tree on
`feature/story-2-1-create-edit-events`, purely to get the UI in place quickly. **No new story
files were created; `sprint-status.yaml` was not updated.** Treat everything below as UI
scaffolding, not completed stories — real Epic 3/4 story work still needs to happen against
the architecture spine (AD-1..AD-10), independent of this scaffolding.

## Pass 1 — first bundle (`donation-screens/`)

| Bundle path | Landed at | Changed? |
|---|---|---|
| `data/models/donation.ts` | `src/app/data/models/donation.ts` | No — copied verbatim |
| `data/models/event.ts` | `src/app/data/models/donation-event.ts` | **Renamed** — see "The two Event models" below |
| `feature/components/{connection-banner,donation-form,pending-queue,conflict-resolver,donation-row}` | same paths under `src/app/feature/components/` | No |
| `feature/pages/organizer/donation-entry` | same path | Import of `DonationEvent`/`blockedReason`/`canRecordInto` repointed to `donation-event` |
| `feature/pages/family/family-live` | same path | Same import fix |
| routes | `organizer/entry`, `family/:code` (no guard) merged into `app.routes.ts` | — |

## Pass 2 — expanded bundle (`full-app-screens/`)

`data/models/donation.ts` and `event.ts` in this bundle are byte-identical to what pass 1
already landed — nothing to re-copy there. Ten screens/components had **no existing
real-logic equivalent** in the repo, so they were copied in the same way as pass 1, safely:

| Bundle path | Landed at | Changed? |
|---|---|---|
| `feature/components/session-expired` | same path | No |
| `feature/pages/organizer/event-select` | same path | Import of `data/models/event` repointed to `donation-event` |
| `feature/pages/organizer/mobile-entry` | same path | No |
| `feature/pages/organizer/operator-donations` | same path | No |
| `feature/pages/family/family-code` | same path | No |
| `feature/pages/admin/admin-donations` | same path | **Fixed a real TS2349 compile bug** in the bundle itself: `invalid(form, control)` called `.get()` on a variable typed as a union of two different `FormGroup`s, which breaks overload resolution. Fixed by calling `.get()` on each concretely-typed form separately (`admin-donations.ts` `invalid()` method) rather than through the union. |
| `feature/pages/admin/admin-conflicts` | same path | No |
| `feature/pages/admin/admin-trash` | same path | No |
| `feature/pages/admin/admin-audit` | same path | No |
| `feature/pages/admin/admin-reports` | same path | No |

Routes merged into `app.routes.ts`:
- Organizer children: index route (`''`) **swapped** from `OrganizerDashboard` (an empty,
  logic-free shell per the Architecture Spine's brownfield notes — file untouched, just
  unlinked from routing) to `EventSelect`; added `entry/phone` (`MobileEntry`) and
  `donations` (`OperatorDonations`).
- Admin (`dashboard`) children: added `donations` (`AdminDonations`),
  `donations/conflicts` (`AdminConflicts`), `donations/deleted` (`AdminTrash`),
  `reports` (`AdminReports`), `audit` (`AdminAudit`).
- Top level: added `family` (bare, `FamilyCode`) alongside the existing `family/:code`.

Both `ng build --configuration development` and `ng serve` were verified clean after this
pass — every new page produces its own lazy chunk, no compile errors.

## Pass 3 — login, admin-users, admin-events, admin-event-detail: replaced with real wiring

The 4 screens held back after pass 2 (because they duplicated real, working Epic 1/2
functionality) were subsequently replaced at the user's request — option 2 from pass 2's
list: adopt the bundle's richer UI, re-wire real service calls into it, retire nothing.

| File | What changed |
|---|---|
| `src/app/auth/pages/login/login.ts` / `.html` / `.scss` | Bundle's markup/lockout-UX adopted; `AuthService.login()`, `.role()`, `ROLE_HOME` redirect logic preserved from the original (option 1, exactly as the bundle's own README called for — "restyle only"). Non-existent `/forgot-password` links removed (no such route exists — no self-service reset in this system; an Admin resets via Story 1.3's user edit instead). `login.spec.ts` updated to the renamed API (`form`/`submit()`/`serverError()`); added a lockout test. **6/6 tests pass.** |
| `src/app/feature/pages/admin/admin-users/admin-users.ts` / `.html` | Bundle UI adopted, wired to the real `UserService` (`listUsers`/`createUser`/`updateUser`/`setUserActive`). `ManagedUser` is now derived from the real `AdminUser` shape via `toManaged()` — see gaps below. **Edit was added back** (the bundle's dialog was create-only; the real `admin-settings.ts` it replaces supports edit, so an "Edit" action + dialog reuse was added to avoid a functional regression against shipped Story 1.3). Generated-password banner added back for the same reason. |
| `src/app/feature/pages/admin/admin-events/admin-events.ts` / `.html` | Bundle UI adopted, wired to the real `EventService.createEvent()`/now also `.loadEvents()` (new — see below). Switched from the bundle's `DonationEvent` model to the real `Event` model (see "Event models" below). A **required Host/Family name field was added** (the bundle's create dialog didn't have one at all, but real `EventDataService.createEvent()` requires `hostName`). The "assign operators" section and family-code note were initially removed here, then **restored in pass 5** — see below. |
| `src/app/feature/pages/admin/admin-event-detail/admin-event-detail.ts` / `.html` | Bundle UI adopted. Loading is real (`appDb.events.get(id)`, same Dexie-only pattern `edit-event.ts` already uses — same known limitation: only sees events synced to *this* device). Real `Event` model. An **"Edit details" link to the existing, working `edit-event` route was added** (admin-event-detail has no field-editing form of its own — pause/close/roster management only). Assigned-operators card cross-references real `UserService.listUsers()` against `assignedUserIds`. **Pause / Resume / Close / Regenerate-code are intentionally NOT wired** — there is no status-lifecycle service (Story 2.2), no operator-assignment write path (Story 2.3), and no access-code generation (Story 2.4) anywhere in this codebase yet. Confirming one of these now shows an honest "isn't available yet in this build" message instead of silently no-op'ing or faking success. |

**New capability added to make the events *list* real:** `EventDataService.listEvents()` /
`EventService.loadEvents()` — reads `appDb.events.toArray()` (Dexie-only, same local-first
pattern as the rest of Story 2.1; no Appwrite `listDocuments` pull was added, so a fresh
browser/device with an empty Dexie cache will show no events even if some exist server-side
— full multi-device sync is Epic 4's Realtime work). This was a genuinely new, if small,
capability — `EventService` previously only ever accumulated events created/edited in the
current session.

**Pass 3.1 — the superseded originals were then deleted outright** (at the user's explicit
follow-up request — "replace all previous screens with the screens shared", not just unlink
them): `feature/pages/admin/admin-settings/` (superseded by `admin-users`, same
`UserService`), `feature/pages/admin/create-event-screen/` (superseded by `admin-events`'
inline create dialog, same `EventService.createEvent()`), `feature/pages/organizer/
organizer-dashboard/` (empty shell, superseded by `event-select`) — all three directories,
including their `.spec.ts` files, removed with `rm -r`. Their routes (`dashboard/settings`,
`events/new`) and stale explanatory comments were removed from `app.routes.ts` accordingly.
`edit-event` was **deliberately kept** — unlike the other three, it has no bundle
replacement (`admin-event-detail` has no field-editing form of its own, only pause/close/
roster/code management), so it's still linked from `admin-event-detail`'s "Edit details".
Route renamed: `dashboard/settings` → `dashboard/users`. `admin-layout.ts`'s `navItems` were
fixed to point at real routes — they previously pointed at non-existent top-level paths
(`/events`, `/donation`, `/report`), a pre-existing bug unrelated to this work, fixed as part
of making these screens reachable through the UI.

Verified after deletion: `ng build` clean, full test suite 85 passed / 2 failed (same 2
pre-existing, unrelated failures as before — the 17 tests belonging to the 3 deleted specs
correctly disappeared, nothing else broke), `curl` against all admin/organizer/family routes
still 200.

**Known gaps in the `admin-users` real-data mapping** (the real `AdminUser`/`UserService`
don't carry everything the bundle's `ManagedUser` UI expects):
- No "invited" status — the real backend only returns `active: boolean`, so status is
  active/deactivated only, never invited.
- No active-session count — the deactivate-confirmation dialog always uses the generic
  "signed out of every device" copy rather than naming a device count.
- "Last active" column shows `registeredAt` (the only timestamp the real backend returns)
  rather than a true last-active time.

## The two `Event` models

`src/app/data/models/event.ts` (Story 2.1, real) and
`src/app/data/models/donation-event.ts` (handoff, `DonationEvent`) are different shapes and
remain **intentionally separate**, not reconciled into one:

- Real (`event.ts`): `EventStatus = 'active'|'paused'|'closed'`, `hostName`, `id`, no
  `occasion`/`familyCode`/`operators`/`totalMinor`. Now also exports `EVENT_STATUS_CHIP`
  (maps to the repo's global `.tag-*` classes).
- Handoff (`donation-event.ts`): `EventStatus = 'draft'|'live'|'paused'|'closed'`,
  `occasion`, `familyCode`, `EventOperator[]`, `donorCount`/`totalMinor`,
  `canRecordInto()`/`blockedReason()`/`maySeeDonorPhone()`.

As of pass 3, the split is now a **deliberate** one, not just an artifact of dodging a merge
conflict: `admin-events` and `admin-event-detail` (real, service-wired — pass 3) use the real
`Event`. `donation-entry`, `family-live`, and `event-select` (Epic 3/4 UI scaffolding, no
backend at all yet — pass 1/2) still use `DonationEvent`, and will continue to until Epic 3
actually ships a `DonationService`/Realtime layer — at that point, revisit whether
`DonationEvent`'s extra fields (richer operator info, live totals) should fold into the real
`event.ts` or stay a separate donation-desk view model composed from `Event` + `Donation`
data. Don't merge them before that — right now `Event` has no `totalMinor`/`donorCount`/
`operators[]` because nothing computes them yet, and fabricating those fields on the real
model would be worse than the current explicit split.

## Pass 4 — admin dashboard rebuilt to match the shared design; orphaned widgets removed

The `/dashboard` index page (`AdminDashboard`) was never touched by passes 1–3 — it's the
original brownfield placeholder (6 identical fake "Total Users 1,234" stat cards, plus
generic "Quick Actions"/"System Health" panels invented in the brownfield code, none of it
matching any screen the handoff actually specifies). The user flagged it as not matching the
design. There is **no Angular component for this screen in either bundle** — only a written
spec (README screen #12, "Admin overview") and a description in the JS-templated
`givio-donations-prototype.html` (a different, external design system — per the README's own
"Fidelity" section, not meant to be copied literally; it's layout/content reference only).
Rebuilt from scratch against that spec, on the repo's real token system:

- `src/app/feature/pages/admin/admin-dashboard/{admin-dashboard.ts,.html,.scss}` — full
  rewrite. 4 stat cards (Raised today / Donors today / Live events / Awaiting sync), a
  "Live events" panel + "Live feed" panel side by side, matching the spec's grid/panel
  layout. **Live events count and the events list are real** (`EventService.loadEvents()`,
  same as `admin-events`). Raised today / Donors today / Awaiting sync / Live feed are
  honest `—`/empty states with a one-line reason ("Available once donation recording
  ships") — Epic 3's Donation collection and offline queue don't exist, so these can't be
  real numbers yet. The design's yellow "unresolved conflict" attention bar was **omitted
  entirely** (not shown as permanent dead UI) since no conflict-detection data source exists
  either — revisit once Epic 3/`admin-conflicts` has real data to check.
- `admin-dashboard.spec.ts` — updated to provide `provideRouter([])` (the new template uses
  `routerLink`, which the old spec's bare `TestBed` didn't support).

**Deleted as orphaned** (only ever used by the old `admin-dashboard`, no equivalent in the
real design spec — same "replace, don't leave unlinked" treatment as pass 3.1):
`feature/components/stat-card/`, `recent-activity/`, `quick-actions/`, `system-health/`
(components + specs). This also **removed the `stat-card.spec.ts` failure** that had been
present since before this session — it's gone now, not fixed in place.

`admin-events.ts`'s `?create=1` deep-link handling (added in pass 3 so the old
`QuickActions` "Create Event" button could open the create dialog) was **reverted** — its
only caller no longer exists, and the new dashboard's "Live events" panel intentionally only
has a "Manage events" link (`routerLink="/dashboard/events"`), matching the design spec
exactly rather than inventing a shortcut the design doesn't have.

**Verification done:** `ng build` clean; full test suite **81 passed, 1 failed** (only the
pre-existing `app.spec.ts` title assertion remains — confirmed unrelated via `git diff`, and
now the *only* known-bad test in the whole suite). **Visual confirmation is incomplete**:
headless-Chrome screenshots (via a throwaway `playwright-core` install driving the system's
real Chrome binary — see "Verification done" below) confirmed `/login` and `/family` render
correctly, but `/dashboard` itself is behind `roleGuard(['admin'])` and there's no real
Appwrite login available in this environment to get past it. A guard-bypass was attempted for
screenshot purposes and correctly blocked by the environment's own safety classifier as a
security-relevant change; it was reverted immediately (confirmed via `grep` that
`canActivate`/`canActivateChild` are back to their original state, no bypass markers left).
**This screen has had zero human eyes on it — worth checking first**, logged in as a real
Admin, before trusting it matches expectations.

## Pass 5 — admin-events' create dialog: "Assign operators" / family-code note restored

The user flagged `admin-events`'s create-event dialog as not matching the shared design.
Pass 3 had **removed** the "Assign operators" section and the family-code privacy note from
that dialog entirely (reasoning at the time: Story 2.3's permission-derivation Function
doesn't exist, so a selection there couldn't be real). Asked which specific mismatch this
was, the user confirmed it was that removal, and asked for the same treatment already used
on `admin-event-detail`'s pause/close/regenerate actions: **visible, but honestly
non-functional**, rather than deleted.

Restored in `admin-events.ts` / `.html` (scss already had the `.op-chips`/`.code-note`
styles — pass 3 never removed them, only stopped using them):

- **Assign operators section**: back, showing real operator accounts
  (`UserService.listUsers()` filtered to `role === 'operator' && active`) as toggleable
  chips (`toggleOperator`/`isSelected` — real local UI state, restored from the bundle
  as-is). A `.field-note` line states plainly that a selection here isn't sent anywhere:
  *"Not wired up yet — selecting an operator here doesn't assign them. Assignment needs a
  server-side permission step that isn't built in this codebase yet."* `save()` still does
  not pass any operator IDs to `EventService.createEvent()` — doing so without Story 2.3's
  Function would write `assignedUserIds` locally while Appwrite's actual document
  permissions stay unchanged, i.e. an operator would show as "assigned" but genuinely
  couldn't read/write the event's data (AD-2) — a false assignment, which is worse than not
  offering the control, hence the explicit caption rather than silent data loss on submit.
- **Family-code note**: back, copy corrected from the bundle's false claim ("The family
  access code is generated once you save") to an honest one: codes aren't available in this
  build yet, and will be generated from the event detail page once that ships.

Verified: `ng build` clean; full suite still **81 passed, 1 failed** (same single
pre-existing, unrelated `app.spec.ts` failure). Not visually confirmed for the same reason
as pass 4 — behind the admin guard, no real login available in this environment.

## Pass 6 — edit-event restyled to match the design system

The user flagged the edit-event page as not matching the shared design. Unlike the pass
3/5 screens, **`edit-event` was never touched by any earlier pass** — it's real, working,
kept deliberately (no bundle screen covers basic-field editing; `admin-event-detail` only
does status/roster/code). It was still in the pre-existing brownfield style: Tailwind-esque
utility classes (`text-primary-dark`, `p-xl`, etc.) and the generic `<app-input>`/
`<app-button>` shared components — visually unrelated to the `.glass`/`.tag`/`.t-page-title`/
`.dialog`/`.field` language every other admin-* page now uses.

Rebuilt `edit-event.html` on that same language — no bundle equivalent exists for this exact
screen shape (a full-page basic-fields editor), so it reuses the `.dialog`/`.field`/`.input`/
`.field-error`/`.empty`/`.skel` classes already established by `admin-donations.scss` (which
`edit-event.scss` now `@use`s, same pattern as every other admin-* page), just laid out as a
page-embedded card instead of a modal (`.dialog`'s `max-width`/`max-height`/`overflow`
overridden to `none`/`none`/`visible` so it isn't clipped like an actual modal would be).
`edit-event.ts`'s logic is **entirely unchanged** — same `FormBuilder.group`, same
`EventService.updateEvent()` call, same navigation on success — only a `styleUrl` and an
`invalid(control)` template helper (matching the convention used on every other form in this
codebase) were added. `Button`/`Input` (the shared components this page stopped using) were
checked and are still used elsewhere (`page-titles`), so they were left alone — not
orphaned.

Verified: `ng build` clean; full suite still **81 passed, 1 failed** (same pre-existing
failure) — all 5 `edit-event.spec.ts` tests pass unchanged, confirming the form's actual
behavior wasn't touched, only its markup/styling. Not visually confirmed, same reason as
passes 4/5.

## Pass 7 — Story 2.3: real operator assignment (Function + Angular)

The user asked to build the operator-assignment feature for real — not restyle a page this
time, actual new capability, since Story 2.3 ("Assign Operators — Permission Derivation")
didn't exist anywhere in the codebase before this pass. Per AD-2/AD-9, assignment has to be
server-derived: Appwrite document permissions can only be set with a server API key, so this
is genuinely new backend work in `functions/set-role-and-permissions/`, not just an Angular
service.

**Backend (`functions/set-role-and-permissions/`):**
- `src/shared.js` (new) — extracted `buildClient`/`verifyAdminCaller`/`VALID_ROLES`/`VALID`/
  `invalid`/`hasValue` out of `admin-users.js` so the new module can reuse the exact same
  JWT/admin-role verification rather than duplicating security-critical code. `admin-users.js`
  now imports from it — no behavior change (all 33 existing tests still pass unchanged).
  In the process, fixed a stale comment referencing a nonexistent
  `src/app/data/stores/auth-store.ts` — the real file is `data/services/auth.service.ts`.
- `src/event-assignment.js` (new) — `assignOperators` action: validates `eventId` +
  `assignedUserIds` (array of strings), confirms every ID is a real account with the
  `operator` label (one `users.get()` per ID — rejects a nonexistent or non-operator ID
  before touching Databases), fetches the Event document, and writes both
  `assignedUserIds` and recomputed permissions (`[admin CRUD] + [Role.read(Role.user(uid))
  per assignee]`, per AD-2) in a single `updateDocument` call. Donation-collection
  permissions are explicitly **not** touched here — that collection doesn't exist yet
  (Epic 3); this Function will need extending again once it does.
- `src/main.js` — now routes by `action`: `assignOperators` (and any future event-assignment
  action) goes to the new module, everything else falls through to `admin-users.js` as
  before.
- **New required Function environment variables**: `APPWRITE_DATABASE_ID` and
  `APPWRITE_EVENTS_COLLECTION_ID` (Appwrite Console → Functions → set-role-and-permissions →
  Settings → Variables). These are **not** set anywhere in this environment — same
  unconfigured-placeholder situation as the Angular side's `environment.ts`
  `eventsCollectionId`/`appwriteDatabaseId` (see Verification below). The handler returns a
  clear 500 rather than a confusing failure if they're missing.
- `tests/event-assignment.test.js` (new, 12 tests) — auth gate, payload validation, the
  non-operator/nonexistent-ID rejection, event-not-found (404), the successful
  assignedUserIds+permissions write, empty-array unassignment, and a Databases failure
  (502). Full suite: **45/45 pass** (33 existing + 12 new).

**Frontend (`src/app`):**
- `data/appwrite/invoke-admin-function.ts` (new) — extracted `UserService`'s private
  `invoke()`/`parseBody()` so `EventDataService` can call the same Function without
  duplicating the execution/error-parsing logic. `UserService` now delegates to it — no
  behavior change (all 11 existing tests still pass unchanged).
- `data/services/event-data.service.ts` — new `assignOperators(eventId, assignedUserIds)`:
  loads the event from Dexie (404 → `ServiceError` if missing), calls the Function, and only
  on success writes `assignedUserIds` to the local Dexie copy. **Online-only, no outbox
  path** — unlike `createEvent`/`updateEvent`, there's nothing meaningful to queue-and-retry
  locally for a write only the trusted Function can make; a failed call throws before any
  local state changes, so Dexie is never left claiming an assignment Appwrite doesn't have.
- `data/services/event.service.ts` — thin `assignOperators` wrapper updating the `_events`
  signal, mirroring `createEvent`/`updateEvent`.
- `feature/pages/admin/admin-event-detail/` — the read-only "Assigned operators" card is now
  a real add/remove UI: all active operator accounts shown as toggleable chips reflecting
  `assignedUserIds`, a "Save assignment" action (enabled only when the local selection
  differs from what's persisted, with a "Reset" escape hatch) calling
  `EventService.assignOperators`. Editing is hidden for a closed event (read-only roster
  display instead) — closed events don't take new assignments.
- `feature/pages/admin/admin-events/` — the create dialog's "Assign operators" chips (added
  back in pass 5 as an honestly-inert preview) are now real: `save()` chains
  `assignOperators(newEvent.id, [...selected])` after a successful `createEvent()`. The
  dialog **always closes once the event is created**, even if the follow-up assignment call
  fails — keeping it open with the same submitted form values risked a second click creating
  a duplicate event. A partial failure (event created, assignment failed) surfaces via the
  page-level error banner naming exactly that, with a pointer to the event detail page as the
  fallback. The "not wired up yet" disclaimer is removed.
- 3 new test blocks added (`event-data.service.spec.ts` — 3 tests, `event.service.spec.ts` —
  1 test, `quick-actions.spec.ts` unaffected). Full Angular suite: **85 passed, 1 failed**
  (same single pre-existing `app.spec.ts` failure, confirmed unrelated).

**Verification gap — flagging clearly, not glossing over it:** end-to-end verification
against a real Appwrite Cloud project is this feature's own Cross-Cutting DoD requirement
(any AD-1/AD-9 story "must be verified end-to-end against the real provisioned Appwrite
Cloud project, not mocks alone"), and **it has not been done**. Two separate blockers, both
pre-existing and not introduced by this pass:
1. `src/environments/environment.development.ts`'s `appwriteDatabaseId` and
   `eventsCollectionId` are still the literal placeholder strings from
   `environment.example.ts` — meaning every "real" `EventDataService`/`Databases` call this
   whole session (not just this pass) has been silently no-op'ing against Appwrite and
   succeeding only against the local Dexie cache. `environment.ts` (the production file) has
   a real `appwriteDatabaseId` but `eventsCollectionId` is still a placeholder there too.
2. The Function's new `APPWRITE_DATABASE_ID`/`APPWRITE_EVENTS_COLLECTION_ID` variables aren't
   set anywhere (they can't be — they're Console-side configuration, not committable code).

Until both are filled in with real values, `assignOperators` cannot be exercised against
real Appwrite in this environment — only unit-tested against fakes, which is what's actually
been done. This needs to happen before Story 2.3 could be called done per this project's own
Definition of Done.

## What is still NOT done (no services wired, anywhere)

Every copied page/component uses local `signal()` placeholders exactly as shipped — none of
this is connected to Appwrite, Dexie, or any real data. Per the bundles' own README:

- `DonationService`, `OfflineQueue`, `EventService` (donation-facing) — don't exist. This is
  Epic 3's real data-layer work: Dexie outbox, `SyncEngine`, Appwrite `Donation` collection,
  AD-3/AD-4/AD-5/AD-8 conflict/money/receipt rules.
- No route guard on `/family` or `/family/:code` (`eventCodeGuard` doesn't exist) — both
  routes are currently wide open.
- No audit-log read service backing `admin-audit`, no export (SheetJS) wired into
  `admin-reports`/`family-live`'s export sheet, no Realtime subscription anywhere.

## Verification done

- `npx ng build --configuration development` — clean, all 3 passes.
- `ng serve` + `curl` against `/`, `/login`, `/family`, `/organizer`, `/dashboard/users`,
  `/dashboard/events` (and pass 1/2's routes) — all 200.
- `npx ng test --watch=false` (full suite, after pass 3): **102 passed, 2 failed** — both
  failures (`app.spec.ts` "should render title", `stat-card.spec.ts` "should create") are
  pre-existing, confirmed via `git diff` to be untouched by any of this work (stale
  boilerplate title assertion; a required `stat-card` input not provided in its own spec).
  `login.spec.ts` specifically: 6/6 pass, including a new lockout-after-5-attempts test.
- **No visual/browser confirmation** — no headless browser tooling (`chromium-cli`/
  Playwright) was available in this environment. A manual look in a real browser is still
  worth doing, especially for `admin-users`/`admin-events`/`admin-event-detail` (real data
  now flows through them) and the family-code/mobile-entry screens, none of which have had
  human eyes on them yet.

## Where things are

- Branch: `feature/story-2-1-create-edit-events` (unchanged — no new branch was cut, per the
  "drop in fast" choice made twice now)
- Preserved bundles: `docs/design-handoff/donation-screens/`,
  `docs/design-handoff/full-app-screens/` (source of truth for anything not yet integrated)
- This file: the running log — update it, don't replace it, on the next pass
