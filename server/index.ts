import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

dotenv.config();

import logger from './lib/logger';
import { sanitizeInput, requestLogger } from './middleware/sanitize';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { auditLog } from './middleware/auditLog';
import { runMigrations } from './db/migrate';
import { db } from './db/index';
import { sql } from 'drizzle-orm';

import authRoutes from './routes/auth';
import dashboardRoutes from './routes/dashboard';
import posRoutes from './routes/pos';
import printJobRoutes from './routes/print-jobs';
import inventoryRoutes from './routes/inventory';
import customersRoutes from './routes/customers';
import suppliersRoutes from './routes/suppliers';
import purchaseOrdersRoutes from './routes/purchase-orders';
import cashRoutes from './routes/cash';
import expensesRoutes from './routes/expenses';
import reportsRoutes from './routes/reports';
import productsRoutes from './routes/products';
import settingsRoutes from './routes/settings';
import notificationRoutes from './routes/notifications';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || (process.env.NODE_ENV === 'production' ? 3000 : 3001);

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : true;

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
  level: 6,
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

app.use('/api', limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeInput);
app.use(requestLogger);

// ── Seed endpoints (non-production only) ──────────────────────────────────────
const seedSecret = process.env.SEED_SECRET;
if (!seedSecret) {
  if (process.env.NODE_ENV === 'production') {
    logger.warn('SEED_SECRET not set — seed endpoints disabled in production');
  } else {
    logger.warn('[WARNING] SEED_SECRET is not set. Seed endpoints disabled. Set SEED_SECRET to enable them.');
  }
}

if (seedSecret && process.env.NODE_ENV !== 'production') {
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

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  const startTime = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor(process.uptime()),
      db: 'connected',
      responseTimeMs: Date.now() - startTime,
    });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'disconnected', error: (err as Error).message });
  }
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api', auditLog);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/print-jobs', printJobRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/purchase-orders', purchaseOrdersRoutes);
app.use('/api/cash', cashRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notifications', notificationRoutes);

app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(process.cwd(), 'dist/client');
  app.use(express.static(distPath, {
    maxAge: '1y',
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    },
  }));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  try {
    await runMigrations();
    logger.info('Database migrations complete');

    try {
      const { seedDatabase } = await import('./db/seed.js');
      await seedDatabase();
    } catch (e) {
      logger.debug('Seed skipped or already seeded', { reason: (e as Error).message });
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
