# EduNet API Endpoints

## Authentication (`/api/auth`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | None | Register new user |
| POST | `/login` | None | Login and get tokens |
| POST | `/refresh` | None | Refresh access token |
| GET | `/me` | Bearer | Get current user profile |

## Organizations (`/api/organizations`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | Admin | Create organization |
| GET | `/` | Any | List organizations |
| GET | `/:id` | Any | Get organization |
| PUT | `/:id` | Admin | Update organization |

## Users (`/api/users`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Admin/Teacher | List users |
| GET | `/:id` | Any | Get user |
| PUT | `/:id` | Admin | Update user |
| PUT | `/:id/password` | Any | Update password |
| PUT | `/:id/verify` | Admin | Verify user |
| DELETE | `/:id` | Admin | Delete user |

## Courses (`/api/courses`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | Teacher/Admin | Create course |
| GET | `/` | Any | List courses |
| GET | `/:id` | Any | Get course |
| PUT | `/:id` | Teacher/Admin | Update course |
| DELETE | `/:id` | Teacher/Admin | Delete course |

## Enrollments (`/api/enrollments`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | Student/Admin | Create enrollment |
| GET | `/` | Any | List enrollments |
| GET | `/:id` | Any | Get enrollment |
| PUT | `/:id` | Teacher/Admin | Update enrollment |
| DELETE | `/:id` | Student/Admin | Delete enrollment |

## Assignments (`/api/assignments`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | Teacher/Admin | Create assignment |
| GET | `/` | Any | List assignments |
| GET | `/:id` | Any | Get assignment |
| PUT | `/:id` | Teacher/Admin | Update assignment |
| DELETE | `/:id` | Teacher/Admin | Delete assignment |

## Submissions (`/api/submissions`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | Student | Create submission |
| GET | `/` | Any | List submissions |
| GET | `/:id` | Any | Get submission |
| PUT | `/:id/grade` | Teacher/Admin | Grade submission |
| DELETE | `/:id` | Student/Admin | Delete submission |

## Content (`/api/content`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/lessons` | Teacher/Admin | Create lesson |
| GET | `/lessons` | Any | List lessons |
| GET | `/lessons/:id` | Any | Get lesson |
| PUT | `/lessons/:id` | Teacher/Admin | Update lesson |
| DELETE | `/lessons/:id` | Teacher/Admin | Delete lesson |
| POST | `/lesson-progress` | Any | Create progress |
| GET | `/lesson-progress` | Any | List progress |
| POST | `/resources` | Teacher/Admin | Create resource |
| GET | `/resources` | Any | List resources |

## Assessments (`/api/assessments`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/quizzes` | Teacher/Admin | Create quiz |
| GET | `/quizzes` | Any | List quizzes |
| GET | `/quizzes/:id` | Any | Get quiz |
| POST | `/questions` | Teacher/Admin | Create question |
| GET | `/questions` | Any | List questions |
| POST | `/quiz-attempts` | Student | Start attempt |
| GET | `/quiz-attempts` | Any | List attempts |
| PUT | `/quiz-attempts/:id/submit` | Student | Submit attempt |

## Parents (`/api/parents`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/relationships` | Parent/Admin | Create relationship |
| GET | `/children` | Parent | List children |
| GET | `/children/:childId/enrollments` | Parent/Admin | Child enrollments |
| GET | `/children/:childId/submissions` | Parent/Admin | Child submissions |

## Notifications (`/api/notifications`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/notifications` | Admin | Create notification |
| GET | `/notifications` | Any | List notifications |
| PUT | `/notifications/:id/read` | Any | Mark as read |
| PUT | `/notifications/read-all` | Any | Mark all as read |
| GET | `/preferences` | Any | Get preferences |
| PUT | `/preferences` | Any | Update preferences |

## Search (`/api/search`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Any | Search (q, type, organizationId) |

## Analytics (`/api/analytics`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/courses/:courseId/analytics` | Teacher/Admin | Course analytics |
| GET | `/courses/:courseId/analytics/students` | Teacher/Admin | Student performance |
| GET | `/courses/:courseId/analytics/assignments` | Teacher/Admin | Assignment performance |
| GET | `/courses/:courseId/analytics/engagement` | Teacher/Admin | Course engagement |

## Identity extensions (`/api/auth`)

All routes except register/login/refresh/password-reset require a Bearer token.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/password-reset/request` | None | Request reset; always 202 to prevent enumeration |
| POST | `/password-reset/confirm` | None | Consume reset token, rotate password, revoke sessions |
| POST | `/verification/request` | Bearer | Issue email/phone verification token |
| POST | `/verification/confirm` | Bearer | Consume verification token |
| GET | `/sessions` | Bearer | List active device sessions |
| DELETE | `/sessions/:id` | Bearer | Revoke one session |
| GET | `/audit-events` | Admin | List identity audit events |

## Courses extensions (`/api/courses`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/:id/publish` | Teacher/Admin | Publish a course |
| POST | `/:id/unpublish` | Teacher/Admin | Unpublish a course |

## Content extensions (`/api/content`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/lesson-progress/:id` | Bearer | Get progress record |
| PUT | `/lesson-progress/:id` | Bearer | Update progress |
| DELETE | `/lesson-progress/:id` | Bearer | Delete progress |
| GET | `/resources/:id` | Bearer | Get resource |
| PUT | `/resources/:id` | Teacher/Admin | Update resource |
| DELETE | `/resources/:id` | Teacher/Admin | Delete resource |
| POST | `/media` | Teacher/Admin | Upload media (multipart, 25 MB cap) |
| GET | `/media` | Bearer | List media |
| GET | `/media/:id/access` | Bearer | Mint a short-lived signed URL |
| DELETE | `/media/:id` | Teacher/Admin | Soft-delete media |
| GET | `/files/*` | None (signed) | Stream a signed media object |

## Submissions extensions (`/api/submissions`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| PUT | `/:id/autosave` | Student | Save draft (idempotent) |
| GET | `/:id/history` | Bearer | Submission and grade revision history |
| PUT | `/:id/grade` | Teacher/Admin | Grade submission with revision history |
| PUT | `/assignments/:assignmentId/rubric` | Teacher/Admin | Create/replace rubric (complete rubric required) |
| GET | `/assignments/:assignmentId/rubric` | Bearer | Get rubric criteria |

## Assessment extensions (`/api/assessments`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/question-banks` | Teacher/Admin | Create question bank |
| GET | `/question-banks` | Teacher/Admin | List question banks |
| PUT | `/question-banks/:id` | Teacher/Admin | Update question bank |
| POST | `/questions/attach-to-bank` | Teacher/Admin | Attach questions to a bank |
| GET | `/quiz-attempts/:id/presentation` | Student | Randomised questions/options without answers |
| POST | `/quiz-attempts/:id/manual-grade` | Teacher/Admin | Manual grade with revision history |
| GET | `/quiz-attempts/:id/grade-history` | Teacher/Admin | Grade revision history |
| POST | `/quiz-attempts/:id/recheck` | Student | Open a recheck request |
| GET | `/recheck-requests` | Teacher/Admin | List recheck requests |
| POST | `/recheck-requests/:id/decision` | Teacher/Admin | Approve/reject a recheck |

## AI (`/api/ai`)

`AI_REQUIRE_CONSENT` defaults to true in production. Every call is scoped to the
authenticated user and organization. A recorded, unrevoked `ai_processing`
consent is required; unsafe or crisis input bypasses model generation.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/conversations` | Bearer | List own conversations |
| POST | `/conversations` | Bearer | Create conversation |
| GET | `/conversations/:id` | Bearer | Get conversation |
| DELETE | `/conversations/:id` | Bearer | Archive conversation |
| GET | `/conversations/:id/messages` | Bearer | List messages |
| POST | `/conversations/:id/messages` | Bearer | Send message and receive AI reply |
| POST | `/messages/:id/feedback` | Bearer | Rate an assistant message |
| GET | `/usage/today` | Bearer | Today's tokens, cost and quota |
| GET | `/prompts` | Bearer | List tenant/platform prompt templates |
| PUT | `/prompts` | Admin | Upsert tenant prompt template |

## Communication (`/api/communication`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/conversations` | Bearer | List conversations |
| POST | `/conversations` | Bearer | Create conversation |
| GET | `/conversations/:id` | Bearer | Get conversation |
| GET | `/conversations/:id/messages` | Bearer | List messages |
| POST | `/conversations/:id/messages` | Bearer | Send message |
| POST | `/conversations/:id/read` | Bearer | Mark read |
| POST | `/conversations/:id/participants` | Bearer | Add participants |
| POST | `/messages/:id/report` | Bearer | Report a message |
| GET | `/moderation/queue` | Admin | Moderation queue |
| POST | `/moderation/reports/:id/resolve` | Admin | Resolve report |
| GET | `/blocks` | Bearer | List blocked users |
| POST | `/blocks` | Bearer | Block a user |
| DELETE | `/blocks/:userId` | Bearer | Unblock a user |
| GET | `/forums` | Bearer | List forums |
| POST | `/forums` | Bearer | Create forum |
| GET | `/forums/:id/topics` | Bearer | List topics |
| POST | `/forums/:id/topics` | Bearer | Create topic |
| GET | `/topics/:id` | Bearer | Get topic |
| POST | `/topics/:id/posts` | Bearer | Create post |
| PATCH | `/topics/:id` | Bearer | Update topic |
| POST | `/posts/:id/moderate` | Admin | Moderate a post |

## Engagement (`/api/engagement`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/upcoming` | Bearer | Upcoming calendar/tutoring/event feed |
| GET | `/calendar` | Bearer | List calendar events |
| GET | `/calendar.ics` | Bearer | Export ICS |
| POST | `/calendar` | Staff | Create event |
| GET | `/calendar/:id` | Bearer | Get event |
| PUT | `/calendar/:id` | Staff | Update event |
| DELETE | `/calendar/:id` | Staff | Delete event |
| POST | `/calendar/:id/attendance` | Bearer | Set attendance |
| GET | `/calendar/:id/attendees` | Bearer | List attendees |
| POST | `/calendar/:id/reminder` | Bearer | Set reminder |
| GET | `/tutors` | Bearer | List tutors |
| PUT | `/tutors/me` | Tutor/Teacher/Admin | Update own tutor profile |
| GET | `/tutoring/availability` | Bearer | List availability |
| POST | `/tutoring/availability` | Staff | Create availability |
| DELETE | `/tutoring/availability/:id` | Staff | Delete availability |
| POST | `/tutoring/sessions` | Bearer | Book session |
| GET | `/tutoring/sessions` | Bearer | List sessions |
| PATCH | `/tutoring/sessions/:id` | Bearer | Update session |
| POST | `/tutoring/sessions/:id/cancel` | Bearer | Cancel session |
| GET | `/events` | Bearer | List extracurricular events |
| POST | `/events` | Staff | Create event |
| PUT | `/events/:id` | Staff | Update event |
| POST | `/events/:id/book` | Bearer | Book event |
| DELETE | `/events/:id/book` | Bearer | Cancel booking |
| GET | `/events/:id/bookings` | Bearer | List bookings |
| POST | `/events/:id/attendance` | Staff | Mark attendance |
| GET | `/live` | Bearer | List live classes |
| POST | `/live` | Staff | Create live class |
| GET | `/live/:id` | Bearer | Get live class |
| PATCH | `/live/:id` | Staff | Update live class |
| POST | `/live/:id/join` | Bearer | Join |
| POST | `/live/:id/leave` | Bearer | Leave |
| GET | `/live/:id/events` | Bearer | List class events |
| POST | `/live/:id/events` | Bearer | Add class event |
| GET | `/live/:id/analytics` | Staff | Attendance analytics |

## Support (`/api/support`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/resources` | Bearer | List help resources |
| POST | `/resources` | Staff | Create/update resource |
| GET | `/resources/:slug` | Bearer | Get resource |
| POST | `/tickets` | Bearer | Open ticket |
| GET | `/tickets` | Bearer | List own/assigned tickets |
| GET | `/tickets/:id` | Bearer | Get ticket |
| POST | `/tickets/:id/messages` | Bearer | Reply |
| PATCH | `/tickets/:id` | Staff | Update status/priority |
| POST | `/tickets/:id/escalate` | Bearer | Escalate |
| GET | `/counselors` | Bearer | List counselors |
| PUT | `/counselors/me` | Counselor/Admin | Update counselor profile |
| GET | `/counseling/appointments` | Bearer | List appointments |
| POST | `/counseling/appointments` | Bearer | Request appointment |
| PATCH | `/counseling/appointments/:id` | Bearer/Staff | Update appointment |

## Platform administration (`/api/platform`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/POST/PATCH | `/academics/years`, `/academics/years/:id` | Bearer/Admin | Academic years |
| GET/POST | `/academics/terms` | Bearer/Admin | Terms |
| GET/POST/PATCH | `/academics/classes`, `/academics/classes/:id` | Bearer/Admin | Classes |
| GET/POST | `/academics/classes/:classId/sections`, `/academics/sections` | Bearer/Admin | Sections |
| GET/POST | `/academics/subjects` | Bearer/Admin | Subjects |
| GET/POST | `/academics/classes/:classId/subjects`, `/academics/class-subjects` | Bearer/Admin | Class subjects |
| GET/POST/PATCH | `/academics/classes/:classId/enrollments`, `/academics/enrollments`, `/academics/enrollments/:id` | Bearer/Admin | Class enrolments |
| GET/POST | `/attendance`, `/attendance/summary` | Bearer | Mark/list/summarise attendance |
| POST | `/grades/calculate` | Bearer | Calculate grade |
| POST/GET | `/analytics/events`, `/analytics/summary` | Bearer | Event ingestion and summary |
| GET/PUT | `/flags`, `/flags/:key/check` | Bearer | Feature flags |
| GET/PUT | `/settings` | Bearer | System settings |
| GET/POST | `/audit`, `/audit/verify` | Admin | Append/verify audit chain |
| GET/POST | `/consents` | Bearer | Consent records |
| GET/POST/PATCH | `/privacy/requests`, `/privacy/requests/:id` | Bearer | Data-subject requests |
| GET/PUT | `/integrations` | Admin | Integration configuration |
| GET/POST | `/webhooks` | Admin | Webhook endpoint registration |
| GET/PUT | `/notification-templates` | Admin | Notification templates |

## Response and error conventions

- Success: JSON body; list endpoints return `{ items, total, limit, offset }`
  where implemented.
- Error: `{ "error": "message" }` with 400 validation, 401 unauthenticated,
  403 forbidden/tenant mismatch, 404 not found, 409 conflict, 429 quota/rate
  limit, 500 unexpected, 503 provider unavailable.
- `x-request-id` is returned on every response and propagated upstream.
- Rate limiting: the gateway returns 429 with `Retry-After` and
  `X-RateLimit-*` headers; auth and AI prefixes have stricter limits.
- AI errors: `CONSENT_REQUIRED`, `QUOTA_EXCEEDED`, `PROVIDER_UNAVAILABLE`,
  `UNSAFE_OUTPUT` are surfaced without provider details.
