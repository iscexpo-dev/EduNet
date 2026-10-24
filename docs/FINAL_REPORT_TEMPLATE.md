# EduNet Final Report Template

Use this template for every autonomous run. Replace every placeholder with
executed evidence. Never write PASS, DEPLOYED or COMPLETE without a matching
command, test, drill or deployment record.

Status vocabulary:

- `PASS` — implemented and verified in this run.
- `FIXED` — was failing/missing, repaired and re-verified.
- `PARTIAL` — implemented but a named surface or evidence is missing.
- `BLOCKED` — cannot progress without an external prerequisite.
- `NOT RUN` / `NOT STARTED` — no evidence exists; do not imply success.
- `NOT APPLICABLE` — the capability is intentionally out of scope.

```text
EDUNET AUTONOMOUS RUN REPORT

Repository:
Branch:
Commit (audit start):
Commit (final):
Run window (UTC):
Environment (node / pnpm / postgres / docker / playwright):

--------------------------------------------------------------------------------
VERIFICATION (exact commands and results)
--------------------------------------------------------------------------------
Install:            PASS/FIXED/BLOCKED  <command>  <summary>
Typecheck:          PASS/FIXED/BLOCKED  <command>  <N/N tasks>
Lint:               PASS/FIXED/BLOCKED  <command>  <errors/warnings>
Unit tests:         PASS/FIXED/BLOCKED  <command>  <N/N tasks, N tests>
Build:              PASS/FIXED/BLOCKED  <command>  <N/N tasks>
Dependency audit:   PASS/FIXED/BLOCKED  <command>  <findings>
Migration check:    PASS/FIXED/BLOCKED  <command>  <N migrations>
DB integration:     PASS/BLOCKED        <command>  <reason if blocked>
Browser E2E:        PASS/BLOCKED        <command>  <reason if blocked>
Container build:    PASS/BLOCKED        <command>  <reason if blocked>
Ops script tests:   PASS/FIXED/BLOCKED  <command>  <summary>
Format check:       PASS/FIXED/BLOCKED  <command>  <summary>
Restore drill:      PASS/BLOCKED/NOT RUN <command> <duration if run>

--------------------------------------------------------------------------------
ROADMAP WORKSTREAMS
--------------------------------------------------------------------------------
Foundation:               PASS/PARTIAL/BLOCKED
Architecture:             PASS/PARTIAL/BLOCKED
Technology Platform:      PASS/PARTIAL/BLOCKED
Design System:            PASS/PARTIAL/BLOCKED
Identity:                 PASS/PARTIAL/BLOCKED
RBAC:                     PASS/PARTIAL/BLOCKED
Student:                  PASS/PARTIAL/BLOCKED
Parent:                   PASS/PARTIAL/BLOCKED
Teacher:                  PASS/PARTIAL/BLOCKED
LMS:                      PASS/PARTIAL/BLOCKED
Assignments:              PASS/PARTIAL/BLOCKED
Assessment:               PASS/PARTIAL/BLOCKED
Live Learning:            PASS/PARTIAL/BLOCKED
Tutoring:                 PASS/PARTIAL/BLOCKED
Extracurricular:          PASS/PARTIAL/BLOCKED
Content:                  PASS/PARTIAL/BLOCKED
Communication:            PASS/PARTIAL/BLOCKED
Calendar:                 PASS/PARTIAL/BLOCKED
Search:                   PASS/PARTIAL/BLOCKED
Notifications:            PASS/PARTIAL/BLOCKED
Analytics:                PASS/PARTIAL/BLOCKED
AI:                       PASS/PARTIAL/BLOCKED
Support:                  PASS/PARTIAL/BLOCKED
Offline:                  PASS/PARTIAL/BLOCKED
Internationalization:     PASS/PARTIAL/BLOCKED
Admin:                    PASS/PARTIAL/BLOCKED
Institution Management:   PASS/PARTIAL/BLOCKED
Integrations:             PASS/PARTIAL/BLOCKED
Data Architecture:        PASS/PARTIAL/BLOCKED
Security:                 PASS/PARTIAL/BLOCKED
Privacy:                  PASS/PARTIAL/BLOCKED
Infrastructure:           PASS/PARTIAL/BLOCKED
DevOps:                   PASS/PARTIAL/BLOCKED
Observability:            PASS/PARTIAL/BLOCKED
Performance:              PASS/PARTIAL/BLOCKED
QA:                       PASS/PARTIAL/BLOCKED
Accessibility:            PASS/PARTIAL/BLOCKED
Backup/DR:                PASS/PARTIAL/BLOCKED
Documentation:            PASS/PARTIAL/BLOCKED
Support Operations:       PASS/PARTIAL/BLOCKED
Pilot:                    PASS/PARTIAL/BLOCKED/NOT STARTED
Rollout:                  PASS/PARTIAL/BLOCKED/NOT STARTED
Operations:               PASS/PARTIAL/BLOCKED
Business/Cost:            PASS/PARTIAL/BLOCKED
KPI:                      PASS/PARTIAL/BLOCKED
Release Governance:       PASS/PARTIAL/BLOCKED

--------------------------------------------------------------------------------
DEPLOYMENT
--------------------------------------------------------------------------------
Staging:             DEPLOYED/NOT DEPLOYED/BLOCKED
Pilot execution:     COMPLETE/NOT STARTED/BLOCKED
Rollback runbook:    COMPLETE/PARTIAL
Production:          DEPLOYED/NOT DEPLOYED/BLOCKED

--------------------------------------------------------------------------------
CHANGES IN THIS RUN
--------------------------------------------------------------------------------
<file> — <why>

--------------------------------------------------------------------------------
REMAINING BLOCKERS
--------------------------------------------------------------------------------
1. <blocker> — owner / required prerequisite / next safe action

--------------------------------------------------------------------------------
DEFERRED (INTENTIONAL)
--------------------------------------------------------------------------------
1. <item> — reason and extension point

--------------------------------------------------------------------------------
STATE FILES UPDATED
--------------------------------------------------------------------------------
[ ] PROGRESS_STATE.json
[ ] todo/ACTIVE-PLAN.md
[ ] docs/EDUNET-IMPLEMENTATION-STATE.md
[ ] docs/EDUNET-ROADMAP-GAP-MATRIX.md
[ ] docs/EDUNET-FINAL-STATUS.md
[ ] docs/deployment/DEPLOYMENT-READINESS.md (if deployment evidence changed)

Overall status: READY / NOT READY
Confidence: <high/medium/low> — <one-line justification>
```
