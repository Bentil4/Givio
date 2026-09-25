---
name: Givio DMS — Organizer Multi-Tenancy & Role Hierarchy
status: final
sources:
  - _bmad-output/planning-artifacts/prds/prd-givio-2026-09-23/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-givio-2026-07-25/ARCHITECTURE-SPINE.md
  - _bmad-output/specs/spec-organizer-multi-tenancy/SPEC.md
  - .claude/skills/plan/*.md (existing v1 screen specs — IA/pattern precedent)
updated: 2026-09-23
---

# Givio — Multi-Tenancy Experience Spine

> Fast path (batch-drafted, `[ASSUMPTION]` tags below). Extends, does not replace, the existing brownfield app — every pattern here either reuses or deliberately deltas from what already ships. Paired with `DESIGN.md` in this folder.

## Foundation

Responsive web PWA, Angular, existing shared component library (`shared/components/`) — no new UI system introduced. `DESIGN.md` is the visual identity reference; this spine is the experience.

**Tenancy shape**: a user belongs to at most one Tenant (company) at a time per account — never multiple. A person working two companies holds two entirely separate accounts/sessions (PRD FR-4/FR-5), so there is no "switch workspace" pattern anywhere in this product, unlike a typical multi-tenant SaaS. The only "switching" a user ever does is between *Events* within their one Tenant (the Tenant-switcher, FR-3) — Tenant identity itself never switches mid-session.

**Route/role naming collision — resolved by NOT renaming (2026-09-25 elicitation).** The existing codebase's `operator` role and `/organizer` route segment together house what the PRD calls the **Operator** tier (donation-recording staff) — an unrelated naming coincidence from before this PRD existed. The PRD's own **Organizer**/**Super Organizer** tier (company leadership) is a *different, new* role with no code today. Building the new tier at `/organizer` would collide with the existing, differently-scoped routes there. A rename (`/organizer` → `/operator`, freeing `/organizer` for the new tier) was the original plan but was rejected as unnecessary regression risk on stable, shipped code for a naming-purity gain. Instead: the existing `/organizer` routes (Operator tier) are **left completely untouched**, and the new Organizer/Super Organizer tier is built at a new route, `/company`, from the start.

## Information Architecture

| Surface | Reached from | Tier | Purpose |
|---|---|---|---|
| Sign up | `/auth/signup` (new, public) | Unauthenticated | Organizer self-signup intake (FR-6b) |
| Pending | `/company` (new, authenticated, gated on `Tenant.status=pending`) | Super Organizer | "Your application is under review" — no other Organizer surface reachable (FR-9) |
| Organizer dashboard | `/company` | Super Organizer / Organizer | Consolidated cross-event total (FR-21), event list |
| Team | `/company/team` (new) | Super Organizer / Organizer | Add/manage co-Organizers (Super Organizer only) and Operators; revoke |
| Tenant audit log | `/company/audit` (new) | Super Organizer | Own-tenant-only activity trail (FR-15) |
| Reports | `/company/reports` (new) | Super Organizer / Organizer | Periodic settlement/export (FR-22) |
| Contact Admin | `/company/support` (new, authenticated) | Super Organizer / Organizer | Logged support form (FR-20) |
| Dispute a suspension | `/company/dispute` (new, public/unauthenticated) | A suspended tenant's Organizer(s) | The one form reachable without logging in — identifies the submitter by email + tenant name rather than a session, since suspension blocks login entirely (FR-19, FR-20) |
| Operator dashboard | `/organizer` (existing, unchanged) | Operator | Unchanged from today, plus the Tenant-switcher (FR-3) |
| Approval queue | `/dashboard/approvals` (new, inside existing Admin tree) | Admin, Super Admin | Review pending Tenant applications (FR-6a review path), duplicate-event flags (FR-14) |
| Platform audit log | `/dashboard/audit` (existing `admin-audit` screen, gains rows) | Admin, Super Admin | Unchanged surface, new row source: every Admin/Super Admin read or write of a tenant's Event data now appears here too (FR-19) — Admin's own actions are self-visible, not just Organizers'/Operators' |
| Admin accounts | `/dashboard/admins` (new, inside the existing Admin tree — see Architecture Spine's `feature/admin/`; no separate route tree, resolved 2026-09-25 via Occam's Razor elicitation) | Super Admin only | Create/promote/demote/suspend an Admin (FR-26) |
| Family view | `/family/:code` (existing, unchanged path) | Family | Gains the personal-device prompt (FR-16) and full-visibility guarantee (FR-18) — no new surface |

Sidebar collapses to icon-only on desktop (existing `.collapsed` pattern) and becomes an off-canvas drawer below 720px (existing `MOBILE_NAV_QUERY` breakpoint, existing scrim/Escape-dismiss pattern) — every new tier reuses this shell, none invents a new one. Super Admin gets its own sidebar nav-item set (Admins, plus everything an ordinary Admin sees — FR-25), not a variant of the Admin sidebar.

→ Composition reference: `mockups/approval-queue.html` (collapsed + expanded row states), `mockups/tenant-switcher.html` (blocked vs. picked states) — see **Mock coverage** at the end of this spine for why these two were rendered. This spine wins on any conflict with either mock.

## Voice and Tone

Brand voice lives in `DESIGN.md.Brand & Style`. Two audiences need distinct handling here, both stated in the PRD as load-bearing:

| Do | Don't |
|---|---|
| Family-facing: "You can see every donation given so far." | Family-facing: "In accordance with our privacy policy, some fields are restricted." |
| Family-facing: "Not your phone? We'll sign you out automatically when you leave this page." | Family-facing: "For security purposes, please verify device ownership." |
| Organizer-facing (pending state): "We're reviewing your application — this usually takes a few days." | Organizer-facing: "Your KYC verification is pending." |
| Organizer-facing (suspension safety): "Your team's access is paused. Families following this event can still see it." | Silence, or a raw "Account suspended" with no reassurance about what still works |
| Admin-facing: plain operational language — "3 applications awaiting review." | Admin-facing: anything dramatized — this is a back-office queue, not a dashboard to delight anyone |

The family-facing rule is the load-bearing one: every string a Family Member reads is written for someone grieving, not for a generic end-user — dignity, never compliance-speak (PRD §9).

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`. Three rows below (Add co-Organizer/Operator, Revoke, Family access code) have no corresponding `DESIGN.md.Components` entry deliberately — each composes entirely from existing primitives (`Button`, form fields, the existing v1 regenerate-code action) rather than introducing a new visual component.

| Component | Use | Behavioral rules |
|---|---|---|
| Tier badge | Anywhere a person's role is shown (team list, audit log, approval queue) | Always paired with a name, never shown alone — a badge with no name attached is meaningless. Tooltip on hover/focus spells out the tier ("Super Organizer — can add co-Organizers and Operators"). |
| Tenant-status pill | Approval queue, team list (shows the Tenant's own status), admin account list (Admin active/suspended) | Read-only display; the state change itself always happens through an explicit Approve/Reject/Suspend action, never by clicking the pill. |
| Dignity banner | Family view (device prompt, suspension-safety message) | Dismissible only when dismissing doesn't lose safety-relevant info (the device prompt is NOT dismissible without an answer — it blocks first paint of the total); the suspension-safety banner IS dismissible once read. |
| Approval-queue row (`mockups/approval-queue.html`) | `/dashboard/approvals` | Collapsed by default (name, tier, submitted date, tenant-status pill, Approve/Reject). Expands inline on click to show intake fields + document link + (once phone verification is logged) verifiedBy/verifiedAt — never a separate detail page, since this is a single-sitting review task. |
| Tenant-switcher (`mockups/tenant-switcher.html`) | `/organizer` header, whenever the signed-in Operator has 2+ active Events | Always visible, never a hidden menu — switching requires an explicit pick, never inferred from last-viewed (PRD FR-3). The currently-active Event's name renders in the page's own `.page-head`, not just the switcher, so it's visible even after the switcher itself scrolls out of view. |
| Step wizard | Organizer self-signup | Back is always available; a rejected identity check (banned/rejected cross-reference match) does NOT reveal *why* to the applicant — the step simply doesn't advance, with a generic "we couldn't process this application" message, since revealing a fraud-detection hit would let it be gamed. |
| Add co-Organizer / Add Operator | `/company/team` | Not a terminal failure — a flagged addition (FR-12 for co-Organizer, FR-23 for Operator) shows as **pending Admin review**, not "rejected": the row appears in the team list with a pending tenant-status pill and no login access yet, same non-disclosure rule as the signup wizard (the adder never sees *why* it's pending). Admin is notified in both cases (FR-12 always, on every co-Organizer addition; FR-23 only on a match). Once Admin resolves it — clears a false positive or confirms a real one — the row updates in place: pending → active (identical to a normal add) or pending → removed with the same generic non-disclosing message, never a live push, just visible on the adder's next view of the team list. |
| Revoke (co-Organizer, Operator, or — Super Admin only — an Admin) | `/company/team`, `/dashboard/admins` | The row disappears from the *active* list but never from history: every list that shows "who recorded/approved/acted" (donation rows, the audit log, past approval decisions) keeps the revoked person's name exactly as before (FR-13). The UI never offers a "delete" action anywhere a person has touched money or taken a platform action — only Revoke/Suspend. |
| Family access code | `/company` (Tenant/Event detail) | Reuses the existing v1 "regenerate code" action (Story 2.4) unchanged in mechanism, now framed as leak-recovery too (FR-16's third consequence): the same button copy gains a second line — "Also use this if the code was shared with the wrong person." Regenerating immediately invalidates the old code, matching existing behavior. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Pending (Tenant awaiting approval) | Organizer dashboard | Full-page state, not a banner: "Your application is under review" + submitted-date + a link to check status again later. No sidebar nav items are rendered at all (matches FR-9's "no access to create Events, add Operators, or view donation data" — the UI doesn't just hide these, it doesn't render the shell around them either). |
| Rejected | Post-signup | Same shell as Pending, message swapped: generic "This application wasn't approved" — no reason given (mirrors the wizard's own non-disclosure rule above), with the Contact Admin form still reachable. |
| Empty approval queue | `/dashboard/approvals` | Reuses the existing `organizer-dashboard`-style empty state (illustration + short message) — "No applications waiting." |
| Empty team | `/company/team`, first login | "You haven't added anyone yet." + primary "Add co-Organizer" / "Add Operator" actions, no illustration needed (this is an action-oriented empty state, not a discovery one). |
| Non-Super-Organizer attempts to add an Organizer | `/company/team` | The "Add Organizer" action itself is never rendered for a plain Organizer (FR-11) — not a disabled button, not present in the DOM at all, so there's nothing to explain via a tooltip or error state. Only "Add Operator" ever appears for a non-Super-Organizer. |
| Family, personal-device = no | `/family/:code` | Dignity banner (non-dismissible until answered) renders before the donation total does — the prompt is the first thing painted, not an interrupt after the data loads. Focus moves programmatically to the prompt's first control on render (it behaves as a focus-trapping modal, not a passive banner) — a screen-reader or keyboard user is never left to discover it by scanning the page. |
| Family, suspended-tenant | `/family/:code` | Total/list render exactly as before; dignity banner (dismissible) explains nothing changed for them. |
| Admin account suspended (mid-session) | Any Admin surface | Existing session-expiry pattern reused: next guarded navigation redirects to `/login`, same as the existing 8-hour idle-timeout behavior — no new "you've been logged out" mechanism invented. |
| Duplicate-event flag, none pending | `/dashboard/approvals` (duplicate tab) | Same empty-queue treatment as the approval queue. |
| Tenant audit log, empty | `/company/audit`, first login | "No activity yet." — reuses the empty-state pattern, not a new one. |
| Reports, no period elapsed yet | `/company/reports` | "Your first settlement export will be available after your first full period." — action-oriented, no illustration, matches the Empty team pattern's reasoning. |
| Contact Admin, submitted | `/company/support` | Inline confirmation replaces the form: "Sent — Admin will follow up." No redirect, so a second question can be submitted from the same screen. |
| Contact Admin, submission fails | `/company/support` | Form retains entered text; inline error above the submit button, same pattern as donation-entry's existing save-failure handling. |
| Dispute form, submitted | `/company/dispute` | Same inline-confirmation pattern as Contact Admin — "Sent — Admin will follow up." No account or session required, so nothing to redirect to afterward. |
| Dispute form, submission fails | `/company/dispute` | Same retain-and-inline-error pattern as Contact Admin. |
| Consolidated total, loading | `/company` dashboard | Skeleton placeholder over the total/breakdown area on first load, matching the existing admin-dashboard's own loading treatment — not a blank flash. |
| Consolidated total, aggregation error | `/company` dashboard | Per-Event figures that failed to aggregate show a small inline "couldn't load" note on just that Event's row, rather than failing the whole total silently or blocking the page — a partial total with a visible gap is safer than a wrong-looking complete one. |

## Interaction Primitives

- **Tenant-switcher is a required interaction, not a convenience** — an Operator on 2+ Events cannot record a donation until they've made an explicit pick (no "last used" default). This is the one interaction primitive genuinely new to this capability; every other new screen uses existing form/table/card interaction patterns unchanged. "Record Donation" is never silently disabled while unpicked: it renders as an enabled control that, on activation, moves focus to the switcher and announces why ("Pick an Event first") — the same explain-don't-silently-block pattern the wizard and approval queue already use elsewhere in this spine, not a bare disabled state a keyboard or screen-reader user would have no way to diagnose.
- **Approve/Reject are destructive-adjacent but not destructive** — no confirmation dialog on Approve (low-risk, reversible via suspend later); Reject gets a single confirmation step (irreversible-feeling to the applicant, matches the existing pattern for donation soft-delete confirmation).
- **Mouse and touch parity** — no hover-only affordance introduced; every new row action (Approve/Reject/Suspend/Revoke) is a visible button, not a hover-reveal, consistent with the existing touch-target-44px discipline (Story 5.1).

## Accessibility Floor

Behavioral; visual contrast lives in `DESIGN.md` (existing tokens are already AA-verified, including the corrected values from the PR #44 refactor).

- WCAG 2.1 AA + AXE clean on every new screen (carries forward existing `NFR-USE-003`, restated in the PRD's Cross-Cutting NFRs).
- The non-dismissible family device-prompt is still keyboard-operable and announces via `aria-live` when it blocks first paint — a screen-reader user isn't left wondering why the total hasn't spoken yet.
- Tier badges carry the tier name in accessible text, never icon-only (icon + label always, per `DESIGN.md.Components`).
- Tenant-switcher is a real `<select>`-pattern (native semantics), not a styled `<div>` — keyboard and screen-reader users get the platform's own select behavior for free, matching the existing `Select` shared component's approach.
- Approval-queue row expansion uses `aria-expanded` on the row trigger and moves focus into the expanded content, matching the existing pattern the app already uses for its accordion-like disclosures (Story 5.1's existing sidebar drawer, for behavioral precedent). On collapse, focus returns to the row trigger itself — never left inside now-hidden content — so a keyboard user's position on the page is never lost after Approve/Reject. Both actions are reachable by keyboard alone, no pointer required.
- Tenant-status pill's four states (pending/approved/rejected/suspended) carry a text label in every instance, the same "never color-alone" rule `DESIGN.md.Do's and Don'ts` states for tier badges — color plus background tint is reinforcement, never the sole signal, so a colorblind user reads the same state a sighted user does.
- The dignity banner's non-dismissible variant (personal-device prompt) renders with no dismiss control at all, rather than a dismiss control that silently does nothing on activation — an affordance that doesn't respond to its own interaction is a worse failure than not offering it.

## Key Flows

### Flow 1 — Kwame signs up and lands on an empty, unmistakably-his dashboard

1. Kwame opens `/auth/signup` (new "Sign Up" link on the existing login screen — that CTA already exists in the v1 login spec, previously unwired).
2. Step wizard: company info (name/location/size/type/estimated users) → document upload → a confirmation step explaining the phone call is next.
3. He's redirected to `/company`, which renders the full-page Pending state — no sidebar, no data, just the review-status message.
4. Two days later, approved. Next login, `/company` renders his real (empty) dashboard: consolidated total showing GH₵0, an empty team, a prominent "Create your first Event" action.
5. **Climax:** he creates an Event and generates a family access code. At no point — not in a URL, not in an error message, not in any dropdown — does anything hint another company exists on the platform.

Failure: document upload fails mid-wizard → inline retry on that step only, other steps' data retained (no restart from step 1).

### Flow 2 — Ama adds Kwesi, who can't record against the wrong funeral

1. Ama (already a co-Organizer per Flow 1's continuation) opens `/company/team`, clicks "Add Operator," enters Kwesi's name/email.
2. Kwesi receives credentials scoped to Ama's tenant only, logs in at `/organizer` (the existing, unchanged Operator-tier route).
3. Ama has assigned him to two Events. The tenant-switcher is visible and unset — he cannot open "Record a Donation" until he picks one.
4. He picks "Asante Funeral." The page-head now reads "Asante Funeral" in addition to the switcher showing the same name.
5. **Climax:** he records a donation. The form's own confirmation screen names the Event again ("Donation recorded for Asante Funeral") — three separate places on screen agree, so a mis-pick would have been caught before this point, not after.

**Edge case (FR-23):** if Ama's "Add Operator" for a third hire happens to match an existing or previously-revoked identity at her own tenant, the add fails with the same generic, non-disclosing message the signup wizard uses — Admin is notified either way.

### Flow 3 — Comfort checks the total from her cousin's phone

1. Comfort enters her family's access code at `/family/:code`.
2. Before the total renders, the dignity banner asks: "Is this your personal phone?" She taps "No."
3. The full, real-time total and donor list render (FR-18: nothing hidden).
4. A call pulls her away; she backgrounds the tab. The moment she navigates away, the session clears.
5. **Climax:** her cousin picks the phone back up later — the access-code entry screen, not Comfort's data, is what's there.

Failure: she mistypes the code → the same generic "code not recognized" message v1 already shows (no change; a wrong code and a leaked/expired code are indistinguishable on purpose, so no new information leaks here either).

### Flow 4 — Admin suspends a compromised Organizer mid-event, family never notices

1. Admin, investigating a fraud report, opens the Organizer's team record (surfaced via the approval-queue's sibling Tenant-detail view — [ASSUMPTION: this reuses the approval-queue row's expand pattern rather than a separate screen, since both are "look at one Tenant's record and act" tasks]).
2. Admin suspends the Tenant. Confirmation step names the consequence plainly: "Organizer and Operators lose access immediately. The family's view keeps working."
3. **Climax:** in a separate tab, a Family Member's `/family/:code` view — open the whole time — shows no interruption. No banner, no flicker; FR-17's guarantee is invisible by design, which is the point.
4. **Resolution (FR-13):** weeks later, someone reviews that event's donation list. Every entry the suspended Organizer's Operators recorded still shows their real names as the recorder — suspension blocked further access, but it didn't touch a single existing record.

**Edge case (FR-20):** if the suspension turns out to be a mistake, the locked-out Organizer isn't stuck — `/company/dispute` (public, no login required) lets them submit a dispute identified by email and tenant name, since suspension blocks the authenticated Contact Admin form along with everything else.

### Flow 5 — Nana (Super Admin) suspends a rogue Admin

1. Nana opens `/dashboard/admins` — a screen inside the existing Admin tree that an ordinary Admin can't reach (an additional `super_admin` guard layered on top of the existing admin guard, not just hidden from nav).
2. The Admin list shows a tier badge, status pill, and a Suspend action per row — no Promote/Demote clutter for the common case, since those live behind a row-level menu.
3. **Climax:** Nana suspends the account. The list re-renders that row's status pill to "suspended" instantly; the suspended Admin's historical audit-log entries (visible elsewhere in the platform-wide log) are untouched — Nana can still see everything that Admin ever did, just nothing they do next.

Failure: the suspend action itself fails (network/server error) → the row stays "active," an inline error appears on the row, and Nana retries — no optimistic UI that could claim a suspension succeeded when it didn't, given the stakes of a rogue Admin staying active a moment longer than shown.

### Flow 6 — Yaw tries to add Kojo, and the platform quietly holds it for Admin

1. Yaw (an approved Super Organizer) opens `/company/team`, clicks "Add co-Organizer," enters Kojo's details.
2. The row appears immediately in Yaw's team list — but with a pending tenant-status pill, not active. No error, no explanation: from Yaw's side this looks identical to any other add still processing.
3. Behind it, the identity check has flagged Kojo against the banned/rejected cross-reference (he was rejected at his own signup attempt) and notified Admin.
4. **Climax:** Admin reviews the flag and confirms it's a real match, not a coincidental one. The row disappears from Yaw's team list on his next view — no notification fires "explaining" why, matching the wizard's own non-disclosure rule.

**Edge case (false positive):** if the flagged name had instead been a coincidental match — a different Kojo — Admin's review clears it instead, and the row silently transitions pending → active on Yaw's next view. Yaw never learns a check happened either way.

**Edge case (FR-24):** the same held-then-reviewed pattern applies identically if Kojo's history were a for-cause revocation at another tenant rather than a signup rejection — the cross-reference list Admin checks against is the same one either way.

## Mock coverage

Fast path skipped creative tools during Discovery, but two key-screen mocks were rendered at Finalize for the surfaces with the least existing precedent: `mockups/approval-queue.html` (collapsed row, expanded disclosure, and the flagged/pending state from Flow 6) and `mockups/tenant-switcher.html` (blocked-but-explained vs. picked states from Flow 2). Every other surface stays spine-only — each reuses an existing, already-shipped screen pattern closely enough (Organizer dashboard ≈ existing admin-dashboard/organizer-dashboard shells, the signup wizard ≈ existing login screen's form patterns, Super Admin's account list ≈ the existing admin-settings user-management table) that a fresh mock would mostly restate what's already built. Flag any of these if a visual reference is wanted before story-writing anyway.
