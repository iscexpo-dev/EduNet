import { Router } from 'express';
import { authenticate } from '@edunet/rbac';
import {
  analyticsSummaryHandler,
  appendAuditHandler,
  assignSubjectHandler,
  attendanceSummaryHandler,
  calculateGradeHandler,
  checkFlagHandler,
  createClassHandler,
  createDataRequestHandler,
  createSectionHandler,
  createSubjectHandler,
  createTermHandler,
  createWebhookHandler,
  createYearHandler,
  enrollStudentHandler,
  ingestAnalyticsHandler,
  listAttendanceHandler,
  listAuditHandler,
  listClassesHandler,
  listClassSubjectsHandler,
  listConsentsHandler,
  listDataRequestsHandler,
  listEnrollmentsHandler,
  listFlagsHandler,
  listIntegrationsHandler,
  listSectionsHandler,
  listSettingsHandler,
  listSubjectsHandler,
  listTemplatesHandler,
  listTermsHandler,
  listWebhooksHandler,
  listYearsHandler,
  markAttendanceHandler,
  recordConsentHandler,
  updateClassHandler,
  updateDataRequestHandler,
  updateEnrollmentHandler,
  updateYearHandler,
  upsertFlagHandler,
  upsertIntegrationHandler,
  upsertSettingHandler,
  upsertTemplateHandler,
  verifyAuditHandler,
} from './handlers';

export function registerRoutes(app: any) {
  const router = Router();

  // Academic structure
  router.get('/academics/years', authenticate, listYearsHandler);
  router.post('/academics/years', authenticate, createYearHandler);
  router.patch('/academics/years/:id', authenticate, updateYearHandler);
  router.get('/academics/terms', authenticate, listTermsHandler);
  router.post('/academics/terms', authenticate, createTermHandler);
  router.get('/academics/classes', authenticate, listClassesHandler);
  router.post('/academics/classes', authenticate, createClassHandler);
  router.patch('/academics/classes/:id', authenticate, updateClassHandler);
  router.get('/academics/classes/:classId/sections', authenticate, listSectionsHandler);
  router.post('/academics/sections', authenticate, createSectionHandler);
  router.get('/academics/subjects', authenticate, listSubjectsHandler);
  router.post('/academics/subjects', authenticate, createSubjectHandler);
  router.get('/academics/classes/:classId/subjects', authenticate, listClassSubjectsHandler);
  router.post('/academics/class-subjects', authenticate, assignSubjectHandler);
  router.get('/academics/classes/:classId/enrollments', authenticate, listEnrollmentsHandler);
  router.post('/academics/enrollments', authenticate, enrollStudentHandler);
  router.patch('/academics/enrollments/:id', authenticate, updateEnrollmentHandler);

  // Attendance and grading
  router.get('/attendance', authenticate, listAttendanceHandler);
  router.post('/attendance', authenticate, markAttendanceHandler);
  router.get('/attendance/summary', authenticate, attendanceSummaryHandler);
  router.post('/grades/calculate', authenticate, calculateGradeHandler);

  // Analytics event store
  router.post('/analytics/events', authenticate, ingestAnalyticsHandler);
  router.get('/analytics/summary', authenticate, analyticsSummaryHandler);

  // Feature flags, settings
  router.get('/flags', authenticate, listFlagsHandler);
  router.put('/flags', authenticate, upsertFlagHandler);
  router.get('/flags/:key/check', authenticate, checkFlagHandler);
  router.get('/settings', authenticate, listSettingsHandler);
  router.put('/settings', authenticate, upsertSettingHandler);

  // Audit trail
  router.get('/audit', authenticate, listAuditHandler);
  router.get('/audit/verify', authenticate, verifyAuditHandler);
  router.post('/audit', authenticate, appendAuditHandler);

  // Consent and privacy requests
  router.get('/consents', authenticate, listConsentsHandler);
  router.post('/consents', authenticate, recordConsentHandler);
  router.get('/privacy/requests', authenticate, listDataRequestsHandler);
  router.post('/privacy/requests', authenticate, createDataRequestHandler);
  router.patch('/privacy/requests/:id', authenticate, updateDataRequestHandler);

  // Integrations and webhooks
  router.get('/integrations', authenticate, listIntegrationsHandler);
  router.put('/integrations', authenticate, upsertIntegrationHandler);
  router.get('/webhooks', authenticate, listWebhooksHandler);
  router.post('/webhooks', authenticate, createWebhookHandler);

  // Notification templates
  router.get('/notification-templates', authenticate, listTemplatesHandler);
  router.put('/notification-templates', authenticate, upsertTemplateHandler);

  app.use('/api/platform', router);
}
