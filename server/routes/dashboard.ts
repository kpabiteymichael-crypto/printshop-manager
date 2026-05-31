import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { sales, saleItems, expenses, printJobs, customers, products, inventoryItems, cashSessions, debts } from '../db/schema';
import { sql, eq, gte, desc } from 'drizzle-orm';

const router = Router();

router.get('/summary', authenticate, authorize('owner', 'manager'), async (_req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [salesToday] = await db.select({
      count: sql<number>`COUNT(*)`,
      total: sql<string>`COALESCE(SUM(total_amount), 0)`,
    }).from(sales).where(gte(sales.createdAt, today));

    const [expensesToday] = await db.select({
      total: sql<string>`COALESCE(SUM(amount), 0)`,
    }).from(expenses).where(gte(expenses.createdAt, today));

    const [pendingJobs] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(printJobs).where(eq(printJobs.status, 'pending'));

    const [inProgressJobs] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(printJobs).where(eq(printJobs.status, 'in_progress'));

    const [totalCustomers] = await db.select({ count: sql<number>`COUNT(*)` }).from(customers);

    const [lowStock] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(inventoryItems)
      .where(sql`quantity_in_stock <= reorder_level`);

    const [outOfStock] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(inventoryItems)
      .where(sql`quantity_in_stock = 0`);

    const inventoryValueResult = await db.execute(sql`
      SELECT COALESCE(SUM(ii.quantity_in_stock * p.cost_price::numeric), 0) as total_value
      FROM inventory_items ii
      JOIN products p ON p.id = ii.product_id
      WHERE p.cost_price IS NOT NULL
    `);

    const topMovingResult = await db.execute(sql`
      SELECT
        p.id,
        p.name,
        p.sku,
        COALESCE(SUM(recent.qty), 0) AS units_sold
      FROM products p
      LEFT JOIN (
        SELECT si.product_id, si.quantity AS qty
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.created_at >= NOW() - INTERVAL '30 days'
      ) recent ON recent.product_id = p.id
      GROUP BY p.id, p.name, p.sku
      ORDER BY units_sold DESC
      LIMIT 5
    `);

    const [openSession] = await db.select().from(cashSessions)
      .where(eq(cashSessions.status, 'open')).limit(1);

    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    const [weekExpenses] = await db.select({
      total: sql<string>`COALESCE(SUM(amount), 0)`,
    }).from(expenses).where(gte(expenses.expenseDate, weekAgo));

    const [weekRevenue] = await db.select({
      total: sql<string>`COALESCE(SUM(total_amount), 0)`,
    }).from(sales).where(gte(sales.createdAt, weekAgo));

    const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
    const monthlySales = await db.select({
      date: sql<string>`DATE(created_at)`,
      total: sql<string>`SUM(total_amount)`,
      count: sql<number>`COUNT(*)`,
    }).from(sales)
      .where(gte(sales.createdAt, thirtyDaysAgo))
      .groupBy(sql`DATE(created_at)`)
      .orderBy(sql`DATE(created_at)`);

    const thirtyDaysAgoExpenses = new Date(today.getTime() - 30 * 86400000);
    const [monthExpenses] = await db.select({
      total: sql<string>`COALESCE(SUM(amount), 0)`,
    }).from(expenses).where(gte(expenses.expenseDate, thirtyDaysAgo));

    const [monthRevenue] = await db.select({
      total: sql<string>`COALESCE(SUM(total_amount), 0)`,
    }).from(sales).where(gte(sales.createdAt, thirtyDaysAgo));

    const profitData = {
      today: {
        revenue: parseFloat(salesToday.total),
        expenses: parseFloat(expensesToday.total),
        profit: parseFloat(salesToday.total) - parseFloat(expensesToday.total),
      },
      week: {
        revenue: parseFloat(weekRevenue.total),
        expenses: parseFloat(weekExpenses.total),
        profit: parseFloat(weekRevenue.total) - parseFloat(weekExpenses.total),
      },
      month: {
        revenue: parseFloat(monthRevenue.total),
        expenses: parseFloat(monthExpenses.total),
        profit: parseFloat(monthRevenue.total) - parseFloat(monthExpenses.total),
      },
    };

    const [totalDebt] = await db.select({
      total: sql<string>`COALESCE(SUM(balance), 0)`,
    }).from(debts).where(eq(debts.status, 'open'));

    return res.json({
      todaySales: { count: Number(salesToday.count), total: parseFloat(salesToday.total) },
      todayExpenses: parseFloat(expensesToday.total),
      pendingJobs: Number(pendingJobs.count),
      inProgressJobs: Number(inProgressJobs.count),
      totalCustomers: Number(totalCustomers.count),
      lowStockItems: Number(lowStock.count),
      outOfStockItems: Number(outOfStock.count),
      inventoryValue: Number((inventoryValueResult as any).rows?.[0]?.total_value ?? 0),
      topMovingProducts: (topMovingResult as any).rows ?? [],
      hasOpenSession: !!openSession,
      openSession: openSession || null,
      monthlySales,
      profit: profitData,
      outstandingDebts: parseFloat(totalDebt.total),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

export default router;
