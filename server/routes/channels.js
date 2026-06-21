import express from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware, professorMiddleware } from '../middleware/auth.js';

const router = express.Router();

const VALID_RESTRICTIONS = ['all', 'faculty', 'admin'];

// Default channels to seed on first run
const DEFAULT_CHANNELS = [
  { label: 'general-chat', description: 'Global discussion space for all students and professors.', isDefault: true, postRestriction: 'all' },
  { label: 'faculty-q-a', description: 'Academic clarifications and faculty discussion board. Faculty only can post.', isDefault: true, postRestriction: 'faculty' },
  { label: 'ui-aesthetics', description: 'Visual design discussions, animations, and frontend guidelines.', isDefault: true, postRestriction: 'all' },
  { label: 'exam-prep-group', description: 'Student-run study groups and shared study tips.', isDefault: true, postRestriction: 'all' },
];

// Seed default channels if none exist
async function seedDefaultChannels() {
  try {
    const count = await prisma.chatChannel.count();
    if (count === 0) {
      console.log('Seeding default chat channels...');
      await prisma.chatChannel.createMany({ data: DEFAULT_CHANNELS });
    }
  } catch (err) {
    console.error('Error seeding default channels:', err);
  }
}

// List all channels (public)
router.get('/', async (req, res) => {
  try {
    const channels = await prisma.chatChannel.findMany({
      orderBy: { createdAt: 'asc' },
    });
    res.json(channels);
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// Create a channel (professors and admins only)
router.post('/', authMiddleware, professorMiddleware, async (req, res) => {
  try {
    const { label, description, postRestriction } = req.body;
    if (!label || !label.trim()) {
      return res.status(400).json({ error: 'Channel label is required' });
    }

    const trimmedLabel = label.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    if (trimmedLabel.length < 2 || trimmedLabel.length > 40) {
      return res.status(400).json({ error: 'Channel label must be 2-40 characters (letters, numbers, hyphens)' });
    }

    const existing = await prisma.chatChannel.findFirst({ where: { label: trimmedLabel } });
    if (existing) {
      return res.status(409).json({ error: 'A channel with this label already exists' });
    }

    const restriction = VALID_RESTRICTIONS.includes(postRestriction) ? postRestriction : 'all';

    const channel = await prisma.chatChannel.create({
      data: {
        label: trimmedLabel,
        description: (description || '').trim(),
        isDefault: false,
        postRestriction: restriction,
      },
    });

    res.status(201).json(channel);
  } catch (error) {
    console.error('Error creating channel:', error);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// Update channel post restriction (professors and admins only)
router.patch('/:id', authMiddleware, professorMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { postRestriction } = req.body;

    if (!VALID_RESTRICTIONS.includes(postRestriction)) {
      return res.status(400).json({ error: 'Invalid restriction. Must be: all, faculty, or admin' });
    }

    const channel = await prisma.chatChannel.findUnique({ where: { id } });
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const updated = await prisma.chatChannel.update({
      where: { id },
      data: { postRestriction },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating channel:', error);
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

// Delete a channel (professors and admins only)
router.delete('/:id', authMiddleware, professorMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const channel = await prisma.chatChannel.findUnique({ where: { id } });
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    if (channel.isDefault) {
      return res.status(403).json({ error: 'Cannot delete a default channel' });
    }

    await prisma.chatMessage.deleteMany({ where: { channel: channel.label } });
    await prisma.chatChannel.delete({ where: { id } });

    res.json({ message: 'Channel deleted successfully', id, label: channel.label });
  } catch (error) {
    console.error('Error deleting channel:', error);
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

export { seedDefaultChannels };
export default router;
