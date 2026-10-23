import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, sql } from 'drizzle-orm';
import {
  calendarEventAttendees,
  calendarEvents,
  calendarReminders,
  classEnrollments,
  courses,
  extracurricularBookings,
  extracurricularEvents,
  liveClassAttendance,
  liveClassEvents,
  liveClasses,
  tutorAvailability,
  tutorProfiles,
  tutoringSessions,
  users,
} from '@edunet/database';
import { decideEventBooking, evaluateTutoringBooking, promotionCandidates, sortWaitlist } from './logic';

let client: postgres.Sql | null = null;
let db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!db) {
    const connectionString =
      process.env.DATABASE_URL ||
      `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
    client = postgres(connectionString);
    db = drizzle(client);
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (client) {
    const active = client;
    client = null;
    db = null;
    await active.end();
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export async function listCalendarEvents(
  organizationId: string,
  from: Date,
  to: Date,
  options: { userId?: string; classIds?: string[]; includePrivateOf?: string; includeDeleted?: boolean } = {},
) {
  const db = getDb();
  const conditions = [
    eq(calendarEvents.organizationId, organizationId),
    lte(calendarEvents.startsAt, to),
    sql`coalesce(${calendarEvents.endsAt}, ${calendarEvents.startsAt}) >= ${from}`,
  ];
  if (!options.includeDeleted) conditions.push(isNull(calendarEvents.deletedAt));

  const rows = await db
    .select()
    .from(calendarEvents)
    .where(and(...conditions))
    .orderBy(asc(calendarEvents.startsAt))
    .limit(500);

  return rows.filter((event) => {
    if (event.visibility === 'private') return !!options.includePrivateOf && event.createdBy === options.includePrivateOf;
    if (event.visibility === 'class') return !!event.classId && (options.classIds ?? []).includes(event.classId);
    return true;
  });
}

export async function findCalendarEvent(id: string, organizationId: string) {
  const db = getDb();
  const [event] = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.organizationId, organizationId), isNull(calendarEvents.deletedAt)))
    .limit(1);
  return event ?? null;
}

export async function createCalendarEvent(data: typeof calendarEvents.$inferInsert) {
  const db = getDb();
  const [event] = await db.insert(calendarEvents).values(data).returning();
  return event!;
}

export async function updateCalendarEvent(
  id: string,
  organizationId: string,
  data: Partial<typeof calendarEvents.$inferInsert>,
) {
  const db = getDb();
  const [event] = await db
    .update(calendarEvents)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.organizationId, organizationId)))
    .returning();
  return event ?? null;
}

export async function softDeleteCalendarEvent(id: string, organizationId: string) {
  return updateCalendarEvent(id, organizationId, { deletedAt: new Date() });
}

export async function listClassIdsForUser(userId: string, organizationId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ classId: classEnrollments.classId })
    .from(classEnrollments)
    .where(and(eq(classEnrollments.studentId, userId), eq(classEnrollments.organizationId, organizationId)));
  return rows.map((row) => row.classId);
}

export async function setEventAttendance(eventId: string, userId: string, status: string) {
  const db = getDb();
  const [row] = await db
    .insert(calendarEventAttendees)
    .values({ eventId, userId, status })
    .onConflictDoUpdate({
      target: [calendarEventAttendees.eventId, calendarEventAttendees.userId],
      set: { status },
    })
    .returning();
  return row!;
}

export async function listEventAttendees(eventId: string) {
  const db = getDb();
  return db
    .select({
      id: calendarEventAttendees.id,
      userId: calendarEventAttendees.userId,
      status: calendarEventAttendees.status,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(calendarEventAttendees)
    .innerJoin(users, eq(users.id, calendarEventAttendees.userId))
    .where(eq(calendarEventAttendees.eventId, eventId));
}

export async function setEventReminder(
  eventId: string,
  userId: string,
  minutesBefore: number,
  channel = 'in_app',
) {
  const db = getDb();
  const [row] = await db
    .insert(calendarReminders)
    .values({ eventId, userId, minutesBefore, channel })
    .onConflictDoUpdate({
      target: [calendarReminders.eventId, calendarReminders.userId],
      set: { minutesBefore, channel, sentAt: null },
    })
    .returning();
  return row!;
}

// ---------------------------------------------------------------------------
// Tutoring
// ---------------------------------------------------------------------------

export async function listTutorProfiles(
  organizationId: string,
  options: { subject?: string; mentorOnly?: boolean; limit?: number } = {},
) {
  const db = getDb();
  const conditions = [eq(tutorProfiles.organizationId, organizationId), eq(tutorProfiles.isActive, true)];
  if (options.mentorOnly) conditions.push(eq(tutorProfiles.isMentor, true));
  if (options.subject) {
    conditions.push(sql`${tutorProfiles.subjects} @> ${JSON.stringify([options.subject])}::jsonb`);
  }
  return db
    .select({
      id: tutorProfiles.id,
      userId: tutorProfiles.userId,
      bio: tutorProfiles.bio,
      subjects: tutorProfiles.subjects,
      languages: tutorProfiles.languages,
      hourlyRateCents: tutorProfiles.hourlyRateCents,
      isMentor: tutorProfiles.isMentor,
      ratingAverage: tutorProfiles.ratingAverage,
      ratingCount: tutorProfiles.ratingCount,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarUrl: users.avatarUrl,
    })
    .from(tutorProfiles)
    .innerJoin(users, eq(users.id, tutorProfiles.userId))
    .where(and(...conditions))
    .orderBy(desc(tutorProfiles.ratingAverage))
    .limit(options.limit ?? 50);
}

export async function upsertTutorProfile(
  organizationId: string,
  userId: string,
  data: Partial<typeof tutorProfiles.$inferInsert>,
) {
  const db = getDb();
  const [row] = await db
    .insert(tutorProfiles)
    .values({ organizationId, userId, ...data })
    .onConflictDoUpdate({
      target: [tutorProfiles.userId],
      set: { ...data, updatedAt: new Date() },
    })
    .returning();
  return row!;
}

export async function listTutorAvailability(
  organizationId: string,
  options: { tutorId?: string; from?: Date; to?: Date } = {},
) {
  const db = getDb();
  const conditions = [
    eq(tutorAvailability.organizationId, organizationId),
    eq(tutorAvailability.isBooked, false),
    gte(tutorAvailability.startsAt, options.from ?? new Date()),
  ];
  if (options.tutorId) conditions.push(eq(tutorAvailability.tutorId, options.tutorId));
  if (options.to) conditions.push(lte(tutorAvailability.startsAt, options.to));
  return db
    .select()
    .from(tutorAvailability)
    .where(and(...conditions))
    .orderBy(asc(tutorAvailability.startsAt))
    .limit(200);
}

export async function createTutorAvailability(data: typeof tutorAvailability.$inferInsert) {
  const db = getDb();
  if (new Date(data.endsAt).getTime() <= new Date(data.startsAt).getTime()) {
    throw new ConflictError('Availability must end after it starts');
  }
  const [row] = await db.insert(tutorAvailability).values(data).returning();
  return row!;
}

export async function deleteTutorAvailability(id: string, organizationId: string, tutorId: string) {
  const db = getDb();
  const [row] = await db
    .delete(tutorAvailability)
    .where(
      and(
        eq(tutorAvailability.id, id),
        eq(tutorAvailability.organizationId, organizationId),
        eq(tutorAvailability.tutorId, tutorId),
        eq(tutorAvailability.isBooked, false),
      ),
    )
    .returning();
  return row ?? null;
}

export async function bookTutoringSession(input: {
  organizationId: string;
  tutorId: string;
  studentId: string;
  availabilityId: string;
  subject: string;
  mode?: string;
}) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [availability] = await tx
      .select()
      .from(tutorAvailability)
      .where(
        and(
          eq(tutorAvailability.id, input.availabilityId),
          eq(tutorAvailability.organizationId, input.organizationId),
        ),
      )
      .for('update')
      .limit(1);

    if (!availability) throw new NotFoundError('Availability not found');
    if (availability.tutorId !== input.tutorId) throw new ConflictError('Availability belongs to another tutor');

    const activeSessions = await tx
      .select()
      .from(tutoringSessions)
      .where(
        and(
          eq(tutoringSessions.organizationId, input.organizationId),
          eq(tutoringSessions.status, 'scheduled'),
          lt(tutoringSessions.startsAt, availability.endsAt),
          gt(tutoringSessions.endsAt, availability.startsAt),
        ),
      );

    const decision = evaluateTutoringBooking(
      {
        tutorId: input.tutorId,
        studentId: input.studentId,
        startsAt: availability.startsAt,
        endsAt: availability.endsAt,
      },
      activeSessions.map((session) => ({
        id: session.id,
        tutorId: session.tutorId,
        studentId: session.studentId,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        status: session.status as 'scheduled' | 'completed' | 'cancelled' | 'no_show',
      })),
      {
        startsAt: availability.startsAt,
        endsAt: availability.endsAt,
        isBooked: availability.isBooked,
      },
    );
    if (!decision.ok) throw new ConflictError(decision.code);

    await tx.update(tutorAvailability).set({ isBooked: true }).where(eq(tutorAvailability.id, availability.id));
    const [session] = await tx
      .insert(tutoringSessions)
      .values({
        organizationId: input.organizationId,
        tutorId: input.tutorId,
        studentId: input.studentId,
        availabilityId: availability.id,
        subject: input.subject,
        startsAt: availability.startsAt,
        endsAt: availability.endsAt,
        mode: input.mode ?? 'online',
      })
      .returning();
    return session!;
  });
}

export async function listTutoringSessions(
  organizationId: string,
  userId: string,
  options: { from?: Date; to?: Date; limit?: number } = {},
) {
  const db = getDb();
  const conditions = [
    eq(tutoringSessions.organizationId, organizationId),
    sql`(${tutoringSessions.tutorId} = ${userId} OR ${tutoringSessions.studentId} = ${userId})`,
  ];
  if (options.from) conditions.push(gte(tutoringSessions.startsAt, options.from));
  if (options.to) conditions.push(lte(tutoringSessions.startsAt, options.to));
  return db
    .select()
    .from(tutoringSessions)
    .where(and(...conditions))
    .orderBy(asc(tutoringSessions.startsAt))
    .limit(options.limit ?? 100);
}

export async function updateTutoringSession(
  id: string,
  organizationId: string,
  userId: string,
  data: Partial<typeof tutoringSessions.$inferInsert>,
) {
  const db = getDb();
  const [session] = await db
    .select()
    .from(tutoringSessions)
    .where(and(eq(tutoringSessions.id, id), eq(tutoringSessions.organizationId, organizationId)))
    .limit(1);
  if (!session) throw new NotFoundError('Session not found');
  if (session.tutorId !== userId && session.studentId !== userId) throw new ConflictError('Not a participant');

  const [updated] = await db
    .update(tutoringSessions)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(tutoringSessions.id, id), eq(tutoringSessions.organizationId, organizationId)))
    .returning();
  return updated!;
}

export async function cancelTutoringSession(id: string, organizationId: string, userId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(tutoringSessions)
      .where(and(eq(tutoringSessions.id, id), eq(tutoringSessions.organizationId, organizationId)))
      .for('update')
      .limit(1);
    if (!session) throw new NotFoundError('Session not found');
    if (session.tutorId !== userId && session.studentId !== userId) throw new ConflictError('Not a participant');
    if (session.status === 'cancelled') return session;

    const [updated] = await tx
      .update(tutoringSessions)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(tutoringSessions.id, id))
      .returning();

    if (session.availabilityId) {
      await tx
        .update(tutorAvailability)
        .set({ isBooked: false })
        .where(eq(tutorAvailability.id, session.availabilityId));
    }
    return updated!;
  });
}

// ---------------------------------------------------------------------------
// Extracurricular events
// ---------------------------------------------------------------------------

export async function listExtracurricularEvents(
  organizationId: string,
  options: { from?: Date; category?: string; includeUnpublished?: boolean; limit?: number } = {},
) {
  const db = getDb();
  const conditions = [eq(extracurricularEvents.organizationId, organizationId)];
  if (!options.includeUnpublished) conditions.push(eq(extracurricularEvents.isPublished, true));
  if (options.from) conditions.push(gte(extracurricularEvents.startsAt, options.from));
  if (options.category) conditions.push(eq(extracurricularEvents.category, options.category));
  return db
    .select()
    .from(extracurricularEvents)
    .where(and(...conditions))
    .orderBy(asc(extracurricularEvents.startsAt))
    .limit(options.limit ?? 100);
}

export async function createExtracurricularEvent(data: typeof extracurricularEvents.$inferInsert) {
  const db = getDb();
  const [row] = await db.insert(extracurricularEvents).values(data).returning();
  return row!;
}

export async function updateExtracurricularEvent(
  id: string,
  organizationId: string,
  data: Partial<typeof extracurricularEvents.$inferInsert>,
) {
  const db = getDb();
  const [row] = await db
    .update(extracurricularEvents)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(extracurricularEvents.id, id), eq(extracurricularEvents.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export async function bookExtracurricularEvent(
  eventId: string,
  organizationId: string,
  userId: string,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(extracurricularEvents)
      .where(
        and(
          eq(extracurricularEvents.id, eventId),
          eq(extracurricularEvents.organizationId, organizationId),
          eq(extracurricularEvents.isPublished, true),
        ),
      )
      .for('update')
      .limit(1);
    if (!event) throw new NotFoundError('Event not found');

    const existing = await tx
      .select()
      .from(extracurricularBookings)
      .where(and(eq(extracurricularBookings.eventId, eventId), eq(extracurricularBookings.userId, userId)))
      .limit(1);

    const bookedCount = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(extracurricularBookings)
      .where(and(eq(extracurricularBookings.eventId, eventId), inArray(extracurricularBookings.status, ['booked', 'attended'])));
    const waitlistCount = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(extracurricularBookings)
      .where(and(eq(extracurricularBookings.eventId, eventId), eq(extracurricularBookings.status, 'waitlisted')));

    const current = existing[0];
    const decision = decideEventBooking({
      capacity: event.capacity,
      bookedCount: bookedCount[0]?.count ?? 0,
      waitlistCount: waitlistCount[0]?.count ?? 0,
      existingStatus: (current?.status as 'booked' | 'waitlisted' | 'cancelled' | 'attended' | undefined) ?? null,
    });

    if (decision.status === 'unchanged') {
      return { booking: current!, decision, event };
    }

    const values = {
      organizationId,
      eventId,
      userId,
      status: decision.status,
      position: decision.position,
      bookedAt: new Date(),
      cancelledAt: null,
    };

    const [booking] = current
      ? await tx
          .update(extracurricularBookings)
          .set(values)
          .where(eq(extracurricularBookings.id, current.id))
          .returning()
      : await tx.insert(extracurricularBookings).values(values).returning();

    return { booking: booking!, decision, event };
  });
}

export async function cancelExtracurricularBooking(
  eventId: string,
  organizationId: string,
  userId: string,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(extracurricularBookings)
      .where(
        and(
          eq(extracurricularBookings.eventId, eventId),
          eq(extracurricularBookings.organizationId, organizationId),
          eq(extracurricularBookings.userId, userId),
        ),
      )
      .for('update')
      .limit(1);
    if (!booking) throw new NotFoundError('Booking not found');

    const wasActive = booking.status === 'booked' || booking.status === 'attended';
    const [cancelled] = await tx
      .update(extracurricularBookings)
      .set({ status: 'cancelled', cancelledAt: new Date(), position: null })
      .where(eq(extracurricularBookings.id, booking.id))
      .returning();

    const promoted: typeof extracurricularBookings.$inferSelect[] = [];
    if (wasActive) {
      const [event] = await tx
        .select()
        .from(extracurricularEvents)
        .where(eq(extracurricularEvents.id, eventId))
        .for('update')
        .limit(1);
      const bookedCount = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(extracurricularBookings)
        .where(and(eq(extracurricularBookings.eventId, eventId), inArray(extracurricularBookings.status, ['booked', 'attended'])));
      const waitlisted = await tx
        .select()
        .from(extracurricularBookings)
        .where(and(eq(extracurricularBookings.eventId, eventId), eq(extracurricularBookings.status, 'waitlisted')));
      const free = (event?.capacity ?? 0) - (bookedCount[0]?.count ?? 0);
      const candidates = promotionCandidates(
        waitlisted.map((entry) => ({
          id: entry.id,
          userId: entry.userId,
          position: entry.position ?? Number.MAX_SAFE_INTEGER,
          bookedAt: entry.bookedAt,
        })),
        free,
      );
      for (const candidate of candidates) {
        const [row] = await tx
          .update(extracurricularBookings)
          .set({ status: 'booked', position: null })
          .where(eq(extracurricularBookings.id, candidate.id))
          .returning();
        if (row) promoted.push(row);
      }
    }

    return { booking: cancelled!, promoted };
  });
}

export async function listExtracurricularBookings(
  eventId: string,
  organizationId: string,
  options: { userId?: string; statuses?: string[] } = {},
) {
  const db = getDb();
  const conditions = [
    eq(extracurricularBookings.eventId, eventId),
    eq(extracurricularBookings.organizationId, organizationId),
  ];
  if (options.userId) conditions.push(eq(extracurricularBookings.userId, options.userId));
  if (options.statuses?.length) conditions.push(inArray(extracurricularBookings.status, options.statuses));
  return db
    .select({
      id: extracurricularBookings.id,
      userId: extracurricularBookings.userId,
      status: extracurricularBookings.status,
      position: extracurricularBookings.position,
      bookedAt: extracurricularBookings.bookedAt,
      attendedAt: extracurricularBookings.attendedAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(extracurricularBookings)
    .innerJoin(users, eq(users.id, extracurricularBookings.userId))
    .where(and(...conditions))
    .orderBy(asc(extracurricularBookings.position), asc(extracurricularBookings.bookedAt));
}

export async function markEventAttendance(
  eventId: string,
  organizationId: string,
  userId: string,
  attended: boolean,
) {
  const db = getDb();
  const [row] = await db
    .update(extracurricularBookings)
    .set({ status: attended ? 'attended' : 'booked', attendedAt: attended ? new Date() : null })
    .where(
      and(
        eq(extracurricularBookings.eventId, eventId),
        eq(extracurricularBookings.organizationId, organizationId),
        eq(extracurricularBookings.userId, userId),
        ne(extracurricularBookings.status, 'cancelled'),
      ),
    )
    .returning();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Live classes
// ---------------------------------------------------------------------------

export async function listLiveClasses(
  organizationId: string,
  options: { courseId?: string; from?: Date; status?: string; limit?: number } = {},
) {
  const db = getDb();
  const conditions = [eq(liveClasses.organizationId, organizationId)];
  if (options.courseId) conditions.push(eq(liveClasses.courseId, options.courseId));
  if (options.from) conditions.push(gte(liveClasses.startsAt, options.from));
  if (options.status) conditions.push(eq(liveClasses.status, options.status));
  return db
    .select()
    .from(liveClasses)
    .where(and(...conditions))
    .orderBy(asc(liveClasses.startsAt))
    .limit(options.limit ?? 100);
}

export async function findLiveClass(id: string, organizationId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(liveClasses)
    .where(and(eq(liveClasses.id, id), eq(liveClasses.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function createLiveClass(data: typeof liveClasses.$inferInsert) {
  const db = getDb();
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, data.courseId), eq(courses.organizationId, data.organizationId)))
    .limit(1);
  if (!course) throw new NotFoundError('Course not found');
  const [row] = await db.insert(liveClasses).values(data).returning();
  return row!;
}

export async function updateLiveClass(
  id: string,
  organizationId: string,
  data: Partial<typeof liveClasses.$inferInsert>,
) {
  const db = getDb();
  const [row] = await db
    .update(liveClasses)
    .set(data)
    .where(and(eq(liveClasses.id, id), eq(liveClasses.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export async function joinLiveClass(liveClassId: string, organizationId: string, userId: string) {
  const db = getDb();
  const live = await findLiveClass(liveClassId, organizationId);
  if (!live) throw new NotFoundError('Live class not found');
  if (live.status === 'ended' || live.status === 'cancelled') throw new ConflictError('Class is not joinable');

  const [attendance] = await db
    .insert(liveClassAttendance)
    .values({ liveClassId, userId, joinedAt: new Date() })
    .onConflictDoUpdate({
      target: [liveClassAttendance.liveClassId, liveClassAttendance.userId],
      set: { joinedAt: new Date(), leftAt: null },
    })
    .returning();

  await db.insert(liveClassEvents).values({ liveClassId, userId, type: 'join' });
  return { live, attendance: attendance! };
}

export async function leaveLiveClass(liveClassId: string, organizationId: string, userId: string) {
  const db = getDb();
  const live = await findLiveClass(liveClassId, organizationId);
  if (!live) throw new NotFoundError('Live class not found');
  const [attendance] = await db
    .update(liveClassAttendance)
    .set({ leftAt: new Date() })
    .where(and(eq(liveClassAttendance.liveClassId, liveClassId), eq(liveClassAttendance.userId, userId)))
    .returning();
  if (attendance) await db.insert(liveClassEvents).values({ liveClassId, userId, type: 'leave' });
  return attendance ?? null;
}

export async function addLiveClassEvent(
  liveClassId: string,
  organizationId: string,
  userId: string,
  type: string,
  body?: string,
  metadata?: unknown,
) {
  const db = getDb();
  const live = await findLiveClass(liveClassId, organizationId);
  if (!live) throw new NotFoundError('Live class not found');
  const [row] = await db
    .insert(liveClassEvents)
    .values({ liveClassId, userId, type, body, metadata: metadata ?? null })
    .returning();
  return row!;
}

export async function listLiveClassEvents(liveClassId: string, organizationId: string, limit = 200) {
  const db = getDb();
  const live = await findLiveClass(liveClassId, organizationId);
  if (!live) throw new NotFoundError('Live class not found');
  return db
    .select()
    .from(liveClassEvents)
    .where(eq(liveClassEvents.liveClassId, liveClassId))
    .orderBy(asc(liveClassEvents.createdAt))
    .limit(limit);
}

export async function getLiveClassAnalytics(liveClassId: string, organizationId: string) {
  const db = getDb();
  const live = await findLiveClass(liveClassId, organizationId);
  if (!live) throw new NotFoundError('Live class not found');
  const attendance = await db
    .select()
    .from(liveClassAttendance)
    .where(eq(liveClassAttendance.liveClassId, liveClassId));
  const events = await db
    .select()
    .from(liveClassEvents)
    .where(eq(liveClassEvents.liveClassId, liveClassId));
  const now = Date.now();
  const totalMinutes = attendance.reduce((sum, row) => {
    const end = row.leftAt?.getTime() ?? now;
    return sum + Math.max(0, (end - row.joinedAt.getTime()) / 60000);
  }, 0);
  return {
    liveClass: live,
    joinedCount: attendance.length,
    currentlyPresent: attendance.filter((row) => !row.leftAt).length,
    averageMinutes: attendance.length ? Math.round((totalMinutes / attendance.length) * 10) / 10 : 0,
    chatMessages: events.filter((row) => row.type === 'chat').length,
    questions: events.filter((row) => row.type === 'question').length,
    handRaises: events.filter((row) => row.type === 'hand_raise').length,
  };
}

export async function getUpcomingForUser(organizationId: string, userId: string) {
  const now = new Date();
  const [sessions, events, live, classIds] = await Promise.all([
    listTutoringSessions(organizationId, userId, { from: now, limit: 10 }),
    listExtracurricularEvents(organizationId, { from: now, limit: 10 }),
    listLiveClasses(organizationId, { from: now, limit: 10 }),
    listClassIdsForUser(userId, organizationId),
  ]);
  return { sessions, events, liveClasses: live, classIds };
}

export { sortWaitlist };
