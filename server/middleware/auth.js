const path = require('path');
const rateLimit = require('express-rate-limit');

// Rate limit API endpoints
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  message: { error: 'Too many requests, please try again later.' }
});

// Authentication middleware using session token
function requireAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_SESSION_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing admin session token' });
  }
  next();
}

// Protect internal project and database files from static serving
function protectStaticFiles(req, res, next) {
  const sensitiveFiles = [
    '.env', 'server.js', 'init-db.js', 'db.js',
    'package.json', 'package-lock.json', 'vercel.json',
    '.git', '.gitignore'
  ];
  const baseName = path.basename(req.path);
  
  if (sensitiveFiles.includes(baseName) || req.path.startsWith('/data') || req.path.startsWith('/server')) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
}

module.exports = {
  requireAuth,
  apiLimiter,
  protectStaticFiles
};
