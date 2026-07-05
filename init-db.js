require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

// ─── Core Tables ───

const createQuestionsTable = `
  CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    level INTEGER DEFAULT 1,
    question_text TEXT,
    audio_url TEXT,
    image_url TEXT,
    video_url TEXT,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_answer VARCHAR(1) NOT NULL,
    category TEXT,
    tags TEXT[],
    points INTEGER DEFAULT 10,
    timer_override INTEGER,
    explanation TEXT,
    sort_order INTEGER DEFAULT 0
  );
`;

const createPresentationStateTable = `
  CREATE TABLE IF NOT EXISTS presentation_state (
    id INTEGER PRIMARY KEY,
    current_question_id INTEGER REFERENCES questions(id) ON DELETE SET NULL,
    active_screen VARCHAR(20) DEFAULT 'welcome',
    show_question BOOLEAN DEFAULT TRUE,
    show_options BOOLEAN DEFAULT FALSE,
    reveal_answer BOOLEAN DEFAULT FALSE,
    audio_status VARCHAR(20) DEFAULT 'stopped',
    active_level INTEGER DEFAULT 1,
    timer_running BOOLEAN DEFAULT FALSE,
    timer_remaining INTEGER DEFAULT 30,
    active_session_id INTEGER,
    active_contestant_id INTEGER,
    active_lifeline VARCHAR(20),
    show_timer BOOLEAN DEFAULT TRUE,
    show_scoreboard BOOLEAN DEFAULT FALSE,
    show_explanation BOOLEAN DEFAULT FALSE,
    game_mode VARCHAR(20) DEFAULT 'single'
  );
`;

const createStudioSettingsTable = `
  CREATE TABLE IF NOT EXISTS studio_settings (
    id INTEGER PRIMARY KEY,
    welcome_title TEXT DEFAULT 'College Union Quiz 2026',
    welcome_subtitle TEXT DEFAULT 'The Ultimate Battle of Minds',
    theme_primary VARCHAR(50) DEFAULT '#00e5ff',
    theme_secondary VARCHAR(50) DEFAULT '#ffd700',
    bg_dark VARCHAR(50) DEFAULT '#070B19',
    bg_card VARCHAR(50) DEFAULT 'rgba(16, 24, 45, 0.8)',
    font_family VARCHAR(100) DEFAULT '''Anek Malayalam'', sans-serif',
    animation_enabled BOOLEAN DEFAULT TRUE,
    logo_url TEXT,
    bg_image_url TEXT,
    bg_video_url TEXT,
    transition_style VARCHAR(20) DEFAULT 'fade',
    option_reveal_style VARCHAR(20) DEFAULT 'staggered',
    correct_sound_url TEXT,
    wrong_sound_url TEXT,
    timer_sound_url TEXT,
    bg_music_url TEXT,
    theme_preset VARCHAR(30) DEFAULT 'neon-night',
    ui_language VARCHAR(10) DEFAULT 'ml'
  );
`;

// ─── New Tables ───

const createGameSessionsTable = `
  CREATE TABLE IF NOT EXISTS game_sessions (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'created',
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    total_rounds INTEGER DEFAULT 1,
    current_round INTEGER DEFAULT 1,
    timer_duration INTEGER DEFAULT 30,
    scoring_mode VARCHAR(20) DEFAULT 'fixed',
    game_mode VARCHAR(20) DEFAULT 'single',
    notes TEXT
  );
`;

const createContestantsTable = `
  CREATE TABLE IF NOT EXISTS contestants (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    avatar_color VARCHAR(20) DEFAULT '#00e5ff',
    score INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    lifelines_used JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
  );
`;

const createAnswerLogTable = `
  CREATE TABLE IF NOT EXISTS answer_log (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES questions(id) ON DELETE SET NULL,
    contestant_id INTEGER REFERENCES contestants(id) ON DELETE SET NULL,
    selected_answer VARCHAR(1),
    is_correct BOOLEAN,
    time_taken_ms INTEGER,
    points_earned INTEGER DEFAULT 0,
    answered_at TIMESTAMP DEFAULT NOW()
  );
`;

const createSoundEffectsTable = `
  CREATE TABLE IF NOT EXISTS sound_effects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(30) DEFAULT 'general',
    url TEXT NOT NULL,
    enabled BOOLEAN DEFAULT TRUE
  );
`;

const createAdminSettingsTable = `
  CREATE TABLE IF NOT EXISTS admin_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    admin_password VARCHAR(255) NOT NULL,
    default_timer_duration INTEGER DEFAULT 30,
    default_scoring_mode VARCHAR(20) DEFAULT 'fixed',
    default_game_mode VARCHAR(20) DEFAULT 'single'
  );
`;

// ─── Migrations for existing tables ───

const alterQuestionsTable = `
  ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS audio_url TEXT,
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS video_url TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS tags TEXT[],
    ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 10,
    ADD COLUMN IF NOT EXISTS timer_override INTEGER,
    ADD COLUMN IF NOT EXISTS explanation TEXT,
    ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
`;

const alterPresentationStateTable = `
  ALTER TABLE presentation_state
    ADD COLUMN IF NOT EXISTS timer_running BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS timer_remaining INTEGER DEFAULT 30,
    ADD COLUMN IF NOT EXISTS active_session_id INTEGER,
    ADD COLUMN IF NOT EXISTS active_contestant_id INTEGER,
    ADD COLUMN IF NOT EXISTS active_lifeline VARCHAR(20),
    ADD COLUMN IF NOT EXISTS show_timer BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS show_scoreboard BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS show_explanation BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS game_mode VARCHAR(20) DEFAULT 'single';
`;

const alterStudioSettingsTable = `
  ALTER TABLE studio_settings
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS bg_image_url TEXT,
    ADD COLUMN IF NOT EXISTS bg_video_url TEXT,
    ADD COLUMN IF NOT EXISTS transition_style VARCHAR(20) DEFAULT 'fade',
    ADD COLUMN IF NOT EXISTS option_reveal_style VARCHAR(20) DEFAULT 'staggered',
    ADD COLUMN IF NOT EXISTS correct_sound_url TEXT,
    ADD COLUMN IF NOT EXISTS wrong_sound_url TEXT,
    ADD COLUMN IF NOT EXISTS timer_sound_url TEXT,
    ADD COLUMN IF NOT EXISTS bg_music_url TEXT,
    ADD COLUMN IF NOT EXISTS theme_preset VARCHAR(30) DEFAULT 'neon-night',
    ADD COLUMN IF NOT EXISTS ui_language VARCHAR(10) DEFAULT 'ml';
`;

// ─── Seed Data ───

const seedPresentationState = `
  INSERT INTO presentation_state (id, active_screen, active_level, show_question, show_options, reveal_answer, audio_status, timer_remaining, game_mode)
  VALUES (1, 'welcome', 1, TRUE, FALSE, FALSE, 'stopped', 30, 'single')
  ON CONFLICT (id) DO NOTHING;
`;

const seedStudioSettings = `
  INSERT INTO studio_settings (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;
`;

const seedAdminSettings = `
  INSERT INTO admin_settings (id, admin_password)
  VALUES (1, $1)
  ON CONFLICT (id) DO NOTHING;
`;

const seedDefaultSounds = `
  INSERT INTO sound_effects (name, category, url) VALUES
    ('Correct Answer', 'correct', ''),
    ('Wrong Answer', 'wrong', ''),
    ('Timer Tick', 'timer', ''),
    ('Timer Warning', 'timer', ''),
    ('Answer Reveal', 'reveal', ''),
    ('Celebration', 'celebration', ''),
    ('Background Music', 'background', ''),
    ('Question Appear', 'transition', ''),
    ('Applause', 'celebration', ''),
    ('Suspense', 'reveal', '')
  ON CONFLICT DO NOTHING;
`;

const seedQuestions = `
  INSERT INTO questions (level, question_text, option_a, option_b, option_c, option_d, correct_answer, points) VALUES
  (1, '1. നിലവിൽ കേരള നിയമസഭയിലെ പ്രതിപക്ഷ നേതാവ് ആരാണ്?', 'എ. കെ. ശശീന്ദ്രൻ', 'രമേശ് ചെന്നിത്തല', 'വി. ഡി. സതീശൻ', 'പി. കെ. കുഞ്ഞാലിക്കുട്ടി', 'C', 10),
  (1, '2. സ്വതന്ത്ര ഇന്ത്യയുടെ ചരിത്രത്തിൽ തുടർച്ചയായി മൂന്നാം തവണയും പ്രധാനമന്ത്രിയായ രണ്ടാമത്തെ വ്യക്തി ആരാണ്?', 'മൻമോഹൻ സിംഗ്', 'നരേന്ദ്ര മോദി', 'ഇന്ദിരാ ഗാന്ധി', 'രാജീവ് ഗാന്ധി', 'B', 10),
  (1, '3. കേരള നിയമസഭയുടെ നിലവിലെ സ്പീക്കർ ആരാണ്?', 'എം. ബി. രാജേഷ്', 'പി. ശ്രീരാമകൃഷ്ണൻ', 'എ. എൻ. ഷംസീർ', 'കെ. രാധാകൃഷ്ണൻ', 'C', 10)
  ON CONFLICT DO NOTHING;
`;

// ─── Run Initialization ───

async function initDB() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ ERROR: No DATABASE_URL found in .env file.");
    process.exit(1);
  }

  try {
    console.log("🔄 Connecting to the database...");

    // Create tables
    console.log("  Creating core tables...");
    await sql.query(createQuestionsTable);
    await sql.query(createPresentationStateTable);
    await sql.query(createStudioSettingsTable);

    console.log("  Creating new feature tables...");
    await sql.query(createGameSessionsTable);
    await sql.query(createContestantsTable);
    await sql.query(createAnswerLogTable);
    await sql.query(createSoundEffectsTable);
    await sql.query(createAdminSettingsTable);

    // Run migrations (safe to re-run)
    console.log("  Running migrations...");
    await sql.query(alterQuestionsTable);
    await sql.query(alterPresentationStateTable);
    await sql.query(alterStudioSettingsTable);

    console.log("✅ Table schemas are up to date.");

    // Seed singleton rows
    await sql.query(seedPresentationState);
    await sql.query(seedStudioSettings);

    // Seed admin password (bcrypt hash of "1234")
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash('1234', 10);
    await sql.query(seedAdminSettings, [hashedPassword]);
    console.log("✅ Admin settings seeded (default password: 1234).");

    // Seed default sound effects
    await sql.query(seedDefaultSounds);
    console.log("✅ Default sound effects seeded.");

    // Seed questions if table is empty
    const res = await sql.query('SELECT count(*) FROM questions');
    if (parseInt(res[0].count) === 0) {
      console.log("  Seeding initial questions...");
      await sql.query(seedQuestions);
      console.log("✅ Initial questions seeded.");
    }

    console.log("\n🎉 Database initialization complete!");
  } catch (err) {
    console.error("❌ Database Error:", err.message);
  }
}

initDB();
