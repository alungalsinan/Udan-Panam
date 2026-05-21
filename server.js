require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { neon } = require('@neondatabase/serverless');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); // Serve static files

// DB Connection
const sql = neon(process.env.DATABASE_URL);

// API Routes

// 1. Get all questions (Filter by level if provided)
app.get('/api/questions', async (req, res) => {
  try {
    const { level } = req.query;
    let result;
    if (level) {
        result = await sql.query('SELECT * FROM questions WHERE level = $1 ORDER BY id ASC', [parseInt(level)]);
    } else {
        result = await sql.query('SELECT * FROM questions ORDER BY id ASC');
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching questions' });
  }
});

// 2. Add a new question
app.post('/api/questions', async (req, res) => {
  const { level, question_text, audio_url, image_url, option_a, option_b, option_c, option_d, correct_answer } = req.body;
  try {
    const result = await sql.query(
      'INSERT INTO questions (level, question_text, audio_url, image_url, option_a, option_b, option_c, option_d, correct_answer) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [level || 1, question_text, audio_url, image_url, option_a, option_b, option_c, option_d, correct_answer]
    );
    res.status(201).json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error adding question' });
  }
});

// 3. Update a question
app.put('/api/questions/:id', async (req, res) => {
  const { id } = req.params;
  const { level, question_text, audio_url, image_url, option_a, option_b, option_c, option_d, correct_answer } = req.body;
  try {
    const result = await sql.query(
      'UPDATE questions SET level = $1, question_text = $2, audio_url = $3, image_url = $4, option_a = $5, option_b = $6, option_c = $7, option_d = $8, correct_answer = $9 WHERE id = $10 RETURNING *',
      [level || 1, question_text, audio_url, image_url, option_a, option_b, option_c, option_d, correct_answer, id]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Question not found' });
    res.json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating question' });
  }
});

// 4. Delete a question
app.delete('/api/questions/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await sql.query('DELETE FROM questions WHERE id = $1 RETURNING *', [id]);
    if (result.length === 0) return res.status(404).json({ error: 'Question not found' });
    res.json({ message: 'Question deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error deleting question' });
  }
});

// 5. Bulk import questions
app.post('/api/questions/import', async (req, res) => {
  const questions = req.body; // Expects array of question objects
  if (!Array.isArray(questions)) return res.status(400).json({ error: 'Invalid data format' });

  try {
    // Neon HTTP driver doesn't support interactive transactions yet easily, 
    // so we can insert in a loop or bulk insert. We will do a loop for simplicity.
    for (let q of questions) {
      await sql.query(
        'INSERT INTO questions (level, question_text, audio_url, image_url, option_a, option_b, option_c, option_d, correct_answer) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [q.level || 1, q.question_text, q.audio_url, q.image_url, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer]
      );
    }
    res.status(201).json({ message: `${questions.length} questions imported successfully` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error importing questions' });
  }
});

// Start Server
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

module.exports = app;
