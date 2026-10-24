import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import {
  findUserById,
  listUsersByOrganization,
  updateUser,
  updateUserPassword,
  verifyUser,
  deleteUser,
} from './db';
import { canReadUser, parsePagination, sanitizeProfileUpdate } from './policy';

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

export async function getUserHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { id } = req.params;
    const user = await findUserById(id, organizationId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!req.user || !canReadUser(req.user.id, req.user.role, id)) {
      return res.status(403).json({ error: 'You are not authorized to view this user' });
    }

    const { passwordHash, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function listUsersHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { limit, offset } = parsePagination(req.query);

    const users = await listUsersByOrganization(organizationId, limit, offset);

    const usersWithoutPasswords = users.map(({ passwordHash, ...user }) => user);
    res.json(usersWithoutPasswords);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function updateUserHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { id } = req.params;
    const data = sanitizeProfileUpdate(req.body);

    const existing = await findUserById(id, organizationId);
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = await updateUser(id, organizationId, data);
    const { passwordHash, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function updatePasswordHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { id } = req.params;
    if (req.user?.id !== id) {
      return res.status(403).json({ error: 'You can only change your own password' });
    }
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'oldPassword and newPassword are required' });
    }

    const existing = await findUserById(id, organizationId);
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValid = await bcrypt.compare(oldPassword, existing.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid current password' });
    }

    const user = await updateUserPassword(id, organizationId, newPassword);
    const { passwordHash, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function verifyUserHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { id } = req.params;

    const existing = await findUserById(id, organizationId);
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = await verifyUser(id, organizationId);
    const { passwordHash, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function deleteUserHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { id } = req.params;

    const existing = await findUserById(id, organizationId);
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = await deleteUser(id, organizationId);
    const { passwordHash, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
