import { Router } from 'express';
import { authenticate } from '@edunet/rbac';
import {
  addTicketMessageHandler,
  createTicketHandler,
  escalateTicketHandler,
  getResourceHandler,
  getTicketHandler,
  listAppointmentsHandler,
  listCounselorsHandler,
  listResourcesHandler,
  listTicketsHandler,
  requestAppointmentHandler,
  updateAppointmentHandler,
  updateTicketHandler,
  upsertCounselorHandler,
  upsertResourceHandler,
} from './handlers';

export function registerRoutes(app: any) {
  const router = Router();

  // Help centre
  router.get('/resources', authenticate, listResourcesHandler);
  router.post('/resources', authenticate, upsertResourceHandler);
  router.get('/resources/:slug', authenticate, getResourceHandler);

  // Support tickets
  router.post('/tickets', authenticate, createTicketHandler);
  router.get('/tickets', authenticate, listTicketsHandler);
  router.get('/tickets/:id', authenticate, getTicketHandler);
  router.post('/tickets/:id/messages', authenticate, addTicketMessageHandler);
  router.patch('/tickets/:id', authenticate, updateTicketHandler);
  router.post('/tickets/:id/escalate', authenticate, escalateTicketHandler);

  // Counselling
  router.get('/counselors', authenticate, listCounselorsHandler);
  router.put('/counselors/me', authenticate, upsertCounselorHandler);
  router.get('/counseling/appointments', authenticate, listAppointmentsHandler);
  router.post('/counseling/appointments', authenticate, requestAppointmentHandler);
  router.patch('/counseling/appointments/:id', authenticate, updateAppointmentHandler);

  app.use('/api/support', router);
}
