const express = require('express');
const router = express.Router();
const { sql } = require('../../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/admin-settings
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await sql.query('SELECT default_timer_duration, default_scoring_mode, default_game_mode FROM admin_settings WHERE id = 1');
    res.json(result[0] || {});
  } catch (err) {
    console.error('Error fetching admin settings:', err);
    res.status(500).json({ error: 'Server error fetching admin settings' });
  }
});

// POST /api/admin-settings
router.post('/', requireAuth, async (req, res) => {
  const { default_timer_duration, default_scoring_mode, default_game_mode } = req.body;
  try {
    const result = await sql.query(
      'UPDATE admin_settings SET default_timer_duration = COALESCE($1, default_timer_duration), default_scoring_mode = COALESCE($2, default_scoring_mode), default_game_mode = COALESCE($3, default_game_mode) WHERE id = 1 RETURNING default_timer_duration, default_scoring_mode, default_game_mode',
      [default_timer_duration, default_scoring_mode, default_game_mode]
    );
    res.json(result[0]);
  } catch (err) {
    console.error('Error updating admin settings:', err);
    res.status(500).json({ error: 'Server error updating admin settings' });
  }
});

// GET /api/backup - Export full database snapshot
router.get('/backup', requireAuth, async (req, res) => {
  try {
    const [questions, sessions, contestants, answers, sounds, studio, pState, admin] = await Promise.all([
      sql.query('SELECT * FROM questions ORDER BY id'),
      sql.query('SELECT * FROM game_sessions ORDER BY id'),
      sql.query('SELECT * FROM contestants ORDER BY id'),
      sql.query('SELECT * FROM answer_log ORDER BY id'),
      sql.query('SELECT * FROM sound_effects ORDER BY id'),
      sql.query('SELECT * FROM studio_settings WHERE id = 1'),
      sql.query('SELECT * FROM presentation_state WHERE id = 1'),
      sql.query('SELECT default_timer_duration, default_scoring_mode, default_game_mode FROM admin_settings WHERE id = 1')
    ]);
    res.json({
      version: '2.0.0',
      exported_at: new Date().toISOString(),
      data: {
        questions,
        game_sessions: sessions,
        contestants,
        answer_log: answers,
        sound_effects: sounds,
        studio_settings: studio[0] || null,
        presentation_state: pState[0] || null,
        admin_settings: admin[0] || null
      }
    });
  } catch (err) {
    console.error('Error creating backup:', err);
    res.status(500).json({ error: 'Server error creating backup' });
  }
});

module.exports = router;
