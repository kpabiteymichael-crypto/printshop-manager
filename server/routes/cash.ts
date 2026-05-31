import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { cashSessions, sales, expenses, users } from '../db/schema';
import { eq, sql, gte, and } from 'drizzle-orm';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize('owner', 'manager', 'cashier'));

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

    const sessionId = Number(req.params.id);
    const channelBreakdown = await db.execute(sql`
      SELECT payment_method, COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count
      FROM sales WHERE cash_session_id = ${sessionId} AND payment_status != 'credit'
      GROUP BY payment_method
    `);

    const totalSalesResult = await db.execute(sql`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM sales WHERE cash_session_id = ${sessionId} AND payment_status != 'credit'
    `);
    const totalExpensesResult = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE cash_session_id = ${sessionId}
    `);

    const totalSales = (totalSalesResult as any).rows?.[0]?.total ?? '0';
    const totalExpenses = (totalExpensesResult as any).rows?.[0]?.total ?? '0';

    const [session] = await db.update(cashSessions).set({
      closedBy: req.user!.id,
      closingBalance,
      totalSales,
      totalExpenses,
      status: 'closed',
      closedAt: new Date(),
      notes: notes || undefined,
    }).where(eq(cashSessions.id, sessionId)).returning();

    if (!session) return res.status(404).json({ error: 'Session not found' });
    return res.json({ ...session, channelBreakdown: (channelBreakdown as any).rows ?? [] });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to close cash session' });
  }
});

router.get('/sessions/:id/summary', async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const channelBreakdown = await db.execute(sql`
      SELECT payment_method, COALESCE(SUM(total_amount), 0) as total, COUNT(*) as txn_count
      FROM sales WHERE cash_session_id = ${sessionId} AND payment_status != 'credit'
      GROUP BY payment_method
      ORDER BY total DESC
    `);

    const recentTxns = await db.execute(sql`
      SELECT s.id, s.sale_number, s.total_amount, s.payment_method, s.payment_status, s.created_at,
             c.name as customer_name
      FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.cash_session_id = ${sessionId}
      ORDER BY s.created_at DESC LIMIT 20
    `);

    const expenseBreakdown = await db.execute(sql`
      SELECT ec.name as category, COALESCE(SUM(e.amount), 0) as total
      FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id
      WHERE e.cash_session_id = ${sessionId}
      GROUP BY ec.name ORDER BY total DESC
    `);

    return res.json({
      channelBreakdown: (channelBreakdown as any).rows ?? [],
      recentTransactions: (recentTxns as any).rows ?? [],
      expenseBreakdown: (expenseBreakdown as any).rows ?? [],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch session summary' });
  }
});

export default router;
