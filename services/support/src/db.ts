import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  counselingAppointments,
  counselorProfiles,
  supportResources,
  supportTicketMessages,
  supportTickets,
  users,
} from '@edunet/database';
import { canTransitionTicket, classifyTicket, escalatePriority, searchResources, slaDueAt, type TicketPriority, type TicketStatus } from './logic';

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

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends Error {
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

// ---------------------------------------------------------------------------
// Help centre
// ---------------------------------------------------------------------------

export async function listSupportResources(
  organizationId: string | null,
  options: { locale?: string; category?: string; query?: string; includeUnpublished?: boolean } = {},
) {
  const db = getDb();
  const conditions = [];
  if (organizationId) {
    conditions.push(or(eq(supportResources.organizationId, organizationId), isNull(supportResources.organizationId)));
  } else {
    conditions.push(isNull(supportResources.organizationId));
  }
  if (!options.includeUnpublished) conditions.push(eq(supportResources.isPublished, true));
  if (options.locale) conditions.push(eq(supportResources.locale, options.locale));
  if (options.category) conditions.push(eq(supportResources.category, options.category));

  const rows = await db
    .select()
    .from(supportResources)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(supportResources.title))
    .limit(300);

  if (options.query) {
    return searchResources(rows, options.query, options.locale);
  }
  return rows;
}

export async function getSupportResourceBySlug(
  slug: string,
  organizationId: string | null,
  locale = 'en',
) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(supportResources)
    .where(
      and(
        eq(supportResources.slug, slug),
        eq(supportResources.locale, locale),
        eq(supportResources.isPublished, true),
        organizationId
          ? or(eq(supportResources.organizationId, organizationId), isNull(supportResources.organizationId))
          : isNull(supportResources.organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertSupportResource(data: typeof supportResources.$inferInsert & { id?: string }) {
  const db = getDb();
  if (data.id) {
    const [row] = await db
      .update(supportResources)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(supportResources.id, data.id))
      .returning();
    return row ?? null;
  }
  const [row] = await db.insert(supportResources).values(data).returning();
  return row!;
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export async function createSupportTicket(input: {
  organizationId: string;
  userId: string;
  subject: string;
  description: string;
  category?: string;
  priority?: TicketPriority;
}) {
  const db = getDb();
  const classified = classifyTicket({ subject: input.subject, description: input.description });
  const priority = input.priority ?? classified.priority;
  const createdAt = new Date();
  return db.transaction(async (tx) => {
    const [ticket] = await tx
      .insert(supportTickets)
      .values({
        organizationId: input.organizationId,
        userId: input.userId,
        subject: input.subject,
        description: input.description,
        category: input.category ?? classified.category,
        priority,
        slaDueAt: slaDueAt(createdAt, priority),
        createdAt,
      })
      .returning();
    await tx.insert(supportTicketMessages).values({
      ticketId: ticket!.id,
      authorId: input.userId,
      body: input.description,
    });
    return { ticket: ticket!, crisis: classified.crisis };
  });
}

export async function listSupportTickets(
  organizationId: string,
  options: { userId?: string; status?: string; assignedTo?: string; limit?: number } = {},
) {
  const db = getDb();
  const conditions = [eq(supportTickets.organizationId, organizationId)];
  if (options.userId) conditions.push(eq(supportTickets.userId, options.userId));
  if (options.status) conditions.push(eq(supportTickets.status, options.status));
  if (options.assignedTo) conditions.push(eq(supportTickets.assignedTo, options.assignedTo));
  return db
    .select()
    .from(supportTickets)
    .where(and(...conditions))
    .orderBy(desc(supportTickets.createdAt))
    .limit(options.limit ?? 100);
}

async function findTicketForUser(organizationId: string, ticketId: string, userId: string, staff: boolean) {
  const db = getDb();
  const conditions = [
    eq(supportTickets.id, ticketId),
    eq(supportTickets.organizationId, organizationId),
  ];
  if (!staff) conditions.push(eq(supportTickets.userId, userId));
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(and(...conditions))
    .limit(1);
  if (!ticket) throw new NotFoundError('Ticket not found');
  return ticket;
}

export async function getSupportTicket(
  organizationId: string,
  ticketId: string,
  userId: string,
  staff: boolean,
) {
  const ticket = await findTicketForUser(organizationId, ticketId, userId, staff);
  const db = getDb();
  const messages = await db
    .select({
      id: supportTicketMessages.id,
      authorId: supportTicketMessages.authorId,
      body: supportTicketMessages.body,
      isInternal: supportTicketMessages.isInternal,
      createdAt: supportTicketMessages.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(supportTicketMessages)
    .leftJoin(users, eq(users.id, supportTicketMessages.authorId))
    .where(
      staff
        ? eq(supportTicketMessages.ticketId, ticketId)
        : and(eq(supportTicketMessages.ticketId, ticketId), eq(supportTicketMessages.isInternal, false)),
    )
    .orderBy(asc(supportTicketMessages.createdAt));
  return { ticket, messages };
}

export async function addTicketMessage(input: {
  organizationId: string;
  ticketId: string;
  userId: string;
  staff: boolean;
  body: string;
  isInternal?: boolean;
}) {
  const ticket = await findTicketForUser(input.organizationId, input.ticketId, input.userId, input.staff);
  if (ticket.status === 'closed') throw new ConflictError('Ticket is closed');
  const db = getDb();
  const [message] = await db
    .insert(supportTicketMessages)
    .values({
      ticketId: input.ticketId,
      authorId: input.userId,
      body: input.body,
      isInternal: input.staff ? !!input.isInternal : false,
    })
    .returning();
  await db
    .update(supportTickets)
    .set({ status: input.staff ? 'pending' : 'open', updatedAt: new Date() })
    .where(eq(supportTickets.id, input.ticketId));
  return message!;
}

export async function updateTicket(
  organizationId: string,
  ticketId: string,
  data: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assignedTo?: string | null;
    category?: string;
  },
  options: { staff: boolean; userId: string },
) {
  const db = getDb();
  const ticket = await findTicketForUser(organizationId, ticketId, options.userId, options.staff);
  if (data.status && !canTransitionTicket(ticket.status as TicketStatus, data.status)) {
    throw new ConflictError(`Cannot move ticket from ${ticket.status} to ${data.status}`);
  }
  if (!options.staff) {
    const allowed = data.status === 'closed' || data.status === 'open';
    if (!allowed) throw new ForbiddenError('Only support staff can update this ticket');
  }

  const now = new Date();
  const [updated] = await db
    .update(supportTickets)
    .set({
      ...data,
      updatedAt: now,
      ...(data.status === 'resolved' ? { resolvedAt: now } : {}),
      ...(data.status === 'open' && ticket.resolvedAt ? { resolvedAt: null } : {}),
    })
    .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.organizationId, organizationId)))
    .returning();
  return updated!;
}

export async function escalateTicket(
  organizationId: string,
  ticketId: string,
  options: { userId: string; staff: boolean; breached?: boolean },
) {
  const ticket = await findTicketForUser(organizationId, ticketId, options.userId, options.staff);
  const { priority, changed } = escalatePriority(ticket.priority as TicketPriority, {
    breached: options.breached,
    requesterEscalated: true,
  });
  if (!changed) return { ticket, changed };
  const db = getDb();
  const [updated] = await db
    .update(supportTickets)
    .set({
      priority,
      slaDueAt: slaDueAt(ticket.createdAt, priority),
      updatedAt: new Date(),
    })
    .where(eq(supportTickets.id, ticketId))
    .returning();
  return { ticket: updated!, changed };
}

// ---------------------------------------------------------------------------
// Counselling
// ---------------------------------------------------------------------------

export async function listCounselors(organizationId: string) {
  const db = getDb();
  return db
    .select({
      id: counselorProfiles.id,
      userId: counselorProfiles.userId,
      specialization: counselorProfiles.specialization,
      bio: counselorProfiles.bio,
      isAcceptingAppointments: counselorProfiles.isAcceptingAppointments,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(counselorProfiles)
    .innerJoin(users, eq(users.id, counselorProfiles.userId))
    .where(
      and(
        eq(counselorProfiles.organizationId, organizationId),
        eq(counselorProfiles.isAcceptingAppointments, true),
      ),
    );
}

export async function upsertCounselorProfile(
  organizationId: string,
  userId: string,
  data: { specialization?: string; bio?: string; isAcceptingAppointments?: boolean },
) {
  const db = getDb();
  const [row] = await db
    .insert(counselorProfiles)
    .values({ organizationId, userId, ...data })
    .onConflictDoUpdate({ target: [counselorProfiles.userId], set: data })
    .returning();
  return row!;
}

export async function requestCounselingAppointment(input: {
  organizationId: string;
  studentId: string;
  counselorId: string;
  startsAt: Date;
  endsAt: Date;
  consentRecorded: boolean;
}) {
  if (!input.consentRecorded) throw new ConflictError('Consent is required for counselling');
  if (input.endsAt.getTime() <= input.startsAt.getTime()) throw new ConflictError('Invalid appointment window');

  const db = getDb();
  return db.transaction(async (tx) => {
    const [counselor] = await tx
      .select()
      .from(counselorProfiles)
      .where(
        and(
          eq(counselorProfiles.userId, input.counselorId),
          eq(counselorProfiles.organizationId, input.organizationId),
          eq(counselorProfiles.isAcceptingAppointments, true),
        ),
      )
      .limit(1);
    if (!counselor) throw new NotFoundError('Counselor not found');

    const conflicts = await tx
      .select({ id: counselingAppointments.id })
      .from(counselingAppointments)
      .where(
        and(
          eq(counselingAppointments.counselorId, input.counselorId),
          inArray(counselingAppointments.status, ['requested', 'confirmed']),
          sql`${counselingAppointments.startsAt} < ${input.endsAt}`,
          sql`${counselingAppointments.endsAt} > ${input.startsAt}`,
        ),
      )
      .limit(1);
    if (conflicts.length) throw new ConflictError('Counselor is unavailable at that time');

    const [appointment] = await tx
      .insert(counselingAppointments)
      .values({
        organizationId: input.organizationId,
        studentId: input.studentId,
        counselorId: input.counselorId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        consentRecordedAt: new Date(),
      })
      .returning();
    return appointment!;
  });
}

export async function listCounselingAppointments(
  organizationId: string,
  userId: string,
  staff: boolean,
) {
  const db = getDb();
  return db
    .select()
    .from(counselingAppointments)
    .where(
      and(
        eq(counselingAppointments.organizationId, organizationId),
        staff
          ? or(
              eq(counselingAppointments.studentId, userId),
              eq(counselingAppointments.counselorId, userId),
            )
          : eq(counselingAppointments.studentId, userId),
      ),
    )
    .orderBy(asc(counselingAppointments.startsAt))
    .limit(100);
}

export async function updateCounselingAppointment(
  organizationId: string,
  appointmentId: string,
  userId: string,
  staff: boolean,
  data: { status?: 'confirmed' | 'completed' | 'cancelled'; notes?: string },
) {
  const db = getDb();
  const conditions = [
    eq(counselingAppointments.id, appointmentId),
    eq(counselingAppointments.organizationId, organizationId),
  ];
  if (!staff) conditions.push(eq(counselingAppointments.studentId, userId));
  const [appointment] = await db
    .select()
    .from(counselingAppointments)
    .where(and(...conditions))
    .limit(1);
  if (!appointment) throw new NotFoundError('Appointment not found');

  if (data.status && data.status !== 'cancelled' && !staff) {
    throw new ForbiddenError('Only staff can confirm or complete appointments');
  }
  if (data.notes && !staff) throw new ForbiddenError('Only counselors can write notes');

  const [updated] = await db
    .update(counselingAppointments)
    .set(data)
    .where(eq(counselingAppointments.id, appointmentId))
    .returning();
  return updated!;
}
