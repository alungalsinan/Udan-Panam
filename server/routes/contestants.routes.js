const express = require('express');
const router = express.Router();
const { sql } = require('../../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/contestants
router.get('/', async (req, res) => {
  const { session_id } = req.query;
  try {
    let result;
    if (session_id) {
      result = await sql.query('SELECT * FROM contestants WHERE session_id = $1 ORDER BY score DESC', [session_id]);
    } else {
      result = await sql.query('SELECT * FROM contestants ORDER BY created_at DESC');
    }
    res.json(result);
  } catch (err) {
    console.error('Error fetching contestants:', err);
    res.status(500).json({ error: 'Server error fetching contestants' });
  }
});

// POST /api/contestants
router.post('/', requireAuth, async (req, res) => {
  const { name, avatar_color, session_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    const result = await sql.query(
      'INSERT INTO contestants (name, avatar_color, session_id) VALUES ($1,$2,$3) RETURNING *',
      [name, avatar_color || '#00e5ff', session_id || null]
    );
    res.status(201).json(result[0]);
  } catch (err) {
    console.error('Error adding contestant:', err);
    res.status(500).json({ error: 'Server error adding contestant' });
  }
});

// PUT /api/contestants/:id
router.put('/:id', requireAuth, async (req, res) => {
  const { name, avatar_color, score, streak, lifelines_used, is_active } = req.body;
  try {
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (avatar_color !== undefined) { fields.push(`avatar_color = $${idx++}`); values.push(avatar_color); }
    if (score !== undefined) { fields.push(`score = $${idx++}`); values.push(score); }
    if (streak !== undefined) { fields.push(`streak = $${idx++}`); values.push(streak); }
    if (lifelines_used !== undefined) { fields.push(`lifelines_used = $${idx++}`); values.push(JSON.stringify(lifelines_used)); }
    if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);
    const result = await sql.query(
      `UPDATE contestants SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.length === 0) return res.status(404).json({ error: 'Contestant not found' });

    // Broadcast score update to sockets
    const io = req.app.get('io');
    if (io) {
      io.to('presentation').emit('contestant:update', result[0]);
      io.to('admin').emit('contestant:update', result[0]);
    }

    res.json(result[0]);
  } catch (err) {
    console.error('Error updating contestant:', err);
    res.status(500).json({ error: 'Server error updating contestant' });
  }
});

// DELETE /api/contestants/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await sql.query('DELETE FROM contestants WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.length === 0) return res.status(404).json({ error: 'Contestant not found' });
    res.json({ message: 'Contestant deleted' });
  } catch (err) {
    console.error('Error deleting contestant:', err);
    res.status(500).json({ error: 'Server error deleting contestant' });
  }
});

module.exports = router;
