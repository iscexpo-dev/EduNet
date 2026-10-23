import { describe, expect, it } from 'vitest';
import {
  ALL_ROLES,
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  hasAnyPermission,
  hasPermission,
  isKnownRole,
  isPrivilegedRole,
  permissionsForRole,
  requirePermission,
} from './index';

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

describe('permission matrix', () => {
  it('defines a permission list for every role', () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_PERMISSIONS[role], role).toBeDefined();
    }
  });

  it('grants students their own learning capabilities but not staff tools', () => {
    expect(hasPermission(ROLES.STUDENT, PERMISSIONS.COURSE_READ)).toBe(true);
    expect(hasPermission(ROLES.STUDENT, PERMISSIONS.SUBMISSION_WRITE)).toBe(true);
    expect(hasPermission(ROLES.STUDENT, PERMISSIONS.SUBMISSION_GRADE)).toBe(false);
    expect(hasPermission(ROLES.STUDENT, PERMISSIONS.USER_WRITE)).toBe(false);
    expect(hasPermission(ROLES.STUDENT, PERMISSIONS.ADMIN_WRITE)).toBe(false);
  });

  it('grants teachers grading and authoring, not platform administration', () => {
    expect(hasPermission(ROLES.TEACHER, PERMISSIONS.SUBMISSION_GRADE)).toBe(true);
    expect(hasPermission(ROLES.TEACHER, PERMISSIONS.COURSE_WRITE)).toBe(true);
    expect(hasPermission(ROLES.TEACHER, PERMISSIONS.USER_MANAGE_ROLES)).toBe(false);
    expect(hasPermission(ROLES.TEACHER, PERMISSIONS.BILLING_WRITE)).toBe(false);
  });

  it('keeps parents read-only for learning data and unable to grade', () => {
    expect(hasPermission(ROLES.PARENT, PERMISSIONS.ATTENDANCE_READ)).toBe(true);
    expect(hasPermission(ROLES.PARENT, PERMISSIONS.SUBMISSION_WRITE)).toBe(false);
    expect(hasPermission(ROLES.PARENT, PERMISSIONS.SUBMISSION_GRADE)).toBe(false);
    expect(hasPermission(ROLES.PARENT, PERMISSIONS.ADMIN_READ)).toBe(false);
  });

  it('separates finance from academic capabilities', () => {
    expect(hasPermission(ROLES.FINANCE, PERMISSIONS.BILLING_WRITE)).toBe(true);
    expect(hasPermission(ROLES.FINANCE, PERMISSIONS.SUBMISSION_GRADE)).toBe(false);
    expect(hasPermission(ROLES.FINANCE, PERMISSIONS.USER_WRITE)).toBe(false);
  });

  it('restricts content moderators to moderation', () => {
    expect(hasPermission(ROLES.CONTENT_MODERATOR, PERMISSIONS.CONTENT_MODERATE)).toBe(true);
    expect(hasPermission(ROLES.CONTENT_MODERATOR, PERMISSIONS.USER_WRITE)).toBe(false);
    expect(hasPermission(ROLES.CONTENT_MODERATOR, PERMISSIONS.BILLING_READ)).toBe(false);
  });

  it('gives district admins scope beyond school admins without billing write', () => {
    expect(hasPermission(ROLES.DISTRICT_ADMIN, PERMISSIONS.USER_MANAGE_ROLES)).toBe(true);
    expect(hasPermission(ROLES.DISTRICT_ADMIN, PERMISSIONS.BILLING_WRITE)).toBe(false);
    expect(hasPermission(ROLES.SCHOOL_ADMIN, PERMISSIONS.USER_MANAGE_ROLES)).toBe(true);
  });

  it('grants super admin every declared permission exactly once', () => {
    const granted = permissionsForRole(ROLES.SUPER_ADMIN);
    expect(new Set(granted).size).toBe(granted.length);
    for (const permission of Object.values(PERMISSIONS)) {
      expect(granted).toContain(permission);
    }
  });

  it('returns no permissions for unknown or missing roles', () => {
    expect(permissionsForRole('ghost')).toEqual([]);
    expect(permissionsForRole(undefined)).toEqual([]);
    expect(hasPermission('ghost', PERMISSIONS.COURSE_READ)).toBe(false);
  });

  it('supports all-of and any-of checks', () => {
    expect(
      hasPermission(ROLES.TEACHER, [PERMISSIONS.COURSE_WRITE, PERMISSIONS.SUBMISSION_GRADE]),
    ).toBe(true);
    expect(
      hasPermission(ROLES.TEACHER, [PERMISSIONS.COURSE_WRITE, PERMISSIONS.BILLING_WRITE]),
    ).toBe(false);
    expect(
      hasAnyPermission(ROLES.TEACHER, [PERMISSIONS.BILLING_WRITE, PERMISSIONS.COURSE_READ]),
    ).toBe(true);
    expect(hasAnyPermission(ROLES.TEACHER, [PERMISSIONS.BILLING_WRITE])).toBe(false);
  });
});

describe('role helpers', () => {
  it('recognises known roles', () => {
    expect(isKnownRole(ROLES.INSTITUTION_ADMIN)).toBe(true);
    expect(isKnownRole('ghost')).toBe(false);
    expect(isKnownRole(undefined)).toBe(false);
  });

  it('treats administrative roles as privileged for role gates', () => {
    for (const role of [
      ROLES.ADMIN,
      ROLES.SCHOOL_ADMIN,
      ROLES.INSTITUTION_ADMIN,
      ROLES.DISTRICT_ADMIN,
      ROLES.NATIONAL_ADMIN,
      ROLES.SUPER_ADMIN,
    ]) {
      expect(isPrivilegedRole(role)).toBe(true);
    }
    for (const role of [ROLES.STUDENT, ROLES.TEACHER, ROLES.PARENT, ROLES.TUTOR]) {
      expect(isPrivilegedRole(role)).toBe(false);
    }
  });
});

describe('requirePermission middleware', () => {
  it('rejects unauthenticated requests', () => {
    const res = mockRes();
    const next = () => {};
    requirePermission(PERMISSIONS.COURSE_READ)({ user: undefined }, res, next);
    expect(res.statusCode).toBe(401);
  });

  it('rejects roles without the permission', () => {
    const res = mockRes();
    let called = false;
    requirePermission(PERMISSIONS.USER_WRITE)(
      { user: { id: 'u1', role: ROLES.STUDENT } },
      res,
      () => {
        called = true;
      },
    );
    expect(res.statusCode).toBe(403);
    expect(called).toBe(false);
  });

  it('allows roles with every required permission', () => {
    const res = mockRes();
    let called = false;
    requirePermission(PERMISSIONS.COURSE_WRITE, PERMISSIONS.SUBMISSION_GRADE)(
      { user: { id: 'u1', role: ROLES.TEACHER } },
      res,
      () => {
        called = true;
      },
    );
    expect(res.statusCode).toBe(200);
    expect(called).toBe(true);
  });
});
