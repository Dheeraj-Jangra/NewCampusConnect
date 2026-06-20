import express from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Get historical chat messages for a specific channel
router.get('/:channel', async (req, res) => {
  try {
    const { channel } = req.params;
    
    const messages = await prisma.chatMessage.findMany({
      where: { channel },
      orderBy: {
        timestamp: 'asc',
      },
      take: 50, // Limit to last 50 messages to prevent overload
    });
    
    res.json(messages);
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// Delete a chat message (sender, faculty, or admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.chatMessage.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Allow if: sender themselves, faculty/professor, or admin
    const isSender = existing.senderId === req.user.id;
    const isFaculty = req.user.role === 'professor';
    const isAdmin = req.user.role === 'admin';

    if (!isSender && !isFaculty && !isAdmin) {
      return res.status(403).json({ error: 'Access denied: You can only delete your own messages' });
    }

    await prisma.chatMessage.delete({ where: { id } });
    res.json({ message: 'Message deleted successfully', id });
  } catch (error) {
    console.error('Error deleting chat message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

export default router;
