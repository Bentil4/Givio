---
title: Input Reconciliation — DESIGN.md / EXPERIENCE.md vs. PRD
status: final
created: 2026-09-23
sources:
  - _bmad-output/planning-artifacts/prds/prd-givio-2026-09-23/prd.md
  - _bmad-output/planning-artifacts/ux-designs/ux-givio-2026-09-23/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-givio-2026-09-23/EXPERIENCE.md
  - src/styles.scss (spot-check)
---

# Reconciliation Findings

All three source documents were read in full. Findings below are grouped per the four checks requested.

## 1. FR coverage (FR-1 through FR-26)

Explicit FR-N citations found in EXPERIENCE.md: FR-3, FR-4, FR-5, FR-6a, FR-6b, FR-9, FR-14, FR-15, FR-16, FR-17, FR-18, FR-20, FR-21, FR-22, FR-25, FR-26.

Not explicitly cited, checked individually for *implicit* experiential coverage:

- **FR-1** (per-event grant as sole atomic unit) — no dedicated flow/state, but the mandatory, no-default tenant-switcher (Interaction Primitives, line 86) is its UI expression. Adequate implicit coverage — it's fundamentally a data-layer guarantee.
- **FR-2** (structural tenant isolation) — not cited by number, but Flow 1's climax ("not in a URL, not in an error message, not in any dropdown — does anything hint another company exists") directly operationalizes it. Adequate coverage.
- **FR-7** (required intake fields) — covered by Flow 1 step 2's field list. Adequate.
- **FR-8** (manual verification: doc + phone call) — covered by Flow 1 step 2/3 and the Pending state. Adequate.
- **FR-10** (Super Organizer manages co-Organizers + Operators) — covered by the Team IA row. Adequate.
- **FR-24** (post-approval revocations feed the bypass list) — no distinct representation, but its UX consequence is identical to FR-12/FR-23's (same generic non-disclosure rejection). Acceptable reuse, not a gap.

**Genuine gaps — no experiential home anywhere in EXPERIENCE.md:**

- **FR-11** (Organizer must NOT be able to add another Organizer, rejected server-side not just hidden). The Team IA row says co-Organizer add is "(Super Organizer only)" but no Component/State Pattern describes what a plain Organizer actually sees on `/organizer/team` — button absent vs. disabled vs. a rejected-attempt state. Not represented.
- **FR-13** (revocation preserves attribution — revoked person's name stays on their historical donations, never hard-deleted). Zero mentions of "attribution" anywhere in EXPERIENCE.md (grep confirms). Flow 4 (the flow that realizes UJ-5) covers only the family-view-survives beat (FR-17) and drops UJ-5's own stated Resolution beat about FR-13 entirely — see §2 below.
- **FR-19** (Admin's cross-tenant access is standing, logged, visible to Admin only). Flow 5 gestures at "the platform-wide log" in passing, but no IA row or Component/State Pattern gives Admin an actual surface for it (contrast with the Super Organizer's own dedicated "Tenant audit log" IA row for FR-15). Thin/no coverage.
- **FR-23** (Operator-addition identity check, lighter-weight than FR-12). Flow 2 (Ama adds Kwesi as Operator) shows only the happy path — no mention of the identity check, a flag state, or Admin notification. Not represented.
- **FR-16's third consequence** (Organizer must be able to invalidate/reissue a leaked family code) — grep for "invalidat"/"regenerat" returns nothing in EXPERIENCE.md. The device-prompt/auto-logout half of FR-16 is well covered; the leak-recovery half has no experiential home at all.

## 2. UJ-3 and UJ-6 — verifying the memlog's "folded into other flows" claim

The EXPERIENCE.md memlog asserts UJ-3 (Kojo/Yaw co-Organizer bypass) and UJ-6 (Contact Admin) were folded into other flows rather than dropped. Checked directly:

- **UJ-6 (Contact Admin)** — genuinely folded, acceptably: the IA table has a dedicated `/organizer/support` row citing FR-20 ("Logged support form"). Thin (no flow shows Kwame's specific stale-number beat or the "tied to his tenant account" detail), but a real surface exists and the core mechanic (logged, reachable without a full ticket) is present. **Not dropped.**
- **UJ-3 (Kojo/Yaw bypass)** — the claim does **not** hold up. The only bypass/identity-check content in EXPERIENCE.md is the Step Wizard's non-disclosure rule (Component Patterns, line 69: "a rejected identity check... does NOT reveal why"), which is explicitly scoped to "Organizer self-signup" — i.e., Kwame's original signup (UJ-1), not the co-Organizer-addition path where UJ-3 actually happens. Flow 2 (`/organizer/team`, adding people) never mentions: the cross-reference check running on co-Organizer add, the Admin notification on *every* addition, or what Yaw sees when his attempt to add Kojo is silently blocked pending Admin review. UJ-3's climax and both its edge cases (false-positive review-not-auto-block; for-cause-revocation feeding the same list, FR-24) have **no experiential home** — this is a load-bearing drop, not a fold. Recommend either a 6th Key Flow or an explicit addition to the Team IA row/Component Patterns before story-writing.

## 3. Dignity-framing requirement (PRD §9, §4.6)

Checked against EXPERIENCE.md's Voice and Tone and State Patterns sections:

- **FR-16 non-dismissible device prompt** — correctly and strictly operationalized. Component Patterns (line 66) states the device prompt "is NOT dismissible without an answer — it blocks first paint of the total"; State Patterns (line 79) confirms it "renders before the donation total does." This matches the PRD's device-prompt requirement precisely, including the harder-to-get-right ordering constraint (prompt blocks first paint, not an interrupt after data loads).
- **FR-18 "no partial or hidden totals"** — correctly operationalized. Flow 3 step 3 states "The full, real-time total and donor list render (FR-18: nothing hidden)," and Voice and Tone's family-facing Do/Don't pairs (no "privacy policy" language, no "verify device ownership" corporate-speak) match PRD §9's "dignity, not generic privacy" framing directive closely, with concrete before/after copy.
- **Gap**: FR-16's leak/invalidate-code consequence (see §1) is dignity-relevant too (PRD's own Risk table ties it to the same dignity guarantee) but is entirely absent from Voice and Tone / Component Patterns — no copy, no surface, no flow for an Organizer reissuing a compromised family code.
- No dignity-framing contradictions found — where EXPERIENCE.md does address family-facing moments, it holds the line strictly (dignity banner explicitly barred from red/amber status colors even for a suspension, per DESIGN.md's Do's and Don'ts).

## 4. DESIGN.md token spot-check against src/styles.scss

Checked colors and typography directly against `src/styles.scss` (not just plausibility):

- `bg-canvas: #F7F8FA` → `--color-neutral-50: #f7f8fa` (line 116). **Match.**
- `border-default: #C9CED6` → `--color-neutral-300: #c9ced6` (line 118). **Match.**
- `border-focus` / `action-primary-bg: #1F5FBF` → `--color-brand-500: #1f5fbf` (line 124). **Match.**
- `action-primary-bg-hover: #164A99` → `--color-brand-700: #164a99` (line 125). **Match.**
- `text-primary: #12151A` → `--color-neutral-900: #12151a` (line 123). **Match.**
- `action-destructive-bg: #C2352E` → `--color-red-500: #c2352e` (line 130). **Match.**
- Typography: `body: 14.4px/400` → `.t-body { font-size: 0.9rem; font-weight: 400 }` = 14.4px at 16px root (line 651-654). **Match.** `body-emphasis: 15.2px/600` → `.t-body-em { font-size: 0.95rem; font-weight: 600 }` = 15.2px (line 645-649), name differs slightly (`t-body-em` vs. DESIGN.md's `body-emphasis`) but value matches exactly. `page-title: 22.4px/700` → `.t-page-title { font-size: 1.4rem; font-weight: 700 }` = 22.4px (line 633-637). **Match.** `headline: 38.4px/800` → `.t-headline { font-size: 2.4rem; font-weight: 800 }` = 38.4px (line 626-631). **Match.**

DESIGN.md's "ratify the existing production token system" claim is **verified, not just plausible** — every spot-checked color and typography value resolves exactly to production `styles.scss`, including derived rem→px math.

## Summary of actionable gaps

1. UJ-3's Kojo/Yaw bypass edge case has no real experiential home — the memlog's "folded in" claim is false; Flow 2/Team IA needs the identity-check/Admin-notification behavior added.
2. FR-13 (attribution retention) is completely unrepresented — Flow 4 (UJ-5) drops its own Resolution beat.
3. FR-16's code-invalidation/leak-recovery consequence has no surface, copy, or flow anywhere.
4. FR-23 (Operator-addition identity check) is absent from Flow 2's happy-path-only depiction.
5. FR-11 and FR-19 have thin-to-no UI representation of their negative/boundary cases (non-Super-Organizer add-attempt; Admin's own audit-log surface).

DESIGN.md's token-ratification claim and the FR-16/FR-18 dignity operationalization both check out cleanly under direct verification.
