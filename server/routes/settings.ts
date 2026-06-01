import { Router } from 'express';
import { db } from '../db/index';
import { settings, users } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { authenticate, authorize, strictAuthorize, AuthRequest, ALLOWED_OVERRIDE_MODULES } from '../middleware/auth';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const router = Router();
router.use(authenticate);

router.get('/', authorize('owner', 'manager'), async (_req, res) => {
  try {
    const rows = await db.select().from(settings);
    const obj: Record<string, string> = {};
    rows.forEach(r => { obj[r.key] = r.value; });
    return res.json(obj);
  } catch { return res.status(500).json({ error: 'Failed to fetch settings' }); }
});

const PUBLIC_SETTING_KEYS = ['shop_name', 'shop_address', 'shop_phone', 'shop_email', 'shop_logo'];
router.get('/public', async (_req, res) => {
  try {
    const rows = await db.select().from(settings);
    const obj: Record<string, string> = {};
    rows.filter(r => PUBLIC_SETTING_KEYS.includes(r.key)).forEach(r => { obj[r.key] = r.value; });
    return res.json(obj);
  } catch { return res.status(500).json({ error: 'Failed to fetch public settings' }); }
});

router.put('/', authorize('owner'), async (req, res) => {
  try {
    const updates = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      await db.insert(settings).values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
    }
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: 'Failed to update settings' }); }
});

router.get('/staff', authorize('owner', 'manager'), async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        u.id, u.name, u.email, u.role, u.phone, u.is_active, u.created_at, u.last_login_at,
        COUNT(DISTINCT s.id) as total_sales,
        COALESCE(SUM(s.total_amount), 0) as total_revenue,
        COUNT(DISTINCT pj.id) as print_jobs_count,
        MAX(s.created_at) as last_sale_at
      FROM users u
      LEFT JOIN sales s ON s.cashier_id = u.id
        AND s.created_at >= NOW() - INTERVAL '30 days'
      LEFT JOIN print_jobs pj ON pj.assigned_to = u.id
        AND pj.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY u.id, u.name, u.email, u.role, u.phone, u.is_active, u.created_at, u.last_login_at
      ORDER BY u.created_at ASC
    `);
    const staff = (result as any).rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      phone: r.phone,
      isActive: r.is_active,
      createdAt: r.created_at,
      lastLoginAt: r.last_login_at,
      totalSales: Number(r.total_sales ?? 0),
      totalRevenue: parseFloat(r.total_revenue ?? 0),
      printJobsCount: Number(r.print_jobs_count ?? 0),
      lastSaleAt: r.last_sale_at,
    }));
    return res.json(staff);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch staff' });
  }
});

router.post('/staff', authorize('owner'), async (req, res) => {
  try {
    const data = z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(['owner', 'manager', 'cashier', 'print_operator', 'inventory_officer']),
      phone: z.string().optional(),
    }).parse(req.body);

    const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
    if (exists.length > 0) return res.status(400).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(data.password, 12);
    const [user] = await db.insert(users).values({ ...data, passwordHash }).returning();
    return res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to create staff' });
  }
});

router.put('/staff/:id', authorize('owner'), async (req, res) => {
  try {
    const data = z.object({
      name: z.string().min(2).optional(),
      role: z.enum(['owner', 'manager', 'cashier', 'print_operator', 'inventory_officer']).optional(),
      phone: z.string().optional(),
      isActive: z.boolean().optional(),
      newPassword: z.string().min(6).optional(),
    }).parse(req.body);

    const updates: any = { updatedAt: new Date() };
    if (data.name) updates.name = data.name;
    if (data.role) updates.role = data.role;
    if (data.phone !== undefined) updates.phone = data.phone;
    if (data.isActive !== undefined) updates.isActive = data.isActive;
    if (data.newPassword) updates.passwordHash = await bcrypt.hash(data.newPassword, 12);

    const [user] = await db.update(users).set(updates).where(eq(users.id, Number(req.params.id))).returning();
    if (!user) return res.status(404).json({ error: 'Staff member not found' });
    return res.json({ id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to update staff' });
  }
});

// GET /api/settings/staff/activity — recent staff activity
router.get('/staff/activity', authorize('owner', 'manager'), async (req, res) => {
  try {
    const { sql } = await import('drizzle-orm');
    const { db } = await import('../db/index');
    const userId = req.query.userId ? Number(req.query.userId) : null;

    // Combine sales, print_jobs completions as activity
    const salesActivity = await db.execute(sql`
      SELECT s.id, s.cashier_id as user_id, u.name as user_name,
             'sale' as activity_type,
             'Processed sale ' || s.sale_number || ' — ₵' || s.total_amount as description,
             s.created_at
      FROM sales s
      JOIN users u ON u.id = s.cashier_id
      ${userId ? sql`WHERE s.cashier_id = ${userId}` : sql``}
      ORDER BY s.created_at DESC
      LIMIT 50
    `);

    const printActivity = await db.execute(sql`
      SELECT pj.id, pj.assigned_to as user_id, u.name as user_name,
             'print_job' as activity_type,
             'Print job ' || pj.job_number || ' — ' || pj.status as description,
             pj.updated_at as created_at
      FROM print_jobs pj
      JOIN users u ON u.id = pj.assigned_to
      WHERE pj.assigned_to IS NOT NULL
      ${userId ? sql`AND pj.assigned_to = ${userId}` : sql``}
      ORDER BY pj.updated_at DESC
      LIMIT 50
    `);

    const allActivity = [
      ...(salesActivity as any).rows.map((r: any) => ({ ...r, activityType: r.activity_type, userName: r.user_name, createdAt: r.created_at })),
      ...(printActivity as any).rows.map((r: any) => ({ ...r, activityType: r.activity_type, userName: r.user_name, createdAt: r.created_at })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 100);

    return res.json(allActivity);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// GET /api/settings/security-events — recent unauthorized access attempts
router.get('/security-events', authorize('owner', 'manager'), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 100), 200);
    const since = req.query.since as string | undefined;

    const result = await db.execute(sql`
      SELECT
        al.id,
        al.user_id,
        u.name    AS user_name,
        u.email   AS user_email,
        u.role    AS user_role,
        al.entity_type AS route,
        al.new_values  AS details,
        al.ip_address,
        al.created_at
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.action = 'unauthorized_access'
        ${since ? sql`AND al.created_at > ${new Date(since)}` : sql``}
      ORDER BY al.created_at DESC
      LIMIT ${limit}
    `);

    const events = (result as any).rows.map((r: any) => {
      let parsed: any = {};
      try { parsed = JSON.parse(r.details ?? '{}'); } catch {}
      return {
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        userEmail: r.user_email,
        userRole: r.user_role,
        route: parsed.route ?? r.route,
        method: parsed.method ?? 'GET',
        requiredRoles: parsed.requiredRoles ?? [],
        ipAddress: r.ip_address,
        createdAt: r.created_at,
      };
    });

    return res.json(events);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch security events' });
  }
});

// GET /api/settings/security-events/count — count of recent unauthorized attempts (last 24h)
router.get('/security-events/count', authorize('owner', 'manager'), async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM audit_logs
      WHERE action = 'unauthorized_access'
        AND created_at > NOW() - INTERVAL '24 hours'
    `);
    const cnt = Number((result as any).rows[0]?.cnt ?? 0);
    return res.json({ count: cnt });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to count security events' });
  }
});

// ─── Permission Overrides ─────────────────────────────────

// GET /api/settings/permission-overrides — list all overrides (owner only, no override bypass)
router.get('/permission-overrides', strictAuthorize('owner'), async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        po.id, po.user_id, po.module, po.granted_by, po.expires_at,
        po.reason, po.is_revoked, po.created_at,
        u.name AS user_name, u.email AS user_email, u.role AS user_role,
        g.name AS granted_by_name
      FROM permission_overrides po
      JOIN users u ON u.id = po.user_id
      JOIN users g ON g.id = po.granted_by
      ORDER BY po.created_at DESC
    `);
    const rows = (result as any).rows.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      module: r.module,
      grantedBy: r.granted_by,
      expiresAt: r.expires_at,
      reason: r.reason,
      isRevoked: r.is_revoked,
      createdAt: r.created_at,
      userName: r.user_name,
      userEmail: r.user_email,
      userRole: r.user_role,
      grantedByName: r.granted_by_name,
    }));
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch permission overrides' });
  }
});

// POST /api/settings/permission-overrides — grant an override (owner only, no override bypass)
router.post('/permission-overrides', strictAuthorize('owner'), async (req: AuthRequest, res) => {
  try {
    const data = z.object({
      userId: z.number().int().positive(),
      module: z.enum(ALLOWED_OVERRIDE_MODULES),
      expiresAt: z.string(),
      reason: z.string().max(500).optional(),
    }).parse(req.body);

    const expiresAt = new Date(data.expiresAt);
    if (isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      return res.status(400).json({ error: 'expiresAt must be a valid future date' });
    }

    const grantedBy = req.user!.id;

    const result = await db.execute(sql`
      INSERT INTO permission_overrides (user_id, module, granted_by, expires_at, reason)
      VALUES (${data.userId}, ${data.module}, ${grantedBy}, ${expiresAt}, ${data.reason ?? null})
      RETURNING id, user_id, module, granted_by, expires_at, reason, is_revoked, created_at
    `);
    const row = (result as any).rows[0];
    return res.status(201).json({
      id: row.id,
      userId: row.user_id,
      module: row.module,
      grantedBy: row.granted_by,
      expiresAt: row.expires_at,
      reason: row.reason,
      isRevoked: row.is_revoked,
      createdAt: row.created_at,
    });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    console.error(err);
    return res.status(500).json({ error: 'Failed to create permission override' });
  }
});

// DELETE /api/settings/permission-overrides/:id — revoke an override (owner only, no override bypass)
router.delete('/permission-overrides/:id', strictAuthorize('owner'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    await db.execute(sql`
      UPDATE permission_overrides SET is_revoked = true WHERE id = ${id}
    `);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to revoke permission override' });
  }
});

export default router;
