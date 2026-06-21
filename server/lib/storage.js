import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import path from 'path';

const R2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = process.env.R2_PUBLIC_URL; // Custom domain or r2.dev public URL

// Allowed file types
const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'zip', 'rar', 'md', 'ipynb', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']);
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
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

// MIME type map for previews
const MIME_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
  mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', flac: 'audio/flac',
  txt: 'text/plain', md: 'text/markdown',
};

function validateFile(file) {
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  if (!ALLOWED_EXTENSIONS.has(ext) && !ALLOWED_MIMES.has(file.mimetype)) {
    throw new Error(`File type not allowed. Allowed types: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`);
  }
  if (file.size > 50 * 1024 * 1024) {
    throw new Error('File size exceeds 50MB limit');
  }
  return ext;
}

function generateStorageKey(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const uniqueId = crypto.randomUUID();
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `materials/${date}/${uniqueId}${ext}`;
}

function formatBytes(bytes, decimals = 1) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

async function uploadFile(file) {
  const ext = validateFile(file);
  const key = generateStorageKey(file.originalname);

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
    ContentDisposition: `inline; filename="${encodeURIComponent(file.originalname)}"`,
  });

  await R2.send(command);

  return {
    key,
    size: formatBytes(file.size),
    type: ext,
    url: `${PUBLIC_URL}/${key}`,
  };
}

async function getSignedDownloadUrl(key, filename) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
  });
  return getSignedUrl(R2, command, { expiresIn: 3600 });
}

async function getSignedPreviewUrl(key, filename, ext) {
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentType: contentType,
    ResponseContentDisposition: `inline; filename="${encodeURIComponent(filename)}"`,
  });
  return getSignedUrl(R2, command, { expiresIn: 3600 });
}

async function deleteFile(key) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  await R2.send(command);
}

async function fileExists(key) {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });
    await R2.send(command);
    return true;
  } catch {
    return false;
  }
}

export { uploadFile, getSignedDownloadUrl, getSignedPreviewUrl, deleteFile, fileExists, PUBLIC_URL };
