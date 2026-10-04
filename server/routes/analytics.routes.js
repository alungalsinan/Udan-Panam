const express = require('express');
const router = express.Router();
const { sql } = require('../../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/analytics/summary
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const [sessions, questions, answers, contestants] = await Promise.all([
      sql.query('SELECT count(*) FROM game_sessions'),
      sql.query('SELECT count(*) FROM questions'),
      sql.query('SELECT count(*), COALESCE(AVG(CASE WHEN is_correct THEN 1 ELSE 0 END) * 100, 0) as accuracy FROM answer_log'),
      sql.query('SELECT count(*) FROM contestants')
    ]);
    res.json({
      total_sessions: parseInt(sessions[0].count),
      total_questions: parseInt(questions[0].count),
      total_answers: parseInt(answers[0].count),
      accuracy: parseFloat(answers[0].accuracy).toFixed(1),
      total_contestants: parseInt(contestants[0].count)
    });
  } catch (err) {
    console.error('Error fetching analytics summary:', err);
    res.status(500).json({ error: 'Server error fetching analytics' });
  }
});

// GET /api/analytics/difficulty
router.get('/difficulty', requireAuth, async (req, res) => {
  try {
    const result = await sql.query(`
      SELECT q.id, q.question_text, q.level,
        count(al.id) as times_asked,
        COALESCE(AVG(CASE WHEN al.is_correct THEN 1 ELSE 0 END) * 100, 0) as correct_pct,
        COALESCE(AVG(al.time_taken_ms), 0) as avg_time_ms
      FROM questions q
      LEFT JOIN answer_log al ON q.id = al.question_id
      GROUP BY q.id, q.question_text, q.level
      ORDER BY correct_pct ASC
    `);
    res.json(result);
  } catch (err) {
    console.error('Error fetching difficulty analysis:', err);
    res.status(500).json({ error: 'Server error fetching difficulty data' });
  }
});

module.exports = router;
