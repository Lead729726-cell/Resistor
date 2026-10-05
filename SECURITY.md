# Security

Do not put credentials, private PDKs, proprietary designs or license material in
public issues or pull requests. For a vulnerability, use GitHub's private
vulnerability reporting on the repository if enabled, or contact the maintainer
through their GitHub profile before sharing sensitive reproduction details.

Report the affected revision, component, impact and minimal reproduction.
Redact tokens, cookies and user data. The maintainer has not committed to a
response SLA or long-term security maintenance for this initial source release.

Worker credentials belong on the server. The cloud hub checks membership and
design revision before native operations. Public deployment still needs explicit
TLS, persistent storage and access configuration described in `docs/cloud.md`.
Run the source audit before publishing changes; it is a guard against common
credential patterns, not a complete security review.
