# EduNet Pilot Plan

**Status:** NOT STARTED. No participants were invited and no real-user testing
was performed by this repository change.

## 1. Objectives

Validate the core learning loop before real student data is introduced:

- reliable login and role isolation for student, teacher, parent and admin;
- course discovery, enrollment and lesson access;
- assignment submission, teacher grading and student feedback;
- assessment taking and results;
- parent visibility into enrolled children, progress and grades;
- accessibility and low-bandwidth behavior;
- operational readiness: health checks, alerts, backup and support.

## 2. Scope

In scope:

- one pilot organization with synthetic or consented data;
- a small cohort (suggested 20-50 students, 3-5 teachers, 5-10 parents, 1-2
  administrators) in a single timezone;
- the web app, gateway, PostgreSQL and media volume;
- AI features only if consent is recorded and a counselor escalation path is
  staffed. Otherwise disable AI for the pilot.

Out of scope:

- real school-wide migration, payments, native apps, MFA/SSO, and multiple
  gateway replicas (in-process rate limiter).

## 3. Roles and responsibilities

| Role              | Responsibility                                  |
| ----------------- | ----------------------------------------------- |
| Release owner     | GO/NO-GO, evidence record, stop authority       |
| Platform operator | Deployment, monitoring, backup, rollback        |
| Support lead      | Triage, participant communication, incident log |
| Privacy/DPO       | Consent, retention, data-subject requests       |
| Counselor         | Human escalation for crisis/self-harm signals   |
| Teacher champion  | Scenario validation and feedback                |

## 4. Entry criteria

- [ ] `GO-LIVE-CHECKLIST.md` is fully checked for the staging environment.
- [ ] Staging smoke test passes for all four roles.
- [ ] Restore drill evidence is attached.
- [ ] Monitoring and alert routing are confirmed by a test alert.
- [ ] Synthetic accounts are provisioned; no real student data.
- [ ] Participants receive onboarding, privacy notice and support contacts.
- [ ] AI is either disabled or consent + counselor escalation are confirmed.
- [ ] Stop conditions and rollback owner are agreed in writing.

## 5. Synthetic accounts and data

Use role-specific accounts created by an administrator, for example:

- `pilot.student.01@example.org`
- `pilot.teacher.01@example.org`
- `pilot.parent.01@example.org`
- `pilot.admin.01@example.org`

Use clearly fictional names, courses and submissions. Never reuse production
credentials. Store passwords only in the operator secret store and rotate after
the pilot. The smoke script never creates accounts; it only logs in with
accounts provisioned out of band.

## 6. Scenarios

1. **Student:** log in, list courses, open a lesson, submit an assignment, take
   a quiz, view feedback, check notifications.
2. **Teacher:** log in, view roster, create/edit an assignment, grade a
   submission, review quiz results, confirm student isolation.
3. **Parent:** log in, list authorized children, view enrollments, progress and
   grades, confirm another parent's child is inaccessible.
4. **Admin:** verify users, inspect audit events, verify the audit chain, review
   platform settings, disable AI if needed.
5. **Operations:** trigger a test alert, run a backup, confirm `/ready`, execute
   a rollback rehearsal in staging.

## 7. Metrics

| Area          | Metric                                 | Suggested target  |
| ------------- | -------------------------------------- | ----------------- |
| Reliability   | Successful requests / total            | >= 99.5%          |
| Reliability   | p95 API latency                        | <= 500 ms         |
| Reliability   | `/ready` availability                  | >= 99.9%          |
| Activation    | Participants completing login          | >= 90%            |
| Learning      | Assignment submission completion       | >= 80%            |
| Teaching      | Submissions graded within 48 h         | >= 90%            |
| Parent        | Parents viewing a child's progress     | >= 70%            |
| Support       | First response time                    | <= 1 business day |
| Quality       | Critical authorization/privacy defects | 0                 |
| Accessibility | Blocking defects                       | 0                 |

Adjust targets with the release owner before launch. Report actuals, not
estimates.

## 8. Stop conditions

Stop immediately for:

- suspected cross-tenant or unauthorized data access;
- authentication bypass or credential exposure;
- material data loss or a failed restore during the pilot;
- sustained outage or inability to recover within RTO;
- harmful AI output delivered to a minor;
- inability to reach the counselor escalation path.

On stop: disable the affected route or AI provider, preserve logs and audit
rows, notify the DPO and release owner, and record the timeline.

## 9. Data handling and privacy

- Use the minimum data needed; prefer synthetic data for the first cohort.
- Record consent for AI processing; default to disabled if consent is absent.
- Do not put student names or IDs in alert labels, logs or tickets.
- Honor data-subject export/erase requests within the documented window.
- Delete pilot data or anonymize it at the end of the pilot unless retention is
  approved.

## 10. Feedback and exit

Collect structured feedback after each scenario (task success, friction,
accessibility, bandwidth). Hold a daily 15-minute triage during week one, then
weekly. Exit the pilot when success targets are met for two consecutive weeks
and no critical defects remain. Record a GO/NO-GO for broader rollout with
evidence.

## 11. Current status

- Environment: **NOT DEPLOYED**.
- Smoke test: implemented, **NOT RUN against staging** (no credentials/target).
- Participants: **NONE**.
- Pilot start date: **NOT SCHEDULED**.
