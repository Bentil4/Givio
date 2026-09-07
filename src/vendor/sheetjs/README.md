# SheetJS (vendored)

Vendored per Story 4.2's AC: "uses the vendored SheetJS tarball from `cdn.sheetjs.com` — never
`npm install xlsx`". SheetJS's own npm registry package is a stripped-down community edition;
the full edition is only distributed via their CDN tarball.

- Source: `https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz`
- Version: 0.20.2
- Vendored: 2026-09-07
- Files: `xlsx.mjs` (ESM build) + `xlsx.d.mts` (types, from the tarball's `types/index.d.ts`) + `LICENSE`

To update: fetch a newer tarball from the same CDN path pattern, replace these three files,
bump the version noted above.
