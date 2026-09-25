---
name: Adversarial Accessibility Review — Givio Multi-Tenancy Experience Spine
reviewed: EXPERIENCE.md, DESIGN.md (ux-givio-2026-09-23)
date: 2026-09-23
reviewer-role: Adversarial accessibility reviewer (Reviewer Gate, Finalize step)
---

# Accessibility Review — Findings

## Finding 1: Personal-device prompt — no focus-management rule, only an announcement

**Severity:** High

**Location:** EXPERIENCE.md, State Patterns table, "Family, personal-device = no" row (line 84); Accessibility Floor, bullet 2 (line 100): *"The non-dismissible family device-prompt is still keyboard-operable and announces via `aria-live` when it blocks first paint — a screen-reader user isn't left wondering why the total hasn't spoken yet."*

**Failure scenario:** `aria-live` announces content when it's injected into a live region, but it does not move focus. A screen-reader user landing on `/family/:code` after code entry will have focus wherever the previous action left it (often back on the code-entry field or the page body) — not on the prompt or its Yes/No controls. The spec asserts the user "isn't left wondering why the total hasn't spoken yet," but an announcement without a focus move means they hear the prompt once, then have to manually hunt for it (how many tabs? is it the first focusable element on the page?) before they can answer it and unblock the total. For a low-vision or motor-impaired user on a borrowed device, "keyboard-operable" is asserted but the actual tab order relative to page furniture (skip link, header, nav) is never stated. Nothing says the prompt behaves as a modal (focus trapped inside it until answered) versus an inline block a user could tab past without realizing it's what's gating the content.

**Suggested fix:** Add a concrete behavioral rule: on render, focus moves programmatically to the prompt's first interactive control (or the prompt is announced via `role="alertdialog"`/`aria-live="assertive"` *and* receives focus, not one or the other). State whether it traps focus (true modal) until answered, since it functions as a hard gate on page content. This is a sentence or two, not a redesign, but as written a screen-reader user's actual path to hearing and answering the prompt is unspecified.

---

## Finding 2: Tenant-switcher block — no specified failure-state explanation for keyboard/screen-reader Operators

**Severity:** Medium-High

**Location:** EXPERIENCE.md, Interaction Primitives, bullet 1 (line 91): *"Tenant-switcher is a required interaction, not a convenience — an Operator on 2+ Events cannot record a donation until they've made an explicit pick."* Cross-referenced with Component Patterns' Tenant-switcher row (line 69) and Accessibility Floor's native-`<select>` bullet (line 102).

**Failure scenario:** The spine specifies the switcher itself is accessible (native select semantics) and always visible. It does not specify what a keyboard/screen-reader Operator encounters at the *other* end of this gate — the "Record Donation" action while no Event is picked. If that's a disabled button with no accessible explanation (just `disabled`/`aria-disabled` and nothing else), a screen-reader user hears "Record Donation, button, dimmed" with no stated reason, and has to independently discover that an unrelated control elsewhere on the page (the switcher) is what's blocking them — effectively an accessibility trap, even though each control individually is technically operable. The doc already sets a precedent for this kind of explicit non-rendering/explaining decision elsewhere (e.g. "Add Organizer... not a disabled button, not present in the DOM at all, so there's nothing to explain") but never applies an equivalent rule here.

**Suggested fix:** Add one sentence specifying how the gated state is communicated — e.g. "Record Donation is disabled with `aria-describedby` pointing to a visible, programmatically-associated message ('Pick an Event above to continue')" — so the dependency is discoverable without sighted trial-and-error.

---

## Finding 3: Approval-queue row — collapse-side focus destination unspecified

**Severity:** Medium

**Location:** EXPERIENCE.md, Accessibility Floor, bullet 5 (line 103): *"Approval-queue row expansion uses `aria-expanded` on the row trigger and moves focus into the expanded content, matching the existing pattern..."*

**Failure scenario:** Focus-on-expand is specified; focus-on-collapse is not. If a keyboard user expands a row, reviews the intake fields/document link, then collapses it (or it's collapsed programmatically after Approve/Reject), the rule as written is silent on where focus goes. If focus is simply lost or left on a now-removed/hidden element, the next Tab press could jump the user somewhere unexpected (top of page, browser chrome, or nowhere), which is disorienting on an unfamiliar review queue. (The keyboard path to Approve/Reject itself is fine — those are stated elsewhere as always-visible row-level buttons, not hover-reveal, so no gap there.)

**Suggested fix:** Add: "On collapse, focus returns to the row's trigger" — the standard disclosure-pattern rule — mirroring the existing sidebar-drawer precedent this bullet already cites.

---

## Finding 4: Tenant-status pill — text label not explicitly guaranteed, unlike tier badges

**Severity:** Medium-High

**Location:** EXPERIENCE.md, Accessibility Floor, bullet 3 (line 101): *"Tier badges carry the tier name in accessible text, never icon-only... per `DESIGN.md.Components`."* Compare Component Patterns' Tenant-status pill row (line 66) and DESIGN.md's `tenant-status-pill` component (lines 72-77, 127), which specify only background/foreground color pairs per state (pending/approved/rejected/suspended) with no stated text-label requirement.

**Failure scenario:** The "icon + label always, never icon-only" rule in the Accessibility Floor is written specifically about **tier badges**. Nothing in EXPERIENCE.md or DESIGN.md makes the equivalent guarantee for the **tenant-status pill** — the component whose entire job is to distinguish pending/approved/rejected/suspended. DESIGN.md's component spec for it is purely a color mapping (`status-pending-bg/fg`, `status-verified-bg/fg`, etc.); it says the existing `Tag` component is reused but never states that `Tag` always renders a text word, not just a colored chip. If an implementer follows the letter of what's written, they could ship a colored dot/chip relying on hue alone to distinguish "pending" (amber) from "rejected" (red) from "suspended" (grey) — a real WCAG 1.4.1 (Use of Color) failure for colorblind reviewers/Operators, even at AA contrast.

**Suggested fix:** Extend the Accessibility Floor's existing bullet (or add a parallel one) to explicitly cover the status pill: "Tenant-status pills always render the state as a text word (Pending/Approved/Rejected/Suspended), never color alone" — closing the gap rather than assuming it's implied by the badge rule.

---

## Finding 5: Dignity banner — no stated behavior for a dismiss attempt on the non-dismissible variant

**Severity:** Low-Medium

**Location:** EXPERIENCE.md, Component Patterns, Dignity banner row (line 67): *"Dismissible only when dismissing doesn't lose safety-relevant info (the device prompt is NOT dismissible without an answer — it blocks first paint of the total); the suspension-safety banner IS dismissible once read."*

**Failure scenario:** The spec states *which* banner is dismissible but not *how* the non-dismissible one behaves when a user tries anyway — e.g. presses Escape, or (per DESIGN.md's note that the banner is "structurally patterned after the existing `ConnectionBanner`... same fixed-position, dismissible... shape") if the shared base component normally renders a close affordance. It's unclear whether the personal-device variant renders no dismiss control at all (matching this same doc's own precedent of omitting controls entirely rather than disabling them silently — see the "Add Organizer" pattern) or renders one that's present but inert. If it's the latter, a screen-reader user who activates what looks/sounds like a close button and gets no response, with no explanation, is a worse experience than simply not having the control.

**Suggested fix:** Add a clause resolving the ambiguity, consistent with the doc's own established pattern: "The device-prompt variant of the banner renders no dismiss control at all until answered (not a disabled one) — there is nothing to explain because there is nothing to attempt."

---

# Verdict

Not clean. Five real, spec-level (not implementation-level) gaps found — all in the exact areas the brief flagged as highest-risk (the blocking device-prompt, the tenant-switcher gate, queue-row focus, status-pill color reliance, and banner dismiss-attempt behavior). None require a redesign; each is a missing sentence or two of behavioral specification in EXPERIENCE.md. Recommend fixing all five before this spine is treated as build-ready, since the highest-stakes surface (`/family/:code`) is implicated in three of them (1, 4 indirectly via status-pill pattern reuse, 5).
