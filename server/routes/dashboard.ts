import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { sales, expenses, printJobs, customers, products, inventoryItems, cashSessions } from '../db/schema';
import { sql, eq, gte, and } from 'drizzle-orm';

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

    const [openSession] = await db.select().from(cashSessions)
      .where(eq(cashSessions.status, 'open')).limit(1);

    const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
    const monthlySales = await db.select({
      date: sql<string>`DATE(created_at)`,
      total: sql<string>`SUM(total_amount)`,
      count: sql<number>`COUNT(*)`,
    }).from(sales)
      .where(gte(sales.createdAt, thirtyDaysAgo))
      .groupBy(sql`DATE(created_at)`)
      .orderBy(sql`DATE(created_at)`);

    return res.json({
      todaySales: { count: Number(salesToday.count), total: parseFloat(salesToday.total) },
      todayExpenses: parseFloat(expensesToday.total),
      pendingJobs: Number(pendingJobs.count),
      inProgressJobs: Number(inProgressJobs.count),
      totalCustomers: Number(totalCustomers.count),
      lowStockItems: Number(lowStock.count),
      hasOpenSession: !!openSession,
      openSession: openSession || null,
      monthlySales,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

export default router;
