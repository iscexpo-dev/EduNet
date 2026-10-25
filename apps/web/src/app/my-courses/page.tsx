'use client';

import { apiUrl } from '@/lib/api-url';

import { useEffect, useState } from 'react';
import { useAuth } from '@edunet/auth';
import { Button } from '@edunet/ui';
import Link from 'next/link';

interface Enrollment {
  id: string;
  courseId: string;
  studentId: string;
  enrolledAt: string;
  status: string;
  course: {
    id: string;
    title: string;
    description: string;
    subject: string;
    grade?: string;
  };
}

export default function MyCoursesPage() {
  const { user, token } = useAuth();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !token) return;

    const fetchEnrollments = async () => {
      try {
        const response = await fetch(apiUrl(`/api/enrollments?studentId=${user.id}`), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch enrollments');
        }

        const data = await response.json();
        setEnrollments(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchEnrollments();
  }, [user, token]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please log in to view your courses</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading your courses...</p>
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
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">My Courses</h1>
          <div className="flex gap-4">
            <Link href="/courses">
              <Button variant="secondary">Browse Courses</Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="secondary">Dashboard</Button>
            </Link>
          </div>
        </div>

        {enrollments.length === 0 ? (
          <div className="text-center py-12 border rounded-lg">
            <p className="text-gray-600 mb-4">You are not enrolled in any courses yet</p>
            <Link href="/courses">
              <Button variant="primary">Browse Available Courses</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {enrollments.map((enrollment) => (
              <div
                key={enrollment.id}
                className="border rounded-lg p-6 hover:shadow-lg transition-shadow"
              >
                <h2 className="text-xl font-semibold mb-2">{enrollment.course.title}</h2>
                <p className="text-gray-600 mb-4 line-clamp-3">{enrollment.course.description}</p>
                <div className="flex justify-between items-center text-sm text-gray-500 mb-4">
                  <span>{enrollment.course.subject}</span>
                  {enrollment.course.grade && <span>Grade {enrollment.course.grade}</span>}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm px-2 py-1 rounded bg-green-100 text-green-700">
                    {enrollment.status}
                  </span>
                  <Link href={`/my-courses/${enrollment.courseId}`}>
                    <Button variant="primary" size="sm">
                      Continue
                    </Button>
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
