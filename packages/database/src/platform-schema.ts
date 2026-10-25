/**
 * Platform schema: domains added after the core LMS baseline.
 *
 * Kept in one module so `drizzle-kit generate` produces a single ordered
 * migration. Every tenant-owned table carries `organization_id`; services must
 * filter on it even when a row is reachable by id.
 */
import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  boolean,
  varchar,
  jsonb,
  index,
  unique,
  real,
  bigint,
} from 'drizzle-orm/pg-core';
import { organizations, users, courses } from './schema';

// ---------------------------------------------------------------------------
// Academic structure and attendance
// ---------------------------------------------------------------------------

export const academicYears = pgTable('academic_years', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  startsOn: timestamp('starts_on').notNull(),
  endsOn: timestamp('ends_on').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('academic_years_org_idx').on(table.organizationId),
  orgNameIdx: unique('academic_years_org_name_unique').on(table.organizationId, table.name),
}));

export const terms = pgTable('terms', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  academicYearId: uuid('academic_year_id').references(() => academicYears.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  startsOn: timestamp('starts_on').notNull(),
  endsOn: timestamp('ends_on').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  yearIdx: index('terms_year_idx').on(table.academicYearId),
  yearNameIdx: unique('terms_year_name_unique').on(table.academicYearId, table.name),
}));

export const schoolClasses = pgTable('school_classes', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  academicYearId: uuid('academic_year_id').references(() => academicYears.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  gradeLevel: varchar('grade_level', { length: 20 }),
  homeroomTeacherId: uuid('homeroom_teacher_id').references(() => users.id, { onDelete: 'set null' }),
  capacity: integer('capacity').default(40).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('school_classes_org_idx').on(table.organizationId),
  yearIdx: index('school_classes_year_idx').on(table.academicYearId),
  orgYearNameIdx: unique('school_classes_org_year_name_unique').on(table.organizationId, table.academicYearId, table.name),
}));

export const sections = pgTable('sections', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  classId: uuid('class_id').references(() => schoolClasses.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  capacity: integer('capacity').default(40).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  classIdx: index('sections_class_idx').on(table.classId),
  classNamelIdx: unique('sections_class_name_unique').on(table.classId, table.name),
}));

export const subjects = pgTable('subjects', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  code: varchar('code', { length: 30 }).notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('subjects_org_idx').on(table.organizationId),
  orgCodeIdx: unique('subjects_org_code_unique').on(table.organizationId, table.code),
}));

export const classSubjects = pgTable('class_subjects', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  classId: uuid('class_id').references(() => schoolClasses.id, { onDelete: 'cascade' }).notNull(),
  subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'cascade' }).notNull(),
  teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  classSubjectIdx: unique('class_subjects_class_subject_unique').on(table.classId, table.subjectId),
  teacherIdx: index('class_subjects_teacher_idx').on(table.teacherId),
}));

export const classEnrollments = pgTable('class_enrollments', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  classId: uuid('class_id').references(() => schoolClasses.id, { onDelete: 'cascade' }).notNull(),
  sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'set null' }),
  studentId: uuid('student_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  status: varchar('status', { length: 20 }).default('active').notNull(), // active | transferred | graduated | withdrawn
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  leftAt: timestamp('left_at'),
}, (table) => ({
  studentIdx: index('class_enrollments_student_idx').on(table.studentId),
  classIdx: index('class_enrollments_class_idx').on(table.classId),
  classStudentIdx: unique('class_enrollments_class_student_unique').on(table.classId, table.studentId),
}));

export const studentProfiles = pgTable('student_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  dateOfBirth: timestamp('date_of_birth'),
  gender: varchar('gender', { length: 30 }),
  address: text('address'),
  learningGoals: jsonb('learning_goals').default([]).notNull(),
  interests: jsonb('interests').default([]).notNull(),
  skills: jsonb('skills').default([]).notNull(),
  privacy: jsonb('privacy').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: unique('student_profiles_user_unique').on(table.userId),
  orgIdx: index('student_profiles_org_idx').on(table.organizationId),
}));

export const attendanceRecords = pgTable('attendance_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  classId: uuid('class_id').references(() => schoolClasses.id, { onDelete: 'cascade' }).notNull(),
  sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'set null' }),
  date: timestamp('date').notNull(),
  status: varchar('status', { length: 20 }).notNull(), // present | absent | late | excused
  markedBy: uuid('marked_by').references(() => users.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  studentDateIdx: unique('attendance_records_student_class_date_unique').on(table.studentId, table.classId, table.date),
  classDateIdx: index('attendance_records_class_date_idx').on(table.classId, table.date),
  orgIdx: index('attendance_records_org_idx').on(table.organizationId),
}));

export const achievements = pgTable('achievements', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  key: varchar('key', { length: 80 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  awardedBy: uuid('awarded_by').references(() => users.id, { onDelete: 'set null' }),
  awardedAt: timestamp('awarded_at').defaultNow().notNull(),
  metadata: jsonb('metadata'),
}, (table) => ({
  userIdx: index('achievements_user_idx').on(table.userId),
  keyIdx: index('achievements_key_idx').on(table.key),
}));

export const certificates = pgTable('certificates', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 200 }).notNull(),
  serial: varchar('serial', { length: 80 }).notNull(),
  issuedBy: uuid('issued_by').references(() => users.id, { onDelete: 'set null' }),
  issuedAt: timestamp('issued_at').defaultNow().notNull(),
  revokedAt: timestamp('revoked_at'),
  metadata: jsonb('metadata'),
}, (table) => ({
  serialIdx: unique('certificates_serial_unique').on(table.serial),
  userIdx: index('certificates_user_idx').on(table.userId),
}));

export const learningStreaks = pgTable('learning_streaks', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  currentDays: integer('current_days').default(0).notNull(),
  longestDays: integer('longest_days').default(0).notNull(),
  lastActiveOn: timestamp('last_active_on'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: unique('learning_streaks_user_unique').on(table.userId),
}));

export const activityEvents = pgTable('activity_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  type: varchar('type', { length: 60 }).notNull(),
  entityType: varchar('entity_type', { length: 60 }),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: index('activity_events_user_idx').on(table.userId, table.createdAt),
  orgIdx: index('activity_events_org_idx').on(table.organizationId, table.createdAt),
}));

// ---------------------------------------------------------------------------
// Calendar (unified event model)
// ---------------------------------------------------------------------------

export const calendarEvents = pgTable('calendar_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  // class | assignment | exam | tutoring | extracurricular | holiday | meeting | personal
  type: varchar('type', { length: 30 }).notNull(),
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at'),
  allDay: boolean('all_day').default(false).notNull(),
  location: varchar('location', { length: 300 }),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
  classId: uuid('class_id').references(() => schoolClasses.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  // private | organization | class | public
  visibility: varchar('visibility', { length: 20 }).default('organization').notNull(),
  recurrenceRule: varchar('recurrence_rule', { length: 300 }),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgStartIdx: index('calendar_events_org_start_idx').on(table.organizationId, table.startsAt),
  courseIdx: index('calendar_events_course_idx').on(table.courseId),
  classIdx: index('calendar_events_class_idx').on(table.classId),
  typeIdx: index('calendar_events_type_idx').on(table.type),
}));

export const calendarEventAttendees = pgTable('calendar_event_attendees', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => calendarEvents.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  status: varchar('status', { length: 20 }).default('invited').notNull(), // invited | accepted | declined
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  eventUserIdx: unique('calendar_event_attendees_event_user_unique').on(table.eventId, table.userId),
  userIdx: index('calendar_event_attendees_user_idx').on(table.userId),
}));

export const calendarReminders = pgTable('calendar_reminders', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => calendarEvents.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  minutesBefore: integer('minutes_before').default(30).notNull(),
  channel: varchar('channel', { length: 20 }).default('in_app').notNull(),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  eventUserIdx: unique('calendar_reminders_event_user_unique').on(table.eventId, table.userId),
}));

// ---------------------------------------------------------------------------
// Tutoring and mentoring
// ---------------------------------------------------------------------------

export const tutorProfiles = pgTable('tutor_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  bio: text('bio'),
  subjects: jsonb('subjects').default([]).notNull(),
  languages: jsonb('languages').default([]).notNull(),
  hourlyRateCents: integer('hourly_rate_cents').default(0).notNull(),
  isMentor: boolean('is_mentor').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  ratingAverage: real('rating_average').default(0).notNull(),
  ratingCount: integer('rating_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: unique('tutor_profiles_user_unique').on(table.userId),
  orgIdx: index('tutor_profiles_org_idx').on(table.organizationId, table.isActive),
}));

export const tutorAvailability = pgTable('tutor_availability', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  tutorId: uuid('tutor_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at').notNull(),
  isBooked: boolean('is_booked').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  tutorStartIdx: index('tutor_availability_tutor_start_idx').on(table.tutorId, table.startsAt),
  orgIdx: index('tutor_availability_org_idx').on(table.organizationId),
}));

export const tutoringSessions = pgTable('tutoring_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  tutorId: uuid('tutor_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  studentId: uuid('student_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  availabilityId: uuid('availability_id').references(() => tutorAvailability.id, { onDelete: 'set null' }),
  subject: varchar('subject', { length: 120 }).notNull(),
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at').notNull(),
  mode: varchar('mode', { length: 20 }).default('online').notNull(), // online | in_person
  status: varchar('status', { length: 20 }).default('scheduled').notNull(), // scheduled | completed | cancelled | no_show
  meetingUrl: text('meeting_url'),
  notes: text('notes'),
  tutorFeedback: text('tutor_feedback'),
  studentFeedback: text('student_feedback'),
  rating: integer('rating'),
  cancelledAt: timestamp('cancelled_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  tutorStartIdx: index('tutoring_sessions_tutor_start_idx').on(table.tutorId, table.startsAt),
  studentStartIdx: index('tutoring_sessions_student_start_idx').on(table.studentId, table.startsAt),
  orgIdx: index('tutoring_sessions_org_idx').on(table.organizationId),
}));

// ---------------------------------------------------------------------------
// Extracurricular events, capacity and waitlist
// ---------------------------------------------------------------------------

export const extracurricularEvents = pgTable('extracurricular_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 40 }).notNull(), // club | workshop | career | sport | arts
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at'),
  location: varchar('location', { length: 300 }),
  capacity: integer('capacity').default(30).notNull(),
  organizerId: uuid('organizer_id').references(() => users.id, { onDelete: 'set null' }),
  isPublished: boolean('is_published').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgStartIdx: index('extracurricular_events_org_start_idx').on(table.organizationId, table.startsAt),
  categoryIdx: index('extracurricular_events_category_idx').on(table.category),
}));

export const extracurricularBookings = pgTable('extracurricular_bookings', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  eventId: uuid('event_id').references(() => extracurricularEvents.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  // booked | waitlisted | cancelled | attended
  status: varchar('status', { length: 20 }).default('booked').notNull(),
  position: integer('position'),
  bookedAt: timestamp('booked_at').defaultNow().notNull(),
  cancelledAt: timestamp('cancelled_at'),
  attendedAt: timestamp('attended_at'),
}, (table) => ({
  eventUserIdx: unique('extracurricular_bookings_event_user_unique').on(table.eventId, table.userId),
  eventStatusIdx: index('extracurricular_bookings_event_status_idx').on(table.eventId, table.status),
  userIdx: index('extracurricular_bookings_user_idx').on(table.userId),
}));

// ---------------------------------------------------------------------------
// Live learning
// ---------------------------------------------------------------------------

export const liveClasses = pgTable('live_classes', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  provider: varchar('provider', { length: 40 }).default('internal').notNull(),
  meetingUrl: text('meeting_url'),
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at').notNull(),
  status: varchar('status', { length: 20 }).default('scheduled').notNull(), // scheduled | live | ended | cancelled
  waitingRoom: boolean('waiting_room').default(true).notNull(),
  recordingUrl: text('recording_url'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  courseStartIdx: index('live_classes_course_start_idx').on(table.courseId, table.startsAt),
  orgIdx: index('live_classes_org_idx').on(table.organizationId),
}));

export const liveClassAttendance = pgTable('live_class_attendance', {
  id: uuid('id').defaultRandom().primaryKey(),
  liveClassId: uuid('live_class_id').references(() => liveClasses.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  leftAt: timestamp('left_at'),
}, (table) => ({
  classUserIdx: unique('live_class_attendance_class_user_unique').on(table.liveClassId, table.userId),
}));

export const liveClassEvents = pgTable('live_class_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  liveClassId: uuid('live_class_id').references(() => liveClasses.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  // chat | question | poll | poll_response | hand_raise
  type: varchar('type', { length: 30 }).notNull(),
  body: text('body'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  classCreatedIdx: index('live_class_events_class_created_idx').on(table.liveClassId, table.createdAt),
}));

// ---------------------------------------------------------------------------
// Communication: conversations, forums, moderation
// ---------------------------------------------------------------------------

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  type: varchar('type', { length: 20 }).default('direct').notNull(), // direct | group | support
  title: varchar('title', { length: 200 }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  lastMessageAt: timestamp('last_message_at'),
  isLocked: boolean('is_locked').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgLastIdx: index('conversations_org_last_idx').on(table.organizationId, table.lastMessageAt),
}));

export const conversationParticipants = pgTable('conversation_participants', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: varchar('role', { length: 20 }).default('member').notNull(),
  lastReadAt: timestamp('last_read_at'),
  isMuted: boolean('is_muted').default(false).notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
}, (table) => ({
  conversationUserIdx: unique('conversation_participants_conversation_user_unique').on(table.conversationId, table.userId),
  userIdx: index('conversation_participants_user_idx').on(table.userId),
}));

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  senderId: uuid('sender_id').references(() => users.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  attachmentIds: jsonb('attachment_ids').default([]).notNull(),
  replyToId: uuid('reply_to_id'),
  // visible | hidden | removed
  moderationStatus: varchar('moderation_status', { length: 20 }).default('visible').notNull(),
  editedAt: timestamp('edited_at'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  conversationCreatedIdx: index('messages_conversation_created_idx').on(table.conversationId, table.createdAt),
  senderIdx: index('messages_sender_idx').on(table.senderId),
}));

export const messageReports = pgTable('message_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }).notNull(),
  reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
  reason: varchar('reason', { length: 40 }).notNull(),
  details: text('details'),
  status: varchar('status', { length: 20 }).default('open').notNull(), // open | actioned | dismissed
  reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  statusIdx: index('message_reports_status_idx').on(table.status),
  messageIdx: index('message_reports_message_idx').on(table.messageId),
}));

export const blockedUsers = pgTable('blocked_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  blockedUserId: uuid('blocked_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  pairIdx: unique('blocked_users_pair_unique').on(table.userId, table.blockedUserId),
}));

export const forums = pgTable('forums', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  isLocked: boolean('is_locked').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('forums_org_idx').on(table.organizationId),
  courseIdx: index('forums_course_idx').on(table.courseId),
}));

export const forumTopics = pgTable('forum_topics', {
  id: uuid('id').defaultRandom().primaryKey(),
  forumId: uuid('forum_id').references(() => forums.id, { onDelete: 'cascade' }).notNull(),
  authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body').notNull(),
  isPinned: boolean('is_pinned').default(false).notNull(),
  isLocked: boolean('is_locked').default(false).notNull(),
  status: varchar('status', { length: 20 }).default('open').notNull(), // open | resolved | removed
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  forumCreatedIdx: index('forum_topics_forum_created_idx').on(table.forumId, table.createdAt),
}));

export const forumPosts = pgTable('forum_posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  topicId: uuid('topic_id').references(() => forumTopics.id, { onDelete: 'cascade' }).notNull(),
  authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  parentPostId: uuid('parent_post_id'),
  isAcceptedAnswer: boolean('is_accepted_answer').default(false).notNull(),
  moderationStatus: varchar('moderation_status', { length: 20 }).default('visible').notNull(),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  topicCreatedIdx: index('forum_posts_topic_created_idx').on(table.topicId, table.createdAt),
}));

// ---------------------------------------------------------------------------
// Support and counselling
// ---------------------------------------------------------------------------

export const supportResources = pgTable('support_resources', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  slug: varchar('slug', { length: 120 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  category: varchar('category', { length: 60 }).notNull(),
  body: text('body').notNull(),
  locale: varchar('locale', { length: 10 }).default('en').notNull(),
  isPublished: boolean('is_published').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  slugLocaleIdx: unique('support_resources_slug_locale_unique').on(table.slug, table.locale),
  categoryIdx: index('support_resources_category_idx').on(table.category),
}));

export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  subject: varchar('subject', { length: 200 }).notNull(),
  description: text('description').notNull(),
  category: varchar('category', { length: 40 }).default('general').notNull(),
  priority: varchar('priority', { length: 20 }).default('normal').notNull(), // low | normal | high | urgent
  status: varchar('status', { length: 20 }).default('open').notNull(), // open | pending | resolved | closed
  assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  slaDueAt: timestamp('sla_due_at'),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgStatusIdx: index('support_tickets_org_status_idx').on(table.organizationId, table.status),
  userIdx: index('support_tickets_user_idx').on(table.userId),
}));

export const supportTicketMessages = pgTable('support_ticket_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  ticketId: uuid('ticket_id').references(() => supportTickets.id, { onDelete: 'cascade' }).notNull(),
  authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  isInternal: boolean('is_internal').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  ticketCreatedIdx: index('support_ticket_messages_ticket_created_idx').on(table.ticketId, table.createdAt),
}));

export const counselorProfiles = pgTable('counselor_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  specialization: varchar('specialization', { length: 120 }),
  bio: text('bio'),
  isAcceptingAppointments: boolean('is_accepting_appointments').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: unique('counselor_profiles_user_unique').on(table.userId),
}));

export const counselingAppointments = pgTable('counseling_appointments', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  counselorId: uuid('counselor_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at').notNull(),
  status: varchar('status', { length: 20 }).default('requested').notNull(), // requested | confirmed | completed | cancelled
  // Private by design: never copied into analytics or activity feeds.
  notes: text('notes'),
  consentRecordedAt: timestamp('consent_recorded_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  studentStartIdx: index('counseling_appointments_student_start_idx').on(table.studentId, table.startsAt),
  counselorStartIdx: index('counseling_appointments_counselor_start_idx').on(table.counselorId, table.startsAt),
}));

// ---------------------------------------------------------------------------
// AI platform
// ---------------------------------------------------------------------------

export const aiPromptTemplates = pgTable('ai_prompt_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  key: varchar('key', { length: 80 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  version: integer('version').default(1).notNull(),
  systemPrompt: text('system_prompt').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  keyVersionIdx: unique('ai_prompt_templates_key_version_unique').on(table.key, table.version),
}));

export const aiConversations = pgTable('ai_conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 200 }),
  context: jsonb('context'),
  isArchived: boolean('is_archived').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: index('ai_conversations_user_idx').on(table.userId, table.updatedAt),
}));

export const aiMessages = pgTable('ai_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').references(() => aiConversations.id, { onDelete: 'cascade' }).notNull(),
  role: varchar('role', { length: 20 }).notNull(), // user | assistant | system
  content: text('content').notNull(),
  model: varchar('model', { length: 80 }),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  safetyFlags: jsonb('safety_flags'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  conversationCreatedIdx: index('ai_messages_conversation_created_idx').on(table.conversationId, table.createdAt),
}));

export const aiAuditEvents = pgTable('ai_audit_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 60 }).notNull(),
  model: varchar('model', { length: 80 }),
  // Hashes only: prompts and answers may contain personal data.
  inputHash: varchar('input_hash', { length: 64 }),
  outputHash: varchar('output_hash', { length: 64 }),
  blocked: boolean('blocked').default(false).notNull(),
  reason: varchar('reason', { length: 120 }),
  latencyMs: integer('latency_ms'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgCreatedIdx: index('ai_audit_events_org_created_idx').on(table.organizationId, table.createdAt),
}));

export const aiUsageDaily = pgTable('ai_usage_daily', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  day: timestamp('day').notNull(),
  model: varchar('model', { length: 80 }).notNull(),
  requests: integer('requests').default(0).notNull(),
  tokensIn: integer('tokens_in').default(0).notNull(),
  tokensOut: integer('tokens_out').default(0).notNull(),
  costMicros: integer('cost_micros').default(0).notNull(),
}, (table) => ({
  orgDayModelIdx: unique('ai_usage_daily_org_day_model_unique').on(table.organizationId, table.day, table.model),
}));

export const aiFeedback = pgTable('ai_feedback', {
  id: uuid('id').defaultRandom().primaryKey(),
  messageId: uuid('message_id').references(() => aiMessages.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  rating: integer('rating').notNull(), // -1 | 1
  comment: text('comment'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  messageIdx: index('ai_feedback_message_idx').on(table.messageId),
}));

// ---------------------------------------------------------------------------
// Privacy and consent
// ---------------------------------------------------------------------------

export const consentRecords = pgTable('consent_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  // terms | privacy | media | counselling | data_sharing | ai_processing
  type: varchar('type', { length: 40 }).notNull(),
  version: varchar('version', { length: 30 }).notNull(),
  granted: boolean('granted').notNull(),
  grantedAt: timestamp('granted_at'),
  revokedAt: timestamp('revoked_at'),
  ipHash: varchar('ip_hash', { length: 64 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userTypeIdx: index('consent_records_user_type_idx').on(table.userId, table.type),
  orgIdx: index('consent_records_org_idx').on(table.organizationId),
}));

export const dataSubjectRequests = pgTable('data_subject_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  // export | deletion | access | correction
  type: varchar('type', { length: 30 }).notNull(),
  status: varchar('status', { length: 20 }).default('received').notNull(), // received | in_progress | completed | rejected
  requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
  requestedAt: timestamp('requested_at').defaultNow().notNull(),
  dueAt: timestamp('due_at'),
  completedAt: timestamp('completed_at'),
  notes: text('notes'),
}, (table) => ({
  orgStatusIdx: index('data_subject_requests_org_status_idx').on(table.organizationId, table.status),
}));

// ---------------------------------------------------------------------------
// Administration, audit and feature flags
// ---------------------------------------------------------------------------

export const featureFlags = pgTable('feature_flags', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: varchar('key', { length: 80 }).notNull(),
  description: text('description'),
  isEnabled: boolean('is_enabled').default(false).notNull(),
  rolloutPercentage: integer('rollout_percentage').default(0).notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  keyOrgIdx: unique('feature_flags_key_org_unique').on(table.key, table.organizationId),
  keyIdx: index('feature_flags_key_idx').on(table.key),
}));

export const systemSettings = pgTable('system_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  key: varchar('key', { length: 100 }).notNull(),
  value: jsonb('value').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  keyOrgIdx: unique('system_settings_key_org_unique').on(table.key, table.organizationId),
}));

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 80 }).notNull(),
  entityType: varchar('entity_type', { length: 60 }),
  entityId: uuid('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  ipHash: varchar('ip_hash', { length: 64 }),
  userAgent: varchar('user_agent', { length: 300 }),
  hash: varchar('hash', { length: 64 }),
  previousHash: varchar('previous_hash', { length: 64 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgCreatedIdx: index('audit_logs_org_created_idx').on(table.organizationId, table.createdAt),
  actorIdx: index('audit_logs_actor_idx').on(table.actorId),
  entityIdx: index('audit_logs_entity_idx').on(table.entityType, table.entityId),
}));

// ---------------------------------------------------------------------------
// Integrations and webhooks
// ---------------------------------------------------------------------------

export const integrationConfigs = pgTable('integration_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  provider: varchar('provider', { length: 60 }).notNull(),
  // video | sms | email | sis | sso | lti | scorm | payment | analytics
  type: varchar('type', { length: 30 }).notNull(),
  config: jsonb('config').default({}).notNull(),
  // Secrets are referenced by name, never stored in the database.
  secretRef: varchar('secret_ref', { length: 120 }),
  isActive: boolean('is_active').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgProviderIdx: unique('integration_configs_org_provider_unique').on(table.organizationId, table.provider),
}));

export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  url: text('url').notNull(),
  secretHash: varchar('secret_hash', { length: 64 }).notNull(),
  events: jsonb('events').default([]).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('webhook_endpoints_org_idx').on(table.organizationId),
}));

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id').defaultRandom().primaryKey(),
  endpointId: uuid('endpoint_id').references(() => webhookEndpoints.id, { onDelete: 'cascade' }).notNull(),
  event: varchar('event', { length: 80 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // pending | delivered | failed
  attempts: integer('attempts').default(0).notNull(),
  responseCode: integer('response_code'),
  lastError: text('last_error'),
  nextAttemptAt: timestamp('next_attempt_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  statusNextIdx: index('webhook_deliveries_status_next_idx').on(table.status, table.nextAttemptAt),
}));

// ---------------------------------------------------------------------------
// Analytics event store (privacy-minimised)
// ---------------------------------------------------------------------------

export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 80 }).notNull(),
  entityType: varchar('entity_type', { length: 60 }),
  entityId: uuid('entity_id'),
  properties: jsonb('properties'),
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),
}, (table) => ({
  orgNameTimeIdx: index('analytics_events_org_name_time_idx').on(table.organizationId, table.name, table.occurredAt),
  userIdx: index('analytics_events_user_idx').on(table.userId, table.occurredAt),
}));

export const searchAnalyticsEvents = pgTable('search_analytics_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  query: varchar('query', { length: 300 }).notNull(),
  normalizedQuery: varchar('normalized_query', { length: 300 }).notNull(),
  locale: varchar('locale', { length: 10 }).default('en').notNull(),
  resultCount: integer('result_count').default(0).notNull(),
  clickedType: varchar('clicked_type', { length: 30 }),
  clickedId: uuid('clicked_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgCreatedIdx: index('search_analytics_events_org_created_idx').on(table.organizationId, table.createdAt),
}));

// ---------------------------------------------------------------------------
// Notification delivery (provider abstraction)
// ---------------------------------------------------------------------------

export const notificationTemplates = pgTable('notification_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: varchar('key', { length: 80 }).notNull(),
  locale: varchar('locale', { length: 10 }).default('en').notNull(),
  channel: varchar('channel', { length: 20 }).default('in_app').notNull(),
  subject: varchar('subject', { length: 200 }),
  body: text('body').notNull(),
  version: integer('version').default(1).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  keyLocaleChannelIdx: unique('notification_templates_key_locale_channel_unique').on(table.key, table.locale, table.channel),
}));

export const notificationDeliveries = pgTable('notification_deliveries', {
  id: uuid('id').defaultRandom().primaryKey(),
  notificationId: uuid('notification_id').notNull(),
  channel: varchar('channel', { length: 20 }).notNull(), // in_app | email | sms | push
  status: varchar('status', { length: 20 }).default('pending').notNull(), // pending | sent | failed | suppressed
  attempts: integer('attempts').default(0).notNull(),
  providerId: varchar('provider_id', { length: 120 }),
  lastError: text('last_error'),
  nextAttemptAt: timestamp('next_attempt_at'),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  notificationIdx: index('notification_deliveries_notification_idx').on(table.notificationId),
  statusNextIdx: index('notification_deliveries_status_next_idx').on(table.status, table.nextAttemptAt),
}));

// ---------------------------------------------------------------------------
// Gateway rate limiting (shared store for multi-replica deployments)
// ---------------------------------------------------------------------------

/**
 * One row per client+scope. The gateway always increments the current window
 * atomically; a new window reuses the row instead of inserting another one.
 * `expires_at` bounds the table so abandoned keys can be pruned.
 */
export const rateLimitWindows = pgTable('rate_limit_windows', {
  key: varchar('key', { length: 200 }).primaryKey(),
  windowStart: bigint('window_start', { mode: 'number' }).notNull(),
  count: integer('count').default(0).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  expiresIdx: index('rate_limit_windows_expires_idx').on(table.expiresAt),
}));
