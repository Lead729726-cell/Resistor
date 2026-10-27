# Official distribution serial licensing

Applies to **Resistor Edu (`edu`)** and **Resistor Industry (`indust`)** through
one shared implementation. Edu course purchase grants **Edu only, two active
installations**. Industry is a separate order/code. Existing project directories,
engine mathematics, device models and verification results are unchanged.

### Course fulfillment policy

**인프런 강의에는 Resistor Edu 사용권만 포함합니다. 개인 기기 2대까지
등록할 수 있으며, Resistor Industry는 별도 구매 제품입니다.**

The shared issuance service enforces this before creating an order, code or delivery:

| Verified order source | Allowed edition | Active devices | Included product |
| --- | --- | --- | --- |
| `inflearn` | `edu` only | Exactly 2 | Resistor Edu course entitlement |
| `direct` | `indust` only | 1–2, explicitly recorded | Separate Resistor Industry purchase |

An operator-authenticated Inflearn request with `edition:"indust"` fails with
`ORDER_EDITION`; `verified:true` does not override the product policy. A different
course seat count fails with `ORDER_POLICY`. Verification must be the boolean `true`,
not a truthy string. Successful issuance receipts contain the exact entitlement;
the existing signed lease still binds a single edition and a single installation.

The app activation screen, fulfillment email and download-page generator state the
Edu-only course scope. This source change does not claim that the live Inflearn
editor or live download website has been updated. Automatic purchase ingestion and
delivery remain separate deployment gates described below.

## Implemented boundary

- Cryptographically random 160-bit serials; no sequential guessable codes.
- Operator-verified orders issue idempotently. Admin bearer authentication protects
  issuance/refund HTTP endpoints. A buyer's unverified order number never issues a code.
- Serial hashes use HMAC with a server-only key. Buyer address and delivery code
  are AES-GCM encrypted in the private database/outbox. Neither is logged.
- Ed25519 signed seven-day device leases bind edition and installation. Apps contain
  public verification keys only. Electron protects refresh credentials with OS safeStorage.
- The trusted desktop main process and local development RPC boundary enforce access.
  The React screen alone is not the authorization boundary. Static public source/demo
  pages are not a paid entitlement service.
- Two active installations, explicit per-device release, refund revocation, expiry,
  clock rollback detection and network retry. Network errors preserve valid cached
  leases. A successful online revocation invalidates the local session. Offline
  revocation can take up to seven days. Users retain their project files; no wipe.
- UI retains the mounted working document when an existing session becomes locked.
  A failed read/refresh never repeats simulation, AI calls or student submissions.

This does not retroactively revoke MIT rights or remove earlier public installers.
MIT source can be modified and rebuilt without this gate. This is official product
access enforcement, not unbreakable DRM, a change to third-party engine/PDK licenses,
or a claim that public educational tasks have become secret exams.

## Current external status

The default public configuration deliberately has no production server URL.
A public signing key is packaged; its private key stays in the seller's private
directory. It fails closed and explains that the seller must finish setup.
**Do not publish those locked installers.** `assertLicenseReleaseReady` blocks the
package and native release entry points until a production HTTPS service/public key is configured.
Old 0.31.0 installers remain the existing public release.

Inflearn's public guides show instructor enrollment/payment records, but a supported
merchant purchase webhook and per-buyer serial delivery integration have not been
confirmed. This implementation does not invent an Inflearn webhook, share a common
code in course materials, scrape private APIs, or treat a self-reported receipt as paid.

Initial operational path: instructor verifies a real purchase and its edition in the
Inflearn dashboard, registers that verified order, then the service issues and queues
its code. A configured mail transport can deliver the queue. Without that transport
it remains `pending`; provider acceptance is not proof of inbox delivery. Refunds
also need a verified operator input until an official order/refund adapter exists.

## Operator setup (Node 24)

```powershell
$env:RESISTOR_LICENSE_HOME = 'D:\private-resistor-licensing'
node scripts/license-server.mjs init
node scripts/license-server.mjs status
node scripts/license-server.mjs serve
```

Initialization refuses to overwrite an existing key. Keep the private directory,
database, master key and backups off Git, public web roots, student ZIPs and app
resources. Back up the database **and** encryption/signing keys together with access
limited to the seller. Losing these can prevent resending codes and verifying leases.

The service binds loopback by default. An operator must configure a durable production
HTTPS gateway, restricted admin route, backup/restore, monitoring and key rotation.
Do not sell always-on authentication backed only by a temporary tunnel/desktop PC.
Only the public-config file goes into `platform/licensing/public-config.json`.

Create a private JSON array shaped like `platform/licensing/orders.example.json`.
Use a real reviewed order ID, confirmed buyer destination and SHA-256 of the reviewed
evidence. Set `verified:true` only after the seller confirms the order; the example
is intentionally non-issuable. Store that evidence privately with a retention policy.

```powershell
node scripts/license-server.mjs import-orders D:\private\verified-orders.json
# Optional provider configuration, set securely rather than pasting secrets in chat:
# RESEND_API_KEY, RESISTOR_LICENSE_FROM
node scripts/license-server.mjs import-orders D:\private\verified-orders.json --send
node scripts/license-server.mjs refund VERIFIED_PURCHASE_REF
```

For a separately verified Industry purchase, use
`platform/licensing/industry-orders.example.json` as the non-issuable template, set
`provider:"direct"` and `edition:"indust"`, and import the reviewed private copy.
Do not relabel an Inflearn course purchase as a direct purchase to expand access.

```powershell
node scripts/license-server.mjs refund VERIFIED_INDUSTRY_PURCHASE_REF --provider=direct
```

Purchase references are unique within each provider. Refund defaults to `inflearn`
for existing course operator commands; a direct Industry refund must explicitly name
its provider, so a matching course order number is not revoked by that operation.

The existing schema 1 SQLite tables, serial format and signed leases are retained.
No existing order, activation, encrypted outbox, private key or student project is
rewritten or revoked by installing this source update. Historical Industry records
marked `inflearn` need an operator review of their original purchase scope; new
Inflearn-to-Industry issuance and reissuance are refused rather than silently
rewriting those records. Existing MIT source rights are unchanged.

`--send` is an explicit delivery operation to verified buyers. It reuses the outbox
delivery ID as the provider idempotency key. Uncertain results remain pending.
`export-delivery DELIVERY_ID PRIVATE_FILE` supports operator-assisted delivery when
the mail service is unavailable; that file contains a live buyer code and must not
be uploaded as a shared course resource.

## Verification

`npm run test:license` checks order verification/idempotency, encryption, signature
tampering, edition separation, seats, release/reuse, refund, offline expiry, clock
rollback, retry preservation, HTTP authorization/origin/body limits and mail receipt
states. It uses disposable test keys and fake buyers, with no provider email calls.
Native signed installers, actual Inflearn purchase ingestion, production deployment
and real inbox receipt require separate evidence.

## Platform references (checked 2026-10-23)

- [Inflearn instructor enrollment management](https://inflab-1.gitbook.io/inflearn/course-operating/courses/manage)
- [Inflearn instructor FAQ](https://inflab-1.gitbook.io/inflearn/course-open/faq)
- [Resend email endpoint](https://resend.com/docs/api-reference/emails/send-email)
- [Node cryptographic verification](https://nodejs.org/docs/latest-v24.x/api/crypto.html)

Before selling, confirm external-tool access, refund/device access policy, data
processing, support and existing-customer treatment with the actual platform contract.
Paid accounts, code signing and new infrastructure purchases are not authorized by
this implementation task.

## Edu-only course policy verification (2026-10-27)

Shared licensing/download tests: 26/26; core regression: 377/377; edition/MCP
isolation: 9/9. Typecheck and both edition builds passed. The existing large bundle
warning remains. The real activation screen displayed the course scope in a
disposable local QA workspace; 390 px mobile had no horizontal overflow. No real
order, customer code, mail delivery or production key was created or changed.

Evidence: [summary](evidence/course-edu-access-20261027/verification.json),
[core test log](evidence/course-edu-access-20261027/core.txt),
[desktop activation screen](evidence/course-edu-access-20261027/activation-desktop.png),
[mobile activation screen](evidence/course-edu-access-20261027/activation-mobile.png).
