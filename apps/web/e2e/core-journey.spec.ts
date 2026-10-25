import { expect, test, type Page } from '@playwright/test';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  closeDb as closeSharedDb,
  getDb,
  organizations,
  users,
  courses,
} from '../../../packages/database/src';
import { registerRoutes as registerIdentityRoutes } from '../../../services/identity/src/routes';
import { closeDb as closeIdentityDb } from '../../../services/identity/src/db';
import { registerRoutes as registerCourseRoutes } from '../../../services/courses/src/routes';
import { closeDb as closeCourseDb } from '../../../services/courses/src/db';
import { registerRoutes as registerEnrollmentRoutes } from '../../../services/enrollments/src/routes';
import { closeDb as closeEnrollmentDb } from '../../../services/enrollments/src/db';
import { registerRoutes as registerContentRoutes } from '../../../services/content/src/routes';
import { closeDb as closeContentDb } from '../../../services/content/src/db';
import { registerRoutes as registerAssignmentRoutes } from '../../../services/assignments/src/routes';
import { closeDb as closeAssignmentDb } from '../../../services/assignments/src/db';
import { registerRoutes as registerSubmissionRoutes } from '../../../services/submissions/src/routes';
import { closeDb as closeSubmissionDb } from '../../../services/submissions/src/db';

process.env.JWT_SECRET ||= 'edunet-e2e-only-secret-with-at-least-32-characters';

const runId = randomUUID();
const organizationCode = `e2e-${runId.slice(0, 12)}`;
let organizationId = '';
let apiServer: ReturnType<ReturnType<typeof express>['listen']> | undefined;

async function register(page: Page, firstName: string, role: 'teacher' | 'student') {
  await page.goto('/register');
  await page.getByLabel('First Name').fill(firstName);
  await page.getByLabel('Last Name').fill('Journey');
  await page.getByLabel('Email').fill(`${role}-${runId}@integration.invalid`);
  await page.getByLabel('Password').fill('E2e-password-2026!');
  await page.getByLabel('Role').selectOption(role);
  await page.getByLabel('Organization Code').fill(organizationCode);
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByRole('button', { name: 'Register' })).toBeVisible();
}

test.describe('teacher and student course journey against PostgreSQL', () => {
  test.beforeAll(async () => {
    const [organization] = await getDb()
      .insert(organizations)
      .values({
        name: 'E2E Integration School',
        type: 'school',
        code: organizationCode,
      })
      .returning();
    organizationId = organization.id;

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      return next();
    });
    registerIdentityRoutes(app);
    registerCourseRoutes(app);
    registerEnrollmentRoutes(app);
    registerContentRoutes(app);
    registerAssignmentRoutes(app);
    registerSubmissionRoutes(app);
    await new Promise<void>((resolve) => {
      apiServer = app.listen(3001, resolve);
    });
  });

  test.afterAll(async () => {
    if (apiServer)
      await new Promise<void>((resolve, reject) =>
        apiServer!.close((error) => (error ? reject(error) : resolve()))
      );
    if (organizationId) {
      await getDb().delete(courses).where(eq(courses.organizationId, organizationId));
      await getDb().delete(users).where(eq(users.organizationId, organizationId));
      await getDb().delete(organizations).where(eq(organizations.id, organizationId));
    }
    await Promise.all([
      closeIdentityDb(),
      closeCourseDb(),
      closeEnrollmentDb(),
      closeContentDb(),
      closeAssignmentDb(),
      closeSubmissionDb(),
      closeSharedDb(),
    ]);
  });

  test('teacher creates course and lesson, student enrolls and opens the lesson', async ({
    browser,
  }) => {
    const teacher = await browser.newPage();
    teacher.on('pageerror', (error) => console.error('Teacher browser error:', error));
    await register(teacher, 'Taylor', 'teacher');
    await teacher.goto('/teacher/courses/new');
    await teacher.getByLabel('Course Title *').fill('E2E Algebra');
    await teacher.getByLabel('Description *').fill('A course created in the browser journey.');
    await teacher.getByLabel('Subject *').fill('Mathematics');
    await teacher.getByRole('button', { name: 'Create Course' }).click();
    await expect(teacher).toHaveURL(/\/teacher\/courses\/[0-9a-f-]+$/);
    const courseId = teacher.url().split('/').at(-1)!;

    await teacher.goto(`/teacher/courses/${courseId}/lessons/new`);
    await teacher.getByLabel('Lesson Title *').fill('Linear equations');
    await teacher.getByLabel('Description').fill('Solve a simple equation.');
    await teacher.getByLabel('Content (JSON)').fill('{"text":"Solve 2x + 3 = 7."}');
    await teacher.getByRole('button', { name: 'Create Lesson' }).click();
    await expect(teacher.getByText('Linear equations')).toBeVisible();

    await teacher.goto(`/teacher/courses/${courseId}/assignments/new`);
    await teacher.getByLabel('Title').fill('Solve for x');
    await teacher.getByLabel('Instructions').fill('Show your work for 2x + 3 = 7.');
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const localDueDate = new Date(dueDate.getTime() - dueDate.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    await teacher.getByLabel('Due date').fill(localDueDate);
    await teacher.getByLabel('Maximum points').fill('25');
    await teacher.getByRole('button', { name: 'Create assignment' }).click();
    await expect(teacher).toHaveURL(`/teacher/courses/${courseId}`);
    await expect(teacher.getByText('Solve for x')).toBeVisible();

    const student = await browser.newPage();
    student.on('pageerror', (error) => console.error('Student browser error:', error));
    await register(student, 'Sam', 'student');
    await student.goto('/courses');
    await student.getByText('E2E Algebra').waitFor();
    await student.getByRole('link', { name: 'View Details' }).click();
    await student.getByRole('button', { name: 'Enroll in Course' }).click();
    await expect(student.getByText('You are enrolled in this course')).toBeVisible();
    await student.getByRole('link', { name: 'Go to Course' }).click();
    await expect(student).toHaveURL(`/my-courses/${courseId}`);
    await student.getByRole('link', { name: 'Start Learning' }).click();
    await expect(student.getByRole('heading', { name: 'Linear equations' })).toBeVisible();
    await expect(student.getByText('Solve 2x + 3 = 7.')).toBeVisible();
    await student.getByRole('button', { name: 'Mark lesson complete' }).click();
    await expect(student.getByText('100%', { exact: true })).toBeVisible();
    await expect(student.getByRole('button', { name: 'Lesson completed' })).toBeDisabled();

    await student.goto(`/my-courses/${courseId}`);
    await student.getByRole('link', { name: 'Open Assignment' }).click();
    await student.getByLabel('Your Answer').fill('2x + 3 = 7, so x = 2.');
    await student.getByRole('button', { name: 'Submit Assignment' }).click();
    await expect(student.getByText('Submitted', { exact: true })).toBeVisible();

    await teacher.goto(`/teacher/courses/${courseId}`);
    await expect(teacher.getByText('Sam Journey')).toBeVisible();
    await teacher.getByRole('link', { name: 'Review submissions' }).click();
    await expect(teacher.getByText('2x + 3 = 7, so x = 2.')).toBeVisible();
    await teacher.getByLabel(/Grade \/ 25/).fill('23');
    await teacher.getByLabel('Feedback').fill('Clear work and correct answer.');
    await teacher.getByRole('button', { name: 'Save grade' }).click();
    await expect(teacher.getByText('2x + 3 = 7, so x = 2.')).toBeVisible();

    await student.goto(
      `/my-courses/${courseId}/assignments/${(await teacher.url()).split('/').at(-1)}`
    );
    await expect(student.getByText('Grade: 23 / 25')).toBeVisible();
    await expect(student.getByText('Feedback: Clear work and correct answer.')).toBeVisible();
  });
});
