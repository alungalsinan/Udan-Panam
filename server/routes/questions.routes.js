const express = require('express');
const router = express.Router();
const { sql } = require('../../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/questions - List, search, filter questions
router.get('/', async (req, res) => {
  try {
    const { level, category, search, presented, page, limit } = req.query;
    let query = 'SELECT * FROM questions';
    const conditions = [];
    const values = [];
    let idx = 1;

    if (level) {
      conditions.push(`level = $${idx++}`);
      values.push(parseInt(level));
    }
    if (category) {
      conditions.push(`category = $${idx++}`);
      values.push(category);
    }
    if (presented !== undefined) {
      if (presented === 'true') {
        conditions.push(`presented = TRUE`);
      } else if (presented === 'false') {
        conditions.push(`(presented = FALSE OR presented IS NULL)`);
      }
    }
    if (search) {
      conditions.push(`(question_text ILIKE $${idx} OR option_a ILIKE $${idx} OR option_b ILIKE $${idx} OR option_c ILIKE $${idx} OR option_d ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY sort_order ASC, id ASC';

    if (limit) {
      query += ` LIMIT $${idx++}`;
      values.push(parseInt(limit));
      if (page) {
        query += ` OFFSET $${idx++}`;
        values.push((parseInt(page) - 1) * parseInt(limit));
      }
    }

    const result = await sql.query(query, values);
    res.json(result);
  } catch (err) {
    console.error('Error fetching questions:', err);
    res.status(500).json({ error: 'Server error fetching questions' });
  }
});

// POST /api/questions - Create a question
router.post('/', requireAuth, async (req, res) => {
  const {
    level, question_text, audio_url, image_url, video_url,
    option_a, option_b, option_c, option_d, correct_answer,
    category, tags, points, timer_override, explanation, presented
  } = req.body;

  if (!option_a || !option_b || !option_c || !option_d || !correct_answer) {
    return res.status(400).json({ error: 'Options and correct answer are required' });
  }
  if (!['A', 'B', 'C', 'D'].includes(correct_answer.toUpperCase())) {
    return res.status(400).json({ error: 'Correct answer must be A, B, C, or D' });
  }

  try {
    const result = await sql.query(
      `INSERT INTO questions (level, question_text, audio_url, image_url, video_url, option_a, option_b, option_c, option_d, correct_answer, category, tags, points, timer_override, explanation, presented)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [
        level || 1, question_text, audio_url || null, image_url || null, video_url || null,
        option_a, option_b, option_c, option_d, correct_answer.toUpperCase(),
        category || null, tags || null, points || 10, timer_override || null,
        explanation || null, !!presented
      ]
    );
    res.status(201).json(result[0]);
  } catch (err) {
    console.error('Error adding question:', err);
    res.status(500).json({ error: 'Server error adding question' });
  }
});

// PUT /api/questions/:id - Update question
router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const {
    level, question_text, audio_url, image_url, video_url,
    option_a, option_b, option_c, option_d, correct_answer,
    category, tags, points, timer_override, explanation, sort_order, presented
  } = req.body;

  try {
    const result = await sql.query(
      `UPDATE questions SET level=$1, question_text=$2, audio_url=$3, image_url=$4, video_url=$5, option_a=$6, option_b=$7, option_c=$8, option_d=$9, correct_answer=$10, category=$11, tags=$12, points=$13, timer_override=$14, explanation=$15, sort_order=$16, presented=$17
       WHERE id=$18 RETURNING *`,
      [
        level || 1, question_text, audio_url || null, image_url || null, video_url || null,
        option_a, option_b, option_c, option_d, correct_answer ? correct_answer.toUpperCase() : 'A',
        category || null, tags || null, points || 10, timer_override || null,
        explanation || null, sort_order || 0,
        presented !== undefined ? !!presented : false, id
      ]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Question not found' });
    const updatedQ = result[0];

    const io = req.app.get('io');
    const { getPresentationState, setPresentationState } = require('../services/cache');
    const pState = getPresentationState();
    if (pState && String(pState.current_question_id) === String(id)) {
      pState.question = updatedQ;
      setPresentationState(pState);
      if (io) {
        io.to('presentation').emit('state:sync', pState);
        io.to('admin').emit('state:sync', pState);
      }
    } else if (io) {
      io.to('admin').emit('question:updated', updatedQ);
    }

    res.json(updatedQ);
  } catch (err) {
    console.error('Error updating question:', err);
    res.status(500).json({ error: 'Server error updating question' });
  }
});

// PATCH /api/questions/:id - Partial update (e.g. correct_answer, option text, live quick edits)
router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const fields = req.body;
  const allowed = [
    'level', 'question_text', 'audio_url', 'image_url', 'video_url',
    'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer',
    'category', 'tags', 'points', 'timer_override', 'explanation',
    'sort_order', 'presented'
  ];

  const updates = [];
  const vals = [];
  let idx = 1;

  for (const key of Object.keys(fields)) {
    if (allowed.includes(key)) {
      updates.push(`${key} = $${idx++}`);
      vals.push(key === 'correct_answer' && fields[key] ? String(fields[key]).toUpperCase() : fields[key]);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields provided for update' });
  }

  vals.push(id);

  try {
    const result = await sql.query(
      `UPDATE questions SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals
    );
    if (result.length === 0) return res.status(404).json({ error: 'Question not found' });
    const updatedQ = result[0];

    const io = req.app.get('io');
    const { getPresentationState, setPresentationState } = require('../services/cache');
    const pState = getPresentationState();
    if (pState && String(pState.current_question_id) === String(id)) {
      pState.question = updatedQ;
      setPresentationState(pState);
      if (io) {
        io.to('presentation').emit('state:sync', pState);
        io.to('admin').emit('state:sync', pState);
      }
    } else if (io) {
      io.to('admin').emit('question:updated', updatedQ);
    }

    res.json(updatedQ);
  } catch (err) {
    console.error('Error patching question:', err);
    res.status(500).json({ error: 'Server error updating question' });
  }
});

// DELETE /api/questions/:id - Delete single question
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await sql.query('DELETE FROM questions WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.length === 0) return res.status(404).json({ error: 'Question not found' });
    res.json({ message: 'Question deleted' });
  } catch (err) {
    console.error('Error deleting question:', err);
    res.status(500).json({ error: 'Server error deleting question' });
  }
});

// DELETE /api/questions - Delete all questions
router.delete('/', requireAuth, async (req, res) => {
  try {
    await sql.query('DELETE FROM questions');
    res.json({ message: 'All questions deleted' });
  } catch (err) {
    console.error('Error deleting all questions:', err);
    res.status(500).json({ error: 'Server error deleting all questions' });
  }
});

// POST /api/questions/import - Bulk import questions
router.post('/import', requireAuth, async (req, res) => {
  const questions = req.body;
  if (!Array.isArray(questions)) return res.status(400).json({ error: 'Invalid data format: Expected an array of questions' });

  try {
    let imported = 0;
    for (let q of questions) {
      await sql.query(
        `INSERT INTO questions (level, question_text, audio_url, image_url, video_url, option_a, option_b, option_c, option_d, correct_answer, category, tags, points, timer_override, explanation, presented)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          q.level || 1, q.question_text, q.audio_url || null, q.image_url || null, q.video_url || null,
          q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer,
          q.category || null, q.tags || null, q.points || 10, q.timer_override || null,
          q.explanation || null, !!q.presented
        ]
      );
      imported++;
    }
    res.status(201).json({ message: `${imported} questions imported successfully` });
  } catch (err) {
    console.error('Error importing questions:', err);
    res.status(500).json({ error: 'Server error importing questions' });
  }
});

// PUT /api/questions/:id/presented - Toggle presented status
router.put('/:id/presented', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { presented } = req.body;
  try {
    const result = await sql.query('UPDATE questions SET presented = $1 WHERE id = $2 RETURNING *', [!!presented, id]);
    if (result.length === 0) return res.status(404).json({ error: 'Question not found' });
    res.json(result[0]);
  } catch (err) {
    console.error('Error updating presented status:', err);
    res.status(500).json({ error: 'Server error updating presented status' });
  }
});

// POST /api/questions/reset-presented - Reset all presented flags
router.post('/reset-presented', requireAuth, async (req, res) => {
  try {
    await sql.query('UPDATE questions SET presented = FALSE');
    res.json({ message: 'All questions reset to unpresented.' });
  } catch (err) {
    console.error('Error resetting questions:', err);
    res.status(500).json({ error: 'Server error resetting questions' });
  }
});

module.exports = router;
