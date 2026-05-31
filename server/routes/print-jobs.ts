import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { printJobs, customers, users, services } from '../db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    let query = db.select({
      id: printJobs.id,
      jobNumber: printJobs.jobNumber,
      title: printJobs.title,
      status: printJobs.status,
      quantity: printJobs.quantity,
      totalAmount: printJobs.totalAmount,
      dueDate: printJobs.dueDate,
      completedAt: printJobs.completedAt,
      createdAt: printJobs.createdAt,
      customerName: customers.name,
      customerPhone: customers.phone,
      operatorName: users.name,
      serviceName: services.name,
    })
      .from(printJobs)
      .leftJoin(customers, eq(printJobs.customerId, customers.id))
      .leftJoin(users, eq(printJobs.assignedTo, users.id))
      .leftJoin(services, eq(printJobs.serviceId, services.id));

    const results = await query.orderBy(desc(printJobs.createdAt));
    return res.json(status ? results.filter(j => j.status === status) : results);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch print jobs' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [job] = await db.select({
      id: printJobs.id,
      jobNumber: printJobs.jobNumber,
      title: printJobs.title,
      description: printJobs.description,
      status: printJobs.status,
      quantity: printJobs.quantity,
      unitPrice: printJobs.unitPrice,
      totalAmount: printJobs.totalAmount,
      notes: printJobs.notes,
      dueDate: printJobs.dueDate,
      completedAt: printJobs.completedAt,
      createdAt: printJobs.createdAt,
      updatedAt: printJobs.updatedAt,
      customerName: customers.name,
      operatorName: users.name,
      serviceName: services.name,
    })
      .from(printJobs)
      .leftJoin(customers, eq(printJobs.customerId, customers.id))
      .leftJoin(users, eq(printJobs.assignedTo, users.id))
      .leftJoin(services, eq(printJobs.serviceId, services.id))
      .where(eq(printJobs.id, Number(req.params.id))).limit(1);
    if (!job) return res.status(404).json({ error: 'Print job not found' });
    return res.json(job);
  } catch { return res.status(500).json({ error: 'Failed to fetch print job' }); }
});

router.post('/', authorize('owner', 'manager', 'cashier'), async (req, res) => {
  try {
    const data = z.object({
      customerId: z.number().optional(),
      assignedTo: z.number().optional(),
      serviceId: z.number().optional(),
      title: z.string().min(1),
      description: z.string().optional(),
      quantity: z.number().min(1).default(1),
      unitPrice: z.string(),
      notes: z.string().optional(),
      dueDate: z.string().optional(),
    }).parse(req.body);

    const [lastJob] = await db.select({ jobNumber: printJobs.jobNumber })
      .from(printJobs).orderBy(desc(printJobs.id)).limit(1);
    const nextNum = lastJob
      ? String(Number(lastJob.jobNumber.split('-')[2]) + 1).padStart(3, '0')
      : '001';
    const jobNumber = `PJ-${new Date().getFullYear()}-${nextNum}`;
    const totalAmount = String(data.quantity * parseFloat(data.unitPrice));

    const [job] = await db.insert(printJobs).values({
      ...data,
      jobNumber,
      totalAmount,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
    }).returning();
    return res.status(201).json(job);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to create print job' });
  }
});

router.patch('/:id/status', authorize('owner', 'manager', 'print_operator'), async (req, res) => {
  try {
    const { status } = z.object({ status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']) }).parse(req.body);
    const updates: any = { status, updatedAt: new Date() };
    if (status === 'completed') updates.completedAt = new Date();
    const [job] = await db.update(printJobs).set(updates).where(eq(printJobs.id, Number(req.params.id))).returning();
    if (!job) return res.status(404).json({ error: 'Print job not found' });
    return res.json(job);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to update status' });
  }
});

router.delete('/:id', authorize('owner', 'manager'), async (req, res) => {
  try {
    await db.delete(printJobs).where(eq(printJobs.id, Number(req.params.id)));
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: 'Failed to delete print job' }); }
});

export default router;
