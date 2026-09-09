# DejaVu Sans (vendored)

Vendored for Story 3.6's PDF receipt generation. jsPDF's built-in standard fonts (Helvetica,
Times, Courier) use WinAnsiEncoding, which does not include the Ghana Cedi sign (₵, U+20B5) —
jsPDF doesn't reject the character, it silently mis-renders it (₵ printed as "µ", the low byte
of its code point). DejaVu Sans is a static (non-variable) TTF with broad Unicode coverage,
including the full Currency Symbols block (U+20A0–U+20B5), confirmed via `fc-query`'s charset
output before vendoring. Embedded as a base64 string (`dejavu-sans.font.ts`) rather than fetched
at runtime, so receipt generation stays fully offline-capable from the very first load — no
network dependency, no PWA precache required.

- Source: `https://sourceforge.net/projects/dejavu/files/dejavu/2.37/dejavu-fonts-ttf-2.37.zip`
- Version: 2.37
- Vendored: 2026-09-09
- File used: `ttf/DejaVuSans.ttf` (regular weight only — the one row that needs it, the receipt's
  Amount value, isn't bold)
- License: Bitstream Vera Fonts License + Public Domain (see `LICENSE`) — permits embedding and
  redistribution without restriction.

To update: download a newer release from the same SourceForge project, base64-encode
`ttf/DejaVuSans.ttf`, and regenerate `dejavu-sans.font.ts`'s exported string.
