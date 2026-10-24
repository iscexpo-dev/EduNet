import { Request, Response } from 'express';
import { z } from 'zod';
import { isPrivilegedRole } from '@edunet/rbac';
import {
  ConflictError,
  NotFoundError,
  addLiveClassEvent,
  bookExtracurricularEvent,
  bookTutoringSession,
  cancelExtracurricularBooking,
  cancelTutoringSession,
  closeDb,
  createCalendarEvent,
  createExtracurricularEvent,
  createLiveClass,
  createTutorAvailability,
  deleteTutorAvailability,
  findCalendarEvent,
  findLiveClass,
  getLiveClassAnalytics,
  getUpcomingForUser,
  joinLiveClass,
  leaveLiveClass,
  listCalendarEvents,
  listClassIdsForUser,
  listEventAttendees,
  listExtracurricularBookings,
  listExtracurricularEvents,
  listLiveClassEvents,
  listLiveClasses,
  listTutorAvailability,
  listTutorProfiles,
  listTutoringSessions,
  markEventAttendance,
  setEventAttendance,
  setEventReminder,
  softDeleteCalendarEvent,
  updateCalendarEvent,
  updateExtracurricularEvent,
  updateLiveClass,
  updateTutoringSession,
  upsertTutorProfile,
} from './db';
import { buildIcs, canViewCalendarEvent } from './logic';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    organizationId?: string;
  };
}

function fail(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: 'Invalid request', details: error.flatten() });
  }
  if (error instanceof NotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof ConflictError) return res.status(409).json({ error: error.message });
  throw error;
}

function context(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId || !req.user) {
    res.status(403).json({ error: 'Organization context required' });
    return null;
  }
  return { organizationId, user: req.user };
}

const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const calendarEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  type: z.enum([
    'class',
    'assignment',
    'exam',
    'tutoring',
    'extracurricular',
    'holiday',
    'meeting',
    'personal',
  ]),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(300).optional(),
  courseId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  visibility: z.enum(['private', 'organization', 'class', 'public']).optional(),
  recurrenceRule: z.string().max(300).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const tutoringSessionSchema = z.object({
  tutorId: z.string().uuid(),
  availabilityId: z.string().uuid(),
  subject: z.string().min(1).max(120),
  mode: z.enum(['online', 'in_person']).optional(),
});

const eventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  category: z.enum(['club', 'workshop', 'career', 'sport', 'arts']),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  location: z.string().max(300).optional(),
  capacity: z.number().int().min(0).max(10000).optional(),
  isPublished: z.boolean().optional(),
});

const liveClassSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().min(1).max(200),
  provider: z.string().max(40).optional(),
  meetingUrl: z.string().url().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  waitingRoom: z.boolean().optional(),
});

export async function listCalendarHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const { from, to } = dateRangeSchema.parse(req.query);
    const start = from ?? new Date(Date.now() - 7 * 86400000);
    const end = to ?? new Date(Date.now() + 60 * 86400000);
    const classIds = await listClassIdsForUser(ctx.user.id, ctx.organizationId);
    const events = await listCalendarEvents(ctx.organizationId, start, end, {
      classIds,
      includePrivateOf: ctx.user.id,
    });
    return res.json({ events, from: start, to: end });
  } catch (error) {
    return fail(res, error);
  }
}

export async function createCalendarEventHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = calendarEventSchema.parse(req.body);
    if (input.endsAt && input.endsAt <= input.startsAt) {
      return res.status(400).json({ error: 'endsAt must be after startsAt' });
    }
    const event = await createCalendarEvent({
      ...input,
      organizationId: ctx.organizationId,
      createdBy: ctx.user.id,
      visibility: input.visibility ?? 'organization',
      metadata: input.metadata ?? null,
    });
    return res.status(201).json(event);
  } catch (error) {
    return fail(res, error);
  }
}

export async function getCalendarEventHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const event = await findCalendarEvent(req.params.id!, ctx.organizationId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const classIds = await listClassIdsForUser(ctx.user.id, ctx.organizationId);
    const allowed = canViewCalendarEvent(
      {
        id: ctx.user.id,
        organizationId: ctx.organizationId,
        role: ctx.user.role,
        classIds,
        isAdmin: isPrivilegedRole(ctx.user.role),
      },
      event,
    );
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    return res.json(event);
  } catch (error) {
    return fail(res, error);
  }
}

export async function updateCalendarEventHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const event = await findCalendarEvent(req.params.id!, ctx.organizationId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.createdBy !== ctx.user.id && !isPrivilegedRole(ctx.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const input = calendarEventSchema.partial().parse(req.body);
    const updated = await updateCalendarEvent(req.params.id!, ctx.organizationId, input);
    return res.json(updated);
  } catch (error) {
    return fail(res, error);
  }
}

export async function deleteCalendarEventHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const event = await findCalendarEvent(req.params.id!, ctx.organizationId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.createdBy !== ctx.user.id && !isPrivilegedRole(ctx.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await softDeleteCalendarEvent(req.params.id!, ctx.organizationId);
    return res.status(204).send();
  } catch (error) {
    return fail(res, error);
  }
}

export async function exportCalendarHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const { from, to } = dateRangeSchema.parse(req.query);
    const start = from ?? new Date(Date.now() - 7 * 86400000);
    const end = to ?? new Date(Date.now() + 90 * 86400000);
    const classIds = await listClassIdsForUser(ctx.user.id, ctx.organizationId);
    const events = await listCalendarEvents(ctx.organizationId, start, end, {
      classIds,
      includePrivateOf: ctx.user.id,
    });
    const ics = buildIcs(
      events.map((event) => ({
        id: event.id,
        title: event.title,
        description: event.description,
        location: event.location,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        allDay: event.allDay,
      })),
      'EduNet calendar',
    );
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="edunet-calendar.ics"');
    return res.send(ics);
  } catch (error) {
    return fail(res, error);
  }
}

export async function setEventAttendanceHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const { status } = z
      .object({ status: z.enum(['invited', 'accepted', 'declined']) })
      .parse(req.body);
    const event = await findCalendarEvent(req.params.id!, ctx.organizationId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    return res.json(await setEventAttendance(event.id, ctx.user.id, status));
  } catch (error) {
    return fail(res, error);
  }
}

export async function listEventAttendeesHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const event = await findCalendarEvent(req.params.id!, ctx.organizationId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    return res.json(await listEventAttendees(event.id));
  } catch (error) {
    return fail(res, error);
  }
}

export async function setEventReminderHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const { minutesBefore, channel } = z
      .object({
        minutesBefore: z.number().int().min(0).max(10080),
        channel: z.enum(['in_app', 'email', 'sms', 'push']).optional(),
      })
      .parse(req.body);
    const event = await findCalendarEvent(req.params.id!, ctx.organizationId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    return res.json(await setEventReminder(event.id, ctx.user.id, minutesBefore, channel));
  } catch (error) {
    return fail(res, error);
  }
}

export async function listTutorsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const query = z
      .object({ subject: z.string().max(120).optional(), mentor: z.coerce.boolean().optional() })
      .parse(req.query);
    return res.json(
      await listTutorProfiles(ctx.organizationId, {
        subject: query.subject,
        mentorOnly: query.mentor,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function updateMyTutorProfileHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = z
      .object({
        bio: z.string().max(3000).optional(),
        subjects: z.array(z.string().max(120)).max(20).optional(),
        languages: z.array(z.string().max(40)).max(10).optional(),
        hourlyRateCents: z.number().int().min(0).max(1000000).optional(),
        isMentor: z.boolean().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    return res.json(await upsertTutorProfile(ctx.organizationId, ctx.user.id, input));
  } catch (error) {
    return fail(res, error);
  }
}

export async function listTutorAvailabilityHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const query = z
      .object({
        tutorId: z.string().uuid().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      })
      .parse(req.query);
    return res.json(await listTutorAvailability(ctx.organizationId, query));
  } catch (error) {
    return fail(res, error);
  }
}

export async function createTutorAvailabilityHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = z
      .object({
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
        tutorId: z.string().uuid().optional(),
      })
      .parse(req.body);
    const tutorId =
      input.tutorId && isPrivilegedRole(ctx.user.role) ? input.tutorId : ctx.user.id;
    return res.status(201).json(
      await createTutorAvailability({
        organizationId: ctx.organizationId,
        tutorId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function deleteTutorAvailabilityHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const row = await deleteTutorAvailability(req.params.id!, ctx.organizationId, ctx.user.id);
    if (!row) return res.status(404).json({ error: 'Availability not found or already booked' });
    return res.status(204).send();
  } catch (error) {
    return fail(res, error);
  }
}

export async function bookTutoringSessionHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = tutoringSessionSchema.parse(req.body);
    const session = await bookTutoringSession({
      organizationId: ctx.organizationId,
      studentId: ctx.user.id,
      tutorId: input.tutorId,
      availabilityId: input.availabilityId,
      subject: input.subject,
      mode: input.mode,
    });
    return res.status(201).json(session);
  } catch (error) {
    return fail(res, error);
  }
}

export async function listTutoringSessionsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const query = dateRangeSchema.parse(req.query);
    return res.json(await listTutoringSessions(ctx.organizationId, ctx.user.id, query));
  } catch (error) {
    return fail(res, error);
  }
}

export async function updateTutoringSessionHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = z
      .object({
        status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show']).optional(),
        notes: z.string().max(5000).optional(),
        tutorFeedback: z.string().max(5000).optional(),
        studentFeedback: z.string().max(5000).optional(),
        rating: z.number().int().min(1).max(5).optional(),
        meetingUrl: z.string().url().optional(),
      })
      .parse(req.body);
    return res.json(
      await updateTutoringSession(req.params.id!, ctx.organizationId, ctx.user.id, input),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function cancelTutoringSessionHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(await cancelTutoringSession(req.params.id!, ctx.organizationId, ctx.user.id));
  } catch (error) {
    return fail(res, error);
  }
}

export async function listExtracurricularEventsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const query = z
      .object({
        from: z.coerce.date().optional(),
        category: z.string().max(40).optional(),
        includeUnpublished: z.coerce.boolean().optional(),
      })
      .parse(req.query);
    return res.json(
      await listExtracurricularEvents(ctx.organizationId, {
        ...query,
        includeUnpublished: query.includeUnpublished && isPrivilegedRole(ctx.user.role),
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function createExtracurricularEventHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = eventSchema.parse(req.body);
    return res.status(201).json(
      await createExtracurricularEvent({
        ...input,
        organizationId: ctx.organizationId,
        organizerId: ctx.user.id,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function updateExtracurricularEventHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = eventSchema.partial().parse(req.body);
    const updated = await updateExtracurricularEvent(req.params.id!, ctx.organizationId, input);
    if (!updated) return res.status(404).json({ error: 'Event not found' });
    return res.json(updated);
  } catch (error) {
    return fail(res, error);
  }
}

export async function bookExtracurricularEventHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const result = await bookExtracurricularEvent(req.params.id!, ctx.organizationId, ctx.user.id);
    return res.status(201).json(result);
  } catch (error) {
    return fail(res, error);
  }
}

export async function cancelExtracurricularBookingHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(
      await cancelExtracurricularBooking(req.params.id!, ctx.organizationId, ctx.user.id),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function listExtracurricularBookingsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const canSeeAll = isPrivilegedRole(ctx.user.role);
    return res.json(
      await listExtracurricularBookings(req.params.id!, ctx.organizationId, {
        userId: canSeeAll ? undefined : ctx.user.id,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function markEventAttendanceHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const { userId, attended } = z
      .object({ userId: z.string().uuid(), attended: z.boolean() })
      .parse(req.body);
    const row = await markEventAttendance(req.params.id!, ctx.organizationId, userId, attended);
    if (!row) return res.status(404).json({ error: 'Booking not found' });
    return res.json(row);
  } catch (error) {
    return fail(res, error);
  }
}

export async function listLiveClassesHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const query = z
      .object({
        courseId: z.string().uuid().optional(),
        from: z.coerce.date().optional(),
        status: z.enum(['scheduled', 'live', 'ended', 'cancelled']).optional(),
      })
      .parse(req.query);
    return res.json(await listLiveClasses(ctx.organizationId, query));
  } catch (error) {
    return fail(res, error);
  }
}

export async function createLiveClassHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = liveClassSchema.parse(req.body);
    if (input.endsAt <= input.startsAt) {
      return res.status(400).json({ error: 'endsAt must be after startsAt' });
    }
    return res.status(201).json(
      await createLiveClass({
        ...input,
        organizationId: ctx.organizationId,
        createdBy: ctx.user.id,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function updateLiveClassHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = z
      .object({
        title: z.string().min(1).max(200).optional(),
        status: z.enum(['scheduled', 'live', 'ended', 'cancelled']).optional(),
        meetingUrl: z.string().url().optional(),
        recordingUrl: z.string().url().optional(),
        waitingRoom: z.boolean().optional(),
      })
      .parse(req.body);
    const updated = await updateLiveClass(req.params.id!, ctx.organizationId, input);
    if (!updated) return res.status(404).json({ error: 'Live class not found' });
    return res.json(updated);
  } catch (error) {
    return fail(res, error);
  }
}

export async function getLiveClassHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const live = await findLiveClass(req.params.id!, ctx.organizationId);
    if (!live) return res.status(404).json({ error: 'Live class not found' });
    return res.json(live);
  } catch (error) {
    return fail(res, error);
  }
}

export async function joinLiveClassHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(await joinLiveClass(req.params.id!, ctx.organizationId, ctx.user.id));
  } catch (error) {
    return fail(res, error);
  }
}

export async function leaveLiveClassHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const row = await leaveLiveClass(req.params.id!, ctx.organizationId, ctx.user.id);
    if (!row) return res.status(404).json({ error: 'Attendance not found' });
    return res.json(row);
  } catch (error) {
    return fail(res, error);
  }
}

export async function listLiveClassEventsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(await listLiveClassEvents(req.params.id!, ctx.organizationId));
  } catch (error) {
    return fail(res, error);
  }
}

export async function addLiveClassEventHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = z
      .object({
        type: z.enum(['chat', 'question', 'poll', 'poll_response', 'hand_raise']),
        body: z.string().max(2000).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(req.body);
    return res.status(201).json(
      await addLiveClassEvent(
        req.params.id!,
        ctx.organizationId,
        ctx.user.id,
        input.type,
        input.body,
        input.metadata,
      ),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function getLiveClassAnalyticsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(await getLiveClassAnalytics(req.params.id!, ctx.organizationId));
  } catch (error) {
    return fail(res, error);
  }
}

export async function upcomingHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(await getUpcomingForUser(ctx.organizationId, ctx.user.id));
  } catch (error) {
    return fail(res, error);
  }
}

export { closeDb };
