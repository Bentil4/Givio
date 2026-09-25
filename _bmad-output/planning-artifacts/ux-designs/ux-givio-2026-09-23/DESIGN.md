---
name: Givio DMS
status: final
updated: 2026-09-23
description: Ledger-first donation-tracking tool for funeral/wedding event companies. This DESIGN.md ratifies the existing production token system (src/styles.scss, DMS refactor PR #43/#44) as its system of record — no prior formal spec existed — and adds the delta this multi-tenancy capability needs (tenant/role badges, an approval-queue treatment, a pending/dignity banner, a multi-step signup shell, a tenant-switcher control).
colors:
  # Semantic layer, as implemented today. Primitives (--color-neutral-*, --color-brand-*, etc.)
  # are internal and never consumed directly by component CSS — only these are.
  bg-canvas: '#F7F8FA'
  bg-surface: '#FFFFFF'
  bg-surface-raised: '#FFFFFF'
  border-default: '#C9CED6'
  border-focus: '#1F5FBF'
  text-primary: '#12151A'
  text-secondary: '#5B636D'
  text-tertiary: '#677080'
  text-disabled: '#C9CED6'
  text-on-brand: '#FFFFFF'
  action-primary-bg: '#1F5FBF'
  action-primary-bg-hover: '#164A99'
  action-destructive-bg: '#C2352E'
  status-verified-bg: '#E4F5EC'
  status-verified-fg: '#12603A'
  status-pending-bg: '#FBF0DA'
  status-pending-fg: '#8C5C09'
  status-flagged-bg: '#FBE7E6'
  status-flagged-fg: '#8F2A25'
  status-reversed-bg: '#EEF0F3'
  status-reversed-fg: '#3C4450'
  status-info-bg: '#E7F0FC'
  status-info-fg: '#1D57A6'
  # Dark-mode equivalents exist for every token above (driven by prefers-color-scheme /
  # an explicit data-theme toggle) — see src/styles.scss's @mixin dark-theme-tokens for values;
  # not re-listed here since each keeps its light-mode ROLE, not an inversion.
typography:
  body:
    fontFamily: 'Inter, IBM Plex Sans, system-ui, sans-serif'
    fontSize: 14.4px
    fontWeight: '400'
  body-emphasis:
    fontFamily: 'Inter, IBM Plex Sans, system-ui, sans-serif'
    fontSize: 15.2px
    fontWeight: '600'
  page-title:
    fontFamily: 'Inter, IBM Plex Sans, system-ui, sans-serif'
    fontSize: 22.4px
    fontWeight: '700'
  headline:
    fontFamily: 'Inter, IBM Plex Sans, system-ui, sans-serif'
    fontSize: 38.4px
    fontWeight: '800'
  numeric:
    fontFamily: 'Inter, IBM Plex Sans, system-ui, sans-serif'
    note: 'Same family as body — font-variant-numeric: tabular-nums forced on for any aligned digits (money, receipt numbers, codes). No separate mono face; a second typeface was rejected for the same reason a ledger never mixes fonts mid-column.'
rounded:
  sm: 4px
  md: 8px
  lg: 14px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  '2xl': 64px
components:
  tier-badge:
    # NEW for this capability.
    shape: '{rounded.full}'
    border: '1px solid {colors.border-default}'
    background: '{colors.bg-surface}'
    foreground: '{colors.text-secondary}'
  tenant-status-pill:
    # NEW — reuses the EXISTING 4-state status vocabulary, not a new color system.
    pending: { background: '{colors.status-pending-bg}', foreground: '{colors.status-pending-fg}' }
    approved: { background: '{colors.status-verified-bg}', foreground: '{colors.status-verified-fg}' }
    rejected: { background: '{colors.status-flagged-bg}', foreground: '{colors.status-flagged-fg}' }
    suspended: { background: '{colors.status-reversed-bg}', foreground: '{colors.status-reversed-fg}' }
  dignity-banner:
    # NEW. Patterned after the existing ConnectionBanner (feature/components/connection-banner),
    # not a shared/ primitive today — promote to shared/ if a second consumer appears.
    background: '{colors.status-info-bg}'
    foreground: '{colors.status-info-fg}'
    radius: '{rounded.md}'
  tenant-switcher:
    # NEW. The mandatory "which tenant/event am I in" control (FR-3).
    background: '{colors.bg-surface}'
    border: '1px solid {colors.border-focus}'
    radius: '{rounded.md}'
    active-indicator: '{colors.action-primary-bg}'
---

## Brand & Style

Givio is a ledger, not a marketing surface — a tool an Operator reaches for mid-conversation with a grieving family, or an Organizer checks between two funerals happening the same weekend. The existing DMS system already commits to this posture: flat fills (no gradients, removed platform-wide in PR #44), reserved glass/material treatment for floating chrome only (never on figures), and a single humanist sans (Inter) carrying every weight from headline to receipt number. This capability inherits that posture wholesale — it adds no new visual register, because the moments it serves (an Organizer vetting a co-Organizer, a family checking a total from a borrowed phone) are exactly as high-stakes and unglamorous as the ledger itself.

## Colors

Every color below already exists in production (`src/styles.scss`) and is ratified here as this capability's palette too — nothing new is introduced except where a genuinely new *meaning* needed a home.

- **Brand blue** (`{colors.action-primary-bg}` / hover `{colors.action-primary-bg-hover}`) — the one accent, spent on primary actions (Approve, Add Operator, Invalidate Code) and the active-tenant indicator in the switcher. Never decorative.
- **The four status colors** (`verified`/green, `pending`/amber, `flagged`/red, `reversed`/grey) plus `info`/blue are the *only* five status colors anywhere in the app, per the existing system's own rule ("resist adding more") — this capability does not add a sixth. Every new status concept maps onto these: Tenant approval state, duplicate-event flags, IdentityFlags matches, and Admin/Super Admin account status all reuse this exact vocabulary rather than inventing tier-specific colors.
- **Neutral text/border scale** unchanged — three text tiers (primary/secondary/tertiary), one border color, one focus color.

Avoid: a dedicated color per role tier (Super Admin, Admin, Super Organizer, etc. are distinguished by badge shape/label/icon, never by giving each its own hue — see Components); any new status color beyond the existing five.

## Typography

One typeface, Inter (IBM Plex Sans / system-ui fallback), every role. No new type role is introduced. The existing three-tier body hierarchy (`t-page-title` / `t-card-title` / `t-body` / `t-caption` / `t-secondary` / `t-tertiary`, per `styles.scss`) covers every new screen. Numeric alignment (`tabular-nums`) applies to every new place digits stack in a column: the consolidated cross-event total, the settlement export preview, receipt/access-code strings.

## Layout & Spacing

Unchanged 4/8/16/24/40/64 scale. New screens follow the existing `.page` (2rem top padding, `--space-lg` sides, `--space-2xl` bottom) and `.page-head` conventions exactly — a new screen that doesn't use these is the deviation, not the rule.

## Elevation & Depth

Unchanged three-tier system (`--elevation-1/2/3`) and the existing glass/solid split: floating chrome (nav rail, the tenant-switcher when it's an overlay, dialogs) may use the material/glass tiers; anything showing a number, a status, or a name — the approval queue, the consolidated total, any table row — stays solid, per the existing rule that ledger content never sits on glass.

## Shapes

Unchanged: 4/8/14px + full. The tenant/role badges use `{rounded.full}` (pill), matching the existing `tag`/`badge` shape language exactly — a new pill shape was not invented for this capability.

## Components

New component deltas only — everything else (`Button`, `Input`, `Select`, `Checkbox`, `Radio`, `Toggle`, `Card`, `Tag`, `FilterTags`, `Progress`, `Preloader`, `Breadcrumb`, `ImageUpload`) is used exactly as it exists in `shared/components/` today, unchanged.

- **Tier badge** — outlined pill, neutral (never status-colored), label + a small tier-specific icon (crown for Super Admin, shield for Admin, building for Super Organizer/Organizer, id-card for Operator). Identity, not status — status colors are reserved for the four-state vocabulary above.
- **Tenant-status pill** — the existing `Tag` component, re-skinned per `{components.tenant-status-pill}`: pending/approved/rejected/suspended map onto the existing pending/verified/flagged/reversed tokens one-for-one. No new visual language. Every instance carries a text label, never color alone (see Do's and Don'ts).
- **Dignity banner** — a new banner, structurally patterned after the existing `ConnectionBanner` (same fixed-position, dismissible, icon + message + optional action shape), styled with `{colors.status-info-bg}`/`{colors.status-info-fg}`. Used for the family personal-device prompt and the "this view is read-only, your Organizer's account was suspended but your data is safe" message — worded per `DESIGN.md`'s dignity framing (see Do's and Don'ts), never alarming (never uses the flagged/red status color).
- **Approval-queue row** — a `Card`-based row (not a dense table — these are infrequent, high-consequence review decisions, not a ledger scan): applicant/company name, tier badge, tenant-status pill, submitted-date, Approve/Reject actions. Expands inline to show the intake fields and document link rather than navigating away.
- **Tenant-switcher** — a `Select`-shaped control, always visible (never a hidden menu) for any Operator or Organizer with more than one active Event context, styled per `{components.tenant-switcher}` — brand-blue border and active-indicator dot distinguish it from an ordinary form `Select` at a glance, since a wrong pick here is a wrong-Event write, not a typo.
- **Step wizard (signup)** — new shell for Organizer self-signup's multi-field intake (company info → document upload → phone-verification pending state). Numbered steps (1/2/3), each step a `Card`, `Progress` component reused for the step indicator.
- All three new components above (tier badge, tenant-status pill, tenant-switcher) reuse existing, already AA-verified token pairings unmodified — no new color combination was introduced, so no new contrast check was needed for this delta.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Reuse the existing four status colors for every new status concept (Tenant approval, duplicate flags, Admin suspension) | Invent a fifth status color or a per-tier color |
| Distinguish role tiers by badge label/icon | Color-code role tiers the way status is color-coded — a reader would conflate "this Admin is red" with "this Admin is flagged" |
| Keep the dignity banner calm — info-blue, never red/amber | Use the flagged (red) or pending (amber) status color for anything family-facing, even when the underlying event (a suspension) sounds alarming |
| Solid surfaces for anything with a number or a name on it | Glass/material treatment on the approval queue, the consolidated total, or any table |
| One accent (brand blue) for primary actions | A second accent color for "important" secondary actions — use `btn-secondary`'s existing outline treatment instead |
