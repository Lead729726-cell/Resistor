# Resistor public download portal

Live: https://resistor.kr

This is a static Vercel project. Desktop installers are delivered by the public
GitHub Releases assets; the portal never deploys the EDA engine, user workspace,
provider credentials or local runtime.

After publishing all OS assets to a release, regenerate from its public metadata:

```sh
node scripts/tutorial-library-media.mjs
npm run download:editions
node scripts/download-workbench.mjs
npm run test:download-site
npx vercel deploy --dry --prod --yes --project resistor-downloads --scope seokhyeongs-projects --cwd platform/download-site
npx vercel deploy --prod --yes --project resistor-downloads --scope seokhyeongs-projects --cwd platform/download-site
```

The strict `.vercelignore` deploys allowlisted pages, tutorials and static assets. Windows x64, Mac arm64
and Linux x64 are labelled separately, with release byte sizes and SHA-256 from
GitHub. Archive checks are kept distinct from native GUI execution and signing.

Edu and Industry now have separate download entry points at `/download/edu/`
and `/download/industry/`. These provide dedicated preview installers with exact per-edition versions for five OS/CPU targets per edition,
plus commit-pinned edition source ZIPs. Each native asset has installed-app execution evidence and a GitHub-computed SHA-256 digest. macOS requires 15+ for the bundled ngspice. Windows ARM64 uses a native shell and an emulated x64 engine. Historical common installers
keep their existing URLs under a clearly labelled section.
Run `npm run download:editions` to refresh verified public source identities,
then `node scripts/download-workbench.mjs` to regenerate the pages.

Before deploying, inspect the actual file list with `vercel deploy --dry` and
`node scripts/verify-static-deployment.mjs`. Include bare public directory names
and their descendants in `.vercelignore` so tutorial assets are traversed.
Never include `.env*`, runtime data, credentials or `.vercel` project metadata.
The v0.16 Mac CI run failed some viewer/menu checks; it is preserved in
`docs/evidence/github-ci-0.16.0.json` rather than presented as a native approval.

After deployment, verify the public portal and complete downloads:

```sh
REGISTER_DOWNLOAD_URL=https://resistor.kr npm run test:download-site
node tests/integration/download-assets.mjs
```

In PowerShell, set `$env:REGISTER_DOWNLOAD_URL` instead of the inline environment
assignment. Reports go to `docs/evidence/download-site-public.json` and
`docs/evidence/download-assets-public.json`. The latter verifies streaming SHA-256
of all three full assets and byte-range downloads, without storing another copy.

The shared portal also preserves `/edu/` and its mode guide. The guide uses versioned presentation facts in `scripts/site/edu-guide-content.json`, pinned to the actual Edu source; it does not copy or execute the Edu question engine in Indust. Update these facts when the documented Edu bank or flow changes. The original lesson UI evidence remains separately identified.

Dedicated updates require 0.29+. Earlier installed apps need a one-time manual install. See `/updates/` for edition-specific automatic download and confirmed installation. Both shared and edition-only release tags are supported; publishing one edition preserves the other edition metadata.
