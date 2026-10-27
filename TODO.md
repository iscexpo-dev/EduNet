# EduNet — 100% Coverage Master TODO

> **Status reviewed 2026-10-27** against the live checkout, `PROGRESS_STATE.json`,
> `docs/EDUNET-IMPLEMENTATION-STATE.md`, `docs/EDUNET-ROADMAP-GAP-MATRIX.md`,
> `docs/security/security.md` and source inspection.
>
> Legend:
> - `[x]` implemented and backed by code/tests/docs in this repository (not a production sign-off)
> - `[~]` partial: backend-only, primitive-only, schema-only, or missing UI/operational proof
> - `[!]` blocked: needs PostgreSQL, Docker, Playwright, cloud credentials, a pilot partner or an unexecuted drill
> - `[ ]` not implemented
>
> This is an engineering gap list, not release approval. Typecheck (36/36), lint
> (32/32, 0 errors), unit tests (50/50 tasks), production build, `pnpm audit`,
> `pnpm db:check`, `pnpm ops:test` and `format:check` pass locally. Live
> PostgreSQL integration, browser E2E, container builds, restore drills and any
> deployment remain **blocked** in this sandbox — see `PROGRESS_STATE.json`.
>
> Main pattern: identity, RBAC, LMS, assignments, assessment grading and the
> platform/engagement/AI/support backends are real and tested. The largest gaps
> are user interfaces, notification/webhook delivery workers, AI provider
> configuration, infrastructure provisioning, load/accessibility testing and
> pilot/rollout execution.

## 00. Project Foundation
- [x] Project vision final
- [x] Product scope final
- [x] MVP scope final
- [x] Phase-2 scope final
- [x] Phase-3 scope final
- [x] User personas
- [x] User journeys
- [x] Functional requirements
- [x] Non-functional requirements
- [x] Acceptance criteria
- [x] Success metrics
- [x] KPI definitions
- [ ] Budget model
- [ ] Team structure
- [x] Delivery milestones
- [x] Risk register
- [~] Dependency register
- [x] Decision log
- [x] Product roadmap
- [x] Release roadmap

## 01. Architecture
- [x] Architecture principles
- [x] Domain boundaries
- [x] Service boundaries
- [x] API-first architecture
- [ ] Event-driven architecture
- [x] Modular monolith vs microservices decision
- [x] Web architecture
- [~] Mobile/PWA architecture
- [x] Backend architecture
- [~] Data architecture
- [~] Storage architecture
- [~] Media architecture
- [~] Notification architecture
- [~] Search architecture
- [~] Analytics architecture
- [x] AI architecture
- [~] Integration architecture
- [~] Disaster recovery architecture
- [ ] Multi-AZ architecture
- [ ] Multi-region strategy
- [~] Architecture Decision Records

## 02. Technology Stack
- [x] Frontend framework
- [x] Backend framework
- [x] PostgreSQL
- [~] NoSQL decision
- [ ] Redis
- [ ] Message queue
- [~] Object storage
- [ ] CDN
- [ ] Search engine
- [ ] Data warehouse
- [x] AI/ML stack
- [~] Docker
- [ ] Kubernetes
- [ ] Terraform/IaC
- [~] CI/CD
- [~] Monitoring
- [x] Logging
- [ ] Tracing
- [~] Secrets management
- [~] Backup system

প্রস্তাবিত মূল stack-এ React/Next.js, Python/Django/FastAPI বা Node.js, PostgreSQL, Redis, cloud object storage, CDN, Docker/Kubernetes এবং CI/CD বিবেচনা করা হয়েছে।

## 03. Design System
- [~] Brand identity
- [~] Logo system
- [x] Color tokens
- [x] Typography
- [x] Spacing system
- [~] Grid system
- [~] Icon system
- [x] Button components
- [x] Input components
- [~] Form components
- [x] Modal
- [x] Drawer
- [x] Dropdown
- [x] Tabs
- [x] Table
- [x] Pagination
- [x] Toast
- [x] Alert
- [x] Empty states
- [~] Loading states
- [~] Error states
- [x] Skeletons
- [~] Accessibility states
- [x] Dark mode
- [x] Responsive design
- [x] Bengali typography
- [x] English typography
- [~] RTL readiness

## 04. Identity & Authentication
- [x] Registration
- [x] Login
- [x] Logout
- [x] Password reset
- [x] Email verification
- [x] Phone verification
- [~] OTP
- [ ] SSO
- [ ] OAuth2
- [ ] OIDC
- [x] JWT/session strategy
- [ ] MFA
- [ ] Biometric authentication
- [~] Device management
- [x] Session management
- [ ] Suspicious-login detection
- [x] Account lockout
- [x] Recovery flow
- [x] Identity audit log

## 05. RBAC & Organization
- [x] Student role
- [x] Teacher role
- [x] Parent role
- [x] Tutor role
- [x] Mentor role
- [x] School admin
- [x] Institution admin
- [x] District admin
- [x] National admin
- [x] Content moderator
- [x] Support agent
- [x] Finance role
- [x] Super admin
- [x] Permission matrix
- [ ] Role inheritance
- [~] Organization hierarchy
- [~] School hierarchy
- [x] Class hierarchy
- [x] Tenant isolation

## 06. Student Profile
- [~] Student profile
- [~] Academic profile
- [x] Guardian relationship
- [x] School relationship
- [x] Class/section
- [x] Subject enrollment
- [ ] Skills
- [ ] Interests
- [ ] Learning goals
- [~] Attendance
- [~] Assignment history
- [~] Grade history
- [~] Achievement
- [~] Certificates
- [~] Learning streak
- [~] Activity timeline
- [~] Privacy controls

## 07. Parent Portal
- [x] Parent registration
- [~] Child linking
- [x] Multiple children
- [x] Progress dashboard
- [~] Attendance
- [x] Grades
- [x] Assignments
- [~] Teacher communication
- [~] Notifications
- [~] Calendar
- [ ] Reports
- [ ] Learning alerts
- [~] Consent management

## 08. Teacher Portal
- [~] Teacher profile
- [x] Teacher dashboard
- [~] Class management
- [~] Student roster
- [x] Course creation
- [x] Lesson creation
- [x] Assignment creation
- [~] Quiz creation
- [x] Grading
- [~] Attendance
- [~] Performance analytics
- [~] Communication
- [~] Resource library
- [~] Live class integration
- [ ] Teacher workload dashboard

## 09. LMS Core
- [x] Course catalog
- [x] Course creation
- [x] Course editing
- [x] Course enrollment
- [~] Course sections
- [x] Lessons
- [~] Chapters
- [~] Learning objectives
- [~] Prerequisites
- [~] Video lessons
- [~] Audio lessons
- [~] PDF/document lessons
- [~] Interactive lessons
- [x] Course completion
- [x] Progress tracking
- [x] Resume learning
- [x] Bookmarks
- [x] Notes
- [ ] Favorites
- [x] Course search
- [~] Course filtering
- [ ] Course recommendations

## 10. Assignment System
- [x] Assignment creation
- [x] Instructions
- [~] Attachments
- [x] Submission
- [x] Resubmission
- [x] Deadline
- [x] Late submission
- [x] Auto-save
- [x] Rubrics
- [x] Teacher grading
- [x] Feedback
- [ ] Plagiarism integration
- [x] Grade calculation
- [x] Grade history
- [x] Submission audit

## 11. Assessment Engine
- [x] MCQ
- [x] Multiple select
- [x] True/false
- [x] Short answer
- [x] Long answer
- [x] Matching
- [x] Fill-in-the-blank
- [x] Question bank
- [x] Randomized questions
- [x] Randomized options
- [x] Time limit
- [x] Attempts
- [x] Auto grading
- [x] Manual grading
- [x] Partial scoring
- [ ] Exam analytics
- [~] Result publication
- [x] Recheck workflow

## 12. Live Learning
- [x] Live class scheduling
- [~] Teacher calendar
- [~] Student calendar
- [ ] Video conferencing integration
- [x] Attendance tracking
- [~] Waiting room
- [ ] Screen sharing
- [~] Recording
- [~] Chat
- [~] Poll
- [~] Q&A
- [ ] Whiteboard
- [ ] Recording playback
- [~] Class materials
- [x] Post-class analytics

## 13. Tutoring & Mentoring
- [x] Tutor profiles
- [~] Mentor profiles
- [~] Tutor search
- [~] Subject filtering
- [x] Availability
- [x] Booking
- [x] One-to-one session
- [ ] Group session
- [ ] On-demand tutoring
- [x] Scheduled tutoring
- [ ] Session reminders
- [x] Session notes
- [x] Tutor feedback
- [x] Student feedback
- [x] Tutor rating
- [ ] Tutor performance analytics

## 14. Extracurricular Booking
- [~] Event catalog
- [x] Club catalog
- [x] Workshop catalog
- [x] Career event
- [~] Event detail
- [x] Seat capacity
- [x] Booking
- [x] Cancellation
- [x] Waitlist
- [~] Calendar integration
- [x] Attendance
- [~] Reminder
- [ ] Certificate
- [ ] Organizer dashboard

## 15. Content Management
- [~] CMS
- [x] Content authoring
- [x] Draft
- [~] Review
- [~] Approval
- [x] Publishing
- [x] Versioning
- [ ] Scheduling
- [ ] Content tagging
- [ ] Categories
- [x] Search
- [~] Media library
- [~] Content moderation
- [~] Copyright metadata
- [~] Content archival

## 16. Communication
- [~] Student-teacher chat
- [~] Parent-teacher chat
- [~] Tutor-student chat
- [x] Group chat
- [x] Forum
- [x] Discussion thread
- [x] Replies
- [ ] Mentions
- [x] Attachments
- [x] Moderation
- [x] Report message
- [x] Block user
- [~] Notification center
- [ ] Email notification
- [ ] Push notification
- [ ] SMS notification

## 17. Calendar
- [x] Academic calendar
- [x] Class calendar
- [~] Assignment deadlines
- [x] Exam calendar
- [~] Tutor sessions
- [x] Events
- [x] Holidays
- [~] Teacher schedule
- [~] Student schedule
- [~] Parent calendar
- [~] Reminder engine
- [x] Calendar export

## 18. Search
- [~] Global search
- [x] Course search
- [~] Teacher search
- [ ] Tutor search
- [~] Content search
- [ ] Event search
- [x] Student search for admins
- [~] Filters
- [ ] Facets
- [ ] Fuzzy matching
- [x] Bengali search
- [x] English search
- [x] Search ranking
- [x] Search analytics

## 19. Notification Platform
- [x] Notification service
- [~] Template engine
- [ ] Email provider
- [ ] SMS provider
- [ ] Push provider
- [x] In-app notification
- [x] User preferences
- [ ] Notification priority
- [~] Retry
- [~] Delivery status
- [x] Rate limiting
- [ ] Notification analytics

## 20. Analytics
- [x] Event tracking
- [~] User activity
- [x] Course activity
- [x] Attendance analytics
- [x] Assignment analytics
- [~] Assessment analytics
- [~] Teacher analytics
- [ ] School analytics
- [ ] District analytics
- [ ] National analytics
- [ ] Learning funnel
- [ ] Retention
- [x] Engagement
- [~] Completion
- [ ] Skill-gap analysis
- [ ] Dashboard
- [ ] Export
- [ ] Scheduled reports

## 21. AI Engine
- [x] AI architecture
- [x] AI gateway
- [x] Model abstraction
- [ ] Student recommendation
- [ ] Course recommendation
- [ ] Personalized learning
- [ ] Learning-path generation
- [ ] Skill-gap detection
- [ ] Question generation
- [ ] Explanation generation
- [ ] Summarization
- [ ] Translation
- [ ] Bengali NLP
- [~] Teacher assistant
- [~] Parent assistant
- [~] Student assistant
- [x] AI safety layer
- [x] Prompt management
- [x] AI audit
- [~] Cost monitoring
- [~] Human review workflow

## 22. Mental Health / Support
- [x] Support resources
- [x] Safe-help content
- [x] Counselor directory
- [x] Appointment flow
- [~] Private communication
- [~] Consent
- [x] Escalation workflow
- [x] Crisis-resource routing
- [~] Strict privacy controls
- [x] Audit logging

## 23. Offline / Low-Bandwidth
- [x] PWA
- [~] Offline login strategy
- [~] Offline course cache
- [~] Offline lessons
- [x] Offline assignments
- [x] Offline notes
- [x] Offline progress
- [x] Sync queue
- [x] Conflict resolution
- [x] Retry mechanism
- [~] Background sync
- [~] Download manager
- [ ] Adaptive media quality
- [ ] Low-resolution video
- [ ] Audio-first mode
- [ ] Data saver
- [ ] Edge caching

Low-bandwidth ও offline support-কে মূল architecture requirement হিসেবে ধরা হয়েছে, কারণ নথিতে বাংলাদেশের সীমিত internet connectivity-এর বিষয়টি সরাসরি উল্লেখ করা হয়েছে।

## 24. Bengali + Internationalization
- [~] Bengali UI
- [x] English UI
- [x] Language switcher
- [x] Translation framework
- [x] Bengali date formatting
- [x] Bengali numbers
- [x] Bengali search
- [x] Unicode normalization
- [~] Localization content
- [~] RTL readiness
- [ ] Accessibility localization

## 25. Admin Platform
- [~] Admin dashboard
- [~] User management
- [ ] Role management
- [~] School management
- [~] Institution management
- [ ] Course moderation
- [~] Content moderation
- [ ] Reports
- [x] Audit logs
- [~] System settings
- [~] Feature flags
- [~] Configuration
- [~] Notification management
- [ ] Security dashboard
- [~] System health

## 26. School / Institution Management
- [~] Institution onboarding
- [x] School profile
- [ ] Departments
- [x] Classes
- [x] Sections
- [x] Subjects
- [x] Teachers
- [x] Students
- [x] Guardians
- [x] Academic year
- [x] Term
- [x] Enrollment
- [~] Transfer
- [ ] Graduation
- [ ] Institution reports

## 27. Integration Layer
- [x] API gateway
- [x] REST API
- [~] GraphQL decision
- [~] Webhooks
- [ ] OAuth
- [ ] OIDC
- [ ] SAML/SSO
- [~] School SIS integration
- [ ] Government education systems
- [ ] National identity integration where legally authorized
- [~] Payment integration if required
- [~] Video provider
- [~] SMS provider
- [~] Email provider
- [~] Analytics integrations
- [~] External LMS interoperability
- [ ] SCORM
- [ ] LTI
- [~] Open standards

API integration, SSO/OIDC এবং SCORM/LTI-এর মতো interoperability standards নকশায় বিবেচনা করা হয়েছে।

## 28. Data Architecture
- [x] Data model
- [~] ERD
- [x] Schema design
- [x] Migration framework
- [x] Data validation
- [x] Data normalization
- [ ] Data retention
- [ ] Data archival
- [ ] Data warehouse
- [ ] Data lake
- [~] ETL/ELT
- [~] Event schema
- [~] Master data
- [ ] Data lineage
- [~] Data quality
- [~] Data ownership
- [~] Data classification

## 29. Security
- [x] Threat model
- [x] Security architecture
- [~] TLS
- [~] Encryption at rest
- [x] Encryption in transit
- [~] Secrets management
- [x] RBAC
- [ ] MFA
- [x] Session security
- [~] CSRF protection
- [x] XSS protection
- [x] SQL injection protection
- [x] API security
- [x] Rate limiting
- [ ] WAF
- [ ] DDoS protection
- [~] Vulnerability scanning
- [x] Dependency scanning
- [ ] SAST
- [ ] DAST
- [ ] Penetration testing
- [~] Security audit
- [x] Incident response
- [~] Breach response
- [x] Audit logs

## 30. Privacy & Governance
- [ ] Privacy policy
- [x] Consent management
- [~] Child-data protection
- [~] Parent consent where applicable
- [~] Data minimization
- [~] Purpose limitation
- [~] Data deletion workflow
- [~] Data export
- [x] Access request workflow
- [ ] Retention policy
- [~] Third-party data policy
- [x] AI data policy
- [ ] Data processing agreements
- [ ] Compliance mapping
- [ ] Legal review

নথিতে শিক্ষার্থীর ব্যক্তিগত তথ্য, encryption, RBAC, audit logging এবং privacy/security audit-কে গুরুত্বপূর্ণ ঝুঁকি হিসেবে চিহ্নিত করা হয়েছে।

## 31. Infrastructure
- [!] Cloud account
- [!] Networking
- [!] VPC
- [!] Subnets
- [!] Firewall
- [!] Load balancer
- [!] Kubernetes cluster
- [!] Database cluster
- [!] Redis cluster
- [!] Object storage
- [!] CDN
- [!] DNS
- [!] Certificate management
- [!] Secret store
- [!] Backup storage
- [!] Disaster recovery environment

## 32. DevOps
- [x] Git strategy
- [x] Branch strategy
- [~] Commit standards
- [~] Code review
- [ ] Pull request template
- [~] CI pipeline
- [x] Unit tests
- [~] Integration tests
- [~] Security scan
- [x] Build pipeline
- [~] Container build
- [~] Image scanning
- [ ] Artifact registry
- [ ] Deployment pipeline
- [ ] Staging
- [ ] Production
- [~] Rollback
- [ ] Blue/green deployment
- [ ] Canary deployment
- [x] Feature flags

## 33. Observability
- [x] Application logs
- [ ] Infrastructure logs
- [x] Audit logs
- [x] Metrics
- [ ] Distributed tracing
- [~] Error tracking
- [~] Uptime monitoring
- [x] API latency
- [ ] Database monitoring
- [ ] Queue monitoring
- [ ] CDN monitoring
- [ ] Alerting
- [~] On-call
- [ ] Incident dashboard
- [~] SLA/SLO/SLI

নথিতে Prometheus/Grafana বা CloudWatch এবং ELK/Cloud Logging-এর মতো monitoring/logging ব্যবস্থা এবং 24×7 পর্যবেক্ষণের কথা বলা হয়েছে।

## 34. Performance
- [x] Performance baseline
- [~] API latency targets
- [~] Page-load target
- [ ] Mobile performance
- [~] Database optimization
- [~] Query optimization
- [~] Caching
- [ ] CDN optimization
- [~] Image optimization
- [ ] Video optimization
- [~] Lazy loading
- [~] Code splitting
- [ ] Load testing
- [ ] Stress testing
- [ ] Spike testing
- [ ] Endurance testing
- [~] Capacity planning

## 35. QA
- [~] Test strategy
- [x] Unit testing
- [~] Integration testing
- [~] API testing
- [~] E2E testing
- [ ] UI testing
- [~] Regression testing
- [x] Smoke testing
- [ ] Accessibility testing
- [~] Security testing
- [ ] Performance testing
- [x] Offline testing
- [ ] Low-bandwidth testing
- [~] Browser testing
- [ ] Mobile testing
- [ ] Device testing
- [~] Localization testing
- [ ] Data migration testing
- [ ] Disaster recovery testing

Jest/pytest/Selenium এবং JMeter/Locust ধরনের automated testing ও load testing tools ব্যবহারের পরিকল্পনা নথিতে আছে।

## 36. Accessibility
- [~] WCAG baseline
- [~] Keyboard navigation
- [ ] Screen reader
- [~] Contrast
- [x] Focus states
- [ ] Captions
- [ ] Transcript
- [~] Alt text
- [~] Accessible forms
- [ ] Accessible video
- [ ] Accessible assessment
- [ ] Mobile accessibility

## 37. Backup & Disaster Recovery
- [x] Database backup
- [x] Object backup
- [~] Configuration backup
- [x] Backup encryption
- [x] Backup verification
- [!] Restore testing
- [x] RPO
- [x] RTO
- [x] Disaster runbook
- [ ] Failover
- [ ] Multi-AZ
- [ ] Multi-region
- [!] DR drill

## 38. Documentation
- [x] Product requirements
- [x] Architecture documentation
- [x] API documentation
- [~] Database documentation
- [x] Deployment documentation
- [x] Security documentation
- [x] Runbooks
- [~] Troubleshooting guide
- [ ] User guide
- [ ] Teacher guide
- [ ] Parent guide
- [ ] Admin guide
- [x] Developer onboarding
- [~] Knowledge base

## 39. Support
- [~] Help center
- [~] FAQ
- [x] Ticketing
- [ ] Support dashboard
- [x] Ticket categories
- [x] SLA
- [x] Escalation
- [x] Incident handling
- [ ] User feedback
- [ ] Bug reporting
- [ ] Feature requests
- [~] Knowledge base
- [ ] Support analytics

## 40. Pilot
- [!] Pilot school selection
- [!] Pilot users
- [!] Pilot onboarding
- [!] Teacher training
- [!] Student training
- [!] Parent training
- [!] Baseline measurement
- [!] Usage monitoring
- [!] Bug collection
- [!] Feedback collection
- [!] Performance measurement
- [!] Security review
- [!] Pilot evaluation
- [!] Go/no-go criteria

## 41. Rollout
- [ ] Rollout strategy
- [~] School onboarding
- [~] Institution onboarding
- [ ] User migration
- [ ] Data migration
- [ ] Training
- [~] Helpdesk
- [~] Communication
- [~] Monitoring
- [ ] Capacity scaling
- [ ] Regional rollout
- [ ] National rollout
- [ ] Post-rollout review

## 42. Operations
- [ ] 24/7 monitoring
- [~] On-call rotation
- [x] Incident management
- [ ] Problem management
- [~] Change management
- [x] Release management
- [~] Patch management
- [~] Dependency updates
- [~] Security updates
- [ ] Capacity review
- [ ] Cost review
- [ ] Monthly KPI review
- [ ] Quarterly architecture review

## 43. Business / Cost
- [ ] Infrastructure cost model
- [ ] Development cost
- [ ] Staffing cost
- [ ] Vendor cost
- [~] AI inference cost
- [ ] Storage cost
- [ ] CDN cost
- [ ] SMS cost
- [ ] Support cost
- [ ] Training cost
- [ ] Disaster recovery cost
- [ ] 3-year TCO
- [ ] Cost-per-user
- [ ] Cost optimization

## 44. Metrics / KPI
- [~] DAU
- [~] MAU
- [~] Activation
- [~] Course enrollment
- [~] Course completion
- [~] Assignment submission
- [~] Assessment completion
- [~] Attendance
- [~] Teacher activity
- [~] Parent engagement
- [~] Tutor utilization
- [~] Booking conversion
- [~] Retention
- [~] Learning progress
- [~] Skill improvement
- [~] Support response time
- [~] Uptime
- [~] API latency
- [~] Error rate
- [~] Security incidents

## 45. Release Governance
- [~] Versioning
- [~] Release branches
- [ ] Release notes
- [x] Migration plan
- [~] Backward compatibility
- [x] Feature flags
- [x] Rollback criteria
- [ ] Production approval
- [ ] Security approval
- [ ] QA approval
- [ ] Product approval
- [~] Post-release monitoring

## 46. Final Production Checklist
- [ ] Requirements signed off
- [ ] Architecture signed off
- [ ] Security signed off
- [ ] Privacy signed off
- [ ] UX signed off
- [ ] QA signed off
- [ ] Performance signed off
- [!] Backup verified
- [!] DR verified
- [!] Monitoring active
- [!] Alerts active
- [~] Support ready
- [~] Documentation complete
- [ ] Training complete
- [!] Pilot accepted
- [!] Production capacity verified
- [!] Rollback verified
- [!] Go-live approval
- [!] Production launch
- [ ] Post-launch review

### Execution Order

**Foundation → Architecture → Design System → Identity → RBAC → Core LMS → Assessment → Teacher → Parent → Tutoring → Booking → Communication → Content → Calendar → Search → Notification → Analytics → AI → Offline → Integration → Security → Infrastructure → DevOps → QA → Pilot → Rollout → Operations**

মূল নথির roadmap-এ পরিকল্পনা/বিশ্লেষণ → MVP → পূর্ণাঙ্গ উন্নয়ন → পরীক্ষা/সংশোধন → rollout/training → maintenance ধাপ নির্ধারিত আছে।

**এই TODO-র মূল নীতি:** কোনো AI feature আগে নয়; প্রথমে **identity + data + LMS + security + offline foundation**, এরপর advanced AI/analytics। এভাবে EduNet-কে একটি বড়, production-grade education platform হিসেবে ধাপে ধাপে build করা যাবে।
