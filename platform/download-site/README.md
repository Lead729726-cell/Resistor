# Resistor public download portal

Live: https://resistor-downloads.vercel.app

This is a static Vercel project. Desktop installers are delivered by the public
GitHub Releases assets; the portal never deploys the EDA engine, user workspace,
provider credentials or local runtime.

After publishing all OS assets to a release, regenerate from its public metadata:

```sh
node scripts/download-site.mjs --release=v0.16.0
npm run test:download-site
npx vercel deploy --dry --prod --yes --project resistor-downloads --scope seokhyeongs-projects --cwd platform/download-site
npx vercel deploy --prod --yes --project resistor-downloads --scope seokhyeongs-projects --cwd platform/download-site
```

The strict `.vercelignore` deploys only nine static files. Windows x64, Mac arm64
and Linux x64 are labelled separately, with release byte sizes and SHA-256 from
GitHub. Archive checks are kept distinct from native GUI execution and signing.
The v0.16 Mac CI run failed some viewer/menu checks; it is preserved in
`docs/evidence/github-ci-0.16.0.json` rather than presented as a native approval.

After deployment, verify the public portal and complete downloads:

```sh
REGISTER_DOWNLOAD_URL=https://resistor-downloads.vercel.app npm run test:download-site
node tests/integration/download-assets.mjs
```

In PowerShell, set `$env:REGISTER_DOWNLOAD_URL` instead of the inline environment
assignment. Reports go to `docs/evidence/download-site-public.json` and
`docs/evidence/download-assets-public.json`. The latter verifies streaming SHA-256
of all three full assets and byte-range downloads, without storing another copy.
