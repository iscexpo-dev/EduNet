import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createSubmissionHandler,
  getSubmissionHandler,
  gradeSubmissionHandler,
  listSubmissionsHandler,
} from './handlers';

vi.mock('./db', () => ({
  findCourseById: vi.fn(),
  findAssignmentById: vi.fn(),
  findSubmissionById: vi.fn(),
  findSubmission: vi.fn(),
  isStudentEnrolled: vi.fn(),
  listSubmissionsByAssignment: vi.fn(),
  listSubmissionsByStudent: vi.fn(),
  createSubmission: vi.fn(),
  applyResubmission: vi.fn(),
  autosaveSubmission: vi.fn(),
  gradeSubmission: vi.fn(),
  deleteSubmission: vi.fn(),
  listRubricCriteria: vi.fn(),
  replaceRubricCriteria: vi.fn(),
  recordSubmissionRevision: vi.fn(),
  listSubmissionRevisions: vi.fn(),
  recordSubmissionEvent: vi.fn(),
  listSubmissionEvents: vi.fn(),
  recordGradeRevision: vi.fn(),
  listGradeRevisions: vi.fn(),
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
const TEACHER_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_TEACHER_ID = '44444444-4444-4444-8444-444444444444';
const COURSE_ID = '55555555-5555-4555-8555-555555555555';
const ASSIGNMENT_ID = '66666666-6666-4666-8666-666666666666';
const SUBMISSION_ID = '77777777-7777-4777-8777-777777777777';

function mockRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSIGNMENT_ID,
    courseId: COURSE_ID,
    isActive: true,
    dueDate: new Date(Date.now() + 86_400_000),
    latePolicy: 'accept',
    latePenaltyPercent: 0,
    allowResubmission: false,
    resubmissionDeadline: null,
    maxPoints: 100,
    ...overrides,
  };
}

describe('submission authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a submission when the student is not enrolled in the course', async () => {
    const db = await import('./db');
    (db.findAssignmentById as any).mockResolvedValue(assignment());
    (db.findSubmission as any).mockResolvedValue(null);
    (db.isStudentEnrolled as any).mockResolvedValue(false);

    const req: any = {
      body: { assignmentId: ASSIGNMENT_ID, content: 'My answer' },
      user: { id: STUDENT_ID, role: 'student', organizationId: ORG_ID },
    };
    const res = mockRes();

    await createSubmissionHandler(req, res);

    expect(res.statusCode).toBe(403);
    expect(db.createSubmission).not.toHaveBeenCalled();
  });

  it('rejects submissions to an inactive assignment', async () => {
    const db = await import('./db');
    (db.findAssignmentById as any).mockResolvedValue(assignment({ isActive: false }));

    const req: any = {
      body: { assignmentId: ASSIGNMENT_ID, content: 'My answer' },
      user: { id: STUDENT_ID, role: 'student', organizationId: ORG_ID },
    };
    const res = mockRes();

    await createSubmissionHandler(req, res);

    expect(res.statusCode).toBe(409);
    expect(db.createSubmission).not.toHaveBeenCalled();
  });

  it('passes studentId and organizationId in the correct order when students list submissions', async () => {
    const db = await import('./db');
    (db.listSubmissionsByStudent as any).mockResolvedValue([]);

    const req: any = {
      query: {},
      user: { id: STUDENT_ID, role: 'student', organizationId: ORG_ID },
    };
    const res = mockRes();

    await listSubmissionsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(db.listSubmissionsByStudent).toHaveBeenCalledWith(STUDENT_ID, ORG_ID, 50, 0);
  });

  it('prevents a teacher from reading a submission in another teacher course', async () => {
    const db = await import('./db');
    (db.findSubmissionById as any).mockResolvedValue({
      id: SUBMISSION_ID,
      studentId: STUDENT_ID,
      assignmentId: ASSIGNMENT_ID,
    });
    (db.findAssignmentById as any).mockResolvedValue(assignment());
    (db.findCourseById as any).mockResolvedValue({
      id: COURSE_ID,
      teacherId: OTHER_TEACHER_ID,
    });

    const req: any = {
      params: { id: SUBMISSION_ID },
      user: { id: TEACHER_ID, role: 'teacher', organizationId: ORG_ID },
    };
    const res = mockRes();

    await getSubmissionHandler(req, res);

    expect(res.statusCode).toBe(403);
  });

  it('requires an audit reason before updating a regrade', async () => {
    const db = await import('./db');
    (db.findSubmissionById as any).mockResolvedValue({
      id: SUBMISSION_ID,
      studentId: STUDENT_ID,
      assignmentId: ASSIGNMENT_ID,
      isLate: false,
      grade: 70,
    });
    (db.findAssignmentById as any).mockResolvedValue(assignment());
    (db.findCourseById as any).mockResolvedValue({
      id: COURSE_ID,
      teacherId: TEACHER_ID,
    });

    const req: any = {
      params: { id: SUBMISSION_ID },
      body: { grade: 90 },
      user: { id: TEACHER_ID, role: 'teacher', organizationId: ORG_ID },
    };
    const res = mockRes();

    await gradeSubmissionHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(db.gradeSubmission).not.toHaveBeenCalled();
  });
});
