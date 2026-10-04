const express = require('express');
const router = express.Router();
const { sql } = require('../../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/sessions
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await sql.query('SELECT * FROM game_sessions ORDER BY created_at DESC');
    res.json(result);
  } catch (err) {
    console.error('Error fetching sessions:', err);
    res.status(500).json({ error: 'Server error fetching sessions' });
  }
});

// POST /api/sessions
router.post('/', requireAuth, async (req, res) => {
  const { name, total_rounds, timer_duration, scoring_mode, game_mode, notes } = req.body;
  try {
    const result = await sql.query(
      'INSERT INTO game_sessions (name, total_rounds, timer_duration, scoring_mode, game_mode, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name || 'New Game', total_rounds || 1, timer_duration || 30, scoring_mode || 'fixed', game_mode || 'single', notes || null]
    );
    res.status(201).json(result[0]);
  } catch (err) {
    console.error('Error creating session:', err);
    res.status(500).json({ error: 'Server error creating session' });
  }
});

// PUT /api/sessions/:id
router.put('/:id', requireAuth, async (req, res) => {
  const { status, current_round, name, notes } = req.body;
  try {
    const fields = [];
    const values = [];
    let idx = 1;

    if (status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(status);
      if (status === 'completed') {
        fields.push(`completed_at = NOW()`);
      }
    }
    if (current_round !== undefined) {
      fields.push(`current_round = $${idx++}`);
      values.push(current_round);
    }
    if (name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(name);
    }
    if (notes !== undefined) {
      fields.push(`notes = $${idx++}`);
      values.push(notes);
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);
    const result = await sql.query(
      `UPDATE game_sessions SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.length === 0) return res.status(404).json({ error: 'Session not found' });
    res.json(result[0]);
  } catch (err) {
    console.error('Error updating session:', err);
    res.status(500).json({ error: 'Server error updating session' });
  }
});

// DELETE /api/sessions/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await sql.query('DELETE FROM game_sessions WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.length === 0) return res.status(404).json({ error: 'Session not found' });
    res.json({ message: 'Session deleted' });
  } catch (err) {
    console.error('Error deleting session:', err);
    res.status(500).json({ error: 'Server error deleting session' });
  }
});

module.exports = router;
