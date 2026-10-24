import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './auth';
import { ACCESS_COOKIE, readCookie } from './cookies';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    organizationId?: string;
  };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const token =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.substring(7)
        : readCookie(req, ACCESS_COOKIE);

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const payload = verifyToken(token);

    req.user = {
      id: payload.userId,
      role: payload.role,
      organizationId: payload.organizationId,
    };

    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export { authorize } from '@edunet/rbac';
