import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import prisma from '../lib/prisma.js';
import { authMiddleware, professorMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Resolve paths for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Allowed file types for upload
const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'zip', 'rar', 'md', 'ipynb']);
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/zip',
  'application/x-rar-compressed',
  'text/markdown',
  'application/x-ipynb+json',
]);

// Multer Storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Use crypto for unique, secure filenames
    const uniqueSuffix = crypto.randomUUID();
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

// File filter to validate types
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  if (ALLOWED_EXTENSIONS.has(ext) || ALLOWED_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed. Allowed types: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// Fetch all materials
router.get('/', async (req, res) => {
  try {
    const materials = await prisma.studyMaterial.findMany({
      orderBy: {
        timestamp: 'desc',
      },
      take: 50, // Limit to prevent abuse
    });
    res.json(materials);
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).json({ error: 'Failed to fetch materials' });
  }
});

// Upload a material resource (secured - professors and admins only)
router.post('/upload', authMiddleware, professorMiddleware, upload.single('file'), async (req, res) => {
  try {
    const { title, course } = req.body;
    const file = req.file;

    if (!title || !course) {
      // Clean up uploaded file if data is missing
      if (file) fs.unlinkSync(file.path);
      return res.status(400).json({ error: 'Title and course code are required' });
    }

    // Validate input lengths
    if (title.length > 200) {
      if (file) fs.unlinkSync(file.path);
      return res.status(400).json({ error: 'Title must be 200 characters or less' });
    }
    if (course.length > 50) {
      if (file) fs.unlinkSync(file.path);
      return res.status(400).json({ error: 'Course code must be 50 characters or less' });
    }

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Helper to format file size
    const formatBytes = (bytes: number, decimals = 1) => {
      if (!+bytes) return '0 Bytes';
      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    };

    const fileType = path.extname(file.originalname).toLowerCase().replace('.', '') || 'pdf';
    const fileSizeStr = formatBytes(file.size);

    const material = await prisma.studyMaterial.create({
      data: {
        title,
        course,
        type: fileType,
        size: fileSizeStr,
        author: req.user.name,
        authorId: req.user.id,
        fileName: file.filename,
      },
    });

    res.status(201).json(material);
  } catch (error) {
    console.error('Error uploading material:', error);
    // Clean up file on error
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    res.status(500).json({ error: 'Failed to upload material' });
  }
});

// Download a physical material file
router.get('/download/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid material ID format' });
    }

    const material = await prisma.studyMaterial.findUnique({
      where: { id },
    });

    if (!material) {
      return res.status(404).json({ error: 'Material resource not found' });
    }

    const filePath = path.join(uploadsDir, material.fileName);

    // Prevent path traversal
    const resolvedPath = path.resolve(filePath);
    const resolvedUploadsDir = path.resolve(uploadsDir);
    if (!resolvedPath.startsWith(resolvedUploadsDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Physical file not found on disk' });
    }

    // Dynamic clean filename download
    const cleanExtension = material.type.replace(/[^a-zA-Z0-9]/g, '');
    const cleanTitle = material.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);
    const downloadName = `${cleanTitle}.${cleanExtension}`;

    res.download(filePath, downloadName);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Delete material (professors and admins only)
router.delete('/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'professor' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Professor or admin privileges required' });
  }
  try {
    const { id } = req.params;
    const existing = await prisma.studyMaterial.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Material not found' });
    }
    // Delete physical file from disk
    const filePath = path.join(uploadsDir, existing.fileName);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (fileErr) {
      console.warn('Could not delete physical file:', fileErr);
    }
    await prisma.studyMaterial.delete({ where: { id } });
    res.json({ message: 'Material deleted successfully', id });
  } catch (error) {
    console.error('Error deleting material:', error);
    res.status(500).json({ error: 'Failed to delete material' });
  }
});

export default router;
