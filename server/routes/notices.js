import express from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware, professorMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Get all notices
router.get('/', async (req, res) => {
  try {
    const notices = await prisma.notice.findMany({
      orderBy: {
        timestamp: 'desc',
      },
      take: 50, // Limit to prevent abuse
    });
    res.json(notices);
  } catch (error) {
    console.error('Error fetching notices:', error);
    res.status(500).json({ error: 'Failed to fetch notices' });
  }
});

// Create notice (secured - professors and admins only)
router.post('/', authMiddleware, professorMiddleware, async (req, res) => {
  try {
    const { title, category, content } = req.body;
    if (!title || !category || !content) {
      return res.status(400).json({ error: 'Title, category, and content are required' });
    }

    // Validate input lengths
    if (title.length > 200) {
      return res.status(400).json({ error: 'Title must be 200 characters or less' });
    }
    if (content.length > 5000) {
      return res.status(400).json({ error: 'Content must be 5000 characters or less' });
    }

    // Validate category
    const allowedCategories = ['exam', 'announcement', 'event', 'academic'];
    if (!allowedCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const notice = await prisma.notice.create({
      data: {
        title,
        category,
        content,
        author: req.user.name,
        authorId: req.user.id,
      },
    });

    res.status(201).json(notice);
  } catch (error) {
    console.error('Error creating notice:', error);
    res.status(500).json({ error: 'Failed to create notice' });
  }
});

// Delete notice (professors and admins only)
router.delete('/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'professor' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Professor or admin privileges required' });
  }
  try {
    const { id } = req.params;
    const existing = await prisma.notice.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Notice not found' });
    }
    await prisma.notice.delete({ where: { id } });
    res.json({ message: 'Notice deleted successfully', id });
  } catch (error) {
    console.error('Error deleting notice:', error);
    res.status(500).json({ error: 'Failed to delete notice' });
  }
});

export default router;
