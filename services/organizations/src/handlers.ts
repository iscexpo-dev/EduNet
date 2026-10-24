import { Request, Response } from 'express';
import { organizationSchema } from '@edunet/validation';
import {
  findOrganizationById,
  findOrganizationByCode,
  createOrganization,
  updateOrganization,
  listOrganizations,
} from './db';
import { canAccessOrganization, parsePagination, sanitizeOrganizationUpdate } from './policy';

interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    organizationId?: string;
  };
}

function requireOrganizationId(req: AuthRequest, res: Response): string | null {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    res.status(403).json({ error: 'An organization-scoped account is required' });
    return null;
  }
  return organizationId;
}

export async function createOrganizationHandler(req: Request, res: Response) {
  try {
    const data = organizationSchema.parse(req.body);

    const existing = await findOrganizationByCode(data.code);
    if (existing) {
      return res.status(409).json({ error: 'Organization code already exists' });
    }

    const org = await createOrganization(data);
    res.status(201).json(org);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function getOrganizationHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { id } = req.params;
    if (!canAccessOrganization(organizationId, id)) {
      return res.status(403).json({ error: 'You are not authorized to view this organization' });
    }

    const org = await findOrganizationById(id);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(org);
  } catch {
    res.status(500).json({ error: 'Unable to load organization' });
  }
}

export async function updateOrganizationHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { id } = req.params;
    if (!canAccessOrganization(organizationId, id)) {
      return res.status(403).json({ error: 'You are not authorized to update this organization' });
    }

    const existing = await findOrganizationById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const org = await updateOrganization(id, sanitizeOrganizationUpdate(req.body));
    res.json(org);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function listOrganizationsHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { limit, offset } = parsePagination(req.query);
    const orgs = await listOrganizations(limit, offset, organizationId);
    res.json(orgs);
  } catch {
    res.status(500).json({ error: 'Unable to list organizations' });
  }
}
