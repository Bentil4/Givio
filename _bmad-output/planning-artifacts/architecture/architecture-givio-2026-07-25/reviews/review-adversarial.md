---
name: 'Adversarial Review — Givio Architecture Spine'
type: review
reviews: architecture-givio-2026-07-25/ARCHITECTURE-SPINE.md
method: 'two-units-one-level-down divergence hunting'
created: '2026-07-26'
---

# Adversarial Review — Givio Architecture Spine

**Verdict:** The spine's layering (Presentation/Domain/Data) and lazy-loading/label/route-guard rules (AD-1, AD-6, AD-7) are tight enough that two builders won't diverge. But the three "hard" concurrency/security ADs — AD-2 (Team permissions), AD-3 (conflict detection), AD-4 (Outbox schema) — are specified at the level of *intent*, not *mechanism*, and in one case (AD-2) the literal Rule text produces a real security hole rather than merely an inconsistency. Two engineers each following the letter of every AD will build incompatible, and in one case insecure, systems.

Method: for each AD, I constructed two hypothetical builders (e.g. "Builder A on `admin-event.md`" vs "Builder B on `member-events.md`") who each read only the spine (plus their own screen spec) and asked whether their independent implementation choices interoperate. I verified claims about Appwrite's actual permission semantics (`Role.team(id)` vs `Role.team(id, [role])`) against documented behavior rather than assuming the spine's shorthand is accurate.

---

## Finding 1 — AD-2's literal permission Rule gives family members write access (CRITICAL)

**Spine text (AD-2, line 58):** *"Event/Donation/Report documents carry `Role.team(eventId)` (operators, read/write) and `Role.team(eventId, ['viewer'])` (family members, read-only)."*

**The bug:** In Appwrite's permission model, `Role.team(eventId)` with no roles array matches **any member of the team, regardless of what internal team-roles they hold**. The roles array in `Role.team(id, [roles])` is a *narrowing* filter used on a specific permission entry — it does not cause other, unqualified `Role.team(id)` entries to exclude members who happen to carry a role tag like `viewer`. Family members, per the Rule, are still plain members of the *same* Appwrite Team (just "added ... with a restricted in-team role"). That means a family member satisfies **both** permission entries on the document: the read-only `Role.team(eventId, ['viewer'])` entry *and* the unrestricted read/write `Role.team(eventId)` entry, because the latter doesn't check roles at all. Family members end up with write access to Donation documents — exactly what AD-2's own "Prevents" clause and FR-SEC-002/FR-SEC-003 exist to stop.

**Two compliant builders diverge:**
- **Builder A** (implements `event-detail.md` / `EventRepository.provisionTeam()`) reads the Rule literally: operators get plain team membership, write permission is `Role.team(eventId)`. Ships with the write-access hole above.
- **Builder B** (implements `member-events.md` / notices the hole while writing the family read-only view) independently "corrects" it by tagging operators with their own role too (e.g. `Role.team(eventId, ['operator'])` for write) — a reasonable fix, but **it is not written anywhere in the spine**, so whether operators get an explicit role tag is now an undocumented assumption. If the Team-provisioning code (owned by whichever repository/screen implements it first) doesn't apply that tag consistently, Builder B's document-permission code silently breaks: their write permission checks for `'operator'` role but operators-as-provisioned-by-Builder-A's-code never received that tag.

**Structural consequence:** this is precisely a "permission rule satisfiable in two different structural ways" — and one of the two ways (the one written down) is insecure. The AD needs an explicit third role tag on Team membership (e.g. `operator` vs `viewer`) and both write and read-only Rule clauses must reference role-qualified `Role.team(eventId, [...])` entries, never a bare `Role.team(eventId)`.

---

## Finding 2 — AD-1's label-assignment mechanism has no code path in a client-only stack (HIGH/CRITICAL)

**Spine text (AD-1, line 52):** *"the single source of truth for Admin/Operator/Member is an Appwrite Label on the user account... Labels are server/Console-only."*

Appwrite Labels can only be set via the **Server SDK** (API key) or the Appwrite Console — never the Client Web SDK, which is the only SDK the Stack table lists (`Appwrite (web SDK) ^23.0.0`). Nothing in the Structural Seed, Stack, or Deferred sections provisions a server component (Appwrite Function, custom backend, etc.).

Yet `admin-settings.md` (the screen spec this spine is meant to be built against) explicitly specifies an in-app **"Change Role"** action and an "Add New User" flow with a Role field (Admin/Organizer/Member), and PRD §6.2 (line 373) describes "Role options: Admin, User (Operator), Family Member" as something Admin selects when creating a user *inside the app*. This action is structurally unbuildable under AD-1 as literally written, because there is no client-callable path to set a Label.

**Two compliant builders diverge:**
- **Builder A** takes AD-1 at face value — "Console-only" — and ships `admin-settings.md`'s "Change Role" button as a no-op / manual-ops instruction ("ask your Appwrite admin to change this in Console"), which contradicts the screen spec's own acceptance criteria.
- **Builder B**, needing the screen to actually work, invents an Appwrite Function (undocumented anywhere in the spine, Stack, or Deferred) that the client calls to proxy the label change — a real architectural component that should have been named in the Structural Seed but isn't, meaning its auth model (who can invoke the function, how it's deployed) is now improvised per-builder.
- **Builder C** (a plausible third path, worth naming) instead reintroduces a client-writable "role" field on a custom `Users`/`Profile` collection, restricted by document permission to admin-only *write* — which reproduces the exact self-escalation risk pattern AD-1 was written to eliminate, just moved from `prefs` to a collection, because nothing stops a later self-serve doc-update path from being added to that same collection.

This should be flagged back to the spine, not left for story-level improvisation: either a Cloud Function is added to the Structural Seed, or "Change Role"/"Add New User" become explicit out-of-app operations and the screen specs must be corrected to match.

---

## Finding 3 — AD-3 never specifies HOW a version mismatch is detected (HIGH)

**Spine text (AD-3, line 64):** *"On a version mismatch during outbox drain, the losing version is written to a `DonationConflicts` collection..."*

No `version` or `revision` field is defined anywhere on the Donation entity (Consistency Conventions table only fixes id/date/money/error shape, not a concurrency field), and Appwrite's Databases API has no built-in ETag/optimistic-concurrency check on `updateDocument` — it is last-write-wins server-side unless the app itself compares a field before writing. "On a version mismatch" therefore describes an outcome, not a mechanism.

**Two compliant builders diverge:**
- **Builder A** (implements `DonationRepository.update()`) caches the server's `$updatedAt` at the moment the document was last pulled into Dexie, and on drain, does a `getDocument` read-before-write to compare cached vs. current `$updatedAt`; treats any mismatch as a conflict.
- **Builder B** (implements the same repository independently, e.g. across a rebase/parallel PR) instead adds an explicit integer `version` field to the Donation schema, incremented by every write, and compares the outbox payload's baseline version against the server's current version.

Both satisfy "on a version mismatch ... write to DonationConflicts" to the letter. But they produce two incompatible Donation schemas (one has a `version` int field the other doesn't) and two incompatible conflict-detection code paths that cannot be merged without picking a winner and migrating data.

**Compounding gap — `DonationConflicts` shape is equally unspecified.** AD-3 says the record should "reference both versions," but the *losing* version was, by definition, never written to the primary collection — it has no server `$id` to "reference." It can only be embedded as a raw snapshot. The spine doesn't say whether the conflict record stores full denormalized snapshots of both sides, or a `donationId` (winner) + inline losing payload, or something else — so the Admin conflict-resolution UI (which some *other* builder writes, per the Capability Map, against `feature/admin/`) has no fixed contract to code against.

---

## Finding 4 — AD-4's Outbox entry schema is under-specified on target identity, idempotency, and ordering granularity (HIGH)

**Spine text (AD-4, line 70):** *"every mutation writes to the local Dexie table and appends an outbox entry (`localId`, `entityType`, `op`, `payload`, `status: pending|synced|conflict`, `retries`)."*

Three separate ambiguities, each individually enough to make two repositories' outbox entries structurally incompatible for one shared `SyncEngine`:

1. **Target-identity ambiguity.** For an `update`/`delete` op, what identifies *which* server document to mutate? There is no `entityId`/`targetId` field distinct from `localId` (which reads as the outbox entry's own local key) and `payload` (whose contents aren't specified). Builder A puts the target id inside `payload.$id`; Builder B adds an implicit assumption that `localId` doubles as the entity's local-then-server id. `SyncEngine` is a single shared root service that must drain entries from *both* `EventRepository` and `DonationRepository` — if the two repositories disagree on where the target id lives, the drain loop needs per-entity-type special-casing that AD-4 never anticipates ("divergent... logic per screen" was the thing AD-4 was written to prevent, and it reappears one layer down as "divergent logic per repository").

2. **Idempotency gap.** `retries` implies retry-on-failure, but nothing says the offline-generated `localId` becomes the Appwrite `$id` on `createDocument`. If Builder A lets Appwrite auto-assign `$id` (`ID.unique()`) on every attempt, a retry after a dropped response (write succeeded server-side, ack never arrived) creates a **duplicate donation record** — silently violating donation-count integrity that FR-RPT-001/FR-RPT-002 depend on. Builder B, who does set `documentId = localId` on create, gets natural idempotency (retry hits `409 already exists`, treated as success). Both builders satisfy the literal AD-4 text; only one is correct, and the spine doesn't say which.

3. **Ordering-granularity ambiguity.** "Drains the outbox strictly in append order" reads as *global* FIFO. Builder A implements it that way: a single stuck/failing entry (e.g. a transient conflict on donation X) blocks every other pending entry — including unrelated donations on unrelated events — from ever syncing, which conflicts with FR-OFF-004's "sync runs in the background... Retry Sync" framing (implying failures are isolated, not queue-blocking). Builder B implements *per-entity* ordering (strict order preserved only for edits to the same donation; unrelated entities drain independently/in parallel) — arguably the better design, but it is a structural deviation from "strictly in append order" that a reviewer checking spine-compliance would flag as non-conforming, even though it's the version that actually works.

**Related, same root cause:** the Consistency Conventions table defines `RepositoryError` only as "a domain-level error, never Appwrite-shaped" — with no discriminated code (`NETWORK` vs `PERMISSION` vs `CONFLICT` vs `VALIDATION`). `SyncEngine`'s job of routing a drain failure to either "retry" (network blip) or "AD-3 conflict path" or "give up and surface to user" requires exactly this discrimination, and two repositories built independently will invent their own ad hoc error shapes, breaking the shared `SyncEngine`'s ability to branch consistently.

---

## Finding 5 — AD-2 Team membership and the PRD's `assignedUserIds` field are two undeclared sources of truth (HIGH)

The PRD's Event data model (line 1024) already defines `assignedUserIds: String[]` as an Event attribute — "Array of Operator user IDs" — predating this spine. AD-2 introduces a *second*, independent mechanism for the same fact: Appwrite Team membership ("assigning an operator = adding them as a Team member"). The spine never reconciles these: it doesn't say `assignedUserIds` is removed in favor of Team membership, nor that it's a synced denormalization of it, nor which one is authoritative for the "Events Assigned (count for organizers)" figure the `admin-settings.md` screen spec (line 44) needs to render.

**Two compliant builders diverge:**
- **Builder A** (builds `admin-event.md` "assign operators" flow) treats Team membership as authoritative per AD-2, calls `teams.createMembership()` directly, and doesn't touch any `assignedUserIds` field at all.
- **Builder B** (builds `admin-settings.md`'s user table, needing a fast "Events Assigned (count)" column without an N-way Teams API fan-out per user) reads/writes `assignedUserIds` on the Event document directly, because it's cheap to query and it's literally in the PRD's own data model.

These two never call each other's code path, so the two records of "who is assigned to this event" drift apart the first time either one is used exclusively — e.g., Admin assigns an operator via Builder A's flow; Builder B's user-management screen shows the operator's assigned-events count as unchanged because `assignedUserIds` was never touched.

**Compounding gap — is Team-membership assignment even Outbox-eligible?** AD-4's "every mutation" is scoped to `DonationRepository`/`EventRepository` document writes. Appwrite Team membership invites are a fundamentally different API shape (they can require email/redirect-URL invite flows for new members) that doesn't fit the generic Dexie-first-then-outbox-drain pattern the same way a document CRUD does. The spine never states whether "assign operator to event" is required to work offline (per the blanket "every mutation" framing of AD-4) or is implicitly an online-only admin action — leaving that ambiguous is itself a fork two builders will resolve differently.

---

## Finding 6 — Admin's cross-event visibility isn't actually covered by AD-1 + AD-2 together (HIGH)

AD-1 says global checks use `Role.label('admin')`; AD-2's Rule for Event/Donation/Report documents lists **only** `Role.team(eventId)` and `Role.team(eventId, ['viewer'])` as the document-level permissions — it never says the admin label is *also* added to those documents' permission arrays. Since Admin is not necessarily (and per PRD's "Admin: full platform access... view all data," not intended to be) a Team member of every event, whether Admin can actually read/write an arbitrary Event/Donation document depends entirely on an Appwrite collection setting the spine never mentions: **`documentSecurity`**.

- If `documentSecurity` is **enabled** on these collections (needed so per-document `Role.team(eventId, ...)` permissions apply at all — which AD-2 requires), then collection-level permissions (e.g. a blanket `Role.label('admin')` grant at the collection) still apply in addition, *if and only if* that collection-level grant was actually configured. Nothing in the spine states that it is.
- If a builder forgets to also grant `Role.label('admin')` at the collection level (reasonably, since AD-2's Rule only mentions team roles for these documents), Admin's "Master Dashboard" (PRD line 1085, "Overview of all events") and the entire `feature/admin/` tree become unbuildable without either (a) making Admin a member of literally every Team at creation time (an undocumented obligation on `EventRepository.create()`), or (b) bypassing document permissions via a server-side key (which, per Finding 2, doesn't exist in this stack).

**Two compliant builders diverge:** Builder A (schema/provisioning owner) assumes AD-1's admin-label carve-out is "already handled generically" and doesn't add anything collection-specific; Builder B (admin-dashboard owner) discovers at integration time that Admin queries return empty/403 for events Admin isn't a Team member of, and patches it locally by auto-adding Admin to every new Team on creation — a workaround that works but was never specified, and silently makes "Team per Event" (AD-2's stated model) actually "Team per Event plus a hidden universal admin member," which has consequences for membership-count-based UI (e.g. "Operators assigned" counts in `admin-settings.md` would need to exclude the auto-added admin).

---

## Finding 7 — AD-6's "fetched at login" membership cache has no revocation path; combined with Dexie, unassignment doesn't actually revoke offline access (HIGH)

**Spine text (AD-6, line 82):** *"additionally check the target event's Appwrite `teamId` against the caller's team memberships (fetched at login)."*

"Fetched at login" is a one-time snapshot with no stated refresh/expiry/invalidation trigger. Walk the scenario the task explicitly asks about — an operator is unassigned from an event mid-session:

1. Operator is logged in, has synced Event X's donations into their local Dexie DB (per AD-4, donation entry/edit must work fully offline).
2. Admin unassigns the operator from Event X (removes Team membership via whatever path Finding 5 resolves to).
3. Operator's client still holds the login-time cached membership list (per AD-6's literal text) showing Event X — the route guard still says "allowed."
4. If the operator is **offline** at this point (the exact condition the whole spine is optimized for), there is no live Appwrite call to fail-fast against, either. The operator can continue reading/editing Event X's already-cached Dexie donation data indefinitely, fully offline, with the client route guard, the client repository, and the local Dexie store all agreeing they're authorized — because nothing in AD-3/AD-4/AD-6 purges or re-validates locally cached data on membership change. FR-SEC-002's "Operator on an unassigned event is denied access, even via direct URL" (PRD line 1148, marked Critical) is not actually satisfied in this offline scenario.

**Two compliant builders diverge on the online case too:** Builder A implements the guard literally — reads the cached login-time membership array, no re-fetch — matching AD-6's text exactly but reproducing the bug above whenever the app is online long enough to notice staleness (e.g., a multi-hour venue shift, well within the realistic use case). Builder B, recognizing the staleness problem, re-fetches team memberships on each navigation (or on reconnect) — a materially different, more expensive, network-dependent guard implementation that deviates from "fetched at login" as written. Neither is wrong per the spine's literal text, but they produce different security postures, and neither one solves the offline-data-remanence half of the problem, which no AD addresses at all.

---

## Finding 8 — Wrongly deferred: Audit log write path interacts directly with the Outbox and cannot be safely left to "implementation" (MEDIUM-HIGH)

**Spine text (Deferred, line 158):** *"which layer writes `AuditLogEntry` ... is left to implementation — FR-SEC-004 only fixes that it must be immutable and complete, not the mechanism."*

This should not have been deferred, because the two obvious implementation choices are not interchangeable given AD-4's offline-first model — they produce different audit *completeness*, which is the one thing FR-SEC-004 (Critical/High, "full audit log for all create, edit, delete operations," "before/after values") actually demands:

- **Choice A — client-side, per-mutation, Outbox-routed:** every repository mutation also enqueues an `AuditLogEntry` outbox entry (`entityType: 'AuditLogEntry'`) alongside the Donation/Event entry, capturing before/after values at the moment of the *offline* edit. This correctly captures every individual edit, even a sequence of edits made to the same record while still offline.
- **Choice B — server-side trigger** (an Appwrite Function reacting to database write events, diffing old vs. new document state): this only fires once a write actually reaches Appwrite, i.e., at sync-drain time. If a donation is edited twice offline before ever syncing, a server-side diff-on-write trigger sees only one write event (or a squashed net result, depending on how the outbox drains updates) and cannot reconstruct the intermediate edit's before/after values — an entire audit entry silently disappears. This directly breaks "full audit log for all... operations" and "before/after values" per FR-SEC-004.

Because AD-4's offline-first Outbox already exists and already governs exactly this kind of per-mutation event stream, this decision is not independent of the spine the way "receipt template storage" or "report template CRUD" (the spine's other, legitimately-deferrable items) are — it's downstream of an existing AD and two builders picking Choice A vs Choice B today will produce audibly different (and differently correct) systems, not just cosmetically different ones. This belongs in the spine as an explicit AD, not the Deferred list.

---

## Finding 9 — Wrongly deferred (partially): "Realtime vs polling" re-opens a choice the PRD already made (MEDIUM)

**Spine text (Deferred, line 155):** *"Appwrite Realtime subscriptions vs. polling is not fixed here... either choice fits this spine unchanged."*

The PRD, which this spine lists as its own source of truth, already commits to a specific mechanism twice: FR-RPT-001 ("Dashboard auto-refreshes via **Appwrite Realtime subscriptions**") and FR-DEV-003 ("Appwrite **Realtime** pushes other users' entries to the event list without page refresh"). These are acceptance criteria, not suggestions. Deferring "Realtime vs. polling" as an open Domain/State-layer choice invites a compliant-with-the-spine builder to implement polling (which the spine explicitly says is fine) while failing the PRD's own acceptance criteria for FR-RPT-001/FR-DEV-003. This is lower severity than Findings 1–8 because it's a single, easily-reversed implementation choice rather than a structural clash between two builders' outputs — but it's worth correcting because the spine's own "either choice fits" claim is contradicted by its own cited source document.

---

## Summary Table

| # | AD(s) involved | Type | Severity |
| --- | --- | --- | --- |
| 1 | AD-2 | Rule fails to prevent stated Prevents (real security hole) | Critical |
| 2 | AD-1 | Mechanism gap — unbuildable screen (Change Role / Add User) | Critical/High |
| 3 | AD-3 | Mechanism unspecified — two incompatible conflict-detection + schema designs | High |
| 4 | AD-4 | Schema unspecified — target-id, idempotency, ordering granularity, error taxonomy | High |
| 5 | AD-2 + PRD data model | Two undeclared sources of truth for event assignment | High |
| 6 | AD-1 + AD-2 | Gap — Admin cross-event visibility not actually covered | High |
| 7 | AD-6 | Stale-cache revocation gap + offline data remanence | High |
| 8 | AD-4 (Deferred item) | Wrongly deferred — interacts with existing Outbox mechanism | Medium-High |
| 9 | Deferred item | Wrongly deferred (contradicts own cited PRD) | Medium |
