# EduNet Roadmap Gap Matrix

Last updated: 2026-10-23
Baseline: `main` at `2dc560f` plus the AI service completion in the working tree
Source of truth for requirements: `docs/product/PRODUCT-FOUNDATION.md`

## Status Legend

| Status | Meaning |
|--------|---------|
| `VERIFIED` | Implemented and proven by an executable gate (test/build/migration) in the current evidence set |
| `COMPLETE` | Implemented and covered by tests, but not independently re-verified this session |
| `PARTIAL` | Core backend or primitive exists; a user-facing or operational layer is missing |
| `NEEDS HARDENING` | Feature exists but a known security/reliability gap must close before launch |
| `MISSING` | No implementation |
| `BLOCKED` | Cannot progress without an external dependency or environment |
| `CI ONLY` | Gate is configured and has passed previously, but cannot run in this sandbox |

This matrix deliberately does not call a domain complete when only its API
exists. A launch domain requires the API, the user experience, authorization
coverage and an operational story.

## Verification Snapshot

| Gate | Command | Result |
|------|---------|--------|
| Typecheck | `pnpm typecheck` | **27/27 tasks PASS** |
| Lint | `pnpm lint` | **32/32 tasks PASS**, 0 errors, 252 warnings |
| Unit tests | `pnpm test` | **37/37 tasks PASS**, 323 tests across 16 packages |
| Build | `pnpm build` | **21/21 tasks PASS**, including the Next.js production build |
| Migrations | `pnpm --filter @edunet/database migrate` | `CI ONLY` in this sandbox (no PostgreSQL binary) |
| Database integration | `pnpm --filter @edunet/database test:integration` | `CI ONLY` |
| Browser E2E | `pnpm --filter @edunet/web test:e2e` | `CI ONLY` |
| Backup/restore scripts | `bash -n scripts/*.sh` | Syntax PASS; no restore drill yet |

## 1-10. Product, Architecture, Platform

| # | Workstream | Status | Evidence / Gap |
|---|-----------|--------|----------------|
| 1 | Product foundation | COMPLETE | `docs/product/PRODUCT-FOUNDATION.md`: vision, scope, personas, journeys, FRs, NFRs, KPIs, risks, decisions, milestones |
| 2 | Architecture and domain boundaries | PARTIAL | 18 services, shared packages, lazy DB, canonical RBAC, single-origin gateway; no deployment topology or contract tests |
| 3 | Design system | PARTIAL | 16 primitives in `@edunet/ui` (Button, Input, Select, Table, Tabs, Modal, Drawer, Dropdown, Toast, Alert, Badge, Card, EmptyState, FilterBar, Pagination, Skeleton), tokens, dark mode; no icon system, formal RTL audit or component docs |
| 4 | Identity and authentication | PARTIAL | Register/login/refresh, password reset, email/phone verification, sessions, lockout, audit; MFA, OAuth/OIDC, SSO and suspicious-login detection missing |
| 5 | RBAC and multi-tenancy | VERIFIED | Canonical `@edunet/rbac`; 40 tests; every service uses shared middleware; tenant isolation covered in integration suite (CI) |
| 6 | Database and migrations | VERIFIED (CI ONLY locally) | Drizzle schema/migrations for LMS, platform, AI, support; constraints proven previously on PostgreSQL 16; no local DB in this sandbox |
| 7 | Student platform | PARTIAL | Academic profiles, attendance, achievements, certificates, streaks and timeline exist in `platform`; no student UI beyond courses/assignments |
| 8 | Parent platform | PARTIAL | Relationship-scoped child progress/grades/submissions API; no parent dashboard |
| 9 | Teacher platform | PARTIAL | Course/lesson/assignment/quiz creation, roster and grading UI; no attendance, class analytics or workload UI |
| 10 | LMS core | COMPLETE | Courses, modules, lessons, resources, enrolment, progress; student/teacher journeys covered by E2E (CI) |

## 11-20. Learning Experience

| # | Workstream | Status | Evidence / Gap |
|---|-----------|--------|----------------|
| 11 | Content, media and versioning | PARTIAL | Modules, lessons, resources, progress, version history, filesystem media with signed URLs, MIME allowlist and 25 MB cap; objectives/bookmarks/notes/reviews tables have no routes, no S3 provider |
| 12 | Assignments and submissions | PARTIAL | Deadlines, rubrics, autosave, revisions, grade revisions, feedback, ownership checks; assignment attachments and late-submission policy missing |
| 13 | Assessment engine | PARTIAL | Five objective types (MCQ, multiple select, true/false, short answer, fill-in-blank, matching), partial credit, manual grading, grade history, rechecks, seeded randomisation; basic student/teacher UI only |
| 14 | Question banks and exam analytics | PARTIAL | Banks, attach/list/update, randomisation; exam item analytics and blueprint coverage missing |
| 15 | Offline and PWA | PARTIAL | Offline queue, backoff, dedupe, conflict resolution, download planner, service worker, banner, offline page; queue is not wired into mutation flows and no background sync |
| 16 | Internationalisation | COMPLETE | Bengali/English catalogues, `Intl` formatting, locale detection, interpolation, web language toggle; native Bengali review pending |
| 17 | Accessibility | PARTIAL | Semantic primitives and focus styles; no WCAG 2.1 AA audit, keyboard test suite or screen-reader verification |
| 18 | Notifications | PARTIAL | In-app notification CRUD, read state, preferences, templates; no email/SMS push adapters or delivery worker |
| 19 | Search | PARTIAL | Tenant-scoped service; `ILIKE` matching, no ranking, facets, typo tolerance or index strategy |
| 20 | Analytics | PARTIAL | Course, student, assignment and engagement endpoints; no dashboards, warehouse/export or KPI instrumentation |

## 21-30. Engagement, AI, Support, Administration

| # | Workstream | Status | Evidence / Gap |
|---|-----------|--------|----------------|
| 21 | Communication | PARTIAL | Conversations, messages, read state, participants, reports, moderation queue, blocks, forums; no chat UI or realtime transport |
| 22 | Calendar | PARTIAL | CRUD, attendees, reminders, ICS export, upcoming feed; no calendar UI |
| 23 | Tutoring | PARTIAL | Tutor profiles, availability, booking, listing, update/cancel; no matching, payments or session UI |
| 24 | Extracurricular | PARTIAL | Events, bookings, attendance; no discovery UI |
| 25 | Live learning | PARTIAL | Live-class records, join/leave events, attendance, analytics; no video provider integration |
| 26 | AI platform | PARTIAL | Consent gating, crisis short-circuit, PII redaction, safety screening, quota, model fallback, prompts, feedback, usage, audit, conversations/messages; no AI UI, no provider configured locally, moderation is rule-based |
| 27 | Support and counseling | PARTIAL | Help resources, tickets, messages, escalation, counselor profiles, appointments; no support/counselor UI |
| 28 | Academics and attendance | PARTIAL | Years, terms, classes, sections, subjects, class subjects, enrolments, attendance, grade calculation; no admin UI |
| 29 | Administration and feature flags | PARTIAL | Flags, settings, notification templates, integrations, webhooks; no admin console |
| 30 | Privacy and consent | PARTIAL | Consent records, AI consent enforcement, data-subject request API; export/erase execution and retention jobs missing |

## 31-40. Security, Infrastructure, Quality

| # | Workstream | Status | Evidence / Gap |
|---|-----------|--------|----------------|
| 31 | Integrations and webhooks | PARTIAL | Integration configs and webhook endpoint registration; delivery, retries and signing not proven |
| 32 | Audit and compliance | PARTIAL | Identity audit, platform audit with verification, AI audit; no retention policy or immutable external store |
| 33 | Security hardening | NEEDS HARDENING | No rate limiting, no production CORS policy, tokens in localStorage, no CSP/helmet, no recent external vulnerability scan |
| 34 | Observability | COMPLETE | Request IDs, structured logs, bounded Prometheus metrics, `/health`, `/ready`, `/metrics` across services; dashboards/alert routing not provisioned |
| 35 | CI/CD | PARTIAL | GitHub Actions installs, migrates, lints, typechecks, runs DB integration, tests and Playwright E2E; first hosted run on the current commit pending and no deployment job |
| 36 | Infrastructure and containers | MISSING | No Dockerfile, compose, IaC, managed-Postgres provisioning or CDN configuration |
| 37 | API gateway / single origin | PARTIAL | `@edunet/gateway` maps all 18 prefixes, streams bodies and has 8 tests; no deployment manifest, TLS or end-to-end gateway test |
| 38 | Backup and disaster recovery | PARTIAL | `scripts/backup-db.sh`, `scripts/restore-db.sh`, checksum and runbook; no scheduled job, media snapshot or timed restore drill |
| 39 | Performance and load testing | MISSING | No k6/artillery scenario, p95 baseline or 10× pilot load test |
| 40 | QA strategy | PARTIAL | 315 unit tests, 22 test files, one browser journey (CI); no contract, visual, accessibility or cross-browser suite |

## 41-47. Operations and Launch

| # | Workstream | Status | Evidence / Gap |
|---|-----------|--------|----------------|
| 41 | Documentation | PARTIAL | Product, operations, API, security and state docs being refreshed; some historical docs remain stale |
| 42 | Pilot readiness | MISSING | No pilot school, support rota, training material, data migration plan or success baseline |
| 43 | Rollout | MISSING | No cohort plan, feature-flag rollout sequence or go/no-go review |
| 44 | Support operations | PARTIAL | Crisis escalation exists in code and runbook; no staffing rota or SLA tooling |
| 45 | Cost and budget model | PARTIAL | AI token/cost metering exists; no infrastructure or support cost model |
| 46 | KPI instrumentation | MISSING | KPI definitions exist; event collection and reporting pipeline not wired |
| 47 | Release governance | PARTIAL | Release gates documented in the product foundation and operations runbook; no approval record or change log process |

## Critical Path to Pilot

Ordered by launch risk, not feature appeal:

1. **Deploy and test the gateway** — the implementation exists; it still needs
   TLS termination, upstream readiness, an end-to-end run and deployment
   manifests before the web app can rely on one origin (blocker #37).
2. **Containers and deployment manifests** — reproducible deploy, migrations
   and rollback (#36, #35).
3. **Security hardening** — rate limiting, CORS, CSP, token storage, scanner
   (#33) before exposing any endpoint publicly.
4. **Backup/restore drill** — prove RTO with media included (#38).
5. **Wire offline sync** into submission/progress/autosave or clearly ship
   offline as read-only (#15).
6. **AI UI + provider configuration + human escalation path** — otherwise the
   completed AI backend is unreachable (#26).
7. **Admin, parent, communication and support UI** — current backends have no
   user surface (#7, #8, #21, #27, #29).
8. **Load, accessibility and Bengali review** — the remaining launch quality
   gates (#17, #39, #16).
9. **Pilot plan, KPI pipeline and go/no-go** (#42, #43, #46).

## What Is Genuinely Done

The foundation is not a scaffold: authentication is hardened, tenant isolation
is enforced by a shared package, the LMS core works end to end, assessment
grading is substantive, media handling is real and path-safe, offline
primitives are deterministic and tested, AI has consent/safety/quota/audit
controls, and every service emits health, metrics and structured logs. The
remaining gap is predominantly the launch surface (gateway, UI, deployment,
hardening) rather than the domain model.
