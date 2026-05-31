import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { sql } from 'drizzle-orm';
import PDFDocument from 'pdfkit';

const router = Router();
router.use(authenticate);

async function getSettings(): Promise<Record<string, string>> {
  const result = await db.execute(sql`SELECT key, value FROM settings`);
  const settings: Record<string, string> = {};
  for (const row of (result as any).rows ?? []) settings[row.key] = row.value;
  return settings;
}

function formatAmount(v: number) {
  return `GHS ${v.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: any) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric' });
}

function buildPDF(doc: PDFKit.PDFDocument, settings: Record<string, string>, opts: {
  docType: string;
  docNumber: string;
  date: string;
  dueDate?: string;
  validUntil?: string;
  customer: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  totalAmount: number;
  notes?: string;
  status?: string;
  createdBy?: string;
  paymentMethod?: string;
}) {
  const shopName = settings.shop_name || 'PrintShop Manager';
  const shopAddress = settings.shop_address || '';
  const shopPhone = settings.shop_phone || '';
  const shopEmail = settings.shop_email || '';

  const margin = 50;
  const pageWidth = 595.28;
  const contentWidth = pageWidth - margin * 2;

  // Header background
  doc.rect(0, 0, pageWidth, 120).fill('#4f46e5');

  // Shop name
  doc.fillColor('white').fontSize(22).font('Helvetica-Bold')
    .text(shopName, margin, 25, { width: contentWidth * 0.6 });

  doc.fontSize(9).font('Helvetica').fillColor('#c7d2fe');
  if (shopAddress) doc.text(shopAddress, margin, 52);
  if (shopPhone) doc.text(`Tel: ${shopPhone}`, margin, shopAddress ? 64 : 52);
  if (shopEmail) doc.text(shopEmail, margin, (shopAddress && shopPhone) ? 76 : shopAddress || shopPhone ? 64 : 52);

  // Doc type + number (right side of header)
  doc.fillColor('white').fontSize(18).font('Helvetica-Bold')
    .text(opts.docType.toUpperCase(), margin + contentWidth * 0.55, 25, { width: contentWidth * 0.45, align: 'right' });
  doc.fillColor('#c7d2fe').fontSize(10).font('Helvetica')
    .text(`#${opts.docNumber}`, margin + contentWidth * 0.55, 52, { width: contentWidth * 0.45, align: 'right' });
  doc.text(`Date: ${opts.date}`, margin + contentWidth * 0.55, 65, { width: contentWidth * 0.45, align: 'right' });
  if (opts.dueDate) doc.text(`Due: ${opts.dueDate}`, margin + contentWidth * 0.55, 78, { width: contentWidth * 0.45, align: 'right' });
  if (opts.validUntil) doc.text(`Valid Until: ${opts.validUntil}`, margin + contentWidth * 0.55, 78, { width: contentWidth * 0.45, align: 'right' });

  let y = 140;

  // Bill To section
  doc.fillColor('#1e293b').fontSize(9).font('Helvetica-Bold')
    .text('BILL TO / CUSTOMER', margin, y);
  y += 14;
  doc.font('Helvetica').fillColor('#334155').fontSize(11)
    .text(opts.customer || 'Walk-in Customer', margin, y);
  y += 14;
  if (opts.customerPhone) { doc.fontSize(9).text(`Phone: ${opts.customerPhone}`, margin, y); y += 12; }
  if (opts.customerEmail) { doc.fontSize(9).text(`Email: ${opts.customerEmail}`, margin, y); y += 12; }
  if (opts.customerAddress) { doc.fontSize(9).text(`Address: ${opts.customerAddress}`, margin, y); y += 12; }

  // Status badge
  if (opts.status) {
    const statusColors: Record<string, string> = {
      paid: '#10b981', unpaid: '#ef4444', partial: '#f59e0b',
      pending: '#f59e0b', completed: '#10b981', in_progress: '#4f46e5', draft: '#94a3b8',
    };
    const color = statusColors[opts.status] ?? '#94a3b8';
    doc.fillColor(color).roundedRect(margin + contentWidth - 70, 140, 70, 20, 4).fill();
    doc.fillColor('white').fontSize(9).font('Helvetica-Bold')
      .text(opts.status.toUpperCase(), margin + contentWidth - 65, 146, { width: 60, align: 'center' });
  }

  y += 20;

  // Divider
  doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(margin, y).lineTo(margin + contentWidth, y).stroke();
  y += 16;

  // Table header
  const colWidths = [contentWidth * 0.48, contentWidth * 0.12, contentWidth * 0.2, contentWidth * 0.2];
  const cols = ['Description', 'Qty', 'Unit Price', 'Total'];
  const colAligns: Array<'left' | 'right' | 'center'> = ['left', 'center', 'right', 'right'];

  doc.fillColor('#f8fafc').rect(margin, y, contentWidth, 22).fill();
  doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold');
  let x = margin;
  cols.forEach((col, i) => {
    doc.text(col, x + (i > 0 ? 4 : 0), y + 7, { width: colWidths[i], align: colAligns[i] });
    x += colWidths[i];
  });
  y += 22;

  // Items
  doc.font('Helvetica');
  opts.items.forEach((item, idx) => {
    const rowY = y;
    if (idx % 2 === 1) {
      doc.fillColor('#f8fafc').rect(margin, rowY, contentWidth, 22).fill();
    }
    doc.fillColor('#1e293b').fontSize(9);
    x = margin;
    doc.text(item.description, x, rowY + 6, { width: colWidths[0] - 4 });
    x += colWidths[0];
    doc.text(String(item.quantity), x + 4, rowY + 6, { width: colWidths[1] - 4, align: 'center' });
    x += colWidths[1];
    doc.text(formatAmount(item.unitPrice), x + 4, rowY + 6, { width: colWidths[2] - 4, align: 'right' });
    x += colWidths[2];
    doc.font('Helvetica-Bold').text(formatAmount(item.total), x + 4, rowY + 6, { width: colWidths[3] - 4, align: 'right' });
    doc.font('Helvetica');
    y += 22;
  });

  // Totals section
  y += 8;
  doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(margin, y).lineTo(margin + contentWidth, y).stroke();
  y += 10;

  const totalBoxX = margin + contentWidth * 0.6;
  const totalBoxW = contentWidth * 0.4;

  doc.fillColor('#4f46e5').rect(totalBoxX, y, totalBoxW, 36).fill();
  doc.fillColor('#c7d2fe').fontSize(10).font('Helvetica')
    .text('TOTAL AMOUNT', totalBoxX + 8, y + 6, { width: totalBoxW - 16 });
  doc.fillColor('white').fontSize(16).font('Helvetica-Bold')
    .text(formatAmount(opts.totalAmount), totalBoxX + 8, y + 18, { width: totalBoxW - 16, align: 'right' });

  // Payment method for receipts
  if (opts.paymentMethod) {
    y += 46;
    doc.fillColor('#475569').fontSize(9).font('Helvetica')
      .text(`Payment Method: ${opts.paymentMethod.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`, margin, y);
  }

  // Notes
  if (opts.notes) {
    y += opts.paymentMethod ? 20 : 50;
    doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold')
      .text('NOTES / TERMS', margin, y);
    y += 12;
    doc.font('Helvetica').fillColor('#64748b')
      .text(opts.notes, margin, y, { width: contentWidth * 0.55 });
  }

  // Footer
  const footerY = doc.page.height - 50;
  doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(margin, footerY).lineTo(margin + contentWidth, footerY).stroke();
  doc.fillColor('#94a3b8').fontSize(8).font('Helvetica')
    .text(`Generated by ${shopName} — PrintShop Manager`, margin, footerY + 8, { width: contentWidth, align: 'center' });
  doc.text(`${opts.docType} #${opts.docNumber} | ${opts.date}`, margin, footerY + 20, { width: contentWidth, align: 'center' });

  if (opts.createdBy) {
    doc.text(`Prepared by: ${opts.createdBy}`, margin, footerY + 8, { width: contentWidth / 2 });
  }
}

// GET /api/pdf/receipt/:id
router.get('/receipt/:id', authorize('owner', 'manager', 'cashier'), async (req, res) => {
  try {
    const receiptResult = await db.execute(sql`
      SELECT r.receipt_number, r.generated_at,
             s.sale_number, s.subtotal, s.discount_amount, s.tax_amount, s.total_amount,
             s.payment_method, s.payment_reference, s.notes, s.created_at,
             c.name as customer_name, c.phone as customer_phone,
             c.email as customer_email, c.address as customer_address,
             u.name as cashier_name
      FROM receipts r
      JOIN sales s ON s.id = r.sale_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN users u ON u.id = s.cashier_id
      WHERE r.id = ${Number(req.params.id)}
    `);
    const receipt = (receiptResult as any).rows?.[0];
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

    const itemsResult = await db.execute(sql`
      SELECT description, quantity, unit_price, total_price as total
      FROM sale_items WHERE sale_id = (
        SELECT sale_id FROM receipts WHERE id = ${Number(req.params.id)}
      )
    `);
    const items = (itemsResult as any).rows ?? [];
    const settings = await getSettings();

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${receipt.receipt_number}.pdf"`);
    doc.pipe(res);

    buildPDF(doc, settings, {
      docType: 'Receipt',
      docNumber: receipt.receipt_number,
      date: formatDate(receipt.created_at),
      customer: receipt.customer_name || 'Walk-in Customer',
      customerPhone: receipt.customer_phone,
      customerEmail: receipt.customer_email,
      customerAddress: receipt.customer_address,
      items: items.map((i: any) => ({
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: parseFloat(i.unit_price),
        total: parseFloat(i.total),
      })),
      totalAmount: parseFloat(receipt.total_amount),
      notes: receipt.notes,
      paymentMethod: receipt.payment_method,
      createdBy: receipt.cashier_name,
    });

    doc.end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to generate receipt PDF' });
  }
});

// GET /api/pdf/quotation/:id
router.get('/quotation/:id', authorize('owner', 'manager', 'cashier'), async (req, res) => {
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
    const qt = (result as any).rows?.[0];
    if (!qt) return res.status(404).json({ error: 'Quotation not found' });

    const itemsResult = await db.execute(sql`SELECT description, quantity, unit_price, total FROM quotation_items WHERE quotation_id = ${Number(req.params.id)}`);
    const items = (itemsResult as any).rows ?? [];
    const settings = await getSettings();

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="quotation-${qt.qt_number}.pdf"`);
    doc.pipe(res);

    buildPDF(doc, settings, {
      docType: 'Quotation',
      docNumber: qt.qt_number,
      date: formatDate(qt.created_at),
      validUntil: qt.valid_until ? formatDate(qt.valid_until) : undefined,
      customer: qt.customer_name || qt.customer_name || 'Walk-in',
      customerPhone: qt.customer_phone,
      customerEmail: qt.customer_email,
      customerAddress: qt.customer_address,
      items: items.map((i: any) => ({
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: parseFloat(i.unit_price),
        total: parseFloat(i.total),
      })),
      totalAmount: parseFloat(qt.total_amount),
      notes: qt.notes,
      status: qt.status,
      createdBy: qt.created_by_name,
    });

    doc.end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to generate quotation PDF' });
  }
});

// GET /api/pdf/invoice/:id
router.get('/invoice/:id', authorize('owner', 'manager', 'cashier'), async (req, res) => {
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

    const itemsResult = await db.execute(sql`SELECT description, quantity, unit_price, total FROM invoice_items WHERE invoice_id = ${Number(req.params.id)}`);
    const items = (itemsResult as any).rows ?? [];
    const settings = await getSettings();

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${inv.inv_number}.pdf"`);
    doc.pipe(res);

    buildPDF(doc, settings, {
      docType: 'Invoice',
      docNumber: inv.inv_number,
      date: formatDate(inv.created_at),
      dueDate: inv.due_date ? formatDate(inv.due_date) : undefined,
      customer: inv.customer_name || 'Walk-in',
      customerPhone: inv.customer_phone,
      customerEmail: inv.customer_email,
      customerAddress: inv.customer_address,
      items: items.map((i: any) => ({
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: parseFloat(i.unit_price),
        total: parseFloat(i.total),
      })),
      totalAmount: parseFloat(inv.total_amount),
      notes: inv.notes,
      status: inv.payment_status,
      createdBy: inv.created_by_name,
    });

    doc.end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to generate invoice PDF' });
  }
});

export default router;
