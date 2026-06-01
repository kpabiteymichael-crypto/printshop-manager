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

const URL_PREFIX_MODULE_MAP: Array<[string, string]> = [
  ['/api/suppliers/purchase-orders', 'purchase-orders'],
  ['/api/pos/sales', 'sales'],
  ['/api/settings/staff', 'staff'],
  ['/api/products', 'bookstore'],
];

export const ALLOWED_OVERRIDE_MODULES = [
  'dashboard', 'pos', 'print-jobs', 'inventory', 'bookstore',
  'customers', 'suppliers', 'purchase-orders', 'cash', 'expenses',
  'debts', 'sales', 'receipts', 'quotations', 'invoices', 'reports',
] as const;

function extractModule(req: AuthRequest): string | null {
  const url = req.originalUrl || '';
  for (const [prefix, module] of URL_PREFIX_MODULE_MAP) {
    if (url.startsWith(prefix)) return module;
  }
  const match = url.match(/^\/api\/([^/?]+)/);
  return match ? match[1] : null;
}

async function hasActiveOverride(userId: number, module: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT id FROM permission_overrides
      WHERE user_id = ${userId}
        AND module = ${module}
        AND is_revoked = false
        AND expires_at > NOW()
      LIMIT 1
    `);
    return (result as any).rows.length > 0;
  } catch {
    return false;
  }
}

const ROLE_DISPLAY: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
  print_operator: 'Print Operator',
  inventory_officer: 'Inventory Officer',
};

function denyWithAudit(req: AuthRequest, res: Response, roles: string[]) {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    ?? req.socket?.remoteAddress
    ?? null;
  const details = JSON.stringify({
    method: req.method,
    route: req.originalUrl,
    userRole: req.user!.role,
    requiredRoles: roles,
  });

  db.execute(sql`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, ip_address, created_at)
    VALUES (${req.user!.id}, 'unauthorized_access', ${req.path}, NULL, ${details}, ${ip}, NOW())
  `).catch(() => {});

  const userName = req.user!.name;
  const userRole = ROLE_DISPLAY[req.user!.role] ?? req.user!.role;
  const route = req.originalUrl;
  const notifTitle = 'Unauthorized Access Attempt';
  const notifMessage = `${userName} (${userRole}) tried to access ${route}`;

  db.execute(sql`
    INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
    SELECT id, ${notifTitle}, ${notifMessage}, 'security_alert', false, NOW()
    FROM users
    WHERE role IN ('owner', 'manager') AND is_active = true AND id != ${req.user!.id}
  `).catch(() => {});

  return res.status(403).json({ error: 'Forbidden' });
}

export function authorize(...roles: string[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });

    if (roles.includes(req.user.role)) {
      return next();
    }

    const module = extractModule(req);
    if (module && await hasActiveOverride(req.user.id, module)) {
      return next();
    }

    return denyWithAudit(req, res, roles);
  };
}

export function strictAuthorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (roles.includes(req.user.role)) return next();
    return denyWithAudit(req, res, roles);
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
