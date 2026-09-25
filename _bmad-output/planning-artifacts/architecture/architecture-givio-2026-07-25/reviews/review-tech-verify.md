# Reviewer Gate — Tech Verification (web-research / reality-check lens)

**Target:** ARCHITECTURE-SPINE.md — Stack table, version-pinned claims, and the Appwrite-capability-dependent multi-tenant material (AD-1, AD-2, AD-9, AD-11, AD-12, AD-13).
**Method:** WebSearch (npm registries, Angular/Appwrite release info) + Appwrite official docs (via `appwrite_search_docs`), run 2026-09-23.

## Verdict: CONDITIONAL PASS — one stale figure, one flagging inconsistency, one unverified/ambiguous claim. All checked Appwrite capability claims hold up against current docs.

## Findings

1. **STALE — Appwrite web SDK gap understated.** Spine says `^23.0.0`, "3 majors behind current 26.x." Current npm `appwrite` is now **27.0.0** (published ~16 days before this review). The gap is **4 majors behind**, and the "26.x" reference is itself one major out of date. Update the Stack table row and re-run the "confirm compatibility with the provisioned Appwrite Cloud instance" caveat against 27.x, not 26.x.

2. **VERIFIED — Angular gap is accurate.** `^21.0.0`, "one major behind now-current Angular 22" is correct: Angular 22 (stable, v22.1.0, July 2026) is current as of 2026-09-23. No change needed.

3. **INCONSISTENT FLAGGING — Angular Material.** Spine pins `^21.2.3` with no currency caveat ("already pinned, icons/badge/tooltip only"). Current `@angular/material` is **22.1.5** — Material is one major behind, the same situation as Angular itself, yet only Angular and Appwrite got an explicit "N behind" annotation. Either this was checked and the caveat was dropped inconsistently, or it wasn't checked at all — recommend adding the same "N major(s) behind" note applied to Angular/Appwrite for consistency and to make the drift visible to implementers.

4. **VERIFIED — jsPDF and SheetJS claims hold.** jsPDF `4.2.1 "verified current"` is still the latest npm release (last published ~March 2026, no newer version since). The SheetJS guidance (npm package stale/CVE-2024-22363-vulnerable, install the patched build from `cdn.sheetjs.com` instead) is accurate: SheetJS stopped publishing to npm after 0.18.5 (vulnerable to CVE-2023-30533/CVE-2024-22363); fixed 0.20.2+ ships only via their own CDN.

5. **VERIFIED — core Appwrite capabilities the multi-tenant ADs lean on.**
   - **Labels are server/Console-only** (AD-1): confirmed — `Users.updateLabels` requires a server-side API key; the client Account service has no label-write method. AD-1's reasoning is sound.
   - **`Role.user`/`Role.label` in document permissions** (AD-2): standard, current Appwrite permission primitives, confirmed via docs examples.
   - **Unique email per Account** (AD-1's Teams-rejection argument): confirmed — "each email address must be unique across all users and identities," and account creation with a duplicate email 409s (`user_email_already_exists`). Supports the claim that an email-based Team invite would collapse two tenant relationships into one shared Account.
   - **Storage bucket for verification docs**: bucket + file-level permissions are current, standard Appwrite Storage capability; an Admin/Super-Admin-only bucket via `Role.label('admin')` is straightforward.

6. **UNVERIFIED / AMBIGUOUS — "revocation disables the account" (no AD-14 exists).** The spine tops out at AD-13; there is no AD-14. The nearest claims are AD-1's Membership `status: active|revoked` and AD-11/Consistency-Conventions' "only revoked/suspended (`status` field, AD-1/AD-11)" for accounts that have ever recorded a donation or approval action. Appwrite *does* have a native account-block mechanism (`users.updateStatus`, surfaced client-side as the `user_blocked` error) — confirmed via docs — but the spine never states whether revocation/suspension actually calls that native mechanism or relies solely on the custom `status` field being checked by app logic (which would not stop the person from holding an authenticated session if a check is missed). This should be resolved and cited explicitly rather than left implicit — it's the one place the spine's design intent and Appwrite's actual primitive aren't tied together on paper.

## Recommendation
Fix finding 1 (Appwrite SDK version/gap) before sign-off — it's a factual regression risk for the epic that provisions the SDK. Findings 3 and 6 are lower severity but should be closed (add the missing "N behind" note; and either cite `users.updateStatus` explicitly in AD-11/AD-1 or confirm the design intentionally avoids it and say so) so a future reader doesn't have to re-derive what was actually checked.
