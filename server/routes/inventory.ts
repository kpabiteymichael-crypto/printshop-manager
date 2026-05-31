import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { inventoryItems, inventoryMovements, products, productCategories } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res) => {
  try {
    const items = await db.select({
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
      categoryName: productCategories.name,
    })
      .from(inventoryItems)
      .leftJoin(products, eq(inventoryItems.productId, products.id))
      .leftJoin(productCategories, eq(products.categoryId, productCategories.id));
    return res.json(items);
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

router.get('/:id/movements', async (req, res) => {
  try {
    const movements = await db.select().from(inventoryMovements)
      .where(eq(inventoryMovements.inventoryItemId, Number(req.params.id)));
    return res.json(movements);
  } catch { return res.status(500).json({ error: 'Failed to fetch movements' }); }
});

router.post('/adjust', authorize('owner', 'manager', 'inventory_officer'), async (req: AuthRequest, res) => {
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

    await db.insert(inventoryMovements).values({
      inventoryItemId: data.inventoryItemId,
      type: data.type,
      quantity: data.quantity,
      reason: data.reason,
      createdBy: req.user!.id,
    });

    return res.json({ success: true, newQuantity: newQty });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to adjust inventory' });
  }
});

export default router;
