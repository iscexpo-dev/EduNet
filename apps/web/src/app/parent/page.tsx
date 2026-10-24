'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@edunet/auth';
import { Button, Card, CardContent, CardHeader, EmptyState } from '@edunet/ui';
import { apiUrl } from '@/lib/api-url';

interface Child {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  organizationId: string;
}

interface Enrollment {
  enrollmentId: string;
  courseId: string;
  enrolledAt: string;
  status: string;
  courseTitle: string;
  courseSubject: string;
  courseGrade: string | null;
}

interface Submission {
  submissionId: string;
  assignmentId: string;
  submittedAt: string | null;
  grade: number | null;
  gradedAt: string | null;
  assignmentTitle: string;
  assignmentMaxPoints: number | null;
  assignmentDueDate: string | null;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

export default function ParentDashboardPage() {
  const { user, token, isLoading } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [childrenError, setChildrenError] = useState('');
  const [progressError, setProgressError] = useState('');

  const isParent = user?.role === 'parent';

  useEffect(() => {
    if (!token || !isParent) {
      setLoadingChildren(false);
      return;
    }

    let cancelled = false;

    async function loadChildren() {
      try {
        const response = await fetch(apiUrl('/api/parents/children'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error(
            response.status === 403
              ? 'You do not have permission to view these children.'
              : 'Unable to load your children.',
          );
        }
        const data = (await response.json()) as Child[];
        if (cancelled) return;
        setChildren(data);
        setSelectedChildId((current) => current || data[0]?.id || '');
      } catch (err) {
        if (!cancelled) {
          setChildrenError(err instanceof Error ? err.message : 'Unable to load your children.');
        }
      } finally {
        if (!cancelled) setLoadingChildren(false);
      }
    }

    loadChildren();
    return () => {
      cancelled = true;
    };
  }, [token, isParent]);

  useEffect(() => {
    if (!token || !selectedChildId) {
      setEnrollments([]);
      setSubmissions([]);
      return;
    }

    let cancelled = false;
    setLoadingProgress(true);
    setProgressError('');

    async function loadProgress() {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [enrollmentsResponse, submissionsResponse] = await Promise.all([
          fetch(apiUrl(`/api/parents/children/${selectedChildId}/enrollments`), { headers }),
          fetch(apiUrl(`/api/parents/children/${selectedChildId}/submissions`), { headers }),
        ]);

        if (!enrollmentsResponse.ok) {
          throw new Error(
            enrollmentsResponse.status === 403
              ? 'You are not authorized to view this child.'
              : 'Unable to load course progress.',
          );
        }
        if (!submissionsResponse.ok) {
          throw new Error(
            submissionsResponse.status === 403
              ? 'You are not authorized to view this child\'s grades.'
              : 'Unable to load grades.',
          );
        }

        const [enrollmentData, submissionData] = await Promise.all([
          enrollmentsResponse.json() as Promise<Enrollment[]>,
          submissionsResponse.json() as Promise<Submission[]>,
        ]);
        if (cancelled) return;
        setEnrollments(enrollmentData);
        setSubmissions(submissionData);
      } catch (err) {
        if (!cancelled) {
          setProgressError(err instanceof Error ? err.message : 'Unable to load progress.');
        }
      } finally {
        if (!cancelled) setLoadingProgress(false);
      }
    }

    loadProgress();
    return () => {
      cancelled = true;
    };
  }, [token, selectedChildId]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-700">Please log in to view your children.</p>
        <Link href="/login">
          <Button>Go to login</Button>
        </Link>
      </div>
    );
  }

  if (!isParent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <EmptyState
          title="Parent access only"
          description="This dashboard is available to accounts with the parent role."
          action={
            <Link href="/dashboard">
              <Button variant="secondary">Back to dashboard</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const selectedChild = children.find((child) => child.id === selectedChildId);
  const graded = submissions.filter(
    (submission) => submission.grade !== null && (submission.assignmentMaxPoints ?? 0) > 0,
  );
  const averagePercent = graded.length
    ? Math.round(
        graded.reduce(
          (total, submission) =>
            total + (submission.grade! / (submission.assignmentMaxPoints ?? 1)) * 100,
          0,
        ) / graded.length,
      )
    : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <nav className="bg-white dark:bg-gray-900 shadow-sm border-b dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Parent Dashboard</h1>
          <Link href="/dashboard">
            <Button variant="secondary" size="sm">
              Back to dashboard
            </Button>
          </Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {loadingChildren ? (
          <p className="text-gray-600 dark:text-gray-300">Loading your children…</p>
        ) : childrenError ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            {childrenError}
          </div>
        ) : children.length === 0 ? (
          <EmptyState
            title="No linked children"
            description="Ask your school administrator to link your parent account to your child's account."
          />
        ) : (
          <>
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Children</h2>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2" role="list" aria-label="Linked children">
                  {children.map((child) => (
                    <Button
                      key={child.id}
                      variant={child.id === selectedChildId ? 'primary' : 'outline'}
                      onClick={() => setSelectedChildId(child.id)}
                      aria-pressed={child.id === selectedChildId}
                    >
                      {child.firstName} {child.lastName}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {selectedChild && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardContent>
                    <p className="text-sm text-gray-500">Courses</p>
                    <p className="text-2xl font-semibold">{enrollments.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent>
                    <p className="text-sm text-gray-500">Graded assignments</p>
                    <p className="text-2xl font-semibold">{graded.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent>
                    <p className="text-sm text-gray-500">Average grade</p>
                    <p className="text-2xl font-semibold">
                      {averagePercent === null ? '—' : `${averagePercent}%`}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {progressError && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                {progressError}
              </div>
            )}

            {loadingProgress ? (
              <p className="text-gray-600 dark:text-gray-300">Loading progress…</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <h2 className="text-lg font-semibold">Courses</h2>
                  </CardHeader>
                  <CardContent>
                    {enrollments.length === 0 ? (
                      <EmptyState title="No enrolments yet" description="This child has not enrolled in a course." />
                    ) : (
                      <ul className="divide-y dark:divide-gray-800">
                        {enrollments.map((enrollment) => (
                          <li key={enrollment.enrollmentId} className="py-3">
                            <p className="font-medium text-gray-900 dark:text-gray-100">
                              {enrollment.courseTitle}
                            </p>
                            <p className="text-sm text-gray-500">
                              {enrollment.courseSubject} · {enrollment.status} · enrolled{' '}
                              {formatDate(enrollment.enrolledAt)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <h2 className="text-lg font-semibold">Assignments and grades</h2>
                  </CardHeader>
                  <CardContent>
                    {submissions.length === 0 ? (
                      <EmptyState
                        title="No submissions yet"
                        description="Submitted assignments and grades will appear here."
                      />
                    ) : (
                      <ul className="divide-y dark:divide-gray-800">
                        {submissions.map((submission) => (
                          <li key={submission.submissionId} className="py-3">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                  {submission.assignmentTitle}
                                </p>
                                <p className="text-sm text-gray-500">
                                  Submitted {formatDate(submission.submittedAt)} · due{' '}
                                  {formatDate(submission.assignmentDueDate)}
                                </p>
                              </div>
                              <span className="text-sm font-semibold whitespace-nowrap">
                                {submission.grade === null
                                  ? 'Not graded'
                                  : `${submission.grade} / ${submission.assignmentMaxPoints ?? '—'}`}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
