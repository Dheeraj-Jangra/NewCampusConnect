import express from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Get all conversations for current user
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all unique DM partners
    const sent = await prisma.directMessage.findMany({
      where: { senderId: userId },
      select: { receiverId: true },
      distinct: ['receiverId'],
    });
    const received = await prisma.directMessage.findMany({
      where: { receiverId: userId },
      select: { senderId: true },
      distinct: ['senderId'],
    });

    const partnerIds = [
      ...new Set([
        ...sent.map(s => s.receiverId),
        ...received.map(r => r.senderId),
      ]),
    ];

    if (partnerIds.length === 0) return res.json([]);

    // Get partner info and last message for each conversation
    const conversations = await Promise.all(
      partnerIds.map(async (partnerId) => {
        const partner = await prisma.user.findUnique({
          where: { id: partnerId },
          select: { id: true, name: true, role: true, username: true },
        });

        const lastMessage = await prisma.directMessage.findFirst({
          where: {
            OR: [
              { senderId: userId, receiverId: partnerId },
              { senderId: partnerId, receiverId: userId },
            ],
          },
          orderBy: { timestamp: 'desc' },
          select: { content: true, timestamp: true, senderId: true },
        });

        const unreadCount = await prisma.directMessage.count({
          where: { senderId: partnerId, receiverId: userId, read: false },
        });

        return { partner, lastMessage, unreadCount };
      })
    );

    // Sort by most recent message
    conversations.sort((a, b) => {
      const aTime = a.lastMessage?.timestamp?.getTime() || 0;
      const bTime = b.lastMessage?.timestamp?.getTime() || 0;
      return bTime - aTime;
    });

    res.json(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Get messages with a specific user
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { userId } = req.params;

    const messages = await prisma.directMessage.findMany({
      where: {
        AND: [
          {
            OR: [
              { senderId: currentUserId, receiverId: userId },
              { senderId: userId, receiverId: currentUserId },
            ],
          },
          // Filter out messages deleted for the current user
          {
            OR: [
              { senderId: currentUserId, deletedForSender: false },
              { receiverId: currentUserId, deletedForReceiver: false },
            ],
          },
        ],
      },
      orderBy: { timestamp: 'asc' },
      take: 100,
    });

    // Mark messages from partner as read
    await prisma.directMessage.updateMany({
      where: { senderId: userId, receiverId: currentUserId, read: false },
      data: { read: true },
    });

    res.json(messages);
  } catch (error) {
    console.error('Error fetching DM messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send a DM
router.post('/:userId', authMiddleware, async (req, res) => {
  try {
    const senderId = req.user.id;
    const { userId: receiverId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    if (senderId === receiverId) {
      return res.status(400).json({ error: 'Cannot send message to yourself' });
    }

    // Verify receiver exists
    const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiver) {
      return res.status(404).json({ error: 'User not found' });
    }

    const message = await prisma.directMessage.create({
      data: {
        senderId,
        receiverId,
        content: content.trim(),
      },
    });

    res.json(message);
  } catch (error) {
    console.error('Error sending DM:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get unread count
router.get('/unread/count', authMiddleware, async (req, res) => {
  try {
    const count = await prisma.directMessage.count({
      where: { receiverId: req.user.id, read: false },
    });
    res.json({ count });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// Delete a DM message — scope: "me" or "all"
router.delete('/:messageId', authMiddleware, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { scope } = req.query; // "me" or "all"
    const userId = req.user.id;

    const message = await prisma.directMessage.findUnique({ where: { id: messageId } });
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Only sender or receiver can delete
    if (message.senderId !== userId && message.receiverId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (scope === 'all') {
      // Only the sender can delete for everyone
      if (message.senderId !== userId) {
        return res.status(403).json({ error: 'Only the sender can delete for everyone' });
      }
      await prisma.directMessage.delete({ where: { id: messageId } });
      res.json({ deleted: true, scope: 'all', messageId });
    } else {
      // Delete for me — mark the appropriate flag
      const isSender = message.senderId === userId;
      await prisma.directMessage.update({
        where: { id: messageId },
        data: isSender ? { deletedForSender: true } : { deletedForReceiver: true },
      });
      res.json({ deleted: true, scope: 'me', messageId });
    }
  } catch (error) {
    console.error('Error deleting DM:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

export default router;
