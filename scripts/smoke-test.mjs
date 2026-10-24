#!/usr/bin/env node
/**
 * Staging/pilot smoke test for the four pilot roles.
 *
 * Requires pre-provisioned synthetic accounts. It never creates users and
 * never uses real student data.
 *
 * Required:
 *   SMOKE_BASE_URL                 gateway origin, e.g. https://staging.example.org
 *   SMOKE_STUDENT_EMAIL/PASSWORD
 *   SMOKE_TEACHER_EMAIL/PASSWORD
 *   SMOKE_PARENT_EMAIL/PASSWORD
 *   SMOKE_ADMIN_EMAIL/PASSWORD
 *
 * Optional:
 *   SMOKE_WEB_URL                  web origin (checks /api/health)
 *   SMOKE_TIMEOUT_MS               per-request timeout (default 10000)
 *
 * Exit codes: 0 PASS, 1 FAIL, 2 BLOCKED (missing configuration).
 */
const REQUIRED = [
  'SMOKE_BASE_URL',
  'SMOKE_STUDENT_EMAIL',
  'SMOKE_STUDENT_PASSWORD',
  'SMOKE_TEACHER_EMAIL',
  'SMOKE_TEACHER_PASSWORD',
  'SMOKE_PARENT_EMAIL',
  'SMOKE_PARENT_PASSWORD',
  'SMOKE_ADMIN_EMAIL',
  'SMOKE_ADMIN_PASSWORD',
];

const missing = REQUIRED.filter((key) => !process.env[key]?.trim());
if (missing.length > 0) {
  console.error(`SMOKE TEST: BLOCKED — missing ${missing.join(', ')}`);
  console.error('Provide synthetic pilot credentials through the environment; never commit them.');
  process.exit(2);
}

const baseUrl = process.env.SMOKE_BASE_URL.replace(/\/+$/, '');
const webUrl = process.env.SMOKE_WEB_URL?.replace(/\/+$/, '');
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 10_000);

if (baseUrl.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl)) {
  console.warn('warning: smoke target is not HTTPS');
}

let failures = 0;
const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, { ...options, signal: controller.signal });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = text;
    }
    return { status: response.status, body, headers: response.headers };
  } finally {
    clearTimeout(timer);
  }
}

async function expectStatus(name, path, options, allowed = [200]) {
  try {
    const response = await request(path, options);
    record(name, allowed.includes(response.status), `HTTP ${response.status}`);
    return response;
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

async function login(role) {
  const email = process.env[`SMOKE_${role.toUpperCase()}_EMAIL`];
  const password = process.env[`SMOKE_${role.toUpperCase()}_PASSWORD`];
  const response = await expectStatus(
    `${role} login`,
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
    [200]
  );
  if (!response?.body?.token) {
    record(`${role} token returned`, false, 'missing token');
    return undefined;
  }
  record(`${role} token returned`, true);
  const actualRole = response.body?.user?.role;
  record(`${role} role matches`, actualRole === role, `got ${actualRole}`);
  return response.body.token;
}

function auth(token) {
  return { headers: { authorization: `Bearer ${token}` } };
}

console.log(`EduNet smoke test against ${baseUrl}`);

const health = await expectStatus('gateway health', '/health', {}, [200]);
record('health reports ok', health?.body?.status === 'ok', JSON.stringify(health?.body));
const ready = await expectStatus('gateway ready', '/ready', {}, [200]);
record('ready reports ready', ready?.body?.status === 'ready', JSON.stringify(ready?.body));

if (webUrl) {
  try {
    const response = await fetch(`${webUrl}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    record('web health', response.ok, `HTTP ${response.status}`);
  } catch (error) {
    record('web health', false, error instanceof Error ? error.message : String(error));
  }
}

const student = await login('student');
const teacher = await login('teacher');
const parent = await login('parent');
const admin = await login('admin');

let firstCourseId;
let firstAssignmentId;

if (student) {
  const courses = await expectStatus(
    'student lists courses',
    '/api/courses?limit=10',
    auth(student)
  );
  firstCourseId = Array.isArray(courses?.body) ? courses.body[0]?.id : undefined;
  await expectStatus('student lists enrollments', '/api/enrollments?limit=10', auth(student));
  await expectStatus('student lists own submissions', '/api/submissions', auth(student));
  await expectStatus('student lists notifications', '/api/notifications', auth(student));
  await expectStatus(
    'student blocked from platform audit',
    '/api/platform/audit',
    auth(student),
    [403]
  );
}

if (teacher) {
  const courses = await expectStatus(
    'teacher lists courses',
    '/api/courses?limit=10',
    auth(teacher)
  );
  const teacherCourseId =
    firstCourseId || (Array.isArray(courses?.body) ? courses.body[0]?.id : undefined);
  if (teacherCourseId) {
    await expectStatus(
      'teacher lists course roster',
      `/api/enrollments?courseId=${encodeURIComponent(teacherCourseId)}`,
      auth(teacher)
    );
    const assignments = await expectStatus(
      'teacher lists assignments',
      `/api/assignments?courseId=${encodeURIComponent(teacherCourseId)}`,
      auth(teacher)
    );
    firstAssignmentId = Array.isArray(assignments?.body) ? assignments.body[0]?.id : undefined;
    if (firstAssignmentId) {
      await expectStatus(
        'teacher lists submissions for review',
        `/api/submissions?assignmentId=${encodeURIComponent(firstAssignmentId)}`,
        auth(teacher)
      );
    }
  } else {
    record('teacher has a course to inspect', false, 'no course returned');
  }
}

if (parent) {
  const children = await expectStatus(
    'parent lists authorized children',
    '/api/parents/children',
    auth(parent)
  );
  const childId = Array.isArray(children?.body) ? children.body[0]?.id : undefined;
  if (childId) {
    await expectStatus(
      'parent views child progress (enrollments)',
      `/api/parents/children/${encodeURIComponent(childId)}/enrollments`,
      auth(parent)
    );
    await expectStatus(
      'parent views child grades (submissions)',
      `/api/parents/children/${encodeURIComponent(childId)}/submissions`,
      auth(parent)
    );
  } else {
    record('parent has an authorized child', false, 'no child relationship returned');
  }
  await expectStatus(
    'parent blocked from platform audit',
    '/api/platform/audit',
    auth(parent),
    [403]
  );
}

if (admin) {
  await expectStatus('admin lists audit events', '/api/platform/audit', auth(admin));
  const verify = await expectStatus(
    'admin verifies audit chain',
    '/api/platform/audit/verify',
    auth(admin)
  );
  record('audit chain verifies', verify?.body?.valid === true, JSON.stringify(verify?.body));
  await expectStatus('admin lists users', '/api/users?limit=5', auth(admin));
  await expectStatus('admin lists organizations', '/api/organizations?limit=5', auth(admin));
}

await expectStatus('unknown path returns JSON 404', '/api/does-not-exist', {}, [404]);

console.log(
  `\nSMOKE TEST: ${failures === 0 ? 'PASS' : 'FAIL'} (${results.length} checks, ${failures} failed)`
);
process.exit(failures === 0 ? 0 : 1);
