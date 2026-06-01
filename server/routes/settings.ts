import { Router } from 'express';
import { db } from '../db/index';
import { settings, users } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
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

export default router;
