import { Router } from 'express';
import { authenticate, authorize, isPrivilegedRole } from '@edunet/rbac';
import {
  addLiveClassEventHandler,
  bookExtracurricularEventHandler,
  bookTutoringSessionHandler,
  cancelExtracurricularBookingHandler,
  cancelTutoringSessionHandler,
  createCalendarEventHandler,
  createExtracurricularEventHandler,
  createLiveClassHandler,
  createTutorAvailabilityHandler,
  deleteCalendarEventHandler,
  deleteTutorAvailabilityHandler,
  exportCalendarHandler,
  getCalendarEventHandler,
  getLiveClassAnalyticsHandler,
  getLiveClassHandler,
  joinLiveClassHandler,
  leaveLiveClassHandler,
  listCalendarHandler,
  listEventAttendeesHandler,
  listExtracurricularBookingsHandler,
  listExtracurricularEventsHandler,
  listLiveClassEventsHandler,
  listLiveClassesHandler,
  listTutorAvailabilityHandler,
  listTutorsHandler,
  listTutoringSessionsHandler,
  markEventAttendanceHandler,
  setEventAttendanceHandler,
  setEventReminderHandler,
  upcomingHandler,
  updateCalendarEventHandler,
  updateExtracurricularEventHandler,
  updateLiveClassHandler,
  updateMyTutorProfileHandler,
  updateTutoringSessionHandler,
  type AuthRequest,
} from './handlers';
import type { NextFunction, Response } from 'express';

/**
 * Teacher-facing mutations are gated by the permission matrix rather than a
 * hard-coded role list so new school/district roles work automatically.
 */
function requireEngagementStaff(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || !isPrivilegedRole(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
}

export function registerRoutes(app: any) {
  const router = Router();

  router.get('/upcoming', authenticate, upcomingHandler);

  // Calendar
  router.get('/calendar', authenticate, listCalendarHandler);
  router.get('/calendar.ics', authenticate, exportCalendarHandler);
  router.post('/calendar', authenticate, requireEngagementStaff, createCalendarEventHandler);
  router.get('/calendar/:id', authenticate, getCalendarEventHandler);
  router.put('/calendar/:id', authenticate, requireEngagementStaff, updateCalendarEventHandler);
  router.delete('/calendar/:id', authenticate, requireEngagementStaff, deleteCalendarEventHandler);
  router.post('/calendar/:id/attendance', authenticate, setEventAttendanceHandler);
  router.get('/calendar/:id/attendees', authenticate, listEventAttendeesHandler);
  router.post('/calendar/:id/reminder', authenticate, setEventReminderHandler);

  // Tutoring and mentoring
  router.get('/tutors', authenticate, listTutorsHandler);
  router.put('/tutors/me', authenticate, authorize('teacher', 'tutor', 'mentor', 'admin'), updateMyTutorProfileHandler);
  router.get('/tutoring/availability', authenticate, listTutorAvailabilityHandler);
  router.post('/tutoring/availability', authenticate, requireEngagementStaff, createTutorAvailabilityHandler);
  router.delete('/tutoring/availability/:id', authenticate, deleteTutorAvailabilityHandler);
  router.post('/tutoring/sessions', authenticate, bookTutoringSessionHandler);
  router.get('/tutoring/sessions', authenticate, listTutoringSessionsHandler);
  router.patch('/tutoring/sessions/:id', authenticate, updateTutoringSessionHandler);
  router.post('/tutoring/sessions/:id/cancel', authenticate, cancelTutoringSessionHandler);

  // Extracurricular events
  router.get('/events', authenticate, listExtracurricularEventsHandler);
  router.post('/events', authenticate, requireEngagementStaff, createExtracurricularEventHandler);
  router.put('/events/:id', authenticate, requireEngagementStaff, updateExtracurricularEventHandler);
  router.post('/events/:id/book', authenticate, bookExtracurricularEventHandler);
  router.delete('/events/:id/book', authenticate, cancelExtracurricularBookingHandler);
  router.get('/events/:id/bookings', authenticate, listExtracurricularBookingsHandler);
  router.post('/events/:id/attendance', authenticate, requireEngagementStaff, markEventAttendanceHandler);

  // Live classes
  router.get('/live', authenticate, listLiveClassesHandler);
  router.post('/live', authenticate, requireEngagementStaff, createLiveClassHandler);
  router.get('/live/:id', authenticate, getLiveClassHandler);
  router.patch('/live/:id', authenticate, requireEngagementStaff, updateLiveClassHandler);
  router.post('/live/:id/join', authenticate, joinLiveClassHandler);
  router.post('/live/:id/leave', authenticate, leaveLiveClassHandler);
  router.get('/live/:id/events', authenticate, listLiveClassEventsHandler);
  router.post('/live/:id/events', authenticate, addLiveClassEventHandler);
  router.get('/live/:id/analytics', authenticate, requireEngagementStaff, getLiveClassAnalyticsHandler);

  app.use('/api/engagement', router);
}
