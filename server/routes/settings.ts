import { Router } from 'express';
import { db } from '../db/index';
import { settings, users } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res) => {
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
    const staff = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      phone: users.phone,
      isActive: users.isActive,
      createdAt: users.createdAt,
    }).from(users);
    return res.json(staff);
  } catch { return res.status(500).json({ error: 'Failed to fetch staff' }); }
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

export default router;
