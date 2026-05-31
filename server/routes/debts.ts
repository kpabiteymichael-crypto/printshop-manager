import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { debts, debtPayments, customers, users } from '../db/schema';
import { eq, sql, desc, ne } from 'drizzle-orm';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const rows = await db.execute(sql`
      SELECT d.id, d.total_amount, d.paid_amount, d.balance, d.due_date, d.status, d.notes, d.created_at,
             c.id as customer_id, c.name as customer_name, c.phone as customer_phone,
             s.sale_number
      FROM debts d
      JOIN customers c ON c.id = d.customer_id
      LEFT JOIN sales s ON s.id = d.sale_id
      ${status && status !== 'all' ? sql`WHERE d.status = ${status}` : sql``}
      ORDER BY d.due_date ASC NULLS LAST, d.created_at DESC
    `);
    return res.json((rows as any).rows ?? []);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch debts' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [debt] = await db.select().from(debts).where(eq(debts.id, id)).limit(1);
    if (!debt) return res.status(404).json({ error: 'Debt not found' });

    const payments = await db.execute(sql`
      SELECT dp.id, dp.amount, dp.payment_method, dp.payment_reference, dp.paid_at, dp.notes,
             u.name as paid_by_name
      FROM debt_payments dp
      LEFT JOIN users u ON u.id = dp.paid_by
      WHERE dp.debt_id = ${id}
      ORDER BY dp.paid_at DESC
    `);

    const [customer] = await db.select({ name: customers.name, phone: customers.phone })
      .from(customers).where(eq(customers.id, debt.customerId)).limit(1);

    return res.json({ ...debt, customer, payments: (payments as any).rows ?? [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch debt' });
  }
});

router.post('/:id/payments', authorize('owner', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const debtId = Number(req.params.id);
    const data = z.object({
      amount: z.string(),
      paymentMethod: z.enum(['cash', 'mtn_momo', 'telecel_cash', 'airteltigo', 'bank_transfer']).default('cash'),
      paymentReference: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const [debt] = await db.select().from(debts).where(eq(debts.id, debtId)).limit(1);
    if (!debt) return res.status(404).json({ error: 'Debt not found' });

    const payAmount = parseFloat(data.amount);
    const currentBalance = parseFloat(String(debt.balance));
    if (payAmount <= 0) return res.status(400).json({ error: 'Payment amount must be positive' });
    if (payAmount > currentBalance) return res.status(400).json({ error: 'Payment exceeds outstanding balance' });

    const [payment] = await db.insert(debtPayments).values({
      debtId,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      paymentReference: data.paymentReference,
      paidBy: req.user!.id,
      notes: data.notes,
    }).returning();

    const newPaidAmount = parseFloat(String(debt.paidAmount)) + payAmount;
    const newBalance = parseFloat(String(debt.totalAmount)) - newPaidAmount;
    const newStatus = newBalance <= 0 ? 'paid' : 'partial';

    await db.update(debts).set({
      paidAmount: String(newPaidAmount),
      balance: String(Math.max(0, newBalance)),
      status: newStatus,
      updatedAt: new Date(),
    }).where(eq(debts.id, debtId));

    return res.status(201).json({ payment, newBalance: Math.max(0, newBalance), newStatus });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    console.error(err);
    return res.status(500).json({ error: 'Failed to record payment' });
  }
});

export default router;
