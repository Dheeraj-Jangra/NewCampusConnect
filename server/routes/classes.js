import express from 'express';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Get all classes
router.get('/', async (req, res) => {
  try {
    const classes = await prisma.class.findMany({
      orderBy: {
        timestamp: 'desc',
      },
    });
    res.json(classes);
  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

// Create/schedule class
router.post('/', async (req, res) => {
  try {
    const { subject, professor, time, duration, room, link } = req.body;
    if (!subject || !time || !duration || !room) {
      return res.status(400).json({ error: 'Subject, time, duration, and room are required' });
    }

    const newClass = await prisma.class.create({
      data: {
        subject,
        professor: professor || 'Prof. Evelyn Vance',
        time,
        duration: String(duration),
        room,
        link: link || '',
      },
    });

    res.status(201).json(newClass);
  } catch (error) {
    console.error('Error creating class:', error);
    res.status(500).json({ error: 'Failed to schedule class' });
  }
});

export default router;
