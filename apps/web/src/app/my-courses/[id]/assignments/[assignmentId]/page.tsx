'use client';

import { apiUrl } from '@/lib/api-url';

import { useEffect, useState } from 'react';
import { useAuth } from '@edunet/auth';
import { Button, Card, CardHeader, CardContent } from '@edunet/ui';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Assignment {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  maxPoints: number;
}

interface Submission {
  id: string;
  content: string;
  submittedAt: string;
  grade?: number | null;
  feedback?: string;
}

export default function AssignmentSubmissionPage() {
  const { user, token } = useAuth();
  const params = useParams();
  const { id: courseId, assignmentId } = params;

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !token || !assignmentId) return;

    const fetchData = async () => {
      try {
        const assignmentRes = await fetch(
          apiUrl(`/api/assignments/${assignmentId}`),
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (assignmentRes.ok) {
          setAssignment(await assignmentRes.json());
        }

        const submissionRes = await fetch(
          apiUrl(`/api/submissions?assignmentId=${assignmentId}&studentId=${user.id}`),
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (submissionRes.ok) {
          const data = await submissionRes.json();
          if (data.length > 0) {
            setSubmission(data[0]);
            setContent(data[0].content);
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, token, assignmentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !token) return;

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(apiUrl('/api/submissions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          assignmentId,
          studentId: user.id,
          content,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit');
      }

      const data = await response.json();
      setSubmission(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center"><p>Please log in</p></div>;
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p>Loading...</p></div>;
  }

  if (!assignment) {
    return <div className="min-h-screen flex items-center justify-center"><p>Assignment not found</p></div>;
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <Link href={`/my-courses/${courseId}`}>
          <Button variant="secondary" className="mb-6">&larr; Back to Course</Button>
        </Link>

        <Card>
          <CardHeader>
            <h1 className="text-2xl font-bold">{assignment.title}</h1>
            <p className="text-gray-600 mt-2">{assignment.description}</p>
            <div className="flex gap-4 mt-4 text-sm text-gray-500">
              <span>Due: {new Date(assignment.dueDate).toLocaleDateString()}</span>
              <span>Max Points: {assignment.maxPoints}</span>
            </div>
          </CardHeader>
          <CardContent>
            {submission ? (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                  <p className="font-semibold">Submitted</p>
                  <p className="text-sm">Submitted on: {new Date(submission.submittedAt).toLocaleDateString()}</p>
                </div>
                {submission.grade != null && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded">
                    <p className="font-semibold">Grade: {submission.grade} / {assignment.maxPoints}</p>
                    {submission.feedback && <p className="text-sm mt-2">Feedback: {submission.feedback}</p>}
                  </div>
                )}
                <div>
                  <h3 className="font-semibold mb-2">Your Submission</h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="whitespace-pre-wrap">{submission.content}</p>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                    {error}
                  </div>
                )}
                <div>
                  <label htmlFor="submission-answer" className="block text-sm font-medium mb-2">Your Answer</label>
                  <textarea
                    id="submission-answer"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    required
                    rows={10}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter your answer here..."
                  />
                </div>
                <Button type="submit" variant="primary" isLoading={submitting} className="w-full">
                  Submit Assignment
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
