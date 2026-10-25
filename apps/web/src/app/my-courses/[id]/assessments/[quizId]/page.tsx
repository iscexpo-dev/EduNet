'use client';

import { apiUrl } from '@/lib/api-url';

import { useEffect, useState } from 'react';
import { useAuth } from '@edunet/auth';
import { Button, Card, CardHeader, CardContent } from '@edunet/ui';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Question {
  id: string;
  type: string;
  text: string;
  points: string;
  options?: any;
}

interface Quiz {
  id: string;
  title: string;
  description: string;
  timeLimit: string;
}

export default function QuizTakingPage() {
  const { user, token } = useAuth();
  const params = useParams();
  const { id: courseId, quizId } = params;

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!user || !token || !quizId) return;

    const fetchQuiz = async () => {
      try {
        const quizRes = await fetch(apiUrl(`/api/assessments/quizzes/${quizId}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (quizRes.ok) {
          const quizData = await quizRes.json();
          setQuiz(quizData);

          const questionsRes = await fetch(apiUrl(`/api/assessments/questions?quizId=${quizId}`), {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (questionsRes.ok) {
            setQuestions(await questionsRes.json());
          }

          const attemptRes = await fetch(apiUrl('/api/assessments/quiz-attempts'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ quizId, studentId: user.id }),
          });
          if (attemptRes.ok) {
            const attemptData = await attemptRes.json();
            setAttemptId(attemptData.id);
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchQuiz();
  }, [user, token, quizId]);

  const handleSubmit = async () => {
    if (!user || !token || !attemptId) return;

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(apiUrl(`/api/assessments/quiz-attempts/${attemptId}/submit`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ answers }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit');
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

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

  if (result) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <h1 className="text-2xl font-bold">Quiz Result</h1>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <p className="text-4xl font-bold mb-2">{result.score}</p>
                <p
                  className={`text-xl ${result.passed === 'true' ? 'text-green-600' : 'text-red-600'}`}
                >
                  {result.passed === 'true' ? 'Passed' : 'Failed'}
                </p>
              </div>
              <Link href={`/my-courses/${courseId}/assessments`}>
                <Button variant="primary" className="w-full">
                  Back to Assessments
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <Link href={`/my-courses/${courseId}/assessments`}>
          <Button variant="secondary" className="mb-6">
            &larr; Back to Assessments
          </Button>
        </Link>

        <Card>
          <CardHeader>
            <h1 className="text-2xl font-bold">{quiz?.title}</h1>
            <p className="text-gray-600 mt-2">{quiz?.description}</p>
            {quiz?.timeLimit && (
              <p className="text-sm text-gray-500 mt-2">Time Limit: {quiz.timeLimit}</p>
            )}
          </CardHeader>
          <CardContent>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
                {error}
              </div>
            )}

            <div className="space-y-6">
              {questions.map((question, index) => (
                <div key={question.id} className="border rounded-lg p-4">
                  <p className="font-medium mb-3">
                    {index + 1}. {question.text}
                    <span className="text-sm text-gray-500 ml-2">({question.points} pts)</span>
                  </p>

                  {(question.type === 'multiple_choice' || question.type === 'true_false') &&
                  question.options ? (
                    <div className="space-y-2">
                      {question.options.map((option: any, i: number) => (
                        <label key={i} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={question.id}
                            value={option.text || option}
                            checked={answers[question.id] === (option.text || option)}
                            onChange={(e) =>
                              setAnswers({ ...answers, [question.id]: e.target.value })
                            }
                            className="w-4 h-4 text-blue-600"
                          />
                          <span>{option.text || option}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      value={answers[question.id] || ''}
                      onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter your answer..."
                    />
                  )}
                </div>
              ))}
            </div>

            <Button
              onClick={handleSubmit}
              variant="primary"
              isLoading={submitting}
              className="w-full mt-6"
            >
              Submit Quiz
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
