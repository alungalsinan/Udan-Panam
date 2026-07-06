/* ═══════════════════════════════════════
   Udan Panam v2.0 — Presentation Screen Client
   Real-Time Event Driven (Socket.IO)
   ═══════════════════════════════════════ */

const socket = io();

// DOM Elements
const connectionDot = document.getElementById('connectionIndicator');
const welcomeScreen = document.getElementById('screenWelcome');
const quizScreen = document.getElementById('screenQuiz');
const startBtn = document.getElementById('btnStart');
const welcomeTitle = document.getElementById('welcomeTitle');
const welcomeSubtitle = document.getElementById('welcomeSubtitle');

const timerContainer = document.getElementById('timerContainer');
const timerRing = document.getElementById('timerProgress');
const timerText = document.getElementById('timerValue');

const questionProgress = document.getElementById('questionProgress');
const questionText = document.getElementById('questionText');
const questionImage = document.getElementById('questionImage');
const questionVideo = document.getElementById('questionVideo');
const audioContainer = document.getElementById('questionAudioWrap');
const questionAudio = document.getElementById('questionAudio');
const playPauseBtn = document.getElementById('audioPlayBtn');
const audioIconPlay = document.getElementById('audioIconPlay');
const audioIconPause = document.getElementById('audioIconPause');
const progressBar = document.getElementById('audioProgress');
const progressContainer = document.querySelector('.audio-player__track');
const visualizer = document.getElementById('audioVisualizer');

const optionCards = document.querySelectorAll('.option-card');
const explanationContainer = document.getElementById('explanationSection');
const explanationCard = document.getElementById('explanationText');

const contestantName = document.getElementById('contestantName');
const contestantScore = document.getElementById('contestantScore');
const gameModeBadge = document.getElementById('modeBadgeText');
const lifelineIcons = document.querySelectorAll('.lifeline-icon');

const audiencePollOverlay = document.getElementById('overlayAudiencePoll');
const confettiCanvas = document.getElementById('confettiCanvas');
const fullscreenBtn = document.getElementById('btnFullscreen');

const questionHeader = document.getElementById('questionArea');

// Local Variables
let currentScreen = 'welcome';
let currentQuestionId = null;
let lastStudioConfig = null;
let currentLanguage = 'ml'; // ml or en
let audioContext = null;
let audioInstance = null;

// ─── Socket.IO Connection ───
socket.on('connect', () => {
  console.log('Connected to server');
  connectionDot.className = 'connection-indicator';
  socket.emit('join', 'presentation');
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  connectionDot.className = 'connection-indicator disconnected';
});

// ─── State Sync Event ───
socket.on('state:sync', (state) => {
  if (!state) return;
  console.log('State Synced:', state);

  // 1. Handle Screen Switch
  if (state.active_screen !== currentScreen) {
    currentScreen = state.active_screen;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    if (currentScreen === 'welcome') {
      welcomeScreen.classList.add('active');
    } else {
      quizScreen.classList.add('active');
    }
  }

  // 2. Handle Game Mode
  if (state.game_mode) {
    if (gameModeBadge) gameModeBadge.textContent = state.game_mode === 'single' ? 'Single Player' : 'Team Mode';
  }

  // 3. Question & Content loading
  if (state.question) {
    if (state.question.id !== currentQuestionId) {
      currentQuestionId = state.question.id;
      loadQuestionContent(state.question);
    }

    // Toggle Visibility of Question
    if (state.show_question) {
      if (questionHeader) questionHeader.classList.remove('blurred');
    } else {
      if (questionHeader) questionHeader.classList.add('blurred');
    }

    // Toggle Visibility of Options
    if (state.show_options) {
      optionCards.forEach(card => card.classList.add('visible'));
    } else {
      optionCards.forEach(card => card.classList.remove('visible'));
    }

    // Toggle Answer Reveal
    if (state.reveal_answer) {
      revealCorrectAnswer(state.question.correct_answer);
    } else {
      resetAnswerReveal();
    }

    // Toggle Explanation
    if (state.show_explanation && state.reveal_answer && state.question.explanation) {
      explanationCard.textContent = state.question.explanation;
      explanationContainer.classList.add('visible');
    } else {
      explanationContainer.classList.remove('visible');
    }
  } else {
    currentQuestionId = null;
    clearQuestionContent();
  }

  // 4. Timer State
  if (state.show_timer) {
    timerContainer.classList.remove('hidden');
  } else {
    timerContainer.classList.add('hidden');
  }

  // 5. Active Contestant Sync
  if (state.active_contestant_id) {
    // Scoreboard trigger
    fetch(`/api/contestants`)
      .then(r => r.json())
      .then(contestants => {
        const active = contestants.find(c => c.id === state.active_contestant_id);
        if (active) {
          if (contestantName) contestantName.textContent = active.name;
          if (contestantScore) contestantScore.textContent = `Points: ${active.score}`;
          
          // Update lifelines
          let usedLifelines = [];
          try {
            usedLifelines = typeof active.lifelines_used === 'string' 
              ? JSON.parse(active.lifelines_used) 
              : (active.lifelines_used || []);
          } catch(e) {}
          
          lifelineIcons.forEach(icon => {
            const life = icon.dataset.lifeline;
            if (usedLifelines.includes(life)) {
              icon.classList.add('used');
            } else {
              icon.classList.remove('used');
            }
          });
        }
      });
  }

  // 6. Remote Audio Sync
  if (state.question && state.question.audio_url) {
    syncAudioStatus(state.audio_status);
  }
});

// ─── Studio Sync Event ───
socket.on('studio:sync', (studio) => {
  if (!studio) return;
  if (JSON.stringify(studio) === JSON.stringify(lastStudioConfig)) return;
  lastStudioConfig = studio;

  console.log('Studio Synced:', studio);

  currentLanguage = studio.ui_language || 'ml';

  // Apply visual style variables
  const root = document.documentElement;
  root.style.setProperty('--primary-glow', studio.theme_primary || '#00e5ff');
  root.style.setProperty('--secondary-glow', studio.theme_secondary || '#ffd700');
  root.style.setProperty('--bg-dark', studio.bg_dark || '#070B19');
  root.style.setProperty('--bg-card', studio.bg_card || 'rgba(16, 24, 45, 0.8)');
  root.style.setProperty('--text-primary', studio.theme_text_primary || '#ffffff');
  root.style.setProperty('--text-secondary', studio.theme_text_secondary || 'rgba(255, 255, 255, 0.7)');
  root.style.setProperty('--font-main', studio.font_family || "'Anek Malayalam', sans-serif");

  // Apply theme class to body
  document.body.className = '';
  if (studio.theme_preset) {
    document.body.classList.add('theme-' + studio.theme_preset);
  }

  welcomeTitle.textContent = studio.welcome_title || 'Welcome';
  welcomeSubtitle.textContent = studio.welcome_subtitle || '';

  // Language setup labels
  if (currentLanguage === 'ml') {
    startBtn.innerHTML = 'കളി തുടങ്ങുക <span>▶</span>';
  } else {
    startBtn.innerHTML = 'Start Game <span>▶</span>';
  }

  if (studio.animation_enabled === false) {
    document.body.classList.add('no-animations');
  } else {
    document.body.classList.remove('no-animations');
  }

  // Apply background video / image if provided
  if (studio.bg_video_url) {
    // Add BG Video element dynamically if not present
    let bgVideo = document.getElementById('bg-video');
    if (!bgVideo) {
      bgVideo = document.createElement('video');
      bgVideo.id = 'bg-video';
      bgVideo.autoplay = true;
      bgVideo.loop = true;
      bgVideo.muted = true;
      bgVideo.style.position = 'fixed';
      bgVideo.style.inset = '0';
      bgVideo.style.width = '100vw';
      bgVideo.style.height = '100vh';
      bgVideo.style.objectFit = 'cover';
      bgVideo.style.zIndex = '-2';
      bgVideo.style.opacity = '0.4';
      document.body.appendChild(bgVideo);
    }
    bgVideo.src = studio.bg_video_url;
  } else {
    const bgVideo = document.getElementById('bg-video');
    if (bgVideo) bgVideo.remove();
  }

  if (studio.bg_image_url) {
    document.body.style.backgroundImage = `url('${studio.bg_image_url}')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
  } else {
    document.body.style.backgroundImage = 'none';
  }
});

// ─── Timer Sync Events ───
socket.on('timer:tick', (data) => {
  updateTimerUI(data.remaining);
});

socket.on('timer:started', (data) => {
  updateTimerUI(data.remaining);
  playLocalSound('timer');
});

socket.on('timer:paused', (data) => {
  updateTimerUI(data.remaining);
  stopLocalSound('timer');
});

socket.on('timer:stopped', () => {
  updateTimerUI(30);
  stopLocalSound('timer');
});

socket.on('timer:expired', () => {
  timerRing.classList.add('danger');
  timerText.classList.add('danger');
  playLocalSound('expired');
  stopLocalSound('timer');
});

// ─── Lifeline Sync Events ───
socket.on('lifeline:fifty-fifty-result', (data) => {
  const { eliminated } = data;
  if (!eliminated) return;
  playLocalSound('lifeline');
  optionCards.forEach(card => {
    if (eliminated.includes(card.dataset.key)) {
      card.classList.add('eliminated');
    }
  });
});

socket.on('lifeline:audience-poll-result', (data) => {
  const { poll } = data;
  if (!poll) return;
  playLocalSound('lifeline');
  
  // Update overlay charts
  Object.keys(poll).forEach(opt => {
    const bar = document.getElementById(`pollBar${opt}`);
    const pct = document.getElementById(`pollPct${opt}`);
    if (bar) {
      bar.style.width = '0%';
      setTimeout(() => {
        bar.style.width = `${poll[opt]}%`;
      }, 100);
    }
    if (pct) {
      pct.textContent = `${poll[opt]}%`;
    }
  });
  
  audiencePollOverlay.classList.add('visible');
  
  // Auto dismiss after 8 seconds
  setTimeout(() => {
    audiencePollOverlay.classList.remove('visible');
  }, 8000);
});

// ─── Celebration Sync Events ───
socket.on('celebration:trigger', (data) => {
  startConfetti();
  playLocalSound('celebration');
});

// ─── Contestant Sync Event ───
socket.on('contestant:update', (contestant) => {
  // Sync contestant display if it matches active contestant
  fetch('/api/presentation/state')
    .then(r => r.json())
    .then(state => {
      if (state.active_contestant_id === contestant.id) {
        if (contestantName) contestantName.textContent = contestant.name;
        if (contestantScore) contestantScore.textContent = `Points: ${contestant.score}`;
      }
    });
});

// ─── Play Custom Sound Event ───
socket.on('sound:play', (data) => {
  playLocalSound(data.category, data.url);
});

socket.on('sound:stop', () => {
  stopAllLocalSounds();
});

// ─── UI Helper Functions ───

function loadQuestionContent(q) {
  // Staged Question Reveal Transitions
  if (questionHeader) questionHeader.style.opacity = '0';
  
  setTimeout(() => {
    questionText.textContent = q.question_text || '';
    
    // Media assets
    if (q.image_url) {
      questionImage.src = q.image_url;
      questionImage.style.display = 'block';
    } else {
      questionImage.style.display = 'none';
      questionImage.src = '';
    }

    if (q.video_url) {
      questionVideo.src = q.video_url;
      questionVideo.style.display = 'block';
      questionVideo.load();
    } else {
      questionVideo.style.display = 'none';
      questionVideo.src = '';
    }

    if (q.audio_url) {
      questionAudio.src = q.audio_url;
      audioContainer.style.display = 'flex';
      questionAudio.load();
    } else {
      audioContainer.style.display = 'none';
      questionAudio.src = '';
    }

    // Reset option cards
    optionCards.forEach(card => {
      const opt = card.dataset.key;
      const optText = document.getElementById(`option${opt}Text`);
      if (optText) {
        optText.textContent = q[`option_${opt.toLowerCase()}`] || '';
      }
      card.className = 'option-card'; // clear classes
      card.style.display = q[`option_${opt.toLowerCase()}`] ? 'flex' : 'none';
    });

    if (questionHeader) questionHeader.style.opacity = '1';
  }, 300);

  // Set visual progress info
  fetch('/api/questions?level=' + q.level)
    .then(r => r.json())
    .then(qs => {
      const idx = qs.findIndex(item => item.id === q.id);
      if (idx !== -1) {
        questionProgress.textContent = `${currentLanguage === 'ml' ? 'ചോദ്യം' : 'Question'} ${idx + 1}/${qs.length}`;
      } else {
        questionProgress.textContent = '';
      }
    })
    .catch(() => { questionProgress.textContent = ''; });
}

function clearQuestionContent() {
  questionText.textContent = '';
  questionImage.style.display = 'none';
  questionVideo.style.display = 'none';
  audioContainer.style.display = 'none';
  questionAudio.src = '';
  optionCards.forEach(card => card.classList.remove('visible'));
  explanationContainer.classList.remove('visible');
}

function updateTimerUI(sec) {
  timerText.textContent = sec;
  
  const pct = Math.max(0, Math.min(sec, 30)) / 30;
  if (timerRing) {
    timerRing.style.width = (pct * 100) + '%';
  }

  // Visual Warning colors
  if (timerRing) {
    timerRing.classList.remove('warning', 'danger');
  }
  timerText.classList.remove('danger');
  
  if (sec <= 5) {
    if (timerRing) timerRing.classList.add('danger');
    timerText.classList.add('danger');
  } else if (sec <= 10) {
    if (timerRing) timerRing.classList.add('warning');
  }
}

function revealCorrectAnswer(correctOpt) {
  optionCards.forEach(card => {
    card.classList.remove('correct', 'wrong');
    if (card.dataset.key === correctOpt) {
      card.classList.add('correct');
    } else {
      card.classList.add('wrong');
    }
  });
  playLocalSound('reveal');
}

function resetAnswerReveal() {
  optionCards.forEach(card => {
    card.classList.remove('correct', 'wrong', 'eliminated', 'clicked-correct', 'clicked-wrong');
  });
}

function syncAudioStatus(status) {
  if (!questionAudio.src || questionAudio.src === window.location.href) return;
  
  if (status === 'playing') {
    questionAudio.play().catch(e => console.log('Autoplay blocked:', e));
    if (audioIconPlay) audioIconPlay.style.display = 'none';
    if (audioIconPause) audioIconPause.style.display = 'block';
    visualizer.classList.remove('paused');
  } else {
    questionAudio.pause();
    if (audioIconPlay) audioIconPlay.style.display = 'block';
    if (audioIconPause) audioIconPause.style.display = 'none';
    visualizer.classList.add('paused');
  }
}

// ─── Sound System ───
const localAudioElements = {};

function playLocalSound(category, customUrl = '') {
  // Check if sound effects enabled in theme
  if (lastStudioConfig && lastStudioConfig.animation_enabled === false) return;

  // Check if we already have an element for this category
  let audioEl = localAudioElements[category];
  if (!audioEl) {
    audioEl = new Audio();
    localAudioElements[category] = audioEl;
  }

  // Set source URL
  let soundUrl = customUrl;
  if (!soundUrl && lastStudioConfig) {
    if (category === 'correct') soundUrl = lastStudioConfig.correct_sound_url;
    else if (category === 'wrong') soundUrl = lastStudioConfig.wrong_sound_url;
    else if (category === 'timer') soundUrl = lastStudioConfig.timer_sound_url;
    else if (category === 'background') soundUrl = lastStudioConfig.bg_music_url;
  }

  if (!soundUrl) {
    // Fallback urls or templates
    const fallbacks = {
      correct: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-84.wav',
      wrong: 'https://assets.mixkit.co/active_storage/sfx/2017/2017-84.wav',
      timer: 'https://assets.mixkit.co/active_storage/sfx/2006/2006-84.wav',
      expired: 'https://assets.mixkit.co/active_storage/sfx/2008/2008-84.wav',
      reveal: 'https://assets.mixkit.co/active_storage/sfx/2010/2010-84.wav',
      lifeline: 'https://assets.mixkit.co/active_storage/sfx/2002/2002-84.wav',
      celebration: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-84.wav'
    };
    soundUrl = fallbacks[category];
  }

  if (soundUrl) {
    audioEl.src = soundUrl;
    if (category === 'background' || category === 'timer') {
      audioEl.loop = true;
    }
    audioEl.play().catch(e => console.log('Audio playback blocked:', e));
  }
}

function stopLocalSound(category) {
  const audioEl = localAudioElements[category];
  if (audioEl) {
    audioEl.pause();
    audioEl.currentTime = 0;
  }
}

function stopAllLocalSounds() {
  Object.keys(localAudioElements).forEach(category => {
    stopLocalSound(category);
  });
}

// ─── Local Audio Player Event Handlers ───
playPauseBtn.addEventListener('click', () => {
  if (!questionAudio.src) return;
  const isPlaying = !questionAudio.paused;
  socket.emit('state:update', { audio_status: isPlaying ? 'paused' : 'playing' });
});

questionAudio.addEventListener('timeupdate', () => {
  const pct = (questionAudio.currentTime / questionAudio.duration) * 100;
  progressBar.style.width = `${pct}%`;
});

questionAudio.addEventListener('ended', () => {
  socket.emit('state:update', { audio_status: 'stopped' });
});

progressContainer.addEventListener('click', (e) => {
  const width = progressContainer.clientWidth;
  const clickX = e.offsetX;
  const duration = questionAudio.duration;
  if (duration) {
    questionAudio.currentTime = (clickX / width) * duration;
  }
});

// ─── Confetti System ───
let confettiInterval = null;
function startConfetti() {
  const canvas = confettiCanvas;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#f50057', '#00e5ff', '#ffeb3b', '#00e676', '#ff9100', '#2979ff'];
  const particles = [];

  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 6 + 4,
      d: Math.random() * canvas.height,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngleIncremental: Math.random() * 0.07 + 0.02,
      tiltAngle: 0
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p, idx) => {
      ctx.beginPath();
      ctx.lineWidth = p.r / 2;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
      ctx.stroke();
    });

    update();
  }

  function update() {
    let activeParticles = 0;
    particles.forEach((p) => {
      p.tiltAngle += p.tiltAngleIncremental;
      p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
      p.tilt = Math.sin(p.tiltAngle - p.r / 2) * 5;
      
      if (p.y < canvas.height) activeParticles++;
    });

    if (activeParticles > 0) {
      requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  draw();
}

// ─── Fullscreen & Start Controls ───
fullscreenBtn.addEventListener('click', () => {
  const expandSvg = fullscreenBtn.querySelector('.fs-expand');
  const collapseSvg = fullscreenBtn.querySelector('.fs-collapse');
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.error(`Error attempting to enable fullscreen: ${err.message}`);
    });
    if (expandSvg) expandSvg.style.display = 'none';
    if (collapseSvg) collapseSvg.style.display = 'block';
  } else {
    document.exitFullscreen();
    if (expandSvg) expandSvg.style.display = 'block';
    if (collapseSvg) collapseSvg.style.display = 'none';
  }
});

startBtn.addEventListener('click', () => {
  // Start game triggers screen switch to quiz
  socket.emit('state:update', { active_screen: 'quiz' });
});

// Option Clicking for Local Display Testing
optionCards.forEach(card => {
  card.addEventListener('click', () => {
    // Only local effects if someone clicks on presentation screen
    fetch('/api/presentation/state')
      .then(r => r.json())
      .then(state => {
        if (state.reveal_answer) return;
        const correct = state.question.correct_answer;
        if (card.dataset.key === correct) {
          card.classList.add('clicked-correct');
          playLocalSound('correct');
        } else {
          card.classList.add('clicked-wrong');
          playLocalSound('wrong');
        }
      });
  });
});
