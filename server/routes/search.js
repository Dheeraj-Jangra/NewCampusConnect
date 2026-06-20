import express from 'express';
import prisma from '../lib/prisma.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json({ notices: [], classes: [], materials: [], users: [] });
    }

    const [notices, classes, materials, users] = await Promise.all([
      prisma.notice.findMany({
        where: {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { content: { contains: q, mode: 'insensitive' } },
            { author: { contains: q, mode: 'insensitive' } },
            { category: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
        orderBy: { timestamp: 'desc' },
      }),
      prisma.class.findMany({
        where: {
          OR: [
            { subject: { contains: q, mode: 'insensitive' } },
            { professor: { contains: q, mode: 'insensitive' } },
            { room: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
        orderBy: { timestamp: 'desc' },
      }),
      prisma.studyMaterial.findMany({
        where: {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { course: { contains: q, mode: 'insensitive' } },
            { author: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
        orderBy: { timestamp: 'desc' },
      }),
      prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { username: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, email: true, username: true, role: true },
      }),
    ]);

    res.json({ notices, classes, materials, users });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
