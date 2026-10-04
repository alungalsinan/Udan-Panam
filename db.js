require('dotenv').config();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

let clientInstance = null;
let clientType = null; // 'pglite' | 'neon' | 'pg'

/**
 * Initializes and returns a database client.
 * Defaults to a local persistent database using PGlite (stored in ./data/db)
 * when DATABASE_URL is not provided or set to 'local'.
 * If DATABASE_URL is provided, connects to Neon or standard PostgreSQL.
 */
async function getClient() {
  if (clientInstance) return clientInstance;

  const dbUrl = process.env.DATABASE_URL;

  // 1. If a remote DATABASE_URL is configured (and not explicitly set to 'local')
  if (dbUrl && dbUrl.trim() !== '' && dbUrl.trim().toLowerCase() !== 'local') {
    if (dbUrl.includes('neon.tech') || dbUrl.includes('neon.database')) {
      const { neon } = require('@neondatabase/serverless');
      const neonSql = neon(dbUrl);
      clientType = 'neon';
      clientInstance = {
        query: async (text, params = []) => {
          if (params && params.length > 0) {
            return await neonSql.query(text, params);
          }
          return await neonSql.query(text);
        },
        close: async () => {}
      };
      console.log('📡 Connected to Neon PostgreSQL database.');
      return clientInstance;
    } else {
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: dbUrl });
      clientType = 'pg';
      clientInstance = {
        query: async (text, params = []) => {
          const res = await pool.query(text, params);
          return res.rows || [];
        },
        close: async () => {
          await pool.end();
        }
      };
      console.log('📡 Connected to PostgreSQL database via connection string.');
      return clientInstance;
    }
  }

  // 2. Default: Local persistent database using PGlite (Zero-config embedded PostgreSQL)
  try {
    const { PGlite } = require('@electric-sql/pglite');
    const dbDir = path.join(__dirname, 'data', 'db');
    if (!fs.existsSync(path.dirname(dbDir))) {
      fs.mkdirSync(path.dirname(dbDir), { recursive: true });
    }

    const pglite = await PGlite.create(dbDir, { relaxedDurability: true });
    clientType = 'pglite';
    clientInstance = {
      raw: pglite,
      query: async (text, params = []) => {
        if (params && params.length > 0) {
          const res = await pglite.query(text, params);
          return res.rows || [];
        }
        const res = await pglite.query(text);
        return res.rows || [];
      },
      exec: async (text) => {
        return await pglite.exec(text);
      },
      close: async () => {
        await pglite.close();
        clientInstance = null;
      }
    };
    console.log(`💾 Connected to local persistent database (PGlite) at: ${dbDir}`);
    return clientInstance;
  } catch (err) {
    console.error('❌ Failed to initialize local persistent database:', err.message);
    throw err;
  }
}

// ─── SQL Execution Wrapper ───
const sql = {
  query: async (text, params = []) => {
    const client = await getClient();
    return await client.query(text, params);
  },
  exec: async (text) => {
    const client = await getClient();
    if (client.exec) {
      return await client.exec(text);
    }
    return await client.query(text);
  }
};

// ─── Schema Queries ───
const schemaQueries = [
  // Core Tables
  `CREATE TABLE IF NOT EXISTS questions (
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
    sort_order INTEGER DEFAULT 0,
    presented BOOLEAN DEFAULT FALSE
  );`,

  `CREATE TABLE IF NOT EXISTS presentation_state (
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
  );`,

  `CREATE TABLE IF NOT EXISTS studio_settings (
    id INTEGER PRIMARY KEY,
    welcome_title TEXT DEFAULT 'College Union Quiz 2026',
    welcome_subtitle TEXT DEFAULT 'The Ultimate Battle of Minds',
    theme_primary VARCHAR(50) DEFAULT '#10b981',
    theme_secondary VARCHAR(50) DEFAULT '#fbbf24',
    bg_dark VARCHAR(50) DEFAULT '#022c22',
    bg_card VARCHAR(50) DEFAULT 'rgba(6, 78, 59, 0.85)',
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
    theme_preset VARCHAR(30) DEFAULT 'emerald-gold',
    ui_language VARCHAR(10) DEFAULT 'ml'
  );`,

  // Feature Tables
  `CREATE TABLE IF NOT EXISTS game_sessions (
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
  );`,

  `CREATE TABLE IF NOT EXISTS contestants (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    avatar_color VARCHAR(20) DEFAULT '#00e5ff',
    score INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    lifelines_used JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS answer_log (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES questions(id) ON DELETE SET NULL,
    contestant_id INTEGER REFERENCES contestants(id) ON DELETE SET NULL,
    selected_answer VARCHAR(1),
    is_correct BOOLEAN,
    time_taken_ms INTEGER,
    points_earned INTEGER DEFAULT 0,
    answered_at TIMESTAMP DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS sound_effects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(30) DEFAULT 'general',
    url TEXT NOT NULL,
    enabled BOOLEAN DEFAULT TRUE
  );`,

  `CREATE TABLE IF NOT EXISTS admin_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    admin_password VARCHAR(255) NOT NULL,
    default_timer_duration INTEGER DEFAULT 30,
    default_scoring_mode VARCHAR(20) DEFAULT 'fixed',
    default_game_mode VARCHAR(20) DEFAULT 'single'
  );`,

  `CREATE TABLE IF NOT EXISTS promo_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    eyebrow_badge VARCHAR(150) DEFAULT 'SRDB PRESENTS',
    producer_tag VARCHAR(150) DEFAULT 'FROM THE PRODUCER DC',
    tagline VARCHAR(250) DEFAULT 'THE ULTIMATE BATTLE OF MINDS • GRAND TELECAST',
    hashtag VARCHAR(100) DEFAULT '# udan panam',
    card1_tag VARCHAR(100) DEFAULT 'ELIGIBILITY',
    card1_title VARCHAR(150) DEFAULT 'FOR CLASSES 1 TO 10',
    card1_desc TEXT DEFAULT '1 മുതൽ 10 വരെയുള്ള ക്ലാസ്സുകളിലെ മിടുക്കന്മാർക്കായി',
    card2_tag VARCHAR(100) DEFAULT 'CONTESTANT RULE',
    card2_title VARCHAR(150) DEFAULT 'ONE PARTICIPANT PER CLASS',
    card2_desc TEXT DEFAULT 'ഓരോ ക്ലാസ്സിൽ നിന്നും തിരഞ്ഞെടുക്കപ്പെടുന്ന ഒരു പ്രതിഭ വീതം!',
    card3_tag VARCHAR(100) DEFAULT 'STAGE CONDUCTORS',
    card3_chairman VARCHAR(150) DEFAULT 'ADHIL S',
    card3_convenor VARCHAR(150) DEFAULT 'MUSTHAQEEM MUHAMMED',
    card3_desc TEXT DEFAULT 'നേതൃത്വം: ചെയർമാൻ ആദിൽ എസ് & കൺവീനർ മുസ്തഖീം മുഹമ്മദ്',
    card4_tag VARCHAR(100) DEFAULT 'MEGA REWARDS',
    card4_title VARCHAR(150) DEFAULT 'PARTICIPATE & WIN VALUABLE PRIZES!',
    card4_desc TEXT DEFAULT 'പങ്കെടുക്കൂ, ആകർഷകവും അമൂല്യവുമായ സമ്മാനങ്ങൾ നേടൂ!',
    reel_speed INTEGER DEFAULT 5500,
    reel_auto_loop BOOLEAN DEFAULT TRUE,
    sound_enabled BOOLEAN DEFAULT TRUE,
    active_scene VARCHAR(20) DEFAULT 'all'
  );`,

  // Safe Column Migrations
  `ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS audio_url TEXT,
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS video_url TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS tags TEXT[],
    ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 10,
    ADD COLUMN IF NOT EXISTS timer_override INTEGER,
    ADD COLUMN IF NOT EXISTS explanation TEXT,
    ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS presented BOOLEAN DEFAULT FALSE;`,

  `ALTER TABLE presentation_state
    ADD COLUMN IF NOT EXISTS timer_running BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS timer_remaining INTEGER DEFAULT 30,
    ADD COLUMN IF NOT EXISTS active_session_id INTEGER,
    ADD COLUMN IF NOT EXISTS active_contestant_id INTEGER,
    ADD COLUMN IF NOT EXISTS active_lifeline VARCHAR(20),
    ADD COLUMN IF NOT EXISTS show_timer BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS show_scoreboard BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS show_explanation BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS game_mode VARCHAR(20) DEFAULT 'single',
    ADD COLUMN IF NOT EXISTS cast_sync_mode VARCHAR(20) DEFAULT 'mirror',
    ADD COLUMN IF NOT EXISTS cast_screen VARCHAR(20) DEFAULT 'promo',
    ADD COLUMN IF NOT EXISTS cast_scene VARCHAR(20) DEFAULT 'all',
    ADD COLUMN IF NOT EXISTS cast_blackout BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS stage_blackout BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS stage_dock_visible BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS cast_ticker_text TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS cast_ticker_visible BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS cast_watermark_visible BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS cast_sound_enabled BOOLEAN DEFAULT FALSE;`,

  `ALTER TABLE studio_settings
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS bg_image_url TEXT,
    ADD COLUMN IF NOT EXISTS bg_video_url TEXT,
    ADD COLUMN IF NOT EXISTS transition_style VARCHAR(20) DEFAULT 'fade',
    ADD COLUMN IF NOT EXISTS option_reveal_style VARCHAR(20) DEFAULT 'staggered',
    ADD COLUMN IF NOT EXISTS correct_sound_url TEXT,
    ADD COLUMN IF NOT EXISTS wrong_sound_url TEXT,
    ADD COLUMN IF NOT EXISTS timer_sound_url TEXT,
    ADD COLUMN IF NOT EXISTS bg_music_url TEXT,
    ADD COLUMN IF NOT EXISTS theme_preset VARCHAR(30) DEFAULT 'emerald-gold',
    ADD COLUMN IF NOT EXISTS ui_language VARCHAR(10) DEFAULT 'ml';`
];

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

const seedPromoSettings = `
  INSERT INTO promo_settings (id)
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
    ('Next Question Drop', 'transition', ''),
    ('Options Reveal Chime', 'options_reveal', ''),
    ('Timer Tension & Tick', 'timer', ''),
    ('Lock Answer (Freeze)', 'lock', ''),
    ('Correct Answer Fanfare', 'correct', ''),
    ('Wrong Answer Drop', 'wrong', ''),
    ('ATM Cash Dispenser', 'atm_cash', ''),
    ('Lifeline Activation', 'lifeline', ''),
    ('Answer Reveal Stinger', 'reveal', ''),
    ('Celebration Confetti', 'celebration', ''),
    ('Background BGM Loop', 'background', ''),
    ('Timer Expired Buzzer', 'expired', ''),
    ('Mock: Laughter', 'mocking_laughter', ''),
    ('Mock: Booing', 'mocking_booing', ''),
    ('Mock: Sad Trombone', 'mocking_trombone', ''),
    ('Mock: Gasps/Shock', 'mocking_shock', '')
  ON CONFLICT DO NOTHING;
`;

const seedQuestions = `
  INSERT INTO questions (level, question_text, option_a, option_b, option_c, option_d, correct_answer, points) VALUES
  (1, '1. നിലവിൽ കേരള നിയമസഭയിലെ പ്രതിപക്ഷ നേതാവ് ആരാണ്?', 'എ. കെ. ശശീന്ദ്രൻ', 'രമേശ് ചെന്നിത്തല', 'വി. ഡി. സതീശൻ', 'പി. കെ. കുഞ്ഞാലിക്കുട്ടി', 'C', 10),
  (1, '2. സ്വതന്ത്ര ഇന്ത്യയുടെ ചരിത്രത്തിൽ തുടർച്ചയായി മൂന്നാം തവണയും പ്രധാനമന്ത്രിയായ രണ്ടാമത്തെ വ്യക്തി ആരാണ്?', 'മൻമോഹൻ സിംഗ്', 'നരേന്ദ്ര മോദി', 'ഇന്ദിരാ ഗാന്ധി', 'രാജീവ് ഗാന്ധി', 'B', 10),
  (1, '3. കേരള നിയമസഭയുടെ നിലവിലെ സ്പീക്കർ ആരാണ്?', 'എം. ബി. രാജേഷ്', 'പി. ശ്രീരാമകൃഷ്ണൻ', 'എ. എൻ. ഷംസീർ', 'കെ. രാധാകൃഷ്ണൻ', 'C', 10)
  ON CONFLICT DO NOTHING;
`;

const migrateOldDefaultTheme = `
  UPDATE studio_settings 
  SET 
    theme_preset = 'emerald-gold',
    theme_primary = '#10b981',
    theme_secondary = '#fbbf24',
    bg_dark = '#022c22',
    bg_card = 'rgba(6, 78, 59, 0.85)'
  WHERE id = 1 AND (theme_preset = 'neon-night' OR theme_preset IS NULL);
`;

let isInitialized = false;

/**
 * Ensures database tables, migrations, and seed data exist.
 * Idempotent: can be called multiple times without duplicate data.
 */
async function ensureInitialized(verbose = false) {
  if (isInitialized) return;

  if (verbose) console.log("  Checking and creating tables...");
  for (const q of schemaQueries) {
    await sql.query(q);
  }

  // Seed singletons
  await sql.query(seedPresentationState);
  await sql.query(seedStudioSettings);
  await sql.query(seedPromoSettings);

  // Seed default admin password ("1234") if not already present
  const adminRes = await sql.query('SELECT admin_password FROM admin_settings WHERE id = 1');
  if (adminRes.length === 0) {
    const hashedPassword = await bcrypt.hash('1234', 10);
    await sql.query(seedAdminSettings, [hashedPassword]);
    if (verbose) console.log("✅ Admin settings seeded (default password: 1234).");
  }

  // Seed default sounds
  await sql.query(seedDefaultSounds);
  if (verbose) console.log("✅ Default sound effects verified.");

  // Migrate theme preset if needed
  await sql.query(migrateOldDefaultTheme);

  // Seed questions if empty
  const qCountRes = await sql.query('SELECT count(*) FROM questions');
  if (parseInt(qCountRes[0].count) === 0) {
    if (verbose) console.log("  Seeding initial questions...");
    await sql.query(seedQuestions);
    if (verbose) console.log("✅ Initial questions seeded.");
  }

  isInitialized = true;
  if (verbose) console.log("✅ Table schemas and data are up to date.");
}

async function closeDB() {
  if (clientInstance && clientInstance.close) {
    await clientInstance.close();
    clientInstance = null;
    isInitialized = false;
  }
}

function getDBInfo() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.trim() === '' || dbUrl.trim().toLowerCase() === 'local') {
    return 'Local Persistent Database (PGlite at ./data/db)';
  }
  return `External Database (${dbUrl.includes('neon.tech') ? 'Neon' : 'PostgreSQL'})`;
}

module.exports = {
  sql,
  ensureInitialized,
  closeDB,
  getDBInfo
};
