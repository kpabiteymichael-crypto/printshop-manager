import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import {
  sales, saleItems, products, services, inventoryItems, inventoryMovements,
  cashSessions, customers, receipts, users, debts, loyaltyPointTransactions, settings,
} from '../db/schema';
import { eq, sql, and } from 'drizzle-orm';
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
      pointsToRedeem: z.number().int().min(0).optional().default(0),
    }).parse(req.body);

    if (data.isCredit && !data.customerId) {
      return res.status(400).json({ error: 'Credit sales require a customer to be selected.' });
    }

    if (data.pointsToRedeem && !data.customerId) {
      return res.status(400).json({ error: 'A customer must be selected to redeem loyalty points.' });
    }

    // Validate paymentLines sum when provided
    if (data.paymentLines && data.paymentLines.length > 0) {
      const linesTotal = data.paymentLines.reduce((s, l) => s + l.amount, 0);
      const saleTotal = parseFloat(data.totalAmount);
      if (Math.abs(linesTotal - saleTotal) > 0.01) {
        return res.status(400).json({ error: `Payment lines total (${linesTotal.toFixed(2)}) does not match sale total (${saleTotal.toFixed(2)}).` });
      }
    }

    // Validate loyalty points redemption — enforce all business rules server-side
    if (data.pointsToRedeem && data.pointsToRedeem > 0 && data.customerId) {
      // Fetch loyalty settings to enforce rules independently of client
      const loyaltySettingRows = await db.select().from(settings)
        .where(sql`key IN ('loyalty_enabled', 'loyalty_points_per_cedis', 'loyalty_min_redeem')`);
      const lsMap: Record<string, string> = {};
      loyaltySettingRows.forEach(r => { lsMap[r.key] = r.value; });
      const loyaltyEnabled = (lsMap['loyalty_enabled'] ?? 'true') !== 'false';
      if (!loyaltyEnabled) {
        return res.status(400).json({ error: 'Loyalty programme is currently disabled.' });
      }
      const pointsPerCedisRaw = parseFloat(lsMap['loyalty_points_per_cedis'] ?? '100');
      const pointsPerCedis = isFinite(pointsPerCedisRaw) && pointsPerCedisRaw > 0 ? pointsPerCedisRaw : 100;
      const minRedeemRaw = parseInt(lsMap['loyalty_min_redeem'] ?? '100', 10);
      const minRedeem = isFinite(minRedeemRaw) && minRedeemRaw >= 0 ? minRedeemRaw : 100;

      // Enforce minimum redemption threshold
      if (data.pointsToRedeem < minRedeem) {
        return res.status(400).json({ error: `Minimum redemption is ${minRedeem} points. You are attempting to redeem ${data.pointsToRedeem} points.` });
      }

      // Enforce max redemption: cannot redeem more value than the subtotal
      const subtotalVal = parseFloat(data.subtotal);
      const maxRedeemablePoints = Math.floor(subtotalVal * pointsPerCedis);
      if (data.pointsToRedeem > maxRedeemablePoints) {
        return res.status(400).json({ error: `Cannot redeem more than ${maxRedeemablePoints} points against this sale (subtotal GH₵${subtotalVal.toFixed(2)}).` });
      }

      // Verify financial consistency: loyalty discount must align with points submitted
      const loyaltyDiscountValue = data.pointsToRedeem / pointsPerCedis;
      const declaredDiscount = parseFloat(data.discountAmount);
      if (declaredDiscount + 0.02 < loyaltyDiscountValue) {
        return res.status(400).json({ error: 'Declared discount amount is inconsistent with loyalty points redeemed.' });
      }

      // Verify total is plausible: total ≈ subtotal - discount (within 1 cent)
      const expectedTotal = subtotalVal - declaredDiscount;
      const submittedTotal = parseFloat(data.totalAmount);
      if (Math.abs(submittedTotal - expectedTotal) > 0.02) {
        return res.status(400).json({ error: `Sale total (${submittedTotal.toFixed(2)}) does not match subtotal minus discount (${expectedTotal.toFixed(2)}).` });
      }

      // Verify customer has enough points
      const [cust] = await db.select({ loyaltyPoints: customers.loyaltyPoints })
        .from(customers).where(eq(customers.id, data.customerId)).limit(1);
      if (!cust || cust.loyaltyPoints < data.pointsToRedeem) {
        return res.status(400).json({ error: `Customer only has ${cust?.loyaltyPoints ?? 0} loyalty points available.` });
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

      // Update customer total spent + handle loyalty points
      if (data.customerId) {
        await tx.update(customers)
          .set({ totalSpent: sql`total_spent + ${parseFloat(data.totalAmount)}`, updatedAt: new Date() })
          .where(eq(customers.id, data.customerId));

        // Fetch loyalty settings
        const settingsRows = await tx.select().from(settings)
          .where(sql`key IN ('loyalty_earn_rate', 'loyalty_points_per_cedis', 'loyalty_enabled')`);
        const sMap: Record<string, string> = {};
        settingsRows.forEach(r => { sMap[r.key] = r.value; });
        const loyaltyEnabled = (sMap['loyalty_enabled'] ?? 'true') !== 'false';
        const earnRateRaw = parseFloat(sMap['loyalty_earn_rate'] ?? '1');
        const earnRate = isFinite(earnRateRaw) && earnRateRaw >= 0 ? earnRateRaw : 1;
        const pointsPerCedisRaw2 = parseFloat(sMap['loyalty_points_per_cedis'] ?? '100');
        const txPointsPerCedis = isFinite(pointsPerCedisRaw2) && pointsPerCedisRaw2 > 0 ? pointsPerCedisRaw2 : 100;

        const pointsRedeemed = data.pointsToRedeem ?? 0;
        const pointsEarned = loyaltyEnabled && !data.isCredit
          ? Math.floor(parseFloat(data.totalAmount) * earnRate)
          : 0;

        // Atomically deduct redeemed points: use conditional WHERE to prevent going negative
        if (pointsRedeemed > 0) {
          const deductResult = await tx.execute(sql`
            UPDATE customers SET loyalty_points = loyalty_points - ${pointsRedeemed}, updated_at = NOW()
            WHERE id = ${data.customerId} AND loyalty_points >= ${pointsRedeemed}
            RETURNING id
          `);
          const deducted = ((deductResult as any).rows ?? []).length;
          if (!deducted) {
            throw new Error('Insufficient loyalty points — possible concurrent update. Please retry the sale.');
          }
        }

        // Award earned points
        if (pointsEarned > 0) {
          await tx.update(customers)
            .set({ loyaltyPoints: sql`loyalty_points + ${pointsEarned}`, updatedAt: new Date() })
            .where(eq(customers.id, data.customerId));
        }

        // Update sale with points data
        await tx.execute(sql`
          UPDATE sales SET points_earned = ${pointsEarned}, points_redeemed = ${pointsRedeemed}
          WHERE id = ${sale.id}
        `);

        // Record point transactions
        if (pointsEarned > 0) {
          await tx.insert(loyaltyPointTransactions).values({
            customerId: data.customerId,
            points: pointsEarned,
            type: 'earned',
            saleId: sale.id,
            description: `Earned from sale ${saleNumber}`,
            createdBy: req.user!.id,
          });
        }
        if (pointsRedeemed > 0) {
          const cedisValue = pointsRedeemed / txPointsPerCedis;
          await tx.insert(loyaltyPointTransactions).values({
            customerId: data.customerId,
            points: -pointsRedeemed,
            type: 'redeemed',
            saleId: sale.id,
            description: `Redeemed ${pointsRedeemed} pts (GH₵${cedisValue.toFixed(2)} off) on sale ${saleNumber}`,
            createdBy: req.user!.id,
          });
        }
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
