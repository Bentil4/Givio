# Adversarial Security Review — Givio Organizer Multi-Tenancy & Role Hierarchy PRD

Reviewer stance: attack every FR/guarantee at the requirements level. Only gaps a careful reader would agree are real are listed below.

---

## 1. Duplicate-event detection scope is unspecified — the platform's headline fraud scenario may be undetectable across tenants

**Severity:** Critical
**Location:** FR-14 (Duplicate-Event Detection), §3 Glossary, interacting with FR-2 (Structural Tenant Isolation)

**Scenario:** The Vision (§1) and Risk table (§10) both name "same event/deceased registered twice to double-collect donations" as a named threat. FR-2 guarantees Organizers can never see or query across tenants. FR-14 never states whether duplicate detection runs *within* a tenant only, or *platform-wide across all tenants* (which only Admin, not any Organizer, could ever execute given FR-2). If it's tenant-scoped (the natural reading, since it's listed under Organizer-facing features and tenants can't see each other's events), then two different companies registering the same deceased individual — the single most obvious way to exploit a "companies can't see each other" system — goes structurally undetected. Nothing routes this comparison through Admin's platform-wide view.

**Fix:** Add an explicit FR (or amend FR-14): duplicate-event detection must run platform-wide, executed by Admin/system logic that has cross-tenant visibility (not delegated to any tenant-scoped role), specifically to catch the same deceased/event registered by two different tenants.

---

## 2. FR-12's identity cross-reference covers co-Organizer additions only — Operators, who actually touch the money, get no identity check at all

**Severity:** High
**Location:** FR-12 vs FR-11 (Organizer manages Operators only) vs FR-4/FR-5 (Credentials-per-relationship)

**Scenario:** FR-12 explicitly binds the banned/rejected cross-reference and Admin notification to "adding a co-Organizer." FR-11 lets any Organizer add Operators with no equivalent check. A single human — including someone previously banned/rejected as an Organizer applicant, or someone already flagged elsewhere — can be added repeatedly as an Operator (the role that physically records donations) under different names/emails at the same tenant, fragmenting accountability at exactly the layer where cash actually moves. FR-5's own assumption note concedes there's no technical detection for one human holding multiple accounts, and pins enforcement on "identity checks at signup/co-Organizer-addition (FR-12)" — which by its own text doesn't reach Operators.

**Fix:** Extend FR-12's identity cross-reference (or a new FR) to Operator additions, not just co-Organizer additions — at minimum a lighter-weight check (duplicate name/email/phone within a tenant) with Admin notification on match.

---

## 3. The banned/rejected list's population criteria don't clearly include people revoked post-approval for cause

**Severity:** High
**Location:** FR-12 (references "banned/rejected list") vs FR-13 (Revocation) vs FR-19/Open Question 5 (Admin suspension authority)

**Scenario:** FR-12's cross-reference is framed around applicants rejected *at signup*. UJ-3 confirms this reading — it's about a "previously-rejected scammer." But UJ-5 and FR-19 describe Admin *suspending an already-approved* Organizer mid-investigation for fraud. Nothing in the PRD states that a person revoked-for-cause after approval is added to the same banned/rejected list FR-12 checks. If the list only ever grows from signup rejections, a person Admin suspends at Tenant A for defrauding a grieving family can walk to Tenant B, self-sign-up clean, and pass FR-12's check entirely — the exact bypass UJ-3 was designed to close, just entered from the "already approved, later caught" side instead of the "rejected at signup" side.

**Fix:** Add a consequence to FR-13 (or a new FR): any person revoked for cause (fraud/investigation, not routine offboarding) is added to the same cross-reference list FR-12 checks, platform-wide.

---

## 4. Approval is a one-time, company-level gate; duplicate-event flags are advisory-only — a newly-approved-but-flagged company can still collect before Admin reviews

**Severity:** Medium
**Location:** FR-6/FR-8/FR-9 (Approval Gate) vs FR-14 (duplicate flag "does not block Event creation outright")

**Scenario:** The approval gate (FR-8/FR-9) vets the *company* once, before any event exists. After approval, an Organizer can create events and start collecting immediately (FR-9's boundary only blocks pending-state accounts). FR-14 is intentionally non-blocking to avoid punishing legitimate reschedules (SM-C2) — but that means the one ongoing fraud check that runs *after* approval is advisory, with no stated SLA on how fast Admin must act on a flag. There's a real window between "duplicate flagged" and "Admin reviews" during which a family can be actively defrauded, and the PRD sets no bound on that window (Open Question 4 covers latency for the cross-event total, not for fraud-flag response time).

**Fix:** Add a success metric / FR target for maximum time-to-review on an Admin duplicate-event notification, distinct from SM-1's approval turnaround.

---

## 5. Family access code has no compromise/leak recovery path, and no way to distinguish "wrong person, right device" from a legitimate family member

**Severity:** Medium
**Location:** FR-16 (personal-device prompt/auto-logout), FR-18 (full visibility), §3 Glossary "Access Code"

**Scenario:** FR-16 only asks *whose device this is* — it authenticates nothing about *who is looking*. Possession of the code is the only credential (by design — "no account," per Glossary). If the code leaks beyond the intended family (forwarded in a group chat, posted, guessed from a short/weak code — unspecified in this PRD), any stranger sees full, unredacted donation totals and lists (FR-18 explicitly forbids hiding anything). The PRD's own framing — dignity, not generic privacy — makes this a pointed gap: a leaked code is a much more likely real-world failure mode for a grieving, non-tech-forward family (UJ-4's own persona) than a borrowed-device scenario, and it's entirely unaddressed. There's no stated mechanism to detect anomalous access, rotate/invalidate a compromised code, or let the Organizer/family reissue one.

**Fix:** Add an FR covering access-code compromise: Organizer- or family-triggerable code rotation/invalidation, and/or anomaly signals (e.g., unusual access volume) surfaced to the Organizer — scoped narrowly enough not to reintroduce an account requirement.

---

## 6. FR-19's Admin access model is left as an open question, but it directly determines whether FR-2's "structural" isolation claim is true

**Severity:** High
**Location:** FR-19, Open Question 5, cross-referenced against FR-2 and §9 ("non-negotiable guardrails")

**Scenario:** This is already flagged as Open Question 5, but the review agrees the ambiguity itself is the risk, not a minor loose end. FR-2 is marketed throughout the PRD as a *structural*, data-layer guarantee ("enforced structurally, not by policy," §1; "non-negotiable guardrail," §9). FR-1 makes per-event grants the *sole* atomic unit of access, with "no code path" granting access without one. But FR-19's own assumption block admits Admin might hold either (a) standing per-tenant/per-event access at will, or (b) only suspend/approve/revoke authority requiring a grant like everyone else — and explicitly says this "affects how structural tenant isolation applies to Admin." Shipping FR-1/FR-2 as stated "non-negotiable" guardrails while the one role most capable of touching every tenant has an undefined relationship to those guardrails means the PRD's central security claim is unverifiable as written.

**Fix:** Resolve Open Question 5 as a hard FR before this PRD is implementation-ready, not left open: state explicitly whether Admin access to a tenant's Events requires a logged, purpose-bound grant (even if self-issuable) or is standing/unconditional — and if standing, add an explicit consequence that every such access is immutably logged and visible in the platform-wide audit log (FR-15).

---

### Not flagged as findings (considered, judged adequately covered)
- Revoked person's name appearing in two tenants' attribution records (FR-13 vs FR-2): not a real leak — each tenant only ever sees its own donation attribution (FR-15's tenant-scoped audit visibility already prevents cross-tenant correlation by non-Admin roles).
- One human legitimately holding separate Organizer/Operator identities at two different tenants (FR-4/FR-5): this is the explicit, intended design (credentials-per-relationship), not a gap.
