import { z } from 'zod';

// User validation schemas
export const userSchema = z.object({
  email: z.string().email(),
  phoneNumber: z.string().optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum([
    'student',
    'teacher',
    'parent',
    'tutor',
    'mentor',
    'school_admin',
    'institution_admin',
    'district_admin',
    'national_admin',
    'content_moderator',
    'support_agent',
    'finance',
    'super_admin',
    'admin',
  ]),
  organizationId: z.string().uuid(),
  avatarUrl: z.string().url().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum(['student', 'teacher', 'parent', 'tutor']),
  organizationCode: z.string().min(1),
});

// Organization validation schemas
export const organizationSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['school', 'district', 'university', 'training_center']),
  code: z.string().min(1).max(50),
  address: z.string().optional(),
});

// Course validation schemas
export const courseSchema = z.object({
  organizationId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  subject: z.string().min(1).max(100),
  grade: z.string().optional(),
  teacherId: z.string().uuid(),
});

// Assignment validation schemas
export const assignmentSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  dueDate: z.string().datetime(),
  maxPoints: z.number().int().min(0).max(100000),
  // Late/resubmission policy
  latePolicy: z.enum(['accept', 'penalized', 'locked']).default('accept'),
  latePenaltyPercent: z.number().int().min(0).max(100).default(0),
  allowResubmission: z.boolean().default(false),
  resubmissionDeadline: z.string().datetime().optional(),
});

export const assignmentUpdateSchema = assignmentSchema.partial();

export const submissionSchema = z.object({
  assignmentId: z.string().uuid(),
  content: z.string().trim().min(1).max(50000),
});

// Assessment validation schemas
export const assessmentSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().min(1).max(200),
  type: z.enum(['quiz', 'exam', 'survey']),
  questions: z.array(
    z.object({
      type: z.enum(['multiple_choice', 'true_false', 'short_answer', 'essay']),
      text: z.string().min(1).max(1000),
      options: z.array(z.string()).optional(),
      correctAnswer: z.string().optional(),
      points: z.number().min(0),
    })
  ),
  timeLimit: z.number().optional(),
  attemptsAllowed: z.number().min(1),
});

// Tutoring validation schemas
export const tutoringSessionSchema = z.object({
  tutorId: z.string().uuid(),
  studentId: z.string().uuid(),
  subject: z.string().min(1).max(100),
  scheduledAt: z.string().datetime(),
  duration: z.number().min(15).max(180),
});

// Booking validation schemas
export const bookingSchema = z.object({
  type: z.enum(['workshop', 'club', 'event']),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  scheduledAt: z.string().datetime(),
  capacity: z.number().min(1),
});

// Identity extension schemas
export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(16).max(200),
  password: z.string().min(8).max(128),
});

export const verificationRequestSchema = z.object({
  kind: z.enum(['email_verification', 'phone_verification']),
});

export const tokenConfirmSchema = z.object({
  kind: z.enum(['email_verification', 'phone_verification']),
  token: z.string().min(16).max(200),
});
