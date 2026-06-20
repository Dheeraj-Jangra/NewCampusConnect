import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

// Import routes
import noticesRouter from './routes/notices.js';
import classesRouter from './routes/classes.js';
import materialsRouter from './routes/materials.js';
import chatRouter from './routes/chat.js';
import prisma from './lib/prisma.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Resolve __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploads as static resources
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/notices', noticesRouter);
app.use('/api/classes', classesRouter);
app.use('/api/materials', materialsRouter);
app.use('/api/chat', chatRouter);

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Socket.io integration
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Allow all in local development
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
    const { channel, sender, role, avatarBg, content, time } = msgData;

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
        },
      });

      // Broadcast message to everyone in the channel (including sender to acknowledge database write)
      io.to(channel).emit('new-message', savedMsg);
    } catch (err) {
      console.error('Error saving chat message to database:', err);
    }
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

    const msgCount = await prisma.chatMessage.count();
    if (msgCount === 0) {
      console.log('Seeding default chat messages...');
      await prisma.chatMessage.createMany({
        data: [
          { channel: "general", sender: "Alex Mercer", role: "student", avatarBg: "bg-timeline-read", content: "Hey everyone! Has anyone checked the exam schedule posted on the notice board?", time: "2:10 PM" },
          { channel: "general", sender: "Sarah Jenkins", role: "student", avatarBg: "bg-timeline-thinking", content: "Yes! Library timing extension starting next week is an absolute life-saver.", time: "2:12 PM" },
          { channel: "general", sender: "Prof. Evelyn Vance", role: "faculty", avatarBg: "bg-timeline-edit", content: "Make sure you clear your dues first, Sarah. Good luck with exam preparations!", time: "2:15 PM" },
          { channel: "q-and-a", sender: "Nikhil Sharma", role: "student", avatarBg: "bg-timeline-grep", content: "Hello Prof. Vance, will the Machine Learning final include the backpropagation derivation question?", time: "11:05 AM" },
          { channel: "q-and-a", sender: "Prof. Evelyn Vance", role: "faculty", avatarBg: "bg-timeline-edit", content: "Yes Nikhil, understanding the math behind backpropagation is crucial. Expect at least one theoretical derivation.", time: "11:20 AM" }
        ]
      });
    }
  } catch (err) {
    console.error('Error seeding database:', err);
  }
}

// Start Server
httpServer.listen(port, async () => {
  console.log(`Server is running on port ${port}`);
  await seedDatabaseIfEmpty();
});
