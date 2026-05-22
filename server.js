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

// In-Memory Cache to reduce latency
let cachedPresentationState = null;
let cachedStudioSettings = null;

// Initialize Cache
async function initCache() {
  try {
    const pStateRes = await sql.query('SELECT * FROM presentation_state WHERE id = 1');
    if (pStateRes.length > 0) {
      cachedPresentationState = pStateRes[0];
      if (cachedPresentationState.current_question_id) {
        const qRes = await sql.query('SELECT * FROM questions WHERE id = $1', [cachedPresentationState.current_question_id]);
        cachedPresentationState.question = qRes[0] || null;
      } else {
        cachedPresentationState.question = null;
      }
    }
    
    const studioRes = await sql.query('SELECT * FROM studio_settings WHERE id = 1');
    if (studioRes.length > 0) {
      cachedStudioSettings = studioRes[0];
    }
  } catch (err) {
    console.error('Failed to initialize cache:', err);
  }
}
initCache();

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

// 4.b Delete all questions
app.delete('/api/questions', async (req, res) => {
  try {
    await sql.query('DELETE FROM questions');
    res.json({ message: 'All questions deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error deleting all questions' });
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

// 6. Get presentation state (with active question details joined)
app.get('/api/presentation/state', async (req, res) => {
  if (cachedPresentationState) {
    return res.json(cachedPresentationState);
  }
  // Fallback if cache not ready
  try {
    const stateResult = await sql.query('SELECT * FROM presentation_state WHERE id = 1');
    if (stateResult.length === 0) {
      return res.status(404).json({ error: 'Presentation state not found' });
    }
    const state = stateResult[0];
    if (state.current_question_id) {
      const questionResult = await sql.query('SELECT * FROM questions WHERE id = $1', [state.current_question_id]);
      state.question = questionResult[0] || null;
    } else {
      state.question = null;
    }
    cachedPresentationState = state;
    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching presentation state' });
  }
});

// 7. Update presentation state
app.post('/api/presentation/state', async (req, res) => {
  const { current_question_id, active_screen, show_question, show_options, reveal_answer, audio_status, active_level } = req.body;
  try {
    const fields = [];
    const values = [];
    let idx = 1;
    
    // We want to handle explicit nulls (e.g. current_question_id = null)
    if (current_question_id !== undefined) {
      fields.push(`current_question_id = $${idx++}`);
      values.push(current_question_id);
    }
    if (active_screen !== undefined) {
      fields.push(`active_screen = $${idx++}`);
      values.push(active_screen);
    }
    if (show_question !== undefined) {
      fields.push(`show_question = $${idx++}`);
      values.push(show_question);
    }
    if (show_options !== undefined) {
      fields.push(`show_options = $${idx++}`);
      values.push(show_options);
    }
    if (reveal_answer !== undefined) {
      fields.push(`reveal_answer = $${idx++}`);
      values.push(reveal_answer);
    }
    if (audio_status !== undefined) {
      fields.push(`audio_status = $${idx++}`);
      values.push(audio_status);
    }
    if (active_level !== undefined) {
      fields.push(`active_level = $${idx++}`);
      values.push(active_level);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(1); // WHERE id = 1
    const queryStr = `UPDATE presentation_state SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await sql.query(queryStr, values);
    
    const state = result[0];
    if (state.current_question_id) {
      const questionResult = await sql.query('SELECT * FROM questions WHERE id = $1', [state.current_question_id]);
      state.question = questionResult[0] || null;
    } else {
      state.question = null;
    }
    
    // Update cache
    cachedPresentationState = state;
    
    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating presentation state' });
  }
});

// 8. Get Studio Settings
app.get('/api/studio', async (req, res) => {
  if (cachedStudioSettings) {
    return res.json(cachedStudioSettings);
  }
  try {
    const result = await sql.query('SELECT * FROM studio_settings WHERE id = 1');
    cachedStudioSettings = result[0] || null;
    res.json(cachedStudioSettings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching studio settings' });
  }
});

// 9. Update Studio Settings
app.post('/api/studio', async (req, res) => {
  const { welcome_title, welcome_subtitle, theme_primary, theme_secondary, bg_dark, bg_card, font_family, animation_enabled } = req.body;
  try {
    const fields = [];
    const values = [];
    let idx = 1;

    if (welcome_title !== undefined) { fields.push(`welcome_title = $${idx++}`); values.push(welcome_title); }
    if (welcome_subtitle !== undefined) { fields.push(`welcome_subtitle = $${idx++}`); values.push(welcome_subtitle); }
    if (theme_primary !== undefined) { fields.push(`theme_primary = $${idx++}`); values.push(theme_primary); }
    if (theme_secondary !== undefined) { fields.push(`theme_secondary = $${idx++}`); values.push(theme_secondary); }
    if (bg_dark !== undefined) { fields.push(`bg_dark = $${idx++}`); values.push(bg_dark); }
    if (bg_card !== undefined) { fields.push(`bg_card = $${idx++}`); values.push(bg_card); }
    if (font_family !== undefined) { fields.push(`font_family = $${idx++}`); values.push(font_family); }
    if (animation_enabled !== undefined) { fields.push(`animation_enabled = $${idx++}`); values.push(animation_enabled); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(1); // WHERE id = 1
    const queryStr = `UPDATE studio_settings SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await sql.query(queryStr, values);
    
    // Update cache
    cachedStudioSettings = result[0];
    
    res.json(cachedStudioSettings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating studio settings' });
  }
});

// Start Server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

module.exports = app;
