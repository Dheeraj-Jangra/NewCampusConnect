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

// Delete a chat message — admin: any, faculty: non-admin messages, student: own only
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.chatMessage.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const isAdmin = req.user.role === 'admin';
    const isFaculty = req.user.role === 'professor';
    const isSender = existing.senderId === req.user.id;
    const msgIsAdmin = existing.role === 'admin';

    // Admin can delete anything
    if (isAdmin) {
      await prisma.chatMessage.delete({ where: { id } });
      return res.json({ message: 'Message deleted successfully', id });
    }

    // Faculty can delete their own messages and student messages, but NOT admin messages
    if (isFaculty) {
      if (msgIsAdmin) {
        return res.status(403).json({ error: 'Professors cannot delete admin messages' });
      }
      await prisma.chatMessage.delete({ where: { id } });
      return res.json({ message: 'Message deleted successfully', id });
    }

    // Students can only delete their own messages
    if (isSender) {
      await prisma.chatMessage.delete({ where: { id } });
      return res.json({ message: 'Message deleted successfully', id });
    }

    return res.status(403).json({ error: 'Access denied: You can only delete your own messages' });
  } catch (error) {
    console.error('Error deleting chat message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

export default router;
