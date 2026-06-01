import { Router } from 'express';
import type { Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { sales, saleItems, expenses, printJobs, users, customers, debts } from '../db/schema';
import { eq, sql, gte, lte, and, desc } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

const router = Router();
router.use(authenticate);
router.use(authorize('owner', 'manager'));

function parseRange(from?: string, to?: string) {
  const today = new Date();
  const fromDate = from ? new Date(from) : new Date(today.getFullYear(), today.getMonth(), 1);
  const toDateRaw = to ? new Date(to) : today;
  toDateRaw.setHours(23, 59, 59, 999);
  return { fromDate, toDate: toDateRaw };
}

router.get('/sales-summary', async (req, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const { fromDate, toDate } = parseRange(from, to);

    const [summary] = await db.select({
      totalSales: sql<string>`COALESCE(SUM(total_amount), 0)`,
      totalOrders: sql<number>`COUNT(*)`,
      avgOrder: sql<string>`COALESCE(AVG(total_amount), 0)`,
    }).from(sales).where(and(gte(sales.createdAt, fromDate), lte(sales.createdAt, toDate)));

    const [expSummary] = await db.select({
      totalExpenses: sql<string>`COALESCE(SUM(amount), 0)`,
    }).from(expenses).where(and(gte(expenses.expenseDate, fromDate), lte(expenses.expenseDate, toDate)));

    const dailySales = await db.select({
      date: sql<string>`DATE(created_at)`,
      total: sql<string>`SUM(total_amount)`,
      count: sql<number>`COUNT(*)`,
    }).from(sales)
      .where(and(gte(sales.createdAt, fromDate), lte(sales.createdAt, toDate)))
      .groupBy(sql`DATE(created_at)`)
      .orderBy(sql`DATE(created_at)`);

    const topProducts = await db.select({
      description: saleItems.description,
      totalQuantity: sql<number>`SUM(quantity)`,
      totalRevenue: sql<string>`SUM(total_price)`,
    }).from(saleItems)
      .leftJoin(sales, eq(saleItems.saleId, sales.id))
      .where(and(gte(sales.createdAt, fromDate), lte(sales.createdAt, toDate)))
      .groupBy(saleItems.description)
      .orderBy(sql`SUM(total_price) DESC`)
      .limit(10);

    return res.json({
      summary: {
        totalSales: parseFloat(summary.totalSales),
        totalOrders: Number(summary.totalOrders),
        avgOrder: parseFloat(summary.avgOrder),
        totalExpenses: parseFloat(expSummary.totalExpenses),
        netRevenue: parseFloat(summary.totalSales) - parseFloat(expSummary.totalExpenses),
      },
      dailySales,
      topProducts,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to generate sales report' });
  }
});

router.get('/print-jobs-summary', async (_req, res) => {
  try {
    const byStatus = await db.select({
      status: printJobs.status,
      count: sql<number>`COUNT(*)`,
      total: sql<string>`COALESCE(SUM(total_amount), 0)`,
    }).from(printJobs).groupBy(printJobs.status);
    return res.json({ byStatus });
  } catch { return res.status(500).json({ error: 'Failed to generate print jobs report' }); }
});

// Generic report endpoint
router.get('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { from, to } = req.query as { from?: string; to?: string };
    const { fromDate, toDate } = parseRange(from, to);
    const fmt = (n: number) => `₵${n.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

    let rows: any[] = [];
    let columns: string[] = [];
    let title = '';

    if (type === 'daily-sales' || type === 'weekly-sales' || type === 'monthly-sales') {
      title = type === 'daily-sales' ? 'Daily Sales Report' : type === 'weekly-sales' ? 'Weekly Sales Report' : 'Monthly Sales Report';
      const groupBy = type === 'monthly-sales'
        ? `TO_CHAR(created_at, 'YYYY-MM')`
        : type === 'weekly-sales'
          ? `TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD')`
          : `DATE(created_at)`;
      const result = await db.execute(sql`
        SELECT ${sql.raw(groupBy)} as period,
               COUNT(*) as orders,
               COALESCE(SUM(total_amount), 0) as revenue,
               COALESCE(SUM(discount_amount), 0) as discounts,
               COALESCE(SUM(tax_amount), 0) as taxes
        FROM sales
        WHERE created_at >= ${fromDate} AND created_at <= ${toDate}
        GROUP BY ${sql.raw(groupBy)}
        ORDER BY period
      `);
      rows = (result as any).rows ?? [];
      columns = ['Period', 'Orders', 'Revenue', 'Discounts', 'Taxes'];
    } else if (type === 'pnl') {
      title = 'Profit & Loss Report';
      const result = await db.execute(sql`
        SELECT TO_CHAR(d, 'YYYY-MM') as period,
               COALESCE(rev.revenue, 0) as revenue,
               COALESCE(exp.expenses, 0) as expenses,
               COALESCE(rev.revenue, 0) - COALESCE(exp.expenses, 0) as profit
        FROM generate_series(
          DATE_TRUNC('month', ${fromDate}::timestamp),
          DATE_TRUNC('month', ${toDate}::timestamp),
          '1 month'::interval
        ) d
        LEFT JOIN (
          SELECT DATE_TRUNC('month', created_at) as m, SUM(total_amount) as revenue
          FROM sales WHERE created_at >= ${fromDate} AND created_at <= ${toDate}
          GROUP BY m
        ) rev ON rev.m = d
        LEFT JOIN (
          SELECT DATE_TRUNC('month', expense_date) as m, SUM(amount) as expenses
          FROM expenses WHERE expense_date >= ${fromDate} AND expense_date <= ${toDate}
          GROUP BY m
        ) exp ON exp.m = d
        ORDER BY d
      `);
      rows = (result as any).rows ?? [];
      columns = ['Period', 'Revenue', 'Expenses', 'Net Profit'];
    } else if (type === 'inventory') {
      title = 'Inventory Report';
      const result = await db.execute(sql`
        SELECT p.sku, p.name, pc.name as category,
               ii.quantity_in_stock as stock,
               ii.reorder_level,
               p.cost_price,
               p.price as selling_price,
               (ii.quantity_in_stock * p.cost_price::numeric) as stock_value,
               CASE WHEN ii.quantity_in_stock = 0 THEN 'Out of Stock'
                    WHEN ii.quantity_in_stock <= ii.reorder_level THEN 'Low Stock'
                    ELSE 'OK' END as status
        FROM inventory_items ii
        JOIN products p ON p.id = ii.product_id
        LEFT JOIN product_categories pc ON pc.id = p.category_id
        ORDER BY ii.quantity_in_stock ASC
      `);
      rows = (result as any).rows ?? [];
      columns = ['SKU', 'Name', 'Category', 'Stock', 'Reorder Level', 'Cost Price', 'Selling Price', 'Stock Value', 'Status'];
    } else if (type === 'cash-flow') {
      title = 'Cash Flow Report';
      const result = await db.execute(sql`
        SELECT DATE(created_at) as date, 'Sale' as type, sale_number as reference,
               total_amount as amount, payment_method
        FROM sales
        WHERE created_at >= ${fromDate} AND created_at <= ${toDate}
        UNION ALL
        SELECT DATE(expense_date) as date, 'Expense' as type,
               COALESCE(reference_number, description) as reference,
               -amount as amount, payment_method::text
        FROM expenses
        WHERE expense_date >= ${fromDate} AND expense_date <= ${toDate}
        ORDER BY date, type
      `);
      rows = (result as any).rows ?? [];
      columns = ['Date', 'Type', 'Reference', 'Amount', 'Payment Method'];
    } else if (type === 'customer') {
      title = 'Customer Report';
      const result = await db.execute(sql`
        SELECT c.name, c.phone, c.email, c.type,
               COUNT(s.id) as total_orders,
               COALESCE(SUM(s.total_amount), 0) as total_spent,
               MAX(s.created_at) as last_purchase
        FROM customers c
        LEFT JOIN sales s ON s.customer_id = c.id
          AND s.created_at >= ${fromDate} AND s.created_at <= ${toDate}
        GROUP BY c.id, c.name, c.phone, c.email, c.type
        ORDER BY total_spent DESC
      `);
      rows = (result as any).rows ?? [];
      columns = ['Name', 'Phone', 'Email', 'Type', 'Total Orders', 'Total Spent', 'Last Purchase'];
    } else if (type === 'debtors') {
      title = 'Debtors Report';
      const result = await db.execute(sql`
        SELECT c.name, c.phone, d.total_amount, d.paid_amount, d.balance,
               d.due_date, d.status, d.created_at
        FROM debts d
        JOIN customers c ON c.id = d.customer_id
        WHERE d.status = 'open'
        ORDER BY d.balance DESC
      `);
      rows = (result as any).rows ?? [];
      columns = ['Customer', 'Phone', 'Total', 'Paid', 'Balance', 'Due Date', 'Status', 'Created'];
    } else if (type === 'staff-performance') {
      title = 'Staff Performance Report';
      const result = await db.execute(sql`
        SELECT u.name, u.role, u.email,
               COUNT(DISTINCT s.id) as total_sales,
               COALESCE(SUM(s.total_amount), 0) as revenue_generated,
               COUNT(DISTINCT pj.id) as print_jobs_handled
        FROM users u
        LEFT JOIN sales s ON s.cashier_id = u.id
          AND s.created_at >= ${fromDate} AND s.created_at <= ${toDate}
        LEFT JOIN print_jobs pj ON pj.assigned_to = u.id
          AND pj.created_at >= ${fromDate} AND pj.created_at <= ${toDate}
        GROUP BY u.id, u.name, u.role, u.email
        ORDER BY revenue_generated DESC
      `);
      rows = (result as any).rows ?? [];
      columns = ['Name', 'Role', 'Email', 'Total Sales', 'Revenue Generated', 'Print Jobs Handled'];
    } else if (type === 'print-jobs') {
      title = 'Print Jobs Report';
      const result = await db.execute(sql`
        SELECT pj.job_number, pj.title, pj.status,
               c.name as customer, u.name as operator,
               pj.quantity, pj.total_amount, pj.payment_status,
               pj.created_at, pj.completed_at
        FROM print_jobs pj
        LEFT JOIN customers c ON c.id = pj.customer_id
        LEFT JOIN users u ON u.id = pj.assigned_to
        WHERE pj.created_at >= ${fromDate} AND pj.created_at <= ${toDate}
        ORDER BY pj.created_at DESC
      `);
      rows = (result as any).rows ?? [];
      columns = ['Job #', 'Title', 'Status', 'Customer', 'Operator', 'Quantity', 'Amount', 'Payment', 'Created', 'Completed'];
    } else if (type === 'profit-analysis') {
      title = 'Profit Analysis';
      const result = await db.execute(sql`
        SELECT
          p.sku,
          p.name,
          COALESCE(pc.name, 'Uncategorised') AS category,
          p.cost_price::numeric                                                     AS cost_price,
          p.price::numeric                                                           AS selling_price,
          (p.price::numeric - p.cost_price::numeric)                                AS margin_per_unit,
          CASE WHEN p.price::numeric > 0
            THEN ROUND(((p.price::numeric - p.cost_price::numeric) / p.price::numeric) * 100, 1)
            ELSE 0 END                                                              AS margin_pct,
          COALESCE(SUM(si.quantity), 0)                                             AS units_sold,
          COALESCE(SUM(si.total_price), 0)                                          AS revenue,
          COALESCE(SUM(si.quantity) * p.cost_price::numeric, 0)                     AS cogs,
          COALESCE(SUM(si.total_price), 0)
            - COALESCE(SUM(si.quantity) * p.cost_price::numeric, 0)                AS gross_profit,
          COALESCE(ii.quantity_in_stock, 0)                                         AS current_stock,
          COALESCE(ii.quantity_in_stock, 0) * p.cost_price::numeric                AS restock_cost,
          (COALESCE(SUM(si.total_price), 0)
            - COALESCE(SUM(si.quantity) * p.cost_price::numeric, 0))
            - (COALESCE(ii.quantity_in_stock, 0) * p.cost_price::numeric)          AS net_profit
        FROM products p
        LEFT JOIN product_categories pc ON pc.id = p.category_id
        LEFT JOIN inventory_items ii ON ii.product_id = p.id
        LEFT JOIN sale_items si
          ON  si.product_id = p.id
          AND si.is_refunded = false
        LEFT JOIN sales s
          ON  s.id = si.sale_id
          AND s.created_at >= ${fromDate}
          AND s.created_at <= ${toDate}
        WHERE p.is_active = true
        GROUP BY p.id, p.sku, p.name, pc.name, p.cost_price, p.price, ii.quantity_in_stock
        ORDER BY gross_profit DESC
      `);
      rows = (result as any).rows ?? [];
      const summary = {
        totalRevenue:     rows.reduce((s: number, r: any) => s + Number(r.revenue), 0),
        totalCogs:        rows.reduce((s: number, r: any) => s + Number(r.cogs), 0),
        totalGrossProfit: rows.reduce((s: number, r: any) => s + Number(r.gross_profit), 0),
        totalRestockCost: rows.reduce((s: number, r: any) => s + Number(r.restock_cost), 0),
        totalNetProfit:   rows.reduce((s: number, r: any) => s + Number(r.net_profit), 0),
        productCount:     rows.length,
      };
      columns = ['SKU', 'Name', 'Category', 'Cost Price', 'Selling Price', 'Margin/Unit', 'Margin %', 'Units Sold', 'Revenue', 'COGS', 'Gross Profit', 'Stock on Hand', 'Restock Cost', 'Net Profit'];
      return res.json({ title, columns, rows, summary, from: fromDate.toISOString(), to: toDate.toISOString() });
    } else {
      return res.status(404).json({ error: 'Unknown report type' });
    }

    return res.json({ title, columns, rows, from: fromDate.toISOString(), to: toDate.toISOString() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ─── PDF generation helper ───────────────────────────────────────────────────
// Streams a tabular PDF for any report type directly to the HTTP response.
// Content-Type is set to application/pdf; Content-Disposition triggers download.
function streamReportPdf(
  res: Response,
  opts: { type: string; title: string; rows: any[]; from?: string; to?: string },
): void {
  const { type, title, rows, from, to } = opts;
  const dateStr = new Date().toISOString().split('T')[0];

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-report-${dateStr}.pdf"`);

  const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: true });
  doc.pipe(res);

  // Header banner
  const PAGE_W = 595.28;
  const MARGIN = 40;
  const TABLE_W = PAGE_W - MARGIN * 2;

  doc.rect(0, 0, PAGE_W, 60).fill('#4f46e5');
  doc.fillColor('white').fontSize(18).font('Helvetica-Bold')
     .text(`${title} Report`, MARGIN, 16, { width: TABLE_W });
  doc.fontSize(9).font('Helvetica').fillColor('#c7d2fe')
     .text(
       `Generated: ${new Date().toLocaleString('en-GH')}  |  Period: ${from ?? 'All'} → ${to ?? 'Now'}`,
       MARGIN, 42, { width: TABLE_W },
     );

  // Column layout — distribute width evenly, cap at 130 pt per column
  const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
  const colW = cols.length > 0
    ? Math.min(130, Math.floor(TABLE_W / cols.length))
    : TABLE_W;

  let y = 75;

  if (cols.length === 0) {
    doc.fillColor('#475569').fontSize(10).font('Helvetica')
       .text('No data for the selected period.', MARGIN, y + 10);
    doc.end();
    return;
  }

  // Column header row
  doc.fillColor('#e8eaf6').rect(MARGIN, y, TABLE_W, 20).fill();
  doc.fillColor('#3730a3').fontSize(8).font('Helvetica-Bold');
  cols.forEach((col, i) => {
    doc.text(String(col), MARGIN + i * colW, y + 6, { width: colW - 4, lineBreak: false });
  });
  y += 20;

  // Data rows
  doc.font('Helvetica').fontSize(8);
  rows.forEach((row, idx) => {
    if (y > 800) {
      doc.addPage();
      y = 40;
      // Repeat header on new page
      doc.fillColor('#e8eaf6').rect(MARGIN, y, TABLE_W, 20).fill();
      doc.fillColor('#3730a3').font('Helvetica-Bold');
      cols.forEach((col, i) => {
        doc.text(String(col), MARGIN + i * colW, y + 6, { width: colW - 4, lineBreak: false });
      });
      y += 20;
      doc.font('Helvetica').fontSize(8);
    }
    if (idx % 2 === 0) {
      doc.fillColor('#f8fafc').rect(MARGIN, y, TABLE_W, 16).fill();
    }
    doc.fillColor('#1e293b');
    cols.forEach((col, i) => {
      const val = row[col];
      let txt = val === null || val === undefined ? '—' : String(val);
      // Truncate long values to fit column
      if (txt.length > 22) txt = txt.slice(0, 21) + '…';
      doc.text(txt, MARGIN + i * colW, y + 4, { width: colW - 4, lineBreak: false });
    });
    y += 16;
  });

  // Footer: row count
  y += 8;
  if (y > 800) { doc.addPage(); y = 40; }
  doc.fillColor('#94a3b8').fontSize(8).font('Helvetica')
     .text(`${rows.length} row${rows.length !== 1 ? 's' : ''} exported`, MARGIN, y);

  doc.end();
}

// Export endpoint
router.get('/:type/export', async (req, res) => {
  try {
    const { type } = req.params;
    const { from, to, format = 'csv' } = req.query as { from?: string; to?: string; format?: string };

    // Reuse the data fetch logic via internal call (simplified)
    const { fromDate, toDate } = parseRange(from, to);

    let rows: any[] = [];
    let title = type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    if (type === 'daily-sales' || type === 'weekly-sales' || type === 'monthly-sales') {
      const groupBy = type === 'monthly-sales'
        ? `TO_CHAR(created_at, 'YYYY-MM')`
        : type === 'weekly-sales'
          ? `TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD')`
          : `DATE(created_at)`;
      const result = await db.execute(sql`
        SELECT ${sql.raw(groupBy)} as "Period",
               COUNT(*) as "Orders",
               COALESCE(SUM(total_amount), 0) as "Revenue",
               COALESCE(SUM(discount_amount), 0) as "Discounts"
        FROM sales WHERE created_at >= ${fromDate} AND created_at <= ${toDate}
        GROUP BY ${sql.raw(groupBy)} ORDER BY "Period"
      `);
      rows = (result as any).rows ?? [];
    } else if (type === 'pnl') {
      const result = await db.execute(sql`
        SELECT TO_CHAR(d, 'YYYY-MM') as "Period",
               COALESCE(rev.revenue, 0) as "Revenue",
               COALESCE(exp.expenses, 0) as "Expenses",
               COALESCE(rev.revenue, 0) - COALESCE(exp.expenses, 0) as "Net Profit"
        FROM generate_series(
          DATE_TRUNC('month', ${fromDate}::timestamp),
          DATE_TRUNC('month', ${toDate}::timestamp),
          '1 month'::interval
        ) d
        LEFT JOIN (SELECT DATE_TRUNC('month', created_at) as m, SUM(total_amount) as revenue FROM sales WHERE created_at >= ${fromDate} AND created_at <= ${toDate} GROUP BY m) rev ON rev.m = d
        LEFT JOIN (SELECT DATE_TRUNC('month', expense_date) as m, SUM(amount) as expenses FROM expenses WHERE expense_date >= ${fromDate} AND expense_date <= ${toDate} GROUP BY m) exp ON exp.m = d
        ORDER BY d
      `);
      rows = (result as any).rows ?? [];
    } else if (type === 'inventory') {
      const result = await db.execute(sql`
        SELECT p.sku as "SKU", p.name as "Name", pc.name as "Category",
               ii.quantity_in_stock as "Stock", ii.reorder_level as "Reorder Level",
               p.cost_price as "Cost Price", p.price as "Selling Price",
               (ii.quantity_in_stock * p.cost_price::numeric) as "Stock Value"
        FROM inventory_items ii
        JOIN products p ON p.id = ii.product_id
        LEFT JOIN product_categories pc ON pc.id = p.category_id
        ORDER BY ii.quantity_in_stock ASC
      `);
      rows = (result as any).rows ?? [];
    } else if (type === 'debtors') {
      const result = await db.execute(sql`
        SELECT c.name as "Customer", c.phone as "Phone", d.total_amount as "Total",
               d.paid_amount as "Paid", d.balance as "Balance",
               d.due_date as "Due Date", d.status as "Status"
        FROM debts d JOIN customers c ON c.id = d.customer_id
        WHERE d.status = 'open' ORDER BY d.balance DESC
      `);
      rows = (result as any).rows ?? [];
    } else if (type === 'customer') {
      const result = await db.execute(sql`
        SELECT c.name as "Name", c.phone as "Phone", c.email as "Email",
               COUNT(s.id) as "Orders", COALESCE(SUM(s.total_amount), 0) as "Total Spent"
        FROM customers c
        LEFT JOIN sales s ON s.customer_id = c.id AND s.created_at >= ${fromDate} AND s.created_at <= ${toDate}
        GROUP BY c.id ORDER BY "Total Spent" DESC
      `);
      rows = (result as any).rows ?? [];
    } else if (type === 'cash-flow') {
      const result = await db.execute(sql`
        SELECT DATE(created_at) as "Date", 'Sale' as "Type", sale_number as "Reference",
               total_amount as "Amount", payment_method::text as "Method"
        FROM sales WHERE created_at >= ${fromDate} AND created_at <= ${toDate}
        UNION ALL
        SELECT DATE(expense_date), 'Expense', COALESCE(reference_number, description),
               -amount, payment_method::text
        FROM expenses WHERE expense_date >= ${fromDate} AND expense_date <= ${toDate}
        ORDER BY "Date"
      `);
      rows = (result as any).rows ?? [];
    } else if (type === 'staff-performance') {
      const result = await db.execute(sql`
        SELECT u.name as "Name", u.role as "Role",
               COUNT(DISTINCT s.id) as "Total Sales",
               COALESCE(SUM(s.total_amount), 0) as "Revenue",
               COUNT(DISTINCT pj.id) as "Print Jobs"
        FROM users u
        LEFT JOIN sales s ON s.cashier_id = u.id AND s.created_at >= ${fromDate} AND s.created_at <= ${toDate}
        LEFT JOIN print_jobs pj ON pj.assigned_to = u.id AND pj.created_at >= ${fromDate} AND pj.created_at <= ${toDate}
        GROUP BY u.id ORDER BY "Revenue" DESC
      `);
      rows = (result as any).rows ?? [];
    } else if (type === 'print-jobs') {
      const result = await db.execute(sql`
        SELECT pj.job_number as "Job #", pj.title as "Title", pj.status as "Status",
               c.name as "Customer", u.name as "Operator",
               pj.total_amount as "Amount", pj.payment_status as "Payment",
               pj.created_at as "Created"
        FROM print_jobs pj
        LEFT JOIN customers c ON c.id = pj.customer_id
        LEFT JOIN users u ON u.id = pj.assigned_to
        WHERE pj.created_at >= ${fromDate} AND pj.created_at <= ${toDate}
        ORDER BY pj.created_at DESC
      `);
      rows = (result as any).rows ?? [];
    } else if (type === 'profit-analysis') {
      const result = await db.execute(sql`
        SELECT
          p.sku                                                                      AS "SKU",
          p.name                                                                     AS "Name",
          COALESCE(pc.name, 'Uncategorised')                                        AS "Category",
          p.cost_price::numeric                                                      AS "Cost Price",
          p.price::numeric                                                           AS "Selling Price",
          (p.price::numeric - p.cost_price::numeric)                                AS "Margin/Unit",
          CASE WHEN p.price::numeric > 0
            THEN ROUND(((p.price::numeric - p.cost_price::numeric) / p.price::numeric) * 100, 1)
            ELSE 0 END                                                              AS "Margin %",
          COALESCE(SUM(si.quantity), 0)                                             AS "Units Sold",
          COALESCE(SUM(si.total_price), 0)                                          AS "Revenue",
          COALESCE(SUM(si.quantity) * p.cost_price::numeric, 0)                     AS "COGS",
          COALESCE(SUM(si.total_price), 0)
            - COALESCE(SUM(si.quantity) * p.cost_price::numeric, 0)                AS "Gross Profit",
          COALESCE(ii.quantity_in_stock, 0)                                         AS "Stock on Hand",
          COALESCE(ii.quantity_in_stock, 0) * p.cost_price::numeric                AS "Restock Cost",
          (COALESCE(SUM(si.total_price), 0)
            - COALESCE(SUM(si.quantity) * p.cost_price::numeric, 0))
            - (COALESCE(ii.quantity_in_stock, 0) * p.cost_price::numeric)          AS "Net Profit"
        FROM products p
        LEFT JOIN product_categories pc ON pc.id = p.category_id
        LEFT JOIN inventory_items ii ON ii.product_id = p.id
        LEFT JOIN sale_items si ON si.product_id = p.id AND si.is_refunded = false
        LEFT JOIN sales s ON s.id = si.sale_id AND s.created_at >= ${fromDate} AND s.created_at <= ${toDate}
        WHERE p.is_active = true
        GROUP BY p.id, p.sku, p.name, pc.name, p.cost_price, p.price, ii.quantity_in_stock
        ORDER BY "Gross Profit" DESC
      `);
      rows = (result as any).rows ?? [];
    }

    if (format === 'pdf') {
      return streamReportPdf(res, { type, title, rows, from, to });
    } else if (format === 'csv') {
      const ws = XLSX.utils.json_to_sheet(rows);
      const csv = XLSX.utils.sheet_to_csv(ws);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-report-${new Date().toISOString().split('T')[0]}.csv"`);
      return res.send(csv);
    } else {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, title);
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-report-${new Date().toISOString().split('T')[0]}.xlsx"`);
      return res.send(buf);
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to export report' });
  }
});

export default router;
