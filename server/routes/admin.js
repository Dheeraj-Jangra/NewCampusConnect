import express from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Apply admin protection to all routes in this file
router.use(authMiddleware);
router.use(adminMiddleware);

// Get all pending (unapproved) professors
router.get('/pending-professors', async (req, res) => {
  try {
    const pendingProfessors = await prisma.user.findMany({
      where: {
        role: 'professor',
        isApproved: false,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    res.json(pendingProfessors);
  } catch (error) {
    console.error('Error fetching pending professors:', error);
    res.status(500).json({ error: 'Failed to fetch pending requests' });
  }
});

// Approve a professor account
router.post('/approve-professor/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role !== 'professor') {
      return res.status(400).json({ error: 'Only professor accounts can be approved' });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { isApproved: true },
    });

    res.json({ message: 'Professor account approved successfully', userId: updatedUser.id });
  } catch (error) {
    console.error('Error approving professor:', error);
    res.status(500).json({ error: 'Failed to approve professor account' });
  }
});

// Reject (delete) a professor account request
router.post('/reject-professor/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role !== 'professor' || user.isApproved) {
      return res.status(400).json({ error: 'Cannot reject an already approved user or non-professor account' });
    }

    await prisma.user.delete({
      where: { id },
    });

    res.json({ message: 'Professor request rejected and user deleted successfully', userId: id });
  } catch (error) {
    console.error('Error rejecting professor:', error);
    res.status(500).json({ error: 'Failed to reject professor account request' });
  }
});

// Get all registered members (students & professors) with optional search
router.get('/members', async (req, res) => {
  try {
    const { search, role } = req.query;

    const where = {
      role: { in: ['student', 'professor'] },
    };

    if (role && ['student', 'professor'].includes(role)) {
      where.role = role;
    }

    if (search && String(search).trim()) {
      const query = String(search).trim();
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { rollNumber: { contains: query, mode: 'insensitive' } },
      ];
    }

    const members = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        role: true,
        rollNumber: true,
        isApproved: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(members);
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

export default router;
