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
let isSocketConnected = false;
let pollingInterval = null;

// Question Manager Pagination & Filters
let qPage = 1;
let qLimit = 500;
let qSearch = '';
let qLevelFilter = '';
let qPresentedFilter = '';
let soundEffectsCache = [];

// Theme Preset Colors
const themePresets = {
  'emerald-gold': { primary: '#10b981', secondary: '#fbbf24', bg: '#022c22', card: 'rgba(6, 78, 59, 0.85)', textPrimary: '#ffffff', textSecondary: 'rgba(255, 255, 255, 0.7)' },
  'ruby-rose': { primary: '#f43f5e', secondary: '#fda4af', bg: '#4c0519', card: 'rgba(159, 18, 57, 0.85)', textPrimary: '#ffffff', textSecondary: 'rgba(255, 255, 255, 0.7)' },
  'sapphire-glow': { primary: '#3b82f6', secondary: '#93c5fd', bg: '#1e3a8a', card: 'rgba(30, 58, 138, 0.85)', textPrimary: '#ffffff', textSecondary: 'rgba(255, 255, 255, 0.7)' },
  'amethyst-spark': { primary: '#a855f7', secondary: '#f472b6', bg: '#3b0764', card: 'rgba(88, 28, 135, 0.85)', textPrimary: '#ffffff', textSecondary: 'rgba(255, 255, 255, 0.7)' },
  'neon-night': { primary: '#00e5ff', secondary: '#ffd700', bg: '#070B19', card: 'rgba(16, 24, 45, 0.8)', textPrimary: '#ffffff', textSecondary: 'rgba(255, 255, 255, 0.7)' },
  'sunset-blaze': { primary: '#ff6b6b', secondary: '#ffd93d', bg: '#1a0a0a', card: 'rgba(40, 15, 15, 0.8)', textPrimary: '#ffffff', textSecondary: 'rgba(255, 255, 255, 0.7)' },
  'ocean-deep': { primary: '#0abde3', secondary: '#10ac84', bg: '#0a1628', card: 'rgba(10, 22, 40, 0.8)', textPrimary: '#ffffff', textSecondary: 'rgba(255, 255, 255, 0.7)' },
  'retro-arcade': { primary: '#ff00ff', secondary: '#00ff00', bg: '#0d0221', card: 'rgba(13, 2, 33, 0.8)', textPrimary: '#ffffff', textSecondary: 'rgba(255, 255, 255, 0.7)' },
  'cyberpunk': { primary: '#ec4899', secondary: '#06b6d4', bg: '#09090b', card: 'rgba(18, 10, 24, 0.9)', textPrimary: '#ffffff', textSecondary: '#f472b6' },
  'forest-mint': { primary: '#34d399', secondary: '#fcd34d', bg: '#022c22', card: 'rgba(6, 78, 59, 0.9)', textPrimary: '#f0fdf4', textSecondary: '#6ee7b7' },
  'royal-gold': { primary: '#fbbf24', secondary: '#f8fafc', bg: '#2e1065', card: 'rgba(76, 29, 149, 0.9)', textPrimary: '#fdfba8', textSecondary: '#fcd34d' },
  'pure-dark': { primary: '#ffffff', secondary: '#ffd700', bg: '#000000', card: 'rgba(20, 20, 20, 0.9)', textPrimary: '#ffffff', textSecondary: 'rgba(255, 255, 255, 0.7)' },
  'minimal-white': { primary: '#2563eb', secondary: '#b45309', bg: '#f8fafc', card: 'rgba(255, 255, 255, 0.95)', textPrimary: '#0f172a', textSecondary: '#475569' },
  'pure-light': { primary: '#1e40af', secondary: '#b45309', bg: '#ffffff', card: 'rgba(248, 250, 252, 0.95)', textPrimary: '#0f172a', textSecondary: '#475569' }
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

// ─── Web Audio API Synthesizer for Tactile Haptic Audio Feedback ───
let hapticAudioCtx = null;
function playClayHapticClick() {
  const enabled = localStorage.getItem('clay-haptic') !== 'false';
  if (!enabled) return;
  try {
    if (!hapticAudioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) hapticAudioCtx = new AudioCtx();
    }
    if (hapticAudioCtx && hapticAudioCtx.state === 'suspended') {
      hapticAudioCtx.resume();
    }
    if (!hapticAudioCtx) return;
    const osc = hapticAudioCtx.createOscillator();
    const gain = hapticAudioCtx.createGain();
    osc.type = 'sine'; // Pure, soothing organic droplet tone
    osc.frequency.setValueAtTime(200, hapticAudioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, hapticAudioCtx.currentTime + 0.04);
    gain.gain.setValueAtTime(0.035, hapticAudioCtx.currentTime); // Soft, non-intrusive
    gain.gain.exponentialRampToValueAtTime(0.0001, hapticAudioCtx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(hapticAudioCtx.destination);
    osc.start();
    osc.stop(hapticAudioCtx.currentTime + 0.04);
  } catch (e) {
    // AudioContext suspended or not allowed yet
  }
}

// Global click listener for tactile haptic feedback on clay buttons
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button, .btn, .icon-btn, .chip-btn, .route-btn, .sound-pad-btn, .clay-depth-btn, .flash-preset-btn');
  if (btn) {
    playClayHapticClick();
  }
});

// Initialize Auth & Theme
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  if (currentToken) {
    verifyToken(currentToken);
  } else {
    showLogin();
  }
});

function initTheme() {
  const savedTheme = localStorage.getItem('admin-theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }

  const savedDepth = localStorage.getItem('clay-depth') || 'classic';
  document.body.setAttribute('data-clay-depth', savedDepth);

  const savedAccent = localStorage.getItem('clay-accent') || 'cyan';
  document.body.setAttribute('data-clay-accent', savedAccent);

  updateThemeToggleUI();
}

function updateThemeToggleUI() {
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    const isLight = document.body.classList.contains('light-theme');
    themeBtn.innerHTML = isLight ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
  }
}

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

  // Override socket.emit to support HTTP fallback for state:update
  const originalEmit = socket.emit;
  socket.emit = function(event, ...args) {
    if (event === 'state:update') {
      if (socket && socket.connected) {
        originalEmit.apply(socket, [event, ...args]);
      } else {
        fetch('/api/presentation/state', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-token': currentToken
          },
          body: JSON.stringify(args[0])
        })
        .then(res => {
          if (res.ok) return res.json();
        })
        .then(state => {
          if (state) syncLiveControls(state);
        })
        .catch(err => console.error('HTTP state update failed:', err));
      }
    } else {
      if (socket && socket.connected) {
        originalEmit.apply(socket, [event, ...args]);
      }
    }
  };
  
  socket.on('connect', () => {
    isSocketConnected = true;
    connectionStatus.textContent = 'Connected';
    connectionStatus.className = 'connection-pill green';
    socket.emit('join', 'admin');
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  });

  socket.on('disconnect', () => {
    isSocketConnected = false;
    connectionStatus.textContent = 'Disconnected';
    connectionStatus.className = 'connection-pill red';
    startPollingFallback();
  });

  function startPollingFallback() {
    if (pollingInterval) return;
    console.log('Starting polling fallback for admin state sync...');
    pollingInterval = setInterval(async () => {
      if (isSocketConnected) return;
      try {
        const res = await fetch('/api/presentation/state', {
          headers: { 'x-admin-token': currentToken }
        });
        if (res.ok) {
          const state = await res.json();
          syncLiveControls(state);
        }
      } catch (e) {
        console.error('Error polling state in admin:', e);
      }
    }, 2000);
  }

  // Start polling fallback initially as a safety check
  startPollingFallback();

  socket.on('state:sync', (state) => {
    syncLiveControls(state);
  });

  socket.on('question:updated', (updatedQ) => {
    if (!updatedQ) return;
    const idx = currentQuestions.findIndex(q => q.id === updatedQ.id);
    if (idx !== -1) {
      currentQuestions[idx] = { ...currentQuestions[idx], ...updatedQ };
      if (idx === currentQuestionIndex) {
        updateLiveQuestionDisplay();
      }
      renderLiveQuestionsList();
    }
  });

  socket.on('timer:tick', (data) => {
    const liveTimer = document.getElementById('live-timer-text');
    if (liveTimer) liveTimer.textContent = data.remaining;
    updateFlowTimerUI(data.remaining, true);
  });

  socket.on('timer:started', (data) => {
    const rem = data?.remaining || 30;
    const liveTimer = document.getElementById('live-timer-text');
    if (liveTimer) liveTimer.textContent = rem;
    updateFlowTimerUI(rem, true);
  });

  socket.on('timer:paused', (data) => {
    const rem = data?.remaining;
    const liveTimer = document.getElementById('live-timer-text');
    if (liveTimer && rem !== undefined) liveTimer.textContent = rem;
    updateFlowTimerUI(rem, false);
  });

  socket.on('timer:stopped', () => {
    const activeQ = (currentQuestionIndex >= 0 && currentQuestionIndex < currentQuestions.length)
      ? currentQuestions[currentQuestionIndex]
      : null;
    const dur = activeQ?.timer_override || parseInt(document.getElementById('flow-timer-duration-input')?.value) || parseInt(document.getElementById('timer-duration-input')?.value) || 30;
    const liveTimer = document.getElementById('live-timer-text');
    if (liveTimer) liveTimer.textContent = dur;
    const durInput = document.getElementById('timer-duration-input');
    if (durInput && document.activeElement !== durInput) durInput.value = dur;
    const flowInput = document.getElementById('flow-timer-duration-input');
    if (flowInput && document.activeElement !== flowInput) flowInput.value = dur;
    updateFlowTimerUI(dur, false);
  });

  socket.on('celebration:start', (data) => {
    const duration = data?.duration || 0;
    const celebStatusText = document.getElementById('celebration-status-text');
    if (celebStatusText) {
      celebStatusText.textContent = duration > 0 ? `ACTIVE (${duration}s)` : 'ACTIVE';
      celebStatusText.classList.add('active');
    }
  });

  socket.on('celebration:tick', (data) => {
    const celebStatusText = document.getElementById('celebration-status-text');
    if (celebStatusText) {
      celebStatusText.textContent = `ACTIVE (${data.remaining}s)`;
    }
  });

  socket.on('celebration:stop', () => {
    const celebStatusText = document.getElementById('celebration-status-text');
    if (celebStatusText) {
      celebStatusText.textContent = 'IDLE';
      celebStatusText.classList.remove('active');
    }
  });

  socket.on('stage:blackout', (data) => {
    const blackoutBtn = document.getElementById('admin-stage-blackout-btn');
    if (blackoutBtn && data) {
      blackoutBtn.classList.toggle('btn-danger', !!data.blackout);
      blackoutBtn.classList.toggle('btn-outline', !data.blackout);
    }
  });

  socket.on('promo:control', (data) => {
    if (!data) return;
    if (data.action === 'scene') {
      document.querySelectorAll('[data-promo-scene]').forEach(b => {
        b.classList.toggle('active', b.dataset.promoScene === data.scene);
      });
      document.querySelectorAll('[data-director-scene]').forEach(card => {
        card.classList.toggle('active', card.dataset.directorScene === data.scene);
      });
      const sceneBadge = document.getElementById('status-active-scene');
      if (sceneBadge) sceneBadge.textContent = String(data.scene || 'overview').toUpperCase();
    }
  });

  socket.on('cast:list', (displays) => {
    updateConnectedDisplaysTable(displays);
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
    
    // Mobile responsive backdrop management
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      let overlay = document.querySelector('.sidebar-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', () => {
          sidebar.classList.add('collapsed');
          overlay.classList.remove('active');
        });
      }
      if (!sidebar.classList.contains('collapsed')) {
        overlay.classList.add('active');
      } else {
        overlay.classList.remove('active');
      }
    }
  });

  // Theme toggle button setup
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      const isLight = document.body.classList.contains('light-theme');
      localStorage.setItem('admin-theme', isLight ? 'light' : 'dark');
      updateThemeToggleUI();
    });
  }

  // Initial tab loading
  switchTab('live');
  loadLiveControlData();
  loadSoundEffectsBoard(); // Preload sound board cache for mocking controls
  setupLiveControlListeners();
  setupQuestionsListeners();
  setupContestantsListeners();
  setupSessionsListeners();
  setupStudioListeners();
  setupSoundsListeners();
  setupSettingsListeners();
  setupPromoCastListeners();
  setupKeyboardShortcuts();

  // Advanced Claymorphism Studio Suite & Directorial Tools
  initZenMode();
  initBroadcastStopwatch();
  initSocketPingDiagnostics();
  initFlashAlertDispatcher();
  initHotkeysModal();
  initFullscreenToggle();
  initClayCustomizer();
  initFloatingSoundboard();
  initTeleprompterProTools();
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
    'promo-cast': 'Promo & Casting Studio',
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
  if (tabName === 'promo-cast') loadPromoCastTab();
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

  // 🔒 Persisted Screen Control Dock Visibility
  const dock = document.getElementById('admin-screen-control-dock');
  if (dock) {
    if (['live', 'questions', 'preview'].includes(tabName)) {
      dock.style.display = 'block';
    } else {
      dock.style.display = 'none';
    }
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
    renderLiveQuestionsList();
  } catch (err) {
    showNotification('Error loading questions for level', 'error');
  }
}

function updateLiveQuestionDisplay() {
  const progressDiv = document.getElementById('live-question-progress');
  const textDiv = document.getElementById('live-question-text');
  const levelBadge = document.getElementById('live-question-level-badge');
  const statusBadge = document.getElementById('live-question-status-badge');
  const optionsPreview = document.getElementById('live-question-options-preview');
  const quickEditBtn = document.getElementById('live-quick-edit-btn');
  const quickEditPanel = document.getElementById('live-quick-edit-panel');

  if (currentQuestionIndex >= 0 && currentQuestionIndex < currentQuestions.length) {
    const q = currentQuestions[currentQuestionIndex];
    if (progressDiv) progressDiv.textContent = `Question ${currentQuestionIndex + 1} of ${currentQuestions.length}`;
    if (textDiv) textDiv.textContent = q.question_text;
    if (levelBadge) {
      levelBadge.textContent = `Round ${q.level} • ${q.level === 1 ? 'Text' : q.level === 2 ? 'Image' : 'Audio'}`;
    }
    if (statusBadge) {
      statusBadge.textContent = q.presented ? 'Used on Stage' : 'Ready to Air';
      statusBadge.className = `badge ${q.presented ? 'badge-warning' : 'badge-success'}`;
    }
    if (quickEditBtn) quickEditBtn.style.display = 'inline-flex';

    // Control Dock Meta Elements
    const dockQNum = document.getElementById('dock-q-num');
    const dockQRound = document.getElementById('dock-q-round');
    const dockQPreview = document.getElementById('dock-q-preview');
    const dockBadge = document.getElementById('dock-active-q-badge');

    if (dockQNum) dockQNum.textContent = `Q${currentQuestionIndex + 1}`;
    if (dockQRound) dockQRound.textContent = `Round ${q.level}`;
    if (dockQPreview) {
      dockQPreview.textContent = q.question_text;
      dockQPreview.title = q.question_text;
    }
    if (dockBadge) dockBadge.classList.add('has-question');

    // If quick edit panel is open, sync form fields
    if (quickEditPanel && quickEditPanel.style.display !== 'none') {
      const qInput = document.getElementById('live-edit-qtext');
      if (qInput && document.activeElement !== qInput) qInput.value = q.question_text || '';
      const aInput = document.getElementById('live-edit-optA');
      if (aInput && document.activeElement !== aInput) aInput.value = q.option_a || '';
      const bInput = document.getElementById('live-edit-optB');
      if (bInput && document.activeElement !== bInput) bInput.value = q.option_b || '';
      const cInput = document.getElementById('live-edit-optC');
      if (cInput && document.activeElement !== cInput) cInput.value = q.option_c || '';
      const dInput = document.getElementById('live-edit-optD');
      if (dInput && document.activeElement !== dInput) dInput.value = q.option_d || '';
      const expInput = document.getElementById('live-edit-explanation');
      if (expInput && document.activeElement !== expInput) expInput.value = q.explanation || '';
      
      const correctRadio = document.querySelector(`input[name="live-edit-correct-radio"][value="${q.correct_answer}"]`);
      if (correctRadio) correctRadio.checked = true;
    }

    if (optionsPreview) {
      optionsPreview.innerHTML = `
        <div class="live-correct-selector-bar">
          <div class="selector-title">
            <i class="fa-solid fa-circle-check" style="color: #10b981;"></i>
            <span>Right Option:</span>
          </div>
          <div class="correct-btn-group">
            <button class="btn-opt-select ${q.correct_answer === 'A' ? 'active' : ''}" onclick="setLiveCorrectAnswer('A')" title="Set A as Right Option">
              A ${q.correct_answer === 'A' ? '<i class="fa-solid fa-check"></i>' : ''}
            </button>
            <button class="btn-opt-select ${q.correct_answer === 'B' ? 'active' : ''}" onclick="setLiveCorrectAnswer('B')" title="Set B as Right Option">
              B ${q.correct_answer === 'B' ? '<i class="fa-solid fa-check"></i>' : ''}
            </button>
            <button class="btn-opt-select ${q.correct_answer === 'C' ? 'active' : ''}" onclick="setLiveCorrectAnswer('C')" title="Set C as Right Option">
              C ${q.correct_answer === 'C' ? '<i class="fa-solid fa-check"></i>' : ''}
            </button>
            <button class="btn-opt-select ${q.correct_answer === 'D' ? 'active' : ''}" onclick="setLiveCorrectAnswer('D')" title="Set D as Right Option">
              D ${q.correct_answer === 'D' ? '<i class="fa-solid fa-check"></i>' : ''}
            </button>
          </div>
        </div>

        <div class="teleprompter-options-grid">
          ${['A', 'B', 'C', 'D'].map(opt => {
            const isCorrect = q.correct_answer === opt;
            const val = q['option_' + opt.toLowerCase()] || '';
            return `
              <div class="option-pill ${isCorrect ? 'is-correct' : ''}" id="live-opt-pill-${opt}">
                <span class="opt-label" onclick="setLiveCorrectAnswer('${opt}')" title="Click to set ${opt} as Right Option">${opt}</span>
                <span class="opt-text" id="live-opt-text-${opt}" title="Double-click to edit text" ondblclick="startInlineOptionEdit('${opt}')">${escapeHTML(val)}</span>
                <div class="opt-pill-actions">
                  <button class="pill-btn-set-correct ${isCorrect ? 'is-active' : ''}" onclick="setLiveCorrectAnswer('${opt}')" title="Set as Right Option">
                    <i class="fa-solid ${isCorrect ? 'fa-circle-check' : 'fa-circle'}"></i> ${isCorrect ? 'Right' : 'Set Right'}
                  </button>
                  <button class="pill-btn-inline-edit" onclick="startInlineOptionEdit('${opt}')" title="Edit option ${opt} text">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
  } else {
    if (progressDiv) progressDiv.textContent = 'No Question Active';
    if (textDiv) textDiv.textContent = 'Select a question from the list below or punch Next to start.';
    if (levelBadge) levelBadge.textContent = 'Standby';
    if (statusBadge) {
      statusBadge.textContent = 'Idle';
      statusBadge.className = 'badge badge-outline';
    }
    if (quickEditBtn) quickEditBtn.style.display = 'none';
    if (quickEditPanel) quickEditPanel.style.display = 'none';
    if (optionsPreview) optionsPreview.innerHTML = '';

    const dockQNum = document.getElementById('dock-q-num');
    const dockQRound = document.getElementById('dock-q-round');
    const dockQPreview = document.getElementById('dock-q-preview');
    const dockBadge = document.getElementById('dock-active-q-badge');
    if (dockQNum) dockQNum.textContent = 'Q—';
    if (dockQRound) dockQRound.textContent = 'Standby';
    if (dockQPreview) {
      dockQPreview.textContent = 'Select a question from the list to start.';
      dockQPreview.title = 'Active Question on Stage';
    }
    if (dockBadge) dockBadge.classList.remove('has-question');
  }
}

// ─── Live Right Option & Question Management Handlers ───

async function setLiveCorrectAnswer(optLetter) {
  if (currentQuestionIndex < 0 || currentQuestionIndex >= currentQuestions.length) return;
  const q = currentQuestions[currentQuestionIndex];
  if (!q) return;

  const upper = String(optLetter).toUpperCase();
  if (q.correct_answer === upper) return;

  q.correct_answer = upper;

  // Real-time Socket Broadcast
  socket.emit('question:set-correct', { question_id: q.id, correct_answer: upper });

  // Persistence REST API (PATCH)
  fetch(`/api/questions/${q.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
    body: JSON.stringify({ correct_answer: upper })
  }).catch(err => console.error('Error updating right option via API:', err));

  updateLiveQuestionDisplay();
  showNotification(`Right Option switched to (${upper}) live on stage!`);
}

function startInlineOptionEdit(optLetter) {
  if (currentQuestionIndex < 0 || currentQuestionIndex >= currentQuestions.length) return;
  const q = currentQuestions[currentQuestionIndex];
  if (!q) return;

  const upper = String(optLetter).toUpperCase();
  const optKey = 'option_' + upper.toLowerCase();
  const pill = document.getElementById(`live-opt-pill-${upper}`);
  if (!pill) return;

  const currentVal = q[optKey] || '';
  pill.innerHTML = `
    <div class="inline-opt-edit-wrap">
      <span class="opt-label">${upper}</span>
      <input type="text" class="inline-opt-input" id="inline-opt-input-${upper}" value="${escapeHTML(currentVal)}">
      <button class="btn btn-xs btn-primary" onclick="saveInlineOptionEdit('${upper}')" title="Save"><i class="fa-solid fa-check"></i></button>
      <button class="btn btn-xs btn-ghost" onclick="updateLiveQuestionDisplay()" title="Cancel"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `;

  const input = document.getElementById(`inline-opt-input-${upper}`);
  if (input) {
    input.focus();
    input.select();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveInlineOptionEdit(upper);
      } else if (e.key === 'Escape') {
        updateLiveQuestionDisplay();
      }
    });
  }
}

async function saveInlineOptionEdit(optLetter) {
  if (currentQuestionIndex < 0 || currentQuestionIndex >= currentQuestions.length) return;
  const q = currentQuestions[currentQuestionIndex];
  if (!q) return;

  const upper = String(optLetter).toUpperCase();
  const input = document.getElementById(`inline-opt-input-${upper}`);
  if (!input) return;

  const newVal = input.value.trim();
  const optKey = 'option_' + upper.toLowerCase();
  q[optKey] = newVal;

  // Socket broadcast
  socket.emit('question:quick-edit', {
    id: q.id,
    [optKey]: newVal
  });

  // REST API persistence
  try {
    await fetch(`/api/questions/${q.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
      body: JSON.stringify({ [optKey]: newVal })
    });
    showNotification(`Option ${upper} updated live on stage!`);
  } catch (err) {
    console.error('Error saving inline option edit:', err);
  }

  updateLiveQuestionDisplay();
}

function toggleLiveQuestionEditor(forceState) {
  const panel = document.getElementById('live-quick-edit-panel');
  const btn = document.getElementById('live-quick-edit-btn');
  if (!panel) return;

  const isCurrentlyOpen = panel.style.display !== 'none';
  const shouldOpen = forceState !== undefined ? forceState : !isCurrentlyOpen;

  if (shouldOpen) {
    if (currentQuestionIndex < 0 || currentQuestionIndex >= currentQuestions.length) {
      showNotification('No active question to edit', 'error');
      return;
    }
    const q = currentQuestions[currentQuestionIndex];

    document.getElementById('live-edit-qtext').value = q.question_text || '';
    document.getElementById('live-edit-optA').value = q.option_a || '';
    document.getElementById('live-edit-optB').value = q.option_b || '';
    document.getElementById('live-edit-optC').value = q.option_c || '';
    document.getElementById('live-edit-optD').value = q.option_d || '';
    document.getElementById('live-edit-explanation').value = q.explanation || '';

    const correctRadio = document.querySelector(`input[name="live-edit-correct-radio"][value="${q.correct_answer}"]`);
    if (correctRadio) correctRadio.checked = true;

    panel.style.display = 'block';
    if (btn) btn.innerHTML = '<i class="fa-solid fa-eye"></i> View Live';
    
    // Focus question textarea
    setTimeout(() => {
      document.getElementById('live-edit-qtext')?.focus();
    }, 50);
  } else {
    panel.style.display = 'none';
    if (btn) btn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Quick Edit';
  }
}

async function saveLiveQuestionQuickEdit() {
  if (currentQuestionIndex < 0 || currentQuestionIndex >= currentQuestions.length) return;
  const q = currentQuestions[currentQuestionIndex];
  if (!q) return;

  const qText = document.getElementById('live-edit-qtext').value.trim();
  const optA = document.getElementById('live-edit-optA').value.trim();
  const optB = document.getElementById('live-edit-optB').value.trim();
  const optC = document.getElementById('live-edit-optC').value.trim();
  const optD = document.getElementById('live-edit-optD').value.trim();
  const explanation = document.getElementById('live-edit-explanation').value.trim();
  const selectedCorrect = document.querySelector('input[name="live-edit-correct-radio"]:checked')?.value || q.correct_answer || 'A';

  if (!qText || !optA || !optB || !optC || !optD) {
    showNotification('Question text and all 4 options are required', 'error');
    return;
  }

  q.question_text = qText;
  q.option_a = optA;
  q.option_b = optB;
  q.option_c = optC;
  q.option_d = optD;
  q.correct_answer = selectedCorrect;
  q.explanation = explanation;

  const payload = {
    id: q.id,
    question_text: qText,
    option_a: optA,
    option_b: optB,
    option_c: optC,
    option_d: optD,
    correct_answer: selectedCorrect,
    explanation: explanation
  };

  // Socket broadcast
  socket.emit('question:quick-edit', payload);

  // REST API persistence
  try {
    const res = await fetch(`/api/questions/${q.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showNotification('Question & Options updated and broadcast to Stage!');
      toggleLiveQuestionEditor(false);
      updateLiveQuestionDisplay();
      renderLiveQuestionsList();
    } else {
      showNotification('Error saving question edit', 'error');
    }
  } catch (err) {
    console.error('Error saving question quick edit:', err);
    showNotification('Failed to save question edit', 'error');
  }
}

// Expose functions globally for inline onclick handlers
window.setLiveCorrectAnswer = setLiveCorrectAnswer;
window.startInlineOptionEdit = startInlineOptionEdit;
window.saveInlineOptionEdit = saveInlineOptionEdit;
window.toggleLiveQuestionEditor = toggleLiveQuestionEditor;

function renderLiveQuestionsList() {
  const container = document.getElementById('live-questions-list');
  if (!container) return;
  container.innerHTML = '';

  if (!currentQuestions || currentQuestions.length === 0) {
    container.innerHTML = '<div class="text-center text-muted p-2">No questions loaded for this round.</div>';
    return;
  }

  currentQuestions.forEach((q, idx) => {
    const item = document.createElement('div');
    item.className = `live-question-card ${idx === currentQuestionIndex ? 'active' : ''} ${q.presented ? 'presented' : ''}`;
    
    const ansLetter = (q.correct_answer || 'A').toUpperCase();
    const ansText = q[`option_${ansLetter.toLowerCase()}`] || '';

    item.innerHTML = `
      <div class="live-q-card-header">
        <span class="q-num-badge">#${idx + 1}</span>
        <span class="badge ${q.presented ? 'badge-warning' : 'badge-success'}">${q.presented ? 'USED' : 'READY'}</span>
        <button class="btn btn-xs btn-primary push-stage-btn" style="margin-left: auto;">
          <i class="fa-solid fa-play"></i> Air on Stage
        </button>
      </div>
      <div class="live-q-card-text">${escapeHTML(q.question_text || '')}</div>
      <div class="live-q-card-opts">
        <span class="opt-chip ${ansLetter === 'A' ? 'is-correct' : ''}">A: ${escapeHTML(q.option_a || '')}</span>
        <span class="opt-chip ${ansLetter === 'B' ? 'is-correct' : ''}">B: ${escapeHTML(q.option_b || '')}</span>
        <span class="opt-chip ${ansLetter === 'C' ? 'is-correct' : ''}">C: ${escapeHTML(q.option_c || '')}</span>
        <span class="opt-chip ${ansLetter === 'D' ? 'is-correct' : ''}">D: ${escapeHTML(q.option_d || '')}</span>
      </div>
      <div class="live-q-card-ans">
        <i class="fa-solid fa-circle-check"></i> Answer: <strong>${ansLetter}</strong> — ${escapeHTML(ansText)}
      </div>
    `;

    const pushBtn = item.querySelector('.push-stage-btn');
    pushBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentQuestionIndex = idx;
      dispatchActiveQuestion();
      renderLiveQuestionsList();
    });

    item.addEventListener('click', () => {
      currentQuestionIndex = idx;
      dispatchActiveQuestion();
      renderLiveQuestionsList();
    });

    container.appendChild(item);
  });
}

function setupLiveControlListeners() {
  // Screen Switched
  const welcomeBtn = document.getElementById('screen-welcome-btn');
  if (welcomeBtn) {
    welcomeBtn.addEventListener('click', () => {
      socket.emit('state:update', { active_screen: 'welcome' });
    });
  }
  const promoBtn = document.getElementById('screen-promo-btn');
  if (promoBtn) {
    promoBtn.addEventListener('click', () => {
      socket.emit('state:update', { active_screen: 'promo' });
    });
  }
  const quizBtn = document.getElementById('screen-quiz-btn');
  if (quizBtn) {
    quizBtn.addEventListener('click', () => {
      socket.emit('state:update', { active_screen: 'quiz' });
    });
  }

  // ── Second Screen & Promo Director Controls ──
  const launchStageBtn = document.getElementById('admin-launch-stage-btn');
  if (launchStageBtn) {
    launchStageBtn.addEventListener('click', () => {
      const stageWin = window.open('/', 'UdanPanamStage', 'width=1920,height=1080,menubar=no,toolbar=no,location=no,status=no');
      if (stageWin) stageWin.focus();
      showNotification('Second Screen (Stage Display) window opened');
    });
  }

  let adminIsBlackout = false;
  const blackoutBtn = document.getElementById('admin-stage-blackout-btn');
  if (blackoutBtn) {
    blackoutBtn.addEventListener('click', () => {
      adminIsBlackout = !adminIsBlackout;
      socket.emit('stage:blackout', { blackout: adminIsBlackout });
      blackoutBtn.classList.toggle('btn-danger', adminIsBlackout);
      blackoutBtn.classList.toggle('btn-outline', !adminIsBlackout);
      showNotification(adminIsBlackout ? 'Stage Screen Blacked Out' : 'Stage Screen Restored');
    });
  }

  // Promo Director Scene Buttons
  document.querySelectorAll('[data-promo-scene]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-promo-scene]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const scene = btn.dataset.promoScene;
      socket.emit('state:update', { active_screen: 'promo' });
      socket.emit('promo:control', { action: 'scene', scene });
      showNotification(`Promo Scene ${scene} triggered on stage`);
    });
  });

  // Promo Reel Toggle
  let adminPromoReelRunning = false;
  const reelToggleBtn = document.getElementById('admin-promo-reel-toggle');
  const reelToggleText = document.getElementById('admin-promo-reel-text');
  if (reelToggleBtn) {
    reelToggleBtn.addEventListener('click', () => {
      adminPromoReelRunning = !adminPromoReelRunning;
      socket.emit('state:update', { active_screen: 'promo' });
      socket.emit('promo:control', { action: adminPromoReelRunning ? 'play' : 'pause' });
      if (reelToggleText) reelToggleText.textContent = adminPromoReelRunning ? 'Pause Reel' : 'Play Reel';
      const icon = reelToggleBtn.querySelector('i');
      if (icon) icon.className = adminPromoReelRunning ? 'fa-solid fa-pause' : 'fa-solid fa-play';
      reelToggleBtn.classList.toggle('btn-warning', adminPromoReelRunning);
      reelToggleBtn.classList.toggle('btn-success', !adminPromoReelRunning);
    });
  }

  // Promo Fanfare Sound
  const fanfareBtn = document.getElementById('admin-promo-fanfare-btn');
  if (fanfareBtn) {
    fanfareBtn.addEventListener('click', () => {
      socket.emit('promo:sound');
      showNotification('Promo Fanfare SFX sent to stage');
    });
  }

  // Broadcast Ticker
  const tickerInput = document.getElementById('admin-ticker-input');
  const tickerSend = document.getElementById('admin-ticker-send-btn');
  const tickerClear = document.getElementById('admin-ticker-clear-btn');
  if (tickerSend && tickerInput) {
    tickerSend.addEventListener('click', () => {
      const txt = tickerInput.value.trim();
      if (txt) {
        socket.emit('stage:ticker', { show: true, text: txt });
        showNotification('Stage Notice Ticker broadcasted');
      }
    });
  }
  if (tickerClear) {
    tickerClear.addEventListener('click', () => {
      socket.emit('stage:ticker', { show: false });
      showNotification('Stage Notice Ticker cleared');
    });
  }

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
      renderLiveQuestionsList();
    }
  });

  document.getElementById('next-question-btn').addEventListener('click', () => {
    if (currentQuestions.length === 0) return;
    if (currentQuestionIndex < currentQuestions.length - 1) {
      currentQuestionIndex++;
      dispatchActiveQuestion();
      renderLiveQuestionsList();
    } else {
      showNotification('Already at the last question for this round', 'info');
    }
  });

  // Live Quick Edit Question & Options Controls
  const liveQuickEditBtn = document.getElementById('live-quick-edit-btn');
  if (liveQuickEditBtn) {
    liveQuickEditBtn.addEventListener('click', () => toggleLiveQuestionEditor());
  }

  const liveEditSaveBtn = document.getElementById('live-edit-save-btn');
  if (liveEditSaveBtn) {
    liveEditSaveBtn.addEventListener('click', saveLiveQuestionQuickEdit);
  }

  const liveEditCancelBtn = document.getElementById('live-edit-cancel-btn');
  if (liveEditCancelBtn) {
    liveEditCancelBtn.addEventListener('click', () => toggleLiveQuestionEditor(false));
  }

  // Toggle: Show Question (revealing question resets timer & its sound, and resets to show question only)
  const toggleQBtn = document.getElementById('toggle-question-btn');
  if (toggleQBtn) {
    toggleQBtn.addEventListener('click', () => {
      const willShow = !toggleQBtn.classList.contains('active');
      if (willShow) {
        const activeQ = (currentQuestionIndex >= 0 && currentQuestionIndex < currentQuestions.length)
          ? currentQuestions[currentQuestionIndex]
          : null;
        const dur = activeQ?.timer_override || parseInt(document.getElementById('timer-duration-input')?.value) || 30;

        socket.emit('timer:stop');
        socket.emit('timer:set', { duration: dur });

        socket.emit('state:update', {
          show_question: true,
          show_options: false,
          reveal_answer: false,
          show_explanation: false,
          timer_running: false,
          timer_remaining: dur
        });

        toggleButtonState('toggle-question-btn', true);
        toggleButtonState('toggle-options-btn', false);
        toggleButtonState('reveal-answer-btn', false);
        toggleButtonState('toggle-explanation-btn', false);

        updateFlowTimerUI(dur, false);
        const liveTimer = document.getElementById('live-timer-text');
        if (liveTimer) liveTimer.textContent = dur;
      } else {
        socket.emit('timer:stop');
        socket.emit('state:update', {
          show_question: false,
          timer_running: false
        });
        toggleButtonState('toggle-question-btn', false);
        updateFlowTimerUI(undefined, false);
      }
    });
  }

  // Toggle: Show Options
  setupLiveToggle('toggle-options-btn', 'show_options');

  // Toggle: Reveal Answer (stops running timer and its sound immediately)
  const revealAnsBtn = document.getElementById('reveal-answer-btn');
  if (revealAnsBtn) {
    revealAnsBtn.addEventListener('click', () => {
      const willReveal = !revealAnsBtn.classList.contains('active');
      if (willReveal) {
        socket.emit('timer:stop');
        socket.emit('state:update', {
          reveal_answer: true,
          timer_running: false
        });
        toggleButtonState('reveal-answer-btn', true);
        updateFlowTimerUI(undefined, false);
      } else {
        socket.emit('state:update', {
          reveal_answer: false
        });
        toggleButtonState('reveal-answer-btn', false);
      }
    });
  }

  // Toggle: Explanation
  setupLiveToggle('toggle-explanation-btn', 'show_explanation');

  // Timer controls
  document.getElementById('timer-start-btn').addEventListener('click', () => {
    const durInput = parseInt(document.getElementById('timer-duration-input').value) || 30;
    socket.emit('timer:start', { duration: durInput });
  });
  document.getElementById('timer-pause-btn').addEventListener('click', () => {
    socket.emit('timer:pause');
  });
  document.getElementById('timer-stop-btn').addEventListener('click', () => {
    socket.emit('timer:stop');
  });
  document.getElementById('timer-minus-10').addEventListener('click', () => {
    socket.emit('timer:adjust', { amount: -10 });
  });
  document.getElementById('timer-minus-5').addEventListener('click', () => {
    socket.emit('timer:adjust', { amount: -5 });
  });
  document.getElementById('timer-plus-5').addEventListener('click', () => {
    socket.emit('timer:adjust', { amount: 5 });
  });
  document.getElementById('timer-plus-10').addEventListener('click', () => {
    socket.emit('timer:adjust', { amount: 10 });
  });
  document.getElementById('timer-set-btn').addEventListener('click', () => {
    const dur = parseInt(document.getElementById('timer-duration-input').value) || 30;
    socket.emit('timer:set', { duration: dur });
  });

  // ─── Special Screen Control Bar (Teleprompter Question Deck) ───
  const flowTimerToggleBtn = document.getElementById('flow-timer-toggle-btn');
  if (flowTimerToggleBtn) {
    flowTimerToggleBtn.addEventListener('click', () => {
      fetch('/api/presentation/state')
        .then(r => r.json())
        .then(state => {
          if (state && state.timer_running) {
            socket.emit('timer:pause');
          } else {
            const dur = parseInt(document.getElementById('flow-timer-duration-input')?.value) || 30;
            socket.emit('timer:start', { duration: dur });
          }
        })
        .catch(() => {
          const dur = parseInt(document.getElementById('flow-timer-duration-input')?.value) || 30;
          socket.emit('timer:start', { duration: dur });
        });
    });
  }

  const flowTimerResetBtn = document.getElementById('flow-timer-reset-btn');
  if (flowTimerResetBtn) {
    flowTimerResetBtn.addEventListener('click', () => {
      socket.emit('timer:stop');
    });
  }

  const flowPresets = document.querySelectorAll('#flow-timer-presets .preset-chip');
  flowPresets.forEach(chip => {
    chip.addEventListener('click', () => {
      const sec = parseInt(chip.dataset.seconds) || 30;
      const flowInput = document.getElementById('flow-timer-duration-input');
      const sideInput = document.getElementById('timer-duration-input');
      if (flowInput) flowInput.value = sec;
      if (sideInput) sideInput.value = sec;
      flowPresets.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      socket.emit('timer:set', { duration: sec });
    });
  });

  const flowMinus5 = document.getElementById('flow-timer-minus-5');
  if (flowMinus5) {
    flowMinus5.addEventListener('click', () => {
      socket.emit('timer:adjust', { amount: -5 });
    });
  }

  const flowPlus5 = document.getElementById('flow-timer-plus-5');
  if (flowPlus5) {
    flowPlus5.addEventListener('click', () => {
      socket.emit('timer:adjust', { amount: 5 });
    });
  }

  const flowSetBtn = document.getElementById('flow-timer-set-btn');
  if (flowSetBtn) {
    flowSetBtn.addEventListener('click', () => {
      const sec = parseInt(document.getElementById('flow-timer-duration-input')?.value) || 30;
      const sideInput = document.getElementById('timer-duration-input');
      if (sideInput) sideInput.value = sec;
      socket.emit('timer:set', { duration: sec });
    });
  }

  const flowTimerDurationInput = document.getElementById('flow-timer-duration-input');
  if (flowTimerDurationInput) {
    flowTimerDurationInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        flowSetBtn?.click();
      }
    });
  }

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

  // Celebration Manager Start / Stop
  const celebStartBtn = document.getElementById('celebration-start-btn');
  if (celebStartBtn) {
    celebStartBtn.addEventListener('click', () => {
      const duration = parseInt(document.getElementById('celebration-duration-select').value);
      socket.emit('celebration:start', { duration });
    });
  }
  const celebStopBtn = document.getElementById('celebration-stop-btn');
  if (celebStopBtn) {
    celebStopBtn.addEventListener('click', () => {
      socket.emit('celebration:stop');
    });
  }

  // Broadcast Sound Cues (Udan Panam Audio Engine)
  document.querySelectorAll('.broadcast-sound-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.soundCategory;
      const soundObj = soundEffectsCache.find(s => s.category === category);
      const url = soundObj && soundObj.enabled ? soundObj.url : '';
      socket.emit('sound:play', { category, url });
    });
  });

  // Mocking Sounds triggers
  document.querySelectorAll('.mock-sound-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const soundKey = btn.dataset.sound;
      const category = `mocking_${soundKey}`;
      const soundObj = soundEffectsCache.find(s => s.category === category);
      const url = soundObj && soundObj.enabled ? soundObj.url : '';
      socket.emit('sound:play', { category, url });
    });
  });

  // Ambient Suspense
  const suspenseBtn = document.getElementById('sound-suspense-btn');
  if (suspenseBtn) {
    suspenseBtn.addEventListener('click', () => {
      socket.emit('sound:play', { category: 'reveal' });
    });
  }

  // Master Stop Sound
  const stopAllBtn = document.getElementById('sound-stop-all-btn');
  if (stopAllBtn) {
    stopAllBtn.addEventListener('click', () => {
      socket.emit('sound:stop');
    });
  }
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
    const duration = q.timer_override || parseInt(document.getElementById('timer-duration-input')?.value) || 30;

    // Stop timer and reset
    socket.emit('timer:stop');
    socket.emit('timer:set', { duration });

    // Reset toggle states on next question dispatch: SHOW QUESTION ONLY
    socket.emit('state:update', {
      current_question_id: q.id,
      show_question: true,
      show_options: false,
      reveal_answer: false,
      show_explanation: false,
      audio_status: 'stopped',
      timer_running: false,
      timer_remaining: duration
    });

    // Reset UI button highlights to "Show Question Only"
    toggleButtonState('toggle-question-btn', true);
    toggleButtonState('toggle-options-btn', false);
    toggleButtonState('reveal-answer-btn', false);
    toggleButtonState('toggle-explanation-btn', false);

    // Reset timer indicators in admin panel
    updateFlowTimerUI(duration, false);
    const liveTimer = document.getElementById('live-timer-text');
    if (liveTimer) liveTimer.textContent = duration;
    const durInput = document.getElementById('timer-duration-input');
    if (durInput && document.activeElement !== durInput) durInput.value = duration;
    const flowInput = document.getElementById('flow-timer-duration-input');
    if (flowInput && document.activeElement !== flowInput) flowInput.value = duration;

    updateLiveQuestionDisplay();
  }
}

async function dispatchQuestionById(q) {
  const duration = q.timer_override || 30;

  // Stop timer and reset
  socket.emit('timer:stop');
  socket.emit('timer:set', { duration });

  socket.emit('state:update', {
    current_question_id: q.id,
    show_question: true,
    show_options: false,
    reveal_answer: false,
    show_explanation: false,
    audio_status: 'stopped',
    timer_running: false,
    timer_remaining: duration,
    active_level: q.level || 1
  });

  // Reset UI button highlights to "Show Question Only"
  toggleButtonState('toggle-question-btn', true);
  toggleButtonState('toggle-options-btn', false);
  toggleButtonState('reveal-answer-btn', false);
  toggleButtonState('toggle-explanation-btn', false);

  updateFlowTimerUI(duration, false);
  const liveTimer = document.getElementById('live-timer-text');
  if (liveTimer) liveTimer.textContent = duration;
  const durInput = document.getElementById('timer-duration-input');
  if (durInput && document.activeElement !== durInput) durInput.value = duration;
  const flowInput = document.getElementById('flow-timer-duration-input');
  if (flowInput && document.activeElement !== flowInput) flowInput.value = duration;
  
  // Update live controller UI tab to match active level
  if (currentLevel !== q.level) {
    currentLevel = q.level;
    document.querySelectorAll('[id^="level-"]').forEach(btn => btn.classList.remove('active'));
    const activeLevelBtn = document.getElementById(`level-${q.level}-btn`);
    if (activeLevelBtn) activeLevelBtn.classList.add('active');
    await loadQuestionsForLevel(q.level);
  }
  
  // Set current index
  const idx = currentQuestions.findIndex(x => x.id === q.id);
  if (idx !== -1) {
    currentQuestionIndex = idx;
    updateLiveQuestionDisplay();
    renderLiveQuestionsList();
  } else {
    const dockQNum = document.getElementById('dock-q-num');
    const dockQRound = document.getElementById('dock-q-round');
    const dockQPreview = document.getElementById('dock-q-preview');
    const dockBadge = document.getElementById('dock-active-q-badge');
    if (dockQNum) dockQNum.textContent = `Q#${q.id}`;
    if (dockQRound) dockQRound.textContent = `Round ${q.level || 1}`;
    if (dockQPreview) {
      dockQPreview.textContent = q.question_text;
      dockQPreview.title = q.question_text;
    }
    if (dockBadge) dockBadge.classList.add('has-question');
  }
  
  showNotification(`Question #${q.id} dispatched to presentation screen.`);
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
  const promoBtn = document.getElementById('screen-promo-btn');
  const quizBtn = document.getElementById('screen-quiz-btn');
  const stageBadge = document.getElementById('admin-stage-screen-badge');

  if (welcomeBtn) welcomeBtn.classList.toggle('active', state.active_screen === 'welcome');
  if (promoBtn) promoBtn.classList.toggle('active', state.active_screen === 'promo');
  if (quizBtn) quizBtn.classList.toggle('active', state.active_screen === 'quiz');

  if (stageBadge) {
    const sName = (state.active_screen || 'welcome').toUpperCase();
    stageBadge.textContent = `STAGE: ${sName}`;
    stageBadge.className = state.active_screen === 'promo' ? 'badge badge-warning' : (state.active_screen === 'quiz' ? 'badge badge-success' : 'badge badge-primary');
  }

  // Quick Monitor in Live Game Control tab
  const quickStageName = document.getElementById('quick-stage-screen-name');
  if (quickStageName) quickStageName.textContent = (state.active_screen || 'welcome').toUpperCase();

  const isIndependent = state.cast_sync_mode === 'independent';
  const quickCastName = document.getElementById('quick-cast-screen-name');
  if (quickCastName) {
    const castSc = (isIndependent ? (state.cast_screen || 'promo') : (state.active_screen || 'promo')).toUpperCase();
    quickCastName.textContent = isIndependent ? castSc : `MIRROR (${castSc})`;
  }

  document.querySelectorAll('.quick-screen-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.quickScreen === state.active_screen);
  });

  const quickBlackoutBtn = document.getElementById('quick-stage-blackout-btn');
  if (quickBlackoutBtn) {
    quickBlackoutBtn.classList.toggle('btn-danger', !!state.stage_blackout);
    quickBlackoutBtn.classList.toggle('btn-outline', !state.stage_blackout);
  }

  // Dual Screen Matrix Sync
  const stageRouteText = document.getElementById('stage-current-route-text');
  if (stageRouteText) stageRouteText.textContent = (state.active_screen || 'promo').toUpperCase();
  document.querySelectorAll('.stage-route-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.stageRoute === state.active_screen);
  });

  const castRouteText = document.getElementById('cast-current-route-text');
  if (castRouteText) {
    const curCast = (isIndependent ? (state.cast_screen || 'promo') : (state.active_screen || 'promo')).toUpperCase();
    castRouteText.textContent = isIndependent ? curCast : `${curCast} (MIRROR)`;
  }
  document.querySelectorAll('.cast-route-btn').forEach(btn => {
    const targetCast = isIndependent ? (state.cast_screen || 'promo') : (state.active_screen || 'promo');
    btn.classList.toggle('active', btn.dataset.castRoute === targetCast);
  });

  const syncModeBadge = document.getElementById('sync-mode-status-badge');
  if (syncModeBadge) {
    syncModeBadge.textContent = isIndependent ? 'INDEPENDENT SPLIT' : 'LINKED MIRROR';
    syncModeBadge.className = isIndependent ? 'sync-mode-badge badge badge-warning' : 'sync-mode-badge badge badge-info';
  }
  const syncModeBtn = document.getElementById('toggle-cast-sync-mode-btn');
  const syncBtnText = document.getElementById('sync-mode-btn-text');
  const syncHint = document.getElementById('sync-mode-hint');
  if (syncModeBtn) {
    syncModeBtn.classList.toggle('split-active', isIndependent);
    syncModeBtn.classList.toggle('mirror-active', !isIndependent);
    if (syncBtnText) {
      syncBtnText.textContent = isIndependent ? 'Split (Independent Routing)' : 'Linked (Cast Follows Stage)';
    }
    if (syncHint) {
      syncHint.textContent = isIndependent ? 'Cast is routed independently.' : 'Cast mirrors stage automatically.';
    }
  }

  const matrixCastBadge = document.getElementById('matrix-cast-badge');
  if (matrixCastBadge) {
    matrixCastBadge.textContent = isIndependent ? 'INDEPENDENT' : 'MIRRORED';
    matrixCastBadge.className = isIndependent ? 'badge badge-warning' : 'badge badge-info';
  }

  const stageBlackoutBtn = document.getElementById('stage-blackout-toggle-btn');
  if (stageBlackoutBtn) {
    stageBlackoutBtn.classList.toggle('btn-danger', !!state.stage_blackout);
    stageBlackoutBtn.classList.toggle('btn-outline', !state.stage_blackout);
  }

  const castBlackoutBtn = document.getElementById('cast-blackout-toggle-btn');
  if (castBlackoutBtn) {
    castBlackoutBtn.classList.toggle('btn-danger', !!state.cast_blackout);
    castBlackoutBtn.classList.toggle('btn-outline', !state.cast_blackout);
  }

  const castWatermarkBtn = document.getElementById('cast-watermark-toggle-btn');
  if (castWatermarkBtn) {
    const showWatermark = state.cast_watermark_visible !== false;
    castWatermarkBtn.classList.toggle('btn-primary', showWatermark);
    castWatermarkBtn.classList.toggle('btn-outline', !showWatermark);
    castWatermarkBtn.innerHTML = showWatermark ? '<i class="fa-solid fa-shield"></i> Bug: On' : '<i class="fa-solid fa-shield-halved"></i> Bug: Off';
  }

  const castAudioBtn = document.getElementById('cast-audio-toggle-btn');
  if (castAudioBtn) {
    const soundOn = !!state.cast_sound_enabled;
    castAudioBtn.classList.toggle('btn-warning', soundOn);
    castAudioBtn.classList.toggle('btn-outline', !soundOn);
    castAudioBtn.innerHTML = soundOn ? '<i class="fa-solid fa-volume-high"></i> Audio: On' : '<i class="fa-solid fa-volume-xmark"></i> Muted';
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
    if (idx !== -1) {
      currentQuestionIndex = idx;
      if (state.question) {
        currentQuestions[idx] = { ...currentQuestions[idx], ...state.question, presented: true };
      } else {
        currentQuestions[idx].presented = true;
      }
      updateLiveQuestionDisplay();
    }
  }
  renderLiveQuestionsList();

  if (state.timer_remaining !== undefined) {
    const liveTimer = document.getElementById('live-timer-text');
    if (liveTimer) liveTimer.textContent = state.timer_remaining;
    const durInput = document.getElementById('timer-duration-input');
    if (durInput && document.activeElement !== durInput) durInput.value = state.timer_remaining;
    updateFlowTimerUI(state.timer_remaining, state.timer_running);
  }
}

function updateFlowTimerUI(remaining, isRunning) {
  const display = document.getElementById('flow-timer-display');
  const badge = document.getElementById('flow-timer-status-badge');
  const btn = document.getElementById('flow-timer-toggle-btn');
  const icon = document.getElementById('flow-timer-icon');
  const text = document.getElementById('flow-timer-btn-text');
  const flowInput = document.getElementById('flow-timer-duration-input');

  const sec = remaining !== undefined ? parseInt(remaining) : 30;

  if (display) display.textContent = `${sec}s`;

  if (badge) {
    if (isRunning) {
      badge.classList.add('running');
      if (sec <= 5) badge.classList.add('danger');
      else badge.classList.remove('danger');
    } else {
      badge.classList.remove('running', 'danger');
    }
  }

  if (btn && icon && text) {
    if (isRunning) {
      btn.classList.add('active');
      icon.className = 'fa-solid fa-pause';
      text.textContent = 'Pause Timer';
    } else {
      btn.classList.remove('active');
      icon.className = 'fa-solid fa-play';
      text.textContent = 'Turn On Timer';
    }
  }

  if (flowInput && document.activeElement !== flowInput) {
    flowInput.value = sec;
  }

  // Highlight active preset chip if matches
  const presets = document.querySelectorAll('#flow-timer-presets .preset-chip');
  presets.forEach(p => {
    if (parseInt(p.dataset.seconds) === sec) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });
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
    if (qPresentedFilter) url += `&presented=${qPresentedFilter}`;

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
      tdText.textContent = q.question_text;
      tr.appendChild(tdText);

      const tdOptions = document.createElement('td');
      tdOptions.className = 'question-options-cell';
      const ansLetter = (q.correct_answer || 'A').toUpperCase();
      const ansText = q[`option_${ansLetter.toLowerCase()}`] || '';
      tdOptions.innerHTML = `
        <div class="opts-mini-grid">
          <span class="${ansLetter === 'A' ? 'opt-tag correct' : 'opt-tag'}">A: ${escapeHTML(q.option_a || '')}</span>
          <span class="${ansLetter === 'B' ? 'opt-tag correct' : 'opt-tag'}">B: ${escapeHTML(q.option_b || '')}</span>
          <span class="${ansLetter === 'C' ? 'opt-tag correct' : 'opt-tag'}">C: ${escapeHTML(q.option_c || '')}</span>
          <span class="${ansLetter === 'D' ? 'opt-tag correct' : 'opt-tag'}">D: ${escapeHTML(q.option_d || '')}</span>
        </div>
        <div class="ans-badge-row">
          <span class="badge badge-success" style="background: rgba(16, 185, 129, 0.2); border: 1px solid var(--success); color: #34d399; font-weight:700;"><i class="fa-solid fa-check"></i> Ans: ${ansLetter} (${escapeHTML(ansText)})</span>
        </div>
      `;
      tr.appendChild(tdOptions);

      const tdCat = document.createElement('td');
      tdCat.textContent = q.category || 'General';
      tr.appendChild(tdCat);

      const tdPts = document.createElement('td');
      tdPts.textContent = q.points;
      tr.appendChild(tdPts);

      const tdStatus = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `status-badge ${q.presented ? 'used' : 'unused'}`;
      badge.textContent = q.presented ? 'Used' : 'Unused';
      badge.style.cursor = 'pointer';
      badge.addEventListener('click', async () => {
        try {
          const nextState = !q.presented;
          const res = await fetch(`/api/questions/${q.id}/presented`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
            body: JSON.stringify({ presented: nextState })
          });
          if (res.ok) {
            q.presented = nextState;
            badge.className = `status-badge ${nextState ? 'used' : 'unused'}`;
            badge.textContent = nextState ? 'Used' : 'Unused';
            showNotification(`Question ${q.id} marked as ${nextState ? 'Used' : 'Unused'}`);
            if (q.level === currentLevel) {
              loadQuestionsForLevel(currentLevel);
            }
          } else {
            showNotification('Failed to toggle question status', 'error');
          }
        } catch (err) {
          showNotification('Failed to toggle question status', 'error');
        }
      });
      tdStatus.appendChild(badge);
      tr.appendChild(tdStatus);

      const tdAct = document.createElement('td');
      tdAct.innerHTML = `
        <button class="action-row-btn play" data-id="${q.id}" title="Present Question on Screen"><i class="fa-solid fa-tv"></i></button>
        <button class="action-row-btn edit" data-id="${q.id}" title="Edit Question"><i class="fa-solid fa-pen-to-square"></i></button>
        <button class="action-row-btn delete" data-id="${q.id}" title="Delete Question"><i class="fa-solid fa-trash-can"></i></button>
      `;
      tr.appendChild(tdAct);

      tbody.appendChild(tr);
    });

    // Add CRUD event delegation
    tbody.querySelectorAll('.play').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = questions.find(x => x.id === parseInt(btn.dataset.id));
        if (q) {
          dispatchQuestionById(q);
        }
      });
    });
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
  const presentedFilter = document.getElementById('question-presented-filter');
  
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

  presentedFilter.addEventListener('change', () => {
    qPresentedFilter = presentedFilter.value;
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
  document.getElementById('export-excel-btn').addEventListener('click', exportQuestionsExcel);
  document.getElementById('template-btn').addEventListener('click', downloadTemplateJSON);
  document.getElementById('excel-template-btn').addEventListener('click', downloadTemplateExcel);
  
  // Reset presented status for all questions
  const resetPresentedBtn = document.getElementById('reset-presented-btn');
  if (resetPresentedBtn) {
    resetPresentedBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to reset the presented status of all questions?')) return;
      try {
        const res = await fetch('/api/questions/reset-presented', {
          method: 'POST',
          headers: { 'x-admin-token': currentToken }
        });
        if (res.ok) {
          showNotification('All questions reset to Unpresented (Unused).');
          loadQuestionsTable();
          if (typeof loadQuestionsForLevel === 'function') {
            loadQuestionsForLevel(currentLevel);
          }
        } else {
          showNotification('Failed to reset question statuses', 'error');
        }
      } catch (err) {
        showNotification('Failed to reset question statuses', 'error');
      }
    });
  }

  // Import Modal & Handlers
  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-modal').classList.add('active');
  });
  document.getElementById('close-import-modal').addEventListener('click', () => {
    document.getElementById('import-modal').classList.remove('active');
  });
  document.getElementById('modal-import-cancel-btn').addEventListener('click', () => {
    document.getElementById('import-modal').classList.remove('active');
  });

  const modalFileInput = document.getElementById('modal-import-file-input');
  const modalTextInput = document.getElementById('modal-import-text-input');
  const modalSubmitBtn = document.getElementById('modal-import-submit-btn');

  modalSubmitBtn.addEventListener('click', async () => {
    const pastedText = modalTextInput.value.trim();
    if (pastedText) {
      try {
        const data = JSON.parse(pastedText);
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
          modalTextInput.value = '';
          document.getElementById('import-modal').classList.remove('active');
          loadQuestionsTable();
          loadLiveControlData();
        } else {
          const errData = await res.json();
          showNotification(errData.error || 'Import failed', 'error');
        }
      } catch (err) {
        showNotification('Invalid JSON string parsed', 'error');
      }
    } else if (modalFileInput.files.length > 0) {
      const file = modalFileInput.files[0];
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          let questionsArray = [];
          if (isExcel) {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet);
            
            questionsArray = rows.map(row => {
              const getVal = (keys) => {
                for (let k of keys) {
                  if (row[k] !== undefined && row[k] !== null) return row[k];
                }
                return undefined;
              };
              
              return {
                level: parseInt(getVal(['Level', 'level'])) || 1,
                question_text: getVal(['Question Text', 'question_text']) || '',
                audio_url: getVal(['Audio URL', 'audio_url']) || null,
                image_url: getVal(['Image URL', 'image_url']) || null,
                video_url: getVal(['Video URL', 'video_url']) || null,
                option_a: String(getVal(['Option A', 'option_a']) || ''),
                option_b: String(getVal(['Option B', 'option_b']) || ''),
                option_c: String(getVal(['Option C', 'option_c']) || ''),
                option_d: String(getVal(['Option D', 'option_d']) || ''),
                correct_answer: String(getVal(['Correct Answer', 'correct_answer']) || '').trim().toUpperCase(),
                category: getVal(['Category', 'category']) || null,
                points: parseInt(getVal(['Points', 'points'])) || 10,
                timer_override: parseInt(getVal(['Timer Override (seconds)', 'Timer Override', 'timer_override'])) || null,
                explanation: getVal(['Explanation', 'explanation']) || null,
                presented: getVal(['Presented', 'presented']) === 'Yes' || getVal(['Presented', 'presented']) === true || getVal(['Presented', 'presented']) === 'true'
              };
            });
          } else {
            questionsArray = JSON.parse(event.target.result);
          }

          if (!Array.isArray(questionsArray)) {
            showNotification(isExcel ? 'Parsed Excel data is invalid' : 'JSON must be an array of question objects', 'error');
            return;
          }

          const res = await fetch('/api/questions/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
            body: JSON.stringify(questionsArray)
          });

          if (res.ok) {
            showNotification('Bulk questions imported successfully');
            modalFileInput.value = '';
            document.getElementById('import-modal').classList.remove('active');
            loadQuestionsTable();
            loadLiveControlData();
          } else {
            const errData = await res.json();
            showNotification(errData.error || 'Import failed', 'error');
          }
        } catch (err) {
          console.error(err);
          showNotification(isExcel ? 'Error parsing Excel file' : 'Error parsing JSON file', 'error');
        }
      };
      if (isExcel) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
      }
    } else {
      showNotification('Please select a file or paste JSON content first.', 'error');
    }
  });
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

async function exportQuestionsExcel() {
  try {
    const res = await fetch('/api/questions?limit=5000', { headers: { 'x-admin-token': currentToken } });
    const questions = await res.json();
    
    // Map to user-friendly Excel columns
    const data = questions.map(q => ({
      Level: q.level || 1,
      'Question Text': q.question_text || '',
      'Audio URL': q.audio_url || '',
      'Image URL': q.image_url || '',
      'Video URL': q.video_url || '',
      'Option A': q.option_a || '',
      'Option B': q.option_b || '',
      'Option C': q.option_c || '',
      'Option D': q.option_d || '',
      'Correct Answer': q.correct_answer || '',
      Category: q.category || '',
      Points: q.points || 10,
      'Timer Override (seconds)': q.timer_override || '',
      Explanation: q.explanation || '',
      Presented: q.presented ? 'Yes' : 'No'
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Questions");
    
    // Auto-fit column widths
    const max_widths = [];
    data.forEach(row => {
      Object.keys(row).forEach((key, col_idx) => {
        const val = row[key] !== undefined && row[key] !== null ? row[key].toString() : '';
        max_widths[col_idx] = Math.max(max_widths[col_idx] || 10, val.length + 2, key.length + 2);
      });
    });
    worksheet['!cols'] = max_widths.map(w => ({ wch: Math.min(w, 50) }));

    XLSX.writeFile(workbook, `udan-panam-questions-${new Date().toISOString().slice(0,10)}.xlsx`);
    showNotification('Questions exported to Excel');
  } catch (err) {
    console.error(err);
    showNotification('Error exporting questions to Excel', 'error');
  }
}

function downloadTemplateExcel() {
  const template = [
    {
      Level: 1,
      'Question Text': "കേരളത്തിലെ ആദ്യത്തെ മുഖ്യമന്ത്രി ആര്?",
      'Option A': "ഇ. എം. എസ്. നമ്പൂതിരിപ്പാട്",
      'Option B': "പട്ടം താണുപിള്ള",
      'Option C': "സി. അച്യുതമേനോൻ",
      'Option D': "ആർ. ശങ്കർ",
      'Correct Answer': "A",
      Category: "Kerala GK",
      Points: 10,
      'Timer Override (seconds)': 30,
      Explanation: "1957-ൽ ഇ. എം. എസ്. കേരളത്തിലെ ആദ്യ മന്ത്രിസഭ നയിച്ചു.",
      Presented: "No"
    }
  ];
  const worksheet = XLSX.utils.json_to_sheet(template);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
  
  // Set explicit column widths for template
  worksheet['!cols'] = [
    { wch: 8 },  // Level
    { wch: 45 }, // Question Text
    { wch: 20 }, // Audio URL
    { wch: 20 }, // Image URL
    { wch: 20 }, // Video URL
    { wch: 30 }, // Option A
    { wch: 30 }, // Option B
    { wch: 30 }, // Option C
    { wch: 30 }, // Option D
    { wch: 15 }, // Correct Answer
    { wch: 15 }, // Category
    { wch: 8 },  // Points
    { wch: 25 }, // Timer Override (seconds)
    { wch: 40 }, // Explanation
    { wch: 10 }  // Presented
  ];

  XLSX.writeFile(workbook, "udan-panam-excel-template.xlsx");
  showNotification('Excel template downloaded');
}

function importQuestionsJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
  const reader = new FileReader();
  
  reader.onload = async (event) => {
    try {
      let questionsArray = [];
      if (isExcel) {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet);
        
        questionsArray = rows.map(row => {
          const getVal = (keys) => {
            for (let k of keys) {
              if (row[k] !== undefined && row[k] !== null) return row[k];
            }
            return undefined;
          };
          
          return {
            level: parseInt(getVal(['Level', 'level'])) || 1,
            question_text: getVal(['Question Text', 'question_text']) || '',
            audio_url: getVal(['Audio URL', 'audio_url']) || null,
            image_url: getVal(['Image URL', 'image_url']) || null,
            video_url: getVal(['Video URL', 'video_url']) || null,
            option_a: String(getVal(['Option A', 'option_a']) || ''),
            option_b: String(getVal(['Option B', 'option_b']) || ''),
            option_c: String(getVal(['Option C', 'option_c']) || ''),
            option_d: String(getVal(['Option D', 'option_d']) || ''),
            correct_answer: String(getVal(['Correct Answer', 'correct_answer']) || '').trim().toUpperCase(),
            category: getVal(['Category', 'category']) || null,
            points: parseInt(getVal(['Points', 'points'])) || 10,
            timer_override: parseInt(getVal(['Timer Override (seconds)', 'Timer Override', 'timer_override'])) || null,
            explanation: getVal(['Explanation', 'explanation']) || null,
            presented: getVal(['Presented', 'presented']) === 'Yes' || getVal(['Presented', 'presented']) === true || getVal(['Presented', 'presented']) === 'true'
          };
        });
      } else {
        questionsArray = JSON.parse(event.target.result);
      }

      if (!Array.isArray(questionsArray)) {
        showNotification(isExcel ? 'Parsed Excel data is invalid' : 'JSON must be an array of question objects', 'error');
        return;
      }

      const res = await fetch('/api/questions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': currentToken },
        body: JSON.stringify(questionsArray)
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
      console.error(err);
      showNotification(isExcel ? 'Error parsing Excel file' : 'Error parsing JSON file', 'error');
    }
  };

  if (isExcel) {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsText(file);
  }
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
          <button class="action-row-btn delete" data-id="${c.id}" title="Delete Contestant"><i class="fa-solid fa-trash-can"></i></button>
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

    document.getElementById('theme-preset-select').value = s.theme_preset || 'emerald-gold';
    document.getElementById('theme-primary-picker').value = s.theme_primary || '#10b981';
    document.getElementById('theme-primary-text').value = s.theme_primary || '#10b981';
    document.getElementById('theme-secondary-picker').value = s.theme_secondary || '#fbbf24';
    document.getElementById('theme-secondary-text').value = s.theme_secondary || '#fbbf24';
    document.getElementById('theme-bg-picker').value = s.bg_dark || '#022c22';
    document.getElementById('theme-bg-text').value = s.bg_dark || '#022c22';
    document.getElementById('theme-card-text').value = s.bg_card || 'rgba(6, 78, 59, 0.85)';
    
    document.getElementById('theme-text-primary-picker').value = s.theme_text_primary || '#ffffff';
    document.getElementById('theme-text-primary-text').value = s.theme_text_primary || '#ffffff';
    document.getElementById('theme-text-secondary-text').value = s.theme_text_secondary || 'rgba(255, 255, 255, 0.7)';

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
      document.getElementById('theme-text-primary-picker').value = preset.textPrimary;
      document.getElementById('theme-text-primary-text').value = preset.textPrimary;
      document.getElementById('theme-text-secondary-text').value = preset.textSecondary;
    }
  });

  // Color picker sync
  setupColorSync('theme-primary-picker', 'theme-primary-text');
  setupColorSync('theme-secondary-picker', 'theme-secondary-text');
  setupColorSync('theme-bg-picker', 'theme-bg-text');
  setupColorSync('theme-text-primary-picker', 'theme-text-primary-text');

  // Form Submit
  document.getElementById('studio-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      theme_preset: document.getElementById('theme-preset-select').value,
      theme_primary: document.getElementById('theme-primary-text').value,
      theme_secondary: document.getElementById('theme-secondary-text').value,
      bg_dark: document.getElementById('theme-bg-text').value,
      bg_card: document.getElementById('theme-card-text').value,
      theme_text_primary: document.getElementById('theme-text-primary-text').value,
      theme_text_secondary: document.getElementById('theme-text-secondary-text').value,
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
    soundEffectsCache = sounds;

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
      musicBtn.innerHTML = '<i class="fa-solid fa-play"></i> Play Music';
    } else {
      socket.emit('sound:play', { category: 'background', url });
      musicBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Music';
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

    if (e.key === '?') {
      const modal = document.getElementById('hotkeys-modal');
      if (modal) modal.classList.toggle('active');
    } else if (key === 'Z') {
      document.getElementById('zen-mode-toggle-btn')?.click();
    } else if (e.code === 'Space' || e.code === 'ArrowRight') {
      e.preventDefault();
      document.getElementById('next-question-btn')?.click();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      document.getElementById('prev-question-btn')?.click();
    } else if (key === 'R') {
      document.getElementById('reveal-answer-btn')?.click();
    } else if (key === 'T') {
      const startBtn = document.getElementById('timer-start-btn');
      const pauseBtn = document.getElementById('timer-pause-btn');
      fetch('/api/presentation/state')
        .then(r => r.json())
        .then(state => {
          if (state.timer_running) pauseBtn?.click();
          else startBtn?.click();
        });
    } else if (key === 'O') {
      document.getElementById('toggle-options-btn')?.click();
    } else if (key === 'Q') {
      document.getElementById('toggle-question-btn')?.click();
    } else if (key === 'E') {
      document.getElementById('toggle-explanation-btn')?.click();
    } else if (key === '5') {
      document.getElementById('lifeline-fifty-btn')?.click();
    } else if (key === 'P') {
      document.getElementById('lifeline-poll-btn')?.click();
    } else if (key === 'C') {
      document.getElementById('celebration-start-btn')?.click();
    } else if (key === 'M') {
      document.getElementById('sound-stop-all-btn')?.click();
    } else if (e.key === 'Escape') {
      const openModal = document.querySelector('.modal.active');
      if (openModal) {
        openModal.classList.remove('active');
      } else {
        document.getElementById('screen-welcome-btn')?.click();
      }
    }
  });
}

// ═════════════════════════════════════════════
// 🌿 Stress-Free Studio: Zen Focus Mode Controller
// ═════════════════════════════════════════════
function initZenMode() {
  const zenToggleBtn = document.getElementById('zen-mode-toggle-btn');
  const isZen = localStorage.getItem('admin-zen-mode') === 'true';

  function applyZenState(active, notify = false) {
    if (active) {
      document.body.classList.add('zen-mode');
      if (zenToggleBtn) {
        zenToggleBtn.classList.add('active');
        zenToggleBtn.setAttribute('title', 'Exit Zen Focus Mode (Z)');
        zenToggleBtn.innerHTML = '<i class="fa-solid fa-leaf"></i> <span>Zen On</span>';
      }
      if (notify) showNotification('🌿 Zen Focus Mode: Distraction-free calm broadcast', 'info');
    } else {
      document.body.classList.remove('zen-mode');
      if (zenToggleBtn) {
        zenToggleBtn.classList.remove('active');
        zenToggleBtn.setAttribute('title', 'Toggle Calm Zen Focus Mode (Z)');
        zenToggleBtn.innerHTML = '<i class="fa-solid fa-leaf"></i> <span>Zen</span>';
      }
      if (notify) showNotification('Studio Mode restored', 'info');
    }
  }

  // Restore saved state
  if (isZen) {
    applyZenState(true, false);
  }

  zenToggleBtn?.addEventListener('click', () => {
    const currentlyActive = document.body.classList.contains('zen-mode');
    const nextActive = !currentlyActive;
    localStorage.setItem('admin-zen-mode', nextActive ? 'true' : 'false');
    applyZenState(nextActive, true);
  });
}

// ═════════════════════════════════════════════
// ⏱️ Advanced Feature 1: Broadcast Stopwatch
// ═════════════════════════════════════════════
let stopwatchInterval = null;
let stopwatchSeconds = 0;
let isStopwatchRunning = false;

function initBroadcastStopwatch() {
  const display = document.getElementById('stopwatch-display');
  const toggleBtn = document.getElementById('stopwatch-toggle-btn');
  const resetBtn = document.getElementById('stopwatch-reset-btn');
  if (!display || !toggleBtn || !resetBtn) return;

  function formatTime(totalSec) {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  toggleBtn.addEventListener('click', () => {
    isStopwatchRunning = !isStopwatchRunning;
    if (isStopwatchRunning) {
      toggleBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
      toggleBtn.title = 'Pause Broadcast Clock';
      if (!stopwatchInterval) {
        stopwatchInterval = setInterval(() => {
          stopwatchSeconds++;
          display.textContent = formatTime(stopwatchSeconds);
        }, 1000);
      }
    } else {
      toggleBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
      toggleBtn.title = 'Start Broadcast Clock';
      if (stopwatchInterval) {
        clearInterval(stopwatchInterval);
        stopwatchInterval = null;
      }
    }
  });

  resetBtn.addEventListener('click', () => {
    isStopwatchRunning = false;
    toggleBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    toggleBtn.title = 'Start Broadcast Clock';
    if (stopwatchInterval) {
      clearInterval(stopwatchInterval);
      stopwatchInterval = null;
    }
    stopwatchSeconds = 0;
    display.textContent = '00:00:00';
  });
}

// ═════════════════════════════════════════════
// 📡 Advanced Feature 2: Socket Ping Monitor
// ═════════════════════════════════════════════
function initSocketPingDiagnostics() {
  const pingBadge = document.getElementById('ping-status-badge');
  const pingText = document.getElementById('ping-ms-text');
  if (!pingBadge || !pingText) return;

  setInterval(() => {
    if (!socket || !isSocketConnected) {
      pingText.textContent = '-- ms';
      pingBadge.className = 'clay-ping-badge red';
      return;
    }
    const start = Date.now();
    fetch('/api/presentation/state', {
      headers: { 'x-admin-token': currentToken }
    })
    .then(() => {
      const latency = Date.now() - start;
      pingText.textContent = `${latency}ms`;
      if (latency < 60) {
        pingBadge.className = 'clay-ping-badge green';
      } else if (latency < 160) {
        pingBadge.className = 'clay-ping-badge amber';
      } else {
        pingBadge.className = 'clay-ping-badge red';
      }
    })
    .catch(() => {
      pingText.textContent = 'err';
      pingBadge.className = 'clay-ping-badge red';
    });
  }, 4500);
}

// ═════════════════════════════════════════════
// 🚨 Advanced Feature 3: Emergency Flash Alert
// ═════════════════════════════════════════════
function initFlashAlertDispatcher() {
  const triggerBtn = document.getElementById('flash-alert-trigger-btn');
  const modal = document.getElementById('flash-alert-modal');
  const closeBtn = document.getElementById('close-flash-modal');
  const customText = document.getElementById('flash-custom-text');
  const chimeCheck = document.getElementById('flash-sound-chime');
  const submitBtn = document.getElementById('flash-submit-btn');
  const clearBtn = document.getElementById('flash-clear-btn');
  if (!modal) return;

  triggerBtn?.addEventListener('click', () => {
    modal.classList.add('active');
  });

  closeBtn?.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
  });

  document.querySelectorAll('.flash-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (customText) {
        customText.value = btn.dataset.text || '';
        customText.focus();
      }
    });
  });

  submitBtn?.addEventListener('click', () => {
    const text = customText?.value?.trim();
    if (!text) {
      showNotification('Please enter announcement text', 'warning');
      return;
    }
    if (socket) {
      socket.emit('stage:ticker', { show: true, text });
      if (chimeCheck?.checked) {
        socket.emit('sound:play', { category: 'transition' });
      }
    }
    showNotification('Flash Alert broadcasted live to all screens!', 'success');
    modal.classList.remove('active');
  });

  clearBtn?.addEventListener('click', () => {
    if (socket) {
      socket.emit('stage:ticker', { show: false });
    }
    if (customText) customText.value = '';
    showNotification('Stage ticker cleared', 'info');
    modal.classList.remove('active');
  });
}

// ═════════════════════════════════════════════
// ⌨️ Advanced Feature 4: Hotkeys Guide Modal
// ═════════════════════════════════════════════
function initHotkeysModal() {
  const modalBtn = document.getElementById('hotkeys-modal-btn');
  const modal = document.getElementById('hotkeys-modal');
  const closeBtn = document.getElementById('close-hotkeys-modal');
  if (!modal) return;

  modalBtn?.addEventListener('click', () => {
    modal.classList.add('active');
  });

  closeBtn?.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
  });
}

// ═════════════════════════════════════════════
// 🖥️ Advanced Feature 5: Fullscreen Director Console
// ═════════════════════════════════════════════
function initFullscreenToggle() {
  const btn = document.getElementById('fullscreen-toggle-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.log(err));
      btn.innerHTML = '<i class="fa-solid fa-compress"></i>';
      btn.title = 'Exit Fullscreen Control Room';
    } else {
      document.exitFullscreen().catch(err => console.log(err));
      btn.innerHTML = '<i class="fa-solid fa-expand"></i>';
      btn.title = 'Toggle Fullscreen Control Room';
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      btn.innerHTML = '<i class="fa-solid fa-expand"></i>';
    } else {
      btn.innerHTML = '<i class="fa-solid fa-compress"></i>';
    }
  });
}

// ═════════════════════════════════════════════
// 🎨 Advanced Feature 6: Claymorphism Studio Suite
// ═════════════════════════════════════════════
function initClayCustomizer() {
  const openBtn = document.getElementById('clay-customizer-btn');
  const modal = document.getElementById('clay-customizer-modal');
  const closeBtn = document.getElementById('close-clay-modal');
  const saveBtn = document.getElementById('clay-save-close-btn');
  const resetBtn = document.getElementById('clay-reset-defaults-btn');
  const hapticToggle = document.getElementById('clay-sound-haptic-toggle');

  if (!modal) return;

  openBtn?.addEventListener('click', () => {
    const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
    document.querySelectorAll('.clay-segment-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === currentTheme);
    });

    const currentDepth = document.body.getAttribute('data-clay-depth') || 'classic';
    document.querySelectorAll('.clay-depth-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.depth === currentDepth);
    });

    const currentAccent = document.body.getAttribute('data-clay-accent') || 'cyan';
    document.querySelectorAll('.clay-accent-swatch').forEach(b => {
      b.classList.toggle('active', b.dataset.accent === currentAccent);
    });

    if (hapticToggle) {
      hapticToggle.checked = localStorage.getItem('clay-haptic') !== 'false';
    }

    modal.classList.add('active');
  });

  closeBtn?.addEventListener('click', () => modal.classList.remove('active'));
  saveBtn?.addEventListener('click', () => {
    modal.classList.remove('active');
    showNotification('Claymorphism Studio settings applied!', 'success');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
  });

  // Theme Segment Toggle
  document.querySelectorAll('.clay-segment-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.clay-segment-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const theme = b.dataset.theme;
      if (theme === 'light') {
        document.body.classList.add('light-theme');
        localStorage.setItem('admin-theme', 'light');
      } else {
        document.body.classList.remove('light-theme');
        localStorage.setItem('admin-theme', 'dark');
      }
      updateThemeToggleUI();
    });
  });

  // Depth Picker
  document.querySelectorAll('.clay-depth-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.clay-depth-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const depth = b.dataset.depth || 'classic';
      document.body.setAttribute('data-clay-depth', depth);
      localStorage.setItem('clay-depth', depth);
    });
  });

  // Accent Swatches
  document.querySelectorAll('.clay-accent-swatch').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.clay-accent-swatch').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const accent = b.dataset.accent || 'cyan';
      document.body.setAttribute('data-clay-accent', accent);
      localStorage.setItem('clay-accent', accent);
    });
  });

  // Haptic feedback toggle
  hapticToggle?.addEventListener('change', (e) => {
    localStorage.setItem('clay-haptic', e.target.checked ? 'true' : 'false');
  });

  // Reset Defaults
  resetBtn?.addEventListener('click', () => {
    document.body.classList.remove('light-theme');
    document.body.setAttribute('data-clay-depth', 'classic');
    document.body.setAttribute('data-clay-accent', 'cyan');
    localStorage.setItem('admin-theme', 'dark');
    localStorage.setItem('clay-depth', 'classic');
    localStorage.setItem('clay-accent', 'cyan');
    localStorage.setItem('clay-haptic', 'true');
    updateThemeToggleUI();
    modal.classList.remove('active');
    showNotification('Restored Claymorphism defaults', 'info');
  });
}

// ═════════════════════════════════════════════
// 🔊 Advanced Feature 7: Floating Studio Soundboard
// ═════════════════════════════════════════════
function initFloatingSoundboard() {
  const toggleBtn = document.getElementById('sound-dock-toggle-btn');
  const dock = document.getElementById('floating-sound-dock');
  const minBtn = document.getElementById('sound-dock-minimize-btn');
  if (!dock) return;

  toggleBtn?.addEventListener('click', () => {
    const isHidden = dock.style.display === 'none';
    dock.style.display = isHidden ? 'block' : 'none';
  });

  minBtn?.addEventListener('click', () => {
    dock.style.display = 'none';
  });

  // Sound trigger pads
  document.querySelectorAll('.sound-pad-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const soundType = btn.dataset.sound;
      if (!socket) return;
      if (soundType === 'stop-all') {
        socket.emit('sound:stop');
        showNotification('Stopped all playing stage audio', 'info');
      } else if (soundType === 'applause') {
        socket.emit('sound:play', { category: 'mocking_laughter' });
        showNotification('Triggered Audience Cheer', 'success');
      } else if (soundType === 'correct') {
        socket.emit('sound:play', { category: 'correct' });
      } else if (soundType === 'wrong') {
        socket.emit('sound:play', { category: 'wrong' });
      } else if (soundType === 'drumroll') {
        socket.emit('sound:play', { category: 'timer' });
      } else if (soundType === 'heartbeat') {
        socket.emit('sound:play', { category: 'background' });
      } else if (soundType === 'tick') {
        socket.emit('sound:play', { category: 'transition' });
      } else if (soundType === 'cash') {
        socket.emit('sound:play', { category: 'atm_cash' });
        showNotification('Triggered ATM Cash Dispenser 💸', 'success');
      }
    });
  });
}

// ═════════════════════════════════════════════
// 📜 Advanced Feature 8: Teleprompter Pro Tools
// ═════════════════════════════════════════════
let currentTeleprompterZoom = 100;

function initTeleprompterProTools() {
  const btnDown = document.getElementById('teleprompter-font-down');
  const btnReset = document.getElementById('teleprompter-font-reset');
  const btnUp = document.getElementById('teleprompter-font-up');
  const btnPeek = document.getElementById('teleprompter-peek-btn');
  const qText = document.getElementById('live-question-text');
  const optionsPreview = document.getElementById('live-question-options-preview');

  const zooms = [80, 100, 120, 140, 160];

  function applyZoom(zoom) {
    currentTeleprompterZoom = zoom;
    if (qText) {
      zooms.forEach(z => qText.classList.remove(`zoom-${z}`));
      qText.classList.add(`zoom-${zoom}`);
    }
    if (btnReset) {
      btnReset.textContent = `${zoom}%`;
    }
  }

  btnDown?.addEventListener('click', () => {
    const idx = zooms.indexOf(currentTeleprompterZoom);
    if (idx > 0) applyZoom(zooms[idx - 1]);
  });

  btnUp?.addEventListener('click', () => {
    const idx = zooms.indexOf(currentTeleprompterZoom);
    if (idx < zooms.length - 1) applyZoom(zooms[idx + 1]);
  });

  btnReset?.addEventListener('click', () => {
    applyZoom(100);
  });

  btnPeek?.addEventListener('click', () => {
    if (optionsPreview) {
      optionsPreview.classList.toggle('peek-active');
      const isPeeking = optionsPreview.classList.contains('peek-active');
      btnPeek.classList.toggle('btn-primary', isPeeking);
      btnPeek.classList.toggle('btn-outline', !isPeeking);
      btnPeek.innerHTML = isPeeking ? '<i class="fa-solid fa-eye-slash"></i> <span>Hide Ans</span>' : '<i class="fa-solid fa-eye"></i> <span>Peek Ans</span>';
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

/* ═══════════════════════════════════════════════════════
   PROMO & CASTING MANAGEMENT STUDIO LOGIC
   ═══════════════════════════════════════════════════════ */

let isPromoReelPlaying = false;
let currentDirectorScene = 'all';
const directorScenesOrder = ['1', '2', '3', '4', '5'];

function loadPromoCastTab() {
  fetch('/api/promo')
    .then(r => r.ok ? r.json() : null)
    .then(promo => {
      if (!promo) return;
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) el.value = val;
      };
      setVal('pedit-eyebrow', promo.eyebrow_badge || 'SRDB PRESENTS');
      setVal('pedit-producer', promo.producer_tag || 'FROM THE PRODUCER DC');
      setVal('pedit-tagline', promo.tagline || 'THE ULTIMATE BATTLE OF MINDS • GRAND TELECAST');
      setVal('pedit-hashtag', promo.hashtag || '# udan panam');

      setVal('pedit-card1-tag', promo.card1_tag || 'ELIGIBILITY');
      setVal('pedit-card1-title', promo.card1_title || 'FOR CLASSES 1 TO 10');
      setVal('pedit-card1-desc', promo.card1_desc || '1 മുതൽ 10 വരെയുള്ള ക്ലാസ്സുകളിലെ മിടുക്കന്മാർക്കായി');

      setVal('pedit-card2-tag', promo.card2_tag || 'CONTESTANT RULE');
      setVal('pedit-card2-title', promo.card2_title || 'ONE PARTICIPANT PER CLASS');
      setVal('pedit-card2-desc', promo.card2_desc || 'ഓരോ ക്ലാസ്സിൽ നിന്നും തിരഞ്ഞെടുക്കപ്പെടുന്ന ഒരു പ്രതിഭ വീതം!');

      setVal('pedit-card3-tag', promo.card3_tag || 'STAGE CONDUCTORS');
      setVal('pedit-card3-chairman', promo.card3_chairman || 'ADHIL S');
      setVal('pedit-card3-convenor', promo.card3_convenor || 'MUSTHAQEEM MUHAMMED');
      setVal('pedit-card3-desc', promo.card3_desc || 'നേതൃത്വം: ചെയർമാൻ ആദിൽ എസ് & കൺവീനർ മുസ്തഖീം മുഹമ്മദ്');

      setVal('pedit-card4-tag', promo.card4_tag || 'MEGA REWARDS');
      setVal('pedit-card4-title', promo.card4_title || 'PARTICIPATE & WIN VALUABLE PRIZES!');
      setVal('pedit-card4-desc', promo.card4_desc || 'പങ്കെടുക്കൂ, ആകർഷകവും അമൂല്യവുമായ സമ്മാനങ്ങൾ നേടൂ!');

      const spSelect = document.getElementById('admin-reel-speed-select');
      if (spSelect && promo.reel_speed) spSelect.value = String(promo.reel_speed);
    })
    .catch(err => console.error('Error loading promo settings:', err));

  // Request latest connected display list
  socket.emit('cast:get-list');
}

function updateConnectedDisplaysTable(displays = []) {
  const tbody = document.getElementById('connected-displays-table-body');
  const countBadge = document.getElementById('status-displays-count');
  if (countBadge) countBadge.textContent = displays.length;

  if (!tbody) return;
  if (!displays || displays.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding:1.5rem;">No external displays or casting screens currently detected. Open a casting screen to pair.</td></tr>`;
    return;
  }

  tbody.innerHTML = displays.map((disp, i) => {
    const isCast = disp.type === 'cast';
    const typeBadge = isCast 
      ? `<span class="badge badge-info"><i class="fa-solid fa-tv"></i> Cast Display</span>` 
      : `<span class="badge badge-primary"><i class="fa-solid fa-desktop"></i> Stage Display</span>`;
    
    return `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${escapeHTML(disp.name)}</strong></td>
        <td>${typeBadge}</td>
        <td><code>${escapeHTML(disp.resolution || 'Auto')}</code></td>
        <td><code>${escapeHTML(disp.ip || 'Localhost')}</code></td>
        <td><span class="status-dot green"></span> <small class="text-success font-weight-bold">ONLINE</small></td>
        <td>
          <div style="display:flex; gap:4px;">
            <button class="btn btn-xs btn-outline" onclick="pingDisplay('${disp.socketId}')" title="Ping with Confetti">
              <i class="fa-solid fa-bell"></i> Ping
            </button>
            <button class="btn btn-xs btn-outline" onclick="fullscreenDisplay('${disp.socketId}')" title="Force Fullscreen">
              <i class="fa-solid fa-expand"></i>
            </button>
            <button class="btn btn-xs btn-outline danger" onclick="reloadDisplay('${disp.socketId}')" title="Reload Display">
              <i class="fa-solid fa-rotate-right"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.pingDisplay = function(socketId) {
  socket.emit('cast:command', { target: socketId, command: 'ping' });
  showNotification('Sent ping signal to display');
};

window.fullscreenDisplay = function(socketId) {
  socket.emit('cast:command', { target: socketId, command: 'fullscreen' });
  showNotification('Requested fullscreen on display');
};

window.reloadDisplay = function(socketId) {
  socket.emit('cast:command', { target: socketId, command: 'reload' });
  showNotification('Triggered remote reload on display');
};

function setupPromoCastListeners() {
  // 🎙️ 1. Studio Header Sub-Navigation Pills 🎙️
  document.querySelectorAll('.promo-nav-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.promo-nav-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const targetSub = pill.dataset.promoSub;
      
      document.querySelectorAll('.promo-subview-panel').forEach(panel => {
        if (panel.id === `subview-${targetSub}`) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });
    });
  });

  // ── 2. Screen 1 (Stage) Route Buttons ──
  document.querySelectorAll('.stage-route-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.stageRoute;
      socket.emit('state:update', { active_screen: target });
      showNotification(`Stage Screen 1 routed to ${target.toUpperCase()}`);
    });
  });

  // ── 3. Screen 2 (Cast) Route Buttons ──
  document.querySelectorAll('.cast-route-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.castRoute;
      socket.emit('state:update', { cast_sync_mode: 'independent', cast_screen: target });
      showNotification(`Cast Screen 2 routed to ${target.toUpperCase()} (Independent Split)`);
    });
  });

  // ── 4. Sync & Routing Bridge Mode Toggle ──
  const syncModeToggleBtn = document.getElementById('toggle-cast-sync-mode-btn');
  if (syncModeToggleBtn) {
    syncModeToggleBtn.addEventListener('click', () => {
      const isCurrentlyIndependent = syncModeToggleBtn.classList.contains('split-active');
      const newMode = isCurrentlyIndependent ? 'mirror' : 'independent';
      socket.emit('state:update', { cast_sync_mode: newMode });
      showNotification(newMode === 'independent' ? 'Switched to Independent Dual-Screen Mode' : 'Switched to Linked Mirror Mode');
    });
  }

  // Clone Stage to Cast & Swap Screens
  const cloneBtn = document.getElementById('matrix-clone-stage-to-cast-btn');
  if (cloneBtn) {
    cloneBtn.addEventListener('click', () => {
      const stageScreen = document.getElementById('stage-current-route-text')?.textContent?.toLowerCase() || 'promo';
      socket.emit('state:update', { cast_sync_mode: 'independent', cast_screen: stageScreen });
      showNotification(`Cloned Stage screen (${stageScreen.toUpperCase()}) to Cast`);
    });
  }

  const swapBtn = document.getElementById('matrix-swap-screens-btn');
  if (swapBtn) {
    swapBtn.addEventListener('click', () => {
      const stageSc = document.getElementById('stage-current-route-text')?.textContent?.toLowerCase() || 'promo';
      const castSc = document.getElementById('cast-current-route-text')?.textContent?.replace(/\s*\(.*\)/, '').trim().toLowerCase() || 'promo';
      socket.emit('state:update', { active_screen: castSc, cast_screen: stageSc, cast_sync_mode: 'independent' });
      showNotification(`Swapped screens: Stage → ${castSc.toUpperCase()}, Cast → ${stageSc.toUpperCase()}`);
    });
  }

  // ── 5. Stage Presenter Dock Buttons ──
  const dockAutoBtn = document.getElementById('stage-dock-autohide-btn');
  const dockAlwaysBtn = document.getElementById('stage-dock-always-btn');
  const dockHideBtn = document.getElementById('stage-dock-hide-btn');

  function setDockActiveBtn(activeBtn) {
    [dockAutoBtn, dockAlwaysBtn, dockHideBtn].forEach(b => b?.classList.remove('active'));
    activeBtn?.classList.add('active');
  }

  if (dockAutoBtn) {
    dockAutoBtn.addEventListener('click', () => {
      setDockActiveBtn(dockAutoBtn);
      socket.emit('stage:dock', { visible: true, mode: 'autohide' });
      showNotification('Stage presenter dock set to Auto-Hide (4.5s idle)');
    });
  }
  if (dockAlwaysBtn) {
    dockAlwaysBtn.addEventListener('click', () => {
      setDockActiveBtn(dockAlwaysBtn);
      socket.emit('stage:dock', { visible: true, mode: 'always' });
      showNotification('Stage presenter dock locked permanently visible');
    });
  }
  if (dockHideBtn) {
    dockHideBtn.addEventListener('click', () => {
      setDockActiveBtn(dockHideBtn);
      socket.emit('stage:dock', { visible: false, mode: 'hidden' });
      showNotification('Stage presenter dock hidden');
    });
  }

  // ── 6. Stage & Cast Blackout Controls ──
  let isStageBlackout = false;
  let isCastBlackout = false;

  function toggleStageBlackoutAction() {
    isStageBlackout = !isStageBlackout;
    socket.emit('stage:blackout', { blackout: isStageBlackout });
    showNotification(isStageBlackout ? 'Stage Blackout Curtain Activated' : 'Stage Blackout Curtain Lifted');
  }

  document.getElementById('stage-blackout-toggle-btn')?.addEventListener('click', toggleStageBlackoutAction);
  document.getElementById('quick-stage-blackout-btn')?.addEventListener('click', toggleStageBlackoutAction);

  document.getElementById('cast-blackout-toggle-btn')?.addEventListener('click', () => {
    isCastBlackout = !isCastBlackout;
    socket.emit('cast:blackout', { blackout: isCastBlackout });
    showNotification(isCastBlackout ? 'Cast Blackout Curtain Activated' : 'Cast Blackout Curtain Lifted');
  });

  // ── 7. Cast Watermark Bug & Audio Mute ──
  document.getElementById('cast-watermark-toggle-btn')?.addEventListener('click', () => {
    const isWatermarkOn = document.getElementById('cast-watermark-toggle-btn')?.classList.contains('btn-primary');
    socket.emit('state:update', { cast_watermark_visible: !isWatermarkOn });
    showNotification(!isWatermarkOn ? 'Cast On-Air Bug Activated' : 'Cast On-Air Bug Hidden');
  });

  document.getElementById('cast-audio-toggle-btn')?.addEventListener('click', () => {
    const isAudioOn = document.getElementById('cast-audio-toggle-btn')?.classList.contains('btn-warning');
    socket.emit('state:update', { cast_sound_enabled: !isAudioOn });
    showNotification(!isAudioOn ? 'Cast Audio Enabled (Unmuted)' : 'Cast Audio Muted');
  });

  // ── 8. Broadcast Lower-Third News Ticker ──
  const castTickerInput = document.getElementById('cast-ticker-input');
  document.getElementById('cast-ticker-send-btn')?.addEventListener('click', () => {
    const txt = castTickerInput?.value?.trim();
    if (txt) {
      socket.emit('stage:ticker', { show: true, text: txt });
      showNotification('Broadcasted lower-third ticker to Cast display');
    }
  });
  document.getElementById('cast-ticker-clear-btn')?.addEventListener('click', () => {
    socket.emit('stage:ticker', { show: false });
    showNotification('Cleared lower-third ticker');
  });

  // Stage Fanfare SFX Blast
  document.getElementById('stage-fanfare-blast-btn')?.addEventListener('click', () => {
    socket.emit('promo:sound');
    showNotification('Broadcast fanfare sound triggered');
  });

  // ── 9. Quick Screen Buttons in Live Control ──
  document.querySelectorAll('.quick-screen-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('state:update', { active_screen: btn.dataset.quickScreen });
      showNotification(`Stage Screen routed to ${btn.dataset.quickScreen.toUpperCase()}`);
    });
  });

  document.getElementById('jump-to-promo-cast-btn')?.addEventListener('click', () => {
    switchTab('promo-cast');
  });

  // ── 10. Display Window Launchers ──
  document.getElementById('stage-open-window-btn')?.addEventListener('click', () => {
    const stageWin = window.open('/', 'UdanPanamStage', 'width=1920,height=1080');
    if (stageWin) stageWin.focus();
    showNotification('Stage Presentation window opened');
  });

  document.getElementById('cast-open-window-btn')?.addEventListener('click', () => {
    const castWin = window.open('/cast', 'UdanPanamCast', 'width=1920,height=1080,menubar=no,toolbar=no,location=no,status=no');
    if (castWin) castWin.focus();
    showNotification('Dedicated Casting Display window opened');
  });

  document.getElementById('cast-copy-url-btn')?.addEventListener('click', () => {
    const url = `${window.location.origin}/cast`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        showNotification('Casting URL copied to clipboard: ' + url);
      });
    } else {
      prompt('Copy casting URL:', url);
    }
  });

  document.getElementById('cast-remote-fullscreen-btn')?.addEventListener('click', () => {
    socket.emit('cast:command', { target: 'all', command: 'fullscreen' });
    showNotification('Triggered remote fullscreen on all cast displays');
  });

  document.getElementById('cast-remote-reload-btn')?.addEventListener('click', () => {
    if (confirm('Reload all connected cast displays?')) {
      socket.emit('cast:command', { target: 'all', command: 'reload' });
      showNotification('Triggered remote reload on all cast displays');
    }
  });

  // ── 11. Scene Director Cards ──
  document.querySelectorAll('[data-director-scene]').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('[data-director-scene]').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const sc = card.dataset.directorScene;
      currentDirectorScene = sc;
      socket.emit('state:update', { active_screen: 'promo' });
      socket.emit('promo:control', { action: 'scene', scene: sc });
      showNotification(`Promo Scene ${sc.toUpperCase()} triggered on displays`);
    });
  });

  // ── 12. Cinematic Reel Master Controller ──
  const reelToggleBtn = document.getElementById('admin-reel-toggle-btn');
  const reelLabel = document.getElementById('admin-reel-btn-label');
  if (reelToggleBtn) {
    reelToggleBtn.addEventListener('click', () => {
      isPromoReelPlaying = !isPromoReelPlaying;
      socket.emit('state:update', { active_screen: 'promo' });
      socket.emit('promo:control', { action: isPromoReelPlaying ? 'play' : 'pause' });

      if (reelLabel) reelLabel.textContent = isPromoReelPlaying ? 'Pause Reel' : 'Play Cinematic Reel';
      const icon = reelToggleBtn.querySelector('i');
      if (icon) icon.className = isPromoReelPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
      reelToggleBtn.classList.toggle('btn-warning', isPromoReelPlaying);
      reelToggleBtn.classList.toggle('btn-success', !isPromoReelPlaying);
      showNotification(isPromoReelPlaying ? 'Cinematic Auto-Reel Started' : 'Cinematic Auto-Reel Paused');
    });
  }

  // Prev / Next Scene buttons
  document.getElementById('admin-reel-prev-btn')?.addEventListener('click', () => {
    let idx = directorScenesOrder.indexOf(currentDirectorScene);
    idx = (idx - 1 + directorScenesOrder.length) % directorScenesOrder.length;
    const nextSc = directorScenesOrder[idx];
    document.querySelector(`[data-director-scene="${nextSc}"]`)?.click();
  });

  document.getElementById('admin-reel-next-btn')?.addEventListener('click', () => {
    let idx = directorScenesOrder.indexOf(currentDirectorScene);
    idx = (idx + 1) % directorScenesOrder.length;
    const nextSc = directorScenesOrder[idx];
    document.querySelector(`[data-director-scene="${nextSc}"]`)?.click();
  });

  document.getElementById('admin-reel-restart-btn')?.addEventListener('click', () => {
    socket.emit('promo:control', { action: 'restart' });
    document.querySelector('[data-director-scene="1"]')?.click();
    showNotification('Promo Reel restarted from Scene 1');
  });

  // Reel Speed select
  document.getElementById('admin-reel-speed-select')?.addEventListener('change', (e) => {
    const sp = parseInt(e.target.value) || 5500;
    socket.emit('promo:save-content', { reel_speed: sp });
    showNotification(`Reel dwell duration set to ${(sp / 1000).toFixed(1)}s`);
  });

  // ── 13. Cast Displays Master Actions ──
  document.getElementById('admin-refresh-displays-btn')?.addEventListener('click', () => {
    socket.emit('cast:get-list');
    showNotification('Refreshing displays registry...');
  });

  document.getElementById('admin-broadcast-fullscreen-btn')?.addEventListener('click', () => {
    socket.emit('cast:command', { target: 'all', command: 'fullscreen' });
    showNotification('Broadcasted fullscreen command to all displays');
  });

  document.getElementById('admin-broadcast-reload-btn')?.addEventListener('click', () => {
    if (confirm('Reload all connected cast and presentation displays?')) {
      socket.emit('cast:command', { target: 'all', command: 'reload' });
      showNotification('Broadcasted reload command to all displays');
    }
  });

  // ── 14. Save Promo Content Form ──
  document.getElementById('admin-save-promo-content-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    const getVal = id => document.getElementById(id)?.value?.trim() || '';
    const payload = {
      eyebrow_badge: getVal('pedit-eyebrow'),
      producer_tag: getVal('pedit-producer'),
      tagline: getVal('pedit-tagline'),
      hashtag: getVal('pedit-hashtag'),
      card1_tag: getVal('pedit-card1-tag'),
      card1_title: getVal('pedit-card1-title'),
      card1_desc: getVal('pedit-card1-desc'),
      card2_tag: getVal('pedit-card2-tag'),
      card2_title: getVal('pedit-card2-title'),
      card2_desc: getVal('pedit-card2-desc'),
      card3_tag: getVal('pedit-card3-tag'),
      card3_chairman: getVal('pedit-card3-chairman'),
      card3_convenor: getVal('pedit-card3-convenor'),
      card3_desc: getVal('pedit-card3-desc'),
      card4_tag: getVal('pedit-card4-tag'),
      card4_title: getVal('pedit-card4-title'),
      card4_desc: getVal('pedit-card4-desc')
    };

    socket.emit('promo:save-content', payload);
    showNotification('Promo Content saved and broadcast to all displays!');
  });
}

