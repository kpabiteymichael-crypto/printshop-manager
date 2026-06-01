import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';

import { sanitizeInput, requestLogger } from './middleware/sanitize';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { auditLog } from './middleware/auditLog';

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
import debtsRoutes from './routes/debts';
import businessAnalyticsRoutes from './routes/business-analytics';
import receiptsRoutes from './routes/receipts';
import quotationsRoutes from './routes/quotations';
import invoicesRoutes from './routes/invoices';
import pdfRoutes from './routes/pdf';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

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

  const isTest = process.env.NODE_ENV === 'test';

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 0 : 500,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isTest,
    message: { error: 'Too many requests, please try again later.' },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 0 : 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isTest,
    message: { error: 'Too many login attempts, please try again later.' },
  });

  app.use('/api', limiter);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(sanitizeInput);
  app.use(requestLogger);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

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
  app.use('/api/debts', debtsRoutes);
  app.use('/api/analytics', businessAnalyticsRoutes);
  app.use('/api/receipts', receiptsRoutes);
  app.use('/api/quotations', quotationsRoutes);
  app.use('/api/invoices', invoicesRoutes);
  app.use('/api/pdf', pdfRoutes);

  app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));

  // Alias routes matching the documented API contract
  app.get('/api/receipts/:id/pdf', (req: any, _res: any, next: any) => { req.url = `/receipt/${req.params.id}`; next(); }, pdfRoutes);
  app.get('/api/quotations/:id/pdf', (req: any, _res: any, next: any) => { req.url = `/quotation/${req.params.id}`; next(); }, pdfRoutes);
  app.get('/api/invoices/:id/pdf', (req: any, _res: any, next: any) => { req.url = `/invoice/${req.params.id}`; next(); }, pdfRoutes);
  app.get('/api/suppliers/purchase-orders/:id/pdf', (req: any, _res: any, next: any) => { req.url = `/purchase-order/${req.params.id}`; next(); }, pdfRoutes);

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

  return app;
}
