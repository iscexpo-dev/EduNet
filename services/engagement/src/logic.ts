/**
 * Pure engagement rules: calendar visibility, tutoring conflicts, event
 * capacity/waitlist and ICS export. Kept free of database access so every rule
 * is unit-testable and shared by HTTP handlers and background jobs.
 */

export interface TimeWindow {
  startsAt: Date;
  endsAt: Date;
}

export function isValidWindow(window: TimeWindow): boolean {
  const start = window.startsAt.getTime();
  const end = window.endsAt.getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

export function windowsOverlap(a: TimeWindow, b: TimeWindow): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();
}

export interface CalendarEventVisibility {
  organizationId: string;
  visibility: string;
  createdBy: string | null;
  classId: string | null;
}

export interface CalendarViewer {
  id: string;
  organizationId: string;
  role: string;
  classIds?: string[];
  isAdmin?: boolean;
}

/**
 * Calendar authorisation is checked in addition to organization scoping:
 * private events are visible only to their creator, class events only to
 * members of that class, and organization events to everyone in the tenant.
 */
export function canViewCalendarEvent(
  viewer: CalendarViewer,
  event: CalendarEventVisibility,
): boolean {
  if (viewer.organizationId !== event.organizationId) return false;
  if (viewer.isAdmin) return true;

  switch (event.visibility) {
    case 'private':
      return event.createdBy === viewer.id;
    case 'class':
      return !!event.classId && (viewer.classIds ?? []).includes(event.classId);
    case 'public':
    case 'organization':
    default:
      return true;
  }
}

export type SessionStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export interface SessionWindow extends TimeWindow {
  id: string;
  tutorId: string;
  studentId: string;
  status: SessionStatus;
}

export interface BookingCandidate extends TimeWindow {
  tutorId: string;
  studentId: string;
}

export type BookingDecision =
  | { ok: true }
  | { ok: false; code: 'invalid_window' | 'tutor_conflict' | 'student_conflict' | 'availability_taken' };

/**
 * Prevents double reservations. The database transaction re-checks under a row
 * lock; this pure predicate is the same rule used for immediate feedback.
 */
export function evaluateTutoringBooking(
  candidate: BookingCandidate,
  existingSessions: readonly SessionWindow[],
  availability?: { startsAt: Date; endsAt: Date; isBooked: boolean },
): BookingDecision {
  if (!isValidWindow(candidate)) return { ok: false, code: 'invalid_window' };

  if (availability) {
    if (availability.isBooked) return { ok: false, code: 'availability_taken' };
    if (
      candidate.startsAt.getTime() < availability.startsAt.getTime() ||
      candidate.endsAt.getTime() > availability.endsAt.getTime()
    ) {
      return { ok: false, code: 'availability_taken' };
    }
  }

  const active = existingSessions.filter((session) => session.status === 'scheduled');
  if (active.some((session) => session.tutorId === candidate.tutorId && windowsOverlap(candidate, session))) {
    return { ok: false, code: 'tutor_conflict' };
  }
  if (active.some((session) => session.studentId === candidate.studentId && windowsOverlap(candidate, session))) {
    return { ok: false, code: 'student_conflict' };
  }
  return { ok: true };
}

export type EventBookingStatus = 'booked' | 'waitlisted' | 'cancelled' | 'attended';

export interface EventCapacityInput {
  capacity: number;
  bookedCount: number;
  waitlistCount: number;
  existingStatus?: EventBookingStatus | null;
}

export type EventBookingDecision =
  | { status: 'booked'; position: null; promotedFromWaitlist: false }
  | { status: 'waitlisted'; position: number; promotedFromWaitlist: false }
  | { status: 'booked'; position: null; promotedFromWaitlist: true }
  | { status: 'unchanged'; position: number | null; promotedFromWaitlist: false };

/**
 * Decides the outcome of a booking request. An existing active booking is
 * idempotent; a cancelled user who books again joins the back of the queue
 * (never jumps the waitlist).
 */
export function decideEventBooking(input: EventCapacityInput): EventBookingDecision {
  const capacity = Math.max(0, input.capacity);

  if (input.existingStatus === 'booked' || input.existingStatus === 'attended') {
    return { status: 'unchanged', position: null, promotedFromWaitlist: false };
  }
  if (input.existingStatus === 'waitlisted') {
    return { status: 'unchanged', position: input.waitlistCount || 1, promotedFromWaitlist: false };
  }

  if (input.bookedCount < capacity) {
    return { status: 'booked', position: null, promotedFromWaitlist: false };
  }

  return {
    status: 'waitlisted',
    position: Math.max(1, input.waitlistCount + 1),
    promotedFromWaitlist: false,
  };
}

export interface WaitlistEntry {
  id: string;
  userId: string;
  position: number;
  bookedAt: Date;
}

/** Deterministic FIFO order: explicit position, then booking time, then id. */
export function sortWaitlist(entries: readonly WaitlistEntry[]): WaitlistEntry[] {
  return [...entries].sort(
    (a, b) =>
      a.position - b.position || a.bookedAt.getTime() - b.bookedAt.getTime() || a.id.localeCompare(b.id),
  );
}

/**
 * Returns how many waitlisted users can be promoted into freed seats, in order.
 */
export function promotionCandidates(
  waitlisted: readonly WaitlistEntry[],
  freeSeats: number,
): WaitlistEntry[] {
  if (freeSeats <= 0) return [];
  return sortWaitlist(waitlisted).slice(0, freeSeats);
}

// ---------------------------------------------------------------------------
// Calendar export
// ---------------------------------------------------------------------------

export interface IcsEvent {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  allDay?: boolean;
  url?: string;
}

function icsDate(date: Date, allDay = false): string {
  const iso = date.toISOString().replace(/[-:]/g, '');
  return allDay ? iso.slice(0, 8) : `${iso.slice(0, 15)}Z`;
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** RFC 5545 export. Deterministic for a given event list. */
export function buildIcs(events: readonly IcsEvent[], calendarName = 'EduNet'): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EduNet//Calendar//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
  ];

  for (const event of events) {
    const end = event.endsAt ?? new Date(event.startsAt.getTime() + 60 * 60 * 1000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcs(event.id)}@edunet`,
      `DTSTAMP:${icsDate(new Date())}`,
      event.allDay
        ? `DTSTART;VALUE=DATE:${icsDate(event.startsAt, true)}`
        : `DTSTART:${icsDate(event.startsAt)}`,
      event.allDay ? `DTEND;VALUE=DATE:${icsDate(end, true)}` : `DTEND:${icsDate(end)}`,
      `SUMMARY:${escapeIcs(event.title)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeIcs(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
    if (event.url) lines.push(`URL:${escapeIcs(event.url)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
