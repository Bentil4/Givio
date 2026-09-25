# Reconciliation: PRD vs. Brainstorm Source

**PRD:** `_bmad-output/planning-artifacts/prds/prd-givio-2026-09-23/prd.md`
**Source:** `_bmad-output/brainstorming/brainstorm-organizer-multi-tenant-roles-2026-09-22/brainstorm-intent.md` + `.memlog.md`

## Method

Read both source documents in full (intent doc's synthesized decisions, plus the memlog's raw chronological record) against the full PRD. Checked: (1) the 5 Final Synthesis load-bearing decisions as testable FRs, (2) all Question Storming resolutions, (3) the bedrock constraints and excluded non-constraints, (4) the family-dignity framing note.

## Overall Finding

This PRD is a faithful, thorough translation of the brainstorm. All 5 Final Synthesis decisions are present as real testable FRs (not just prose): per-event grant (FR-1), credentials-per-relationship/structural isolation (FR-4/FR-2), fraud-driven approval gate (FR-6–9, FR-12, FR-14, plus explicit "not billing" non-goal), family dignity framing (§4.6, §9 Constraints), and attribution-never-erased (FR-13). All six Question Storming resolutions (audit log visibility, support channel, cross-event reporting cadence, co-organizer bypass, company verification, family-as-organizer) made it in essentially as-is (FR-15, FR-20, FR-21/22, FR-12, FR-8, §5 Non-Goals). Bedrock constraints are stated in §0/§1/FR-1/FR-2; all three excluded non-constraints (offline-first, recorder-vs-viewer, event temporariness) are explicitly listed in §5 Non-Goals and nothing in the FRs quietly designs around them. The dignity framing note is carried through consistently — Vision, §4.6, and §9 all use dignity language rather than reverting to generic "privacy/compliance" phrasing (the one "privacy" reference, in FR-18's consequence, points to an unrelated existing v1 donor-phone field exclusion, not the family-dignity framing, so it isn't a reversion).

## Gaps Found

### 1. Consolidated cross-event total: benchmark silently swapped

- **Source:** `brainstorm-intent.md` Admin Oversight Requirements — "Super Organizer's consolidated cross-event total is near-real-time aggregation (**same consistency bar as the family's live view**)." Also stated in Family Experience Requirements ("Family wants live, accurate donation totals").
- **PRD:** FR-21 (`prd.md` lines 301–306) states the requirement correctly against "the existing Family live view," but its own testable consequence bullet and the §8 Cross-Cutting NFR (line 364) both re-anchor the actual latency bound to **"v1's existing real-time Admin dashboard experience"** instead — a different, unverified reference point never mentioned in the source as the benchmark for this feature.
- **Why it matters:** This is an internal inconsistency (the requirement and its own consequence don't test the same thing) and a quiet substitution of the source's explicit anchor. If the Admin dashboard's latency differs from the family live view's, FR-21 as written would ship something that doesn't actually meet the brainstorm's stated bar, and nothing flags this substitution as a decision — it reads as authoritative rather than as the assumption it is.

### 2. Bedrock fact "a person could work across more than one event company" — only operationalized for Operators

- **Source:** `brainstorm-intent.md` Foundational Constraints #5 (confirmed load-bearing, not excluded): "A person could work across more than one event company over time." The Core Access Model's "Credentials-per-relationship" elaboration is Operator-specific in the source too, so this is a soft gap, but the bedrock fact itself is stated generically.
- **PRD:** FR-4 and the Glossary's "Credentials-per-Relationship" entry (line 95) explicitly scope this guarantee to Operators only ("An Operator's login is scoped to..."). FR-5 ("One human, one Organizer account") only prevents two *different* people sharing one Organizer account at the same company — it says nothing about one person holding Organizer/co-Organizer relationships at two *different* tenants.
- **Why it matters:** If the same person is, e.g., an Organizer at Company A and also brought on as a co-Organizer at Company B, the PRD has no explicit FR guaranteeing those are separate, non-interfering identities the way it does for Operators. Likely intended to work the same way, but it's not stated as a testable requirement, so it isn't verifiable against the bedrock fact as written.

No other gaps found — everything else checked (bedrock constraints, excluded non-constraints, the 5 synthesis decisions, and all 6 question-storming resolutions) is represented faithfully.
