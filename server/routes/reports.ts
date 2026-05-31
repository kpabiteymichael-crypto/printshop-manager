import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { sales, saleItems, expenses, printJobs } from '../db/schema';
import { eq, sql, gte, lte, and, desc } from 'drizzle-orm';

const router = Router();
router.use(authenticate);
router.use(authorize('owner', 'manager'));

router.get('/sales-summary', async (req, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(1));
    const toDate = to ? new Date(to) : new Date();

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
      total: sql<string>`SUM(total_amount)`,
    }).from(printJobs).groupBy(printJobs.status);
    return res.json({ byStatus });
  } catch { return res.status(500).json({ error: 'Failed to generate print jobs report' }); }
});

export default router;
