import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';

vi.mock('./db', () => ({
  findCourseForAnalytics: vi.fn(),
  getCourseAnalytics: vi.fn(),
  getStudentPerformance: vi.fn(),
  getAssignmentPerformance: vi.fn(),
  getCourseEngagement: vi.fn(),
}));

import * as db from './db';
import {
  getCourseAnalyticsHandler,
  getCourseEngagementHandler,
  type AuthRequest,
} from './handlers';

const COURSE_ID = '3f8d2c1a-5b6e-4f7a-9c8d-1e2f3a4b5c6d';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TEACHER_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';
const ORG_ID = '44444444-4444-4444-8444-444444444444';

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
    params: { courseId: COURSE_ID },
    query: {},
    user: { id: OWNER_ID, role: 'teacher', organizationId: ORG_ID },
    ...overrides,
  } as unknown as AuthRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.findCourseForAnalytics).mockResolvedValue({
    id: COURSE_ID,
    teacherId: OWNER_ID,
  });
  vi.mocked(db.getCourseAnalytics).mockResolvedValue({
    enrollmentCount: 4,
    assignmentCount: 2,
    submissionsCount: 3,
    gradedSubmissions: 1,
    averageGrade: 8,
    averagePercent: 80,
  });
  vi.mocked(db.getCourseEngagement).mockResolvedValue({
    days: 30,
    recentSubmissions: 2,
    recentEnrollments: 1,
  });
});

describe('getCourseAnalyticsHandler tenant and ownership checks', () => {
  it('returns 403 when a teacher requests another teacher course', async () => {
    const req = createRequest({
      user: { id: OTHER_TEACHER_ID, role: 'teacher', organizationId: ORG_ID },
    });
    const res = createResponse();

    await getCourseAnalyticsHandler(req, res as unknown as Response);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: 'You can only view analytics for your own courses',
    });
    expect(db.getCourseAnalytics).not.toHaveBeenCalled();
  });

  it('returns 404 for a course outside the caller organization', async () => {
    vi.mocked(db.findCourseForAnalytics).mockResolvedValueOnce(null);
    const res = createResponse();

    await getCourseAnalyticsHandler(createRequest(), res as unknown as Response);

    expect(res.statusCode).toBe(404);
    expect(db.findCourseForAnalytics).toHaveBeenCalledWith(COURSE_ID, ORG_ID);
    expect(res.body).toEqual({ error: 'Course not found' });
  });

  it('rejects a malformed course id before querying the database', async () => {
    const res = createResponse();

    await getCourseAnalyticsHandler(
      createRequest({ params: { courseId: 'not-a-uuid' } }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(400);
    expect(db.findCourseForAnalytics).not.toHaveBeenCalled();
  });

  it('requires organization context', async () => {
    const res = createResponse();

    await getCourseAnalyticsHandler(
      createRequest({ user: { id: OWNER_ID, role: 'teacher' } }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(db.findCourseForAnalytics).not.toHaveBeenCalled();
  });

  it('lets the owning teacher read org-scoped analytics', async () => {
    const res = createResponse();

    await getCourseAnalyticsHandler(createRequest(), res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(db.getCourseAnalytics).toHaveBeenCalledWith(COURSE_ID, ORG_ID);
    expect(res.body).toMatchObject({ enrollmentCount: 4, assignmentCount: 2 });
  });

  it('lets an administrator read analytics in the same organization', async () => {
    const res = createResponse();

    await getCourseAnalyticsHandler(
      createRequest({
        user: { id: ADMIN_ID, role: 'admin', organizationId: ORG_ID },
      }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    expect(db.getCourseAnalytics).toHaveBeenCalledWith(COURSE_ID, ORG_ID);
  });
});

describe('getCourseEngagementHandler validation', () => {
  it('rejects an out-of-range days window', async () => {
    const res = createResponse();

    await getCourseEngagementHandler(
      createRequest({ query: { days: '999' } }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(400);
    expect(db.getCourseEngagement).not.toHaveBeenCalled();
  });

  it('passes a valid days window through to the query', async () => {
    const res = createResponse();

    await getCourseEngagementHandler(
      createRequest({ query: { days: '7' } }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    expect(db.getCourseEngagement).toHaveBeenCalledWith(COURSE_ID, ORG_ID, 7);
  });
});
