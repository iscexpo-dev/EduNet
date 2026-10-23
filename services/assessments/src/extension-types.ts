import type { Request } from 'express';
import type { AuthenticatedUser } from '@edunet/rbac';

/** Authenticated request shape used across the assessment service.
 *  Mirrors handlers.ts' AuthRequest to avoid circular imports. */
export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    organizationId?: string;
  };
}

