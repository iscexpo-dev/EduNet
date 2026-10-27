import {
  getDb,
  assignments,
  courses,
  enrollments,
  submissions,
  users,
} from '@edunet/database';
import { and, avg, count, eq, isNull, sql } from 'drizzle-orm';

/**
 * Every analytics query is scoped by course id AND the caller's organization.
 * Handlers additionally enforce course ownership, so this is defence in depth
 * against cross-tenant IDOR if a route check regresses.
 */
function courseScope(courseId: string, organizationId: string) {
  return and(
    eq(courses.id, courseId),
    eq(courses.organizationId, organizationId),
    isNull(courses.deletedAt),
  );
}

export async function findCourseForAnalytics(
  courseId: string,
  organizationId: string,
): Promise<{ id: string; teacherId: string } | null> {
  const [course] = await getDb()
    .select({ id: courses.id, teacherId: courses.teacherId })
    .from(courses)
    .where(courseScope(courseId, organizationId))
    .limit(1);
  return course ?? null;
}

export async function getCourseAnalytics(courseId: string, organizationId: string) {
  const db = getDb();

  const enrollmentCount = await db
    .select({ count: count() })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(and(courseScope(courseId, organizationId), isNull(enrollments.deletedAt)));

  const assignmentCount = await db
    .select({ count: count() })
    .from(assignments)
    .innerJoin(courses, eq(assignments.courseId, courses.id))
    .where(and(courseScope(courseId, organizationId), isNull(assignments.deletedAt)));

  const submissionScope = and(
    courseScope(courseId, organizationId),
    isNull(assignments.deletedAt),
    isNull(submissions.deletedAt),
  );

  const submissionsCount = await db
    .select({ count: count() })
    .from(submissions)
    .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
    .innerJoin(courses, eq(assignments.courseId, courses.id))
    .where(submissionScope);

  const gradedSubmissions = await db
    .select({ count: count() })
    .from(submissions)
    .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
    .innerJoin(courses, eq(assignments.courseId, courses.id))
    .where(and(submissionScope, sql`${submissions.grade} is not null`));

  const averageGrade = await db
    .select({ avg: avg(submissions.grade) })
    .from(submissions)
    .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
    .innerJoin(courses, eq(assignments.courseId, courses.id))
    .where(and(submissionScope, sql`${submissions.grade} is not null`));

  const averagePercent = await db
    .select({
      value: sql<string | null>`avg(
        case
          when ${assignments.maxPoints} > 0 and ${submissions.grade} is not null
          then (${submissions.grade}::numeric / ${assignments.maxPoints}) * 100
        end
      )`,
    })
    .from(submissions)
    .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
    .innerJoin(courses, eq(assignments.courseId, courses.id))
    .where(and(submissionScope, sql`${submissions.grade} is not null`));

  const percent = averagePercent[0]?.value;

  return {
    enrollmentCount: Number(enrollmentCount[0]?.count ?? 0),
    assignmentCount: Number(assignmentCount[0]?.count ?? 0),
    submissionsCount: Number(submissionsCount[0]?.count ?? 0),
    gradedSubmissions: Number(gradedSubmissions[0]?.count ?? 0),
    averageGrade: averageGrade[0]?.avg === null || averageGrade[0]?.avg === undefined
      ? null
      : Number(averageGrade[0].avg),
    averagePercent: percent === null || percent === undefined
      ? null
      : Math.round(Number(percent) * 100) / 100,
  };
}

export async function getStudentPerformance(courseId: string, organizationId: string) {
  return getDb()
    .select({
      submissionId: submissions.id,
      studentId: submissions.studentId,
      studentFirstName: users.firstName,
      studentLastName: users.lastName,
      assignmentId: submissions.assignmentId,
      grade: submissions.grade,
      submittedAt: submissions.submittedAt,
      maxPoints: assignments.maxPoints,
      assignmentTitle: assignments.title,
    })
    .from(submissions)
    .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
    .innerJoin(users, eq(submissions.studentId, users.id))
    .innerJoin(courses, eq(assignments.courseId, courses.id))
    .where(
      and(
        courseScope(courseId, organizationId),
        eq(users.organizationId, organizationId),
        isNull(assignments.deletedAt),
        isNull(submissions.deletedAt),
      ),
    )
    .orderBy(users.lastName, users.firstName);
}

export async function getAssignmentPerformance(courseId: string, organizationId: string) {
  return getDb()
    .select({
      assignmentId: assignments.id,
      assignmentTitle: assignments.title,
      dueDate: assignments.dueDate,
      maxPoints: assignments.maxPoints,
      submissionCount: count(submissions.id),
      averageGrade: avg(submissions.grade),
    })
    .from(assignments)
    .innerJoin(courses, eq(assignments.courseId, courses.id))
    .leftJoin(
      submissions,
      and(
        eq(submissions.assignmentId, assignments.id),
        isNull(submissions.deletedAt),
      ),
    )
    .where(and(courseScope(courseId, organizationId), isNull(assignments.deletedAt)))
    .groupBy(assignments.id)
    .orderBy(assignments.dueDate);
}

export async function getCourseEngagement(
  courseId: string,
  organizationId: string,
  days = 30,
) {
  const db = getDb();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const recentSubmissions = await db
    .select({ count: count() })
    .from(submissions)
    .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
    .innerJoin(courses, eq(assignments.courseId, courses.id))
    .where(
      and(
        courseScope(courseId, organizationId),
        isNull(assignments.deletedAt),
        isNull(submissions.deletedAt),
        sql`${submissions.submittedAt} >= ${cutoffDate}`,
      ),
    );

  const recentEnrollments = await db
    .select({ count: count() })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(
      and(
        courseScope(courseId, organizationId),
        isNull(enrollments.deletedAt),
        sql`${enrollments.enrolledAt} >= ${cutoffDate}`,
      ),
    );

  return {
    days,
    recentSubmissions: Number(recentSubmissions[0]?.count ?? 0),
    recentEnrollments: Number(recentEnrollments[0]?.count ?? 0),
  };
}
