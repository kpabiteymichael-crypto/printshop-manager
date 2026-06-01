import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { suppliers, purchaseOrders, purchaseOrderItems, products, inventoryItems } from '../db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import nodemailer from 'nodemailer';

const router = Router();
router.use(authenticate);
router.use(authorize('owner', 'manager', 'inventory_officer'));

// ── Purchase order routes (must be BEFORE /:id to avoid conflict) ───────────

router.get('/purchase-orders', async (_req, res) => {
  try {
    const pos = await db.select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      supplierId: purchaseOrders.supplierId,
      status: purchaseOrders.status,
      totalAmount: purchaseOrders.totalAmount,
      notes: purchaseOrders.notes,
      orderedAt: purchaseOrders.orderedAt,
      expectedDeliveryAt: purchaseOrders.expectedDeliveryAt,
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

router.get('/purchase-orders/:id', async (req, res) => {
  try {
    const poId = Number(req.params.id);
    const result = await db.execute(sql`
      SELECT
        po.id,
        po.po_number,
        po.supplier_id,
        po.status,
        po.total_amount,
        po.notes,
        po.ordered_at,
        po.expected_delivery_at,
        po.received_at,
        po.created_at,
        s.name as supplier_name,
        u.name as ordered_by_name,
        json_agg(
          json_build_object(
            'id', poi.id,
            'productId', poi.product_id,
            'productName', p.name,
            'productSku', p.sku,
            'quantity', poi.quantity,
            'receivedQuantity', poi.received_quantity,
            'unitPrice', poi.unit_price,
            'totalPrice', poi.total_price
          ) ORDER BY poi.id
        ) FILTER (WHERE poi.id IS NOT NULL) as items
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN users u ON po.ordered_by = u.id
      LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      LEFT JOIN products p ON p.id = poi.product_id
      WHERE po.id = ${poId}
      GROUP BY po.id, s.name, u.name
    `);
    const rows = (result as any).rows ?? [];
    if (rows.length === 0) return res.status(404).json({ error: 'Purchase order not found' });
    const row = rows[0];
    return res.json({
      id: row.id,
      poNumber: row.po_number,
      supplierId: row.supplier_id,
      status: row.status,
      totalAmount: row.total_amount,
      notes: row.notes,
      orderedAt: row.ordered_at,
      expectedDeliveryAt: row.expected_delivery_at,
      receivedAt: row.received_at,
      createdAt: row.created_at,
      supplierName: row.supplier_name,
      orderedByName: row.ordered_by_name,
      items: row.items ?? [],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
});

router.post('/purchase-orders', authorize('owner', 'manager', 'inventory_officer'), async (req: AuthRequest, res) => {
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
      SELECT COUNT(*) as count FROM purchase_orders WHERE EXTRACT(YEAR FROM created_at) = ${year}
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

router.put('/purchase-orders/:id/status', authorize('owner', 'manager', 'inventory_officer'), async (req: AuthRequest, res) => {
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

router.put('/purchase-orders/:id/receive', authorize('owner', 'manager', 'inventory_officer'), async (req: AuthRequest, res) => {
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

// POST /api/suppliers/purchase-orders/:id/email  — send PO PDF to supplier
router.post('/purchase-orders/:id/email', authorize('owner', 'manager', 'inventory_officer'), async (req: AuthRequest, res) => {
  try {
    const poId = Number(req.params.id);

    // Fetch full PO with supplier details and items
    const result = await db.execute(sql`
      SELECT
        po.id, po.po_number, po.status, po.total_amount, po.notes,
        po.ordered_at, po.expected_delivery_at, po.created_at,
        s.name as supplier_name, s.email as supplier_email,
        s.contact_name as supplier_contact,
        u.name as ordered_by_name,
        json_agg(
          json_build_object(
            'productName', p.name,
            'productSku', p.sku,
            'quantity', poi.quantity,
            'unitPrice', poi.unit_price,
            'totalPrice', poi.total_price
          ) ORDER BY poi.id
        ) FILTER (WHERE poi.id IS NOT NULL) as items
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN users u ON po.ordered_by = u.id
      LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      LEFT JOIN products p ON p.id = poi.product_id
      WHERE po.id = ${poId}
      GROUP BY po.id, s.name, s.email, s.contact_name, u.name
    `);

    const rows = (result as any).rows ?? [];
    if (rows.length === 0) return res.status(404).json({ error: 'Purchase order not found' });
    const po = rows[0];

    if (!po.supplier_email) {
      return res.status(400).json({ error: 'Supplier has no email address on file' });
    }

    // Read shop settings
    const settingsResult = await db.execute(sql`SELECT key, value FROM settings`);
    const settings: Record<string, string> = {};
    for (const row of (settingsResult as any).rows ?? []) settings[row.key] = row.value;

    // SMTP config — env vars take priority over settings table
    const smtpHost = process.env.SMTP_HOST || settings.smtp_host;
    const smtpPort = Number(process.env.SMTP_PORT || settings.smtp_port || 587);
    const smtpUser = process.env.SMTP_USER || settings.smtp_user;
    const smtpPass = process.env.SMTP_PASS || settings.smtp_pass;
    const smtpFrom = process.env.SMTP_FROM || settings.smtp_from || smtpUser;
    const shopName = settings.shop_name || 'PrintShop Manager';

    if (!smtpHost || !smtpUser || !smtpPass) {
      return res.status(503).json({
        error: 'Email not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables (or configure them in Settings) to enable email sending.',
      });
    }

    // Dynamically import PDFKit to generate the PDF in memory
    const PDFDocument = (await import('pdfkit')).default;

    const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const margin = 50;
      const pageWidth = 595.28;
      const contentWidth = pageWidth - margin * 2;
      const shopAddress = settings.shop_address || '';
      const shopPhone = settings.shop_phone || '';
      const shopEmail = settings.shop_email || '';

      const fmt = (v: number) =>
        `GHS ${v.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const fmtDate = (d: any) =>
        d ? new Date(d).toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

      doc.rect(0, 0, pageWidth, 120).fill('#4f46e5');
      doc.fillColor('white').fontSize(22).font('Helvetica-Bold')
        .text(shopName, margin, 25, { width: contentWidth * 0.6 });
      doc.fontSize(9).font('Helvetica').fillColor('#c7d2fe');
      if (shopAddress) doc.text(shopAddress, margin, 52);
      if (shopPhone) doc.text(`Tel: ${shopPhone}`, margin, shopAddress ? 64 : 52);
      if (shopEmail) doc.text(shopEmail, margin, (shopAddress && shopPhone) ? 76 : (shopAddress || shopPhone) ? 64 : 52);

      doc.fillColor('white').fontSize(18).font('Helvetica-Bold')
        .text('PURCHASE ORDER', margin + contentWidth * 0.5, 25, { width: contentWidth * 0.5, align: 'right' });
      doc.fillColor('#c7d2fe').fontSize(10).font('Helvetica')
        .text(`#${po.po_number}`, margin + contentWidth * 0.5, 52, { width: contentWidth * 0.5, align: 'right' });
      doc.text(`Date: ${fmtDate(po.created_at)}`, margin + contentWidth * 0.5, 65, { width: contentWidth * 0.5, align: 'right' });
      if (po.expected_delivery_at) {
        doc.text(`Expected Delivery: ${fmtDate(po.expected_delivery_at)}`, margin + contentWidth * 0.5, 78, { width: contentWidth * 0.5, align: 'right' });
      }

      let y = 150;
      doc.fillColor('#1e293b').fontSize(9).font('Helvetica-Bold').text('VENDOR / SUPPLIER', margin, y);
      y += 14;
      doc.font('Helvetica').fillColor('#334155').fontSize(11).text(po.supplier_name || '—', margin, y);
      y += 28;

      doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(margin, y).lineTo(margin + contentWidth, y).stroke();
      y += 16;

      const colWidths = [contentWidth * 0.10, contentWidth * 0.40, contentWidth * 0.12, contentWidth * 0.19, contentWidth * 0.19];
      const cols = ['SKU', 'Product', 'Qty', 'Unit Price', 'Total'];
      const colAligns: Array<'left' | 'right' | 'center'> = ['left', 'left', 'center', 'right', 'right'];

      doc.fillColor('#f8fafc').rect(margin, y, contentWidth, 22).fill();
      doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold');
      let x = margin;
      cols.forEach((col, i) => {
        doc.text(col, x + (i > 0 ? 4 : 0), y + 7, { width: colWidths[i], align: colAligns[i] });
        x += colWidths[i];
      });
      y += 22;

      doc.font('Helvetica');
      const items: any[] = po.items ?? [];
      items.forEach((item: any, idx: number) => {
        if (idx % 2 === 1) doc.fillColor('#f8fafc').rect(margin, y, contentWidth, 22).fill();
        doc.fillColor('#1e293b').fontSize(9);
        x = margin;
        doc.text(item.productSku || '—', x, y + 6, { width: colWidths[0] - 4 });
        x += colWidths[0];
        doc.text(item.productName || '—', x + 4, y + 6, { width: colWidths[1] - 8 });
        x += colWidths[1];
        doc.text(String(item.quantity), x + 4, y + 6, { width: colWidths[2] - 4, align: 'center' });
        x += colWidths[2];
        doc.text(fmt(parseFloat(item.unitPrice)), x + 4, y + 6, { width: colWidths[3] - 4, align: 'right' });
        x += colWidths[3];
        doc.font('Helvetica-Bold').text(fmt(parseFloat(item.totalPrice)), x + 4, y + 6, { width: colWidths[4] - 4, align: 'right' });
        doc.font('Helvetica');
        y += 22;
      });

      y += 8;
      doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(margin, y).lineTo(margin + contentWidth, y).stroke();
      y += 10;
      const totalBoxX = margin + contentWidth * 0.6;
      const totalBoxW = contentWidth * 0.4;
      doc.fillColor('#4f46e5').rect(totalBoxX, y, totalBoxW, 36).fill();
      doc.fillColor('#c7d2fe').fontSize(10).font('Helvetica')
        .text('TOTAL AMOUNT', totalBoxX + 8, y + 6, { width: totalBoxW - 16 });
      doc.fillColor('white').fontSize(16).font('Helvetica-Bold')
        .text(fmt(parseFloat(po.total_amount)), totalBoxX + 8, y + 18, { width: totalBoxW - 16, align: 'right' });

      if (po.notes) {
        y += 50;
        doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold').text('NOTES / INSTRUCTIONS', margin, y);
        y += 12;
        doc.font('Helvetica').fillColor('#64748b').text(po.notes, margin, y, { width: contentWidth * 0.55 });
      }

      const footerY = doc.page.height - 50;
      doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(margin, footerY).lineTo(margin + contentWidth, footerY).stroke();
      doc.fillColor('#94a3b8').fontSize(8).font('Helvetica')
        .text(`Generated by ${shopName} — PrintShop Manager`, margin, footerY + 8, { width: contentWidth, align: 'center' });
      doc.text(`Purchase Order #${po.po_number} | ${fmtDate(po.created_at)}`, margin, footerY + 20, { width: contentWidth, align: 'center' });

      doc.end();
    });

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const recipientName = po.supplier_contact || po.supplier_name;
    const deliveryLine = po.expected_delivery_at
      ? `\nExpected Delivery: ${new Date(po.expected_delivery_at).toLocaleDateString('en-GH', { dateStyle: 'medium' })}`
      : '';

    await transporter.sendMail({
      from: `"${shopName}" <${smtpFrom}>`,
      to: po.supplier_email,
      subject: `Purchase Order ${po.po_number} from ${shopName}`,
      text: `Dear ${recipientName},\n\nPlease find attached our Purchase Order ${po.po_number}.${deliveryLine}\n\nTotal Amount: GHS ${parseFloat(po.total_amount).toLocaleString('en-GH', { minimumFractionDigits: 2 })}\n\nKindly acknowledge receipt and confirm availability of items.\n\nRegards,\n${shopName}`,
      attachments: [
        {
          filename: `purchase-order-${po.po_number}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    return res.json({ success: true, sentTo: po.supplier_email });
  } catch (err: any) {
    console.error('Email PO error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send email' });
  }
});

// ── Supplier CRUD ─────────────────────────────────────────────────────────────

router.get('/', async (_req, res) => {
  try {
    const list = await db.select().from(suppliers).orderBy(desc(suppliers.createdAt));
    return res.json(list);
  } catch { return res.status(500).json({ error: 'Failed to fetch suppliers' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const [s] = await db.select().from(suppliers).where(eq(suppliers.id, Number(req.params.id))).limit(1);
    if (!s) return res.status(404).json({ error: 'Supplier not found' });

    const totalSpendResult = await db.execute(sql`
      SELECT COALESCE(SUM(total_amount), 0) as total_spend
      FROM purchase_orders
      WHERE supplier_id = ${Number(req.params.id)} AND status IN ('ordered', 'partial', 'received')
    `);
    const totalSpend = Number((totalSpendResult as any).rows?.[0]?.total_spend ?? 0);

    return res.json({ ...s, totalSpend });
  } catch { return res.status(500).json({ error: 'Failed to fetch supplier' }); }
});

router.get('/:id/orders', async (req, res) => {
  try {
    const pos = await db.execute(sql`
      SELECT
        po.id,
        po.po_number,
        po.status,
        po.total_amount,
        po.notes,
        po.ordered_at,
        po.expected_delivery_at,
        po.received_at,
        po.created_at,
        u.name as ordered_by_name,
        json_agg(
          json_build_object(
            'id', poi.id,
            'productId', poi.product_id,
            'productName', p.name,
            'productSku', p.sku,
            'quantity', poi.quantity,
            'receivedQuantity', poi.received_quantity,
            'unitPrice', poi.unit_price,
            'totalPrice', poi.total_price
          ) ORDER BY poi.id
        ) FILTER (WHERE poi.id IS NOT NULL) as items
      FROM purchase_orders po
      LEFT JOIN users u ON po.ordered_by = u.id
      LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      LEFT JOIN products p ON p.id = poi.product_id
      WHERE po.supplier_id = ${Number(req.params.id)}
      GROUP BY po.id, u.name
      ORDER BY po.created_at DESC
    `);
    return res.json((pos as any).rows ?? []);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch supplier orders' });
  }
});

router.post('/', authorize('owner', 'manager', 'inventory_officer'), async (req, res) => {
  try {
    const data = z.object({
      name: z.string().min(1),
      contactName: z.string().optional(),
      email: z.string().email().optional().or(z.literal('')),
      phone: z.string().optional(),
      address: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const [s] = await db.insert(suppliers).values(data).returning();
    return res.status(201).json(s);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to create supplier' });
  }
});

router.put('/:id', authorize('owner', 'manager', 'inventory_officer'), async (req, res) => {
  try {
    const [s] = await db.update(suppliers).set({ ...req.body, updatedAt: new Date() }).where(eq(suppliers.id, Number(req.params.id))).returning();
    if (!s) return res.status(404).json({ error: 'Supplier not found' });
    return res.json(s);
  } catch { return res.status(500).json({ error: 'Failed to update supplier' }); }
});

router.delete('/:id', authorize('owner', 'manager'), async (req, res) => {
  try {
    await db.update(suppliers).set({ isActive: false }).where(eq(suppliers.id, Number(req.params.id)));
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: 'Failed to delete supplier' }); }
});

export default router;
