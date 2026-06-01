/**
 * Role-guard integration tests
 *
 * For each route the matrix lists:
 *   - allowed roles  → expect the designated success HTTP status
 *   - blocked roles  → expect 403 { error: 'Forbidden' }
 *
 * Success-status conventions used below:
 *   200  list GETs, soft-deletes, unconditional UPDATEs
 *   201  creation endpoints (POST that inserts a row)
 *   400  body-validation failure (proves auth guard passed; Zod rejects empty body)
 *   404  parameterised GETs for a non-existent record (proves auth guard passed)
 *
 * JWT tokens are minted with the dev secret — no real DB login required.
 * The 403 path never touches the DB, so those assertions are always reliable.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';
import type { Express } from 'express';

dotenv.config();

// ── Token factory ─────────────────────────────────────────────────────────────

const JWT_SECRET =
  process.env.JWT_SECRET ??
  'printshop-dev-secret-DO-NOT-USE-IN-PRODUCTION';

type Role =
  | 'owner'
  | 'manager'
  | 'cashier'
  | 'print_operator'
  | 'inventory_officer';

const ALL_ROLES: Role[] = [
  'owner',
  'manager',
  'cashier',
  'print_operator',
  'inventory_officer',
];

function makeToken(role: Role, id: number): string {
  return jwt.sign(
    { id, email: `${role}@test.local`, role, name: `Test ${role}` },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

const tokens: Record<Role, string> = {
  owner:             makeToken('owner',             1),
  manager:           makeToken('manager',           2),
  cashier:           makeToken('cashier',           3),
  print_operator:    makeToken('print_operator',    4),
  inventory_officer: makeToken('inventory_officer', 5),
};

// ── App setup ─────────────────────────────────────────────────────────────────

let app: Express;

beforeAll(async () => {
  const { createApp } = await import('../app');
  app = createApp();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function authHeader(role: Role) {
  return { Authorization: `Bearer ${tokens[role]}` };
}

/**
 * Asserts the role is allowed: response status must equal `expectedStatus`.
 */
async function expectAllowed(
  method: string,
  url: string,
  role: Role,
  expectedStatus: number,
  body?: object,
) {
  const req = (request(app) as any)[method](url)
    .set(authHeader(role))
    .set('Content-Type', 'application/json');
  if (body) req.send(body);
  const res = await req;
  expect(
    res.status,
    `${role} → ${method.toUpperCase()} ${url} should be ${expectedStatus} but got ${res.status}: ${JSON.stringify(res.body)}`,
  ).toBe(expectedStatus);
}

/**
 * Asserts the role is blocked: must get 403 { error: 'Forbidden' }.
 */
async function expectBlocked(method: string, url: string, role: Role, body?: object) {
  const req = (request(app) as any)[method](url)
    .set(authHeader(role))
    .set('Content-Type', 'application/json');
  if (body) req.send(body);
  const res = await req;
  expect(
    res.status,
    `${role} → ${method.toUpperCase()} ${url} should be 403 but got ${res.status}`,
  ).toBe(403);
  expect(res.body).toEqual({ error: 'Forbidden' });
}

// ── Route matrix ──────────────────────────────────────────────────────────────
//
// [method, path, allowedRoles, allowedStatus, body?]
//
// allowedStatus:
//   200 — list GETs, soft-deletes, unconditional UPDATEs (empty body => {success:true})
//   201 — confirmed creation (we never reach this via tests; kept for doc clarity)
//   400 — Zod rejects empty body: proves auth guard passed, route handler ran
//   404 — parameterised GET for non-existent ID: proves auth guard passed

type RouteEntry = [string, string, Role[], number, object?];

const routeMatrix: RouteEntry[] = [
  // ── Dashboard ──────────────────────────────────────────────────────────────
  ['get',    '/api/dashboard/summary',         ['owner', 'manager'],                                              200],

  // ── Reports ────────────────────────────────────────────────────────────────
  ['get',    '/api/reports/sales-summary',          ['owner', 'manager'],                                         200],
  ['get',    '/api/reports/print-jobs-summary',     ['owner', 'manager'],                                         200],
  ['get',    '/api/reports/daily-sales',            ['owner', 'manager'],                                         200],
  // GET /:type/export — router-level authorize(owner, manager); returns 200 CSV/XLSX download
  ['get',    '/api/reports/daily-sales/export',     ['owner', 'manager'],                                         200],

  // ── Settings ───────────────────────────────────────────────────────────────
  ['get',    '/api/settings',                         ['owner', 'manager'],                                       200],
  ['get',    '/api/settings/staff',                   ['owner', 'manager'],                                       200],
  ['get',    '/api/settings/staff/activity',          ['owner', 'manager'],                                       200],
  ['get',    '/api/settings/security-events',         ['owner', 'manager'],                                       200],
  ['get',    '/api/settings/security-events/count',   ['owner', 'manager'],                                       200],
  // PUT /api/settings — owner only; empty body {} → iterates 0 entries → 200
  ['put',    '/api/settings',                         ['owner'],                                                   200, {}],
  // POST /staff — owner only; empty body → Zod 400
  ['post',   '/api/settings/staff',                   ['owner'],                                                   400],
  // PUT /staff/:id — owner only; all fields optional so {} passes Zod; DB returns 404 for non-existent ID
  ['put',    '/api/settings/staff/99999',             ['owner'],                                                   404],
  // permission-overrides — strictAuthorize owner only
  ['get',    '/api/settings/permission-overrides',    ['owner'],                                                   200],
  // POST /permission-overrides — owner only; empty body → Zod 400
  ['post',   '/api/settings/permission-overrides',    ['owner'],                                                   400],
  // DELETE /permission-overrides/:id — unconditional UPDATE → 200
  ['delete', '/api/settings/permission-overrides/99999', ['owner'],                                               200],

  // ── Products (Bookstore) ───────────────────────────────────────────────────
  // GET list — owner, manager, inventory_officer, cashier
  ['get',    '/api/products',                  ['owner', 'manager', 'inventory_officer', 'cashier'],              200],
  ['get',    '/api/products/categories',       ['owner', 'manager', 'inventory_officer', 'cashier'],              200],
  ['get',    '/api/products/services',         ['owner', 'manager', 'inventory_officer', 'cashier'],              200],
  // GET /:id — router allows owner, manager, inventory_officer, cashier; non-existent → 404
  ['get',    '/api/products/99999',            ['owner', 'manager', 'inventory_officer', 'cashier'],              404],
  // POST with empty body → Zod error 400 (auth guard passed; cashier is NOT in allowed list)
  ['post',   '/api/products',                  ['owner', 'manager', 'inventory_officer'],                         400],
  // PUT /:id for non-existent product → 404 (auth guard passed)
  ['put',    '/api/products/99999',            ['owner', 'manager', 'inventory_officer'],                         404],
  // DELETE /:id — owner, manager; soft-delete always returns 200
  ['delete', '/api/products/99999',            ['owner', 'manager'],                                              200],

  // ── Inventory ──────────────────────────────────────────────────────────────
  ['get',    '/api/inventory',                     ['owner', 'manager', 'inventory_officer'],                     200],
  ['get',    '/api/inventory/alerts',              ['owner', 'manager', 'inventory_officer'],                     200],
  ['get',    '/api/inventory/low-stock',           ['owner', 'manager', 'inventory_officer'],                     200],
  ['get',    '/api/inventory/history',             ['owner', 'manager', 'inventory_officer'],                     200],
  // GET /:id/history for non-existent ID → 200 (returns empty array)
  ['get',    '/api/inventory/99999/history',       ['owner', 'manager', 'inventory_officer'],                     200],
  // Write ops: empty body → Zod 400; proves auth guard passed
  ['post',   '/api/inventory/stock-in',            ['owner', 'manager', 'inventory_officer'],                     400],
  ['post',   '/api/inventory/stock-out',           ['owner', 'manager', 'inventory_officer'],                     400],
  ['post',   '/api/inventory/adjustment',          ['owner', 'manager', 'inventory_officer'],                     400],
  // /adjust is an alias for /adjustment (same handler and role guard)
  ['post',   '/api/inventory/adjust',              ['owner', 'manager', 'inventory_officer'],                     400],

  // ── POS ────────────────────────────────────────────────────────────────────
  // authenticate-only (every logged-in role can reach these)
  ['get',    '/api/pos/products',                  ALL_ROLES,                                                     200],
  ['get',    '/api/pos/services',                  ALL_ROLES,                                                     200],
  // barcode lookup — authenticate-only, non-existent SKU → 404
  ['get',    '/api/pos/barcode/NONEXIST_SKU_TEST', ALL_ROLES,                                                     404],
  // receipt lookup — authenticate-only, non-existent → 404
  ['get',    '/api/pos/receipt/NONEXIST_RCP_TEST', ALL_ROLES,                                                     404],
  // guarded endpoints — owner, manager, cashier only
  ['get',    '/api/pos/sales',                     ['owner', 'manager', 'cashier'],                               200],
  ['get',    '/api/pos/sales/99999',               ['owner', 'manager', 'cashier'],                               404],
  // POST /sale — empty body → Zod 400 (auth guard passed)
  ['post',   '/api/pos/sale',                      ['owner', 'manager', 'cashier'],                               400],
  // POST /sales/:id/refund — empty body → Zod 400
  ['post',   '/api/pos/sales/99999/refund',        ['owner', 'manager', 'cashier'],                               400],

  // ── Print Jobs ─────────────────────────────────────────────────────────────
  // router-level guard: owner, manager, print_operator, cashier
  ['get',    '/api/print-jobs',                    ['owner', 'manager', 'print_operator', 'cashier'],             200],
  // GET /operators — router-level guard (no extra guard)
  ['get',    '/api/print-jobs/operators',          ['owner', 'manager', 'print_operator', 'cashier'],             200],
  ['get',    '/api/print-jobs/99999',              ['owner', 'manager', 'print_operator', 'cashier'],             404],
  // GET /:id/file — router-level guard applies (owner, manager, print_operator, cashier), non-existent → 404
  ['get',    '/api/print-jobs/99999/file',         ['owner', 'manager', 'print_operator', 'cashier'],             404],
  // POST /:id/file — per-route authorize(owner, manager, cashier); Zod validates first → 400
  ['post',   '/api/print-jobs/99999/file',         ['owner', 'manager', 'cashier'],                               400],
  // POST / — owner, manager, cashier; empty body → Zod 400
  ['post',   '/api/print-jobs',                    ['owner', 'manager', 'cashier'],                               400],
  // PATCH /:id/status — owner, manager, print_operator; empty body → 400
  ['patch',  '/api/print-jobs/99999/status',       ['owner', 'manager', 'print_operator'],                        400],
  // PATCH /:id/assign — owner, manager; empty body → Zod 400
  ['patch',  '/api/print-jobs/99999/assign',       ['owner', 'manager'],                                          400],
  // DELETE /:id — owner, manager; unconditional delete → 200
  ['delete', '/api/print-jobs/99999',              ['owner', 'manager'],                                          200],

  // ── Customers ─────────────────────────────────────────────────────────────
  // authenticate-only: owner, manager, cashier, inventory_officer, print_operator
  ['get',    '/api/customers',                         ['owner', 'manager', 'cashier'],                           200],
  // /:id/profile — authenticate-only, non-existent → 404
  ['get',    '/api/customers/99999/profile',           ['owner', 'manager', 'cashier'],                           404],
  // /:id — authenticate-only, non-existent → 404
  ['get',    '/api/customers/99999',                   ['owner', 'manager', 'cashier'],                           404],
  // POST / — owner, manager, cashier; empty body → Zod 400
  ['post',   '/api/customers',                         ['owner', 'manager', 'cashier'],                           400],
  // PUT /:id — owner, manager, cashier; partial schema accepts {} → DB returns null → 404
  ['put',    '/api/customers/99999',                   ['owner', 'manager', 'cashier'],                           404],
  // DELETE /:id — owner, manager; unconditional delete → 200
  ['delete', '/api/customers/99999',                   ['owner', 'manager'],                                      200],
  // GET /:id/loyalty-history — authenticate-only; returns [] even for non-existent ID
  ['get',    '/api/customers/99999/loyalty-history',   ['owner', 'manager', 'cashier'],                           200],
  // POST /:id/loyalty-adjust — owner, manager; Zod validates first → 400
  ['post',   '/api/customers/99999/loyalty-adjust',    ['owner', 'manager'],                                      400],

  // ── Suppliers ─────────────────────────────────────────────────────────────
  // GET / — authenticate-only (router-level)
  ['get',    '/api/suppliers',                                      ['owner', 'manager', 'inventory_officer'],    200],
  // GET /:id — authenticate-only; non-existent → 404
  ['get',    '/api/suppliers/99999',                                ['owner', 'manager', 'inventory_officer'],    404],
  // GET /:id/orders — authenticate-only; returns [] for non-existent supplier
  ['get',    '/api/suppliers/99999/orders',                         ['owner', 'manager', 'inventory_officer'],    200],
  // POST / — owner, manager, inventory_officer; Zod validates (name required) → 400
  ['post',   '/api/suppliers',                                      ['owner', 'manager', 'inventory_officer'],    400],
  // PUT /:id — no Zod; direct DB update → 404 for non-existent
  ['put',    '/api/suppliers/99999',                                ['owner', 'manager', 'inventory_officer'],    404],
  // DELETE /:id — owner, manager; soft delete → 200
  ['delete', '/api/suppliers/99999',                                ['owner', 'manager'],                         200],

  // ── Suppliers: purchase-order sub-routes (mounted on /api/suppliers) ───────
  // GET /purchase-orders — authenticate-only; returns list
  ['get',    '/api/suppliers/purchase-orders',                      ['owner', 'manager', 'inventory_officer'],    200],
  // GET /purchase-orders/:id — non-existent → 404
  ['get',    '/api/suppliers/purchase-orders/99999',                ['owner', 'manager', 'inventory_officer'],    404],
  // POST /purchase-orders — Zod validates → 400 with empty body
  ['post',   '/api/suppliers/purchase-orders',                      ['owner', 'manager', 'inventory_officer'],    400],
  // PUT /purchase-orders/:id/status — Zod validates first → 400
  ['put',    '/api/suppliers/purchase-orders/99999/status',         ['owner', 'manager', 'inventory_officer'],    400],
  // PUT /purchase-orders/:id/receive — DB check first → 404
  ['put',    '/api/suppliers/purchase-orders/99999/receive',        ['owner', 'manager', 'inventory_officer'],    404],
  // POST /purchase-orders/:id/email — DB check first → 404
  ['post',   '/api/suppliers/purchase-orders/99999/email',          ['owner', 'manager', 'inventory_officer'],    404],

  // ── Purchase Orders ───────────────────────────────────────────────────────
  ['get',    '/api/purchase-orders',              ['owner', 'manager', 'inventory_officer'],                      200],
  ['get',    '/api/purchase-orders/99999',         ['owner', 'manager', 'inventory_officer'],                     404],
  // POST — empty body → Zod 400
  ['post',   '/api/purchase-orders',              ['owner', 'manager', 'inventory_officer'],                      400],
  // PUT /:id/status — empty body → Zod 400
  ['put',    '/api/purchase-orders/99999/status', ['owner', 'manager', 'inventory_officer'],                      400],
  // PUT /:id/receive — DB existence check before body parsing → 404
  ['put',    '/api/purchase-orders/99999/receive',['owner', 'manager', 'inventory_officer'],                      404],

  // ── Cash ──────────────────────────────────────────────────────────────────
  // GET /sessions — authenticate-only (router-level); any role reaches it
  ['get',    '/api/cash/sessions',                     ['owner', 'manager', 'cashier'],                           200],
  // GET /sessions/current — authenticate-only; returns null if no open session
  ['get',    '/api/cash/sessions/current',             ['owner', 'manager', 'cashier'],                           200],
  // POST /sessions/open — owner, manager, cashier; empty body → Zod 400
  ['post',   '/api/cash/sessions/open',                ['owner', 'manager', 'cashier'],                           400],
  // POST /sessions/:id/close — Zod validates (closingBalance required) → 400 with empty body
  ['post',   '/api/cash/sessions/99999/close',         ['owner', 'manager', 'cashier'],                           400],
  // GET /sessions/:id/summary — authenticate-only; returns 200 with empty breakdown
  ['get',    '/api/cash/sessions/99999/summary',       ['owner', 'manager', 'cashier'],                           200],

  // ── Expenses ──────────────────────────────────────────────────────────────
  ['get',    '/api/expenses',                  ['owner', 'manager', 'cashier'],                                   200],
  ['get',    '/api/expenses/categories',       ['owner', 'manager', 'cashier'],                                   200],
  // POST — owner, manager, cashier; empty body → Zod 400
  ['post',   '/api/expenses',                  ['owner', 'manager', 'cashier'],                                   400],
  // DELETE /:id — owner, manager; unconditional delete → 200
  ['delete', '/api/expenses/99999',            ['owner', 'manager'],                                              200],

  // ── Debts ─────────────────────────────────────────────────────────────────
  ['get',    '/api/debts',                          ['owner', 'manager', 'cashier'],                              200],
  ['get',    '/api/debts/99999',                    ['owner', 'manager', 'cashier'],                              404],
  // POST /:id/payments — empty body → Zod 400
  ['post',   '/api/debts/99999/payments',           ['owner', 'manager', 'cashier'],                              400],

  // ── Receipts ──────────────────────────────────────────────────────────────
  ['get',    '/api/receipts',                  ['owner', 'manager', 'cashier'],                                   200],
  // GET /:id — non-existent → 404 (proves auth guard passed)
  ['get',    '/api/receipts/99999',            ['owner', 'manager', 'cashier'],                                   404],

  // ── Quotations ────────────────────────────────────────────────────────────
  ['get',    '/api/quotations',                ['owner', 'manager', 'cashier'],                                   200],
  ['get',    '/api/quotations/99999',          ['owner', 'manager', 'cashier'],                                   404],
  // POST — empty body → Zod 400
  ['post',   '/api/quotations',                ['owner', 'manager', 'cashier'],                                   400],
  // DELETE — owner, manager; unconditional → 200
  ['delete', '/api/quotations/99999',          ['owner', 'manager'],                                              200],

  // ── Invoices ──────────────────────────────────────────────────────────────
  ['get',    '/api/invoices',                  ['owner', 'manager', 'cashier'],                                   200],
  ['get',    '/api/invoices/99999',            ['owner', 'manager', 'cashier'],                                   404],
  // POST — empty body → Zod 400
  ['post',   '/api/invoices',                  ['owner', 'manager', 'cashier'],                                   400],
  // PATCH payment-status — owner, manager; valid body; UPDATE runs on non-existent ID but still returns 200
  ['patch',  '/api/invoices/99999/payment-status', ['owner', 'manager'],                                          200, { paymentStatus: 'paid' }],
  // DELETE — owner, manager; unconditional → 200
  ['delete', '/api/invoices/99999',            ['owner', 'manager'],                                              200],

  // ── Business Analytics ────────────────────────────────────────────────────
  ['get',    '/api/analytics/sales-summary',    ['owner', 'manager'],                                             200],
  ['get',    '/api/analytics/revenue-trend',    ['owner', 'manager'],                                             200],
  ['get',    '/api/analytics/top-products',     ['owner', 'manager'],                                             200],
  ['get',    '/api/analytics/top-customers',    ['owner', 'manager'],                                             200],
  ['get',    '/api/analytics/print-stats',      ['owner', 'manager'],                                             200],
  ['get',    '/api/analytics/financial-summary',['owner', 'manager'],                                             200],
  ['get',    '/api/analytics/insights',         ['owner', 'manager'],                                             200],

  // ── Notifications ─────────────────────────────────────────────────────────
  // authenticate-only (router.use(authenticate)) — every logged-in role is allowed
  ['get',    '/api/notifications',              ALL_ROLES,                                                         200],
  // PATCH /:id/read — unconditional UPDATE → 200 even for non-existent ID
  ['patch',  '/api/notifications/99999/read',   ALL_ROLES,                                                         200],
  // PATCH /read-all — unconditional UPDATE → 200
  ['patch',  '/api/notifications/read-all',     ALL_ROLES,                                                         200],

  // ── PDF ───────────────────────────────────────────────────────────────────
  // Each PDF route checks the DB record first; non-existent ID → 404 before PDF generation
  // GET /receipt/:id — owner, manager, cashier
  ['get',    '/api/pdf/receipt/99999',          ['owner', 'manager', 'cashier'],                                   404],
  // GET /quotation/:id — owner, manager, cashier
  ['get',    '/api/pdf/quotation/99999',        ['owner', 'manager', 'cashier'],                                   404],
  // GET /invoice/:id — owner, manager, cashier
  ['get',    '/api/pdf/invoice/99999',          ['owner', 'manager', 'cashier'],                                   404],
  // GET /print-job/:id — owner, manager, print_operator, cashier
  ['get',    '/api/pdf/print-job/99999',        ['owner', 'manager', 'print_operator', 'cashier'],                 404],
  // GET /purchase-order/:id — owner, manager, inventory_officer
  ['get',    '/api/pdf/purchase-order/99999',   ['owner', 'manager', 'inventory_officer'],                         404],
];

// ── Derive blocked roles ───────────────────────────────────────────────────────

function blockedRoles(allowedRoles: Role[]): Role[] {
  return ALL_ROLES.filter(r => !allowedRoles.includes(r));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Role-guard integration tests', () => {

  describe('Unauthenticated requests are rejected with 401', () => {
    it('GET /api/dashboard/summary without token → 401', async () => {
      const res = await request(app).get('/api/dashboard/summary');
      expect(res.status).toBe(401);
    });

    it('GET /api/reports/sales without token → 401', async () => {
      const res = await request(app).get('/api/reports/sales');
      expect(res.status).toBe(401);
    });

    it('GET /api/inventory without token → 401', async () => {
      const res = await request(app).get('/api/inventory');
      expect(res.status).toBe(401);
    });

    it('GET /api/pos/sales without token → 401', async () => {
      const res = await request(app).get('/api/pos/sales');
      expect(res.status).toBe(401);
    });

    it('GET /api/settings without token → 401', async () => {
      const res = await request(app).get('/api/settings');
      expect(res.status).toBe(401);
    });
  });

  describe('Per-route role matrix', () => {
    for (const [method, path, allowedRoles, allowedStatus, body] of routeMatrix) {
      const denied = blockedRoles(allowedRoles);

      describe(`${method.toUpperCase()} ${path}`, () => {
        for (const role of allowedRoles) {
          it(`allows ${role} → ${allowedStatus}`, async () => {
            await expectAllowed(method, path, role, allowedStatus, body);
          });
        }

        for (const role of denied) {
          it(`blocks ${role} → 403`, async () => {
            await expectBlocked(method, path, role, body);
          });
        }
      });
    }
  });

  describe('Cross-role access checks', () => {
    it('inventory_officer cannot access POS sales', async () => {
      await expectBlocked('get', '/api/pos/sales', 'inventory_officer');
    });

    it('print_operator cannot access financial reports', async () => {
      await expectBlocked('get', '/api/reports/sales-summary', 'print_operator');
    });

    it('print_operator cannot access cash sessions', async () => {
      await expectBlocked('get', '/api/cash/sessions', 'print_operator');
    });

    it('print_operator cannot access expenses', async () => {
      await expectBlocked('get', '/api/expenses', 'print_operator');
    });

    it('print_operator cannot access debts', async () => {
      await expectBlocked('get', '/api/debts', 'print_operator');
    });

    it('cashier cannot read inventory', async () => {
      await expectBlocked('get', '/api/inventory', 'cashier');
    });

    it('cashier cannot read suppliers', async () => {
      await expectBlocked('get', '/api/suppliers', 'cashier');
    });

    it('cashier cannot read purchase orders', async () => {
      await expectBlocked('get', '/api/purchase-orders', 'cashier');
    });

    it('cashier cannot create products', async () => {
      await expectBlocked('post', '/api/products', 'cashier');
    });

    it('cashier cannot delete expenses', async () => {
      await expectBlocked('delete', '/api/expenses/99999', 'cashier');
    });

    it('cashier cannot delete quotations', async () => {
      await expectBlocked('delete', '/api/quotations/99999', 'cashier');
    });

    it('cashier cannot delete invoices', async () => {
      await expectBlocked('delete', '/api/invoices/99999', 'cashier');
    });

    it('cashier cannot patch invoice payment-status', async () => {
      await expectBlocked('patch', '/api/invoices/99999/payment-status', 'cashier', { paymentStatus: 'paid' });
    });

    it('inventory_officer cannot access dashboard summary', async () => {
      await expectBlocked('get', '/api/dashboard/summary', 'inventory_officer');
    });

    it('inventory_officer cannot access reports', async () => {
      await expectBlocked('get', '/api/reports/sales-summary', 'inventory_officer');
    });

    it('inventory_officer cannot access analytics', async () => {
      await expectBlocked('get', '/api/analytics/sales-summary', 'inventory_officer');
    });

    it('print_operator cannot access print-job ASSIGN (owner/manager only)', async () => {
      await expectBlocked('patch', '/api/print-jobs/99999/assign', 'print_operator');
    });

    it('print_operator cannot delete a print job', async () => {
      await expectBlocked('delete', '/api/print-jobs/99999', 'print_operator');
    });

    it('cashier cannot delete a print job', async () => {
      await expectBlocked('delete', '/api/print-jobs/99999', 'cashier');
    });
  });

  describe('strictAuthorize — permission overrides must not bypass owner-only routes', () => {
    const nonOwners: Role[] = ['manager', 'cashier', 'print_operator', 'inventory_officer'];

    it('owner can access permission-overrides → 200', async () => {
      await expectAllowed('get', '/api/settings/permission-overrides', 'owner', 200);
    });

    for (const role of nonOwners) {
      it(`${role} cannot access permission-overrides → 403`, async () => {
        await expectBlocked('get', '/api/settings/permission-overrides', role);
      });
    }
  });
});
