import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { db } from '../db/index';
import { sql } from 'drizzle-orm';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function resolveEntityType(path: string): string {
  const segments = path.replace(/^\/api\//, '').split('/');
  return segments[0] ?? 'unknown';
}

function resolveEntityId(path: string): number | null {
  const segments = path.replace(/^\/api\//, '').split('/');
  const id = segments[1] ? parseInt(segments[1], 10) : NaN;
  return isNaN(id) ? null : id;
}

export function auditLog(req: AuthRequest, res: Response, next: NextFunction) {
  if (!WRITE_METHODS.has(req.method)) return next();

  const originalJson = res.json.bind(res);

  res.json = function (body: any) {
    if (res.statusCode < 400 && req.user?.id) {
      const action = req.method === 'POST' ? 'create'
        : req.method === 'PUT' || req.method === 'PATCH' ? 'update'
        : req.method === 'DELETE' ? 'delete'
        : req.method.toLowerCase();

      const entityType = resolveEntityType(req.path);
      const entityId = resolveEntityId(req.path)
        ?? (body?.id ?? null);

      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        ?? req.socket?.remoteAddress
        ?? null;

      const newValues = req.method !== 'DELETE' && req.body && Object.keys(req.body).length > 0
        ? JSON.stringify(req.body).slice(0, 2000)
        : null;

      db.execute(sql`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, ip_address, created_at)
        VALUES (${req.user.id}, ${action}, ${entityType}, ${entityId}, ${newValues}, ${ip}, NOW())
      `).catch(() => {});
    }
    return originalJson(body);
  };

  next();
}
