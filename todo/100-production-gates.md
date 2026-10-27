# EduNet — 100 Production Gates

Last updated: 2026-10-27
Authoritative status: `docs/EDUNET-FINAL-STATUS.md`
Gap analysis: `docs/EDUNET-ROADMAP-GAP-MATRIX.md`

A checked gate requires implementation plus executed evidence. CI-only gates
are marked with their limitation.

1. [x] Requirements — `docs/product/PRODUCT-FOUNDATION.md`
2. [ ] Architecture — 18 services and a gateway exist; deployment topology and contract tests missing
3. [x] Database — schema/migrations generated; executed previously on PostgreSQL 16 (CI-only now)
4. [x] Identity — hardened auth, reset, verification, sessions, lockout, audit; 49 tests
5. [x] Authorization — canonical RBAC, 40 tests, tenant-isolation integration suite
6. [x] LMS — courses, lessons, enrolment, progress, assignments, grading
7. [x] Assignments — rubrics, autosave, revisions, grade history
8. [x] Assessments — five objective types, partial credit, banks, randomisation, rechecks
9. [x] Teacher — core authoring/grading UI, course analytics and scoped attendance marking; workload UI still missing
10. [x] Student — learning, submission and quiz flow verified by E2E (CI); attendance view and `/library` bookmarks/notes view added, browser/API flow pending
11. [ ] Parent — parent dashboard and child-scoped attendance view exist; self-service linking missing
12. [ ] Tutoring — backend booking/availability exists; no UI or payments
13. [ ] Booking — calendar/event booking backend exists; no UI
14. [ ] Communication — messaging/moderation/forums backend exists; no UI or realtime
15. [ ] Notifications — in-app only; no email/SMS/push delivery
16. [ ] Content — lessons/media/versioning, objectives/bookmarks/notes routes and a teacher lesson/objective editor exist; S3 and malware scanning missing
17. [ ] Search — `ILIKE` only; no ranking or facets
18. [ ] Calendar — backend/ICS exists; no calendar UI
19. [ ] Analytics — tenant/owner-scoped endpoints and teacher course dashboard; KPI pipeline/warehouse still missing
20. [ ] AI — consent/safety/quota backend complete; no UI and no provider configured
21. [x] Offline — queue wired into assignment/assessment submit, progress, notes and bookmarks; `/offline/queue` retry/discard triage; background sync and automatic last-write-wins dedupe; server-versioned merge missing
22. [ ] Low-bandwidth — download planner exists; no device/network validation
23. [x] Bengali — catalogue and formatter implemented; native review pending
24. [ ] Accessibility — no WCAG 2.1 AA audit
25. [ ] Integration — config/webhook registration only; delivery/retry/signing unproven
26. [x] API — all domains expose versionless `/api/*` routes with shared error conventions
27. [ ] Security — rate limiting, CORS, CSP, token storage and scan outstanding
28. [ ] Privacy — consent/data-request API exists; export/erase execution missing
29. [ ] Data Governance — retention and deletion jobs missing
30. [ ] Infrastructure — no IaC, managed DB or CDN provisioning
31. [ ] Docker — no Dockerfile or compose
32. [x] CI — migrations, integration, lint, typecheck, tests, build, E2E configured
33. [ ] CD — no deployment or rollback job
34. [x] Observability — logs, request IDs, metrics, health/ready on every service
35. [ ] Performance — no p95 baseline
36. [ ] Load Test — no 10× pilot scenario
37. [ ] Disaster Recovery — no drill
38. [ ] Backup — scripts and runbook exist; no scheduled job or timed restore
39. [ ] QA — 315 unit tests, but no contract/visual/a11y suite
40. [ ] E2E — journey exists; not executed on the current commit locally
41. [ ] Security Test — no current external scan/DAST
42. [x] Migration — Drizzle migrations applied in CI
43. [ ] Documentation — product/ops/state/API updated; historical TODO files still stale
44. [ ] Support — tickets/escalation code and runbook exist; no staffing rota/SLA tooling
45. [ ] Pilot — no institution, training or support plan
46. [ ] Rollout — no cohort plan or feature-flag sequence
47. [ ] Production Readiness — blocked by gates 2, 27, 30, 31, 36, 37, 38, 45, 46
48. [ ] Go-Live — not approved
49. [ ] Post-Launch Verification — not started
50. [ ] Continuous Improvement — not started
