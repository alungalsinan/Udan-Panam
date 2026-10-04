const express = require('express');
const router = express.Router();
const { sql } = require('../../db');
const { requireAuth } = require('../middleware/auth');
const { getPromoSettings, setPromoSettings } = require('../services/cache');

// GET /api/promo
router.get('/', async (req, res) => {
  const cached = getPromoSettings();
  if (cached) return res.json(cached);

  try {
    const result = await sql.query('SELECT * FROM promo_settings WHERE id = 1');
    const settings = result[0] || null;
    setPromoSettings(settings);
    res.json(settings);
  } catch (err) {
    console.error('Error fetching promo settings:', err);
    res.status(500).json({ error: 'Server error fetching promo settings' });
  }
});

// POST /api/promo
router.post('/', requireAuth, async (req, res) => {
  const allowedFields = [
    'eyebrow_badge', 'producer_tag', 'tagline', 'hashtag',
    'card1_tag', 'card1_title', 'card1_desc',
    'card2_tag', 'card2_title', 'card2_desc',
    'card3_tag', 'card3_chairman', 'card3_convenor', 'card3_desc',
    'card4_tag', 'card4_title', 'card4_desc',
    'reel_speed', 'reel_auto_loop', 'sound_enabled', 'active_scene'
  ];

  try {
    const fields = [];
    const values = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        fields.push(`${field} = $${idx++}`);
        values.push(req.body[field]);
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(1);
    const result = await sql.query(
      `UPDATE promo_settings SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    const updated = result[0];
    setPromoSettings(updated);

    // Broadcast promo update to all screens & cast clients
    const io = req.app.get('io');
    if (io) {
      io.to('presentation').emit('promo:sync', updated);
      io.to('cast').emit('promo:sync', updated);
      io.to('admin').emit('promo:sync', updated);
    }

    res.json(updated);
  } catch (err) {
    console.error('Error updating promo settings:', err);
    res.status(500).json({ error: 'Server error updating promo settings' });
  }
});

module.exports = router;
