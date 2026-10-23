import { Request, Response } from 'express';
import { z } from 'zod';
import { hasPermission } from '@edunet/rbac';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  addTicketMessage,
  closeDb,
  createSupportTicket,
  escalateTicket,
  getSupportResourceBySlug,
  getSupportTicket,
  listCounselingAppointments,
  listCounselors,
  listSupportResources,
  listSupportTickets,
  requestCounselingAppointment,
  updateCounselingAppointment,
  updateTicket,
  upsertCounselorProfile,
  upsertSupportResource,
} from './db';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    organizationId?: string;
  };
}

function fail(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: 'Invalid request', details: error.flatten() });
  }
  if (error instanceof NotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof ForbiddenError) return res.status(403).json({ error: error.message });
  if (error instanceof ConflictError) return res.status(409).json({ error: error.message });
  throw error;
}

function context(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId || !req.user) {
    res.status(403).json({ error: 'Organization context required' });
    return null;
  }
  return { organizationId, user: req.user };
}

function isSupportStaff(role: string) {
  return hasPermission(role, 'support:read');
}

const ticketSchema = z.object({
  subject: z.string().min(3).max(200),
  description: z.string().min(5).max(10000),
  category: z.string().max(40).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

export async function listResourcesHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const query = z
      .object({
        locale: z.string().max(10).optional(),
        category: z.string().max(60).optional(),
        query: z.string().max(200).optional(),
        includeUnpublished: z.coerce.boolean().optional(),
      })
      .parse(req.query);
    return res.json(
      await listSupportResources(ctx.organizationId, {
        ...query,
        includeUnpublished: query.includeUnpublished && isSupportStaff(ctx.user.role),
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function getResourceHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const { locale } = z.object({ locale: z.string().max(10).optional() }).parse(req.query);
    const resource = await getSupportResourceBySlug(req.params.slug!, ctx.organizationId, locale);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });
    return res.json(resource);
  } catch (error) {
    return fail(res, error);
  }
}

export async function upsertResourceHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!hasPermission(ctx.user.role, 'support:write')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const input = z
      .object({
        id: z.string().uuid().optional(),
        slug: z.string().min(1).max(120),
        title: z.string().min(1).max(200),
        category: z.string().min(1).max(60),
        body: z.string().min(1).max(50000),
        locale: z.string().max(10).optional(),
        isPublished: z.boolean().optional(),
      })
      .parse(req.body);
    return res.status(201).json(
      await upsertSupportResource({ ...input, organizationId: ctx.organizationId }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function createTicketHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = ticketSchema.parse(req.body);
    const result = await createSupportTicket({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      ...input,
    });
    return res.status(201).json(result);
  } catch (error) {
    return fail(res, error);
  }
}

export async function listTicketsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const query = z
      .object({
        status: z.enum(['open', 'pending', 'resolved', 'closed']).optional(),
        assignedTo: z.string().uuid().optional(),
      })
      .parse(req.query);
    const staff = isSupportStaff(ctx.user.role);
    return res.json(
      await listSupportTickets(ctx.organizationId, {
        ...query,
        userId: staff ? undefined : ctx.user.id,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function getTicketHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(
      await getSupportTicket(
        ctx.organizationId,
        req.params.id!,
        ctx.user.id,
        isSupportStaff(ctx.user.role),
      ),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function addTicketMessageHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = z
      .object({ body: z.string().min(1).max(10000), isInternal: z.boolean().optional() })
      .parse(req.body);
    return res.status(201).json(
      await addTicketMessage({
        organizationId: ctx.organizationId,
        ticketId: req.params.id!,
        userId: ctx.user.id,
        staff: isSupportStaff(ctx.user.role),
        ...input,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function updateTicketHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = z
      .object({
        status: z.enum(['open', 'pending', 'resolved', 'closed']).optional(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
        assignedTo: z.string().uuid().nullable().optional(),
        category: z.string().max(40).optional(),
      })
      .parse(req.body);
    const staff = isSupportStaff(ctx.user.role);
    if (!staff) {
      const keys = Object.keys(input);
      if (keys.some((key) => key !== 'status')) {
        return res.status(403).json({ error: 'Only support staff can change these fields' });
      }
    }
    return res.json(
      await updateTicket(ctx.organizationId, req.params.id!, input, {
        staff,
        userId: ctx.user.id,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function escalateTicketHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = z.object({ breached: z.boolean().optional() }).parse(req.body ?? {});
    return res.json(
      await escalateTicket(ctx.organizationId, req.params.id!, {
        userId: ctx.user.id,
        staff: isSupportStaff(ctx.user.role),
        breached: input.breached,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function listCounselorsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(await listCounselors(ctx.organizationId));
  } catch (error) {
    return fail(res, error);
  }
}

export async function upsertCounselorHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!hasPermission(ctx.user.role, 'support:write')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const input = z
      .object({
        specialization: z.string().max(120).optional(),
        bio: z.string().max(5000).optional(),
        isAcceptingAppointments: z.boolean().optional(),
      })
      .parse(req.body);
    return res.json(await upsertCounselorProfile(ctx.organizationId, ctx.user.id, input));
  } catch (error) {
    return fail(res, error);
  }
}

export async function listAppointmentsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(
      await listCounselingAppointments(
        ctx.organizationId,
        ctx.user.id,
        isSupportStaff(ctx.user.role),
      ),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function requestAppointmentHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = z
      .object({
        counselorId: z.string().uuid(),
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
        consentRecorded: z.boolean(),
      })
      .parse(req.body);
    return res.status(201).json(
      await requestCounselingAppointment({
        organizationId: ctx.organizationId,
        studentId: ctx.user.id,
        ...input,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function updateAppointmentHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = z
      .object({
        status: z.enum(['confirmed', 'completed', 'cancelled']).optional(),
        notes: z.string().max(10000).optional(),
      })
      .parse(req.body);
    return res.json(
      await updateCounselingAppointment(
        ctx.organizationId,
        req.params.id!,
        ctx.user.id,
        isSupportStaff(ctx.user.role),
        input,
      ),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export { closeDb };
