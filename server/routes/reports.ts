import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { sales, saleItems, expenses, printJobs, users, customers, debts } from '../db/schema';
import { eq, sql, gte, lte, and, desc } from 'drizzle-orm';
import * as XLSX from 'xlsx';

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
    } else {
      return res.status(404).json({ error: 'Unknown report type' });
    }

    return res.json({ title, columns, rows, from: fromDate.toISOString(), to: toDate.toISOString() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to generate report' });
  }
});

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
               total_amount as "Amount", payment_method as "Method"
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
    }

    if (format === 'pdf') {
      const PDFDocument = (await import('pdfkit')).default;
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const dateStr = new Date().toISOString().split('T')[0];
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-report-${dateStr}.pdf"`);
      doc.pipe(res);

      doc.rect(0, 0, 595.28, 60).fill('#4f46e5');
      doc.fillColor('white').fontSize(18).font('Helvetica-Bold').text(title + ' Report', 40, 18);
      doc.fontSize(10).font('Helvetica').fillColor('#c7d2fe').text(`Generated: ${new Date().toLocaleString('en-GH')}  |  Period: ${from ?? 'All'} → ${to ?? 'Now'}`, 40, 42);

      let y = 80;
      const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
      const colW = Math.min(120, (595.28 - 80) / Math.max(cols.length, 1));

      doc.fillColor('#f8fafc').rect(40, y, 515.28, 20).fill();
      doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold');
      cols.forEach((col, i) => doc.text(String(col), 40 + i * colW, y + 6, { width: colW - 4 }));
      y += 20;

      doc.font('Helvetica').fontSize(8);
      rows.forEach((row, idx) => {
        if (y > 780) { doc.addPage(); y = 40; }
        if (idx % 2 === 0) { doc.fillColor('#f8fafc').rect(40, y, 515.28, 16).fill(); }
        doc.fillColor('#1e293b');
        cols.forEach((col, i) => {
          const val = row[col];
          const txt = val === null || val === undefined ? '—' : String(val);
          doc.text(txt.slice(0, 20), 40 + i * colW, y + 4, { width: colW - 4 });
        });
        y += 16;
      });

      doc.end();
      return;
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
