'use client';

import { apiUrl } from '@/lib/api-url';

import { useEffect, useState } from 'react';
import { useAuth } from '@edunet/auth';
import { Button } from '@edunet/ui';
import Link from 'next/link';

interface Course {
  id: string;
  title: string;
  description: string;
  subject: string;
  grade?: string;
  teacherId: string;
  enrollmentCount?: number;
}

export default function CoursesPage() {
  const { user, token } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !token) return;

    const fetchCourses = async () => {
      try {
        const response = await fetch(apiUrl(`/api/courses?organizationId=${user.organizationId}`), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch courses');
        }

        const data = await response.json();
        setCourses(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, [user, token]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please log in to view courses</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading courses...</p>
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
          <h1 className="text-3xl font-bold">Course Catalog</h1>
          <Link href="/dashboard">
            <Button variant="secondary">Back to Dashboard</Button>
          </Link>
        </div>

        {courses.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">No courses available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <div
                key={course.id}
                className="border rounded-lg p-6 hover:shadow-lg transition-shadow"
              >
                <h2 className="text-xl font-semibold mb-2">{course.title}</h2>
                <p className="text-gray-600 mb-4 line-clamp-3">{course.description}</p>
                <div className="flex justify-between items-center text-sm text-gray-500 mb-4">
                  <span>{course.subject}</span>
                  {course.grade && <span>Grade {course.grade}</span>}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">
                    {course.enrollmentCount || 0} enrolled
                  </span>
                  <Link href={`/courses/${course.id}`}>
                    <Button variant="primary" size="sm">
                      View Details
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
