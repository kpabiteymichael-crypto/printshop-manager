import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { inventoryItems, inventoryMovements, products, productCategories, suppliers, users } from '../db/schema';
import { eq, sql, and, lte, gt } from 'drizzle-orm';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize('owner', 'manager', 'inventory_officer'));

router.get('/alerts', async (_req, res) => {
  try {
    const items = await db.select({
      id: inventoryItems.id,
      productId: inventoryItems.productId,
      quantityInStock: inventoryItems.quantityInStock,
      reorderLevel: inventoryItems.reorderLevel,
      productName: products.name,
      productSku: products.sku,
    })
      .from(inventoryItems)
      .leftJoin(products, eq(inventoryItems.productId, products.id))
      .where(sql`inventory_items.quantity_in_stock <= inventory_items.reorder_level`);
    return res.json(items);
  } catch { return res.status(500).json({ error: 'Failed to fetch alerts' }); }
});

router.get('/', async (req, res) => {
  try {
    const { category, lowStock, outOfStock } = req.query;
    let query = db.select({
      id: inventoryItems.id,
      productId: inventoryItems.productId,
      quantityInStock: inventoryItems.quantityInStock,
      reorderLevel: inventoryItems.reorderLevel,
      location: inventoryItems.location,
      lastRestockedAt: inventoryItems.lastRestockedAt,
      updatedAt: inventoryItems.updatedAt,
      productName: products.name,
      productSku: products.sku,
      productUnit: products.unit,
      productPrice: products.price,
      productCostPrice: products.costPrice,
      categoryId: products.categoryId,
      categoryName: productCategories.name,
    })
      .from(inventoryItems)
      .leftJoin(products, eq(inventoryItems.productId, products.id))
      .leftJoin(productCategories, eq(products.categoryId, productCategories.id));

    const items = await query;

    let filtered = items;
    if (category) filtered = filtered.filter(i => i.categoryId === Number(category));
    if (outOfStock === 'true') filtered = filtered.filter(i => i.quantityInStock === 0);
    else if (lowStock === 'true') filtered = filtered.filter(i => i.quantityInStock <= i.reorderLevel);

    const totalValue = filtered.reduce((sum, i) => {
      return sum + (Number(i.productCostPrice) * i.quantityInStock);
    }, 0);

    return res.json({ items: filtered, totalValue, lowStockCount: items.filter(i => i.quantityInStock <= i.reorderLevel && i.quantityInStock > 0).length, outOfStockCount: items.filter(i => i.quantityInStock === 0).length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

router.get('/low-stock', async (_req, res) => {
  try {
    const items = await db.select({
      id: inventoryItems.id,
      productId: inventoryItems.productId,
      quantityInStock: inventoryItems.quantityInStock,
      reorderLevel: inventoryItems.reorderLevel,
      productName: products.name,
      productSku: products.sku,
    })
      .from(inventoryItems)
      .leftJoin(products, eq(inventoryItems.productId, products.id))
      .where(sql`inventory_items.quantity_in_stock <= inventory_items.reorder_level`);
    return res.json(items);
  } catch { return res.status(500).json({ error: 'Failed to fetch low stock items' }); }
});

router.get('/history', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const type = (req.query.type as string | undefined)?.trim();

    const baseWhere = type ? sql`WHERE m.type = ${type}` : sql`WHERE 1=1`;

    const movements = await db.execute(sql`
      SELECT
        m.id,
        m.inventory_item_id,
        m.type,
        m.quantity,
        m.balance_after,
        m.cost_price,
        m.invoice_ref,
        m.reason,
        m.reference_type,
        m.created_at,
        u.name   AS created_by_name,
        s.name   AS supplier_name,
        p.name   AS product_name,
        p.sku    AS product_sku
      FROM inventory_movements m
      LEFT JOIN users          u  ON m.created_by        = u.id
      LEFT JOIN suppliers      s  ON m.supplier_id       = s.id
      LEFT JOIN inventory_items ii ON m.inventory_item_id = ii.id
      LEFT JOIN products       p  ON ii.product_id       = p.id
      ${baseWhere}
      ORDER BY m.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countResult = await db.execute(sql`
      SELECT COUNT(*) AS count
      FROM inventory_movements m
      ${baseWhere}
    `);

    return res.json({
      movements: (movements as any).rows,
      total: Number((countResult as any).rows?.[0]?.count ?? 0),
      page,
      limit,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch movement history' });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const movements = await db.execute(sql`
      SELECT
        m.id,
        m.inventory_item_id,
        m.type,
        m.quantity,
        m.balance_after,
        m.cost_price,
        m.invoice_ref,
        m.reason,
        m.reference_type,
        m.created_at,
        u.name as created_by_name,
        s.name as supplier_name
      FROM inventory_movements m
      LEFT JOIN users u ON m.created_by = u.id
      LEFT JOIN suppliers s ON m.supplier_id = s.id
      WHERE m.inventory_item_id = ${Number(req.params.id)}
      ORDER BY m.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM inventory_movements WHERE inventory_item_id = ${Number(req.params.id)}
    `);

    return res.json({
      movements: (movements as any).rows,
      total: Number((countResult as any).rows?.[0]?.count ?? 0),
      page,
      limit,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch movements' });
  }
});

router.post('/stock-in', authorize('owner', 'manager', 'inventory_officer'), async (req: AuthRequest, res) => {
  try {
    const data = z.object({
      inventoryItemId: z.number(),
      quantity: z.number().int().min(1),
      costPrice: z.string().optional(),
      supplierId: z.number().optional(),
      invoiceRef: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, data.inventoryItemId)).limit(1);
    if (!item) return res.status(404).json({ error: 'Inventory item not found' });

    const newQty = item.quantityInStock + data.quantity;

    await db.update(inventoryItems).set({
      quantityInStock: newQty,
      lastRestockedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(inventoryItems.id, data.inventoryItemId));

    await db.execute(sql`
      INSERT INTO inventory_movements (inventory_item_id, type, quantity, balance_after, cost_price, supplier_id, invoice_ref, reason, created_by)
      VALUES (${data.inventoryItemId}, 'in', ${data.quantity}, ${newQty}, ${data.costPrice ?? null}, ${data.supplierId ?? null}, ${data.invoiceRef ?? null}, ${data.notes ?? null}, ${req.user!.id})
    `);

    return res.json({ success: true, newQuantity: newQty });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to stock in' });
  }
});

router.post('/stock-out', authorize('owner', 'manager', 'inventory_officer'), async (req: AuthRequest, res) => {
  try {
    const data = z.object({
      inventoryItemId: z.number(),
      quantity: z.number().int().min(1),
      reason: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, data.inventoryItemId)).limit(1);
    if (!item) return res.status(404).json({ error: 'Inventory item not found' });

    const newQty = item.quantityInStock - data.quantity;
    if (newQty < 0) return res.status(400).json({ error: 'Insufficient stock' });

    await db.update(inventoryItems).set({
      quantityInStock: newQty,
      updatedAt: new Date(),
    }).where(eq(inventoryItems.id, data.inventoryItemId));

    await db.execute(sql`
      INSERT INTO inventory_movements (inventory_item_id, type, quantity, balance_after, reason, created_by)
      VALUES (${data.inventoryItemId}, 'out', ${data.quantity}, ${newQty}, ${data.reason ?? data.notes ?? null}, ${req.user!.id})
    `);

    return res.json({ success: true, newQuantity: newQty });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to stock out' });
  }
});

router.post('/adjustment', authorize('owner', 'manager', 'inventory_officer'), async (req: AuthRequest, res) => {
  return handleAdjust(req, res);
});

router.post('/adjust', authorize('owner', 'manager', 'inventory_officer'), async (req: AuthRequest, res) => {
  return handleAdjust(req, res);
});

async function handleAdjust(req: AuthRequest, res: any) {
  try {
    const data = z.object({
      inventoryItemId: z.number(),
      type: z.enum(['in', 'out', 'adjustment']),
      quantity: z.number().min(1),
      reason: z.string().optional(),
    }).parse(req.body);

    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, data.inventoryItemId)).limit(1);
    if (!item) return res.status(404).json({ error: 'Inventory item not found' });

    const newQty = data.type === 'in'
      ? item.quantityInStock + data.quantity
      : data.type === 'out'
        ? item.quantityInStock - data.quantity
        : data.quantity;

    if (newQty < 0) return res.status(400).json({ error: 'Insufficient stock' });

    await db.update(inventoryItems).set({
      quantityInStock: newQty,
      lastRestockedAt: data.type === 'in' ? new Date() : item.lastRestockedAt,
      updatedAt: new Date(),
    }).where(eq(inventoryItems.id, data.inventoryItemId));

    await db.execute(sql`
      INSERT INTO inventory_movements (inventory_item_id, type, quantity, balance_after, reason, created_by)
      VALUES (${data.inventoryItemId}, ${data.type}, ${data.quantity}, ${newQty}, ${data.reason ?? null}, ${req.user!.id})
    `);

    return res.json({ success: true, newQuantity: newQty });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to adjust inventory' });
  }
}

export default router;
