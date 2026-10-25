'use client';

import { useAuth } from '@edunet/auth';
import { Button, Card, CardHeader, CardContent } from '@edunet/ui';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface DashboardLink {
  title: string;
  description: string;
  href: string;
  action: string;
}

const LINKS_BY_ROLE: Record<string, DashboardLink[]> = {
  student: [
    {
      title: 'My Courses',
      description: 'Continue learning and track progress',
      href: '/my-courses',
      action: 'Open my courses',
    },
    {
      title: 'Course Catalog',
      description: 'Browse and enroll in available courses',
      href: '/courses',
      action: 'Browse courses',
    },
  ],
  teacher: [
    {
      title: 'Teacher Dashboard',
      description: 'Manage your courses and students',
      href: '/teacher',
      action: 'Open teaching',
    },
    {
      title: 'Create Course',
      description: 'Start a new course for your students',
      href: '/teacher/courses/new',
      action: 'Create course',
    },
  ],
  parent: [
    {
      title: 'Children',
      description: 'View linked children, courses and grades',
      href: '/parent',
      action: 'Open parent dashboard',
    },
  ],
  admin: [
    {
      title: 'Course Catalog',
      description: 'Review courses in your organization',
      href: '/courses',
      action: 'Browse courses',
    },
  ],
};

export default function DashboardPage() {
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();
  const links = user ? (LINKS_BY_ROLE[user.role] ?? []) : [];

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <h1 className="text-xl font-bold text-gray-900">EduNet Dashboard</h1>
            <div className="flex items-center gap-4">
              <span className="text-gray-700">
                {user.firstName} {user.lastName}
              </span>
              <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                {user.role}
              </span>
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {links.length === 0 ? (
          <Card>
            <CardContent>
              <p className="text-gray-600">
                No dashboard actions are available for the {user.role} role yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {links.map((link) => (
              <Card key={link.href}>
                <CardHeader>
                  <h2 className="text-lg font-semibold">{link.title}</h2>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">{link.description}</p>
                  <Link href={link.href} className="block">
                    <Button variant="primary" className="w-full">
                      {link.action}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card className="mt-6">
          <CardHeader>
            <h2 className="text-lg font-semibold">Welcome back, {user.firstName}!</h2>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">
              You are logged in as <strong>{user.email}</strong> with the role of{' '}
              <strong>{user.role}</strong>.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
