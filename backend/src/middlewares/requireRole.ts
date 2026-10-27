import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';

// Role guard factory. Must run after `authenticate` so req.user is populated.
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}
