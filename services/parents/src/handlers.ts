import { Request, Response } from 'express';
import {
  findParentChildRelationshipById,
  findParentChildRelationship,
  findUserById,
  listChildrenByParent,
  listParentsByChild,
  createParentChildRelationship,
  updateParentChildRelationship,
  deleteParentChildRelationship,
  getChildEnrollments,
  getChildSubmissions,
} from './db';
import {
  canManageRelationship,
  canReadChildAssignments,
  canReadChildGrades,
  canViewRelationship,
  parsePagination,
  sanitizeRelationshipUpdate,
} from './policy';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    organizationId?: string;
  };
}

function childIdFromRequest(req: AuthRequest): string | null {
  const param = req.params.childId;
  if (typeof param === 'string' && param.length > 0) return param;
  const query = req.query.childId;
  return typeof query === 'string' && query.length > 0 ? query : null;
}

async function authorizeChildAccess(
  req: AuthRequest,
  res: Response,
  childId: string,
): Promise<{ organizationId: string } | null> {
  const user = req.user;
  if (!user?.id) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }

  const child = await findUserById(childId);
  if (!child || child.role !== 'student') {
    res.status(404).json({ error: 'Child not found' });
    return null;
  }

  if (user.role === 'parent') {
    const relationship = await findParentChildRelationship(user.id, childId);
    if (!relationship || user.organizationId !== child.organizationId) {
      res.status(403).json({ error: 'You are not authorized to view this child' });
      return null;
    }
  } else if (user.role === 'admin') {
    if (!user.organizationId || user.organizationId !== child.organizationId) {
      res.status(403).json({ error: 'You are not authorized to view this child' });
      return null;
    }
  } else {
    res.status(403).json({ error: 'You are not authorized to view this child' });
    return null;
  }

  return { organizationId: child.organizationId };
}

// Parent-Child Relationship handlers
export async function createParentChildRelationshipHandler(req: AuthRequest, res: Response) {
  try {
    const { parentId, childId, relationship } = req.body ?? {};

    if (typeof parentId !== 'string' || typeof childId !== 'string' || typeof relationship !== 'string') {
      return res.status(400).json({ error: 'parentId, childId, and relationship are required' });
    }

    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can create parent relationships' });
    }

    const normalizedRelationship = relationship.trim();
    if (normalizedRelationship.length === 0 || normalizedRelationship.length > 50) {
      return res.status(400).json({ error: 'relationship must be between 1 and 50 characters' });
    }

    const parent = await findUserById(parentId);
    const child = await findUserById(childId);
    if (!parent || parent.role !== 'parent') {
      return res.status(404).json({ error: 'Parent not found' });
    }
    if (!child || child.role !== 'student') {
      return res.status(404).json({ error: 'Child not found' });
    }
    if (parent.organizationId !== child.organizationId) {
      return res.status(403).json({ error: 'Parent and child must belong to the same organization' });
    }
    if (!user.organizationId || user.organizationId !== child.organizationId) {
      return res.status(403).json({ error: 'You are not authorized to manage this organization' });
    }

    const existing = await findParentChildRelationship(parentId, childId);
    if (existing) {
      return res.status(409).json({ error: 'Relationship already exists' });
    }

    const relationshipData = await createParentChildRelationship({
      parentId,
      childId,
      relationship: normalizedRelationship,
      isPrimary: req.body.isPrimary === true,
      canViewGrades: req.body.canViewGrades !== false,
      canViewAttendance: req.body.canViewAttendance !== false,
      canViewAssignments: req.body.canViewAssignments !== false,
    });

    res.status(201).json(relationshipData);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function getParentChildRelationshipHandler(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const relationship = await findParentChildRelationshipById(id);

    if (!relationship) {
      return res.status(404).json({ error: 'Relationship not found' });
    }

    const child = await findUserById(relationship.childId);
    if (
      !child ||
      !canViewRelationship(
        req.user?.role ?? '',
        req.user?.id ?? '',
        req.user?.organizationId,
        relationship.parentId,
        child.organizationId,
      )
    ) {
      return res.status(403).json({ error: 'You are not authorized to view this relationship' });
    }

    res.json(relationship);
  } catch {
    res.status(500).json({ error: 'Unable to load relationship' });
  }
}

export async function listChildrenHandler(req: AuthRequest, res: Response) {
  try {
    const parentId = req.user?.id;

    if (!parentId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (req.user?.role !== 'parent') {
      return res.status(403).json({ error: 'Only parents can view their children' });
    }

    const { limit, offset } = parsePagination(req.query);
    const children = await listChildrenByParent(
      parentId,
      limit,
      offset,
      req.user?.organizationId,
    );
    res.json(children);
  } catch {
    res.status(500).json({ error: 'Unable to list children' });
  }
}

export async function listParentsHandler(req: AuthRequest, res: Response) {
  try {
    const childId = typeof req.query.childId === 'string' ? req.query.childId : null;
    if (!childId) {
      return res.status(400).json({ error: 'childId is required' });
    }

    const child = await findUserById(childId);
    if (!child) {
      return res.status(404).json({ error: 'Child not found' });
    }
    if (!req.user?.organizationId || req.user.organizationId !== child.organizationId) {
      return res.status(403).json({ error: 'You are not authorized to view this child' });
    }

    const { limit, offset } = parsePagination(req.query);
    const parents = await listParentsByChild(childId, limit, offset, child.organizationId);
    res.json(parents);
  } catch {
    res.status(500).json({ error: 'Unable to list parents' });
  }
}

export async function updateParentChildRelationshipHandler(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const existing = await findParentChildRelationshipById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Relationship not found' });
    }

    const child = await findUserById(existing.childId);
    if (
      !child ||
      !canManageRelationship(
        req.user?.role ?? '',
        req.user?.id ?? '',
        req.user?.organizationId,
        existing.parentId,
        child.organizationId,
      )
    ) {
      return res.status(403).json({ error: 'You are not authorized to update this relationship' });
    }

    const relationship = await updateParentChildRelationship(
      id,
      sanitizeRelationshipUpdate(req.body),
    );
    res.json(relationship);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function deleteParentChildRelationshipHandler(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const existing = await findParentChildRelationshipById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Relationship not found' });
    }

    const child = await findUserById(existing.childId);
    if (
      !child ||
      !canManageRelationship(
        req.user?.role ?? '',
        req.user?.id ?? '',
        req.user?.organizationId,
        existing.parentId,
        child.organizationId,
      )
    ) {
      return res.status(403).json({ error: 'You are not authorized to delete this relationship' });
    }

    const relationship = await deleteParentChildRelationship(id);
    res.json(relationship);
  } catch {
    res.status(500).json({ error: 'Unable to delete relationship' });
  }
}

// Child progress handlers for parents
export async function getChildEnrollmentsHandler(req: AuthRequest, res: Response) {
  try {
    const childId = childIdFromRequest(req);
    if (!childId) {
      return res.status(400).json({ error: 'childId is required' });
    }

    const authorized = await authorizeChildAccess(req, res, childId);
    if (!authorized) return;

    const enrollments = await getChildEnrollments(childId, authorized.organizationId);
    res.json(enrollments);
  } catch {
    res.status(500).json({ error: 'Unable to load enrollments' });
  }
}

export async function getChildSubmissionsHandler(req: AuthRequest, res: Response) {
  try {
    const childId = childIdFromRequest(req);
    if (!childId) {
      return res.status(400).json({ error: 'childId is required' });
    }

    const authorized = await authorizeChildAccess(req, res, childId);
    if (!authorized) return;

    if (req.user?.role === 'parent') {
      const relationship = await findParentChildRelationship(req.user.id, childId);
      if (
        !canReadChildGrades(req.user.role, req.user.id, relationship) ||
        !canReadChildAssignments(req.user.role, req.user.id, relationship)
      ) {
        return res.status(403).json({ error: 'You are not authorized to view this child\'s work' });
      }
    }

    const submissions = await getChildSubmissions(childId, authorized.organizationId);
    res.json(submissions);
  } catch {
    res.status(500).json({ error: 'Unable to load submissions' });
  }
}
