# Brainstorm Intent: Organizer Multi-Tenant Role System

**Topic:** Multi-tenant Organizer role system for Givio (donation-tracking platform for funeral/memorial events).
**Hierarchy:** Admin > Super Organizer > Organizer > Operator > Family.

## Foundational Constraints (Bedrock Facts)

Confirmed load-bearing — every downstream decision must satisfy these:
1. Multiple unrelated event companies share the platform concurrently.
2. One event company runs several events concurrently.
3. A family did not choose the platform — the Organizer brought them on.
4. Access to an event must be auditable at any moment.
5. A person could work across more than one event company over time.

Explicitly excluded as non-constraints — do NOT design around these:
- Recorder vs. viewer being different people/places.
- Events being temporary/time-bounded.
- Unreliable connectivity at the event (no offline-first requirement).

## Core Access Model

- **Per-event grant is the sole atomic unit of access control at every tier.** Even an Organizer's access to their own events is an implicit per-event grant, never a blanket company-level permission.
- **Credentials-per-relationship, not shared identity.** An Operator logs in with credentials the Organizer sends them, scoped to that Organizer — not one identity that switches between events/companies.
- **One human = one Organizer account.** Two people at the same company get two separate Organizer accounts; shared credentials under one identity are not allowed.
- **Isolation is structural, not policy-enforced.** Tenants must never detect each other's existence: no shared IDs, no leaked names in URLs/errors, no operator addable across tenants by mistake.
- **Operator event-switcher UI is required.** When assigned to multiple concurrent events, the Operator must always see, unmistakably, which event they are currently acting in, so a scoped action can never fire against the wrong event.
- **Revocation never erases attribution.** A person's name stays permanently attached to every donation they entered, even after their access is revoked. Revocation removes login/write access only, not history. People who have touched money can never be hard-deleted.
- **Family's read-only live view survives Organizer suspension.** If Admin suspends an entire Organizer account, the family's read-only donation view keeps working (may freeze or keep updating) — only the Organizer/Operator's write/login access is blocked.

## Tenant Hierarchy & Onboarding

Role capabilities:
- **Admin**: platform-wide; approves Organizer accounts; full system control/access at all times; sees platform-wide audit log.
- **Super Organizer**: first Organizer account created for a company; can add co-Organizers and Operators; manages/revokes privileges for both; sees company-wide (not cross-company) audit trail; sees near-real-time consolidated cross-event donation total.
- **Organizer** (non-super, added by Super Organizer): can add/manage Operators only; cannot add another Organizer.
- **Operator**: scoped to only the specific events they're assigned to.
- **Family**: read-only, per-event, via family code.

Onboarding paths (two):
- (a) Admin creates/invites the Organizer directly and sends credentials.
- (b) Organizer self-signs-up and sets their own credentials, but stays in a pending state until Admin approves.

Required intake info before Admin approval: event company name, location, company size, estimated number of platform users, company type, plus other onboarding info.

v1 verification approach (manual): Admin reviews submitted info plus a document upload (business registration/ID) and a phone verification call before approving. Automated third-party verification is explicitly deferred (see Out of Scope).

Co-Organizer bypass loophole (closed): adding a co-Organizer applies the same identity checks used at original Organizer signup (cross-reference against banned/rejected applicants), and Admin is notified on every co-Organizer addition. No separate vetting system needed.

## Trust & Fraud Prevention

- The approval gate exists for fraud/trust protection, not billing — root cause: without approval, the platform becomes a vector for scams against grieving families, and after-the-fact bans don't work (a scammer just abandons the account and creates a new one for the next event).
- **Duplicate-event detection**: detect potential duplicate events (e.g., same event/deceased registered more than once to double-collect donations) and notify Admin.
- **Audit log**: all user activity is logged. Visibility follows the tenant boundary — Admin sees the platform-wide log across all Organizers; a Super Organizer sees only their own company's audit trail (their co-Organizers and Operators); no one sees another company's log.

## Family Experience Requirements

- Family wants live, accurate donation totals when viewing via family code.
- On family-code entry: ask whether this is the person's personal phone; if not, auto-logout as soon as they leave the app/page.
- Must address family fears: wrong family member (or non-family) gaining access to donation details; not having full visibility into all donations actually entered (no partial/hidden totals).
- **Framing note for PRD**: the real reason for strict per-event Operator scoping is family dignity — not being seen, in their grief and finances, by a stranger with no relationship to their event — not a generic data-privacy policy. PRD language for this requirement should reflect dignity, not just privacy/compliance.

## Admin Oversight Requirements

- Admin must be able to manage multiple Organizer accounts/events independently, with no cross-account interference.
- Must guarantee: Organizers cannot see/manage other Organizers' account info or events; Organizers never have full admin privileges; Admin never loses full system control/access.
- **Support channel (v1)**: a simple logged "Contact Admin" form — not a full ticketing system.
- **Cross-event reporting**: Super Organizer's consolidated cross-event total is near-real-time aggregation (same consistency bar as the family's live view), with a periodic settlement/export report as a secondary accounting feature.

## Out of Scope for v1

- **Family-as-self-organizer**: a family member acting as Organizer for their own event without a professional event company. Explicitly Won't-this-time — v1 stays scoped to the professional event-company Organizer model. Parked as a future direction.
- **Automated third-party company-info verification** at Organizer onboarding — v1 uses manual review only (see Onboarding above).
- **Full ticketing/support system** — v1 uses a simple Contact Admin form only; ticketing deferred as a later Should.
- **Offline-first / unreliable-connectivity handling** — explicitly excluded as a design constraint.
- **Recorder-vs-viewer as distinct roles/locations** — explicitly excluded as a design constraint.
- **Designing around event temporariness/time-boundedness** — explicitly excluded as a design constraint.

## Final Synthesis — 5 Load-Bearing Decisions

1. Per-event grant is the sole atomic unit of access control across every tier.
2. Credentials-per-relationship makes tenant isolation structural rather than policy-enforced.
3. The approval gate exists for fraud/trust protection, not billing — this drives onboarding verification, duplicate-event detection, and the co-Organizer bypass-loophole fix.
4. Family dignity (not generic privacy policy) is the real reason for strict Operator scoping and should frame PRD language.
5. Revocation removes access but never erases attribution — people can never be hard-deleted once they've touched money.
