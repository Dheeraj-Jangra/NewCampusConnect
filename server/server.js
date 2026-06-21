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
  .map(s => s.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
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
app.use('/api/search', searchRouter);

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Socket.io integration
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
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
      // Save message to database via Prisma
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

      // Broadcast message to everyone in the channel (including sender to acknowledge database write)
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

// Seed data function to prepopulate database if completely empty
async function seedDatabaseIfEmpty() {
  try {
    const noticeCount = await prisma.notice.count();
    if (noticeCount === 0) {
      console.log('Seeding default notices...');
      await prisma.notice.createMany({
        data: [
          {
            title: "End-Semester Examinations Schedule - Fall 2026",
            category: "exam",
            author: "Prof. Evelyn Vance",
            content: "The end-semester exam schedule has been updated. Examinations will begin on July 5, 2026. Please check your student portal for your personalized exam seating arrangement and hall tickets. Ensure that you clear all library dues by next Friday."
          },
          {
            title: "Annual Hackathon 'CodeShift 2026' Registrations Open",
            category: "event",
            author: "Dept. of Computer Science",
            content: "Get ready to solve real-world problems! CodeShift 2026 registrations are open until June 25. Prize pools exceed $10,000, and internships are up for grabs. Teams must consist of 3-4 students."
          },
          {
            title: "Mandatory Academic Advisory Meetings",
            category: "academic",
            author: "Office of the Dean",
            content: "All sophomore and junior students must schedule an academic advising session with their respective supervisors before selecting elective modules for the upcoming Spring semester."
          }
        ]
      });
    }

    const classCount = await prisma.class.count();
    if (classCount === 0) {
      console.log('Seeding default classes...');
      const d = new Date();
      
      const getFormattedTime = (offsetMins) => {
        const date = new Date(d.getTime() + offsetMins * 60 * 1000);
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      };

      await prisma.class.createMany({
        data: [
          {
            subject: "Interactive UI & Web Aesthetics",
            professor: "Prof. Evelyn Vance",
            time: getFormattedTime(12),
            duration: "90",
            room: "Aero-Lab 402 / Meet",
            link: "https://meet.google.com/vui-aest-hub"
          },
          {
            subject: "Discrete Mathematics & Graph Structures",
            professor: "Dr. Arthur Pendelton",
            time: getFormattedTime(95),
            duration: "60",
            room: "Seminar Block B",
            link: ""
          },
          {
            subject: "Introductory Machine Learning & NLP",
            professor: "Prof. Evelyn Vance",
            time: getFormattedTime(-50),
            duration: "60",
            room: "CSE Lab 3",
            link: "https://meet.google.com/ml-nlp-lecture"
          }
        ]
      });
    }

    // Chat messages are not seeded — they are created live by users through the chat UI.
  } catch (err) {
    console.error('Error seeding database:', err);
  }
}

// Start Server
httpServer.listen(port, async () => {
  console.log(`Server is running on port ${port}`);
  await seedAdminUser();
  await seedDatabaseIfEmpty();
});
