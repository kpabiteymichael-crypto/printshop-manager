import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { customers } from '../db/schema';
import { eq, ilike, sql } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const customerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/', async (req, res) => {
  try {
    const search = req.query.search as string | undefined;
    let query = db.select().from(customers);
    if (search) {
      return res.json(await db.select().from(customers).where(ilike(customers.name, `%${search}%`)));
    }
    return res.json(await query);
  } catch { return res.status(500).json({ error: 'Failed to fetch customers' }); }
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

export default router;
