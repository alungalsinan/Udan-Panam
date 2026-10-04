const express = require('express');
const router = express.Router();
const { sql } = require('../../db');
const { requireAuth } = require('../middleware/auth');
const { getStudioSettings, setStudioSettings } = require('../services/cache');

// GET /api/studio
router.get('/', async (req, res) => {
  const cached = getStudioSettings();
  if (cached) return res.json(cached);

  try {
    const result = await sql.query('SELECT * FROM studio_settings WHERE id = 1');
    const settings = result[0] || null;
    setStudioSettings(settings);
    res.json(settings);
  } catch (err) {
    console.error('Error fetching studio settings:', err);
    res.status(500).json({ error: 'Server error fetching studio settings' });
  }
});

// POST /api/studio
router.post('/', requireAuth, async (req, res) => {
  const allowedFields = [
    'welcome_title', 'welcome_subtitle', 'theme_primary', 'theme_secondary',
    'bg_dark', 'bg_card', 'font_family', 'animation_enabled', 'logo_url',
    'bg_image_url', 'bg_video_url', 'transition_style', 'option_reveal_style',
    'correct_sound_url', 'wrong_sound_url', 'timer_sound_url', 'bg_music_url',
    'theme_preset', 'ui_language'
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
      `UPDATE studio_settings SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    const updated = result[0];
    setStudioSettings(updated);

    // Broadcast studio update to all screens
    const io = req.app.get('io');
    if (io) {
      io.to('presentation').emit('studio:sync', updated);
      io.to('admin').emit('studio:sync', updated);
    }

    res.json(updated);
  } catch (err) {
    console.error('Error updating studio settings:', err);
    res.status(500).json({ error: 'Server error updating studio settings' });
  }
});

module.exports = router;
