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
    console.log("✅ Table 'questions' schema is up to date (level & audio_url added).");
    
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
