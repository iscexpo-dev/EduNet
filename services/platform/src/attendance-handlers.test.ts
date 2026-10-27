import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual,
    attendanceSummary: vi.fn(),
    getLinkedAttendanceChildIds: vi.fn(),
    getTeacherAttendanceClassIds: vi.fn(),
    listAttendance: vi.fn(),
    listClassEnrollments: vi.fn(),
    listClasses: vi.fn(),
    listClassesForTeacher: vi.fn(),
    upsertAttendance: vi.fn(),
  };
});

import * as db from './db';
import {
  attendanceSummaryHandler,
  listAttendanceHandler,
  listClassesHandler,
  listEnrollmentsHandler,
  markAttendanceHandler,
  type AuthRequest,
} from './handlers';

const ORG_ID = '44444444-4444-4444-8444-444444444444';
const TEACHER_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_STUDENT_ID = '33333333-3333-4333-8333-333333333333';
const PARENT_ID = '55555555-5555-4555-8555-555555555555';
const CLASS_ID = '66666666-6666-4666-8666-666666666666';
const OTHER_CLASS_ID = '77777777-7777-4777-8777-777777777777';

interface MockResponse {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
}

function createResponse(): MockResponse {
  const response: MockResponse = {
    statusCode: 200,
    body: undefined,
    status: (code) => {
      response.statusCode = code;
      return response;
    },
    json: (payload) => {
      response.body = payload;
      return response;
    },
  };
  return response;
}

function createRequest(
  overrides: Partial<AuthRequest> = {},
): AuthRequest {
  return {
    params: {},
    query: {},
    body: {},
    user: { id: TEACHER_ID, role: 'teacher', organizationId: ORG_ID },
    ...overrides,
  } as unknown as AuthRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getTeacherAttendanceClassIds).mockResolvedValue([CLASS_ID]);
  vi.mocked(db.getLinkedAttendanceChildIds).mockResolvedValue([STUDENT_ID]);
  vi.mocked(db.listAttendance).mockResolvedValue([]);
  vi.mocked(db.attendanceSummary).mockResolvedValue([]);
  vi.mocked(db.listClassEnrollments).mockResolvedValue([]);
  vi.mocked(db.listClasses).mockResolvedValue([]);
  vi.mocked(db.listClassesForTeacher).mockResolvedValue([]);
  vi.mocked(db.upsertAttendance).mockResolvedValue([]);
});

describe('attendance list scoping', () => {
  it('lets a teacher read a class they teach', async () => {
    const res = createResponse();

    await listAttendanceHandler(
      createRequest({ query: { classId: CLASS_ID } }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    expect(db.listAttendance).toHaveBeenCalledWith(ORG_ID, {
      classId: CLASS_ID,
      classIds: [CLASS_ID],
      studentIds: undefined,
    });
  });

  it('denies a teacher another class', async () => {
    const res = createResponse();

    await listAttendanceHandler(
      createRequest({ query: { classId: OTHER_CLASS_ID } }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(db.listAttendance).not.toHaveBeenCalled();
  });

  it('limits a student to their own records', async () => {
    const res = createResponse();

    await listAttendanceHandler(
      createRequest({
        query: { studentId: OTHER_STUDENT_ID },
        user: { id: STUDENT_ID, role: 'student', organizationId: ORG_ID },
      }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(db.listAttendance).not.toHaveBeenCalled();
  });

  it('limits a parent to linked children', async () => {
    const res = createResponse();

    await listAttendanceHandler(
      createRequest({
        query: {},
        user: { id: PARENT_ID, role: 'parent', organizationId: ORG_ID },
      }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    expect(db.getLinkedAttendanceChildIds).toHaveBeenCalledWith(ORG_ID, PARENT_ID);
    expect(db.listAttendance).toHaveBeenCalledWith(ORG_ID, {
      classIds: undefined,
      studentIds: [STUDENT_ID],
    });
  });

  it('denies unlinked roles and missing permission roles', async () => {
    const tutor = createResponse();
    await listAttendanceHandler(
      createRequest({
        user: { id: 'tutor-1', role: 'tutor', organizationId: ORG_ID },
      }),
      tutor as unknown as Response,
    );
    expect(tutor.statusCode).toBe(403);

    const missingOrg = createResponse();
    await listAttendanceHandler(
      createRequest({ user: { id: TEACHER_ID, role: 'teacher' } }),
      missingOrg as unknown as Response,
    );
    expect(missingOrg.statusCode).toBe(403);
  });

  it('applies the same scope to the summary endpoint', async () => {
    const res = createResponse();

    await attendanceSummaryHandler(
      createRequest({ query: { classId: CLASS_ID } }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    expect(db.attendanceSummary).toHaveBeenCalledWith(ORG_ID, {
      classId: CLASS_ID,
      classIds: [CLASS_ID],
      studentIds: undefined,
    });
  });
});

describe('class and roster scoping', () => {
  it('lists only classes a teacher owns or teaches when mine=true', async () => {
    const res = createResponse();

    await listClassesHandler(
      createRequest({ query: { mine: 'true' } }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    expect(db.listClassesForTeacher).toHaveBeenCalledWith(ORG_ID, TEACHER_ID, undefined);
    expect(db.listClasses).not.toHaveBeenCalled();
  });

  it('keeps the full class list for administrators', async () => {
    const res = createResponse();

    await listClassesHandler(
      createRequest({
        query: { mine: 'true' },
        user: { id: 'admin-1', role: 'admin', organizationId: ORG_ID },
      }),
      res as unknown as Response,
    );

    expect(db.listClasses).toHaveBeenCalledWith(ORG_ID, undefined);
    expect(db.listClassesForTeacher).not.toHaveBeenCalled();
  });

  it('lets a teacher read the roster of their own class', async () => {
    const res = createResponse();

    await listEnrollmentsHandler(
      createRequest({ params: { classId: CLASS_ID } }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    expect(db.listClassEnrollments).toHaveBeenCalledWith(ORG_ID, CLASS_ID);
  });

  it('denies another teacher class roster and student roster access', async () => {
    const otherTeacher = createResponse();
    await listEnrollmentsHandler(
      createRequest({ params: { classId: OTHER_CLASS_ID } }),
      otherTeacher as unknown as Response,
    );
    expect(otherTeacher.statusCode).toBe(403);

    const student = createResponse();
    await listEnrollmentsHandler(
      createRequest({
        params: { classId: CLASS_ID },
        user: { id: STUDENT_ID, role: 'student', organizationId: ORG_ID },
      }),
      student as unknown as Response,
    );
    expect(student.statusCode).toBe(403);
    expect(db.listClassEnrollments).not.toHaveBeenCalled();
  });
});

describe('marking attendance', () => {
  const body = {
    classId: CLASS_ID,
    date: '2026-10-27',
    records: [{ studentId: STUDENT_ID, status: 'present' }],
  };

  it('allows teachers to mark attendance for their own class', async () => {
    const res = createResponse();

    await markAttendanceHandler(
      createRequest({ body }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    expect(db.upsertAttendance).toHaveBeenCalledWith({
      classId: CLASS_ID,
      date: expect.any(Date),
      records: [{ studentId: STUDENT_ID, status: 'present' }],
      organizationId: ORG_ID,
      markedBy: TEACHER_ID,
    });
  });

  it('denies a teacher another class', async () => {
    const res = createResponse();

    await markAttendanceHandler(
      createRequest({ body: { ...body, classId: OTHER_CLASS_ID } }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(db.upsertAttendance).not.toHaveBeenCalled();
  });

  it('denies students without attendance:write', async () => {
    const res = createResponse();

    await markAttendanceHandler(
      createRequest({
        body,
        user: { id: STUDENT_ID, role: 'student', organizationId: ORG_ID },
      }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(db.upsertAttendance).not.toHaveBeenCalled();
  });
});
