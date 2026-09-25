---
id: SPEC-organizer-multi-tenancy
companions:
  - ../../planning-artifacts/prds/prd-givio-2026-09-23/prd.md
  - ../../planning-artifacts/architecture/architecture-givio-2026-07-25/ARCHITECTURE-SPINE.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. The PRD carries the Glossary, User Journeys, and Risk register; the Architecture Spine carries the ADs, diagrams, and Structural Seed — both are required reading alongside this kernel, not optional background.

# SPEC: Organizer Multi-Tenancy & Role Hierarchy

## Why

Givio's access model was built for one event company. It was never actually one: production already runs multiple Admin accounts with zero boundary between them, and any second real event company would inherit the same silent, total visibility into a rival's events, donors, and donations. This is a pain to solve (the platform cannot honestly onboard a second customer today) and a mandate to meet (a grieving family did not choose this platform — an Organizer brought them onto it, and the platform's credibility collapses the moment it's seen as capable of enabling fraud against them). The fix reframes the atomic unit of access as the single Event, never the company, enforced structurally at the data layer rather than by policy or UI convention — and introduces the trust gate, revocation-without-erasure, and dignity-first family experience that make multi-tenancy safe to ship.

## Capabilities

- **CAP-1 — Tenant Hierarchy & Per-Event Access**
  - **intent:** Access resolves per-Event, never company-wide, and tenants are structurally invisible to each other.
  - **success:** Zero confirmed cross-tenant data exposure incidents in production; no code path grants Event access without a matching, tenant-checked per-Event grant.

- **CAP-2 — Credentials & Identity**
  - **intent:** Each tenant relationship authenticates independently — no single identity switches between companies.
  - **success:** A person working two tenants holds two distinct, independently revocable credential sets; revoking one never affects the other.

- **CAP-3 — Organizer Onboarding & Approval Gate**
  - **intent:** No event company can touch a real family's data before Admin has vetted and approved it.
  - **success:** Median approval turnaround ≤ 3 business days, never achieved by skipping the document or phone verification step.

- **CAP-4 — Co-Organizer & Operator Lifecycle**
  - **intent:** Tenant leadership can grow its own team under individually-attributable accounts, and revocation never erases who did what.
  - **success:** 100% of donations retain correct recorder attribution after the recorder's access is revoked; identity-bypass attempts on co-Organizer/Operator addition are caught and flagged.

- **CAP-5 — Trust & Fraud Prevention**
  - **intent:** The platform actively detects likely fraud (duplicate event registration) across tenants without punishing legitimate re-created events.
  - **success:** Duplicate-event flags reviewed within ≤ 24 hours; false-positive rate is tracked and never optimized away from.

- **CAP-6 — Family Experience & Dignity**
  - **intent:** A grieving family sees their event's full, real donation picture without being exposed to anyone outside their event — framed around dignity, not generic privacy policy.
  - **success:** 100% of family sessions on a non-personal device auto-logout correctly on navigation-away.

- **CAP-7 — Admin Oversight, Support & Cross-Event Reporting**
  - **intent:** Admin gets platform-wide visibility and Super Organizer gets tenant-wide visibility, with every Admin access itself logged.
  - **success:** A Super Organizer's consolidated cross-event total reflects a new donation within 15 seconds; every Admin read or write of tenant data produces a matching audit-log entry.

- **CAP-8 — Platform Administration Hierarchy**
  - **intent:** Exactly one Super Admin can create, promote, demote, or suspend Admin accounts, so multiple platform Admins are never unchecked.
  - **success:** Every Admin-account-management attempt from a non-Super-Admin caller is rejected server-side, with zero exceptions.

## Constraints

- Per-event grant is the sole atomic unit of access — no company-level blanket permission may ever be introduced, even for a tenant's own leadership.
- Tenant isolation is enforced at the Appwrite permission/data layer via the Function's tenant-match check, never UI-only.
- No account that has ever recorded a donation, approved a Tenant, or taken an Admin action is hard-deleted — only revoked or suspended via a status field.
- The one Appwrite Function is the sole writer of Labels, Memberships, Tenant approval state, and Admin/Super Admin account changes — no client-side write path for any of these may ever exist.
- Family-facing language and support scripts are framed around a grieving family's dignity, never generic data-privacy or compliance language.
- Money stays integer minor units, never floats.
- Duplicate-event detection may never block Event creation outright, only flag it for Admin review.
- Revocation and Tenant suspension must immediately sweep and retract live Appwrite permissions — never wait for a separate, unrelated edit to trigger it.
- Admin/Super Admin access logging is client-side and best-effort (an accountability trail) — deliberately not tamper-proof; no future feature may treat it as an unbypassable security boundary.

## Non-goals

- Family-as-self-organizer, acting without a professional event company.
- Automated third-party company verification — v1 stays manual-only.
- A full ticketing/support system — the Contact Admin form is the only v1 channel.
- Offline-first handling, a recorder-vs-viewer role distinction, or designing around event temporariness — all explicitly excluded, not oversights.
- Billing or monetization — the approval gate exists for fraud prevention, not billing.
- An in-app Super Admin succession flow — transfer is manual and out-of-band in v1.

## Success signal

The platform can onboard a second real, unrelated event company without compromising any of three guarantees: zero confirmed cross-tenant data exposure incidents, 100% donation-attribution integrity surviving any revocation, and 100% correct auto-logout on non-personal-device family sessions.

## Assumptions

- FR-5's one-account-per-tenant guarantee covers provisioning-time prevention only; detecting shared-credential *use* after an account already exists is out of scope for v1.
- Manual verification's Admin/ops-time cost is acceptable at current expected Organizer signup volume — revisit if volume grows enough to make phone-verification-per-Organizer a bottleneck.

## Open Questions

- Exact onboarding field list beyond company name, location, size, estimated user count, and company type.
- Verification specifics: which document types count as valid, and who conducts the phone verification call.
- Numeric targets for the Contact Admin form's response-time expectation (SM-1's approval-turnaround target is already set at ≤ 3 business days).
- Does a billing/monetization model interact with the pending/approved Tenant state?
- Exact identity-matching rules for the Operator-addition/IdentityFlags check — which fields, and what counts as a flaggable match versus a coincidental near-match.
- Super Admin succession mechanism, if the single designated account is ever lost, compromised, or needs transfer.
- Duplicate-event detection's exact matching algorithm — which fields, fuzzy versus exact match.
- Operations envelope (monitoring, alerting, backup) for the now-load-bearing Appwrite Function.
- Deployment & environments (hosting, CI/CD, environment promotion) — long-standing, out of scope for both the PRD and the Spine, still needs an owner.
