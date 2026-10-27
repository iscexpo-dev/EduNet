import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCourseHandler, updateCourseHandler, deleteCourseHandler } from './handlers';
import { findCourseById } from './db';

vi.mock('./db', () => ({
  findCourseById: vi.fn(),
  isStudentEnrolled: vi.fn(),
  listCoursesByOrganization: vi.fn(),
  listCoursesByTeacher: vi.fn(),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
  deleteCourse: vi.fn(),
  getCourseEnrollmentCount: vi.fn(),
}));

const REQUIRED_FIELDS = ['organizationId', 'title', 'description', 'subject', 'teacherId'] as const;

/** Minimal stand-in for the zod courseSchema: rejects payloads missing required
 *  fields so validation failures are actually exercised by the handler tests. */
vi.mock('@edunet/validation', () => {
  const assertRequired = (data: Record<string, unknown>, fields: readonly string[]) => {
    for (const field of fields) {
      const value = data[field];
      if (value === undefined || value === null || value === '') {
        throw new Error(`Invalid course data: ${field} is required`);
      }
    }
    return data;
  };

  return {
    courseSchema: {
      parse: vi.fn((data: Record<string, unknown>) => assertRequired(data, REQUIRED_FIELDS)),
      partial: vi.fn(() => ({
        parse: vi.fn((data: Record<string, unknown>) => data),
      })),
    },
  };
});

describe('Course Handlers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.JWT_SECRET = 'test-secret-key';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('createCourseHandler', () => {
    it('should create a course successfully', async () => {
      const mockCourse = { id: 'course-1', title: 'Test Course', teacherId: 'teacher-1' };
      const { createCourse } = await import('./db');
      (createCourse as any).mockResolvedValue(mockCourse);

      const req: any = {
        body: {
          title: 'Test Course',
          description: 'Test',
          subject: 'Math',
          organizationId: 'org-1',
          teacherId: 'teacher-1',
        },
        user: { id: 'teacher-1', role: 'teacher', organizationId: 'org-1' },
      };
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          this.body = data;
          return this;
        },
      };

      await createCourseHandler(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(mockCourse);
    });

    it('should return 400 for invalid data', async () => {
      const req: any = {
        body: {},
        user: { id: 'teacher-1', role: 'teacher', organizationId: 'org-1' },
      };
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          this.body = data;
          return this;
        },
      };

      await createCourseHandler(req, res);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('updateCourseHandler', () => {
    it('should update own course', async () => {
      const mockCourse = { id: 'course-1', title: 'Updated', teacherId: 'teacher-1' };
      const { findCourseById, updateCourse } = await import('./db');
      (findCourseById as any).mockResolvedValue(mockCourse);
      (updateCourse as any).mockResolvedValue(mockCourse);

      const req: any = {
        params: { id: 'course-1' },
        body: { title: 'Updated' },
        user: { id: 'teacher-1', role: 'teacher', organizationId: 'org-1' },
      };
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          this.body = data;
          return this;
        },
      };

      await updateCourseHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(mockCourse);
    });

    it("should reject updating another teacher's course", async () => {
      const mockCourse = { id: 'course-1', title: 'Test', teacherId: 'teacher-2' };
      const { findCourseById } = await import('./db');
      (findCourseById as any).mockResolvedValue(mockCourse);

      const req: any = {
        params: { id: 'course-1' },
        body: { title: 'Updated' },
        user: { id: 'teacher-1', role: 'teacher', organizationId: 'org-1' },
      };
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          this.body = data;
          return this;
        },
      };

      await updateCourseHandler(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('You can only edit your own courses');
    });

    it('should allow admin to update any course', async () => {
      const mockCourse = { id: 'course-1', title: 'Updated', teacherId: 'teacher-2' };
      const { findCourseById, updateCourse } = await import('./db');
      (findCourseById as any).mockResolvedValue(mockCourse);
      (updateCourse as any).mockResolvedValue(mockCourse);

      const req: any = {
        params: { id: 'course-1' },
        body: { title: 'Updated' },
        user: { id: 'admin-1', role: 'admin', organizationId: 'org-1' },
      };
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          this.body = data;
          return this;
        },
      };

      await updateCourseHandler(req, res);

      expect(res.statusCode).toBe(200);
    });
  });

  describe('deleteCourseHandler', () => {
    it('should delete own course', async () => {
      const mockCourse = { id: 'course-1', title: 'Test', teacherId: 'teacher-1' };
      const { findCourseById, deleteCourse } = await import('./db');
      (findCourseById as any).mockResolvedValue(mockCourse);
      (deleteCourse as any).mockResolvedValue(mockCourse);

      const req: any = {
        params: { id: 'course-1' },
        user: { id: 'teacher-1', role: 'teacher', organizationId: 'org-1' },
      };
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          this.body = data;
          return this;
        },
      };

      await deleteCourseHandler(req, res);

      expect(res.statusCode).toBe(200);
    });

    it("should reject deleting another teacher's course", async () => {
      const mockCourse = { id: 'course-1', title: 'Test', teacherId: 'teacher-2' };
      const { findCourseById } = await import('./db');
      (findCourseById as any).mockResolvedValue(mockCourse);

      const req: any = {
        params: { id: 'course-1' },
        user: { id: 'teacher-1', role: 'teacher', organizationId: 'org-1' },
      };
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          this.body = data;
          return this;
        },
      };

      await deleteCourseHandler(req, res);

      expect(res.statusCode).toBe(403);
    });
  });
});
