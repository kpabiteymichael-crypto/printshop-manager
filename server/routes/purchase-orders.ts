import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { purchaseOrders, purchaseOrderItems, suppliers, products, inventoryItems } from '../db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize('owner', 'manager', 'inventory_officer'));

router.get('/', async (_req, res) => {
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

router.get('/:id', async (req, res) => {
  try {
    const po = await db.execute(sql`
      SELECT
        po.id, po.po_number, po.status, po.total_amount, po.notes,
        po.ordered_at, po.expected_delivery_at, po.received_at, po.created_at,
        s.name AS supplier_name,
        u.name AS ordered_by_name,
        json_agg(
          json_build_object(
            'id', poi.id,
            'productId', poi.product_id,
            'productName', p.name,
            'productSku', p.sku,
            'quantity', poi.quantity,
            'unitPrice', poi.unit_price,
            'totalPrice', poi.total_price
          )
        ) FILTER (WHERE poi.id IS NOT NULL) AS items
      FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      LEFT JOIN users u ON u.id = po.ordered_by
      LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      LEFT JOIN products p ON p.id = poi.product_id
      WHERE po.id = ${Number(req.params.id)}
      GROUP BY po.id, s.name, u.name
    `);
    const rows = (po as any).rows;
    if (!rows?.length) return res.status(404).json({ error: 'Purchase order not found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
});

router.post('/', authorize('owner', 'manager', 'inventory_officer'), async (req: AuthRequest, res) => {
  try {
    const data = z.object({
      supplierId: z.number(),
      notes: z.string().optional(),
      expectedDeliveryAt: z.string().optional(),
      items: z.array(z.object({
        productId: z.number(),
        quantity: z.number().int().min(1),
        unitPrice: z.string(),
      })).min(1),
    }).parse(req.body);

    const year = new Date().getFullYear();
    const countResult = await db.execute(sql`
      SELECT COUNT(*) AS count FROM purchase_orders WHERE EXTRACT(YEAR FROM created_at) = ${year}
    `);
    const count = Number((countResult as any).rows?.[0]?.count ?? 0) + 1;
    const poNumber = `PO-${year}-${String(count).padStart(4, '0')}`;

    const totalAmount = data.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);

    const [po] = await db.insert(purchaseOrders).values({
      poNumber,
      supplierId: data.supplierId,
      totalAmount: totalAmount.toFixed(2),
      notes: data.notes,
      expectedDeliveryAt: data.expectedDeliveryAt ? new Date(data.expectedDeliveryAt) : undefined,
      status: 'draft',
    }).returning();

    for (const item of data.items) {
      await db.insert(purchaseOrderItems).values({
        purchaseOrderId: po.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: (Number(item.unitPrice) * item.quantity).toFixed(2),
      });
    }

    return res.status(201).json(po);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    console.error(err);
    return res.status(500).json({ error: 'Failed to create purchase order' });
  }
});

router.put('/:id/status', authorize('owner', 'manager', 'inventory_officer'), async (req: AuthRequest, res) => {
  try {
    const { status } = z.object({ status: z.enum(['draft', 'ordered', 'partial', 'received', 'cancelled']) }).parse(req.body);
    const [po] = await db.update(purchaseOrders).set({
      status,
      orderedBy: status === 'ordered' ? req.user!.id : undefined,
      orderedAt: status === 'ordered' ? new Date() : undefined,
      updatedAt: new Date(),
    }).where(eq(purchaseOrders.id, Number(req.params.id))).returning();
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });
    return res.json(po);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to update purchase order status' });
  }
});

router.put('/:id/receive', authorize('owner', 'manager', 'inventory_officer'), async (req: AuthRequest, res) => {
  try {
    const poId = Number(req.params.id);
    const { lines } = z.object({
      lines: z.array(z.object({
        lineItemId: z.number(),
        deliveredQuantity: z.number().int().min(0),
      })).optional(),
    }).parse(req.body);

    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).limit(1);
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });
    if (po.status === 'received') return res.status(400).json({ error: 'PO already received' });
    if (po.status === 'cancelled') return res.status(400).json({ error: 'Cannot receive a cancelled PO' });

    const allItems = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, poId));

    const deliveryMap: Record<number, number> = {};
    if (lines && lines.length > 0) {
      for (const l of lines) deliveryMap[l.lineItemId] = l.deliveredQuantity;
    } else {
      for (const item of allItems) deliveryMap[item.id] = item.quantity - item.receivedQuantity;
    }

    const updated = await db.transaction(async (tx) => {
      for (const item of allItems) {
        const requested = deliveryMap[item.id] ?? 0;
        const remaining = item.quantity - item.receivedQuantity;
        const delivered = Math.max(0, Math.min(requested, remaining));
        if (delivered <= 0) continue;

        const newReceived = item.receivedQuantity + delivered;
        await tx.update(purchaseOrderItems)
          .set({ receivedQuantity: newReceived })
          .where(eq(purchaseOrderItems.id, item.id));

        const [invItem] = await tx.select().from(inventoryItems).where(eq(inventoryItems.productId, item.productId)).limit(1);
        if (invItem) {
          const newQty = invItem.quantityInStock + delivered;
          await tx.update(inventoryItems).set({
            quantityInStock: newQty,
            lastRestockedAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(inventoryItems.id, invItem.id));

          await tx.execute(sql`
            INSERT INTO inventory_movements (inventory_item_id, type, quantity, balance_after, cost_price, supplier_id, invoice_ref, reason, reference_id, reference_type, created_by)
            VALUES (${invItem.id}, 'in', ${delivered}, ${newQty}, ${item.unitPrice}, ${po.supplierId}, ${po.poNumber}, ${'Purchase Order received'}, ${poId}, ${'purchase_order'}, ${req.user!.id})
          `);
        }
      }

      const freshItems = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, poId));
      const allDone = freshItems.every(i => i.receivedQuantity >= i.quantity);
      const anyDone = freshItems.some(i => i.receivedQuantity > 0);
      const newStatus = !anyDone ? po.status : allDone ? 'received' : 'partial';

      const [result] = await tx.update(purchaseOrders).set({
        status: newStatus,
        receivedAt: allDone ? new Date() : undefined,
        updatedAt: new Date(),
      }).where(eq(purchaseOrders.id, poId)).returning();
      return result;
    });

    return res.json(updated);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    console.error(err);
    return res.status(500).json({ error: 'Failed to receive purchase order' });
  }
});

export default router;
