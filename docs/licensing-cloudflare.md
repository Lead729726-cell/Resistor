# Resistor Edu production licensing authority

The desktop editions share the existing signed-lease domain in
`platform/licensing/domain.mjs`. Node/local operator tools use SQLite through
`service.mjs`; the hosted Worker uses a SQLite-backed Cloudflare Durable Object.
Neither implementation writes grants to serverless temporary files. Inflearn
orders remain **Edu only, two devices**. No new payment provider, purchase
verification webhook, or automatic purchase ingestion is claimed. An authorized
owner-only Gmail message was accepted and independently found in the owner's
Inbox on 2026-11-01. Google Production publishing, a separately renewed grant,
another owner inbox test, and the verified-order sender were then enabled.
See the [production operation evidence](evidence/licensing/gmail-production-20261101.json)
and [earlier Testing evidence](evidence/licensing/mail-operation-20261101.json).

## Storage and identity

- Worker: `resistor-licensing`; binding: `LICENSE_AUTHORITY`; class: `LicenseAuthority`.
- Every request goes to the stable object named `production-v1`. Never rename
  this object or replace its namespace for an ordinary release.
- SQLite migration `v1` creates the class. The common domain adds tables with
  transactional `CREATE TABLE IF NOT EXISTS`; legacy order/license/activation
  schema stays usable. Additive mail jobs/attempts/events and refund tombstones
  preserve existing owner grants, activations, serials and signing identity.
  Operator self-tests use additive `mail_smoke_deliveries`, `mail_smoke_jobs`
  and `mail_smoke_attempts` tables. They never create order/license/grant rows.
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
  Hosted Inflearn orders also require an explicit `provider=inflearn`, the
  configured `course_id`, `verification_method=operator_review`, and Edu/two-seat
  scope, exactly like `/admin/inflearn/orders`. Omitted/null providers fail this
  check. Explicit other providers retain their existing separate purchase policy.
- `/admin/delivery`: `{delivery_id}` retrieves the encrypted pending fulfillment
  payload for a verified operator to hand off privately. It does **not** mark an
  email as sent. `/admin/deliver` remains pending while no mail provider is wired.
- `/admin/refund`: existing provider and purchase-reference namespace. Revoked
  leases cannot refresh; previously signed offline leases last at most seven days.
  A refund received before issuance creates an immutable provider/reference
  tombstone so a later order replay cannot issue a new code.
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
node --test tests/licensing.test.mjs tests/licensing-domain.test.mjs tests/licensing-outbox.test.mjs tests/licensing-cloudflare.test.mjs
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

## Optional durable email fulfillment

This source adds a sender; deployment or configuration does not itself establish
an Inflearn integration. No public Inflearn paid/refund webhook, event signature,
or merchant API credential has been verified. `/admin/inflearn/orders` is an
**operator-reviewed intake**, not a platform webhook. A student's self-reported
order number, lecture progress, shared course link or email address never issues
a code. Keep `inflearn_webhook=not_connected` until an official authenticated
order/refund integration is independently established.

Configuration is additive and does not change signing keys or the DO namespace:

| Setting | Meaning |
| --- | --- |
| `LICENSE_MAIL_PROVIDER=gmail` or `resend` | Select exactly one transport; current user choice is Gmail |
| `LICENSE_MAIL_SENDING_ENABLED=true` | Explicit opt-in for customer mail and its scheduler; every other/unset value disables customer sends. The authenticated owner-only smoke route below is independent. |
| `LICENSE_MAIL_FROM` | Operator-verified sender address; configuring it does not verify DNS |
| `RESEND_API_KEY` (secret) | Provider credential; never put in source or command arguments |
| `RESEND_WEBHOOK_SECRET` (secret) | The endpoint's `whsec_` signing secret |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` (secrets) | Existing Google OAuth application's authorized offline credentials; no account password |
| `GMAIL_SENDER_EMAIL` | Account identity verified during OAuth setup; must exactly match `LICENSE_MAIL_FROM` |
| `LICENSE_MAIL_DAILY_ATTEMPT_LIMIT` | Default 80 attempts per rolling 24 hours, range 1–100 |
| `LICENSE_INFLEARN_COURSE_ID` | Actual instructor-confirmed numeric course ID for dedicated intake |

Initial deployment is safe with sending disabled. Missing/invalid optional mail
configuration keeps signing/activation available, and `/health.mail_readiness`
reports configuration facts and `scheduled_sender_enabled=false`. Secret presence
is not proof of provider connectivity, domain verification or buyer delivery.
The existing Node CLI still requires its explicit `--send` operation and its
legacy `RESISTOR_LICENSE_FROM` setting; it is not the hosted queue.

The checked-in nonsecret Worker configuration reflects the user's selection:
`gmail`, sender `creditlsh00726@gmail.com`, Inflearn course `345103`, and a daily
attempt cap of 80. **`LICENSE_MAIL_SENDING_ENABLED="true"` is now explicit** after
the authorized Production renewal and real self-test. This enables mail after
an operator verifies/registers an order; it does not verify an Inflearn purchase.
The initial connection evidence for Google project
`resistor-license-mail-20261101` records an owner-verified send-only OAuth grant.
On 2026-11-01 the approved private credential file, local token
refresh, three Cloudflare secret bindings and live `credentials_configured:true`
were verified. That initial Testing grant reported expiry at
2026-11-08T09:57:37.682Z. This is historical connection evidence, not a claim
about a subsequently renewed credential. Production publishing, an authorized
live send and Inflearn purchase/refund ingestion each need separate evidence. See the
[initial connection evidence](evidence/licensing/fulfillment-20261101.json).
The subsequent [production operation record](evidence/licensing/gmail-production-20261101.json)
supersedes those earlier disabled/Testing settings. The new grant reports no
explicit expiration; that means unknown expiry, not permanent validity or
Google app verification. The original private file is retained. Inflearn's
purchase/refund feed remains disconnected; the user deferred the support inquiry.
No OAuth client secret, refresh token or access token belongs in `wrangler.jsonc`.

The Worker Cron runs every five minutes and only calls the stable authority when
the explicit sending flag is true. Verified Inflearn issuance also nudges the
same queue. Automatic processing handles at most five **Inflearn Edu** deliveries
per invocation; separate Industry/direct/web-product queues are not auto-sent.
Private `/admin/deliver` remains an explicit operator action for other sources.
The rolling attempt cap is a local safeguard, not a guarantee that the provider's
account has remaining quota; retries and unrelated account traffic may count
differently at the provider. No paid plan is provisioned by this code.

Additional POST routes:

- `/admin/inflearn/orders`: the existing verified-order fields plus
  `course_id` matching the configured course and
  `verification_method:"operator_review"`. Requires `provider:"inflearn"`,
  `edition:"edu"`, `device_limit:2`, `verified:true`, the actual purchase reference,
  confirmed recipient, and the SHA-256 of privately retained source evidence.
  It queues a unique code, returns IDs/status without the serial, and does not
  label the operator's verification as platform-authenticated automation.
- `/admin/outbox`: `{limit:1..100}` returns counts, non-PII delivery status and
  configuration readiness. The `smoke` field contains separate owner-test
  counts/status. It does not return addresses, serials or message text.
- `/admin/outbox/process`: `{limit:1..5}` runs the same bounded queue; when
  disabled it returns `enabled:false` without sending.
- `/admin/mail/smoke`: `{request_id: UUID}` explicitly sends one fixed test
  message to the configured Gmail owner. See the procedure below. Neither this
  route nor its records are processed by the customer queue or Cron.
- `/webhooks/resend`: provider server POST only, no browser Origin. Requires the
  exact raw body and valid `svix-id`, `svix-timestamp`, `svix-signature`; allows
  at most five minutes of clock skew and 64 KiB. It accepts mail evidence only.
  Missing signature configuration returns 503; invalid signatures return 400.

### Authenticated owner-only send test

This is an operator procedure; actual execution evidence is recorded separately
in the [2026-11-01 live test](evidence/licensing/mail-operation-20261101.json).
It uses the same encrypted durable outbox algorithm and Gmail
refresh/send adapter as customer mail, with separate records and no entitlement.

1. Deploy the reviewed source using the existing authority, then check HTTPS
   `/health`. `result.mail_smoke.configured=true` means valid Gmail configuration
   is present; it does not mean Gmail has accepted a message. Customer sending
   can remain `LICENSE_MAIL_SENDING_ENABLED=false` throughout this test.
2. After explicit send authorization, create and retain a fresh UUID. Submit
   `POST /admin/mail/smoke` with JSON containing **only** `request_id`, using
   `Content-Type: application/json` and the existing private bearer token through
   a secure operator client. Do not put the token in command arguments, logs or
   a browser. Browser Origin requests are rejected.
3. The server fixes the recipient to `GMAIL_SENDER_EMAIL`, which must match
   `LICENSE_MAIL_FROM`. Subject/body are fixed, identify an operator test, and
   contain no serial. Additional recipient, body, serial, or edition fields are
   rejected. No paid order, license, QA grant or buyer delivery is created.
4. Reuse **the same UUID** if the HTTP result is lost. The UUID is normalized to
   lowercase and durably identifies this test across concurrent requests and
   restarts. `accepted` is terminal/idempotent. A Gmail send with uncertain
   acknowledgment becomes `review_required` and is not retried automatically.
   Do not create a new UUID merely to bypass that state; reconcile the original
   send in the owner's Gmail first. A proven pre-send failure may be retried
   with the same UUID after its recorded backoff.
5. Inspect `status`, `provider_accepted`, `last_error` and `next_attempt_at` in
   the private result or `/admin/outbox`'s `smoke` section. Customer and smoke
   attempts share the same durable rolling daily cap; a blocked attempt reports
   `daily_attempt_limit` without sending. Cron and purchase intake never trigger
   smoke messages, even when customer sending is enabled.
6. After an acknowledgment, public health exposes
   `result.mail_smoke.provider_accepted` and `provider_accepted_at`; the matching
   readiness fields are `provider_connection_verified`,
   `provider_connection_verified_at` and
   `verification_scope=operator_self_test_provider_acceptance`. Evidence is
   bound to the current transport identity. Rotating credentials/sender removes
   the current-configuration success claim; it does not erase historical tests.
   An old UUID cannot be reused under a changed transport.

Gmail's successful send response is provider acceptance, **not inbox arrival or
reading**. `delivered_to_inbox` and `recipient_server_delivered` remain false for
this send-only test. The operator must inspect their own mailbox separately;
the backend does not request mailbox-read scopes. Keep acceptance and any human
receipt check as distinct evidence. A successful owner test does not verify
customer fulfillment, Inflearn payment ingestion or a purchase/refund webhook.

### Retries, reconciliation and delivery meaning

1. Issuance atomically writes the order, license and encrypted outbox. Retries of
   the same verified order reuse the existing license/delivery. Changed receipt,
   edition, recipient or seat policy is a conflict.
2. Sending atomically claims a 60-second lease, records an attempt, and stores an
   encrypted immutable provider message. Network waits occur outside transactions.
   Resend retries reuse that body and delivery ID as `Idempotency-Key`. Gmail
   does not receive a fabricated idempotency header.
3. Resend retains idempotency keys for 24 hours. This implementation stops its automatic
   retries after 23 hours or eight attempts. Changing API key/sender during an
   uncertain delivery requires review. It never replaces a delivery ID to bypass
   deduplication. Provider validation failures are `failed`; uncertain exhausted or
   conflicting requests are `review_required`. Reconcile those against provider
   records before any manual handoff; no reset/resend endpoint is exposed.
4. Schema-1 `pending` rows with historical attempts and no known first-attempt
   timestamp move to review when claimed. Previously accepted rows stay accepted.
   Upgrading code never invents a safe retry window for a historical message.
5. API `accepted` means the provider returned a message ID. A signed
   `email.delivered` means the recipient's mail server accepted it. Neither proves
   inbox placement, message reading, or student receipt. Bounce/complaint/failure
   evidence remains visible independently. Late events and duplicate IDs are
   reconciled durably; the same event ID with a different payload hash is rejected.
6. Refund cancels unsent work and revokes the entitlement. If a provider already
   accepted an in-flight request, its acknowledgment is retained while the license
   stays revoked. An email already in transit cannot be unsent. A later failed
   retry cannot erase an earlier real provider acknowledgment.

Local verification uses disposable keys/addresses, real SQLite/workerd execution,
and isolated mock provider HTTP. It tests race/restart/refund/expiry behavior and
raw signed event verification; it does not send real emails. Existing production
owner/device data must be checked before and after any actual deployment. Enable
sending only after authorized provider/sender configuration, private operator
purchase verification and a bounded authorized send test. Validate the evidence
available for the selected transport: signed mail events for configured Resend,
or a separate human receipt check for Gmail; do not require or fabricate a Gmail
delivery webhook. Leave purchase automation disconnected until the genuine
Inflearn integration contract exists.

### Existing Gmail account transport

The selected Gmail transport uses the existing account, not a new mail provider.
Provisioning its OAuth application and obtaining user consent are separate
operator actions. Request only `gmail.send` for mail, plus `openid email` during
setup if needed to verify the account identity; do not request mailbox read,
modify, full-mail, or password access. Pin the verified account email before
storing offline credentials. Configuring `GMAIL_SENDER_EMAIL` alone does not prove
that verification occurred. An OAuth app left in a Google testing state may have
refresh-token lifetime restrictions; verify its actual consent/publishing state
before advertising unattended fulfillment.

The Worker refreshes tokens at `https://oauth2.googleapis.com/token` then calls
`https://gmail.googleapis.com/gmail/v1/users/me/messages/send` with a deterministic
UTF-8 MIME message encoded as base64url. The sender must exactly match the
operator-confirmed account. CR/LF/header injection and multiple recipients are
rejected. Access tokens are only held in memory; no credential or raw message is
returned from status. A durable refund/lease check runs again after OAuth and
immediately before the send request.

Gmail does not document a provider idempotency key for this send endpoint. A
connection loss, invalid/missing response, process interruption, or other uncertain
send moves the job to `review_required`; the scheduler **does not resend**. An
interrupted attempt remains marked in SQLite across restart. Only failures known
to occur before sending (such as a transient token refresh failure) retry with
backoff. Invalid/revoked OAuth credentials fail before any mail request and need
operator correction. A new transport identity never silently resumes an uncertain
old message.

The Gmail send-only scope cannot establish recipient mail-server delivery or
read/inbox status. An acknowledged Gmail message ID is `accepted` only, with
`delivery_event_support=not_available_with_send_only_scope`. No Gmail delivery
webhook or read tracking is fabricated. Operators reconcile uncertain sends in
their own Sent folder before privately handing off the existing serial; the
backend never generates a substitute serial or bypasses duplicate protection.

### Safe Gmail production renewal (Windows operator, Node 24)

The helper uses the existing approved private authority folder, not the Edu
workspace. It verifies the Google-signed identity for
`creditlsh00726@gmail.com`, requesting only `openid`, `email` and `gmail.send`.
Run from the repository root after approval of the client file, scope and new
private destination. The following example creates a **new** suffixed file;
choose a different allowed suffix if this target already exists.

```powershell
node scripts/license-gmail-connect.mjs inspect --client-file "D:/Coldbrew/Resistor/.runtime/licensing/gmail-oauth/client.json" --approved-private-dir "D:/Coldbrew/Resistor/.runtime/licensing" --credential-suffix production-20261101 --publishing-status production
node scripts/license-gmail-connect.mjs connect --client-file "D:/Coldbrew/Resistor/.runtime/licensing/gmail-oauth/client.json" --approved-private-dir "D:/Coldbrew/Resistor/.runtime/licensing" --credential-suffix production-20261101 --publishing-status production --approve-identity-scopes
```

`inspect` makes no OAuth request, starts no listener and writes no credential.
`connect` prints only a loopback `/start` URL for the owner to open. After Google
consent it verifies state/PKCE/nonce, signed identity, exact account and scopes
before exclusive creation of:

`D:/Coldbrew/Resistor/.runtime/licensing/gmail-oauth/credentials-production-20261101.json`

The original `credentials.json` is neither overwritten nor moved. Suffixes
allow only a leading lowercase letter/digit followed by lowercase letters,
digits or hyphens, at most 48 characters. Paths cannot escape the approved
folder. The helper checks Git exclusion, non-link ancestors and private owner
ACLs; it rechecks the directory before writing and the resulting file afterward.
An existing destination fails closed, including a repeat `inspect` after a
successful save. No credential values are printed; no email is sent by either
command. Loopback sockets are closed on completion, cancellation and timeout.

`--publishing-status production` records an **operator-declared** Google Console
state; it does not publish or verify the app. Check that state in Google Console
before using the flag. Publishing is not a guarantee of a permanent refresh
token, nor evidence of Google verification. Do not assume an old Testing grant's
expiry was extended. Reconsent and review the new record's actual
`refresh_expires_at` and `refresh_expiry_source`; a null expiry means no known
expiry, not unlimited validity. Revocation, account/security changes, inactivity
and provider limits can still invalidate refresh credentials. See
[Google's refresh-token expiration rules](https://developers.google.com/identity/protocols/oauth2#expiration).

After verifying the new private record, register the approved Gmail client ID,
client secret and refresh token through the existing private stdin handoff to
Worker secrets. Keep the signing/master/admin keys and `production-v1` unchanged.
Retain the original local file as a protected historical record until the
operator's retention/revocation procedure permits removal; this helper does not
revoke the old grant or switch production automatically. Check live health and
run a newly authorized owner test for the new transport before enabling customer
mail. Missing/expired credentials fail closed. Monitor failures and renew when
needed rather than describing unattended operation as permanent.

Primary Gmail references:
[Send method and scope](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send),
[MIME/base64url format](https://developers.google.com/workspace/gmail/api/guides/sending),
[Offline OAuth refresh](https://developers.google.com/identity/protocols/oauth2/web-server#offline).

Primary mail references (2026-11-01):
[Resend send endpoint](https://resend.com/docs/api-reference/emails/send-email),
[24-hour idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys),
[API error classes](https://resend.com/docs/api-reference/errors),
[raw webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests),
[event meanings](https://resend.com/docs/webhooks/event-types),
[Svix signature format](https://docs.svix.com/receiving/verifying-payloads/how-manual).
