import express from 'express';
import prisma from '../lib/prisma.js';

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

export default router;
