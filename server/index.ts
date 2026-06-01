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

// ── Temporary admin seed UI (browser-accessible, no env var needed) ───────────
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
  h1{font-size:1.25rem;font-weight:700;color:#f8fafc;margin-bottom:.25rem}
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
  <h1>🛠 PrintShop — Seed Database</h1>
  <p>Populate the database with demo accounts and sample data. Use <strong>Force Re-seed</strong> if the database already has data.</p>
  <div>
    <label for="pass">Admin Password</label>
    <input type="password" id="pass" placeholder="Enter admin password" autocomplete="off"/>
  </div>
  <div class="actions">
    <button class="btn-safe" onclick="doSeed('seed')">▶ Seed Database (safe)</button>
    <button class="btn-force" onclick="doSeed('force')">⚠ Force Re-seed (clears all data)</button>
  </div>
  <div class="result" id="result"></div>
</div>
<script>
async function doSeed(action) {
  const pass = document.getElementById('pass').value.trim();
  if (!pass) { showResult('Please enter the admin password.', false); return; }
  const btns = document.querySelectorAll('button');
  btns.forEach(b => b.disabled = true);
  const res = document.getElementById('result');
  res.style.display = 'block';
  res.className = 'result ok';
  res.innerHTML = '<span class="spinner"></span>Working… this may take 30–60 seconds on a cold start.';
  try {
    const r = await fetch('/admin/do-seed', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action, pass })
    });
    const data = await r.json();
    if (r.ok && data.success) {
      showResult('✅ ' + data.message, true);
    } else {
      showResult('❌ ' + (data.error || 'Unexpected error'), false);
    }
  } catch(e) {
    showResult('❌ Network error: ' + e.message, false);
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
    logger.error('Admin UI seed error', { error: (err as Error).message });
    res.status(500).json({ error: (err as Error).message });
  }
});

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
