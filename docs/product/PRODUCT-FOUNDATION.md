# EduNet Product Foundation

Last updated: 2026-10-23
Status: Phase 00 baseline — approved for implementation tracking

This document consolidates the product vision, scope, personas, journeys,
requirements, non-functional targets, acceptance rules, metrics, risks and
release plan. It is the source of truth for *what* EduNet must do; the gap
matrix is the source of truth for *what is built*.

## 1. Vision

EduNet is a multi-tenant learning platform for Bangladesh that works on
low-bandwidth devices, in Bengali and English, and gives students, teachers,
parents and administrators one coherent learning record. It must be safe for
minors, usable offline, and operable by a small team without a dedicated SRE
function.

## 2. Problem Statements

| User | Problem | Product response |
|------|---------|------------------|
| Student | Connectivity drops mid-lesson; content is lost | Offline queue, downloadable lessons, resumable progress |
| Teacher | Grading and class administration consume teaching time | Auto-graded objective questions, roster views, bulk analytics |
| Parent | Little visibility into progress or attendance | Guardian dashboard, consent-scoped child data, notifications |
| Admin | Disconnected tools and weak auditability | Tenant administration, RBAC, audit trail, analytics |
| Institution | Data residency and child-safety obligations | Tenant isolation, consent records, retention and privacy controls |

## 3. Scope

### Launch scope (MVP / pilot)

- Identity: registration, login, refresh, password reset, email/phone
  verification, session revocation, lockout, audit events.
- LMS: courses, modules, lessons, resources, media, enrollment, assignments,
  submissions with revisions/rubrics/autosave, quizzes with five objective
  question types, attempts, manual grading, grade history and rechecks.
- Learning experience: student and teacher dashboards, lesson progress,
  assignment submission and grading, quiz attempts, offline banner and queue.
- Parent: child linking, progress, grades, submissions.
- Engagement: calendar, tutoring, extracurricular events, live-class records.
- Communication: direct conversations, read state, blocks, reports, forums.
- AI: consent-gated tutor/assistant, safety screening, quotas, feedback, audit.
- Support: help resources, tickets, escalation, counselor appointments.
- Administration: academic years/terms/classes/sections/subjects, attendance,
  feature flags, settings, consents, privacy requests, integrations, webhooks,
  audit verification.
- Platform quality: structured logs, `/health`, `/ready`, `/metrics`, CI gates,
  backup/restore scripts, Bengali/English UI, responsive design system.

### Explicitly out of scope for launch

- Native iOS/Android clients (PWA only).
- Payment processing and subscriptions.
- Public social network features beyond moderated course forums.
- District/national data exchange beyond generic webhook/integration config.
- Multi-region active-active deployment.

## 4. Personas

| Persona | Goals | Constraints | Success looks like |
|---------|-------|-------------|--------------------|
| Student (শিক্ষার্থী) | Learn, submit work, see progress | Shared/low-end device, intermittent network, Bengali-first | Completes a lesson and assignment offline, syncs on reconnect |
| Teacher (শিক্ষক) | Teach and grade efficiently | Large classes, limited time | Creates a course, grades a queue, sees weak topics |
| Parent (অভিভাবক) | Understand and support their child | Low technical confidence, privacy concerns | Sees attendance, grades and recent feedback without exposing other children |
| Counselor / Support | Help students safely | Sensitive disclosures, escalation duties | Receives escalated cases with context and no PII leakage |
| Institution Admin (প্রশাসক) | Run the institution | Compliance, term boundaries, audit expectations | Manages classes, staff, flags and consent records with traceability |
| Platform Operator | Keep the service healthy | Small team, no 24/7 NOC | Detects, rolls back and restores within documented RTO |

## 5. Core Journeys

1. **Student learning loop:** register → join organization → browse catalogue →
   enroll → complete lesson → submit assignment → take quiz → view grade and
   feedback. Offline progress is queued and replayed in order.
2. **Teacher loop:** create course → add modules/lessons/resources → publish →
   enroll roster → create assignment/quiz → grade → review analytics.
3. **Parent loop:** register → link child with verification → view dashboard →
   receive notification → contact teacher/support.
4. **Support loop:** open ticket → triage → reply → escalate → resolve; crisis
   content is surfaced before an AI response is generated.
5. **Admin loop:** create academic year/term/classes → assign subjects and
   teachers → track attendance → review audit and consent records.
6. **Operator loop:** deploy → run migrations → verify readiness → monitor
   metrics → roll back or restore from backup on failure.

## 6. Functional Requirements

Requirements are numbered for acceptance and traceability.

| ID | Requirement | Acceptance rule |
|----|-------------|-----------------|
| FR-01 | Users authenticate with email/password and refresh tokens | Access tokens cannot be used as refresh tokens and vice versa |
| FR-02 | Passwords reset without account enumeration | Request always returns 202; token is single-use and expiring |
| FR-03 | All tenant data is organization-scoped | Cross-organization reads and writes return 403/404 |
| FR-04 | Roles are enforced server-side | Permissions come from `@edunet/rbac`, not route-local copies |
| FR-05 | Teachers own their courses | Non-owner teachers cannot mutate another teacher's course |
| FR-06 | Students enrol once per course | Duplicate enrolment is rejected |
| FR-07 | Lessons track completion | Progress is resumable and monotonic |
| FR-08 | Assignments support drafts and resubmission | Autosave is idempotent; revisions are retained |
| FR-09 | Grading is auditable | Grade changes create revision records with actor and reason |
| FR-10 | Quizzes never expose answers before submission | Presentation strips keys; grading is server-side |
| FR-11 | Offline actions survive reconnect | Queue is ordered, de-duplicated and retried with backoff |
| FR-12 | AI requires recorded consent | No provider call occurs without an active `ai_processing` consent |
| FR-13 | AI never returns unsafe content | Crisis input short-circuits to human help; unsafe output is blocked |
| FR-14 | AI usage is bounded | Per-tenant daily token quota is enforced |
| FR-15 | Parents see only linked children | Every parent read checks the relationship |
| FR-16 | Notifications respect preferences | Disabled channels are not delivered |
| FR-17 | Search is tenant-scoped | Results never include another organization |
| FR-18 | Admin changes are audited | Audit entries are append-only and verifiable |
| FR-19 | Data subject requests are tracked | Requests have status, owner and timestamps |
| FR-20 | The UI is usable in Bengali and English | Language choice persists; dates/numbers use `Intl` |

## 7. Non-Functional Requirements

| Area | Target | Current evidence |
|------|--------|------------------|
| API latency | p95 < 500 ms for reads, < 1 s for writes | Not load-tested |
| Page load | < 3 s on 3G for shell; lesson media streamed | Not measured |
| Availability | 99.9% monthly at pilot | No SLA instrumentation yet |
| Durability | RPO ≤ 24 h (daily backup); RTO ≤ 4 h | Scripts documented, not drilled |
| Security | OWASP ASVS L1 for auth and tenant isolation | Unit/RBAC tests; external scan pending |
| Privacy | Consent before AI; data export/erase workflow | Consent and request tables/API exist |
| Accessibility | WCAG 2.1 AA for core flows | Component primitives only; audit pending |
| Localisation | Bengali + English, `bn-BD`/`en-GB` formatting | `@edunet/i18n` + web toggle wired |
| Offline | Core reading and progress work offline | Queue primitives + banner + service worker |
| Observability | Request IDs, structured logs, metrics, health probes | Implemented in `@edunet/observability` |
| Scalability | Stateless services; horizontal scale behind a gateway | Services stateless; gateway not implemented |
| Compatibility | Current Chrome/Edge/Firefox/Safari; Android 9+ | Not device-tested |

## 8. Success Metrics and KPI Definitions

| KPI | Definition | Pilot target |
|-----|------------|--------------|
| DAU | Unique users with at least one authenticated action per day | 30% of enrolled users |
| MAU | Unique users with at least one authenticated action per month | 70% of enrolled users |
| Activation | Registered students who complete one lesson within 7 days | ≥ 60% |
| Assignment submission | Assignments submitted on time / assigned | ≥ 80% |
| Course completion | Enrolled students completing all required lessons | ≥ 60% |
| Assessment pass rate | Attempts at or above pass mark / submitted attempts | ≥ 70% |
| Offline recovery | Queued actions synced successfully after reconnect | ≥ 99% |
| Support first response | Time to first human reply | < 24 h |
| AI safety | Unsafe outputs delivered / AI responses | 0 |
| AI quota adherence | Tenants exceeding daily token quota | 0 |
| Uptime | Successful `/ready` checks / total checks | ≥ 99.9% |

Metric sources must be defined before pilot reporting; until then these are
targets, not measured outcomes.

## 9. Constraints and Dependencies

- **Runtime:** Node.js 22, pnpm 9 (repo pins pnpm 8.15 via `packageManager`),
  PostgreSQL 16, Next.js App Router.
- **Hosting:** any container host with managed PostgreSQL. A single API origin
  is required by the current web client; see the gateway gap.
- **Email/SMS:** verification and reset tokens are returned in non-production
  when `DELIVER_EMAILS` is not `true`; a real provider must be configured for
  production.
- **AI provider:** OpenAI-compatible endpoint. If absent, AI features must
  degrade to a clear unavailable response rather than fabricate answers.
- **Object storage:** filesystem provider only; production needs S3-compatible
  storage or a persistent volume with backup.
- **Browser APIs:** service worker and localStorage/IndexedDB; no native push.
- **Compliance:** child-safety escalation, consent, retention and audit are
  product requirements, not optional hardening.

## 10. Risk Register

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|----|------|-----------|--------|------------|-------|
| R-01 | Tenant data leak through a missing org filter | Medium | Critical | Canonical RBAC, integration tests, code review checklist, audit | Backend |
| R-02 | AI returns harmful advice to a minor | Medium | Critical | Consent, crisis short-circuit, output screening, human escalation | AI/Support |
| R-03 | Offline replay duplicates a submission | Medium | High | Idempotency keys, ordering, server-side dedupe tests | Web/Backend |
| R-04 | No API gateway causes broken cross-domain calls in production | High | High | Add reverse proxy or composed edge before pilot | Platform |
| R-05 | Database restore is untested | Medium | Critical | Quarterly restore drill with timed RTO | Operations |
| R-06 | Bengali rendering/translation gaps | Medium | Medium | Catalogue completeness tests, native review | Product |
| R-07 | Support cannot handle crisis volume | Low | High | Escalation playbook, counselor roster, on-call rota | Support |
| R-08 | Single filesystem volume loses media | Medium | High | S3 migration or volume snapshots | Platform |
| R-09 | Dependency vulnerability | Medium | High | CI audit, Dependabot, pinned overrides | Security |
| R-10 | Load unknown before pilot | High | Medium | Load test at 10× pilot cohort before rollout | QA |

## 11. Decision Log

| Date | Decision | Rationale | Consequence |
|------|----------|-----------|-------------|
| 2026-09 | Modular services in one pnpm monorepo | Independent domains with one deployable toolchain | Requires a gateway/composition story |
| 2026-09 | PostgreSQL + Drizzle, single database with tenant columns | Simple operations, strong constraints | Scale-out by service later; cross-service joins avoided |
| 2026-09 | JWT access + refresh with token-kind claim | Stateless auth with revocation via sessions | Web moved tokens out of localStorage to httpOnly cookies (2026-10-24) |
| 2026-10 | AI features are consent-gated and quota-bounded | Child safety and cost control | AI is unavailable until consent is recorded |
| 2026-10 | Offline queue is a pure package with injectable sender | Testable across browser/native | Wiring into every mutation is still required |
| 2026-10 | Objective auto-grading only; subjective work is manual | Trust and auditability | Teacher workload remains for essays |
| 2026-10 | Reliability work precedes new surface area | Launch risk is operational, not feature count | UI for newer backends is deferred |

## 12. Milestones and Release Roadmap

| Milestone | Exit criteria | State |
|-----------|---------------|-------|
| M0 Foundation | Product docs, architecture, CI, migrations, core LMS | Complete |
| M1 Learning platform | Student/teacher journeys, assessments, content, parents | Core complete; UI gaps |
| M2 Engagement | Communication, calendar, tutoring, events, live records | Backend complete; UI absent |
| M3 AI and support | Consent, safety, quotas, tickets, counseling | Backend complete; UI absent |
| M4 Administration | Academics, attendance, flags, audit, privacy, integrations | Backend complete; UI absent |
| M5 Launch readiness | Gateway, backups drilled, load test, accessibility audit, pilot | Not complete |

### Release gates

1. All CI gates green on the release commit.
2. Migrations applied to a staging clone and rollback rehearsed.
3. Backup restored into a clean database within RTO.
4. Tenant-isolation and authorization suite green.
5. Crisis/support escalation tested with a counselor.
6. Accessibility and Bengali review signed off for core journeys.
7. Load test at 10× pilot concurrency with p95 within target.
8. Incident runbook and on-call contacts published.

## 13. Operating Assumptions

- Pilot cohort: one institution, ≤ 2,000 students, ≤ 150 staff.
- Peak concurrency: ≤ 500 users.
- Daily AI budget: 50,000 tokens per organization (configurable).
- Backup window: daily 02:00 Asia/Dhaka; retention 30 days.
- Support hours: 08:00–20:00 Asia/Dhaka, with crisis escalation 24/7.
