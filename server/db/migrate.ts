import { db } from './index';
import { sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';
dotenv.config();

export async function runMigrations() {
  console.log('Running database migrations...');

  // Drop old EduAnalytics schema — only runs if the legacy `students` table
  // still exists. Once cleaned up, this entire block becomes a no-op so
  // subsequent server restarts never touch the new PrintShop data.
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'students' AND table_schema = 'public'
      ) THEN
        DROP TABLE IF EXISTS mentor_ratings CASCADE;
        DROP TABLE IF EXISTS mentor_sessions CASCADE;
        DROP TABLE IF EXISTS mentor_requests CASCADE;
        DROP TABLE IF EXISTS teacher_subjects CASCADE;
        DROP TABLE IF EXISTS student_subjects CASCADE;
        DROP TABLE IF EXISTS announcements CASCADE;
        DROP TABLE IF EXISTS lesson_progress CASCADE;
        DROP TABLE IF EXISTS learning_materials CASCADE;
        DROP TABLE IF EXISTS topics CASCADE;
        DROP TABLE IF EXISTS submission_answers CASCADE;
        DROP TABLE IF EXISTS submissions CASCADE;
        DROP TABLE IF EXISTS question_options CASCADE;
        DROP TABLE IF EXISTS questions CASCADE;
        DROP TABLE IF EXISTS question_bank CASCADE;
        DROP TABLE IF EXISTS assessments CASCADE;
        DROP TABLE IF EXISTS password_reset_tokens CASCADE;
        DROP TABLE IF EXISTS class_subjects CASCADE;
        DROP TABLE IF EXISTS notifications CASCADE;
        DROP TABLE IF EXISTS activity_logs CASCADE;
        DROP TABLE IF EXISTS parent_links CASCADE;
        DROP TABLE IF EXISTS predictions CASCADE;
        DROP TABLE IF EXISTS rankings CASCADE;
        DROP TABLE IF EXISTS student_badges CASCADE;
        DROP TABLE IF EXISTS badges CASCADE;
        DROP TABLE IF EXISTS scores CASCADE;
        DROP TABLE IF EXISTS students CASCADE;
        DROP TABLE IF EXISTS classes CASCADE;
        DROP TABLE IF EXISTS settings CASCADE;
      END IF;
    END $$;
  `);

  // Drop old enums — only drop user_role if it contains old EduAnalytics values
  await db.execute(sql`
    DO $$ BEGIN
      DROP TYPE IF EXISTS subject CASCADE;
      DROP TYPE IF EXISTS badge_category CASCADE;
      DROP TYPE IF EXISTS risk_level CASCADE;

      IF EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'user_role'
          AND e.enumlabel IN ('student', 'teacher', 'admin', 'parent')
      ) THEN
        DROP TABLE IF EXISTS users CASCADE;
        DROP TYPE user_role;
      END IF;
    END $$;
  `);

  // Repair: add role column back to users table if it was dropped by CASCADE
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'users' AND table_schema = 'public'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'role'
      ) THEN
        DROP TABLE users CASCADE;
      END IF;
    END $$;
  `);

  // Migrate payment_method enum to Ghanaian methods if it has old values (gcash/maya/card/credit)
  // Drop the dependent tables first (they'll be recreated by the CREATE TABLE IF NOT EXISTS blocks below)
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'payment_method'
          AND e.enumlabel IN ('gcash', 'maya', 'card', 'credit')
      ) THEN
        DROP TABLE IF EXISTS receipts CASCADE;
        DROP TABLE IF EXISTS sale_items CASCADE;
        DROP TABLE IF EXISTS expenses CASCADE;
        DROP TABLE IF EXISTS sales CASCADE;
        DROP TYPE IF EXISTS payment_method CASCADE;
      END IF;
    END $$;
  `);

  // Create new enums (idempotent)
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE user_role AS ENUM ('owner', 'manager', 'cashier', 'print_operator', 'inventory_officer');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE print_job_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE payment_method AS ENUM ('cash', 'mtn_momo', 'telecel_cash', 'airteltigo', 'bank_transfer');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE movement_type AS ENUM ('in', 'out', 'adjustment');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE cash_session_status AS ENUM ('open', 'closed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE po_status AS ENUM ('draft', 'ordered', 'partial', 'received', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role user_role NOT NULL DEFAULT 'cashier',
      name TEXT NOT NULL,
      phone TEXT,
      avatar_url TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      is_read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      notes TEXT,
      total_spent DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS customers_name_idx ON customers(name);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS product_categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      category_id INTEGER REFERENCES product_categories(id),
      name TEXT NOT NULL,
      sku TEXT NOT NULL,
      description TEXT,
      price DECIMAL(10,2) NOT NULL,
      cost_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'piece',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS products_sku_idx ON products(sku);
    CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price_per_unit DECIMAL(10,2) NOT NULL,
      unit TEXT NOT NULL DEFAULT 'page',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS print_jobs (
      id SERIAL PRIMARY KEY,
      job_number TEXT NOT NULL,
      customer_id INTEGER REFERENCES customers(id),
      assigned_to INTEGER REFERENCES users(id),
      status print_job_status NOT NULL DEFAULT 'pending',
      title TEXT NOT NULL,
      description TEXT,
      service_id INTEGER REFERENCES services(id),
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      notes TEXT,
      due_date TIMESTAMP,
      completed_at TIMESTAMP,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS print_jobs_number_idx ON print_jobs(job_number);
    CREATE INDEX IF NOT EXISTS print_jobs_status_idx ON print_jobs(status);
    CREATE INDEX IF NOT EXISTS print_jobs_customer_idx ON print_jobs(customer_id);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity_in_stock INTEGER NOT NULL DEFAULT 0,
      reorder_level INTEGER NOT NULL DEFAULT 10,
      location TEXT,
      last_restocked_at TIMESTAMP,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS inventory_product_idx ON inventory_items(product_id);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id SERIAL PRIMARY KEY,
      inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
      type movement_type NOT NULL,
      quantity INTEGER NOT NULL,
      reason TEXT,
      reference_id INTEGER,
      reference_type TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS inv_movement_item_idx ON inventory_movements(inventory_item_id);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      notes TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id SERIAL PRIMARY KEY,
      po_number TEXT NOT NULL,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      status po_status NOT NULL DEFAULT 'draft',
      total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      notes TEXT,
      ordered_by INTEGER REFERENCES users(id),
      ordered_at TIMESTAMP,
      received_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS po_number_idx ON purchase_orders(po_number);
    CREATE INDEX IF NOT EXISTS po_supplier_idx ON purchase_orders(supplier_id);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id SERIAL PRIMARY KEY,
      purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL,
      total_price DECIMAL(10,2) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS poi_po_idx ON purchase_order_items(purchase_order_id);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cash_sessions (
      id SERIAL PRIMARY KEY,
      opened_by INTEGER NOT NULL REFERENCES users(id),
      closed_by INTEGER REFERENCES users(id),
      opening_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
      closing_balance DECIMAL(10,2),
      total_sales DECIMAL(10,2) NOT NULL DEFAULT 0,
      total_expenses DECIMAL(10,2) NOT NULL DEFAULT 0,
      status cash_session_status NOT NULL DEFAULT 'open',
      notes TEXT,
      opened_at TIMESTAMP DEFAULT NOW() NOT NULL,
      closed_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS cash_session_status_idx ON cash_sessions(status);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      sale_number TEXT NOT NULL,
      customer_id INTEGER REFERENCES customers(id),
      cashier_id INTEGER NOT NULL REFERENCES users(id),
      cash_session_id INTEGER REFERENCES cash_sessions(id),
      subtotal DECIMAL(10,2) NOT NULL,
      discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      total_amount DECIMAL(10,2) NOT NULL,
      payment_method payment_method NOT NULL DEFAULT 'cash',
      payment_reference TEXT,
      payment_status TEXT NOT NULL DEFAULT 'paid',
      notes TEXT,
      is_refunded BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS sales_number_idx ON sales(sale_number);
    CREATE INDEX IF NOT EXISTS sales_cashier_idx ON sales(cashier_id);
    CREATE INDEX IF NOT EXISTS sales_session_idx ON sales(cash_session_id);
    CREATE INDEX IF NOT EXISTS sales_created_idx ON sales(created_at);
  `);

  // Add missing columns to sales if table already exists
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='payment_reference') THEN
        ALTER TABLE sales ADD COLUMN payment_reference TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='is_refunded') THEN
        ALTER TABLE sales ADD COLUMN is_refunded BOOLEAN NOT NULL DEFAULT false;
      END IF;
    END $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sale_items (
      id SERIAL PRIMARY KEY,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      service_id INTEGER REFERENCES services(id),
      print_job_id INTEGER REFERENCES print_jobs(id),
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price DECIMAL(10,2) NOT NULL,
      discount DECIMAL(10,2) NOT NULL DEFAULT 0,
      total_price DECIMAL(10,2) NOT NULL,
      is_refunded BOOLEAN NOT NULL DEFAULT false
    );
    CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items(sale_id);
  `);

  // Add is_refunded column to sale_items if it was created before this migration
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sale_items' AND column_name='is_refunded') THEN
        ALTER TABLE sale_items ADD COLUMN is_refunded BOOLEAN NOT NULL DEFAULT false;
      END IF;
    END $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      category_id INTEGER REFERENCES expense_categories(id),
      cash_session_id INTEGER REFERENCES cash_sessions(id),
      description TEXT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      payment_method payment_method NOT NULL DEFAULT 'cash',
      reference_number TEXT,
      expense_date TIMESTAMP DEFAULT NOW() NOT NULL,
      recorded_by INTEGER REFERENCES users(id),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses(expense_date);
    CREATE INDEX IF NOT EXISTS expenses_category_idx ON expenses(category_id);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS receipts (
      id SERIAL PRIMARY KEY,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      receipt_number TEXT NOT NULL,
      generated_by INTEGER REFERENCES users(id),
      generated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS receipts_number_idx ON receipts(receipt_number);
    CREATE INDEX IF NOT EXISTS receipts_sale_idx ON receipts(sale_id);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      old_values TEXT,
      new_values TEXT,
      ip_address TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_user_idx ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_logs(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs(created_at);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS staff_activity (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      activity_type TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS staff_activity_user_idx ON staff_activity(user_id);
  `);

  console.log('Migrations completed successfully!');
}
