/* ═══════════════════════════════════════
   Udan Panam v2.0 — Presentation Screen Client
   Real-Time Event Driven (Socket.IO)
   ═══════════════════════════════════════ */

const socket = io();

// DOM Elements
const connectionDot = document.getElementById('connectionIndicator');
const welcomeScreen = document.getElementById('screenWelcome');
const promoScreen = document.getElementById('screenPromo');
const quizScreen = document.getElementById('screenQuiz');
const startBtn = document.getElementById('btnStart');
const welcomeTitle = document.getElementById('welcomeTitle');
const welcomeSubtitle = document.getElementById('welcomeSubtitle');

// Second Screen Features
const stageTicker = document.getElementById('stageTicker');
const stageTickerText = document.getElementById('stageTickerText');
const stageTickerCloseBtn = document.getElementById('stageTickerCloseBtn');
const stageBlackout = document.getElementById('stageBlackout');


// Promo Page Interactive Elements
const promoTiltBox = document.getElementById('promoTiltBox');
const promoHeroArea = document.getElementById('promoHeroArea');
const promoPlayReelBtn = document.getElementById('promoPlayReelBtn');
const promoPlayReelLabel = document.getElementById('promoPlayReelLabel');
const promoSoundBtn = document.getElementById('promoSoundBtn');
const promoConfettiBtn = document.getElementById('promoConfettiBtn');
const promoStartQuizBtn = document.getElementById('promoStartQuizBtn');
const promoReelTracker = document.getElementById('promoReelTracker');
const promoCards = document.querySelectorAll('.promo-card');

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

// Dynamic SVG border sizing
const questionArea = document.getElementById('questionArea');
const borderSvg = document.getElementById('questionBorderSvg');
const borderRect = document.getElementById('questionBorderRect');

if (questionArea && borderSvg && borderRect) {
  const resizeObserver = new ResizeObserver(entries => {
    for (let entry of entries) {
      // Get the full outer dimensions (including padding) of the question area card
      const rect = entry.target.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      
      borderSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      const strokeWidth = 5;
      const offset = strokeWidth / 2;
      
      // Update animating rect
      borderRect.setAttribute('x', offset);
      borderRect.setAttribute('y', offset);
      borderRect.setAttribute('width', Math.max(0, width - strokeWidth));
      borderRect.setAttribute('height', Math.max(0, height - strokeWidth));

      // Update background rect
      const bgRect = document.getElementById('questionBorderBg');
      if (bgRect) {
        bgRect.setAttribute('x', offset);
        bgRect.setAttribute('y', offset);
        bgRect.setAttribute('width', Math.max(0, width - strokeWidth));
        bgRect.setAttribute('height', Math.max(0, height - strokeWidth));
      }
      
      // Update timer UI layout with new dimensions
      const currentSec = parseInt(timerText.textContent) || 0;
      updateTimerUI(currentSec);
    }
  });
  resizeObserver.observe(questionArea);
}

// Local Variables
let currentScreen = 'welcome';
let currentQuestionId = null;
let isOptionsVisible = false;
let isAnswerRevealed = false;
let lastStudioConfig = null;
let currentLanguage = 'ml'; // ml or en
let audioContext = null;
let audioInstance = null;

// ─── Socket.IO Connection ───
socket.on('connect', () => {
  console.log('Connected to server');
  connectionDot.className = 'connection-indicator';
  socket.emit('join', 'presentation', {
    name: 'Main Stage Screen',
    resolution: `${window.innerWidth}x${window.innerHeight}`,
    userAgent: navigator.userAgent
  });
});

let isSocketConnected = false;
let pollingInterval = null;

socket.on('connect', () => {
  console.log('Connected to server');
  isSocketConnected = true;
  connectionDot.className = 'connection-indicator connected';
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  isSocketConnected = false;
  connectionDot.className = 'connection-indicator disconnected';
  startPollingFallback();
});

function startPollingFallback() {
  if (pollingInterval) return;
  console.log('Starting polling fallback for state sync...');
  pollingInterval = setInterval(async () => {
    if (isSocketConnected) return;
    try {
      const res = await fetch('/api/presentation/state');
      if (res.ok) {
        const state = await res.json();
        syncState(state);
      }
    } catch (e) {
      console.error('Error polling state:', e);
    }
  }, 2000);
}

// Start polling fallback initially as a safety check
startPollingFallback();

// ─── State Sync Event ───
function syncState(state) {
  if (!state) return;
  console.log('State Synced:', state);

  // 1. Handle Screen Switch
  if (state.active_screen && state.active_screen !== currentScreen) {
    currentScreen = state.active_screen;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    if (currentScreen === 'welcome') {
      if (welcomeScreen) welcomeScreen.classList.add('active');
    } else if (currentScreen === 'promo') {
      if (promoScreen) promoScreen.classList.add('active');
      triggerPromoScene('all');
    } else {
      if (quizScreen) quizScreen.classList.add('active');
    }
  }

  // 2. Handle Game Mode
  if (state.game_mode) {
    if (gameModeBadge) gameModeBadge.textContent = state.game_mode === 'single' ? 'Single Player' : 'Team Mode';
  }

  // 2b. Stage Blackout & Presenter Dock
  if (state.stage_blackout !== undefined) {
    toggleStageBlackout(state.stage_blackout);
  }
  if (state.stage_dock_visible !== undefined && promoControlsFooter) {
    if (state.stage_dock_visible) {
      promoControlsFooter.classList.remove('dock-hidden');
    } else {
      promoControlsFooter.classList.add('dock-hidden');
    }
  }

  // 3. Question & Content loading
  if (state.question) {
    const isNewQuestion = state.question.id !== currentQuestionId;
    if (isNewQuestion) {
      const prevQId = currentQuestionId;
      currentQuestionId = state.question.id;
      loadQuestionContent(state.question);
      if (prevQId !== null && state.show_question) {
        playLocalSound('question_appear');
      }
    } else {
      updateQuestionContentInPlace(state.question);
    }

    // Toggle Visibility of Question
    if (state.show_question) {
      if (questionHeader) questionHeader.classList.remove('blurred');
    } else {
      if (questionHeader) questionHeader.classList.add('blurred');
    }

    // Toggle Visibility of Options with Audio Trigger
    const prevShowOptions = isOptionsVisible;
    if (state.show_options) {
      optionCards.forEach(card => card.classList.add('visible'));
      isOptionsVisible = true;
      if (!prevShowOptions) {
        playLocalSound('options_reveal');
      }
    } else {
      optionCards.forEach(card => card.classList.remove('visible'));
      isOptionsVisible = false;
    }

    // Toggle Answer Reveal with Audio Trigger
    const prevReveal = isAnswerRevealed;
    if (state.reveal_answer) {
      isAnswerRevealed = true;
      revealCorrectAnswer(state.question.correct_answer);
    } else {
      isAnswerRevealed = false;
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
    isOptionsVisible = false;
    isAnswerRevealed = false;
    clearQuestionContent();
  }

  // 4. Timer State
  if (state.show_timer) {
    timerContainer.classList.remove('hidden');
  } else {
    timerContainer.classList.add('hidden');
  }

  if (state.timer_remaining !== undefined) {
    timerMaxDuration = state.question?.timer_override || 30;
    updateTimerUI(state.timer_remaining);
  }

  // 5. Active Contestant Sync
  if (state.active_contestant_id) {
    // Scoreboard trigger
    fetch(`/api/contestants`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch contestants');
        return r.json();
      })
      .then(contestants => {
        if (!Array.isArray(contestants)) {
          console.warn('Contestants response is not an array:', contestants);
          return;
        }
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
      })
      .catch(err => console.error('Error syncing active contestant:', err));
  }

  // 6. Remote Audio Sync
  if (state.question && state.question.audio_url) {
    syncAudioStatus(state.audio_status);
  }
}

socket.on('state:sync', (state) => {
  syncState(state);
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
  root.style.setProperty('--primary-glow', studio.theme_primary || '#10b981');
  root.style.setProperty('--secondary-glow', studio.theme_secondary || '#fbbf24');
  root.style.setProperty('--bg-dark', studio.bg_dark || '#022c22');
  root.style.setProperty('--bg-card', studio.bg_card || 'rgba(6, 78, 59, 0.85)');
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

// Local variable to track active timer duration
let timerMaxDuration = 30;

// ─── Timer Sync Events ───
socket.on('timer:tick', (data) => {
  updateTimerUI(data.remaining);
  playLocalSound('timer_tick', '', { remaining: data.remaining, maxDuration: timerMaxDuration });
});

socket.on('timer:started', (data) => {
  timerMaxDuration = data.remaining || 30;
  updateTimerUI(data.remaining);
  playLocalSound('timer', '', { remaining: data.remaining, maxDuration: timerMaxDuration });
});

socket.on('timer:paused', (data) => {
  updateTimerUI(data.remaining);
  stopLocalSound('timer');
});

socket.on('timer:stopped', () => {
  timerMaxDuration = 30;
  updateTimerUI(30);
  stopLocalSound('timer');
});

socket.on('timer:expired', () => {
  const borderSvg = document.getElementById('questionBorderSvg');
  if (borderSvg) borderSvg.classList.add('danger');
  if (timerRing) timerRing.classList.add('danger');
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
let celebrationTimeout = null;
let isCelebrating = false;

socket.on('celebration:start', (data) => {
  const duration = data?.duration || 0;
  isCelebrating = true;
  startConfetti();
  playLocalSound('celebration');

  if (celebrationTimeout) {
    clearTimeout(celebrationTimeout);
    celebrationTimeout = null;
  }

  if (duration > 0) {
    celebrationTimeout = setTimeout(() => {
      stopCelebrationLocal();
    }, duration * 1000);
  }
});

socket.on('celebration:tick', (data) => {
  // Option to handle ticks locally if needed
});

socket.on('celebration:stop', () => {
  stopCelebrationLocal();
});

socket.on('celebration:trigger', (data) => {
  isCelebrating = true;
  startConfetti();
  playLocalSound('celebration');
  if (celebrationTimeout) clearTimeout(celebrationTimeout);
  celebrationTimeout = setTimeout(() => {
    stopCelebrationLocal();
  }, 10000);
});

function stopCelebrationLocal() {
  isCelebrating = false;
  stopLocalSound('celebration');
  if (celebrationTimeout) {
    clearTimeout(celebrationTimeout);
    celebrationTimeout = null;
  }
}

// ─── Contestant Sync Event ───
socket.on('contestant:update', (contestant) => {
  // Sync contestant display if it matches active contestant
  fetch('/api/presentation/state')
    .then(r => {
      if (!r.ok) throw new Error('Failed to fetch state');
      return r.json();
    })
    .then(state => {
      if (state && state.active_contestant_id === contestant.id) {
        if (contestantName) contestantName.textContent = contestant.name;
        if (contestantScore) contestantScore.textContent = `Points: ${contestant.score}`;
      }
    })
    .catch(err => console.error('Error fetching state in contestant update:', err));
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
    .then(r => {
      if (!r.ok) throw new Error('Failed to fetch questions');
      return r.json();
    })
    .then(qs => {
      if (!Array.isArray(qs)) {
        console.warn('Questions list is not an array:', qs);
        return;
      }
      const idx = qs.findIndex(item => item.id === q.id);
      if (idx !== -1) {
        questionProgress.textContent = `${currentLanguage === 'ml' ? 'ചോദ്യം' : 'Question'} ${idx + 1}/${qs.length}`;
      } else {
        questionProgress.textContent = '';
      }
    })
    .catch(err => {
      console.error('Error fetching level questions:', err);
      questionProgress.textContent = '';
    });
}

function updateQuestionContentInPlace(q) {
  if (!q) return;
  if (questionText && questionText.textContent !== (q.question_text || '')) {
    questionText.textContent = q.question_text || '';
  }

  optionCards.forEach(card => {
    const opt = card.dataset.key;
    const optText = document.getElementById(`option${opt}Text`);
    const val = q[`option_${opt.toLowerCase()}`] || '';
    if (optText && optText.textContent !== val) {
      optText.textContent = val;
    }
    card.style.display = val ? 'flex' : 'none';
  });

  if (q.explanation && explanationCard) {
    explanationCard.textContent = q.explanation;
  }
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
  if (sec > timerMaxDuration) {
    timerMaxDuration = sec;
  }
  timerText.textContent = sec;
  
  const pct = Math.max(0, Math.min(sec, timerMaxDuration)) / timerMaxDuration;
  if (timerRing) {
    timerRing.style.width = (pct * 100) + '%';
  }

  // Update question border timer SVG stroke-dashoffset
  const borderRect = document.getElementById('questionBorderRect');
  if (borderRect) {
    const width = parseFloat(borderRect.getAttribute('width')) || 0;
    const height = parseFloat(borderRect.getAttribute('height')) || 0;
    const r = 20; // corner radius
    // Perimeter: 2 * (w + h) - 8 * r + 2 * Math.PI * r
    const perimeter = 2 * (width + height) - 8 * r + 2 * Math.PI * r;
    borderRect.style.strokeDasharray = perimeter;
    borderRect.style.strokeDashoffset = perimeter * (1 - pct);
  }

  // Visual Warning colors
  const borderSvg = document.getElementById('questionBorderSvg');
  if (borderSvg) {
    borderSvg.classList.remove('warning', 'danger');
  }
  if (timerRing) {
    timerRing.classList.remove('warning', 'danger');
  }
  timerText.classList.remove('danger');
  
  if (sec <= 5) {
    if (timerRing) timerRing.classList.add('danger');
    if (borderSvg) borderSvg.classList.add('danger');
    timerText.classList.add('danger');
  } else if (sec <= 10) {
    if (timerRing) timerRing.classList.add('warning');
    if (borderSvg) borderSvg.classList.add('warning');
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

// ─── Udan Panam Web Audio Synthesizer Engine ───
class UdanPanamSoundSynthesizer {
  constructor() {
    this.ctx = null;
    this.ambientGain = null;
    this.ambientOsc1 = null;
    this.ambientOsc2 = null;
    this.ambientFilter = null;
    this.isSuspensePlaying = false;
  }

  getAudioContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // 1. Next Question Drop / Transition
  playQuestionTransition() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Sub-bass pitch dive
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(180, now);
    subOsc.frequency.exponentialRampToValueAtTime(42, now + 0.65);
    subGain.gain.setValueAtTime(0.7, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.7);

    // Cyber whoosh
    const bufferSize = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 3;
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + 0.45);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.5);

    // Stinger high chime
    [880, 1320].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + 0.08 * idx);
      g.gain.setValueAtTime(0.25, now + 0.08 * idx);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.08 * idx + 0.4);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + 0.08 * idx);
      osc.stop(now + 0.08 * idx + 0.4);
    });
  }

  // 2. Revealing Options (Option A, B, C, D or all)
  playOptionsReveal(optionKey = null) {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notesMap = {
      'A': 523.25, // C5
      'B': 659.25, // E5
      'C': 783.99, // G5
      'D': 1046.50 // C6
    };

    if (optionKey && notesMap[optionKey.toUpperCase()]) {
      this._playOptionNote(ctx, notesMap[optionKey.toUpperCase()], now);
    } else {
      // Cascade all 4 notes in rapid arpeggio
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        this._playOptionNote(ctx, freq, now + idx * 0.09);
      });
    }
  }

  _playOptionNote(ctx, freq, startTime) {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(freq, startTime);
    osc2.frequency.setValueAtTime(freq * 2, startTime); // Octave overtone

    gain.gain.setValueAtTime(0.3, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.28);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + 0.3);
    osc2.stop(startTime + 0.3);
  }

  // 3. Timer Ticking & Suspense Pulse
  playTimerTick(remaining = 30) {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Crisp woodblock click
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    const clickFreq = remaining <= 5 ? 1760 : (remaining <= 10 ? 1320 : 960);
    osc.frequency.setValueAtTime(clickFreq, now);
    osc.frequency.exponentialRampToValueAtTime(clickFreq * 0.5, now + 0.04);
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);

    // Heartbeat sub pulse under 10 seconds
    if (remaining <= 10 && remaining > 0) {
      const sub = ctx.createOscillator();
      const subG = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(58, now);
      sub.frequency.exponentialRampToValueAtTime(38, now + 0.15);
      subG.gain.setValueAtTime(0.4, now);
      subG.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      sub.connect(subG);
      subG.connect(ctx.destination);
      sub.start(now);
      sub.stop(now + 0.2);
    }
  }

  // 4. Lock Answer ("Lock Cheyyatte?")
  playAnswerLock() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Heavy mechanical latch click
    const bufferSize = Math.floor(ctx.sampleRate * 0.12);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(2600, now);
    bandpass.Q.value = 4;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    noise.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.12);

    // Deep heavy punch thud
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(95, now + 0.02);
    sub.frequency.exponentialRampToValueAtTime(32, now + 0.35);
    subGain.gain.setValueAtTime(0.65, now + 0.02);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now + 0.02);
    sub.stop(now + 0.45);
  }

  // 5. Correct Answer & Fanfare
  playCorrectFanfare() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Triumphant Brass Fanfare: C4, G4, C5, E5, G5, C6
    const notes = [261.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    const times = [0, 0.1, 0.2, 0.3, 0.42, 0.58];
    const lengths = [0.15, 0.15, 0.15, 0.18, 0.22, 0.9];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2800, now + times[idx]);

      osc.frequency.setValueAtTime(freq, now + times[idx]);
      gain.gain.setValueAtTime(0.3, now + times[idx]);
      gain.gain.exponentialRampToValueAtTime(0.001, now + times[idx] + lengths[idx]);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + times[idx]);
      osc.stop(now + times[idx] + lengths[idx] + 0.05);
    });

    // High sparkle / confetti shimmer
    for (let i = 0; i < 6; i++) {
      const shimmer = ctx.createOscillator();
      const sGain = ctx.createGain();
      shimmer.type = 'sine';
      shimmer.frequency.setValueAtTime(1600 + i * 280, now + 0.6 + i * 0.06);
      sGain.gain.setValueAtTime(0.12, now + 0.6 + i * 0.06);
      sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6 + i * 0.06 + 0.25);
      shimmer.connect(sGain);
      sGain.connect(ctx.destination);
      shimmer.start(now + 0.6 + i * 0.06);
      shimmer.stop(now + 0.6 + i * 0.06 + 0.3);
    }
  }

  // 6. Wrong Answer Drop / Loss
  playWrongDrop() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.6);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + 0.6);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.75);
  }

  // 7. ATM Cash Dispenser & Payout
  playAtmCashDispenser() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Currency counting rollers (rapid flutter pulses)
    for (let i = 0; i < 9; i++) {
      const t = now + i * 0.045;
      const bufferSize = Math.floor(ctx.sampleRate * 0.025);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let j = 0; j < bufferSize; j++) data[j] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1600, t);
      bp.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.28, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      noise.connect(bp);
      bp.connect(g);
      g.connect(ctx.destination);
      noise.start(t);
      noise.stop(t + 0.035);
    }

    // Cash Register "Ka-Ching!" Chimes
    const bellTime = now + 0.42;
    [2093.00, 4186.01].forEach(freq => {
      const bell = ctx.createOscillator();
      const bGain = ctx.createGain();
      bell.type = 'sine';
      bell.frequency.setValueAtTime(freq, bellTime);
      bGain.gain.setValueAtTime(0.35, bellTime);
      bGain.gain.exponentialRampToValueAtTime(0.001, bellTime + 0.8);
      bell.connect(bGain);
      bGain.connect(ctx.destination);
      bell.start(bellTime);
      bell.stop(bellTime + 0.85);
    });
  }

  // 8. Lifeline Activation Sound
  playLifelineChime() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = [440, 659.25, 880, 1318.51];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      g.gain.setValueAtTime(0.3, now + idx * 0.07);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.35);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.4);
    });
  }

  // 9. Expired Buzzer
  playExpiredBuzzer() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(145, now);
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  // 10. Ambient Suspense Drone Loop
  toggleSuspenseDrone(forceState) {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    if (this.isSuspensePlaying || forceState === false) {
      if (this.ambientOsc1) {
        try {
          this.ambientOsc1.stop();
          this.ambientOsc2.stop();
        } catch(e) {}
        this.ambientOsc1 = null;
        this.ambientOsc2 = null;
      }
      this.isSuspensePlaying = false;
      return;
    }

    const now = ctx.currentTime;
    this.ambientOsc1 = ctx.createOscillator();
    this.ambientOsc2 = ctx.createOscillator();
    this.ambientFilter = ctx.createBiquadFilter();
    this.ambientGain = ctx.createGain();

    this.ambientOsc1.type = 'sawtooth';
    this.ambientOsc2.type = 'sawtooth';
    this.ambientOsc1.frequency.setValueAtTime(55, now); // A1
    this.ambientOsc2.frequency.setValueAtTime(55.6, now); // slight detune beat

    this.ambientFilter.type = 'lowpass';
    this.ambientFilter.frequency.setValueAtTime(220, now);

    this.ambientGain.gain.setValueAtTime(0.001, now);
    this.ambientGain.gain.linearRampToValueAtTime(0.18, now + 1.5);

    this.ambientOsc1.connect(this.ambientFilter);
    this.ambientOsc2.connect(this.ambientFilter);
    this.ambientFilter.connect(this.ambientGain);
    this.ambientGain.connect(ctx.destination);

    this.ambientOsc1.start(now);
    this.ambientOsc2.start(now);
    this.isSuspensePlaying = true;
  }
}

const udanAudioSynth = new UdanPanamSoundSynthesizer();

// ─── Sound System (Hybrid Synthesizer + Custom URL) ───
const localAudioElements = {};

function playLocalSound(category, customUrl = '', meta = {}) {
  // Check if sound effects enabled in theme
  if (lastStudioConfig && lastStudioConfig.animation_enabled === false) return;

  // Set source URL if configured in studio settings
  let soundUrl = customUrl;
  if (!soundUrl && lastStudioConfig) {
    if (category === 'correct') soundUrl = lastStudioConfig.correct_sound_url;
    else if (category === 'wrong') soundUrl = lastStudioConfig.wrong_sound_url;
    else if (category === 'timer') soundUrl = lastStudioConfig.timer_sound_url;
    else if (category === 'background') soundUrl = lastStudioConfig.bg_music_url;
  }

  // If a custom URL is available, play via HTML5 Audio element
  if (soundUrl) {
    let audioEl = localAudioElements[category];
    if (!audioEl) {
      audioEl = new Audio();
      localAudioElements[category] = audioEl;
    }
    audioEl.src = soundUrl;
    audioEl.loop = (category === 'background' || (category === 'celebration' && isCelebrating));
    audioEl.play().catch(() => {
      // Fallback to synth if external file fails
      synthesizeLocalSound(category, meta);
    });
    return;
  }

  // Otherwise, synthesize pure Udan Panam Web Audio
  synthesizeLocalSound(category, meta);
}

function synthesizeLocalSound(category, meta = {}) {
  switch (category) {
    case 'transition':
    case 'question_appear':
    case 'next_question':
      udanAudioSynth.playQuestionTransition();
      break;

    case 'options_reveal':
    case 'option_reveal':
      udanAudioSynth.playOptionsReveal(meta.optionKey || null);
      break;

    case 'timer':
    case 'timer_tick':
      udanAudioSynth.playTimerTick(meta.remaining !== undefined ? meta.remaining : 30);
      break;

    case 'lock':
    case 'answer_lock':
      udanAudioSynth.playAnswerLock();
      break;

    case 'correct':
    case 'celebration':
    case 'applause':
    case 'win':
      udanAudioSynth.playCorrectFanfare();
      break;

    case 'wrong':
    case 'elimination':
      udanAudioSynth.playWrongDrop();
      break;

    case 'atm_cash':
    case 'cash_dispense':
    case 'udan_panam_atm':
    case 'money_payout':
      udanAudioSynth.playAtmCashDispenser();
      break;

    case 'lifeline':
      udanAudioSynth.playLifelineChime();
      break;

    case 'expired':
      udanAudioSynth.playExpiredBuzzer();
      break;

    case 'reveal':
    case 'suspense':
      udanAudioSynth.toggleSuspenseDrone(true);
      break;

    default:
      // Try fallback sample if available
      break;
  }
}

function stopLocalSound(category) {
  if (category === 'suspense' || category === 'reveal') {
    udanAudioSynth.toggleSuspenseDrone(false);
  }
  const audioEl = localAudioElements[category];
  if (audioEl) {
    audioEl.pause();
    audioEl.currentTime = 0;
  }
}

function stopAllLocalSounds() {
  udanAudioSynth.toggleSuspenseDrone(false);
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
      
      if (p.y < canvas.height) {
        activeParticles++;
      } else if (isCelebrating) {
        p.y = Math.random() * -20 - 10;
        p.x = Math.random() * canvas.width;
        activeParticles++;
      }
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
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch state');
        return r.json();
      })
      .then(state => {
        if (!state || !state.question) return;
        if (state.reveal_answer) return;
        const correct = state.question.correct_answer;
        if (card.dataset.key === correct) {
          card.classList.add('clicked-correct');
          playLocalSound('correct');
        } else {
          card.classList.add('clicked-wrong');
          playLocalSound('wrong');
        }
      })
      .catch(err => console.error('Error fetching state on card click:', err));
  });
});

/* ═══════════════════════════════════════════════════════
   NEXT-LEVEL PROMO ANIMATION ENGINE (UDAN PANAM 3.0)
   Cinematic Broadcast Choreography, 3D Tilt & Auto-Reel
   ═══════════════════════════════════════════════════════ */

let currentPromoScene = 'all';
let isPromoReelRunning = false;
let promoReelTimer = null;
let promoProgressTimer = null;
let promoReelSpeed = 5500;
const promoScenesList = ['1', '2', '3', '4', 'all'];
let currentSceneIndex = 4; // starts at 'all'

const promoTimelineFill = document.getElementById('promoTimelineFill');
const promoControlsFooter = document.getElementById('promoControlsFooter');
const promoDockHideBtn = document.getElementById('promoDockHideBtn');

// ── 1. Dynamic Content Synchronizer (Real-Time from DB / Admin) ──
function updatePromoContentFromSettings(promo) {
  if (!promo) return;
  const eyebrow = document.getElementById('promoEyebrowBadge');
  if (eyebrow && promo.eyebrow_badge) eyebrow.textContent = promo.eyebrow_badge;

  const prod = document.getElementById('promoProducerTag');
  if (prod && promo.producer_tag) {
    prod.textContent = promo.producer_tag.replace(/^FROM THE PRODUCER\s*/i, '');
  }

  const tagline = document.getElementById('promoTagline');
  if (tagline && promo.tagline) tagline.textContent = promo.tagline;

  const hashtag = document.getElementById('promoHashtag');
  if (hashtag && promo.hashtag) hashtag.textContent = promo.hashtag;

  // Card 1: Classes & Eligibility
  const c1Tag = document.getElementById('promoCard1Tag');
  if (c1Tag && promo.card1_tag) c1Tag.textContent = promo.card1_tag;
  const c1Title = document.getElementById('promoCard1Title');
  if (c1Title && promo.card1_title) c1Title.textContent = promo.card1_title;
  const c1Desc = document.getElementById('promoCard1Desc');
  if (c1Desc && promo.card1_desc) c1Desc.textContent = promo.card1_desc;

  // Card 2: Contestant Rule
  const c2Tag = document.getElementById('promoCard2Tag');
  if (c2Tag && promo.card2_tag) c2Tag.textContent = promo.card2_tag;
  const c2Title = document.getElementById('promoCard2Title');
  if (c2Title && promo.card2_title) c2Title.textContent = promo.card2_title;
  const c2Desc = document.getElementById('promoCard2Desc');
  if (c2Desc && promo.card2_desc) c2Desc.textContent = promo.card2_desc;

  // Card 3: Stage Conductors
  const c3Tag = document.getElementById('promoCard3Tag');
  if (c3Tag && promo.card3_tag) c3Tag.textContent = promo.card3_tag;
  const chair = document.getElementById('promoChairmanName');
  if (chair && promo.card3_chairman) chair.textContent = promo.card3_chairman;
  const conv = document.getElementById('promoConvenorName');
  if (conv && promo.card3_convenor) conv.textContent = promo.card3_convenor;
  const c3Desc = document.getElementById('promoCard3Desc');
  if (c3Desc && promo.card3_desc) c3Desc.textContent = promo.card3_desc;

  // Card 4: Mega Rewards
  const c4Tag = document.getElementById('promoCard4Tag');
  if (c4Tag && promo.card4_tag) c4Tag.textContent = promo.card4_tag;
  const c4Title = document.getElementById('promoCard4Title');
  if (c4Title && promo.card4_title) c4Title.textContent = promo.card4_title;
  const c4Desc = document.getElementById('promoCard4Desc');
  if (c4Desc && promo.card4_desc) c4Desc.textContent = promo.card4_desc;

  if (promo.reel_speed) {
    promoReelSpeed = parseInt(promo.reel_speed) || 5500;
  }
}

// Fetch initial promo configuration on load
fetch('/api/promo')
  .then(res => res.ok ? res.json() : null)
  .then(data => {
    if (data) updatePromoContentFromSettings(data);
  })
  .catch(err => console.log('Promo settings load fallback:', err));

// ── 2. Interactive 3D Perspective Tilt on Centerpiece ──
if (promoTiltBox && promoHeroArea) {
  promoHeroArea.addEventListener('mousemove', (e) => {
    const rect = promoTiltBox.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = (e.clientX - centerX) / (rect.width / 2);
    const deltaY = (e.clientY - centerY) / (rect.height / 2);

    const rotateX = -deltaY * 12; // subtle max 12 deg
    const rotateY = deltaX * 12;

    promoTiltBox.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`;
  });

  promoHeroArea.addEventListener('mouseleave', () => {
    promoTiltBox.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
  });

  // Mobile Gyroscope support if available
  if (window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission !== 'function') {
    window.addEventListener('deviceorientation', (e) => {
      if (currentScreen !== 'promo' || !e.gamma || !e.beta) return;
      const tiltX = Math.min(Math.max(e.beta - 45, -15), 15);
      const tiltY = Math.min(Math.max(e.gamma, -15), 15);
      promoTiltBox.style.transform = `perspective(1000px) rotateX(${(-tiltX * 0.5).toFixed(1)}deg) rotateY(${(tiltY * 0.5).toFixed(1)}deg)`;
    });
  }
}

// ── 3. Next-Level Cinematic Scene Trigger Function ──
function triggerPromoScene(sceneId) {
  currentPromoScene = sceneId;

  // Update Tracker Buttons
  document.querySelectorAll('.reel-dot-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.scene === sceneId);
  });

  const cards = document.querySelectorAll('.promo-card');
  const heroArea = document.getElementById('promoHeroArea');
  const promoGrid = document.getElementById('promoCardsGrid');

  if (sceneId === 'all') {
    // Show all cards in glorious balanced view
    cards.forEach(card => {
      card.classList.remove('scene-active', 'scene-dimmed');
    });
    if (heroArea) {
      heroArea.style.transform = 'scale(1) translateY(0)';
      heroArea.style.filter = 'none';
    }
    if (promoGrid) {
      promoGrid.style.transform = 'scale(1)';
    }
    return;
  }

  // Handle Specific Scene Highlighting
  cards.forEach(card => {
    const cardScene = card.dataset.scene;
    if (cardScene === sceneId) {
      card.classList.add('scene-active');
      card.classList.remove('scene-dimmed');
    } else {
      card.classList.remove('scene-active');
      card.classList.add('scene-dimmed');
    }
  });

  // Scene 1: Focus on 3D Title Logo Reveal
  if (sceneId === '1') {
    if (heroArea) {
      heroArea.style.transform = 'scale(1.08) translateY(-6px)';
      heroArea.style.transition = 'transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)';
    }
    cards.forEach(card => card.classList.add('scene-dimmed'));
  } else {
    if (heroArea) {
      heroArea.style.transform = 'scale(1) translateY(0)';
    }
  }

  // Scene 4: Climax Prize Celebration
  if (sceneId === '4') {
    triggerConfetti(7);
    playPromoFanfare();
  }
}

// ── 4. Cinematic Auto-Reel Sequencer with Progress Bar ──
function startPromoReel() {
  if (isPromoReelRunning) return;
  isPromoReelRunning = true;
  updatePromoReelUI(true);

  function advanceReel() {
    currentSceneIndex = (currentSceneIndex + 1) % promoScenesList.length;
    const nextScene = promoScenesList[currentSceneIndex];
    triggerPromoScene(nextScene);

    // Timers: Scene 1 (4.5s), Scene 2-4 (5.5s), Overview 'all' (7s)
    const duration = nextScene === 'all' ? 7000 : (promoReelSpeed || 5500);
    animateTimelineProgress(duration);
    promoReelTimer = setTimeout(advanceReel, duration);
  }

  // Start with scene 1 immediately
  currentSceneIndex = 0;
  triggerPromoScene(promoScenesList[0]);
  const initialDuration = promoReelSpeed || 5500;
  animateTimelineProgress(initialDuration);
  promoReelTimer = setTimeout(advanceReel, initialDuration);
}

function animateTimelineProgress(durationMs) {
  if (!promoTimelineFill) return;
  if (promoProgressTimer) cancelAnimationFrame(promoProgressTimer);
  const startTime = performance.now();

  function step(now) {
    if (!isPromoReelRunning) {
      promoTimelineFill.style.width = '0%';
      return;
    }
    const elapsed = now - startTime;
    const progress = Math.min(100, (elapsed / durationMs) * 100);
    promoTimelineFill.style.width = `${progress}%`;
    if (elapsed < durationMs) {
      promoProgressTimer = requestAnimationFrame(step);
    }
  }
  promoProgressTimer = requestAnimationFrame(step);
}

function stopPromoReel() {
  isPromoReelRunning = false;
  if (promoReelTimer) {
    clearTimeout(promoReelTimer);
    promoReelTimer = null;
  }
  if (promoProgressTimer) {
    cancelAnimationFrame(promoProgressTimer);
    promoProgressTimer = null;
  }
  if (promoTimelineFill) promoTimelineFill.style.width = '0%';
  updatePromoReelUI(false);
}

function togglePromoReel() {
  if (isPromoReelRunning) {
    stopPromoReel();
  } else {
    startPromoReel();
  }
}

function updatePromoReelUI(isRunning) {
  if (promoPlayReelLabel) {
    promoPlayReelLabel.textContent = isRunning ? 'Pause Reel' : 'Play Reel';
  }
  if (promoPlayReelBtn) {
    const icon = promoPlayReelBtn.querySelector('i');
    if (icon) icon.className = isRunning ? 'fa-solid fa-pause' : 'fa-solid fa-play';
    promoPlayReelBtn.classList.toggle('active', isRunning);
  }
}

// ── 5. Web Audio API Fanfare Synthesizer ──
function playPromoFanfare() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;

    // Orchestral / Brass Fanfare Arpeggio: C4, G4, C5, E5, G5, C6
    const notes = [261.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    const times = [0, 0.12, 0.24, 0.36, 0.50, 0.70];
    const durations = [0.2, 0.2, 0.2, 0.2, 0.35, 1.6];

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + times[i]);

      // Warm brass low-pass filter
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, now + times[i]);
      filter.frequency.exponentialRampToValueAtTime(3200, now + times[i] + 0.1);
      filter.frequency.exponentialRampToValueAtTime(800, now + times[i] + durations[i]);

      gain.gain.setValueAtTime(0.001, now + times[i]);
      gain.gain.linearRampToValueAtTime(0.18, now + times[i] + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + times[i] + durations[i]);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + times[i]);
      osc.stop(now + times[i] + durations[i]);
    });
  } catch (err) {
    console.warn('AudioContext fanfare error:', err);
  }
}

// ── 6. Minimalist Dock Management & Idle Auto-Hide ──
let dockIdleTimer = null;

function resetDockIdleTimer() {
  if (promoControlsFooter) {
    promoControlsFooter.classList.remove('dock-hidden');
  }
  clearTimeout(dockIdleTimer);
  dockIdleTimer = setTimeout(() => {
    if (currentScreen === 'promo' && promoControlsFooter) {
      promoControlsFooter.classList.add('dock-hidden');
    }
  }, 4500);
}

document.addEventListener('mousemove', resetDockIdleTimer);
document.addEventListener('click', resetDockIdleTimer);

if (promoDockHideBtn) {
  promoDockHideBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (promoControlsFooter) promoControlsFooter.classList.add('dock-hidden');
  });
}

// ── 7. Promo Button Event Listeners ──
if (promoPlayReelBtn) {
  promoPlayReelBtn.addEventListener('click', togglePromoReel);
}

if (promoSoundBtn) {
  promoSoundBtn.addEventListener('click', playPromoFanfare);
}

if (promoConfettiBtn) {
  promoConfettiBtn.addEventListener('click', () => {
    triggerConfetti(8);
  });
}

if (promoStartQuizBtn) {
  promoStartQuizBtn.addEventListener('click', () => {
    socket.emit('state:update', { active_screen: 'quiz' });
  });
}

// Scene Dot Tracker Clicks
document.querySelectorAll('.reel-dot-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    stopPromoReel();
    const scene = btn.dataset.scene;
    triggerPromoScene(scene);
  });
});

// Click card to highlight that card's scene
document.querySelectorAll('.promo-card').forEach(card => {
  card.addEventListener('click', () => {
    stopPromoReel();
    const scene = card.dataset.scene;
    if (scene) triggerPromoScene(scene);
  });
});


/* ═══════════════════════════════════════════════════════
   SECOND SCREEN FEATURES & PRESENTER CONTROL DECK
   ═══════════════════════════════════════════════════════ */

// ── Stage Privacy Blackout Curtain ──
let isStageBlackedOut = false;
function toggleStageBlackout(forceState) {
  isStageBlackedOut = forceState !== undefined ? forceState : !isStageBlackedOut;
  if (stageBlackout) {
    stageBlackout.style.display = isStageBlackedOut ? 'flex' : 'none';
  }
}

// ── Broadcast Lower-Third Ticker ──
function showStageTicker(text) {
  const ticker = document.getElementById('stageTicker');
  const tickerText = document.getElementById('stageTickerText');
  if (ticker && tickerText) {
    tickerText.textContent = text;
    ticker.style.display = 'block';
  }
}

function hideStageTicker() {
  const ticker = document.getElementById('stageTicker');
  if (ticker) ticker.style.display = 'none';
}


/* ═══════════════════════════════════════════════════════
   SOCKET.IO LISTENERS FOR PROMO, CAST & SECOND SCREEN
   ═══════════════════════════════════════════════════════ */

socket.on('promo:sync', (promoData) => {
  updatePromoContentFromSettings(promoData);
});

socket.on('promo:control', (data) => {
  if (!data) return;
  if (data.action === 'play') {
    startPromoReel();
  } else if (data.action === 'pause') {
    stopPromoReel();
  } else if (data.action === 'scene') {
    stopPromoReel();
    triggerPromoScene(data.scene || 'all');
  } else if (data.action === 'restart') {
    stopPromoReel();
    startPromoReel();
  }
});

socket.on('promo:sound', () => {
  playPromoFanfare();
});

socket.on('stage:ticker', (data) => {
  if (!data) return;
  if (data.show) {
    showStageTicker(data.text);
  } else {
    hideStageTicker();
  }
});

socket.on('stage:blackout', (data) => {
  if (data) {
    toggleStageBlackout(data.blackout);
  }
});

// Remote Cast Command Execution
socket.on('cast:execute', (data) => {
  if (!data) return;
  if (data.command === 'fullscreen') {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } else if (data.command === 'reload') {
    window.location.reload();
  } else if (data.command === 'switch-screen') {
    const target = data.params?.screen || 'promo';
    socket.emit('state:update', { active_screen: target });
  } else if (data.command === 'ping') {
    triggerConfetti(5);
  }
});


/* ═══════════════════════════════════════════════════════
   STAGE PRESENTATION KEYBOARD SHORTCUTS
   ═══════════════════════════════════════════════════════ */
document.addEventListener('keydown', (e) => {
  // Avoid capturing keystrokes in input elements
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

  const key = e.key.toLowerCase();

  // Screen Switchers
  if (key === 'p') {
    socket.emit('state:update', { active_screen: 'promo' });
  } else if (key === 'w') {
    socket.emit('state:update', { active_screen: 'welcome' });
  } else if (key === 'q') {
    socket.emit('state:update', { active_screen: 'quiz' });
  }
  // Blackout
  else if (key === 'b') {
    toggleStageBlackout();
    socket.emit('stage:blackout', { blackout: isStageBlackedOut });
  }
  // Fullscreen
  else if (key === 'f') {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen();
    }
  }
  // Dock toggle
  else if (key === 'h') {
    if (promoControlsFooter) {
      promoControlsFooter.classList.toggle('dock-hidden');
    }
  }
  // Confetti
  else if (key === 'c') {
    triggerConfetti(8);
  }
  // Fanfare / Music
  else if (key === 'm') {
    playPromoFanfare();
  }
  // Space: Toggle Reel if on promo
  else if (e.code === 'Space') {
    e.preventDefault();
    if (currentScreen === 'promo') {
      togglePromoReel();
    }
  }
  // Scene Shortcuts 0, 1, 2, 3, 4
  else if (currentScreen === 'promo' && ['0', '1', '2', '3', '4'].includes(e.key)) {
    const sc = e.key === '0' ? 'all' : e.key;
    stopPromoReel();
    triggerPromoScene(sc);
  }
  // Arrow Navigation for Promo
  else if (currentScreen === 'promo') {
    if (e.key === 'ArrowRight') {
      stopPromoReel();
      currentSceneIndex = (currentSceneIndex + 1) % promoScenesList.length;
      triggerPromoScene(promoScenesList[currentSceneIndex]);
    } else if (e.key === 'ArrowLeft') {
      stopPromoReel();
      currentSceneIndex = (currentSceneIndex - 1 + promoScenesList.length) % promoScenesList.length;
      triggerPromoScene(promoScenesList[currentSceneIndex]);
    }
  }
});



