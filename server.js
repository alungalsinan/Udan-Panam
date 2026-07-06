require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const { neon } = require('@neondatabase/serverless');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});
const port = process.env.PORT || 3000;

// ─── Middleware ───
app.use(cors());
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '5mb' }));

// Rate limit API endpoints
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

// Serve static files (exclude sensitive files)
app.use((req, res, next) => {
  const sensitiveFiles = ['.env', 'server.js', 'init-db.js', 'package.json', 'package-lock.json', 'vercel.json', '.git', '.gitignore'];
  const baseName = path.basename(req.path);
  if (sensitiveFiles.includes(baseName)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
});
app.use(express.static(__dirname));

// DB Connection
const sql = neon(process.env.DATABASE_URL);

// ─── In-Memory Cache ───
let cachedPresentationState = null;
let cachedStudioSettings = null;
let adminPasswordHash = null;

// ─── Timer Engine ───
let timerInterval = null;
let timerRemaining = 30;

// ─── Celebration Timer Engine ───
let celebrationInterval = null;
let celebrationRemaining = 0;

function startCelebrationTimer(duration) {
  stopCelebrationTimer();
  celebrationRemaining = duration;
  io.to('presentation').emit('celebration:start', { duration });
  io.to('admin').emit('celebration:start', { duration });

  if (duration > 0) {
    celebrationInterval = setInterval(() => {
      celebrationRemaining--;
      io.to('presentation').emit('celebration:tick', { remaining: celebrationRemaining });
      io.to('admin').emit('celebration:tick', { remaining: celebrationRemaining });

      if (celebrationRemaining <= 0) {
        stopCelebrationTimer();
        io.to('presentation').emit('celebration:stop');
        io.to('admin').emit('celebration:stop');
      }
    }, 1000);
  }
}

function stopCelebrationTimer() {
  if (celebrationInterval) {
    clearInterval(celebrationInterval);
    celebrationInterval = null;
  }
  celebrationRemaining = 0;
}

function startTimer(duration) {
  stopTimer();
  timerRemaining = duration || 30;
  timerInterval = setInterval(async () => {
    timerRemaining--;
    io.to('presentation').emit('timer:tick', { remaining: timerRemaining });
    io.to('admin').emit('timer:tick', { remaining: timerRemaining });

    if (timerRemaining <= 0) {
      stopTimer();
      io.to('presentation').emit('timer:expired');
      io.to('admin').emit('timer:expired');
      // Update DB
      try {
        await sql.query('UPDATE presentation_state SET timer_running = FALSE, timer_remaining = 0 WHERE id = 1');
        if (cachedPresentationState) {
          cachedPresentationState.timer_running = false;
          cachedPresentationState.timer_remaining = 0;
        }
      } catch (e) { console.error('Timer DB update error:', e); }
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function pauseTimer() {
  stopTimer();
}

// ─── Initialize Cache ───
async function initCache() {
  try {
    // Auto-migrate presented column if not exists
    await sql.query('ALTER TABLE questions ADD COLUMN IF NOT EXISTS presented BOOLEAN DEFAULT FALSE');

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
    if (studioRes.length > 0) cachedStudioSettings = studioRes[0];

    const adminRes = await sql.query('SELECT admin_password FROM admin_settings WHERE id = 1');
    if (adminRes.length > 0) adminPasswordHash = adminRes[0].admin_password;
  } catch (err) {
    console.error('Failed to initialize cache / database:', err);
  }
}
initCache();

// ─── Auth Middleware ───
function requireAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_SESSION_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─── Auth Routes ───
app.post('/api/auth/login', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  try {
    if (!adminPasswordHash) {
      const adminRes = await sql.query('SELECT admin_password FROM admin_settings WHERE id = 1');
      if (adminRes.length > 0) adminPasswordHash = adminRes[0].admin_password;
    }

    const match = await bcrypt.compare(password, adminPasswordHash);
    if (!match) return res.status(401).json({ error: 'Invalid password' });

    // Generate a simple session token
    const token = require('crypto').randomBytes(32).toString('hex');
    process.env.ADMIN_SESSION_TOKEN = token;
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });

  try {
    const match = await bcrypt.compare(current_password, adminPasswordHash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(new_password, 10);
    await sql.query('UPDATE admin_settings SET admin_password = $1 WHERE id = 1', [newHash]);
    adminPasswordHash = newHash;
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error changing password' });
  }
});

app.get('/api/auth/verify', requireAuth, (req, res) => {
  res.json({ valid: true });
});

// ═════════════════════════════════════════════
// REST API Routes
// ═════════════════════════════════════════════

// ─── Questions ───

app.get('/api/questions', async (req, res) => {
  try {
    const { level, category, search, presented, page, limit } = req.query;
    let query = 'SELECT * FROM questions';
    const conditions = [];
    const values = [];
    let idx = 1;

    if (level) { conditions.push(`level = $${idx++}`); values.push(parseInt(level)); }
    if (category) { conditions.push(`category = $${idx++}`); values.push(category); }
    if (presented !== undefined) {
      if (presented === 'true') {
        conditions.push(`presented = TRUE`);
      } else if (presented === 'false') {
        conditions.push(`(presented = FALSE OR presented IS NULL)`);
      }
    }
    if (search) { conditions.push(`(question_text ILIKE $${idx} OR option_a ILIKE $${idx} OR option_b ILIKE $${idx} OR option_c ILIKE $${idx} OR option_d ILIKE $${idx})`); values.push(`%${search}%`); idx++; }

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
    console.error(err);
    res.status(500).json({ error: 'Server error fetching questions' });
  }
});

app.post('/api/questions', requireAuth, async (req, res) => {
  const { level, question_text, audio_url, image_url, video_url, option_a, option_b, option_c, option_d, correct_answer, category, tags, points, timer_override, explanation, presented } = req.body;
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
      [level||1, question_text, audio_url||null, image_url||null, video_url||null, option_a, option_b, option_c, option_d, correct_answer.toUpperCase(), category||null, tags||null, points||10, timer_override||null, explanation||null, !!presented]
    );
    res.status(201).json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error adding question' });
  }
});

app.put('/api/questions/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { level, question_text, audio_url, image_url, video_url, option_a, option_b, option_c, option_d, correct_answer, category, tags, points, timer_override, explanation, sort_order, presented } = req.body;
  try {
    const result = await sql.query(
      `UPDATE questions SET level=$1, question_text=$2, audio_url=$3, image_url=$4, video_url=$5, option_a=$6, option_b=$7, option_c=$8, option_d=$9, correct_answer=$10, category=$11, tags=$12, points=$13, timer_override=$14, explanation=$15, sort_order=$16, presented=$17
       WHERE id=$18 RETURNING *`,
      [level||1, question_text, audio_url||null, image_url||null, video_url||null, option_a, option_b, option_c, option_d, correct_answer, category||null, tags||null, points||10, timer_override||null, explanation||null, sort_order||0, presented !== undefined ? !!presented : false, id]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Question not found' });
    res.json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating question' });
  }
});

app.delete('/api/questions/:id', requireAuth, async (req, res) => {
  try {
    const result = await sql.query('DELETE FROM questions WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.length === 0) return res.status(404).json({ error: 'Question not found' });
    res.json({ message: 'Question deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error deleting question' });
  }
});

app.delete('/api/questions', requireAuth, async (req, res) => {
  try {
    await sql.query('DELETE FROM questions');
    res.json({ message: 'All questions deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error deleting all questions' });
  }
});

app.post('/api/questions/import', requireAuth, async (req, res) => {
  const questions = req.body;
  if (!Array.isArray(questions)) return res.status(400).json({ error: 'Invalid data format' });
  try {
    let imported = 0;
    for (let q of questions) {
      await sql.query(
        `INSERT INTO questions (level, question_text, audio_url, image_url, video_url, option_a, option_b, option_c, option_d, correct_answer, category, tags, points, timer_override, explanation, presented)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [q.level||1, q.question_text, q.audio_url||null, q.image_url||null, q.video_url||null, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.category||null, q.tags||null, q.points||10, q.timer_override||null, q.explanation||null, !!q.presented]
      );
      imported++;
    }
    res.status(201).json({ message: `${imported} questions imported` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error importing questions' });
  }
});

app.put('/api/questions/:id/presented', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { presented } = req.body;
  try {
    const result = await sql.query('UPDATE questions SET presented = $1 WHERE id = $2 RETURNING *', [!!presented, id]);
    if (result.length === 0) return res.status(404).json({ error: 'Question not found' });
    res.json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating presented status' });
  }
});

app.post('/api/questions/reset-presented', requireAuth, async (req, res) => {
  try {
    await sql.query('UPDATE questions SET presented = FALSE');
    res.json({ message: 'All questions reset to unpresented.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error resetting questions' });
  }
});

// ─── Presentation State ───

app.get('/api/presentation/state', async (req, res) => {
  if (cachedPresentationState) return res.json(cachedPresentationState);
  try {
    const stateResult = await sql.query('SELECT * FROM presentation_state WHERE id = 1');
    if (stateResult.length === 0) return res.status(404).json({ error: 'Presentation state not found' });
    const state = stateResult[0];
    if (state.current_question_id) {
      const qRes = await sql.query('SELECT * FROM questions WHERE id = $1', [state.current_question_id]);
      state.question = qRes[0] || null;
    } else { state.question = null; }
    cachedPresentationState = state;
    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching state' });
  }
});

app.post('/api/presentation/state', requireAuth, async (req, res) => {
  const allowedFields = ['current_question_id','active_screen','show_question','show_options','reveal_answer','audio_status','active_level','timer_running','timer_remaining','active_session_id','active_contestant_id','active_lifeline','show_timer','show_scoreboard','show_explanation','game_mode'];
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
    const result = await sql.query(`UPDATE presentation_state SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    const state = result[0];

    if (state.current_question_id) {
      const qRes = await sql.query('SELECT * FROM questions WHERE id = $1', [state.current_question_id]);
      state.question = qRes[0] || null;
    } else { state.question = null; }

    cachedPresentationState = state;

    // Broadcast to all presentation screens
    io.to('presentation').emit('state:sync', state);
    io.to('admin').emit('state:sync', state);

    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating state' });
  }
});

// ─── Studio Settings ───

app.get('/api/studio', async (req, res) => {
  if (cachedStudioSettings) return res.json(cachedStudioSettings);
  try {
    const result = await sql.query('SELECT * FROM studio_settings WHERE id = 1');
    cachedStudioSettings = result[0] || null;
    res.json(cachedStudioSettings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching studio settings' });
  }
});

app.post('/api/studio', requireAuth, async (req, res) => {
  const allowedFields = ['welcome_title','welcome_subtitle','theme_primary','theme_secondary','bg_dark','bg_card','font_family','animation_enabled','logo_url','bg_image_url','bg_video_url','transition_style','option_reveal_style','correct_sound_url','wrong_sound_url','timer_sound_url','bg_music_url','theme_preset','ui_language'];
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
    const result = await sql.query(`UPDATE studio_settings SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    cachedStudioSettings = result[0];

    // Broadcast studio update to all screens
    io.to('presentation').emit('studio:sync', cachedStudioSettings);
    io.to('admin').emit('studio:sync', cachedStudioSettings);

    res.json(cachedStudioSettings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating studio settings' });
  }
});

// ─── Game Sessions ───

app.get('/api/sessions', requireAuth, async (req, res) => {
  try {
    const result = await sql.query('SELECT * FROM game_sessions ORDER BY created_at DESC');
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching sessions' });
  }
});

app.post('/api/sessions', requireAuth, async (req, res) => {
  const { name, total_rounds, timer_duration, scoring_mode, game_mode, notes } = req.body;
  try {
    const result = await sql.query(
      'INSERT INTO game_sessions (name, total_rounds, timer_duration, scoring_mode, game_mode, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name || 'New Game', total_rounds || 1, timer_duration || 30, scoring_mode || 'fixed', game_mode || 'single', notes || null]
    );
    res.status(201).json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error creating session' });
  }
});

app.put('/api/sessions/:id', requireAuth, async (req, res) => {
  const { status, current_round, name, notes } = req.body;
  try {
    const fields = [];
    const values = [];
    let idx = 1;
    if (status !== undefined) {
      fields.push(`status = $${idx++}`); values.push(status);
      if (status === 'completed') { fields.push(`completed_at = NOW()`); }
    }
    if (current_round !== undefined) { fields.push(`current_round = $${idx++}`); values.push(current_round); }
    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (notes !== undefined) { fields.push(`notes = $${idx++}`); values.push(notes); }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);
    const result = await sql.query(`UPDATE game_sessions SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    if (result.length === 0) return res.status(404).json({ error: 'Session not found' });
    res.json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating session' });
  }
});

app.delete('/api/sessions/:id', requireAuth, async (req, res) => {
  try {
    const result = await sql.query('DELETE FROM game_sessions WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.length === 0) return res.status(404).json({ error: 'Session not found' });
    res.json({ message: 'Session deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error deleting session' });
  }
});

// ─── Contestants ───

app.get('/api/contestants', async (req, res) => {
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
    console.error(err);
    res.status(500).json({ error: 'Server error fetching contestants' });
  }
});

app.post('/api/contestants', requireAuth, async (req, res) => {
  const { name, avatar_color, session_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = await sql.query(
      'INSERT INTO contestants (name, avatar_color, session_id) VALUES ($1,$2,$3) RETURNING *',
      [name, avatar_color || '#00e5ff', session_id || null]
    );
    res.status(201).json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error adding contestant' });
  }
});

app.put('/api/contestants/:id', requireAuth, async (req, res) => {
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
    const result = await sql.query(`UPDATE contestants SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    if (result.length === 0) return res.status(404).json({ error: 'Contestant not found' });

    // Broadcast score update
    io.to('presentation').emit('contestant:update', result[0]);
    io.to('admin').emit('contestant:update', result[0]);

    res.json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating contestant' });
  }
});

app.delete('/api/contestants/:id', requireAuth, async (req, res) => {
  try {
    const result = await sql.query('DELETE FROM contestants WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.length === 0) return res.status(404).json({ error: 'Contestant not found' });
    res.json({ message: 'Contestant deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error deleting contestant' });
  }
});

// ─── Answer Log ───

app.get('/api/answers', requireAuth, async (req, res) => {
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
    console.error(err);
    res.status(500).json({ error: 'Server error fetching answers' });
  }
});

app.post('/api/answers', requireAuth, async (req, res) => {
  const { session_id, question_id, contestant_id, selected_answer, is_correct, time_taken_ms, points_earned } = req.body;
  try {
    const result = await sql.query(
      'INSERT INTO answer_log (session_id, question_id, contestant_id, selected_answer, is_correct, time_taken_ms, points_earned) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [session_id, question_id, contestant_id, selected_answer, is_correct, time_taken_ms, points_earned || 0]
    );
    res.status(201).json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error logging answer' });
  }
});

// ─── Sound Effects ───

app.get('/api/sounds', async (req, res) => {
  try {
    const result = await sql.query('SELECT * FROM sound_effects ORDER BY category, name');
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching sounds' });
  }
});

app.put('/api/sounds/:id', requireAuth, async (req, res) => {
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
    const result = await sql.query(`UPDATE sound_effects SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    if (result.length === 0) return res.status(404).json({ error: 'Sound not found' });
    res.json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating sound' });
  }
});

// ─── Analytics ───

app.get('/api/analytics/summary', requireAuth, async (req, res) => {
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
    console.error(err);
    res.status(500).json({ error: 'Server error fetching analytics' });
  }
});

app.get('/api/analytics/difficulty', requireAuth, async (req, res) => {
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
    console.error(err);
    res.status(500).json({ error: 'Server error fetching difficulty data' });
  }
});

// ─── Backup / Restore ───

app.get('/api/backup', requireAuth, async (req, res) => {
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
        questions, game_sessions: sessions, contestants, answer_log: answers,
        sound_effects: sounds, studio_settings: studio[0] || null,
        presentation_state: pState[0] || null, admin_settings: admin[0] || null
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error creating backup' });
  }
});

// ─── Admin Settings ───

app.get('/api/admin-settings', requireAuth, async (req, res) => {
  try {
    const result = await sql.query('SELECT default_timer_duration, default_scoring_mode, default_game_mode FROM admin_settings WHERE id = 1');
    res.json(result[0] || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching admin settings' });
  }
});

app.post('/api/admin-settings', requireAuth, async (req, res) => {
  const { default_timer_duration, default_scoring_mode, default_game_mode } = req.body;
  try {
    const result = await sql.query(
      'UPDATE admin_settings SET default_timer_duration = COALESCE($1, default_timer_duration), default_scoring_mode = COALESCE($2, default_scoring_mode), default_game_mode = COALESCE($3, default_game_mode) WHERE id = 1 RETURNING default_timer_duration, default_scoring_mode, default_game_mode',
      [default_timer_duration, default_scoring_mode, default_game_mode]
    );
    res.json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating admin settings' });
  }
});

// ─── Page Routes ───

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ═════════════════════════════════════════════
// Socket.IO Real-Time Events
// ═════════════════════════════════════════════

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Join a room
  socket.on('join', (room) => {
    socket.join(room);
    console.log(`  → ${socket.id} joined room: ${room}`);
    // Send current state on join
    if (room === 'presentation' || room === 'admin') {
      if (cachedPresentationState) socket.emit('state:sync', cachedPresentationState);
      if (cachedStudioSettings) socket.emit('studio:sync', cachedStudioSettings);
      
      // Sync active celebration status
      if (celebrationRemaining > 0) {
        socket.emit('celebration:start', { duration: celebrationRemaining });
      } else if (celebrationInterval && celebrationRemaining === 0) {
        socket.emit('celebration:start', { duration: 0 });
      }
    }
  });

  // ── Admin: Update State ──
  socket.on('state:update', async (data) => {
    try {
      const allowedFields = ['current_question_id','active_screen','show_question','show_options','reveal_answer','audio_status','active_level','timer_running','timer_remaining','active_session_id','active_contestant_id','active_lifeline','show_timer','show_scoreboard','show_explanation','game_mode'];
      const fields = [];
      const values = [];
      let idx = 1;
      for (const field of allowedFields) {
        if (data[field] !== undefined) {
          fields.push(`${field} = $${idx++}`);
          values.push(data[field]);
        }
      }
      if (fields.length === 0) return;

      values.push(1);
      const result = await sql.query(`UPDATE presentation_state SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
      const state = result[0];

      if (state.current_question_id) {
        // Auto-mark question as presented/used
        await sql.query('UPDATE questions SET presented = TRUE WHERE id = $1', [state.current_question_id]);
        const qRes = await sql.query('SELECT * FROM questions WHERE id = $1', [state.current_question_id]);
        state.question = qRes[0] || null;
        if (state.question) {
          state.question.presented = true; // ensure local sync reflects it
        }
      } else { state.question = null; }

      cachedPresentationState = state;
      io.to('presentation').emit('state:sync', state);
      io.to('admin').emit('state:sync', state);
    } catch (err) {
      console.error('Socket state:update error:', err);
    }
  });

  // ── Timer Controls ──
  socket.on('timer:start', async (data) => {
    const duration = data?.duration || cachedPresentationState?.timer_remaining || 30;
    timerRemaining = duration;
    startTimer(duration);
    try {
      await sql.query('UPDATE presentation_state SET timer_running = TRUE, timer_remaining = $1 WHERE id = 1', [duration]);
      if (cachedPresentationState) {
        cachedPresentationState.timer_running = true;
        cachedPresentationState.timer_remaining = duration;
      }
    } catch (e) { console.error('Timer start DB error:', e); }
    io.to('presentation').emit('timer:started', { remaining: duration });
    io.to('admin').emit('timer:started', { remaining: duration });
  });

  socket.on('timer:pause', async () => {
    pauseTimer();
    try {
      await sql.query('UPDATE presentation_state SET timer_running = FALSE, timer_remaining = $1 WHERE id = 1', [timerRemaining]);
      if (cachedPresentationState) {
        cachedPresentationState.timer_running = false;
        cachedPresentationState.timer_remaining = timerRemaining;
      }
    } catch (e) { console.error('Timer pause DB error:', e); }
    io.to('presentation').emit('timer:paused', { remaining: timerRemaining });
    io.to('admin').emit('timer:paused', { remaining: timerRemaining });
  });

  socket.on('timer:stop', async () => {
    stopTimer();
    timerRemaining = cachedPresentationState?.timer_remaining || 30;
    try {
      await sql.query('UPDATE presentation_state SET timer_running = FALSE WHERE id = 1');
      if (cachedPresentationState) cachedPresentationState.timer_running = false;
    } catch (e) { console.error('Timer stop DB error:', e); }
    io.to('presentation').emit('timer:stopped');
    io.to('admin').emit('timer:stopped');
  });

  socket.on('timer:adjust', async (data) => {
    const amount = parseInt(data?.amount) || 0;
    if (amount === 0) return;
    timerRemaining = Math.max(0, timerRemaining + amount);
    try {
      await sql.query('UPDATE presentation_state SET timer_remaining = $1 WHERE id = 1', [timerRemaining]);
      if (cachedPresentationState) {
        cachedPresentationState.timer_remaining = timerRemaining;
      }
    } catch (e) { console.error('Timer adjust DB error:', e); }
    io.to('presentation').emit('timer:tick', { remaining: timerRemaining });
    io.to('admin').emit('timer:tick', { remaining: timerRemaining });
  });

  socket.on('timer:set', async (data) => {
    const duration = parseInt(data?.duration) || 30;
    timerRemaining = duration;
    try {
      await sql.query('UPDATE presentation_state SET timer_remaining = $1 WHERE id = 1', [timerRemaining]);
      if (cachedPresentationState) {
        cachedPresentationState.timer_remaining = timerRemaining;
      }
    } catch (e) { console.error('Timer set DB error:', e); }
    io.to('presentation').emit('timer:tick', { remaining: timerRemaining });
    io.to('admin').emit('timer:tick', { remaining: timerRemaining });
  });

  // ── Lifeline Events ──
  socket.on('lifeline:fifty-fifty', async (data) => {
    const questionId = data?.question_id || cachedPresentationState?.current_question_id;
    if (!questionId) return;
    try {
      const qRes = await sql.query('SELECT * FROM questions WHERE id = $1', [questionId]);
      if (qRes.length === 0) return;
      const q = qRes[0];
      const correct = q.correct_answer;
      const allOptions = ['A', 'B', 'C', 'D'];
      const wrongOptions = allOptions.filter(o => o !== correct);
      // Randomly pick 2 wrong options to eliminate
      const shuffled = wrongOptions.sort(() => Math.random() - 0.5);
      const eliminated = shuffled.slice(0, 2);

      io.to('presentation').emit('lifeline:fifty-fifty-result', { eliminated });
      io.to('admin').emit('lifeline:fifty-fifty-result', { eliminated });
    } catch (err) {
      console.error('50:50 lifeline error:', err);
    }
  });

  socket.on('lifeline:audience-poll', async (data) => {
    const questionId = data?.question_id || cachedPresentationState?.current_question_id;
    if (!questionId) return;
    try {
      const qRes = await sql.query('SELECT correct_answer FROM questions WHERE id = $1', [questionId]);
      if (qRes.length === 0) return;
      const correct = qRes[0].correct_answer;
      // Generate simulated audience poll (weighted towards correct)
      const correctPct = 45 + Math.floor(Math.random() * 30); // 45-75%
      let remaining = 100 - correctPct;
      const poll = {};
      const options = ['A', 'B', 'C', 'D'];
      options.forEach(o => {
        if (o === correct) { poll[o] = correctPct; }
        else {
          const pct = o === options[options.length - 1] ? remaining : Math.floor(Math.random() * remaining);
          poll[o] = pct;
          remaining -= pct;
        }
      });

      io.to('presentation').emit('lifeline:audience-poll-result', { poll });
      io.to('admin').emit('lifeline:audience-poll-result', { poll });
    } catch (err) {
      console.error('Audience poll error:', err);
    }
  });

  // ── Sound Events ──
  socket.on('sound:play', (data) => {
    io.to('presentation').emit('sound:play', data);
  });

  socket.on('sound:stop', () => {
    io.to('presentation').emit('sound:stop');
  });

  // ── Celebration Events ──
  socket.on('celebration:start', (data) => {
    const duration = parseInt(data?.duration) || 10;
    startCelebrationTimer(duration);
  });

  socket.on('celebration:stop', () => {
    stopCelebrationTimer();
    io.to('presentation').emit('celebration:stop');
    io.to('admin').emit('celebration:stop');
  });

  socket.on('celebration:trigger', (data) => {
    startCelebrationTimer(10);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ─── Start Server ───
server.listen(port, () => {
  console.log(`\n🚀 Udan Panam v2.0 server running on http://localhost:${port}`);
  console.log(`   📺 Presentation: http://localhost:${port}`);
  console.log(`   🎛️  Admin Panel:  http://localhost:${port}/admin`);
  console.log(`   🔌 Socket.IO:    Enabled\n`);
});

module.exports = app;
