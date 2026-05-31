import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { expenses, expenseCategories, users } from '../db/schema';
import { eq, desc, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/categories', async (_req, res) => {
  try { return res.json(await db.select().from(expenseCategories)); }
  catch { return res.status(500).json({ error: 'Failed to fetch categories' }); }
});

router.get('/', async (req, res) => {
  try {
    const { from, to, category } = req.query as { from?: string; to?: string; category?: string };
    let list = await db.select({
      id: expenses.id,
      description: expenses.description,
      amount: expenses.amount,
      paymentMethod: expenses.paymentMethod,
      referenceNumber: expenses.referenceNumber,
      expenseDate: expenses.expenseDate,
      notes: expenses.notes,
      createdAt: expenses.createdAt,
      categoryId: expenses.categoryId,
      categoryName: expenseCategories.name,
      recordedByName: users.name,
    })
      .from(expenses)
      .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
      .leftJoin(users, eq(expenses.recordedBy, users.id))
      .orderBy(desc(expenses.expenseDate));

    if (from) {
      const fromDate = new Date(from);
      list = list.filter(e => new Date(e.expenseDate) >= fromDate);
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      list = list.filter(e => new Date(e.expenseDate) <= toDate);
    }
    if (category && category !== 'all') {
      list = list.filter(e => String(e.categoryId) === category);
    }
    return res.json(list);
  } catch { return res.status(500).json({ error: 'Failed to fetch expenses' }); }
});

router.post('/', authorize('owner', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const data = z.object({
      categoryId: z.number().optional(),
      cashSessionId: z.number().optional(),
      description: z.string().min(1),
      amount: z.string(),
      paymentMethod: z.enum(['cash', 'mtn_momo', 'telecel_cash', 'airteltigo', 'bank_transfer']).default('cash'),
      referenceNumber: z.string().optional(),
      expenseDate: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const [exp] = await db.insert(expenses).values({
      ...data,
      expenseDate: data.expenseDate ? new Date(data.expenseDate) : new Date(),
      recordedBy: req.user!.id,
    }).returning();
    return res.status(201).json(exp);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to create expense' });
  }
});

router.delete('/:id', authorize('owner', 'manager'), async (req, res) => {
  try {
    await db.delete(expenses).where(eq(expenses.id, Number(req.params.id)));
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: 'Failed to delete expense' }); }
});

export default router;
