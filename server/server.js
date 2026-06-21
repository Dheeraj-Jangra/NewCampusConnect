import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

// Import routes
import noticesRouter from './routes/notices.js';
import classesRouter from './routes/classes.js';
import materialsRouter from './routes/materials.js';
import chatRouter from './routes/chat.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import searchRouter from './routes/search.js';
import channelsRouter, { seedDefaultChannels } from './routes/channels.js';
import dmRouter from './routes/dm.js';
import prisma from './lib/prisma.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Resolve __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:4321')
  .split(',')
  .map(s => s.trim().replace(/\/+$/, '')); // strip trailing slashes

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin || allowedOrigins.some(o => origin === o)) {
      callback(null, true);
    } else {
      console.error(`CORS blocked: origin=${origin}, allowed=${JSON.stringify(allowedOrigins)}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Serve uploads as static resources
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/notices', noticesRouter);
app.use('/api/classes', classesRouter);
app.use('/api/materials', materialsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/channels', channelsRouter);
app.use('/api/dm', dmRouter);
app.use('/api/search', searchRouter);

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Socket.io integration
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.some(o => origin === o)) {
        callback(null, true);
      } else {
        callback(new Error(`Socket.IO CORS blocked: ${origin}`));
      }
    },
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Join a specific discussion channel room
  socket.on('join-channel', (channel) => {
    socket.join(channel);
    console.log(`Socket ${socket.id} joined channel: ${channel}`);
  });

  // Handle incoming real-time messages
  socket.on('send-message', async (msgData) => {
    const { channel, sender, role, avatarBg, content, time, senderId } = msgData;

    try {
      // Check channel post restriction
      const channelRecord = await prisma.chatChannel.findFirst({ where: { label: channel } });
      if (channelRecord && channelRecord.postRestriction !== 'all') {
        const normalizedRole = role === 'professor' ? 'faculty' : role;
        const normalizedRestriction = channelRecord.postRestriction;
        if (normalizedRestriction === 'faculty' && normalizedRole !== 'faculty' && normalizedRole !== 'admin') {
          return; // Silently reject — student cannot post here
        }
        if (normalizedRestriction === 'admin' && normalizedRole !== 'admin') {
          return; // Silently reject — only admins can post here
        }
      }

      const savedMsg = await prisma.chatMessage.create({
        data: {
          channel,
          sender,
          role,
          avatarBg,
          content,
          time,
          senderId: senderId || null,
        },
      });

      io.to(channel).emit('new-message', savedMsg);
    } catch (err) {
      console.error('Error saving chat message to database:', err);
    }
  });

  // Handle message deletion broadcast
  socket.on('delete-message', async (data) => {
    const { id, channel } = data;
    // Broadcast deletion to everyone in the channel
    io.to(channel).emit('message-deleted', { id, channel });
  });

  // Handle typing indicator sync
  socket.on('typing', (typingData) => {
    const { channel, username, isTyping } = typingData;
    // Broadcast typing event to everyone in the room except the sender
    socket.to(channel).emit('user-typing', { username, isTyping });
  });

  // Handle DM events
  socket.on('join-dm', (dmRoom) => {
    socket.join(dmRoom);
  });

  socket.on('send-dm', async (dmData) => {
    const { senderId, receiverId, content, senderName, senderRole } = dmData;
    try {
      const savedMsg = await prisma.directMessage.create({
        data: { senderId, receiverId, content },
      });

      // Emit to both sender and receiver rooms
      const dmRoom = [senderId, receiverId].sort().join('-');
      io.to(dmRoom).emit('new-dm', {
        ...savedMsg,
        senderName,
        senderRole,
      });
    } catch (err) {
      console.error('Error saving DM:', err);
    }
  });

  socket.on('delete-dm', async (data) => {
    const { messageId, senderId, receiverId, scope } = data;
    try {
      if (scope === 'all') {
        const dmRoom = [senderId, receiverId].sort().join('-');
        io.to(dmRoom).emit('dm-deleted', { messageId, scope: 'all' });
      }
    } catch (err) {
      console.error('Error in delete-dm:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// Seed admin user
async function seedAdminUser() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@campusconnect.edu';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123ChangeMe!';
    
    const adminUser = await prisma.user.findUnique({
      where: { email: adminEmail }
    });

    if (!adminUser) {
      console.log('Seeding default administrator account...');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(adminPassword, salt);
      
      await prisma.user.create({
        data: {
          email: adminEmail,
          password: hashedPassword,
          name: 'Administrator',
          role: 'admin',
          isApproved: true
        }
      });
      console.log(`Admin account seeded: ${adminEmail}`);
      if (adminPassword === 'admin123ChangeMe!') {
        console.warn('WARNING: Using default admin password. Set ADMIN_PASSWORD environment variable in production!');
      }
    }
  } catch (err) {
    console.error('Error seeding admin user:', err);
  }
}

// Start Server
httpServer.listen(port, async () => {
  console.log(`Server is running on port ${port}`);
  await seedAdminUser();
  await seedDefaultChannels();
});
