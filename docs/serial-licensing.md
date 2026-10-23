# Official distribution serial licensing

Applies to **Resistor Edu (`edu`)** and **Resistor Industry (`indust`)** through
one shared implementation. Edu course purchase grants **Edu only, two active
installations**. Industry is a separate order/code. Existing project directories,
engine mathematics, device models and verification results are unchanged.

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
