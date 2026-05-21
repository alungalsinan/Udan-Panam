let quizData = [];
let currentIndex = 0;
let isRevealed = false;

// DOM Elements
const welcomeScreen = document.getElementById('welcome-screen');
const quizScreen = document.getElementById('quiz-screen');
const startBtn = document.getElementById('start-btn');
const questionText = document.getElementById('question-text');
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

// Fetch Questions from Backend
async function fetchQuestions() {
    try {
        const res = await fetch('/api/questions');
        quizData = await res.json();
        if (quizData.length === 0) {
            console.error("No questions found in database.");
        }
    } catch (err) {
        console.error("Error fetching questions:", err);
    }
}

// Initialization
document.addEventListener('DOMContentLoaded', fetchQuestions);

// Start Game
startBtn.addEventListener('click', () => {
    welcomeScreen.classList.remove('active');
    setTimeout(() => {
        quizScreen.classList.add('active');
        loadQuestion(currentIndex);
    }, 600); // Wait for fade out
});

function loadQuestion(index) {
    // Reset state
    isRevealed = false;
    quizContainer.classList.remove('revealed');
    optionCards.forEach(card => {
        card.classList.remove('correct', 'wrong', 'clicked-correct', 'clicked-wrong');
    });
    
    // Add a slight fade effect when changing text
    questionText.style.opacity = 0;
    optionCards.forEach(card => card.style.opacity = 0);
    
    setTimeout(() => {
        // Stop and reset audio if playing
        questionAudio.pause();
        questionAudio.currentTime = 0;
        playIcon.textContent = '▶';
        visualizer.classList.remove('playing');

        if (!quizData || quizData.length === 0) {
            questionText.textContent = "No questions available.";
            return;
        }
        
        const data = quizData[index];
        questionText.textContent = data.question_text || '';
        optionAText.textContent = data.option_a;
        optionBText.textContent = data.option_b;
        optionCText.textContent = data.option_c;
        optionDText.textContent = data.option_d;
        
        // Audio Logic
        if (data.level == 3 || data.audio_url) {
            audioContainer.style.display = 'flex';
            questionAudio.src = data.audio_url || '';
            questionText.style.display = data.question_text ? 'block' : 'none'; // hide if no text
        } else {
            audioContainer.style.display = 'none';
            questionText.style.display = 'block';
        }

        // Setup correct answer data attribute for easy checking later
        optionCards.forEach(card => {
            if (card.getAttribute('data-option') === data.correct_answer) {
                card.dataset.isCorrect = "true";
            } else {
                card.dataset.isCorrect = "false";
            }
        });

        // Update nav buttons
        prevBtn.disabled = index === 0;
        nextBtn.disabled = index === quizData.length - 1;

        // Fade back in
        questionText.style.opacity = 1;
        optionCards.forEach(card => card.style.opacity = 1);
    }, 300);
}

// Reveal Answer
revealBtn.addEventListener('click', () => {
    if (isRevealed) return; // Prevent multiple clicks
    
    isRevealed = true;
    quizContainer.classList.add('revealed');
    
    optionCards.forEach(card => {
        if (card.dataset.isCorrect === "true") {
            card.classList.add('correct');
        } else {
            card.classList.add('wrong');
        }
    });
});

// Option Click Listeners
optionCards.forEach(card => {
    card.addEventListener('click', () => {
        if (isRevealed) return; // Ignore if answer is already fully revealed
        
        if (card.dataset.isCorrect === "true") {
            card.classList.add('clicked-correct');
            // If the correct option is clicked, you can also auto-reveal everything if desired
            // By calling: revealBtn.click();
        } else {
            card.classList.add('clicked-wrong');
        }
    });
});

// Audio Player Logic
playPauseBtn.addEventListener('click', () => {
    if (questionAudio.paused) {
        questionAudio.play();
        playIcon.textContent = '⏸';
        visualizer.classList.add('playing');
    } else {
        questionAudio.pause();
        playIcon.textContent = '▶';
        visualizer.classList.remove('playing');
    }
});

questionAudio.addEventListener('timeupdate', () => {
    const progressPercent = (questionAudio.currentTime / questionAudio.duration) * 100;
    progressBar.style.width = `${progressPercent}%`;
});

questionAudio.addEventListener('ended', () => {
    playIcon.textContent = '▶';
    visualizer.classList.remove('playing');
    progressBar.style.width = '0%';
});

progressContainer.addEventListener('click', (e) => {
    const width = progressContainer.clientWidth;
    const clickX = e.offsetX;
    const duration = questionAudio.duration;
    
    questionAudio.currentTime = (clickX / width) * duration;
});

// Navigation
nextBtn.addEventListener('click', () => {
    if (currentIndex < quizData.length - 1) {
        currentIndex++;
        loadQuestion(currentIndex);
    }
});

prevBtn.addEventListener('click', () => {
    if (currentIndex > 0) {
        currentIndex--;
        loadQuestion(currentIndex);
    }
});
