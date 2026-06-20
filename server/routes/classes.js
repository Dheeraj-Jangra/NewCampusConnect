import express from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware, professorMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Get all classes
router.get('/', async (req, res) => {
  try {
    const classes = await prisma.class.findMany({
      orderBy: {
        timestamp: 'desc',
      },
      take: 50, // Limit to prevent abuse
    });
    res.json(classes);
  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

// Create/schedule class (secured - professors and admins only)
router.post('/', authMiddleware, professorMiddleware, async (req, res) => {
  try {
    const { subject, time, duration, room, link } = req.body;
    if (!subject || !time || !duration || !room) {
      return res.status(400).json({ error: 'Subject, time, duration, and room are required' });
    }

    // Validate input lengths
    if (subject.length > 200) {
      return res.status(400).json({ error: 'Subject must be 200 characters or less' });
    }
    if (room.length > 100) {
      return res.status(400).json({ error: 'Room must be 100 characters or less' });
    }

    // Validate time format (HH:MM)
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return res.status(400).json({ error: 'Invalid time format. Use HH:MM (24-hour)' });
    }

    // Validate duration is a positive number
    const durationNum = parseInt(duration, 10);
    if (isNaN(durationNum) || durationNum <= 0 || durationNum > 480) {
      return res.status(400).json({ error: 'Duration must be between 1 and 480 minutes' });
    }

    // Validate link URL if provided
    if (link && link.trim()) {
      try {
        const url = new URL(link);
        if (!['http:', 'https:'].includes(url.protocol)) {
          return res.status(400).json({ error: 'Link must be a valid HTTP or HTTPS URL' });
        }
      } catch {
        return res.status(400).json({ error: 'Link must be a valid URL' });
      }
    }

    const newClass = await prisma.class.create({
      data: {
        subject,
        professor: req.user.name,
        professorId: req.user.id,
        time,
        duration: String(durationNum),
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
