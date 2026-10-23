/**
 * Canonical EduNet role and permission catalogue.
 *
 * Roles are intentionally coarse; permissions are fine-grained. Services must
 * gate on permissions rather than enumerating roles, so adding a role (for
 * example a district administrator) does not require touching every route.
 *
 * Tenant isolation is orthogonal: holding a permission never widens the set of
 * organizations a user may read. Every query still filters by organization.
 */

export const ROLES = {
  STUDENT: 'student',
  TEACHER: 'teacher',
  PARENT: 'parent',
  TUTOR: 'tutor',
  MENTOR: 'mentor',
  SCHOOL_ADMIN: 'school_admin',
  INSTITUTION_ADMIN: 'institution_admin',
  DISTRICT_ADMIN: 'district_admin',
  NATIONAL_ADMIN: 'national_admin',
  CONTENT_MODERATOR: 'content_moderator',
  SUPPORT_AGENT: 'support_agent',
  FINANCE: 'finance',
  SUPER_ADMIN: 'super_admin',
  // Legacy alias kept so existing tokens and rows remain valid.
  ADMIN: 'admin',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: readonly Role[] = Object.values(ROLES);

/**
 * Roles allowed to bypass the role list passed to `authorize()`.
 *
 * This only bypasses *role* gating. `assertSameOrganization` and ownership
 * checks still apply, so no role is cross-tenant by default.
 */
export const PRIVILEGED_ROLES: readonly string[] = [
  ROLES.ADMIN,
  ROLES.SCHOOL_ADMIN,
  ROLES.INSTITUTION_ADMIN,
  ROLES.DISTRICT_ADMIN,
  ROLES.NATIONAL_ADMIN,
  ROLES.SUPER_ADMIN,
];

export const PERMISSIONS = {
  // Identity and users
  USER_READ: 'user:read',
  USER_WRITE: 'user:write',
  USER_MANAGE_ROLES: 'user:manage_roles',
  IDENTITY_AUDIT_READ: 'identity:audit_read',

  // Organisation and academics
  ORGANIZATION_READ: 'organization:read',
  ORGANIZATION_WRITE: 'organization:write',
  ACADEMICS_READ: 'academics:read',
  ACADEMICS_WRITE: 'academics:write',
  STUDENT_READ: 'student:read',
  STUDENT_WRITE: 'student:write',
  ATTENDANCE_READ: 'attendance:read',
  ATTENDANCE_WRITE: 'attendance:write',

  // Learning
  COURSE_READ: 'course:read',
  COURSE_WRITE: 'course:write',
  COURSE_PUBLISH: 'course:publish',
  LESSON_READ: 'lesson:read',
  LESSON_WRITE: 'lesson:write',
  ASSIGNMENT_READ: 'assignment:read',
  ASSIGNMENT_WRITE: 'assignment:write',
  SUBMISSION_READ: 'submission:read',
  SUBMISSION_WRITE: 'submission:write',
  SUBMISSION_GRADE: 'submission:grade',
  ASSESSMENT_READ: 'assessment:read',
  ASSESSMENT_WRITE: 'assessment:write',
  ASSESSMENT_GRADE: 'assessment:grade',
  ENROLLMENT_READ: 'enrollment:read',
  ENROLLMENT_WRITE: 'enrollment:write',

  // Engagement
  CALENDAR_READ: 'calendar:read',
  CALENDAR_WRITE: 'calendar:write',
  TUTORING_READ: 'tutoring:read',
  TUTORING_BOOK: 'tutoring:book',
  TUTORING_MANAGE: 'tutoring:manage',
  EVENT_READ: 'event:read',
  EVENT_BOOK: 'event:book',
  EVENT_MANAGE: 'event:manage',
  LIVE_READ: 'live:read',
  LIVE_MANAGE: 'live:manage',

  // Communication and content
  MESSAGE_READ: 'message:read',
  MESSAGE_WRITE: 'message:write',
  MESSAGE_MODERATE: 'message:moderate',
  CONTENT_READ: 'content:read',
  CONTENT_WRITE: 'content:write',
  CONTENT_PUBLISH: 'content:publish',
  CONTENT_MODERATE: 'content:moderate',

  // Insight and automation
  ANALYTICS_READ: 'analytics:read',
  ANALYTICS_EXPORT: 'analytics:export',
  AI_USE: 'ai:use',
  AI_ADMIN: 'ai:admin',
  SEARCH_ADMIN: 'search:admin',

  // Support and operations
  SUPPORT_READ: 'support:read',
  SUPPORT_WRITE: 'support:write',
  SUPPORT_ESCALATE: 'support:escalate',
  ADMIN_READ: 'admin:read',
  ADMIN_WRITE: 'admin:write',
  AUDIT_READ: 'audit:read',
  FEATURE_FLAG_WRITE: 'feature_flag:write',
  SETTINGS_WRITE: 'settings:write',
  BILLING_READ: 'billing:read',
  BILLING_WRITE: 'billing:write',
  INTEGRATION_READ: 'integration:read',
  INTEGRATION_WRITE: 'integration:write',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;

const STUDENT_PERMISSIONS: readonly Permission[] = [
  P.USER_READ,
  P.ORGANIZATION_READ,
  P.ACADEMICS_READ,
  P.ATTENDANCE_READ,
  P.COURSE_READ,
  P.LESSON_READ,
  P.ASSIGNMENT_READ,
  P.SUBMISSION_READ,
  P.SUBMISSION_WRITE,
  P.ASSESSMENT_READ,
  P.ENROLLMENT_READ,
  P.CALENDAR_READ,
  P.TUTORING_READ,
  P.TUTORING_BOOK,
  P.EVENT_READ,
  P.EVENT_BOOK,
  P.LIVE_READ,
  P.MESSAGE_READ,
  P.MESSAGE_WRITE,
  P.CONTENT_READ,
  P.AI_USE,
  P.SUPPORT_READ,
  P.SUPPORT_WRITE,
];

const TEACHER_PERMISSIONS: readonly Permission[] = [
  ...STUDENT_PERMISSIONS,
  P.USER_READ,
  P.STUDENT_READ,
  P.ATTENDANCE_READ,
  P.ATTENDANCE_WRITE,
  P.COURSE_WRITE,
  P.COURSE_PUBLISH,
  P.LESSON_WRITE,
  P.ASSIGNMENT_WRITE,
  P.SUBMISSION_GRADE,
  P.ASSESSMENT_WRITE,
  P.ASSESSMENT_GRADE,
  P.ENROLLMENT_READ,
  P.ENROLLMENT_WRITE,
  P.CALENDAR_WRITE,
  P.TUTORING_MANAGE,
  P.EVENT_READ,
  P.EVENT_MANAGE,
  P.LIVE_MANAGE,
  P.CONTENT_WRITE,
  P.ANALYTICS_READ,
  P.AI_USE,
  P.SEARCH_ADMIN,
];

const PARENT_PERMISSIONS: readonly Permission[] = [
  P.USER_READ,
  P.ORGANIZATION_READ,
  P.ACADEMICS_READ,
  P.ATTENDANCE_READ,
  P.COURSE_READ,
  P.LESSON_READ,
  P.ASSIGNMENT_READ,
  P.SUBMISSION_READ,
  P.ASSESSMENT_READ,
  P.ENROLLMENT_READ,
  P.CALENDAR_READ,
  P.EVENT_READ,
  P.EVENT_BOOK,
  P.MESSAGE_READ,
  P.MESSAGE_WRITE,
  P.CONTENT_READ,
  P.SUPPORT_READ,
  P.SUPPORT_WRITE,
];

const TUTOR_PERMISSIONS: readonly Permission[] = [
  ...STUDENT_PERMISSIONS,
  P.USER_READ,
  P.STUDENT_READ,
  P.CALENDAR_WRITE,
  P.TUTORING_MANAGE,
  P.EVENT_READ,
  P.LIVE_MANAGE,
  P.ANALYTICS_READ,
  P.CONTENT_WRITE,
];

const MENTOR_PERMISSIONS: readonly Permission[] = [
  P.USER_READ,
  P.ORGANIZATION_READ,
  P.ACADEMICS_READ,
  P.STUDENT_READ,
  P.CALENDAR_READ,
  P.CALENDAR_WRITE,
  P.TUTORING_READ,
  P.TUTORING_MANAGE,
  P.EVENT_READ,
  P.MESSAGE_READ,
  P.MESSAGE_WRITE,
  P.SUPPORT_READ,
  P.SUPPORT_WRITE,
  P.AI_USE,
];

const SCHOOL_ADMIN_PERMISSIONS: readonly Permission[] = [
  P.USER_READ,
  P.USER_WRITE,
  P.USER_MANAGE_ROLES,
  P.IDENTITY_AUDIT_READ,
  P.ORGANIZATION_READ,
  P.ORGANIZATION_WRITE,
  P.ACADEMICS_READ,
  P.ACADEMICS_WRITE,
  P.STUDENT_READ,
  P.STUDENT_WRITE,
  P.ATTENDANCE_READ,
  P.ATTENDANCE_WRITE,
  P.COURSE_READ,
  P.COURSE_WRITE,
  P.COURSE_PUBLISH,
  P.LESSON_READ,
  P.LESSON_WRITE,
  P.ASSIGNMENT_READ,
  P.ASSIGNMENT_WRITE,
  P.SUBMISSION_READ,
  P.SUBMISSION_GRADE,
  P.ASSESSMENT_READ,
  P.ASSESSMENT_WRITE,
  P.ASSESSMENT_GRADE,
  P.ENROLLMENT_READ,
  P.ENROLLMENT_WRITE,
  P.CALENDAR_READ,
  P.CALENDAR_WRITE,
  P.TUTORING_READ,
  P.TUTORING_MANAGE,
  P.EVENT_READ,
  P.EVENT_MANAGE,
  P.LIVE_READ,
  P.LIVE_MANAGE,
  P.MESSAGE_READ,
  P.MESSAGE_MODERATE,
  P.CONTENT_READ,
  P.CONTENT_WRITE,
  P.CONTENT_PUBLISH,
  P.CONTENT_MODERATE,
  P.ANALYTICS_READ,
  P.ANALYTICS_EXPORT,
  P.AI_USE,
  P.SUPPORT_READ,
  P.SUPPORT_WRITE,
  P.SUPPORT_ESCALATE,
  P.ADMIN_READ,
  P.ADMIN_WRITE,
  P.AUDIT_READ,
  P.SETTINGS_WRITE,
  P.INTEGRATION_READ,
];

const INSTITUTION_ADMIN_PERMISSIONS: readonly Permission[] = [
  ...SCHOOL_ADMIN_PERMISSIONS,
  P.ORGANIZATION_WRITE,
  P.ANALYTICS_EXPORT,
  P.BILLING_READ,
  P.INTEGRATION_WRITE,
];

const DISTRICT_ADMIN_PERMISSIONS: readonly Permission[] = [
  ...INSTITUTION_ADMIN_PERMISSIONS,
  P.USER_MANAGE_ROLES,
  P.ATTENDANCE_READ,
  P.ANALYTICS_READ,
  P.ANALYTICS_EXPORT,
];

const NATIONAL_ADMIN_PERMISSIONS: readonly Permission[] = [
  ...DISTRICT_ADMIN_PERMISSIONS,
  P.SEARCH_ADMIN,
  P.AI_ADMIN,
  P.FEATURE_FLAG_WRITE,
  P.BILLING_WRITE,
];

const CONTENT_MODERATOR_PERMISSIONS: readonly Permission[] = [
  P.USER_READ,
  P.ORGANIZATION_READ,
  P.CONTENT_READ,
  P.CONTENT_WRITE,
  P.CONTENT_PUBLISH,
  P.CONTENT_MODERATE,
  P.MESSAGE_READ,
  P.MESSAGE_MODERATE,
  P.COURSE_READ,
  P.LESSON_READ,
  P.ASSESSMENT_READ,
  P.ANALYTICS_READ,
  P.AUDIT_READ,
];

const SUPPORT_AGENT_PERMISSIONS: readonly Permission[] = [
  P.USER_READ,
  P.ORGANIZATION_READ,
  P.STUDENT_READ,
  P.COURSE_READ,
  P.MESSAGE_READ,
  P.MESSAGE_WRITE,
  P.SUPPORT_READ,
  P.SUPPORT_WRITE,
  P.SUPPORT_ESCALATE,
  P.ADMIN_READ,
  P.ANALYTICS_READ,
];

const FINANCE_PERMISSIONS: readonly Permission[] = [
  P.ORGANIZATION_READ,
  P.BILLING_READ,
  P.BILLING_WRITE,
  P.ANALYTICS_READ,
  P.ANALYTICS_EXPORT,
  P.AUDIT_READ,
  P.ADMIN_READ,
];

const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);

/**
 * Explicit permission matrix. A role with no entry has no permissions.
 * Wildcards are intentionally not supported: every grant is auditable.
 */
export const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  [ROLES.STUDENT]: STUDENT_PERMISSIONS,
  [ROLES.TEACHER]: TEACHER_PERMISSIONS,
  [ROLES.PARENT]: PARENT_PERMISSIONS,
  [ROLES.TUTOR]: TUTOR_PERMISSIONS,
  [ROLES.MENTOR]: MENTOR_PERMISSIONS,
  [ROLES.SCHOOL_ADMIN]: SCHOOL_ADMIN_PERMISSIONS,
  [ROLES.INSTITUTION_ADMIN]: INSTITUTION_ADMIN_PERMISSIONS,
  [ROLES.DISTRICT_ADMIN]: DISTRICT_ADMIN_PERMISSIONS,
  [ROLES.NATIONAL_ADMIN]: NATIONAL_ADMIN_PERMISSIONS,
  [ROLES.CONTENT_MODERATOR]: CONTENT_MODERATOR_PERMISSIONS,
  [ROLES.SUPPORT_AGENT]: SUPPORT_AGENT_PERMISSIONS,
  [ROLES.FINANCE]: FINANCE_PERMISSIONS,
  [ROLES.SUPER_ADMIN]: ALL_PERMISSIONS,
  // Legacy admin is institution-scoped, matching the existing semantics.
  [ROLES.ADMIN]: NATIONAL_ADMIN_PERMISSIONS,
};

export function permissionsForRole(role: string | undefined): readonly Permission[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(
  role: string | undefined,
  permission: Permission | readonly Permission[],
): boolean {
  const granted = permissionsForRole(role);
  const required = Array.isArray(permission) ? permission : [permission];
  return required.every((entry) => granted.includes(entry));
}

export function hasAnyPermission(
  role: string | undefined,
  permissions: readonly Permission[],
): boolean {
  const granted = permissionsForRole(role);
  return permissions.some((entry) => granted.includes(entry));
}

export function isPrivilegedRole(role: string | undefined): boolean {
  return typeof role === 'string' && PRIVILEGED_ROLES.includes(role);
}

export function isKnownRole(role: string | undefined): role is Role {
  return typeof role === 'string' && (ALL_ROLES as readonly string[]).includes(role);
}
