import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Server cannot start.');
  process.exit(1);
}

// Register User
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role, username } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'All fields (email, password, name, role) are required' });
    }

    // Validate role - only student and professor allowed via registration
    const allowedRoles = ['student', 'professor'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Only student and professor accounts can be registered.' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Validate name length
    if (name.length > 100) {
      return res.status(400).json({ error: 'Name must be 100 characters or less' });
    }

    // Validate username
    if (username) {
      const usernameStr = String(username).trim();
      if (usernameStr.length < 3 || usernameStr.length > 30) {
        return res.status(400).json({ error: 'Username must be between 3 and 30 characters' });
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(usernameStr)) {
        return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, and hyphens' });
      }
      const existingUsername = await prisma.user.findUnique({
        where: { username: usernameStr },
      });
      if (existingUsername) {
        return res.status(400).json({ error: 'Username is already taken' });
      }
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Determine approval status
    // Professors are unapproved by default; students are approved
    const isApproved = role !== 'professor';

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
        username: username ? String(username).trim() : null,
        isApproved,
      },
    });

    res.status(201).json({
      message: isApproved 
        ? 'Registration successful! You can now log in.' 
        : 'Registration submitted successfully! Professor accounts require administrator approval before logging in.',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        role: user.role,
        isApproved: user.isApproved,
      },
    });
  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// Login User
router.post('/login', async (req, res) => {
  try {
    const { email, password, portalRole } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Block unapproved professors
    if (user.role === 'professor' && !user.isApproved) {
      return res.status(403).json({ 
        error: 'Your professor account is currently pending administrator approval. Please wait for an admin to approve your request.' 
      });
    }

    // Validate portal role — user must log in through the correct portal
    if (portalRole && user.role !== portalRole) {
      const portalNames = {
        student: 'Student Portal',
        professor: 'Professor Portal',
        admin: 'Admin Portal',
      };
      const userPortal = portalNames[user.role] || user.role;
      return res.status(403).json({
        error: 'This account is registered as a ' + user.role + '. Please use the ' + userPortal + ' to sign in.',
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Get Current User Profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        role: true,
        isApproved: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({ error: 'Internal server error fetching profile' });
  }
});

// Update Profile (name, username)
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, username } = req.body;

    if (!name && !username) {
      return res.status(400).json({ error: 'At least one field (name or username) must be provided' });
    }

    const updateData = {};

    if (name) {
      if (name.length > 100) {
        return res.status(400).json({ error: 'Name must be 100 characters or less' });
      }
      updateData.name = name.trim();
    }

    if (username !== undefined) {
      const usernameStr = String(username).trim();
      if (!usernameStr) {
        return res.status(400).json({ error: 'Username cannot be empty' });
      }
      if (usernameStr.length < 3 || usernameStr.length > 30) {
        return res.status(400).json({ error: 'Username must be between 3 and 30 characters' });
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(usernameStr)) {
        return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, and hyphens' });
      }

      // Check uniqueness excluding current user
      const existing = await prisma.user.findUnique({ where: { username: usernameStr } });
      if (existing && existing.id !== req.user.id) {
        return res.status(400).json({ error: 'Username is already taken' });
      }
      updateData.username = usernameStr;
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        role: true,
      },
    });

    // Issue new JWT with updated data
    const token = jwt.sign(
      { id: updated.id, email: updated.email, role: updated.role, name: updated.name, username: updated.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ message: 'Profile updated successfully', user: updated, token });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change Password
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Forgot Password - Generate reset token
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If an account with that email exists, a reset token has been generated.' });
    }

    // Generate a 6-digit numeric token
    const resetToken = crypto.randomInt(100000, 999999).toString();
    const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpiry },
    });

    // In production, send via email. For demo, return in response.
    // NOTE: _debug_token is only included in development mode
    const response = {
      message: 'If an account with that email exists, a reset token has been generated.',
    };
    if (process.env.NODE_ENV !== 'production') {
      response._debug_token = resetToken;
    }
    res.json(response);
  } catch (error) {
    console.error('Error in forgot-password:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset Password - Verify token and set new password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      return res.status(400).json({ error: 'Email, token, and new password are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Validate token format (6 digits)
    if (!/^\d{6}$/.test(token)) {
      return res.status(400).json({ error: 'Invalid token format' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.resetToken || !user.resetTokenExpiry) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (user.resetToken !== token) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (new Date() > user.resetTokenExpiry) {
      return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
    }

    // Hash new password and clear token
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    res.json({ message: 'Password reset successful! You can now log in with your new password.' });
  } catch (error) {
    console.error('Error in reset-password:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
