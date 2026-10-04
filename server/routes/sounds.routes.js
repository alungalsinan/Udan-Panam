const express = require('express');
const router = express.Router();
const { sql } = require('../../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/sounds
router.get('/', async (req, res) => {
  try {
    const result = await sql.query('SELECT * FROM sound_effects ORDER BY category, name');
    res.json(result);
  } catch (err) {
    console.error('Error fetching sounds:', err);
    res.status(500).json({ error: 'Server error fetching sounds' });
  }
});

// PUT /api/sounds/:id
router.put('/:id', requireAuth, async (req, res) => {
  const { url, enabled, name } = req.body;
  try {
    const fields = [];
    const values = [];
    let idx = 1;

    if (url !== undefined) { fields.push(`url = $${idx++}`); values.push(url); }
    if (enabled !== undefined) { fields.push(`enabled = $${idx++}`); values.push(enabled); }
    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);
    const result = await sql.query(
      `UPDATE sound_effects SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.length === 0) return res.status(404).json({ error: 'Sound not found' });
    res.json(result[0]);
  } catch (err) {
    console.error('Error updating sound:', err);
    res.status(500).json({ error: 'Server error updating sound' });
  }
});

module.exports = router;
