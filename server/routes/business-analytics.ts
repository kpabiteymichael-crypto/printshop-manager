import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { sales, saleItems, expenses, printJobs, customers, products, inventoryItems, debts } from '../db/schema';
import { sql, gte, lte, and, eq, desc } from 'drizzle-orm';

const router = Router();
router.use(authenticate);
router.use(authorize('owner', 'manager'));

// GET /api/analytics/sales-summary?period=today|week|month|year
router.get('/sales-summary', async (req, res) => {
  try {
    const { period = 'month' } = req.query as { period?: string };
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);

    let from: Date;
    let prevFrom: Date;
    let prevTo: Date;
    if (period === 'today') {
      from = today;
      prevFrom = new Date(today.getTime() - 86400000);
      prevTo = today;
    } else if (period === 'week') {
      from = new Date(today.getTime() - 7 * 86400000);
      prevFrom = new Date(today.getTime() - 14 * 86400000);
      prevTo = from;
    } else if (period === 'year') {
      from = new Date(now.getFullYear(), 0, 1);
      prevFrom = new Date(now.getFullYear() - 1, 0, 1);
      prevTo = from;
    } else {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevTo = from;
    }

    const [curr] = await db.select({
      totalSales: sql<string>`COALESCE(SUM(total_amount), 0)`,
      totalOrders: sql<number>`COUNT(*)`,
    }).from(sales).where(gte(sales.createdAt, from));

    const [prev] = await db.select({
      totalSales: sql<string>`COALESCE(SUM(total_amount), 0)`,
    }).from(sales).where(and(gte(sales.createdAt, prevFrom), lte(sales.createdAt, prevTo)));

    const [currExp] = await db.select({
      total: sql<string>`COALESCE(SUM(amount), 0)`,
    }).from(expenses).where(gte(expenses.expenseDate, from));

    const [totalDebt] = await db.select({
      total: sql<string>`COALESCE(SUM(balance), 0)`,
    }).from(debts).where(eq(debts.status, 'open'));

    const [pendingJobs] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(printJobs).where(eq(printJobs.status, 'pending'));
    const [inProgressJobs] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(printJobs).where(eq(printJobs.status, 'in_progress'));

    const invValueResult = await db.execute(sql`
      SELECT COALESCE(SUM(ii.quantity_in_stock * p.cost_price::numeric), 0) as total_value
      FROM inventory_items ii JOIN products p ON p.id = ii.product_id
    `);

    const currSales = parseFloat(curr.totalSales);
    const prevSales = parseFloat(prev.totalSales);
    const delta = prevSales > 0 ? ((currSales - prevSales) / prevSales) * 100 : 0;
    const currExpenses = parseFloat(currExp.total);

    return res.json({
      totalSales: currSales,
      totalOrders: Number(curr.totalOrders),
      totalExpenses: currExpenses,
      netProfit: currSales - currExpenses,
      delta: Math.round(delta * 10) / 10,
      pendingPrintJobs: Number(pendingJobs.count),
      inProgressPrintJobs: Number(inProgressJobs.count),
      outstandingDebts: parseFloat(totalDebt.total),
      inventoryValue: Number((invValueResult as any).rows?.[0]?.total_value ?? 0),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch sales summary' });
  }
});

// GET /api/analytics/revenue-trend?period=7|30|90|365
router.get('/revenue-trend', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const from = new Date(Date.now() - days * 86400000);

    const salesTrend = await db.execute(sql`
      SELECT DATE(created_at) as date,
             COALESCE(SUM(total_amount), 0) as revenue,
             COUNT(*) as orders
      FROM sales
      WHERE created_at >= ${from}
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at)
    `);

    const expensesTrend = await db.execute(sql`
      SELECT DATE(expense_date) as date,
             COALESCE(SUM(amount), 0) as expenses
      FROM expenses
      WHERE expense_date >= ${from}
      GROUP BY DATE(expense_date)
      ORDER BY DATE(expense_date)
    `);

    const salesMap = new Map((salesTrend as any).rows.map((r: any) => [r.date?.toISOString?.().split('T')[0] ?? r.date, r]));
    const expMap = new Map((expensesTrend as any).rows.map((r: any) => [r.date?.toISOString?.().split('T')[0] ?? r.date, r]));

    const allDates = new Set([...salesMap.keys(), ...expMap.keys()]);
    const result = [];
    const cur = new Date(from);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(0, 0, 0, 0);
    while (cur <= end) {
      const key = cur.toISOString().split('T')[0];
      const s = salesMap.get(key) as any;
      const e = expMap.get(key) as any;
      result.push({
        date: key,
        revenue: s ? parseFloat(s.revenue) : 0,
        orders: s ? Number(s.orders) : 0,
        expenses: e ? parseFloat(e.expenses) : 0,
      });
      cur.setDate(cur.getDate() + 1);
    }

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch revenue trend' });
  }
});

// GET /api/analytics/top-products?limit=10&days=30
router.get('/top-products', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const days = parseInt(req.query.days as string) || 30;
    const from = new Date(Date.now() - days * 86400000);

    const result = await db.execute(sql`
      SELECT
        si.description,
        si.product_id,
        p.name as product_name,
        SUM(si.quantity) as total_quantity,
        SUM(si.total_price) as total_revenue
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.created_at >= ${from}
      GROUP BY si.description, si.product_id, p.name
      ORDER BY total_revenue DESC
      LIMIT ${limit}
    `);

    return res.json((result as any).rows ?? []);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch top products' });
  }
});

// GET /api/analytics/top-customers?limit=5&days=30
router.get('/top-customers', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const days = parseInt(req.query.days as string) || 30;
    const from = new Date(Date.now() - days * 86400000);

    const result = await db.execute(sql`
      SELECT
        c.id,
        c.name,
        c.phone,
        COUNT(s.id) as total_orders,
        SUM(s.total_amount) as total_spent
      FROM customers c
      JOIN sales s ON s.customer_id = c.id
      WHERE s.created_at >= ${from}
      GROUP BY c.id, c.name, c.phone
      ORDER BY total_spent DESC
      LIMIT ${limit}
    `);

    return res.json((result as any).rows ?? []);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch top customers' });
  }
});

// GET /api/analytics/print-stats
router.get('/print-stats', async (req, res) => {
  try {
    const byStatus = await db.select({
      status: printJobs.status,
      count: sql<number>`COUNT(*)`,
      total: sql<string>`COALESCE(SUM(total_amount), 0)`,
    }).from(printJobs).groupBy(printJobs.status);

    const [thisMonth] = await db.select({
      count: sql<number>`COUNT(*)`,
      revenue: sql<string>`COALESCE(SUM(total_amount), 0)`,
    }).from(printJobs).where(gte(printJobs.createdAt, new Date(new Date().getFullYear(), new Date().getMonth(), 1)));

    return res.json({ byStatus, thisMonth: { count: Number(thisMonth.count), revenue: parseFloat(thisMonth.revenue) } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch print stats' });
  }
});

// GET /api/analytics/financial-summary?months=6
router.get('/financial-summary', async (req, res) => {
  try {
    const months = parseInt(req.query.months as string) || 6;
    const result = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

      const [rev] = await db.select({
        total: sql<string>`COALESCE(SUM(total_amount), 0)`,
      }).from(sales).where(and(gte(sales.createdAt, start), lte(sales.createdAt, end)));

      const [exp] = await db.select({
        total: sql<string>`COALESCE(SUM(amount), 0)`,
      }).from(expenses).where(and(gte(expenses.expenseDate, start), lte(expenses.expenseDate, end)));

      const revenue = parseFloat(rev.total);
      const expAmt = parseFloat(exp.total);
      result.push({
        month: start.toLocaleDateString('en-GH', { month: 'short', year: '2-digit' }),
        revenue,
        expenses: expAmt,
        profit: revenue - expAmt,
      });
    }

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch financial summary' });
  }
});

// GET /api/analytics/insights
router.get('/insights', async (req, res) => {
  try {
    const insights: Array<{ type: string; severity: 'info' | 'warning' | 'alert'; message: string; metric?: string }> = [];

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000);

    // 1. Revenue trend delta (this month vs last month)
    const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const lastMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);

    const [thisMonthRev] = await db.select({ total: sql<string>`COALESCE(SUM(total_amount), 0)` })
      .from(sales).where(gte(sales.createdAt, thisMonthStart));
    const [lastMonthRev] = await db.select({ total: sql<string>`COALESCE(SUM(total_amount), 0)` })
      .from(sales).where(and(gte(sales.createdAt, lastMonthStart), lte(sales.createdAt, thisMonthStart)));

    const thisM = parseFloat(thisMonthRev.total);
    const lastM = parseFloat(lastMonthRev.total);
    if (lastM > 0) {
      const delta = ((thisM - lastM) / lastM) * 100;
      if (delta > 10) {
        insights.push({ type: 'trend', severity: 'info', message: `Revenue is up ${delta.toFixed(1)}% vs last month. Strong performance — consider stocking popular items.`, metric: `+${delta.toFixed(1)}%` });
      } else if (delta < -10) {
        insights.push({ type: 'trend', severity: 'warning', message: `Revenue is down ${Math.abs(delta).toFixed(1)}% vs last month. Review pricing and run promotions.`, metric: `${delta.toFixed(1)}%` });
      }
    }

    // 2. Inventory burn rate — days to stockout
    const burnRateResult = await db.execute(sql`
      SELECT
        p.name,
        ii.quantity_in_stock,
        ii.reorder_level,
        COALESCE(SUM(im.quantity), 0) as sold_30d
      FROM inventory_items ii
      JOIN products p ON p.id = ii.product_id
      LEFT JOIN inventory_movements im ON im.inventory_item_id = ii.id
        AND im.type IN ('out', 'sale')
        AND im.created_at >= ${thirtyDaysAgo}
      WHERE ii.quantity_in_stock > 0
      GROUP BY p.name, ii.quantity_in_stock, ii.reorder_level
      HAVING COALESCE(SUM(im.quantity), 0) > 0
    `);

    const burnItems = (burnRateResult as any).rows ?? [];
    const criticalItems: string[] = [];
    const warningItems: string[] = [];

    for (const item of burnItems) {
      const dailyRate = Number(item.sold_30d) / 30;
      if (dailyRate <= 0) continue;
      const daysLeft = Number(item.quantity_in_stock) / dailyRate;
      if (daysLeft <= 5) {
        criticalItems.push(`${item.name} (~${Math.floor(daysLeft)}d)`);
      } else if (daysLeft <= 14) {
        warningItems.push(`${item.name} (~${Math.floor(daysLeft)}d)`);
      }
    }

    if (criticalItems.length > 0) {
      insights.push({ type: 'inventory', severity: 'alert', message: `Critical stock: ${criticalItems.slice(0, 3).join(', ')} — reorder immediately to avoid stockouts.`, metric: `${criticalItems.length} items` });
    }
    if (warningItems.length > 0) {
      insights.push({ type: 'inventory', severity: 'warning', message: `Low stock alert: ${warningItems.slice(0, 3).join(', ')} may run out within 2 weeks.`, metric: `${warningItems.length} items` });
    }

    // 3. Top selling category
    const topCatResult = await db.execute(sql`
      SELECT
        COALESCE(pc.name, 'Services') as category,
        SUM(si.total_price) as revenue
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      LEFT JOIN product_categories pc ON pc.id = p.category_id
      WHERE s.created_at >= ${thirtyDaysAgo}
      GROUP BY COALESCE(pc.name, 'Services')
      ORDER BY revenue DESC
      LIMIT 1
    `);
    const topCat = (topCatResult as any).rows?.[0];
    if (topCat) {
      insights.push({ type: 'category', severity: 'info', message: `"${topCat.category}" is your best-performing category this month with ₵${parseFloat(topCat.revenue).toLocaleString('en-GH', { minimumFractionDigits: 2 })} in revenue.`, metric: `₵${parseFloat(topCat.revenue).toLocaleString()}` });
    }

    // 4. Outstanding debts alert
    const [debtSum] = await db.select({ total: sql<string>`COALESCE(SUM(balance), 0)`, count: sql<number>`COUNT(*)` })
      .from(debts).where(eq(debts.status, 'open'));
    const debtTotal = parseFloat(debtSum.total);
    if (debtTotal > 500) {
      insights.push({ type: 'debt', severity: debtTotal > 2000 ? 'alert' : 'warning', message: `You have ₵${debtTotal.toLocaleString('en-GH', { minimumFractionDigits: 2 })} outstanding from ${Number(debtSum.count)} customer debt${Number(debtSum.count) > 1 ? 's' : ''}. Follow up to improve cash flow.`, metric: `₵${debtTotal.toLocaleString()}` });
    }

    // 5. Print job pending too long
    const [stalePending] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(printJobs).where(and(eq(printJobs.status, 'pending'), lte(printJobs.createdAt, new Date(Date.now() - 2 * 86400000))));
    if (Number(stalePending.count) > 0) {
      insights.push({ type: 'print', severity: 'warning', message: `${Number(stalePending.count)} print job${Number(stalePending.count) > 1 ? 's have' : ' has'} been pending for over 2 days. Assign operators to avoid customer delays.`, metric: `${Number(stalePending.count)} jobs` });
    }

    return res.json({ insights, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to generate insights' });
  }
});

export default router;
