const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { sql } = require('../../db');
const { requireAuth } = require('../middleware/auth');
const { getAdminPasswordHash, setAdminPasswordHash } = require('../services/cache');

router.post('/login', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  try {
    let hash = getAdminPasswordHash();
    if (!hash) {
      const adminRes = await sql.query('SELECT admin_password FROM admin_settings WHERE id = 1');
      if (adminRes.length > 0) {
        hash = adminRes[0].admin_password;
        setAdminPasswordHash(hash);
      }
    }

    if (!hash) {
      return res.status(500).json({ error: 'Admin settings not initialized' });
    }

    const match = await bcrypt.compare(password, hash);
    if (!match) return res.status(401).json({ error: 'Invalid password' });

    // Generate a simple session token
    const token = crypto.randomBytes(32).toString('hex');
    process.env.ADMIN_SESSION_TOKEN = token;
    res.json({ token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Both passwords required' });
  }

  try {
    const hash = getAdminPasswordHash();
    const match = await bcrypt.compare(current_password, hash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(new_password, 10);
    await sql.query('UPDATE admin_settings SET admin_password = $1 WHERE id = 1', [newHash]);
    setAdminPasswordHash(newHash);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Server error changing password' });
  }
});

router.get('/verify', requireAuth, (req, res) => {
  res.json({ valid: true });
});

module.exports = router;
