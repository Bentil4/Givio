# Tech Verification Review — ARCHITECTURE-SPINE.md

**Target:** `_bmad-output/planning-artifacts/architecture/architecture-givio-2026-07-25/ARCHITECTURE-SPINE.md`
**Method:** live npm registry queries (`registry.npmjs.org`) + WebSearch/WebFetch against Appwrite's official docs, as of 2026-07-26.
**Verdict: PASS WITH CONCERNS**

All five specific claims in the spine check out against current, live sources. One item (Appwrite web SDK pin) is technically accurate but under-qualified — the spine calls it "already pinned" without noting it's now three major versions behind npm's `latest` tag, and no public SDK↔server compatibility matrix was found to confirm `^23.0.0` is still safe against whatever Appwrite Cloud/self-hosted version the team is running.

---

## 1. Versions — Angular 21, Appwrite ^23.0.0, Dexie ^4.3.0, Angular Material ^21.2.3

Confirmed against `package.json` in the repo (these are already-installed pins, not new proposals) and cross-checked against `registry.npmjs.org`:

| Package | Pinned | Real version? | Published | npm `latest` today | Gap |
| --- | --- | --- | --- | --- | --- |
| `@angular/core` | `^21.0.0` | Yes | Angular 21 GA'd 2025-11-20 | `22.0.6` (v21 still an active LTS line, `21.2.14`) | 1 major behind |
| `@angular/material` | `^21.2.3` | Yes | 2026-03-18 | `22.0.6` | 1 major behind, matches paired Angular 21 |
| `appwrite` (web SDK) | `^23.0.0` | Yes | 2026-03-03 | `26.2.0` (2026-07-13) | **3 majors behind** |
| `dexie` | `^4.3.0` | Yes | 2025-12-20 | `4.4.4` (2026-06-16) | 1 minor line behind, same major |

- Angular 21 and Angular Material 21.2.3 are legitimate, currently-supported versions (LTS tag `v21-lts` exists). Not stale, no concern.
- Dexie 4.3.0 → 4.4.4 gap is trivial (same major, no breaking changes documented for 4.x line).
- **Appwrite web SDK is the outlier.** `^23.0.0` is a real, real npm version (published 2026-03-03), but npm has since published 24.0.0 (Mar 26), 25.0.0 (Apr 28), and 26.0.0 (Jun 8) — three majors in four months, suggesting Appwrite ships web-SDK majors roughly monthly, likely tracking their own server/API releases. I found no public SDK-to-server compatibility matrix (checked `appwrite.io/docs/sdks`, which itself currently references "23.0.0" as its documented Web SDK version — possibly meaning Appwrite's own docs site lags its npm publishes, or that 23.x remains their documented stable baseline). Either way: **the spine asserts this version is fine without having verified it against the actual target Appwrite Cloud/self-hosted server version**, and Appwrite SDK majors are known to carry breaking API changes across versions. This should be confirmed against the project's actual Appwrite instance version before the data layer is built.
- Since Angular/Material/Dexie/Appwrite pins were flagged "(already pinned)" in the spine (i.e., descriptive of current `package.json`, not a fresh recommendation), the verification bar is lower than for jsPDF/SheetJS below — but the Appwrite gap is large enough to flag as a genuine currency risk, not just descriptive color.

## 2. Appwrite Labels — server/Console-only, `Role.label()`

**Confirmed accurate**, via `appwrite.io/docs/advanced/platform/permissions` and Appwrite community threads:

- Labels can only be **created and modified** via the Appwrite Console or a **Server SDK** — there is no client-SDK endpoint for setting labels (confirmed: "you can't update using client SDK for security reasons... There's no endpoint client side because it's within the user resource").
- Labels **can be read** client-side via `account.get()` (the account response includes a `labels: string[]` field), which is exactly what AD-1 relies on (`AuthStore` reads `account.labels`).
- `Role.label([LABEL_ID])` is a real, current permission-role helper, documented verbatim on Appwrite's permissions page: "Grants access to all accounts with a specific label ID."
- This directly validates the spine's threat model in AD-1: the current `login.ts` pattern using `account.prefs.role` is genuinely client-writable (via `account.updatePrefs`), so moving to Labels does close a real self-escalation hole.

## 3. Appwrite Teams — `Role.team(teamId)`, `Role.team(teamId, [role])`

**Confirmed accurate**, same permissions doc page:

- `Role.team([TEAM_ID])` — "Grants access to any member of the specific team."
- `Role.team([TEAM_ID], [ROLE])` — "Grants access to any member who possesses a specific role in a team."
- Team membership roles are arbitrary developer-defined strings (e.g., the spine's `viewer`), consistent with Appwrite Teams' custom-roles-per-membership model.
- Both primitives are real and current as documented on Appwrite's live permissions reference.

## 4. jsPDF 4.2.1

**Confirmed accurate and current, better than the spine implies.**

- `registry.npmjs.org/jspdf` dist-tag `latest` = `4.2.1`, published 2026-03-17 — matches the spine exactly.
- No `peerDependencies` and no `deprecated` flag on the package — plain `npm install jspdf` has no gotchas.
- Better still: 4.2.1 is specifically a **security-patch release** (fixes an HTML-injection-in-output-methods vulnerability and a PDF-object-injection-via-free-text-annotation-color vulnerability per Snyk/release notes), so pinning to it isn't just "current," it's the version you'd want anyway.
- Note for implementers (not a spine error, just a heads-up): jsPDF 4.0.0 introduced a breaking change restricting filesystem access by default (Node-only concern, irrelevant to this browser/PWA context).

## 5. SheetJS `xlsx` — npm stale/vulnerable, use `cdn.sheetjs.com`

**Confirmed accurate.**

- `registry.npmjs.org/xlsx` dist-tag `latest` = `0.18.5`, published **2022-03-24** — over four years stale, confirming the npm registry package is abandoned.
- SheetJS publicly confirmed (via their own issue tracker, git.sheetjs.com/sheetjs/sheetjs#2667) that they stopped publishing to the npm registry, citing npm's two-factor-auth requirements for high-download packages and a dispute with npm/GitHub; current releases (0.20.x+) are only distributed via `cdn.sheetjs.com` tarballs.
- The npm-registry version (0.18.5) is within the range affected by **CVE-2024-22363** (prototype pollution), so "stale/vulnerable" is not just outdated language — the frozen npm package is a real, unpatched CVE.
- The spine's guidance (do not `npm install xlsx`; vendor the tarball from `cdn.sheetjs.com` per SheetJS's own current install docs) matches SheetJS's own documented recommendation.

---

## Findings Summary

| # | Severity | Finding |
| --- | --- | --- |
| 1 | Medium | Appwrite web SDK pin (`^23.0.0`) is a real version but is 3 majors behind npm's current `latest` (`26.2.0`); no public SDK↔server compatibility matrix was found, and the spine doesn't note or reconcile this gap against the team's actual Appwrite Cloud/self-hosted server version. |
| 2 | Low | Angular 21 / Angular Material 21.2.3 are one major behind the now-current Angular 22 line; not stale (still on an active LTS tag), but worth a one-line acknowledgment if the team wants to time an upgrade. |
| 3 | Info | jsPDF 4.2.1 claim not only checks out but is actually a security-fix release — stronger justification than the spine states. |
| 4 | Info | SheetJS/xlsx claim fully verified: npm's `xlsx@0.18.5` (2022) sits inside the CVE-2024-22363 vulnerable range; SheetJS's own move to `cdn.sheetjs.com` is independently confirmed. |
| 5 | None | Appwrite Labels and Teams permission primitives (`Role.label()`, `Role.team(teamId)`, `Role.team(teamId, [role])`) and the server/Console-only nature of Labels are all confirmed verbatim against Appwrite's live documentation. |

## Sources Consulted

- https://registry.npmjs.org/jspdf (registry JSON, dist-tags/time/engines/peerDependencies)
- https://registry.npmjs.org/appwrite (registry JSON, version history incl. 23.0.0 → 26.2.0)
- https://registry.npmjs.org/dexie (registry JSON)
- https://registry.npmjs.org/@angular/material, https://registry.npmjs.org/@angular/core (registry JSON)
- https://registry.npmjs.org/xlsx (registry JSON)
- https://appwrite.io/docs/advanced/platform/permissions (Role.label, Role.team syntax)
- https://appwrite.io/docs/advanced/security/roles
- https://appwrite.io/docs/sdks
- https://appwrite.io/blog/post/manage-user-permissions-with-labels-and-teams
- https://appwrite.io/threads/1202973760643145738 ("Update authenticated users labels using client or server sdk?")
- https://appwrite.io/threads/1179654083100037201 ("Labels vs. Teams")
- https://github.com/orgs/appwrite/discussions/5162 ("Role permissions for teams")
- https://git.sheetjs.com/sheetjs/sheetjs/issues/2667 ("Why the move away from npm registry?")
- https://www.bleepingcomputer.com/news/software/npm-package-with-14m-weekly-downloads-ditches-npmjscom-for-own-cdn/
- https://advisories.gitlab.com/pkg/npm/xlsx/CVE-2024-22363/
- https://security.snyk.io/package/npm/jspdf/4.2.1
