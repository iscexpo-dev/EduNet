# Go-Live Checklist

- [ ] CI dependency, format, lint, typecheck, unit, integration, E2E, security, build, and container checks pass.
- [ ] Production secrets are present in the secret manager; no placeholders remain.
- [ ] PostgreSQL TLS, least privilege, migrations, backups, retention, and restore target are verified.
- [ ] HTTPS, DNS, CORS, proxy trust, cookies, and security headers are verified.
- [ ] `/health` and `/ready` checks are monitored; logs, metrics, error alerts, and audit events are routed.
- [ ] Synthetic smoke tests pass for student, teacher, parent, and administrator flows.
- [ ] Accessibility and low-bandwidth checks are complete.
- [ ] Rollback owner and forward-fix/recovery plan are assigned.
- [ ] Pilot approval, privacy review, support coverage, and stop conditions are recorded.
- [ ] Release owner records GO or NO-GO with evidence.

Current decision: **NO-GO / NOT DEPLOYED** until external prerequisites and verification evidence are available.
