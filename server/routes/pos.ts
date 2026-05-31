import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { sales, saleItems, products, inventoryItems, cashSessions, customers, receipts } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const saleItemSchema = z.object({
  productId: z.number().optional(),
  serviceId: z.number().optional(),
  printJobId: z.number().optional(),
  description: z.string(),
  quantity: z.number().min(1),
  unitPrice: z.string(),
  discount: z.string().default('0'),
  totalPrice: z.string(),
});

router.post('/sale', authorize('owner', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const data = z.object({
      customerId: z.number().optional(),
      cashSessionId: z.number().optional(),
      items: z.array(saleItemSchema).min(1),
      subtotal: z.string(),
      discountAmount: z.string().default('0'),
      taxAmount: z.string().default('0'),
      totalAmount: z.string(),
      paymentMethod: z.enum(['cash', 'card', 'transfer', 'gcash', 'maya', 'credit']).default('cash'),
      notes: z.string().optional(),
    }).parse(req.body);

    // Generate sale number
    const [lastSale] = await db.select({ saleNumber: sales.saleNumber })
      .from(sales).orderBy(sql`id DESC`).limit(1);
    const nextNum = lastSale
      ? String(Number(lastSale.saleNumber.split('-')[2]) + 1).padStart(4, '0')
      : '0001';
    const saleNumber = `SL-${new Date().getFullYear()}-${nextNum}`;

    const [sale] = await db.insert(sales).values({
      saleNumber,
      customerId: data.customerId,
      cashierId: req.user!.id,
      cashSessionId: data.cashSessionId,
      subtotal: data.subtotal,
      discountAmount: data.discountAmount,
      taxAmount: data.taxAmount,
      totalAmount: data.totalAmount,
      paymentMethod: data.paymentMethod,
      paymentStatus: 'paid',
      notes: data.notes,
    }).returning();

    await db.insert(saleItems).values(
      data.items.map(item => ({ ...item, saleId: sale.id }))
    );

    // Deduct inventory for product items
    for (const item of data.items) {
      if (item.productId) {
        await db.update(inventoryItems)
          .set({ quantityInStock: sql`quantity_in_stock - ${item.quantity}`, updatedAt: new Date() })
          .where(eq(inventoryItems.productId, item.productId));
      }
    }

    // Update cash session totals
    if (data.cashSessionId) {
      await db.update(cashSessions)
        .set({ totalSales: sql`total_sales + ${parseFloat(data.totalAmount)}` })
        .where(eq(cashSessions.id, data.cashSessionId));
    }

    // Generate receipt
    const [lastReceipt] = await db.select({ receiptNumber: receipts.receiptNumber })
      .from(receipts).orderBy(sql`id DESC`).limit(1);
    const nextRNum = lastReceipt
      ? String(Number(lastReceipt.receiptNumber.split('-')[2]) + 1).padStart(4, '0')
      : '0001';
    const receiptNumber = `RC-${new Date().getFullYear()}-${nextRNum}`;

    await db.insert(receipts).values({
      saleId: sale.id,
      receiptNumber,
      generatedBy: req.user!.id,
    });

    return res.status(201).json({ sale, saleNumber, receiptNumber });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    console.error(err);
    return res.status(500).json({ error: 'Failed to process sale' });
  }
});

router.get('/sales', async (req, res) => {
  try {
    const sessionId = req.query.sessionId ? Number(req.query.sessionId) : undefined;
    const { and } = await import('drizzle-orm');
    const conditions = sessionId
      ? and(eq(sales.cashSessionId, sessionId))
      : undefined;

    const results = await db.select({
      id: sales.id,
      saleNumber: sales.saleNumber,
      cashSessionId: sales.cashSessionId,
      totalAmount: sales.totalAmount,
      paymentMethod: sales.paymentMethod,
      paymentStatus: sales.paymentStatus,
      createdAt: sales.createdAt,
      customerName: customers.name,
    }).from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(conditions)
      .orderBy(sql`sales.created_at DESC`);

    return res.json(results);
  } catch { return res.status(500).json({ error: 'Failed to fetch sales' }); }
});

router.get('/sales/:id', async (req, res) => {
  try {
    const [sale] = await db.select().from(sales).where(eq(sales.id, Number(req.params.id))).limit(1);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    const items = await db.select().from(saleItems).where(eq(saleItems.saleId, sale.id));
    return res.json({ ...sale, items });
  } catch { return res.status(500).json({ error: 'Failed to fetch sale' }); }
});

export default router;
