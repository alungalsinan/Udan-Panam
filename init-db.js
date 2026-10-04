require('dotenv').config();

// Ensure Node 22+ WebAssembly Liftoff compiler mode is enabled to prevent V8 Turbofan Zone OOM in PGlite
if (parseInt(process.versions.node) >= 22 && !process.execArgv.includes('--liftoff-only') && !process.env.PG_LIFTOFF_SET) {
  const { fork } = require('child_process');
  process.env.PG_LIFTOFF_SET = '1';
  const child = fork(process.argv[1], process.argv.slice(2), {
    execArgv: ['--liftoff-only', ...process.execArgv],
    stdio: 'inherit'
  });
  child.on('exit', (code) => process.exit(code || 0));
  return;
}
const { ensureInitialized, closeDB, getDBInfo } = require('./db');

async function initDB() {
  try {
    console.log(`\n🔄 Initializing Database...`);
    console.log(`ℹ️  Database target: ${getDBInfo()}`);
    await ensureInitialized(true);
    console.log("\n🎉 Database initialization complete!\n");
  } catch (err) {
    console.error("❌ Database Error:", err.message);
    process.exit(1);
  } finally {
    await closeDB();
  }
}

initDB();
