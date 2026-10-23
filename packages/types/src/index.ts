// Core domain types for EduNet

export type UserRole =
  | 'student'
  | 'teacher'
  | 'parent'
  | 'tutor'
  | 'mentor'
  | 'school_admin'
  | 'institution_admin'
  | 'district_admin'
  | 'national_admin'
  | 'content_moderator'
  | 'support_agent'
  | 'finance'
  | 'super_admin'
  | 'admin';

export type OrganizationType = 'school' | 'district' | 'university' | 'training_center';

export interface User {
  id: string;
  email: string;
  phoneNumber?: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  organizationId: string;
  avatarUrl?: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Organization {
  id: string;
  name: string;
  type: OrganizationType;
  code: string;
  address?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Course {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  subject: string;
  grade?: string;
  teacherId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Enrollment {
  id: string;
  studentId: string;
  courseId: string;
  enrolledAt: Date;
  status: 'active' | 'completed' | 'dropped';
}

export interface Assignment {
  id: string;
  courseId: string;
  title: string;
  description: string;
  dueDate: Date;
  maxPoints: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  content: string;
  submittedAt: Date;
  grade?: number;
  gradedAt?: Date;
  gradedBy?: string;
}

export interface Assessment {
  id: string;
  courseId: string;
  title: string;
  type: 'quiz' | 'exam' | 'survey';
  questions: Question[];
  timeLimit?: number;
  attemptsAllowed: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Question {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer' | 'essay';
  text: string;
  options?: string[];
  correctAnswer?: string;
  points: number;
}

export interface AssessmentResult {
  id: string;
  assessmentId: string;
  studentId: string;
  answers: Answer[];
  score: number;
  completedAt: Date;
}

export interface Answer {
  questionId: string;
  value: string;
}

export interface TutoringSession {
  id: string;
  tutorId: string;
  studentId: string;
  subject: string;
  scheduledAt: Date;
  duration: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
}

export interface Booking {
  id: string;
  userId: string;
  type: 'workshop' | 'club' | 'event';
  title: string;
  description: string;
  scheduledAt: Date;
  capacity: number;
  enrolled: number;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  courseId?: string;
  content: string;
  sentAt: Date;
  readAt?: Date;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'assignment' | 'grade' | 'message' | 'announcement' | 'reminder';
  title: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
}

export interface AnalyticsEvent {
  id: string;
  userId: string;
  eventType: string;
  properties: Record<string, unknown>;
  timestamp: Date;
}
