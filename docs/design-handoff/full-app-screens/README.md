# Handoff: Givio donation screens (Admin · Operator · Family Member)

## Overview

A 30-screen UX design for **Givio**, the donation management system for Ghanaian funeral and
wedding collections. Operators record cash / mobile-money / in-kind gifts at the door — online or
offline — Admins oversee events, users, corrections and conflicts, and Family Members watch the
running total live through an event code with no account.

This bundle contains the design reference plus **ready-to-drop Angular source** matched to the
conventions already in `Bentil4/Givio@dev`.

## About the design files

`Givio Donations.dc.html` in this bundle is a **design reference created in HTML** — a clickable
prototype showing intended look and behaviour. It is not production code to copy. The Angular files
under `angular/` in this bundle **are** production-shaped code: standalone components written in
the same style as the existing repo (signal `input()` / `output()`, `templateUrl` + `styleUrl`,
`ChangeDetectionStrategy.OnPush`, `@if` / `@for` control flow, `mat-icon`). Drop them in at the
paths given below and wire the services.

## Fidelity

**High fidelity for layout, structure, copy and interaction; re-skinned for the repo.** The
prototype's *arrangement* — field order, sizing hierarchy, states, wording — is final and should be
followed closely. Its *palette and type* were drawn in a different system; the Angular files in this
bundle are already translated onto the repo's teal/cyan + Syne/DM Sans tokens, and those files are
the styling source of truth. Where the prototype and the SCSS disagree on a colour or a font, the
SCSS is correct.

---

## Styling contract: the repo's own token system

Every SCSS file here is written **against the tokens already defined in `src/styles.scss`**. No new
token layer, no imported design system, nothing to migrate. If a value is not in the list below, it
is not used.

```
Primary      --primary-deep #1a6b7a   --primary-dark #0d4a5a   --primary-mid #00c8e0
             --primary-black #334155  --primary-deep-cyan #0891b2
Accents      --accent-sky #56c8e8     --accent-teal #00d4b0
Backgrounds  --bg-white --bg-light --bg-mist --bg-frost
Functional   --func-success #22c55e --func-error #ef4444 --func-warning #f59e0b --func-info #3b82f6
             --color-danger #ef0b0b
Data / text  --data-1 … --data-4   (--data-4 = secondary text, --data-3 = tertiary)
Type         --font-display 'Syne' (italic display) · --font-body 'DM Sans'
Spacing      --space-xs 4 · sm 8 · md 16 · lg 24 · xl 40 · 2xl 64
Radius       --radius-sm 6 · md 12 · lg 20 · full 9999
Glass        --glass-bg --glass-border --glass-shadow --glass-blur   (via the .glass class)
Motion       --ease cubic-bezier(.4, 0, .2, 1)
```

**Global classes are reused, not re-implemented.** These already exist in `styles.scss` and the new
templates lean on them, so any future change to the repo's button or tag treatment carries through
here for free:

- `.btn` + `.btn-primary` / `.btn-secondary` / `.btn-ghost` — every action in these components.
- `.tag` + `.tag-success` / `.tag-error` / `.tag-info` / `.tag-default` — status chips.
- `.glass` — the surface treatment on cards, drawers, headers and the export sheet.
- `.t-page-title` / `.t-card-title` / `.t-body-em` / `.t-body` / `.t-caption` / `.t-secondary` /
  `.t-tertiary` — the type ladder.
- `.section-label` / `.sub-label` — section headers.
- `.filter-tag` (+ `.active`) — the pattern the donation-type segmented control follows.

Component SCSS only adds what is genuinely local: layout, the oversized amount field, the skeleton
shimmer, the pending-queue drawer geometry, and the conflict cards' emphasis.

Two notes on deliberate deviations, both worth a decision:

1. **Monospace numerals.** The repo has no mono font token; `.token-table td` uses bare
   `font-family: monospace`, and these components follow that. Amounts, receipt numbers and
   timestamps are set in mono deliberately — 142 right-aligned cedi figures in DM Sans do not
   line up, and an operator reading a total back to a family needs the digits to be comparable.
   If you'd rather add a real token, `--font-mono: 'DM Mono', ui-monospace, monospace` pairs with
   DM Sans; a find-and-replace on `font-family: monospace` covers it.
2. **The offline / pending yellow.** `--func-warning #f59e0b` is the base, used at 7–12% for fills
   and 28–35% for borders, with `#92400e` text for contrast. `--func-warning` itself fails contrast
   as body text on a light fill, which is why the text colour is darker than the token.

## What is in `angular/`

Paths are relative to `src/` in the repo.

| File | Purpose |
|---|---|
| `app/data/models/donation.ts` | `Donation`, `DonationType`, `SyncStatus`, `DonationDraft`, `ConflictPair`, money + total helpers. |
| `app/data/models/event.ts` | `DonationEvent`, `EventStatus`, `EventOperator`, `canRecordInto`, `blockedReason`. |
| **Components** | |
| `app/feature/components/connection-banner/` | Offline / syncing / synced banner. Presentational. |
| `app/feature/components/donation-form/` | The 6-field entry form. Emits a validated `DonationDraft`. |
| `app/feature/components/pending-queue/` | Queued-offline drawer with per-record edit / discard. |
| `app/feature/components/conflict-resolver/` | Two-version comparison + three resolutions. |
| `app/feature/components/donation-row/` | One donor row, shared by family and operator lists. |
| `app/feature/components/session-expired/` | Idle-expiry modal. Mount once in the authed shell. |
| **Auth** | |
| `app/auth/pages/login/` | Staff sign in, inline errors, attempt counter, 15-min lockout. |
| **Operator** | |
| `app/feature/pages/organizer/event-select/` | Assigned events, status-gated, with blocked reasons. |
| `app/feature/pages/organizer/donation-entry/` | The desk: entry → confirm → saved, online and offline. |
| `app/feature/pages/organizer/mobile-entry/` | Phone entry: amount-first, custom keypad, 54px save. |
| `app/feature/pages/organizer/operator-donations/` | The operator's own list. Read-only by design. |
| **Family** | |
| `app/feature/pages/family/family-code/` | 8-character code entry, recognition, 4 edge conditions. |
| `app/feature/pages/family/family-live/` | Live total, breakdown, donor list, export sheet, empty + loading. |
| **Admin** | |
| `app/feature/pages/admin/admin-events/` | Events table + create-event dialog. |
| `app/feature/pages/admin/admin-event-detail/` | Code management, operator roster, pause/close, danger zone. |
| `app/feature/pages/admin/admin-users/` | Users table + create-user + deactivate confirmation. |
| `app/feature/pages/admin/admin-donations/` | Full record, filters, edit dialog, soft-delete dialog. **Owns the shared admin SCSS** the other admin pages `@use`. |
| `app/feature/pages/admin/admin-conflicts/` | Conflict queue wrapping `ConflictResolver`. |
| `app/feature/pages/admin/admin-trash/` | Deleted records, 30-day countdown, recovery. |
| `app/feature/pages/admin/admin-audit/` | Append-only trail, filters, export. |
| `app/feature/pages/admin/admin-reports/` | Stats, conic-gradient donut, hour histogram, xlsx export. |
| **Routing** | |
| `app/routes.additions.ts` | Route entries to merge into `app.routes.ts`. |

**Shared SCSS.** `admin-donations.scss` carries the admin page shell — page head, filters,
table, empty/skeleton, dialogs, fields. Every other admin page starts with
`@use '../admin-donations/admin-donations.scss';` and adds only what is local to it. If you'd
rather that lived in a neutral partial, move it to `app/feature/pages/admin/_admin-shared.scss`
and update the eight `@use` lines.

**Every screen in the spec below now has a component.** What remains is the Appwrite wiring:
the three services listed above, the `eventCodeGuard` for the family route, and the idle timer
that drives `SessionExpired`. Each component's TODO comments mark exactly where a service call
belongs, and the placeholder signals at the top of each class are what you replace.

The repo names the operator route segment `organizer` (`roleGuard(['operator'])`); the new operator
pages follow that existing segment rather than renaming it.

### Services these components expect (not included — they are yours to write)

```ts
DonationService   create(draft): Promise<Donation>          // Appwrite createDocument
                  listForEvent(eventId): Signal<Donation[]> // seeded + Realtime subscription
                  update(id, patch, reason): Promise<void>  // reason is required; audit-logged
                  softDelete(id, reason): Promise<void>

OfflineQueue      enqueue(draft): Promise<void>             // IndexedDB, survives reload + power loss
                  pending: Signal<DonationDraft[]>
                  flush(): Promise<SyncResult[]>            // oldest-first, 3 attempts, backoff
                  online: Signal<boolean>                   // navigator.onLine + a real ping

EventService      assignedToMe(): Signal<DonationEvent[]>
                  byCode(code): Promise<DonationEvent>      // family event-code path
```

---

## Screens

### 1. Staff sign in — `/login` (exists; restyle only)

Two-panel 1280×800. Left panel 512px, flat `#08283B`, holds the wordmark, a Poppins Bold 44px
display line ("Every gift, accounted for."), a 17px body paragraph at 72% white, and three mono
stats (100% / <30s / 3) in orange 22px. Right panel: 96px/80px padding, "Sign in" at 30px 700,
email + password fields (44px tall, 8px radius, `#D1D5DB` border), primary button 46px, an "or"
divider, then a secondary **"I have an event code — family access"** button of equal weight. Footer
note at 12px `#6B7280`: sessions end after 30 minutes idle; every sign-in is audited.

**Error states.** Wrong credentials: a red-50 / red-200 callout above the fields naming attempts
remaining, plus the password field bordered `#EF4444` with a `0 0 0 3px` red-100 ring. After 5
failures: a centred lockout panel, a 56px yellow ring with "15", "Too many attempts", and two
routes out (reset password / back to sign in) — never a dead end.

### 2. Event-code access — `/family` (new, unauthenticated)

390×844. 8 mono character boxes (56px tall, 7px gap), the focused box bordered dark blue with the
light-blue focus ring. On a recognised code, a green dot + the event name appears under the field
before submission — confirmation before commitment. Primary 50px "View the event". A light-blue
info panel states the privacy contract in plain words. Escape hatch at the bottom: "I'm a staff
member — sign in instead".

Edge conditions to implement: code not found (inline, field stays filled, no hint which half is
wrong), event paused ("Giving is paused right now" + last known total), event closed (read-only
final summary, export available 90 days), 5 wrong codes (10-minute device cooldown, audited).

### 3. Session expired

Blurred app behind a `rgba(8,40,59,.55)` scrim; 460px modal, 16px radius. Copy leads with
reassurance, not blame: "You were inactive for 30 minutes… Nothing was lost — any donation you had
queued is still stored on this device," and a row showing the queued count. One action: sign in
again.

### 4. Operator event selection — `/organizer`

1024×768 tablet. Cards 20px padding, 4px orange left rail, event name 17px 600, a status chip, mono
total 18px right-aligned, and a status-dependent CTA. **Live** = full opacity + primary "Open desk
→". **Paused** = 70% opacity, outline "Paused" button, tapping explains an Admin must resume.
**Closed** = 60% opacity, "View only". Below: a dashed panel explaining that only an Admin can
assign events, with a refresh action — the empty/incomplete state answers the question the operator
will actually ask.

### 5. Donation entry — `/organizer/entry`

Header 60px `#08283B`: back to events, event name + `ODOI-2481 · Desk 2` in mono 11px, the **live
total in orange mono 20px**, and a connection pill. Form card: white, 1px `#E5E7EB`, 8px radius,
shadow-sm, 22px padding.

Field order and sizing is deliberate — it is the noisy-desk optimisation:

| Field | Required | Control |
|---|---|---|
| Donor name | ✓ | 48px text input, 16px |
| Amount (GH₵) | ✓ | **64px** input, mono **30px** — the largest thing on screen |
| Donation type | ✓ | 3 segments, 46px: Cash / Mobile Money / In-Kind |
| Donated on behalf of | | 44px text |
| Donor phone | | 44px text |
| Notes | | 60px textarea |

Actions: "Save donation" 52px primary (flex 1) + "Clear" outline. Right sidebar 336px: two mini
stat tiles (entries / GH₵ total) then the operator's own recent entries, newest first, name +
type · time + mono amount.

**Confirm dialog.** 480px, 16px radius. A subtitle instructs the behaviour: "Read it back to the
donor before you confirm." Five rows on a `#F9FAFB` band, amount in mono 20px 700 dark blue.
Buttons: "Go back and edit" (outline, flex 1) vs "Confirm and save" (primary, flex 1.3).

**Success + receipt.** Green-50 callout with receipt number and the line "The family's live view
already shows it." Three next actions (print / PDF / next donation) and a rendered 400px receipt
card: wordmark, mono receipt no., event name in Poppins 18px, five detail rows, a rule, then
"Amount received" in mono 24px 700 dark blue, and a dashed-top footer thanking the donor by family
name. Receipt numbers are generated on-device and sequential within the event, so printing works
with no connection.

### 6. Offline entry — same route, offline state

Header total dims to 55% white and relabels **"Last known total"** — never show a stale number as
if it were live. A pending pill (yellow-300) replaces the online pill. A yellow-50 banner spans the
width: "You're offline — keep recording. Donations are saved to this device and will sync the moment
the connection returns," with a "View queue" link. The save button becomes "Save to this device"
with a 12px "will sync later" qualifier. Receipt numbers gain a device prefix (`GVO-D2-0144`) so two
offline desks can never collide. The sidebar switches to yellow-tinted "Waiting to sync" cards.

### 7. Pending queue — right drawer, 468px

Header states the count and the summed amount. Each record: a 24px dashed yellow ring, name, mono
amount, `type · receipt · queued N min ago`, and Edit / Discard. A grey explainer panel spells out
the retry contract: oldest-first on reconnect, up to 3 attempts with growing delay, and a record
that still fails **stays here and notifies an Admin — it is never dropped**. Footer: "Sync is
unavailable while offline" + a disabled "Sync now".

### 8. Reconnect & sync

Light-blue banner, 20px spinner (`givioSpin` 900ms linear), "Back online — syncing 3 donations",
sub-line "Keep the app open. You can carry on recording while this finishes", and `2 / 3` in mono. A
3px progress bar at 66%. Below, one row per record with three possible outcomes — **Synced**
(green), **Retrying** (light blue, "Attempt 2 of 3 — retrying in 4s"), **Conflict** (yellow, "Edited
on the server while you were offline — needs an Admin decision"). Completion is a green summary bar
that also routes to the conflict.

### 9. Operator errors

**Save failure**: "We couldn't reach the server" — the copy leads with what survived ("Your donation
is safe — we kept it on this device"), shows the record and its queue position, then offers View
queue / Next donation. **Duplicate suspicion**: two columns, "Already saved" vs "About to save",
identical donor / amount / type two minutes apart, with the receipt numbers. Actions are worded as
facts about the world, not about the database: "Discard this one" vs **"Yes, they gave twice"**.

### 10. Operator phone entry — 390×844

Amount at the top (mono 40px 700 with a pulsing 2px orange caret), donor name, 3 compact type
segments, then a **12-key numeric pad in the bottom third** (52px keys) and a 54px save button. The
live event total stays pinned in the header so a roaming collector can answer "how much so far?"
without leaving the form. Numeric input never switches keyboard modes.

### 11. Admin shell — `/dashboard`

240px `#08283B` sidebar: wordmark, 7 nav items (Overview, Events, Donations, Users, Reports, Audit
trail, Deleted) with mono count badges, active state = `rgba(255,255,255,.14)` + an **inset 2px
orange left bar**, and a user block with sign out. Top bar 64px white: page title 17px 700, search
240px, a yellow "1 conflict" pill, avatar.

### 12. Admin overview

Four stat cards (Raised today / Donors today / Live events / Awaiting sync) — mono 25px 700 values,
each with a qualifying delta line. Then a 1.5fr "Live events" list and a 1fr "Live feed" (pulsing
green dot, mono timestamps in a 58px gutter). A yellow attention bar sits at the bottom for the
unresolved conflict, stating the consequence: "Totals exclude it until you decide."

### 13. Events, create-event, event detail

Table columns: Event / Family code (mono) / Status / Operators / Total raised (mono, right) /
Actions. Statuses: Live, Paused, Draft ("— not issued" code), Closed ("Released" code).

**Create event** is a 720px two-panel modal: form on the left (name, occasion Funeral|Wedding, date,
venue, operator chips), and a dark-blue right panel previewing the family code with the sentence
that governs it — share over WhatsApp, read-only, no phone numbers.

**Event detail**: dark-blue hero (name + status chip + mono orange total + Pause / Close), then a
code card (52px mono code box + Copy, "7 family members active now", and a red "Regenerate code"
that warns it signs all of them out) beside an operator roster with per-desk entry counts and
Offline / Recording state chips. A red-bordered danger zone spells out exactly what closing does:
locks 142 donations, invalidates the code, cannot be reopened.

### 14. Users, create user

Columns: Name (avatar + name) / Email / Role chip / Status chip / Last active / Edit + Deactivate.
Statuses: Active, Invited ("Never signed in"), Deactivated. The page states the security model in
one line: **roles are written server-side through an Appwrite function, so a role can never be
changed from the browser**, and deactivation force-expires sessions on every device.

**Create user**: name, email, and role as two radio cards each carrying its consequence ("Records
donations at the desk. Sees only their assigned events." / "Full oversight…"). A light-blue note:
family members don't need accounts.

### 15. Donation oversight + edit

Full record, 8 columns including **donor phone** (Admin-only) and recording operator. Filters:
event, type, operator, date. **Edit** is a 560px modal where the amount field is focused and mono
20px, each changed field shows "was GH₵ 1,200.00" beside it, and a **required** reason textarea
carries the line "This reason is stored in the audit trail with your name. It cannot be edited
later." Primary action is labelled "Save correction", not "Save".

### 16. Sync conflict resolution

A yellow explainer states the whole situation in plain sequence — the tablet saved at 11:05 offline,
an Admin corrected the server copy at 11:22, both are kept, nothing is overwritten until a human
chooses, and the record is excluded from totals meanwhile. Two cards side by side: **Version A —
saved on the tablet** (1px border, yellow badge, amount in yellow-800) and **Version B — on the
server** (2px dark-blue border, shadow-md, amount in dark blue). Six comparable rows each, including
which clock the timestamp came from. Then a third path below: **Keep both** — writes the offline
version as `GVO-0144-B` so the desk's record survives.

### 17. Deleted & recovery

Soft delete only. Columns: Receipt / Donor (struck through) / Amount / Deleted by / **Reason** /
Recover. The page states the contract: hidden from operators and families, excluded from all totals
and exports, recoverable for 30 days, then archived — not erased. Days remaining are shown.

### 18. Audit trail

Append-only, stated as such in the header ("cannot be edited or deleted"). Each row: mono timestamp
in a 128px gutter, a 78px category chip (Create / Edit / Delete / Access / Assign / **Security**,
red), the event sentence, a detail sub-line, and the actor right-aligned. Security rows include IPs
and the System actor.

### 19. Reports & export

Four stat cards (Total raised / Donors / Average gift / Largest gift, each with a median or
attribution sub-line). A 132px donut via `conic-gradient` — dark blue 58% Cash, orange 31% Mobile
Money, light blue 11% In-Kind — with a legend carrying value and percentage. Beside it, a
9-bar hour histogram, the peak bar in orange. The export CTA describes the artefact rather than the
action: one sheet, every column, a totals row, the event summary at the top, ready in ~2 seconds.

### 20. Family live view — `/family/:code`

Dark-blue header: "Family view" eyebrow, a pulsing "Live" indicator, event name in Poppins 21px,
then **"Received so far" and the total in orange mono 40px 700**, with "142 well-wishers · updated 8
seconds ago". A white breakdown strip: three 6px bars (dark blue / orange / light blue) with mono
values. Then "Who has given" with an "Export list" action, and the donor list — newest entry
bordered orange-200 with a "New" chip.

**Privacy is enforced server-side, not by hiding columns client-side.** The family sees donor names,
amounts, type, and "on behalf of". The family never sees donor phone numbers, which operator
recorded a gift, internal notes, or any mutation control. The Realtime subscription is scoped to the
one event.

**Export**: a bottom sheet listing every column with an explicit Included / **Removed** marker —
phone and internal columns marked Removed in red before the file is built. Row count and file size
shown. "Download .xlsx" + "Not now".

**Empty state**: "Nothing yet — that's normal." Total in 35% white rather than a stark zero, plus
"The desks open at 9:30 am" and a note that three desks are connected. It reassures instead of
looking broken.

**Loading**: skeletons mirroring the real layout exactly (`givioShimmer` 1.4s linear, 420px
background-size) so nothing shifts when data lands. The total animates up from zero rather than
snapping. Past 5 seconds, offer a retry. On 3G the donor list pages in 20 at a time.

---

## Interactions & behaviour

- **Transitions**: 120–200ms, `cubic-bezier(0.16, 1, 0.30, 1)`. Nothing bounces.
- **Hover**: buttons darken one step (`#08283B` → `#062133`); rows tint `--color-lightblue-50`; no
  lift, no shadow change.
- **Focus**: `0 0 0 3px #B4DAFB` on `:focus-visible` only.
- **Live pulse**: 2s ease-in-out opacity+scale on the connection dot; 1.8s in the family header.
- **Spinner**: 900ms linear rotation. **Skeleton**: 1.4s linear left-to-right shimmer.
- **Realtime**: an incoming donation prepends with the orange "New" chip; the total re-renders. No
  toast — the list movement is the notification.
- **Offline detection**: `navigator.onLine` is necessary but not sufficient — captive portals report
  online. Confirm with a lightweight ping before clearing the banner.
- **Session**: 30-minute idle expiry, checked on every route change (`canActivateChild` is already
  wired for this in `app.routes.ts`). Queued records must survive expiry.

## Form validation

| Field | Rule | Message |
|---|---|---|
| Donor name | required, 2–120 chars | "Enter the donor's name." |
| Amount | required unless type is In-Kind; > 0; ≤ 1,000,000; 2 dp | "Enter an amount greater than zero." |
| Donation type | required, one of `cash` / `mobile_money` / `in_kind` | — |
| Donor phone | optional; Ghanaian mobile (`0[2345][0-9]{8}`) | "That doesn't look like a Ghanaian mobile number." |
| On behalf of | optional, ≤ 120 chars | — |
| Notes | optional, ≤ 500 chars | — |
| Edit reason | **required** on any Admin edit, ≥ 10 chars | "Say why — this goes in the audit trail." |

Validate on blur, not per keystroke. Never block a save on an optional field. Duplicate detection is
a warning, never a hard block — people do give twice.

## State

```
connection   'online' | 'offline' | 'syncing'
queue        DonationDraft[]                  // IndexedDB-backed, survives reload
syncResults  Map<localId, 'synced'|'retrying'|'conflict'|'failed'>
event        DonationEvent | null             // status gates every operator action
donations    Donation[]                       // Realtime-subscribed, scoped to one event
conflicts    ConflictPair[]                   // Admin only; excluded from totals
session      idle timer → expiry modal
```

Invariants worth asserting in code: a donation is never deleted, only flagged; soft-deleted and
in-conflict records are excluded from every total and export; a family payload never contains a
phone number; receipt numbers are unique per event across all desks including offline ones.

## Design values used

All of them come from `src/styles.scss` — see the styling contract above for the full list. Where
the design leans on a value, the mapping is:

| Design intent | Repo token |
|---|---|
| Primary action, header fills, sidebar | `--primary-deep` → `--primary-dark` gradient (existing `.btn-primary`) |
| The live total, "New" marks, active segment | `--primary-mid` `#00c8e0` |
| In-kind slice, secondary accent | `--accent-sky` `#56c8e8` |
| App canvas / card surface | `--bg-light` / `--bg-white`, `.glass` for elevated surfaces |
| Table headers, mini tiles, sheet bands | `--bg-mist` |
| Body / secondary / tertiary text | `--primary-dark` / `--data-4` / `--data-3` |
| Borders | `rgba(26,107,122,.12)` default, `.15` on inputs, `.09` on inner dividers |
| Synced, live, success | `--func-success` |
| Offline, pending, conflict | `--func-warning` at 7–12%, text `#92400e` |
| Error, destructive | `--func-error` / `--color-danger` |
| Focus ring | `0 0 0 3px rgba(0,200,224,.15)` (matches the existing `.select-field:focus`) |

Type: **Syne** italic for display (event names, page titles, the family total's context), **DM Sans**
for everything else, `monospace` for numerals. Sizes are set in `rem` to match the repo's existing
scale (`2.4 / 1.9 / 1.5 / 1.4 / 1.05 / 0.95 / 0.9 / 0.88 / 0.85 / 0.82 / 0.78 / 0.75 / 0.72 / 0.68`).

Spacing is the `--space-*` scale only. Radii: `--radius-md` on inputs and cards, `--radius-lg` on
drawers and page surfaces, `--radius-full` on pills and segments. Motion: `.18s`–`.22s` with
`var(--ease)`, matching the existing `.keyword` / `.filter-tag` transitions.

## Assets

- **Wordmark**: three orange bars + "Givio" in Poppins Bold. The repo already ships
  `assets/images/Givio-logo.png`; the prototype draws the bars in CSS so it scales. Prefer an SVG.
- **Icons**: `mat-icon` throughout, which is what `sidebar.html` already uses. The components
  reference `arrow_back`, `check`, `check_circle`, `close`, `cloud_off`, `cloud_done`, `sync`,
  `lock`, `download`, `volunteer_activism`. The repo also has PrimeIcons (`pi pi-arrow-up` in
  `stat-card.html`) — keep that only where it already exists rather than mixing sets in new markup.
- **Photography**: none used.

## Files

- `Givio Donations.dc.html` — the clickable 30-screen prototype (open in a browser).
- `angular/` — the Angular source described above.
