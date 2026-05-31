import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { suppliers, purchaseOrders, purchaseOrderItems, products } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res) => {
  try { return res.json(await db.select().from(suppliers)); }
  catch { return res.status(500).json({ error: 'Failed to fetch suppliers' }); }
});

router.post('/', authorize('owner', 'manager', 'inventory_officer'), async (req, res) => {
  try {
    const data = z.object({
      name: z.string().min(1),
      contactName: z.string().optional(),
      email: z.string().email().optional().or(z.literal('')),
      phone: z.string().optional(),
      address: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const [s] = await db.insert(suppliers).values(data).returning();
    return res.status(201).json(s);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to create supplier' });
  }
});

router.put('/:id', authorize('owner', 'manager', 'inventory_officer'), async (req, res) => {
  try {
    const [s] = await db.update(suppliers).set({ ...req.body, updatedAt: new Date() }).where(eq(suppliers.id, Number(req.params.id))).returning();
    if (!s) return res.status(404).json({ error: 'Supplier not found' });
    return res.json(s);
  } catch { return res.status(500).json({ error: 'Failed to update supplier' }); }
});

router.delete('/:id', authorize('owner', 'manager'), async (req, res) => {
  try {
    await db.update(suppliers).set({ isActive: false }).where(eq(suppliers.id, Number(req.params.id)));
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: 'Failed to delete supplier' }); }
});

router.get('/purchase-orders', async (_req, res) => {
  try {
    const pos = await db.select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      status: purchaseOrders.status,
      totalAmount: purchaseOrders.totalAmount,
      orderedAt: purchaseOrders.orderedAt,
      receivedAt: purchaseOrders.receivedAt,
      createdAt: purchaseOrders.createdAt,
      supplierName: suppliers.name,
    })
      .from(purchaseOrders)
      .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .orderBy(desc(purchaseOrders.createdAt));
    return res.json(pos);
  } catch { return res.status(500).json({ error: 'Failed to fetch purchase orders' }); }
});

export default router;
