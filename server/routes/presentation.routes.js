const express = require('express');
const router = express.Router();
const { sql } = require('../../db');
const { requireAuth } = require('../middleware/auth');
const { getPresentationState, setPresentationState } = require('../services/cache');

// GET /api/presentation/state
router.get('/state', async (req, res) => {
  const cached = getPresentationState();
  if (cached) return res.json(cached);

  try {
    const stateResult = await sql.query('SELECT * FROM presentation_state WHERE id = 1');
    if (stateResult.length === 0) return res.status(404).json({ error: 'Presentation state not found' });
    
    const state = stateResult[0];
    if (state.current_question_id) {
      const qRes = await sql.query('SELECT * FROM questions WHERE id = $1', [state.current_question_id]);
      state.question = qRes[0] || null;
    } else {
      state.question = null;
    }

    setPresentationState(state);
    res.json(state);
  } catch (err) {
    console.error('Error fetching presentation state:', err);
    res.status(500).json({ error: 'Server error fetching state' });
  }
});

// POST /api/presentation/state
router.post('/state', requireAuth, async (req, res) => {
  const allowedFields = [
    'current_question_id', 'active_screen', 'show_question', 'show_options',
    'reveal_answer', 'audio_status', 'active_level', 'timer_running',
    'timer_remaining', 'active_session_id', 'active_contestant_id',
    'active_lifeline', 'show_timer', 'show_scoreboard', 'show_explanation',
    'game_mode',
    'cast_sync_mode', 'cast_screen', 'cast_scene', 'cast_blackout',
    'stage_blackout', 'stage_dock_visible', 'cast_ticker_text',
    'cast_ticker_visible', 'cast_watermark_visible', 'cast_sound_enabled'
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
      `UPDATE presentation_state SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    const state = result[0];

    if (state.current_question_id) {
      const qRes = await sql.query('SELECT * FROM questions WHERE id = $1', [state.current_question_id]);
      state.question = qRes[0] || null;
    } else {
      state.question = null;
    }

    setPresentationState(state);

    // Broadcast to sockets
    const io = req.app.get('io');
    if (io) {
      io.to('presentation').emit('state:sync', state);
      io.to('cast').emit('state:sync', state);
      io.to('admin').emit('state:sync', state);
    }

    res.json(state);
  } catch (err) {
    console.error('Error updating presentation state:', err);
    res.status(500).json({ error: 'Server error updating state' });
  }
});

module.exports = router;
