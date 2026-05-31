import { db } from './index';
import {
  users, customers, productCategories, products, services, printJobs,
  inventoryItems, suppliers, cashSessions, sales, saleItems,
  expenseCategories, expenses, notifications, settings,
} from './schema';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';

export async function seedDatabase() {
  const [userCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(users);

  if (Number(userCount.count) > 0) {
    const [ownerUser] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, 'owner@printshop.com'))
      .limit(1);

    const passwordValid = ownerUser ? await bcrypt.compare('owner123', ownerUser.passwordHash) : false;
    if (passwordValid) {
      console.log('Database already seeded, skipping...');
      return;
    }
    console.log('Stale data detected — re-seeding...');
    await db.execute(sql`
      TRUNCATE TABLE notifications, staff_activity, audit_logs, receipts, expenses, expense_categories,
      sale_items, sales, cash_sessions, purchase_order_items, purchase_orders, suppliers,
      inventory_movements, inventory_items, print_jobs, services, products, product_categories,
      customers, settings, users RESTART IDENTITY CASCADE
    `);
  }

  console.log('Seeding PrintShop database...');

  // ─── Seed Users ──────────────────────────────────────────
  const ownerHash = await bcrypt.hash('owner123', 12);
  const managerHash = await bcrypt.hash('manager123', 12);
  const cashierHash = await bcrypt.hash('cashier123', 12);
  const operatorHash = await bcrypt.hash('operator123', 12);
  const inventoryHash = await bcrypt.hash('inventory123', 12);

  const [owner] = await db.insert(users).values({
    name: 'Maria Santos',
    email: 'owner@printshop.com',
    passwordHash: ownerHash,
    role: 'owner',
    phone: '+63 917 123 4567',
    isActive: true,
  }).returning();

  const [manager] = await db.insert(users).values({
    name: 'Jose Reyes',
    email: 'manager@printshop.com',
    passwordHash: managerHash,
    role: 'manager',
    phone: '+63 918 234 5678',
    isActive: true,
  }).returning();

  const [cashier] = await db.insert(users).values({
    name: 'Ana Cruz',
    email: 'cashier@printshop.com',
    passwordHash: cashierHash,
    role: 'cashier',
    phone: '+63 919 345 6789',
    isActive: true,
  }).returning();

  const [operator] = await db.insert(users).values({
    name: 'Pedro Dela Cruz',
    email: 'operator@printshop.com',
    passwordHash: operatorHash,
    role: 'print_operator',
    phone: '+63 920 456 7890',
    isActive: true,
  }).returning();

  const [invOfficer] = await db.insert(users).values({
    name: 'Rosa Garcia',
    email: 'inventory@printshop.com',
    passwordHash: inventoryHash,
    role: 'inventory_officer',
    phone: '+63 921 567 8901',
    isActive: true,
  }).returning();

  // ─── Seed Customers ─────────────────────────────────────
  const customerData = [
    { name: 'Bright Future School', email: 'admin@brightfuture.edu', phone: '+63 2 888 1234', address: 'Quezon City, Metro Manila', notes: 'Regular bulk order client' },
    { name: 'City Hall Procurement', email: 'proc@cityhall.gov', phone: '+63 2 888 5678', address: 'Manila City Hall', notes: 'Government client — requires official receipt' },
    { name: 'Bayanihan Cooperative', email: 'info@bayanihan.coop', phone: '+63 2 888 9012', address: 'Makati, Metro Manila', notes: 'Monthly calendar orders' },
    { name: 'Juan dela Cruz', email: 'juan@email.com', phone: '+63 917 111 2222', address: 'Pasig City', notes: '' },
    { name: 'Maria Reyes', email: 'maria.r@email.com', phone: '+63 918 333 4444', address: 'Mandaluyong', notes: 'Wedding invitation client' },
    { name: 'ABC Publishing House', email: 'orders@abcpublish.com', phone: '+63 2 777 1111', address: 'Ortigas Center', notes: 'Large volume book reprints' },
    { name: 'Walk-in Customer', email: '', phone: '', address: '', notes: 'Default walk-in account' },
  ];
  const insertedCustomers = await db.insert(customers).values(customerData).returning();

  // ─── Seed Product Categories ─────────────────────────────
  const catData = [
    { name: 'Books', description: 'Textbooks, references, novels' },
    { name: 'Office Supplies', description: 'Pens, pencils, notebooks, folders' },
    { name: 'Art Supplies', description: 'Paints, brushes, drawing materials' },
    { name: 'Paper Products', description: 'Bond paper, colored paper, specialty paper' },
    { name: 'School Supplies', description: 'Rulers, erasers, backpacks' },
  ];
  const insertedCategories = await db.insert(productCategories).values(catData).returning();

  // ─── Seed Products ───────────────────────────────────────
  const productData = [
    { categoryId: insertedCategories[0].id, name: 'Grade 5 Math Textbook', sku: 'BK-G5-MATH', price: '250.00', costPrice: '150.00', unit: 'piece', description: 'DepEd-aligned Grade 5 Mathematics' },
    { categoryId: insertedCategories[0].id, name: 'Grade 5 Science Textbook', sku: 'BK-G5-SCI', price: '250.00', costPrice: '150.00', unit: 'piece', description: 'DepEd-aligned Grade 5 Science' },
    { categoryId: insertedCategories[0].id, name: 'English Grammar Workbook', sku: 'BK-ENG-GRAM', price: '180.00', costPrice: '100.00', unit: 'piece', description: 'Grades 4–6 English Grammar' },
    { categoryId: insertedCategories[1].id, name: 'Ballpen (Blue) Box', sku: 'OFF-BP-BLU-BOX', price: '85.00', costPrice: '45.00', unit: 'box', description: '20pcs per box, blue ink' },
    { categoryId: insertedCategories[1].id, name: 'Spiral Notebook (80 leaves)', sku: 'OFF-NB-SP80', price: '55.00', costPrice: '30.00', unit: 'piece', description: 'A4 spiral notebook' },
    { categoryId: insertedCategories[1].id, name: 'Expandable Folder (Long)', sku: 'OFF-FLD-EXP', price: '45.00', costPrice: '22.00', unit: 'piece', description: 'Long-size expandable folder' },
    { categoryId: insertedCategories[3].id, name: 'Bond Paper (Short) Ream', sku: 'PPR-BOND-SHORT', price: '200.00', costPrice: '130.00', unit: 'ream', description: 'Short bond paper, 500 sheets' },
    { categoryId: insertedCategories[3].id, name: 'Bond Paper (Long) Ream', sku: 'PPR-BOND-LONG', price: '220.00', costPrice: '145.00', unit: 'ream', description: 'Long bond paper, 500 sheets' },
    { categoryId: insertedCategories[4].id, name: 'Pencil #2 Box', sku: 'SCH-PNC-BOX', price: '65.00', costPrice: '35.00', unit: 'box', description: '12pcs per box' },
    { categoryId: insertedCategories[4].id, name: 'Ruler (30cm Plastic)', sku: 'SCH-RUL-30P', price: '25.00', costPrice: '12.00', unit: 'piece', description: 'Clear plastic ruler' },
    { categoryId: insertedCategories[2].id, name: 'Watercolor Set (12 colors)', sku: 'ART-WC-12', price: '120.00', costPrice: '70.00', unit: 'set', description: '12-color watercolor paint' },
    { categoryId: insertedCategories[1].id, name: 'Correction Tape', sku: 'OFF-CT-STD', price: '35.00', costPrice: '18.00', unit: 'piece', description: 'Standard correction tape' },
  ];
  const insertedProducts = await db.insert(products).values(productData).returning();

  // ─── Seed Services ───────────────────────────────────────
  const serviceData = [
    { name: 'Black & White Printing', description: 'Standard BW printing on bond paper', pricePerUnit: '3.00', unit: 'page' },
    { name: 'Color Printing', description: 'Full-color printing on bond paper', pricePerUnit: '12.00', unit: 'page' },
    { name: 'Photocopying', description: 'Photocopying service', pricePerUnit: '2.00', unit: 'page' },
    { name: 'Lamination (Short)', description: 'Short-size lamination', pricePerUnit: '20.00', unit: 'page' },
    { name: 'Lamination (Long)', description: 'Long-size lamination', pricePerUnit: '25.00', unit: 'page' },
    { name: 'Binding (Comb)', description: 'Comb/coil binding per document', pricePerUnit: '45.00', unit: 'document' },
    { name: 'Binding (Tape/Thermal)', description: 'Thermal binding per document', pricePerUnit: '55.00', unit: 'document' },
    { name: 'Tarpaulin Printing 2x3ft', description: 'Standard tarpaulin print', pricePerUnit: '180.00', unit: 'piece' },
    { name: 'ID Card Printing', description: 'PVC ID card printing', pricePerUnit: '150.00', unit: 'card' },
    { name: 'Scanning', description: 'Document scanning to PDF', pricePerUnit: '5.00', unit: 'page' },
  ];
  const insertedServices = await db.insert(services).values(serviceData).returning();

  // ─── Seed Inventory Items ────────────────────────────────
  const inventoryData = insertedProducts.map((p, i) => ({
    productId: p.id,
    quantityInStock: [45, 38, 60, 120, 85, 70, 25, 20, 95, 110, 40, 75][i] ?? 50,
    reorderLevel: [10, 10, 15, 30, 20, 20, 5, 5, 25, 30, 10, 20][i] ?? 10,
    location: 'Main Storage',
  }));
  await db.insert(inventoryItems).values(inventoryData);

  // ─── Seed Suppliers ──────────────────────────────────────
  const supplierData = [
    { name: 'National Book Store Wholesale', contactName: 'Carlos Mendoza', email: 'wholesale@nbs.com.ph', phone: '+63 2 527 1234', address: 'Quezon City', notes: 'Main book supplier' },
    { name: 'Paper Palace Supplies', contactName: 'Elena Torres', email: 'sales@paperpalace.com', phone: '+63 2 527 5678', address: 'Manila', notes: 'Paper and printing supplies' },
    { name: 'Inkjet Masters Corp', contactName: 'Antonio Lim', email: 'orders@inkjetmasters.ph', phone: '+63 2 527 9012', address: 'Makati', notes: 'Printer inks and toners' },
    { name: 'Scholastic Philippines', contactName: 'Sandra Ocampo', email: 'trade@scholastic.ph', phone: '+63 2 888 3456', address: 'Ortigas', notes: 'Educational books and materials' },
  ];
  await db.insert(suppliers).values(supplierData);

  // ─── Seed Cash Session ───────────────────────────────────
  const today = new Date();
  const [openSession] = await db.insert(cashSessions).values({
    openedBy: cashier.id,
    openingBalance: '5000.00',
    totalSales: '0.00',
    totalExpenses: '0.00',
    status: 'open',
    openedAt: today,
  }).returning();

  // Closed session from yesterday
  const yesterday = new Date(today.getTime() - 86400000);
  await db.insert(cashSessions).values({
    openedBy: cashier.id,
    closedBy: manager.id,
    openingBalance: '5000.00',
    closingBalance: '18450.00',
    totalSales: '14200.00',
    totalExpenses: '750.00',
    status: 'closed',
    openedAt: yesterday,
    closedAt: new Date(yesterday.getTime() + 8 * 3600000),
  });

  // ─── Seed Print Jobs ─────────────────────────────────────
  const printJobsData = [
    {
      jobNumber: 'PJ-2026-001',
      customerId: insertedCustomers[0].id,
      assignedTo: operator.id,
      status: 'completed' as const,
      title: 'School ID Printing — 250 students',
      serviceId: insertedServices[8].id,
      quantity: 250,
      unitPrice: '150.00',
      totalAmount: '37500.00',
      createdBy: cashier.id,
      dueDate: new Date(today.getTime() - 5 * 86400000),
      completedAt: new Date(today.getTime() - 3 * 86400000),
    },
    {
      jobNumber: 'PJ-2026-002',
      customerId: insertedCustomers[1].id,
      assignedTo: operator.id,
      status: 'in_progress' as const,
      title: 'Annual Report Printing & Binding',
      serviceId: insertedServices[5].id,
      quantity: 50,
      unitPrice: '250.00',
      totalAmount: '12500.00',
      createdBy: cashier.id,
      dueDate: new Date(today.getTime() + 2 * 86400000),
    },
    {
      jobNumber: 'PJ-2026-003',
      customerId: insertedCustomers[4].id,
      assignedTo: operator.id,
      status: 'pending' as const,
      title: 'Wedding Invitation — 300 pieces',
      serviceId: insertedServices[1].id,
      quantity: 300,
      unitPrice: '35.00',
      totalAmount: '10500.00',
      createdBy: cashier.id,
      dueDate: new Date(today.getTime() + 7 * 86400000),
    },
    {
      jobNumber: 'PJ-2026-004',
      customerId: insertedCustomers[2].id,
      assignedTo: operator.id,
      status: 'pending' as const,
      title: 'Monthly Newsletter Printing',
      serviceId: insertedServices[0].id,
      quantity: 500,
      unitPrice: '3.00',
      totalAmount: '1500.00',
      createdBy: manager.id,
      dueDate: new Date(today.getTime() + 1 * 86400000),
    },
  ];
  await db.insert(printJobs).values(printJobsData);

  // ─── Seed Sales ──────────────────────────────────────────
  const saleRecords = [
    {
      saleNumber: 'SL-2026-0001',
      customerId: insertedCustomers[3].id,
      cashierId: cashier.id,
      cashSessionId: openSession.id,
      subtotal: '530.00',
      discountAmount: '0.00',
      taxAmount: '0.00',
      totalAmount: '530.00',
      paymentMethod: 'cash' as const,
      paymentStatus: 'paid',
      createdAt: new Date(today.getTime() - 2 * 3600000),
    },
    {
      saleNumber: 'SL-2026-0002',
      customerId: insertedCustomers[0].id,
      cashierId: cashier.id,
      cashSessionId: openSession.id,
      subtotal: '2750.00',
      discountAmount: '275.00',
      taxAmount: '0.00',
      totalAmount: '2475.00',
      paymentMethod: 'gcash' as const,
      paymentStatus: 'paid',
      createdAt: new Date(today.getTime() - 1 * 3600000),
    },
  ];
  const insertedSales = await db.insert(sales).values(saleRecords).returning();

  await db.insert(saleItems).values([
    { saleId: insertedSales[0].id, productId: insertedProducts[0].id, description: 'Grade 5 Math Textbook', quantity: 2, unitPrice: '250.00', discount: '0.00', totalPrice: '500.00' },
    { saleId: insertedSales[0].id, productId: insertedProducts[3].id, description: 'Ballpen (Blue) Box', quantity: 1, unitPrice: '85.00', discount: '0.00', totalPrice: '85.00' },
  ]);

  await db.insert(saleItems).values([
    { saleId: insertedSales[1].id, productId: insertedProducts[0].id, description: 'Grade 5 Math Textbook', quantity: 5, unitPrice: '250.00', discount: '125.00', totalPrice: '1125.00' },
    { saleId: insertedSales[1].id, productId: insertedProducts[1].id, description: 'Grade 5 Science Textbook', quantity: 5, unitPrice: '250.00', discount: '125.00', totalPrice: '1125.00' },
    { saleId: insertedSales[1].id, productId: insertedProducts[4].id, description: 'Spiral Notebook (80 leaves)', quantity: 5, unitPrice: '55.00', discount: '25.00', totalPrice: '250.00' },
  ]);

  // ─── Seed Expense Categories ─────────────────────────────
  const expCatData = [
    { name: 'Utilities', description: 'Electricity, water, internet' },
    { name: 'Supplies & Consumables', description: 'Ink, toner, paper for printing' },
    { name: 'Rent', description: 'Monthly store rent' },
    { name: 'Salaries', description: 'Staff wages' },
    { name: 'Maintenance & Repair', description: 'Equipment service and repair' },
    { name: 'Miscellaneous', description: 'Other business expenses' },
  ];
  const insertedExpCats = await db.insert(expenseCategories).values(expCatData).returning();

  await db.insert(expenses).values([
    {
      categoryId: insertedExpCats[1].id,
      cashSessionId: openSession.id,
      description: 'Black ink cartridge refill — HP LaserJet',
      amount: '450.00',
      paymentMethod: 'cash' as const,
      expenseDate: today,
      recordedBy: manager.id,
    },
    {
      categoryId: insertedExpCats[0].id,
      description: 'Monthly electricity bill',
      amount: '8500.00',
      paymentMethod: 'transfer' as const,
      referenceNumber: 'MERALCO-2026-05',
      expenseDate: new Date(today.getFullYear(), today.getMonth(), 5),
      recordedBy: owner.id,
    },
  ]);

  // ─── Seed Notifications ──────────────────────────────────
  await db.insert(notifications).values([
    { userId: owner.id, title: 'Low Stock Alert', message: '3 products are below reorder level. Check inventory.', type: 'warning' },
    { userId: manager.id, title: 'Print Job Due Tomorrow', message: 'Job PJ-2026-002 (Annual Report) is due tomorrow.', type: 'info' },
    { userId: cashier.id, title: 'Cash Session Active', message: 'Your cash session is open. Have a great shift!', type: 'success' },
    { userId: operator.id, title: 'New Print Job Assigned', message: 'PJ-2026-004 has been assigned to you.', type: 'info' },
  ]);

  // ─── Seed Settings ───────────────────────────────────────
  await db.insert(settings).values([
    { key: 'shop_name', value: 'PrintShop Manager' },
    { key: 'shop_address', value: '123 Print Street, Manila, Philippines' },
    { key: 'shop_phone', value: '+63 2 888 0000' },
    { key: 'shop_email', value: 'info@printshop.ph' },
    { key: 'currency', value: 'PHP' },
    { key: 'tax_rate', value: '0' },
    { key: 'receipt_footer', value: 'Thank you for your business! Come again.' },
  ]);

  console.log('Database seeded successfully!');
  console.log('\nDemo Accounts:');
  console.log('  Owner:              owner@printshop.com / owner123');
  console.log('  Manager:            manager@printshop.com / manager123');
  console.log('  Cashier:            cashier@printshop.com / cashier123');
  console.log('  Print Operator:     operator@printshop.com / operator123');
  console.log('  Inventory Officer:  inventory@printshop.com / inventory123');
}
