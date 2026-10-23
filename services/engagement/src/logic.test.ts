import { describe, expect, it } from 'vitest';
import {
  buildIcs,
  canViewCalendarEvent,
  decideEventBooking,
  evaluateTutoringBooking,
  isValidWindow,
  promotionCandidates,
  sortWaitlist,
  windowsOverlap,
  type SessionWindow,
} from './logic';

const at = (iso: string) => new Date(iso);

describe('time windows', () => {
  it('validates positive windows', () => {
    expect(isValidWindow({ startsAt: at('2026-01-01T10:00:00Z'), endsAt: at('2026-01-01T11:00:00Z') })).toBe(true);
    expect(isValidWindow({ startsAt: at('2026-01-01T11:00:00Z'), endsAt: at('2026-01-01T10:00:00Z') })).toBe(false);
    expect(isValidWindow({ startsAt: at('2026-01-01T10:00:00Z'), endsAt: at('2026-01-01T10:00:00Z') })).toBe(false);
  });

  it('detects overlap but not adjacency', () => {
    const a = { startsAt: at('2026-01-01T10:00:00Z'), endsAt: at('2026-01-01T11:00:00Z') };
    const b = { startsAt: at('2026-01-01T10:30:00Z'), endsAt: at('2026-01-01T11:30:00Z') };
    const c = { startsAt: at('2026-01-01T11:00:00Z'), endsAt: at('2026-01-01T12:00:00Z') };
    expect(windowsOverlap(a, b)).toBe(true);
    expect(windowsOverlap(a, c)).toBe(false);
  });
});

describe('calendar visibility', () => {
  const base = { organizationId: 'org-1', createdBy: 'teacher-1', classId: 'class-1' };
  const student = { id: 'student-1', organizationId: 'org-1', role: 'student', classIds: ['class-1'] };
  const otherStudent = { id: 'student-2', organizationId: 'org-1', role: 'student', classIds: ['class-2'] };

  it('denies cross-organization events', () => {
    expect(canViewCalendarEvent(student, { ...base, visibility: 'organization' })).toBe(true);
    expect(
      canViewCalendarEvent(
        { ...student, organizationId: 'org-2' },
        { ...base, visibility: 'organization' },
      ),
    ).toBe(false);
  });

  it('limits private events to the creator and admins', () => {
    const event = { ...base, visibility: 'private' };
    expect(canViewCalendarEvent(student, event)).toBe(false);
    expect(canViewCalendarEvent({ ...student, id: 'teacher-1' }, event)).toBe(true);
    expect(canViewCalendarEvent({ ...student, isAdmin: true }, event)).toBe(true);
  });

  it('limits class events to class members', () => {
    const event = { ...base, visibility: 'class' };
    expect(canViewCalendarEvent(student, event)).toBe(true);
    expect(canViewCalendarEvent(otherStudent, event)).toBe(false);
  });

  it('allows organization and public events to the tenant', () => {
    for (const visibility of ['organization', 'public']) {
      expect(canViewCalendarEvent(otherStudent, { ...base, visibility })).toBe(true);
    }
  });
});

describe('tutoring booking', () => {
  const candidate = {
    tutorId: 'tutor-1',
    studentId: 'student-1',
    startsAt: at('2026-01-01T10:00:00Z'),
    endsAt: at('2026-01-01T11:00:00Z'),
  };
  const existing: SessionWindow[] = [
    {
      id: 's1',
      tutorId: 'tutor-1',
      studentId: 'student-2',
      status: 'scheduled',
      startsAt: at('2026-01-01T10:30:00Z'),
      endsAt: at('2026-01-01T11:30:00Z'),
    },
  ];

  it('accepts a free slot', () => {
    expect(evaluateTutoringBooking(candidate, [])).toEqual({ ok: true });
  });

  it('rejects tutor double booking', () => {
    expect(evaluateTutoringBooking(candidate, existing)).toEqual({ ok: false, code: 'tutor_conflict' });
  });

  it('rejects student double booking', () => {
    const other = [
      {
        ...existing[0]!,
        id: 's2',
        tutorId: 'tutor-2',
        studentId: 'student-1',
      },
    ];
    expect(evaluateTutoringBooking(candidate, other)).toEqual({ ok: false, code: 'student_conflict' });
  });

  it('ignores cancelled and completed sessions', () => {
    for (const status of ['cancelled', 'completed', 'no_show'] as const) {
      expect(evaluateTutoringBooking(candidate, [{ ...existing[0]!, status }])).toEqual({ ok: true });
    }
  });

  it('rejects taken or out-of-range availability', () => {
    expect(
      evaluateTutoringBooking(candidate, [], {
        startsAt: candidate.startsAt,
        endsAt: candidate.endsAt,
        isBooked: true,
      }),
    ).toEqual({ ok: false, code: 'availability_taken' });

    expect(
      evaluateTutoringBooking(candidate, [], {
        startsAt: at('2026-01-01T10:30:00Z'),
        endsAt: at('2026-01-01T11:30:00Z'),
        isBooked: false,
      }),
    ).toEqual({ ok: false, code: 'availability_taken' });
  });

  it('rejects invalid windows', () => {
    expect(
      evaluateTutoringBooking({ ...candidate, endsAt: candidate.startsAt }, []),
    ).toEqual({ ok: false, code: 'invalid_window' });
  });
});

describe('event capacity', () => {
  it('books while seats remain', () => {
    expect(decideEventBooking({ capacity: 10, bookedCount: 9, waitlistCount: 0 })).toEqual({
      status: 'booked',
      position: null,
      promotedFromWaitlist: false,
    });
  });

  it('waitlists when full, FIFO position', () => {
    expect(decideEventBooking({ capacity: 10, bookedCount: 10, waitlistCount: 3 })).toEqual({
      status: 'waitlisted',
      position: 4,
      promotedFromWaitlist: false,
    });
  });

  it('is idempotent for existing bookings and waitlist entries', () => {
    expect(
      decideEventBooking({ capacity: 1, bookedCount: 1, waitlistCount: 2, existingStatus: 'booked' }),
    ).toMatchObject({ status: 'unchanged' });
    expect(
      decideEventBooking({ capacity: 1, bookedCount: 1, waitlistCount: 2, existingStatus: 'waitlisted' }),
    ).toMatchObject({ status: 'unchanged' });
  });

  it('treats a cancelled user as a new booking, not a promotion', () => {
    expect(
      decideEventBooking({ capacity: 2, bookedCount: 0, waitlistCount: 0, existingStatus: 'cancelled' }),
    ).toEqual({ status: 'booked', position: null, promotedFromWaitlist: false });
  });

  it('never books beyond a zero capacity', () => {
    expect(decideEventBooking({ capacity: 0, bookedCount: 0, waitlistCount: 0 }).status).toBe('waitlisted');
  });
});

describe('waitlist promotion', () => {
  const entries = [
    { id: 'b', userId: 'u2', position: 2, bookedAt: at('2026-01-01T10:00:00Z') },
    { id: 'a', userId: 'u1', position: 1, bookedAt: at('2026-01-01T11:00:00Z') },
    { id: 'c', userId: 'u3', position: 3, bookedAt: at('2026-01-01T09:00:00Z') },
  ];

  it('sorts by position, then booking time, then id', () => {
    expect(sortWaitlist(entries).map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  it('promotes exactly the freed seats', () => {
    expect(promotionCandidates(entries, 2).map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(promotionCandidates(entries, 0)).toEqual([]);
    expect(promotionCandidates(entries, 10).map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('ICS export', () => {
  it('produces a valid calendar with escaped fields', () => {
    const ics = buildIcs([
      {
        id: 'e1',
        title: 'Math; revision, part 1',
        description: 'Bring\nnotes',
        location: 'Room 3',
        startsAt: at('2026-02-01T09:00:00Z'),
        endsAt: at('2026-02-01T10:00:00Z'),
      },
    ]);

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Math\\; revision\\, part 1');
    expect(ics).toContain('DESCRIPTION:Bring\\nnotes');
    expect(ics).toContain('DTSTART:20260201T090000Z');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics.endsWith('\r\n')).toBe(true);
  });

  it('uses all-day date format', () => {
    const ics = buildIcs([
      {
        id: 'holiday',
        title: 'Holiday',
        startsAt: at('2026-03-01T00:00:00Z'),
        allDay: true,
      },
    ]);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260301');
  });
});
