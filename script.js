let quizData = [];
let currentQuestionId = null;
let currentAudioStatus = 'stopped';
let currentScreen = 'welcome';
let isRevealed = false;

// DOM Elements
const welcomeScreen = document.getElementById('welcome-screen');
const quizScreen = document.getElementById('quiz-screen');
const startBtn = document.getElementById('start-btn');
const questionText = document.getElementById('question-text');
const questionImage = document.getElementById('question-image');
const optionAText = document.getElementById('option-a-text');
const optionBText = document.getElementById('option-b-text');
const optionCText = document.getElementById('option-c-text');
const optionDText = document.getElementById('option-d-text');
const optionCards = document.querySelectorAll('.option-card');
const quizContainer = document.querySelector('.quiz-container');

// Audio Elements
const audioContainer = document.getElementById('audio-container');
const questionAudio = document.getElementById('question-audio');
const playPauseBtn = document.getElementById('play-pause-btn');
const playIcon = document.getElementById('play-icon');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const visualizer = document.getElementById('visualizer');

// Studio Elements
const welcomeTitle = document.getElementById('welcome-title');
const welcomeSubtitle = document.getElementById('welcome-subtitle');
let lastStudioConfig = null;

// Fetch Questions from Backend (for local nav fallback indexing)
async function fetchQuestions() {
    try {
        const res = await fetch('/api/questions');
        quizData = await res.json();
    } catch (err) {
        console.error("Error fetching questions:", err);
    }
}

// State Synchronization Polling
async function pollPresenterState() {
    try {
        const [stateRes, studioRes] = await Promise.all([
            fetch('/api/presentation/state'),
            fetch('/api/studio')
        ]);
        
        const state = await stateRes.json();
        const studio = await studioRes.json();
        
        applyStudioSettings(studio);
        applyPresenterState(state);
    } catch (err) {
        console.error("Error polling state:", err);
    }
}

function applyStudioSettings(s) {
    if (!s) return;
    // Prevent redundant DOM updates if settings haven't changed
    if (JSON.stringify(s) === JSON.stringify(lastStudioConfig)) return;
    lastStudioConfig = s;
    
    const root = document.documentElement;
    root.style.setProperty('--primary-glow', s.theme_primary || '#00e5ff');
    root.style.setProperty('--secondary-glow', s.theme_secondary || '#ffd700');
    root.style.setProperty('--bg-dark', s.bg_dark || '#070B19');
    root.style.setProperty('--bg-card', s.bg_card || 'rgba(16, 24, 45, 0.8)');
    root.style.setProperty('--font-main', s.font_family || "'Anek Malayalam', sans-serif");
    
    welcomeTitle.textContent = s.welcome_title || 'Welcome';
    welcomeSubtitle.textContent = s.welcome_subtitle || '';
    
    if (s.animation_enabled === false) {
        document.body.classList.add('no-animations');
    } else {
        document.body.classList.remove('no-animations');
    }
}

// Reactively apply state received from server
function applyPresenterState(state) {
    if (!state) return;

    // 1. Sync Screen Switching
    if (state.active_screen !== currentScreen) {
        currentScreen = state.active_screen;
        if (currentScreen === 'welcome') {
            quizScreen.classList.remove('active');
            setTimeout(() => {
                welcomeScreen.classList.add('active');
            }, 400);
        } else {
            welcomeScreen.classList.remove('active');
            setTimeout(() => {
                quizScreen.classList.add('active');
            }, 400);
        }
    }

    const q = state.question;
    
    // 2. Load Question if ID changed
    if (q) {
        if (state.current_question_id !== currentQuestionId) {
            currentQuestionId = state.current_question_id;
            loadQuestionData(q);
        }

        // 3. Question Visibility (Blur/Show)
        const questionHeader = document.querySelector('.question-header');
        if (state.show_question) {
            questionHeader.classList.remove('blurred');
        } else {
            questionHeader.classList.add('blurred');
        }

        // 4. Staggered Option Reveal
        optionCards.forEach(card => {
            if (state.show_options) {
                card.classList.add('visible-card');
            } else {
                card.classList.remove('visible-card');
            }
        });

        // 5. Reveal Answer
        if (state.reveal_answer && !isRevealed) {
            revealAnswer(q.correct_answer);
        } else if (!state.reveal_answer && isRevealed) {
            // Admin reset the reveal
            isRevealed = false;
            quizContainer.classList.remove('revealed');
            optionCards.forEach(card => {
                card.classList.remove('correct', 'wrong');
            });
        }

        // 6. Remote Audio Sync
        if (state.audio_status !== currentAudioStatus) {
            currentAudioStatus = state.audio_status;
            syncRemoteAudio(currentAudioStatus);
        }
    }
}

// Populate UI with active question data
function loadQuestionData(data) {
    isRevealed = false;
    quizContainer.classList.remove('revealed');
    optionCards.forEach(card => {
        card.classList.remove('correct', 'wrong', 'clicked-correct', 'clicked-wrong', 'visible-card');
    });

    // Reset local audio UI
    questionAudio.pause();
    questionAudio.currentTime = 0;
    playIcon.textContent = '▶';
    visualizer.classList.remove('playing');
    progressBar.style.width = '0%';

    // Text fields
    questionText.textContent = data.question_text || '';
    optionAText.textContent = data.option_a;
    optionBText.textContent = data.option_b;
    optionCText.textContent = data.option_c;
    optionDText.textContent = data.option_d;

    // Image logic
    if (data.image_url) {
        questionImage.src = data.image_url;
        questionImage.style.display = 'block';
    } else {
        questionImage.style.display = 'none';
    }

    // Audio container logic
    if (data.level == 3 || data.audio_url) {
        audioContainer.style.display = 'flex';
        questionAudio.src = data.audio_url || '';
        questionText.style.display = data.question_text ? 'block' : 'none';
    } else {
        audioContainer.style.display = 'none';
        questionText.style.display = 'block';
    }

    // Setup correct answer attributes
    optionCards.forEach(card => {
        if (card.getAttribute('data-option') === data.correct_answer) {
            card.dataset.isCorrect = "true";
        } else {
            card.dataset.isCorrect = "false";
        }
    });
}

// Reveal Answer locally
function revealAnswer(correctAnswer) {
    isRevealed = true;
    quizContainer.classList.add('revealed');
    optionCards.forEach(card => {
        if (card.dataset.isCorrect === "true") {
            card.classList.add('correct');
        } else {
            card.classList.add('wrong');
        }
    });
}

// Sync audio playback remotely
function syncRemoteAudio(status) {
    if (!questionAudio.src) return;

    if (status === 'playing') {
        if (questionAudio.paused) {
            questionAudio.play().catch(err => console.log("Audio play deferred until user gesture", err));
            playIcon.textContent = '⏸';
            visualizer.classList.add('playing');
        }
    } else if (status === 'paused') {
        if (!questionAudio.paused) {
            questionAudio.pause();
            playIcon.textContent = '▶';
            visualizer.classList.remove('playing');
        }
    } else if (status === 'stopped') {
        questionAudio.pause();
        questionAudio.currentTime = 0;
        playIcon.textContent = '▶';
        visualizer.classList.remove('playing');
        progressBar.style.width = '0%';
    }
}

// Local Button event handlers that update the server state (bi-directional sync)
startBtn.addEventListener('click', async () => {
    welcomeScreen.classList.remove('active');
    setTimeout(() => {
        quizScreen.classList.add('active');
    }, 600);
    
    try {
        await fetch('/api/presentation/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active_screen: 'quiz' })
        });
    } catch (e) {}
});

// Local Option Clicks (Contestants selection effect)
optionCards.forEach(card => {
    card.addEventListener('click', () => {
        if (isRevealed) return;
        if (card.dataset.isCorrect === "true") {
            card.classList.add('clicked-correct');
        } else {
            card.classList.add('clicked-wrong');
        }
    });
});

// Local Audio Player Logic updates the Server so that Admin stays in sync!
playPauseBtn.addEventListener('click', async () => {
    if (!questionAudio.src) return;
    const nextStatus = questionAudio.paused ? 'playing' : 'paused';
    
    try {
        await fetch('/api/presentation/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_status: nextStatus })
        });
    } catch (e) {}
});

questionAudio.addEventListener('timeupdate', () => {
    const progressPercent = (questionAudio.currentTime / questionAudio.duration) * 100;
    progressBar.style.width = `${progressPercent}%`;
});

questionAudio.addEventListener('ended', async () => {
    try {
        await fetch('/api/presentation/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_status: 'stopped' })
        });
    } catch (e) {}
});

progressContainer.addEventListener('click', (e) => {
    const width = progressContainer.clientWidth;
    const clickX = e.offsetX;
    const duration = questionAudio.duration;
    if (duration) {
        questionAudio.currentTime = (clickX / width) * duration;
    }
});

// Initializations
document.addEventListener('DOMContentLoaded', () => {
    fetchQuestions().then(() => {
        pollPresenterState();
        setInterval(pollPresenterState, 1000);
    });
});
