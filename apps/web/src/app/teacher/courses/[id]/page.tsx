'use client';

import { apiUrl } from '@/lib/api-url';

import { useEffect, useState } from 'react';
import { useAuth } from '@edunet/auth';
import { Button } from '@edunet/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Course {
  id: string;
  title: string;
  description: string;
  subject: string;
  grade?: string;
  enrollmentCount?: number;
}

interface Enrollment {
  id: string;
  studentId: string;
  courseId: string;
  enrolledAt: string;
  status: string;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface Assignment {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  maxPoints: number;
  submissionCount?: number;
}

export default function TeacherCourseDetailPage() {
  const { user, token } = useAuth();
  const params = useParams();
  const courseId = params.id as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !token || !courseId) return;

    const fetchCourseData = async () => {
      try {
        const courseResponse = await fetch(apiUrl(`/api/courses/${courseId}`), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!courseResponse.ok) {
          throw new Error('Failed to fetch course');
        }

        const courseData = await courseResponse.json();
        setCourse(courseData);

        const enrollmentsResponse = await fetch(apiUrl(`/api/enrollments?courseId=${courseId}`), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (enrollmentsResponse.ok) {
          const enrollmentsData = await enrollmentsResponse.json();
          setEnrollments(enrollmentsData);
        }

        const assignmentsResponse = await fetch(apiUrl(`/api/assignments?courseId=${courseId}`), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (assignmentsResponse.ok) {
          const assignmentsData: Assignment[] = await assignmentsResponse.json();
          const withCounts = await Promise.all(
            assignmentsData.map(async (assignment) => {
              const response = await fetch(apiUrl(`/api/assignments/${assignment.id}`), {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!response.ok) return assignment;
              const detail = await response.json();
              return { ...assignment, submissionCount: detail.submissionCount };
            })
          );
          setAssignments(withCounts);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCourseData();
  }, [user, token, courseId]);

  if (!user || user.role !== 'teacher') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Teacher access required</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading course...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-600">Error: {error}</p>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Course not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <Link href="/teacher">
          <Button variant="secondary" className="mb-6">
            ← Back to Dashboard
          </Button>
        </Link>

        <div className="border rounded-lg p-8 mb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">{course.title}</h1>
              <div className="flex gap-4 text-sm text-gray-500">
                <span>{course.subject}</span>
                {course.grade && <span>Grade {course.grade}</span>}
                <span>{course.enrollmentCount || 0} students enrolled</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href={`/teacher/courses/${courseId}/analytics`}>
                <Button variant="secondary">Analytics</Button>
              </Link>
              <Link href={`/teacher/courses/${courseId}/lessons`}>
                <Button variant="secondary">Manage Content</Button>
              </Link>
              <Link href={`/teacher/courses/${courseId}/assignments/new`}>
                <Button variant="primary">Create Assignment</Button>
              </Link>
            </div>
          </div>
          <p className="text-gray-700">{course.description}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Enrolled Students ({enrollments.length})</h2>

            {enrollments.length === 0 ? (
              <p className="text-gray-600">No students enrolled yet</p>
            ) : (
              <div className="space-y-3">
                {enrollments.map((enrollment) => (
                  <div
                    key={enrollment.id}
                    className="flex justify-between items-center p-3 bg-gray-50 rounded"
                  >
                    <div>
                      <p className="font-medium">
                        {enrollment.student.firstName} {enrollment.student.lastName}
                      </p>
                      <p className="text-sm text-gray-500">{enrollment.student.email}</p>
                    </div>
                    <span className="text-sm px-2 py-1 rounded bg-green-100 text-green-700">
                      {enrollment.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Assignments ({assignments.length})</h2>

            {assignments.length === 0 ? (
              <p className="text-gray-600">No assignments created yet</p>
            ) : (
              <div className="space-y-3">
                {assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="flex justify-between items-center p-3 bg-gray-50 rounded"
                  >
                    <div>
                      <p className="font-medium">{assignment.title}</p>
                      <p className="text-sm text-gray-500">
                        Due: {new Date(assignment.dueDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm text-gray-500">{assignment.maxPoints} pts</p>
                        <p className="text-sm text-gray-500">
                          {assignment.submissionCount || 0} submissions
                        </p>
                      </div>
                      <Link href={`/teacher/courses/${courseId}/assignments/${assignment.id}`}>
                        <Button variant="secondary">Review submissions</Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
