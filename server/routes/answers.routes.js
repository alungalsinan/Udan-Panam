const express = require('express');
const router = express.Router();
const { sql } = require('../../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/answers
router.get('/', requireAuth, async (req, res) => {
  const { session_id, question_id } = req.query;
  try {
    let query = 'SELECT al.*, q.question_text, c.name as contestant_name FROM answer_log al LEFT JOIN questions q ON al.question_id = q.id LEFT JOIN contestants c ON al.contestant_id = c.id';
    const conditions = [];
    const values = [];
    let idx = 1;

    if (session_id) { conditions.push(`al.session_id = $${idx++}`); values.push(session_id); }
    if (question_id) { conditions.push(`al.question_id = $${idx++}`); values.push(question_id); }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY al.answered_at DESC';

    const result = await sql.query(query, values);
    res.json(result);
  } catch (err) {
    console.error('Error fetching answers:', err);
    res.status(500).json({ error: 'Server error fetching answers' });
  }
});

// POST /api/answers
router.post('/', requireAuth, async (req, res) => {
  const { session_id, question_id, contestant_id, selected_answer, is_correct, time_taken_ms, points_earned } = req.body;
  try {
    const result = await sql.query(
      'INSERT INTO answer_log (session_id, question_id, contestant_id, selected_answer, is_correct, time_taken_ms, points_earned) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [session_id, question_id, contestant_id, selected_answer, is_correct, time_taken_ms, points_earned || 0]
    );
    res.status(201).json(result[0]);
  } catch (err) {
    console.error('Error logging answer:', err);
    res.status(500).json({ error: 'Server error logging answer' });
  }
});

module.exports = router;
