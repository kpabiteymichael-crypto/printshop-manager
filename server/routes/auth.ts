import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateToken, authenticate, AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.isActive) return res.status(401).json({ error: 'Account is deactivated' });

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = generateToken({ id: user.id, email: user.email, role: user.role, name: user.name });
    db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id)).execute().catch(() => {});
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, avatarUrl: user.avatarUrl } });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', authenticate, (_req, res) => {
  return res.json({ success: true });
});

router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, avatarUrl: user.avatarUrl } });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.put('/profile', authenticate, async (req: AuthRequest, res) => {
  try {
    const data = z.object({
      name: z.string().min(2).optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      currentPassword: z.string().optional(),
      newPassword: z.string().min(6).optional(),
    }).parse(req.body);

    const [user] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (data.newPassword || data.email) {
      if (!data.currentPassword) return res.status(400).json({ error: 'Current password required' });
      const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    }

    if (data.email && data.email !== user.email) {
      const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
      if (exists.length > 0) return res.status(400).json({ error: 'Email already in use' });
    }

    const updates: any = { updatedAt: new Date() };
    if (data.name) updates.name = data.name;
    if (data.email) updates.email = data.email;
    if (data.phone !== undefined) updates.phone = data.phone;
    if (data.newPassword) updates.passwordHash = await bcrypt.hash(data.newPassword, 12);

    const [updated] = await db.update(users).set(updates).where(eq(users.id, req.user!.id)).returning();
    const newToken = generateToken({ id: updated.id, email: updated.email, role: updated.role, name: updated.name });
    return res.json({ user: { id: updated.id, name: updated.name, email: updated.email, role: updated.role, phone: updated.phone, avatarUrl: updated.avatarUrl }, token: newToken });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;
