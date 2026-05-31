import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { db } from '../db/index';
import { printJobs, customers, users, services } from '../db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import path from 'path';
import fs from 'fs/promises';

const router = Router();
router.use(authenticate);

const VALID_STATUSES = ['pending', 'in_progress', 'printed', 'delivered', 'completed', 'cancelled'] as const;

router.get('/', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const operatorId = req.query.operatorId ? Number(req.query.operatorId) : undefined;
    const dateStr = req.query.date as string | undefined; // YYYY-MM-DD

    const conditions: any[] = [];
    if (status && VALID_STATUSES.includes(status as any)) {
      conditions.push(eq(printJobs.status, status as any));
    }
    if (operatorId) {
      conditions.push(eq(printJobs.assignedTo, operatorId));
    }
    if (dateStr) {
      const start = new Date(`${dateStr}T00:00:00.000Z`);
      const end = new Date(`${dateStr}T23:59:59.999Z`);
      conditions.push(sql`print_jobs.created_at >= ${start} AND print_jobs.created_at <= ${end}`);
    }

    const { and: drizzleAnd } = await import('drizzle-orm');
    const results = await db.select({
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
      customerId: printJobs.customerId,
      assignedTo: printJobs.assignedTo,
      serviceId: printJobs.serviceId,
      pageCount: printJobs.pageCount,
      fileUrl: printJobs.fileUrl,
      fileName: printJobs.fileName,
      fileSize: printJobs.fileSize,
      fileMimeType: printJobs.fileMimeType,
      paymentStatus: printJobs.paymentStatus,
      customerName: customers.name,
      customerPhone: customers.phone,
      operatorName: users.name,
      serviceName: services.name,
    })
      .from(printJobs)
      .leftJoin(customers, eq(printJobs.customerId, customers.id))
      .leftJoin(users, eq(printJobs.assignedTo, users.id))
      .leftJoin(services, eq(printJobs.serviceId, services.id))
      .where(conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : drizzleAnd(...conditions))
      .orderBy(desc(printJobs.createdAt));
    return res.json(results);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch print jobs' });
  }
});

router.get('/operators', async (_req, res) => {
  try {
    const operators = await db.select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.isActive, true));
    return res.json(operators.filter(u => u.role === 'print_operator' || u.role === 'owner' || u.role === 'manager'));
  } catch { return res.status(500).json({ error: 'Failed to fetch operators' }); }
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
      customerId: printJobs.customerId,
      assignedTo: printJobs.assignedTo,
      pageCount: printJobs.pageCount,
      fileUrl: printJobs.fileUrl,
      paymentStatus: printJobs.paymentStatus,
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

router.post('/', authorize('owner', 'manager', 'cashier'), async (req: AuthRequest, res) => {
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
      pageCount: z.number().int().positive().optional(),
      paymentStatus: z.enum(['unpaid', 'partial', 'paid']).default('unpaid'),
    }).parse(req.body);

    const year = new Date().getFullYear();
    const [lastJob] = await db.select({ jobNumber: printJobs.jobNumber })
      .from(printJobs)
      .where(sql`job_number LIKE ${'PR-' + year + '-%'}`)
      .orderBy(desc(printJobs.id)).limit(1);

    let nextNum = 1;
    if (lastJob) {
      const parts = lastJob.jobNumber.split('-');
      const last = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(last)) nextNum = last + 1;
    }
    const jobNumber = `PR-${year}-${String(nextNum).padStart(4, '0')}`;
    const totalAmount = String(data.quantity * parseFloat(data.unitPrice));

    const [job] = await db.insert(printJobs).values({
      ...data,
      jobNumber,
      totalAmount,
      createdBy: req.user!.id,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
    }).returning();
    return res.status(201).json(job);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    console.error(err);
    return res.status(500).json({ error: 'Failed to create print job' });
  }
});

// Allowlisted extensions: safe types only — no HTML, SVG, JS, or any scriptable content
const ALLOWED_EXTENSIONS: Record<string, { mimeType: string; magic: number[] }> = {
  '.pdf':  { mimeType: 'application/pdf',     magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  '.jpg':  { mimeType: 'image/jpeg',           magic: [0xFF, 0xD8, 0xFF] },
  '.jpeg': { mimeType: 'image/jpeg',           magic: [0xFF, 0xD8, 0xFF] },
  '.png':  { mimeType: 'image/png',            magic: [0x89, 0x50, 0x4E, 0x47] },
  '.docx': { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: [0x50, 0x4B] }, // PK (ZIP)
  '.doc':  { mimeType: 'application/msword',   magic: [0xD0, 0xCF, 0x11, 0xE0] }, // OLE2
};
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

router.post('/:id/file', authorize('owner', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { filename, fileData } = z.object({
      filename: z.string().min(1).max(255),
      fileData: z.string().min(1),
    }).parse(req.body);

    // Validate extension against allowlist
    const rawExt = path.extname(filename).toLowerCase();
    const allowed = ALLOWED_EXTENSIONS[rawExt];
    if (!allowed) {
      return res.status(400).json({
        error: `File type "${rawExt || 'unknown'}" is not allowed. Permitted: PDF, JPG, PNG, DOC, DOCX.`,
      });
    }

    // Decode and enforce size limit
    const fileBuffer = Buffer.from(fileData, 'base64');
    if (fileBuffer.length > MAX_UPLOAD_BYTES) {
      return res.status(400).json({ error: 'File exceeds the 10 MB limit.' });
    }

    // Validate magic bytes (prevent extension spoofing)
    const { magic } = allowed;
    const matchesMagic = magic.every((byte, i) => fileBuffer[i] === byte);
    if (!matchesMagic) {
      return res.status(400).json({ error: 'File content does not match the declared type.' });
    }

    const uploadsDir = path.join(process.cwd(), 'uploads', 'print-jobs');
    await fs.mkdir(uploadsDir, { recursive: true });

    // Server-generated filename — never use client-supplied name directly on disk
    const savedName = `job-${id}-${Date.now()}${rawExt}`;
    const diskPath = path.join(uploadsDir, savedName);
    await fs.writeFile(diskPath, fileBuffer);

    const fileUrl = `/api/print-jobs/${id}/file`;
    const [job] = await db.update(printJobs)
      .set({
        fileUrl,
        filePath: diskPath,
        fileName: filename,
        fileSize: fileBuffer.length,
        fileMimeType: allowed.mimeType,
        fileUploadedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(printJobs.id, id))
      .returning();

    if (!job) return res.status(404).json({ error: 'Print job not found' });
    return res.json({ fileUrl, job });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    console.error(err);
    return res.status(500).json({ error: 'Failed to upload file' });
  }
});

// ─── Download print job file (always as attachment — never inline-rendered) ──
router.get('/:id/file', authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [job] = await db.select({
      filePath: printJobs.filePath,
      fileName: printJobs.fileName,
      fileMimeType: printJobs.fileMimeType,
    }).from(printJobs).where(eq(printJobs.id, id)).limit(1);

    if (!job) return res.status(404).json({ error: 'Print job not found' });
    if (!job.filePath) return res.status(404).json({ error: 'No file attached to this job' });

    // Use persisted disk path — single authoritative reference, no directory scan
    const ext = path.extname(job.filePath).toLowerCase();
    const mimeType = job.fileMimeType ?? ALLOWED_EXTENSIONS[ext]?.mimeType ?? 'application/octet-stream';
    const safeFilename = `print-job-${id}${ext}`;

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const data = await fs.readFile(job.filePath);
    return res.end(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to serve file' });
  }
});

router.patch('/:id/status', authorize('owner', 'manager', 'print_operator'), async (req, res) => {
  try {
    const { status } = z.object({ status: z.enum(VALID_STATUSES) }).parse(req.body);
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

router.patch('/:id/assign', authorize('owner', 'manager'), async (req, res) => {
  try {
    const { assignedTo } = z.object({ assignedTo: z.number().nullable() }).parse(req.body);
    const [job] = await db.update(printJobs)
      .set({ assignedTo: assignedTo ?? undefined, updatedAt: new Date() })
      .where(eq(printJobs.id, Number(req.params.id))).returning();
    if (!job) return res.status(404).json({ error: 'Print job not found' });
    return res.json(job);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: 'Failed to assign operator' });
  }
});

router.delete('/:id', authorize('owner', 'manager'), async (req, res) => {
  try {
    await db.delete(printJobs).where(eq(printJobs.id, Number(req.params.id)));
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: 'Failed to delete print job' }); }
});

export default router;
