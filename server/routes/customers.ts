import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { customers, sales, printJobs, debts, loyaltyPointTransactions, settings } from '../db/schema';
import { eq, ilike, sql, desc } from 'drizzle-orm';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize('owner', 'manager', 'cashier'));

const customerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  type: z.enum(['individual', 'student', 'teacher', 'school', 'business']).optional(),
});

router.get('/', async (req, res) => {
  try {
    const search = req.query.search as string | undefined;
    const type = req.query.type as string | undefined;
    let results = await db.select().from(customers).orderBy(desc(customers.createdAt));
    if (search) {
      const s = search.toLowerCase();
      results = results.filter(c =>
        c.name.toLowerCase().includes(s) ||
        c.phone?.includes(search) ||
        c.email?.toLowerCase().includes(s)
      );
    }
    if (type && type !== 'all') {
      results = results.filter(c => c.type === type);
    }
    return res.json(results);
  } catch { return res.status(500).json({ error: 'Failed to fetch customers' }); }
});

router.get('/:id/profile', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const customerSales = await db.execute(sql`
      SELECT s.id, s.sale_number, s.total_amount, s.payment_method, s.payment_status, s.created_at,
             u.name as cashier_name
      FROM sales s
      LEFT JOIN users u ON u.id = s.cashier_id
      WHERE s.customer_id = ${id}
      ORDER BY s.created_at DESC
      LIMIT 50
    `);

    const customerJobs = await db.execute(sql`
      SELECT pj.id, pj.job_number, pj.title, pj.status, pj.total_amount, pj.due_date, pj.created_at,
             u.name as operator_name, sv.name as service_name
      FROM print_jobs pj
      LEFT JOIN users u ON u.id = pj.assigned_to
      LEFT JOIN services sv ON sv.id = pj.service_id
      WHERE pj.customer_id = ${id}
      ORDER BY pj.created_at DESC
      LIMIT 50
    `);

    const customerDebts = await db.execute(sql`
      SELECT d.id, d.total_amount, d.paid_amount, d.balance, d.due_date, d.status, d.created_at,
             s.sale_number
      FROM debts d
      LEFT JOIN sales s ON s.id = d.sale_id
      WHERE d.customer_id = ${id}
      ORDER BY d.created_at DESC
    `);

    const debtSummaryResult = await db.execute(sql`
      SELECT COALESCE(SUM(balance), 0) as outstanding_balance
      FROM debts WHERE customer_id = ${id} AND status != 'paid'
    `);

    return res.json({
      ...customer,
      recentSales: (customerSales as any).rows ?? [],
      printJobs: (customerJobs as any).rows ?? [],
      debts: (customerDebts as any).rows ?? [],
      outstandingBalance: (debtSummaryResult as any).rows?.[0]?.outstanding_balance ?? 0,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch customer profile' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [c] = await db.select().from(customers).where(eq(customers.id, Number(req.params.id))).limit(1);
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    return res.json(c);
  } catch { return res.status(500).json({ error: 'Failed to fetch customer' }); }
});

router.post('/', authorize('owner', 'manager', 'cashier'), async (req, res) => {
  try {
    const data = customerSchema.parse(req.body);
    const [c] = await db.insert(customers).values(data).returning();
    return res.status(201).json(c);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to create customer' });
  }
});

router.put('/:id', authorize('owner', 'manager', 'cashier'), async (req, res) => {
  try {
    const data = customerSchema.partial().parse(req.body);
    const [c] = await db.update(customers).set({ ...data, updatedAt: new Date() }).where(eq(customers.id, Number(req.params.id))).returning();
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    return res.json(c);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to update customer' });
  }
});

router.delete('/:id', authorize('owner', 'manager'), async (req, res) => {
  try {
    await db.delete(customers).where(eq(customers.id, Number(req.params.id)));
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: 'Failed to delete customer' }); }
});

// ─── Loyalty: get point history for a customer ────────────────────────────────
router.get('/:id/loyalty-history', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await db.execute(sql`
      SELECT lpt.id, lpt.points, lpt.type, lpt.description, lpt.created_at,
             s.sale_number, u.name as staff_name
      FROM loyalty_point_transactions lpt
      LEFT JOIN sales s ON s.id = lpt.sale_id
      LEFT JOIN users u ON u.id = lpt.created_by
      WHERE lpt.customer_id = ${id}
      ORDER BY lpt.created_at DESC
    `);
    return res.json((result as any).rows ?? []);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch loyalty history' });
  }
});

// ─── Loyalty: manual point adjustment (owner/manager only) ───────────────────
router.post('/:id/loyalty-adjust', authorize('owner', 'manager'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const data = z.object({
      points: z.number().int().refine(v => v !== 0, { message: 'Points cannot be 0' }),
      reason: z.string().min(1),
    }).parse(req.body);

    const [cust] = await db.select({ loyaltyPoints: customers.loyaltyPoints })
      .from(customers).where(eq(customers.id, id)).limit(1);
    if (!cust) return res.status(404).json({ error: 'Customer not found' });

    const newTotal = cust.loyaltyPoints + data.points;
    if (newTotal < 0) {
      return res.status(400).json({ error: `Cannot deduct ${Math.abs(data.points)} pts — customer only has ${cust.loyaltyPoints} pts.` });
    }

    await db.update(customers)
      .set({ loyaltyPoints: sql`loyalty_points + ${data.points}`, updatedAt: new Date() })
      .where(eq(customers.id, id));

    await db.insert(loyaltyPointTransactions).values({
      customerId: id,
      points: data.points,
      type: 'adjusted',
      description: data.reason,
      createdBy: req.user!.id,
    });

    const [updated] = await db.select({ loyaltyPoints: customers.loyaltyPoints })
      .from(customers).where(eq(customers.id, id)).limit(1);

    return res.json({ success: true, loyaltyPoints: updated.loyaltyPoints });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0]?.message ?? 'Validation error' });
    console.error(err);
    return res.status(500).json({ error: 'Failed to adjust loyalty points' });
  }
});

export default router;
