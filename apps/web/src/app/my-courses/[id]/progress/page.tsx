'use client';

import { apiUrl } from '@/lib/api-url';

import { useEffect, useState } from 'react';
import { useAuth } from '@edunet/auth';
import { Button, Card, CardHeader, CardContent } from '@edunet/ui';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Lesson {
  id: string;
  title: string;
  type: string;
  isPublished: string;
}

interface LessonProgress {
  id: string;
  lessonId: string;
  status: string;
  progress: string;
  completedAt?: string;
}

interface Assignment {
  id: string;
  title: string;
  dueDate: string;
  maxPoints: number;
}

interface Submission {
  id: string;
  assignmentId: string;
  grade?: number;
  submittedAt: string;
}

export default function CourseProgressPage() {
  const { user, token } = useAuth();
  const params = useParams();
  const courseId = params.id as string;

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<LessonProgress[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !token || !courseId) return;

    const fetchData = async () => {
      try {
        const lessonsRes = await fetch(apiUrl(`/api/content/lessons?courseId=${courseId}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (lessonsRes.ok) setLessons(await lessonsRes.json());

        const progressRes = await fetch(
          apiUrl(`/api/content/lesson-progress?studentId=${user.id}`),
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (progressRes.ok) setProgress(await progressRes.json());

        const assignmentsRes = await fetch(apiUrl(`/api/assignments?courseId=${courseId}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (assignmentsRes.ok) setAssignments(await assignmentsRes.json());

        const submissionsRes = await fetch(apiUrl(`/api/submissions?studentId=${user.id}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (submissionsRes.ok) setSubmissions(await submissionsRes.json());
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, token, courseId]);

  const getProgressForLesson = (lessonId: string) => {
    return progress.find((p) => p.lessonId === lessonId);
  };

  const getSubmissionForAssignment = (assignmentId: string) => {
    return submissions.find((s) => s.assignmentId === assignmentId);
  };

  const completedLessons = progress.filter((p) => p.status === 'completed').length;
  const totalPoints = submissions.reduce((sum, s) => sum + (s.grade || 0), 0);
  const maxPoints = assignments.reduce((sum, a) => sum + a.maxPoints, 0);
  const progressPercentage =
    lessons.length > 0 ? Math.round((completedLessons / lessons.length) * 100) : 0;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please log in</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <Link href={`/my-courses/${courseId}`}>
          <Button variant="secondary" className="mb-6">
            &larr; Back to Course
          </Button>
        </Link>

        <h1 className="text-3xl font-bold mb-6">Course Progress</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Lessons Completed</p>
              <p className="text-2xl font-bold">
                {completedLessons} / {lessons.length}
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Total Points</p>
              <p className="text-2xl font-bold">
                {totalPoints} / {maxPoints}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Assignments Submitted</p>
              <p className="text-2xl font-bold">
                {submissions.length} / {assignments.length}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <h2 className="text-xl font-bold">Lessons</h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {lessons.map((lesson) => {
                  const lessonProgress = getProgressForLesson(lesson.id);
                  return (
                    <div
                      key={lesson.id}
                      className="flex justify-between items-center p-3 bg-gray-50 rounded"
                    >
                      <div>
                        <p className="font-medium">{lesson.title}</p>
                        <p className="text-sm text-gray-500">{lesson.type}</p>
                      </div>
                      <span
                        className={`text-sm px-2 py-1 rounded ${
                          lessonProgress?.status === 'completed'
                            ? 'bg-green-100 text-green-700'
                            : lessonProgress?.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {lessonProgress?.status || 'not_started'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-xl font-bold">Assignments</h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {assignments.map((assignment) => {
                  const submission = getSubmissionForAssignment(assignment.id);
                  return (
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
                      <div className="text-right">
                        {submission ? (
                          <>
                            <p className="text-sm font-medium">
                              {submission.grade || 'Pending'} / {assignment.maxPoints}
                            </p>
                            <p className="text-xs text-gray-500">Submitted</p>
                          </>
                        ) : (
                          <span className="text-sm text-gray-500">Not submitted</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
