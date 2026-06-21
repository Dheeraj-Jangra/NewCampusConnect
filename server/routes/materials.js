import express from 'express';
import multer from 'multer';
import prisma from '../lib/prisma.js';
import { authMiddleware, professorMiddleware } from '../middleware/auth.js';
import { uploadFile, getSignedDownloadUrl, getSignedPreviewUrl, deleteFile, fileExists } from '../lib/storage.js';

const router = express.Router();

// Multer memory storage (files go to buffer, then to R2)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Fetch all materials
router.get('/', async (req, res) => {
  try {
    const materials = await prisma.studyMaterial.findMany({
      orderBy: { timestamp: 'desc' },
      take: 50,
    });
    res.json(materials);
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).json({ error: 'Failed to fetch materials' });
  }
});

// Upload a material resource (professors and admins only)
router.post('/upload', authMiddleware, professorMiddleware, upload.single('file'), async (req, res) => {
  try {
    const { title, course } = req.body;
    const file = req.file;

    if (!title || !course) {
      return res.status(400).json({ error: 'Title and course code are required' });
    }
    if (title.length > 200) {
      return res.status(400).json({ error: 'Title must be 200 characters or less' });
    }
    if (course.length > 50) {
      return res.status(400).json({ error: 'Course code must be 50 characters or less' });
    }
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Upload to R2
    const { key, size, type, url } = await uploadFile(file);

    const material = await prisma.studyMaterial.create({
      data: {
        title,
        course,
        type,
        size,
        author: req.user.name,
        authorId: req.user.id,
        fileName: key, // Store R2 key instead of local filename
      },
    });

    res.status(201).json(material);
  } catch (error) {
    console.error('Error uploading material:', error);
    res.status(500).json({ error: error.message || 'Failed to upload material' });
  }
});

// Download a material file (returns signed URL)
router.get('/download/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid material ID format' });
    }

    const material = await prisma.studyMaterial.findUnique({ where: { id } });
    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    // Check file exists in R2
    const exists = await fileExists(material.fileName);
    if (!exists) {
      return res.status(404).json({ error: 'File not found in storage' });
    }

    // Generate download filename
    const cleanExtension = material.type.replace(/[^a-zA-Z0-9]/g, '');
    const cleanTitle = material.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);
    const downloadName = `${cleanTitle}.${cleanExtension}`;

    const signedUrl = await getSignedDownloadUrl(material.fileName, downloadName);
    res.json({ url: signedUrl, filename: downloadName });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

// Preview a material file inline (returns signed URL)
router.get('/preview/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid material ID format' });
    }

    const material = await prisma.studyMaterial.findUnique({ where: { id } });
    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const exists = await fileExists(material.fileName);
    if (!exists) {
      return res.status(404).json({ error: 'File not found in storage' });
    }

    const previewName = `${material.title.replace(/[^a-zA-Z0-9._-]/g, '_')}.${material.type}`;
    const signedUrl = await getSignedPreviewUrl(material.fileName, previewName, material.type);
    res.json({ url: signedUrl, type: material.type });
  } catch (error) {
    console.error('Error generating preview URL:', error);
    res.status(500).json({ error: 'Failed to generate preview URL' });
  }
});

// Delete material — admin: any, professor: own only
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
    if (req.user.role === 'professor' && existing.authorId !== req.user.id) {
      return res.status(403).json({ error: 'Professors can only delete materials they uploaded' });
    }

    // Delete from R2
    try {
      await deleteFile(existing.fileName);
    } catch (fileErr) {
      console.warn('Could not delete file from R2:', fileErr);
    }

    await prisma.studyMaterial.delete({ where: { id } });
    res.json({ message: 'Material deleted successfully', id });
  } catch (error) {
    console.error('Error deleting material:', error);
    res.status(500).json({ error: 'Failed to delete material' });
  }
});

export default router;
