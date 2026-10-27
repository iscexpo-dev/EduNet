# EduNet Web Gap Matrix

| Capability | Status | Evidence / next step | Verification |
|---|---|---|---|
| Root providers and offline support | Implemented | `apps/web/src/app/layout.tsx` | Typecheck and browser load |
| Auth routes | Implemented | `src/app/login`, `src/app/register` | Auth redirect smoke test |
| Student portal | Partial | `src/app/my-courses` and progress routes exist | Role-scoped browser flow |
| Teacher portal | Partial | Course, lesson, assignment routes exist | Teacher flow with API |
| Parent portal | Partial | `src/app/parent` exists | Relationship-scoped API response |
| Admin portal | Partial | `src/app/admin` exists | Backend capability audit |
| Public landing page | Implemented | `src/app/page.tsx` and `src/components/PublicShell.tsx`; bilingual entry points, skip link, responsive navigation and focus states | Responsive browser screenshot |
| Public education directory | Partial | `/courses` exists; institution directory is new surface | Search contract verification |
| Help and contact | Missing | Add static guidance and honest support path | Link and accessibility check |
| Tutor opportunities | Backend-dependent | Only expose supported engagement endpoints | API contract check |
| Notifications and calendar | Backend-dependent | Preserve existing service boundaries | Endpoint integration test |
