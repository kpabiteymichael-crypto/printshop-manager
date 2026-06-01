import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';

import { db } from './db/index';
import { sql } from 'drizzle-orm';
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

  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [];

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOriginsEnv.length === 0) return callback(null, true);
      const isAllowed =
        allowedOriginsEnv.includes(origin) ||
        /^https:\/\/[\w-]+(\.vercel\.app)$/.test(origin) ||
        /^https:\/\/[\w-]+-[\w-]+\.vercel\.app$/.test(origin) ||
        origin === 'http://localhost:5000' ||
        origin === 'http://localhost:3000';
      callback(isAllowed ? null : new Error('Not allowed by CORS'), isAllowed);
    },
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

  // ── Temporary seed UI — lives under /api so it's never intercepted ───────────
  const _SEED_PASS = 'printshop2024';

  app.get('/api/setup', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>PrintShop Setup</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem}
.card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:2rem;width:100%;max-width:440px}
h1{font-size:1.2rem;font-weight:700;color:#f8fafc;margin-bottom:.4rem}
p{font-size:.85rem;color:#94a3b8;margin-bottom:1.5rem;line-height:1.5}
label{display:block;font-size:.72rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.35rem}
input[type=password]{width:100%;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#f1f5f9;padding:.6rem .75rem;font-size:.95rem;outline:none}
input:focus{border-color:#6366f1}
.actions{display:flex;flex-direction:column;gap:.75rem;margin-top:1.25rem}
button{width:100%;padding:.7rem;border:none;border-radius:8px;font-size:.88rem;font-weight:600;cursor:pointer}
button:disabled{opacity:.45;cursor:not-allowed}
.btn-safe{background:#6366f1;color:#fff}
.btn-force{background:#dc2626;color:#fff}
.msg{margin-top:1.25rem;padding:.85rem;border-radius:8px;font-size:.85rem;display:none}
.msg.ok{background:#14532d;border:1px solid #166534;color:#bbf7d0}
.msg.err{background:#450a0a;border:1px solid #7f1d1d;color:#fecaca}
.spin{display:inline-block;width:13px;height:13px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:s .6s linear infinite;vertical-align:middle;margin-right:5px}
@keyframes s{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="card">
  <h1>&#128295; PrintShop &mdash; Database Setup</h1>
  <p>Populate the database with demo accounts and sample data.<br/>Use <strong>Force Re-seed</strong> if you tried before and still can't log in.</p>
  <div>
    <label>Admin Password</label>
    <input type="password" id="pw" placeholder="Enter admin password" autocomplete="off"/>
  </div>
  <div class="actions">
    <button class="btn-safe" onclick="go('seed')">&#9654; Seed Database (first time)</button>
    <button class="btn-force" onclick="go('force')">&#9888; Force Re-seed (clears everything)</button>
  </div>
  <div class="msg" id="msg"></div>
</div>
<script>
async function go(action){
  const pw=document.getElementById('pw').value.trim();
  if(!pw){show('Please enter the admin password.',false);return;}
  document.querySelectorAll('button').forEach(b=>b.disabled=true);
  show('<span class="spin"></span>Working&hellip; may take up to 60 s on first load.',true);
  try{
    const r=await fetch('/api/do-setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,pw})});
    const d=await r.json();
    if(r.ok&&d.success){show('&#10003; '+d.message+'<br/><br/>You can now log in at your Vercel frontend.',true);}
    else{show('&#10007; '+(d.error||'Unknown error'),false);}
  }catch(e){show('&#10007; Network error: '+e.message,false);}
  finally{document.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
function show(m,ok){const el=document.getElementById('msg');el.style.display='block';el.className='msg '+(ok?'ok':'err');el.innerHTML=m;}
</script>
</body>
</html>`);
  });

  app.post('/api/do-setup', async (req, res) => {
    const { action, pw } = req.body as { action: string; pw: string };
    if (pw !== _SEED_PASS) return res.status(401).json({ error: 'Incorrect password.' });
    try {
      if (action === 'force') {
        await db.execute(sql`
          TRUNCATE TABLE notifications, staff_activity, audit_logs, receipts, expenses, expense_categories,
          sale_items, sales, cash_sessions, purchase_order_items, purchase_orders, suppliers,
          inventory_movements, inventory_items, print_jobs, services, products, product_categories,
          customers, settings, users RESTART IDENTITY CASCADE
        `);
      }
      const { seedDatabase } = await import('./db/seed.js');
      await seedDatabase();
      res.json({ success: true, message: action === 'force' ? 'Database wiped and re-seeded.' : 'Database seeded with demo data.' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
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

  // ── Temporary admin seed UI ─────────────────────────────────────────────────
  const ADMIN_UI_PASS = 'printshop2024';

  app.get('/admin/seed', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>PrintShop — Seed Database</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem}
  .card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:2rem;width:100%;max-width:440px}
  h1{font-size:1.25rem;font-weight:700;color:#f8fafc;margin-bottom:.5rem}
  p{font-size:.875rem;color:#94a3b8;margin-bottom:1.5rem}
  label{display:block;font-size:.75rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.4rem}
  input[type=password]{width:100%;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#f1f5f9;padding:.6rem .75rem;font-size:.95rem;outline:none;transition:border-color .15s}
  input[type=password]:focus{border-color:#6366f1}
  .actions{display:flex;flex-direction:column;gap:.75rem;margin-top:1.25rem}
  button{width:100%;padding:.7rem 1rem;border:none;border-radius:8px;font-size:.9rem;font-weight:600;cursor:pointer;transition:opacity .15s}
  button:disabled{opacity:.5;cursor:not-allowed}
  .btn-safe{background:#6366f1;color:#fff}
  .btn-force{background:#dc2626;color:#fff}
  .result{margin-top:1.25rem;padding:.85rem;border-radius:8px;font-size:.875rem;display:none}
  .result.ok{background:#14532d;border:1px solid #166534;color:#bbf7d0}
  .result.err{background:#450a0a;border:1px solid #7f1d1d;color:#fecaca}
  .spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-right:6px}
  @keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="card">
  <h1>&#128295; PrintShop &mdash; Seed Database</h1>
  <p>Populate the database with demo accounts and sample data.<br/>Use <strong>Force Re-seed</strong> if the database already has data.</p>
  <div>
    <label for="pass">Admin Password</label>
    <input type="password" id="pass" placeholder="Enter admin password" autocomplete="off"/>
  </div>
  <div class="actions">
    <button class="btn-safe" onclick="doSeed('seed')">&#9654; Seed Database (safe)</button>
    <button class="btn-force" onclick="doSeed('force')">&#9888; Force Re-seed (clears all data)</button>
  </div>
  <div class="result" id="result"></div>
</div>
<script>
async function doSeed(action) {
  const pass = document.getElementById('pass').value.trim();
  if (!pass) { showResult('Please enter the admin password.', false); return; }
  const btns = document.querySelectorAll('button');
  btns.forEach(b => b.disabled = true);
  showResult('<span class="spinner"></span>Working&hellip; this may take 30&ndash;60 seconds on a cold start.', true);
  try {
    const r = await fetch('/admin/do-seed', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action, pass })
    });
    const data = await r.json();
    if (r.ok && data.success) {
      showResult('&#10003; ' + data.message, true);
    } else {
      showResult('&#10007; ' + (data.error || 'Unexpected error'), false);
    }
  } catch(e) {
    showResult('&#10007; Network error: ' + e.message, false);
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}
function showResult(msg, ok) {
  const el = document.getElementById('result');
  el.style.display = 'block';
  el.className = 'result ' + (ok ? 'ok' : 'err');
  el.innerHTML = msg;
}
</script>
</body>
</html>`);
  });

  app.post('/admin/do-seed', async (req, res) => {
    const { action, pass } = req.body as { action: string; pass: string };
    if (pass !== ADMIN_UI_PASS) {
      return res.status(401).json({ error: 'Incorrect admin password.' });
    }
    try {
      if (action === 'force') {
        await db.execute(sql`
          TRUNCATE TABLE notifications, staff_activity, audit_logs, receipts, expenses, expense_categories,
          sale_items, sales, cash_sessions, purchase_order_items, purchase_orders, suppliers,
          inventory_movements, inventory_items, print_jobs, services, products, product_categories,
          customers, settings, users RESTART IDENTITY CASCADE
        `);
      }
      const { seedDatabase } = await import('./db/seed.js');
      await seedDatabase();
      const msg = action === 'force'
        ? 'Database wiped and re-seeded with demo data.'
        : 'Database seeded with demo data.';
      res.json({ success: true, message: msg });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

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
