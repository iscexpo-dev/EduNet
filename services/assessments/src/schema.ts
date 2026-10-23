import { pgTable, uuid, text, timestamp, jsonb, integer, index, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { courses, users, organizations } from '@edunet/database';

// Quizzes - Assessment containers
export const quizzes = pgTable('quizzes', {
  id: uuid('id').defaultRandom().primaryKey(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  type: text('type').notNull(), // quiz, exam, survey
  timeLimit: text('time_limit'), // e.g., "30m", "1h"
  passingScore: text('passing_score'), // e.g., "70%", "80/100"
  maxAttempts: text('max_attempts'), // e.g., "3", "unlimited"
  shuffleQuestions: text('shuffle_questions').default('false').notNull(), // true, false
  showResults: text('show_results').default('immediate').notNull(), // immediate, after_deadline, never
  availableFrom: timestamp('available_from'),
  availableUntil: timestamp('available_until'),
  isActive: text('is_active').default('true').notNull(),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  courseIdx: index('quizzes_course_id_idx').on(table.courseId),
  isActiveIdx: index('quizzes_is_active_idx').on(table.isActive),
  availableIdx: index('quizzes_available_idx').on(table.availableFrom, table.availableUntil),
}));

// Questions - Individual questions within quizzes
export const questions = pgTable('questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  quizId: uuid('quiz_id').references(() => quizzes.id, { onDelete: 'cascade' }).notNull(),
  type: text('type').notNull(), // multiple_choice, true_false, short_answer, essay, matching
  text: text('text').notNull(),
  points: text('points').notNull(), // e.g., "5", "10"
  order: text('order').notNull(), // Display order
  options: jsonb('options'), // For multiple choice: [{text: "A", correct: true}, ...]
  correctAnswer: jsonb('correct_answer'), // For structured answers
  explanation: text('explanation'), // Explanation shown after submission
  metadata: jsonb('metadata'), // Additional question metadata
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  quizIdx: index('questions_quiz_id_idx').on(table.quizId),
  orderIdx: index('questions_order_idx').on(table.quizId, table.order),
}));

// Quiz Attempts - Student attempts at quizzes
export const quizAttempts = pgTable('quiz_attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  quizId: uuid('quiz_id').references(() => quizzes.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  submittedAt: timestamp('submitted_at'),
  score: text('score'), // e.g., "85%", "85/100"
  passed: text('passed').notNull(), // true, false
  timeSpent: text('time_spent'), // e.g., "25m 30s"
  answers: jsonb('answers'), // {questionId: answer}
  feedback: jsonb('feedback'), // Detailed feedback per question
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  quizStudentIdx: index('quiz_attempts_quiz_student_idx').on(table.quizId, table.studentId),
  studentIdx: index('quiz_attempts_student_id_idx').on(table.studentId),
  submittedIdx: index('quiz_attempts_submitted_idx').on(table.submittedAt),
}));

// Relations
export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
  course: one(courses, {
    fields: [quizzes.courseId],
    references: [courses.id],
  }),
  questions: many(questions),
  attempts: many(quizAttempts),
}));

export const questionsRelations = relations(questions, ({ one }) => ({
  quiz: one(quizzes, {
    fields: [questions.quizId],
    references: [quizzes.id],
  }),
}));

export const quizAttemptsRelations = relations(quizAttempts, ({ one }) => ({
  quiz: one(quizzes, {
    fields: [quizAttempts.quizId],
    references: [quizzes.id],
  }),
  student: one(users, {
    fields: [quizAttempts.studentId],
    references: [users.id],
  }),
}));

// ---------------------------------------------------------------------------
// Assessment expansion: question banks, grade history, recheck workflow
// ---------------------------------------------------------------------------

// Question banks are organization-scoped pools reusable across quizzes.
// questions.bankId optionally links a question to a bank it was drawn from.
export const questionBanks = pgTable('question_banks', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  subject: text('subject'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  isActive: text('is_active').default('true').notNull(),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('question_banks_org_idx').on(table.organizationId),
  orgSubjectIdx: index('question_banks_org_subject_idx').on(table.organizationId, table.subject),
}));

// Grade revisions record every score change after auto-grading so scores are
// auditable end-to-end (manual grading, recheck adjustments).
export const gradeRevisions = pgTable('grade_revisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  attemptId: uuid('attempt_id').references(() => quizAttempts.id, { onDelete: 'cascade' }).notNull(),
  adjustedBy: uuid('adjusted_by').references(() => users.id, { onDelete: 'set null' }),
  previousScorePercent: integer('previous_score_percent'),
  newScorePercent: integer('new_score_percent').notNull(),
  prevEarnedPoints: text('prev_earned_points'),
  newEarnedPoints: text('new_earned_points'),
  reason: text('reason').notNull(),
  source: text('source').default('manual_grade').notNull(), // manual_grade | recheck
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  attemptIdx: index('grade_revisions_attempt_idx').on(table.attemptId),
}));

// Recheck (challenge) workflow: a student may request review of a graded attempt.
export const recheckRequests = pgTable('recheck_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  attemptId: uuid('attempt_id').references(() => quizAttempts.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  questionId: uuid('question_id'),
  reason: text('reason').notNull(),
  // pending | approved | rejected
  status: text('status').default('pending').notNull(),
  decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
  decisionNote: text('decision_note'),
  decidedAt: timestamp('decided_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  attemptIdx: index('recheck_requests_attempt_idx').on(table.attemptId),
  studentIdx: index('recheck_requests_student_idx').on(table.studentId),
  statusIdx: index('recheck_requests_status_idx').on(table.status),
  attemptStatusIdx: index('recheck_requests_attempt_status_idx').on(table.attemptId, table.status),
}));
