# Architecture Spine Review — Rubric Pass

**Reviewed:** `ARCHITECTURE-SPINE.md` (Givio DMS, 2026-07-25)
**Against:** `docs/DMS_Product_Requirements_Document.md` §6.1–6.9, §8–9, §10.2, and the 26 screen specs in `.claude/skills/plan/*.md`
**Method:** checklist-driven read of the spine, full read of the PRD's functional-requirement sections, header/full-content spot-reads of all 26 screen specs, targeted greps across the spec corpus for capabilities (audit, receipt, conflict, user management, event code, notifications), and a live version spot-check of jsPDF/Appwrite against package.json.

## Verdict

The spine is well-constructed where it engages — AD-1 through AD-7 are each individually sharp, falsifiable, and traceable to a real divergence risk — but it has one **self-undermining gap in its own centerpiece rule (AD-1)**, one **unreconciled contradiction between AD-3 and its own source screen spec**, and **two structural dimensions the PRD treats as Critical/High priority that are left completely silent** rather than deferred. It should not be considered final until at least the AD-1 mechanism gap is resolved.

---

## Findings

### 1. CRITICAL — AD-1's Label mechanism has no implementation path in a pure-client architecture

AD-1's own justification text states: *"Labels are server/Console-only."* This is factually correct for Appwrite (only the Server SDK / Users API with an API key, or the Console, can call `users.updateLabels()` — the client Account API only ever manages the caller's own account). But the Structural Seed, Stack table, and every layer description in the spine describe a **purely client-side** system: `data/appwrite/client.ts` wraps `Account, Databases, Teams` (all client-callable services), there is no Appwrite Function, no Server SDK usage, and no API-key-bearing backend component anywhere in the document.

Meanwhile FR-USR-001/002 (Critical/High) require the Admin to create accounts and assign/change roles from *inside the DMS app*, and `admin-settings.md`'s "User Management Section" spec literally has an "Add New User" button and a "Change Role" row action — i.e., a client-side UI action that must, per AD-1, end up setting a server/Console-only Label. The spine never says how that button click reaches a privileged surface. This isn't deferred — it's silent, and it's the load-bearing rule the whole permission model depends on.

**Impact:** two teams implementing this independently will diverge exactly where AD-1 claims to prevent divergence — one might bolt on an Appwrite Function, another might (incorrectly) try to set labels from the client and silently fail, another might fall back to `prefs.role` (the very anti-pattern AD-1 exists to kill) because it's the only thing reachable from the browser.

**Fix direction:** add an AD (or extend AD-1) that names the privileged surface — e.g., "an Appwrite Function (`assignUserLabel`), invoked via `functions.createExecution`, is the only caller of `users.updateLabels`" — and add it to the Structural Seed / Stack.

### 2. HIGH — Family-member "no-account" access is a distinct auth mechanism the spine never names, and it conflicts with AD-2's team-membership model

FR-AUTH-004 (High) requires: *"Family Member can log in using the event code without a full account."* FR-EVT-005 requires Admin-generated, regenerable, single-event-scoped 8+ character codes. AD-2's mechanism for family-member access is: *"assigning a family member = adding them with a restricted in-team role."* Appwrite Team membership requires a real user (invited via email or an existing account) — there is no such thing as a code-authenticated, account-less Team member. These two requirements describe genuinely different auth primitives (label/team RBAC vs. a bearer-code/magic-link session), and the spine picks only the first without acknowledging the second exists.

Compounding this, `share-access.md` describes a *third*, separate mechanism — organizer-generated shareable links with tiered permissions (**View Only / Add Donations / Full Access**) and expirations (24h/3d/1wk/unlimited) that explicitly work "without login." A "Full Access" link-holder can add/edit/delete donations per that spec — which is a write capability AD-2's "restricted in-team role (e.g. `viewer`)" cannot express, and which also contradicts the PRD's own role definition (§4.2: Family Member is read-only, full stop). None of `login-screen.md` (email/password + social login + "Sign Up" — inconsistent with a closed, admin-provisioned account model to begin with), the Capability Map, or Deferred acknowledges any of this. It is not decided and not deferred — it is unaddressed.

**Impact:** whoever builds `share-access` and whoever builds the family-member login path will each invent their own passwordless-session primitive, with no shared contract for how a code/link maps to Appwrite permissions.

### 3. HIGH — AD-3 contradicts the sync-status.md screen spec it's supposed to govern

AD-3's stated purpose is explicit: *"Prevents: a second offline conflict-review UI / local conflicts table for a scenario Admin resolves online... Conflicts surface only in the Admin dashboard."* But `sync-status.md` — the very screen the Capability Map assigns to `data/sync/SyncEngine`/`SyncStore` under AD-3 — has its own "Conflict resolution section" with **"Resolution options (Keep Local / Use Server / Manual Merge)"**, presented as a generic, non-admin-gated action available to whoever is looking at sync status (the screen's nav is "Back to Dashboard," not "Back to Admin Dashboard," and the spec carries no role badge the way `admin-*` specs do). This is precisely the second conflict-UI AD-3 says must not exist.

**Impact:** this is exactly the kind of divergence the review is meant to catch — the spine's own rule and its own source material disagree, and nothing in the document flags or resolves it. A dev implementing `sync-status` faithfully to spec will build a conflict-resolution surface AD-3 forbids.

### 4. HIGH — Session/token lifecycle is a completely silent dimension

FR-AUTH-002 (Critical: session token "not in localStorage in plain text," 8h inactivity expiry) and FR-SEC-005 (High: refresh-token rotation on each use, concurrent multi-device sessions allowed, Admin can force-expire all sessions for a user) are concrete, testable, Critical/High-priority requirements directly adjacent to AD-1's auth model. The spine's Consistency Conventions table covers naming/data formats/state-management conventions but never mentions where session/token state is held, how expiry is enforced, or how force-expiry is exposed to Admin. This is not in Deferred either — it's silent.

**Impact:** two implementers will independently choose different token-storage and expiry-check strategies (e.g., one relying on Appwrite's default cookie session, another hand-rolling a timer in `AuthStore`), with no shared contract for the Admin-facing force-expire action.

### 5. MEDIUM — Notifications (toast + email) are unaddressed, despite being named in the review's own failure-mode examples

FR-OFF-004 requires a toast ("Sync complete — X records uploaded"); FR-USR-001 requires an auto-generated password sent via email notification; `admin-settings.md` devotes an entire "Notification Settings Section" to in-app/email notification triggers and channels. None of this appears anywhere in the spine — not as an AD, not in the Capability Map, not in Deferred. Given the spine explicitly names client-side libraries for PDF (jsPDF) and Excel (SheetJS) generation, the omission of any home for the notification/toast mechanism (and the email-sending mechanism, which — like AD-1's label problem — likely needs a privileged surface, since Appwrite SMTP sends are typically triggered via the Users/Account API's password-recovery flows or a Function, not arbitrary client calls) reads as an oversight rather than a considered scope cut.

### 6. LOW — Two bookkeeping gaps in the "26 screens" claim

- `reports.md` — cited by name in the Capability Map's "Reports/exports" row — is a **zero-byte file**. The map cites a spec that currently defines nothing; whatever "reports" was meant to contribute is undiscoverable from the source material the spine claims to be built against.
- `dashboard-screen.md` ("Event Dashboard," organizer-facing overview + event list) is a distinct file from `organizer-dashboard.md` and is not named anywhere in the Capability Map (the map's "organizer-*" wildcard doesn't lexically match this filename, unlike `organizer-dashboard.md`/`organizer-donations.md`/`organizer.events.md`/`organizer.report.md`). It heavily overlaps `organizer-dashboard.md`'s content, so it may be a superseded draft — but the spine doesn't say so, and its scope line claims coverage of "all 26 planned screens."

---

## What the spine gets right (for balance)

- **AD-1, AD-2 (the team-membership half), AD-4, AD-5, AD-6, AD-7** are each concretely enforceable, each name the exact current-codebase anti-pattern they replace (self-escalation via `account.prefs.role`, zero route guards, eager 26-component route table, float money), and each would actually prevent the stated divergence for a normal (non-account-less) user.
- **Deferred** section is well-chosen for what it does defer: Realtime-vs-polling and receipt-template/PDF-layout are genuinely non-load-bearing at this altitude (Presentation only ever talks to the store either way); deployment/environments and the audit-log write mechanism are correctly flagged as open rather than silently skipped — these satisfy the checklist's "deployment," "receipt specifics," and "audit log write mechanism" example dimensions. It's specifically **notifications** and **session lifecycle** (also named in the checklist's example list) that fall through.
- Tech-currency spot check: jsPDF 4.2.1 confirmed as the actual current npm version; Angular ^21.0.0, Appwrite ^23.0.0, Dexie ^4.3.0, Angular Material ^21.2.3 all confirmed present in `package.json` exactly as the spine describes ("already pinned") — the Stack table is not fabricating brownfield facts. The SheetJS "don't npm install, vendor from cdn.sheetjs.com" guidance is accurate to SheetJS's actual current distribution practice.
- The paradigm/layering rule (Presentation/Domain never import `appwrite`/`dexie`) is simple, checkable by lint/import-boundary tooling, and would genuinely prevent the layering violations it targets.

## Recommendation

Before marking this spine `final`, resolve #1 (AD-1's mechanism) and #3 (AD-3 vs. sync-status.md) — both are direct self-contradictions/gaps in the spine's own load-bearing rules, not just scope questions. #2 and #4 should get at minimum an explicit Deferred entry (they're plausibly legitimate to defer to the epic that builds `AuthStore`, but silence is not the same as a deliberate deferral) so a future reader can tell "not decided yet, on purpose" from "not noticed."
