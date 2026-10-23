import { pgTable, uuid, text, timestamp, jsonb, index, unique, integer, boolean, varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { courses, users } from '@edunet/database';

// Course modules: sections/chapters, optionally nested via parentId.
export const courseModules = pgTable('course_modules', {
  id: uuid('id').defaultRandom().primaryKey(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  parentId: uuid('parent_id'),
  title: text('title').notNull(),
  description: text('description'),
  order: integer('order').default(0).notNull(),
  isPublished: boolean('is_published').default(false).notNull(),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  courseIdx: index('course_modules_course_idx').on(table.courseId),
  orderIdx: index('course_modules_order_idx').on(table.courseId, table.order),
  parentIdx: index('course_modules_parent_idx').on(table.parentId),
}));

// Lessons - Content units within courses
export const lessons = pgTable('lessons', {
  id: uuid('id').defaultRandom().primaryKey(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  moduleId: uuid('module_id').references(() => courseModules.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  type: text('type').notNull(), // video, text, document, interactive, quiz
  content: jsonb('content'), // Structured content based on type
  order: text('order').notNull(), // Display order within course
  duration: text('duration'), // e.g., "30m", "1h"
  category: varchar('category', { length: 80 }),
  tags: jsonb('tags').default([]).notNull(),
  isPublished: text('is_published').default('false').notNull(), // true, false
  publishedAt: timestamp('published_at'),
  scheduledFor: timestamp('scheduled_for'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  courseIdx: index('lessons_course_id_idx').on(table.courseId),
  moduleIdx: index('lessons_module_idx').on(table.moduleId),
  orderIdx: index('lessons_order_idx').on(table.courseId, table.order),
  isPublishedIdx: index('lessons_is_published_idx').on(table.isPublished),
  categoryIdx: index('lessons_category_idx').on(table.category),
}));

// Learning objectives and course prerequisites
export const learningObjectives = pgTable('learning_objectives', {
  id: uuid('id').defaultRandom().primaryKey(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  description: text('description').notNull(),
  order: integer('order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  courseIdx: index('learning_objectives_course_idx').on(table.courseId, table.order),
}));

export const lessonObjectives = pgTable('lesson_objectives', {
  id: uuid('id').defaultRandom().primaryKey(),
  lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }).notNull(),
  objectiveId: uuid('objective_id').references(() => learningObjectives.id, { onDelete: 'cascade' }).notNull(),
}, (table) => ({
  pairIdx: unique('lesson_objectives_pair_unique').on(table.lessonId, table.objectiveId),
}));

export const coursePrerequisites = pgTable('course_prerequisites', {
  id: uuid('id').defaultRandom().primaryKey(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  prerequisiteCourseId: uuid('prerequisite_course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
}, (table) => ({
  pairIdx: unique('course_prerequisites_pair_unique').on(table.courseId, table.prerequisiteCourseId),
}));

// Personal learning state
export const lessonBookmarks = pgTable('lesson_bookmarks', {
  id: uuid('id').defaultRandom().primaryKey(),
  lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  pairIdx: unique('lesson_bookmarks_pair_unique').on(table.lessonId, table.studentId),
  studentIdx: index('lesson_bookmarks_student_idx').on(table.studentId),
}));

export const lessonNotes = pgTable('lesson_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  pairIdx: unique('lesson_notes_pair_unique').on(table.lessonId, table.studentId),
  studentIdx: index('lesson_notes_student_idx').on(table.studentId),
}));

// Editorial workflow: draft -> submitted -> approved/rejected -> published.
export const contentReviews = pgTable('content_reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }).notNull(),
  submittedBy: uuid('submitted_by').references(() => users.id, { onDelete: 'set null' }),
  reviewerId: uuid('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 20 }).default('submitted').notNull(), // submitted | approved | rejected
  comments: text('comments'),
  decidedAt: timestamp('decided_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  lessonIdx: index('content_reviews_lesson_idx').on(table.lessonId, table.createdAt),
  statusIdx: index('content_reviews_status_idx').on(table.status),
}));

// Lesson Progress - Student progress through lessons
export const lessonProgress = pgTable('lesson_progress', {
  id: uuid('id').defaultRandom().primaryKey(),
  lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  status: text('status').notNull(), // not_started, in_progress, completed
  progress: text('progress').default('0').notNull(), // e.g., "50", "100" (percentage)
  timeSpent: text('time_spent'), // e.g., "15m 30s"
  lastAccessedAt: timestamp('last_accessed_at'),
  completedAt: timestamp('completed_at'),
  deletedAt: timestamp('deleted_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  lessonStudentIdx: unique('lesson_progress_lesson_student_unique').on(table.lessonId, table.studentId),
  studentIdx: index('lesson_progress_student_id_idx').on(table.studentId),
  statusIdx: index('lesson_progress_status_idx').on(table.status),
}));

// Resources - Attachments and supplementary materials
export const resources = pgTable('resources', {
  id: uuid('id').defaultRandom().primaryKey(),
  lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  type: text('type').notNull(), // pdf, doc, video, image, link, other
  url: text('url').notNull(),
  size: text('size'), // e.g., "2.5MB"
  mimeType: text('mime_type'),
  description: text('description'),
  order: text('order'),
  isDownloadable: text('is_downloadable').default('true').notNull(),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  lessonIdx: index('resources_lesson_id_idx').on(table.lessonId),
  courseIdx: index('resources_course_id_idx').on(table.courseId),
  typeIdx: index('resources_type_idx').on(table.type),
}));

// Content Versions - Version history for lessons
export const contentVersions = pgTable('content_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }).notNull(),
  version: integer('version').notNull(),
  title: text('title').notNull(),
  content: jsonb('content'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  lessonVersionIdx: unique('content_versions_lesson_version_unique').on(table.lessonId, table.version),
  lessonIdx: index('content_versions_lesson_id_idx').on(table.lessonId),
}));

// Media Files - Documents, images, audio, video metadata
export const mediaFiles = pgTable('media_files', {
  id: uuid('id').defaultRandom().primaryKey(),
  lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  type: text('type').notNull(), // document, image, audio, video
  title: text('title').notNull(),
  description: text('description'),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  storageKey: text('storage_key').notNull(),
  // No permanent public URL is stored: access URLs are signed and minted
  // per-request so private media cannot be reached by guessing a path.
  url: text('url'),
  duration: text('duration'), // for audio/video: e.g., "5m 30s"
  dimensions: text('dimensions'), // for images: e.g., "1920x1080"
  thumbnailUrl: text('thumbnail_url'),
  isPublic: boolean('is_public').default(false).notNull(),
  downloadCount: integer('download_count').default(0).notNull(),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  lessonIdx: index('media_files_lesson_id_idx').on(table.lessonId),
  courseIdx: index('media_files_course_id_idx').on(table.courseId),
  typeIdx: index('media_files_type_idx').on(table.type),
  uploadedByIdx: index('media_files_uploaded_by_idx').on(table.uploadedBy),
}));

// Relations
export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  course: one(courses, {
    fields: [lessons.courseId],
    references: [courses.id],
  }),
  progress: many(lessonProgress),
  resources: many(resources),
}));

export const lessonProgressRelations = relations(lessonProgress, ({ one }) => ({
  lesson: one(lessons, {
    fields: [lessonProgress.lessonId],
    references: [lessons.id],
  }),
  student: one(users, {
    fields: [lessonProgress.studentId],
    references: [users.id],
  }),
}));

export const resourcesRelations = relations(resources, ({ one }) => ({
  lesson: one(lessons, {
    fields: [resources.lessonId],
    references: [lessons.id],
  }),
  course: one(courses, {
    fields: [resources.courseId],
    references: [courses.id],
  }),
}));

export const contentVersionsRelations = relations(contentVersions, ({ one }) => ({
  lesson: one(lessons, {
    fields: [contentVersions.lessonId],
    references: [lessons.id],
  }),
  createdBy: one(users, {
    fields: [contentVersions.createdBy],
    references: [users.id],
  }),
}));

export const mediaFilesRelations = relations(mediaFiles, ({ one }) => ({
  lesson: one(lessons, {
    fields: [mediaFiles.lessonId],
    references: [lessons.id],
  }),
  course: one(courses, {
    fields: [mediaFiles.courseId],
    references: [courses.id],
  }),
  uploadedBy: one(users, {
    fields: [mediaFiles.uploadedBy],
    references: [users.id],
  }),
}));
