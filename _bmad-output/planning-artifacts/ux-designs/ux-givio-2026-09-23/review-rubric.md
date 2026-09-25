# Spine Pair Review — Givio DMS Organizer Multi-Tenancy & Role Hierarchy

## Overall verdict

The spine pair is largely a clean, coherent, downstream-ready contract: DESIGN.md's token-ratification claim verifies exactly against `src/styles.scss`, every `{path.token}` reference resolves, and shape/order discipline is followed precisely in both files. Four of the five reconciliation-pass fixes (FR-13 attribution, FR-16 code-reissue, FR-11 boundary state, FR-19 audit surface) landed coherently and are load-bearing, not cosmetic. One fix did not land coherently: the claimed "Flow 2 edge case added" for the UJ-3 bypass actually covers FR-23 (Operator/Ama-Kwesi), not FR-12/UJ-3 (co-Organizer/Kojo-Yaw) — Kojo and Yaw appear nowhere in EXPERIENCE.md, and UJ-3's specific mechanic (flagged-for-review-not-auto-blocked, false-positive resolution, FR-24 feed) has no home. A handful of new surfaces (Tenant audit log, Reports, Contact Admin) also lack State Pattern rows.

## 1. Flow coverage (EXPERIENCE.md) — thin

Checked: sources frontmatter → PRD UJ-1 through UJ-7 extracted; each verified for a Key Flow with named protagonist, numbered steps, climax, and failure path.

### Findings
- **high** UJ-3 (Kojo rejected at signup, routes around vetting via co-Organizer Yaw, FR-12/FR-24) has no Key Flow, and the reconciliation pass's claimed fix does not actually cover it. Flow 2's added "Edge case (FR-23)" (EXPERIENCE.md line 125) is about Ama adding a third *Operator* hire (FR-23), a different FR and different UJ than UJ-3's co-Organizer-addition scenario (FR-12). The only UJ-3 representation anywhere is the generic "Add co-Organizer / Add Operator" Component Pattern row (line 71), which has no named protagonist, no numbered steps, no climax/resolution beat, and drops both of UJ-3's PRD-stated edge cases (false positive → Admin review, not auto-block, is the final word; FR-24 for-cause revocations feed the same list). *Fix:* add a 6th Key Flow (Kojo/Yaw) as `reconcile-prd.md` itself recommended, or extend the Component Patterns row with the pending/held state, the false-positive-cleared resolution, and the FR-24 case explicitly.
- **medium** Row 71's phrasing ("the adding Organizer sees the same generic... message") reads as an immediate, final rejection. PRD FR-12's consequence is "flagged for Admin review before taking effect" — i.e., held/pending, not an immediate terminal failure — and UJ-3's own edge case says a false positive is cleared by Admin review, not auto-blocked. No UI state anywhere shows what the adder sees if/when Admin clears a flagged addition. *Fix:* state explicitly whether the addition shows as pending vs. failed, and what (if anything) changes for the adder once Admin resolves it.
- **low** UJ-6 (Kwame's cross-event "stale number" → Contact Admin) has no dedicated Key Flow; folded into a one-line IA row (`/organizer/support`) with no persona name or the PRD's specific "stale number" beat. `reconcile-prd.md` already judged this thin-but-acceptable — flagged here only because Pass 1 is mechanical and literal.
- **low** Flow 3 (Comfort) and Flow 5 (Nana) have no stated failure path (e.g., wrong access code re-entry; suspension action itself failing) — lower risk since both reuse existing, already-hardened mechanisms.

## 2. Token completeness (DESIGN.md) — strong

Checked: every frontmatter token (colors, typography, rounded, spacing, components) and every `{path.token}` reference in prose.

### Findings
- **low** No `{path.token}` reference in prose or `components` is broken; every reference resolves. `text-on-brand`, `text-disabled`, and `bg-surface-raised` are defined but never referenced — defensible given DESIGN.md explicitly ratifies the *entire* existing production palette (not just tokens this delta touches), not a miss.
- **low** DESIGN.md doesn't explicitly state AA contrast verification for the new component color pairings (tier-badge, tenant-status-pill, tenant-switcher) — it relies on each atomic token already being pre-verified, but that assertion lives only in EXPERIENCE.md's Accessibility Floor ("existing tokens are already AA-verified"), not in DESIGN.md itself where the rubric expects it for load-bearing combinations.

## 3. Component coverage (both spines) — adequate

Checked: every component name in DESIGN.md.Components and EXPERIENCE.md.Component Patterns cross-referenced.

### Findings
- **low** "Add co-Organizer / Add Operator," "Revoke," and "Family access code" (EXPERIENCE.md lines 71–73) have no corresponding DESIGN.md.Components row. Defensible — they compose from already-covered primitives (Button, existing regenerate-code mechanism) rather than introducing new visual components — but this isn't stated, leaving the omission to downstream inference.

## 4. State coverage (EXPERIENCE.md) — thin

Checked: every IA surface walked against expected states (empty, cold-load, error, permission-denied, offline).

### Findings
- **medium** Tenant audit log (`/organizer/audit`) — new surface, no State Pattern row (e.g., empty-log state).
- **medium** Reports (`/organizer/reports`) — new surface, no State Pattern row (empty/no-data-yet for a first-period export).
- **low** Contact Admin (`/organizer/support`) — new surface, no submission-confirmation or error state.
- **low** Organizer dashboard's consolidated cross-event total (FR-21) has no loading/error state for the aggregation itself, despite being new cross-event computation, not a simple existing-pattern reuse.

## 5. Visual reference coverage — strong

No `mockups/`, `wireframes/`, or `imports/` exist in this workspace. EXPERIENCE.md's "Mock coverage" section discloses this honestly and names the two highest-risk surfaces (approval-queue expand/collapse, tenant-switcher) that would benefit from a follow-up visual pass. No orphans possible.

## 6. Bloat & overspecification — strong

DESIGN.md and EXPERIENCE.md prose stay decision-tied throughout; Do/Don't tables are used instead of restating rationale in prose; no persona/FR restatement beyond what's needed for traceability. Flow titles lean slightly narrative ("an empty, unmistakably-his dashboard") but each ties directly to a stated guarantee (tenant isolation), not decoration.

## 7. Inheritance discipline — thin

### Findings
- **high** UJ-3's named protagonists (Kojo, Yaw) appear nowhere in EXPERIENCE.md — the one UJ whose persona names are dropped entirely. Every other UJ (Kwame, Ama+Kwesi, Comfort, Nana) is carried through verbatim into its own Key Flow. Same root cause as Finding 1.1 above.
- Sources frontmatter resolves cleanly: `prd.md`, `ARCHITECTURE-SPINE.md`, `SPEC.md`, and `.claude/skills/plan/*.md` all exist at the cited paths.
- Component names are consistent across DESIGN.md and EXPERIENCE.md (Tier badge, Tenant-status pill, Dignity banner, Approval-queue row, Tenant-switcher, Step wizard).

## 8. Shape fit — strong

DESIGN.md sections appear in canonical order (Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts). EXPERIENCE.md carries all required defaults (Foundation, IA, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor, Key Flows). No dedicated "Responsive & Platform" section, but defensible — this delta reuses the existing, unchanged mobile-nav breakpoint rather than introducing new responsive behavior (stated inline in IA instead). "Inspiration & Anti-patterns" is correctly omitted — no reference products or rejected alternatives appear anywhere in sources or `.memlog.md`.

## Mechanical notes

- `reconcile-prd.md`'s claim that "Flow 2 edge case added" resolves the UJ-3 gap is inaccurate — that edge case resolves FR-23, a distinct FR/UJ pair from FR-12/UJ-3. The `.memlog.md`'s "All 5 fixed directly" summary should be corrected to 4/5, with UJ-3 reopened.
- No broken cross-references or Mermaid syntax found in either file.
- Frontmatter is complete and well-formed in both files.
