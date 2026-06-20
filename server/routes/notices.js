import express from 'express';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Get all notices
router.get('/', async (req, res) => {
  try {
    const notices = await prisma.notice.findMany({
      orderBy: {
        timestamp: 'desc',
      },
    });
    res.json(notices);
  } catch (error) {
    console.error('Error fetching notices:', error);
    res.status(500).json({ error: 'Failed to fetch notices' });
  }
});

// Create notice
router.post('/', async (req, res) => {
  try {
    const { title, category, content, author } = req.body;
    if (!title || !category || !content) {
      return res.status(400).json({ error: 'Title, category, and content are required' });
    }

    const notice = await prisma.notice.create({
      data: {
        title,
        category,
        content,
        author: author || 'Prof. Evelyn Vance',
      },
    });

    res.status(201).json(notice);
  } catch (error) {
    console.error('Error creating notice:', error);
    res.status(500).json({ error: 'Failed to create notice' });
  }
});

export default router;
