import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/index';
import { sql } from 'drizzle-orm';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production');
    }
    console.warn('[WARNING] JWT_SECRET is not set. Using insecure development fallback. Set JWT_SECRET before deploying.');
    return 'printshop-dev-secret-DO-NOT-USE-IN-PRODUCTION';
  }
  return secret;
}

export interface AuthRequest extends Request {
  user?: { id: number; email: string; role: string; name: string };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { id: number; email: string; role: string; name: string };
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        ?? req.socket?.remoteAddress
        ?? null;
      const details = JSON.stringify({
        method: req.method,
        route: req.originalUrl,
        userRole: req.user.role,
        requiredRoles: roles,
      });
      db.execute(sql`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, ip_address, created_at)
        VALUES (${req.user.id}, 'unauthorized_access', ${req.path}, NULL, ${details}, ${ip}, NOW())
      `).catch(() => {});
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

export function requireRole(roles: string[]) {
  return authorize(...roles);
}

export function generateToken(user: { id: number; email: string; role: string; name: string }): string {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}
