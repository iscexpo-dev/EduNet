# EduNet Security

Last updated: 2026-10-23
Status: authenticated core is hardened; edge controls are not yet launch-ready.

## 1. Authentication

| Control | Implementation |
|---------|----------------|
| Access token | JWT, 7-day expiry, `tokenKind: access` |
| Refresh token | JWT, 30-day expiry, `tokenKind: refresh` |
| Cross-use | Access tokens rejected as refresh and vice versa |
| Secret | `JWT_SECRET` required; placeholder rejected in production |
| Password hashing | bcrypt, configurable `BCRYPT_COST` (default 10, production target 12) |
| Password policy | 8–128 characters |
| Lockout | Repeated failures trigger temporary lockout and an audit event |
| Reset | Single-use hashed token; request always returns 202 to prevent enumeration; reset revokes sessions |
| Verification | Email/phone one-time tokens; delivered only when `DELIVER_EMAILS=true` |
| Sessions | Device sessions can be listed and revoked |
| Audit | Identity events persisted in `identity_audit_events` |

Outstanding: MFA, OAuth/OIDC/SSO, suspicious-login detection, native
bcrypt/argon2id, and a real email/SMS delivery provider.

## 2. Authorization

- Roles: `student`, `teacher`, `parent`, `tutor`, `mentor`, `admin`.
- Permissions live in `@edunet/rbac`; services use its `authenticate` and
  `authorize` middleware. Do not add route-local auth copies.
- Every read and mutation is scoped by `organizationId`.
- Ownership checks cover course mutations, assignment/submission grading,
  content/media, conversations and parent-child reads.
- Parent access additionally requires a relationship row for the child.
- Admin is the only role allowed to verify users, manage platform audit,
  integrations, webhooks and tenant prompts (where applicable).

Tests: `@edunet/rbac` (40), `@edunet/identity` (49), plus domain ownership
tests. PostgreSQL integration coverage for tenant isolation runs in CI.

## 3. Tenant Isolation

- `organizationId` is a column on tenant tables and a required predicate in
  every query.
- Cross-tenant IDs return 403/404 rather than a partial object.
- AI conversations, usage, prompts, consent and audit are tenant-scoped.
- Search results are filtered by the authenticated organization.
- Risk: a new handler that forgets the predicate bypasses isolation. Every
  handler needs an ownership/tenant test; this remains a review gate.

## 4. Data Protection

| Data | Storage | Protection |
|------|---------|------------|
| Passwords | `users.password_hash` | bcrypt, never returned |
| Refresh/reset/verification | `identity_tokens` | Hashed tokens, expiry, single use |
| Sessions | `sessions` | Revocable, user-scoped |
| Media | Filesystem volume | Private key, signed URL (300 s), MIME allowlist, 25 MB cap |
| AI messages | `ai_messages` | Tenant/user scoped; PII redacted before provider call |
| Consent | `consent_records` | Purpose, grant/revoke timestamps |
| Audit | `identity_audit_events`, `audit_logs`, `ai_audit_events` | Append-only, platform audit supports verification |

At-rest encryption is delegated to the managed PostgreSQL and volume provider.
There is no application-level field encryption yet.

## 5. AI Safety and Privacy

- AI is consent-gated (`ai_processing`); production defaults to requiring
  consent.
- Crisis/self-harm input short-circuits to a human-help response; no model call.
- Unsafe output is blocked after generation.
- PII (email, phone, long numeric identifiers) is redacted before the provider
  call.
- Per-organization daily token quota prevents runaway cost.
- Every AI request writes usage and an audit event; feedback is stored.
- Provider credentials are environment-only and never logged.
- Rule-based screening is a first line, not a complete moderation system.

## 6. Edge and Application Security

| Control | State |
|---------|-------|
| Input validation | Zod on every handler |
| SQL injection | Drizzle parameterisation; no dynamic identifiers |
| XSS | React escaping; no `dangerouslySetInnerHTML` in reviewed pages |
| Path traversal | Blocked in storage key generation/containment; tested |
| MIME/upload abuse | Allowlist and size cap |
| CORS | **Missing** |
| Rate limiting | **Missing** |
| Security headers/CSP | **Missing** |
| Token storage | **localStorage — migrate to httpOnly cookies** |
| Dependency scan | **No current scan** |
| Secret management | Environment variables; no vault |
| Logging of secrets | Reviewed paths avoid logging tokens/keys |

These five gaps are launch blockers. Rate limiting should protect login,
password reset, AI messages and search at minimum.

## 7. Threat Model (abbreviated)

| Threat | Impact | Mitigation | Residual |
|--------|--------|------------|----------|
| Cross-tenant read via missing predicate | Critical | RBAC, integration tests, review | Medium until every handler is covered |
| Forged token due to weak secret | Critical | Required env secret, placeholder rejection | Low |
| Refresh-token replay | High | Token-kind claim, session revocation | Low |
| Account takeover via credential stuffing | High | Lockout, audit | Medium (no MFA/rate limit) |
| Uploaded malware / XSS via SVG | High | MIME allowlist, private signed access | Medium (no AV scanner) |
| AI prompt injection | High | System prompt, output screening, no tool access | Medium |
| AI harmful advice to a minor | Critical | Crisis short-circuit, consent, human escalation | Medium |
| Offline replay duplicate | High | Idempotency keys, ordering | Medium until wired |
| Backup theft | High | Provider encryption, restricted bucket access | Depends on deployment |
| Insider admin misuse | High | Audit, least privilege | Medium |

## 8. Security Testing

- Unit tests: auth lifecycle, token confusion, RBAC, ownership, storage
  traversal, AI safety/quota, offline conflict.
- Database integration (CI): tenant isolation for courses, lessons, progress,
  resources and media.
- Missing: ZAP/DAST, dependency audit in CI, secrets scan, fuzzing, MFA tests,
  rate-limit tests, CSP verification.

## 9. Incident Response

1. Contain: disable the affected route/provider (AI fails closed), revoke
   sessions, rotate secrets.
2. Preserve: logs with request IDs, audit rows, database snapshot.
3. Assess: affected tenants, data categories, minors, notification duties.
4. Notify: DPO/leadership and, where required, affected institutions.
5. Remediate and add a regression test before re-enabling.
6. Post-incident review within 5 working days.

See `docs/operations/OPERATIONS.md` for severity levels and the on-call flow.

## 10. Pre-Launch Security Checklist

- [ ] Rate limiting on auth, reset, AI and search
- [ ] CORS allowlist for the production web origin
- [ ] CSP, HSTS, `X-Content-Type-Options`, frame-ancestors
- [ ] Access/refresh tokens in httpOnly, Secure, SameSite cookies
- [ ] External dependency and container scan with no unresolved critical/high
- [ ] Secret manager or sealed environment; no long-lived shared JWT secret
- [ ] Tenant-isolation test for every new handler
- [ ] Backup encryption and access review
- [ ] AI provider data-retention terms reviewed for minors
- [ ] Crisis escalation contact verified with a counselor
