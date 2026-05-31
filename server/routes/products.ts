import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { products, productCategories, inventoryItems, services } from '../db/schema';
import { eq, ilike } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

router.get('/categories', async (_req, res) => {
  try { return res.json(await db.select().from(productCategories)); }
  catch { return res.status(500).json({ error: 'Failed to fetch categories' }); }
});

router.get('/services', async (_req, res) => {
  try {
    return res.json(await db.select().from(services).where(eq(services.isActive, true)));
  } catch { return res.status(500).json({ error: 'Failed to fetch services' }); }
});

router.get('/', async (req, res) => {
  try {
    const search = req.query.search as string | undefined;
    const list = await db.select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      price: products.price,
      costPrice: products.costPrice,
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
      .leftJoin(inventoryItems, eq(products.id, inventoryItems.productId));
    return res.json(search ? list.filter(p => p.name.toLowerCase().includes(search.toLowerCase())) : list);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [p] = await db.select().from(products).where(eq(products.id, Number(req.params.id))).limit(1);
    if (!p) return res.status(404).json({ error: 'Product not found' });
    return res.json(p);
  } catch { return res.status(500).json({ error: 'Failed to fetch product' }); }
});

router.post('/', authorize('owner', 'manager', 'inventory_officer'), async (req, res) => {
  try {
    const data = z.object({
      categoryId: z.number().optional(),
      name: z.string().min(1),
      sku: z.string().min(1),
      description: z.string().optional(),
      price: z.string(),
      costPrice: z.string().optional(),
      unit: z.string().optional(),
    }).parse(req.body);
    const [p] = await db.insert(products).values(data).returning();
    await db.insert(inventoryItems).values({ productId: p.id, quantityInStock: 0, reorderLevel: 10 });
    return res.status(201).json(p);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to create product' });
  }
});

router.put('/:id', authorize('owner', 'manager', 'inventory_officer'), async (req, res) => {
  try {
    const [p] = await db.update(products).set({ ...req.body, updatedAt: new Date() }).where(eq(products.id, Number(req.params.id))).returning();
    if (!p) return res.status(404).json({ error: 'Product not found' });
    return res.json(p);
  } catch { return res.status(500).json({ error: 'Failed to update product' }); }
});

router.delete('/:id', authorize('owner', 'manager'), async (req, res) => {
  try {
    await db.update(products).set({ isActive: false }).where(eq(products.id, Number(req.params.id)));
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: 'Failed to delete product' }); }
});

export default router;
