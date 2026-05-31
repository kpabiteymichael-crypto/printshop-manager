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

const invoiceSchema = z.object({
  customerId: z.number().int().positive().optional().nullable(),
  customerName: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(lineSchema).min(1),
  totalAmount: z.number().min(0),
});

// GET /api/invoices
router.get('/', async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT inv.*, c.name as customer_name, u.name as created_by_name
      FROM invoices inv
      LEFT JOIN customers c ON c.id = inv.customer_id
      LEFT JOIN users u ON u.id = inv.created_by
      ORDER BY inv.created_at DESC
    `);
    return res.json((result as any).rows ?? []);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// GET /api/invoices/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT inv.*, c.name as customer_name, c.phone as customer_phone,
             c.email as customer_email, c.address as customer_address,
             u.name as created_by_name
      FROM invoices inv
      LEFT JOIN customers c ON c.id = inv.customer_id
      LEFT JOIN users u ON u.id = inv.created_by
      WHERE inv.id = ${Number(req.params.id)}
    `);
    const inv = (result as any).rows?.[0];
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const itemsResult = await db.execute(sql`
      SELECT * FROM invoice_items WHERE invoice_id = ${Number(req.params.id)}
    `);

    const settingsResult = await db.execute(sql`SELECT key, value FROM settings`);
    const settings: Record<string, string> = {};
    for (const row of (settingsResult as any).rows ?? []) settings[row.key] = row.value;

    return res.json({ ...inv, items: (itemsResult as any).rows ?? [], settings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// POST /api/invoices
router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = invoiceSchema.parse(req.body);

    const year = new Date().getFullYear();
    const seqResult = await db.execute(sql`
      SELECT COALESCE(MAX(
        CASE WHEN inv_number LIKE ${`INV-${year}-%`}
          THEN CAST(SPLIT_PART(inv_number, '-', 3) AS INTEGER)
          ELSE 0 END
      ), 0) + 1 AS next_seq FROM invoices
    `);
    const seq = String((seqResult as any).rows?.[0]?.next_seq ?? 1).padStart(4, '0');
    const invNumber = `INV-${year}-${seq}`;

    const result = await db.execute(sql`
      INSERT INTO invoices (
        inv_number, customer_id, customer_name, due_date, notes,
        total_amount, payment_status, created_by, created_at, updated_at
      ) VALUES (
        ${invNumber},
        ${data.customerId ?? null},
        ${data.customerName ?? null},
        ${data.dueDate ? new Date(data.dueDate) : null},
        ${data.notes ?? null},
        ${data.totalAmount},
        'unpaid',
        ${req.user!.id},
        NOW(), NOW()
      )
      RETURNING *
    `);
    const inv = (result as any).rows?.[0];

    for (const item of data.items) {
      await db.execute(sql`
        INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total)
        VALUES (${inv.id}, ${item.description}, ${item.quantity}, ${item.unitPrice}, ${item.total})
      `);
    }

    return res.status(201).json(inv);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    console.error(err);
    return res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// PATCH /api/invoices/:id/payment-status
router.patch('/:id/payment-status', authorize('owner', 'manager'), async (req, res) => {
  try {
    const { paymentStatus } = z.object({ paymentStatus: z.enum(['unpaid', 'partial', 'paid']) }).parse(req.body);
    await db.execute(sql`
      UPDATE invoices SET payment_status = ${paymentStatus}, updated_at = NOW()
      WHERE id = ${Number(req.params.id)}
    `);
    return res.json({ success: true });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    console.error(err);
    return res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// DELETE /api/invoices/:id
router.delete('/:id', authorize('owner', 'manager'), async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM invoice_items WHERE invoice_id = ${Number(req.params.id)}`);
    await db.execute(sql`DELETE FROM invoices WHERE id = ${Number(req.params.id)}`);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

export default router;
