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

  // On startup: only seed when the database is completely empty.
  // Never auto-truncate — that destroys live credentials on every cold start.
  if (Number(userCount.count) > 0) {
    console.log('Database already has data, skipping auto-seed.');
    return;
  }

  console.log('Seeding PrintShop database...');

  // ─── Seed Users ──────────────────────────────────────────
  const ownerHash = await bcrypt.hash('owner123', 12);
  const managerHash = await bcrypt.hash('manager123', 12);
  const cashierHash = await bcrypt.hash('cashier123', 12);
  const operatorHash = await bcrypt.hash('operator123', 12);
  const inventoryHash = await bcrypt.hash('inventory123', 12);

  const [owner] = await db.insert(users).values({
    name: 'Kwame Asante',
    email: 'owner@printshop.com',
    passwordHash: ownerHash,
    role: 'owner',
    phone: '+233 20 123 4567',
    isActive: true,
  }).returning();

  const [manager] = await db.insert(users).values({
    name: 'Abena Mensah',
    email: 'manager@printshop.com',
    passwordHash: managerHash,
    role: 'manager',
    phone: '+233 24 234 5678',
    isActive: true,
  }).returning();

  const [cashier] = await db.insert(users).values({
    name: 'Kofi Boateng',
    email: 'cashier@printshop.com',
    passwordHash: cashierHash,
    role: 'cashier',
    phone: '+233 27 345 6789',
    isActive: true,
  }).returning();

  const [operator] = await db.insert(users).values({
    name: 'Ama Owusu',
    email: 'operator@printshop.com',
    passwordHash: operatorHash,
    role: 'print_operator',
    phone: '+233 54 456 7890',
    isActive: true,
  }).returning();

  const [invOfficer] = await db.insert(users).values({
    name: 'Yaw Darko',
    email: 'inventory@printshop.com',
    passwordHash: inventoryHash,
    role: 'inventory_officer',
    phone: '+233 55 567 8901',
    isActive: true,
  }).returning();

  // ─── Seed Customers ─────────────────────────────────────
  const customerData = [
    { name: 'Accra Business School', email: 'admin@accrabiz.edu.gh', phone: '+233 30 270 1234', address: 'Accra, Greater Accra', notes: 'Regular bulk order client' },
    { name: 'Ghana Revenue Authority', email: 'proc@gra.gov.gh', phone: '+233 30 221 5678', address: 'GRA Head Office, Accra', notes: 'Government client — requires official receipt' },
    { name: 'Kumasi Cooperative', email: 'info@kumasicoop.gh', phone: '+233 32 202 9012', address: 'Kumasi, Ashanti Region', notes: 'Monthly calendar orders' },
    { name: 'Esi Aidoo', email: 'esi@email.com', phone: '+233 24 111 2222', address: 'East Legon, Accra', notes: '' },
    { name: 'Charles Opoku', email: 'charles.o@email.com', phone: '+233 27 333 4444', address: 'Tema, Greater Accra', notes: 'Wedding invitation client' },
    { name: 'Gold Coast Publishers', email: 'orders@goldcoastpub.com.gh', phone: '+233 30 277 1111', address: 'Airport City, Accra', notes: 'Large volume book reprints' },
    { name: 'Walk-in Customer', email: '', phone: '', address: '', notes: 'Default walk-in account' },
  ];
  const insertedCustomers = await db.insert(customers).values(customerData).returning();

  // ─── Seed Product Categories ─────────────────────────────
  const catData = [
    { name: 'Books', description: 'Textbooks, references, novels' },
    { name: 'Stationery', description: 'Pens, pencils, notebooks, folders, office supplies' },
    { name: 'Art Supplies', description: 'Paints, brushes, drawing materials' },
    { name: 'Paper Products', description: 'Bond paper, colored paper, specialty paper' },
    { name: 'School Supplies', description: 'Rulers, erasers, backpacks' },
  ];
  const insertedCategories = await db.insert(productCategories).values(catData).returning();

  // ─── Seed Products ───────────────────────────────────────
  const productData = [
    { categoryId: insertedCategories[0].id, name: 'BECE Maths Textbook', sku: 'BK-BECE-MATH', price: '35.00', costPrice: '20.00', unit: 'piece', description: 'WAEC-aligned BECE Mathematics' },
    { categoryId: insertedCategories[0].id, name: 'BECE Science Textbook', sku: 'BK-BECE-SCI', price: '35.00', costPrice: '20.00', unit: 'piece', description: 'WAEC-aligned BECE Science' },
    { categoryId: insertedCategories[0].id, name: 'English Grammar Workbook', sku: 'BK-ENG-GRAM', price: '28.00', costPrice: '15.00', unit: 'piece', description: 'JHS/SHS English Grammar' },
    { categoryId: insertedCategories[1].id, name: 'Ballpen (Blue) Box', sku: 'STN-BP-BLU-BOX', price: '12.00', costPrice: '6.50', unit: 'box', description: '20pcs per box, blue ink' },
    { categoryId: insertedCategories[1].id, name: 'Spiral Notebook (80 leaves)', sku: 'STN-NB-SP80', price: '8.50', costPrice: '4.50', unit: 'piece', description: 'A4 spiral notebook' },
    { categoryId: insertedCategories[1].id, name: 'Expandable Folder (Long)', sku: 'STN-FLD-EXP', price: '7.00', costPrice: '3.50', unit: 'piece', description: 'Long-size expandable folder' },
    { categoryId: insertedCategories[3].id, name: 'Bond Paper (Short) Ream', sku: 'PPR-BOND-SHORT', price: '30.00', costPrice: '20.00', unit: 'ream', description: 'Short bond paper, 500 sheets' },
    { categoryId: insertedCategories[3].id, name: 'Bond Paper (Long) Ream', sku: 'PPR-BOND-LONG', price: '33.00', costPrice: '22.00', unit: 'ream', description: 'Long bond paper, 500 sheets' },
    { categoryId: insertedCategories[4].id, name: 'Pencil #2 Box', sku: 'SCH-PNC-BOX', price: '10.00', costPrice: '5.50', unit: 'box', description: '12pcs per box' },
    { categoryId: insertedCategories[4].id, name: 'Ruler (30cm Plastic)', sku: 'SCH-RUL-30P', price: '4.00', costPrice: '1.80', unit: 'piece', description: 'Clear plastic ruler' },
    { categoryId: insertedCategories[2].id, name: 'Watercolor Set (12 colors)', sku: 'ART-WC-12', price: '18.00', costPrice: '10.00', unit: 'set', description: '12-color watercolor paint' },
    { categoryId: insertedCategories[1].id, name: 'Correction Tape', sku: 'STN-CT-STD', price: '5.50', costPrice: '2.80', unit: 'piece', description: 'Standard correction tape' },
  ];
  const insertedProducts = await db.insert(products).values(productData).returning();

  // ─── Seed Services ───────────────────────────────────────
  const serviceData = [
    { name: 'Black & White Printing', description: 'Standard BW printing on bond paper', pricePerUnit: '0.50', unit: 'page' },
    { name: 'Color Printing', description: 'Full-color printing on bond paper', pricePerUnit: '2.00', unit: 'page' },
    { name: 'Photocopying', description: 'Photocopying service', pricePerUnit: '0.30', unit: 'page' },
    { name: 'Lamination (Short)', description: 'Short-size lamination', pricePerUnit: '3.00', unit: 'page' },
    { name: 'Lamination (Long)', description: 'Long-size lamination', pricePerUnit: '4.00', unit: 'page' },
    { name: 'Binding (Comb)', description: 'Comb/coil binding per document', pricePerUnit: '7.00', unit: 'document' },
    { name: 'Binding (Tape/Thermal)', description: 'Thermal binding per document', pricePerUnit: '9.00', unit: 'document' },
    { name: 'Tarpaulin Printing 2x3ft', description: 'Standard tarpaulin print', pricePerUnit: '28.00', unit: 'piece' },
    { name: 'ID Card Printing', description: 'PVC ID card printing', pricePerUnit: '25.00', unit: 'card' },
    { name: 'Scanning', description: 'Document scanning to PDF', pricePerUnit: '1.00', unit: 'page' },
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
    { name: 'Ghana Book Trust', contactName: 'Kwabena Asare', email: 'wholesale@gbt.com.gh', phone: '+233 30 251 1234', address: 'Accra', notes: 'Main book supplier' },
    { name: 'Abossey Okai Paper Depot', contactName: 'Beatrice Tetteh', email: 'sales@aopaper.gh', phone: '+233 30 222 5678', address: 'Abossey Okai, Accra', notes: 'Paper and printing supplies' },
    { name: 'Tech Print Solutions', contactName: 'Emmanuel Laryea', email: 'orders@techprint.gh', phone: '+233 30 290 9012', address: 'Spintex, Accra', notes: 'Printer inks and toners' },
    { name: 'Readwide Publishers Ghana', contactName: 'Sandra Boateng', email: 'trade@readwide.gh', phone: '+233 32 202 3456', address: 'Kumasi', notes: 'Educational books and materials' },
  ];
  await db.insert(suppliers).values(supplierData);

  // ─── Seed Cash Session ───────────────────────────────────
  const today = new Date();
  const [openSession] = await db.insert(cashSessions).values({
    openedBy: cashier.id,
    openingBalance: '500.00',
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
    openingBalance: '500.00',
    closingBalance: '2850.00',
    totalSales: '2600.00',
    totalExpenses: '250.00',
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
      unitPrice: '25.00',
      totalAmount: '6250.00',
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
      unitPrice: '35.00',
      totalAmount: '1750.00',
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
      unitPrice: '5.00',
      totalAmount: '1500.00',
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
      unitPrice: '0.50',
      totalAmount: '250.00',
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
      subtotal: '78.50',
      discountAmount: '0.00',
      taxAmount: '0.00',
      totalAmount: '78.50',
      paymentMethod: 'cash' as const,
      paymentStatus: 'paid',
      createdAt: new Date(today.getTime() - 2 * 3600000),
    },
    {
      saleNumber: 'SL-2026-0002',
      customerId: insertedCustomers[0].id,
      cashierId: cashier.id,
      cashSessionId: openSession.id,
      subtotal: '420.00',
      discountAmount: '42.00',
      taxAmount: '0.00',
      totalAmount: '378.00',
      paymentMethod: 'mtn_momo' as const,
      paymentStatus: 'paid',
      createdAt: new Date(today.getTime() - 1 * 3600000),
    },
  ];
  const insertedSales = await db.insert(sales).values(saleRecords).returning();

  await db.insert(saleItems).values([
    { saleId: insertedSales[0].id, productId: insertedProducts[0].id, description: 'BECE Maths Textbook', quantity: 2, unitPrice: '35.00', discount: '0.00', totalPrice: '70.00' },
    { saleId: insertedSales[0].id, productId: insertedProducts[3].id, description: 'Ballpen (Blue) Box', quantity: 1, unitPrice: '12.00', discount: '0.00', totalPrice: '12.00' },
  ]);

  await db.insert(saleItems).values([
    { saleId: insertedSales[1].id, productId: insertedProducts[0].id, description: 'BECE Maths Textbook', quantity: 6, unitPrice: '35.00', discount: '21.00', totalPrice: '189.00' },
    { saleId: insertedSales[1].id, productId: insertedProducts[1].id, description: 'BECE Science Textbook', quantity: 6, unitPrice: '35.00', discount: '21.00', totalPrice: '189.00' },
  ]);

  // ─── Seed Receipts ───────────────────────────────────────
  const { receipts } = await import('./schema');
  await db.insert(receipts).values([
    { saleId: insertedSales[0].id, receiptNumber: 'RC-2026-0001', generatedBy: cashier.id },
    { saleId: insertedSales[1].id, receiptNumber: 'RC-2026-0002', generatedBy: cashier.id },
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
      amount: '65.00',
      paymentMethod: 'cash' as const,
      expenseDate: today,
      recordedBy: manager.id,
    },
    {
      categoryId: insertedExpCats[0].id,
      description: 'Monthly electricity bill — ECG',
      amount: '320.00',
      paymentMethod: 'bank_transfer' as const,
      referenceNumber: 'ECG-2026-05',
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
    { key: 'shop_address', value: '45 Graphic Road, Accra, Ghana' },
    { key: 'shop_phone', value: '+233 30 222 0000' },
    { key: 'shop_email', value: 'info@printshop.com.gh' },
    { key: 'currency', value: 'GHS' },
    { key: 'currency_symbol', value: 'GH₵' },
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
