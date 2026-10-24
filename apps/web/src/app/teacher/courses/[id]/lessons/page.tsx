'use client';

import { apiUrl } from '@/lib/api-url';

import { useEffect, useState } from 'react';
import { useAuth } from '@edunet/auth';
import { Button } from '@edunet/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Lesson {
  id: string;
  title: string;
  description: string;
  type: string;
  order: string;
  duration?: string;
  isPublished: string;
}

export default function CourseLessonsPage() {
  const { user, token } = useAuth();
  const params = useParams();
  const courseId = params.id as string;
  
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !token || !courseId) return;

    const fetchLessons = async () => {
      try {
        const response = await fetch(
          apiUrl(`/api/content/lessons?courseId=${courseId}`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch lessons');
        }

        const data = await response.json();
        setLessons(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchLessons();
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
        <p>Loading lessons...</p>
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

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <Link href={`/teacher/courses/${courseId}`}>
            <Button variant="secondary">← Back to Course</Button>
          </Link>
          <Link href={`/teacher/courses/${courseId}/lessons/new`}>
            <Button variant="primary">Create Lesson</Button>
          </Link>
        </div>

        <h1 className="text-3xl font-bold mb-6">Course Content</h1>

        {lessons.length === 0 ? (
          <div className="text-center py-12 border rounded-lg">
            <p className="text-gray-600 mb-4">No lessons created yet</p>
            <Link href={`/teacher/courses/${courseId}/lessons/new`}>
              <Button variant="primary">Create Your First Lesson</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {lessons.map((lesson, index) => (
              <div key={lesson.id} className="border rounded-lg p-6 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{lesson.title}</h3>
                    <p className="text-sm text-gray-500">
                      {lesson.type} {lesson.duration && `• ${lesson.duration}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-sm px-2 py-1 rounded ${
                    lesson.isPublished === 'true' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {lesson.isPublished === 'true' ? 'Published' : 'Draft'}
                  </span>
                  <Link href={`/teacher/courses/${courseId}/lessons/${lesson.id}`}>
                    <Button variant="secondary" size="sm">Edit</Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
