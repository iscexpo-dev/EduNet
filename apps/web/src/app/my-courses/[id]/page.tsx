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
}

interface Assignment {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  maxPoints: number;
}

interface Submission {
  id: string;
  assignmentId: string;
  content: string;
  grade?: number | null;
  submittedAt: string;
  gradedAt?: string;
}

export default function MyCourseDetailPage() {
  const { user, token } = useAuth();
  const params = useParams();
  const courseId = params.id as string;
  
  const [course, setCourse] = useState<Course | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [enrollment, setEnrollment] = useState<{status: string} | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !token || !courseId) return;

    const fetchCourseData = async () => {
      try {
        const courseResponse = await fetch(
          apiUrl(`/api/courses/${courseId}`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!courseResponse.ok) {
          throw new Error('Failed to fetch course');
        }

        const courseData = await courseResponse.json();
        setCourse(courseData);

        const assignmentsResponse = await fetch(
          apiUrl(`/api/assignments?courseId=${courseId}`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (assignmentsResponse.ok) {
          const assignmentsData = await assignmentsResponse.json();
          setAssignments(assignmentsData);
        }

        const submissionsResponse = await fetch(
          apiUrl(`/api/submissions?studentId=${user.id}`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (submissionsResponse.ok) {
          const submissionsData = await submissionsResponse.json();
          setSubmissions(submissionsData);
        }

        const enrollmentResponse = await fetch(
          apiUrl(`/api/enrollments?courseId=${courseId}&studentId=${user.id}`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (enrollmentResponse.ok) {
          const enrollmentData = await enrollmentResponse.json();
          if (Array.isArray(enrollmentData) && enrollmentData.length > 0) {
            setEnrollment(enrollmentData[0]);
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCourseData();
  }, [user, token, courseId]);

  const getSubmissionForAssignment = (assignmentId: string) => {
    return submissions.find(s => s.assignmentId === assignmentId);
  };

  const isEnrolled = enrollment !== null;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please log in to view course details</p>
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
        <Link href="/my-courses">
          <Button variant="secondary" className="mb-6">
            ← Back to My Courses
          </Button>
        </Link>

        <div className="border rounded-lg p-8 mb-8">
          <h1 className="text-3xl font-bold mb-4">{course.title}</h1>
          
          <div className="flex gap-4 mb-6 text-sm text-gray-500">
            <span>{course.subject}</span>
            {course.grade && <span>Grade {course.grade}</span>}
          </div>

          <p className="text-gray-700">{course.description}</p>
          {isEnrolled && (
            <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
              <p className="font-semibold">You are enrolled in this course</p>
              <p className="text-sm">Status: {enrollment.status}</p>
              <Link href={`/my-courses/${courseId}/learn`}>
                <Button variant="primary" className="mt-4">
                  Start Learning
                </Button>
              </Link>
            </div>
          )}
        </div>

        <div className="border rounded-lg p-8">
          <h2 className="text-2xl font-bold mb-6">Assignments</h2>

          {assignments.length === 0 ? (
            <p className="text-gray-600">No assignments available yet</p>
          ) : (
            <div className="space-y-4">
              {assignments.map((assignment) => {
                const submission = getSubmissionForAssignment(assignment.id);
                const isSubmitted = submission !== undefined;
                const isGraded = submission?.grade != null;

                return (
                  <div key={assignment.id} className="border rounded-lg p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">{assignment.title}</h3>
                        <p className="text-gray-600 text-sm mt-1">{assignment.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">Due: {new Date(assignment.dueDate).toLocaleDateString()}</p>
                        <p className="text-sm text-gray-500">Max Points: {assignment.maxPoints}</p>
                      </div>
                    </div>

                    {isGraded ? (
                      <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                        <p className="font-semibold">Grade: {submission.grade} / {assignment.maxPoints}</p>
                        <p className="text-sm">Graded on: {new Date(submission.gradedAt!).toLocaleDateString()}</p>
                      </div>
                    ) : isSubmitted ? (
                      <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded">
                        <p className="font-semibold">Submitted</p>
                        <p className="text-sm">Submitted on: {new Date(submission.submittedAt).toLocaleDateString()}</p>
                        <p className="text-sm">Awaiting grading</p>
                      </div>
                    ) : (
                      isEnrolled ? (
                        <Link href={`/my-courses/${courseId}/assignments/${assignment.id}`}>
                          <Button variant="primary" size="sm">Open Assignment</Button>
                        </Link>
                      ) : <p className="text-sm text-gray-500">Enroll in this course to submit the assignment.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
