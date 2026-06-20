import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set.');
  process.exit(1);
}

// General Auth Middleware - verify JWT token
export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('JWT verify error:', err);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Admin Only Middleware
export const adminMiddleware = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Administrator privileges required' });
  }
  next();
};

// Approved Professor Middleware
export const professorMiddleware = (req, res, next) => {
  if (!req.user || req.user.role !== 'professor') {
    return res.status(403).json({ error: 'Access denied: Professor privileges required' });
  }
  // isApproved status should be fetched or validated
  next();
};
