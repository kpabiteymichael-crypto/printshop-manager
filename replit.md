# PrintShop Manager

## Overview
A production-grade Print Shop, Bookstore & Stationery Shop management system built with React + Vite (frontend), Express.js (backend), and PostgreSQL (database).

## Architecture
- **Frontend**: React 18 + Vite + TailwindCSS + Recharts (port 5000)
- **Backend**: Express.js + TypeScript REST API (port 3001)
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: JWT-based with bcrypt password hashing (7-day tokens)
- **Theme**: Dark/light mode via Tailwind `darkMode: 'class'`, persisted in `localStorage` key `ps_theme`

## Modules
1. **Authentication** — JWT login with 5 roles, profile editing, password change
2. **Dashboard** — Daily sales summary, monthly trend chart, low stock alerts
3. **POS (Point of Sale)** — Cart-based checkout for products + services, receipt generation
4. **Print Jobs** — Job queue management with status tracking
5. **Inventory** — Stock levels, low-stock alerts, manual adjustments
6. **Bookstore** — Product catalog with category filtering
7. **Customers** — Customer directory with contact details
8. **Suppliers** — Supplier management
9. **Cash Management** — Cash session open/close, daily cash flow
10. **Expenses** — Expense tracking by category
11. **Reports** — Sales analytics with date range filtering
12. **Staff Management** — User creation and activation (Owner only)
13. **Settings** — Shop configuration (Owner/Manager)

## Demo Accounts
| Role               | Email                        | Password     | Default Route  |
|--------------------|------------------------------|--------------|----------------|
| Owner              | owner@printshop.com          | owner123     | /dashboard     |
| Manager            | manager@printshop.com        | manager123   | /dashboard     |
| Cashier            | cashier@printshop.com        | cashier123   | /pos           |
| Print Operator     | operator@printshop.com       | operator123  | /print-jobs    |
| Inventory Officer  | inventory@printshop.com      | inventory123 | /inventory     |

## Running the App
The "Start application" workflow runs both services concurrently:
- Vite dev server on port 5000 (proxies /api to port 3001)
- Express API server on port 3001

## Key Files
- `server/index.ts` — Express app entry point
- `server/db/schema.ts` — Drizzle ORM schema (13 PrintShop tables)
- `server/db/seed.ts` — Demo data seeder
- `server/middleware/auth.ts` — JWT auth + role-based authorization
- `src/App.tsx` — React router + protected routes
- `src/lib/api.ts` — Typed API client (axios)
- `src/context/AuthContext.tsx` — Auth state management (roles: owner/manager/cashier/print_operator/inventory_officer)
- `src/context/ThemeContext.tsx` — Dark/light mode (darkMode class on documentElement)
- `src/components/Layout.tsx` — Sidebar + top bar + mobile bottom nav

## Seed / Reset Data
To re-seed: `POST /api/admin/force-seed` with header `x-seed-secret: printshop-seed-2024`

## User Preferences
- Clean, modern UI with indigo/slate color scheme
- Production-grade code with proper error handling
- No mocked data — everything connects to real PostgreSQL
- Dark mode support throughout
- Responsive design with mobile bottom nav
