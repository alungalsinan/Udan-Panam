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
const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

// Database & Services
const { sql, ensureInitialized, getDBInfo } = require('./db');
const { initCache } = require('./server/services/cache');
const { registerQuizSockets } = require('./server/sockets/quiz.socket');
const { apiLimiter, protectStaticFiles } = require('./server/middleware/auth');

// Modular Route Handlers
const authRoutes = require('./server/routes/auth.routes');
const questionsRoutes = require('./server/routes/questions.routes');
const presentationRoutes = require('./server/routes/presentation.routes');
const studioRoutes = require('./server/routes/studio.routes');
const sessionsRoutes = require('./server/routes/sessions.routes');
const contestantsRoutes = require('./server/routes/contestants.routes');
const answersRoutes = require('./server/routes/answers.routes');
const soundsRoutes = require('./server/routes/sounds.routes');
const analyticsRoutes = require('./server/routes/analytics.routes');
const settingsRoutes = require('./server/routes/settings.routes');
const promoRoutes = require('./server/routes/promo.routes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const port = process.env.PORT || 3000;

// Share io instance with Express routers
app.set('io', io);

// ─── Global Middleware ───
app.use(cors());
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  originAgentCluster: false
}));
app.use(express.json({ limit: '5mb' }));

// Rate limit API endpoints
app.use('/api/', apiLimiter);

// Protect sensitive files from static inspection
app.use(protectStaticFiles);
app.use(express.static(__dirname, { maxAge: '1d', etag: true }));

// ─── API Routes ───
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionsRoutes);
app.use('/api/presentation', presentationRoutes);
app.use('/api/studio', studioRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/contestants', contestantsRoutes);
app.use('/api/answers', answersRoutes);
app.use('/api/sounds', soundsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin-settings', settingsRoutes);
app.use('/api/backup', settingsRoutes);
app.use('/api/promo', promoRoutes);

// ─── Page Routes ───
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});
app.get('/cast', (req, res) => {
  res.sendFile(path.join(__dirname, 'cast.html'));
});
app.get('/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, 'mobile.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Real-Time WebSockets ───
registerQuizSockets(io);

// ─── Initialize Cache & Start Server ───
async function bootstrap() {
  await initCache(sql, ensureInitialized);

  server.listen(port, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`  🚀 UDAN PANAM v2.0 — LIVE BROADCAST PLATFORM`);
    console.log(`======================================================`);
    console.log(`  💾 Database:     ${getDBInfo()}`);
    console.log(`  📺 Presentation: http://localhost:${port}`);
    console.log(`  🎛️  Admin Panel:  http://localhost:${port}/admin`);
    console.log(`  🔌 Realtime:     Socket.IO Enabled`);
    console.log(`======================================================\n`);
  });
}

function gracefulShutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

bootstrap();

module.exports = app;
