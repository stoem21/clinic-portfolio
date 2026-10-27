import { Role } from '@prisma/client';

export interface AuthPayload {
  id: string;
  username: string;
  role: Role;
}

// Refresh tokens carry the user's tokenVersion so they can be revoked by
// bumping User.tokenVersion (logout, password change/reset).
export interface RefreshPayload extends AuthPayload {
  tokenVersion: number;
}

// Augment Express Request so req.user is typed everywhere.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}
