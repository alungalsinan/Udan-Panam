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
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const revealBtn = document.getElementById('reveal-btn');
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
        const res = await fetch('/api/presentation/state');
        const state = await res.json();
        applyPresenterState(state);
    } catch (err) {
        console.error("Error polling presenter state:", err);
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

        // 7. Update local nav buttons disabled state
        if (quizData && quizData.length > 0) {
            const currentIdx = quizData.findIndex(item => item.id === currentQuestionId);
            prevBtn.disabled = currentIdx <= 0;
            nextBtn.disabled = currentIdx >= quizData.length - 1 || currentIdx === -1;
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

async function handleLocalNavigation(direction) {
    if (!quizData || quizData.length === 0) return;
    const currentIdx = quizData.findIndex(q => q.id === currentQuestionId);
    let targetIdx = currentIdx;

    if (direction === 'next' && currentIdx < quizData.length - 1) {
        targetIdx = currentIdx + 1;
    } else if (direction === 'prev' && currentIdx > 0) {
        targetIdx = currentIdx - 1;
    }

    if (targetIdx !== currentIdx && targetIdx !== -1) {
        const targetQ = quizData[targetIdx];
        try {
            await fetch('/api/presentation/state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    current_question_id: targetQ.id,
                    show_question: true,
                    show_options: false,
                    reveal_answer: false,
                    audio_status: 'stopped'
                })
            });
        } catch (e) {
            console.error("Local navigation sync error", e);
        }
    }
}

prevBtn.addEventListener('click', () => handleLocalNavigation('prev'));
nextBtn.addEventListener('click', () => handleLocalNavigation('next'));

revealBtn.addEventListener('click', async () => {
    try {
        await fetch('/api/presentation/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reveal_answer: true })
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
