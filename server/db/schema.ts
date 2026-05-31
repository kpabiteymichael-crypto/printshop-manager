import {
  pgTable, serial, text, integer, real, boolean, timestamp, decimal,
  pgEnum, uniqueIndex, index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Enums ───────────────────────────────────────────────
export const userRoleEnum = pgEnum('user_role', ['owner', 'manager', 'cashier', 'print_operator', 'inventory_officer']);
export const printJobStatusEnum = pgEnum('print_job_status', ['pending', 'in_progress', 'printed', 'delivered', 'completed', 'cancelled']);
export const paymentMethodEnum = pgEnum('payment_method', ['cash', 'mtn_momo', 'telecel_cash', 'airteltigo', 'bank_transfer']);
export const movementTypeEnum = pgEnum('movement_type', ['in', 'out', 'adjustment', 'sale']);
export const cashSessionStatusEnum = pgEnum('cash_session_status', ['open', 'closed']);
export const poStatusEnum = pgEnum('po_status', ['draft', 'ordered', 'partial', 'received', 'cancelled']);

// ─── Users ───────────────────────────────────────────────
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('cashier'),
  name: text('name').notNull(),
  phone: text('phone'),
  avatarUrl: text('avatar_url'),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  emailIdx: uniqueIndex('users_email_idx').on(t.email),
}));

// ─── Customers ───────────────────────────────────────────
export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  notes: text('notes'),
  type: text('type').notNull().default('individual'),
  loyaltyPoints: integer('loyalty_points').notNull().default(0),
  totalSpent: decimal('total_spent', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  nameIdx: index('customers_name_idx').on(t.name),
}));

// ─── Product Categories ──────────────────────────────────
export const productCategories = pgTable('product_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Products ────────────────────────────────────────────
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id').references(() => productCategories.id),
  name: text('name').notNull(),
  sku: text('sku').notNull(),
  description: text('description'),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  costPrice: decimal('cost_price', { precision: 10, scale: 2 }).notNull().default('0'),
  unit: text('unit').notNull().default('piece'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  skuIdx: uniqueIndex('products_sku_idx').on(t.sku),
  categoryIdx: index('products_category_idx').on(t.categoryId),
}));

// ─── Services ────────────────────────────────────────────
export const services = pgTable('services', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  pricePerUnit: decimal('price_per_unit', { precision: 10, scale: 2 }).notNull(),
  unit: text('unit').notNull().default('page'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Print Jobs ──────────────────────────────────────────
export const printJobs = pgTable('print_jobs', {
  id: serial('id').primaryKey(),
  jobNumber: text('job_number').notNull(),
  customerId: integer('customer_id').references(() => customers.id),
  assignedTo: integer('assigned_to').references(() => users.id),
  status: printJobStatusEnum('status').notNull().default('pending'),
  title: text('title').notNull(),
  description: text('description'),
  serviceId: integer('service_id').references(() => services.id),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull().default('0'),
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  pageCount: integer('page_count'),
  fileUrl: text('file_url'),
  filePath: text('file_path'),
  fileName: text('file_name'),
  fileSize: integer('file_size'),
  fileMimeType: text('file_mime_type'),
  fileUploadedAt: timestamp('file_uploaded_at'),
  paymentStatus: text('payment_status').notNull().default('unpaid'),
  dueDate: timestamp('due_date'),
  completedAt: timestamp('completed_at'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  jobNumberIdx: uniqueIndex('print_jobs_number_idx').on(t.jobNumber),
  statusIdx: index('print_jobs_status_idx').on(t.status),
  customerIdx: index('print_jobs_customer_idx').on(t.customerId),
}));

// ─── Inventory Items ─────────────────────────────────────
export const inventoryItems = pgTable('inventory_items', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id),
  quantityInStock: integer('quantity_in_stock').notNull().default(0),
  reorderLevel: integer('reorder_level').notNull().default(10),
  location: text('location'),
  lastRestockedAt: timestamp('last_restocked_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  productIdx: uniqueIndex('inventory_product_idx').on(t.productId),
}));

// ─── Inventory Movements ─────────────────────────────────
export const inventoryMovements = pgTable('inventory_movements', {
  id: serial('id').primaryKey(),
  inventoryItemId: integer('inventory_item_id').notNull().references(() => inventoryItems.id),
  type: movementTypeEnum('type').notNull(),
  quantity: integer('quantity').notNull(),
  balanceAfter: integer('balance_after'),
  costPrice: decimal('cost_price', { precision: 10, scale: 2 }),
  supplierId: integer('supplier_id').references(() => suppliers.id),
  invoiceRef: text('invoice_ref'),
  reason: text('reason'),
  referenceId: integer('reference_id'),
  referenceType: text('reference_type'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  itemIdx: index('inv_movement_item_idx').on(t.inventoryItemId),
}));

// ─── Suppliers ───────────────────────────────────────────
export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  contactName: text('contact_name'),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Purchase Orders ─────────────────────────────────────
export const purchaseOrders = pgTable('purchase_orders', {
  id: serial('id').primaryKey(),
  poNumber: text('po_number').notNull(),
  supplierId: integer('supplier_id').notNull().references(() => suppliers.id),
  status: poStatusEnum('status').notNull().default('draft'),
  totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  orderedBy: integer('ordered_by').references(() => users.id),
  orderedAt: timestamp('ordered_at'),
  expectedDeliveryAt: timestamp('expected_delivery_at'),
  receivedAt: timestamp('received_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  poNumberIdx: uniqueIndex('po_number_idx').on(t.poNumber),
  supplierIdx: index('po_supplier_idx').on(t.supplierId),
}));

export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: serial('id').primaryKey(),
  purchaseOrderId: integer('purchase_order_id').notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
  receivedQuantity: integer('received_quantity').notNull().default(0),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal('total_price', { precision: 10, scale: 2 }).notNull(),
}, (t) => ({
  poIdx: index('poi_po_idx').on(t.purchaseOrderId),
}));

// ─── Cash Sessions ───────────────────────────────────────
export const cashSessions = pgTable('cash_sessions', {
  id: serial('id').primaryKey(),
  openedBy: integer('opened_by').notNull().references(() => users.id),
  closedBy: integer('closed_by').references(() => users.id),
  openingBalance: decimal('opening_balance', { precision: 10, scale: 2 }).notNull().default('0'),
  closingBalance: decimal('closing_balance', { precision: 10, scale: 2 }),
  totalSales: decimal('total_sales', { precision: 10, scale: 2 }).notNull().default('0'),
  totalExpenses: decimal('total_expenses', { precision: 10, scale: 2 }).notNull().default('0'),
  status: cashSessionStatusEnum('status').notNull().default('open'),
  notes: text('notes'),
  openedAt: timestamp('opened_at').defaultNow().notNull(),
  closedAt: timestamp('closed_at'),
}, (t) => ({
  statusIdx: index('cash_session_status_idx').on(t.status),
}));

// ─── Sales ───────────────────────────────────────────────
export const sales = pgTable('sales', {
  id: serial('id').primaryKey(),
  saleNumber: text('sale_number').notNull(),
  customerId: integer('customer_id').references(() => customers.id),
  cashierId: integer('cashier_id').notNull().references(() => users.id),
  cashSessionId: integer('cash_session_id').references(() => cashSessions.id),
  subtotal: decimal('subtotal', { precision: 10, scale: 2 }).notNull(),
  discountAmount: decimal('discount_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  taxAmount: decimal('tax_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  paymentMethod: paymentMethodEnum('payment_method').notNull().default('cash'),
  paymentReference: text('payment_reference'),
  paymentLines: text('payment_lines'),
  paymentStatus: text('payment_status').notNull().default('paid'),
  notes: text('notes'),
  isRefunded: boolean('is_refunded').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  saleNumberIdx: uniqueIndex('sales_number_idx').on(t.saleNumber),
  cashierIdx: index('sales_cashier_idx').on(t.cashierId),
  sessionIdx: index('sales_session_idx').on(t.cashSessionId),
  createdIdx: index('sales_created_idx').on(t.createdAt),
}));

export const saleItems = pgTable('sale_items', {
  id: serial('id').primaryKey(),
  saleId: integer('sale_id').notNull().references(() => sales.id, { onDelete: 'cascade' }),
  productId: integer('product_id').references(() => products.id),
  serviceId: integer('service_id').references(() => services.id),
  printJobId: integer('print_job_id').references(() => printJobs.id),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  discount: decimal('discount', { precision: 10, scale: 2 }).notNull().default('0'),
  totalPrice: decimal('total_price', { precision: 10, scale: 2 }).notNull(),
  isRefunded: boolean('is_refunded').default(false).notNull(),
}, (t) => ({
  saleIdx: index('sale_items_sale_idx').on(t.saleId),
}));

// ─── Debts (Credit Sales) ────────────────────────────────
export const debts = pgTable('debts', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').notNull().references(() => customers.id),
  saleId: integer('sale_id').references(() => sales.id),
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  paidAmount: decimal('paid_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  balance: decimal('balance', { precision: 10, scale: 2 }).notNull(),
  dueDate: timestamp('due_date'),
  status: text('status').notNull().default('open'),
  notes: text('notes'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  customerIdx: index('debts_customer_idx').on(t.customerId),
  statusIdx: index('debts_status_idx').on(t.status),
}));

export const debtPayments = pgTable('debt_payments', {
  id: serial('id').primaryKey(),
  debtId: integer('debt_id').notNull().references(() => debts.id, { onDelete: 'cascade' }),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  paymentMethod: paymentMethodEnum('payment_method').notNull().default('cash'),
  paymentReference: text('payment_reference'),
  paidBy: integer('paid_by').references(() => users.id),
  paidAt: timestamp('paid_at').defaultNow().notNull(),
  notes: text('notes'),
}, (t) => ({
  debtIdx: index('debt_payments_debt_idx').on(t.debtId),
}));

// ─── Expense Categories ──────────────────────────────────
export const expenseCategories = pgTable('expense_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Expenses ────────────────────────────────────────────
export const expenses = pgTable('expenses', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id').references(() => expenseCategories.id),
  cashSessionId: integer('cash_session_id').references(() => cashSessions.id),
  description: text('description').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  paymentMethod: paymentMethodEnum('payment_method').notNull().default('cash'),
  referenceNumber: text('reference_number'),
  expenseDate: timestamp('expense_date').defaultNow().notNull(),
  recordedBy: integer('recorded_by').references(() => users.id),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  dateIdx: index('expenses_date_idx').on(t.expenseDate),
  categoryIdx: index('expenses_category_idx').on(t.categoryId),
}));

// ─── Receipts ────────────────────────────────────────────
export const receipts = pgTable('receipts', {
  id: serial('id').primaryKey(),
  saleId: integer('sale_id').notNull().references(() => sales.id),
  receiptNumber: text('receipt_number').notNull(),
  generatedBy: integer('generated_by').references(() => users.id),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
}, (t) => ({
  receiptNumberIdx: uniqueIndex('receipts_number_idx').on(t.receiptNumber),
  saleIdx: index('receipts_sale_idx').on(t.saleId),
}));

// ─── Audit Logs ──────────────────────────────────────────
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: integer('entity_id'),
  oldValues: text('old_values'),
  newValues: text('new_values'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userIdx: index('audit_user_idx').on(t.userId),
  entityIdx: index('audit_entity_idx').on(t.entityType, t.entityId),
  createdIdx: index('audit_created_idx').on(t.createdAt),
}));

// ─── Staff Activity ──────────────────────────────────────
export const staffActivity = pgTable('staff_activity', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  activityType: text('activity_type').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userIdx: index('staff_activity_user_idx').on(t.userId),
}));

// ─── Notifications ────────────────────────────────────────
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  message: text('message').notNull(),
  type: text('type').notNull().default('info'),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userIdx: index('notifications_user_idx').on(t.userId),
}));

// ─── Settings ────────────────────────────────────────────
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ─── Book Metadata ───────────────────────────────────────
export const bookMetadata = pgTable('book_metadata', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  isbn: text('isbn'),
  author: text('author'),
  publisher: text('publisher'),
  subject: text('subject'),
  educationalLevel: text('educational_level'),
  edition: text('edition'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  productIdx: uniqueIndex('book_metadata_product_idx').on(t.productId),
}));

// ─── Relations ───────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  notifications: many(notifications),
  staffActivity: many(staffActivity),
  auditLogs: many(auditLogs),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  printJobs: many(printJobs),
  sales: many(sales),
}));

export const productCategoriesRelations = relations(productCategories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(productCategories, { fields: [products.categoryId], references: [productCategories.id] }),
  inventoryItem: one(inventoryItems, { fields: [products.id], references: [inventoryItems.productId] }),
  saleItems: many(saleItems),
  bookMetadata: one(bookMetadata, { fields: [products.id], references: [bookMetadata.productId] }),
}));

export const bookMetadataRelations = relations(bookMetadata, ({ one }) => ({
  product: one(products, { fields: [bookMetadata.productId], references: [products.id] }),
}));

export const inventoryItemsRelations = relations(inventoryItems, ({ one, many }) => ({
  product: one(products, { fields: [inventoryItems.productId], references: [products.id] }),
  movements: many(inventoryMovements),
}));

export const printJobsRelations = relations(printJobs, ({ one }) => ({
  customer: one(customers, { fields: [printJobs.customerId], references: [customers.id] }),
  assignedUser: one(users, { fields: [printJobs.assignedTo], references: [users.id] }),
  service: one(services, { fields: [printJobs.serviceId], references: [services.id] }),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  customer: one(customers, { fields: [sales.customerId], references: [customers.id] }),
  cashier: one(users, { fields: [sales.cashierId], references: [users.id] }),
  cashSession: one(cashSessions, { fields: [sales.cashSessionId], references: [cashSessions.id] }),
  items: many(saleItems),
  receipt: one(receipts, { fields: [sales.id], references: [receipts.saleId] }),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, { fields: [saleItems.saleId], references: [sales.id] }),
  product: one(products, { fields: [saleItems.productId], references: [products.id] }),
  service: one(services, { fields: [saleItems.serviceId], references: [services.id] }),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  purchaseOrders: many(purchaseOrders),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [purchaseOrders.supplierId], references: [suppliers.id] }),
  items: many(purchaseOrderItems),
}));

export const cashSessionsRelations = relations(cashSessions, ({ one, many }) => ({
  openedByUser: one(users, { fields: [cashSessions.openedBy], references: [users.id] }),
  sales: many(sales),
  expenses: many(expenses),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  category: one(expenseCategories, { fields: [expenses.categoryId], references: [expenseCategories.id] }),
  cashSession: one(cashSessions, { fields: [expenses.cashSessionId], references: [cashSessions.id] }),
  recordedByUser: one(users, { fields: [expenses.recordedBy], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const debtsRelations = relations(debts, ({ one, many }) => ({
  customer: one(customers, { fields: [debts.customerId], references: [customers.id] }),
  sale: one(sales, { fields: [debts.saleId], references: [sales.id] }),
  payments: many(debtPayments),
}));

export const debtPaymentsRelations = relations(debtPayments, ({ one }) => ({
  debt: one(debts, { fields: [debtPayments.debtId], references: [debts.id] }),
  paidByUser: one(users, { fields: [debtPayments.paidBy], references: [users.id] }),
}));
