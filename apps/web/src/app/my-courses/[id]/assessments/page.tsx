'use client';

import { apiUrl } from '@/lib/api-url';

import { useEffect, useState } from 'react';
import { useAuth } from '@edunet/auth';
import { Button, Card, CardHeader, CardContent } from '@edunet/ui';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Quiz {
  id: string;
  title: string;
  description: string;
  timeLimit: string;
  passingScore: string;
  maxAttempts: string;
}

interface QuizAttempt {
  id: string;
  quizId: string;
  score: string;
  passed: string;
  submittedAt: string;
}

export default function CourseAssessmentsPage() {
  const { user, token } = useAuth();
  const params = useParams();
  const courseId = params.id as string;

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !token || !courseId) return;

    const fetchData = async () => {
      try {
        const quizzesRes = await fetch(
          apiUrl(`/api/assessments/quizzes?courseId=${courseId}`),
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (quizzesRes.ok) {
          setQuizzes(await quizzesRes.json());
        }

        const attemptsRes = await fetch(
          apiUrl(`/api/assessments/quiz-attempts?studentId=${user.id}`),
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (attemptsRes.ok) {
          setAttempts(await attemptsRes.json());
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, token, courseId]);

  const getAttemptForQuiz = (quizId: string) => {
    return attempts.filter((a) => a.quizId === quizId);
  };

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center"><p>Please log in</p></div>;
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p>Loading...</p></div>;
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <Link href={`/my-courses/${courseId}`}>
          <Button variant="secondary" className="mb-6">&larr; Back to Course</Button>
        </Link>

        <h1 className="text-3xl font-bold mb-6">Assessments</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {quizzes.length === 0 ? (
          <div className="text-center py-12 border rounded-lg">
            <p className="text-gray-600">No assessments available</p>
          </div>
        ) : (
          <div className="space-y-4">
            {quizzes.map((quiz) => {
              const quizAttempts = getAttemptForQuiz(quiz.id);
              const maxAttempts = quiz.maxAttempts ? parseInt(quiz.maxAttempts) : null;
              const canAttempt = !maxAttempts || quizAttempts.length < maxAttempts;

              return (
                <Card key={quiz.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-xl font-semibold">{quiz.title}</h2>
                        <p className="text-gray-600 mt-1">{quiz.description}</p>
                      </div>
                      {canAttempt ? (
                        <Link href={`/my-courses/${courseId}/assessments/${quiz.id}`}>
                          <Button variant="primary" size="sm">Start Quiz</Button>
                        </Link>
                      ) : (
                        <span className="text-sm text-gray-500">Max attempts reached</span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-4 text-sm text-gray-500">
                      {quiz.timeLimit && <span>Time Limit: {quiz.timeLimit}</span>}
                      {quiz.passingScore && <span>Passing Score: {quiz.passingScore}%</span>}
                      <span>Attempts: {quizAttempts.length}{maxAttempts ? ` / ${maxAttempts}` : ''}</span>
                    </div>
                    {quizAttempts.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <h3 className="font-semibold text-sm">Previous Attempts</h3>
                        {quizAttempts.map((attempt) => (
                          <div key={attempt.id} className="flex justify-between items-center text-sm bg-gray-50 p-2 rounded">
                            <span>Score: {attempt.score}</span>
                            <span className={attempt.passed === 'true' ? 'text-green-600' : 'text-red-600'}>
                              {attempt.passed === 'true' ? 'Passed' : 'Failed'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
