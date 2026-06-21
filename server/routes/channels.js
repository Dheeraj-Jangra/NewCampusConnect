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
      select: {
        id: true,
        label: true,
        description: true,
        isDefault: true,
        postRestriction: true,
        createdById: true,
      },
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

    // Professors can only set "all" or "faculty" — not "admin"
    let restriction = VALID_RESTRICTIONS.includes(postRestriction) ? postRestriction : 'all';
    if (req.user.role === 'professor' && restriction === 'admin') {
      restriction = 'faculty'; // downgrade
    }

    const channel = await prisma.chatChannel.create({
      data: {
        label: trimmedLabel,
        description: (description || '').trim(),
        isDefault: false,
        postRestriction: restriction,
        createdById: req.user.id,
      },
    });

    res.status(201).json(channel);
  } catch (error) {
    console.error('Error creating channel:', error);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// Update channel post restriction (admins only)
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    // Only admins can change restrictions
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can change channel restrictions' });
    }

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

// Delete a channel
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const channel = await prisma.chatChannel.findUnique({ where: { id } });
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Default channels cannot be deleted by anyone
    if (channel.isDefault) {
      return res.status(403).json({ error: 'Cannot delete a default channel' });
    }

    // Professors can only delete channels they created
    if (req.user.role === 'professor' && channel.createdById !== req.user.id) {
      return res.status(403).json({ error: 'Professors can only delete channels they created' });
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
