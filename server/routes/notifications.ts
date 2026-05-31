import { Router } from 'express';
import { db } from '../db/index';
import { notifications } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const list = await db.select().from(notifications)
      .where(eq(notifications.userId, req.user!.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    return res.json(list);
  } catch { return res.status(500).json({ error: 'Failed to fetch notifications' }); }
});

router.patch('/:id/read', async (req: AuthRequest, res) => {
  try {
    const { and } = await import('drizzle-orm');
    const result = await db.update(notifications).set({ isRead: true })
      .where(and(
        eq(notifications.id, Number(req.params.id)),
        eq(notifications.userId, req.user!.id)
      ));
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: 'Failed to mark as read' }); }
});

router.patch('/read-all', async (req: AuthRequest, res) => {
  try {
    await db.update(notifications).set({ isRead: true })
      .where(eq(notifications.userId, req.user!.id));
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: 'Failed to mark all read' }); }
});

export default router;
