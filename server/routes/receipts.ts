import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { sql } from 'drizzle-orm';

const router = Router();
router.use(authenticate);

// GET /api/receipts — list all receipts
router.get('/', authorize('owner', 'manager', 'cashier'), async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        r.id,
        r.receipt_number,
        r.generated_at,
        s.id as sale_id,
        s.sale_number,
        s.total_amount,
        s.payment_method,
        s.payment_status,
        s.created_at,
        c.name as customer_name,
        u.name as cashier_name
      FROM receipts r
      JOIN sales s ON s.id = r.sale_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN users u ON u.id = s.cashier_id
      ORDER BY r.generated_at DESC
      LIMIT 200
    `);
    return res.json((result as any).rows ?? []);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch receipts' });
  }
});

// GET /api/receipts/:id — receipt detail
router.get('/:id', authorize('owner', 'manager', 'cashier'), async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        r.id,
        r.receipt_number,
        r.generated_at,
        s.id as sale_id,
        s.sale_number,
        s.subtotal,
        s.discount_amount,
        s.tax_amount,
        s.total_amount,
        s.payment_method,
        s.payment_reference,
        s.payment_status,
        s.notes,
        s.created_at,
        c.name as customer_name,
        c.phone as customer_phone,
        u.name as cashier_name
      FROM receipts r
      JOIN sales s ON s.id = r.sale_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN users u ON u.id = s.cashier_id
      WHERE r.id = ${Number(req.params.id)}
    `);

    const receipt = (result as any).rows?.[0];
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

    const itemsResult = await db.execute(sql`
      SELECT
        si.id,
        si.description,
        si.quantity,
        si.unit_price,
        si.discount,
        si.total_price
      FROM sale_items si
      WHERE si.sale_id = ${Number(receipt.sale_id)}
    `);

    const settingsResult = await db.execute(sql`SELECT key, value FROM settings`);
    const settings: Record<string, string> = {};
    for (const row of (settingsResult as any).rows ?? []) {
      settings[row.key] = row.value;
    }

    return res.json({
      ...receipt,
      items: (itemsResult as any).rows ?? [],
      shopName: settings.shop_name || 'PrintShop Manager',
      shopAddress: settings.shop_address || '',
      shopPhone: settings.shop_phone || '',
      shopEmail: settings.shop_email || '',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch receipt' });
  }
});

export default router;
