import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import {
  sales, saleItems, products, services, inventoryItems, inventoryMovements,
  cashSessions, customers, receipts, users, debts,
} from '../db/schema';
import { eq, sql, and, ilike, or } from 'drizzle-orm';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// ─── Products for POS (with stock levels, barcode/SKU search) ────────────────
router.get('/products', async (req, res) => {
  try {
    const search = (req.query.search as string | undefined)?.trim();
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;

    const { productCategories } = await import('../db/schema');

    let list = await db.select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      price: products.price,
      unit: products.unit,
      isActive: products.isActive,
      categoryId: products.categoryId,
      description: products.description,
      categoryName: productCategories.name,
      quantityInStock: inventoryItems.quantityInStock,
      reorderLevel: inventoryItems.reorderLevel,
    })
      .from(products)
      .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
      .leftJoin(inventoryItems, eq(products.id, inventoryItems.productId))
      .where(eq(products.isActive, true));

    if (search) {
      const lc = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(lc) ||
        p.sku.toLowerCase().includes(lc) ||
        (p.description ?? '').toLowerCase().includes(lc)
      );
    }
    if (categoryId) {
      list = list.filter(p => p.categoryId === categoryId);
    }

    return res.json(list);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// ─── Services for POS ────────────────────────────────────────────────────────
router.get('/services', async (_req, res) => {
  try {
    return res.json(await db.select().from(services).where(eq(services.isActive, true)));
  } catch { return res.status(500).json({ error: 'Failed to fetch services' }); }
});

// ─── Lookup product by barcode (SKU) ─────────────────────────────────────────
router.get('/barcode/:sku', async (req, res) => {
  try {
    const { productCategories } = await import('../db/schema');
    const [item] = await db.select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      price: products.price,
      unit: products.unit,
      isActive: products.isActive,
      categoryId: products.categoryId,
      description: products.description,
      categoryName: productCategories.name,
      quantityInStock: inventoryItems.quantityInStock,
      reorderLevel: inventoryItems.reorderLevel,
    })
      .from(products)
      .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
      .leftJoin(inventoryItems, eq(products.id, inventoryItems.productId))
      .where(and(
        eq(products.sku, req.params.sku),
        eq(products.isActive, true),
      ))
      .limit(1);

    if (!item) return res.status(404).json({ error: 'Product not found for this barcode' });
    return res.json(item);
  } catch { return res.status(500).json({ error: 'Barcode lookup failed' }); }
});

// ─── Create Sale ─────────────────────────────────────────────────────────────
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

const paymentLineSchema = z.object({
  method: z.enum(['cash', 'mtn_momo', 'telecel_cash', 'airteltigo', 'bank_transfer']),
  amount: z.number().positive(),
  reference: z.string().optional(),
  amountTendered: z.number().optional(),
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
      paymentMethod: z.enum(['cash', 'mtn_momo', 'telecel_cash', 'airteltigo', 'bank_transfer']).default('cash'),
      paymentReference: z.string().optional(),
      paymentLines: z.array(paymentLineSchema).optional(),
      isCredit: z.boolean().optional(),
      creditDueDate: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    if (data.isCredit && !data.customerId) {
      return res.status(400).json({ error: 'Credit sales require a customer to be selected.' });
    }

    // Validate paymentLines sum when provided
    if (data.paymentLines && data.paymentLines.length > 0) {
      const linesTotal = data.paymentLines.reduce((s, l) => s + l.amount, 0);
      const saleTotal = parseFloat(data.totalAmount);
      if (Math.abs(linesTotal - saleTotal) > 0.01) {
        return res.status(400).json({ error: `Payment lines total (${linesTotal.toFixed(2)}) does not match sale total (${saleTotal.toFixed(2)}).` });
      }
    }

    // Validate stock for product items (outside transaction — reads only)
    // Also build inventory map for movement logging later
    const inventoryMap: Record<number, { id: number; quantityInStock: number }> = {};
    for (const item of data.items) {
      if (item.productId) {
        const [inv] = await db.select({ id: inventoryItems.id, quantityInStock: inventoryItems.quantityInStock })
          .from(inventoryItems)
          .where(eq(inventoryItems.productId, item.productId))
          .limit(1);
        if (!inv || inv.quantityInStock < item.quantity) {
          const [prod] = await db.select({ name: products.name }).from(products).where(eq(products.id, item.productId)).limit(1);
          return res.status(400).json({
            error: `Insufficient stock for "${prod?.name ?? 'product'}". Available: ${inv?.quantityInStock ?? 0}, Requested: ${item.quantity}`,
          });
        }
        inventoryMap[item.productId] = inv;
      }
    }

    const { sale, saleNumber, receiptNumber } = await db.transaction(async (tx) => {
      // Generate sale number
      const [lastSale] = await tx.select({ saleNumber: sales.saleNumber })
        .from(sales).orderBy(sql`id DESC`).limit(1);
      const nextNum = lastSale
        ? String(Number(lastSale.saleNumber.split('-')[2]) + 1).padStart(4, '0')
        : '0001';
      const saleNumber = `SL-${new Date().getFullYear()}-${nextNum}`;

      // Determine primary payment method (largest line, or the single method provided)
      let primaryMethod = data.paymentMethod;
      let primaryReference = data.paymentReference;
      if (data.paymentLines && data.paymentLines.length > 0) {
        const largest = data.paymentLines.reduce((a, b) => b.amount > a.amount ? b : a);
        primaryMethod = largest.method;
        primaryReference = largest.reference;
      }

      const [sale] = await tx.insert(sales).values({
        saleNumber,
        customerId: data.customerId,
        cashierId: req.user!.id,
        cashSessionId: data.cashSessionId,
        subtotal: data.subtotal,
        discountAmount: data.discountAmount,
        taxAmount: data.taxAmount,
        totalAmount: data.totalAmount,
        paymentMethod: primaryMethod,
        paymentReference: primaryReference,
        paymentLines: data.paymentLines ? JSON.stringify(data.paymentLines) : null,
        paymentStatus: data.isCredit ? 'credit' : 'paid',
        notes: data.notes,
      }).returning();

      await tx.insert(saleItems).values(
        data.items.map(item => ({ ...item, saleId: sale.id }))
      );

      // Deduct inventory and log movements
      for (const item of data.items) {
        if (item.productId) {
          await tx.update(inventoryItems)
            .set({ quantityInStock: sql`quantity_in_stock - ${item.quantity}`, updatedAt: new Date() })
            .where(eq(inventoryItems.productId, item.productId));

          const inv = inventoryMap[item.productId];
          if (inv) {
            const balanceAfter = inv.quantityInStock - item.quantity;
            await tx.execute(sql`
              INSERT INTO inventory_movements (inventory_item_id, type, quantity, balance_after, reason, reference_id, reference_type, created_by)
              VALUES (${inv.id}, 'sale', ${item.quantity}, ${balanceAfter}, ${'POS Sale'}, ${sale.id}, ${'sale'}, ${req.user!.id})
            `);
          }
        }
      }

      // Create debt record for credit sales
      if (data.isCredit && data.customerId) {
        await tx.insert(debts).values({
          customerId: data.customerId,
          saleId: sale.id,
          totalAmount: data.totalAmount,
          paidAmount: '0',
          balance: data.totalAmount,
          dueDate: data.creditDueDate ? new Date(data.creditDueDate) : undefined,
          status: 'open',
          createdBy: req.user!.id,
        });
      }

      // Update customer total spent
      if (data.customerId) {
        await tx.update(customers)
          .set({ totalSpent: sql`total_spent + ${parseFloat(data.totalAmount)}`, updatedAt: new Date() })
          .where(eq(customers.id, data.customerId));
      }

      // Update cash session totals — credit sales collect no cash, exclude them
      if (data.cashSessionId && !data.isCredit) {
        await tx.update(cashSessions)
          .set({ totalSales: sql`total_sales + ${parseFloat(data.totalAmount)}` })
          .where(eq(cashSessions.id, data.cashSessionId));
      }

      // Generate receipt
      const [lastReceipt] = await tx.select({ receiptNumber: receipts.receiptNumber })
        .from(receipts).orderBy(sql`id DESC`).limit(1);
      const nextRNum = lastReceipt
        ? String(Number(lastReceipt.receiptNumber.split('-')[2]) + 1).padStart(4, '0')
        : '0001';
      const receiptNumber = `RCP-${new Date().getFullYear()}-${nextRNum}`;

      await tx.insert(receipts).values({
        saleId: sale.id,
        receiptNumber,
        generatedBy: req.user!.id,
      });

      return { sale, saleNumber, receiptNumber };
    });

    return res.status(201).json({ sale, saleNumber, receiptNumber, cashierName: req.user!.name });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0]?.message ?? 'Validation error' });
    console.error(err);
    return res.status(500).json({ error: 'Failed to process sale' });
  }
});

// ─── Get Receipt by number ────────────────────────────────────────────────────
router.get('/receipt/:receiptNumber', async (req, res) => {
  try {
    const [receipt] = await db.select().from(receipts)
      .where(eq(receipts.receiptNumber, req.params.receiptNumber))
      .limit(1);
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

    const [sale] = await db.select({
      id: sales.id,
      saleNumber: sales.saleNumber,
      subtotal: sales.subtotal,
      discountAmount: sales.discountAmount,
      taxAmount: sales.taxAmount,
      totalAmount: sales.totalAmount,
      paymentMethod: sales.paymentMethod,
      paymentReference: sales.paymentReference,
      paymentLines: sales.paymentLines,
      paymentStatus: sales.paymentStatus,
      isRefunded: (sales as any).isRefunded,
      createdAt: sales.createdAt,
      customerName: customers.name,
      cashierName: users.name,
    }).from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .leftJoin(users, eq(sales.cashierId, users.id))
      .where(eq(sales.id, receipt.saleId))
      .limit(1);

    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const items = await db.select().from(saleItems).where(eq(saleItems.saleId, sale.id));

    return res.json({ receipt, sale, items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch receipt' });
  }
});

// ─── Refund Sale ─────────────────────────────────────────────────────────────
router.post('/sales/:id/refund', authorize('owner', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const saleId = Number(req.params.id);
    const { itemIds } = z.object({ itemIds: z.array(z.number()).min(1) }).parse(req.body);

    const [sale] = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const allItems = await db.select().from(saleItems).where(eq(saleItems.saleId, saleId));

    // Filter to only items requested AND not already refunded (idempotency guard)
    const selectedItems = allItems.filter(i => itemIds.includes(i.id) && !(i as any).isRefunded);
    if (selectedItems.length === 0) {
      return res.status(400).json({ error: 'No refundable items found — they may have already been refunded' });
    }

    const { refundTotal, refundReceiptNumber } = await db.transaction(async (tx) => {
      // Mark each item as refunded
      for (const item of selectedItems) {
        await tx.update(saleItems)
          .set({ isRefunded: true } as any)
          .where(eq(saleItems.id, item.id));
      }

      // Restore inventory for product items
      for (const item of selectedItems) {
        if (item.productId) {
          await tx.update(inventoryItems)
            .set({ quantityInStock: sql`quantity_in_stock + ${item.quantity}`, updatedAt: new Date() })
            .where(eq(inventoryItems.productId, item.productId));
        }
      }

      const refundTotal = selectedItems.reduce((sum, i) => sum + parseFloat(i.totalPrice), 0);

      // If all items are now refunded, mark the whole sale as refunded
      const remainingActive = allItems.filter(i => !itemIds.includes(i.id) && !(i as any).isRefunded);
      if (remainingActive.length === 0) {
        await tx.update(sales).set({ isRefunded: true } as any).where(eq(sales.id, saleId));
      }

      // Only reverse session cash totals for sales that actually collected cash
      // Credit sales were never added to totalSales, so do not subtract them here
      if (sale.cashSessionId && sale.paymentStatus !== 'credit') {
        await tx.update(cashSessions)
          .set({ totalSales: sql`total_sales - ${refundTotal}` })
          .where(eq(cashSessions.id, sale.cashSessionId));
      }

      // Generate refund receipt number
      const [lastReceipt] = await tx.select({ receiptNumber: receipts.receiptNumber })
        .from(receipts).orderBy(sql`id DESC`).limit(1);
      const nextRNum = lastReceipt
        ? String(Number(lastReceipt.receiptNumber.split('-')[2]) + 1).padStart(4, '0')
        : '0001';
      const refundReceiptNumber = `REF-${new Date().getFullYear()}-${nextRNum}`;

      await tx.insert(receipts).values({
        saleId,
        receiptNumber: refundReceiptNumber,
        generatedBy: req.user!.id,
      });

      return { refundTotal, refundReceiptNumber };
    });

    return res.json({
      success: true,
      refundTotal: refundTotal.toFixed(2),
      refundReceiptNumber,
      refundedItems: selectedItems.length,
    });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: 'Invalid request' });
    console.error(err);
    return res.status(500).json({ error: 'Failed to process refund' });
  }
});

// ─── List Sales ───────────────────────────────────────────────────────────────
router.get('/sales', authorize('owner', 'manager', 'cashier'), async (req, res) => {
  try {
    const sessionId = req.query.sessionId ? Number(req.query.sessionId) : undefined;
    const dateStr = req.query.date as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const paymentMethod = req.query.paymentMethod as string | undefined;
    const cashierId = req.query.cashierId ? Number(req.query.cashierId) : undefined;

    const conditions: any[] = [];
    if (sessionId) conditions.push(eq(sales.cashSessionId, sessionId));
    if (dateStr) {
      const start = new Date(`${dateStr}T00:00:00.000Z`);
      const end = new Date(`${dateStr}T23:59:59.999Z`);
      conditions.push(sql`sales.created_at >= ${start} AND sales.created_at <= ${end}`);
    }
    if (dateFrom) {
      const start = new Date(`${dateFrom}T00:00:00.000Z`);
      conditions.push(sql`sales.created_at >= ${start}`);
    }
    if (dateTo) {
      const end = new Date(`${dateTo}T23:59:59.999Z`);
      conditions.push(sql`sales.created_at <= ${end}`);
    }
    if (paymentMethod) conditions.push(eq(sales.paymentMethod, paymentMethod as any));
    if (cashierId) conditions.push(eq(sales.cashierId, cashierId));

    const results = await db.select({
      id: sales.id,
      saleNumber: sales.saleNumber,
      cashSessionId: sales.cashSessionId,
      cashierId: sales.cashierId,
      totalAmount: sales.totalAmount,
      paymentMethod: sales.paymentMethod,
      paymentStatus: sales.paymentStatus,
      createdAt: sales.createdAt,
      customerName: customers.name,
      cashierName: users.name,
    }).from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .leftJoin(users, eq(sales.cashierId, users.id))
      .where(conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(sql`sales.created_at DESC`);

    return res.json(results);
  } catch { return res.status(500).json({ error: 'Failed to fetch sales' }); }
});

// ─── Get Single Sale ──────────────────────────────────────────────────────────
router.get('/sales/:id', authorize('owner', 'manager', 'cashier'), async (req, res) => {
  try {
    const [sale] = await db.select({
      id: sales.id,
      saleNumber: sales.saleNumber,
      subtotal: sales.subtotal,
      discountAmount: sales.discountAmount,
      taxAmount: sales.taxAmount,
      totalAmount: sales.totalAmount,
      paymentMethod: sales.paymentMethod,
      paymentStatus: sales.paymentStatus,
      createdAt: sales.createdAt,
      customerName: customers.name,
      cashierName: users.name,
    }).from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .leftJoin(users, eq(sales.cashierId, users.id))
      .where(eq(sales.id, Number(req.params.id)))
      .limit(1);

    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    const items = await db.select().from(saleItems).where(eq(saleItems.saleId, sale.id));
    const [receipt] = await db.select().from(receipts)
      .where(eq(receipts.saleId, sale.id))
      .orderBy(sql`id ASC`)
      .limit(1);
    return res.json({ ...sale, items, receiptNumber: receipt?.receiptNumber });
  } catch { return res.status(500).json({ error: 'Failed to fetch sale' }); }
});

export default router;
