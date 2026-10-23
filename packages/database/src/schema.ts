import { pgTable, serial, integer, text, timestamp, boolean, uuid, varchar, jsonb, index, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Organizations
export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // school, district, university, training_center
  code: varchar('code', { length: 50 }).notNull(),
  address: text('address'),
  isActive: boolean('is_active').default(true).notNull(),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  codeIdx: unique('organizations_code_unique').on(table.code),
  typeIdx: index('organizations_type_idx').on(table.type),
  isActiveIdx: index('organizations_is_active_idx').on(table.isActive),
}));

// Users
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  phoneNumber: varchar('phone_number', { length: 20 }),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  role: varchar('role', { length: 20 }).notNull(), // student, teacher, parent, admin, tutor
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'restrict' }).notNull(),
  avatarUrl: text('avatar_url'),
  isVerified: boolean('is_verified').default(false).notNull(),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  emailIdx: unique('users_email_unique').on(table.email),
  organizationIdx: index('users_organization_id_idx').on(table.organizationId),
  roleIdx: index('users_role_idx').on(table.role),
  isActiveIdx: index('users_is_verified_idx').on(table.isVerified),
}));

// Courses
export const courses = pgTable('courses', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'restrict' }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description').notNull(),
  subject: varchar('subject', { length: 100 }).notNull(),
  grade: varchar('grade', { length: 20 }),
  teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  organizationIdx: index('courses_organization_id_idx').on(table.organizationId),
  teacherIdx: index('courses_teacher_id_idx').on(table.teacherId),
  subjectIdx: index('courses_subject_idx').on(table.subject),
  isActiveIdx: index('courses_is_active_idx').on(table.isActive),
  orgTeacherIdx: index('courses_org_teacher_idx').on(table.organizationId, table.teacherId),
  orgActiveIdx: index('courses_org_active_idx').on(table.organizationId, table.isActive),
}));

// Parent-Child Relationships
export const parentChildRelationships = pgTable('parent_child_relationships', {
  id: uuid('id').defaultRandom().primaryKey(),
  parentId: uuid('parent_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  childId: uuid('child_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  relationship: varchar('relationship', { length: 50 }).notNull(), // father, mother, guardian, etc.
  isPrimary: boolean('is_primary').default(false).notNull(),
  canViewGrades: boolean('can_view_grades').default(true).notNull(),
  canViewAttendance: boolean('can_view_attendance').default(true).notNull(),
  canViewAssignments: boolean('can_view_assignments').default(true).notNull(),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  parentChildIdx: unique('parent_child_relationships_parent_child_unique').on(table.parentId, table.childId),
  parentIdx: index('parent_child_relationships_parent_id_idx').on(table.parentId),
  childIdx: index('parent_child_relationships_child_id_idx').on(table.childId),
}));

// Enrollments
export const enrollments = pgTable('enrollments', {
  id: uuid('id').defaultRandom().primaryKey(),
  studentId: uuid('student_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  enrolledAt: timestamp('enrolled_at').defaultNow().notNull(),
  status: varchar('status', { length: 20 }).notNull(), // active, completed, dropped
  deletedAt: timestamp('deleted_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  studentCourseIdx: unique('enrollments_student_course_unique').on(table.studentId, table.courseId),
  studentIdx: index('enrollments_student_id_idx').on(table.studentId),
  courseIdx: index('enrollments_course_id_idx').on(table.courseId),
  statusIdx: index('enrollments_status_idx').on(table.status),
  studentStatusIdx: index('enrollments_student_status_idx').on(table.studentId, table.status),
  courseStatusIdx: index('enrollments_course_status_idx').on(table.courseId, table.status),
}));

// Assignments
export const assignments = pgTable('assignments', {
  id: uuid('id').defaultRandom().primaryKey(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description').notNull(),
  dueDate: timestamp('due_date').notNull(),
  maxPoints: integer('max_points').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  courseIdx: index('assignments_course_id_idx').on(table.courseId),
  dueDateIdx: index('assignments_due_date_idx').on(table.dueDate),
  isActiveIdx: index('assignments_is_active_idx').on(table.isActive),
  courseActiveIdx: index('assignments_course_active_idx').on(table.courseId, table.isActive),
  courseDueDateIdx: index('assignments_course_due_date_idx').on(table.courseId, table.dueDate),
}));

// Submissions
export const submissions = pgTable('submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  assignmentId: uuid('assignment_id').references(() => assignments.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  content: text('content').notNull(),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  grade: integer('grade'),
  feedback: text('feedback'),
  gradedAt: timestamp('graded_at'),
  gradedBy: uuid('graded_by').references(() => users.id, { onDelete: 'set null' }),
  deletedAt: timestamp('deleted_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  assignmentStudentIdx: unique('submissions_assignment_student_unique').on(table.assignmentId, table.studentId),
  assignmentIdx: index('submissions_assignment_id_idx').on(table.assignmentId),
  studentIdx: index('submissions_student_id_idx').on(table.studentId),
  gradedByIdx: index('submissions_graded_by_idx').on(table.gradedBy),
  studentGradeIdx: index('submissions_student_grade_idx').on(table.studentId, table.grade),
  assignmentGradeIdx: index('submissions_assignment_grade_idx').on(table.assignmentId, table.grade),
}));

// Identity: audit trail for every authentication-relevant event.
// Events are security data, not analytics data; entries carry only a
// pseudonymised IP (HMAC) and never passwords or tokens.
export const identityAuditEvents = pgTable('identity_audit_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Nullable: events can precede user creation (unknown email login attempts).
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  // login_success | login_failure | password_reset_requested |
  // password_reset_completed | email_verified | session_revoked | lockout
  eventType: varchar('event_type', { length: 50 }).notNull(),
  outcome: varchar('outcome', { length: 20 }).default('success').notNull(), // success | failure
  ipHash: varchar('ip_hash', { length: 64 }),
  userAgent: varchar('user_agent', { length: 300 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: index('identity_audit_events_user_idx').on(table.userId),
  eventTypeIdx: index('identity_audit_events_event_type_idx').on(table.eventType),
  createdAtIdx: index('identity_audit_events_created_at_idx').on(table.createdAt),
  ipHashIdx: index('identity_audit_events_ip_hash_idx').on(table.ipHash),
}));

// Identity: single-use opaque tokens (password reset, email/phone verification).
// Raw token is shown/emailed once; only its hash is stored.
export const identityTokens = pgTable('identity_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  // password_reset | email_verification | phone_verification
  kind: varchar('kind', { length: 40 }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  tokenHashIdx: unique('identity_tokens_token_hash_unique').on(table.tokenHash),
  userIdx: index('identity_tokens_user_id_idx').on(table.userId),
  kindIdx: index('identity_tokens_kind_idx').on(table.kind),
  userIdKindIdx: index('identity_tokens_user_kind_idx').on(table.userId, table.kind),
}));

// Identity: device/session registry backing refresh-token revocation and
// device management. One row per established login session.
export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  sessionId: varchar('session_id', { length: 64 }).notNull(), // jwtId claim
  deviceName: varchar('device_name', { length: 200 }),
  ipHash: varchar('ip_hash', { length: 64 }),
  userAgent: varchar('user_agent', { length: 300 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
  revokedAt: timestamp('revoked_at'),
}, (table) => ({
  sessionIdIdx: unique('sessions_session_id_unique').on(table.sessionId),
  userIdx: index('sessions_user_id_idx').on(table.userId),
  activeIdx: index('sessions_active_idx').on(table.userId, table.revokedAt),
}));

// Relations
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  courses: many(courses),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  courses: many(courses),
  enrollments: many(enrollments),
  submissions: many(submissions),
  parentRelationships: many(parentChildRelationships, {
    relationName: 'parentRelationships',
  }),
  childRelationships: many(parentChildRelationships, {
    relationName: 'childRelationships',
  }),
}));

export const parentChildRelationshipsRelations = relations(parentChildRelationships, ({ one }) => ({
  parent: one(users, {
    fields: [parentChildRelationships.parentId],
    references: [users.id],
    relationName: 'parentRelationships',
  }),
  child: one(users, {
    fields: [parentChildRelationships.childId],
    references: [users.id],
    relationName: 'childRelationships',
  }),
}));

export const coursesRelations = relations(courses, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [courses.organizationId],
    references: [organizations.id],
  }),
  teacher: one(users, {
    fields: [courses.teacherId],
    references: [users.id],
  }),
  enrollments: many(enrollments),
  assignments: many(assignments),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  student: one(users, {
    fields: [enrollments.studentId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [enrollments.courseId],
    references: [courses.id],
  }),
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  course: one(courses, {
    fields: [assignments.courseId],
    references: [courses.id],
  }),
  submissions: many(submissions),
}));

export const submissionsRelations = relations(submissions, ({ one }) => ({
  assignment: one(assignments, {
    fields: [submissions.assignmentId],
    references: [assignments.id],
  }),
  student: one(users, {
    fields: [submissions.studentId],
    references: [users.id],
  }),
  gradedBy: one(users, {
    fields: [submissions.gradedBy],
    references: [users.id],
  }),
}));
