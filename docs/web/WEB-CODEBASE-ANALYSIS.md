# EduNet Web Codebase Analysis

## Stack

`apps/web` is a Next.js 16 App Router application in a pnpm/Turbo monorepo. It uses React 19, Tailwind CSS, shared packages under `packages/`, and route-level pages under `src/app`.

## Architecture

- Root providers: `@edunet/auth`, `@/lib/i18n`, offline banner, and service-worker registration.
- API access: shared `@edunet/api-client` with `apiUrl()` and `NEXT_PUBLIC_API_URL`.
- Shared UI: `@edunet/ui` primitives and existing local components.
- Auth and role checks: client auth context with server services remaining authoritative.
- Existing portals: student, teacher, parent, and admin routes.

## Routes

Public routes currently include home, login, register, courses, course detail, and offline. Protected route families include dashboard, my-courses, teacher, parent, and admin.

## Constraints

Bengali and English copy should use the existing i18n provider. New product flows must use real API contracts, preserve authorization, and show honest empty or unavailable states where backend support is missing.
