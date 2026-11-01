# Resistor Edu production licensing authority

The desktop editions share the existing signed-lease domain in
`platform/licensing/domain.mjs`. Node/local operator tools use SQLite through
`service.mjs`; the hosted Worker uses a SQLite-backed Cloudflare Durable Object.
Neither implementation writes grants to serverless temporary files. Inflearn
orders remain **Edu only, two devices**. No new payment provider, purchase
verification webhook, or automatic email delivery is claimed.

## Storage and identity

- Worker: `resistor-licensing`; binding: `LICENSE_AUTHORITY`; class: `LicenseAuthority`.
- Every request goes to the stable object named `production-v1`. Never rename
  this object or replace its namespace for an ordinary release.
- SQLite migration `v1` creates the class. The common domain adds tables with
  `CREATE TABLE IF NOT EXISTS`; legacy order/license/activation schema stays usable.
- A database identity record binds the existing signing public-key fingerprint,
  key ID, and an HMAC of the master key. Changing these secrets against an existing
  database fails closed rather than silently making grants unusable.
- SQL transactions wrap issue, activation/seat counts, refresh, release, revoke,
  and operator grants. Same-installation activation retries retain their encrypted
  refresh secret; release/rejoin rotates it. Repeated release is idempotent.
- Serials, buyer email and retrievable refresh secrets are encrypted at rest;
  lookup fields and per-client rate-limit keys are keyed hashes. Public requests
  never expose order, serial, email or admin credentials.

The separate local authority was inspected by the operator before the initial
deployment: its four customer tables were empty. This deployment therefore needs
no customer-state import. Existing keys are reused; no Edu workspace keys or
Industry projects are copied. An installation with existing customer data needs
an explicit, verified migration before replacing its authority.

## Deployment

Use Node 24. The Worker tooling is independently locked:

```sh
npm ci --prefix platform/licensing/cloudflare
npm test --prefix platform/licensing/cloudflare
```

Configure these as **Worker secrets**, using the existing private operator file:

| Secret | Contract |
| --- | --- |
| `LICENSE_SIGNING_PRIVATE_KEY` | Existing Ed25519 PKCS8 PEM, never committed |
| `LICENSE_MASTER_KEY` | Existing 32-byte master key, base64 |
| `LICENSE_KEY_ID` | Existing packaged key ID, currently `resistor-20261023` |
| `LICENSE_ADMIN_TOKEN` | Existing private operator bearer token, at least 40 characters |

Do not paste secrets in CLI arguments, public logs, screenshots, release assets,
or `.dev.vars` files intended for source control. Root deployment uses a private
stdin handoff. Publishing code without secrets is safe but health remains 503.

```sh
npm run deploy --prefix platform/licensing/cloudflare
```

This is an explicit deploy command, not an automatic CI deployment. The selected
Cloudflare account must remain on the authorized free plan; do not upgrade a plan
to bypass a quota error. Cold start or quota failures return unavailable, never
an unsigned local entitlement. The official public configuration and release gate
must be updated only after checking live HTTPS health and the existing packaged
public key. Native installer publication is a separate gate.

`GET /health` queries persistent SQLite identity and reports:
`database_ready`, `storage_backend=cloudflare-durable-object-sqlite`,
`authority_id=production-v1`, `storage_schema_version=1`, key ID and fingerprint.
It does not claim email delivery or Inflearn webhook availability.

## Private operator routes

All routes below are POST with JSON, HTTPS and
`Authorization: Bearer <private token>`. Admin routes reject browser Origins.
Unlisted browser origins are denied on every route; optional
`LICENSE_ALLOWED_ORIGINS` is an explicit comma-separated allowlist, never `*`.
Native clients use the existing `/v1/activate`, `/v1/refresh`, `/v1/deactivate`.
Bodies are limited to 16 KiB of bytes, and persistent client limits apply before
authorization (30 public or 60 admin requests per minute per client address).

- `/admin/orders`: existing verified operator receipt fields (`provider`,
  `purchase_ref`, `edition`, `email`, `evidence_sha256`, `verified=true`,
  `device_limit=2`). An actual verified purchase is required; caller authority is
  not evidence that a payment happened. Keep the source receipt privately.
- `/admin/delivery`: `{delivery_id}` retrieves the encrypted pending fulfillment
  payload for a verified operator to hand off privately. It does **not** mark an
  email as sent. `/admin/deliver` remains pending while no mail provider is wired.
- `/admin/refund`: existing provider and purchase-reference namespace. Revoked
  leases cannot refresh; previously signed offline leases last at most seven days.
- `/admin/grants`: explicit internal grant with `{request_id: UUID, purpose:'qa',
  edition:'edu', device_limit:2, reason, expires_in_seconds:60..3600}`. A QA lease
  is capped at that expiry, including offline. For the authorized product owner,
  use `purpose:'owner'` and omit expiry; each device still receives a seven-day
  renewable lease. These grants create internal audit records marked `qa` or
  `owner`, **never paid orders**, buyer emails or delivery records.
- `/admin/grants/revoke`: `{grant_id}`. Revoke packaged QA grants when testing ends.
  Revocation cannot instantly invalidate an already issued offline lease; the
  response states its remaining maximum lifetime.

Grant request IDs are idempotent only with identical conditions. A conflicting,
revoked or expired request is rejected. Save the response privately without
printing its serial. Public QA evidence contains only IDs, status and fingerprints.

## Recovery and validation

Do not delete the namespace, call storage `deleteAll`, rename `production-v1`,
or rotate keys as a troubleshooting step. Keep the original private operator key
backup independently. Cloudflare SQLite Durable Objects provide point-in-time
recovery; use the official storage recovery procedure with operator review.
Restore database and matching keys together. No public import/restore route exists.

```sh
node --test tests/licensing.test.mjs tests/licensing-domain.test.mjs tests/licensing-cloudflare.test.mjs
```

The Cloudflare test uses actual local workerd/Miniflare SQLite, disposable keys
and temporary data. It checks simultaneous issuance and the two-seat race,
process restart persistence, lease verification, release/retry, revocation,
origin/admin/body limits, durable rate limiting and mismatched-key failure. Domain
tests also inject a mid-grant SQL failure and check transaction rollback and
encrypted storage. They do not issue production purchases or send emails.

Primary references: [Cloudflare SQLite storage and transactions](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/),
[Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[Node crypto compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/).
