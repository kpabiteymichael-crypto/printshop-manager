import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { cashSessions, sales, expenses, users } from '../db/schema';
import { eq, sql, gte, and } from 'drizzle-orm';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/sessions', async (_req, res) => {
  try {
    const sessions = await db.select({
      id: cashSessions.id,
      openingBalance: cashSessions.openingBalance,
      closingBalance: cashSessions.closingBalance,
      totalSales: cashSessions.totalSales,
      totalExpenses: cashSessions.totalExpenses,
      status: cashSessions.status,
      notes: cashSessions.notes,
      openedAt: cashSessions.openedAt,
      closedAt: cashSessions.closedAt,
      openedByName: users.name,
    })
      .from(cashSessions)
      .leftJoin(users, eq(cashSessions.openedBy, users.id))
      .orderBy(sql`cash_sessions.opened_at DESC`);
    return res.json(sessions);
  } catch { return res.status(500).json({ error: 'Failed to fetch sessions' }); }
});

router.get('/sessions/current', async (_req, res) => {
  try {
    const [session] = await db.select().from(cashSessions).where(eq(cashSessions.status, 'open')).limit(1);
    return res.json(session || null);
  } catch { return res.status(500).json({ error: 'Failed to fetch current session' }); }
});

router.post('/sessions/open', authorize('owner', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const { openingBalance, notes } = z.object({
      openingBalance: z.string().default('0'),
      notes: z.string().optional(),
    }).parse(req.body);

    const [existing] = await db.select().from(cashSessions).where(eq(cashSessions.status, 'open')).limit(1);
    if (existing) return res.status(400).json({ error: 'A cash session is already open' });

    const [session] = await db.insert(cashSessions).values({
      openedBy: req.user!.id,
      openingBalance,
      notes,
      status: 'open',
    }).returning();
    return res.status(201).json(session);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to open cash session' });
  }
});

router.post('/sessions/:id/close', authorize('owner', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const { closingBalance, notes } = z.object({
      closingBalance: z.string(),
      notes: z.string().optional(),
    }).parse(req.body);

    const [session] = await db.update(cashSessions).set({
      closedBy: req.user!.id,
      closingBalance,
      status: 'closed',
      closedAt: new Date(),
      notes: notes || undefined,
    }).where(eq(cashSessions.id, Number(req.params.id))).returning();

    if (!session) return res.status(404).json({ error: 'Session not found' });
    return res.json(session);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to close cash session' });
  }
});

export default router;
