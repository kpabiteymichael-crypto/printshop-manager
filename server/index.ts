import * as dotenv from 'dotenv';
dotenv.config();

import logger from './lib/logger';
import { runMigrations } from './db/migrate';
import { db } from './db/index';
import { sql } from 'drizzle-orm';
import { createApp } from './app';

const app = createApp();
const PORT = process.env.PORT || (process.env.NODE_ENV === 'production' ? 3000 : 3001);

// ── Seed endpoints (secret-protected, available in all environments) ──────────
const seedSecret = process.env.SEED_SECRET;
if (!seedSecret) {
  logger.warn('SEED_SECRET not set — seed endpoints disabled. Set SEED_SECRET to enable.');
}

if (seedSecret) {
  app.post('/api/admin/seed', async (req, res) => {
    const secret = req.headers['x-seed-secret'] || req.query.secret;
    if (secret !== seedSecret) return res.status(401).json({ error: 'Invalid seed secret' });
    try {
      const { seedDatabase } = await import('./db/seed.js');
      await seedDatabase();
      res.json({ success: true, message: 'Database seeded successfully' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/force-seed', async (req, res) => {
    const secret = req.headers['x-seed-secret'] || req.query.secret;
    if (secret !== seedSecret) return res.status(401).json({ error: 'Invalid seed secret' });
    try {
      await db.execute(sql`
        TRUNCATE TABLE notifications, staff_activity, audit_logs, receipts, expenses, expense_categories,
        sale_items, sales, cash_sessions, purchase_order_items, purchase_orders, suppliers,
        inventory_movements, inventory_items, print_jobs, services, products, product_categories,
        customers, settings, users RESTART IDENTITY CASCADE
      `);
      const { seedDatabase } = await import('./db/seed.js');
      await seedDatabase();
      res.json({ success: true, message: 'Database force-seeded successfully' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });
}

async function start() {
  try {
    await runMigrations();
    logger.info('Database migrations complete');

    try {
      const { seedDatabase } = await import('./db/seed.js');
      await seedDatabase();
    } catch (e) {
      logger.error('Auto-seed failed on startup', { reason: (e as Error).message });
    }

    app.listen(PORT, () => {
      logger.info(`PrintShop API running on http://localhost:${PORT}`, {
        port: PORT,
        env: process.env.NODE_ENV || 'development',
      });
    });
  } catch (err) {
    logger.error('Failed to start server', { error: (err as Error).message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => { logger.info('SIGTERM received. Shutting down...'); process.exit(0); });
process.on('SIGINT', () => { logger.info('SIGINT received. Shutting down...'); process.exit(0); });

start();
