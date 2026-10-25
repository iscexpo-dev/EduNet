import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  closeDb as closeContentDb,
  createLesson as createLessonInService,
  findLessonById as findLessonInService,
  updateLesson as updateLessonInService,
  deleteLesson as deleteLessonInService,
  createLessonProgress as createLessonProgressInService,
  findLessonProgressById as findLessonProgressInService,
  listLessonProgressByStudent as listLessonProgressByStudentInService,
  updateLessonProgress as updateLessonProgressInService,
  deleteLessonProgress as deleteLessonProgressInService,
  createResource as createResourceInService,
  findResourceById as findResourceInService,
  listResourcesByCourse as listResourcesByCourseInService,
  listResourcesByLesson as listResourcesByLessonInService,
  updateResource as updateResourceInService,
  deleteResource as deleteResourceInService,
  createMediaFile as createMediaFileInService,
  findMediaFileById as findMediaFileInService,
  listMediaFilesByCourse as listMediaFilesByCourseInService,
  listMediaFilesByLesson as listMediaFilesByLessonInService,
  incrementMediaDownloadCount as incrementMediaDownloadCountInService,
  deleteMediaFile as deleteMediaFileInService,
} from '../../../services/content/src/db';
import {
  closeDb as closeAssessmentsDb,
  createQuiz as createQuizInService,
  createQuestion as createQuestionInService,
  createQuizAttempt as createQuizAttemptInService,
  deleteQuiz as deleteQuizInService,
  deleteQuestion as deleteQuestionInService,
  deleteQuizAttempt as deleteQuizAttemptInService,
  findQuizById as findQuizInService,
  findQuestionById as findQuestionInService,
  findQuizAttemptById as findQuizAttemptInService,
  getDb as getAssessmentsDb,
  listQuizzesByCourse as listQuizzesByCourseInService,
  listQuestionsByQuiz as listQuestionsByQuizInService,
  listQuizAttemptsByQuiz as listQuizAttemptsByQuizInService,
  listQuizAttemptsByStudent as listQuizAttemptsByStudentInService,
  updateQuiz as updateQuizInService,
  updateQuestion as updateQuestionInService,
  updateQuizAttempt as updateQuizAttemptInService,
} from '../../../services/assessments/src/db';
import {
  closeDb as closeEnrollmentsDb,
  createEnrollment as createEnrollmentInService,
  deleteEnrollment as deleteEnrollmentInService,
  findEnrollment as findEnrollmentInService,
  findEnrollmentById as findEnrollmentByIdInService,
  getDb as getEnrollmentsDb,
  listEnrollmentsByCourse as listEnrollmentsByCourseInService,
  listEnrollmentsByStudent as listEnrollmentsByStudentInService,
  updateEnrollmentStatus as updateEnrollmentStatusInService,
} from '../../../services/enrollments/src/db';
import {
  closeDb as closeSubmissionsDb,
  createSubmission as createSubmissionInService,
  deleteSubmission as deleteSubmissionInService,
  findSubmission as findSubmissionInService,
  findSubmissionById as findSubmissionByIdInService,
  getDb as getSubmissionsDb,
  gradeSubmission as gradeSubmissionInService,
  listSubmissionsByAssignment as listSubmissionsByAssignmentInService,
  listSubmissionsByStudent as listSubmissionsByStudentInService,
} from '../../../services/submissions/src/db';
import {
  closeDb as closeAssignmentsDb,
  createAssignment as createAssignmentInService,
  deleteAssignment as deleteAssignmentInService,
  findAssignmentById as findAssignmentInService,
  getAssignmentSubmissionCount as getAssignmentSubmissionCountInService,
  getDb as getAssignmentsDb,
  listAssignmentsByCourse as listAssignmentsByCourseInService,
  updateAssignment as updateAssignmentInService,
} from '../../../services/assignments/src/db';
import {
  closeDb as closeUsersDb,
  deleteUser as deleteUserInService,
  findUserById as findUserInService,
  getDb as getUsersDb,
  updateUser as updateUserInService,
} from '../../../services/users/src/db';
import {
  closeDb,
  assignments,
  courses,
  enrollments,
  getDb,
  incrementRateLimitWindow,
  organizations,
  rateLimitWindows,
  submissions,
  users,
} from '../src/index';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is required. Point it at a disposable PostgreSQL database with current EduNet migrations applied.'
  );
}

const db = getDb();
const runId = randomUUID();
const organizationCode = `it-${runId}`;
const studentEmail = `student-${runId}@integration.invalid`;
const teacherEmail = `teacher-${runId}@integration.invalid`;

describe('PostgreSQL integration: core LMS relations', () => {
  let organizationId: string;
  let otherOrganizationId: string;
  let courseId: string;
  let studentId: string;
  let scopedUserId: string;

  afterAll(async () => {
    try {
      if (courseId) {
        await db.delete(enrollments).where(eq(enrollments.courseId, courseId));
        await db.delete(courses).where(eq(courses.id, courseId));
      }
      if (organizationId) {
        await db.delete(users).where(eq(users.organizationId, organizationId));
        await db.delete(organizations).where(eq(organizations.id, organizationId));
      }
      if (otherOrganizationId) {
        await db.delete(users).where(eq(users.organizationId, otherOrganizationId));
        await db.delete(organizations).where(eq(organizations.id, otherOrganizationId));
      }
    } finally {
      try {
        await closeAssessmentsDb();
      } finally {
        try {
          await closeEnrollmentsDb();
        } finally {
          try {
            await closeSubmissionsDb();
          } finally {
            try {
              await closeAssignmentsDb();
            } finally {
              try {
                      await closeUsersDb();
                    } finally {
                      try {
                        await closeContentDb();
                      } finally {
                        await closeDb();
                      }
              }
            }
          }
        }
      }
    }
  });

  it('persists and reads organization, users, course, and enrollment across real tables', async () => {
    const [organization] = await db
      .insert(organizations)
      .values({ name: 'Integration School', type: 'school', code: organizationCode })
      .returning();
    organizationId = organization.id;

    const [teacher] = await db
      .insert(users)
      .values({
        email: teacherEmail,
        passwordHash: 'integration-only-hash',
        firstName: 'Test',
        lastName: 'Teacher',
        role: 'teacher',
        organizationId,
      })
      .returning();
    const [student] = await db
      .insert(users)
      .values({
        email: studentEmail,
        passwordHash: 'integration-only-hash',
        firstName: 'Test',
        lastName: 'Student',
        role: 'student',
        organizationId,
      })
      .returning();
    studentId = student.id;

    const [course] = await db
      .insert(courses)
      .values({
        organizationId,
        teacherId: teacher.id,
        title: 'Integration course',
        description: 'Created by the PostgreSQL integration test.',
        subject: 'testing',
      })
      .returning();
    courseId = course.id;

    const [enrollment] = await db
      .insert(enrollments)
      .values({ studentId, courseId, status: 'active' })
      .returning();

    const [storedEnrollment] = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, enrollment.id));

    expect(storedEnrollment).toMatchObject({
      studentId,
      courseId,
      status: 'active',
    });
  });

  it('enforces real PostgreSQL foreign-key constraints', async () => {
    await expect(
      db.insert(courses).values({
        organizationId,
        teacherId: randomUUID(),
        title: 'Invalid course',
        description: 'Must be rejected by PostgreSQL.',
        subject: 'testing',
      })
    ).rejects.toThrow();

    await expect(
      db.insert(courses).values({
        organizationId: randomUUID(),
        teacherId: studentId,
        title: 'Invalid organization course',
        description: 'Must be rejected by PostgreSQL.',
        subject: 'testing',
      })
    ).rejects.toThrow();
  });

  it('scopes lesson reads and mutations through the owning course organization', async () => {
    if (!otherOrganizationId) {
      const [otherOrganization] = await db.insert(organizations).values({
        name: 'Other Integration School',
        type: 'school',
        code: `ic-${runId}`,
      }).returning();
      otherOrganizationId = otherOrganization.id;
    }
    const lesson = await createLessonInService({
      courseId,
      title: 'Tenant lesson',
      type: 'text',
      order: '1',
    }, organizationId);

    expect(await findLessonInService(lesson.id, otherOrganizationId)).toBeNull();
    expect(await updateLessonInService(lesson.id, otherOrganizationId, { title: 'Cross tenant edit' })).toBeUndefined();
    expect(await deleteLessonInService(lesson.id, otherOrganizationId)).toBeUndefined();
    expect(await findLessonInService(lesson.id, organizationId)).toMatchObject({ title: 'Tenant lesson' });
    await deleteLessonInService(lesson.id, organizationId);
  });

  it('scopes lesson progress, resources, and media access to the owning organization', async () => {
    const [otherStudent] = await db.insert(users).values({
      email: `other-${runId}@integration.invalid`,
      passwordHash: 'integration-only-hash',
      firstName: 'Other',
      lastName: 'Student',
      role: 'student',
      organizationId: otherOrganizationId,
    }).returning();
    const lesson = await createLessonInService({
      courseId,
      title: 'Content tenant fixture',
      type: 'text',
      order: '2',
    }, organizationId);

    const progress = await createLessonProgressInService({
      lessonId: lesson.id,
      studentId,
      status: 'in_progress',
      progress: '25',
    }, organizationId);
    expect(await findLessonProgressInService(progress.id, otherOrganizationId)).toBeNull();
    expect(await listLessonProgressByStudentInService(studentId, otherOrganizationId)).toEqual([]);
    expect(await updateLessonProgressInService(progress.id, otherOrganizationId, { progress: '90' })).toBeUndefined();
    expect(await deleteLessonProgressInService(progress.id, otherOrganizationId)).toBeUndefined();
    expect(await findLessonProgressInService(progress.id, organizationId)).toMatchObject({ progress: '25' });
    await expect(createLessonProgressInService({
      lessonId: lesson.id,
      studentId: otherStudent.id,
      status: 'in_progress',
    }, organizationId)).rejects.toThrow();

    const resource = await createResourceInService({
      courseId,
      lessonId: lesson.id,
      title: 'Tenant resource',
      type: 'link',
      url: 'https://integration.invalid/resource',
    }, organizationId);
    expect(await findResourceInService(resource.id, otherOrganizationId)).toBeNull();
    expect(await listResourcesByCourseInService(courseId, otherOrganizationId)).toEqual([]);
    expect(await listResourcesByLessonInService(lesson.id, otherOrganizationId)).toEqual([]);
    expect(await updateResourceInService(resource.id, otherOrganizationId, { title: 'Cross tenant edit' })).toBeUndefined();
    expect(await deleteResourceInService(resource.id, otherOrganizationId)).toBeUndefined();
    expect(await findResourceInService(resource.id, organizationId)).toMatchObject({ title: 'Tenant resource' });

    const media = await createMediaFileInService({
      id: randomUUID(),
      lessonId: lesson.id,
      courseId,
      uploadedBy: studentId,
      type: 'document',
      title: 'Tenant media',
      fileName: 'lesson.pdf',
      fileSize: 128,
      mimeType: 'application/pdf',
      storageKey: `test/${runId}/lesson.pdf`,
    }, organizationId);
    expect(await findMediaFileInService(media.id, otherOrganizationId)).toBeNull();
    expect(await listMediaFilesByCourseInService(courseId, otherOrganizationId)).toEqual([]);
    expect(await listMediaFilesByLessonInService(lesson.id, otherOrganizationId)).toEqual([]);
    expect(await incrementMediaDownloadCountInService(media.id, otherOrganizationId)).toBeUndefined();
    expect(await deleteMediaFileInService(media.id, otherOrganizationId)).toBeUndefined();
    expect(await findMediaFileInService(media.id, organizationId)).toMatchObject({ downloadCount: 0, deletedAt: null });
    await expect(createMediaFileInService({
      id: randomUUID(),
      courseId,
      uploadedBy: otherStudent.id,
      type: 'document',
      title: 'Invalid tenant media',
      fileName: 'invalid.pdf',
      fileSize: 128,
      mimeType: 'application/pdf',
      storageKey: `test/${runId}/invalid.pdf`,
    }, organizationId)).rejects.toThrow();
  });

  it('scopes user lookup and mutation queries to the requested organization', async () => {
    if (!otherOrganizationId) {
      const [otherOrganization] = await db
        .insert(organizations)
        .values({ name: 'Other Integration School', type: 'school', code: `it-other-${runId}` })
        .returning();
      otherOrganizationId = otherOrganization.id;
    }

    const [scopedUser] = await db
      .insert(users)
      .values({
        email: `scoped-${runId}@integration.invalid`,
        passwordHash: 'integration-only-hash',
        firstName: 'Tenant',
        lastName: 'User',
        role: 'student',
        organizationId,
      })
      .returning();
    scopedUserId = scopedUser.id;

    const usersDb = getUsersDb();
    expect(await findUserInService(scopedUserId, otherOrganizationId)).toBeNull();
    expect(
      await updateUserInService(scopedUserId, otherOrganizationId, { firstName: 'Changed' })
    ).toBeUndefined();
    expect(await deleteUserInService(scopedUserId, otherOrganizationId)).toBeUndefined();

    const [unchangedUser] = await usersDb.select().from(users).where(eq(users.id, scopedUserId));
    expect(unchangedUser.firstName).toBe('Tenant');
    expect(await findUserInService(scopedUserId, organizationId)).toMatchObject({
      id: scopedUserId,
      organizationId,
    });

    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    const assignmentsDb = getAssignmentsDb();
    await expect(
      createAssignmentInService({
        courseId,
        organizationId: otherOrganizationId,
        teacherId: course.teacherId,
        title: 'Wrong tenant assignment',
        description: 'Must not be created.',
        dueDate: new Date('2030-01-01T00:00:00Z'),
        maxPoints: 10,
      })
    ).rejects.toThrow();

    const assignment = await createAssignmentInService({
      courseId,
      organizationId,
      teacherId: course.teacherId,
      title: 'Scoped assignment',
      description: 'Created by the PostgreSQL integration test.',
      dueDate: new Date('2030-01-01T00:00:00Z'),
      maxPoints: 10,
    });

    expect(await findAssignmentInService(assignment.id, otherOrganizationId)).toBeNull();
    expect(await listAssignmentsByCourseInService(courseId, otherOrganizationId)).toEqual([]);
    expect(await getAssignmentSubmissionCountInService(assignment.id, otherOrganizationId)).toBe(0);
    expect(
      await updateAssignmentInService(assignment.id, otherOrganizationId, { title: 'Changed' })
    ).toBeUndefined();
    expect(await deleteAssignmentInService(assignment.id, otherOrganizationId)).toBeUndefined();

    const [unchangedAssignment] = await assignmentsDb
      .select()
      .from(assignments)
      .where(eq(assignments.id, assignment.id));
    expect(unchangedAssignment.title).toBe('Scoped assignment');
    expect(await findAssignmentInService(assignment.id, organizationId)).toMatchObject({
      id: assignment.id,
      courseId,
    });

    await expect(
      createSubmissionInService({
        assignmentId: assignment.id,
        studentId: scopedUserId,
        organizationId: otherOrganizationId,
        content: 'Must not be created in another tenant.',
      })
    ).rejects.toThrow();

    const submission = await createSubmissionInService({
      assignmentId: assignment.id,
      studentId: scopedUserId,
      organizationId,
      content: 'Created by the PostgreSQL integration test.',
    });
    const submissionsDb = getSubmissionsDb();

    expect(await findSubmissionByIdInService(submission.id, otherOrganizationId)).toBeNull();
    expect(
      await findSubmissionInService(assignment.id, scopedUserId, otherOrganizationId)
    ).toBeNull();
    expect(await listSubmissionsByAssignmentInService(assignment.id, otherOrganizationId)).toEqual(
      []
    );
    expect(await listSubmissionsByStudentInService(scopedUserId, otherOrganizationId)).toEqual([]);
    expect(
      await gradeSubmissionInService(submission.id, otherOrganizationId, 5, course.teacherId)
    ).toBeUndefined();
    expect(await deleteSubmissionInService(submission.id, otherOrganizationId)).toBeUndefined();

    const [unchangedSubmission] = await submissionsDb
      .select()
      .from(submissions)
      .where(eq(submissions.id, submission.id));
    expect(unchangedSubmission.grade).toBe(submission.grade);
    expect(await findSubmissionByIdInService(submission.id, organizationId)).toMatchObject({
      id: submission.id,
      studentId: scopedUserId,
    });

    await expect(
      createEnrollmentInService({
        studentId: scopedUserId,
        courseId,
        organizationId: otherOrganizationId,
      })
    ).rejects.toThrow();

    const enrollment = await createEnrollmentInService({
      studentId: scopedUserId,
      courseId,
      organizationId,
    });
    const enrollmentsDb = getEnrollmentsDb();

    expect(await findEnrollmentByIdInService(enrollment.id, otherOrganizationId)).toBeNull();
    expect(await findEnrollmentInService(scopedUserId, courseId, otherOrganizationId)).toBeNull();
    expect(await listEnrollmentsByStudentInService(scopedUserId, otherOrganizationId)).toEqual([]);
    expect(await listEnrollmentsByCourseInService(courseId, otherOrganizationId)).toEqual([]);
    expect(
      await updateEnrollmentStatusInService(enrollment.id, otherOrganizationId, 'completed')
    ).toBeUndefined();
    expect(await deleteEnrollmentInService(enrollment.id, otherOrganizationId)).toBeUndefined();

    const [unchangedEnrollment] = await enrollmentsDb
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, enrollment.id));
    expect(unchangedEnrollment.status).toBe('active');
    expect(await findEnrollmentByIdInService(enrollment.id, organizationId)).toMatchObject({
      id: enrollment.id,
      studentId: scopedUserId,
      courseId,
    });

    await expect(
      createQuizInService(
        {
          courseId,
          title: 'Wrong tenant quiz',
          type: 'quiz',
        },
        otherOrganizationId
      )
    ).rejects.toThrow();

    const quiz = await createQuizInService(
      {
        courseId,
        title: 'Scoped quiz',
        type: 'quiz',
      },
      organizationId
    );
    const assessmentsDb = getAssessmentsDb();

    expect(await findQuizInService(quiz.id, otherOrganizationId)).toBeNull();
    expect(await listQuizzesByCourseInService(courseId, otherOrganizationId)).toEqual([]);
    expect(
      await updateQuizInService(quiz.id, otherOrganizationId, { title: 'Changed' })
    ).toBeUndefined();
    expect(await deleteQuizInService(quiz.id, otherOrganizationId)).toBeUndefined();

    await expect(
      createQuestionInService(
        {
          quizId: quiz.id,
          type: 'multiple_choice',
          text: 'Wrong tenant question',
          points: '2',
          order: '0',
        },
        otherOrganizationId
      )
    ).rejects.toThrow();

    const question = await createQuestionInService(
      {
        quizId: quiz.id,
        type: 'multiple_choice',
        text: 'Scoped question',
        points: '2',
        order: '0',
      },
      organizationId
    );

    expect(await findQuestionInService(question.id, otherOrganizationId)).toBeNull();
    expect(await listQuestionsByQuizInService(quiz.id, otherOrganizationId)).toEqual([]);
    expect(
      await updateQuestionInService(question.id, otherOrganizationId, { text: 'Changed' })
    ).toBeUndefined();
    expect(await deleteQuestionInService(question.id, otherOrganizationId)).toBeUndefined();

    await expect(
      createQuizAttemptInService(
        {
          quizId: quiz.id,
          studentId: scopedUserId,
          passed: 'false',
        },
        otherOrganizationId
      )
    ).rejects.toThrow();

    const attempt = await createQuizAttemptInService(
      {
        quizId: quiz.id,
        studentId: scopedUserId,
        passed: 'false',
      },
      organizationId
    );

    expect(await findQuizAttemptInService(attempt.id, otherOrganizationId)).toBeNull();
    expect(await listQuizAttemptsByQuizInService(quiz.id, otherOrganizationId)).toEqual([]);
    expect(await listQuizAttemptsByStudentInService(scopedUserId, otherOrganizationId)).toEqual([]);
    expect(
      await updateQuizAttemptInService(attempt.id, otherOrganizationId, { passed: 'true' })
    ).toBeUndefined();
    expect(await deleteQuizAttemptInService(attempt.id, otherOrganizationId)).toBeUndefined();
    expect(await findQuizAttemptInService(attempt.id, organizationId)).toMatchObject({
      id: attempt.id,
      studentId: scopedUserId,
    });
    expect(await findQuizInService(quiz.id, organizationId)).toMatchObject({
      id: quiz.id,
      courseId,
    });
    expect(await findQuestionInService(question.id, organizationId)).toMatchObject({
      id: question.id,
      quizId: quiz.id,
    });
    expect(await assessmentsDb.select().from(users).where(eq(users.id, scopedUserId))).toHaveLength(
      1
    );
  });
});

describe('PostgreSQL integration: shared rate-limit windows', () => {
  const key = `it-rate-limit|${runId}`;
  const windowMs = 60_000;
  const windowStart = 10_000;

  afterAll(async () => {
    await db.delete(rateLimitWindows).where(eq(rateLimitWindows.key, key));
  });

  it('increments atomically without losing concurrent requests', async () => {
    const counts = await Promise.all(
      Array.from({ length: 20 }, () =>
        incrementRateLimitWindow({ key, windowStart, windowMs }),
      ),
    );

    expect([...counts].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
  });

  it('reuses the row and resets the counter in the next window', async () => {
    expect(await incrementRateLimitWindow({ key, windowStart: windowStart + windowMs, windowMs })).toBe(1);
    expect(await incrementRateLimitWindow({ key, windowStart: windowStart + windowMs, windowMs })).toBe(2);

    const rows = await db
      .select()
      .from(rateLimitWindows)
      .where(eq(rateLimitWindows.key, key));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key, windowStart: windowStart + windowMs, count: 2 });
  });
});
