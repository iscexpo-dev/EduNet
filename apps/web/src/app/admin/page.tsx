'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@edunet/auth';
import { Button, Card, CardContent, CardHeader, EmptyState } from '@edunet/ui';
import { apiUrl } from '@/lib/api-url';

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId: string;
  isVerified: boolean;
}

interface AdminOrganization {
  id: string;
  name: string;
  type: string;
  code: string;
  isActive: boolean;
}

interface AdminAuditEvent {
  id?: string;
  userId: string | null;
  organizationId: string | null;
  eventType: string;
  outcome: string;
  createdAt?: string;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

export default function AdminDashboardPage() {
  const { user, token, isLoading } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [organizations, setOrganizations] = useState<AdminOrganization[]>([]);
  const [auditEvents, setAuditEvents] = useState<AdminAuditEvent[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingOrganizations, setLoadingOrganizations] = useState(true);
  const [loadingAuditEvents, setLoadingAuditEvents] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [organizationsError, setOrganizationsError] = useState('');
  const [auditEventsError, setAuditEventsError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => {
    if (!token || !isAdmin) {
      setLoadingUsers(false);
      setLoadingOrganizations(false);
      setLoadingAuditEvents(false);
      return;
    }

    let cancelled = false;

    async function loadUsers() {
      try {
        const response = await fetch(apiUrl('/api/users'), { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('Unable to load users.');
        const data = (await response.json()) as AdminUser[];
        if (!cancelled) setUsers(data);
      } catch (error) {
        if (!cancelled) setUsersError(error instanceof Error ? error.message : 'Unable to load users.');
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    }

    async function loadOrganizations() {
      try {
        const response = await fetch(apiUrl('/api/organizations'), { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('Unable to load organizations.');
        const data = (await response.json()) as AdminOrganization[];
        if (!cancelled) setOrganizations(data);
      } catch (error) {
        if (!cancelled) setOrganizationsError(error instanceof Error ? error.message : 'Unable to load organizations.');
      } finally {
        if (!cancelled) setLoadingOrganizations(false);
      }
    }

    async function loadAuditEvents() {
      try {
        const response = await fetch(apiUrl('/api/auth/audit-events?limit=50&offset=0'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Unable to load audit events.');
        const data = (await response.json()) as AdminAuditEvent[];
        if (!cancelled) setAuditEvents(data);
      } catch (error) {
        if (!cancelled) setAuditEventsError(error instanceof Error ? error.message : 'Unable to load audit events.');
      } finally {
        if (!cancelled) setLoadingAuditEvents(false);
      }
    }

    void loadUsers();
    void loadOrganizations();
    void loadAuditEvents();
    return () => {
      cancelled = true;
    };
  }, [token, isAdmin]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading…</p>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <EmptyState
          title="Admin access only"
          description="This console is available to accounts with the admin role."
          action={
            <Link href="/dashboard">
              <Button variant="secondary">Back to dashboard</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const performVerify = async (userId: string) => {
    setActionError('');
    setActionMessage('');
    try {
      const response = await fetch(apiUrl(`/api/users/${userId}/verify`), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Unable to verify user.');
      }
      setActionMessage('User verified.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to verify user.');
    }
  };

  const performDelete = async (userId: string) => {
    setActionError('');
    setActionMessage('');
    try {
      const response = await fetch(apiUrl(`/api/users/${userId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Unable to delete user.');
      }
      setActionMessage('User deleted.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to delete user.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:text-gray-900"
      >
        Skip to content
      </a>
      <nav className="bg-white dark:bg-gray-900 shadow-sm border-b dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Admin Console</h1>
          <Link href="/dashboard">
            <Button variant="secondary" size="sm">
              Back to dashboard
            </Button>
          </Link>
        </div>
      </nav>

      <main id="admin-main" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {actionMessage ? <p className="text-sm text-green-700">{actionMessage}</p> : null}
        {actionError ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{actionError}</div> : null}

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Users</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingUsers ? <p className="text-gray-600">Loading users…</p> : usersError ? (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{usersError}</div>
            ) : users.length === 0 ? (
              <EmptyState title="No users found" description="No user records are available for this organization." />
            ) : (
              <ul className="space-y-2">
                {users.map((user) => (
                  <li key={user.id} className="rounded-lg border border-neutral-200 p-3">
                    <p className="font-medium text-gray-900">
                      {user.firstName} {user.lastName} <span className="text-gray-500">({user.role})</span>
                    </p>
                    <p className="text-sm text-gray-600">{user.email}</p>
                    <p className="text-xs text-gray-500">Verified: {user.isVerified ? 'yes' : 'no'}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {!user.isVerified ? (
                        <Button variant="outline" size="sm" onClick={() => void performVerify(user.id)}>
                          Verify
                        </Button>
                      ) : null}
                      <Button variant="secondary" size="sm" onClick={() => void performDelete(user.id)}>
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Organizations</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingOrganizations ? <p className="text-gray-600">Loading organizations…</p> : organizationsError ? (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{organizationsError}</div>
            ) : organizations.length === 0 ? (
              <EmptyState title="No organizations found" description="No organization records are available." />
            ) : (
              <ul className="space-y-2">
                {organizations.map((organization) => (
                  <li key={organization.id} className="rounded-lg border border-neutral-200 p-3">
                    <p className="font-medium text-gray-900">{organization.name}</p>
                    <p className="text-sm text-gray-600">Code: {organization.code}</p>
                    <p className="text-sm text-gray-600">Type: {organization.type}</p>
                    <p className="text-sm text-gray-600">Active: {organization.isActive ? 'yes' : 'no'}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Audit Events</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingAuditEvents ? <p className="text-gray-600">Loading audit events…</p> : auditEventsError ? (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{auditEventsError}</div>
            ) : auditEvents.length === 0 ? (
              <EmptyState title="No audit events found" description="No identity audit events are available." />
            ) : (
              <ul className="space-y-2">
                {auditEvents.map((event, index) => (
                  <li key={event.id ?? `${event.eventType}-${index}`} className="rounded-lg border border-neutral-200 p-3">
                    <p className="font-medium text-gray-900">{event.eventType}</p>
                    <p className="text-sm text-gray-600">Outcome: {event.outcome}</p>
                    <p className="text-sm text-gray-600">User: {event.userId ?? '—'}</p>
                    <p className="text-sm text-gray-600">Organization: {event.organizationId ?? '—'}</p>
                    <p className="text-sm text-gray-600">At: {formatDate(event.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
