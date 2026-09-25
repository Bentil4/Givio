# Reviewer Gate — Rubric Walker

**Target:** ARCHITECTURE-SPINE.md (Givio, updated 2026-09-23 — multi-tenant Organizer/role hierarchy amendment on top of the final v1 spine).
**Method:** Checklist walk against `.claude/skills/bmad-architecture/references/reviewer-gate.md`'s "Good-spine checklist," cross-checked against the companion PRD (`prd-givio-2026-09-23/prd.md`), the live repo (`package.json`, `src/app/data/services/auth.service.ts`, `src/app/data/models/role.ts`), `sprint-status.yaml`, and the sibling reviewer artifacts already in this folder (`review-tech-verify.md`, `review-adversarial.md`, `reconcile-prd.md`).

## Verdict

**CONDITIONAL PASS.** The spine is well-reasoned and its amendments are individually sound, but two Critical gaps mean two builders *can* diverge on exactly the things this document exists to prevent — a permission-revocation mechanism that isn't actually wired to Membership/Tenant status, and a Stack table that no longer matches the repo it's supposed to describe (missing a whole UI library the app already ships).

**Findings: 2 Critical, 3 High, 3 Medium, 2 Low.**

---

## Critical

### C1 — Membership/Tenant revocation doesn't mechanically retract already-granted Event permissions (AD-2, AD-9)

AD-2's Rule ties Appwrite document-permission regeneration to one trigger only: *"recomputed every time `assignedUserIds` changes."* Revoking a Membership (`status: active→revoked`) or suspending/banning a Tenant does **not** itself change any Event's `assignedUserIds` — so a fired Operator's or suspended Organizer's `Role.user(uid)` entry on every Event they were assigned to stays exactly as it was until something else explicitly edits `assignedUserIds`. AD-9's Rule lists "writes or revokes a Membership record" and "rewrites an Event/Donation document's derived permissions" as two separate Function responsibilities but never states that a revoke/suspend **triggers** a sweep of that user's currently-assigned Events. This is not a hypothetical: PRD UJ-5 and FR-17 require an Admin-suspended Organizer's Operators to *"immediately lose login/write access,"* and FR-13's revocation semantics are load-bearing for the whole trust model (§4.4, §4.7). As written, two builders could reasonably diverge — one wiring revoke-triggers-sweep, one assuming (as the Rule literally says) that only `assignedUserIds` edits matter — and the second interpretation ships a real security hole: a revoked Operator retains Appwrite-level write access to every Event they were on until someone separately edits that Event.
**Fix:** add an explicit clause to AD-2 or AD-9: *Membership revoke / Tenant suspend-or-ban also triggers the Function to re-derive permissions for every Event currently referencing that `uid` in `assignedUserIds`* (or state the alternative — login is blocked at auth time and that's judged sufficient, distinct from write-permission revocation — but say so on purpose, don't leave it implicit).

### C2 — Stack table doesn't match the repo it claims to describe (Stack section)

The spine's Stack table and repo state directly disagree:

| Row | Spine claims | Repo (`package.json`) actually has |
|---|---|---|
| Angular | `^21.0.0` ("already pinned... one major behind now-current 22") | `^22.1.7` — already upgraded (merged PR #76 "chore/angular-22-upgrade," per git log) |
| Appwrite web SDK | `^23.0.0` ("3 majors behind current 26.x") | `^27.0.0` |
| Dexie | `^4.3.0` | `^4.4.6` |
| Angular Material | `^21.2.3` | `^22.1.7` |
| jsPDF | `4.2.1` | `^4.2.1` — matches |
| — (unlisted) | not mentioned anywhere | **`primeng: ^22.1.1`** — actively wired (recent commit "fix(app-config): wire up PrimeNG license key config") |

Every row except jsPDF is stale by at least one major version, and the app ships an entire second UI component library (PrimeNG) that the Stack table, Design Paradigm, and Structural Seed never mention at all. `review-tech-verify.md` (sibling reviewer, web-verified) independently confirms the Appwrite SDK figure is stale against npm ("27.0.0... 4 majors behind, not 3") and flags Angular Material's missing currency caveat — but that lens checked npm-registry currency, not the repo's actual installed versions, so it didn't catch that Angular/Material are already fully upgraded in-repo, or that PrimeNG is missing entirely. This directly fails checklist item 4 ("ratifies rather than contradicts a brownfield codebase") — a builder reading this spine for the current stack would get four wrong answers and one missing dependency.
**Fix:** regenerate the Stack table from `package.json` directly; add a PrimeNG row and a one-line note on when to reach for PrimeNG vs. Angular Material vs. `shared/components` for the new Organizer/Admin screens this amendment adds.

---

## High

### H1 — No stated Appwrite permission lockdown for who may write Memberships/Tenant/IdentityFlag, or Event's own permission-bearing fields (AD-1, AD-2, AD-9)

AD-1, AD-2, and AD-9 all assert "written only by the AD-9 Function, never hand-edited elsewhere" for Memberships, Tenant approval state, and Event/Donation derived permissions. For the original AD-1 Labels case this is mechanically true (`Users.updateLabels` is server-key-only — Appwrite has no client write path, confirmed by `review-tech-verify.md`). But Memberships/Tenant/IdentityFlag are **ordinary collections** — nothing in the spine states their Appwrite collection-level write permissions are locked to the Function's server key, and nothing states that `Event.assignedUserIds`/`Event.tenantId` are excluded from the Update permission an assigned Operator already needs on their own Event row (to edit event details). Without that, "sole source of truth" and "never hand-edited elsewhere" are policy, not the "structural (not policy-based)" guarantee FR-2/§8 of the PRD explicitly demands. This is the one place the checklist's "does the Rule actually enforce/prevent, or is it just descriptive" question bites hardest.
**Fix:** state explicitly that Memberships/Tenant/IdentityFlag collections have create/update permission scoped to the Function's execution identity only (no `users`/`any` write role), and that Event/Donation's Update permission — while granted to assigned users for other fields — is not sufficient on its own to prove `assignedUserIds`/`tenantId` can't be client-edited (Appwrite permissions are document-level, not field-level).

### H2 — AD-9's Function has six-plus concerns and no internal decomposition convention (AD-9, Structural Seed)

AD-9 itself flags "scope grown" but the Structural Seed still shows `functions/set-role-and-permissions/` as one undifferentiated block. The codebase already establishes a per-concern-file convention inside that Function — `sprint-status.yaml` references `admin-users.js`, `event-assignment.js`, `conflict-resolution.js`, `donation-recording.js`, `shared.js` as separate source files for the *existing* four concerns. The amendment adds at least four more (Memberships/Tenant-approval, Admin/Super-Admin account mgmt, IdentityFlags cross-reference, duplicate-event detection) without naming how they extend that file layout, or any rule preventing two builders from picking incompatible internal boundaries (one giant `index.js` switch vs. one file per action vs. one file per AD). This is exactly what checklist item 6 in this task's brief asks about: the one-Function *decision* is still coherent (one shared elevated-trust boundary is the right call, and nothing here argues for a second Function), but the *organization* of that one deployable is undecided.
**Fix:** either extend the Structural Seed with the new files (e.g. `tenant-membership.js`, `admin-accounts.js`, `identity-flags.js`, `duplicate-event.js`) matching the existing convention, or add one sentence to AD-9 establishing the pattern ("one source file per action-group, routed by a single handler — see existing `admin-users.js`/`event-assignment.js`").

### H3 — "Operations" as a dimension is entirely silent (Deferred, whole document)

The reviewer-gate checklist calls this out by name as commonly skipped, and it is skipped here: nothing in Deferred, the Stack table, or any AD addresses monitoring/alerting for the AD-9 Function (now the single point of failure for every role/tenant/admin transition in the system), error tracking, or backup/restore for Appwrite collections. This wasn't a gap in the original v1 spine's excuse ("feature altitude, ops belongs elsewhere") — the amendment substantially raises the stakes of this one Function failing silently (it now gates tenant approval, admin account management, and duplicate-fraud detection, not just role writes), which arguably crosses the threshold where at least a Deferred line item, with an owner, is warranted.
**Fix:** add a Deferred entry naming operations/observability for the AD-9 Function explicitly, even if the answer is "left to the deploy runbook, not this spine" — say it on purpose rather than by omission.

---

## Medium

### M1 — "Deployment & environments" Deferred entry has no owner (Deferred)

Every other Deferred line names who resolves it ("left to the epic that builds it," "manual/out-of-band," etc.). "Deployment & environments... out of scope for this spine" is the one exception — it names the dimension (good, satisfies the letter of the checklist) but not who owns closing it. Infra/provider strategy (Appwrite Cloud) is assumed throughout (e.g., AD-1's "provisioned Appwrite Cloud instance") but never stated as an explicit decision at this altitude either.
**Fix:** one clause — which artifact (a platform-altitude spine? the deploy runbook referenced in the Migration/rollout Deferred entry?) owns this.

### M2 — IdentityFlags Deferred entry bundles two differently-scoped checks (Deferred, AD-9, Multi-tenant collections table)

The PRD is explicit that FR-12 (co-Organizer addition) runs the *full cross-tenant banned/rejected* check, while FR-23 (Operator addition) is deliberately *"lighter-weight... same-tenant name/email/phone matching"* (PRD §4.5, its own Assumption). The spine's Multi-tenant collections table and Deferred section both describe one `IdentityFlag` collection with one deferred "exact matched fields" line covering FR-12/FR-23/FR-24 together, without flagging that FR-12 and FR-23 need different match scopes against it. A builder implementing this literally as written risks building one matcher and running it identically for both flows, undershooting FR-12's cross-tenant reach or overshooting FR-23's intentionally narrower one.
**Fix:** split the Deferred line (or at least the collection-table note) into "FR-12/FR-24 cross-tenant matching fields" and "FR-23 same-tenant matching fields," even though both stay Deferred.

### M3 — AD-12's audit-on-every-Admin-read has no structural guard against a missed call site (AD-12)

AD-12 self-identifies as "best-effort... not tamper-proof" and explicitly rejects a Function-proxied alternative — that trade-off is made on purpose, which is good. But the Rule's enforcement is "fire an audit-log write... whenever the caller holds `Role.label('admin')`" with no shared chokepoint named (e.g., a single query wrapper every Admin-gated read must go through) — so as new Admin-facing read paths are added by this amendment (Organizer approval queue, duplicate-event review, Admin-account list), each one has to remember to call `AuditDataService` independently, with nothing catching an omission. Low severity since the AD already accepts best-effort as the design point, but worth naming since new read surfaces are exactly where this amendment is heaviest.

---

## Low

### L1 — Corroborated by `review-tech-verify.md`: Angular Material's staleness has no "N major behind" caveat (Stack)
Same root cause as C2 — once the Stack table is regenerated from `package.json` this resolves itself alongside C2.

### L2 — Revocation mechanism vs. Appwrite's native account-block primitive left implicit (AD-1, AD-11)
`review-tech-verify.md` flags that Appwrite has a native `users.updateStatus` block mechanism, and the spine never states whether Membership/Tenant `status` transitions actually call it (vs. relying solely on app-level status checks, which wouldn't invalidate an already-issued session). Related to C1 but narrower — C1 is about Appwrite document *permissions* not being swept; this is about the *account/session* layer. Worth resolving in the same pass as C1.

---

## What's solid (not findings, noted for context)

- AD-3, AD-4, AD-8, AD-11's Super Admin gate, and AD-13's "never blocks" rule all have real mechanical teeth (specific fields, specific trigger conditions, specific enforcement points) — these are the model to match when closing C1/H1.
- Spot-checked against the live repo: `AuthService` already reads `account.labels` via Appwrite (`src/app/data/services/auth.service.ts:33-35`), confirming AD-1's inherited v1 rule is already implemented, not just asserted — no `IUserPrefs.role`/`prefs.role` reference remains. `role.ts` correctly shows only `'admin' | 'operator'` today, confirming the multi-tenant roles are honestly described as not-yet-built rather than the spine overclaiming.
- `sprint-status.yaml` supports the PRD's "Epics 1–5 substantially built... in review" claim (§0, §12) — most Epic 1–5 stories are `done` or `review`, none are `backlog` except 5-2. The brownfield framing is accurate here.
- AD-10's scope boundary (v1 ships exactly FR-AUTH-004, richer scheme deferred) is a clean, well-precedented Deferred pattern — no divergence risk.
