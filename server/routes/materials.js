import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Resolve paths for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Save with unique name to prevent collisions
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// Fetch all materials
router.get('/', async (req, res) => {
  try {
    const materials = await prisma.studyMaterial.findMany({
      orderBy: {
        timestamp: 'desc',
      },
    });
    res.json(materials);
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).json({ error: 'Failed to fetch materials' });
  }
});

// Upload a material resource
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { title, course, author } = req.body;
    const file = req.file;

    if (!title || !course) {
      // Clean up uploaded file if data is missing
      if (file) fs.unlinkSync(file.path);
      return res.status(400).json({ error: 'Title and course code are required' });
    }

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Helper to format file size
    const formatBytes = (bytes, decimals = 1) => {
      if (!+bytes) return '0 Bytes';
      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    };

    const fileType = file.originalname.split('.').pop() || 'pdf';
    const fileSizeStr = formatBytes(file.size);

    const material = await prisma.studyMaterial.create({
      data: {
        title,
        course,
        type: fileType,
        size: fileSizeStr,
        author: author || 'Prof. Evelyn Vance',
        fileName: file.filename,
      },
    });

    res.status(201).json(material);
  } catch (error) {
    console.error('Error uploading material:', error);
    res.status(500).json({ error: 'Failed to upload material' });
  }
});

// Download a physical material file
router.get('/download/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const material = await prisma.studyMaterial.findUnique({
      where: { id },
    });

    if (!material) {
      return res.status(404).json({ error: 'Material resource not found' });
    }

    const filePath = path.join(uploadsDir, material.fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Physical file not found on disk' });
    }

    // Dynamic clean filename download
    const cleanExtension = material.type;
    const cleanTitle = material.title.replace(/[^a-zA-Z0-9]/g, '_');
    const downloadName = `${cleanTitle}.${cleanExtension}`;

    res.download(filePath, downloadName);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

export default router;
