/* ═══════════════════════════════════════
   Udan Panam v2.0 — Admin Panel JS
   Real-Time Event Driven (Socket.IO)
   ═══════════════════════════════════════ */

let socket = null;
let currentToken = localStorage.getItem('admin_token') || '';
let currentQuestions = [];
let currentQuestionIndex = -1;
let currentLevel = 1;
let currentTab = 'live';

// Question Manager Pagination & Filters
let qPage = 1;
let qLimit = 20;
let qSearch = '';
let qLevelFilter = '';

// Theme Preset Colors
const themePresets = {
  'neon-night': { primary: '#00e5ff', secondary: '#ffd700', bg: '#070B19', card: 'rgba(16, 24, 45, 0.8)' },
  'sunset-blaze': { primary: '#ff6b6b', secondary: '#ffd93d', bg: '#1a0a0a', card: 'rgba(40, 15, 15, 0.8)' },
  'ocean-deep': { primary: '#0abde3', secondary: '#10ac84', bg: '#0a1628', card: 'rgba(10, 22, 40, 0.8)' },
  'minimal-white': { primary: '#333333', secondary: '#666666', bg: '#f5f5f5', card: 'rgba(235, 235, 235, 0.9)' },
  'retro-arcade': { primary: '#ff00ff', secondary: '#00ff00', bg: '#0d0221', card: 'rgba(13, 2, 33, 0.8)' }
};

// DOM Elements
const loginOverlay = document.getElementById('login-overlay');
const loginForm = document.getElementById('login-form');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const adminLayout = document.getElementById('admin-layout');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const connectionStatus = document.getElementById('connection-status');
const pageTitle = document.getElementById('page-title');
const toastContainer = document.getElementById('toast-container');
const logoutBtn = document.getElementById('logout-btn');

// Initialize Auth
document.addEventListener('DOMContentLoaded', () => {
  if (currentToken) {
    verifyToken(currentToken);
  } else {
    showLogin();
  }
});

// ─── Authentication ───
function showLogin() {
  loginOverlay.classList.add('active');
  adminLayout.style.display = 'none';
}

function hideLogin() {
  loginOverlay.classList.remove('active');
  adminLayout.style.display = 'flex';
  initDashboard();
}

async function verifyToken(token) {
  try {
    const res = await fetch('/api/auth/verify', {
      headers: { 'x-admin-token': token }
    });
    if (res.ok) {
      currentToken = token;
      hideLogin();
    } else {
      localStorage.removeItem('admin_token');
      showLogin();
    }
  } catch (err) {
    showNotification('Auth verification failed. Offline?', 'error');
    showLogin();
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = loginPassword.value;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('admin_token', data.token);
      currentToken = data.token;
      loginPassword.value = '';
      hideLogin();
    } else {
      loginError.textContent = data.error || 'Login failed';
    }
  } catch (err) {
    loginError.textContent = 'Server error during login';
  }
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('admin_token');
  currentToken = '';
  if (socket) socket.disconnect();
  showLogin();
});

// ─── Dashboard Initialization ───
function initDashboard() {
  // Connect Socket.IO
  socket = io();
  
  socket.on('connect', () => {
    connectionStatus.textContent = 'Connected';
    connectionStatus.className = 'connection-pill green';
    socket.emit('join', 'admin');
  });

  socket.on('disconnect', () => {
    connectionStatus.textContent = 'Disconnected';
    connectionStatus.className = 'connection-pill red';
  });

  socket.on('state:sync', (state) => {
    syncLiveControls(state);
  });

  socket.on('timer:tick', (data) => {
    document.getElementById('live-timer-text').textContent = data.remaining;
  });

  // Tab Setup
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tabName = item.dataset.tab;
      switchTab(tabName);
    });
  });

  // Sidebar toggle
  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });

  // Initial tab loading
  switchTab('live');
  loadLiveControlData();
  setupLiveControlListeners();
  setupQuestionsListeners();
  setupContestantsListeners();
  setupSessionsListeners();
  setupStudioListeners();
  setupSoundsListeners();
  setupSettingsListeners();
  setupKeyboardShortcuts();
}

// ─── Tab Switcher ───
function switchTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.dataset.tab === tabName) item.classList.add('active');
    else item.classList.remove('active');
  });

  document.querySelectorAll('.tab-section').forEach(sec => {
    if (sec.id === `tab-${tabName}`) sec.classList.add('active');
    else sec.classList.remove('active');
  });

  // Page title mapping
  const titles = {
    live: 'Live Control Room',
    questions: 'Question Bank Manager',
    contestants: 'Contestant Roster',
    sessions: 'Game Sessions Manager',
    studio: 'Studio Theming Panel',
    sounds: 'Sound Board Control',
    analytics: 'Show Performance Analytics',
    preview: 'Simulator Screen View',
    settings: 'Dashboard Configuration'
  };
  pageTitle.textContent = titles[tabName] || 'Admin Control Room';

  // Load specific data on tab switch
  if (tabName === 'questions') loadQuestionsTable();
  if (tabName === 'contestants') { loadContestantsList(); loadSessionsDropdowns(); }
  if (tabName === 'sessions') loadSessionsGrid();
  if (tabName === 'studio') loadStudioSettings();
  if (tabName === 'sounds') loadSoundEffectsBoard();
  if (tabName === 'analytics') loadAnalyticsTab();
  if (tabName === 'preview') {
    const iframe = document.getElementById('preview-iframe');
    iframe.src = '/';
  }
}

// ═════════════════════════════════════════════
// 🎮 Tab 1: Live Control
// ═════════════════════════════════════════════
async function loadLiveControlData() {
  try {
    const [sessions, contestants] = await Promise.all([
      fetch('/api/sessions', { headers: { 'x-admin-token': currentToken } }).then(r => r.json()),
      fetch('/api/contestants', { headers: { 'x-admin-token': currentToken } }).then(r => r.json())
    ]);

    // Populate dropdowns
    const sessionSel = document.getElementById('live-session-select');
    sessionSel.innerHTML = '<option value="">No Active Session</option>';
    sessions.forEach(s => {
      if (s.status !== 'completed') {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} (${s.game_mode})`;
        sessionSel.appendChild(opt);
      }
    });

    const contestantSel = document.getElementById('live-contestant-select');
    contestantSel.innerHTML = '<option value="">No Active Contestant</option>';
    contestants.forEach(c => {
      if (c.is_active) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        contestantSel.appendChild(opt);
      }
    });

    loadQuestionsForLevel(currentLevel);
  } catch (err) {
    showNotification('Error loading live controller dependencies', 'error');
  }
}

async function loadQuestionsForLevel(level) {
  try {
    const res = await fetch(`/api/questions?level=${level}`, {
      headers: { 'x-admin-token': currentToken }
    });
    currentQuestions = await res.json();
    currentQuestionIndex = -1;

    // Check current state to sync matching question index
    const stateRes = await fetch('/api/presentation/state');
    const state = await stateRes.json();
    if (state && state.current_question_id) {
      currentQuestionIndex = currentQuestions.findIndex(q => q.id === state.current_question_id);
    }
    updateLiveQuestionDisplay();
  } catch (err) {
    showNotification('Error loading questions for level', 'error');
  }
}

function updateLiveQuestionDisplay() {
  const progressDiv = document.getElementById('live-question-progress');
  const textDiv = document.getElementById('live-question-text');

  if (currentQuestionIndex >= 0 && currentQuestionIndex < currentQuestions.length) {
    const q = currentQuestions[currentQuestionIndex];
    progressDiv.textContent = `Question ${currentQuestionIndex + 1} of ${currentQuestions.length} (L${q.level})`;
    textDiv.textContent = q.question_text;
  } else {
    progressDiv.textContent = 'No Question Active';
    textDiv.textContent = 'Use Next/Prev to punch a question onto the screen.';
  }
}

function setupLiveControlListeners() {
  // Screen Switched
  document.getElementById('screen-welcome-btn').addEventListener('click', () => {
    socket.emit('state:update', { active_screen: 'welcome' });
  });
  document.getElementById('screen-quiz-btn').addEventListener('click', () => {
    socket.emit('state:update', { active_screen: 'quiz' });
  });

  // Level selector
  const levels = [1, 2, 3];
  levels.forEach(lvl => {
    document.getElementById(`level-${lvl}-btn`).addEventListener('click', (e) => {
      document.querySelectorAll('[id^="level-"]').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      currentLevel = lvl;
      loadQuestionsForLevel(lvl);
      socket.emit('state:update', { active_level: lvl });
    });
  });

  // Game Mode
  document.getElementById('mode-single-btn').addEventListener('click', () => {
    socket.emit('state:update', { game_mode: 'single' });
  });
  document.getElementById('mode-team-btn').addEventListener('click', () => {
    socket.emit('state:update', { game_mode: 'team' });
  });

  // Session / Contestant Selects
  document.getElementById('live-session-select').addEventListener('change', (e) => {
    const val = e.target.value ? parseInt(e.target.value) : null;
    socket.emit('state:update', { active_session_id: val });
  });
  document.getElementById('live-contestant-select').addEventListener('change', (e) => {
    const val = e.target.value ? parseInt(e.target.value) : null;
    socket.emit('state:update', { active_contestant_id: val });
  });

  // Prev / Next Dispatch
  document.getElementById('prev-question-btn').addEventListener('click', () => {
    if (currentQuestionIndex > 0) {
      currentQuestionIndex--;
      dispatchActiveQuestion();
    }
  });

  document.getElementById('next-question-btn').addEventListener('click', () => {
    if (currentQuestionIndex < currentQuestions.length - 1) {
      currentQuestionIndex++;
      dispatchActiveQuestion();
    }
  });

  // Toggles
  setupLiveToggle('toggle-question-btn', 'show_question');
  setupLiveToggle('toggle-options-btn', 'show_options');
  setupLiveToggle('reveal-answer-btn', 'reveal_answer');
  setupLiveToggle('toggle-explanation-btn', 'show_explanation');

  // Timer controls
  document.getElementById('timer-start-btn').addEventListener('click', () => {
    const durInput = parseInt(document.getElementById('session-timer-input').value) || 30;
    socket.emit('timer:start', { duration: durInput });
  });
  document.getElementById('timer-pause-btn').addEventListener('click', () => {
    socket.emit('timer:pause');
  });
  document.getElementById('timer-stop-btn').addEventListener('click', () => {
    socket.emit('timer:stop');
  });

  // Lifelines
  document.getElementById('lifeline-fifty-btn').addEventListener('click', () => {
    socket.emit('lifeline:fifty-fifty');
    markLifelineUsedOnActiveContestant('5050');
  });
  document.getElementById('lifeline-poll-btn').addEventListener('click', () => {
    socket.emit('lifeline:audience-poll');
    markLifelineUsedOnActiveContestant('audience');
  });

  // Remote audio trigger controls
  document.getElementById('audio-play-btn').addEventListener('click', () => {
    socket.emit('state:update', { audio_status: 'playing' });
  });
  document.getElementById('audio-pause-btn').addEventListener('click', () => {
    socket.emit('state:update', { audio_status: 'paused' });
  });
  document.getElementById('audio-stop-btn').addEventListener('click', () => {
    socket.emit('state:update', { audio_status: 'stopped' });
  });

  // Confetti / Suspense
  document.getElementById('trigger-confetti-btn').addEventListener('click', () => {
    socket.emit('celebration:trigger');
  });
  document.getElementById('sound-suspense-btn').addEventListener('click', () => {
    socket.emit('sound:play', { category: 'reveal' });
  });
}

function setupLiveToggle(btnId, stateField) {
  const btn = document.getElementById(btnId);
  btn.addEventListener('click', () => {
    const nextVal = !btn.classList.contains('active');
    socket.emit('state:update', { [stateField]: nextVal });
  });
}

function dispatchActiveQuestion() {
  if (currentQuestionIndex >= 0 && currentQuestionIndex < currentQuestions.length) {
    const q = currentQuestions[currentQuestionIndex];
    // Reset toggle states on next question dispatch
    socket.emit('state:update', {
      current_question_id: q.id,
      show_question: true,
      show_options: false,
      reveal_answer: false,
      show_explanation: false,
      audio_status: 'stopped',
      timer_running: false,
      timer_remaining: q.timer_override || 30
    });
    updateLiveQuestionDisplay();
  }
}

async function markLifelineUsedOnActiveContestant(lifeline) {
  const contSelect = document.getElementById('live-contestant-select');
  const contId = contSelect.value;
  if (!contId) return;

  try {
    const res = await fetch(`/api/contestants/${contId}`, { headers: { 'x-admin-token': currentToken } });
    const contestant = await res.json();
    let used = typeof contestant.lifelines_used === 'string' 
      ? JSON.parse(contestant.lifelines_used) 
      : (contestant.lifelines_used || []);
    
    if (!used.includes(lifeline)) {
      used.push(lifeline);
      await fetch(`/api/contestants/${contId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
        body: JSON.stringify({ lifelines_used: used })
      });
      showNotification(`Lifeline ${lifeline} marked as used.`);
    }
  } catch (err) {
    console.error('Error updating contestant lifeline', err);
  }
}

function syncLiveControls(state) {
  // Sync Screen Buttons
  const welcomeBtn = document.getElementById('screen-welcome-btn');
  const quizBtn = document.getElementById('screen-quiz-btn');
  if (state.active_screen === 'welcome') {
    welcomeBtn.classList.add('active'); quizBtn.classList.remove('active');
  } else {
    welcomeBtn.classList.remove('active'); quizBtn.classList.add('active');
  }

  // Sync Level Buttons
  document.querySelectorAll('[id^="level-"]').forEach(btn => btn.classList.remove('active'));
  const activeLevelBtn = document.getElementById(`level-${state.active_level}-btn`);
  if (activeLevelBtn) activeLevelBtn.classList.add('active');

  // Sync Game Mode
  const singleBtn = document.getElementById('mode-single-btn');
  const teamBtn = document.getElementById('mode-team-btn');
  if (state.game_mode === 'team') {
    teamBtn.classList.add('active'); singleBtn.classList.remove('active');
  } else {
    singleBtn.classList.add('active'); teamBtn.classList.remove('active');
  }

  // Sync Select Dropdowns
  document.getElementById('live-session-select').value = state.active_session_id || '';
  document.getElementById('live-contestant-select').value = state.active_contestant_id || '';

  // Sync Visibility Toggles
  toggleButtonState('toggle-question-btn', state.show_question);
  toggleButtonState('toggle-options-btn', state.show_options);
  toggleButtonState('reveal-answer-btn', state.reveal_answer);
  toggleButtonState('toggle-explanation-btn', state.show_explanation);

  // Set Local Question dispatch tracking
  if (state.current_question_id && currentQuestions.length > 0) {
    const idx = currentQuestions.findIndex(q => q.id === state.current_question_id);
    if (idx !== -1 && idx !== currentQuestionIndex) {
      currentQuestionIndex = idx;
      updateLiveQuestionDisplay();
    }
  }
}

function toggleButtonState(btnId, isActive) {
  const btn = document.getElementById(btnId);
  if (isActive) btn.classList.add('active');
  else btn.classList.remove('active');
}

// ═════════════════════════════════════════════
// 📋 Tab 2: Questions CRUD
// ═════════════════════════════════════════════
async function loadQuestionsTable() {
  try {
    let url = `/api/questions?page=${qPage}&limit=${qLimit}`;
    if (qSearch) url += `&search=${encodeURIComponent(qSearch)}`;
    if (qLevelFilter) url += `&level=${qLevelFilter}`;

    const res = await fetch(url, { headers: { 'x-admin-token': currentToken } });
    const questions = await res.json();

    const tbody = document.getElementById('questions-table-body');
    tbody.innerHTML = '';

    questions.forEach((q) => {
      const tr = document.createElement('tr');
      
      const tdDrag = document.createElement('td');
      tdDrag.className = 'drag-handle';
      tdDrag.textContent = '☰';
      tr.appendChild(tdDrag);

      const tdId = document.createElement('td');
      tdId.textContent = q.id;
      tr.appendChild(tdId);

      const tdLevel = document.createElement('td');
      tdLevel.textContent = `Lvl ${q.level}`;
      tr.appendChild(tdLevel);

      const tdText = document.createElement('td');
      tdText.className = 'question-text';
      tdText.textContent = q.question_text.length > 60 ? q.question_text.substring(0, 60) + '...' : q.question_text;
      tr.appendChild(tdText);

      const tdCat = document.createElement('td');
      tdCat.textContent = q.category || 'General';
      tr.appendChild(tdCat);

      const tdPts = document.createElement('td');
      tdPts.textContent = q.points;
      tr.appendChild(tdPts);

      const tdAct = document.createElement('td');
      tdAct.innerHTML = `
        <button class="action-row-btn edit" data-id="${q.id}">✏️</button>
        <button class="action-row-btn delete" data-id="${q.id}">❌</button>
      `;
      tr.appendChild(tdAct);

      tbody.appendChild(tr);
    });

    // Add CRUD event delegation
    tbody.querySelectorAll('.edit').forEach(btn => {
      btn.addEventListener('click', () => openEditQuestionModal(btn.dataset.id));
    });
    tbody.querySelectorAll('.delete').forEach(btn => {
      btn.addEventListener('click', () => deleteQuestion(btn.dataset.id));
    });

    renderPaginationControls();
  } catch (err) {
    showNotification('Error loading question bank table', 'error');
  }
}

function renderPaginationControls() {
  const container = document.getElementById('questions-pagination');
  container.innerHTML = '';

  const prev = document.createElement('button');
  prev.className = 'page-btn';
  prev.textContent = '◀';
  prev.disabled = qPage === 1;
  prev.addEventListener('click', () => { if (qPage > 1) { qPage--; loadQuestionsTable(); } });
  container.appendChild(prev);

  const current = document.createElement('button');
  current.className = 'page-btn active';
  current.textContent = qPage;
  container.appendChild(current);

  const next = document.createElement('button');
  next.className = 'page-btn';
  next.textContent = '▶';
  next.addEventListener('click', () => { qPage++; loadQuestionsTable(); });
  container.appendChild(next);
}

function setupQuestionsListeners() {
  const search = document.getElementById('question-search-input');
  const levelFilter = document.getElementById('question-level-filter');
  
  // Debounce search input
  let searchTimeout = null;
  search.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      qSearch = search.value;
      qPage = 1;
      loadQuestionsTable();
    }, 300);
  });

  levelFilter.addEventListener('change', () => {
    qLevelFilter = levelFilter.value;
    qPage = 1;
    loadQuestionsTable();
  });

  // Modal open / close
  document.getElementById('add-question-btn').addEventListener('click', () => openAddQuestionModal());
  document.getElementById('close-question-modal').addEventListener('click', () => {
    document.getElementById('question-modal').classList.remove('active');
  });

  document.getElementById('question-form').addEventListener('submit', saveQuestionForm);

  // Bulk actions
  document.getElementById('clear-all-questions-btn').addEventListener('click', deleteAllQuestions);
  document.getElementById('export-btn').addEventListener('click', exportQuestionsJSON);
  document.getElementById('template-btn').addEventListener('click', downloadTemplateJSON);
  
  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
  });
  document.getElementById('import-file-input').addEventListener('change', importQuestionsJSON);
}

function openAddQuestionModal() {
  document.getElementById('modal-title').textContent = 'Add New Question';
  document.getElementById('form-question-id').value = '';
  document.getElementById('question-form').reset();
  document.getElementById('question-modal').classList.add('active');
}

async function openEditQuestionModal(id) {
  try {
    const res = await fetch(`/api/questions?limit=1000`, { headers: { 'x-admin-token': currentToken } });
    const questions = await res.json();
    const q = questions.find(item => item.id == id);
    if (!q) return;

    document.getElementById('modal-title').textContent = 'Edit Question';
    document.getElementById('form-question-id').value = q.id;
    document.getElementById('form-level').value = q.level;
    document.getElementById('form-question-text').value = q.question_text;
    document.getElementById('form-audio-url').value = q.audio_url || '';
    document.getElementById('form-image-url').value = q.image_url || '';
    document.getElementById('form-video-url').value = q.video_url || '';
    document.getElementById('form-option-a').value = q.option_a;
    document.getElementById('form-option-b').value = q.option_b;
    document.getElementById('form-option-c').value = q.option_c;
    document.getElementById('form-option-d').value = q.option_d;
    document.getElementById('form-correct-answer').value = q.correct_answer;
    document.getElementById('form-category').value = q.category || '';
    document.getElementById('form-points').value = q.points;
    document.getElementById('form-timer-override').value = q.timer_override || '';
    document.getElementById('form-explanation').value = q.explanation || '';

    document.getElementById('question-modal').classList.add('active');
  } catch (err) {
    showNotification('Error loading question info for edit', 'error');
  }
}

async function saveQuestionForm(e) {
  e.preventDefault();
  const id = document.getElementById('form-question-id').value;
  const payload = {
    level: parseInt(document.getElementById('form-level').value),
    question_text: document.getElementById('form-question-text').value,
    audio_url: document.getElementById('form-audio-url').value || null,
    image_url: document.getElementById('form-image-url').value || null,
    video_url: document.getElementById('form-video-url').value || null,
    option_a: document.getElementById('form-option-a').value,
    option_b: document.getElementById('form-option-b').value,
    option_c: document.getElementById('form-option-c').value,
    option_d: document.getElementById('form-option-d').value,
    correct_answer: document.getElementById('form-correct-answer').value,
    category: document.getElementById('form-category').value || null,
    points: parseInt(document.getElementById('form-points').value) || 10,
    timer_override: parseInt(document.getElementById('form-timer-override').value) || null,
    explanation: document.getElementById('form-explanation').value || null
  };

  try {
    let res;
    if (id) {
      res = await fetch(`/api/questions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(`/api/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
        body: JSON.stringify(payload)
      });
    }

    if (res.ok) {
      showNotification(id ? 'Question updated' : 'Question created');
      document.getElementById('question-modal').classList.remove('active');
      loadQuestionsTable();
      loadLiveControlData();
    } else {
      const errData = await res.json();
      showNotification(errData.error || 'Failed to save question', 'error');
    }
  } catch (err) {
    showNotification('Network error saving question', 'error');
  }
}

async function deleteQuestion(id) {
  if (!confirm('Are you sure you want to delete this question?')) return;
  try {
    const res = await fetch(`/api/questions/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': currentToken }
    });
    if (res.ok) {
      showNotification('Question deleted');
      loadQuestionsTable();
      loadLiveControlData();
    }
  } catch (err) {
    showNotification('Error deleting question', 'error');
  }
}

async function deleteAllQuestions() {
  const p1 = confirm('⚠️ CRITICAL: Are you sure you want to delete ALL questions?');
  if (!p1) return;
  const p2 = confirm('Confirm again: This action CANNOT be undone and will empty your question bank.');
  if (!p2) return;

  try {
    const res = await fetch(`/api/questions`, {
      method: 'DELETE',
      headers: { 'x-admin-token': currentToken }
    });
    if (res.ok) {
      showNotification('All questions deleted successfully');
      loadQuestionsTable();
      loadLiveControlData();
    }
  } catch (err) {
    showNotification('Error wiping question bank', 'error');
  }
}

async function exportQuestionsJSON() {
  try {
    const res = await fetch('/api/questions?limit=1000', { headers: { 'x-admin-token': currentToken } });
    const questions = await res.json();
    
    // Strip database IDs for a clean template structure
    const exported = questions.map(({ id, sort_order, ...clean }) => clean);

    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `udan-panam-questions-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Questions exported');
  } catch (err) {
    showNotification('Error exporting questions', 'error');
  }
}

function downloadTemplateJSON() {
  const template = [
    {
      level: 1,
      question_text: "കേരളത്തിലെ ആദ്യത്തെ മുഖ്യമന്ത്രി ആര്?",
      option_a: "ഇ. എം. എസ്. നമ്പൂതിരിപ്പാട്",
      option_b: "പട്ടം താണുപിള്ള",
      option_c: "സി. അച്യുതമേനോൻ",
      option_d: "ആർ. ശങ്കർ",
      correct_answer: "A",
      category: "Kerala GK",
      points: 10,
      timer_override: 30,
      explanation: "1957-ൽ ഇ. എം. എസ്. കേരളത്തിലെ ആദ്യ മന്ത്രിസഭ നയിച്ചു."
    }
  ];
  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'udan-panam-template.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importQuestionsJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (!Array.isArray(data)) {
        showNotification('JSON must be an array of question objects', 'error');
        return;
      }

      const res = await fetch('/api/questions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        showNotification('Bulk questions imported successfully');
        loadQuestionsTable();
        loadLiveControlData();
      } else {
        const errData = await res.json();
        showNotification(errData.error || 'Import failed', 'error');
      }
    } catch (err) {
      showNotification('Error parsing JSON file', 'error');
    }
  };
  reader.readAsText(file);
}

// ═════════════════════════════════════════════
// 👥 Tab 3: Contestants Manager
// ═════════════════════════════════════════════
async function loadContestantsList() {
  try {
    const res = await fetch('/api/contestants', { headers: { 'x-admin-token': currentToken } });
    const contestants = await res.json();

    const grid = document.getElementById('contestants-grid');
    grid.innerHTML = '';

    contestants.forEach(c => {
      const card = document.createElement('div');
      card.className = 'contestant-card';
      
      let used = [];
      try {
        used = typeof c.lifelines_used === 'string' ? JSON.parse(c.lifelines_used) : (c.lifelines_used || []);
      } catch(e) {}

      card.innerHTML = `
        <div class="contestant-card-header">
          <div class="contestant-avatar-circle" style="background-color: ${c.avatar_color || '#00e5ff'}"></div>
          <div style="flex: 1;">
            <div class="contestant-name-title">${escapeHTML(c.name)}</div>
            <div class="contestant-score-tag">Points: <span id="score-${c.id}">${c.score}</span></div>
          </div>
          <button class="action-row-btn delete" data-id="${c.id}">❌</button>
        </div>
        <div class="form-group margin-top">
          <label>Lifelines Used</label>
          <div class="lifeline-indicators">
            <span class="badge ${used.includes('5050') ? 'completed' : 'created'}">50:50</span>
            <span class="badge ${used.includes('audience') ? 'completed' : 'created'}">Poll</span>
          </div>
        </div>
        <div class="grid-layout cols-3 gap-small margin-top">
          <button class="success-btn adjust-score" data-id="${c.id}" data-val="10">+10</button>
          <button class="danger-btn adjust-score" data-id="${c.id}" data-val="-10">-10</button>
          <button class="ghost-btn reset-score" data-id="${c.id}">Reset</button>
        </div>
      `;

      card.querySelector('.delete').addEventListener('click', () => deleteContestant(c.id));
      card.querySelectorAll('.adjust-score').forEach(btn => {
        btn.addEventListener('click', () => adjustContestantScore(c.id, parseInt(btn.dataset.val)));
      });
      card.querySelector('.reset-score').addEventListener('click', () => adjustContestantScore(c.id, -c.score));

      grid.appendChild(card);
    });
  } catch (err) {
    showNotification('Error loading contestants', 'error');
  }
}

function setupContestantsListeners() {
  document.getElementById('add-contestant-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('contestant-name-input').value,
      avatar_color: document.getElementById('contestant-color-picker').value,
      session_id: parseInt(document.getElementById('contestant-session-select').value) || null
    };

    try {
      const res = await fetch('/api/contestants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showNotification('Contestant created');
        document.getElementById('add-contestant-form').reset();
        loadContestantsList();
        loadLiveControlData();
      }
    } catch (err) {
      showNotification('Error adding contestant', 'error');
    }
  });

  // Sync hex code with color picker
  const picker = document.getElementById('contestant-color-picker');
  const txt = document.getElementById('contestant-color-text');
  picker.addEventListener('input', () => { txt.value = picker.value; });
  txt.addEventListener('input', () => { if (txt.value.match(/^#[0-9a-fA-F]{6}$/)) picker.value = txt.value; });
}

async function adjustContestantScore(id, val) {
  try {
    const res = await fetch(`/api/contestants/${id}`, { headers: { 'x-admin-token': currentToken } });
    const contestant = await res.json();
    const newScore = Math.max(0, contestant.score + val);

    const updateRes = await fetch(`/api/contestants/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
      body: JSON.stringify({ score: newScore })
    });
    if (updateRes.ok) {
      document.getElementById(`score-${id}`).textContent = newScore;
      showNotification(`Score adjusted by ${val > 0 ? '+' : ''}${val}`);
    }
  } catch (err) {
    showNotification('Error updating score', 'error');
  }
}

async function deleteContestant(id) {
  if (!confirm('Remove contestant?')) return;
  try {
    const res = await fetch(`/api/contestants/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': currentToken }
    });
    if (res.ok) {
      showNotification('Contestant removed');
      loadContestantsList();
      loadLiveControlData();
    }
  } catch (err) {
    showNotification('Error deleting contestant', 'error');
  }
}

async function loadSessionsDropdowns() {
  try {
    const res = await fetch('/api/sessions', { headers: { 'x-admin-token': currentToken } });
    const sessions = await res.json();
    const sel = document.getElementById('contestant-session-select');
    sel.innerHTML = '<option value="">Select a Game Session</option>';
    sessions.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      sel.appendChild(opt);
    });
  } catch(e) {}
}

// ═════════════════════════════════════════════
// 🏆 Tab 4: Game Sessions
// ═════════════════════════════════════════════
async function loadSessionsGrid() {
  try {
    const res = await fetch('/api/sessions', { headers: { 'x-admin-token': currentToken } });
    const sessions = await res.json();

    const grid = document.getElementById('sessions-grid');
    grid.innerHTML = '';

    sessions.forEach(s => {
      const card = document.createElement('div');
      card.className = 'session-card';
      
      const created = new Date(s.created_at).toLocaleDateString();

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h4 style="font-weight: 600;">${escapeHTML(s.name)}</h4>
            <div style="font-size: 0.75rem; color: var(--admin-text-muted); margin-top: 0.2rem;">Created: ${created}</div>
          </div>
          <span class="badge ${s.status}">${s.status}</span>
        </div>
        <div class="grid-layout cols-2 gap-small margin-top">
          <button class="primary-btn session-action" data-id="${s.id}" data-action="active" ${s.status === 'active' || s.status === 'completed' ? 'disabled' : ''}>Start</button>
          <button class="warning-btn session-action" data-id="${s.id}" data-action="paused" ${s.status !== 'active' ? 'disabled' : ''}>Pause</button>
          <button class="success-btn session-action" data-id="${s.id}" data-action="completed" ${s.status === 'completed' ? 'disabled' : ''}>Complete</button>
          <button class="danger-btn delete-session" data-id="${s.id}">Delete</button>
        </div>
      `;

      card.querySelectorAll('.session-action').forEach(btn => {
        btn.addEventListener('click', () => updateSessionStatus(s.id, btn.dataset.action));
      });
      card.querySelector('.delete-session').addEventListener('click', () => deleteSession(s.id));

      grid.appendChild(card);
    });
  } catch (err) {
    showNotification('Error loading game sessions', 'error');
  }
}

function setupSessionsListeners() {
  document.getElementById('create-session-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('session-name-input').value,
      scoring_mode: document.getElementById('session-scoring-select').value,
      timer_duration: parseInt(document.getElementById('session-timer-input').value) || 30,
      game_mode: document.getElementById('session-mode-select').value,
      notes: document.getElementById('session-notes-input').value || null
    };

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showNotification('Game session created');
        document.getElementById('create-session-form').reset();
        loadSessionsGrid();
        loadLiveControlData();
      }
    } catch (err) {
      showNotification('Error creating session', 'error');
    }
  });
}

async function updateSessionStatus(id, status) {
  try {
    const res = await fetch(`/api/sessions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      showNotification(`Session is now ${status}`);
      loadSessionsGrid();
      loadLiveControlData();
    }
  } catch (err) {
    showNotification('Error updating session status', 'error');
  }
}

async function deleteSession(id) {
  if (!confirm('Delete session? This will remove all associated contestants.')) return;
  try {
    const res = await fetch(`/api/sessions/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': currentToken }
    });
    if (res.ok) {
      showNotification('Session deleted');
      loadSessionsGrid();
      loadLiveControlData();
    }
  } catch (err) {
    showNotification('Error deleting session', 'error');
  }
}

// ═════════════════════════════════════════════
// 🎨 Tab 5: Studio settings
// ═════════════════════════════════════════════
async function loadStudioSettings() {
  try {
    const res = await fetch('/api/studio');
    const s = await res.json();
    if (!s) return;

    document.getElementById('theme-preset-select').value = s.theme_preset || 'neon-night';
    document.getElementById('theme-primary-picker').value = s.theme_primary || '#00e5ff';
    document.getElementById('theme-primary-text').value = s.theme_primary || '#00e5ff';
    document.getElementById('theme-secondary-picker').value = s.theme_secondary || '#ffd700';
    document.getElementById('theme-secondary-text').value = s.theme_secondary || '#ffd700';
    document.getElementById('theme-bg-picker').value = s.bg_dark || '#070B19';
    document.getElementById('theme-bg-text').value = s.bg_dark || '#070B19';
    document.getElementById('theme-card-text').value = s.bg_card || 'rgba(16, 24, 45, 0.8)';
    
    document.getElementById('theme-welcome-title').value = s.welcome_title || '';
    document.getElementById('theme-welcome-subtitle').value = s.welcome_subtitle || '';
    document.getElementById('theme-font-select').value = s.font_family || "'Anek Malayalam', sans-serif";
    document.getElementById('theme-logo-url').value = s.logo_url || '';
    document.getElementById('theme-bg-video-url').value = s.bg_video_url || '';
    document.getElementById('theme-bg-image-url').value = s.bg_image_url || '';

    // Radios
    const transStyle = s.transition_style || 'fade';
    document.querySelector(`input[name="transition-style"][value="${transStyle}"]`).checked = true;

    const revealStyle = s.option_reveal_style || 'staggered';
    document.querySelector(`input[name="reveal-style"][value="${revealStyle}"]`).checked = true;

    // Toggles
    document.getElementById('theme-animations-toggle').checked = s.animation_enabled !== false;
    document.getElementById('theme-lang-toggle').checked = s.ui_language === 'ml';

  } catch (err) {
    showNotification('Error loading studio settings', 'error');
  }
}

function setupStudioListeners() {
  // Preset Selection
  document.getElementById('theme-preset-select').addEventListener('change', (e) => {
    const preset = themePresets[e.target.value];
    if (preset) {
      document.getElementById('theme-primary-picker').value = preset.primary;
      document.getElementById('theme-primary-text').value = preset.primary;
      document.getElementById('theme-secondary-picker').value = preset.secondary;
      document.getElementById('theme-secondary-text').value = preset.secondary;
      document.getElementById('theme-bg-picker').value = preset.bg;
      document.getElementById('theme-bg-text').value = preset.bg;
      document.getElementById('theme-card-text').value = preset.card;
    }
  });

  // Color picker sync
  setupColorSync('theme-primary-picker', 'theme-primary-text');
  setupColorSync('theme-secondary-picker', 'theme-secondary-text');
  setupColorSync('theme-bg-picker', 'theme-bg-text');

  // Form Submit
  document.getElementById('studio-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      theme_preset: document.getElementById('theme-preset-select').value,
      theme_primary: document.getElementById('theme-primary-text').value,
      theme_secondary: document.getElementById('theme-secondary-text').value,
      bg_dark: document.getElementById('theme-bg-text').value,
      bg_card: document.getElementById('theme-card-text').value,
      welcome_title: document.getElementById('theme-welcome-title').value || null,
      welcome_subtitle: document.getElementById('theme-welcome-subtitle').value || null,
      font_family: document.getElementById('theme-font-select').value,
      logo_url: document.getElementById('theme-logo-url').value || null,
      bg_video_url: document.getElementById('theme-bg-video-url').value || null,
      bg_image_url: document.getElementById('theme-bg-image-url').value || null,
      transition_style: document.querySelector('input[name="transition-style"]:checked').value,
      option_reveal_style: document.querySelector('input[name="reveal-style"]:checked').value,
      animation_enabled: document.getElementById('theme-animations-toggle').checked,
      ui_language: document.getElementById('theme-lang-toggle').checked ? 'ml' : 'en'
    };

    try {
      const res = await fetch('/api/studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showNotification('Theme configuration saved & applied');
      }
    } catch (err) {
      showNotification('Error saving theme settings', 'error');
    }
  });
}

function setupColorSync(pickerId, textId) {
  const picker = document.getElementById(pickerId);
  const text = document.getElementById(textId);
  picker.addEventListener('input', () => { text.value = picker.value; });
  text.addEventListener('input', () => { if (text.value.match(/^#[0-9a-fA-F]{6}$/)) picker.value = text.value; });
}

// ═════════════════════════════════════════════
// 🔊 Tab 6: Sound Board
// ═════════════════════════════════════════════
async function loadSoundEffectsBoard() {
  try {
    const res = await fetch('/api/sounds');
    const sounds = await res.json();

    const container = document.getElementById('sounds-list-container');
    container.innerHTML = '';

    sounds.forEach(s => {
      const card = document.createElement('div');
      card.className = 'sound-card';
      card.innerHTML = `
        <div class="sound-card-header">
          <span class="sound-name">${escapeHTML(s.name)} <span style="font-size: 0.7rem; color: var(--admin-text-muted);">(${s.category})</span></span>
          <label class="switch-label">
            <input type="checkbox" id="sound-chk-${s.id}" ${s.enabled ? 'checked' : ''} />
            <span class="switch-slider"></span>
          </label>
        </div>
        <div class="form-group">
          <input type="text" id="sound-url-${s.id}" value="${escapeHTML(s.url || '')}" placeholder="Sound asset URL" class="form-control" />
        </div>
        <div class="grid-layout cols-2 gap-small">
          <button class="ghost-btn sound-test-play" data-id="${s.id}">▶ Test Play</button>
          <button class="success-btn sound-save-btn" data-id="${s.id}">Save Configuration</button>
        </div>
      `;

      card.querySelector('.sound-save-btn').addEventListener('click', () => saveSoundConfig(s.id));
      card.querySelector('.sound-test-play').addEventListener('click', () => playSoundTest(s.id));

      container.appendChild(card);
    });

    // Populate BG music URL
    const studioRes = await fetch('/api/studio');
    const studio = await studioRes.json();
    if (studio && studio.bg_music_url) {
      document.getElementById('bg-music-url-input').value = studio.bg_music_url;
    }
  } catch (err) {
    showNotification('Error loading sound effects roster', 'error');
  }
}

async function saveSoundConfig(id) {
  const url = document.getElementById(`sound-url-${id}`).value;
  const enabled = document.getElementById(`sound-chk-${id}`).checked;
  try {
    const res = await fetch(`/api/sounds/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
      body: JSON.stringify({ url, enabled })
    });
    if (res.ok) {
      showNotification('Sound configuration saved');
    }
  } catch (err) {
    showNotification('Error saving sound config', 'error');
  }
}

let testAudio = null;
function playSoundTest(id) {
  if (testAudio) {
    testAudio.pause();
    testAudio = null;
  }
  const url = document.getElementById(`sound-url-${id}`).value;
  if (!url) {
    showNotification('Please provide a URL first', 'warning');
    return;
  }
  testAudio = new Audio(url);
  testAudio.play().catch(() => showNotification('Error playing test audio URL', 'error'));
}

function setupSoundsListeners() {
  // BG Music Play/Pause
  const musicBtn = document.getElementById('bg-music-test-btn');
  let isPlaying = false;
  
  musicBtn.addEventListener('click', () => {
    const url = document.getElementById('bg-music-url-input').value;
    if (!url) {
      showNotification('Please provide a background music URL first', 'warning');
      return;
    }
    
    if (isPlaying) {
      socket.emit('sound:stop');
      musicBtn.textContent = '▶ Play Music';
    } else {
      socket.emit('sound:play', { category: 'background', url });
      musicBtn.textContent = '⏹ Stop Music';
    }
    isPlaying = !isPlaying;
  });

  // BG Music Save
  document.getElementById('bg-music-save-btn').addEventListener('click', async () => {
    const url = document.getElementById('bg-music-url-input').value || null;
    try {
      const res = await fetch('/api/studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
        body: JSON.stringify({ bg_music_url: url })
      });
      if (res.ok) {
        showNotification('Background music configuration saved');
      }
    } catch(e) {
      showNotification('Error saving background music url', 'error');
    }
  });
}

// ═════════════════════════════════════════════
// 📊 Tab 7: Analytics
// ═════════════════════════════════════════════
async function loadAnalyticsTab() {
  try {
    const [summary, difficulty] = await Promise.all([
      fetch('/api/analytics/summary', { headers: { 'x-admin-token': currentToken } }).then(r => r.json()),
      fetch('/api/analytics/difficulty', { headers: { 'x-admin-token': currentToken } }).then(r => r.json())
    ]);

    // Summary Cards
    document.getElementById('stat-sessions').textContent = summary.total_sessions;
    document.getElementById('stat-questions').textContent = summary.total_questions;
    document.getElementById('stat-answers').textContent = summary.total_answers;
    document.getElementById('stat-accuracy').textContent = `${summary.accuracy}%`;
    document.getElementById('stat-contestants').textContent = summary.total_contestants;

    // Difficulty Table
    const tbody = document.getElementById('difficulty-table-body');
    tbody.innerHTML = '';

    difficulty.forEach(d => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${d.id}</td>
        <td class="question-text">${escapeHTML(d.question_text)}</td>
        <td>L${d.level}</td>
        <td>${d.times_asked}</td>
        <td>${parseFloat(d.correct_pct).toFixed(1)}%</td>
        <td>${parseFloat(d.avg_time_ms / 1000).toFixed(2)}s</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    showNotification('Error loading statistics', 'error');
  }
}

// ═════════════════════════════════════════════
// 👁 Tab 8: Preview Screen
// ═════════════════════════════════════════════
document.getElementById('preview-refresh-btn').addEventListener('click', () => {
  const iframe = document.getElementById('preview-iframe');
  iframe.src = '/';
  showNotification('Simulator view refreshed');
});

// ═════════════════════════════════════════════
// ⚙️ Tab 9: Settings
// ═════════════════════════════════════════════
function setupSettingsListeners() {
  // Password Form
  document.getElementById('change-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const current_password = document.getElementById('current-password-input').value;
    const new_password = document.getElementById('new-password-input').value;
    const confirm_password = document.getElementById('confirm-password-input').value;

    if (new_password !== confirm_password) {
      showNotification('New passwords do not match', 'error');
      return;
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
        body: JSON.stringify({ current_password, new_password })
      });
      if (res.ok) {
        showNotification('Access password changed successfully');
        document.getElementById('change-password-form').reset();
      } else {
        const data = await res.json();
        showNotification(data.error || 'Failed to change password', 'error');
      }
    } catch (err) {
      showNotification('Server connection error changing password', 'error');
    }
  });

  // App defaults
  fetch('/api/admin-settings', { headers: { 'x-admin-token': currentToken } })
    .then(r => r.json())
    .then(data => {
      document.getElementById('default-timer-input').value = data.default_timer_duration || 30;
      document.getElementById('default-scoring-select').value = data.default_scoring_mode || 'fixed';
    }).catch(() => {});

  document.getElementById('admin-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      default_timer_duration: parseInt(document.getElementById('default-timer-input').value) || 30,
      default_scoring_mode: document.getElementById('default-scoring-select').value
    };

    try {
      const res = await fetch('/api/admin-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
        body: JSON.stringify(payload)
      });
      if (res.ok) showNotification('App defaults saved successfully');
    } catch (err) {
      showNotification('Error saving app defaults', 'error');
    }
  });

  // Backup & Restore
  document.getElementById('backup-download-btn').addEventListener('click', downloadBackup);
  document.getElementById('backup-upload-btn').addEventListener('click', () => {
    document.getElementById('backup-upload-input').click();
  });
  document.getElementById('backup-upload-input').addEventListener('change', uploadBackupJSON);
}

async function downloadBackup() {
  try {
    const res = await fetch('/api/backup', { headers: { 'x-admin-token': currentToken } });
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `udan-panam-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Backup archive generated & downloaded');
  } catch (err) {
    showNotification('Error generating database backup archive', 'error');
  }
}

function uploadBackupJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (parsed.version !== '2.0.0' || !parsed.data) {
        showNotification('Invalid backup archive schema version', 'error');
        return;
      }

      if (!confirm('⚠️ RESTORE DATABASE: This will overwrite your current settings, questions, and contestant details. Continue?')) {
        return;
      }

      // Restore Questions first
      if (parsed.data.questions && parsed.data.questions.length > 0) {
        await fetch('/api/questions', { method: 'DELETE', headers: { 'x-admin-token': currentToken } });
        await fetch('/api/questions/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
          body: JSON.stringify(parsed.data.questions)
        });
      }

      // Restore Studio
      if (parsed.data.studio_settings) {
        await fetch('/api/studio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
          body: JSON.stringify(parsed.data.studio_settings)
        });
      }

      showNotification('Database states restored successfully');
      loadLiveControlData();
    } catch (err) {
      showNotification('Error parsing JSON backup archive', 'error');
    }
  };
  reader.readAsText(file);
}

// ═════════════════════════════════════════════
// Keyboard Shortcuts Engine
// ═════════════════════════════════════════════
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Disable shortcuts when typing inside form fields
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
      return;
    }

    const key = e.key.toUpperCase();

    if (e.code === 'Space') {
      e.preventDefault();
      document.getElementById('next-question-btn').click();
    } else if (key === 'R') {
      document.getElementById('reveal-answer-btn').click();
    } else if (key === 'T') {
      const startBtn = document.getElementById('timer-start-btn');
      const pauseBtn = document.getElementById('timer-pause-btn');
      // If timer text isn't running, start it
      fetch('/api/presentation/state')
        .then(r => r.json())
        .then(state => {
          if (state.timer_running) pauseBtn.click();
          else startBtn.click();
        });
    } else if (key === 'O') {
      document.getElementById('toggle-options-btn').click();
    } else if (key === 'Q') {
      document.getElementById('toggle-question-btn').click();
    } else if (key === 'E') {
      document.getElementById('toggle-explanation-btn').click();
    } else if (e.key === 'Escape') {
      document.getElementById('screen-welcome-btn').click();
    }
  });
}

// ─── Toast Alerts ───
function showNotification(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.remove(); }, 300);
  }, 3000);
}

// Escape HTML utility to prevent XSS in admin UI
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
