import { Router } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { db } from '../db/index';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();
router.use(authenticate);
router.use(authorize('owner', 'manager', 'cashier'));

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().min(0.01),
  unitPrice: z.number().min(0),
  total: z.number().min(0),
});

const quotationSchema = z.object({
  customerId: z.number().int().positive().optional().nullable(),
  customerName: z.string().optional(),
  validUntil: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(lineSchema).min(1),
  totalAmount: z.number().min(0),
});

// GET /api/quotations
router.get('/', async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT q.*, c.name as customer_name, u.name as created_by_name
      FROM quotations q
      LEFT JOIN customers c ON c.id = q.customer_id
      LEFT JOIN users u ON u.id = q.created_by
      ORDER BY q.created_at DESC
    `);
    return res.json((result as any).rows ?? []);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch quotations' });
  }
});

// GET /api/quotations/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT q.*, c.name as customer_name, c.phone as customer_phone,
             c.email as customer_email, c.address as customer_address,
             u.name as created_by_name
      FROM quotations q
      LEFT JOIN customers c ON c.id = q.customer_id
      LEFT JOIN users u ON u.id = q.created_by
      WHERE q.id = ${Number(req.params.id)}
    `);
    const q = (result as any).rows?.[0];
    if (!q) return res.status(404).json({ error: 'Quotation not found' });

    const itemsResult = await db.execute(sql`
      SELECT * FROM quotation_items WHERE quotation_id = ${Number(req.params.id)}
    `);

    const settingsResult = await db.execute(sql`SELECT key, value FROM settings`);
    const settings: Record<string, string> = {};
    for (const row of (settingsResult as any).rows ?? []) settings[row.key] = row.value;

    return res.json({ ...q, items: (itemsResult as any).rows ?? [], settings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch quotation' });
  }
});

// POST /api/quotations
router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = quotationSchema.parse(req.body);

    const year = new Date().getFullYear();
    const seqResult = await db.execute(sql`
      SELECT COALESCE(MAX(
        CASE WHEN qt_number LIKE ${`QT-${year}-%`}
          THEN CAST(SPLIT_PART(qt_number, '-', 3) AS INTEGER)
          ELSE 0 END
      ), 0) + 1 AS next_seq FROM quotations
    `);
    const seq = String((seqResult as any).rows?.[0]?.next_seq ?? 1).padStart(4, '0');
    const qtNumber = `QT-${year}-${seq}`;

    const result = await db.execute(sql`
      INSERT INTO quotations (
        qt_number, customer_id, customer_name, valid_until, notes,
        total_amount, status, created_by, created_at, updated_at
      ) VALUES (
        ${qtNumber},
        ${data.customerId ?? null},
        ${data.customerName ?? null},
        ${data.validUntil ? new Date(data.validUntil) : null},
        ${data.notes ?? null},
        ${data.totalAmount},
        'draft',
        ${req.user!.id},
        NOW(), NOW()
      )
      RETURNING *
    `);
    const qt = (result as any).rows?.[0];

    for (const item of data.items) {
      await db.execute(sql`
        INSERT INTO quotation_items (quotation_id, description, quantity, unit_price, total)
        VALUES (${qt.id}, ${item.description}, ${item.quantity}, ${item.unitPrice}, ${item.total})
      `);
    }

    return res.status(201).json(qt);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    console.error(err);
    return res.status(500).json({ error: 'Failed to create quotation' });
  }
});

// DELETE /api/quotations/:id
router.delete('/:id', authorize('owner', 'manager'), async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM quotation_items WHERE quotation_id = ${Number(req.params.id)}`);
    await db.execute(sql`DELETE FROM quotations WHERE id = ${Number(req.params.id)}`);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete quotation' });
  }
});

export default router;
