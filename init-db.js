require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

const createTableQuery = `
  CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    level INTEGER DEFAULT 1,
    question_text TEXT,
    audio_url TEXT,
    image_url TEXT,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_answer VARCHAR(1) NOT NULL
  );
`;

const createPresentationStateTableQuery = `
  CREATE TABLE IF NOT EXISTS presentation_state (
    id INTEGER PRIMARY KEY,
    current_question_id INTEGER REFERENCES questions(id) ON DELETE SET NULL,
    active_screen VARCHAR(20) DEFAULT 'welcome',
    show_question BOOLEAN DEFAULT TRUE,
    show_options BOOLEAN DEFAULT FALSE,
    reveal_answer BOOLEAN DEFAULT FALSE,
    audio_status VARCHAR(20) DEFAULT 'stopped',
    active_level INTEGER DEFAULT 1
  );
`;

const createStudioSettingsTableQuery = `
  CREATE TABLE IF NOT EXISTS studio_settings (
    id INTEGER PRIMARY KEY,
    welcome_title TEXT DEFAULT 'College Union Quiz 2026',
    welcome_subtitle TEXT DEFAULT 'The Ultimate Battle of Minds',
    theme_primary VARCHAR(50) DEFAULT '#00e5ff',
    theme_secondary VARCHAR(50) DEFAULT '#ffd700',
    bg_dark VARCHAR(50) DEFAULT '#070B19',
    bg_card VARCHAR(50) DEFAULT 'rgba(16, 24, 45, 0.8)',
    font_family VARCHAR(50) DEFAULT '''Anek Malayalam'', sans-serif',
    animation_enabled BOOLEAN DEFAULT TRUE
  );
`;

const seedPresentationStateQuery = `
  INSERT INTO presentation_state (id, active_screen, active_level, show_question, show_options, reveal_answer, audio_status)
  VALUES (1, 'welcome', 1, TRUE, FALSE, FALSE, 'stopped')
  ON CONFLICT (id) DO NOTHING;
`;

const seedStudioSettingsQuery = `
  INSERT INTO studio_settings (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;
`;

const alterTableQuery = `
  ALTER TABLE questions 
  ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT;
`;

const seedData = `
  INSERT INTO questions (question_text, option_a, option_b, option_c, option_d, correct_answer) VALUES
  ('1. നിലവിൽ കേരള നിയമസഭയിലെ പ്രതിപക്ഷ നേതാവ് ആരാണ്?', 'എ. കെ. ശശീന്ദ്രൻ', 'രമേശ് ചെന്നിത്തല', 'വി. ഡി. സതീശൻ', 'പി. കെ. കുഞ്ഞാലിക്കുട്ടി', 'C'),
  ('2. സ്വതന്ത്ര ഇന്ത്യയുടെ ചരിത്രത്തിൽ തുടർച്ചയായി മൂന്നാം തവണയും പ്രധാനമന്ത്രിയായ രണ്ടാമത്തെ വ്യക്തി ആരാണ്?', 'മൻമോഹൻ സിംഗ്', 'നരേന്ദ്ര മോദി', 'ഇന്ദിരാ ഗാന്ധി', 'രാജീവ് ഗാന്ധി', 'B'),
  ('3. കേരള നിയമസഭയുടെ നിലവിലെ സ്പീക്കർ ആരാണ്?', 'എം. ബി. രാജേഷ്', 'പി. ശ്രീരാമകൃഷ്ണൻ', 'എ. എൻ. ഷംസീർ', 'കെ. രാധാകൃഷ്ണൻ', 'C')
  ON CONFLICT DO NOTHING;
`;

async function initDB() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ ERROR: No DATABASE_URL found in .env file.");
    process.exit(1);
  }

  try {
    console.log("Connecting to the database and setting up schema...");
    await sql.query(createTableQuery);
    await sql.query(alterTableQuery);
    await sql.query(createPresentationStateTableQuery);
    await sql.query(seedPresentationStateQuery);
    await sql.query(createStudioSettingsTableQuery);
    await sql.query(seedStudioSettingsQuery);
    console.log("✅ Table schemas are up to date.");
    
    // Check if table is empty
    const res = await sql.query('SELECT count(*) FROM questions');
    if (parseInt(res[0].count) === 0) {
      console.log("Seeding initial data...");
      await sql.query(seedData);
      console.log("✅ Initial data seeded.");
    }
  } catch (err) {
    console.error("❌ Database Error:", err.message);
  }
}

initDB();
